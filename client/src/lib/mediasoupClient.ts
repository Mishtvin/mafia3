import { Device } from 'mediasoup-client';
import { 
  MessageType,
  SignalingMessage,
  JoinMessage,
  LeaveMessage,
  NewProducerMessage,
  RequestConsumeMessage,
  ProducerClosedMessage,
  ConnectTransportMessage,
  ProduceMessage,
  NicknameChangeMessage,
  ParticipantKilledMessage,
  ServerInitResponse,
  ProduceResponse,
  ConsumeResponse
} from '@shared/types';

interface MediasoupClientConfig {
  onConnect: () => void;
  onDisconnect: () => void;
  onRemoteStream: (participantId: string, stream: MediaStream) => void;
  onRemoteStreamClosed: (participantId: string) => void;
  onError: (error: string) => void;
  onNicknameChange?: (participantId: string, nickname: string) => void;
  onParticipantKilled?: (participantId: string, isKilled: boolean) => void;
}

// mediasoup and WebSocket state
let device: Device | null = null;
let socket: WebSocket | null = null;
let producerTransport: any = null;
let videoProducer: any = null;
let consumerTransports: Map<string, any> = new Map();
let consumers: Map<string, any> = new Map();
let config: MediasoupClientConfig | null = null;
let localStream: MediaStream | null = null;
let roomId: string = 'default-room';

// Переменные для автоматического переподключения и контроля состояния
let isConnecting = false;
let reconnectTimeout: number | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 3000; // 3 секунды
const PING_INTERVAL = 25000; // 25 секунд (меньше, чем интервал сервера)
let pingInterval: number | null = null;

// Храним предыдущее имя для отслеживания изменений
let currentNickname = "Участник";
let isKilled = false;

export function init(clientConfig: MediasoupClientConfig): void {
  config = clientConfig;
}

