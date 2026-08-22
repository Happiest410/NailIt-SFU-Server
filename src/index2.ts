import { createWorker } from "mediasoup";
import type { types } from "mediasoup";

let worker: types.Worker;

async function initWorker() {
  worker = await createWorker();
  worker.on("died", () => {
    console.error("mediasoup worker died, exiting in 2s...");
    setTimeout(() => process.exit(1), 2000);
  });
}
await initWorker();







import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from "http";
import dgram from "dgram";
import type { RoomState } from './types.ts';
import { Manager } from './Manager.ts';
import prisma from './prisma.ts';
import type{RTPPacket,RTPFrame} from './types.ts';
import { JitterBuffer } from './AudioProcessing.ts';
import { Server, Socket } from "socket.io";
import {applyFade} from './AudioProcessing.ts';
import { isRTCP } from './AudioProcessing.ts';
import { initResampler } from './AudioProcessing.ts';
import { handleStartInterview } from './startInterviewHandler.ts';
import { stereoToMono } from './AudioProcessing.ts';
import { WorkerManager } from './workerManager.ts';
import { handleConnection } from './connectionHandler.ts';
import { parseRTPPacket } from './AudioProcessing.ts';
import { buildRTPPacket } from './AudioProcessing.ts';
import { resampleAndStereo } from './AudioProcessing.ts';
import type { Application, Request, Response } from "express";

import LibSampleRateModule from "@alexanderolsen/libsamplerate-js";
const create = LibSampleRateModule.create;
const ConverterType = LibSampleRateModule.ConverterType;
let resampler: any = null;
let interruptGeneration = false;

  let lastInterruptAt = 0;
  const INTERRUPT_COOLDOWN_MS = 300;
let lastSendTime: number | null = null;


import { createWorker } from "mediasoup";
import type { types } from "mediasoup";
import opus from "@discordjs/opus";
import createGeminiSession from "./gemini.ts";


let opusu = new opus.OpusEncoder(48000, 2);
const opusEncoderAI = new opus.OpusEncoder(48000, 2); // used only for encode (AI output)



async function interruptAI(roomId?: string, geminiSession?: any) {
  aiAudioQueue.length = 0;
  leftoverPCM = Buffer.alloc(0);
  isPlaying = false;
  lastSendTime = null;
  totalBytesSentThisTurn = 0;
  turnStartTime = null;
  aiSpeaking = false;

  console.log(
  "INTERRUPT FIRED",
  Date.now()
);
interruptGeneration = true;
aiAudioQueue.splice(0);
  if (roomId) {
    io.to(roomId).emit("aiInterrupted");
  }

  console.log(
  "Sending turn completion after interrupt"
);


}
function getRMS(pcm: Buffer): number {
  let sum = 0;

  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i);
    sum += sample * sample;
  }

  return Math.sqrt(sum / (pcm.length / 2));
}
let aiSpeaking = false;
const app: Application = express();
app.use(cors({ origin: "*" }));
app.use(express.json());





// Crude nearest-neighbor upsample: 24kHz mono -> 48kHz stereo (for sending Gemini's voice back)






const rooms = new Map<string, RoomState>();
const rtpSendSocket = dgram.createSocket("udp4");

let aiSeq = 0;
let aiTimestamp = 0;
const AI_SSRC = 22222222;
const AI_PAYLOAD_TYPE = 101;

const aiAudioQueue: Buffer[] = [];
let aiQueueTimer: NodeJS.Timeout | null = null;

let leftoverPCM = Buffer.alloc(0);

const MIN_BUFFER_FRAMES = 2; // ~80ms pre-buffer before starting playback
let isPlaying = false;
let justResumed=false;

let processingChain: Promise<void> = Promise.resolve();
let totalBytesSentThisTurn = 0;
let turnStartTime: number | null = null;

