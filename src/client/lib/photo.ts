/**
 * Turn any picked/captured image into a small square JPEG data URL (centre crop,
 * 320×320, ~20–40 KB) before upload, so phones never send multi-megabyte photos.
 */
import { serverUrl } from './server';

export const PHOTO_SIZE = 320;

export function drawSquare(source: CanvasImageSource, w: number, h: number, mirror = false): string {
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(PHOTO_SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function fileToPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(drawSquare(img, img.naturalWidth, img.naturalHeight));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be opened. Try another photo.'));
    };
    img.src = url;
  });
}

export async function uploadPhoto(code: string, token: string, photo: string | null): Promise<string | null> {
  const res = await fetch(serverUrl(`/api/rooms/${code}/photo`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ photo }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? 'Photo upload failed.');
  return json.photo ?? null;
}

/** Live camera works only in secure contexts (https / localhost); otherwise we fall back to the phone's camera via a file input. */
export const canUseLiveCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
