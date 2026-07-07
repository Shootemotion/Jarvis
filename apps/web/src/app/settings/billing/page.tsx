'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, BillingStatus } from '@/lib/api';

const box: React.CSSProperties = {
  background: 'var(--panel,#121a24)',
  border: '1px solid var(--border,#1f2b38)',
  borderRadius: 14,
  padding: '1.25rem',
  marginBottom: '1.25rem',
};
const btn: React.CSSProperties = {
  background: 'var(--accent,#38bdf8)',
  color: '#04121a',
  border: 'none',
  borderRadius: 10,
  padding: '0.6rem 1.2rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useState<{ mock: boolean; returning: boolean }>({
    mock: false,
    returning: false,
  });

  const load = () => api.getBillingStatus().then(setStatus);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ mock: q.get('mock') === '1', returning: q.get('status') === 'return' });
    load().catch((e) => setMsg(String(e)));
  }, []);

  // When returning from Mercado Pago, poll a few times while the webhook lands.
  useEffect(() => {
    if (!params.returning) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      const s = await api.getBillingStatus().catch(() => null);
      if (s) setStatus(s);
      if ((s && s.plan === 'pro') || tries >= 6) clearInterval(t);
    }, 2500);
    return () => clearInterval(t);
  }, [params.returning]);

  const confirmMock = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.devConfirmBilling();
      await load();
      setMsg('¡Listo! Ya sos Pro (modo DEV) ✓');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const upgrade = async () => {
    setBusy(true);
    try {
      const { url } = await api.startCheckout();
      window.location.href = url;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm('¿Cancelar tu suscripción Pro? Volverás al plan Free.')) return;
    setBusy(true);
    try {
      await api.cancelBilling();
      await load();
      setMsg('Suscripción cancelada.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const isPro = status?.plan === 'pro';

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: 'clamp(1rem,4vw,2.5rem)', color: '#e6edf3', minHeight: '100dvh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>💳 Suscripción</h1>
        <Link href="/" style={{ color: 'var(--accent,#38bdf8)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Volver
        </Link>
      </div>

      {!status && <p style={{ color: 'var(--muted,#8b98a5)' }}>Cargando…</p>}

      {status && (
        <>
          <section style={box}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>
              Plan actual: <span style={{ color: isPro ? 'var(--accent,#38bdf8)' : '#e6edf3' }}>{isPro ? '★ PRO' : 'FREE'}</span>
            </h2>
            <p style={{ color: 'var(--muted,#8b98a5)', fontSize: '0.9rem', margin: '0.3rem 0' }}>
              Estado: {status.status}
              {status.currentPeriodEnd &&
                ` · renueva ${new Date(status.currentPeriodEnd).toLocaleDateString('es-AR')}`}
            </p>
            {!status.live && (
              <p style={{ color: '#fbbf24', fontSize: '0.8rem' }}>
                ⚠️ Modo DEV: Mercado Pago no está configurado (falta MP_ACCESS_TOKEN). Los pagos son simulados.
              </p>
            )}
          </section>

          {params.returning && !isPro && (
            <section style={box}>
              <p style={{ margin: 0 }}>⏳ Verificando tu pago con Mercado Pago…</p>
            </section>
          )}

          {!isPro && (
            <section style={box}>
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Pasate a Pro</h2>
              <p style={{ color: 'var(--muted,#8b98a5)', fontSize: '0.9rem' }}>
                Proveedores premium (Claude/GPT), voz neuronal, integraciones, agentes, automatizaciones y nube.
              </p>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.4rem 0' }}>
                ${status.price.ars.toLocaleString('es-AR')} ARS<span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--muted,#8b98a5)' }}> /mes</span>
              </p>
              {status.price.trialDays > 0 && (
                <p style={{ color: 'var(--ok,#34d399)', fontSize: '0.85rem', marginTop: 0 }}>
                  {status.price.trialDays} días de prueba gratis
                </p>
              )}
              {params.mock && !status.live ? (
                <button onClick={confirmMock} disabled={busy} style={btn}>
                  {busy ? 'Procesando…' : 'Confirmar pago (DEV)'}
                </button>
              ) : (
                <button onClick={upgrade} disabled={busy} style={btn}>
                  {busy ? 'Redirigiendo…' : 'Suscribirme con Mercado Pago'}
                </button>
              )}
            </section>
          )}

          {isPro && (
            <section style={box}>
              <button onClick={cancel} disabled={busy} style={{ ...btn, background: 'transparent', color: '#f87171', border: '1px solid #f87171' }}>
                {busy ? '…' : 'Cancelar suscripción'}
              </button>
            </section>
          )}

          {status.payments.length > 0 && (
            <section style={box}>
              <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Historial</h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                {status.payments.map((p) => (
                  <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border,#1f2b38)' }}>
                    <span style={{ color: 'var(--muted,#8b98a5)' }}>
                      {new Date(p.createdAt).toLocaleString('es-AR')} · {p.kind}
                    </span>
                    <span>
                      {p.amount ? `$${p.amount.toLocaleString('es-AR')} ` : ''}
                      <span style={{ color: p.status === 'active' ? 'var(--ok,#34d399)' : '#fbbf24' }}>{p.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {msg && <p style={{ color: msg.includes('✓') ? 'var(--ok,#34d399)' : '#fbbf24' }}>{msg}</p>}
        </>
      )}
    </main>
  );
}
