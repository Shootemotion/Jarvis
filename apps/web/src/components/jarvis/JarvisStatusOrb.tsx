import { CSSProperties } from 'react';
import styles from './Jarvis.module.css';
import { JARVIS_STATE_META, JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
  className?: string;
}

/**
 * The central "core / orb" — a pure, presentational SVG that animates based on
 * the given state. No assistant logic lives here; it only maps state -> visuals.
 */
export function JarvisStatusOrb({ state, className }: Props) {
  const meta = JARVIS_STATE_META[state];
  const accentVar = { '--accent': meta.color } as CSSProperties;

  return (
    <div
      className={`${styles.avatar} ${styles[state]} ${className ?? ''}`}
      style={accentVar}
      role="img"
      aria-label={`Estado de JARVIS: ${meta.label}`}
    >
      <svg className={styles.orb} viewBox="0 0 200 200">
        <defs>
          <radialGradient id="jarvisCore" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="70%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
          </radialGradient>
        </defs>

        {/* expanding ripples (used by listening) */}
        <circle className={styles.ripple} cx="100" cy="100" r="55" />
        <circle
          className={`${styles.ripple} ${styles.ripple2}`}
          cx="100"
          cy="100"
          r="55"
        />

        {/* concentric rings */}
        <circle className={`${styles.ring} ${styles.ringOuter}`} cx="100" cy="100" r="90" />
        <circle className={`${styles.ring} ${styles.ringMid}`} cx="100" cy="100" r="70" />

        {/* rotating arc (thinking / tool_call) */}
        <circle className={styles.arc} cx="100" cy="100" r="80" />

        {/* the core */}
        <circle className={styles.core} cx="100" cy="100" r="46" />
        <circle className={styles.coreInner} cx="100" cy="100" r="18" />
      </svg>
    </div>
  );
}
