// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  encodeWav,
  mergeFloat32Chunks,
  resamplePcm,
} from "@/lib/audio/wav";

describe("WAV encoder", () => {
  it("merges and resamples PCM to 16 kHz", () => {
    const merged = mergeFloat32Chunks([
      new Float32Array([0, 0.25]),
      new Float32Array([-0.25, 1]),
    ]);
    expect([...merged]).toEqual([0, 0.25, -0.25, 1]);
    expect(resamplePcm(new Float32Array(48_000), 48_000)).toHaveLength(16_000);
  });

  it("writes a mono 16-bit PCM RIFF header", async () => {
    const blob = encodeWav(new Float32Array(16_000), 16_000);
    const view = new DataView(await blob.arrayBuffer());
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(
        ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
      );

    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 16_000 * 2);
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
  });
});
