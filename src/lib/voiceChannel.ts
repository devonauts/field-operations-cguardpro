/**
 * Radio "Canal abierto" — live half-duplex PTT voice engine.
 *
 * Carries voice over the backend socket.io connection (free, passes through the
 * Cloudflare Tunnel as WebSocket — no UDP/TURN). Audio is captured as raw PCM via
 * Web Audio, downsampled to 16 kHz mono and µ-law (G.711) compressed (~128 kbps),
 * relayed by the server to the channel, and played back through Web Audio.
 *
 * Playback schedules each incoming chunk as an AudioBufferSourceNode (the most
 * reliable Web Audio output across iOS + Android — no ScriptProcessor/MSE/codecs).
 * Capture uses a short-lived ScriptProcessor on its own AudioContext, fully
 * released on stop. Floor control is enforced by the server (one talker at a time).
 * This module is framework-agnostic; the worker app and CRM share an identical copy.
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

  // capture (its own AudioContext so the mic doesn't fight playback, and is fully
  // released on stop — Android throws "Could not start audio source" otherwise)
  private capCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private capSource: MediaStreamAudioSourceNode | null = null;
  private capProc: ScriptProcessorNode | null = null;

  // playback (scheduled AudioBufferSourceNodes)
  private nextPlayTime = 0;

  private _talking = false;
  private selfId = "";
  joined = false;

  get talking() { return this._talking; }
  get connected() { return !!this.socket?.connected; }

  /** Resume the audio context from a user gesture (browsers/iOS need this to play
   *  sound even for listen-only users). Idempotent; safe to call on any tap. */
  resume(): void { try { this.ensureContext(); } catch { /* ignore */ } }

  /** Walkie-talkie chirp, synthesized (no asset). "open" = squelch-open static
   *  burst when a transmission starts; "close" = roger/courtesy beep when it ends. */
  private playChirp(kind: "open" | "close" | "ptt"): void {
    const ctx = this.ensureContext();
    try {
      const now = ctx.currentTime;
      const out = ctx.destination;
      if (kind === "ptt") {
        // Nextel-style PTT chirp: three quick ascending square blips. Played
        // locally the instant you take the floor — your cue to start talking.
        const blip = (freq: number, t0: number, len: number, vol = 0.14) => {
          const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = freq;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
          o.connect(g); g.connect(out);
          o.start(t0); o.stop(t0 + len + 0.01);
        };
        blip(1568, now, 0.05);
        blip(2093, now + 0.055, 0.05);
        blip(2637, now + 0.11, 0.085, 0.16);
      } else if (kind === "open") {
        const dur = 0.13;
        const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource(); noise.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        noise.connect(bp); bp.connect(g); g.connect(out);
        noise.start(now); noise.stop(now + dur);
        const osc = ctx.createOscillator(); osc.type = "square"; osc.frequency.value = 1500;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, now);
        og.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
        og.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        osc.connect(og); og.connect(out);
        osc.start(now); osc.stop(now + 0.07);
      } else {
        const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 1180;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
        osc.connect(g); g.connect(out);
        osc.start(now); osc.stop(now + 0.14);
      }
    } catch { /* ignore */ }
  }

  connect(opts: { url: string; path?: string; token: string; tenantId: string; selfId?: string }, cb: VoiceCallbacks): void {
    // Guard against a re-entrant connect() (reconnect / token refresh / re-run
    // effect): without this the old socket stays connected with its listeners
    // still bound to this.cb, double-binding presence/speaker/chunk handling and
    // leaking the orphaned WebSocket.
    if (this.socket) {
      try { this.socket.removeAllListeners(); } catch { /* ignore */ }
      try { this.socket.disconnect(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.cb = cb || {};
    this.selfId = opts.selfId || "";
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
      const speaking = !!s?.speaking;
      // Radio chirp for OTHER people's transmissions: squelch-open when they start,
      // a "roger" courtesy beep when they finish. (Skip our own.)
      if (s?.userId && s.userId !== this.selfId) this.playChirp(speaking ? "open" : "close");
      this.cb.onSpeaker?.(speaking ? { userId: s.userId, name: s.name } : null);
    });
    this.socket.on("radio:voice:chunk", (data: ArrayBuffer | Uint8Array) => this.onRemoteChunk(data));
  }

  private ensureContext(): AudioContext {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = (this.ctx || new AC()) as AudioContext;
    if (!this.ctx) this.ctx = ctx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  async join(): Promise<{ roster: VoiceMember[]; speaker: VoiceSpeaker }> {
    this.ensureContext(); // call from a user gesture (button tap) for autoplay policy
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
  async startTalk(): Promise<{ ok: boolean; busyWith?: string; error?: string }> {
    if (this._talking || !this.socket) return { ok: false };
    // Release any stale capture from a prior aborted attempt — a leftover mic
    // stream is the usual cause of Android's NotReadableError on the next press.
    this.teardownCapture();
    const granted = await new Promise<any>((resolve) => {
      this.socket!.emit("radio:voice:talk-request", {}, (res: any) => resolve(res));
    });
    if (!granted?.ok) return { ok: false, busyWith: granted?.speaker?.name };
    this.playChirp("ptt"); // Nextel-style press chirp — you've got the floor, go ahead
    try {
      this.ensureContext(); // keep playback context alive
      this.micStream = await this.acquireMic();
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const capCtx: AudioContext = new AC();
      this.capCtx = capCtx;
      if (capCtx.state === "suspended") await capCtx.resume().catch(() => {});
      this.capSource = capCtx.createMediaStreamSource(this.micStream);
      this.capProc = capCtx.createScriptProcessor(4096, 1, 1);
      const inRate = capCtx.sampleRate;
      this.capProc.onaudioprocess = (e) => {
        // Drop frames while disconnected rather than letting socket.io queue a
        // burst of stale audio that floods the channel on reconnect.
        if (!this._talking || !this.socket?.connected) return;
        const input = e.inputBuffer.getChannelData(0);
        const ds = resample(input, inRate, TARGET_RATE);
        const ulaw = encodeMuLaw(ds);
        this.socket.emit("radio:voice:chunk", ulaw.buffer);
      };
      // ScriptProcessor only fires when connected to the destination; route through
      // a zero-gain node so the talker never hears their own mic.
      const silent = capCtx.createGain();
      silent.gain.value = 0;
      this.capSource.connect(this.capProc);
      this.capProc.connect(silent);
      silent.connect(capCtx.destination);
      this._talking = true;
      return { ok: true };
    } catch (err: any) {
      this.socket?.emit("radio:voice:talk-end");
      const msg = `${err?.name || "Error"}: ${err?.message || "mic"}`;
      this.cb.onError?.(msg);
      this.teardownCapture();
      return { ok: false, error: msg };
    }
  }

  /** getUserMedia with graceful fallback: Android WebViews often reject processed
   *  or over-specified audio constraints with NotReadableError ("Could not start
   *  audio source") — fall back to the barest request. */
  private async acquireMic(): Promise<MediaStream> {
    const md = navigator.mediaDevices as any;
    if (!md?.getUserMedia) throw new Error("getUserMedia no disponible");
    const attempts: any[] = [
      { audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } },
      { audio: { channelCount: 1 } },
      { audio: true },
    ];
    let lastErr: any;
    // Android frequently returns NotReadableError ("could not start audio
    // source") transiently while the mic is still being released by a prior
    // session. Retry a few rounds with a short backoff before giving up.
    for (let round = 0; round < 3; round++) {
      for (const c of attempts) {
        try {
          return await md.getUserMedia(c);
        } catch (e: any) {
          lastErr = e;
          // A real permission denial won't recover by retrying — fail fast.
          if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw e;
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw lastErr;
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
    try { this.capCtx?.close(); } catch { /* ignore */ }
    this.capProc = null;
    this.capSource = null;
    this.micStream = null;
    this.capCtx = null;
  }

  /** Play an incoming µ-law frame: decode → resample → schedule sequentially. */
  private onRemoteChunk(data: ArrayBuffer | Uint8Array): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Drop late/replayed frames if we're no longer connected or in the channel.
    if (!this.socket?.connected || !this.joined) return;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    if (!bytes.length) return;
    const pcm16k = decodeMuLaw(bytes);
    const pcm = resample(pcm16k, TARGET_RATE, ctx.sampleRate);
    const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buf.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    // Release the node from the audio graph promptly once it finishes, so a long
    // continuous transmission doesn't pile up short-lived nodes before GC.
    src.onended = () => { try { src.disconnect(); } catch { /* ignore */ } };
    const now = ctx.currentTime;
    // Prime a small jitter buffer on the first packet / after a gap, and bound
    // latency if we ever fall too far behind.
    if (this.nextPlayTime < now + 0.06 || this.nextPlayTime > now + 1.5) this.nextPlayTime = now + 0.12;
    try { src.start(this.nextPlayTime); } catch { try { src.start(); } catch { /* ignore */ } }
    this.nextPlayTime += buf.duration;
  }

  disconnect(): void {
    this.leave();
    this.teardownCapture();
    this.nextPlayTime = 0;
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
    try { this.socket?.removeAllListeners(); } catch { /* ignore */ }
    try { this.socket?.disconnect(); } catch { /* ignore */ }
    this.socket = null;
  }
}
