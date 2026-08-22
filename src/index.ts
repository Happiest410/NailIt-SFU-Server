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
import { createOpusEncoder } from './opusEncoder.ts';

import LibSampleRateModule from "@alexanderolsen/libsamplerate-js";
const create = LibSampleRateModule.create;
const ConverterType = LibSampleRateModule.ConverterType;
const resampler = await create(
    1,
    24000,
    48000,
    {
        converterType: ConverterType.SRC_LINEAR
    }
);

import { createWorker } from "mediasoup";
import type { types } from "mediasoup";
import createGeminiSession from "./gemini.ts";

const opusEncoderAI = createOpusEncoder(48000, 2);

const app: Application = express();
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

function generateMeetingCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const getChunk = (length: number) => {
    let chunk = '';
    for (let i = 0; i < length; i++) {
      chunk += chars.charAt(Math.floor(Math.random() * length));
    }
    return chunk;
  };
  return `${getChunk(3)}-${getChunk(4)}-${getChunk(3)}`;
}

app.get("/meet", async (req: Request, res: Response) => {
  try {
    const meetId = generateMeetingCode();
    await prisma.meet.create({ data: { room: meetId } });
    return res.status(200).json({ room: meetId });
  } catch (err) {
    console.error("Error creating meeting:", err);
    return res.status(500).json({ error: "Failed to create meeting" });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});
io.use(SocketAuth);

const workerManager = new WorkerManager();
await workerManager.initialize();

const RoomManager = new Manager();

io.on("connection", async (socket: Socket) => {
  await handleConnection(socket, RoomManager, workerManager, resampler, opusEncoderAI);
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`SFU WebRTC Server running on port ${PORT}`);
});
