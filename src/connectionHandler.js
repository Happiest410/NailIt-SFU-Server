import { Socket } from "socket.io";
import prisma from "./prisma.ts";
import { ParticipantRegistry } from "./ParticipantRegistry.ts";
import { WorkerManager } from "./workerManager.ts";
import { Manager } from "./Manager.ts";
import type { types } from "mediasoup";

import { Room } from "./Room.ts";
import { User } from "./user.ts";

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

    // Emit ready signal to unblock client connection promise
    socket.emit("ready", { role });

    return room;
  } catch (err) {
    console.error("Error in handleConnection:", err);
    throw err;
  }
}
