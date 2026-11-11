import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sun,
  Moon,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  RotateCcw,
  Save,
  X,
  ShieldCheck,
  Sliders,
  Wand2,
  Search,
  Cpu,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Trash2,
  Download,
  FileJson,
  Clock,
  Archive,
  Zap,
} from 'lucide-react';
import { formatSafeTimestamp, useStore } from '../context/StoreContext';
import {
  AI_BACKEND_PRESETS,
  COMPATIBILITY_FORMAT_LABELS,
  ConnectionTestResult,
  detectModelCompatibilityFormat,
  resolveEffectiveFormat,
  testBackendConnection,
} from '../services/aiService';
import { AIPresetId, ModelCompatibilityFormat, SavedFileEntry } from '../types';
import { Tooltip } from '../components/Tooltip';
import { triggerBrowserDownload } from '../utils/cardIO';

export const OptionsView: React.FC = () => {
  const {
    characters,
    lorebooks,
    themes,
    tags,
    settings,
    updateSettings,
    aiConfig,
    setAiConfig,
    saveNow,
    resetWorkspaceToDefaults,
    lastSavedAt,
    savedFiles,
    saveLogs,
    nativeDirectoryName,
    pendingReconnectFolderName,
    isSyncingFolder,
    selectNativeSaveFolder,
    reconnectNativeSaveFolder,
    scanAndLoadSaveFolder,
    createSaveFolder,
    setActiveSaveFolder,
    deleteSavedFile,
    exportSaveFolderBundle,
    storageBytesUsed,
  } = useStore();

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null
  );
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState('');
  const [folderStatusMessage, setFolderStatusMessage] = useState<string | null>(
    null
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const currentPresetMeta = useMemo(
    () =>
      AI_BACKEND_PRESETS.find((p) => p.id === aiConfig.preset) ||
      AI_BACKEND_PRESETS[0],
    [aiConfig.preset]
  );

  const autoDetectedFormat = useMemo(
    () => detectModelCompatibilityFormat(aiConfig.modelName, aiConfig.preset),
    [aiConfig.modelName, aiConfig.preset]
  );

  const effectiveFormat = useMemo(
    () => resolveEffectiveFormat(aiConfig),
    [aiConfig]
  );

  const allSelectableModels = useMemo(() => {
    const combined = Array.from(
      new Set([
        ...(aiConfig.availableModels || []),
        ...(currentPresetMeta.suggestedModels || []),
      ])
    ).filter(Boolean);

    const q = modelSearchQuery.trim().toLowerCase();
    if (!q) return combined;
    return combined.filter((m) => m.toLowerCase().includes(q));
  }, [
    aiConfig.availableModels,
    currentPresetMeta.suggestedModels,
    modelSearchQuery,
  ]);

  const filesInActiveFolder = useMemo(
    () =>
      savedFiles.filter(
        (file) => file.folderPath === settings.activeSaveFolder
      ),
    [savedFiles, settings.activeSaveFolder]
  );

  const handleSelectPreset = (presetId: AIPresetId) => {
    const found = AI_BACKEND_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setAiConfig((prev) => ({
      ...prev,
      preset: presetId,
      url: found.defaultUrl,
      modelName: found.defaultModel,
      compatibilityFormat: 'auto',
      availableModels: found.suggestedModels,
    }));
    setTestResult(null);
  };

  const handleScanModels = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setTestingConnection(true);
    setTestResult(null);

    try {
      const result = await testBackendConnection(aiConfig, controller.signal);
      setTestResult(result);
      if (result.models.length > 0) {
        setAiConfig((prev) => ({
          ...prev,
          availableModels: result.models,
          modelName: result.models.includes(prev.modelName)
            ? prev.modelName
            : result.models[0],
        }));
      }
    } catch {
      // Aborted request ignored cleanly
    } finally {
      setTestingConnection(false);
    }
  };

  const handlePickNativeDirectory = async () => {
    const res = await selectNativeSaveFolder();
    setFolderStatusMessage(res.message);
    window.setTimeout(() => setFolderStatusMessage(null), 5000);
  };

  const handleRescanSaveFolder = async () => {
    const res = await scanAndLoadSaveFolder({ silent: false });
    setFolderStatusMessage(res.summary);
    window.setTimeout(() => setFolderStatusMessage(null), 5000);
  };

  const handleReconnectSaveFolder = async () => {
    const res = await reconnectNativeSaveFolder();
    setFolderStatusMessage(res.message);
    window.setTimeout(() => setFolderStatusMessage(null), 5000);
  };

  const handleCreateCustomFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderInput.trim()) return;
    createSaveFolder(newFolderInput);
    setNewFolderInput('');
    setFolderStatusMessage(
      `Created and switched active Save Folder to ${newFolderInput.trim()}`
    );
    window.setTimeout(() => setFolderStatusMessage(null), 3500);
  };

  const handleDownloadSavedFile = (file: SavedFileEntry) => {
    triggerBrowserDownload(file.content, file.fileName);
  };

  const storageKb = (storageBytesUsed / 1024).toFixed(1);
  const storageQuotaPct = Math.min(
    100,
    Math.round((storageBytesUsed / (5 * 1024 * 1024)) * 100)
  );

  return (
    <div className="space-y-8 min-w-0 w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            IDE Options, AI Connections &amp; Save Folder Manager
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure local/cloud AI endpoints, live model scanning, Save Folder targets, and workspace appearance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => saveNow('manual')}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save to Folder Now</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
          >
            <Info
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>About &amp; Changelog (v1.0.0)</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: STORAGE & SAVE FOLDER MANAGER */}
      <div
        style={{ borderColor: 'var(--theme-accent)' }}
        className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                borderColor: 'var(--theme-accent)',
                backgroundColor:
                  'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border shrink-0"
            >
              <FolderOpen
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Storage &amp; Save Folder Manager
                </h2>
                <Tooltip content="Both Manual Save and the Auto-Save Timer write your active Character ([name].json) and Lorebook ([name].json) directly to the selected Save Folder." />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active Target:{' '}
                <code className="font-mono font-semibold text-slate-900 dark:text-white">
                  {settings.activeSaveFolder}
                </code>
                {nativeDirectoryName && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    OS Linked: {nativeDirectoryName}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRescanSaveFolder()}
              disabled={isSyncingFolder}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncingFolder ? 'animate-spin' : ''}`}
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>🔄 Rescan Folder</span>
            </button>

            <button
              type="button"
              onClick={() => void handlePickNativeDirectory()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
            >
              <FolderOpen
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Select Save Folder (Local PC)</span>
            </button>

            <button
              type="button"
              onClick={() => exportSaveFolderBundle()}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Archive
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export Folder Backup Bundle</span>
            </button>
          </div>
        </div>

        {pendingReconnectFolderName && (
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-amber-500/10 px-3.5 py-2.5 text-xs"
          >
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span>
                Saved local PC folder{' '}
                <strong className="font-mono">{pendingReconnectFolderName}</strong>{' '}
                found in IndexedDB. Click to grant read/write access and sync files:
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleReconnectSaveFolder()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer shrink-0"
            >
              📁 Reconnect Save Folder ({pendingReconnectFolderName})
            </button>
          </div>
        )}

        {folderStatusMessage && (
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="flex items-center justify-between rounded-lg border bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200"
          >
            <span>{folderStatusMessage}</span>
            <button
              type="button"
              onClick={() => setFolderStatusMessage(null)}
              className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Storage Telemetry + Folder Selector Fluid Grid */}
        <div
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          }}
          className="grid gap-5 items-start"
        >
          {/* Left Column: Folder Selector, Create Folder & Storage Quota */}
          <div className="space-y-4 min-w-0">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                In-App Save Folder Selector
              </label>
              <div className="space-y-1.5">
                {settings.availableSaveFolders.map((folderPath) => {
                  const isSelected = settings.activeSaveFolder === folderPath;
                  const countInFolder = savedFiles.filter(
                    (f) => f.folderPath === folderPath
                  ).length;
                  return (
                    <button
                      key={folderPath}
                      type="button"
                      onClick={() => setActiveSaveFolder(folderPath)}
                      style={
                        isSelected
                          ? { borderColor: 'var(--theme-accent)' }
                          : undefined
                      }
                      className={`theme-hover-outline flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-50 dark:bg-slate-800/90 font-semibold text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen
                          className="h-3.5 w-3.5 shrink-0"
                          style={
                            isSelected
                              ? { color: 'var(--theme-accent)' }
                              : undefined
                          }
                        />
                        <span className="font-mono truncate">{folderPath}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                        {countInFolder} file{countInFolder === 1 ? '' : 's'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Create New Save Folder */}
            <form onSubmit={handleCreateCustomFolder} className="flex gap-2">
              <input
                type="text"
                value={newFolderInput}
                onChange={(e) => setNewFolderInput(e.target.value)}
                placeholder="/TavernSmith/Saves/CustomFolder"
                className="theme-focus-ring font-mono flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white shrink-0 cursor-pointer"
              >
                <FolderPlus
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>New Folder</span>
              </button>
            </form>

            {/* Storage Quota & Counts Panel */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <HardDrive
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span>Workspace Storage Usage</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                  {storageKb} KB ({storageQuotaPct}%)
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(3, storageQuotaPct)}%`,
                    backgroundColor: 'var(--theme-accent)',
                  }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1 text-center font-mono">
                <div className="rounded border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {characters.length}
                  </div>
                  <div className="text-[10px] text-slate-500">Chars</div>
                </div>
                <div className="rounded border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {lorebooks.length}
                  </div>
                  <div className="text-[10px] text-slate-500">Books</div>
                </div>
                <div className="rounded border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {themes.length}
                  </div>
                  <div className="text-[10px] text-slate-500">Themes</div>
                </div>
                <div className="rounded border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {tags.length}
                  </div>
                  <div className="text-[10px] text-slate-500">Tags</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Active Save Folder File Browser & Live Save Log */}
          <div className="space-y-4 min-w-0">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <FileJson
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span>
                    Files in{' '}
                    <code className="font-mono">{settings.activeSaveFolder}</code>
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {filesInActiveFolder.length} saved file
                  {filesInActiveFolder.length === 1 ? '' : 's'}
                </span>
              </div>

              {filesInActiveFolder.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  No files saved in this folder yet. Click{' '}
                  <strong>Save to Folder Now</strong> or wait for the Auto-Save timer.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {filesInActiveFolder.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                            {file.fileName}
                          </span>
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600 dark:text-slate-300">
                            {file.kind}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {(file.sizeBytes / 1024).toFixed(2)} KB · Updated{' '}
                          {formatSafeTimestamp(file.updatedAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadSavedFile(file)}
                          title="Download JSON file"
                          className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedFile(file.id)}
                          title="Delete file permanently from Save Folder"
                          className="rounded-md border border-rose-200 dark:border-rose-900/40 p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Save Activity Log */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                <div className="flex items-center gap-1.5">
                  <Clock
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span>Live Save &amp; Auto-Save Target Log</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {lastSavedAt ? `Last Saved: ${lastSavedAt}` : 'Ready'}
                </span>
              </div>

              {saveLogs.length === 0 ? (
                <div className="font-mono text-[11px] text-slate-400">
                  Save events will appear here with target folder path and timestamp.
                </div>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px]">
                  {saveLogs.slice(0, 6).map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-white dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300"
                    >
                      <span className="truncate">
                        <strong className="uppercase text-slate-900 dark:text-white">
                          [{log.mode}]
                        </strong>{' '}
                        {log.folderPath}/ ({log.filesWritten.join(', ')})
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {log.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: APPEARANCE, WORKFLOW & AI BACKEND CONFIGURATION */}
      <div
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        }}
        className="grid gap-6 items-start"
      >
        {/* Left Column: Appearance, Workflow Mode & Auto-Save */}
        <div className="space-y-6 min-w-0">
          {/* Appearance & Workflow Mode Card */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            }}
            className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2.5">
              Appearance &amp; Workspace Mode
            </h2>

            {/* Appearance Mode: Dark vs Light */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Appearance Mode</span>
                <Tooltip content="Switches the entire application between Obsidian Dark Mode (#09090b canvas) and Alabaster Light Mode (#f4f4f5 canvas) while keeping your active Context Theme accent." />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => updateSettings({ appearance: 'dark' })}
                  style={
                    settings.appearance === 'dark'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium cursor-pointer ${
                    settings.appearance === 'dark'
                      ? 'bg-slate-900 text-white dark:bg-slate-800'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  <span>Dark Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ appearance: 'light' })}
                  style={
                    settings.appearance === 'light'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium cursor-pointer ${
                    settings.appearance === 'light'
                      ? 'bg-slate-100 text-slate-900'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  <span>Light Mode</span>
                </button>
              </div>
            </div>

            {/* Editor Mode: Full Sandbox vs Step-by-Step Wizard */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Editor Workflow Mode</span>
                <Tooltip content="Switch between the multi-panel Full Sandbox Workbench and the guided 5-step Creation Wizard." />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => updateSettings({ editorMode: 'sandbox' })}
                  style={
                    settings.editorMode === 'sandbox'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium cursor-pointer ${
                    settings.editorMode === 'sandbox'
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Full Workbench</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ editorMode: 'wizard' })}
                  style={
                    settings.editorMode === 'wizard'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium cursor-pointer ${
                    settings.editorMode === 'wizard'
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Guided Wizard</span>
                </button>
              </div>
            </div>

            {/* SillyTavern Card Spec Version */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Default SillyTavern Spec Target</span>
                <Tooltip content="Controls whether exported JSON and PNG tEXt chunks default to chara_card_v2 (2.0) or chara_card_v3 (3.0)." />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => updateSettings({ cardSpecVersion: 'v2' })}
                  style={
                    settings.cardSpecVersion === 'v2'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline rounded-lg border px-3 py-2 text-xs font-mono font-medium cursor-pointer ${
                    settings.cardSpecVersion === 'v2'
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  chara_card_v2 (2.0)
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ cardSpecVersion: 'v3' })}
                  style={
                    settings.cardSpecVersion === 'v3'
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline rounded-lg border px-3 py-2 text-xs font-mono font-medium cursor-pointer ${
                    settings.cardSpecVersion === 'v3'
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  chara_card_v3 (3.0)
                </button>
              </div>
            </div>
          </div>

          {/* Persistence & Auto-Save Interval Card */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            }}
            className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Auto-Save Interval &amp; Reset
              </h2>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {lastSavedAt ? `Saved ${lastSavedAt}` : 'Not saved yet'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <label
                htmlFor="autosave-toggle"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <span>Enable Automatic Folder Save</span>
                <Tooltip content="Periodically saves your active Character ([name].json), Lorebook ([name].json), and workspace state to the active Save Folder." />
              </label>
              <input
                id="autosave-toggle"
                type="checkbox"
                checked={settings.autoSaveEnabled}
                onChange={(e) =>
                  updateSettings({ autoSaveEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-current cursor-pointer"
                style={{ accentColor: 'var(--theme-accent)' }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Auto-Save Interval
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {settings.autoSaveIntervalSec} seconds
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                disabled={!settings.autoSaveEnabled}
                value={settings.autoSaveIntervalSec}
                onChange={(e) =>
                  updateSettings({
                    autoSaveIntervalSec: Number(e.target.value),
                  })
                }
                className="w-full cursor-pointer"
                style={{ accentColor: 'var(--theme-accent)' }}
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-400 tabular-nums">
                <span>5s</span>
                <span>30s</span>
                <span>60s</span>
                <span>120s</span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => saveNow('manual')}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white cursor-pointer"
              >
                <Save
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>Save Snapshot Now</span>
              </button>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Defaults</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      resetWorkspaceToDefaults();
                      setConfirmReset(false);
                    }}
                    className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Expanded AI Backend Connection Manager & Model Scanner */}
        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5 min-w-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Server
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                AI Connections, Model Scanner &amp; Thinking Parser
              </h2>
              <Tooltip
                title="Multi-Provider AI Engine"
                content="Connect to LM Studio, Ollama, KoboldCPP, Google Gemini, xAI Grok, Meta Llama 4 (OpenRouter / Groq / Meta Direct), or custom OpenAI-compatible servers. Automatically strips <think> blocks."
              />
            </div>

            <button
              type="button"
              onClick={handleScanModels}
              disabled={testingConnection}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  testingConnection ? 'animate-spin' : ''
                }`}
              />
              <span>
                {testingConnection
                  ? 'Scanning...'
                  : '🔄 Scan Available Models'}
              </span>
            </button>
          </div>

          {/* Expanded 9 Provider Presets Grid */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              One-Click Provider Presets
            </label>
            <div
              style={{
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
              }}
              className="grid gap-2"
            >
              {AI_BACKEND_PRESETS.map((preset) => {
                const isSelected = aiConfig.preset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    style={
                      isSelected
                        ? { borderColor: 'var(--theme-accent)' }
                        : undefined
                    }
                    className={`theme-hover-outline rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-50 dark:bg-slate-800/90'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {preset.label}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {preset.requiresKey
                        ? 'Auth Token Required'
                        : 'Local · No Key'}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {currentPresetMeta.description}
            </p>
          </div>

          {/* Endpoint URL, Bearer Credential Input & Prominent "⚡ Connect & Test" Button */}
          <div className="space-y-3">
            <div
              style={{
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
              }}
              className="grid gap-3 items-end"
            >
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Base Endpoint URL</span>
                  <Tooltip content="Endpoint base URL for /v1/chat/completions, Ollama /api/tags, or Gemini /v1beta/openai." />
                </label>
                <input
                  type="url"
                  value={aiConfig.url}
                  onChange={(e) =>
                    setAiConfig((prev) => ({ ...prev, url: e.target.value }))
                  }
                  placeholder="http://localhost:1234/v1"
                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>
                    {currentPresetMeta.requiresKey
                      ? 'Provider Bearer Token (Required)'
                      : 'Bearer Token (Optional for Local)'}
                  </span>
                  <Tooltip content="Authorization token for cloud endpoints (Gemini, xAI Grok, OpenRouter, Groq, OpenAI). Stored locally in your browser workspace and never exported into Character Cards." />
                </label>
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(e) =>
                    setAiConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder={
                    currentPresetMeta.requiresKey
                      ? 'Enter endpoint authorization token...'
                      : 'Not required for localhost'
                  }
                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleScanModels}
                  disabled={testingConnection}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline w-full flex items-center justify-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {testingConnection ? (
                    <RefreshCw
                      className="h-3.5 w-3.5 animate-spin"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                  ) : (
                    <Zap
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                  )}
                  <span>
                    {testingConnection ? 'Testing...' : '⚡ Connect & Test'}
                  </span>
                </button>
              </div>
            </div>

            {/* Live Connection Reliability Status Banner */}
            {testResult && (
              <div
                className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                  testResult.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-semibold">{testResult.message}</div>
                  {!testResult.ok && (
                    <div className="text-[11px] opacity-90">
                      {testResult.corsHint ||
                        'Verify your API key, confirm the endpoint server is online, or enable CORS for localhost servers (LM Studio / Ollama).'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Searchable Model Selector & Custom Model Input */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 28%, transparent)',
            }}
            className="rounded-lg border bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Model Selection &amp; Live Scanner ({allSelectableModels.length}{' '}
                listed)
              </label>
              <div className="relative w-52">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder="Filter models..."
                  className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-7 pr-2.5 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div
              style={{
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
              }}
              className="grid gap-3"
            >
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Scanned &amp; Preset Models Dropdown
                </span>
                <select
                  value={
                    allSelectableModels.includes(aiConfig.modelName)
                      ? aiConfig.modelName
                      : ''
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      setAiConfig((prev) => ({
                        ...prev,
                        modelName: e.target.value,
                      }));
                    }
                  }}
                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white cursor-pointer"
                >
                  {!allSelectableModels.includes(aiConfig.modelName) && (
                    <option value="">
                      Custom: {aiConfig.modelName || 'Select a model'}
                    </option>
                  )}
                  {allSelectableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Active Model Identifier (Custom Override)
                </span>
                <input
                  type="text"
                  value={aiConfig.modelName}
                  onChange={(e) =>
                    setAiConfig((prev) => ({
                      ...prev,
                      modelName: e.target.value,
                    }))
                  }
                  placeholder="e.g., meta-llama/llama-4-maverick"
                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Automatic Model Compatibility & Thinking Format Selection */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-2 text-xs">
                <Cpu
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span className="text-slate-600 dark:text-slate-400">
                  Auto-Detected Format:
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {COMPATIBILITY_FORMAT_LABELS[autoDetectedFormat]}
                </span>
                <Tooltip content="TavernSmith automatically detects Reasoning/Thinking models (DeepSeek R1, Qwen QwQ, Gemini Thinking, Grok Reasoning) and strips <think>...</think> blocks from output." />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Format Override:
                </label>
                <select
                  value={aiConfig.compatibilityFormat || 'auto'}
                  onChange={(e) =>
                    setAiConfig((prev) => ({
                      ...prev,
                      compatibilityFormat: e.target
                        .value as ModelCompatibilityFormat,
                    }))
                  }
                  className="theme-focus-ring font-mono rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-900 dark:text-white cursor-pointer"
                >
                  <option value="auto">
                    Auto ({COMPATIBILITY_FORMAT_LABELS[autoDetectedFormat]})
                  </option>
                  {(
                    Object.keys(COMPATIBILITY_FORMAT_LABELS) as Array<
                      Exclude<ModelCompatibilityFormat, 'auto'>
                    >
                  ).map((fmtKey) => (
                    <option key={fmtKey} value={fmtKey}>
                      {COMPATIBILITY_FORMAT_LABELS[fmtKey]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Active Parser:{' '}
              <strong>{COMPATIBILITY_FORMAT_LABELS[effectiveFormat]}</strong> ·
              Automatically strips <code className="font-mono">&lt;think&gt;</code>
              , <code className="font-mono">&lt;thought&gt;</code>,{' '}
              <code className="font-mono">&lt;reasoning&gt;</code>, and{' '}
              <code className="font-mono">reasoning_content</code> into a
              collapsible Reasoning drawer.
            </div>
          </div>

          {/* Sampling Temperature & Inline Ghost Text Controls */}
          <div
            style={{
              gridTemplateColumns:
                'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            }}
            className="grid gap-6 pt-2 border-t border-slate-200 dark:border-slate-800"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span>Sampling Temperature</span>
                  <Tooltip content="Controls creativity vs determinism (0.2 = analytical/strict, 0.8 = expressive roleplay prose)." />
                </label>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {aiConfig.temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.5}
                step={0.05}
                value={aiConfig.temperature}
                onChange={(e) =>
                  setAiConfig((prev) => ({
                    ...prev,
                    temperature: Number(e.target.value),
                  }))
                }
                className="w-full cursor-pointer"
                style={{ accentColor: 'var(--theme-accent)' }}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="ghost-text-toggle"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <span>Inline AI Ghost Text Autocomplete</span>
                  <Tooltip content="Displays non-intrusive inline completion suggestions inside SmartEditor after you pause typing." />
                </label>
                <input
                  id="ghost-text-toggle"
                  type="checkbox"
                  checked={aiConfig.ghostTextEnabled}
                  onChange={(e) =>
                    setAiConfig((prev) => ({
                      ...prev,
                      ghostTextEnabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: 'var(--theme-accent)' }}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Ghost Text Debounce Delay
                  </span>
                  <span className="font-mono text-slate-900 dark:text-white tabular-nums">
                    {aiConfig.debounceMs} ms
                  </span>
                </div>
                <input
                  type="range"
                  min={250}
                  max={1500}
                  step={50}
                  disabled={!aiConfig.ghostTextEnabled}
                  value={aiConfig.debounceMs}
                  onChange={(e) =>
                    setAiConfig((prev) => ({
                      ...prev,
                      debounceMs: Number(e.target.value),
                    }))
                  }
                  className="w-full cursor-pointer"
                  style={{ accentColor: 'var(--theme-accent)' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About & Changelog Modal */}
      {showAboutModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="w-full max-w-xl rounded-xl border bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  style={{
                    borderColor: 'var(--theme-accent)',
                    backgroundColor:
                      'color-mix(in srgb, var(--theme-accent) 15%, transparent)',
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded border text-xs font-bold text-slate-900 dark:text-white"
                >
                  TS
                </div>
                <div>
                  <h2
                    id="about-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    TavernSmith IDE · Release v1.0.0
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    SillyTavern V2 &amp; V3 Character Card &amp; Lorebook Workbench
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300 max-h-[65vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-900 dark:text-white">
                  v1.0.0 Release Notes (Synced with CHANGELOG.md)
                </div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Interactive SillyTavern 2:3 Portrait Cropper:</strong>{' '}
                    Automatically verifies uploaded/dropped character portraits against SillyTavern&apos;s <code className="font-mono">2:3</code> aspect ratio (<code className="font-mono">512×768</code> / <code className="font-mono">400×600</code>) and opens an interactive HTML5 <code className="font-mono">&lt;canvas&gt;</code> pan &amp; zoom cropper modal.
                  </li>
                  <li>
                    <strong>Full Drag-and-Drop Import &amp; Reordering:</strong>{' '}
                    Drop <code className="font-mono">.png</code> cards, <code className="font-mono">.json</code> files, or portrait images directly onto the workbenches, and drag-and-drop to reorder Lorebook Entries, DM Stat-Block attributes, and Alternate Greetings.
                  </li>
                  <li>
                    <strong>Pure-Browser PNG Steganography &amp; JSON I/O:</strong>{' '}
                    Reads and writes SillyTavern V2 (<code className="font-mono">chara</code>) and V3 (<code className="font-mono">ccv3</code>) PNG <code className="font-mono">tEXt</code> chunks with IEEE 802.3 CRC32 verification.
                  </li>
                  <li>
                    <strong>Storage &amp; Save Folder Manager:</strong> Local PC folder picker (<code className="font-mono">showDirectoryPicker</code>) + In-App Save Folder browser, unified manual/auto-save target, and 1-click folder backup export.
                  </li>
                  <li>
                    <strong>Auto-Formatting &amp; Thinking Stripper:</strong>{' '}
                    Auto-detects Llama 3/4, DeepSeek/Qwen{' '}
                    <code className="font-mono">&lt;think&gt;</code>, Gemini
                    Thinking, and xAI Grok Reasoning models, stripping
                    chain-of-thought into a collapsible Reasoning drawer.
                  </li>
                </ul>
              </div>

              <div
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                }}
                className="rounded-lg border bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2"
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                  <ShieldCheck
                    className="h-4 w-4"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span>Sandbox Security &amp; Memory Hygiene Status</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <li>
                    · <strong>Zero-Crash Browser Runtime:</strong> Pure Web APIs
                    (<code className="font-mono">ArrayBuffer</code>,{' '}
                    <code className="font-mono">DataView</code>,{' '}
                    <code className="font-mono">Uint8Array</code>,{' '}
                    <code className="font-mono">localStorage</code>) with zero
                    Node-only polyfill dependencies.
                  </li>
                  <li>
                    · <strong>Zero Credential Leakage:</strong> Exported PNG and
                    JSON files strictly serialize only V2/V3 Character &amp; Lorebook
                    fields—never API keys.
                  </li>
                  <li>
                    · <strong>Lifecycle Cleanup Verified:</strong> All auto-save
                    intervals, tooltip timers, and{' '}
                    <code className="font-mono">AbortController</code> network
                    probes are strictly torn down on unmount.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-4 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
