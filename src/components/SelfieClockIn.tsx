import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { Camera, MapPin, RefreshCw, Check, X, Loader2, ShieldCheck } from "lucide-react";
import { getCurrentPosition, reverseGeocode, Coords } from "@/lib/geo";
import { getAppTimeZone } from "@/lib/format";
import { logError, logInfo } from "@/lib/errorLog";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera } from "@capacitor/camera";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { playShutter, playSuccess } from "@/lib/shutter";

export interface SelfieResult {
  file: File;
  dataUrl: string;
  // Optional: a GPS fix may be unavailable (denied/slow, or testing with the
  // geofence bypass). Clock-in still proceeds; the backend enforces location
  // only when the geofence is on.
  coords: Coords | null;
  address: string;
}

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number
): number {
  const words = (text || "").split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineH;
      if (++lines >= maxLines - 1) {
        // last allowed line: print remainder (possibly truncated)
        let rest = words.slice(i).join(" ");
        while (ctx.measureText(rest + "…").width > maxW && rest.length > 1)
          rest = rest.slice(0, -1);
        ctx.fillText(rest + (words.slice(i).join(" ").length > rest.length ? "…" : ""), x, y);
        return y + lineH;
      }
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineH;
  }
  return y;
}

export function SelfieClockIn({
  isOpen,
  guardName,
  stationName,
  onCancel,
  onCapture,
}: {
  isOpen: boolean;
  guardName: string;
  stationName: string;
  onCancel: () => void;
  onCapture: (r: SelfieResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"camera" | "preview">("camera");
  const [now, setNow] = useState(() => new Date());
  const [coords, setCoords] = useState<Coords | null>(null);
  const [address, setAddress] = useState<string>("");
  const [locating, setLocating] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  // `videoReady` is true only once the <video> is actually rendering frames
  // (videoWidth > 0). play() resolving is NOT enough — there's a window where
  // the stream is attached but the element is still black. We keep an opaque
  // placeholder up, and the shutter disabled, until this flips true.
  const [videoReady, setVideoReady] = useState(false);
  const [stamped, setStamped] = useState<{ file: File; dataUrl: string } | null>(null);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the shutter-flash timer on unmount so it can't setState after the
  // screen closes (confirm/cancel can unmount within the 320ms window).
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  // breadcrumb: when the selfie screen opens (so the flow is visible in logs)
  useEffect(() => {
    if (isOpen) logInfo("selfie.open", "screen opened", { phase });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // live clock — only ticks while the live viewfinder is shown (the preview
  // phase displays a frozen stamped image and doesn't read `now`).
  useEffect(() => {
    if (!isOpen || phase !== "camera") return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [isOpen, phase]);

  const stopStream = useCallback(() => {
    setVideoReady(false);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    // Release the dead stream from the <video> element immediately so the
    // reused element doesn't retain it (and doesn't show a black frame on
    // re-entry in some WebViews).
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Open the FRONT camera INSIDE the WebView (true selfie, no external activity
  // → the screen never gets suspended/recreated). On a device we first ensure
  // the OS camera permission is granted so the WebView's getUserMedia is allowed
  // (the native WebChromeClient grants the WebView's own request — see
  // android MainActivity).
  // `alive()` returns false once the effect that started this acquisition has
  // been cleaned up (e.g. React StrictMode's mount→unmount→mount in dev, or a
  // fast modal close). getUserMedia is async, so a stream can resolve AFTER
  // cleanup — we must discard it instead of attaching a soon-to-be-dead stream
  // (the classic "camera turns on then goes black, no error" bug).
  const startCamera = useCallback(async (alive: () => boolean) => {
    setCamError(null);
    setVideoReady(false);
    logInfo("selfie.cam", "request");
    try {
      if (Capacitor.isNativePlatform()) {
        try {
          await CapacitorCamera.requestPermissions({ permissions: ["camera"] });
        } catch {
          /* if the plugin prompt fails, getUserMedia still tries below */
        }
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia unavailable in this browser/context");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      if (!alive()) {
        // The effect was torn down while we were awaiting — drop this stream.
        stream.getTracks().forEach((tr) => tr.stop());
        logInfo("selfie.cam", "discarded (not alive)");
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      logInfo("selfie.cam", "ready", {
        w: videoRef.current?.videoWidth ?? null,
        h: videoRef.current?.videoHeight ?? null,
      });
    } catch (e: any) {
      if (!alive()) return;
      logError("selfie.startCamera", e, {
        secureContext: (window as any).isSecureContext,
        hasMediaDevices: !!navigator.mediaDevices,
        platform: Capacitor.getPlatform(),
      });
      setCamError(e?.message || e?.name || "camera");
    }
  }, []);

  // (Re)acquire the camera whenever we enter the camera phase while open.
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      return;
    }
    if (phase !== "camera") return;
    let alive = true;
    startCamera(() => alive);
    return () => {
      alive = false;
      stopStream();
    };
  }, [isOpen, phase, startCamera, stopStream]);

  useEffect(() => {
    if (!isOpen) return;
    // TESTING: skip GPS entirely so you can test far from any station with no
    // prompt/wait. Coords stay null; clock-in proceeds without them.
    if (import.meta.env.VITE_DISABLE_GEOLOCATION === "true") {
      setCoords(null);
      setAddress("");
      setLocating(false);
      logInfo("selfie.location", "disabled (VITE_DISABLE_GEOLOCATION)");
      return;
    }
    let cancelled = false;
    setLocating(true);
    (async () => {
      try {
        const pos = await getCurrentPosition();
        if (cancelled) return;
        setCoords(pos);
        const addr = await reverseGeocode(pos.latitude, pos.longitude);
        if (!cancelled) setAddress(addr);
      } catch (e) {
        // Location is OPTIONAL for the selfie — never blocks the camera/capture.
        logError("selfie.location", e);
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Fired by the <video> element's playback events. Only treat the camera as
  // ready once real frame dimensions are available — some WebViews fire
  // loadeddata/canplay before videoWidth is populated.
  const handleVideoReady = useCallback(() => {
    const v = videoRef.current;
    if (v && v.videoWidth > 0) setVideoReady(true);
  }, []);

  const fmtTime = (d: Date) => {
    const opts: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const tz = getAppTimeZone();
    // Never let a bad timezone throw during render and crash the selfie screen.
    try {
      return new Intl.DateTimeFormat(i18n.language || "es", {
        ...opts,
        ...(tz ? { timeZone: tz } : {}),
      }).format(d);
    } catch {
      return new Intl.DateTimeFormat(i18n.language || "es", opts).format(d);
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      // Shutter tapped but the camera frame isn't ready — surface it instead of
      // silently doing nothing (a common "nothing happens" report).
      logError("selfie.capture", "video not ready", {
        hasVideo: !!video,
        videoWidth: video?.videoWidth ?? null,
        readyState: video?.readyState ?? null,
      });
      setCamError("camera frame not ready — wait a second and retry");
      return;
    }
    // Fire the shutter feedback the instant the tap lands — synthesized click,
    // a haptic tap, and a white flash over the viewfinder. All best-effort: none
    // of it can block or fail the actual capture below.
    playShutter();
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 320);
    try {
      logInfo("selfie.cap", "start", { w: video.videoWidth, h: video.videoHeight });
      const r = await captureFrame(video);
      logInfo("selfie.cap", "done");
      return r;
    } catch (e: any) {
      logError("selfie.capture", e);
      setCamError(e?.message || "capture failed");
    }
  };

  const captureFrame = async (video: HTMLVideoElement) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // mirror to match the selfie preview
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    // ---- stamp ----
    // Scale by the SHORT side: the front camera often hands back a landscape
    // frame (w > h), and sizing off `w` then overflowed the band off the bottom
    // of the image (the guard/station line got cut off). `s` keeps it compact.
    const stampTime = new Date();
    const s = Math.min(w, h);
    const pad = s * 0.045;
    const bandH = Math.min(h * 0.42, s * 0.34);
    const g = ctx.createLinearGradient(0, h - bandH, 0, h);
    g.addColorStop(0, "rgba(4,6,12,0)");
    g.addColorStop(0.45, "rgba(4,6,12,0.6)");
    g.addColorStop(1, "rgba(4,6,12,0.94)");
    ctx.fillStyle = g;
    ctx.fillRect(0, h - bandH, w, bandH);

    ctx.textBaseline = "top";
    // CGuardPro tag
    ctx.font = `800 ${s * 0.030}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = "#D4A017";
    ctx.fillText("CGuardPro", pad, h - bandH + pad * 0.6);

    let y = h - bandH + pad * 1.7;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 ${s * 0.044}px Helvetica, Arial, sans-serif`;
    ctx.fillText(fmtTime(stampTime), pad, y);
    y += s * 0.058;

    ctx.fillStyle = "#D7DCE4";
    ctx.font = `500 ${s * 0.030}px Helvetica, Arial, sans-serif`;
    const addrLine = address || (coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : t("selfie.locating"));
    y = wrapText(ctx, addrLine, pad, y, w - pad * 2, s * 0.038, 2) + s * 0.005;

    ctx.fillStyle = "#9AA3B7";
    ctx.font = `500 ${s * 0.026}px Helvetica, Arial, sans-serif`;
    if (coords) {
      ctx.fillText(
        `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}` +
          (coords.accuracy ? `  ·  ±${Math.round(coords.accuracy)}m` : ""),
        pad,
        y
      );
      y += s * 0.036;
    }
    ctx.fillText(`${guardName}  ·  ${stationName}`, pad, y);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.9)
    );
    const file = new File([blob], `clockin-${Date.now()}.jpg`, { type: "image/jpeg" });
    stopStream();
    setStamped({ file, dataUrl });
    setPhase("preview");
  };

  const confirm = () => {
    if (!stamped) return;
    // Confirmation feedback while the stamped selfie is still on screen — an
    // ascending chime + a success haptic as the clock-in event fires.
    playSuccess();
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    onCapture({ file: stamped.file, dataUrl: stamped.dataUrl, coords, address });
  };

  const retake = () => {
    setStamped(null);
    setCamError(null);
    setPhase("camera");
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onCancel}>
      <div className="relative flex h-full w-full flex-col bg-black">
        {/* top bar */}
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <button onClick={onCancel} className="rounded-full bg-black/45 p-2 text-white active:opacity-70">
            <X size={22} />
          </button>
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white">
            <ShieldCheck size={14} className="text-gold" />
            {t("selfie.title")}
          </div>
          <div className="w-9" />
        </div>

        {/* camera / preview */}
        <div className="relative flex-1 overflow-hidden">
          {flash && (
            <div className="shutter-flash pointer-events-none absolute inset-0 z-30 bg-white" />
          )}
          {phase === "camera" ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedData={handleVideoReady}
                onCanPlay={handleVideoReady}
                onPlaying={handleVideoReady}
                className="h-full w-full bg-black object-contain"
                style={{ transform: "scaleX(-1)" }}
              />
              {/* face guide (only once the live frame is actually showing) */}
              {videoReady && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[42%] w-[64%] rounded-[50%] border-2 border-white/40" />
                </div>
              )}
              {/* Opaque placeholder until the camera is fully out (frames flowing). */}
              {!videoReady && !camError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                  <Camera size={40} className="text-faint" />
                  <Loader2 size={28} className="animate-spin text-gold" />
                  <p className="text-sm text-muted">{t("selfie.starting", "Abriendo cámara…")}</p>
                </div>
              )}
              {camError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-8 text-center">
                  <Camera size={40} className="text-faint" />
                  <p className="text-sm text-muted">{t("selfie.cameraError")}</p>
                  {/* Show the real reason so we can diagnose on-device. */}
                  <p className="max-w-full break-words px-2 text-[11px] text-faint">
                    {camError}
                    {!(window as any).isSecureContext
                      ? " · (origen no seguro: la cámara requiere HTTPS o localhost)"
                      : ""}
                  </p>
                  <button
                    onClick={() => startCamera(() => true)}
                    className="mt-1 rounded-lg border border-line px-4 py-2 text-sm text-ink active:bg-surface-2"
                  >
                    {t("selfie.retry", "Reintentar")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <img src={stamped?.dataUrl} className="h-full w-full bg-black object-contain" alt="selfie" />
          )}

          {/* live info chips (camera mode) — only once the frame is showing */}
          {phase === "camera" && !camError && videoReady && (
            <div
              className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10"
            >
              <div className="text-2xl font-bold tabular-nums text-white">{fmtTime(now)}</div>
              <div className="flex items-start gap-1.5 text-[13px] text-white/85">
                {locating ? (
                  <><Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-gold" />{t("selfie.locating")}</>
                ) : (
                  <><MapPin size={14} className="mt-0.5 shrink-0 text-gold" />{address || (coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : t("selfie.noLocation"))}</>
                )}
              </div>
            </div>
          )}
        </div>

        {/* footer controls */}
        <div className="border-t border-line bg-background px-4 pt-4" style={footerStyle}>
          {phase === "camera" ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={capture}
                disabled={!!camError || !videoReady || locating}
                aria-label={t("selfie.hint")}
                className="shutter-btn flex h-20 w-20 items-center justify-center rounded-full border-4 border-gold bg-gold-soft transition-transform disabled:animate-none disabled:opacity-40"
              >
                <Camera size={30} className="text-gold" />
              </button>
              {/* Tell the guard WHY the shutter is still disabled (camera warming
                  up, or waiting for the GPS fix) so we never capture without a
                  location and crash downstream. */}
              <p className="text-xs text-faint">
                {!videoReady
                  ? t("selfie.starting", "Abriendo cámara…")
                  : locating
                  ? t("selfie.waitingLocation", "Obteniendo ubicación…")
                  : t("selfie.hint")}
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={retake} className="btn-xl flex-1 border border-line text-muted active:bg-surface-2">
                <RefreshCw size={18} />{t("selfie.retake")}
              </button>
              <button
                onClick={confirm}
                className="btn-xl flex-[2] bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
              >
                <Check size={18} />{t("selfie.confirm")}
              </button>
            </div>
          )}
        </div>
      </div>
    </IonModal>
  );
}
