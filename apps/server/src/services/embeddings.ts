/**
 * Voyage AI embedding service for semantic transcript search.
 *
 * Uses voyage-3-lite (256-dim) — cheap, fast, well-suited for
 * sentence-level semantic similarity.
 *
 * Storage strategy: pack Float32Array → Buffer blobs. SQLite has no
 * native vector ops, so cosine similarity is done in JS at query
 * time. Fine for <10k chunks; swap for sqlite-vss if/when it grows.
 */

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-lite';

/** Treat the scaffold placeholder as "no key" so we don't hit the API with junk. */
export function isPlaceholderVoyageKey(key: string | undefined | null): boolean {
  if (!key) return true;
  return key.startsWith('your-voyage');
}

interface VoyageResponse {
  data?: Array<{ embedding: number[] }>;
}

/**
 * Batch-embed texts. Returns null on any failure (network, auth, placeholder)
 * so callers can no-op rather than crash. Never throws.
 */
export async function embed(texts: string[], apiKey: string): Promise<number[][] | null> {
  if (isPlaceholderVoyageKey(apiKey)) return null;
  if (texts.length === 0) return [];
  try {
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
    });
    if (!res.ok) {
      console.error('[SIGNAL] Voyage embed failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as VoyageResponse;
    const data = json.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      console.error('[SIGNAL] Voyage returned unexpected shape');
      return null;
    }
    return data.map(d => d.embedding);
  } catch (err) {
    console.error('[SIGNAL] Voyage embed error:', err);
    return null;
  }
}

/** Cosine similarity — assumes equal-length vectors. Returns 0 if degenerate. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Pack a number[] as a Float32Array-backed Buffer for BLOB storage. */
export function packFloat32(vec: number[]): Buffer {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/** Unpack a Buffer BLOB back into number[]. Copies so the result is independent. */
export function unpackFloat32(buf: Buffer): number[] {
  // Buffer may share an underlying ArrayBuffer with other data → align via byteOffset/length.
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(f32);
}

// ── Chunking ──────────────────────────────────────────────────────────
// Group consecutive same-speaker transcript lines into ~200-word chunks
// so embeddings capture coherent utterances. When one speaker talks for a
// long stretch we split into multiple chunks but never across speakers.

export interface TranscriptChunk {
  index: number;
  speaker: string;
  text: string;
}

interface LineLike { speaker: string; text: string }

const TARGET_WORDS = 200;

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function chunkTranscript(lines: LineLike[]): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let curSpeaker: string | null = null;
  let curText: string[] = [];
  let curWords = 0;

  const flush = (): void => {
    if (curSpeaker && curText.length > 0) {
      chunks.push({
        index: chunks.length,
        speaker: curSpeaker,
        text: curText.join(' ').trim(),
      });
    }
    curText = [];
    curWords = 0;
  };

  for (const line of lines) {
    const clean = line.text.trim();
    if (!clean) continue;
    if (line.speaker !== curSpeaker) {
      flush();
      curSpeaker = line.speaker;
    }
    const w = countWords(clean);
    // If adding this line would overflow AND we already have content, flush first.
    // This keeps chunks close to ~TARGET_WORDS without splitting individual utterances.
    if (curWords > 0 && curWords + w > TARGET_WORDS) {
      flush();
      curSpeaker = line.speaker;
    }
    curText.push(clean);
    curWords += w;
  }
  flush();
  return chunks;
}
