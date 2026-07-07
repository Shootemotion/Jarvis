import { JarvisFace3D } from './JarvisFace3D';
import { JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
  docked?: boolean;
}

/**
 * The assistant's living presence — a real 3D face (Three.js + MediaPipe's
 * canonical face topology) with bloom, following the mouse. Centered in
 * voice/idle mode; docks aside when chatting. Swap seam for webcam control.
 */
export function JarvisAvatar({ state, docked }: Props) {
  return <JarvisFace3D state={state} docked={docked} />;
}
