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

describe("study WAV size limit", () => {
  it("accepts the longest recording a researcher can configure", async () => {
    const { MAX_STUDY_WAV_BYTES, wavByteLength } = await import("@/lib/audio/wav");
    const { MAX_RECORDING_SECONDS } = await import("@/lib/study/config");
    // The recorder stops within a second of the limit.
    expect(wavByteLength(MAX_RECORDING_SECONDS + 1)).toBeLessThanOrEqual(
      MAX_STUDY_WAV_BYTES,
    );
  });

  it("matches the size limit in the Storage rules", async () => {
    const { readFileSync } = await import("node:fs");
    const { MAX_STUDY_WAV_BYTES } = await import("@/lib/audio/wav");
    const rules = readFileSync("storage.rules", "utf8");
    const limit = rules.match(/request\.resource\.size <= ([\d\s*]+)/)?.[1];
    expect(limit).toBeDefined();
    const bytes = limit!
      .split("*")
      .reduce((product, factor) => product * Number(factor.trim()), 1);
    expect(bytes).toBe(MAX_STUDY_WAV_BYTES);
  });
});
