import { useEffect, useRef, useState } from 'react';
import { canUseLiveCamera, drawSquare, fileToPhoto } from '../lib/photo';
import { Avatar } from './Avatar';
import { Modal } from './ui';

/**
 * Optional player photo: take a selfie (live camera when available, otherwise the
 * phone's own camera via a file input) or choose one from the gallery.
 */
export function PhotoPicker({ name, value, onChange, busy = false }: { name: string; value: string | null; onChange: (photo: string | null) => void; busy?: boolean }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      onChange(await fileToPhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that photo.');
    }
  };

  const takeSelfie = () => (canUseLiveCamera() ? setLive(true) : cameraInput.current?.click());

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Your photo (optional)</span>
      <div className="flex items-center gap-4">
        <Avatar name={name || '?'} photo={value} size={84} />
        <div className="flex flex-1 flex-wrap gap-2">
          <button type="button" className="btn btn-ghost !min-h-11 flex-1 text-sm" disabled={busy} onClick={takeSelfie}>
            📷 Take a selfie
          </button>
          <button type="button" className="btn btn-ghost !min-h-11 flex-1 text-sm" disabled={busy} onClick={() => galleryInput.current?.click()}>
            🖼 Choose photo
          </button>
          {value && (
            <button type="button" className="text-xs text-mute underline underline-offset-4" disabled={busy} onClick={() => onChange(null)}>
              Remove photo
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-mute">Shown on the big screen to everyone in this room. If you’re eliminated, your photo gets cut. Deleted when the room ends.</p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-ember">
          {error}
        </p>
      )}
      <input ref={cameraInput} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-label="Take a selfie" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={galleryInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Choose a photo" data-testid="photo-file" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <LiveCamera
        open={live}
        onClose={() => setLive(false)}
        onFallback={() => {
          setLive(false);
          cameraInput.current?.click();
        }}
        onCapture={(p) => {
          setLive(false);
          onChange(p);
        }}
      />
    </div>
  );
}

function LiveCamera({ open, onClose, onCapture, onFallback }: { open: boolean; onClose: () => void; onCapture: (photo: string) => void; onFallback: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setFailed(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    onCapture(drawSquare(v, v.videoWidth, v.videoHeight, true));
  };

  return (
    <Modal open={open} onClose={onClose} title="Take a selfie">
      {failed ? (
        <div className="space-y-3 text-sm">
          <p className="text-mute">The camera isn’t available here (permission denied or no camera).</p>
          <button className="btn btn-gold w-full" onClick={onFallback}>
            Use the phone camera instead
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-black">
            <video ref={video} playsInline muted onLoadedData={() => setReady(true)} className="h-full w-full -scale-x-100 object-cover" />
            {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-mute">Starting camera…</div>}
          </div>
          <button className="btn btn-primary w-full" disabled={!ready} onClick={snap}>
            Snap
          </button>
        </div>
      )}
      <button className="btn btn-ghost mt-2 w-full" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
