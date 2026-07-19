import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiOrigin, getToken, getTenantId } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { VoiceChannel, type VoiceMember, type VoiceSpeaker, type VoiceState } from "@/lib/voiceChannel";
import { ensureMicPermission } from "@/lib/micPermission";
import { getDuty, subscribeDuty } from "@/lib/dutyState";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/backgroundAudio";
import { App as CapApp } from "@capacitor/app";
import i18n from "@/i18n";

interface RadioContextValue {
  onDuty: boolean;
  state: VoiceState;
  roster: VoiceMember[];
  speaker: VoiceSpeaker;
  talking: boolean;
  hint: string | null;
  myId?: string;
  someoneElseTalking: boolean;
  resume: () => void;
  pressTalk: () => void;
  releaseTalk: () => void;
}

const RadioContext = createContext<RadioContextValue | null>(null);

/**
 * App-level live-radio (Canal abierto) provider. Owns a SINGLE VoiceChannel that
 * connects + joins ONLY while the guard is on duty, and stays connected across
 * screen changes — so the guard keeps hearing the channel and can push-to-talk
 * from the floating button without opening the radio screen. Off duty it fully
 * disconnects (no audio, no presence). The radio screen consumes this same
 * context so there's never a second connection for the same user.
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const myId = user?.id;

  const [onDuty, setOnDuty] = useState<boolean>(getDuty());
  const [state, setState] = useState<VoiceState>("idle");
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [speaker, setSpeaker] = useState<VoiceSpeaker>(null);
  const [talking, setTalking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const vcRef = useRef<VoiceChannel | null>(null);
  const pressedRef = useRef(false);
  const speakerRef = useRef<VoiceSpeaker>(null);
  speakerRef.current = speaker;

  // Full-restart reconnect: livekit-client retries transient drops itself, but
  // once it gives up (long background suspension, network handoff) it emits
  // Disconnected and STAYS down — and its internal retries reuse the original
  // join token, which the backend only signs for a few hours. Bumping this tick
  // re-runs the connect effect: a brand-new VoiceChannel that fetches a FRESH
  // token. Delay doubles 2s→30s between dead attempts, resets once connected.
  const [reconnectTick, setReconnectTick] = useState(0);
  const reconnectDelayRef = useRef(2000);

  // Track duty changes (clock in/out publishes here).
  useEffect(() => {
    setOnDuty(getDuty());
    return subscribeDuty((v) => setOnDuty(v));
  }, []);

  // Connect + join while on duty; tear everything down off duty.
  useEffect(() => {
    if (!myId || !onDuty) {
      if (vcRef.current) {
        try { vcRef.current.disconnect(); } catch { /* ignore */ }
        vcRef.current = null;
      }
      // Off duty: release the native keep-alive (no reason to drain battery /
      // hold the mic when there's no channel to keep alive).
      stopBackgroundAudio();
      setState("idle");
      setRoster([]);
      setSpeaker(null);
      setTalking(false);
      return;
    }

    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReconnect = () => {
      if (!alive || reconnectTimer) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(30000, delay * 2);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (alive) setReconnectTick((t) => t + 1);
      }, delay);
    };

    const vc = new VoiceChannel();
    vcRef.current = vc;
    vc.connect(
      { url: apiOrigin, path: "/api/socket.io", token: getToken() || "", tenantId: getTenantId(), selfId: myId },
      {
        // Every callback checks `alive`: after a reconnect restarts the effect,
        // the OLD room's async Disconnected event must not clobber the state of
        // the NEW channel that replaced it.
        onState: (s) => {
          if (!alive) return;
          setState(s);
          if (s === "connected") reconnectDelayRef.current = 2000;
          // "idle"/"error" while we're still supposed to be on the channel means
          // LiveKit gave up (or the initial connect failed) — restart from scratch.
          if (s === "idle" || s === "error") scheduleReconnect();
        },
        onPresence: (r) => { if (alive) setRoster(r); },
        onSpeaker: (sp) => { if (alive) setSpeaker(sp); },
        onError: (m) => { if (alive) setHint(m); },
      },
    );
    // Keep the app alive in the background (iOS suspends a backgrounded WebView,
    // which would freeze the socket + Web Audio). The native silent loop holds the
    // process running so the radio keeps receiving when the guard is in another
    // app or the screen is locked. Runs only while connected (on duty).
    startBackgroundAudio();

    // Join with EXPONENTIAL BACKOFF (not a fixed 400ms hammer): retry only when
    // connected-but-not-joined, backing off 300ms→~8s on transient rejects so a
    // rate-limit/error can't spin the loop. Resets on success; stops when joined.
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let delay = 300;
    const MAX_DELAY = 8000;
    const reschedule = () => {
      if (!alive || timeoutId) return;
      timeoutId = setTimeout(attempt, delay);
      delay = Math.min(MAX_DELAY, Math.round(delay * 1.8));
    };
    const attempt = () => {
      timeoutId = null;
      if (!alive || vc.joined) return;
      if (!vc.connected) { reschedule(); return; }
      vc.join()
        .then(({ roster, speaker }) => {
          if (!alive) return;
          setRoster(roster); setSpeaker(speaker);
          delay = 300; // reset backoff on success
          if (!vc.joined) reschedule();
        })
        .catch(() => { if (alive) reschedule(); });
    };
    attempt();

    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { vc.disconnect(); } catch { /* ignore */ }
      stopBackgroundAudio();
      vcRef.current = null;
    };
  }, [myId, onDuty, reconnectTick]);

  // Returning to the foreground after iOS throttled the WebView: the AudioContext
  // is often left "suspended" (silence) and socket.io may be mid-reconnect. Resume
  // the context so playback flows again the instant the guard re-opens the app.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    (async () => {
      try {
        sub = await CapApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          try { vcRef.current?.resume(); } catch { /* ignore */ }
          // If the room died while backgrounded (iOS suspension outlives LiveKit's
          // reconnect window; timers were frozen so the backoff never ran),
          // restart NOW with a fresh token instead of waiting for a stale timer.
          const vc = vcRef.current;
          if (vc && !vc.connected) {
            reconnectDelayRef.current = 2000;
            setReconnectTick((t) => t + 1);
          }
        });
      } catch { /* not native / no listener */ }
    })();
    return () => { try { sub?.remove(); } catch { /* ignore */ } };
  }, []);

  const resume = useCallback(() => { vcRef.current?.resume(); }, []);

  const pressTalk = useCallback(async () => {
    const vc = vcRef.current;
    if (!vc || state === "connecting") return;
    const sp = speakerRef.current;
    if (sp && sp.userId !== myId) {
      setHint(i18n.t("radio.xTalking", { name: sp.name, defaultValue: "{{name}} está hablando" }));
      return;
    }
    pressedRef.current = true;
    setHint(null);
    if (!(await ensureMicPermission())) {
      pressedRef.current = false;
      setHint(i18n.t("radio.micPermissionHint", "Activa el permiso de micrófono en Perfil → Permisos."));
      return;
    }
    if (!pressedRef.current) return; // released during the permission prompt
    const r = await vc.startTalk();
    if (!pressedRef.current) { vc.stopTalk(); return; } // released mid-acquire
    if (r?.ok) setTalking(true);
    else if (r?.busyWith) setHint(i18n.t("radio.xTalking", { name: r.busyWith, defaultValue: "{{name}} está hablando" }));
    else setHint(r?.error || i18n.t("radio.micAccessError", "No se pudo acceder al micrófono."));
  }, [state, myId]);

  const releaseTalk = useCallback(() => {
    pressedRef.current = false;
    vcRef.current?.stopTalk();
    setTalking(false);
  }, []);

  const someoneElseTalking = !!speaker && speaker.userId !== myId;

  // Memoize the context value so a roster/speaker/talking tick doesn't re-render
  // EVERY useRadio() consumer (FloatingRadioButton, RadioLiveChannel, …) — the
  // core of the app is live PTT, so this fires constantly.
  const value = useMemo(
    () => ({ onDuty, state, roster, speaker, talking, hint, myId, someoneElseTalking, resume, pressTalk, releaseTalk }),
    [onDuty, state, roster, speaker, talking, hint, myId, someoneElseTalking, resume, pressTalk, releaseTalk],
  );

  return (
    <RadioContext.Provider value={value}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio(): RadioContextValue {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used within <RadioProvider>");
  return ctx;
}
