import { CSSProperties } from 'react';
import styles from './Jarvis.module.css';
import { JARVIS_STATE_META, JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
}

/** Small pill showing the current state label + description. */
export function JarvisStateIndicator({ state }: Props) {
  const meta = JARVIS_STATE_META[state];
  const accentVar = { '--accent': meta.color } as CSSProperties;

  return (
    <div className={styles.indicator} style={accentVar} aria-live="polite">
      <span className={styles.dot} />
      <span className={styles.indicatorLabel}>{meta.label}</span>
      <span className={styles.indicatorDesc}>{meta.description}</span>
    </div>
  );
}
