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
          'profile-level-id': '4d0032',
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
        ip: '0.0.0.0',
      announcedIp: '45.14.246.195',  // Replace with your public IP in production
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
  recvTransports: Map<string, WebRtcTransport>; // producerId -> transport
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
      recvTransports: new Map()
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

// Create a transport for consuming
export async function createConsumerTransport(
  participantId: string,
  producerId: string
): Promise<{
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
      recvTransports: new Map()
    });
  }
  
  // Store the transport
  const participantData = participantTransports.get(participantId)!;
  participantData.recvTransports.set(producerId, transport);
  
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
    for (const [producerId, recvTransport] of data.recvTransports.entries()) {
      if (recvTransport.id === transportId) {
        transport = recvTransport;
        break;
      }
    }
    
    if (transport) break;
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
  // Check if the participant can consume the producer
  if (!router.canConsume({
    producerId,
    rtpCapabilities
  })) {
    throw new Error(`Cannot consume producer: ${producerId}`);
  }
  
  // Get the participant data
  const participantData = participantTransports.get(participantId);
  if (!participantData) {
    throw new Error(`Participant not found: ${participantId}`);
  }
  
  // Get the transport - we need to access the last created transport for this participant
  // This is because we're creating a new transport for each consume request on the client
  // but the client references the same producerId
  let transport = participantData.recvTransports.get(producerId);
  
  // If we don't find a transport keyed specifically by producerId, 
  // just use the most recently created one
  if (!transport && participantData.recvTransports.size > 0) {
    // Get the last created transport
    const transports = Array.from(participantData.recvTransports.values());
    transport = transports[transports.length - 1];
    console.log(`Using fallback transport for producer ${producerId}`);
  }
  
  if (!transport) {
    throw new Error(`Receive transport not found for producer: ${producerId}`);
  }
  
  // Create consumer
  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: false // automatically start consuming
  });
  
  // Store the consumer
  consumers.set(consumer.id, consumer);
  
  // Return consumer parameters
  return {
    id: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters
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
  const participantData = participantTransports.get(participantId);
  if (!participantData) return;
  
  // Close send transport
  if (participantData.sendTransport) {
    participantData.sendTransport.close();
  }
  
  // Close receive transports
  for (const transport of participantData.recvTransports.values()) {
    transport.close();
  }
  
  // Remove participant data
  participantTransports.delete(participantId);
}

// Shutdown mediasoup
export async function shutdown(): Promise<void> {
  // Close all transports, producers and consumers
  for (const participantId of participantTransports.keys()) {
    await removeParticipant(participantId);
  }
  
  // Close all workers
  for (const worker of workers) {
    worker.close();
  }
  
  workers = [];
}
