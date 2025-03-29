import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  MessageType,
  JoinMessage,
  LeaveMessage,
  ConnectTransportMessage,
  ProduceMessage,
  RequestConsumeMessage
} from "@shared/types";

// Расширение типа WebSocket для поддержки heartbeat
declare module "ws" {
  interface WebSocket {
    isAlive: boolean;
    lastActivity: number;
  }
}
import * as mediasoup from "./mediasoup";

interface Room {
  participants: Map<string, {
    socket: WebSocket;
    producerId?: string;
    rtpCapabilities?: any; // Store client's RTP capabilities for consumer creation
    isKilled?: boolean; // Track if participant is marked as killed
  }>;
}

// Store active rooms
const rooms: Map<string, Room> = new Map();
const defaultRoom = 'default-room';

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Initialize mediasoup
  await mediasoup.init();

  // Create a WebSocket server for mediasoup signaling with enhanced options
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    // Расширенные настройки WebSocket для работы через разные источники
    perMessageDeflate: true, // Включаем сжатие сообщений для большей эффективности
    clientTracking: true,    // Отслеживаем клиенты для лучшего управления соединениями
    // Обработчик для проверки и разрешения соединения с любого источника
    verifyClient: (info, callback) => {
      // Разрешаем все соединения, независимо от источника
      callback(true); 
    }
  });
  
  // Настройка пинг/понг для поддержания активности соединений
  const PING_INTERVAL = 30000; // 30 секунд
  const CONNECTION_TIMEOUT = 60000; // 60 секунд бездействия до отключения
  
  // Регулярно отправлять пинги для поддержания активных соединений
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((socket) => {
      // Для каждого клиента устанавливаем флаг для проверки отзывчивости
      if (socket.isAlive === false) {
        console.log(`Terminating unresponsive WebSocket connection`);
        return socket.terminate();
      }
      
      // Отмечаем как неактивный до получения понга
      socket.isAlive = false;
      // Отправляем пинг
      socket.ping();
    });
  }, PING_INTERVAL);
  
  // Очистка интервала при закрытии сервера
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Ensure default room exists
  if (!rooms.has(defaultRoom)) {
    rooms.set(defaultRoom, {
      participants: new Map()
    });
  }

  wss.on('connection', async (socket, request) => {
    // Инициализация состояния соединения для нового клиента
    socket.isAlive = true;
    socket.lastActivity = Date.now();
    
    // Обработчик понг-ответов от клиента
    socket.on('pong', () => {
      socket.isAlive = true;
      socket.lastActivity = Date.now();
    });
    
    // Generate a unique ID for this participant
    const participantId = generateParticipantId();
    let currentRoom: Room | null = null;
    let currentRoomId: string | null = null;

    console.log(`New participant connected: ${participantId}`);

    // Handle messages from client
    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case MessageType.JOIN:
            await handleJoin(data as JoinMessage, socket, participantId);
            break;
            
          case MessageType.LEAVE:
            await handleLeave(participantId);
            break;
            
          case MessageType.NICKNAME_CHANGE:
            // Обработка изменения имени
            if (currentRoomId && currentRoom) {
              // Получаем данные из сообщения
              const nicknameData = data as { nickname: string, previousName?: string };
              
              console.log(`Participant ${participantId} changed nickname to: ${nicknameData.nickname}`);
              
              // Уведомляем всех остальных участников в комнате
              notifyParticipants(currentRoom, participantId, {
                type: 'nickname-change',
                data: {
                  participantId,
                  nickname: nicknameData.nickname,
                  previousName: nicknameData.previousName
                }
              });
              
              // Посылаем подтверждение обратно отправителю
              sendToClient(socket, {
                type: 'nickname-change',
                data: {
                  participantId,
                  nickname: nicknameData.nickname,
                  previousName: nicknameData.previousName,
                  isLocalChange: true
                }
              });
            }
            break;
            
          case MessageType.CONNECT_TRANSPORT:
            await mediasoup.connectTransport(data.transportId, data.dtlsParameters);
            break;
            
          case MessageType.PRODUCE:
            await handleProduce(data as ProduceMessage, participantId);
            break;
            
          case MessageType.REQUEST_CONSUME:
            await handleConsume(data as RequestConsumeMessage, socket, participantId);
            break;
          
          case 'ping':
            // Принимаем пинг от клиента и обновляем его статус активности
            socket.isAlive = true;
            socket.lastActivity = Date.now();
            // По желанию можно отправить понг в ответ
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'pong' }));
            }
            break;
            
          case MessageType.PARTICIPANT_KILLED:
            // Обработка статуса "убит"
            if (currentRoomId && currentRoom) {
              // Получаем данные из сообщения
              const killedData = data as { killed: boolean };
              
              // Находим участника
              const participant = currentRoom.participants.get(participantId);
              if (participant) {
                // Обновляем статус
                participant.isKilled = killedData.killed;
                
                console.log(`Participant ${participantId} is now ${killedData.killed ? 'killed' : 'alive'}`);
                
                // Важно: мы НЕ закрываем producer, а просто помечаем участника как "убитого"
                // Таким образом, видео продолжает транслироваться, но клиенты знают,
                // что этот участник "убит" и могут отображать соответствующий оверлей
                
                // Уведомляем всех остальных участников в комнате
                notifyParticipants(currentRoom, participantId, {
                  type: 'participant-killed',
                  data: {
                    participantId,
                    killed: killedData.killed
                  }
                });
              }
            }
            break;
            
          default:
            console.warn(`Unknown message type: ${data.type}`);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        sendToClient(socket, {
          type: 'error',
          error: 'Failed to process request'
        });
      }
    });

    // Handle disconnection
    socket.on('close', async () => {
      await handleLeave(participantId);
      console.log(`Participant disconnected: ${participantId}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for participant ${participantId}:`, error);
    });

    // Handle join room
    async function handleJoin(msg: JoinMessage, socket: WebSocket, participantId: string) {
      // Default to the default room if not specified
      const roomId = msg.roomId || defaultRoom;
      
      // Get or create the room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          participants: new Map()
        });
      }
      
      const room = rooms.get(roomId)!;
      
      // Check if we received rtpCapabilities in the JOIN message
      if (msg.rtpCapabilities) {
        // This is the second JOIN message with rtpCapabilities
        // Update participant with rtpCapabilities
        const participant = room.participants.get(participantId);
        if (participant) {
          // Store rtpCapabilities with the participant
          const updatedParticipant = {
            ...participant,
            rtpCapabilities: msg.rtpCapabilities
          };
          room.participants.set(participantId, updatedParticipant);
          
          console.log(`Updated participant ${participantId} with RTP capabilities`);
          
          // Now that we have rtpCapabilities, notify about existing producers
          // Use Array.from instead of for...of to avoid iterator issues
          Array.from(room.participants.entries()).forEach(([existingId, existingParticipant]) => {
            if (existingId !== participantId && existingParticipant.producerId) {
              console.log(`Notifying participant ${participantId} about existing producer ${existingParticipant.producerId} from ${existingId}`);
              
              // Send notification about each existing producer
              sendToClient(socket, {
                type: 'new-producer',
                data: {
                  producerId: existingParticipant.producerId,
                  participantId: existingId
                }
              });
              
              // Если существующий участник "убит", сразу отправляем и это уведомление
              if (existingParticipant.isKilled) {
                sendToClient(socket, {
                  type: 'participant-killed',
                  data: {
                    participantId: existingId,
                    killed: true
                  }
                });
                console.log(`Notifying new participant ${participantId} that ${existingId} is killed`);
              }
            }
          });
          
          // We've already sent the welcome message in the first join,
          // so just return here
          return;
        }
      }
      
      // First JOIN message, add participant to room
      room.participants.set(participantId, {
        socket
      });
      
      currentRoom = room;
      currentRoomId = roomId;
      
      // Create server-side transport for this client
      const { routerRtpCapabilities, webRtcTransportOptions } = await mediasoup.createTransport(participantId);
      
      // Send welcome message with transport options
      sendToClient(socket, {
        type: 'welcome',
        data: {
          routerRtpCapabilities,
          webRtcTransportOptions
        }
      });
      
      console.log(`Participant ${participantId} joined room ${roomId}. Waiting for RTP capabilities...`);
    }

    // Handle leave room
    async function handleLeave(participantId: string) {
      if (currentRoom && currentRoomId) {
        // Get participant info
        const participant = currentRoom.participants.get(participantId);
        
        if (participant) {
          // If participant had a producer, close it and notify others
          if (participant.producerId) {
            // Close the producer
            await mediasoup.closeProducer(participant.producerId);
            
            // Notify other participants
            notifyParticipants(currentRoom, participantId, {
              type: 'producer-closed',
              data: {
                producerId: participant.producerId,
                participantId
              }
            });
          }
          
          // Remove participant from room
          currentRoom.participants.delete(participantId);
          
          // Notify other participants about disconnection
          notifyParticipants(currentRoom, participantId, {
            type: 'disconnect',
            participantId
          });
          
          console.log(`Participant ${participantId} left room ${currentRoomId}`);
        }
        
        // Clean up mediasoup resources for this participant
        await mediasoup.removeParticipant(participantId);
        
        currentRoom = null;
        currentRoomId = null;
      }
    }

    // Handle produce request
    async function handleProduce(msg: ProduceMessage, participantId: string) {
      if (!currentRoom) {
        sendToClient(socket, {
          type: 'error',
          error: 'Not in a room'
        });
        return;
      }
      
      // Create producer
      const { id: producerId } = await mediasoup.produce(
        msg.transportId,
        msg.kind,
        msg.rtpParameters
      );
      
      // Store producerId with participant
      const participant = currentRoom.participants.get(participantId);
      if (participant) {
        participant.producerId = producerId;
      }
      
      // Notify client
      sendToClient(socket, {
        type: 'produce-response',
        data: { id: producerId }
      });
      
      // Notify other participants about new producer
      console.log(`Notifying other participants about producer ${producerId} from ${participantId}. Current participants: ${Array.from(currentRoom.participants.keys()).join(', ')}`);
      
      notifyParticipants(currentRoom, participantId, {
        type: 'new-producer',
        data: {
          producerId,
          participantId
        }
      });
      
      console.log(`Participant ${participantId} created producer ${producerId}`);
    }

    // Handle consume request
    async function handleConsume(msg: RequestConsumeMessage, socket: WebSocket, consumerParticipantId: string) {
      if (!currentRoom) {
        sendToClient(socket, {
          type: 'error',
          error: 'Not in a room'
        });
        return;
      }
      
      try {
        // Create transport for consuming
        const { webRtcTransportOptions } = await mediasoup.createConsumerTransport(consumerParticipantId, msg.producerId);
        
        // Create consumer
        const consumerOptions = await mediasoup.consume(
          consumerParticipantId,
          msg.producerId,
          msg.rtpCapabilities
        );
        
        // Send consumer options to client
        sendToClient(socket, {
          type: 'consume-response',
          data: {
            ...consumerOptions,
            transportOptions: webRtcTransportOptions,
            participantId: msg.participantId || 'unknown' // Use the participant ID if provided
          }
        });
        
        console.log(`Created consumer for participant ${consumerParticipantId} consuming ${msg.producerId}`);
      } catch (error: any) {
        console.error('Error creating consumer:', error);
        sendToClient(socket, {
          type: 'error',
          error: `Failed to create consumer: ${error.message}`
        });
        
        // If error is about producer not existing, send producer-closed message too
        if (error.message && (
            error.message.includes('Cannot consume producer') || 
            error.message.includes('not found')
        )) {
          console.log(`Sending producer-closed notification to handle gracefully on client`);
          sendToClient(socket, {
            type: 'producer-closed',
            data: {
              producerId: msg.producerId,
              participantId: msg.participantId || 'unknown'
            }
          });
        }
      }
    }
  });

  return httpServer;
}

// Helper to send message to a client
function sendToClient(socket: WebSocket, message: any) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Notify all participants in a room except the sender
function notifyParticipants(room: Room, senderId: string, message: any) {
  let notifiedCount = 0;
  room.participants.forEach((participant, id) => {
    if (id !== senderId) {
      console.log(`Sending notification to participant ${id}`);
      sendToClient(participant.socket, message);
      notifiedCount++;
    }
  });
  console.log(`Notified ${notifiedCount} participants about ${message.type}`);
}

// Generate a random participant ID
function generateParticipantId() {
  return `user-${Math.random().toString(36).substr(2, 9)}`;
}
