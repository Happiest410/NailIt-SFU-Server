import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from "http";
import dgram from "dgram";
import type { RoomState } from './types.ts';
import { Manager } from './Manager.ts';
import prisma from './prisma.ts';
import { SocketAuth } from './middleware/socketAuth.ts';
import { Server, Socket } from "socket.io";
import { Room } from './Room.ts';
import { handleStartInterview } from './startInterviewHandler.ts';
import { WorkerManager } from './workerManager.ts';
import { handleConnection } from './connectionHandler.ts';
import type { Application, Request, Response } from "express";

import LibSampleRateModule from "@alexanderolsen/libsamplerate-js";
const create = LibSampleRateModule.create;
const ConverterType = LibSampleRateModule.ConverterType;
const resampler= await create(
    1,
    24000,
    48000,
    {
        converterType: ConverterType.SRC_LINEAR
    }
);


import { createWorker } from "mediasoup";
import type { types } from "mediasoup";
import opus from "@discordjs/opus";
import createGeminiSession from "./gemini.ts";



const opusEncoderAI = new opus.OpusEncoder(48000, 2); // used only for encode (AI output)



const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

const app: Application = express();
app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1") || origin === FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true
}));
app.use(express.json());




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
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true
  }
});
io.use(SocketAuth)

const workerManager=new WorkerManager
await workerManager.initialize()

console.log(workerManager)

const RoomManager=new Manager

io.on("connection", async(socket: Socket) => {
  

const room:Room=await handleConnection(socket,RoomManager,workerManager);

 // Send ready with role so the frontend knows how to branch its behavior
 socket.emit("ready", { role: socket.data.user.role });


  socket.on("startInterview", async (data, callback) => {
    try {
        const role = socket.data.user.role;
        if (role !== "Candidate") {
            callback({ error: "Only candidates can start an interview" });
            return;
        }

        await handleStartInterview(
            socket,
            data,
            room,
            resampler,
            opusEncoderAI,
          
        );

        callback({ success: true });

        // Broadcast the AI virtual participant to relevant users
        const aiProducerId = room.interview?.AiIntevriewer.mediaBridge.outputProducer?.id;
        if (aiProducerId) {
            const aiParticipant = {
                id: "ai",
                name: "AI Interviewer",
                role: "ai",
                producerIds: { audio: aiProducerId }
            };
            room.broadcastParticipantJoined(aiParticipant);
        }
    } catch (err) {
        console.error(err);
        callback({ error: "Failed to start interview" });
    }
});

  socket.on("joinInterview", async (data, callback) => {
    try {
        if (!room.interview) {
            callback({ error: "No active interview in this room" });
            return;
        }
        const role = socket.data.user.role;
        if (role !== "Interviewer") {
            callback({ error: "Only interviewers can join an existing interview" });
            return;
        }
        const participants = room.getVisibleParticipants(role);
        callback({ success: true, participants });
    } catch (err) {
        console.error(err);
        callback({ error: "Failed to join interview" });
    }
  });

  socket.on("getParticipants", (_dataOrCallback: any, maybeCallback?: any) => {
    const callback = typeof _dataOrCallback === "function" ? _dataOrCallback : maybeCallback;
    if (typeof callback === "function") {
      const role = socket.data.user?.role;
      callback(room.getVisibleParticipants(role));
    }
  });

  socket.on("getRtpCapabilities", (_dataOrCallback: any, maybeCallback?: any) => {
    console.log("Received getRtpCapabilities request");
    const callback = typeof _dataOrCallback === "function" ? _dataOrCallback : maybeCallback;
    if (typeof callback === "function") {
      callback(room.router.rtpCapabilities);
    }
  });

  socket.on("getRouterRtpCapabilities", (_, callback) => {
    try {
      callback(room.router.rtpCapabilities);
    } catch (err) {
      callback({ error: "Failed to get RTP capabilities" });
    }
  });

  socket.on("createWebRtcTransport", async (_, callback) => {
    
    try {
      const participant = room.participants.get(socket.data.user.id);

if (!participant) {
    callback({ error: "Participant not found" });
    return;
}

      const transport = await room.createWebRtcTransport(participant)
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
    if (!room) {
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
      const participant = room.participants.get(socket.data.user.id);

if (!participant) {
    callback({ error: "Participant not found" });
    return;
}
      const transport = participant.transports.get(transportId);
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
    if (!room) {
      callback({ error: "not ready" });
      return;
    }

    try {
      const participant = room.participants.get(socket.data.user.id);

if (!participant) {
    callback({ error: "Participant not found" });
    return;
}
      const producer = await room.createProducer(participant,{ transportId, kind, rtpParameters, appData })

      callback({ id: producer.id });
    } catch (err) {
      console.error("Produce handler error:", err);
      callback({ error: "Failed to create Producer" });
    }
  });

  // Generic consume — lets any client consume any producer by ID
  socket.on("consume", async ({ producerId, recvTransportId }, callback) => {
    if (!room) {
      callback({ error: "not ready" });
      return;
    }

    try {
      const participant = room.participants.get(socket.data.user.id);

      if (!participant) {
        callback({ error: "Participant not found" });
        return;
      }

      const transport = participant.transports.get(recvTransportId);
      if (!transport) {
        callback({ error: "recv transport not found" });
        return;
      }

      const consumer = await room.createConsumer(participant, { producerId, transport });

      callback({
        id: consumer.id,
        producerId: producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters
      });
    } catch (err) {
      console.error("consume error:", err);
      callback({ error: "Failed to consume" });
    }
  });

  socket.on("disconnect", () => {
    const participant = room.getParticipantBySocket(socket.id);
    if (participant) {
      const role = participant.role;
      const userId = participant.user.id;
      
      // Close all transports for this participant
      for (const transport of participant.transports.values()) {
        transport.close();
      }

      room.removeParticipant(userId);
      room.broadcastParticipantLeft(userId, role);
      
      console.log(`${role} ${userId} disconnected from room ${room.meetId}`);
    } else {
      console.log(`Socket ${socket.id} disconnected from room ${room.meetId}`);
    }
  });


});

async function main() {



  server.listen(3000, () => {
    console.log("Listening on 3000");
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});