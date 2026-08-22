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

export async function handleConnection(socket:Socket,manager:Manager,workerManager:WorkerManager):Promise<Room>{


  //check wether user authorized to make the connection
  try{
     let roomId=socket.handshake.query.roomId

      if (Array.isArray(roomId)) {
      roomId = roomId[0];
    }

     if(!roomId || roomId==undefined){
        socket.disconnect();
        throw new Error("Missing roomId");
     }
     console.log("Room ID from socket:", roomId);

     let meet: any = await prisma.meet.findUnique({ where: { room: roomId } });

     if (!meet) {
       const schedule = await prisma.schedule.findUnique({ where: { meetRoom: roomId } });
       if (schedule) {
         meet = { id: schedule.id, room: schedule.meetRoom };
       }
     }

     if (!meet) {
       // Fallback for dynamic/standalone rooms
       meet = { id: 0, room: roomId };
     }

     console.log("Meet verified:", meet);
     const role = socket.data.user?.role || "Candidate";

if (!(role in ParticipantRegistry)) {
    socket.disconnect(true);
    throw new Error("Invalid participant role");
}



const ParticipantClass =
    ParticipantRegistry[
        role as keyof typeof ParticipantRegistry
    ];

if (!ParticipantClass) {
    socket.disconnect();
    throw new Error("no participant class found");
}
const user=new User(socket.data.user.id,socket.data.user.username)
const participant = new ParticipantClass(user,socket);

// Reuse existing room if it exists, otherwise create a new one
let room = manager.getRoom(roomId);
if (!room) {
  const router = await workerManager.getWorker().createRouter({ mediaCodecs });
  room = manager.createRoom(roomId, router);
}

socket.join(room.meetId)
room.addParticipant(participant)

console.log("Connection handled for", socket.data.user.username, "role:", role)

return room



  }
  catch (err) {
    console.error(err);
    throw err;
}
}