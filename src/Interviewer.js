import { Participant } from "./participant.ts";
import { User } from "./user.ts";
import { Socket } from "socket.io";
import type { types } from "mediasoup";
export class Interviewer extends Participant {
    get role() { return "Interviewer" as const; }
}