import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Check,
  X,
  FileWarning,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  purgeBrowserRuntimeCaches,
  StoreProvider,
  useStore,
} from './context/StoreContext';
import { TopBar } from './components/TopBar';
import { SidebarNav } from './components/SidebarNav';
import { CharacterView } from './views/CharacterView';
import { LorebookView } from './views/LorebookView';
import { ThemesAndTagsView } from './views/ThemesAndTagsView';
import { JsonInspectorView } from './views/JsonInspectorView';
import { OptionsView } from './views/OptionsView';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('TavernSmith ErrorBoundary caught error:', error, errorInfo);
  }

  handleSafeRecovery = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleHardResetView = (): void => {
    purgeBrowserRuntimeCaches();
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#09090b] text-[#f4f4f5] p-6">
          <div className="max-w-md w-full rounded-xl border border-indigo-500/40 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">
                  TavernSmith Safe Recovery Mode
                </h1>
                <p className="text-xs text-zinc-400">
                  A rendering error was caught before it could blank the screen.
                </p>
              </div>
            </div>

            {this.state.errorMessage && (
              <pre className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-rose-300 whitespace-pre-wrap break-words max-h-36 overflow-y-auto">
                {this.state.errorMessage}
              </pre>
            )}

            <p className="text-xs text-zinc-400 leading-relaxed">
              Your saved AI provider API keys remain safely stored. Click{' '}
              <strong className="text-zinc-200">Safe Recovery</strong> to resume
              your view, or <strong className="text-zinc-200">Reset Workspace View</strong>{' '}
              if a corrupted card file caused this error.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleSafeRecovery}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Safe Recovery / Resume View</span>
              </button>

              <button
                type="button"
                onClick={this.handleHardResetView}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 hover:border-rose-500/60 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 cursor-pointer transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const NameConflictResolutionModal: React.FC = () => {
  const {
    nameConflictRequest,
    resolveNameConflict,
    dismissNameConflict,
    characters,
    lorebooks,
    saveNow,
  } = useStore();

  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (nameConflictRequest) {
      setCustomName(
        nameConflictRequest.suggestedNames[0] ||
          `${nameConflictRequest.conflictingName} (2)`
      );
    }
  }, [nameConflictRequest]);

  if (!nameConflictRequest) return null;

  const isChar = nameConflictRequest.kind === 'character';
  const cleanCandidate = customName.trim();
  const stillConflicts = isChar
    ? characters.some(
        (c) =>
          c.id !== nameConflictRequest.itemId &&
          (c.name || '').trim().toLowerCase() === cleanCandidate.toLowerCase()
      )
    : lorebooks.some(
        (l) =>
          l.id !== nameConflictRequest.itemId &&
          (l.name || '').trim().toLowerCase() === cleanCandidate.toLowerCase()
      );

  const handleApplyRename = (targetName: string) => {
    const clean = targetName.trim();
    if (!clean) return;
    resolveNameConflict(clean);
    if (nameConflictRequest.sourceAction === 'save') {
      window.setTimeout(() => saveNow('manual'), 25);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div
        style={{ borderColor: 'var(--theme-accent)' }}
        className="w-full max-w-md rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-500 shrink-0">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isChar ? 'Character' : 'Lorebook'} Name Already Exists
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pick a unique name so your files don&apos;t overwrite each other
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissNameConflict}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          You already have a {isChar ? 'character' : 'lorebook'} named{' '}
          <strong className="font-mono text-slate-900 dark:text-white">
            &ldquo;{nameConflictRequest.conflictingName}&rdquo;
          </strong>
          . Pick a suggested name or enter a new one so both save safely:
        </p>

        {/* Suggested Unique Names */}
        {nameConflictRequest.suggestedNames.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Suggested Names
            </span>
            <div className="flex flex-wrap gap-1.5">
              {nameConflictRequest.suggestedNames.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleApplyRename(suggestion)}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline inline-flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
                >
                  <Sparkles
                    className="h-3 w-3"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Name Input */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Or Type a Different Name
          </label>
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && cleanCandidate && !stillConflicts) {
                e.preventDefault();
                handleApplyRename(cleanCandidate);
              }
            }}
            placeholder={`Enter a unique ${isChar ? 'character' : 'lorebook'} name...`}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
          />
          {stillConflicts && (
            <p className="text-[11px] text-rose-500">
              That name is already taken. Try a slightly different name.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={dismissNameConflict}
            className="rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!cleanCandidate || stillConflicts}
            onClick={() => handleApplyRename(cleanCandidate)}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Rename &amp; Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const DeleteConfirmationModal: React.FC = () => {
  const { pendingDeleteTarget, confirmPendingDelete, cancelPendingDelete } =
    useStore();

  if (!pendingDeleteTarget) return null;

  const isChar =
    pendingDeleteTarget.kind === 'character' ||
    (pendingDeleteTarget.kind === 'savedFile' &&
      pendingDeleteTarget.fileKind === 'character');
  const label = isChar ? 'Character' : 'Lorebook';
  const folderHint = isChar ? './Saves/Characters/' : './Saves/Lorebooks/';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <div
        style={{ borderColor: 'var(--theme-accent)' }}
        className="w-full max-w-md rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-500 shrink-0">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Delete {label}?
              </h3>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {pendingDeleteTarget.fileName
                  ? `${folderHint}${pendingDeleteTarget.fileName}`
                  : folderHint}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelPendingDelete}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Delete{' '}
          <strong className="text-slate-900 dark:text-white">
            &ldquo;{pendingDeleteTarget.displayName}&rdquo;
          </strong>
          {typeof pendingDeleteTarget.entryCount === 'number'
            ? ` (${pendingDeleteTarget.entryCount} entries)`
            : ''}{' '}
          from your roster and saved files? This cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={cancelPendingDelete}
            className="rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmPendingDelete}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Yes, Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const WorkspaceShell: React.FC = () => {
  const { activeTab, settings } = useStore();

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors ${
        settings.appearance === 'dark'
          ? 'dark bg-[#09090b] text-[#f4f4f5]'
          : 'light bg-[#f4f4f5] text-[#09090b]'
      }`}
    >
      <TopBar />

      <div className="flex-1 flex flex-col md:flex-row min-h-0 min-w-0 w-full">
        {/* Always rendered: switches between full sidebar and Blender-style Icon Rail */}
        <SidebarNav />

        <main className="flex-1 min-w-0 w-full p-4 md:p-6 lg:p-7">
          {activeTab === 'character' && <CharacterView />}
          {activeTab === 'lorebook' && <LorebookView />}
          {(activeTab === 'themes' || activeTab === 'themes_tags') && (
            <ThemesAndTagsView />
          )}
          {(activeTab === 'inspector' || activeTab === 'json_inspector') && (
            <JsonInspectorView />
          )}
          {activeTab === 'options' && <OptionsView />}
        </main>
      </div>

      <NameConflictResolutionModal />
      <DeleteConfirmationModal />
    </div>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <StoreProvider>
        <WorkspaceShell />
      </StoreProvider>
    </AppErrorBoundary>
  );
}
