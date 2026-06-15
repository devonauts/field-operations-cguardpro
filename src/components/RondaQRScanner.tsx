import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Keyboard, Loader2, CameraOff } from "lucide-react";

const ELEMENT_ID = "ronda-qr-reader";

/**
 * Reusable QR scanner (html5-qrcode). Calls `onScan` with the decoded value.
 * Falls back to manual code entry when the camera is unavailable or denied.
 */
export function RondaQRScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const scannerRef = useRef<any>(null);
  const handled = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!active) return;
        const scanner = new Html5Qrcode(ELEMENT_ID, { verbose: false } as any);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => {
            if (handled.current) return;
            handled.current = true;
            onScan(decoded);
          },
          () => {
            /* per-frame decode failures are normal; ignore */
          }
        );
        if (active) setStatus("scanning");
      } catch {
        if (active) {
          setStatus("error");
          setManual(true);
        }
      }
    })();

    return () => {
      active = false;
      const s = scannerRef.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-background" style={{ zIndex: 100000 }}>
      <div className="safe-top flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold text-ink">{t("rondas.scanTitle")}</h2>
        <button onClick={onClose} className="text-muted">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {/* html5-qrcode injects the video stream here */}
        <div id={ELEMENT_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
            <Loader2 size={28} className="animate-spin text-gold" />
            <span className="text-sm">{t("rondas.startingCamera")}</span>
          </div>
        )}
        {status === "scanning" && (
          <>
            <div className="pointer-events-none absolute h-60 w-60 rounded-2xl border-2 border-gold/80" />
            <p className="pointer-events-none absolute bottom-8 px-6 text-center text-sm text-white/80">
              {t("rondas.scanHint")}
            </p>
          </>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted">
            <CameraOff size={30} className="text-high" />
            <span className="text-sm">{t("rondas.cameraError")}</span>
          </div>
        )}
      </div>

      <div className="safe-bottom border-t border-line px-4 py-3">
        {manual ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder={t("rondas.manualPlaceholder")}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60"
            />
            <button
              onClick={() => manualValue.trim() && onScan(manualValue.trim())}
              disabled={!manualValue.trim()}
              className="btn-xl w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
            >
              {t("rondas.useCode")}
            </button>
          </div>
        ) : (
          <button onClick={() => setManual(true)} className="btn-xl w-full border border-line text-muted">
            <Keyboard size={18} />
            {t("rondas.manualEntry")}
          </button>
        )}
      </div>
    </div>
  );
}
