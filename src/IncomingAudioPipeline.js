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
    ){}

    public async startPipeline(port: number) {
      // Audio pipeline start
    }
}
