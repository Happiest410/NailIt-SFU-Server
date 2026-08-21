import { Room } from "./Room.ts";
import type { types } from "mediasoup";
import { MediaBridge } from "./mediaBridge.ts";

export class Manager{
    private rooms = new Map<string, Room>();
    private ssrcRegistry = new Map<number, MediaBridge>();
    registerSSRC(ssrc: number, bridge: MediaBridge) {
        this.ssrcRegistry.set(ssrc, bridge);
    }

    getBridge(ssrc: number) {
        return this.ssrcRegistry.get(ssrc);
    }
    unregisterSSRC(ssrc: number) {
        this.ssrcRegistry.delete(ssrc);
    }
    
     createRoom(meetingId: string,router:types.Router): Room {
        const room = new Room(meetingId,router);
        this.rooms.set(meetingId, room);
        return room;
    }

    getRoom(meetingId: string): Room | undefined {
        return this.rooms.get(meetingId);
    }

    removeRoom(meetingId: string) {
        this.rooms.delete(meetingId);
    }


}