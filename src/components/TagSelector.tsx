import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Tag,
  X,
  EyeOff,
  Eye,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
} from 'lucide-react';
import { TagDefinition } from '../types';
import { useStore } from '../context/StoreContext';
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

export function normalizeTagCategory(
  cat?: string
): Exclude<TagFilterCategory, 'All'> {
  if (!cat) return 'Custom';
  const trimmed = cat.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === 'Rating' || lower === 'rating') return 'Rating';
  if (trimmed === 'Archetype' || lower === 'archetype') return 'Archetype';
  if (trimmed === 'Body & Attire' || lower === 'body & attire')
    return 'Body & Attire';
  if (trimmed === 'NSFW & Kinks' || lower === 'nsfw & kinks')
    return 'NSFW & Kinks';
  if (
    trimmed === 'Extreme & Hentai Physics' ||
    lower === 'extreme & hentai physics' ||
    lower.includes('hentai physics')
  ) {
    return 'Extreme & Hentai Physics';
  }
  return 'Custom';
}

export function isTagNsfw(tag: TagDefinition): boolean {
  if (tag.isNsfw !== undefined) return Boolean(tag.isNsfw);
  const norm = normalizeTagCategory(tag.category);
  return norm === 'NSFW & Kinks' || norm === 'Extreme & Hentai Physics';
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
  label = 'Tags & Sub-Tags (Active AI Context Modifiers)',
  tooltip = 'Click tags or sub-tags to attach or detach them. Every active tag injects its specific AI behavioral & sensory directive into all AI generation and polishing requests.',
  placeholder = 'Create & attach custom tag...',
  maxHeightClass = 'max-h-60',
}) => {
  const { settings, updateSettings, addSubTagToTag } = useStore();
  const hideNsfw = Boolean(settings.hideNsfwTags);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<TagFilterCategory>('All');
  const [customTagInput, setCustomTagInput] = useState('');
  const [expandedParentTagId, setExpandedParentTagId] = useState<string | null>(
    null
  );
  const [newSubTagName, setNewSubTagName] = useState('');
  const [newSubTagDesc, setNewSubTagDesc] = useState('');

  // Filter library tags based on "Hide NSFW Tags" UI toggle
  const visibleLibraryTags = useMemo(() => {
    if (!hideNsfw) return tags;
    return tags.filter((t) => !isTagNsfw(t));
  }, [tags, hideNsfw]);

  const hasCustomTags = useMemo(
    () =>
      visibleLibraryTags.some(
        (t) => normalizeTagCategory(t.category) === 'Custom'
      ),
    [visibleLibraryTags]
  );

  const categoryList: TagFilterCategory[] = useMemo(() => {
    const base = hideNsfw
      ? (['All', 'Rating', 'Archetype', 'Body & Attire'] as TagFilterCategory[])
      : PRIMARY_TAG_CATEGORIES;
    return hasCustomTags ? [...base, 'Custom'] : base;
  }, [hasCustomTags, hideNsfw]);

  const categoryCounts = useMemo(() => {
    const counts: Record<TagFilterCategory, number> = {
      All: visibleLibraryTags.length,
      Rating: 0,
      Archetype: 0,
      'Body & Attire': 0,
      'NSFW & Kinks': 0,
      'Extreme & Hentai Physics': 0,
      Custom: 0,
    };
    for (const t of visibleLibraryTags) {
      const norm = normalizeTagCategory(t.category);
      counts[norm] = (counts[norm] || 0) + 1;
    }
    return counts;
  }, [visibleLibraryTags]);

  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleLibraryTags.filter((t) => {
      const normCat = normalizeTagCategory(t.category);
      const matchesCat =
        activeCategory === 'All' || normCat === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const desc = (
        t.aiContextDescription ||
        t.aiDescription ||
        t.description ||
        ''
      ).toLowerCase();
      const subMatches = (t.subTags || []).some(
        (sub) =>
          sub.name.toLowerCase().includes(q) ||
          sub.aiDescription.toLowerCase().includes(q)
      );
      return (
        t.name.toLowerCase().includes(q) ||
        desc.includes(q) ||
        normCat.toLowerCase().includes(q) ||
        subMatches
      );
    });
  }, [visibleLibraryTags, activeCategory, searchQuery]);

  // Resolve attached tags & sub-tags, respecting hideNsfw for UI display only
  const { visibleAttachedObjects, hiddenNsfwAttachedCount } = useMemo(() => {
    const visibleList: Array<{
      id: string;
      name: string;
      color: string;
      isSubTag: boolean;
      aiContextDescription: string;
    }> = [];
    let hiddenCount = 0;

    for (const rawName of selectedTagNames) {
      const lower = rawName.trim().toLowerCase();

      // 1. Direct Main Tag Match
      const mainMatch = tags.find((t) => t.name.toLowerCase() === lower);
      if (mainMatch) {
        if (hideNsfw && isTagNsfw(mainMatch)) {
          hiddenCount++;
        } else {
          visibleList.push({
            id: mainMatch.id,
            name: mainMatch.name,
            color: mainMatch.color,
            isSubTag: false,
            aiContextDescription:
              mainMatch.aiContextDescription ||
              mainMatch.aiDescription ||
              '',
          });
        }
        continue;
      }

      // 2. Sub-Tag Match ("Parent: Sub" or bare sub-tag name)
      let foundSub = false;
      for (const parent of tags) {
        for (const sub of parent.subTags || []) {
          const composite = `${parent.name}: ${sub.name}`.toLowerCase();
          if (lower === composite || lower === sub.name.toLowerCase()) {
            foundSub = true;
            if (hideNsfw && isTagNsfw(parent)) {
              hiddenCount++;
            } else {
              visibleList.push({
                id: `${parent.id}-${sub.id}`,
                name: rawName,
                color: parent.color,
                isSubTag: true,
                aiContextDescription: `${parent.name} → ${sub.name}: ${sub.aiDescription}`,
              });
            }
            break;
          }
        }
        if (foundSub) break;
      }

      if (!foundSub) {
        visibleList.push({
          id: `unregistered-${rawName}`,
          name: rawName,
          color: '#6366f1',
          isSubTag: rawName.includes(':'),
          aiContextDescription: `Emphasize ${rawName} elements and tropes accurately.`,
        });
      }
    }

    return {
      visibleAttachedObjects: visibleList,
      hiddenNsfwAttachedCount: hiddenCount,
    };
  }, [selectedTagNames, tags, hideNsfw]);

  const expandedParentTag = useMemo(() => {
    if (!expandedParentTagId) return null;
    const found = visibleLibraryTags.find((t) => t.id === expandedParentTagId);
    return found || null;
  }, [expandedParentTagId, visibleLibraryTags]);

  const handleCreateCustom = () => {
    const clean = customTagInput.trim();
    if (!clean || !onAddCustomTag) return;
    onAddCustomTag(clean);
    setCustomTagInput('');
  };

  const handleToggleSubTag = (parentTag: TagDefinition, subTagName: string) => {
    const compositeName = `${parentTag.name}: ${subTagName}`;
    // Also ensure parent tag is attached when attaching a sub-tag for the first time
    const isSubCurrentlySelected = selectedTagNames.some(
      (s) =>
        s.toLowerCase() === compositeName.toLowerCase() ||
        s.toLowerCase() === subTagName.toLowerCase()
    );
    const isParentSelected = selectedTagNames.some(
      (s) => s.toLowerCase() === parentTag.name.toLowerCase()
    );

    if (!isSubCurrentlySelected && !isParentSelected) {
      onToggleTag(parentTag.name);
    }
    onToggleTag(compositeName);
  };

  const handleAddSubTagSubmit = (parentTag: TagDefinition) => {
    const cleanSub = newSubTagName.trim();
    if (!cleanSub) return;
    addSubTagToTag(
      parentTag.id,
      cleanSub,
      newSubTagDesc.trim() ||
        `Specific ${parentTag.name} modifier: ${cleanSub}.`
    );
    const compositeName = `${parentTag.name}: ${cleanSub}`;
    if (
      !selectedTagNames.some(
        (s) => s.toLowerCase() === compositeName.toLowerCase()
      )
    ) {
      onToggleTag(compositeName);
    }
    setNewSubTagName('');
    setNewSubTagDesc('');
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label && (
          <label className="text-xs font-semibold flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
            <Tag className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
            <span>{label}</span>
            {tooltip && <Tooltip content={tooltip} />}
          </label>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Prominent "🔞 Hide NSFW Tags" UI Toggle */}
          <button
            type="button"
            onClick={() => updateSettings({ hideNsfwTags: !hideNsfw })}
            title="Hides all 18+ NSFW tags and sub-tags from the visible UI lists while still injecting any attached NSFW tags into AI generation prompts."
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
              hideNsfw
                ? 'bg-rose-500/15 border-rose-500/50 text-rose-700 dark:text-rose-300'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-[var(--theme-accent)]'
            }`}
          >
            {hideNsfw ? (
              <>
                <EyeOff className="w-3 h-3 text-rose-500" />
                <span>🔞 NSFW Tags Hidden</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 text-zinc-400" />
                <span>🔞 Hide NSFW Tags</span>
              </>
            )}
          </button>

          <span className="text-[11px] font-mono text-zinc-500">
            {selectedTagNames.length} attached · {visibleLibraryTags.length} shown
          </span>
        </div>
      </div>

      {/* Attached Tags Summary Bar */}
      {(visibleAttachedObjects.length > 0 || hiddenNsfwAttachedCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-[var(--theme-accent)]/30 bg-[var(--theme-accent)]/5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mr-1">
            Attached:
          </span>
          {visibleAttachedObjects.map((t) => (
            <button
              key={`attached-${t.name}`}
              type="button"
              onClick={() => onToggleTag(t.name)}
              title={`${t.aiContextDescription} (Click to detach)`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs hover:opacity-85 cursor-pointer"
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
          {hiddenNsfwAttachedCount > 0 && (
            <span
              title="Attached NSFW tags are hidden from the screen but remain active in AI generation prompts."
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            >
              +{hiddenNsfwAttachedCount} NSFW active in AI context (hidden)
            </span>
          )}
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
              placeholder="Search tags or sub-tags by name, archetype, or AI directive..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--theme-accent)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
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
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all border cursor-pointer ${
                    isActive
                      ? 'bg-[var(--theme-accent)] text-white border-[var(--theme-accent)] shadow-xs'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-[var(--theme-accent)]/60'
                  }`}
                >
                  {cat}
                  <span
                    className={`ml-1 text-[10px] ${
                      isActive
                        ? 'text-white/85'
                        : 'text-zinc-400 dark:text-zinc-500'
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
        <div
          className={`flex flex-wrap gap-1.5 overflow-y-auto pr-1 ${maxHeightClass}`}
        >
          {filteredTags.length === 0 ? (
            <div className="w-full py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
              No visible tags match &ldquo;{searchQuery}&rdquo; in {activeCategory}.
            </div>
          ) : (
            filteredTags.map((t) => {
              const active = selectedTagNames.some(
                (sel) => sel.toLowerCase() === t.name.toLowerCase()
              );
              const subCount = t.subTags?.length || 0;
              const activeSubCount = (t.subTags || []).filter((sub) => {
                const comp = `${t.name}: ${sub.name}`.toLowerCase();
                return selectedTagNames.some(
                  (sel) =>
                    sel.toLowerCase() === comp ||
                    sel.toLowerCase() === sub.name.toLowerCase()
                );
              }).length;
              const isExpanded = expandedParentTagId === t.id;
              const desc =
                t.aiContextDescription || t.aiDescription || t.description || '';

              return (
                <div
                  key={t.id}
                  className={`inline-flex items-center rounded-md border text-xs font-medium transition-all ${
                    active
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs'
                      : 'bg-white dark:bg-zinc-900/90 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-[var(--theme-accent)]'
                  }`}
                  style={
                    active || isExpanded ? { borderColor: t.color } : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTag(t.name);
                      if (subCount > 0 && !active) {
                        setExpandedParentTagId(t.id);
                      }
                    }}
                    title={`${t.name} [${normalizeTagCategory(t.category)}]: ${desc}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 cursor-pointer"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span>{t.name}</span>
                    {isTagNsfw(t) && (
                      <span className="text-[9px] font-mono uppercase px-1 rounded bg-rose-500/20 text-rose-400">
                        18+
                      </span>
                    )}
                  </button>

                  {/* Sub-Tags Expand Trigger */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedParentTagId((prev) =>
                        prev === t.id ? null : t.id
                      );
                    }}
                    title={
                      subCount > 0
                        ? `View or select ${subCount} Sub-Tag(s) under ${t.name}`
                        : `Add Sub-Tags under ${t.name}`
                    }
                    className={`px-1.5 py-1 border-l text-[10px] font-mono flex items-center gap-0.5 cursor-pointer ${
                      active
                        ? 'border-zinc-700 dark:border-zinc-300 text-zinc-300 dark:text-zinc-700'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {subCount > 0 && (
                      <span>
                        {activeSubCount > 0
                          ? `${activeSubCount}/${subCount}`
                          : subCount}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Inline Sub-Tags Drawer for Expanded Parent Tag */}
        {expandedParentTag && (
          <div
            style={{ borderColor: expandedParentTag.color }}
            className="rounded-lg border bg-white dark:bg-zinc-900 p-3 space-y-2.5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <CornerDownRight
                  className="w-3.5 h-3.5"
                  style={{ color: expandedParentTag.color }}
                />
                <span>Sub-Tags for {expandedParentTag.name}</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  (Click to attach specific nuances to AI context)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpandedParentTagId(null)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(expandedParentTag.subTags || []).length === 0 ? (
                <span className="text-[11px] text-zinc-400">
                  No sub-tags yet. Add one below!
                </span>
              ) : (
                (expandedParentTag.subTags || []).map((sub) => {
                  const composite = `${expandedParentTag.name}: ${sub.name}`;
                  const isSubSelected = selectedTagNames.some(
                    (s) =>
                      s.toLowerCase() === composite.toLowerCase() ||
                      s.toLowerCase() === sub.name.toLowerCase()
                  );
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() =>
                        handleToggleSubTag(expandedParentTag, sub.name)
                      }
                      title={sub.aiDescription}
                      style={
                        isSubSelected
                          ? { borderColor: expandedParentTag.color }
                          : undefined
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                        isSubSelected
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs'
                          : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-[var(--theme-accent)]'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: expandedParentTag.color }}
                      />
                      <span>{sub.name}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick Add Sub-Tag Form */}
            <div className="flex flex-wrap sm:flex-nowrap gap-1.5 pt-1.5 border-t border-zinc-200/70 dark:border-zinc-800/70">
              <input
                type="text"
                value={newSubTagName}
                onChange={(e) => setNewSubTagName(e.target.value)}
                placeholder={`New sub-tag for ${expandedParentTag.name} (e.g., Perky)...`}
                className="w-full sm:w-44 px-2.5 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--theme-accent)]"
              />
              <input
                type="text"
                value={newSubTagDesc}
                onChange={(e) => setNewSubTagDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubTagSubmit(expandedParentTag);
                  }
                }}
                placeholder="Sub-tag AI directive (optional)..."
                className="flex-1 px-2.5 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[var(--theme-accent)]"
              />
              <button
                type="button"
                onClick={() => handleAddSubTagSubmit(expandedParentTag)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:border-[var(--theme-accent)] text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 shrink-0 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Sub-Tag</span>
              </button>
            </div>
          </div>
        )}

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
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:border-[var(--theme-accent)] text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Tag
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
