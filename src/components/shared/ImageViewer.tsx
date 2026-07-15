import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import { X, Download, Pencil, Undo2, Send, Eraser } from "lucide-react";
import { useFileUrl } from "@/lib/fileUrl";
import { fb } from "@/lib/feedback";

const COLORS = ["#ffffff", "#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];

type Stroke = { color: string; width: number; pts: { x: number; y: number }[] };

/**
 * WhatsApp-style full-screen image viewer. Tap an image in a chat → open here:
 *  • View: pinch / double-tap to zoom, drag to pan, download.
 *  • Edit: draw/annotate on the image (pen, colors, undo) then send the edited
 *    copy back to the conversation via `onSendEdited`.
 */
export function ImageViewer({
  src,
  open,
  onClose,
  onSendEdited,
}: {
  src: string | null;
  open: boolean;
  onClose: () => void;
  onSendEdited?: (file: File) => void;
}) {
  const url = useFileUrl(open ? src : null);
  const [editing, setEditing] = useState(false);

  return (
    <IonModal isOpen={open} onDidDismiss={() => { setEditing(false); onClose(); }} className="image-viewer-modal">
      <div className="relative flex h-full w-full flex-col bg-black">
        {url && !editing && <Viewer url={url} onClose={onClose} onEdit={() => setEditing(true)} />}
        {url && editing && (
          <Editor
            url={url}
            onCancel={() => setEditing(false)}
            onDone={(file) => { setEditing(false); onSendEdited?.(file); onClose(); }}
          />
        )}
      </div>
    </IonModal>
  );
}

/* ------------------------------------------------------------------ viewer */

function Viewer({ url, onClose, onEdit }: { url: string; onClose: () => void; onEdit: () => void }) {
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement>(null);
  const state = useRef({ scale: 1, tx: 0, ty: 0 });
  const [, force] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  const apply = () => {
    const el = imgRef.current;
    if (el) el.style.transform = `translate(${state.current.tx}px, ${state.current.ty}px) scale(${state.current.scale})`;
  };
  const set = (s: number, tx: number, ty: number) => { state.current = { scale: s, tx, ty }; apply(); force((n) => n + 1); };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: state.current.scale };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const s = Math.max(1, Math.min(5, pinch.current.scale * (dist / pinch.current.dist)));
      set(s, state.current.tx, state.current.ty);
    } else if (pointers.current.size === 1 && state.current.scale > 1) {
      set(state.current.scale, state.current.tx + (e.clientX - prev.x), state.current.ty + (e.clientY - prev.y));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (state.current.scale <= 1) set(1, 0, 0);
  };
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      fb.tap();
      if (state.current.scale > 1) set(1, 0, 0);
      else set(2.5, 0, 0);
    }
    lastTap.current = now;
  };

  const download = () => {
    fb.tap();
    const a = document.createElement("a");
    a.href = url; a.download = `imagen-${Date.now()}.jpg`; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <>
      <div className="safe-top absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2">
        <button type="button" aria-label={t("app.close", "Cerrar")} onClick={() => { fb.tap(); onClose(); }} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white active:bg-black/60"><X size={24} /></button>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t("imageViewer.edit", "Editar")} onClick={() => { fb.tap(); onEdit(); }} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white active:bg-black/60"><Pencil size={21} /></button>
          <button type="button" aria-label={t("imageViewer.download", "Descargar")} onClick={download} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white active:bg-black/60"><Download size={21} /></button>
        </div>
      </div>
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onTap}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img ref={imgRef} src={url} className="max-h-full max-w-full select-none object-contain" style={{ transition: "none", willChange: "transform" }} draggable={false} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ editor */

function Editor({ url, onCancel, onDone }: { url: string; onCancel: () => void; onDone: (file: File) => void }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[2]);
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);

  // Load the image into the canvas at its natural resolution.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const c = canvasRef.current;
      if (!c) return;
      const maxW = 1600;
      const scale = img.width > maxW ? maxW / img.width : 1;
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      redraw();
    };
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const redraw = () => {
    const c = canvasRef.current; const img = imgRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of [...strokes.current, ...(drawing.current ? [drawing.current] : [])]) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      ctx.beginPath();
      s.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  };

  const toCanvas = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    const w = Math.max(3, (canvasRef.current?.width || 800) / 180);
    drawing.current = { color, width: w, pts: [toCanvas(e)] };
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current.pts.push(toCanvas(e));
    redraw();
  };
  const onUp = () => {
    if (drawing.current && drawing.current.pts.length) { strokes.current.push(drawing.current); }
    drawing.current = null;
    redraw(); force((n) => n + 1);
  };
  const undo = () => { fb.tap(); strokes.current.pop(); redraw(); force((n) => n + 1); };
  const clear = () => { fb.tap(); strokes.current = []; redraw(); force((n) => n + 1); };

  const done = () => {
    const c = canvasRef.current;
    if (!c || busy) return;
    setBusy(true);
    fb.press();
    c.toBlob((blob) => {
      if (!blob) { setBusy(false); return; }
      onDone(new File([blob], `edicion-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  return (
    <>
      <div className="safe-top absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2">
        <button type="button" aria-label={t("app.cancel", "Cancelar")} onClick={() => { fb.tap(); onCancel(); }} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white active:bg-black/60"><X size={24} /></button>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t("imageViewer.clearAll", "Borrar todo")} onClick={clear} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white active:bg-black/60"><Eraser size={20} /></button>
          <button type="button" aria-label={t("imageViewer.undo", "Deshacer")} onClick={undo} disabled={!strokes.current.length} className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white active:bg-black/60 disabled:opacity-40"><Undo2 size={20} /></button>
        </div>
      </div>

      <div className="flex h-full w-full items-center justify-center overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full rounded-md"
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      <div className="safe-bottom absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 px-4 py-3">
        <div className="flex flex-1 items-center gap-2.5">
          {COLORS.map((cc) => (
            <button key={cc} type="button" aria-label={cc} onClick={() => { fb.select(); setColor(cc); }}
              className="h-7 w-7 rounded-full border-2 transition-transform"
              style={{ background: cc, borderColor: color === cc ? "#fff" : "rgba(255,255,255,0.4)", transform: color === cc ? "scale(1.18)" : "scale(1)" }} />
          ))}
        </div>
        <button type="button" onClick={done} disabled={busy} className="flex min-h-[3.25rem] items-center gap-2.5 rounded-full bg-gold px-8 py-3.5 text-[15px] font-bold text-on-accent disabled:opacity-50">
          <Send size={18} />{t("imageViewer.send", "Enviar")}
        </button>
      </div>
    </>
  );
}

export default ImageViewer;
