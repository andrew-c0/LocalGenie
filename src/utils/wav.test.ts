import { describe, expect, it } from "vitest";
import { concatSamples, encodeResampledWav, encodeWav, resampleLinear } from "./wav";

function readAscii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));
}

describe("encodeWav", () => {
  it("writes a RIFF header for 16-bit mono PCM at the given rate", () => {
    const bytes = encodeWav(new Float32Array(4), 16000);
    const view = new DataView(bytes.buffer);

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000); // bytes per second
    expect(view.getUint16(32, true)).toBe(2); // bytes per frame
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8);
  });

  it("is 44 header bytes plus two bytes per sample", () => {
    expect(encodeWav(new Float32Array(10), 16000).byteLength).toBe(44 + 20);
    expect(encodeWav(new Float32Array(0), 16000).byteLength).toBe(44);
  });

  it("scales samples to 16-bit values, with the full negative range", () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const view = new DataView(bytes.buffer);
    const sample = (i: number) => view.getInt16(44 + i * 2, true);

    expect(sample(0)).toBe(0);
    expect(sample(1)).toBe(32767);
    expect(sample(2)).toBe(-32768);
    expect(sample(3)).toBe(Math.round(0.5 * 0x7fff));
  });

  it("clamps samples outside -1 to 1", () => {
    const bytes = encodeWav(new Float32Array([3, -3]), 16000);
    const view = new DataView(bytes.buffer);

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});

describe("resampleLinear", () => {
  it("returns the samples unchanged when the rates match", () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    expect(resampleLinear(samples, 16000, 16000)).toBe(samples);
  });

  it("gives one output sample per step of the rate ratio", () => {
    // 48 kHz to 16 kHz: every third sample is kept.
    const samples = new Float32Array(4800);
    expect(resampleLinear(samples, 48000, 16000)).toHaveLength(1600);
  });

  it("interpolates between neighbouring samples", () => {
    // 2 samples to 4 samples: the halfway points fall between the input values.
    const out = resampleLinear(new Float32Array([0, 1]), 1, 2);
    expect(Array.from(out)).toEqual([0, 0.5, 1, 1]);
  });

  it("returns an empty buffer for no samples", () => {
    expect(resampleLinear(new Float32Array(0), 48000, 16000)).toHaveLength(0);
  });
});

describe("encodeResampledWav", () => {
  it("writes the file at the target rate with the resampled length", () => {
    const bytes = encodeResampledWav(new Float32Array(4800), 48000, 16000);
    const view = new DataView(bytes.buffer);

    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(1600 * 2);
  });
});

describe("concatSamples", () => {
  it("joins chunks in order", () => {
    const joined = concatSamples([
      new Float32Array([1, 2]),
      new Float32Array([3]),
      new Float32Array(0),
    ]);
    expect(Array.from(joined)).toEqual([1, 2, 3]);
  });

  it("is empty for no chunks", () => {
    expect(concatSamples([])).toHaveLength(0);
  });
});
