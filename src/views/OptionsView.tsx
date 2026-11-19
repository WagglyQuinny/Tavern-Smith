import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sun,
  Moon,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  RotateCcw,
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
  Upload,
  FileJson,
  Archive,
  Zap,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  User,
  BookOpen,
  Eye,
  EyeOff,
  Lock,
  KeyRound,
  Palette,
  Tag,
} from 'lucide-react';
import {
  formatSafeTimestamp,
  isCharacterNsfw,
  isLorebookNsfw,
  isTagNsfwFlagged,
  isThemeNsfw,
  META_FILENAME,
  UNIFIED_INTERNAL_ROOT,
  useStore,
} from '../context/StoreContext';
import {
  AI_BACKEND_PRESETS,
  COMPATIBILITY_FORMAT_LABELS,
  detectModelCompatibilityFormat,
  doesBackendSupportVision,
  getProviderKeyId,
  isLocalBackend,
} from '../services/aiService';
import {
  encryptAndSaveProviderKeys,
  getDecryptedKeyForProvider,
  getVaultStatusInfo,
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
    isAiConnected,
    isTestingAiConnection,
    aiConnectionResult,
    connectAiBackend,
    disconnectAiBackend,
    clearAiConnectionFeedback,
    vaultRevision,
    unlockLegacyVault,
    resetWorkspaceToDefaults,
    lastSavedAt,
    saveAndSyncNow,
    savedFiles,
    loadSavedFileIntoWorkspace,
    requestDeleteSavedFile,
    exportSaveFolderBundle,
    importSaveFolderBundle,
  } = useStore();

  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [folderStatusMessage, setFolderStatusMessage] = useState<string | null>(
    null
  );
  const [isSyncingDisk, setIsSyncingDisk] = useState(false);

  // Collapsible Subfolder Tree States inside Unified Save Folder
  const [charactersFolderOpen, setCharactersFolderOpen] = useState(true);
  const [lorebooksFolderOpen, setLorebooksFolderOpen] = useState(true);
  const [themesFolderOpen, setThemesFolderOpen] = useState(true);
  const [tagsFolderOpen, setTagsFolderOpen] = useState(true);
  const [metaSectionOpen, setMetaSectionOpen] = useState(true);

  // API Key Show/Hide & Separate App-Private AES-256-GCM Vault States
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyActionMessage, setKeyActionMessage] = useState<string | null>(null);
  const [vaultUiTick, setVaultUiTick] = useState(0);
  const [legacyPinInput, setLegacyPinInput] = useState('');
  const [isMigratingLegacyVault, setIsMigratingLegacyVault] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [vaultMessageIsError, setVaultMessageIsError] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);

  const backupImportInputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<Set<number>>(new Set());

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  };

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current.clear();
    };
  }, []);

  const vaultStatus = useMemo(
    () => getVaultStatusInfo(),
    // Re-read vault status whenever StoreContext loads/migrates vault or local key action runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vaultRevision, vaultUiTick, aiConfig.savedProviderKeys]
  );

  const currentPresetMeta = useMemo(
    () =>
      AI_BACKEND_PRESETS.find((p) => p.id === aiConfig.preset) ||
      AI_BACKEND_PRESETS[0],
    [aiConfig.preset]
  );

  const isLocalServer = useMemo(() => isLocalBackend(aiConfig), [aiConfig]);

  const autoDetectedFormat = useMemo(
    () => detectModelCompatibilityFormat(aiConfig.modelName, aiConfig.preset),
    [aiConfig.modelName, aiConfig.preset]
  );

  // ONLY real models reported by the selected backend — zero hardcoded or speculative models
  const unfilteredSelectableModels = useMemo(() => {
    return Array.from(
      new Set((aiConfig.availableModels || []).map((m) => m.trim()).filter(Boolean))
    );
  }, [aiConfig.availableModels]);

  const allSelectableModels = useMemo(() => {
    const q = modelSearchQuery.trim().toLowerCase();
    if (!q) return unfilteredSelectableModels;
    return unfilteredSelectableModels.filter((m) => m.toLowerCase().includes(q));
  }, [unfilteredSelectableModels, modelSearchQuery]);

  const localLoadedModels = useMemo(() => {
    if (!isLocalServer) return [];
    const loadedSet = new Set(aiConfig.loadedModels || []);
    return allSelectableModels.filter(
      (m) => aiConfig.modelStatuses?.[m] === 'loaded' || loadedSet.has(m)
    );
  }, [isLocalServer, allSelectableModels, aiConfig.loadedModels, aiConfig.modelStatuses]);

  const localNotLoadedModels = useMemo(() => {
    if (!isLocalServer) return [];
    const loadedSet = new Set(localLoadedModels);
    return allSelectableModels.filter((m) => !loadedSet.has(m));
  }, [isLocalServer, allSelectableModels, localLoadedModels]);

  const totalLocalLoadedCount = useMemo(() => {
    if (!isLocalServer) return 0;
    const loadedSet = new Set(aiConfig.loadedModels || []);
    return unfilteredSelectableModels.filter(
      (m) => aiConfig.modelStatuses?.[m] === 'loaded' || loadedSet.has(m)
    ).length;
  }, [isLocalServer, unfilteredSelectableModels, aiConfig.loadedModels, aiConfig.modelStatuses]);

  const activeModelLocalStatus = useMemo<'loaded' | 'not-loaded' | null>(() => {
    if (!isLocalServer || !aiConfig.modelName) return null;
    if (!unfilteredSelectableModels.includes(aiConfig.modelName)) return null;
    if (
      aiConfig.modelStatuses?.[aiConfig.modelName] === 'loaded' ||
      (aiConfig.loadedModels || []).includes(aiConfig.modelName)
    ) {
      return 'loaded';
    }
    return 'not-loaded';
  }, [
    isLocalServer,
    aiConfig.modelName,
    aiConfig.modelStatuses,
    aiConfig.loadedModels,
    unfilteredSelectableModels,
  ]);

  // Strict NSFW filter for Saved Files tree when settings.hideNsfwTags is enabled
  const nsfwSavedFileIds = useMemo(() => {
    const ids = new Set<string>();
    if (!settings.hideNsfwTags) return ids;

    const charById = new Map(characters.map((c) => [c.id, c]));
    const lbById = new Map(lorebooks.map((l) => [l.id, l]));
    const themeById = new Map(themes.map((t) => [t.id, t]));
    const tagById = new Map(tags.map((t) => [t.id, t]));

    for (const file of savedFiles) {
      if (file.kind === 'character') {
        const matched = file.entityId ? charById.get(file.entityId) : undefined;
        if (matched) {
          if (isCharacterNsfw(matched, tags, lorebooks)) ids.add(file.id);
        } else if (!file.isCorrupted && file.content) {
          try {
            const parsed = JSON.parse(file.content);
            const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
            const rawTags = Array.isArray(data?.tags) ? data.tags : [];
            const tsExt = data?.extensions?.tavernsmith;
            const manual = Boolean(parsed?.isNsfw || data?.isNsfw || tsExt?.isNsfw);
            if (manual || rawTags.some((t: unknown) => typeof t === 'string' && isTagNsfwFlagged(t, tags))) {
              ids.add(file.id);
            }
          } catch {
            // Leave unreadable/corrupted file visible for cleanup
          }
        }
      } else if (file.kind === 'lorebook') {
        const matched = file.entityId ? lbById.get(file.entityId) : undefined;
        if (matched) {
          if (isLorebookNsfw(matched, tags)) ids.add(file.id);
        } else if (!file.isCorrupted && file.content) {
          try {
            const parsed = JSON.parse(file.content);
            const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : [];
            const manual = Boolean(parsed?.isNsfw || parsed?.extensions?.tavernsmith?.isNsfw);
            if (manual || rawTags.some((t: unknown) => typeof t === 'string' && isTagNsfwFlagged(t, tags))) {
              ids.add(file.id);
            }
          } catch {
            // Leave unreadable/corrupted file visible for cleanup
          }
        }
      } else if (file.kind === 'theme') {
        const matched = file.entityId ? themeById.get(file.entityId) : undefined;
        if (matched) {
          if (isThemeNsfw(matched, tags)) ids.add(file.id);
        } else if (!file.isCorrupted && file.content) {
          try {
            const parsed = JSON.parse(file.content);
            const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : [];
            if (rawTags.some((t: unknown) => typeof t === 'string' && isTagNsfwFlagged(t, tags))) {
              ids.add(file.id);
            }
          } catch {
            // Leave unreadable/corrupted file visible for cleanup
          }
        }
      } else if (file.kind === 'tag') {
        const matched = file.entityId ? tagById.get(file.entityId) : undefined;
        if (matched) {
          if (matched.isNsfw) ids.add(file.id);
        } else if (!file.isCorrupted && file.content) {
          try {
            const parsed = JSON.parse(file.content);
            if (parsed?.isNsfw) ids.add(file.id);
          } catch {
            // Leave unreadable/corrupted file visible for cleanup
          }
        }
      }
    }
    return ids;
  }, [settings.hideNsfwTags, savedFiles, characters, lorebooks, themes, tags]);

  // Group Unified Save Folder files into `Characters/`, `Lorebooks/`, `Themes/`, `Tags/`, and root meta file
  const characterSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.kind === 'character' && !nsfwSavedFileIds.has(f.id)
      ),
    [savedFiles, nsfwSavedFileIds]
  );

  const lorebookSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.kind === 'lorebook' && !nsfwSavedFileIds.has(f.id)
      ),
    [savedFiles, nsfwSavedFileIds]
  );

  const themeSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.kind === 'theme' && !nsfwSavedFileIds.has(f.id)
      ),
    [savedFiles, nsfwSavedFileIds]
  );

  const tagSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.kind === 'tag' && !nsfwSavedFileIds.has(f.id)
      ),
    [savedFiles, nsfwSavedFileIds]
  );

  const metaSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.kind === 'meta' || f.fileName === META_FILENAME
      ),
    [savedFiles]
  );

  const visibleSavedFilesCount =
    characterSavedFiles.length +
    lorebookSavedFiles.length +
    themeSavedFiles.length +
    tagSavedFiles.length +
    metaSavedFiles.length;

  const corruptedSavedFiles = useMemo(
    () =>
      savedFiles.filter(
        (f) => f.isCorrupted && f.kind !== 'vault' && !nsfwSavedFileIds.has(f.id)
      ),
    [savedFiles, nsfwSavedFileIds]
  );

  const handleSelectPreset = (presetId: AIPresetId) => {
    switchAIPreset(presetId);
    setModelSearchQuery('');
    setShowApiKey(false);
    setVaultUiTick((t) => t + 1);
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
    setVaultUiTick((t) => t + 1);
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
    const ok = await encryptAndSaveProviderKeys(updatedMap);
    setVaultUiTick((t) => t + 1);
    setKeyActionMessage(
      !ok
        ? `Could not write to ./.tavernsmith-app/ vault — check local server connection.`
        : trimmedKey
          ? `AES-256-GCM Encrypted & Saved Key for ${currentPresetMeta.label} in ./.tavernsmith-app/`
          : `Cleared Key for ${currentPresetMeta.label}`
    );
    scheduleTimer(() => setKeyActionMessage(null), 4500);
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
    setVaultUiTick((t) => t + 1);
    setKeyActionMessage(`Cleared API key for ${currentPresetMeta.label}`);
    scheduleTimer(() => setKeyActionMessage(null), 4000);
  };

  const handleMigrateLegacyPinVault = async () => {
    const cleanPin = legacyPinInput.trim();
    if (!cleanPin) {
      setVaultMessageIsError(true);
      setVaultMessage('Enter your previous vault PIN / passphrase to migrate keys.');
      return;
    }
    setIsMigratingLegacyVault(true);
    try {
      const res = await unlockLegacyVault(cleanPin);
      setVaultUiTick((t) => t + 1);
      if (res.ok) {
        setLegacyPinInput('');
        setVaultMessageIsError(false);
        setVaultMessage(
          `Migrated ${res.migratedCount ?? 0} API key(s) into the PIN-free ./.tavernsmith-app/ encrypted vault.`
        );
        scheduleTimer(() => setVaultMessage(null), 6000);
      } else {
        setVaultMessageIsError(true);
        setVaultMessage(res.error || 'Incorrect legacy vault PIN / passphrase.');
        scheduleTimer(() => setVaultMessage(null), 5000);
      }
    } finally {
      setIsMigratingLegacyVault(false);
    }
  };

  const handleSyncDiskNow = async () => {
    setIsSyncingDisk(true);
    try {
      const res = await saveAndSyncNow();
      setFolderStatusMessage(res.message);
      scheduleTimer(() => setFolderStatusMessage(null), 4000);
    } finally {
      setIsSyncingDisk(false);
    }
  };

  const handleScanModels = async () => {
    await connectAiBackend(aiConfig);
  };

  const handleLoadFile = (file: SavedFileEntry) => {
    const res = loadSavedFileIntoWorkspace(file);
    setFolderStatusMessage(res.message);
    scheduleTimer(() => setFolderStatusMessage(null), 4000);
  };

  const handleDownloadSavedFile = (file: SavedFileEntry) => {
    triggerBrowserDownload(file.content, file.fileName);
  };

  const handleImportBackupFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImportingBackup(true);
    try {
      const res = await importSaveFolderBundle(files);
      setFolderStatusMessage(res.summary);
      scheduleTimer(() => setFolderStatusMessage(null), 5000);
    } catch (err: unknown) {
      setFolderStatusMessage(
        err instanceof Error ? err.message : 'Failed to import backup file.'
      );
      scheduleTimer(() => setFolderStatusMessage(null), 5000);
    } finally {
      setIsImportingBackup(false);
    }
  };

  return (
    <div className="space-y-8 min-w-0 w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Options &amp; Saved Files
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Set up your AI connection, manage saved characters and lorebooks, and customize how TavernSmith looks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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

      {/* SECTION 1: LOCAL DISK STORAGE (./Saves/) */}
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
                  Saved Files Folder (<code className="font-mono">{UNIFIED_INTERNAL_ROOT}</code>)
                </h2>
                <Tooltip content="All characters, lorebooks, themes, and tags live inside a single ./Saves/ directory with subfolders. API keys are encrypted and stored separately outside ./Saves/." />
              </div>

              {/* Active Disk Path Badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <HardDrive className="h-3.5 w-3.5 shrink-0" />
                  <span>Save Folder: {UNIFIED_INTERNAL_ROOT}</span>
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Single unified save directory with subfolders{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ./Saves/Characters/
                </code>
                ,{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ./Saves/Lorebooks/
                </code>
                ,{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ./Saves/Themes/
                </code>
                ,{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ./Saves/Tags/
                </code>
                , and{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ./Saves/{META_FILENAME}
                </code>
                . Encrypted API keys are stored separately in{' '}
                <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  ./.tavernsmith-app/
                </code>{' '}
                and never included in backups.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <strong className="text-slate-700 dark:text-slate-300">
                  Backup Import / Export scope:
                </strong>{' '}
                Characters, Lorebooks, Themes, and Tags only — excludes settings, AI config, and API keys.
              </p>
            </div>
          </div>

          {/* Action Toolbar: Sync, Import & Export Backup */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={backupImportInputRef}
              type="file"
              accept=".json,.png,application/json,image/png"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleImportBackupFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={isSyncingDisk}
              onClick={handleSyncDiskNow}
              title="Sync current characters, lorebooks, themes, and tags to ./Saves/ now"
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncingDisk ? 'animate-spin' : ''}`}
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>{isSyncingDisk ? 'Syncing...' : 'Sync Disk'}</span>
            </button>
            <button
              type="button"
              disabled={isImportingBackup}
              onClick={() => backupImportInputRef.current?.click()}
              title="Import Characters, Lorebooks, Themes, and Tags only from a TavernSmith backup (.json) or individual card/lorebook files"
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
            >
              <Upload
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>{isImportingBackup ? 'Importing...' : 'Import'}</span>
            </button>
            <button
              type="button"
              onClick={() => exportSaveFolderBundle()}
              title="Export Characters, Lorebooks, Themes, and Tags only into a single .json backup (excludes settings and API keys)"
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Archive
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export</span>
            </button>
          </div>
        </div>

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

        {/* Real Disk Files Tree (`./Saves/Characters/`, `./Saves/Lorebooks/`, `./Saves/Themes/`, `./Saves/Tags/`, `_tavernsmith_meta.json`) */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3.5 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
              <FileJson
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>
                Files in{' '}
                <code className="font-mono">{UNIFIED_INTERNAL_ROOT}</code>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {settings.hideNsfwTags && nsfwSavedFileIds.size > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  <ShieldCheck className="h-3 w-3" />
                  {nsfwSavedFileIds.size} NSFW hidden
                </span>
              )}
              {corruptedSavedFiles.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-3 w-3" />
                  {corruptedSavedFiles.length} corrupted
                </span>
              )}
              <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {visibleSavedFilesCount} file
                {visibleSavedFilesCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {corruptedSavedFiles.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <span>
                Detected {corruptedSavedFiles.length} corrupted or empty JSON file
                {corruptedSavedFiles.length === 1 ? '' : 's'} in <code className="font-mono">{UNIFIED_INTERNAL_ROOT}</code>. Marked entries cannot be loaded into the editor—download to inspect or delete them below.
              </span>
            </div>
          )}

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
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
                    ./Saves/Characters/ ({characterSavedFiles.length} file
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
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                        file.isCorrupted
                          ? 'bg-rose-50/70 dark:bg-rose-950/20'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                            ./Saves/Characters/{file.fileName}
                          </span>
                          {file.isCorrupted && (
                            <span
                              title={file.corruptReason || 'Corrupted or invalid JSON'}
                              className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400 shrink-0"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Corrupted
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          {(file.sizeBytes / 1024).toFixed(2)} KB · Updated{' '}
                          {formatSafeTimestamp(file.updatedAt)}
                          {file.isCorrupted && file.corruptReason
                            ? ` · ${file.corruptReason}`
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(file.isCorrupted)}
                          onClick={() => handleLoadFile(file)}
                          title={
                            file.isCorrupted
                              ? 'Cannot load corrupted JSON file'
                              : 'Load Character into Workbench'
                          }
                          className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                          onClick={() => requestDeleteSavedFile(file)}
                          title="Delete Character file from ./Saves/Characters/"
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
                    ./Saves/Lorebooks/ ({lorebookSavedFiles.length} file
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
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                        file.isCorrupted
                          ? 'bg-rose-50/70 dark:bg-rose-950/20'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                            ./Saves/Lorebooks/{file.fileName}
                          </span>
                          {file.isCorrupted && (
                            <span
                              title={file.corruptReason || 'Corrupted or invalid JSON'}
                              className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400 shrink-0"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Corrupted
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          {(file.sizeBytes / 1024).toFixed(2)} KB · Updated{' '}
                          {formatSafeTimestamp(file.updatedAt)}
                          {file.isCorrupted && file.corruptReason
                            ? ` · ${file.corruptReason}`
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(file.isCorrupted)}
                          onClick={() => handleLoadFile(file)}
                          title={
                            file.isCorrupted
                              ? 'Cannot load corrupted JSON file'
                              : 'Load Lorebook into Workbench'
                          }
                          className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                          onClick={() => requestDeleteSavedFile(file)}
                          title="Delete Lorebook file from ./Saves/Lorebooks/"
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

            {/* SUBFOLDER 3: Themes/ */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <button
                type="button"
                onClick={() => setThemesFolderOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {themesFolderOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <Palette
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span className="font-mono">
                    ./Saves/Themes/ ({themeSavedFiles.length} file
                    {themeSavedFiles.length === 1 ? '' : 's'})
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">
                  Added &amp; Modified Themes
                </span>
              </button>

              {themesFolderOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {themeSavedFiles.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-400">
                      Only the default built-in Basic theme is active (0 bytes saved on disk).
                    </div>
                  ) : (
                    themeSavedFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                          file.isCorrupted
                            ? 'bg-rose-50/70 dark:bg-rose-950/20'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                              ./Saves/Themes/{file.fileName}
                            </span>
                            {file.isCorrupted && (
                              <span
                                title={file.corruptReason || 'Corrupted or invalid JSON'}
                                className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400 shrink-0"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Corrupted
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 truncate">
                            {file.sizeBytes} B · Updated{' '}
                            {formatSafeTimestamp(file.updatedAt)}
                            {file.isCorrupted && file.corruptReason
                              ? ` · ${file.corruptReason}`
                              : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={Boolean(file.isCorrupted)}
                            onClick={() => handleLoadFile(file)}
                            title={
                              file.isCorrupted
                                ? 'Cannot load corrupted JSON file'
                                : 'Activate & open Theme in Themes & Tags'
                            }
                            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSavedFile(file)}
                            title="Download Theme JSON file"
                            className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteSavedFile(file)}
                            title="Delete Theme file from ./Saves/Themes/"
                            className="rounded-md border border-rose-200 dark:border-rose-900/40 p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* SUBFOLDER 4: Tags/ */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <button
                type="button"
                onClick={() => setTagsFolderOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {tagsFolderOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <Tag
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                  <span className="font-mono">
                    ./Saves/Tags/ ({tagSavedFiles.length} file
                    {tagSavedFiles.length === 1 ? '' : 's'})
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">
                  Added &amp; Modified Tags
                </span>
              </button>

              {tagsFolderOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {tagSavedFiles.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-400">
                      Only built-in tags are loaded (0 bytes saved on disk until you add or edit a tag).
                    </div>
                  ) : (
                    tagSavedFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                          file.isCorrupted
                            ? 'bg-rose-50/70 dark:bg-rose-950/20'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                              ./Saves/Tags/{file.fileName}
                            </span>
                            {file.isCorrupted && (
                              <span
                                title={file.corruptReason || 'Corrupted or invalid JSON'}
                                className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400 shrink-0"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Corrupted
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400 truncate">
                            {file.sizeBytes} B · Updated{' '}
                            {formatSafeTimestamp(file.updatedAt)}
                            {file.isCorrupted && file.corruptReason
                              ? ` · ${file.corruptReason}`
                              : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={Boolean(file.isCorrupted)}
                            onClick={() => handleLoadFile(file)}
                            title={
                              file.isCorrupted
                                ? 'Cannot load corrupted JSON file'
                                : 'Open Tag in Themes & Tags'
                            }
                            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSavedFile(file)}
                            title="Download Tag JSON file"
                            className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteSavedFile(file)}
                            title="Delete Tag file from ./Saves/Tags/"
                            className="rounded-md border border-rose-200 dark:border-rose-900/40 p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
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
                  <span className="font-mono">./Saves/{META_FILENAME}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">
                  {settings.hideNsfwTags
                    ? tags.filter((t) => !t.isNsfw).length
                    : tags.length}{' '}
                  Tags ·{' '}
                  {settings.hideNsfwTags
                    ? themes.filter((th) => !isThemeNsfw(th, tags)).length
                    : themes.length}{' '}
                  Context Themes
                </span>
              </button>

              {metaSectionOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {metaSavedFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                        file.isCorrupted
                          ? 'bg-rose-50/70 dark:bg-rose-950/20'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                            ./Saves/{file.fileName}
                          </span>
                          <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600 dark:text-slate-300">
                            root meta
                          </span>
                          {file.isCorrupted && (
                            <span
                              title={file.corruptReason || 'Corrupted or invalid JSON'}
                              className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-rose-600 dark:text-rose-400 shrink-0"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Corrupted
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 truncate">
                          {(file.sizeBytes / 1024).toFixed(2)} KB · Synced{' '}
                          {formatSafeTimestamp(file.updatedAt)}
                          {file.isCorrupted && file.corruptReason
                            ? ` · ${file.corruptReason}`
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(file.isCorrupted)}
                          onClick={() => handleLoadFile(file)}
                          title={
                            file.isCorrupted
                              ? 'Cannot load corrupted metadata file'
                              : 'Reload Tags & Context Themes from metadata file'
                          }
                          className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Load</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadSavedFile(file)}
                          title={`Download ${file.fileName}`}
                          className="rounded-md border border-slate-200 dark:border-slate-800 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {file.isCorrupted && (
                          <button
                            type="button"
                            onClick={() => requestDeleteSavedFile(file)}
                            title={`Delete corrupted ${file.fileName} from ./Saves/`}
                            className="rounded-md border border-rose-200 dark:border-rose-900/40 p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
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
              Appearance &amp; Editor Mode
            </h2>

            {/* Appearance Mode: Dark vs Light */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Appearance Mode</span>
                <Tooltip content="Switch between Dark Mode and Light Mode. Your active theme's accent color stays applied either way." />
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

            {/* Editor Mode: Full Editor vs Step-by-Step Wizard */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Editor Mode</span>
                <Tooltip content="Pick Full Editor to see every field at once, or Guided Wizard to build step by step." />
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
                  <span>Full Editor</span>
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
                <span>Default Card Spec</span>
                <Tooltip content="Choose whether exported JSON and PNG files use SillyTavern V2 or V3 format by default." />
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
                  <span>Show / Hide NSFW Content</span>
                  <Tooltip content="Hide all NSFW-marked tags, characters, and lorebooks across the app when SFW mode is turned on." />
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
                Hides all NSFW-flagged Tags, Characters, and Lorebooks when enabled.
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
                Auto-Save &amp; Reset
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
                <span>Enable Auto-Save</span>
                <Tooltip content="Automatically saves your characters, lorebooks, themes, and tags to ./Saves/ on a timer." />
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

            <div className="pt-2 space-y-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <strong className="text-slate-700 dark:text-slate-300">
                  Reset Defaults
                </strong>{' '}
                restores deleted or modified built-in Default Tags and Default Context Themes only — keeping your custom tags, custom themes, characters, lorebooks, settings, and API keys.
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
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
                      Restore Default Tags &amp; Themes
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
        </div>

        {/* Right Column: Streamlined AI Connection Manager */}
        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4 min-w-0"
        >
          {/* Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Server
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                AI Connection
              </h2>
              <Tooltip
                title="AI Providers"
                content="Connect to local apps like LM Studio / Ollama / KoboldCPP or cloud APIs like Gemini, Anthropic, OpenAI, and OpenRouter. Thinking blocks (<think>) are automatically cleaned up."
              />
            </div>

            {isAiConnected && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                <span>
                  Connected{aiConfig.modelName ? ` · ${aiConfig.modelName}` : ''}
                </span>
              </span>
            )}
          </div>

          {/* Row 1: Provider Dropdown + Endpoint URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="ai-provider-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Provider
              </label>
              <select
                id="ai-provider-select"
                value={aiConfig.preset}
                onChange={(e) =>
                  handleSelectPreset(e.target.value as AIPresetId)
                }
                className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white cursor-pointer"
              >
                {AI_BACKEND_PRESETS.map((preset) => {
                  const providerKey = getProviderKeyId(preset.id);
                  const hasSavedKey = Boolean(
                    (
                      aiConfig.savedProviderKeys?.[preset.id] ||
                      aiConfig.savedProviderKeys?.[providerKey] ||
                      ''
                    ).trim()
                  );
                  const suffix = hasSavedKey
                    ? ' · Key Saved ✓'
                    : !preset.requiresKey
                      ? ' · Local'
                      : '';
                  return (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                      {suffix}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Endpoint URL</span>
                <Tooltip content="Base URL for OpenAI-compatible /v1, Ollama, or Gemini endpoints." />
              </label>
              <input
                type="url"
                value={aiConfig.url}
                onChange={(e) => {
                  setAiConfig((prev) => ({ ...prev, url: e.target.value }));
                  disconnectAiBackend();
                  clearAiConnectionFeedback();
                }}
                placeholder="http://localhost:1234/v1"
                className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Row 2: Full-Width API Key Input + Connect Action */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <KeyRound
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>
                  {aiConfig.preset === 'gemini'
                    ? 'Gemini API Key'
                    : currentPresetMeta.requiresKey
                      ? `${currentPresetMeta.label} API Key`
                      : 'API Key (Optional)'}
                </span>
                <Tooltip content="Encrypted with AES-256-GCM in ./.tavernsmith-app/ (outside ./Saves/) and auto-filled when selecting this backend. Never saved inside exported characters, lorebooks, or backups." />
              </label>

              {aiConfig.preset === 'gemini' && (
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {aiConfig.apiKey.trim()
                    ? 'Key entered (sent via x-goog-api-key header)'
                    : 'Paste a Google AI Studio key (AIza...)'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
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
                      ? 'Paste Gemini API key (AIza...)'
                      : currentPresetMeta.requiresKey
                        ? `Paste ${currentPresetMeta.label} key...`
                        : 'Optional local token...'
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-3 pr-9 py-2 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleToggleRevealApiKey}
                  title={showApiKey ? 'Hide Key' : 'Show Key'}
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
                title="Save encrypted key"
                className="theme-hover-outline shrink-0 rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer whitespace-nowrap"
              >
                Save Key
              </button>

              {aiConfig.apiKey && (
                <button
                  type="button"
                  onClick={handleClearApiKey}
                  title="Clear saved key"
                  className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300 cursor-pointer whitespace-nowrap"
                >
                  Clear
                </button>
              )}

              <button
                type="button"
                onClick={handleScanModels}
                disabled={isTestingAiConnection}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline shrink-0 flex items-center justify-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isTestingAiConnection ? (
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
                <span>{isTestingAiConnection ? 'Connecting...' : 'Connect'}</span>
              </button>
            </div>

            {keyActionMessage && (
              <div className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                ✓ {keyActionMessage}
              </div>
            )}
          </div>

          {/* App-Private Encrypted Key Vault Bar (No PIN Required) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {vaultStatus.needsLegacyUnlock ? (
                  <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                )}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  App-Private AES-256 Vault
                </span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {vaultStatus.needsLegacyUnlock
                    ? 'Legacy PIN Vault Detected'
                    : `Auto-Unlocked · ${vaultStatus.keyCount} Key${vaultStatus.keyCount === 1 ? '' : 's'} Saved`}
                </span>
              </div>

              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {vaultStatus.storagePath}
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              API keys are encrypted with AES-256-GCM outside{' '}
              <code className="font-mono">./Saves/</code> and auto-filled whenever you select a matching backend. No PIN required.
            </p>

            {/* One-time migration prompt ONLY if an older PIN-protected legacy vault was found */}
            {vaultStatus.needsLegacyUnlock && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
                <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                  Migrate Legacy PIN Vault
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  An older PIN-protected vault file was found. Enter your previous PIN once to decrypt and migrate your keys into the new PIN-free app vault.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    value={legacyPinInput}
                    onChange={(e) => setLegacyPinInput(e.target.value)}
                    placeholder="Enter previous vault PIN / passphrase..."
                    autoComplete="off"
                    className="theme-focus-ring font-mono flex-1 min-w-[180px] rounded-lg border border-amber-500/40 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={isMigratingLegacyVault}
                    onClick={handleMigrateLegacyPinVault}
                    style={{ borderColor: 'var(--theme-accent)' }}
                    className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-[11px] font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer"
                  >
                    {isMigratingLegacyVault ? 'Migrating...' : 'Unlock & Migrate'}
                  </button>
                </div>
              </div>
            )}

            {vaultMessage && (
              <div
                className={`text-[11px] font-mono ${
                  vaultMessageIsError
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {vaultMessage}
              </div>
            )}
          </div>

          {/* Connection Status Banner */}
          {aiConnectionResult && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                aiConnectionResult.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200'
              }`}
            >
              {aiConnectionResult.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-semibold">{aiConnectionResult.message}</div>
                {!aiConnectionResult.ok && (
                  <div className="text-[11px] opacity-90">
                    {aiConnectionResult.corsHint ||
                      'Check your API key, endpoint URL, or local server CORS settings.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Model Selection, Live Scanner & Parser — Real Models Reported by Backend Only */}
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
                  Model Selection ({unfilteredSelectableModels.length})
                </label>
                {isLocalServer && unfilteredSelectableModels.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                    🟢 {totalLocalLoadedCount} Loaded · ⚪{' '}
                    {Math.max(0, unfilteredSelectableModels.length - totalLocalLoadedCount)}{' '}
                    Not Loaded
                  </span>
                )}
                {activeModelLocalStatus === 'loaded' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    🟢 Loaded
                  </span>
                )}
                {activeModelLocalStatus === 'not-loaded' && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    ⚪ Installed (Not Loaded)
                  </span>
                )}
                {aiConfig.modelName &&
                  (doesBackendSupportVision(aiConfig) ? (
                    <span
                      style={{
                        borderColor:
                          'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
                      }}
                      className="inline-flex items-center gap-1 rounded-md border bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
                    >
                      👁️ Vision
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      Text-Only
                    </span>
                  ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-44">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  <input
                    type="text"
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    disabled={unfilteredSelectableModels.length === 0}
                    placeholder="Filter models..."
                    className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-7 pr-6 py-1 text-xs text-slate-900 dark:text-white disabled:opacity-50"
                  />
                  {modelSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setModelSearchQuery('')}
                      title="Clear filter"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleScanModels}
                  disabled={isTestingAiConnection}
                  title="Rescan available models from backend"
                  className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      isTestingAiConnection ? 'animate-spin' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Available Models (Live from Backend)
                {modelSearchQuery.trim() && unfilteredSelectableModels.length > 0
                  ? ` — Showing ${allSelectableModels.length} of ${unfilteredSelectableModels.length}`
                  : ''}
              </span>
              <select
                value={
                  allSelectableModels.includes(aiConfig.modelName)
                    ? aiConfig.modelName
                    : ''
                }
                disabled={unfilteredSelectableModels.length === 0}
                onChange={(e) => {
                  if (e.target.value) {
                    setAiConfig((prev) => ({
                      ...prev,
                      modelName: e.target.value,
                    }));
                  }
                }}
                className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white disabled:opacity-60 cursor-pointer"
              >
                {unfilteredSelectableModels.length === 0 ? (
                  <option value="">
                    Click Connect to load available models from {currentPresetMeta.label}...
                  </option>
                ) : allSelectableModels.length === 0 ? (
                  <option value="">No models match &ldquo;{modelSearchQuery}&rdquo;</option>
                ) : (
                  <>
                    {!allSelectableModels.includes(aiConfig.modelName) && (
                      <option value="" disabled>
                        {aiConfig.modelName
                          ? `Active: ${aiConfig.modelName} (hidden by filter — select below)`
                          : 'Select an available model...'}
                      </option>
                    )}
                    {isLocalServer ? (
                      <>
                        {localLoadedModels.length > 0 && (
                          <optgroup
                            label={`🟢 Currently Loaded (${localLoadedModels.length})`}
                          >
                            {localLoadedModels.map((m) => (
                              <option key={m} value={m}>
                                🟢 {m} [Loaded]
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {localNotLoadedModels.length > 0 && (
                          <optgroup
                            label={`⚪ Installed — Not Loaded (${localNotLoadedModels.length})`}
                          >
                            {localNotLoadedModels.map((m) => (
                              <option key={m} value={m}>
                                ⚪ {m} [Not Loaded]
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    ) : (
                      allSelectableModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))
                    )}
                  </>
                )}
              </select>
              {isLocalServer && unfilteredSelectableModels.length > 0 && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Models marked 🟢 are currently loaded in memory on your local server; models marked ⚪ are installed locally and not yet loaded.
                </p>
              )}
            </div>

            {/* Parser Format & Vision Toggle in a single compact row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <Cpu
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <label className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Parser:
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
                  className="theme-focus-ring font-mono rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white cursor-pointer"
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
                <Tooltip content="Automatically strips <think> blocks so only clean text goes into your card." />
              </div>

              <label
                htmlFor="force-enable-vision-checkbox"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
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
                  className="h-3.5 w-3.5 rounded cursor-pointer"
                  style={{ accentColor: 'var(--theme-accent)' }}
                />
                <span>Force Vision</span>
                <Tooltip content="Turn this on if your local GGUF model supports vision/images." />
              </label>
            </div>
          </div>

          {/* Sampling Temperature & Inline Ghost Text Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span>Temperature</span>
                  <Tooltip content="Lower = more focused and consistent. Higher = more creative and varied." />
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="ghost-text-toggle"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <span>AI Writing Suggestions</span>
                  <Tooltip content="Shows a 1–2 sentence suggestion bar at the bottom of the text box when you pause typing." />
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
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">
                    Delay
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

                  {rel.security && rel.security.length > 0 && (
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        🔐 Security &amp; Privacy Hardening
                      </div>
                      <ul className="list-disc pl-4 space-y-1">
                        {rel.security.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                  <span>Local-First Sandbox &amp; App-Private AES-256 Vault</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pure browser binary APIs (<code className="font-mono">ArrayBuffer</code>,{' '}
                  <code className="font-mono">DataView</code>,{' '}
                  <code className="font-mono">Uint8Array</code>). Provider API keys are encrypted with AES-256-GCM in <code className="font-mono">./.tavernsmith-app/</code> (outside <code className="font-mono">./Saves/</code>) and never included in exported <code className="font-mono">.png</code>, <code className="font-mono">.json</code>, or backup files.
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