export async function connect(stream: MediaStream): Promise<void> {
  if (!config) {
    throw new Error('Mediasoup client not initialized');
  }

  localStream = stream;

  try {
    // Create WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    // Close any existing connection
    await disconnect();
    
    socket = new WebSocket(wsUrl);

    socket.onopen = async () => {
      console.log('WebSocket connection established');
      
      // Сбросить счетчики переподключения
      isConnecting = false;
      reconnectAttempts = 0;
      
      // Настроить регулярную отправку пингов для поддержания соединения
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      
      pingInterval = window.setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          // Отправка собственного пинга (не через API WebSocket)
          console.log('Sending ping to keep connection alive');
          try {
            socket.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {
            console.warn('Failed to send ping:', e);
          }
        }
      }, PING_INTERVAL);
      
      // Create mediasoup device
      device = new Device();
      
      try {
        // Send join message to server
        const joinMessage: JoinMessage = {
          type: MessageType.JOIN,
          roomId
        };
        sendMessage(joinMessage);
      } catch (error: any) {
        config?.onError(`Failed to join room: ${error.message}`);
      }
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message from server:', message.type, message);
        
        // Извлекаем данные в зависимости от формата сообщения
        // Сервер может отправлять данные напрямую или в свойстве data
        const msgData = message.data !== undefined ? message.data : message;
        
        switch (message.type) {
          case 'welcome':
            console.log('Received welcome message with router capabilities');
            await handleWelcomeMessage(msgData);
            break;
          case 'new-producer':
            console.log('Received new producer notification:', msgData);
            await handleNewProducer(msgData);
            break;
          case 'consume-response':
            console.log('Received consume response:', msgData.id);
            await handleConsumeResponse(msgData);
            break;
          case 'produce-response':
            console.log('Received produce response for ID:', msgData.id);
            await handleProduceResponse(msgData);
            break;
          case 'producer-closed':
            console.log('Producer closed:', msgData);
            await handleProducerClosed(msgData);
            break;
          case 'disconnect':
            // Handle someone disconnecting
            console.log('Participant disconnected:', msgData.participantId || message.participantId);
            const participantId = msgData.participantId || message.participantId;
            if (participantId) {
              config?.onRemoteStreamClosed(participantId);
            }
            break;
          case 'nickname-change':
            // Обработка изменения имени участника
            console.log('Nickname changed event received');
            console.log('Raw message data:', message);
            console.log('Parsed data:', msgData);
            console.log('Full message data object for nickname:', JSON.stringify(msgData, null, 2));
            
            // Проверяем структуру данных и делаем ее более устойчивой
            const remoteParticipantId = msgData.participantId || '';
            const nickname = msgData.nickname || '';
            
            console.log(`Nickname change details: participantId=${remoteParticipantId}, nickname=${nickname}`);
            
            if (msgData.isLocalChange) {
              console.log('This is our own nickname change, skipping external notification');
            } else if (remoteParticipantId && nickname) {
              console.log(`Preparing to notify app about nickname change for ${remoteParticipantId} to ${nickname}`);
              // Уведомляем приложение об изменении имени другого участника
              if (config?.onNicknameChange) {
                console.log('onNicknameChange handler is available, calling it now');
                config.onNicknameChange(remoteParticipantId, nickname);
              } else {
                console.error('Missing onNicknameChange handler in mediasoup client config');
              }
            } else {
              console.error('Invalid nickname change data format:', msgData);
            }
            break;
          case 'participant-killed':
            // Обработка статуса "убит" участника
            console.log('Participant killed status changed event received');
            console.log('Raw message data:', message);
            console.log('Parsed data:', msgData);
            console.log('Full message data object for killed status:', JSON.stringify(msgData, null, 2));
            
            // Проверяем структуру данных и делаем ее более устойчивой
            const killedParticipantId = msgData.participantId || '';
            const killedStatus = !!msgData.killed;
            
            console.log(`Killed status details: participantId=${killedParticipantId}, killed=${killedStatus}`);
            
            if (killedParticipantId && config?.onParticipantKilled) {
              console.log(`Notifying app about participant ${killedParticipantId} killed status: ${killedStatus}`);
              config.onParticipantKilled(killedParticipantId, killedStatus);
            } else {
              console.error('Invalid killed status format or missing handler:', msgData);
            }
            break;
          case 'error':
            console.error('Error from server:', message.error || msgData);
            config?.onError(message.error || msgData || 'Unknown error from server');
            break;
          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
        
        // Try to parse message even if JSON parsing failed
        try {
          const rawData = event.data;
          console.log('Raw message received:', typeof rawData === 'string' ? rawData.substring(0, 100) + '...' : rawData);
        } catch (e) {
          console.error('Could not log raw message:', e);
        }
      }
    };

    socket.onclose = () => {
      console.log('WebSocket connection closed');
      
      // Очистка интервала пингов
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      // Уведомить приложение о разрыве соединения
      config?.onDisconnect();
      
      // Автоматически переподключиться, если соединение было потеряно
      if (!isConnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS && localStream) {
        console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}...`);
        
        isConnecting = true;
        
        // Задержка перед повторным подключением
        reconnectTimeout = window.setTimeout(async () => {
          reconnectAttempts++;
          
          console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          
          try {
            // Переподключение с тем же потоком, но проверяем его наличие
            if (localStream) {
              await connect(localStream);
              console.log('Reconnection successful!');
            } else {
              console.error('Cannot reconnect: no local stream available');
              isConnecting = false;
            }
          } catch (err) {
            console.error('Reconnection failed:', err);
            isConnecting = false;
            
            // Если это была последняя попытка, уведомить пользователя
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
              config?.onError('Failed to reconnect after multiple attempts. Please refresh the page.');
            }
          }
        }, RECONNECT_INTERVAL);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      config?.onError(`WebSocket error: ${error}`);
    };
  } catch (error: any) {
    config?.onError(`Connection error: ${error.message}`);
    throw error;
  }
}

export async function disconnect(): Promise<void> {
  // Сбросить состояние соединения и таймеры
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  
  isConnecting = false;
  
  // Close producers
  if (videoProducer) {
    videoProducer.close();
    videoProducer = null;
  }

  // Close consumer transports and consumers
  consumers.forEach(consumer => consumer.close());
  consumers.clear();
  
  consumerTransports.forEach(transport => transport.close());
  consumerTransports.clear();

  // Close producer transport
  if (producerTransport) {
    producerTransport.close();
    producerTransport = null;
  }

  // Close WebSocket
  if (socket && socket.readyState === WebSocket.OPEN) {
    // Отправляем сообщение о выходе из комнаты
    try {
      const leaveMessage: LeaveMessage = {
        type: MessageType.LEAVE
      };
      console.log('Sending leave message before disconnect');
      sendMessage(leaveMessage);
    } catch (err) {
      console.warn('Failed to send leave message:', err);
    }
    
    // Закрываем соединение
    try {
      socket.close(1000, 'Disconnect requested by client');
    } catch (err) {
      console.warn('Error closing WebSocket:', err);
    }
  }
  
  socket = null;
  device = null;
  
  console.log('Disconnected from server');
}

export function close(): void {
  disconnect();
  config = null;
}

// Функція для позначення користувача вбитим
export function toggleKilled(killed: boolean): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected, cannot send killed status');
    return;
  }
  
  isKilled = killed;
  
  // В нашей реализации мы НЕ отключаем локальный трек
  // Так как необходимо чтобы пользователь видел сам себя даже когда отмечен как убитый
  // Вместо этого мы только отправляем сообщение на сервер
  // Сервер продолжит отправлять поток, но другие клиенты покажут overlay "Вбито" на видео
  
  // Для отладки всё же логируем факт изменения статуса
  if (localStream) {
    // Получаем видеотреки
    const videoTracks = localStream.getVideoTracks();
    console.log(`Video track status remains enabled for user. Status change sent to server: ${killed ? 'killed' : 'alive'}`);
  }
  
  // Створюємо повідомлення про вбивство для відправки
  const killedMessage: ParticipantKilledMessage = {
    type: MessageType.PARTICIPANT_KILLED,
    killed: killed
  };
  
  // Відправляємо повідомлення серверу
  sendMessage(killedMessage);
  
  console.log(`User ${killed ? 'killed' : 'revived'} status sent to server`);
}

// Функция для отправки сообщения об изменении имени
export function changeNickname(nickname: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected, cannot send nickname change');
    return;
  }
  
  // Сохраняем предыдущее имя
  const previousName = currentNickname;
  currentNickname = nickname;
  
  // Создаем сообщение для отправки серверу
  const nicknameChangeMessage: NicknameChangeMessage = {
    type: MessageType.NICKNAME_CHANGE,
    nickname: nickname,
    previousName: previousName
  };
  
  console.log(`Sending nickname change message: ${JSON.stringify(nicknameChangeMessage)}`);
  
  // Отправляем сообщение серверу
  sendMessage(nicknameChangeMessage);
}

// Helper to send WebSocket messages
function sendMessage(message: SignalingMessage): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      // Просто отправляем сообщение напрямую, как и раньше
      // Не изменяем формат, так как сервер ожидает сообщения в определенном формате
      const jsonMsg = JSON.stringify(message);
      socket.send(jsonMsg);
      
      console.log(`Sent message to server: ${message.type}`);
    } catch (err) {
      console.error('Error serializing or sending message:', err);
      config?.onError(`Failed to send message: ${err}`);
    }
  } else {
    console.error('WebSocket not connected, cannot send message');
    
    // Setup retry if possible - useful for situations where connection
    // might have temporarily disconnected
    if (message.type === MessageType.JOIN || message.type === MessageType.REQUEST_CONSUME) {
      console.log(`Queueing important message of type ${message.type} to retry`);
      
      // Create a retry attempt
      setTimeout(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          console.log(`Retrying ${message.type} message`);
          sendMessage(message);
        } else {
          console.warn(`Still disconnected, unable to send ${message.type} message`);
        }
      }, 2000);
    }
  }
}

// Handle the initial welcome message from the server
async function handleWelcomeMessage(data: ServerInitResponse): Promise<void> {
  try {
    // Load device with router RTP capabilities
    await device!.load({ routerRtpCapabilities: data.routerRtpCapabilities });
    
    // Now send join message with our RTP capabilities
    const joinMessage: JoinMessage = {
      type: MessageType.JOIN,
      roomId,
      rtpCapabilities: device!.rtpCapabilities
    };
    console.log('Sending join message with RTP capabilities');
    sendMessage(joinMessage);
    
    // Create send transport
    producerTransport = device!.createSendTransport(data.webRtcTransportOptions);
    
    // Set up transport event handlers
    producerTransport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
      try {
        // Signal transport connection to server
        const connectMessage: ConnectTransportMessage = {
          type: MessageType.CONNECT_TRANSPORT,
          transportId: producerTransport.id,
          dtlsParameters
        };
        sendMessage(connectMessage);
        callback();
      } catch (error) {
        errback(error);
      }
    });
    
    producerTransport.on('produce', async ({ kind, rtpParameters }: any, callback: any, errback: any) => {
      try {
        // Signal to create a producer on the server
        const produceMessage: ProduceMessage = {
          type: MessageType.PRODUCE,
          transportId: producerTransport.id,
          kind,
          rtpParameters
        };
        sendMessage(produceMessage);
        
        // Temporarily store callback to be called when we get the produce-response
        producerTransport._pendingCallback = callback;
      } catch (error) {
        errback(error);
      }
    });
    
    // Create video producer with local stream
    if (localStream) {
      try {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          console.log('Creating video producer with track:', videoTrack.label, 
                      'enabled:', videoTrack.enabled, 
                      'readyState:', videoTrack.readyState);
          
          // Убедимся, что трек включен
          videoTrack.enabled = true;
          
          // Добавляем более детальные настройки для продюсера
          videoProducer = await producerTransport.produce({ 
            track: videoTrack,
            encodings: [
              { maxBitrate: 100000, scaleResolutionDownBy: 4 },
              { maxBitrate: 300000, scaleResolutionDownBy: 2 },
              { maxBitrate: 900000 }
            ],
            codecOptions: {
              videoGoogleStartBitrate: 1000
            }
          });
          
          console.log('Video producer created successfully with ID:', videoProducer.id);
          
          // Отслеживаем закрытие трека
          videoTrack.addEventListener('ended', () => {
            console.log('Local video track ended, recreating it...');
            if (videoProducer && !videoProducer.closed) {
              connect(localStream);
            }
          });
        } else {
          console.warn('No video tracks found in local stream');
        }
      } catch (error) {
        console.error('Failed to create video producer:', error);
        config?.onError(`Failed to create video producer: ${error.message}`);
      }
    } else {
      console.warn('No local stream available for creating producer');
    }
    
    // Mark as connected
    config?.onConnect();
  } catch (error: any) {
    config?.onError(`Error setting up mediasoup: ${error.message}`);
  }
}

// Handle new producer notification
async function handleNewProducer(data: { producerId: string, participantId: string }): Promise<void> {
  console.log(`New producer notification received. Producer ID: ${data.producerId}, Participant ID: ${data.participantId}`);
  
  if (!device || !device.loaded) {
    console.error('Device not loaded yet, cannot consume');
    return;
  }
  
  try {
    // Check if the device can receive media
    if (!device.rtpCapabilities || !device.rtpCapabilities.codecs || device.rtpCapabilities.codecs.length === 0) {
      console.warn('Device cannot receive media streams');
      return;
    }
  } catch (error) {
    console.error('Error checking device capabilities:', error);
    return;
  }
  
  try {
    // Check if we're already consuming this producer
    if (consumers.has(data.producerId)) {
      console.log(`Already consuming producer ${data.producerId}, skipping duplicate request`);
      return;
    }
    
    // Request to consume this producer
    const requestConsumeMessage: RequestConsumeMessage = {
      type: MessageType.REQUEST_CONSUME,
      producerId: data.producerId,
      rtpCapabilities: device.rtpCapabilities,
      participantId: data.participantId
    };
    
    console.log(`Requesting to consume producer ${data.producerId} from participant ${data.participantId}`);
    sendMessage(requestConsumeMessage);
    
    // Set up a timeout to retry if we don't get a response
    setTimeout(() => {
      if (!consumers.has(data.producerId)) {
        console.warn(`No response received for consumer request after 5s, retrying...`);
        sendMessage(requestConsumeMessage);
      }
    }, 5000);
  } catch (error: any) {
    console.error(`Error requesting consumer: ${error.message}`, error);
    config?.onError(`Error requesting consumer: ${error.message}`);
  }
}

// Handle consume response
async function handleConsumeResponse(data: ConsumeResponse & { transportOptions: any, participantId: string }): Promise<void> {
  console.log(`Processing consume response for producer ${data.producerId} from participant ${data.participantId}`);
  
  try {
    // Create a receive transport if it doesn't exist for this producer
    let recvTransport = consumerTransports.get(data.producerId);
    if (!recvTransport) {
      console.log(`Creating new receive transport for producer ${data.producerId}`);
      recvTransport = device!.createRecvTransport(data.transportOptions);
      
      recvTransport.on('connect', ({ dtlsParameters }: any, callback: any, errback: any) => {
        try {
          console.log(`Connecting receive transport ${recvTransport.id} for producer ${data.producerId}`);
          // Signal transport connection to server
          const connectMessage: ConnectTransportMessage = {
            type: MessageType.CONNECT_TRANSPORT,
            transportId: recvTransport.id,
            dtlsParameters
          };
          sendMessage(connectMessage);
          callback();
        } catch (error) {
          console.error(`Error connecting receive transport: ${error}`);
          errback(error);
        }
      });
      
      consumerTransports.set(data.producerId, recvTransport);
    }
    
    // Consume the track
    console.log(`Consuming track with ID ${data.id}, producer ${data.producerId}, kind ${data.kind}`);
    const consumer = await recvTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters
    });
    
    console.log(`Consumer created with ID ${consumer.id} for producer ${data.producerId}`);
    consumers.set(data.producerId, consumer);
    
    // Ensure the track is enabled
    if (!consumer.track.enabled) {
      console.log(`Enabling disabled track from ${data.participantId}`);
      consumer.track.enabled = true;
    }
    
    // Debug the track
    console.log(`Consumer track details - enabled: ${consumer.track.enabled}, readyState: ${consumer.track.readyState}, kind: ${consumer.track.kind}`);
    
    // Apply needed transformations to the track (e.g., for Safari)
    try {
      if (consumer.track.getSettings) {
        const settings = consumer.track.getSettings();
        console.log(`Track settings for ${data.participantId}:`, settings);
        
        // Проверка наличия ограничений безопасности и применение более агрессивных обходных путей
        if (!settings.width && !settings.height && !settings.frameRate) {
          console.warn(`Content isolation detected for track from ${data.participantId}`);
          
          // Force track compatibility - максимально возможное включение трека
          consumer.track.enabled = true;
          
          // Попытка обойти ограничения через contentHint и constraintsObject
          // Это сообщает браузеру, что трек важен для пользовательского опыта
          try {
            // Установка всех возможных content hints для максимальной совместимости
            consumer.track.contentHint = 'motion';
            
            // Использование нестандартных свойств для максимальной совместимости
            const constraints = {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 },
              aspectRatio: { ideal: 1.3333333333 }
            };
            
            // Попытка применить принудительное ограничение для трека
            // Это часто помогает "разбудить" трек в некоторых браузерах
            if (consumer.track.applyConstraints) {
              consumer.track.applyConstraints(constraints)
                .catch(e => console.warn('Could not apply constraints:', e));
            }
            
            // Пробуем изменить ID трека для альтернативной обработки
            if ('id' in consumer.track) {
              try {
                // @ts-ignore - нестандартный подход, но иногда помогает
                consumer.track.id = `forced-${data.participantId}-${Date.now()}`;
              } catch (e) {}
            }
            
            // Применяем другие нестандартные настройки
            try {
              // @ts-ignore - обходной путь для некоторых браузеров
              consumer.track._constraints = constraints;
            } catch (e) {}
          } catch (e) {
            console.warn('Enhanced content hints and constraints not supported:', e);
          }
          
          // 1. Устанавливаем специальные метаданные для трека
          try {
            consumer.track.contentHint = 'detail'; // Альтернативный вариант для некоторых браузеров
          } catch (e) {}
          
          // Логируем информацию о попытке обойти ограничения
          console.log(`Applied aggressive security bypass techniques for ${data.participantId}. Video may still appear directly in <video> elements despite restrictions.`);
        }
      }
    } catch (err) {
      console.warn(`Could not get track settings for ${data.participantId}:`, err);
    }
    
    // Create a MediaStream with the consumer's track
    const stream = new MediaStream([consumer.track]);
    console.log(`Created MediaStream from consumer track, kind: ${consumer.track.kind}, active: ${stream.active}`);
    
    // Debug stream tracks
    stream.getTracks().forEach((track, index) => {
      console.log(`Stream track ${index}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}`);
      
      // Add event listeners for track events
      track.onended = () => console.log(`Track ${index} from ${data.participantId} ended`);
      track.onmute = () => console.log(`Track ${index} from ${data.participantId} muted`);
      track.onunmute = () => console.log(`Track ${index} from ${data.participantId} unmuted`);
    });
    
    // Notify application about new remote stream
    console.log(`Notifying application about new remote stream from participant ${data.participantId}`);
    config?.onRemoteStream(data.participantId, stream);
    
    // Resume the consumer to start receiving media
    await consumer.resume();
    console.log(`Consumer for ${data.participantId} resumed`);
    
  } catch (error: any) {
    console.error(`Error consuming stream: ${error.message}`, error);
    config?.onError(`Error consuming stream: ${error.message}`);
  }
}

// Handle producer closed message
function handleProducerClosed(data: { producerId: string, participantId: string }): void {
  console.log(`Producer closed: ${data.producerId} from participant ${data.participantId}`);
  
  const consumer = consumers.get(data.producerId);
  if (consumer) {
    console.log(`Closing consumer for producer ${data.producerId}`);
    consumer.close();
    consumers.delete(data.producerId);
    console.log(`Consumer deleted, remaining consumers: ${consumers.size}`);
  } else {
    console.log(`No consumer found for producer ${data.producerId}`);
  }
  
  const transport = consumerTransports.get(data.producerId);
  if (transport) {
    console.log(`Closing transport for producer ${data.producerId}`);
    transport.close();
    consumerTransports.delete(data.producerId);
    console.log(`Transport deleted, remaining transports: ${consumerTransports.size}`);
  } else {
    console.log(`No transport found for producer ${data.producerId}`);
  }
  
  // Notify application
  console.log(`Notifying application about closed stream from participant ${data.participantId}`);
  config?.onRemoteStreamClosed(data.participantId);
}

// Handle produce response
function handleProduceResponse(data: ProduceResponse): void {
  if (producerTransport && producerTransport._pendingCallback) {
    producerTransport._pendingCallback({ id: data.id });
    producerTransport._pendingCallback = null;
  }
}
