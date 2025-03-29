// Types for mediasoup WebRTC messages

export type DeviceInfo = {
  name: string;
  deviceId: string;
};

// Message types for signaling
export enum MessageType {
  JOIN = 'join',
  LEAVE = 'leave',
  NEW_PRODUCER = 'new-producer',
  REQUEST_CONSUME = 'request-consume',
  PRODUCER_CLOSED = 'producer-closed',
  CONNECT_TRANSPORT = 'connect-transport',
  PRODUCE = 'produce',
  NICKNAME_CHANGE = 'nickname-change',
  PARTICIPANT_KILLED = 'participant-killed',
}

// Base message interface
export interface SignalingMessage {
  type: MessageType;
}

// Join room message
export interface JoinMessage extends SignalingMessage {
  type: MessageType.JOIN;
  roomId?: string; // Optional, can be default room
  rtpCapabilities?: any; // Client's RTP capabilities for consumer creation
}

// Leave room message
export interface LeaveMessage extends SignalingMessage {
  type: MessageType.LEAVE;
}

// New producer message
export interface NewProducerMessage extends SignalingMessage {
  type: MessageType.NEW_PRODUCER;
  producerId: string;
  kind: 'audio' | 'video';
}

// Request to consume a producer
export interface RequestConsumeMessage extends SignalingMessage {
  type: MessageType.REQUEST_CONSUME;
  producerId: string;
  rtpCapabilities: any;
  participantId?: string; // ID of the participant who produced the stream
}

// Producer closed message
export interface ProducerClosedMessage extends SignalingMessage {
  type: MessageType.PRODUCER_CLOSED;
  producerId: string;
}

// Nickname change message
export interface NicknameChangeMessage extends SignalingMessage {
  type: MessageType.NICKNAME_CHANGE;
  nickname: string;
  previousName?: string;
  isLocalChange?: boolean; // true if this is a local notification only
}

// Connect transport message
export interface ConnectTransportMessage extends SignalingMessage {
  type: MessageType.CONNECT_TRANSPORT;
  transportId: string;
  dtlsParameters: any;
}

// Produce message
export interface ProduceMessage extends SignalingMessage {
  type: MessageType.PRODUCE;
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
}

// Server response types
export interface ServerInitResponse {
  routerRtpCapabilities: any;
  webRtcTransportOptions: {
    id: string;
    iceParameters: any;
    iceCandidates: any[];
    dtlsParameters: any;
  };
}

export interface ProduceResponse {
  id: string;
}

export interface ConsumeResponse {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: any;
}

// Participant killed message
export interface ParticipantKilledMessage extends SignalingMessage {
  type: MessageType.PARTICIPANT_KILLED;
  killed: boolean; // true = killed, false = revived
}

// Participant type
export interface Participant {
  id: string;
  producerId?: string;
  consumerIds: string[];
  isKilled?: boolean;
}
