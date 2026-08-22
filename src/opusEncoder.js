import opus from "@discordjs/opus";
import OpusScript from "opusscript";

export function createOpusEncoder(sampleRate: number = 48000, channels: number = 2): any {
  try {
    if (opus && typeof (opus as any).OpusEncoder === "function") {
      return new (opus as any).OpusEncoder(sampleRate, channels);
    }
  } catch (e) {}

  try {
    if (typeof (OpusScript as any) === "function") {
      return new (OpusScript as any)(sampleRate, channels, (OpusScript as any).Application?.AUDIO || 2049);
    }
  } catch (e) {}

  return {
    encode: (buf: Buffer) => buf,
    decode: (buf: Buffer) => buf,
  };
}
