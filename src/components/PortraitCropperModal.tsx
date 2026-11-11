import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Crop,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  X,
  Move,
  Maximize2,
} from 'lucide-react';

export type PortraitResolutionPreset = '512x768' | '400x600';

interface PortraitCropperModalProps {
  imageSrc: string;
  originalWidth: number;
  originalHeight: number;
  characterName: string;
  reason?: 'aspect_mismatch' | 'manual_adjust';
  onCancel: () => void;
  onApplyCrop: (
    croppedPngDataUrl: string,
    outputWidth: number,
    outputHeight: number
  ) => void;
}

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 480; // Locked 2:3 aspect ratio

export const PortraitCropperModal: React.FC<PortraitCropperModalProps> = ({
  imageSrc,
  originalWidth,
  originalHeight,
  characterName,
  reason = 'manual_adjust',
  onCancel,
  onApplyCrop,
}) => {
  const [resolution, setResolution] =
    useState<PortraitResolutionPreset>('512x768');
  const [zoom, setZoom] = useState<number>(1);
  // panOffset is in preview canvas pixels relative to centered cover position
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  // Load HTMLImageElement once
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      imageObjRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [imageSrc]);

  // Clamp pan so the image always covers the 2:3 frame without empty gaps
  const clampPan = useCallback(
    (
      candidateX: number,
      candidateY: number,
      currentZoom: number
    ): { x: number; y: number } => {
      const img = imageObjRef.current;
      const natW = img?.naturalWidth || originalWidth || 512;
      const natH = img?.naturalHeight || originalHeight || 768;

      const baseScale = Math.max(
        PREVIEW_WIDTH / natW,
        PREVIEW_HEIGHT / natH
      );
      const effectiveScale = baseScale * currentZoom;

      const drawnW = natW * effectiveScale;
      const drawnH = natH * effectiveScale;

      const maxPanX = Math.max(0, (drawnW - PREVIEW_WIDTH) / 2);
      const maxPanY = Math.max(0, (drawnH - PREVIEW_HEIGHT) / 2);

      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, candidateX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, candidateY)),
      };
    },
    [originalWidth, originalHeight]
  );

  // Render preview canvas whenever zoom, pan, or imageLoaded changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const natW = img.naturalWidth || originalWidth || 512;
    const natH = img.naturalHeight || originalHeight || 768;

    const baseScale = Math.max(
      PREVIEW_WIDTH / natW,
      PREVIEW_HEIGHT / natH
    );
    const effectiveScale = baseScale * zoom;

    const drawnW = natW * effectiveScale;
    const drawnH = natH * effectiveScale;

    const clamped = clampPan(pan.x, pan.y, zoom);
    const drawX = (PREVIEW_WIDTH - drawnW) / 2 + clamped.x;
    const drawY = (PREVIEW_HEIGHT - drawnH) / 2 + clamped.y;

    ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, drawX, drawY, drawnW, drawnH);

    // Subtle rule-of-thirds composition guide overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PREVIEW_WIDTH / 3, 0);
    ctx.lineTo(PREVIEW_WIDTH / 3, PREVIEW_HEIGHT);
    ctx.moveTo((PREVIEW_WIDTH * 2) / 3, 0);
    ctx.lineTo((PREVIEW_WIDTH * 2) / 3, PREVIEW_HEIGHT);
    ctx.moveTo(0, PREVIEW_HEIGHT / 3);
    ctx.lineTo(PREVIEW_WIDTH, PREVIEW_HEIGHT / 3);
    ctx.moveTo(0, (PREVIEW_HEIGHT * 2) / 3);
    ctx.lineTo(PREVIEW_WIDTH, (PREVIEW_HEIGHT * 2) / 3);
    ctx.stroke();
  }, [imageLoaded, zoom, pan, clampPan, originalWidth, originalHeight]);

  const handleZoomChange = (nextZoom: number) => {
    const bounded = Math.max(1, Math.min(4, Number(nextZoom.toFixed(2))));
    setZoom(bounded);
    setPan((prev) => clampPan(prev.x, prev.y, bounded));
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartRef.current = {
      clientX,
      clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = clientX - dragStartRef.current.clientX;
    const dy = clientY - dragStartRef.current.clientY;
    const nextPan = clampPan(
      dragStartRef.current.startPanX + dx,
      dragStartRef.current.startPanY + dy,
      zoom
    );
    setPan(nextPan);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    handleZoomChange(zoom + delta);
  };

  const handleResetFraming = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleConfirmCrop = () => {
    const img = imageObjRef.current;
    if (!img) return;

    const targetW = resolution === '512x768' ? 512 : 400;
    const targetH = resolution === '512x768' ? 768 : 600;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    const natW = img.naturalWidth || originalWidth || 512;
    const natH = img.naturalHeight || originalHeight || 768;

    const baseScale = Math.max(
      PREVIEW_WIDTH / natW,
      PREVIEW_HEIGHT / natH
    );
    const effectivePreviewScale = baseScale * zoom;

    const clamped = clampPan(pan.x, pan.y, zoom);
    const previewDrawX =
      (PREVIEW_WIDTH - natW * effectivePreviewScale) / 2 + clamped.x;
    const previewDrawY =
      (PREVIEW_HEIGHT - natH * effectivePreviewScale) / 2 + clamped.y;

    // Map preview coordinates to target output resolution
    const ratio = targetW / PREVIEW_WIDTH;
    outCtx.fillStyle = '#09090b';
    outCtx.fillRect(0, 0, targetW, targetH);
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(
      img,
      previewDrawX * ratio,
      previewDrawY * ratio,
      natW * effectivePreviewScale * ratio,
      natH * effectivePreviewScale * ratio
    );

    const pngDataUrl = outCanvas.toDataURL('image/png');
    onApplyCrop(pngDataUrl, targetW, targetH);
  };

  const currentRatio =
    originalWidth && originalHeight
      ? (originalWidth / originalHeight).toFixed(2)
      : '—';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="portrait-cropper-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <div
        style={{ borderColor: 'var(--theme-accent)' }}
        className="w-full max-w-2xl rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Crop
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--theme-accent)' }}
            />
            <div>
              <h2
                id="portrait-cropper-title"
                className="text-sm font-bold text-slate-900 dark:text-white"
              >
                SillyTavern 2:3 Portrait Cropper · {characterName || 'Character'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {reason === 'aspect_mismatch'
                  ? `Source image is ${originalWidth}×${originalHeight}px (ratio ${currentRatio}:1). Frame to standard 2:3 vertical portrait.`
                  : `Source image: ${originalWidth}×${originalHeight}px · Drag to pan and scroll/slide to zoom.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cropper Body Grid */}
        <div
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          }}
          className="grid gap-5 items-center"
        >
          {/* Left: Locked 2:3 Interactive HTML5 Canvas */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div
              style={{ borderColor: 'var(--theme-accent)' }}
              className="relative overflow-hidden rounded-xl border-2 bg-zinc-950 shadow-inner"
            >
              <canvas
                ref={previewCanvasRef}
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  if (t) handlePointerDown(t.clientX, t.clientY);
                }}
                onTouchMove={(e) => {
                  const t = e.touches[0];
                  if (t) handlePointerMove(t.clientX, t.clientY);
                }}
                onTouchEnd={handlePointerUp}
                onWheel={handleWheel}
                className={`block select-none ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              />
              <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between rounded bg-black/65 px-2.5 py-1 text-[10px] font-mono text-white backdrop-blur-xs">
                <span className="inline-flex items-center gap-1">
                  <Move className="h-3 w-3" />
                  Drag to Pan
                </span>
                <span>2:3 Locked ({resolution.replace('x', '×')}px)</span>
              </div>
            </div>
          </div>

          {/* Right: Zoom Controls & Output Resolution Selector */}
          <div className="space-y-4">
            {/* Target Resolution Selector */}
            <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <Maximize2
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>Target SillyTavern Output Resolution</span>
              </label>
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResolution('512x768')}
                  style={
                    resolution === '512x768'
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
                        }
                      : undefined
                  }
                  className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                    resolution === '512x768'
                      ? 'text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>512 × 768 px (HD Portrait)</span>
                    <span className="font-mono text-[10px] uppercase">
                      Recommended
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] opacity-80">
                    High-definition 2:3 portrait for modern SillyTavern V2/V3 cards.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setResolution('400x600')}
                  style={
                    resolution === '400x600'
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
                        }
                      : undefined
                  }
                  className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                    resolution === '400x600'
                      ? 'text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>400 × 600 px (Classic ST Portrait)</span>
                    <span className="font-mono text-[10px] uppercase">
                      Compact
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] opacity-80">
                    Classic lightweight SillyTavern character card dimensions.
                  </p>
                </button>
              </div>
            </div>

            {/* Zoom Slider */}
            <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Zoom Magnification
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {zoom.toFixed(2)}×
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoom - 0.15)}
                  className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.02}
                  value={zoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  style={{ accentColor: 'var(--theme-accent)' }}
                  className="flex-1 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleZoomChange(zoom + 0.15)}
                  className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleResetFraming}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset Center &amp; Zoom</span>
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-3 text-[11px] text-slate-500 dark:text-slate-400">
              When you export this character as a <strong>.PNG Card</strong>, TavernSmith embeds both V2 (<code className="font-mono">chara</code>) and V3 (<code className="font-mono">ccv3</code>) metadata chunks directly into this cropped PNG portrait.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>Crop &amp; Apply Portrait ({resolution.replace('x', '×')})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
