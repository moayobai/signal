import type { ReactNode } from 'react';
import type { BodyLangRead as BodyLangReadType } from '@signal/types';

interface BodyLangReadProps {
  data: BodyLangReadType;
}

type BadgeVariant = 'green' | 'cyan' | 'amber' | 'red' | 'neutral';

const engagementVariant: Record<BodyLangReadType['engagement'], BadgeVariant> = {
  strong: 'green',
  active: 'cyan',
  moderate: 'neutral',
  low: 'amber',
};

const energyVariant: Record<BodyLangReadType['energy'], BadgeVariant> = {
  high: 'green',
  rising: 'cyan',
  neutral: 'neutral',
  declining: 'amber',
};

const toneVariant: Record<BodyLangReadType['tone'], BadgeVariant> = {
  positive: 'green',
  curious: 'cyan',
  neutral: 'neutral',
  hesitant: 'amber',
  resistant: 'red',
};

const badgeStyles: Record<BadgeVariant, string> = {
  green: 'bg-[rgba(48,209,88,0.12)] text-[#1a8c3a]',
  cyan: 'bg-[rgba(50,200,230,0.12)] text-[#0077a8]',
  amber: 'bg-[rgba(255,159,10,0.12)] text-[#b06000]',
  red: 'bg-[rgba(255,69,58,0.12)] text-[#c0392b]',
  neutral: 'bg-black/[0.05] text-[--text-secondary]',
};

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeStyles[variant]}`}>
      {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-1.5 last:mb-0">
      <span className="text-[11px] text-[--text-secondary]">{label}</span>
      {children}
    </div>
  );
}

export function BodyLangRead({ data }: BodyLangReadProps) {
  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-[--text-tertiary] mb-2">
        Speech signals
      </div>
      <Row label="Engagement">
        <Badge label={data.engagement} variant={engagementVariant[data.engagement]} />
      </Row>
      <Row label="Energy">
        <Badge label={data.energy} variant={energyVariant[data.energy]} />
      </Row>
      <Row label="Tone">
        <Badge label={data.tone} variant={toneVariant[data.tone]} />
      </Row>
    </div>
  );
}
