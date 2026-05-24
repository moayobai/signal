import type { CallFramework, CallScorecard, CallType, TranscriptLine } from '@signal/types';
import type { AIProvider } from './ai.js';

export interface GenerateScorecardOpts {
  ai: AIProvider;
  model: string;
  framework: CallFramework;
  callType: CallType;
  transcript: TranscriptLine[];
}

interface DimensionDef {
  key: string;
  label: string;
  description: string;
  weight: number;
}

// MEDDIC gives economicBuyer/champion more weight — these are the two
// highest-leverage signals for enterprise deal survival.
const MEDDIC_DIMS: DimensionDef[] = [
  {
    key: 'metrics',
    label: 'Metrics',
    description: 'Quantified business impact the buyer expects',
    weight: 1,
  },
  {
    key: 'economicBuyer',
    label: 'Economic Buyer',
    description: 'The person with signing authority is identified',
    weight: 1.5,
  },
  {
    key: 'decisionCriteria',
    label: 'Decision Criteria',
    description: 'Clear criteria the buyer will use to choose a vendor',
    weight: 1,
  },
  {
    key: 'decisionProcess',
    label: 'Decision Process',
    description: 'Steps, stakeholders, and timeline are mapped',
    weight: 1,
  },
  {
    key: 'identifyPain',
    label: 'Identify Pain',
    description: 'Specific pain is articulated by the buyer',
    weight: 1,
  },
  {
    key: 'champion',
    label: 'Champion',
    description: 'An internal advocate is confirmed',
    weight: 1.5,
  },
];

const SPICED_DIMS: DimensionDef[] = [
  {
    key: 'situation',
    label: 'Situation',
    description: "Current state of the buyer's environment",
    weight: 1,
  },
  {
    key: 'pain',
    label: 'Pain',
    description: 'Explicit problem the buyer wants to solve',
    weight: 1,
  },
  {
    key: 'impact',
    label: 'Impact',
    description: 'Quantified cost of the pain or upside of solving it',
    weight: 1,
  },
  {
    key: 'criticalEvent',
    label: 'Critical Event',
    description: 'Deadline or trigger that forces a decision',
    weight: 1,
  },
  {
    key: 'decision',
    label: 'Decision',
    description: 'Decision process and criteria are clear',
    weight: 1,
  },
];

const BANT_DIMS: DimensionDef[] = [
  { key: 'budget', label: 'Budget', description: 'Budget is identified or discussed', weight: 1 },
  {
    key: 'authority',
    label: 'Authority',
    description: 'Decision-making authority is clarified',
    weight: 1,
  },
  { key: 'need', label: 'Need', description: 'The buyer has a clear need', weight: 1 },
  {
    key: 'timeline',
    label: 'Timeline',
    description: 'A purchase timeline is established',
    weight: 1,
  },
];

function dimsFor(framework: CallFramework): DimensionDef[] {
  if (framework === 'MEDDIC') return MEDDIC_DIMS;
  if (framework === 'SPICED') return SPICED_DIMS;
  return BANT_DIMS;
}

function buildSystemPrompt(framework: CallFramework): string {
  const dims = dimsFor(framework);
  const dimDescriptions = dims.map(d => `  - ${d.key} (${d.label}): ${d.description}`).join('\n');
  const dimKeys = dims.map(d => `"${d.key}"`).join(', ');

  return `You are SIGNAL's sales methodology coach. Grade this call against the ${framework} framework.

Dimensions (score each 0–10 based on evidence in the transcript):
${dimDescriptions}

Score interpretation:
  0–2  = absent / no evidence
  3–5  = weak / partial
  6–8  = solid / discussed meaningfully
  9–10 = strong / explicit confirmation

Return ONLY valid JSON matching this exact shape — no markdown, no prose:
{
  "framework": "${framework}",
  "dimensions": [
    { "key": <one of ${dimKeys}>, "label": string, "score": number (0-10), "justification": string (1-2 sentences, cite transcript evidence) }
  ],
  "nextSteps": string[]  // 2-4 concrete next actions the rep should take
}

Rules:
- Include EVERY dimension listed above, in the order given.
- justification must reference what actually happened in the call (≤ 200 chars).
- nextSteps are imperative, concrete actions (e.g. "Confirm CFO as economic buyer in next call").
- Do NOT include overallScore — the server computes it.`;
}

function buildUserPrompt(callType: CallType, transcript: TranscriptLine[]): string {
  const lines = transcript.map(l => `[${l.speaker.toUpperCase()}] ${l.text}`).join('\n');
  return `Call type: ${callType}\n\nTranscript:\n${lines}\n\nReturn the scorecard JSON now.`;
}

interface ParsedScorecardShape {
  framework: CallFramework;
  dimensions: Array<{ key: string; label: string; score: number; justification: string }>;
  nextSteps: string[];
}

function parseScorecard(text: string, framework: CallFramework): ParsedScorecardShape | null {
  try {
    const obj = JSON.parse(text) as Partial<ParsedScorecardShape>;
    if (
      obj.framework !== framework ||
      !Array.isArray(obj.dimensions) ||
      !Array.isArray(obj.nextSteps)
    )
      return null;

    const validDims: Array<{ key: string; label: string; score: number; justification: string }> =
      [];
    for (const d of obj.dimensions) {
      if (
        !d ||
        typeof d !== 'object' ||
        typeof d.key !== 'string' ||
        typeof d.label !== 'string' ||
        typeof d.score !== 'number' ||
        typeof d.justification !== 'string'
      )
        return null;
      const clamped = Math.max(0, Math.min(10, d.score));
      validDims.push({
        key: d.key,
        label: d.label,
        score: clamped,
        justification: d.justification,
      });
    }
    if (validDims.length === 0) return null;

    const nextSteps = obj.nextSteps.filter((s): s is string => typeof s === 'string');
    return { framework, dimensions: validDims, nextSteps };
  } catch {
    return null;
  }
}

function computeOverall(
  framework: CallFramework,
  dims: Array<{ key: string; score: number }>,
): number {
  const defs = dimsFor(framework);
  const weightMap = new Map(defs.map(d => [d.key, d.weight]));
  let weightedSum = 0;
  let totalWeight = 0;
  for (const d of dims) {
    const w = weightMap.get(d.key) ?? 1;
    weightedSum += d.score * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  // Normalize: score is 0-10, output 0-100.
  return Math.round((weightedSum / totalWeight) * 10);
}

export async function generateScorecard(
  opts: GenerateScorecardOpts,
): Promise<CallScorecard | null> {
  try {
    const text = await opts.ai.complete({
      model: opts.model,
      systemPrompt: buildSystemPrompt(opts.framework),
      userPrompt: buildUserPrompt(opts.callType, opts.transcript),
      maxTokens: 900,
      cache: false,
    });
    if (!text) return null;
    const parsed = parseScorecard(text, opts.framework);
    if (!parsed) {
      console.error('[SIGNAL] scorecard parse failed');
      return null;
    }
    const overallScore = computeOverall(opts.framework, parsed.dimensions);
    return {
      framework: parsed.framework,
      overallScore,
      dimensions: parsed.dimensions,
      nextSteps: parsed.nextSteps,
    };
  } catch (err) {
    console.error('[SIGNAL] generateScorecard failed:', err);
    return null;
  }
}
