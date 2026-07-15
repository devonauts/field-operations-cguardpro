/**
 * Voice-clip recorder for the radio check. Primary path is the web MediaRecorder
 * (works in the dev browser and the Android System WebView), producing an
 * OpenAI-native container (webm/opus, mp4/aac, or ogg) — NO transcoding needed
 * server-side (there is no ffmpeg on the server).
 *
 * The native @capacitor-community/voice-recorder plugin is an OPTIONAL upgrade
 * for iOS/older WebViews; it's loaded through a variable specifier so Vite never
 * tries to bundle it when it isn't installed (it simply falls back to web). To
 * enable it later: `npm i @capacitor-community/voice-recorder && npx cap sync`
 * plus the mic permission strings, then this module picks it up automatically.
 */
import i18n from "@/i18n";

export type Recording = { file: File; durationMs: number };

let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let stream: MediaStream | null = null;
let startedAt = 0;

export function isRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';
}

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
  for (const m of cands) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return '';
}

function extFor(type: string): string {
  if (/mp4|aac/.test(type)) return 'm4a';
  if (/ogg/.test(type)) return 'ogg';
  if (/wav/.test(type)) return 'wav';
  return 'webm';
}

export async function startRecording(): Promise<void> {
  if (!isRecordingSupported()) throw new Error(i18n.t('audio.notSupported', 'La grabación de audio no está disponible en este dispositivo.'));
  // A second start before stop (double-tap / re-entry race) would otherwise
  // orphan the prior MediaStream — its tracks stay live (mic hot, OS indicator
  // on). Tear down anything in flight first.
  if (mediaRecorder || stream) cleanup();
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMime();
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  startedAt = Date.now();
  mediaRecorder.start();
}

export async function stopRecording(): Promise<Recording> {
  return new Promise<Recording>((resolve, reject) => {
    const mr = mediaRecorder;
    if (!mr) return reject(new Error(i18n.t('audio.noneInProgress', 'No hay grabación en curso.')));
    mr.onstop = () => {
      const durationMs = Date.now() - startedAt;
      const type = mr.mimeType || (chunks[0] as Blob)?.type || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const file = new File([blob], `radio-${Date.now()}.${extFor(type)}`, { type });
      cleanup();
      resolve({ file, durationMs });
    };
    try { mr.stop(); } catch (e) { cleanup(); reject(e); }
  });
}

export function cancelRecording(): void {
  try { mediaRecorder?.stop(); } catch { /* ignore */ }
  cleanup();
}

export function isRecording(): boolean {
  return !!mediaRecorder && mediaRecorder.state === 'recording';
}

function cleanup(): void {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
  stream = null;
  mediaRecorder = null;
  chunks = [];
}
