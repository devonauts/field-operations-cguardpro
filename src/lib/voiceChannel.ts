/**
 * Radio "Canal abierto" — live half-duplex PTT voice engine.
 *
 * Carries voice over the backend socket.io connection (free, passes through the
 * Cloudflare Tunnel as WebSocket — no UDP/TURN). Audio is captured as raw PCM via
 * Web Audio, downsampled to 16 kHz mono and µ-law (G.711) compressed (~128 kbps),
 * relayed by the server to the channel, and played back through Web Audio. No
 * MediaRecorder / MSE / codecs — the most reliable path across iOS + Android.
 *
 * Floor control is enforced by the server (one talker at a time). This module is
 * framework-agnostic; the worker app and CRM share an identical copy.
 */
import { io, Socket } from "socket.io-client";

export type VoiceMember = { userId: string; name: string; role: string };
export type VoiceSpeaker = { userId: string; name: string } | null;
export type VoiceState = "idle" | "connecting" | "connected" | "error";

export interface VoiceCallbacks {
  onState?: (s: VoiceState) => void;
  onPresence?: (roster: VoiceMember[]) => void;
  onSpeaker?: (speaker: VoiceSpeaker) => void;
  onError?: (msg: string) => void;
}

const TARGET_RATE = 16000;
const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

function encodeMuLaw(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let pcm = Math.max(-1, Math.min(1, samples[i]));
    pcm = pcm < 0 ? Math.ceil(pcm * 32768) : Math.floor(pcm * 32767);
    let sign = (pcm >> 8) & 0x80;
    if (sign) pcm = -pcm;
    if (pcm > MULAW_CLIP) pcm = MULAW_CLIP;
    pcm += MULAW_BIAS;
    let exponent = 7;
    for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; exponent--, mask >>= 1) { /* find exponent */ }
    const mantissa = (pcm >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}

function decodeMuLaw(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    let u = ~bytes[i] & 0xff;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
    sample -= MULAW_BIAS;
    if (sign) sample = -sample;
    out[i] = sample / 32768;
  }
  return out;
}

/** Linear resample between an arbitrary rate and 16 kHz (good enough for voice). */
function resample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = idx - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

export class VoiceChannel {
  private socket: Socket | null = null;
  private cb: VoiceCallbacks = {};
  private ctx: AudioContext | null = null;

  // capture
  private micStream: MediaStream | null = null;
  private capSource: MediaStreamAudioSourceNode | null = null;
  private capProc: ScriptProcessorNode | null = null;

  // playback
  private playProc: ScriptProcessorNode | null = null;
  private queue: Float32Array[] = [];
  private queueHeadOffset = 0;
  private buffered = 0;
  private playing = false;

  private _talking = false;
  joined = false;

  get talking() { return this._talking; }
  get connected() { return !!this.socket?.connected; }

  /** Resume the audio context from a user gesture (iOS needs this to play sound
   *  even for listen-only users). Idempotent; safe to call on any tap. */
  resume(): void { try { this.ensureContext(); } catch { /* ignore */ } }

  connect(opts: { url: string; path?: string; token: string; tenantId: string }, cb: VoiceCallbacks): void {
    this.cb = cb || {};
    this.cb.onState?.("connecting");
    this.socket = io(opts.url, {
      path: opts.path || "/api/socket.io",
      transports: ["websocket"],
      auth: { token: opts.token, tenantId: opts.tenantId },
      reconnection: true,
    });
    this.socket.on("connect", () => this.cb.onState?.("connected"));
    this.socket.on("disconnect", () => { this.joined = false; this.cb.onState?.("idle"); });
    this.socket.on("connect_error", (e: any) => { this.cb.onState?.("error"); this.cb.onError?.(e?.message || "connect_error"); });
    this.socket.on("radio:voice:presence", (p: any) => this.cb.onPresence?.(p?.roster || []));
    this.socket.on("radio:voice:speaker", (s: any) => {
      this.cb.onSpeaker?.(s?.speaking ? { userId: s.userId, name: s.name } : null);
    });
    this.socket.on("radio:voice:chunk", (data: ArrayBuffer | Uint8Array) => this.onRemoteChunk(data));
  }

