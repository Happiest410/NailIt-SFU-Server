import { Socket } from "socket.io";
import prisma from "./prisma.ts";
import { ParticipantRegistry } from "./ParticipantRegistry.ts";
import { WorkerManager } from "./workerManager.ts";
import { Manager } from "./Manager.ts";
import type { types } from "mediasoup";

import { Room } from "./Room.ts";
import { User } from "./user.ts";
import { handleStartInterview } from "./startInterviewHandler.ts";

const mediaCodecs: types.RouterRtpCodecCapability[] = [
  { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
  { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
];

export async function handleConnection(
  socket: Socket,
  manager: Manager,
  workerManager: WorkerManager,
  resampler?: any,
  opusEncoderAI?: any
): Promise<Room> {
  try {
    let roomId = socket.handshake.query.roomId;

    if (Array.isArray(roomId)) {
      roomId = roomId[0];
    }

    if (!roomId || roomId === undefined) {
      socket.disconnect();
      throw new Error("Missing roomId");
    }
    console.log("Room ID from socket:", roomId);

    let meet: any = null;
    try {
      meet = await prisma.meet.findUnique({ where: { room: roomId } });
    } catch (e) {}

    if (!meet) {
      try {
        const schedule = await prisma.schedule.findUnique({ where: { meetRoom: roomId } });
        if (schedule) {
          meet = { id: schedule.id, room: schedule.meetRoom };
        }
      } catch (e) {}
    }

    if (!meet) {
      meet = { id: 0, room: roomId };
    }

    console.log("Meet verified:", meet);
    const role = socket.data.user?.role || "Candidate";

    if (!(role in ParticipantRegistry)) {
      socket.disconnect(true);
      throw new Error("Invalid participant role");
    }

    const ParticipantClass = ParticipantRegistry[role as keyof typeof ParticipantRegistry];

    if (!ParticipantClass) {
      socket.disconnect();
      throw new Error("no participant class found");
    }

    const userId = socket.data.user?.id || socket.id;
    const username = socket.data.user?.username || `candidate_${socket.id.substring(0, 5)}`;
    const user = new User(userId, username);
    const participant = new ParticipantClass(user, socket);

    let room = manager.getRoom(roomId);
    if (!room) {
      const router = await workerManager.getWorker().createRouter({ mediaCodecs });
      room = manager.createRoom(roomId, router);
    }

    socket.join(room.meetId);
    room.addParticipant(participant);

    console.log("Connection handled for", username, "role:", role);

    // Register WebRTC Socket Handlers for this client connection
    socket.on("getRtpCapabilities", (_dataOrCallback: any, maybeCallback?: any) => {
      console.log("Received getRtpCapabilities request from", username);
      const callback = typeof _dataOrCallback === "function" ? _dataOrCallback : maybeCallback;
      if (typeof callback === "function") {
        callback(room.router.rtpCapabilities);
      }
    });

    socket.on("getRouterRtpCapabilities", (_, callback) => {
      try {
        if (typeof callback === "function") callback(room.router.rtpCapabilities);
      } catch (err) {
        if (typeof callback === "function") callback({ error: "Failed to get RTP capabilities" });
      }
    });

    socket.on("createWebRtcTransport", async (_, callback) => {
      try {
        const p = room.participants.get(user.id) || participant;
        const transport = await room.createWebRtcTransport(p);
        if (typeof callback === "function") {
          callback({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          });
        }
      } catch (err) {
        console.error("createWebRtcTransport error:", err);
        if (typeof callback === "function") callback({ error: "Failed to createTransport" });
      }
    });

    socket.on("connectToWebRtcTransport", async (data, callback) => {
      if (!data) {
        if (typeof callback === "function") callback({ error: "no data found" });
        return;
      }
      const { transportId, dtlsParameters } = data;
      try {
        const p = room.participants.get(user.id) || participant;
        const transport = p.transports.get(transportId);
        if (!transport) {
          if (typeof callback === "function") callback({ error: "transport not found" });
          return;
        }
        await transport.connect({ dtlsParameters });
        if (typeof callback === "function") callback({});
      } catch (err) {
        console.error("connectToWebRtcTransport error:", err);
        if (typeof callback === "function") callback({ error: "Failed to connect transport" });
      }
    });

    socket.on("Produce", async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        const p = room.participants.get(user.id) || participant;
        const producer = await room.createProducer(p, { transportId, kind, rtpParameters, appData });
        if (typeof callback === "function") callback({ id: producer.id });
      } catch (err) {
        console.error("Produce handler error:", err);
        if (typeof callback === "function") callback({ error: "Failed to create Producer" });
      }
    });

    socket.on("produce", async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        const p = room.participants.get(user.id) || participant;
        const producer = await room.createProducer(p, { transportId, kind, rtpParameters, appData });
        if (typeof callback === "function") callback({ id: producer.id });
      } catch (err) {
        console.error("produce handler error:", err);
        if (typeof callback === "function") callback({ error: "Failed to create Producer" });
      }
    });

    socket.on("consume", async ({ producerId, recvTransportId }, callback) => {
      try {
        const p = room.participants.get(user.id) || participant;
        const transport = p.transports.get(recvTransportId);
        if (!transport) {
          if (typeof callback === "function") callback({ error: "recv transport not found" });
          return;
        }
        const consumer = await room.createConsumer(p, { producerId, transport });
        if (typeof callback === "function") {
          callback({
            id: consumer.id,
            producerId: producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          });
        }
      } catch (err) {
        console.error("consume error:", err);
        if (typeof callback === "function") callback({ error: "Failed to consume" });
      }
    });

    socket.on("start-interview", async (data) => {
      await handleStartInterview(socket, room, resampler, opusEncoderAI);
    });

    socket.on("disconnect", () => {
      for (const transport of participant.transports.values()) {
        transport.close();
      }
      room.removeParticipant(user.id);
      room.broadcastParticipantLeft(user.id, role);
      console.log(`${role} ${user.id} disconnected from room ${room.meetId}`);
    });

    // Emit ready signal to unblock client connection promise
    socket.emit("ready", { role });

    return room;
  } catch (err) {
    console.error("Error in handleConnection:", err);
    throw err;
  }
}
