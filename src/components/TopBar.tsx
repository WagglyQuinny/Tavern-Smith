import React, { useState } from 'react';
import {
  Palette,
  Activity,
  Save,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { AppLogo } from './AppLogo';

export const TopBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isMainSidebarOpen,
    toggleMainSidebar,
    themes,
    activeTheme,
    setActiveThemeId,
    tokenBreakdown,
    saveAndSyncNow,
    lastSavedAt,
    isDirty,
  } = useStore();

  const [justSaved, setJustSaved] = useState(false);

  const handleSaveAndSync = async () => {
    await saveAndSyncNow();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  const totalTokens = tokenBreakdown.totalCardTokens;
  const tokenBadgeColor =
    totalTokens > 2500
      ? 'text-rose-500 border-rose-500/40 bg-rose-500/10'
      : totalTokens > 1500
        ? 'text-amber-500 border-amber-500/40 bg-amber-500/10'
        : 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10';

  const isOptionsActive = activeTab === 'options';

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 px-4 backdrop-blur-md">
      {/* Left: Main Sidebar Collapse Toggle + App Icon & Brand */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={toggleMainSidebar}
          title={
            isMainSidebarOpen
              ? 'Collapse sidebar into Blender-style Icon Rail'
              : 'Expand full workspace navigation sidebar'
          }
          style={{
            borderColor: !isMainSidebarOpen ? 'var(--theme-accent)' : undefined,
          }}
          className="theme-hover-outline flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0 transition-colors"
        >
          {isMainSidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen
              className="h-4 w-4"
              style={{ color: 'var(--theme-accent)' }}
            />
          )}
        </button>

        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-slate-950 text-white shadow-xs shrink-0 overflow-hidden"
        >
          <AppLogo className="h-7 w-7" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-sm text-slate-900 dark:text-white truncate">
              TavernSmith
            </span>
            <span
              style={{
                borderColor: 'var(--theme-accent)',
                color: 'var(--theme-accent)',
              }}
              className="hidden sm:inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider shrink-0"
            >
              SillyTavern V2/V3
            </span>
          </div>
        </div>
      </div>

      {/* Center / Right Controls: Active Context Theme + Token Counter + Save & Sync + Options Gear Icon */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Context Theme Switcher */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1">
          <Palette
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span className="hidden xl:inline text-xs text-slate-500 dark:text-slate-400">
            Theme:
          </span>
          <select
            aria-label="Active Context Theme"
            value={activeTheme.id}
            onChange={(e) => setActiveThemeId(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
          >
            {themes.map((t) => (
              <option
                key={t.id}
                value={t.id}
                className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Live Token Telemetry Pill */}
        <button
          type="button"
          onClick={() => setActiveTab('inspector')}
          title="Click to inspect full token breakdown & SillyTavern JSON"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-all cursor-pointer ${tokenBadgeColor}`}
        >
          <Activity className="h-3.5 w-3.5 shrink-0" />
          <span>{totalTokens.toLocaleString()}</span>
          <span className="hidden md:inline text-[10px] opacity-80">tok</span>
        </button>

        {/* Save & Sync Button */}
        <button
          type="button"
          onClick={() => void handleSaveAndSync()}
          title={
            lastSavedAt
              ? `Last saved at ${lastSavedAt}. Click to Save & Sync to Save Folder and wipe temporary browser cache.`
              : 'Save & Sync workspace to Save Folder and clear temporary browser cache'
          }
          style={{
            borderColor: justSaved ? '#10b981' : 'var(--theme-accent)',
          }}
          className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
        >
          {justSaved ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span className="hidden sm:inline text-emerald-500">
                Saved &amp; Synced
              </span>
            </>
          ) : (
            <>
              <Save
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span className="hidden sm:inline">
                {isDirty ? 'Save & Sync *' : 'Save & Sync'}
              </span>
            </>
          )}
        </button>

        {/* Top-Right Gear Icon (⚙️) for Options */}
        <button
          type="button"
          onClick={() => setActiveTab('options')}
          title="Open Options, AI Connections, Storage & NSFW Settings (⚙️)"
          style={
            isOptionsActive
              ? {
                  borderColor: 'var(--theme-accent)',
                  backgroundColor:
                    'color-mix(in srgb, var(--theme-accent) 16%, transparent)',
                }
              : undefined
          }
          className={`theme-hover-outline flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
            isOptionsActive
              ? 'text-slate-900 dark:text-white shadow-2xs'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Settings
            className="h-4 w-4"
            style={isOptionsActive ? { color: 'var(--theme-accent)' } : undefined}
          />
        </button>
      </div>
    </header>
  );
};
