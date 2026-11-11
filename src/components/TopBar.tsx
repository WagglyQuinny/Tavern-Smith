import React, { useMemo } from 'react';
import {
  Palette,
  Save,
  Wand2,
  Sliders,
  Cpu,
  Check,
  Server,
  FolderOpen,
  Sun,
  Moon,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  AI_BACKEND_PRESETS,
  COMPATIBILITY_FORMAT_LABELS,
  resolveEffectiveFormat,
} from '../services/aiService';
import { Tooltip } from './Tooltip';
import { PWAInstallButton } from './PWAInstallButton';
import { AppLogo } from './AppLogo';

export const TopBar: React.FC = () => {
  const {
    themes,
    activeTheme,
    setActiveThemeId,
    setThemes,
    settings,
    updateSettings,
    aiConfig,
    setAiConfig,
    tokenBreakdown,
    lastSavedAt,
    isDirty,
    saveNow,
    setActiveTab,
    nativeDirectoryName,
    pendingReconnectFolderName,
    reconnectNativeSaveFolder,
    isMainSidebarOpen,
    toggleMainSidebar,
  } = useStore();

  const handleQuickColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setThemes((prev) =>
      prev.map((t) => (t.id === activeTheme.id ? { ...t, color: newColor } : t))
    );
  };

  const quickModelOptions = useMemo(() => {
    const presetMeta = AI_BACKEND_PRESETS.find((p) => p.id === aiConfig.preset);
    const merged = Array.from(
      new Set([
        aiConfig.modelName,
        ...(aiConfig.availableModels || []),
        ...(presetMeta?.suggestedModels || []),
      ])
    ).filter(Boolean);
    return merged;
  }, [aiConfig.preset, aiConfig.modelName, aiConfig.availableModels]);

  const effectiveFormatLabel = useMemo(() => {
    const fmt = resolveEffectiveFormat(aiConfig);
    return COMPATIBILITY_FORMAT_LABELS[fmt];
  }, [aiConfig]);

  const shortSaveFolderName = useMemo(() => {
    if (nativeDirectoryName) return `Local PC: ${nativeDirectoryName}/`;
    return '/TavernSmith_Saves/';
  }, [nativeDirectoryName]);

  return (
    <header
      style={{ borderColor: 'var(--theme-accent)' }}
      className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b bg-[#ffffff]/95 dark:bg-[#121215]/95 px-4 md:px-5 py-2.5 backdrop-blur-sm transition-colors"
    >
      {/* Left Zone: Sidebar Toggle + Brand Identity + Active Spec Indicator */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={toggleMainSidebar}
          style={
            !isMainSidebarOpen
              ? { borderColor: 'var(--theme-accent)' }
              : undefined
          }
          title={
            isMainSidebarOpen
              ? 'Collapse Workspace Views Sidebar'
              : 'Open Workspace Views Sidebar'
          }
          aria-label={
            isMainSidebarOpen
              ? 'Collapse Workspace Views Sidebar'
              : 'Open Workspace Views Sidebar'
          }
          className={`theme-hover-outline flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            isMainSidebarOpen
              ? 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-slate-600 dark:text-slate-300'
              : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
          }`}
        >
          {isMainSidebarOpen ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <>
              <PanelLeftOpen
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span className="hidden sm:inline">Views</span>
            </>
          )}
        </button>

        <AppLogo className="h-8 w-8 rounded-lg shadow-xs" size={32} />
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            TavernSmith
          </span>
          <span
            className="text-xs text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          >
            ·
          </span>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            ST {settings.cardSpecVersion.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Center Zone: Prominent Context Theme Switcher + Quick Model Switcher + Mode Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Context Theme Switcher */}
        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="flex items-center gap-2 rounded-lg border bg-slate-50 dark:bg-zinc-900 px-2.5 py-1"
        >
          <Palette
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span className="hidden xl:inline text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Theme
          </span>
          <Tooltip
            position="bottom"
            title="Active Context Theme"
            content="Sets the overarching AI generation system prompt, genre tags, and dynamic workspace accent color (--theme-accent)."
          />

          <select
            aria-label="Select Context Theme"
            value={activeTheme.id}
            onChange={(e) => setActiveThemeId(e.target.value)}
            className="rounded bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
          >
            {themes.map((theme) => (
              <option
                key={theme.id}
                value={theme.id}
                className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-white"
              >
                {theme.name}
              </option>
            ))}
          </select>

          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            |
          </span>

          <label
            className="relative flex items-center gap-1 cursor-pointer"
            title="Customize active theme accent hex color"
          >
            <input
              type="color"
              aria-label="Active Context Theme Hex Color"
              value={activeTheme.color}
              onChange={handleQuickColorChange}
              className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="font-mono text-[11px] uppercase text-slate-600 dark:text-slate-300 tabular-nums">
              {activeTheme.color}
            </span>
          </label>
        </div>

        {/* Quick Model Switcher */}
        <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2.5 py-1">
          <Server
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
          <select
            aria-label="Quick Select AI Model"
            value={aiConfig.modelName}
            onChange={(e) =>
              setAiConfig((prev) => ({ ...prev, modelName: e.target.value }))
            }
            className="max-w-40 truncate rounded bg-transparent px-1 py-0.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none cursor-pointer"
          >
            {quickModelOptions.map((m) => (
              <option
                key={m}
                value={m}
                className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-white"
              >
                {m}
              </option>
            ))}
          </select>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={() => setActiveTab('options')}
            title={`Auto-Detected Format: ${effectiveFormatLabel}. Click to configure AI connections.`}
            className="font-mono text-[11px] text-slate-500 dark:text-slate-400 hover:underline whitespace-nowrap cursor-pointer"
          >
            {effectiveFormatLabel}
          </button>
        </div>

        {/* Quick Mode Toggle: Sandbox vs Wizard */}
        <div className="hidden sm:flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-100/80 dark:bg-zinc-900 p-0.5">
          <button
            type="button"
            onClick={() => updateSettings({ editorMode: 'sandbox' })}
            style={
              settings.editorMode === 'sandbox'
                ? { borderColor: 'var(--theme-accent)' }
                : undefined
            }
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              settings.editorMode === 'sandbox'
                ? 'border bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                : 'border border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="h-3 w-3" />
            <span>Sandbox</span>
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ editorMode: 'wizard' })}
            style={
              settings.editorMode === 'wizard'
                ? { borderColor: 'var(--theme-accent)' }
                : undefined
            }
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              settings.editorMode === 'wizard'
                ? 'border bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                : 'border border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Wand2 className="h-3 w-3" />
            <span>Wizard</span>
          </button>
        </div>
      </div>

      {/* Right Zone: Save Folder Status + Token Counter + PWA Install + Dark/Light Switch + Save Action */}
      <div className="flex items-center gap-2.5 shrink-0">
        <PWAInstallButton />
        {pendingReconnectFolderName && (
          <button
            type="button"
            onClick={() => void reconnectNativeSaveFolder()}
            style={{ borderColor: 'var(--theme-accent)' }}
            title={`Grant read/write access to your saved local PC folder "${pendingReconnectFolderName}" and sync files.`}
            className="theme-hover-outline flex items-center gap-1.5 rounded-md border bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 cursor-pointer whitespace-nowrap"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span>📁 Reconnect Save Folder ({pendingReconnectFolderName})</span>
          </button>
        )}
        {/* Quick-Access Save Folder Button */}
        <button
          type="button"
          onClick={() => setActiveTab('options')}
          title={`Active Save Folder: ${settings.activeSaveFolder}. Click to manage Save Folders & Storage in Options.`}
          className="theme-hover-outline hidden md:flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
        >
          <FolderOpen
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span className="text-slate-500 dark:text-slate-400">Save Folder:</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-white">
            {shortSaveFolderName}
          </span>
        </button>

        {/* Live Token Counter */}
        <Tooltip
          position="bottom"
          title="Card Token Footprint (~3.8 chars/word + punctuation)"
          content={`Permanent: ${tokenBreakdown.permanentTokens} tkn · Initial/Example: ${tokenBreakdown.temporaryTokens} tkn · Triggered Lore: ${tokenBreakdown.lorebook_Triggered} tkn`}
        >
          <div
            tabIndex={0}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 px-2.5 py-1 text-xs cursor-default"
          >
            <Cpu
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
              {tokenBreakdown.totalCardTokens.toLocaleString()}
            </span>
            <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
              {tokenBreakdown.permanentTokens} perm
            </span>
          </div>
        </Tooltip>

        {/* Quick Sun/Moon Dark/Light Mode Toggle */}
        <button
          type="button"
          onClick={() =>
            updateSettings({
              appearance: settings.appearance === 'dark' ? 'light' : 'dark',
            })
          }
          title={
            settings.appearance === 'dark'
              ? 'Switch to Light Mode (#f4f4f5)'
              : 'Switch to Dark Mode (#09090b)'
          }
          className="theme-hover-outline flex items-center justify-center rounded-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1.5 text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          {settings.appearance === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-slate-700" />
          )}
        </button>

        {/* Auto-Save Status & Manual Save */}
        <div className="flex items-center gap-2">
          <span className="hidden 2xl:inline-block font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
            {lastSavedAt ? `Saved ${lastSavedAt}` : 'Unsaved'}
          </span>

          <button
            type="button"
            onClick={() => saveNow('manual')}
            className="theme-hover-outline flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isDirty ? (
              <Save
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
            ) : (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <span>Save</span>
          </button>
        </div>
      </div>
    </header>
  );
};
