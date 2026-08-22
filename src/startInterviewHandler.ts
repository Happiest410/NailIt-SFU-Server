import type { startMeetData } from "./types.js";
import { Interview } from "./interview.ts";
import { Room } from "./Room.ts";
import dotenv from 'dotenv';
import { IncomingAudioPipeline } from "./IncomingAudioPipeline.ts";
import { AIInterviewer } from "./AiInterviewer.ts";
import { MediaBridge } from "./mediaBridge.ts";
import { Socket } from "socket.io";
import dgram from "dgram";
import { GeminiProvider } from "./geminiProvider.ts";
dotenv.config();

const AI_SSRC = 22222222;
const AI_PAYLOAD_TYPE = 101;

export async function handleStartInterview(
  socket: Socket,
  data: startMeetData,
  room: Room,
  resampler: any,
  opusEncoderAI: any
) {
  console.log("1. handleStartInterview entered for room:", room?.meetId);

  if (!room || !room.router) {
    throw new Error("Invalid room or router not initialized");
  }

  const AiInputTransport = await room.router.createPlainTransport({
    listenInfo: { protocol: "udp", ip: "127.0.0.1" },
    rtcpMux: true,
    comedia: false
  });

  const userId = socket.data.user?.id || socket.id;
  const participant = room.participants.get(userId) || [...room.participants.values()][0];

  if (!participant) {
    throw new Error("Participant not found");
  }

  const audioProducer = [...participant.producers.values()].find(
    (producer) => producer.kind === "audio"
  );

  if (!audioProducer) {
    throw new Error("Audio producer not found");
  }

  const AiConsumer = await room.router.consume({
    producerId: audioProducer.id,
    rtpCapabilities: room.router.rtpCapabilities,
    paused: false
  });

  const mediaBridge = new MediaBridge();
  await AiConsumer.resume();

  await AiInputTransport.connect({
    ip: "127.0.0.1",
    port: mediaBridge.udpPort,
  });

  await AiConsumer.requestKeyFrame();

  const aiOutputTransport = await room.router.createPlainTransport({
    listenInfo: { protocol: "udp", ip: "127.0.0.1" },
    rtcpMux: true,
    comedia: false
  });

  const aiOutputProducer = await room.createProducer(participant, {
    transportId: aiOutputTransport.id,
    kind: "audio",
    rtpParameters: {
      codecs: [
        {
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
          payloadType: AI_PAYLOAD_TYPE
        }
      ],
      encodings: [{ ssrc: AI_SSRC }]
    },
    appData: {}
  });

  const aiOutputSocket = dgram.createSocket("udp4");
  const aiOutputPort = aiOutputTransport.tuple.localPort;

  const geminiProvider = new GeminiProvider();

  const aiInterviewer = new AIInterviewer(
    mediaBridge,
    aiOutputSocket,
    aiOutputPort,
    AI_SSRC,
    AI_PAYLOAD_TYPE,
    resampler,
    opusEncoderAI,
    geminiProvider
  );

  await aiInterviewer.init();

  const incomingPipeline = new IncomingAudioPipeline(mediaBridge, aiInterviewer);
  await incomingPipeline.startPipeline(mediaBridge.udpPort);

  const interview = new Interview(room, aiInterviewer);
  room.interview = interview;

  console.log("AI Interview started successfully!");
  return { success: true };
}
