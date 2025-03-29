import * as mediasoup from 'mediasoup';
import os from 'os';

// mediasoup types
type Router = mediasoup.types.Router;
type WebRtcTransport = mediasoup.types.WebRtcTransport;
type Producer = mediasoup.types.Producer;
type Consumer = mediasoup.types.Consumer;
type Worker = mediasoup.types.Worker;

// Mediasoup settings
const config = {
  // Number of mediasoup workers
  numWorkers: Math.min(4, os.cpus().length),
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
  },
  // Router settings
  router: {
    mediaCodecs: [
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',  // Baseline profile для широкой совместимости
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',  // High profile для лучшего качества
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000
        }
      },
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      }
    ]
  },
  // WebRtcTransport settings
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',      // Replace with your local IP in production, or use 0.0.0.0 for all interfaces
        announcedIp: null,  // Replace with your public IP in production
      }
    ],
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  }
};

// Global state
let workers: Worker[] = [];
let nextWorkerIndex = 0;
let router: Router;

// Participant-specific state
const participantTransports = new Map<string, {
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport; // Единый транспорт для приема
  consumers: Map<string, Consumer>; // producerId -> consumer
}>();

const producers = new Map<string, Producer>();
const consumers = new Map<string, Consumer>();

// Initialize mediasoup
export async function init(): Promise<void> {
  console.log('Initializing mediasoup...');
  
  // Create workers
  for (let i = 0; i < config.numWorkers; i++) {
    const worker = await mediasoup.createWorker(config.worker);
    
    worker.on('died', () => {
      console.error(`Worker ${i} died, exiting in 2 seconds...`);
      setTimeout(() => process.exit(1), 2000);
    });
    
    workers.push(worker);
  }
  
  // Create router on first worker
  router = await workers[0].createRouter({ mediaCodecs: config.router.mediaCodecs });
  
  console.log('Mediasoup initialized');
}

// Create a WebRtcTransport
export async function createTransport(participantId: string): Promise<{
  routerRtpCapabilities: any;
  webRtcTransportOptions: any;
}> {
  // Create transport options based on config
  const transportOptions = {
    ...config.webRtcTransport,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  };
  
  // Create a transport
  const transport = await router.createWebRtcTransport(transportOptions);
  
  // Initialize participant state if needed
  if (!participantTransports.has(participantId)) {
    participantTransports.set(participantId, {
      consumers: new Map()
    });
  }
  
  // Store the transport
  const participantData = participantTransports.get(participantId)!;
  participantData.sendTransport = transport;
  
  // Return transport parameters
  return {
    routerRtpCapabilities: router.rtpCapabilities,
    webRtcTransportOptions: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    }
  };
}

// Create a transport for consuming (единый для участника)
export async function createConsumerTransport(
  participantId: string
): Promise<{
  webRtcTransportOptions: any;
}> {
  // Если транспорт для приема уже существует, возвращаем его параметры
  const existingData = participantTransports.get(participantId);
  if (existingData && existingData.recvTransport) {
    return {
      webRtcTransportOptions: {
        id: existingData.recvTransport.id,
        iceParameters: existingData.recvTransport.iceParameters,
        iceCandidates: existingData.recvTransport.iceCandidates,
        dtlsParameters: existingData.recvTransport.dtlsParameters,
      }
    };
  }

  // Create transport options based on config
  const transportOptions = {
    ...config.webRtcTransport,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  };
  
  // Create a transport
  const transport = await router.createWebRtcTransport(transportOptions);
  
  // Initialize participant state if needed
  if (!participantTransports.has(participantId)) {
    participantTransports.set(participantId, {
      consumers: new Map()
    });
  }
  
  // Store the transport
  const participantData = participantTransports.get(participantId);
  if (participantData) {
    participantData.recvTransport = transport;
  }
  
  // Return transport parameters
  return {
    webRtcTransportOptions: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    }
  };
}

