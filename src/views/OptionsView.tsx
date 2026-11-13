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
  HardDrive,
  Trash2,
  Download,
  FileJson,
  Clock,
  Archive,
  Zap,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  User,
  BookOpen,
  Database,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  KeyRound,
} from 'lucide-react';
import {
  formatSafeTimestamp,
  META_FILENAME,
  UNIFIED_INTERNAL_ROOT,
  useStore,
} from '../context/StoreContext';
import {
  AI_BACKEND_PRESETS,
  COMPATIBILITY_FORMAT_LABELS,
  ConnectionTestResult,
  detectModelCompatibilityFormat,
  doesBackendSupportVision,
  getProviderKeyId,
  isModelVisionCapable,
  resolveEffectiveFormat,
  testBackendConnection,
} from '../services/aiService';
import {
  decryptProviderKeysFromVault,
  encryptAndSaveProviderKeys,
  getDecryptedKeyForProvider,
  getVaultStatusInfo,
  lockVaultSessionInMemory,
  updateVaultPassphrase,
} from '../utils/cryptoVault';
import { AIPresetId, ModelCompatibilityFormat, SavedFileEntry } from '../types';
import { Tooltip } from '../components/Tooltip';
import { AppLogo } from '../components/AppLogo';
import { triggerBrowserDownload } from '../utils/cardIO';
import { APP_VERSION, CHANGELOG_RELEASES } from '../utils/changelogData';

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
    switchAIPreset,
    saveNow,
    saveAndSyncNow,
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
    loadSavedFileIntoWorkspace,
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
  const [folderStatusMessage, setFolderStatusMessage] = useState<string | null>(
    null
  );

  // Collapsible Subfolder Tree States inside Unified Save Folder
  const [charactersFolderOpen, setCharactersFolderOpen] = useState(true);
  const [lorebooksFolderOpen, setLorebooksFolderOpen] = useState(true);
  const [metaSectionOpen, setMetaSectionOpen] = useState(true);

  // API Key Show/Hide & AES-256-GCM Vault States
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyActionMessage, setKeyActionMessage] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState(() => getVaultStatusInfo());
  const [vaultPassphraseInput, setVaultPassphraseInput] = useState('');
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [showVaultPassphraseBar, setShowVaultPassphraseBar] = useState(false);

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

  // Group Unified Save Folder files into `Characters/`, `Lorebooks/`, and `_tavernsmith_meta.json`
  const characterSavedFiles = useMemo(
    () => savedFiles.filter((f) => f.kind === 'character'),
    [savedFiles]
  );

  const lorebookSavedFiles = useMemo(
    () => savedFiles.filter((f) => f.kind === 'lorebook'),
    [savedFiles]
  );

  const metaSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.kind === 'meta' || f.fileName === META_FILENAME
      ),
    [savedFiles]
  );

  const handleSelectPreset = (presetId: AIPresetId) => {
    switchAIPreset(presetId);
    setTestResult(null);
    setShowApiKey(false);
    setVaultStatus(getVaultStatusInfo());
  };

  const handleToggleRevealApiKey = async () => {
    const nextShow = !showApiKey;
    setShowApiKey(nextShow);
    if (nextShow && !aiConfig.apiKey) {
      const providerKey = getProviderKeyId(aiConfig.preset);
      const decrypted = await getDecryptedKeyForProvider(
        providerKey,
        aiConfig.preset
      );
      if (decrypted) {
        setAiConfig((prev) => ({
          ...prev,
          apiKey: decrypted,
          savedProviderKeys: {
            ...(prev.savedProviderKeys || {}),
            [providerKey]: decrypted,
            [prev.preset]: decrypted,
          },
        }));
      }
    }
    setVaultStatus(getVaultStatusInfo());
  };

  const handleSaveOrUpdateApiKey = async () => {
    const providerKey = getProviderKeyId(aiConfig.preset);
    const trimmedKey = aiConfig.apiKey.trim();
    const updatedMap: Record<string, string> = {
      ...(aiConfig.savedProviderKeys || {}),
      [providerKey]: trimmedKey,
      [aiConfig.preset]: trimmedKey,
    };
    setAiConfig((prev) => ({
      ...prev,
      apiKey: trimmedKey,
      savedProviderKeys: updatedMap,
    }));
    await encryptAndSaveProviderKeys(updatedMap);
    setVaultStatus(getVaultStatusInfo());
    setKeyActionMessage(
      trimmedKey
        ? `AES-256-GCM Encrypted & Saved Key for ${currentPresetMeta.label}`
        : `Cleared Key for ${currentPresetMeta.label}`
    );
    window.setTimeout(() => setKeyActionMessage(null), 4000);
  };

  const handleClearApiKey = async () => {
    const providerKey = getProviderKeyId(aiConfig.preset);
    const updatedMap: Record<string, string> = {
      ...(aiConfig.savedProviderKeys || {}),
      [providerKey]: '',
      [aiConfig.preset]: '',
    };
    setAiConfig((prev) => ({
      ...prev,
      apiKey: '',
      savedProviderKeys: updatedMap,
    }));
    await encryptAndSaveProviderKeys(updatedMap);
    setVaultStatus(getVaultStatusInfo());
    setKeyActionMessage(
      aiConfig.preset === 'gemini'
        ? 'Cleared Custom Gemini Key (Reverted to /api/gemini Server Fallback)'
        : `Cleared API Key for ${currentPresetMeta.label}`
    );
    window.setTimeout(() => setKeyActionMessage(null), 4000);
  };

  const handleApplyVaultPassphrase = async () => {
    const cleanPass = vaultPassphraseInput.trim();
    if (!cleanPass) {
      setVaultMessage('Enter a Passphrase or PIN first.');
      return;
    }
    // First attempt unlock if vault is currently locked with a custom passphrase
    const status = getVaultStatusInfo();
    if (status.hasCustomPassphrase && status.isLocked) {
      const unlocked = await decryptProviderKeysFromVault(cleanPass);
      if (unlocked.ok) {
        const providerKey = getProviderKeyId(aiConfig.preset);
        const restoredKey =
          unlocked.keys[providerKey] || unlocked.keys[aiConfig.preset] || '';
        setAiConfig((prev) => ({
          ...prev,
          apiKey: restoredKey,
          savedProviderKeys: unlocked.keys,
        }));
        setVaultStatus(getVaultStatusInfo());
        setVaultPassphraseInput('');
        setVaultMessage(
          'Vault unlocked in memory using your Passphrase / PIN.'
        );
        window.setTimeout(() => setVaultMessage(null), 5000);
        return;
      } else {
        setVaultMessage(
          unlocked.error || 'Incorrect Vault Passphrase / PIN.'
        );
        window.setTimeout(() => setVaultMessage(null), 5000);
        return;
      }
    }
    if (Object.keys(aiConfig.savedProviderKeys || {}).length > 0) {
      await encryptAndSaveProviderKeys(
        aiConfig.savedProviderKeys || {},
        cleanPass
      );
    }
    const res = await updateVaultPassphrase(cleanPass);
    setVaultStatus(getVaultStatusInfo());
    setVaultPassphraseInput('');
    setVaultMessage(res.message);
    window.setTimeout(() => setVaultMessage(null), 5000);
  };

  const handleRemoveVaultPassphrase = async () => {
    const res = await updateVaultPassphrase(null);
    setVaultStatus(getVaultStatusInfo());
    setVaultPassphraseInput('');
    setVaultMessage(res.message);
    window.setTimeout(() => setVaultMessage(null), 5000);
  };

  const handleLockVaultInMemory = () => {
    lockVaultSessionInMemory();
    setShowApiKey(false);
    setAiConfig((prev) => ({
      ...prev,
      apiKey: '',
      savedProviderKeys: {},
    }));
    setVaultStatus(getVaultStatusInfo());
    setVaultMessage(
      'Vault locked in memory. Keys remain AES-256-GCM encrypted in _tavernsmith_vault_enc.'
    );
    window.setTimeout(() => setVaultMessage(null), 5000);
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
    window.setTimeout(() => setFolderStatusMessage(null), 6000);
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

  const handleSaveAllToFolderNow = async () => {
    const res = await saveAndSyncNow();
    setFolderStatusMessage(res.message);
    window.setTimeout(() => setFolderStatusMessage(null), 5000);
  };

  const handleLoadFile = (file: SavedFileEntry) => {
    const res = loadSavedFileIntoWorkspace(file);
    setFolderStatusMessage(res.message);
    window.setTimeout(() => setFolderStatusMessage(null), 4000);
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
            IDE Options, AI Connections &amp; Unified Save Folder Manager
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure local/cloud AI endpoints, live model scanning, unified Root Save Folder (`Characters/` &amp; `Lorebooks/`), and workspace appearance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSaveAllToFolderNow}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save All to Folder Now</span>
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
            <span>About &amp; Changelog (v{APP_VERSION})</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: UNIFIED STORAGE & SAVE FOLDER MANAGER */}
      <div
        style={{ borderColor: 'var(--theme-accent)' }}
        className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              style={{
                borderColor: 'var(--theme-accent)',
                backgroundColor:
                  'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border shrink-0 mt-0.5"
            >
              <FolderOpen
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Storage &amp; Unified Save Folder Manager
                </h2>
                <Tooltip content="TavernSmith uses ONE unified Root Save Folder with automatic Characters/ and Lorebooks/ subfolders plus _tavernsmith_meta.json. Browsers store files internally in IndexedDB / localStorage until you link a Local PC folder via Select Save Folder (Local PC). Note: If running inside AI Studio's preview iframe, open the app in a new browser tab to enable the native OS folder picker." />
              </div>

              {/* Clear Storage Mode Badge */}
              <div className="flex flex-wrap items-center gap-2">
                {nativeDirectoryName ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <HardDrive className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Local PC Hard Drive Folder: {nativeDirectoryName}/
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Database
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span>
                      Browser Internal Storage (IndexedDB / localStorage) — Root: {UNIFIED_INTERNAL_ROOT}
                    </span>
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {nativeDirectoryName ? (
                  <>
                    Directly reading and writing real{' '}
                    <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {nativeDirectoryName}/Characters/
                    </code>
                    ,{' '}
                    <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {nativeDirectoryName}/Lorebooks/
                    </code>
                    , and{' '}
                    <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {nativeDirectoryName}/{META_FILENAME}
                    </code>{' '}
                    on your hard drive.
                  </>
                ) : (
                  <>
                    Files are persisted automatically inside your browser&apos;s internal storage under{' '}
                    <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      Characters/
                    </code>
                    ,{' '}
                    <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      Lorebooks/
                    </code>
                    , and{' '}
                    <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {META_FILENAME}
                    </code>
                    . Click <strong>Select Save Folder (Local PC)</strong> to sync with a real folder on your computer (if inside an iframe preview, open in a new tab first).
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Toolbar: Save All to Folder Now + Rescan Folder + Select Save Folder (Local PC) + Export Bundle */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveAllToFolderNow}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save All to Folder Now</span>
            </button>

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
                Saved Local PC Hard Drive folder{' '}
                <strong className="font-mono">{pendingReconnectFolderName}/</strong>{' '}
                found in IndexedDB. Click to grant read/write access and sync{' '}
                <code className="font-mono">Characters/</code> &amp;{' '}
                <code className="font-mono">Lorebooks/</code>:
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
              className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer ml-3 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Unified Save Folder Tree + Storage Telemetry Grid */}
        <div
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          }}
          className="grid gap-5 items-start"
        >
          {/* Left Column: Unified Root Save Folder Subfolder Tree (`Characters/`, `Lorebooks/`, `_tavernsmith_meta.json`) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3.5 space-y-3 min-w-0">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                <FileJson
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>
                  Root Save Folder Tree:{' '}
                  <code className="font-mono">
                    {nativeDirectoryName
                      ? `/${nativeDirectoryName}/`
                      : UNIFIED_INTERNAL_ROOT}
                  </code>
                </span>
              </div>
              <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {savedFiles.length} saved file{savedFiles.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {/* SUBFOLDER 1: Characters/ */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCharactersFolderOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {charactersFolderOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <User
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span className="font-mono">
                      Characters/ ({characterSavedFiles.length} file
                      {characterSavedFiles.length === 1 ? '' : 's'})
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    SillyTavern V2/V3 Cards
                  </span>
                </button>

                {charactersFolderOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60">
                    {characterSavedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-950/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                              Characters/{file.fileName}
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
                            onClick={() => handleLoadFile(file)}
                            title="Load Character into Workbench"
                            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSavedFile(file)}
                            title="Download Character JSON file"
                            className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedFile(file.id)}
                            title="Delete Character file from Save Folder"
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

              {/* SUBFOLDER 2: Lorebooks/ */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLorebooksFolderOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {lorebooksFolderOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <BookOpen
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span className="font-mono">
                      Lorebooks/ ({lorebookSavedFiles.length} file
                      {lorebookSavedFiles.length === 1 ? '' : 's'})
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    World Info Books
                  </span>
                </button>

                {lorebooksFolderOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60">
                    {lorebookSavedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-950/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                              Lorebooks/{file.fileName}
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
                            onClick={() => handleLoadFile(file)}
                            title="Load Lorebook into Workbench"
                            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSavedFile(file)}
                            title="Download Lorebook JSON file"
                            className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedFile(file.id)}
                            title="Delete Lorebook file from Save Folder"
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

              {/* ROOT METADATA FILE: _tavernsmith_meta.json */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMetaSectionOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {metaSectionOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <ShieldCheck
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span className="font-mono">{META_FILENAME}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    {tags.length} Tags · {themes.length} Context Themes
                  </span>
                </button>

                {metaSectionOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60">
                    {metaSavedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-950/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                              /{file.fileName}
                            </span>
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600 dark:text-slate-300">
                              root meta
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {(file.sizeBytes / 1024).toFixed(2)} KB · Synced{' '}
                            {formatSafeTimestamp(file.updatedAt)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadFile(file)}
                            title="Reload Tags & Context Themes from metadata file"
                            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSavedFile(file)}
                            title="Download _tavernsmith_meta.json"
                            className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Storage Quota Telemetry & Live Save Activity Log */}
          <div className="space-y-4 min-w-0">
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
                  <div className="text-[10px] text-slate-500">Characters/</div>
                </div>
                <div className="rounded border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {lorebooks.length}
                  </div>
                  <div className="text-[10px] text-slate-500">Lorebooks/</div>
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
                <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[11px]">
                  {saveLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-600 dark:text-slate-300"
                    >
                      <span className="truncate">
                        <strong className="uppercase text-slate-900 dark:text-white">
                          [{log.mode}]
                        </strong>{' '}
                        {log.folderPath} ({log.filesWritten.join(', ')})
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

            {/* Centralized Master Toggle: Show / Hide NSFW Content */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
              <label className="flex items-center justify-between gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span>Show / Hide NSFW Content (Master Filter)</span>
                  <Tooltip content="Centralized NSFW visibility control. When 'Hide NSFW Content' is enabled, all NSFW-flagged Tags, NSFW-flagged Characters, and NSFW-flagged Lorebooks are hidden across the visual UI while keeping any active AI generation context intact." />
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    settings.hideNsfwTags
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                  }`}
                >
                  {settings.hideNsfwTags ? 'SFW Safe View' : '18+ Visible'}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => updateSettings({ hideNsfwTags: false })}
                  style={
                    !settings.hideNsfwTags
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold cursor-pointer ${
                    !settings.hideNsfwTags
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>🔞 Show NSFW Content</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ hideNsfwTags: true })}
                  style={
                    settings.hideNsfwTags
                      ? { borderColor: 'var(--theme-accent)' }
                      : undefined
                  }
                  className={`theme-hover-outline flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold cursor-pointer ${
                    settings.hideNsfwTags
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Hide NSFW Content</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Hides all NSFW-flagged Tags, Characters, and Lorebooks across the entire workspace when enabled.
              </p>
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
                <Tooltip content="Periodically saves all Characters (Characters/), Lorebooks (Lorebooks/), and _tavernsmith_meta.json to the active Save Folder." />
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
                onClick={handleSaveAllToFolderNow}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white cursor-pointer"
              >
                <Save
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>Save All to Folder Now</span>
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
                const providerKey = getProviderKeyId(preset.id);
                const hasSavedKey = Boolean(
                  (
                    aiConfig.savedProviderKeys?.[preset.id] ||
                    aiConfig.savedProviderKeys?.[providerKey] ||
                    ''
                  ).trim()
                );
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
                      {hasSavedKey && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                          Key Saved ✓
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {preset.requiresKey
                        ? hasSavedKey
                          ? 'Saved Key Auto-Loaded'
                          : 'Auth Token Required'
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

              {/* API Key Input Field — ALWAYS Unblocked & Editable for ALL Providers Including Google Gemini */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <KeyRound
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span>
                      {aiConfig.preset === 'gemini'
                        ? 'Google Gemini API Key (Custom Key Prioritized)'
                        : currentPresetMeta.requiresKey
                          ? `${currentPresetMeta.label} API Key`
                          : 'Bearer API Key (Optional for Local)'}
                    </span>
                    <Tooltip content="Encrypted at rest using AES-256-GCM (PBKDF2 100k iterations, 12B IV, 16B Salt) in _tavernsmith_vault_enc. Never written in plaintext or exported into Character/Lorebook files." />
                  </label>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                    <Lock className="h-2.5 w-2.5" />
                    <span>AES-256-GCM Vault</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={aiConfig.apiKey}
                      onChange={(e) =>
                        setAiConfig((prev) => ({
                          ...prev,
                          apiKey: e.target.value,
                        }))
                      }
                      placeholder={
                        aiConfig.preset === 'gemini'
                          ? 'Enter Gemini API key (AIza...) or leave empty for /api/gemini fallback'
                          : currentPresetMeta.requiresKey
                            ? `Enter ${currentPresetMeta.label} API key...`
                            : 'Optional local bearer token...'
                      }
                      autoComplete="off"
                      spellCheck={false}
                      className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleToggleRevealApiKey}
                      title={
                        showApiKey
                          ? 'Hide API Key'
                          : 'Decrypt & Reveal API Key in Memory'
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showApiKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveOrUpdateApiKey}
                    style={{ borderColor: 'var(--theme-accent)' }}
                    title="Encrypt with AES-256-GCM and save key for this provider"
                    className="theme-hover-outline shrink-0 rounded-lg border bg-white dark:bg-slate-900 px-2.5 py-2 text-[11px] font-semibold text-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    Save / Update Key
                  </button>

                  {aiConfig.apiKey && (
                    <button
                      type="button"
                      onClick={handleClearApiKey}
                      title="Clear saved API key for this provider"
                      className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300 cursor-pointer whitespace-nowrap"
                    >
                      Clear Key
                    </button>
                  )}
                </div>

                {/* Gemini Key Priority vs Server Fallback Indicator */}
                {aiConfig.preset === 'gemini' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10px] font-mono">
                    {aiConfig.apiKey.trim() ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span>
                          Custom Gemini API Key Active — Prioritized directly for all Gemini calls
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" />
                        <span>
                          Key field empty — Using automatic server proxy fallback (/api/gemini)
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {keyActionMessage && (
                  <div className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ {keyActionMessage}
                  </div>
                )}
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

            {/* AES-256-GCM Encrypted API Key Vault & Optional Passphrase / PIN Bar */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px]">
                  {!vaultStatus.isLocked ? (
                    <Unlock className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Encrypted Key Vault (`_tavernsmith_vault_enc`)
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    AES-256-GCM • PBKDF2-SHA256 (100k iter) • 12B IV + 16B Salt •{' '}
                    {vaultStatus.hasCustomPassphrase
                      ? 'Passphrase/PIN Protected'
                      : 'Auto Device-Key Mode'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setShowVaultPassphraseBar((prev) => !prev)
                    }
                    className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    {showVaultPassphraseBar
                      ? 'Hide Vault PIN / Passphrase'
                      : vaultStatus.hasCustomPassphrase
                        ? 'Unlock / Manage Vault PIN'
                        : 'Set Optional Vault Passphrase / PIN'}
                  </button>
                  {vaultStatus.hasCustomPassphrase && !vaultStatus.isLocked && (
                    <button
                      type="button"
                      onClick={handleLockVaultInMemory}
                      title="Wipe decrypted keys from RAM until unlocked again"
                      className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-300 cursor-pointer"
                    >
                      Lock Session
                    </button>
                  )}
                </div>
              </div>

              {(showVaultPassphraseBar ||
                (vaultStatus.hasCustomPassphrase && vaultStatus.isLocked)) && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800/70">
                  <input
                    type="password"
                    value={vaultPassphraseInput}
                    onChange={(e) => setVaultPassphraseInput(e.target.value)}
                    placeholder={
                      vaultStatus.hasCustomPassphrase && vaultStatus.isLocked
                        ? 'Enter Vault Passphrase / PIN to unlock keys...'
                        : 'Enter new Vault Passphrase / PIN (PBKDF2-SHA256)...'
                    }
                    autoComplete="off"
                    className="theme-focus-ring font-mono flex-1 min-w-[210px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleApplyVaultPassphrase}
                    style={{ borderColor: 'var(--theme-accent)' }}
                    className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-[11px] font-semibold text-white dark:text-slate-900 cursor-pointer"
                  >
                    {vaultStatus.hasCustomPassphrase && vaultStatus.isLocked
                      ? 'Unlock Vault'
                      : 'Encrypt with Passphrase / PIN'}
                  </button>
                  {vaultStatus.hasCustomPassphrase && (
                    <button
                      type="button"
                      onClick={handleRemoveVaultPassphrase}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-rose-500 cursor-pointer"
                    >
                      Switch to Auto Device-Key
                    </button>
                  )}
                </div>
              )}

              {vaultMessage && (
                <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  {vaultMessage}
                </div>
              )}
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
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Model Selection &amp; Live Scanner ({allSelectableModels.length}{' '}
                  listed)
                </label>
                {doesBackendSupportVision(aiConfig) ? (
                  <span
                    style={{
                      borderColor:
                        'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
                    }}
                    className="inline-flex items-center gap-1 rounded-md border bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
                  >
                    <span>👁️ Vision Supported</span>
                    <span className="opacity-80">
                      ({isModelVisionCapable(aiConfig.modelName) ? 'Auto' : 'Forced'})
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    Text-Only Model
                  </span>
                )}
              </div>
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

            {/* Multimodal Vision Input Detection & Force Enable Toggle for Custom Local GGUFs */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Multimodal Vision Context (~260 tok JPEG):
                </span>
                {doesBackendSupportVision(aiConfig) ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    👁️ Vision Supported
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    Not detected from model name
                  </span>
                )}
                <Tooltip
                  title="Zero-Bloat Multimodal Vision (~260 Tokens Max)"
                  content="Vision-capable models (Gemini, Gemma 3/4, Qwen-VL/Qwen3, Pixtral, LLaVA, Llama 4, Llama 3.2 Vision, MiniCPM-V, Grok, GPT-4o/4.1, Claude 3/4) can inspect the Character Portrait or a temporary reference image during AI Assist. Images are compressed to 512px JPEG (~260 tokens) and NEVER sent during background Ghost-Text autocomplete."
                />
              </div>

              <label
                htmlFor="force-enable-vision-checkbox"
                className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
              >
                <input
                  id="force-enable-vision-checkbox"
                  type="checkbox"
                  checked={Boolean(aiConfig.forceEnableVision)}
                  onChange={(e) =>
                    setAiConfig((prev) => ({
                      ...prev,
                      forceEnableVision: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded cursor-pointer"
                  style={{ accentColor: 'var(--theme-accent)' }}
                />
                <span>Force Enable Vision Input</span>
                <Tooltip content="Enable this for custom-named local GGUF vision models in LM Studio or Ollama that have a Vision (mmproj) projector loaded." />
              </label>
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
            className="w-full max-w-2xl rounded-xl border bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <AppLogo className="h-7 w-7 rounded-md" size={28} />
                <div>
                  <h2
                    id="about-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    TavernSmith IDE · Release v{APP_VERSION}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    SillyTavern V2 &amp; V3 Character Card &amp; Lorebook Workbench (Synced with CHANGELOG.md)
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

            <div className="space-y-5 text-xs leading-relaxed text-slate-600 dark:text-slate-300 max-h-[65vh] overflow-y-auto pr-1">
              {CHANGELOG_RELEASES.map((rel, idx) => (
                <div
                  key={rel.version}
                  style={
                    idx === 0
                      ? {
                          borderColor:
                            'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
                        }
                      : undefined
                  }
                  className={`rounded-lg border p-4 space-y-3 ${
                    idx === 0
                      ? 'bg-slate-50/80 dark:bg-slate-950/80'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span
                        style={
                          idx === 0
                            ? {
                                borderColor: 'var(--theme-accent)',
                                color: 'var(--theme-accent)',
                              }
                            : undefined
                        }
                        className="rounded border border-slate-300 dark:border-slate-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-900 dark:text-white"
                      >
                        {rel.version}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {rel.title}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {rel.date}
                    </span>
                  </div>

                  {rel.highlights.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        🚀 Highlights &amp; Feature Additions
                      </div>
                      <ul className="list-disc pl-4 space-y-1">
                        {rel.highlights.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rel.fixes.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        🛠️ Bug Fixes, AI &amp; Stability Improvements
                      </div>
                      <ul className="list-disc pl-4 space-y-1">
                        {rel.fixes.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rel.fileChanges.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        📂 Detailed Component &amp; File Changes
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {rel.fileChanges.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Zero-Crash Sandbox &amp; Per-Provider Credential Vault</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pure browser binary APIs (<code className="font-mono">ArrayBuffer</code>,{' '}
                  <code className="font-mono">DataView</code>,{' '}
                  <code className="font-mono">Uint8Array</code>). Provider API keys are persisted per provider in local browser storage and never included in exported <code className="font-mono">.png</code> or <code className="font-mono">.json</code> files.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
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
