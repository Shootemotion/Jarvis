'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, cloudAuth } from '@/lib/supabase';

export function AuthGate({ children }: { children: React.ReactNode }) {
  // Selfhost mode: no auth, render the app directly.
  if (!cloudAuth || !supabase) return <>{children}</>;
  return <CloudAuth>{children}</CloudAuth>;
}

function CloudAuth({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <Centered>Cargando…</Centered>;
  }

  if (!session) return <LoginScreen />;

  return (
    <>
      {children}
      <button
        onClick={() => supabase!.auth.signOut()}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 50,
          background: 'rgba(18,26,36,0.7)',
          color: 'var(--muted, #8b98a5)',
          border: '1px solid var(--border, #1f2b38)',
          borderRadius: 10,
          padding: '0.35rem 0.7rem',
          fontSize: '0.8rem',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
        }}
      >
        Salir
      </button>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--text, #e6edf3)' }}>
      {children}
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Cuenta creada. Si tu proyecto pide confirmación, revisá tu email.');
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    await supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const input: React.CSSProperties = {
    background: '#0b0f14',
    border: '1px solid #1f2b38',
    color: '#e6edf3',
    borderRadius: 10,
    padding: '0.6rem 0.75rem',
    font: 'inherit',
    outline: 'none',
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#080b11', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 360, color: '#e6edf3' }}>
        <h1 style={{ fontSize: '2rem', letterSpacing: '0.04em', margin: 0 }}>
          JARVIS <span style={{ color: '#38bdf8', fontSize: '0.8rem' }}>PRO</span>
        </h1>
        <p style={{ color: '#8b98a5', marginTop: '0.25rem', marginBottom: '1.5rem' }}>
          Iniciá sesión para continuar.
        </p>

        <button
          onClick={google}
          style={{ ...input, width: '100%', cursor: 'pointer', fontWeight: 600, marginBottom: '1rem' }}
        >
          Continuar con Google
        </button>

        <div style={{ textAlign: 'center', color: '#8b98a5', fontSize: '0.8rem', margin: '0.5rem 0' }}>o</div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={input} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button
            type="submit"
            disabled={busy}
            style={{ background: '#38bdf8', color: '#04121a', border: 'none', borderRadius: 10, padding: '0.6rem', fontWeight: 600, cursor: 'pointer' }}
          >
            {busy ? '…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        {msg && <p style={{ color: '#fbbf24', fontSize: '0.8rem', marginTop: '0.75rem' }}>{msg}</p>}

        <button
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          style={{ background: 'none', border: 'none', color: '#8b98a5', cursor: 'pointer', marginTop: '1rem', fontSize: '0.85rem' }}
        >
          {mode === 'signin' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Entrá'}
        </button>
      </div>
    </div>
  );
}
