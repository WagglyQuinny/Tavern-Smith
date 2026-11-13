import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  X,
  Check,
  Tag as TagIcon,
  ShieldAlert,
} from 'lucide-react';
import { useStore, isTagNsfwFlagged } from '../context/StoreContext';
import { TagDefinition } from '../types';
import { Tooltip } from './Tooltip';

interface TagSelectorProps {
  selectedTags?: string[];
  selectedTagNames?: string[];
  onChange?: (nextTags: string[]) => void;
  onToggleTag?: (tagName: string) => void;
  onAddCustomTag?: (tagName: string) => void;
  tags?: TagDefinition[];
  title?: string;
  label?: string;
  tooltip?: string;
  compact?: boolean;
}

export function isTagNsfw(tag: TagDefinition): boolean {
  return isTagNsfwFlagged(tag);
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  selectedTags: selectedTagsProp,
  selectedTagNames,
  onChange,
  onToggleTag,
  onAddCustomTag,
  tags: tagsProp,
  title,
  label,
  tooltip = 'Click any tag to attach or detach its AI writing directive. Tags flagged NSFW (18+) automatically mark the Character or Lorebook as NSFW. Toggle NSFW visibility in Options (⚙️).',
  compact = false,
}) => {
  const { tags: storeTags, setTags, settings } = useStore();
  const tags = tagsProp || storeTags;
  const selectedTags = selectedTagsProp ?? selectedTagNames ?? [];
  const headerTitle = title || label || 'Tags & AI Style Directives';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [quickNewTagName, setQuickNewTagName] = useState('');
  const [quickNewTagNsfw, setQuickNewTagNsfw] = useState(false);

  const hideNsfw = Boolean(settings.hideNsfwTags);

  // Build available category tabs (respecting Options -> Hide NSFW Content)
  const categories = useMemo(() => {
    const visibleSource = hideNsfw ? tags.filter((t) => !isTagNsfw(t)) : tags;
    const set = new Set<string>();
    const preferredOrder = [
      'Setting & Vibe',
      'Narrative & Meta',
      'Rating',
      'Archetype',
      'Body & Attire',
      'NSFW & Kinks',
      'Extreme & Hentai Physics',
      'Genre & Setting',
      'Personality & Archetype',
      'Relationship & Role',
      'Tone & Style',
      'Custom',
    ];
    for (const p of preferredOrder) {
      if (visibleSource.some((t) => t.category === p)) {
        set.add(p);
      }
    }
    for (const t of visibleSource) {
      if (t.category) set.add(t.category);
    }
    return ['All', ...Array.from(set)];
  }, [tags, hideNsfw]);

  // Filter tags for the visual grid
  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tags.filter((t) => {
      if (hideNsfw && isTagNsfw(t)) return false;
      if (activeCategory !== 'All' && t.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const desc = (
        t.aiContextDescription ||
        t.aiDescription ||
        t.description ||
        ''
      ).toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        desc.includes(q)
      );
    });
  }, [tags, hideNsfw, activeCategory, searchQuery]);

  // Selected tags displayed as removable chips at top (hiding NSFW ones visually if Hide NSFW Content is ON in Options)
  const visibleSelectedTagNames = useMemo(() => {
    return selectedTags.filter((rawName) => {
      if (!hideNsfw) return true;
      const lower = rawName.trim().toLowerCase();
      const baseName = lower.includes(':') ? lower.split(':')[0].trim() : lower;
      const matched = tags.find(
        (t) =>
          t.name.trim().toLowerCase() === lower ||
          t.name.trim().toLowerCase() === baseName
      );
      if (matched && isTagNsfw(matched)) return false;
      if (lower.includes('nsfw') || lower.includes('18+')) return false;
      return true;
    });
  }, [selectedTags, tags, hideNsfw]);

  const hiddenSelectedNsfwCount =
    selectedTags.length - visibleSelectedTagNames.length;

  const isSelected = (tagName: string) =>
    selectedTags.some(
      (t) => t.trim().toLowerCase() === tagName.trim().toLowerCase()
    );

  const handleToggleTag = (tagName: string) => {
    const clean = tagName.trim();
    if (!clean) return;
    if (onToggleTag) {
      onToggleTag(clean);
      return;
    }
    if (onChange) {
      const exists = isSelected(clean);
      if (exists) {
        onChange(
          selectedTags.filter(
            (t) => t.trim().toLowerCase() !== clean.toLowerCase()
          )
        );
      } else {
        onChange([...selectedTags, clean]);
      }
    }
  };

  const handleQuickCreateAndAttach = () => {
    const clean = quickNewTagName.trim();
    if (!clean) return;

    const existing = tags.find(
      (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
    );
    if (!existing) {
      const targetCat =
        activeCategory !== 'All'
          ? activeCategory
          : quickNewTagNsfw
            ? 'NSFW & Kinks'
            : 'Custom';
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        color: quickNewTagNsfw ? '#f43f5e' : '#a855f7',
        category: targetCat,
        isNsfw: quickNewTagNsfw,
        aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${clean}".`,
        aiDescription: `Incorporate thematic, tonal, and character elements consistent with "${clean}".`,
      };
      setTags((prev) => [...prev, newTag]);
    }

    if (onAddCustomTag) {
      onAddCustomTag(clean);
    } else if (onToggleTag && !isSelected(clean)) {
      onToggleTag(clean);
    } else if (onChange && !isSelected(clean)) {
      onChange([...selectedTags, clean]);
    }
    setQuickNewTagName('');
  };

  return (
    <div
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 30%, transparent)',
      }}
      className={`rounded-xl border bg-slate-50/60 dark:bg-slate-950/50 ${
        compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TagIcon
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {headerTitle}
          </span>
          <Tooltip content={tooltip} />
          <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:text-slate-300">
            {selectedTags.length} active
          </span>
          {hiddenSelectedNsfwCount > 0 && (
            <span
              title="NSFW tags are hidden visually via Options -> Hide NSFW Content, but remain active in AI generation."
              className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400"
            >
              +{hiddenSelectedNsfwCount} NSFW hidden
            </span>
          )}
        </div>
      </div>

      {/* Active Attached Tags Chips Row */}
      {visibleSelectedTagNames.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-2">
          {visibleSelectedTagNames.map((tagName) => {
            const matchedMain = tags.find(
              (t) =>
                t.name.trim().toLowerCase() === tagName.trim().toLowerCase()
            );
            const chipColor = matchedMain?.color || 'var(--theme-accent)';
            const desc =
              matchedMain?.aiContextDescription ||
              matchedMain?.aiDescription ||
              'Attached Tag Directive';
            const tagFlaggedNsfw = matchedMain ? isTagNsfw(matchedMain) : false;

            return (
              <span
                key={tagName}
                title={desc}
                style={{
                  borderColor: chipColor,
                  backgroundColor: `color-mix(in srgb, ${chipColor} 14%, transparent)`,
                }}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium text-slate-900 dark:text-white"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: chipColor }}
                />
                <span>{tagName}</span>
                {tagFlaggedNsfw && (
                  <span className="rounded bg-rose-500/20 px-1 py-0.2 font-mono text-[9px] font-bold uppercase text-rose-600 dark:text-rose-300">
                    NSFW
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleToggleTag(tagName)}
                  title={`Remove "${tagName}"`}
                  className="ml-0.5 rounded-full p-0.5 text-slate-500 hover:text-rose-500 cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-3 py-1.5 text-[11px] text-slate-400">
          No tags attached yet. Click any tag pill below to attach its AI context directive.
        </div>
      )}

      {/* Search + Quick Add Custom Tag Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tags by name, category, or AI instruction..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={quickNewTagName}
            onChange={(e) => setQuickNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleQuickCreateAndAttach();
              }
            }}
            placeholder="Quick-create tag..."
            className="w-36 sm:w-44 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setQuickNewTagNsfw((prev) => !prev)}
            title="Flag this new tag as NSFW (18+)"
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
              quickNewTagNsfw
                ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
            }`}
          >
            <ShieldAlert className="h-3 w-3" />
            <span>NSFW</span>
          </button>
          <button
            type="button"
            onClick={handleQuickCreateAndAttach}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1 rounded-lg border bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer shrink-0"
          >
            <Plus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>Add Tag</span>
          </button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {categories.map((cat) => {
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={
                active
                  ? {
                      borderColor: 'var(--theme-accent)',
                      backgroundColor:
                        'color-mix(in srgb, var(--theme-accent) 15%, transparent)',
                    }
                  : undefined
              }
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                active
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Main Tag Grid */}
      <div
        className={`flex flex-wrap gap-1.5 overflow-y-auto pr-1 ${
          compact ? 'max-h-40' : 'max-h-56'
        }`}
      >
        {filteredTags.map((tag) => {
          const active = isSelected(tag.name);
          const nsfw = isTagNsfw(tag);
          const desc =
            tag.aiContextDescription || tag.aiDescription || tag.description || '';

          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleToggleTag(tag.name)}
              title={`${tag.name} (${tag.category}${nsfw ? ' • NSFW 18+' : ''}): ${desc}`}
              style={
                active
                  ? {
                      borderColor: tag.color,
                      backgroundColor: `color-mix(in srgb, ${tag.color} 18%, transparent)`,
                    }
                  : undefined
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer transition-all ${
                active
                  ? 'text-slate-900 dark:text-white font-semibold shadow-2xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span>{tag.name}</span>
              {nsfw && (
                <span className="rounded bg-rose-500/15 px-1 py-0.2 font-mono text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400">
                  NSFW
                </span>
              )}
              {active && (
                <Check
                  className="h-3 w-3 shrink-0"
                  style={{ color: tag.color }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
