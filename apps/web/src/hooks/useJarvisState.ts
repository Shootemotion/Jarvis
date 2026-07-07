'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { JarvisVisualState } from '@/components/jarvis/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4010';
const HEALTH_POLL_MS = 5000;

/**
 * Produces the assistant's visual state.
 *
 * For now the only "real" signal is backend connectivity: if the API health
 * check fails, the state is forced to `offline`. Everything else defaults to
 * `idle`. `setState` lets callers (and, today, the demo switcher) drive other
 * states — later this is where chat/tool events will push transitions.
 */
export function useJarvisState() {
  const [state, setState] = useState<JarvisVisualState>('idle');
  const [connected, setConnected] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
      const body = await res.json();
      setConnected(res.ok && body?.status === 'ok');
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    timer.current = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [checkHealth]);

  // Connectivity wins: a down backend always shows offline.
  const displayState: JarvisVisualState = connected === false ? 'offline' : state;

  return { state: displayState, setState, connected } as const;
}