function enqueueGeminiAudioChunk(pcm24kMono: Buffer, targetPort: number): Promise<void> {

  if (turnStartTime === null) turnStartTime = Date.now();
  totalBytesSentThisTurn += pcm24kMono.length;

  const elapsedSec = (Date.now() - turnStartTime) / 1000;
  const expectedSec = totalBytesSentThisTurn / (24000 * 2);
  console.log(`Elapsed: ${elapsedSec.toFixed(2)}s, Audio duration so far: ${expectedSec.toFixed(2)}s`);
  
  // Chain onto the previous call so resample+queue operations never overlap
  processingChain = processingChain.then(async () => {

    const pcm48kStereo = await resampleAndStereo(pcm24kMono,resampler);
    aiSpeaking = true;

    const combined = Buffer.concat([leftoverPCM, pcm48kStereo]);

    const FRAME_BYTES = 3840; // 960 stereo samples (20ms) * 4 bytes

    let offset = 0;
    for (; offset + FRAME_BYTES <= combined.length; offset += FRAME_BYTES) {
      aiAudioQueue.push(combined.subarray(offset, offset + FRAME_BYTES));
    }
    leftoverPCM = combined.subarray(offset);
const MAX_QUEUE_FRAMES = 1000;
if (aiAudioQueue.length > MAX_QUEUE_FRAMES) {
  console.warn("AI audio queue exceeded safety cap, dropping oldest frames");
  aiAudioQueue.splice(0, aiAudioQueue.length - MAX_QUEUE_FRAMES);
}

    if (!isPlaying && aiAudioQueue.length >= MIN_BUFFER_FRAMES) {
      isPlaying = true;
      justResumed=true;
    }

    if (!aiQueueTimer) {

aiQueueTimer = setInterval(() => {
  if (!isPlaying) {
    lastSendTime = null;
    return;
  }
  if (interruptGeneration) {
   aiAudioQueue.length = 0;
   return;
}
  let frame = aiAudioQueue.shift();
  if (!frame) {
    isPlaying = false;
    lastSendTime = null;
    aiSpeaking = false;
    return;
  }
  if (justResumed) {
    frame = applyFade(frame, true);
    justResumed = false;
  }
  if (aiAudioQueue.length === 0) {
    frame = applyFade(frame, false);
  }

  try {
    const opusFrame = opusEncoderAI.encode(frame);
    const rtpPacket = buildRTPPacket(opusFrame, aiSeq++, aiTimestamp, AI_SSRC, AI_PAYLOAD_TYPE);
    aiTimestamp += 960; // 20ms @ 48kHz — now matches the 20ms frame
    rtpSendSocket.send(rtpPacket, targetPort, "127.0.0.1");
  } catch (err) {
    console.error("Opus encode error (AI output):", err);
  }
}, 20);
    }
  }).catch(err => {
    console.error("enqueueGeminiAudioChunk processing error:", err);
  });

  return processingChain;
}

function generateMeetingCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const getChunk = (length: number) => {
    let chunk = '';
    for (let i = 0; i < length; i++) {
      chunk += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return chunk;
  };
  return `${getChunk(3)}-${getChunk(4)}-${getChunk(3)}`;
}

const mediaCodecs: types.RouterRtpCodecCapability[] = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
  { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
];

const ANNOUNCED_IP = process.env.PUBLIC_IP || "127.0.0.1";

