'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

/** Tiny build indicator: web commit (Vercel) + live API commit (Render). */
export function VersionBadge() {
  const web = process.env.NEXT_PUBLIC_COMMIT_SHA || 'dev';
  const [apiVer, setApiVer] = useState('…');

  useEffect(() => {
    fetch(`${API_URL}/api/health`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setApiVer(d.version ?? '?'))
      .catch(() => setApiVer('off'));
  }, []);

  return (
    <span
      title="versión — web (Vercel) · api (Render)"
      style={{
        fontFamily: 'var(--font-hud)',
        fontSize: '0.55rem',
        letterSpacing: '0.04em',
        color: 'var(--muted, #7f90a3)',
        opacity: 0.75,
        whiteSpace: 'nowrap',
      }}
    >
      web {web} · api {apiVer}
    </span>
  );
}
