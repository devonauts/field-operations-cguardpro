/**
 * Radio "Canal abierto" — live PTT voice engine on LiveKit (WebRTC).
 *
 * Replaces the old socket.io + µ-law/ScriptProcessor relay with the self-hosted
 * LiveKit SFU (wss://livekit.cguardpro.com): Opus, encrypted (DTLS-SRTP),
 * jitter-buffered, with a coturn TURN fallback for locked-down networks. The
 * public interface (connect / join / startTalk / stopTalk / resume / disconnect
 * + callbacks) is UNCHANGED, so RadioContext and the UI keep working as-is.
 *
 * Push-to-talk: the mic track is DISABLED by default; startTalk() enables it
 * (publishes), stopTalk() disables it (mutes) — the guard only transmits while
 * holding. Everyone hears everyone; the UI shows the active speaker and blocks
 * the button while someone else is talking. Runs on the WebView's built-in
 * WebRTC + getUserMedia, so it needs NO permission beyond RECORD_AUDIO (already
 * granted) and rides the Phase-1 microphone foreground service for background.
 */
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  setLogLevel,
  type RemoteTrack,
  type Participant,
} from "livekit-client";
import i18n from "@/i18n";

// Quiet LiveKit's default logger — its periodic debug lines (incl. a bare
// `undefined` every stats tick) flood logcat via Capacitor/Console.
setLogLevel("warn");

export type VoiceMember = { userId: string; name: string; role: string };
export type VoiceSpeaker = { userId: string; name: string } | null;
export type VoiceState = "idle" | "connecting" | "connected" | "error";

export interface VoiceCallbacks {
  onState?: (s: VoiceState) => void;
  onPresence?: (roster: VoiceMember[]) => void;
  onSpeaker?: (speaker: VoiceSpeaker) => void;
  onError?: (msg: string) => void;
}

export class VoiceChannel {
  private room: Room | null = null;
  private cb: VoiceCallbacks = {};
  private selfId = "";
  private attached = new Map<string, HTMLMediaElement>();
  /** identity of whoever we last reported as the active speaker (for prompt clearing). */
  private speakerId: string | null = null;
  /** true once the LiveKit room is connected (RadioContext polls this). */
  joined = false;
  /**
   * Set by disconnect(). start() re-checks it after every await: a disconnect
   * that lands during the token fetch (clock-out / reconnectTick teardown)
   * would otherwise no-op (room is still null) and the in-flight start() would
   * connect an ownerless room + leak its hidden <audio> elements.
   */
  private disposed = false;

  get connected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  /**
   * `url` = the API origin, `token` = the app auth JWT, `tenantId` = current
   * tenant. We fetch a scoped LiveKit token from the backend, then join the room.
   * (Signature kept identical to the old socket.io engine so RadioContext is
   * unchanged; `path` is now ignored.)
   */
  connect(
    opts: { url: string; path?: string; token: string; tenantId: string; selfId?: string; channel?: string },
    cb: VoiceCallbacks,
  ): void {
    this.cb = cb || {};
    this.selfId = opts.selfId || "";
    this.disposed = false;
    this.cb.onState?.("connecting");
    void this.start(opts);
  }