  private ensureContext(): AudioContext {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = (this.ctx || new AC()) as AudioContext;
    if (!this.ctx) {
      this.ctx = ctx;
      this.startPlayback();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  async join(): Promise<{ roster: VoiceMember[]; speaker: VoiceSpeaker }> {
    this.ensureContext(); // must run from a user gesture (button tap) for iOS autoplay
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("no socket"));
      this.socket.emit("radio:voice:join", {}, (res: any) => {
        if (res?.ok) {
          this.joined = true;
          resolve({ roster: res.roster || [], speaker: res.speaker || null });
        } else reject(new Error(res?.error || "join_failed"));
      });
    });
  }

  leave(): void {
    this.stopTalk();
    this.socket?.emit("radio:voice:leave", {}, () => {});
    this.joined = false;
  }

  /** Request the floor and start streaming the mic. Returns false if busy. */
  async startTalk(): Promise<{ ok: boolean; busyWith?: string }> {
    if (this._talking || !this.socket) return { ok: false };
    const granted = await new Promise<any>((resolve) => {
      this.socket!.emit("radio:voice:talk-request", {}, (res: any) => resolve(res));
    });
    if (!granted?.ok) return { ok: false, busyWith: granted?.speaker?.name };
    try {
      const ctx = this.ensureContext();
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.capSource = ctx.createMediaStreamSource(this.micStream);
      this.capProc = ctx.createScriptProcessor(4096, 1, 1);
      const inRate = ctx.sampleRate;
      this.capProc.onaudioprocess = (e) => {
        if (!this._talking || !this.socket) return;
        const input = e.inputBuffer.getChannelData(0);
        const ds = resample(input, inRate, TARGET_RATE);
        const ulaw = encodeMuLaw(ds);
        this.socket.emit("radio:voice:chunk", ulaw.buffer);
      };
      // ScriptProcessor only fires when connected to the destination; route through
      // a zero-gain node so the talker never hears their own mic.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      this.capSource.connect(this.capProc);
      this.capProc.connect(silent);
      silent.connect(ctx.destination);
      this._talking = true;
      return { ok: true };
    } catch (err: any) {
      this.socket?.emit("radio:voice:talk-end");
      this.cb.onError?.(err?.message || "mic_error");
      this.teardownCapture();
      return { ok: false };
    }
  }

  stopTalk(): void {
    if (!this._talking) return;
    this._talking = false;
    this.socket?.emit("radio:voice:talk-end");
    this.teardownCapture();
  }

  private teardownCapture(): void {
    try { this.capProc?.disconnect(); } catch { /* ignore */ }
    try { this.capSource?.disconnect(); } catch { /* ignore */ }
    try { this.micStream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    this.capProc = null;
    this.capSource = null;
    this.micStream = null;
  }

  private startPlayback(): void {
    if (!this.ctx || this.playProc) return;
    this.playProc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.playProc.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      // ~150ms jitter buffer before starting; resume silence on underrun.
      if (!this.playing && this.buffered < this.ctx!.sampleRate * 0.15) { out.fill(0); return; }
      this.playing = true;
      for (let i = 0; i < out.length; i++) {
        const head = this.queue[0];
        if (!head) { out[i] = 0; this.playing = false; continue; }
        out[i] = head[this.queueHeadOffset++];
        this.buffered--;
        if (this.queueHeadOffset >= head.length) { this.queue.shift(); this.queueHeadOffset = 0; }
      }
    };
    this.playProc.connect(this.ctx.destination);
  }

  private onRemoteChunk(data: ArrayBuffer | Uint8Array): void {
    if (!this.ctx) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const pcm16k = decodeMuLaw(bytes);
    const pcm = resample(pcm16k, TARGET_RATE, this.ctx.sampleRate);
    // Cap the buffer so a slow listener can't accumulate unbounded latency (~2s).
    if (this.buffered > this.ctx.sampleRate * 2) { this.queue.length = 0; this.queueHeadOffset = 0; this.buffered = 0; }
    this.queue.push(pcm);
    this.buffered += pcm.length;
  }

  disconnect(): void {
    this.leave();
    this.teardownCapture();
    try { this.playProc?.disconnect(); } catch { /* ignore */ }
    this.playProc = null;
    this.queue = [];
    this.queueHeadOffset = 0;
    this.buffered = 0;
    this.playing = false;
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    try { this.socket?.disconnect(); } catch { /* ignore */ }
    this.socket = null;
  }
}
