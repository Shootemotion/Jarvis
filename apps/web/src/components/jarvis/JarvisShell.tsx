'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';
import styles from './Jarvis.module.css';
import { JarvisAvatar } from './JarvisAvatar';
import { JarvisStateIndicator } from './JarvisStateIndicator';
import { JarvisCommandPanel } from './JarvisCommandPanel';
import { JARVIS_STATE_META } from './types';
import { VersionBadge } from './VersionBadge';
import {
  IconMic,
  IconStop,
  IconWaves,
  IconVoice,
  IconChat,
  IconCamera,
  IconEye,
  IconMirror,
  IconVolume,
  IconVolumeOff,
  IconSpinner,
} from './Icons';
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

  // Interaction mode: voice-first by default; switch to chat for typing.
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  // Webcam head tracking. off → follow (looks at you, default) → mirror (imitates you).
  const [cameraMode, setCameraMode] = useState<'off' | 'follow' | 'mirror'>('off');
  const cycleCamera = () =>
    setCameraMode((m) => (m === 'off' ? 'follow' : m === 'follow' ? 'mirror' : 'off'));

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

  // Reflect the hands-free "awake" state on the avatar (listening ↔ idle).
  useEffect(() => {
    if (voice.awake) setState('listening');
    else setState((s) => (s === 'listening' ? 'idle' : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.awake]);

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
          Centered in voice mode; docks aside in chat mode. */}
      <JarvisAvatar
        state={state}
        docked={mode === 'chat'}
        track={cameraMode !== 'off'}
        trackMode={cameraMode === 'mirror' ? 'mirror' : 'follow'}
      />

      <header className={styles.header}>
        <div className={styles.brandWrap}>
          <h1 className={styles.brand}>JARVIS</h1>
          <span className={styles.brandTag}>MVP</span>
          <VersionBadge />
        </div>
        <div className={styles.controls}>
          {/* Voice / Chat mode switch */}
          <div className={styles.modeSwitch} role="tablist" aria-label="Modo">
            <button
              type="button"
              className={mode === 'voice' ? styles.modeOn : styles.modeOff}
              onClick={() => setMode('voice')}
              aria-selected={mode === 'voice'}
            >
              <IconVoice size={13} /> Voz
            </button>
            <button
              type="button"
              className={mode === 'chat' ? styles.modeOn : styles.modeOff}
              onClick={() => setMode('chat')}
              aria-selected={mode === 'chat'}
            >
              <IconChat size={13} /> Chat
            </button>
          </div>

          {/* Essentials — shown in both modes */}
          <button
            type="button"
            className={styles.navLink}
            onClick={cycleCamera}
            title="Cámara: apagada → Seguir → Reflejo"
            style={cameraMode !== 'off' ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
          >
            {cameraMode === 'off' ? (
              <>
                <IconCamera size={14} /> Cámara
              </>
            ) : cameraMode === 'follow' ? (
              <>
                <IconEye size={14} /> Seguir
              </>
            ) : (
              <>
                <IconMirror size={14} /> Reflejo
              </>
            )}
          </button>
          {voice.supported && (
            <button
              type="button"
              className={styles.navLink}
              onClick={() => (voice.handsFree ? voice.stopHandsFree() : voice.startHandsFree())}
              title={'Manos libres — decí "Jarvis…" y quedo atento'}
              style={
                voice.handsFree
                  ? {
                      color: voice.awake ? '#34d399' : 'var(--accent)',
                      borderColor: voice.awake ? '#34d399' : 'var(--accent)',
                    }
                  : undefined
              }
            >
              <IconWaves size={14} />
              {voice.handsFree ? (voice.awake ? ' Atento' : ' Jarvis') : ''}
            </button>
          )}
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
            {voiceEnabled ? <IconVolume size={15} /> : <IconVolumeOff size={15} />}
          </button>
          {voice.premium ? (
            <select
              className={styles.select}
              value={voice.voiceURI}
              onChange={(e) => {
                voice.setVoiceURI(e.target.value);
                voice.speak('Hola, soy JARVIS.');
              }}
              aria-label="Voz neuronal"
              title="Voz neuronal (Pro)"
            >
              {voice.premiumVoices.map((v) => (
                <option key={v} value={v}>
                  🎙 {v}
                </option>
              ))}
            </select>
          ) : (
            voice.voices.length > 1 && (
              <select
                className={styles.select}
                value={voice.voiceURI}
                onChange={(e) => {
                  voice.setVoiceURI(e.target.value);
                  voice.speak('Hola, soy JARVIS.');
                }}
                aria-label="Voz"
                title="Elegí la voz de JARVIS"
              >
                {voice.voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            )
          )}
          <Link href="/settings/ai" className={styles.navLink} title="Ajustes">
            ⚙️
          </Link>

          {/* Full controls only in chat mode (keeps voice mode clean) */}
          {mode === 'chat' && (
            <>
              <span className={styles.sep} />
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
              <Link href="/knowledge" className={styles.navLink}>
                📚 Conocimiento
              </Link>
              <Link href="/orchestrator" className={styles.navLink} title="Orquestador">
                🧭
              </Link>
              <Link href="/graph" className={styles.navLink} title="Red de conocimiento">
                🕸
              </Link>
              <Link href="/memory" className={styles.navLink}>
                🧠 Memoria
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
                <button
                  type="button"
                  className={styles.navLink}
                  onClick={micToggle}
                  disabled={offline || voice.transcribing}
                  title={voice.listening ? 'Detener y transcribir' : 'Dictar'}
                  style={voice.listening ? { color: '#f87171', borderColor: '#f87171' } : undefined}
                >
                  {voice.transcribing ? (
                    <IconSpinner size={14} />
                  ) : voice.listening ? (
                    <IconStop size={14} />
                  ) : (
                    <IconMic size={14} />
                  )}
                </button>
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

      {mode === 'chat' && (
        <span className={styles.fieldCaption}>
          {lastMeta
            ? `${lastMeta.provider} · ${lastMeta.model}` +
              (lastMeta.latencyMs ? ` · ${lastMeta.latencyMs}ms` : '')
            : 'jarvis · online'}
        </span>
      )}

      {mode === 'chat' ? (
        <>
          <div className={styles.messages} ref={scrollRef}>
            {messages.length === 0 && !sending && (
              <p className={styles.empty}>
                {offline
                  ? 'Backend sin conexión. Iniciá el API para chatear.'
                  : 'Empezá la conversación con JARVIS.'}
              </p>
            )}
            {messages.map((m, i) =>
              m.role === 'assistant' && !m.content ? null : (
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
                    {m.meta.embeddingProvider ? ` · emb: ${m.meta.embeddingProvider}` : ''}
                    {m.meta.taskType ? ` · ⚙ ${m.meta.taskType}` : ''}
                  </span>
                )}
                {m.meta?.sources && m.meta.sources.length > 0 && (
                  <span className={styles.sources}>
                    <span className={styles.sourcesLabel}>Fuentes:</span>
                    {m.meta.sources.map((s, j) => (
                      <span key={j} className={styles.sourceChip} title={`score ${s.score}`}>
                        📄 {s.path}
                        {s.heading ? ` › ${s.heading}` : ''}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              ),
            )}
            {sending &&
              !(
                messages[messages.length - 1]?.role === 'assistant' &&
                messages[messages.length - 1]?.content
              ) && <div className={styles.typing}>JARVIS está pensando…</div>}
          </div>

          <JarvisCommandPanel
            onSend={handleSend}
            disabled={sending || offline}
            placeholder={offline ? 'Sin conexión con el backend…' : undefined}
          />
        </>
      ) : (
        <div className={styles.voiceStage}>
          {voice.supported ? (
            <button
              type="button"
              className={styles.micBig}
              data-active={voice.listening || voice.awake || undefined}
              onClick={() => (voice.handsFree ? voice.stopHandsFree() : micToggle())}
              disabled={offline || voice.transcribing || sending}
              aria-label={voice.handsFree ? 'Desactivar manos libres' : voice.listening ? 'Detener' : 'Hablar'}
            >
              {voice.transcribing ? (
                <IconSpinner size={30} />
              ) : voice.awake || voice.handsFree ? (
                <IconWaves size={30} />
              ) : voice.listening ? (
                <IconStop size={30} />
              ) : (
                <IconMic size={30} />
              )}
            </button>
          ) : (
            <p className={styles.voiceHint}>Tu navegador no soporta micrófono.</p>
          )}
          <span className={styles.voiceHint}>
            {offline
              ? 'Sin conexión con el backend…'
              : voice.transcribing
                ? 'Transcribiendo…'
                : sending
                  ? 'JARVIS está pensando…'
                  : voice.awake
                    ? 'Te escucho… hablá'
                    : voice.handsFree
                      ? 'Manos libres activo — decí "Jarvis…"'
                      : voice.listening
                        ? 'Escuchando… tocá para terminar'
                        : 'Tocá el micrófono, o activá 👂 manos libres'}
          </span>
        </div>
      )}
    </div>
  );
}