  private async start(opts: { url: string; token: string; tenantId: string; channel?: string }): Promise<void> {
    try {
      const base = opts.url.replace(/\/+$/, "");
      const resp = await fetch(`${base}/api/tenant/${opts.tenantId}/radio/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
        body: JSON.stringify({ channel: opts.channel || "general" }),
      });
      if (!resp.ok) throw new Error(`radio token ${resp.status}`);
      const data: any = await resp.json();
      const url: string = data?.url;
      const token: string = data?.token;
      const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
      if (!url || !token) throw new Error("radio token payload");
      if (this.disposed) return; // disconnected while fetching the token

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        // Comms-grade capture (matches a real radio — AEC/NS/AGC).
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        ...(iceServers.length ? { rtcConfig: { iceServers } } : {}),
      });
      this.room = room;

      room
        .on(RoomEvent.Connected, () => {
          this.joined = true;
          this.cb.onState?.("connected");
          this.emitRoster();
          void room.startAudio().catch(() => {}); // unlock playback (best-effort)
        })
        .on(RoomEvent.Disconnected, () => {
          this.joined = false;
          this.setSpeaker(null);
          this.cb.onState?.("idle");
        })
        .on(RoomEvent.Reconnecting, () => this.cb.onState?.("connecting"))
        .on(RoomEvent.Reconnected, () => {
          this.cb.onState?.("connected");
          this.emitRoster();
        })
        .on(RoomEvent.ParticipantConnected, () => this.emitRoster())
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          // If the speaker dropped (or the loop killed their session), clear the
          // "X está hablando" prompt immediately — don't leave it stuck.
          if (p && p.identity === this.speakerId) this.setSpeaker(null);
          this.emitRoster();
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          const sid = track.sid;
          if (track.kind === Track.Kind.Audio && sid) {
            const el = track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
            this.attached.set(sid, el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          const sid = track.sid;
          const el = sid ? this.attached.get(sid) : undefined;
          if (el && sid) {
            try { track.detach(el); el.remove(); } catch { /* ignore */ }
            this.attached.delete(sid);
          }
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const s = speakers[0];
          this.setSpeaker(s ? { userId: s.identity, name: s.name || "—" } : null);
        })
        .on(RoomEvent.TrackMuted, (_pub: any, p: Participant) => {
          // PTT release mutes the mic → clear the "X está hablando" prompt
          // instantly instead of waiting on the speaker-detector's hold time.
          if (p && p.identity === this.speakerId) this.setSpeaker(null);
        });

      await room.connect(url, token, { autoSubscribe: true });
      if (this.disposed) { void room.disconnect(); return; }
      // Pre-grant the mic permission now (join is a user gesture) so the FIRST
      // push-to-talk publishes instantly instead of the permission prompt
      // interrupting the hold. Best-effort; the track is released immediately —
      // the mic only actually publishes on startTalk().
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch { /* user can still grant on first PTT */ }
    } catch (e: any) {
      if (this.disposed) return;
      this.cb.onState?.("error");
      this.cb.onError?.(e?.message || i18n.t("radio.connectError", "No se pudo conectar la radio"));
    }
  }

  private setSpeaker(sp: VoiceSpeaker): void {
    this.speakerId = sp ? sp.userId : null;
    this.cb.onSpeaker?.(sp);
  }

  private emitRoster(): void {
    const room = this.room;
    if (!room) return;
    const roster: VoiceMember[] = [];
    const push = (p: Participant | undefined | null) => {
      if (p) roster.push({ userId: p.identity, name: p.name || "—", role: "" });
    };
    push(room.localParticipant);
    room.remoteParticipants.forEach((p) => push(p));
    this.cb.onPresence?.(roster);
  }

  /**
   * LiveKit's connect() already joins the room; RadioContext polls this until
   * `joined`, so resolve with the current roster when connected, else throw to
   * make its backoff loop retry.
   */
  async join(): Promise<{ roster: VoiceMember[]; speaker: VoiceSpeaker }> {
    if (!this.room || !this.connected || !this.joined) throw new Error("not connected");
    const room = this.room;
    const roster: VoiceMember[] = [
      { userId: room.localParticipant.identity, name: room.localParticipant.name || "—", role: "" },
    ];
    room.remoteParticipants.forEach((p) => roster.push({ userId: p.identity, name: p.name || "—", role: "" }));
    return { roster, speaker: null };
  }

  async startTalk(): Promise<{ ok: boolean; busyWith?: string; error?: string }> {
    if (!this.room || !this.connected) return { ok: false, error: i18n.t("radio.notConnected", "Radio no conectada") };
    try {
      await this.room.localParticipant.setMicrophoneEnabled(true);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || i18n.t("radio.micAccessError", "No se pudo acceder al micrófono.") };
    }
  }

  stopTalk(): void {
    try { void this.room?.localParticipant.setMicrophoneEnabled(false); } catch { /* ignore */ }
  }

  /** Foreground/gesture: unlock audio playback (WebViews suspend it in background). */
  resume(): void {
    try { void this.room?.startAudio(); } catch { /* ignore */ }
  }

  leave(): void {
    this.disconnect();
  }

  disconnect(): void {
    this.disposed = true;
    this.joined = false;
    this.speakerId = null;
    try {
      this.attached.forEach((el) => { try { el.remove(); } catch { /* ignore */ } });
      this.attached.clear();
      void this.room?.disconnect();
    } catch { /* ignore */ }
    this.room = null;
  }
}
