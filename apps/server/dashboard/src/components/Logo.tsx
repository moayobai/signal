/**
 * SIGNAL logomark — concentric rings.
 *
 * Three rings where the middle one is nudged ~2px off-centre, creating a
 * subtle sense that the signal is "catching" something just off-axis.
 */

interface LogoProps {
  size?: number;
}

/**
 * Outline variant. Uses `currentColor` for stroke so it inherits from the
 * surrounding text colour — drop it next to a word mark and it picks up tone.
 */
export function Logo({ size = 28 }: LogoProps) {
  const s = size;
  const c = s / 2;
  // Offset the middle ring ~2px (scaled for non-default sizes).
  const offset = (2 / 28) * s;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx={c} cy={c} r={s * 0.44} />
      <circle cx={c + offset} cy={c - offset * 0.6} r={s * 0.28} />
      <circle cx={c} cy={c} r={s * 0.10} />
    </svg>
  );
}

/**
 * Filled-gradient variant — uses the SIGNAL signature spectrum
 * (indigo → cyan → amber) as the ring strokes.
 */
export function LogoMark({ size = 28 }: LogoProps) {
  const s = size;
  const c = s / 2;
  const offset = (2 / 28) * s;
  const gid = `signal-grad-${s}`;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#f5a524" />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={s * 0.44} stroke={`url(#${gid})`} strokeWidth={1.5} />
      <circle cx={c + offset} cy={c - offset * 0.6} r={s * 0.28} stroke={`url(#${gid})`} strokeWidth={1.5} />
      <circle cx={c} cy={c} r={s * 0.10} fill={`url(#${gid})`} />
    </svg>
  );
}
