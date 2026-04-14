import type { ReactNode } from 'react';
import type { BodyLangRead as BodyLangReadType } from '@signal/types';

interface BodyLangReadProps {
  data: BodyLangReadType;
}

type BadgeVariant = 'green' | 'amber' | 'red' | 'neutral';

const eyeContactVariant: Record<BodyLangReadType['eyeContact'], BadgeVariant> = {
  strong: 'green',
  direct: 'green',
  moderate: 'amber',
  avoidant: 'red',
};

const postureVariant: Record<BodyLangReadType['posture'], BadgeVariant> = {
  forward: 'green',
  neutral: 'green',
  'leaning back': 'amber',
  'arms crossed': 'amber',
};

const microVariant: Record<BodyLangReadType['microExpressions'], BadgeVariant> = {
  engaged: 'green',
  nodding: 'green',
  thinking: 'neutral',
  confused: 'amber',
  sceptical: 'red',
};

const badgeStyles: Record<BadgeVariant, string> = {
  green:   'bg-[rgba(48,209,88,0.12)] text-[#1a8c3a]',
  amber:   'bg-[rgba(255,159,10,0.12)] text-[#b06000]',
  red:     'bg-[rgba(255,69,58,0.12)] text-[#c0392b]',
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
        Body language
      </div>
      <Row label="Eye contact">
        <Badge label={data.eyeContact} variant={eyeContactVariant[data.eyeContact]} />
      </Row>
      <Row label="Posture">
        <Badge label={data.posture} variant={postureVariant[data.posture]} />
      </Row>
      <Row label="Micro-expressions">
        <Badge label={data.microExpressions} variant={microVariant[data.microExpressions]} />
      </Row>
    </div>
  );
}
