import React, { useState, useMemo } from 'react';
import { Search, Plus, Tag, X } from 'lucide-react';
import { TagDefinition } from '../types';
import { Tooltip } from './Tooltip';

export type TagFilterCategory =
  | 'All'
  | 'Rating'
  | 'Archetype'
  | 'Body & Attire'
  | 'NSFW & Kinks'
  | 'Extreme & Hentai Physics'
  | 'Custom';

export const PRIMARY_TAG_CATEGORIES: TagFilterCategory[] = [
  'All',
  'Rating',
  'Archetype',
  'Body & Attire',
  'NSFW & Kinks',
  'Extreme & Hentai Physics',
];

export function normalizeTagCategory(cat?: string): Exclude<TagFilterCategory, 'All'> {
  if (!cat) return 'Custom';
  const trimmed = cat.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === 'Rating' || lower === 'rating') return 'Rating';
  if (trimmed === 'Archetype' || lower === 'archetype') return 'Archetype';
  if (trimmed === 'Body & Attire' || lower === 'body & attire') return 'Body & Attire';
  if (trimmed === 'NSFW & Kinks' || lower === 'nsfw & kinks') return 'NSFW & Kinks';
  if (
    trimmed === 'Extreme & Hentai Physics' ||
    lower === 'extreme & hentai physics' ||
    lower.includes('hentai physics')
  ) {
    return 'Extreme & Hentai Physics';
  }
  return 'Custom';
}

interface TagSelectorProps {
  tags: TagDefinition[];
  selectedTagNames: string[];
  onToggleTag: (tagName: string) => void;
  onAddCustomTag?: (tagName: string) => void;
  label?: string;
  tooltip?: string;
  placeholder?: string;
  maxHeightClass?: string;
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  tags,
  selectedTagNames,
  onToggleTag,
  onAddCustomTag,
  label = 'Tags (Active AI Context Modifiers)',
  tooltip = 'Click tags to attach or detach them. Every active tag injects its specific AI behavioral & sensory directive into all AI generation and polishing requests.',
  placeholder = 'Create & attach custom tag...',
  maxHeightClass = 'max-h-56',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<TagFilterCategory>('All');
  const [customTagInput, setCustomTagInput] = useState('');

  const hasCustomTags = useMemo(
    () => tags.some((t) => normalizeTagCategory(t.category) === 'Custom'),
    [tags]
  );

  const categoryList: TagFilterCategory[] = useMemo(() => {
    return hasCustomTags ? [...PRIMARY_TAG_CATEGORIES, 'Custom'] : PRIMARY_TAG_CATEGORIES;
  }, [hasCustomTags]);

  const categoryCounts = useMemo(() => {
    const counts: Record<TagFilterCategory, number> = {
      All: tags.length,
      Rating: 0,
      Archetype: 0,
      'Body & Attire': 0,
      'NSFW & Kinks': 0,
      'Extreme & Hentai Physics': 0,
      Custom: 0,
    };
    for (const t of tags) {
      const norm = normalizeTagCategory(t.category);
      counts[norm] = (counts[norm] || 0) + 1;
    }
    return counts;
  }, [tags]);

  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tags.filter((t) => {
      const normCat = normalizeTagCategory(t.category);
      const matchesCat = activeCategory === 'All' || normCat === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const desc = (t.aiContextDescription || t.aiDescription || t.description || '').toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        desc.includes(q) ||
        normCat.toLowerCase().includes(q)
      );
    });
  }, [tags, activeCategory, searchQuery]);

  // Also find any selected tags that aren't in the global library (e.g., imported card tags)
  const selectedTagObjects = useMemo(() => {
    return selectedTagNames.map((name) => {
      const match = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      return (
        match || {
          id: `unregistered-${name}`,
          name,
          color: '#6366f1',
          category: 'Custom' as const,
          aiContextDescription: `Emphasize ${name} elements and tropes accurately.`,
        }
      );
    });
  }, [selectedTagNames, tags]);

  const handleCreateCustom = () => {
    const clean = customTagInput.trim();
    if (!clean || !onAddCustomTag) return;
    onAddCustomTag(clean);
    setCustomTagInput('');
  };

  return (
    <div className="space-y-2.5">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
            <Tag className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            {label}
            {tooltip && <Tooltip content={tooltip} />}
          </label>
          <span className="text-[11px] font-mono text-zinc-500">
            {selectedTagNames.length} attached · {tags.length} in library
          </span>
        </div>
      )}

      {/* Attached Tags Summary Bar */}
      {selectedTagObjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-[var(--theme-accent)]/30 bg-[var(--theme-accent)]/5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mr-1">
            Attached:
          </span>
          {selectedTagObjects.map((t) => (
            <button
              key={`attached-${t.name}`}
              type="button"
              onClick={() => onToggleTag(t.name)}
              title={`${t.aiContextDescription || t.aiDescription || ''} (Click to detach)`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs hover:opacity-85"
              style={{ borderColor: t.color }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: t.color }}
              />
              <span>{t.name}</span>
              <X className="w-3 h-3 text-zinc-400 hover:text-red-400 ml-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Search + Category Filter Pills */}
      <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/60 space-y-2.5">
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 84+ tags by name, kink, archetype, or AI directive..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--theme-accent)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {categoryList.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-[var(--theme-accent)] text-white border-[var(--theme-accent)] shadow-xs'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-[var(--theme-accent)]/60'
                  }`}
                >
                  {cat}
                  <span
                    className={`ml-1 text-[10px] ${
                      isActive ? 'text-white/85' : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    ({categoryCounts[cat] ?? 0})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Tag Grid */}
        <div className={`flex flex-wrap gap-1.5 overflow-y-auto pr-1 ${maxHeightClass}`}>
          {filteredTags.length === 0 ? (
            <div className="w-full py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
              No tags match "{searchQuery}" in {activeCategory}.
            </div>
          ) : (
            filteredTags.map((t) => {
              const active = selectedTagNames.some(
                (sel) => sel.toLowerCase() === t.name.toLowerCase()
              );
              const desc = t.aiContextDescription || t.aiDescription || t.description || '';
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onToggleTag(t.name)}
                  title={`${t.name} [${normalizeTagCategory(t.category)}]: ${desc}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                    active
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs'
                      : 'bg-white dark:bg-zinc-900/90 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-[var(--theme-accent)]'
                  }`}
                  style={active ? { borderColor: t.color } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  <span>{t.name}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Custom Tag Quick-Creator */}
        {onAddCustomTag && (
          <div className="flex gap-2 pt-1.5 border-t border-zinc-200/70 dark:border-zinc-800/70">
            <input
              type="text"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateCustom();
                }
              }}
              placeholder={placeholder}
              className="flex-1 px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--theme-accent)]"
            />
            <button
              type="button"
              onClick={handleCreateCustom}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:border-[var(--theme-accent)] text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Tag
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
