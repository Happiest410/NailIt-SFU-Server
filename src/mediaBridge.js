import type { types } from "mediasoup";
import dgram from "dgram";

import { AI_SSRC } from "./lib/config.ts";
import { AI_PAYLOAD_TYPE } from "./lib/config.ts";
import { MIN_BUFFER_FRAMES } from "./lib/config.ts";

export class MediaBridge {
    public inputTransport: types.PlainTransport;
    private outputTransport: types.PlainTransport;
    private AIinputConsumer: types.Consumer;
    private resampler: any;

    public interruptGeneration = false;
    private lastSendTime: number | null = null;
    private aiTimestamp = 0;
    public candidateAudioPayloadType?: number;

    private aiSeq = 0;
    public aiSpeaking = false;
    private turnStartTime: number | null = null;
    private aiQueueTimer: NodeJS.Timeout | null = null;
    private opusEncoderAI: any;

    private leftoverPCM = Buffer.alloc(0);
    private aiAudioQueue: Buffer[] = [];
    private processingChain: Promise<void> = Promise.resolve();

    private isPlaying = false;
    private justResumed = false;
    private totalBytesSentThisTurn = 0;

    public outputProducer: types.Producer;
    private readonly rtpSendSocket: dgram.Socket;

    constructor(
        resampler: any,
        opusEncoderAI: any,
        rtpSendSocket: dgram.Socket,      
        aiInputTransport: types.PlainTransport,
        aiOutputTransport: types.PlainTransport,
        outputProducer: types.Producer,
        InputConsumer: types.Consumer
    ) {
        this.resampler = resampler;
        this.opusEncoderAI = opusEncoderAI;
        this.rtpSendSocket = rtpSendSocket;
        this.inputTransport = aiInputTransport;
        this.outputTransport = aiOutputTransport;
        this.outputProducer = outputProducer;
        this.AIinputConsumer = InputConsumer;
    }

    setCandidateAudioPayloadType(payloadType: number) {
        this.candidateAudioPayloadType = payloadType;
    }

    async resampleAndStereo(pcm24kMono: Buffer, resampler: any): Promise<Buffer> {
        const inputArray = new Float32Array(pcm24kMono.length / 2);
        for (let i = 0; i < inputArray.length; i++) {
            inputArray[i] = pcm24kMono.readInt16LE(i * 2) / 32768;
        }

        const outputArray = await resampler.simple(inputArray);

        const stereoBuffer = Buffer.alloc(outputArray.length * 4);
        for (let i = 0; i < outputArray.length; i++) {
            const sample = Math.max(-32768, Math.min(32767, Math.round(outputArray[i] * 32768)));
            stereoBuffer.writeInt16LE(sample, i * 4);
            stereoBuffer.writeInt16LE(sample, i * 4 + 2);
        }

        return stereoBuffer;
    }

    interruptAI() {
        this.aiAudioQueue.length = 0;
        this.leftoverPCM = Buffer.alloc(0);
        this.isPlaying = false;
        this.lastSendTime = null;
        this.totalBytesSentThisTurn = 0;
        this.turnStartTime = null;
        this.aiSpeaking = false;
        this.interruptGeneration = true;
        this.aiAudioQueue.splice(0);
        console.log("INTERRUPT FIRED", Date.now());
    }

    applyFade(frame: Buffer, fadeIn: boolean): Buffer {
        const samples = frame.length / 4;
        const fadeLength = Math.min(samples, 240);

        for (let i = 0; i < fadeLength; i++) {
            const factor = fadeIn ? (i / fadeLength) : (1 - i / fadeLength);
            const idx = fadeIn ? i : samples - 1 - i;

            const left = frame.readInt16LE(idx * 4);
            const right = frame.readInt16LE(idx * 4 + 2);

            frame.writeInt16LE(Math.round(left * factor), idx * 4);
            frame.writeInt16LE(Math.round(right * factor), idx * 4 + 2);
        }

        return frame;
    }

    buildRTPPacket(payload: Buffer, seq: number, timestamp: number, ssrc: number, payloadType: number): Buffer {
        const header = Buffer.alloc(12);
        header.writeUInt8(0x80, 0);
        header.writeUInt8(payloadType & 0x7f, 1);
        header.writeUInt16BE(seq & 0xffff, 2);
        header.writeUInt32BE(timestamp >>> 0, 4);
        header.writeUInt32BE(ssrc >>> 0, 8);
        return Buffer.concat([header, payload]);
    }

    enqueueGeminiAudioChunk(pcm24kMono: Buffer): Promise<void> {
        this.processingChain = this.processingChain.then(async () => {
            const pcm48kStereo = await this.resampleAndStereo(pcm24kMono, this.resampler);
            this.aiSpeaking = true;

            const combined = Buffer.concat([this.leftoverPCM, pcm48kStereo]);
            const FRAME_BYTES = 3840;

            let offset = 0;
            for (; offset + FRAME_BYTES <= combined.length; offset += FRAME_BYTES) {
                this.aiAudioQueue.push(combined.subarray(offset, offset + FRAME_BYTES));
            }
            this.leftoverPCM = combined.subarray(offset);

            const MAX_QUEUE_FRAMES = 1000;
            if (this.aiAudioQueue.length > MAX_QUEUE_FRAMES) {
                this.aiAudioQueue.splice(0, this.aiAudioQueue.length - MAX_QUEUE_FRAMES);
            }

            if (!this.isPlaying && this.aiAudioQueue.length >= MIN_BUFFER_FRAMES) {
                this.isPlaying = true;
                this.justResumed = true;
            }

            if (!this.aiQueueTimer) {
                this.aiQueueTimer = setInterval(() => {
                    if (!this.isPlaying) return;
                    if (this.interruptGeneration) {
                        this.aiAudioQueue.length = 0;
                        return;
                    }
                    let frame = this.aiAudioQueue.shift();
                    if (!frame) {
                        this.isPlaying = false;
                        this.lastSendTime = null;
                        this.aiSpeaking = false;
                        return;
                    }
                    if (this.justResumed) {
                        frame = this.applyFade(frame, true);
                        this.justResumed = false;
                    }
                    if (this.aiAudioQueue.length === 0) {
                        frame = this.applyFade(frame, false);
                    }

                    try {
                        const opusFrame = this.opusEncoderAI.encode(frame);
                        const rtpPacket = this.buildRTPPacket(opusFrame, this.aiSeq++, this.aiTimestamp, AI_SSRC, AI_PAYLOAD_TYPE);
                        this.aiTimestamp += 960;

                        this.rtpSendSocket.send(
                            rtpPacket,
                            this.outputTransport.tuple.localPort,
                            "127.0.0.1"
                        );
                    } catch (err) {
                        console.error("Opus encode error (AI output):", err);
                    }
                }, 20);
            }
        }).catch(err => {
            console.error("enqueueGeminiAudioChunk processing error:", err);
        });

        return this.processingChain;
    }
}
