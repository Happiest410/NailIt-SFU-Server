export interface RTPPacket {
  version: number;
  payloadType: number;
  sequenceNumber: number;
  timestamp: number;
  ssrc: number;
  payload: Buffer;
}
export interface RTPFrame {
  sequenceNumber: number;
  timestamp: number;
  payload: Buffer;
}
export interface RoomState {
  router: types.Router;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  aiTransport: types.PlainTransport;
  AiConsumer?: types.Consumer;
  aiOutputTransport?: types.PlainTransport;
  aiOutputProducer?: types.Producer;
  aiOutputPort?: number;
  geminiSession?: any;
  micPayloadType?: number;
}
export interface startMeetData{
    meetId:string
}
