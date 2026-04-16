/**
 * Tiny inline SVG icon set. Hand-tuned 16px stroke icons.
 */

interface Props { size?: number; stroke?: number; }

const base = (size = 16, stroke = 1.5) => ({
  width: size, height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: stroke,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const HomeIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M2.5 7L8 2.5L13.5 7V13a1 1 0 01-1 1H3.5a1 1 0 01-1-1V7z" />
    <path d="M6 14V9.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V14" />
  </svg>
);

export const ContactsIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M2 13.5c0-2.2 1.8-4 4-4s4 1.8 4 4" />
    <path d="M11 6.5a2 2 0 100-4M14 13.5a3.5 3.5 0 00-3-3.46" />
  </svg>
);

export const SearchIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <circle cx="7" cy="7" r="5" />
    <path d="M14 14l-3.5-3.5" />
  </svg>
);

export const PlusIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M8 3v10M3 8h10" />
  </svg>
);

export const ArrowRightIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

export const SparkIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M8 1.5l1.6 4 4 1.6-4 1.6L8 12.7 6.4 8.7 2.4 7.1l4-1.6z" />
  </svg>
);

export const TrendingIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M2 12l4-4 3 3 5-7" />
    <path d="M14 4h-3M14 4v3" />
  </svg>
);

export const CheckIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M3 8l3.5 3.5L13 5" />
  </svg>
);

export const WarnIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M8 3l6 10H2L8 3z" />
    <path d="M8 7v3M8 11.5v.5" />
  </svg>
);

export const TargetIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="2.5" />
  </svg>
);

export const ChevronUp = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M4 10l4-4 4 4" />
  </svg>
);

export const ChevronDown = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);

export const CloseIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const CopyIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M3 11V3.5A.5.5 0 013.5 3H10" />
  </svg>
);

export const PencilIcon = ({ size, stroke }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
    <path d="M10 4l2 2" />
  </svg>
);