// Connect a transport (client initiated)
export async function connectTransport(transportId: string, dtlsParameters: any): Promise<void> {
  // Find the transport
  let transport: WebRtcTransport | undefined;
  
  // Check in send transports
  for (const [participantId, data] of participantTransports.entries()) {
    if (data.sendTransport?.id === transportId) {
      transport = data.sendTransport;
      break;
    }
    
    // Check in receive transports
    if (data.recvTransport?.id === transportId) {
      transport = data.recvTransport;
      break;
    }
  }
  
  if (!transport) {
    throw new Error(`Transport not found: ${transportId}`);
  }
  
  // Connect the transport
  await transport.connect({ dtlsParameters });
}

// Create a producer
export async function produce(
  transportId: string,
  kind: string,
  rtpParameters: any
): Promise<{ id: string }> {
  // Find the transport
  let transport: WebRtcTransport | undefined;
  let participantIdForTransport: string | undefined;
  
  for (const [participantId, data] of participantTransports.entries()) {
    if (data.sendTransport?.id === transportId) {
      transport = data.sendTransport;
      participantIdForTransport = participantId;
      break;
    }
  }
  
  if (!transport || !participantIdForTransport) {
    throw new Error(`Send transport not found: ${transportId}`);
  }
  
  // Create producer
  const producer = await transport.produce({
    kind: kind as 'audio' | 'video',
    rtpParameters
  });
  
  // Store the producer
  producers.set(producer.id, producer);
  
  // Return producer ID
  return { id: producer.id };
}

// Create a consumer
export async function consume(
  participantId: string,
  producerId: string,
  rtpCapabilities: any
): Promise<{
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
}> {
  // Check if the participant exists
  if (!participantTransports.has(participantId)) {
    throw new Error(`Participant ${participantId} not found`);
  }
  
  // Get participant data
  const participantData = participantTransports.get(participantId)!;
  
  // Check if recvTransport exists
  if (!participantData.recvTransport) {
    throw new Error(`Receive transport for participant ${participantId} not found`);
  }
  
  // Check if router can consume the producer with the participant's capabilities
  if (!router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error(`Cannot consume producer ${producerId} with the given RTP capabilities`);
  }
  
  // Create consumer
  const consumer = await participantData.recvTransport.consume({
    producerId,
    rtpCapabilities,
    paused: false, // Сразу запускаем потребление
  });
  
  // Store the consumer
  consumers.set(consumer.id, consumer);
  participantData.consumers.set(producerId, consumer);
  
  // Return consumer parameters
  return {
    id: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

// Close a producer
export async function closeProducer(producerId: string): Promise<void> {
  const producer = producers.get(producerId);
  if (producer) {
    producer.close();
    producers.delete(producerId);
  }
  
  // Close any associated consumers
  for (const [consumerId, consumer] of consumers.entries()) {
    if (consumer.producerId === producerId) {
      consumer.close();
      consumers.delete(consumerId);
    }
  }
}

// Clean up resources for a participant
export async function removeParticipant(participantId: string): Promise<void> {
  // Get participant data
  const participantData = participantTransports.get(participantId);
  if (!participantData) return;
  
  // Close all consumers
  const consumersArray = Array.from(participantData.consumers.values());
  for (const consumer of consumersArray) {
    consumer.close();
    if (consumer.id) {
      consumers.delete(consumer.id);
    }
  }
  
  // Close send transport
  if (participantData.sendTransport) {
    participantData.sendTransport.close();
  }
  
  // Close receive transport
  if (participantData.recvTransport) {
    participantData.recvTransport.close();
  }
  
  // Remove participant from map
  participantTransports.delete(participantId);
  
  console.log(`Participant ${participantId} removed`);
}

// Shutdown mediasoup
export async function shutdown(): Promise<void> {
  console.log('Shutting down mediasoup...');
  
  // Close all transports
  const entries = Array.from(participantTransports.entries());
  for (const [participantId, data] of entries) {
    await removeParticipant(participantId);
  }
  
  // Close all workers
  const workerArray = Array.from(workers);
  for (const worker of workerArray) {
    worker.close();
  }
  
  // Clear global state
  workers = [];
  participantTransports.clear();
  producers.clear();
  consumers.clear();
  
  console.log('Mediasoup shutdown complete');
}
