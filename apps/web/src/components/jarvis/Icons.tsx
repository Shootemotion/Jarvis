import { ReactNode } from 'react';

/** Shared monoline SVG wrapper — inherits color via currentColor. */
function Svg({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </Svg>
);

export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Svg>
);

/** Sound bars — used for hands-free / listening. */
export const IconWaves = (p: P) => (
  <Svg {...p}>
    <path d="M4 10v4" />
    <path d="M8 6v12" />
    <path d="M12 3v18" />
    <path d="M16 6v12" />
    <path d="M20 10v4" />
  </Svg>
);

export const IconVoice = (p: P) => (
  <Svg {...p}>
    <path d="M6 9v6" />
    <path d="M10 5v14" />
    <path d="M14 8v8" />
    <path d="M18 10v4" />
  </Svg>
);

export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12Z" />
  </Svg>
);

export const IconCamera = (p: P) => (
  <Svg {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <circle cx="12" cy="13" r="3.2" />
  </Svg>
);

export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const IconMirror = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v18" />
    <path d="M7 7l-3 5 3 5" />
    <path d="M17 7l3 5-3 5" />
  </Svg>
);

export const IconVolume = (p: P) => (
  <Svg {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 6a8 8 0 0 1 0 12" />
  </Svg>
);

export const IconVolumeOff = (p: P) => (
  <Svg {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M22 9l-6 6" />
    <path d="M16 9l6 6" />
  </Svg>
);

export const IconSpinner = (p: P) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Svg>
);
