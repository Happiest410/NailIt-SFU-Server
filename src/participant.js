import { Server, Socket } from "socket.io";
import { User } from "./user.ts";
import type { types } from "mediasoup";
export abstract class Participant {
    constructor(
        public readonly user: User,
        public readonly socket: Socket
    ) {}

    abstract get role(): string;

    producers = new Map<string, types.Producer>();
    consumers = new Map<string, types.Consumer>();

    transports = new Map<string, types.WebRtcTransport>();

}