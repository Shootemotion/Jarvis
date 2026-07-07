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

/**
 * Local voice I/O: STT via in-browser Whisper (Web Worker), TTS via the OS
 * speech synthesizer. Fully local — no audio leaves the machine.
 */
export function useVoice({ onTranscript }: Options) {
  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [modelStatus, setModelStatus] = useState<VoiceModelStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
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
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setListening(false);
  }, []);

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
      u.onstart = () => { setSpeaking(true); hooks?.onStart?.(); };
      u.onend = () => { setSpeaking(false); hooks?.onEnd?.(); };
      u.onerror = () => { setSpeaking(false); hooks?.onEnd?.(); };
      window.speechSynthesis.speak(u);
    },
    [voiceURI],
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, listening, transcribing, modelStatus, progress, speaking, voices, voiceURI, setVoiceURI, startListening, stopListening, speak, stopSpeaking };
}
