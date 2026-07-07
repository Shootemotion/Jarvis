/**
 * Jarvis Visual Interface — state contract.
 *
 * The visual components are "dumb": they only render based on the state they
 * receive. The state itself is produced elsewhere (chat/backend, health checks,
 * tool execution, etc.) and passed down as a prop. Never hardcode assistant
 * logic inside a visual component.
 */
export type JarvisVisualState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'offline'
  | 'tool_call'
  | 'confirmation_required';

export interface JarvisStateMeta {
  /** Human label (Spanish, since the user's preferred language is es). */
  label: string;
  /** Short description of what the state means. */
  description: string;
  /** Accent color driving the orb + indicator. */
  color: string;
  /** Whether the orb should animate (offline stays still/dim). */
  animated: boolean;
}

/**
 * Presentation metadata per state. Kept here (not inside components) so the
 * look of a state can be tuned in one place and reused across the UI.
 */
export const JARVIS_STATE_META: Record<JarvisVisualState, JarvisStateMeta> = {
  idle: {
    label: 'En espera',
    description: 'Listo para ayudar.',
    color: '#38bdf8',
    animated: true,
  },
  listening: {
    label: 'Escuchando',
    description: 'Captando tu entrada.',
    color: '#34d399',
    animated: true,
  },
  thinking: {
    label: 'Procesando',
    description: 'Razonando la respuesta.',
    color: '#a78bfa',
    animated: true,
  },
  speaking: {
    label: 'Respondiendo',
    description: 'Generando la respuesta.',
    color: '#60a5fa',
    animated: true,
  },
  tool_call: {
    label: 'Ejecutando herramienta',
    description: 'Usando una herramienta externa.',
    color: '#22d3ee',
    animated: true,
  },
  confirmation_required: {
    label: 'Esperando aprobación',
    description: 'Requiere tu confirmación.',
    color: '#fbbf24',
    animated: true,
  },
  error: {
    label: 'Error',
    description: 'Ocurrió un problema.',
    color: '#f87171',
    animated: true,
  },
  offline: {
    label: 'Sin conexión',
    description: 'Backend / API no disponible.',
    color: '#64748b',
    animated: false,
  },
};

/** Ordered list, handy for demo switchers and legends. */
export const JARVIS_STATES: JarvisVisualState[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'tool_call',
  'confirmation_required',
  'error',
  'offline',
];
