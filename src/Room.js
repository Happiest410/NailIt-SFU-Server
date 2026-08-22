import { Participant } from "./participant.ts";
import { Interview } from "./interview.ts";
import { AIInterviewer } from "./AiInterviewer.ts";
import type { types } from "mediasoup";
const ANNOUNCED_IP = process.env.PUBLIC_IP || "127.0.0.1";

export interface SerializedParticipant {
    id: string;
    name: string;
    role: string;
    producerIds: {
        audio?: string;
    };
}

interface createProducerParam{
    transportId:string,
    kind:types.MediaKind,
    rtpParameters:types.RtpParameters,
    appData:types.AppData
}
interface createConsumerParams{
   producerId:string,
   transport:types.Transport
}
export class Room{
    public readonly meetId:string
    public readonly participants: Map<string, Participant> = new Map();
    // private reaon
    public router: types.Router;
    public interview?: Interview;

    constructor(meetID:string,router:types.Router){
       this.meetId=meetID
       this.router=router
    }

    addParticipant(participant:Participant){
    this.participants.set(participant.user.id,participant)
    }

    removeParticipant(userId: string) {
        this.participants.delete(userId);
    }

    getParticipantBySocket(socketId: string): Participant | undefined {
        for (const participant of this.participants.values()) {
            if (participant.socket.id === socketId) {
                return participant;
            }
        }
        return undefined;
    }

    private serializeParticipant(participant: Participant): SerializedParticipant {
        const audioProducer = [...participant.producers.values()].find(
            (p) => p.kind === "audio"
        );
        return {
            id: participant.user.id,
            name: participant.user.username,
            role: participant.role,
            producerIds: {
                audio: audioProducer?.id,
            },
        };
    }

    private getAIVirtualParticipant(): SerializedParticipant | null {
        if (!this.interview) return null;
        const aiProducerId = this.interview.AiIntevriewer.mediaBridge.outputProducer?.id;
        if (!aiProducerId) return null;
        return {
            id: "ai",
            name: "AI Interviewer",
            role: "ai",
            producerIds: {
                audio: aiProducerId,
            },
        };
    }

    getVisibleParticipants(forRole: string): SerializedParticipant[] {
        const result: SerializedParticipant[] = [];

        for (const participant of this.participants.values()) {
            // Candidates should NOT see Interviewers
            if (forRole === "Candidate" && participant.role === "Interviewer") {
                continue;
            }
            result.push(this.serializeParticipant(participant));
        }

        // Add the AI virtual participant if an interview is running
        const ai = this.getAIVirtualParticipant();
        if (ai) {
            result.push(ai);
        }

        return result;
    }

    /**
     * Broadcasts a participantJoined event respecting visibility rules:
     * - If a candidate joins → only notify interviewers
     * - If an interviewer joins → don't notify anyone (hidden)
     * - If AI joins → notify everyone (candidates + interviewers)
     */
    broadcastParticipantJoined(participant: SerializedParticipant) {
        for (const p of this.participants.values()) {
            // Don't notify the joining participant about themselves
            if (p.user.id === participant.id) continue;

            if (participant.role === "Interviewer") {
                // Interviewers are hidden — don't broadcast to anyone
                continue;
            }

            if (participant.role === "Candidate" && p.role === "Candidate") {
                // Candidates don't need to know about other candidates joining
                // (in this 1:1 interview model)
                continue;
            }

            // AI participant or candidate joining → notify interviewers
            // AI participant joining → also notify candidates
            if (participant.role === "ai" || p.role === "Interviewer") {
                p.socket.emit("participantJoined", participant);
            }
        }
    }

    broadcastParticipantLeft(participantId: string, participantRole: string) {
        for (const p of this.participants.values()) {
            if (p.user.id === participantId) continue;

            // If an interviewer left, candidates shouldn't know
            if (participantRole === "Interviewer" && p.role === "Candidate") {
                continue;
            }

            p.socket.emit("participantLeft", { id: participantId });
        }
    }
    
    async createWebRtcTransport(participant:Participant){
        const transport = await this.router.createWebRtcTransport({
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

  participant.transports.set(transport.id,transport)

  return transport
  
    }
    async createProducer(participant:Participant,params:createProducerParam){
        const transport = participant.transports.get(params.transportId);
        if (!transport) {
    throw new Error("Transport not found");
    }
        const producer = await transport.produce({ kind:params.kind, rtpParameters:params.rtpParameters, appData:params.appData });
        participant.producers.set(producer.id,producer)

        return producer
    }
    async createConsumer(participant:Participant,params:createConsumerParams){
         const transport = params.transport
           if (!transport) {
    throw new Error("Transport not found");
    }
    const consumer = await transport.consume({
        producerId: params.producerId,
        rtpCapabilities: this.router.rtpCapabilities
      });

         participant.consumers.set(consumer.id,consumer)

         return consumer

    }

    async createPlainTransport() {
        return await this.router.createPlainTransport(
            {
      listenInfo: { protocol: "udp", ip: "127.0.0.1" },
      rtcpMux: true,
      comedia: false
    }
  
        );
    }
}