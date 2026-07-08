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
  type RemoteTrack,
  type Participant,
} from "livekit-client";

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
  /** true once the LiveKit room is connected (RadioContext polls this). */
  joined = false;

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
          this.cb.onState?.("idle");
        })
        .on(RoomEvent.Reconnecting, () => this.cb.onState?.("connecting"))
        .on(RoomEvent.Reconnected, () => {
          this.cb.onState?.("connected");
          this.emitRoster();
        })
        .on(RoomEvent.ParticipantConnected, () => this.emitRoster())
        .on(RoomEvent.ParticipantDisconnected, () => this.emitRoster())
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
          this.cb.onSpeaker?.(s ? { userId: s.identity, name: s.name || "—" } : null);
        });

      await room.connect(url, token, { autoSubscribe: true });
      // Start MUTED — PTT publishes the mic on demand.
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    } catch (e: any) {
      this.cb.onState?.("error");
      this.cb.onError?.(e?.message || "No se pudo conectar la radio");
    }
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
    if (!this.room || !this.connected) return { ok: false, error: "Radio no conectada" };
    try {
      await this.room.localParticipant.setMicrophoneEnabled(true);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "No se pudo acceder al micrófono" };
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
    this.joined = false;
    try {
      this.attached.forEach((el) => { try { el.remove(); } catch { /* ignore */ } });
      this.attached.clear();
      void this.room?.disconnect();
    } catch { /* ignore */ }
    this.room = null;
  }
}
