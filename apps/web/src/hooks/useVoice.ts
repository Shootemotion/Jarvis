'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Decode a recorded blob to mono Float32 @ 16 kHz (what Whisper expects). */
async function blobToFloat32Mono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new AC();
  const decoded = await ac.decodeAudioData(arrayBuf);
  await ac.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

interface Options {
  onTranscript: (text: string) => void;
}

export type VoiceModelStatus = 'idle' | 'loading' | 'ready' | 'error';

// Wake word (+ common mis-hearings) and how long JARVIS stays "awake" for
// follow-ups without repeating the name.
const WAKE = /\b(jarvis|yarvis|llarvis|jarbis|jervis|charvis|yarbis)\b/i;
const AWAKE_WINDOW_MS = 15000;

/** Native Web Speech API constructor (Chrome/Edge/Safari), if present. */
function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Local voice I/O: STT via in-browser Whisper (Web Worker), TTS via the OS
 * speech synthesizer. Fully local — no audio leaves the machine.
 */
export function useVoice({ onTranscript }: Options) {
  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Native Web Speech API (real-time STT). Preferred when available.
  const recognitionRef = useRef<any>(null);
  const nativeSTTRef = useRef(false);
  const finalTextRef = useRef('');
  // Stable reference to the latest onTranscript (avoids stale closures).
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  // Hands-free / wake-word ("Jarvis, …") continuous listening.
  const ambientRef = useRef<any>(null);
  const handsFreeRef = useRef(false);
  const awakeRef = useRef(false);
  const awakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingRef = useRef(false);

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [modelStatus, setModelStatus] = useState<VoiceModelStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [handsFree, setHandsFreeState] = useState(false);
  const [awake, setAwakeUi] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>('');

  // Load the OS/browser voices and auto-pick the best Spanish one.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const rank = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      let s = 0;
      if (n.includes('google')) s += 100; // Chrome's natural voices
      if (n.includes('natural') || n.includes('online')) s += 90; // Edge/Win neural
      if (n.includes('sabina') || n.includes('helena') || n.includes('laura') || n.includes('paulina')) s += 30;
      const l = v.lang?.toLowerCase() || '';
      if (l.startsWith('es-419') || l === 'es-ar' || l === 'es-mx') s += 12;
      else if (l.startsWith('es')) s += 8;
      return s;
    };
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const es = all.filter((v) => v.lang?.toLowerCase().startsWith('es')).sort((a, b) => rank(b) - rank(a));
      const list = es.length ? es : all;
      setVoices(list);
      setVoiceURI((cur) => cur || list[0]?.voiceURI || '');
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    const SR = getSpeechRecognition();
    if (SR) {
      // Real-time, no model download. This is the fast path (Chrome/Edge/Safari).
      nativeSTTRef.current = true;
      setSupported(true);
      setModelStatus('ready');
      return () => {
        try {
          recognitionRef.current?.abort();
        } catch {
          /* noop */
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
    }

    // Fallback: in-browser Whisper (Web Worker). Only loaded when there's no
    // native speech recognition — avoids downloading the heavy model needlessly.
    setSupported(
      typeof window !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof Worker !== 'undefined',
    );
    const w = new Worker(new URL('../lib/whisper.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') {
        setModelStatus('loading');
        if (d.data?.progress != null) setProgress(Math.round(d.data.progress));
      } else if (d.type === 'ready') {
        setModelStatus('ready');
      } else if (d.type === 'result') {
        setTranscribing(false);
        setModelStatus('ready');
        onTranscript(d.text || '');
      } else if (d.type === 'error') {
        setTranscribing(false);
        setModelStatus('error');
        console.error('Whisper worker:', d.message);
      }
    };
    return () => {
      w.terminate();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(async () => {
    if (listening || transcribing) return;
    // Hands-free owns the mic while active; don't open a second recognizer.
    if (handsFreeRef.current) return;

    // Native real-time path.
    if (nativeSTTRef.current) {
      const SR = getSpeechRecognition();
      if (!SR) return;
      const rec = new SR();
      rec.lang = 'es-AR';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      finalTextRef.current = '';
      rec.onresult = (ev: any) => {
        let finalText = '';
        for (let i = 0; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
        }
        if (finalText) finalTextRef.current = finalText;
      };
      rec.onerror = (ev: any) => {
        if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          console.error('SpeechRecognition:', ev.error);
        }
      };
      rec.onend = () => {
        setListening(false);
        recognitionRef.current = null;
        onTranscript(finalTextRef.current.trim());
      };
      recognitionRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch (err) {
        console.error('SpeechRecognition start:', err);
        setListening(false);
      }
      return;
    }

    // Fallback: record → Whisper.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size > 0 && chunksRef.current.push(ev.data);
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const audio = await blobToFloat32Mono16k(blob);
          workerRef.current?.postMessage({ type: 'transcribe', audio }, [audio.buffer]);
        } catch (err) {
          console.error('audio decode:', err);
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setListening(true);
    } catch (err) {
      console.error('getUserMedia:', err);
      setListening(false);
    }
  }, [listening, transcribing]);

  const stopListening = useCallback(() => {
    if (nativeSTTRef.current) {
      // stop() finalizes and fires onend → sends the transcript.
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
      return;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setListening(false);
  }, []);

  // ---- hands-free / wake word ----------------------------------------------

  const setAwake = useCallback((v: boolean) => {
    awakeRef.current = v;
    setAwakeUi(v);
  }, []);

  const refreshAwake = useCallback(() => {
    if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
    awakeTimerRef.current = setTimeout(() => setAwake(false), AWAKE_WINDOW_MS);
  }, [setAwake]);

  const startAmbient = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR || ambientRef.current) return;
    const rec = new SR();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const deliver = (text: string) => {
      const t = text.trim();
      if (t.length < 2) return;
      setAwake(true);
      refreshAwake();
      onTranscriptRef.current(t);
    };

    rec.onresult = (ev: any) => {
      if (speakingRef.current) return; // ignore our own TTS
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const text: string = res[0].transcript;
        if (!res.isFinal) {
          if (!awakeRef.current && WAKE.test(text)) setAwake(true); // instant feedback
          continue;
        }
        if (awakeRef.current) {
          // Follow-up: no wake word needed (strip it if the user said it anyway).
          deliver(text.replace(WAKE, '').replace(/^[\s,.:!¡]+/, '') || text);
        } else if (WAKE.test(text)) {
          const after = text.slice(text.toLowerCase().search(WAKE)).replace(WAKE, '').replace(/^[\s,.:!¡]+/, '');
          setAwake(true);
          refreshAwake();
          if (after.trim().length >= 2) deliver(after);
        }
      }
    };
    rec.onerror = (ev: any) => {
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') console.error('wake:', ev.error);
    };
    rec.onend = () => {
      ambientRef.current = null;
      // Chrome ends recognition periodically — keep it alive while hands-free.
      if (handsFreeRef.current && !speakingRef.current) {
        restartRef.current = setTimeout(() => startAmbient(), 250);
      }
    };
    ambientRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already running */
    }
  }, [refreshAwake, setAwake]);

  const startHandsFree = useCallback(() => {
    if (!getSpeechRecognition()) return;
    handsFreeRef.current = true;
    setHandsFreeState(true);
    startAmbient();
  }, [startAmbient]);

  const stopHandsFree = useCallback(() => {
    handsFreeRef.current = false;
    setHandsFreeState(false);
    setAwake(false);
    if (awakeTimerRef.current) clearTimeout(awakeTimerRef.current);
    if (restartRef.current) clearTimeout(restartRef.current);
    try {
      ambientRef.current?.abort();
    } catch {
      /* noop */
    }
    ambientRef.current = null;
  }, [setAwake]);

  // Stop hands-free on unmount.
  useEffect(() => () => stopHandsFree(), [stopHandsFree]);

  const speak = useCallback(
    (text: string, hooks?: { onStart?: () => void; onEnd?: () => void }) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const all = window.speechSynthesis.getVoices();
      const chosen = all.find((v) => v.voiceURI === voiceURI) || all.find((v) => v.lang?.toLowerCase().startsWith('es'));
      if (chosen) u.voice = chosen;
      u.lang = chosen?.lang || 'es-ES';
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onstart = () => {
        setSpeaking(true);
        // Pause ambient listening so JARVIS doesn't transcribe its own voice.
        if (handsFreeRef.current) {
          speakingRef.current = true;
          try { ambientRef.current?.abort(); } catch { /* noop */ }
        }
        hooks?.onStart?.();
      };
      const resume = () => {
        setSpeaking(false);
        if (handsFreeRef.current) {
          speakingRef.current = false;
          restartRef.current = setTimeout(() => startAmbient(), 400);
        }
        hooks?.onEnd?.();
      };
      u.onend = resume;
      u.onerror = resume;
      window.speechSynthesis.speak(u);
    },
    [voiceURI, startAmbient],
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return {
    supported,
    listening,
    transcribing,
    modelStatus,
    progress,
    speaking,
    handsFree,
    awake,
    voices,
    voiceURI,
    setVoiceURI,
    startListening,
    stopListening,
    startHandsFree,
    stopHandsFree,
    speak,
    stopSpeaking,
  };
}
