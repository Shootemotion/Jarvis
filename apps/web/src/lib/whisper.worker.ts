/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers';

// Local Whisper (runs fully in the browser via WASM/WebGPU — no server, no cloud).
// whisper-tiny keeps it light for CPU/low-RAM; swap to whisper-base for accuracy.
const MODEL = 'Xenova/whisper-tiny';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTranscriber(onProgress?: (p: any) => void) {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', MODEL, {
      // Quantized (q4/NBits) weights fail on onnxruntime-web ("Missing required
      // scale"). fp32 has no quantization path → guaranteed to load on WASM.
      dtype: 'fp32',
      device: 'wasm',
      progress_callback: onProgress,
    });
  }
  return transcriber;
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;
  try {
    if (type === 'load') {
      await getTranscriber((p) => self.postMessage({ type: 'progress', data: p }));
      self.postMessage({ type: 'ready' });
    } else if (type === 'transcribe') {
      const t = await getTranscriber((p) => self.postMessage({ type: 'progress', data: p }));
      const out = await t(e.data.audio, { language: 'spanish', task: 'transcribe' });
      self.postMessage({ type: 'result', text: (out?.text ?? '').trim() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
