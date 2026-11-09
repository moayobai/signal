import { describe, it, expect } from 'vitest';
import { packFloat32, unpackFloat32, cosineSimilarity } from './embeddings.js';

describe('packFloat32 / unpackFloat32', () => {
  it('round-trips a vector', () => {
    const vec = [0.5, -1.25, 3];
    expect(unpackFloat32(packFloat32(vec))).toEqual(vec);
  });

  it('unpacks a Buffer whose byteOffset is not 4-byte aligned', () => {
    // Previously threw RangeError: start offset of Float32Array should be a multiple of 4
    const packed = packFloat32([1.5, -2, 0.25]);
    const backing = Buffer.alloc(packed.byteLength + 1);
    packed.copy(backing, 1);
    const unaligned = backing.subarray(1);
    expect(unaligned.byteOffset % 4).not.toBe(0);
    expect(unpackFloat32(unaligned)).toEqual([1.5, -2, 0.25]);
  });

  it('cosine similarity of identical vectors is 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
});
