import { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, RotateCcw, ZoomIn } from 'lucide-react';
import { Modal, ModalHeader, Slider, Spinner } from '../ui';

/**
 * Card covers are a short, wide strip, so an uncropped photo loses whatever the
 * person actually wanted to show. This picks the strip before uploading.
 *
 * The frame is 3:1 — between the board tile (about 3.4:1) and the open card
 * (about 5:1), both of which centre-crop whatever they are given.
 */
const FRAME_W = 468;
const FRAME_H = 156;
const OUT_W = 1600;
const OUT_H = Math.round((OUT_W * FRAME_H) / FRAME_W);
const MAX_ZOOM = 4;

export function CoverCropper({
  file,
  busy = false,
  onCancel,
  onCrop,
}: {
  file: File | null;
  busy?: boolean;
  onCancel: () => void;
  onCrop: (blob: Blob, name: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // how much the image must be scaled just to fill the frame
  const baseScale = img ? Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;

  const clamp = useCallback(
    (x: number, y: number) => ({
      // never let the frame see past the edge of the picture
      x: Math.min(0, Math.max(FRAME_W - dispW, x)),
      y: Math.min(0, Math.max(FRAME_H - dispH, y)),
    }),
    [dispW, dispH]
  );

  const centre = useCallback(
    (w: number, h: number) => ({ x: (FRAME_W - w) / 2, y: (FRAME_H - h) / 2 }),
    []
  );

  useEffect(() => {
    if (!file) {
      setImg(null);
      return;
    }
    setError('');
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setZoom(1);
      const s = Math.max(FRAME_W / el.naturalWidth, FRAME_H / el.naturalHeight);
      setOffset(centre(el.naturalWidth * s, el.naturalHeight * s));
    };
    el.onerror = () => setError('That file could not be read as an image.');
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, centre]);

  // keep the picture covering the frame when the zoom changes
  useEffect(() => {
    if (img) setOffset((o) => clamp(o.x, o.y));
  }, [zoom, img, clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    setOffset(clamp(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y)));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const reset = () => {
    if (!img) return;
    setZoom(1);
    const s = Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight);
    setOffset(centre(img.naturalWidth * s, img.naturalHeight * s));
  };

  const apply = () => {
    if (!img || !file) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return setError('Your browser could not prepare the image.');

    const k = OUT_W / FRAME_W;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, offset.x * k, offset.y * k, dispW * k, dispH * k);

    const base = file.name.replace(/\.[^.]+$/, '') || 'cover';
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError('Your browser could not prepare the image.');
        onCrop(blob, `${base}-cover.jpg`);
      },
      'image/jpeg',
      0.9
    );
  };

  return (
    <Modal open={!!file} onClose={busy ? () => undefined : onCancel} width="max-w-xl" label="Crop cover">
      <ModalHeader
        title="Crop the cover"
        subtitle="Drag to reposition, zoom to fill. This is the strip the card will show."
        icon={<Crop size={18} />}
        onClose={busy ? () => undefined : onCancel}
      />

      <div className="space-y-4 p-5">
        <div className="flex justify-center">
          <div
            // a ring rather than a border: a border would eat 2px of the content
            // box, and the clamp below assumes the frame is exactly FRAME_W x FRAME_H
            className="relative touch-none overflow-hidden rounded-lg bg-surface2/60 ring-1 ring-line"
            style={{ width: FRAME_W, height: FRAME_H, cursor: img ? 'grab' : 'default' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {img ? (
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: offset.x, top: offset.y, width: dispW, height: dispH }}
              />
            ) : (
              <div className="grid h-full place-items-center text-xs text-muted">
                {error || 'Reading the image...'}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-center text-xs text-danger">{error}</p>}

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Slider
              label="Zoom"
              min={1}
              max={MAX_ZOOM}
              step={0.02}
              value={zoom}
              display={`${Math.round(zoom * 100)}%`}
              onChange={setZoom}
            />
          </div>
          <button className="btn btn-subtle py-1.5 text-xs" onClick={reset} disabled={!img || busy}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-subtle" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={!img || busy}>
            {busy ? <Spinner size={15} /> : <ZoomIn size={15} />}
            Use as cover
          </button>
        </div>
      </div>
    </Modal>
  );
}
