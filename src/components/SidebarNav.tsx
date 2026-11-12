import React from 'react';
import {
  User,
  BookOpen,
  Palette,
  Code2,
  Sliders,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { WorkspaceTab } from '../types';

interface NavItem {
  id: WorkspaceTab;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const navItems: NavItem[] = [
  {
    id: 'character',
    label: 'Character',
    shortDesc: 'V2/V3 Card & DM StatBlock',
    icon: User,
  },
  {
    id: 'lorebook',
    label: 'Lorebook',
    shortDesc: 'World Info & Trigger Keys',
    icon: BookOpen,
  },
  {
    id: 'themes',
    label: 'Context Themes & Tags',
    shortDesc: 'Genre Palettes & Tag Studio',
    icon: Palette,
  },
  {
    id: 'inspector',
    label: 'JSON Inspector',
    shortDesc: 'V2/V3 Live Payload & Export',
    icon: Code2,
  },
];

export const SidebarNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isMainSidebarOpen,
    toggleMainSidebar,
    character,
    lorebook,
    activeTheme,
    settings,
    updateSettings,
  } = useStore();

  const activeEntriesCount = lorebook.entries.filter((e) => e.enabled).length;
  const isWizard = settings.editorMode === 'wizard';

  // COLLAPSED BLENDER-STYLE VERTICAL ICON RAIL (`w-14` / 56px)
  if (!isMainSidebarOpen) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 py-3 transition-all duration-200 select-none">
        <div className="flex flex-col items-center gap-2 w-full px-1.5">
          {/* Expand Sidebar Button */}
          <button
            type="button"
            onClick={toggleMainSidebar}
            title="Expand Workspace Views Sidebar"
            className="theme-hover-outline flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer mb-1"
          >
            <PanelLeftOpen
              className="h-4 w-4"
              style={{ color: 'var(--theme-accent)' }}
            />
          </button>

          <div className="h-px w-8 bg-slate-200 dark:bg-slate-800" />

          {/* Blender-Style Workspace View Icons */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={`${item.label} — ${item.shortDesc}`}
                style={
                  isActive
                    ? {
                        borderColor: 'var(--theme-accent)',
                        backgroundColor:
                          'color-mix(in srgb, var(--theme-accent) 16%, transparent)',
                      }
                    : undefined
                }
                className={`theme-hover-outline relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'text-slate-900 dark:text-white shadow-xs'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-900/70 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <span
                    style={{ backgroundColor: 'var(--theme-accent)' }}
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
                  />
                )}
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={isActive ? { color: 'var(--theme-accent)' } : undefined}
                />
              </button>
            );
          })}
        </div>

        {/* Bottom Quick Sandbox / Wizard Toggle Icon in Rail */}
        <div className="flex flex-col items-center gap-2 w-full px-1.5">
          <div className="h-px w-8 bg-slate-200 dark:bg-slate-800" />
          <button
            type="button"
            onClick={() =>
              updateSettings({
                editorMode: isWizard ? 'sandbox' : 'wizard',
              })
            }
            title={
              isWizard
                ? 'Active Mode: 5-Step Wizard (Click to switch to Full Sandbox Workbench)'
                : 'Active Mode: Full Sandbox Workbench (Click to switch to 5-Step Wizard)'
            }
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex h-9 w-9 items-center justify-center rounded-lg border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {isWizard ? (
              <Wand2
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
            ) : (
              <Sliders
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
            )}
          </button>
        </div>
      </aside>
    );
  }

  // EXPANDED FULL SIDEBAR (`md:w-60`)
  return (
    <aside className="flex w-full md:w-60 shrink-0 flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3 transition-all duration-200">
      <div className="space-y-1">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Workspace Views
          </span>
          <button
            type="button"
            onClick={toggleMainSidebar}
            title="Collapse into Blender-style Icon Rail"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>

        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                style={
                  isActive
                    ? {
                        borderColor: 'var(--theme-accent)',
                        backgroundColor:
                          'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
                      }
                    : undefined
                }
                className={`theme-hover-outline group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer shrink-0 md:shrink ${
                  isActive
                    ? 'text-slate-900 dark:text-white font-semibold shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-900/60 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon
                  className="h-4 w-4 shrink-0 transition-colors"
                  style={isActive ? { color: 'var(--theme-accent)' } : undefined}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs leading-tight truncate">
                    {item.label}
                  </span>
                  <span className="hidden md:inline text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    {item.shortDesc}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Workspace Summary & Workflow Mode Card */}
      <div className="hidden md:flex flex-col gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
        {/* Sandbox vs Wizard Workflow Switch */}
        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Editor Workflow
            </span>
            <span
              style={{ color: 'var(--theme-accent)' }}
              className="font-mono text-[10px] font-semibold uppercase"
            >
              {isWizard ? '5-Step Wizard' : 'Full Sandbox'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => updateSettings({ editorMode: 'sandbox' })}
              style={
                !isWizard ? { borderColor: 'var(--theme-accent)' } : undefined
              }
              className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                !isWizard
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <Sliders className="h-3 w-3" />
              <span>Sandbox</span>
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ editorMode: 'wizard' })}
              style={
                isWizard ? { borderColor: 'var(--theme-accent)' } : undefined
              }
              className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                isWizard
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <Wand2 className="h-3 w-3" />
              <span>Wizard</span>
            </button>
          </div>
        </div>

        {/* Active Card Snapshot */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Active Card
            </span>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: activeTheme.color }}
            />
          </div>
          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
            {character.name || 'Untitled Character'}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>Lore Entries</span>
            <span>
              {activeEntriesCount}/{lorebook.entries.length}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>DM Tracker</span>
            <span
              className={
                character.extensions?.statBlock?.enableDMTracker
                  ? 'text-emerald-500'
                  : 'text-slate-400'
              }
            >
              {character.extensions?.statBlock?.enableDMTracker ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
