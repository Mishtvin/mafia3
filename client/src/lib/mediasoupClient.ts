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
let participantRecvTransports: Map<string, any> = new Map(); // Транспорт по participant ID
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
    try {
      videoProducer.close();
    } catch (e) {
      console.warn('Error closing producer:', e);
    }
    videoProducer = null;
  }

  // Close consumer transports and consumers
  const consumersArray = Array.from(consumers.values());
  for (const consumer of consumersArray) {
    try {
      consumer.close();
    } catch (e) {
      console.warn('Error closing consumer:', e);
    }
  }
  consumers.clear();
  
  // Close receive transports
  const transportsArray = Array.from(participantRecvTransports.values());
  for (const transport of transportsArray) {
    try {
      transport.close();
    } catch (e) {
      console.warn('Error closing transport:', e);
    }
  }
  participantRecvTransports.clear();

  // Close producer transport
  if (producerTransport) {
    try {
      producerTransport.close();
    } catch (e) {
      console.warn('Error closing producer transport:', e);
    }
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
  
  // Notify app that we're disconnected
  config?.onDisconnect();
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
          
          // Добавляем более подробное логирование состояния трека
          console.log("🚀 Local track info before produce:", {
            label: videoTrack.label,
            enabled: videoTrack.enabled,
            muted: videoTrack.muted,
            readyState: videoTrack.readyState,
            id: videoTrack.id,
            settings: videoTrack.getSettings ? videoTrack.getSettings() : 'Not supported'
          });
          
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
  console.log(`Detected new producer: ${data.producerId} from participant ${data.participantId}`);
  
  try {
    // Skip if we don't have a device or if the device is not loaded
    if (!device || !device.loaded) {
      console.warn('Device not loaded yet, skipping consume request');
      return;
    }
    
    // Skip if we already have a consumer for this producer
    if (consumers.has(data.producerId)) {
      console.log(`Already consuming producer ${data.producerId}, skipping`);
      return;
    }
    
    console.log(`Sending request to consume producer ${data.producerId}`);
    
    // Request to consume this new producer
    const consumeMessage: RequestConsumeMessage = {
      type: MessageType.REQUEST_CONSUME,
      producerId: data.producerId,
      participantId: data.participantId,
      rtpCapabilities: device.rtpCapabilities
    };
    
    sendMessage(consumeMessage);
    
    // Set a timeout to retry if we don't get a response
    setTimeout(() => {
      if (!consumers.has(data.producerId)) {
        console.log(`No response received for consume request for producer ${data.producerId}, trying again`);
        sendMessage(consumeMessage);
      }
    }, 5000);
    
  } catch (error: any) {
    console.error(`Error handling new producer: ${error.message}`);
    config?.onError(`Error handling new producer: ${error.message}`);
  }
}

