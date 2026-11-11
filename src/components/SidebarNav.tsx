import React from 'react';
import {
  User,
  BookOpen,
  Palette,
  FileJson,
  Settings,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { WorkspaceTab } from '../types';

interface NavItem {
  id: WorkspaceTab;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  count?: string | number;
}

export const SidebarNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    characters,
    character,
    lorebooks,
    lorebook,
    themes,
    tags,
    settings,
  } = useStore();

  const navItems: NavItem[] = [
    {
      id: 'character',
      label: 'Character',
      subtitle: character.name || 'Untitled Card',
      icon: User,
      count: characters.length,
    },
    {
      id: 'lorebook',
      label: 'Lorebook',
      subtitle: `${lorebook.name} · ${lorebook.entries.length} entries`,
      icon: BookOpen,
      count: lorebooks.length,
    },
    {
      id: 'themes_tags',
      label: 'Context Themes & Tags',
      subtitle: `${themes.length} themes · ${tags.length} tags`,
      icon: Palette,
    },
    {
      id: 'json_inspector',
      label: 'JSON Inspector',
      subtitle: `Spec ${settings.cardSpecVersion.toUpperCase()} schema`,
      icon: FileJson,
    },
    {
      id: 'options',
      label: 'Options',
      subtitle: 'Appearance & AI backend',
      icon: Settings,
    },
  ];

  return (
    <aside
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 32%, transparent)',
      }}
      className="w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r bg-slate-50/70 dark:bg-slate-900/50 p-3 flex flex-col justify-between"
    >
      <nav aria-label="Primary Workspace Views" className="space-y-1">
        <div className="px-2.5 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
          Workspace Views
        </div>
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
                        'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                    }
                  : undefined
              }
              className={`theme-hover-outline w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                isActive
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={isActive ? { color: 'var(--theme-accent)' } : undefined}
                />
                <div className="min-w-0">
                  <div className="text-xs leading-snug truncate whitespace-nowrap">
                    {item.label}
                  </div>
                  <div className="text-[11px] font-normal text-slate-400 dark:text-slate-500 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </div>

              {item.count !== undefined && (
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Workspace Context Summary Card */}
      <div
        style={{
          borderColor:
            'color-mix(in srgb, var(--theme-accent) 32%, transparent)',
        }}
        className="hidden md:block mt-6 rounded-lg border bg-white dark:bg-slate-900 p-3 text-xs space-y-2"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span>Workflow Mode</span>
          <span className="font-mono font-medium text-slate-800 dark:text-slate-200 capitalize">
            {settings.editorMode}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span>Auto-Save</span>
          <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
            {settings.autoSaveEnabled
              ? `Every ${settings.autoSaveIntervalSec}s`
              : 'Manual'}
          </span>
        </div>
      </div>
    </aside>
  );
};
