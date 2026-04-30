import type { ReactNode } from 'react';

type GlassPanelVariant = 'pill' | 'panel';

interface GlassPanelProps {
  variant: GlassPanelVariant;
  danger?: boolean;
  children: ReactNode;
  className?: string;
}

export function GlassPanel({ variant, danger = false, children, className = '' }: GlassPanelProps) {
  const base = [
    'relative overflow-hidden',
    'bg-white/[0.72]',
    'border border-white/[0.55]',
    'shadow-[0_20px_60px_rgba(0,0,0,0.10),0_0_0_0.5px_rgba(0,0,0,0.05)]',
    'transition-[width,height,border-radius] duration-[380ms]',
    'ease-[cubic-bezier(0.34,1.56,0.64,1)]',
  ].join(' ');

  const variants: Record<GlassPanelVariant, string> = {
    pill: 'rounded-[100px] h-[44px] w-[180px] flex items-center px-4',
    panel: 'rounded-[20px] w-[280px]',
  };

  const dangerStyles = danger
    ? 'border-[1.5px] border-warning/40 animate-[border-pulse_1.2s_ease-in-out_infinite]'
    : '';

  return (
    <div
      className={`${base} ${variants[variant]} ${dangerStyles} ${className}`}
      style={{ backdropFilter: 'blur(32px) saturate(180%)' }}
    >
      {children}
    </div>
  );
}
