import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Install TavernSmith as a standalone app (Windows, macOS x64/ARM, Linux, Android, iOS/iPadOS)"
        className="theme-hover-outline hidden sm:flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
      >
        {isIOS ? (
          <Smartphone
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
        ) : (
          <Download
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
        )}
        <span>{deferredPrompt ? 'Install App' : isIOS ? 'Install on iOS' : 'Standalone App'}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="w-full max-w-md rounded-xl border bg-white dark:bg-zinc-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-3">
              <div>
                <h3
                  id="pwa-install-modal-title"
                  className="text-sm font-bold text-slate-900 dark:text-white"
                >
                  Run TavernSmith as a Standalone App
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Zero CPU architecture lock-in · Works on Windows, macOS (Intel & Apple Silicon ARM), Linux, iOS/iPadOS & Android
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-3">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">
                  1. Desktop (Windows, macOS Intel/ARM, Linux)
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Open TavernSmith in a dedicated browser tab (Chrome, Edge, Brave, or Safari) and click the <strong>Install TavernSmith</strong> icon in the address bar (or File → <strong>Add to Dock</strong> in macOS Safari), or run <code className="font-mono">Launch-TavernSmith-Windows.bat</code> / <code className="font-mono">Launch-TavernSmith-Mac-Linux.command</code> from the standalone release zip.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-3">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">
                  2. iPhone & iPad (iOS / iPadOS Safari)
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Tap the <strong>Share</strong> button in the Safari toolbar, scroll down, and tap <strong>Add to Home Screen</strong>.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-3">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">
                  3. Android (Chrome / Edge / Firefox)
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Tap the browser menu (<strong>⋮</strong>) and select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-4 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
