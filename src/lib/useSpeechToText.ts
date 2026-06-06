import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

/**
 * Cross-platform speech-to-text.
 *  - Native (iOS/Android): @capacitor-community/speech-recognition.
 *  - Web/dev: the Web Speech API (webkitSpeechRecognition) when available.
 *
 * Recognized speech is delivered to `onResult` (final text, to append to the
 * field). `interim` holds the live partial transcript for display. The mic is
 * hidden by the caller when `supported` is false.
 */
export function useSpeechToText(opts: {
  onResult: (text: string) => void;
  lang?: string;
}) {
  const { onResult, lang = "es-ES" } = opts;
  const native = Capacitor.isNativePlatform();

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState<boolean>(native);

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const latestRef = useRef("");
  const webRecRef = useRef<any>(null);

  // Probe availability once.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (native) {
        try {
          const { available } = await SpeechRecognition.available();
          if (alive) setSupported(!!available);
        } catch {
          if (alive) setSupported(false);
        }
      } else {
        const W: any = window;
        setSupported(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
      }
    })();
    return () => {
      alive = false;
    };
  }, [native]);

  const stop = useCallback(async () => {
    if (native) {
      try {
        await SpeechRecognition.stop();
      } catch {
        /* ignore */
      }
      try {
        await SpeechRecognition.removeAllListeners();
      } catch {
        /* ignore */
      }
    } else if (webRecRef.current) {
      try {
        webRecRef.current.stop();
      } catch {
        /* ignore */
      }
      webRecRef.current = null;
    }
    // Commit whatever was captured but not yet flushed (native partial buffer).
    const pending = latestRef.current.trim();
    if (pending) onResultRef.current(pending);
    latestRef.current = "";
    setInterim("");
    setListening(false);
  }, [native]);

  const start = useCallback(async () => {
    latestRef.current = "";
    setInterim("");

    if (native) {
      try {
        const perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== "granted") {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== "granted") {
            setSupported(true); // supported, just not permitted
            return;
          }
        }
        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener("partialResults", (data: any) => {
          const txt = (data?.matches && data.matches[0]) || "";
          if (txt) {
            latestRef.current = txt;
            setInterim(txt);
          }
        });
        setListening(true);
        // On Android this resolves with the final matches when recognition ends.
        const res: any = await SpeechRecognition.start({
          language: lang,
          maxResults: 2,
          partialResults: true,
          popup: false,
        });
        const finalTxt = (res?.matches && res.matches[0]) || latestRef.current;
        if (finalTxt && finalTxt.trim()) {
          onResultRef.current(finalTxt.trim());
          latestRef.current = "";
        }
        await SpeechRecognition.removeAllListeners();
        setInterim("");
        setListening(false);
      } catch (e) {
        setListening(false);
        setInterim("");
      }
      return;
    }

    // ── Web fallback ──────────────────────────────────────────────────────
    const W: any = window;
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) {
      setSupported(false);
      return;
    }
    const rec = new Rec();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalT = "";
      let interimT = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalT += r[0].transcript;
        else interimT += r[0].transcript;
      }
      if (finalT.trim()) onResultRef.current(finalT.trim());
      setInterim(interimT);
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      webRecRef.current = null;
    };
    webRecRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [native, lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (native) {
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      } else if (webRecRef.current) {
        try {
          webRecRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, [native]);

  return { supported, listening, interim, start, stop, toggle };
}
