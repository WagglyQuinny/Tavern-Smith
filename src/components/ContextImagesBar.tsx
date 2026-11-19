import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { ContextReferenceImage } from '../types';
import {
  compressImageForVision,
  isAllowedRasterImageFile,
  readImageFileAsDataUrl,
} from '../utils/cardIO';
import { Tooltip } from './Tooltip';

const MAX_CONTEXT_IMAGES = 6;

interface ContextImagesBarProps {
  images: ContextReferenceImage[];
  onAddImages: (newImages: ContextReferenceImage[]) => void;
  onRemoveImage: (id: string) => void;
  onClearAll: () => void;
  entityLabel: 'Character' | 'Lorebook';
  visionSupported?: boolean;
}

export const ContextImagesBar: React.FC<ContextImagesBarProps> = ({
  images,
  onAddImages,
  onRemoveImage,
  onClearAll,
  entityLabel,
  visionSupported = true,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    const rawFiles = Array.from(fileList);
    const files = rawFiles.filter((f) => isAllowedRasterImageFile(f));
    const skippedUnsupported = rawFiles.length - files.length;

    if (files.length === 0) {
      setErrorMsg(
        'Please select or drop valid raster images (PNG, JPEG, WebP, GIF, AVIF). SVG files are blocked for security.'
      );
      return;
    }

    const remainingSlots = Math.max(0, MAX_CONTEXT_IMAGES - images.length);
    if (remainingSlots === 0) {
      setErrorMsg(
        `Maximum ${MAX_CONTEXT_IMAGES} context reference images attached. Remove one to add another.`
      );
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    const skippedForCap = files.length - filesToProcess.length;

    setIsProcessing(true);
    setErrorMsg(null);
    const created: ContextReferenceImage[] = [];
    try {
      for (let i = 0; i < filesToProcess.length; i += 1) {
        const file = filesToProcess[i];
        const rawUrl = await readImageFileAsDataUrl(file);
        const compressed = await compressImageForVision(rawUrl, 512);
        if (!isMountedRef.current) return;
        created.push({
          id: `ctx-img-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          dataUrl: compressed,
        });
      }
      if (isMountedRef.current && created.length > 0) {
        onAddImages(created);
      }
      if (isMountedRef.current && (skippedUnsupported > 0 || skippedForCap > 0)) {
        const notes: string[] = [];
        if (skippedUnsupported > 0) {
          notes.push(
            `${skippedUnsupported} unsupported/SVG file${skippedUnsupported === 1 ? '' : 's'} skipped`
          );
        }
        if (skippedForCap > 0) {
          notes.push(
            `${skippedForCap} file${skippedForCap === 1 ? '' : 's'} skipped (max ${MAX_CONTEXT_IMAGES} reference images)`
          );
        }
        setErrorMsg(notes.join(' · '));
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Failed to process one or more context images.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          void handleFiles(e.dataTransfer.files);
        }
      }}
      style={{
        borderColor: isDragging
          ? 'var(--theme-accent)'
          : 'color-mix(in srgb, var(--theme-accent) 30%, transparent)',
      }}
      className={`rounded-xl border border-dashed px-4 py-3 transition-colors ${
        isDragging
          ? 'bg-slate-100 dark:bg-slate-800/80'
          : 'bg-white/90 dark:bg-slate-900/90'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,.png,.jpg,.jpeg,.webp,.gif,.avif"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <ImageIcon
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            Context-Only Reference Images ({images.length}/{MAX_CONTEXT_IMAGES})
          </span>
          <Tooltip
            title="Context-Only AI Images"
            content={`Attach outfits, expression sheets, maps, items, or moodboards for AI generation (${entityLabel} Wizard & Full Editor). Up to ${MAX_CONTEXT_IMAGES} raster images compressed to ~260 tokens each and never saved into exported .JSON/.PNG cards.`}
          />
          <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
            AI context only · Never saved to card
          </span>
          {!visionSupported && images.length > 0 && (
            <span
              title="Selected model does not support images; attached images are skipped until a vision-capable model is selected (or Force Vision is enabled in Options)."
              className="font-mono text-[10px] text-amber-600 dark:text-amber-400"
            >
              · Selected model doesn&apos;t support images (skipped)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isProcessing || images.length >= MAX_CONTEXT_IMAGES}
            onClick={() => inputRef.current?.click()}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline inline-flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                style={{ color: 'var(--theme-accent)' }}
              />
            ) : (
              <Plus
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
            )}
            <span>Add Images</span>
            <Upload className="h-3 w-3 opacity-60" />
          </button>

          {images.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              title="Remove all context-only reference images"
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/40 px-2 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className="group relative flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1.5 pr-2 max-w-[210px]"
            >
              <img
                src={img.dataUrl}
                alt={img.name}
                className="h-9 w-9 rounded object-cover border border-slate-200 dark:border-slate-800 shrink-0"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                  {img.name || `Image #${idx + 1}`}
                </div>
                <div className="font-mono text-[9px] text-slate-500 dark:text-slate-400">
                  Ref #{idx + 1} · ~260 tok
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveImage(img.id)}
                title={`Remove ${img.name}`}
                className="rounded p-0.5 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
