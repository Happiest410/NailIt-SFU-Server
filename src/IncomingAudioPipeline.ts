import { JitterBuffer } from "./AudioProcessing.ts";
import dgram from "dgram";
import { MediaBridge } from "./mediaBridge.ts";
import { createOpusEncoder } from "./opusEncoder.ts";
import { parseRTPPacket } from "./AudioProcessing.ts";
import { isRTCP } from "./AudioProcessing.ts";
import { getRMS } from "./AudioProcessing.ts";
import { INTERRUPT_COOLDOWN_MS } from "./lib/config.ts";
import { stereoToMono } from "./AudioProcessing.ts";
import { AIProvider } from "./AIProvider.ts";
import type { AIInterviewer } from "./AiInterviewer.ts";

export class IncomingAudioPipeline {
    private udpServer = dgram.createSocket("udp4");
    
    private jitterBuffer: JitterBuffer = new JitterBuffer();
    private audioBuffer = Buffer.alloc(0);
    public lastInterruptAt = 0;
    private currentSSRC: number | null = null;
    private opusDecoder = createOpusEncoder(48000, 2);

    constructor(
        private mediaBridge: MediaBridge,
        private aiInterviewer: AIInterviewer,
    ) {
        this.udpServer.on("message", async (msg) => {
            console.log("Received RTP packet:", msg.length);
            await this.handleIncomingPacket(msg);
        });
        this.udpServer.on("error", (err) => {
            console.error("UDP server error:", err);
        });
    }

    start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.udpServer.once("error", reject);

            this.udpServer.bind(0, () => {
                const address = this.udpServer.address();

                if (typeof address === "string") {
                    reject(new Error("Unexpected UNIX socket"));
                    return;
                }

                console.log("Listening on UDP port:", address.port);
                resolve(address.port);
            });
        });
    }

    async handleIncomingPacket(msg: any) {
        if (isRTCP(msg)) return;
        
        try {
            const rtp = parseRTPPacket(msg);
        
            if (this.currentSSRC === null) {
                this.currentSSRC = rtp.ssrc;
                console.log("Locked onto SSRC:", this.currentSSRC);
            }
        
            if (rtp.ssrc !== this.currentSSRC) {
                return;
            }
            this.currentSSRC = rtp.ssrc;
        
            this.jitterBuffer.add({
                sequenceNumber: rtp.sequenceNumber,
                timestamp: rtp.timestamp,
                payload: rtp.payload
            });
        
            const frames = this.jitterBuffer.popReady();
            console.log("Ready frames:", frames.length);
        
            for (const frame of frames) {
                try {
                    const pcm = this.opusDecoder.decode(frame.payload);
                    console.log("Decoding frame");
                    const rms = getRMS(pcm);
                    console.log("PCM length:", pcm.length);
        
                    if (this.mediaBridge.aiSpeaking && rms > 1000) {
                        const now = Date.now();
                        if (now - this.lastInterruptAt > INTERRUPT_COOLDOWN_MS) {
                            this.lastInterruptAt = now;
                            this.mediaBridge.interruptAI();
                        }
                    }
        
                    const mono = stereoToMono(pcm);
                    console.log("Mono length:", mono.length);
                    this.audioBuffer = Buffer.concat([this.audioBuffer, mono]);
        
                    if (this.audioBuffer.length >= 4800) {
                        if (this.aiInterviewer) {
                            console.log("Sending", this.audioBuffer.length, "bytes to Gemini");
                            const start = Date.now();
                            await this.aiInterviewer.sendAudio(this.audioBuffer);
                            console.log("sendAudio elapsed ms:", Date.now() - start);
                        } else {
                            console.warn("No active room/geminiSession found, dropping audio chunk");
                        }
                        this.audioBuffer = Buffer.alloc(0);
                    }
                } catch (err) {
                    console.error("Opus decode error:", err);
                }
            }
        } catch (err) {
            console.error("RTP parse error:", err);
        }
    }
}