async function createWebRtcTransport(router: types.Router) {
  const transport = await router.createWebRtcTransport({
    listenInfos: [
      { protocol: "udp", ip: "0.0.0.0", announcedAddress: ANNOUNCED_IP },
      { protocol: "tcp", ip: "0.0.0.0", announcedAddress: ANNOUNCED_IP },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transport.on("dtlsstatechange", (state) => {
    console.log(`[Transport ${transport.id}] DTLS state:`, state);
  });
  transport.on("icestatechange", (state) => {
    console.log(`[Transport ${transport.id}] ICE state:`, state);
  });

  return transport;
}

let worker: types.Worker;

async function initWorker() {
  worker = await createWorker();
  worker.on("died", () => {
    console.error("mediasoup worker died, exiting in 2s...");
    setTimeout(() => process.exit(1), 2000);
  });
}

// NOTE: hardcoded port 5004 for mic input still only supports ONE concurrent room reliably.
// Multiple simultaneous rooms will collide on this port. Flagging again — fix before multi-room use.
const MIC_INPUT_PORT = 5004;

app.get("/meet", async (req: Request, res: Response) => {
  try {
    const meetId = generateMeetingCode();
    await prisma.meet.create({ data: { room: meetId } });


  } catch (err) {
    console.error("Error creating meeting:", err);
    res.status(500).json({ error: "Failed to create meeting" });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

const workerManager=new WorkerManager
workerManager.initialize()

const RoomManager=new Manager

io.on("connection", async(socket: Socket) => {

await handleConnection(socket,RoomManager,workerManager);

socket.on("startInterview",async(data)=>{
   await handleStartInterview(socket,data)
})
 

  
  

  let ready = false;
  let room: RoomState | undefined;

      const router = await worker.createRouter({ mediaCodecs });

    // --- Transport for receiving mic audio (browser -> server) ---
    const plainTransport = await router.createPlainTransport({
      listenInfo: { protocol: "udp", ip: "127.0.0.1" },
      rtcpMux: true,
      comedia: false
    });

    // console.log(`[Room ${meetId}] PlainTransport initial tuple:`, plainTransport.tuple);

    // plainTransport.on("tuple", (tuple) => {
    //   console.log(`[Room ${meetId}] PlainTransport tuple updated:`, tuple);
    // });

    await plainTransport.connect({ ip: "127.0.0.1", port: MIC_INPUT_PORT });

    // console.log(`[Room ${meetId}] PlainTransport connected, tuple after connect:`, plainTransport.tuple);

    // --- Transport for sending Gemini's voice back (server -> mediasoup -> browser) ---
    const aiOutputTransport = await router.createPlainTransport({
      listenInfo: { protocol: "udp", ip: "127.0.0.1" },
      rtcpMux: true,
      comedia: true // mediasoup auto-detects our sender address/port from the first packet
    });

    // console.log(`[Room ${meetId}] AI output transport tuple:`, aiOutputTransport.tuple);

    const aiOutputProducer = await aiOutputTransport.produce({
      kind: "audio",
      rtpParameters: {
        codecs: [
          {
            mimeType: "audio/opus",
            payloadType: AI_PAYLOAD_TYPE,
            clockRate: 48000,
            channels: 2,
            parameters: {}
          }
        ],
        encodings: [{ ssrc: AI_SSRC }]
      }
    });

    // console.log(`[Room ${meetId}] AI output producer created:`, aiOutputProducer.id);

    const aiOutputPort = aiOutputTransport.tuple.localPort;

    const roomState: RoomState = {
      router,
      transports: new Map(),
      producers: new Map(),
      aiTransport: plainTransport,
      aiOutputTransport,
      aiOutputProducer,
      aiOutputPort
    };

    // rooms.set(meetId, roomState);

    // Create this room's own Gemini Live session
const geminiSession = await createGeminiSession((pcmBuffer: Buffer) => {
   if (interruptGeneration) {
      return;
    }
  enqueueGeminiAudioChunk(pcmBuffer, aiOutputPort).catch(err => {
    console.error("enqueueGeminiAudioChunk error:", err);
  });
},()=>{
  interruptGeneration=false
});
    roomState.geminiSession = geminiSession;

       (async () => {
    try {
      const meeting = await prisma.meet.findUnique({ where: { room: roomId! } });
      if (!meeting) {
        socket.emit("error", { message: "Meeting not found" });
        socket.disconnect();
        return;
      }
    } catch (err) {
      console.error("DB error during socket connection:", err);
      socket.emit("error", { message: "Internal server error" });
      socket.disconnect();
      return;
    }

    room = rooms.get(roomId!);
    if (!room) {
      socket.emit("error", { message: "Room not active on this server" });
      socket.disconnect();
      return;
    }

    socket.join(roomId!);
    ready = true;
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    socket.emit("ready");
  })();


  socket.onAny((eventName, ...args) => {
    console.log(`[${roomId}] Received event: ${eventName}`, args);
  });

  socket.on("getRtpCapabilities", (callback) => {
  console.log("Received getRtpCapabilities request");

  if (!ready || !room) {
    callback({
      error: "Room not ready"
    });
    return;
  }

  callback(room.router.rtpCapabilities);
});

  socket.on("getRouterRtpCapabilities", (_, callback) => {
    if (!ready || !room) {
      callback({ error: "not ready" });
      return;
    }
    try {
      callback(room.router.rtpCapabilities);
    } catch (err) {
      callback({ error: "Failed to get RTP capabilities" });
    }
  });

  socket.on("createWebRtcTransport", async (_, callback) => {
    if (!ready || !room) {
      callback({ error: "not ready" });
      return;
    }
    try {
      const transport = await createWebRtcTransport(room.router);
      room.transports.set(transport.id, transport);
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      console.error("createWebRtcTransport error:", err);
      callback({ error: "Failed to createTransport" });
    }
  });

  socket.on("connectToWebRtcTransport", async (data, callback) => {
    if (!ready || !room) {
      callback({ error: "not ready" });
      return;
    }
    if (!data) {
      callback({ error: "no data found" });
      return;
    }
    const { transportId, dtlsParameters } = data;
    if (!transportId || !dtlsParameters) {
      callback({ error: "send both transport id and dtls params" });
      return;
    }
    try {
      const transport = room.transports.get(transportId);
      if (!transport) {
        callback({ error: "transport not found" });
        return;
      }
      await transport.connect({ dtlsParameters });
      callback({});
    } catch (err) {
      console.error("connectToWebRtcTransport error:", err);
      callback({ error: "Failed to connect transport" });
    }
  });

  socket.on("Produce", async ({ transportId, kind, rtpParameters, appData }, callback) => {
    if (!ready || !room) {
      callback({ error: "not ready" });
      return;
    }
    const transport = room.transports.get(transportId);
    if (!transport) {
      callback({ error: "wrong transport id or transport id not found" });
      return;
    }
    try {
      const produce = await transport.produce({ kind, rtpParameters, appData });
      room.micPayloadType = produce.rtpParameters.codecs[0]?.payloadType;

console.log("Mic producer codec payloadType:", produce.rtpParameters.codecs[0]?.payloadType);

      room.producers.set(produce.id, produce);

      const AIconsumer = await room.aiTransport.consume({
        producerId: produce.id,
        rtpCapabilities: room.router.rtpCapabilities
      });
      await AIconsumer.resume();
      room.AiConsumer = AIconsumer;

      callback({ id: produce.id });
    } catch (err) {
      console.error("Produce handler error:", err);
      callback({ error: "Failed to create Producer" });
    }
  });

  // --- NEW: let clients consume the AI's voice ---
  socket.on("consumeAI", async ({ recvTransportId }, callback) => {
    if (!ready || !room || !room.aiOutputProducer) {
      callback({ error: "not ready" });
      return;
    }
    const transport = room.transports.get(recvTransportId);
    if (!transport) {
      callback({ error: "recv transport not found" });
      return;
    }
    try {
      const consumer = await transport.consume({
        producerId: room.aiOutputProducer.id,
        rtpCapabilities: room.router.rtpCapabilities
      });

      callback({
        id: consumer.id,
        producerId: room.aiOutputProducer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters
      });
    } catch (err) {
      console.error("consumeAI error:", err);
      callback({ error: "Failed to consume AI audio" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Socket ${socket.id} disconnected from room ${roomId}`);
    // NOTE: still closes nothing per-socket; full cleanup (closing transports/producers/
    // router/Gemini session when the room empties) is not yet implemented.
  });


});

async function main() {
   await initResampler(create,resampler,ConverterType); 
  const udpServer = dgram.createSocket("udp4");
  const jitterBuffer = new JitterBuffer();
  let audioBuffer = Buffer.alloc(0);

  let currentMicSSRC: number | null = null;

udpServer.on("message", async (msg) => {
  if (isRTCP(msg)) return;

try {
    const rtp = parseRTPPacket(msg);

    const entry = [...rooms.entries()][0];
    const roomId = entry?.[0];
    const room = entry?.[1];

    


    // if (room?.micPayloadType !== undefined && rtp.payloadType !== room.micPayloadType) {
    //   return;
    // }

if (currentMicSSRC === null) {
  currentMicSSRC = rtp.ssrc;

  console.log(
    "Locked onto SSRC:",
    currentMicSSRC
  );
}

if (rtp.ssrc !== currentMicSSRC) {
  return;
}
    currentMicSSRC = rtp.ssrc;

    jitterBuffer.add({
      sequenceNumber: rtp.sequenceNumber,
      timestamp: rtp.timestamp,
      payload: rtp.payload
    });

    const frames = jitterBuffer.popReady();

    for (const frame of frames) {
      try {
        const pcm = opusu.decode(frame.payload);
        const rms = getRMS(pcm);

        if (aiSpeaking && rms > 1000) {
          const now = Date.now();
          if (now - lastInterruptAt > INTERRUPT_COOLDOWN_MS) {
            lastInterruptAt = now;
            interruptAI(roomId, room?.geminiSession);
          }
        }

        const mono = stereoToMono(pcm);
        audioBuffer = Buffer.concat([audioBuffer, mono]);

        if (audioBuffer.length >= 4800) {
          if (room?.geminiSession) {
            await room.geminiSession.sendRealtimeInput({
              audio: {
                data: audioBuffer.toString("base64"),
                mimeType: "audio/pcm;rate=48000"
              }
            });
          } else {
            console.warn("No active room/geminiSession found, dropping audio chunk");
          }
          audioBuffer = Buffer.alloc(0);
        }
      } catch (err) {
        console.error("Opus decode error:", err);
      }
    }
  } catch (err) {
    console.error("RTP parse error:", err);
  }
});

  udpServer.on("error", (err) => {
    console.error("UDP server error:", err);
  });
  udpServer.bind(MIC_INPUT_PORT, () => {
    console.log(`UDP server listening on port ${MIC_INPUT_PORT}`);
  });

  await initWorker();
  server.listen(3000, () => {
    console.log("Listening on 3000");
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});