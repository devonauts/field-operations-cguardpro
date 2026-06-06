import { Capacitor } from "@capacitor/core";

export interface CapturedImage {
  file: File;
  dataUrl: string;
}

/** Downscale + recompress an image (canvas) so uploads stay small. */
export function compressImage(
  source: File | string,
  maxDim = 1400,
  quality = 0.62
): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanup = (url?: string) => url && url.startsWith("blob:") && URL.revokeObjectURL(url);
    const objUrl = typeof source === "string" ? source : URL.createObjectURL(source);

    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup(objUrl);
        reject(new Error("canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      cleanup(objUrl);
      const file = dataUrlToFile(dataUrl, `id-${Date.now()}.jpg`);
      resolve({ file, dataUrl });
    };
    img.onerror = () => {
      cleanup(objUrl);
      reject(new Error("image load failed"));
    };
    img.src = objUrl;
  });
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/**
 * Capture an ID photo. On native (iOS/Android) uses the Capacitor Camera with
 * the rear camera; in the browser this is unused (the UI falls back to a
 * <input type="file" capture> element). Result is compressed.
 */
export async function takeNativePhoto(
  source: "camera" | "gallery" = "camera"
): Promise<CapturedImage> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 70,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: source === "gallery" ? CameraSource.Photos : CameraSource.Camera,
    direction: "REAR" as any,
    correctOrientation: true,
  });
  if (!photo.dataUrl) throw new Error("no photo");
  return compressImage(photo.dataUrl);
}

export const isNative = () => Capacitor.isNativePlatform();
