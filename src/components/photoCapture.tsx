import { useRef, useState, ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Images, X } from "lucide-react";
import {
  compressImage,
  takeNativePhoto,
  isNative,
  CapturedImage,
} from "@/lib/capture";

/**
 * Reusable image capture: take photos with the camera OR pick from the gallery,
 * on native (Capacitor) or web. Render `Inputs` once inside the component.
 */
export function usePhotoCapture() {
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const resolver = useRef<((img: CapturedImage | null) => void) | null>(null);

  const capture = (source: "camera" | "gallery"): Promise<CapturedImage | null> => {
    if (isNative()) return takeNativePhoto(source).catch(() => null);
    return new Promise((resolve) => {
      resolver.current = resolve;
      (source === "camera" ? cameraInput : galleryInput).current?.click();
    });
  };

  const onWebPick = async (file?: File | null) => {
    const r = resolver.current;
    resolver.current = null;
    if (!file) return r?.(null);
    try {
      r?.(await compressImage(file));
    } catch {
      r?.(null);
    }
  };

  const addPhoto = async (source: "camera" | "gallery") => {
    const img = await capture(source);
    if (img) setPhotos((p) => [...p, img]);
    return img;
  };
  const removePhoto = (i: number) =>
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  const reset = () => setPhotos([]);

  const Inputs = (): ReactElement => (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onWebPick(e.target.files?.[0])} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => onWebPick(e.target.files?.[0])} />
    </>
  );

  return { photos, setPhotos, capture, addPhoto, removePhoto, reset, Inputs };
}

/** Thumbnails (removable) + explicit "Take photo" and "Gallery" buttons. */
export function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  firstLabel,
}: {
  photos: CapturedImage[];
  onAdd: (s: "camera" | "gallery") => void;
  onRemove: (i: number) => void;
  firstLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div>
      {photos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-20 w-20">
              <img src={p.dataUrl} alt="" className="h-full w-full rounded-xl border border-line object-cover" />
              <button onClick={() => onRemove(i)} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-white">
                <X size={12} />
              </button>
              {i === 0 && firstLabel && (
                <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-navy/70 py-0.5 text-center text-[9px] text-gold">
                  {firstLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onAdd("camera")} className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold-soft text-sm font-semibold text-gold whitespace-nowrap active:opacity-80">
          <Camera size={18} className="shrink-0" />
          {t("app.takePhoto")}
        </button>
        <button onClick={() => onAdd("gallery")} className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-muted whitespace-nowrap active:opacity-80">
          <Images size={18} className="shrink-0" />
          {t("app.fromGallery")}
        </button>
      </div>
    </div>
  );
}
