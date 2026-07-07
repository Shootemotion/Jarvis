'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';
import styles from './Jarvis.module.css';
import { JarvisAvatar } from './JarvisAvatar';
import { JarvisStateIndicator } from './JarvisStateIndicator';
import { JarvisCommandPanel } from './JarvisCommandPanel';
import { JARVIS_STATE_META, JARVIS_STATES } from './types';
import Link from 'next/link';
import { useJarvisState } from '@/hooks/useJarvisState';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { api, Project, Me, Usage } from '@/lib/api';

export function JarvisShell() {
  const { state, setState, connected } = useJarvisState();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [me, setMe] = useState<Me | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const refreshUsage = () => api.getUsage().then(setUsage).catch(() => {});
  const { messages, sending, send, reset } = useChat(projectId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice: STT (local Whisper) feeds the chat; TTS speaks the reply.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const onTx = useRef<(t: string) => void>(() => {});
  const voice = useVoice({ onTranscript: (t) => onTx.current(t) });

  const accentVar = { '--accent': JARVIS_STATE_META[state].color } as CSSProperties;

  // Load projects once; default to the first (JARVIS).
  useEffect(() => {
    api
      .listProjects()
      .then((list) => {
        setProjects(list);
        setProjectId((cur) => cur ?? list[0]?.id);
      })
      .catch(() => setProjects([]));
    api.getMe().then(setMe).catch(() => setMe(null));
    refreshUsage();
  }, []);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, sending]);

  const lastMeta = [...messages].reverse().find((m) => m.meta)?.meta;

  const handleSend = async (text: string) => {
    setState('thinking');
    try {
      const res = await send(text);
      refreshUsage();
      if (voiceEnabled && res?.reply?.content) {
        voice.speak(res.reply.content, {
          onStart: () => setState('speaking'),
          onEnd: () => setState('idle'),
        });
        // fallback in case speech synthesis never fires (no voices)
        setState('speaking');
      } else {
        setState('speaking');
        setTimeout(() => setState('idle'), 1400);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '';
      if (/l[íi]mite|pro/i.test(msg)) alert(msg); // quota reached
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  // Route transcripts: empty → back to idle; otherwise send to the chat.
  onTx.current = (t: string) => {
    if (!t.trim()) {
      setState('idle');
      return;
    }
    handleSend(t);
  };

  const micToggle = () => {
    if (offline) return;
    if (voice.listening) {
      voice.stopListening();
      setState('thinking'); // transcribing
    } else {
      voice.stopSpeaking();
      setState('listening');
      voice.startListening();
    }
  };

  const onProjectChange = (id: string) => {
    setProjectId(id);
    reset();
    setState('idle');
  };

  const offline = connected === false;

  return (
    <div className={styles.shell} style={accentVar}>
      {/* Living neural field + 3D face (fixed full-viewport background).
          Centered in voice/idle mode; docks aside once a chat is underway. */}
      <JarvisAvatar state={state} docked={messages.length > 0} />

      <header className={styles.header}>
        <div className={styles.brandWrap}>
          <h1 className={styles.brand}>JARVIS</h1>
          <span className={styles.brandTag}>MVP</span>
        </div>
        <div className={styles.controls}>
          {me && (
            <span
              className={`${styles.navLink} ${
                me.entitlements.plan === 'pro' ? styles.planPro : styles.planFree
              }`}
              title={`Plan ${me.entitlements.planName}`}
            >
              {me.entitlements.plan === 'pro' ? '★ PRO' : 'FREE'}
            </span>
          )}
          {usage && (
            <span className={styles.navLink} style={{ cursor: 'default' }} title="Mensajes usados este mes">
              🗨 {usage.usage.messagesThisMonth}/
              {usage.limits.messagesPerMonth < 0 ? '∞' : usage.limits.messagesPerMonth}
            </span>
          )}
          {me?.entitlements.plan === 'free' && (
            <button
              type="button"
              className={styles.upgradeBtn}
              onClick={async () => {
                try {
                  const { url } = await api.startCheckout();
                  window.location.href = url;
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
                }
              }}
            >
              ★ Mejorar a Pro
            </button>
          )}
          <span className={styles.sep} />
          <Link href="/memory" className={styles.navLink}>
            🧠 Memoria
          </Link>
          <Link href="/settings/ai" className={styles.navLink} title="Ajustes de IA">
            ⚙️
          </Link>
          <Link href="/settings/billing" className={styles.navLink} title="Suscripción">
            💳
          </Link>
          <select
            className={styles.select}
            value={projectId ?? ''}
            onChange={(e) => onProjectChange(e.target.value)}
            aria-label="Proyecto"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {voice.supported && (
            <>
              <span className={styles.sep} />
              <button
                type="button"
                className={styles.navLink}
                onClick={micToggle}
                disabled={offline || voice.transcribing}
                title={voice.listening ? 'Detener y transcribir' : 'Hablar (Whisper local)'}
                style={
                  voice.listening
                    ? { color: '#f87171', borderColor: '#f87171' }
                    : undefined
                }
              >
                {voice.transcribing ? '⏳' : voice.listening ? '⏹ Escuchando' : '🎤'}
              </button>
              <button
                type="button"
                className={styles.navLink}
                onClick={() => {
                  if (voiceEnabled) voice.stopSpeaking();
                  setVoiceEnabled((v) => !v);
                }}
                title="Voz hablada (TTS)"
                style={voiceEnabled ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
              >
                {voiceEnabled ? '🔊' : '🔇'}
              </button>
              {voice.voices.length > 1 && (
                <select
                  className={styles.select}
                  value={voice.voiceURI}
                  onChange={(e) => {
                    voice.setVoiceURI(e.target.value);
                    voice.speak('Hola, soy JARVIS.');
                  }}
                  aria-label="Voz"
                  title="Elegí la voz"
                >
                  {voice.voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <span className={styles.sep} />
          <JarvisStateIndicator state={state} />
        </div>
      </header>

      {voice.modelStatus === 'loading' && (
        <span className={styles.fieldCaption}>
          Cargando voz local (Whisper)… {voice.progress}%
        </span>
      )}

      <span className={styles.fieldCaption}>
        {lastMeta
          ? `${lastMeta.provider} · ${lastMeta.model}` +
            (lastMeta.latencyMs ? ` · ${lastMeta.latencyMs}ms` : '')
          : 'ollama · local'}
      </span>

      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 && !sending && (
          <p className={styles.empty}>
            {offline
              ? 'Backend sin conexión. Iniciá el API para chatear.'
              : 'Empezá la conversación con JARVIS.'}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div
              className={`${styles.msg} ${
                m.role === 'user' ? styles.msgUser : styles.msgAssistant
              }`}
            >
              {m.content}
            </div>
            {m.meta && (
              <span className={styles.msgMeta}>
                {m.meta.provider} · {m.meta.model}
                {m.meta.outputTokens != null && ` · ${m.meta.outputTokens} tok`}
                {m.meta.memoriesUsed
                  ? ` · 🧠 ${m.meta.memoriesUsed} ${
                      m.meta.memoriesUsed === 1 ? 'memoria' : 'memorias'
                    }`
                  : ''}
              </span>
            )}
          </div>
        ))}
        {sending && <div className={styles.typing}>JARVIS está pensando…</div>}
      </div>

      <JarvisCommandPanel
        onSend={handleSend}
        disabled={sending || offline}
        placeholder={
          offline ? 'Sin conexión con el backend…' : undefined
        }
      />

      {/* Compact preview of the visual states (dev affordance). */}
      <div className={styles.demo}>
        <span className={styles.demoHint}>Vista previa de estados</span>
        {JARVIS_STATES.map((s) => (
          <button
            key={s}
            type="button"
            className={`${styles.demoBtn} ${
              state === s ? styles.demoBtnActive : ''
            }`}
            style={{ '--accent': JARVIS_STATE_META[s].color } as CSSProperties}
            onClick={() => setState(s)}
            disabled={sending || (offline && s !== 'offline')}
          >
            {JARVIS_STATE_META[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}