// Handle consume response
async function handleConsumeResponse(data: ConsumeResponse & { transportOptions: any, participantId: string }): Promise<void> {
  console.log(`Processing consume response for producer ${data.producerId} from participant ${data.participantId}`);

  try {
    let recvTransport = participantRecvTransports.get(data.participantId);

    if (!recvTransport) {
      console.log(`Creating new receive transport for participant ${data.participantId}`);
      recvTransport = device!.createRecvTransport(data.transportOptions);

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        try {
          const connectMessage: ConnectTransportMessage = {
            type: MessageType.CONNECT_TRANSPORT,
            transportId: recvTransport.id,
            dtlsParameters
          };
          sendMessage(connectMessage);
          callback();
        } catch (error) {
          errback(error);
        }
      });

      participantRecvTransports.set(data.participantId, recvTransport);
    }

    // --- 🔥 Consume and immediately resume
    const consumer = await recvTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters
    });

    await consumer.resume();
    console.log(`✅ Consumer for ${data.participantId} resumed`);

    consumers.set(data.producerId, consumer);

    // --- 🎥 Setup MediaStream and track handlers
    const stream = new MediaStream([consumer.track]);
    consumer.track.enabled = true;

    // Aggressive track unmuting
    if (consumer.track.muted) {
      console.warn(`🔄 Track is muted for ${data.participantId}, forcing unmute techniques`);
      
      // 1. Force enabled
      consumer.track.enabled = true;
      
      // 2. Try to request a keyframe if supported
      try {
        if ('requestKeyFrame' in consumer.track) {
          console.log(`📑 Requesting keyframe for ${data.participantId}`);
          (consumer.track as any).requestKeyFrame();
        } else if ('getConstraints' in consumer.track) {
          // Alternative approach for some browsers
          console.log(`📋 Checking RTCRtpSender for keyframe API`);
          // Look for associated sender to request keyframe
          const pc = recvTransport.handler.pc as RTCPeerConnection;
          const sender = pc.getSenders().find(s => s.track?.id === consumer.track.id);
          if (sender && 'getParameters' in sender) {
            console.log(`📊 Found sender, parameters:`, sender.getParameters());
          }
        }
      } catch (e) {
        console.warn(`❌ Error requesting keyframe:`, e);
      }
    }

    // 🔁 Debug and handle track states
    consumer.track.onmute = () => {
      console.log(`🔇 Track from ${data.participantId} muted`);
      consumer.track.enabled = true;
    };
    consumer.track.onunmute = () => {
      console.log(`🔊 Track from ${data.participantId} unmuted`);
    };
    consumer.track.onended = () => {
      console.log(`⛔️ Track from ${data.participantId} ended`);
    };

    console.log(`Track state: enabled=${consumer.track.enabled}, readyState=${consumer.track.readyState}, muted=${consumer.track.muted}`);

    // Форсированное переключение enabled для "пробуждения" трека через 1.5 секунды
    setTimeout(() => {
      if (consumer.track.muted) {
        console.warn(`🔁 Track still muted, forcing re-enable for ${data.participantId}`);
        consumer.track.enabled = false;
        setTimeout(() => {
          consumer.track.enabled = true;
          console.log(`🔄 Re-enabled track for ${data.participantId}, state: muted=${consumer.track.muted}`);
        }, 50);
      }
    }, 1500);

    // --- 🩹 Safari / autoplay workaround via hidden video
    const helperVideo = document.createElement('video');
    helperVideo.srcObject = stream;
    helperVideo.autoplay = true;
    helperVideo.muted = true;
    helperVideo.playsInline = true;
    helperVideo.style.width = '1px';
    helperVideo.style.height = '1px';
    helperVideo.style.opacity = '0';
    helperVideo.style.position = 'absolute';
    helperVideo.style.pointerEvents = 'none';

    document.body.appendChild(helperVideo);
    helperVideo.play()
      .then(() => {
        console.log(`✅ Helper video playing for ${data.participantId}`);
        setTimeout(() => helperVideo.remove(), 1500);
      })
      .catch(err => {
        console.warn(`⚠️ Helper video failed:`, err);
        helperVideo.remove();
      });

    // Create additional direct track helper if track is muted
    if (consumer.track.muted) {
      console.log(`🧪 Creating dedicated track helper for muted track from ${data.participantId}`);
      const trackHelper = document.createElement('video');
      trackHelper.autoplay = true;
      trackHelper.playsInline = true;
      trackHelper.muted = true;
      
      // Create new stream with just this track
      const dedicatedStream = new MediaStream([consumer.track]);
      trackHelper.srcObject = dedicatedStream;
      
      // Style to be invisible but active
      Object.assign(trackHelper.style, {
        position: 'absolute',
        width: '2px',
        height: '2px',
        opacity: '0.01',
        zIndex: '-1000',
        pointerEvents: 'none'
      });
      
      // Add to DOM to force processing
      document.body.appendChild(trackHelper);
      trackHelper.play()
        .then(() => {
          console.log(`🔥 Dedicated track helper playing for ${data.participantId}`);
          
          // Check if it helped after a delay
          setTimeout(() => {
            console.log(`📊 Track status after dedicated helper: muted=${consumer.track.muted}, enabled=${consumer.track.enabled}`);
            
            // Remove after a longer period
            setTimeout(() => trackHelper.remove(), 3000);
          }, 500);
        })
        .catch(err => {
          console.warn(`❌ Dedicated track helper failed:`, err);
          trackHelper.remove();
        });
    }

    // --- ✅ Send stream to app
    console.log(`📦 Notifying application about remote stream from ${data.participantId}`);
    config?.onRemoteStream(data.participantId, stream);

  } catch (error: any) {
    console.error(`❌ Error consuming stream: ${error.message}`, error);
    config?.onError(`Error consuming stream: ${error.message}`);
  }
}


// Handle producer closed message
function handleProducerClosed(data: { producerId: string, participantId: string }): void {
  console.log(`Producer ${data.producerId} from participant ${data.participantId} closed`);
  
  try {
    // Get and close the consumer
    const consumer = consumers.get(data.producerId);
    if (consumer) {
      console.log(`Closing consumer for producer ${data.producerId}`);
      consumer.close();
      consumers.delete(data.producerId);
    }
    
    // Notify app that the remote stream is gone
    config?.onRemoteStreamClosed(data.participantId);
    
    // Примечание: транспорт НЕ закрываем, т.к. он может обслуживать
    // другие потоки от того же участника
    
  } catch (error: any) {
    console.error(`Error handling producer closed: ${error.message}`);
  }
}

// Handle produce response
function handleProduceResponse(data: ProduceResponse): void {
  console.log(`Received produce response for ID: ${data.id}`);
  
  if (producerTransport && producerTransport._pendingCallback) {
    producerTransport._pendingCallback({ id: data.id });
    producerTransport._pendingCallback = null;
  }
}
