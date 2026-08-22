import type{RTPPacket,RTPFrame} from './types.ts';
export function applyFade(frame: Buffer, fadeIn: boolean): Buffer {
  const samples = frame.length / 4; // stereo 16-bit
  const fadeLength = Math.min(samples, 240); // ~5ms at 48kHz

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

export class JitterBuffer {
  private expectedSeq: number | null = null;
  private packets = new Map<number, RTPFrame>();
  private firstSeenAt = new Map<number, number>();
  private readonly MAX_WAIT_MS = 100; // don't stall longer than this for one packet

  add(frame: RTPFrame) {
    this.packets.set(frame.sequenceNumber, frame);
    this.firstSeenAt.set(frame.sequenceNumber, Date.now());
    if (this.expectedSeq === null) {
      this.expectedSeq = frame.sequenceNumber;
    }
  }
    reset() {
    this.expectedSeq = null;
    this.packets.clear();
  }

  popReady(): RTPFrame[] {
    const ready: RTPFrame[] = [];
    if (this.expectedSeq === null) return [];

    while (true) {
      if (this.packets.has(this.expectedSeq)) {
        const frame = this.packets.get(this.expectedSeq)!;
        ready.push(frame);
        this.packets.delete(this.expectedSeq);
        this.firstSeenAt.delete(this.expectedSeq);
        this.expectedSeq++;
        continue;
      }

      // expected packet missing — check if we've been stuck too long
      const oldestBufferedSeq = Math.min(...this.packets.keys());
      if (!isFinite(oldestBufferedSeq)) break; // nothing buffered at all, just wait

      const oldestArrival = [...this.firstSeenAt.values()].reduce((a, b) => Math.min(a, b), Infinity);
      if (Date.now() - oldestArrival > this.MAX_WAIT_MS) {
        console.warn(`JitterBuffer: skipping missing seq ${this.expectedSeq} -> ${oldestBufferedSeq}`);
        this.expectedSeq = oldestBufferedSeq; // give up on the lost packet, jump ahead
        continue;
      }
      break;
    }

    return ready;
  }
}

export function stereoToMono(pcm: Buffer): Buffer {
  const samples = pcm.length / 4;
  const mono = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i++) {
    const left = pcm.readInt16LE(i * 4);
    const right = pcm.readInt16LE(i * 4 + 2);
    const mixed = (left + right) / 2;
    mono.writeInt16LE(mixed, i * 2);
  }

  return mono;
}
export async function resampleAndStereo(pcm24kMono: Buffer,resampler:any): Promise<Buffer> {
  const inputArray = new Float32Array(pcm24kMono.length / 2);
  for (let i = 0; i < inputArray.length; i++) {
    inputArray[i] = pcm24kMono.readInt16LE(i * 2) / 32768;
  }

  const outputArray = await resampler.simple(inputArray); // resamples 24k mono -> 48k mono

  const stereoBuffer = Buffer.alloc(outputArray.length * 4);
  for (let i = 0; i < outputArray.length; i++) {
    const sample = Math.max(-32768, Math.min(32767, Math.round(outputArray[i] * 32768)));
    stereoBuffer.writeInt16LE(sample, i * 4);
    stereoBuffer.writeInt16LE(sample, i * 4 + 2);
  }

  return stereoBuffer;
}
export function parseRTPPacket(packet: Buffer): RTPPacket {
  if (packet.length < 12) {
    throw new Error("Invalid RTP packet");
  }

  const firstByte = packet.readUInt8(0);
  const version = firstByte >> 6;
  const hasExtension = (firstByte & 0x10) !== 0;
  const csrcCount = firstByte & 0x0f;

  const payloadType = packet.readUInt8(1) & 0x7f;
  const sequenceNumber = packet.readUInt16BE(2);
  const timestamp = packet.readUInt32BE(4);
  const ssrc = packet.readUInt32BE(8);

  let offset = 12 + csrcCount * 4;

  if (hasExtension) {
    const extHeaderLength = packet.readUInt16BE(offset + 2);
    offset += 4 + extHeaderLength * 4;
  }

  const payload = packet.subarray(offset);

  return { version, payloadType, sequenceNumber, timestamp, ssrc, payload };
}

export function buildRTPPacket(payload: Buffer, seq: number, timestamp: number, ssrc: number, payloadType: number): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt8(0x80, 0);
  header.writeUInt8(payloadType & 0x7f, 1);
  header.writeUInt16BE(seq & 0xffff, 2);
  header.writeUInt32BE(timestamp >>> 0, 4);
  header.writeUInt32BE(ssrc >>> 0, 8);
  return Buffer.concat([header, payload]);
}

export async function initResampler(
    create: any,
    ConverterType: any
) {
    return await create(1, 24000, 48000, {
        converterType: ConverterType.SRC_LINEAR
    });
}

export function isRTCP(buffer: Buffer): boolean {
  if (buffer.length < 2) return true;
  const payloadType = buffer.readUInt8(1) & 0x7f;
  return payloadType >= 200 && payloadType <= 204;
}

export function getRMS(pcm: Buffer): number {
  let sum = 0;

  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i);
    sum += sample * sample;
  }

  return Math.sqrt(sum / (pcm.length / 2));
}