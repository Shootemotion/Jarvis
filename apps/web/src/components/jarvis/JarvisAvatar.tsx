import { JarvisFace3D } from './JarvisFace3D';
import { JarvisVisualState } from './types';

interface Props {
  state: JarvisVisualState;
  docked?: boolean;
  track?: boolean;
}

/**
 * The assistant's living presence — a real 3D face (Three.js + MediaPipe's
 * canonical face topology) with bloom, following the mouse. Centered in
 * voice/idle mode; docks aside when chatting. `track` enables webcam head
 * tracking (MediaPipe FaceLandmarker) so the face mirrors the user.
 */
export function JarvisAvatar({ state, docked, track }: Props) {
  return <JarvisFace3D state={state} docked={docked} track={track} />;
}
