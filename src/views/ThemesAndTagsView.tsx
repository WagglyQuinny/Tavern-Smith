import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  X,
  Copy,
  Sparkles,
  Tag as TagIcon,
  Palette,
  Eye,
  EyeOff,
  CornerDownRight,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ContextTheme, SubTagDefinition, TagDefinition } from '../types';
import { Tooltip } from '../components/Tooltip';
import { buildActiveAIContextBlock } from '../services/aiService';
import {
  TagSelector,
  normalizeTagCategory,
  TagFilterCategory,
  isTagNsfw,
} from '../components/TagSelector';

const PRESET_SWATCHES = [
  '#6366f1', // Indigo (Basic Default)
  '#ef4444', // Red
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#0ea5e9', // Sky
];

const TAG_CATEGORIES: Exclude<TagFilterCategory, 'All'>[] = [
  'Rating',
  'Archetype',
  'Body & Attire',
  'NSFW & Kinks',
  'Extreme & Hentai Physics',
  'Custom',
];

export const ThemesAndTagsView: React.FC = () => {
  const {
    themes,
    setThemes,
    activeTheme,
    setActiveThemeId,
    tags,
    setTags,
    character,
    updateCharacterField,
    settings,
    updateSettings,
  } = useStore();

  const hideNsfw = Boolean(settings.hideNsfwTags);

  // Search & Filter states
  const [themeSearch, setThemeSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<TagFilterCategory>('All');

  // Theme Editor state
  const [editingThemeId, setEditingThemeId] = useState<string | null>(
    activeTheme.id
  );
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [themeDraft, setThemeDraft] = useState<Omit<ContextTheme, 'id'>>({
    name: activeTheme.name,
    color: activeTheme.color,
    aiContextPrompt: activeTheme.aiContextPrompt,
    associatedTags: activeTheme.associatedTags,
  });

  // Tag Editor state (with isNsfw and subTags)
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState<{
    name: string;
    color: string;
    category: TagDefinition['category'];
    isNsfw: boolean;
    subTags: SubTagDefinition[];
    aiContextDescription: string;
  }>({
    name: '',
    color: '#6366f1',
    category: 'Archetype',
    isNsfw: false,
    subTags: [],
    aiContextDescription: '',
  });

  // Sub-Tag draft inside the Tag Editor drawer
  const [subDraftName, setSubDraftName] = useState('');
  const [subDraftDesc, setSubDraftDesc] = useState('');

  const filteredThemes = useMemo(() => {
    const q = themeSearch.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.aiContextPrompt.toLowerCase().includes(q) ||
        t.associatedTags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [themes, themeSearch]);

  const visibleTags = useMemo(() => {
    if (!hideNsfw) return tags;
    return tags.filter((t) => !isTagNsfw(t));
  }, [tags, hideNsfw]);

  const categoryCounts = useMemo(() => {
    const counts: Record<TagFilterCategory, number> = {
      All: visibleTags.length,
      Rating: 0,
      Archetype: 0,
      'Body & Attire': 0,
      'NSFW & Kinks': 0,
      'Extreme & Hentai Physics': 0,
      Custom: 0,
    };
    for (const t of visibleTags) {
      const norm = normalizeTagCategory(t.category);
      counts[norm] = (counts[norm] || 0) + 1;
    }
    return counts;
  }, [visibleTags]);

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return visibleTags.filter((tag) => {
      const normCat = normalizeTagCategory(tag.category);
      const matchesCat =
        selectedCategory === 'All' || normCat === selectedCategory;
      const desc = (
        tag.aiContextDescription ||
        tag.aiDescription ||
        tag.description ||
        ''
      ).toLowerCase();
      const subMatches = (tag.subTags || []).some(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.aiDescription.toLowerCase().includes(q)
      );
      const matchesQuery =
        !q ||
        tag.name.toLowerCase().includes(q) ||
        desc.includes(q) ||
        normCat.toLowerCase().includes(q) ||
        subMatches;
      return matchesCat && matchesQuery;
    });
  }, [visibleTags, tagSearch, selectedCategory]);

  // Select a theme to edit
  const handleSelectThemeForEdit = (theme: ContextTheme) => {
    setIsCreatingTheme(false);
    setEditingThemeId(theme.id);
    setThemeDraft({
      name: theme.name,
      color: theme.color,
      aiContextPrompt: theme.aiContextPrompt,
      associatedTags: [...theme.associatedTags],
    });
  };

  const handleStartNewTheme = () => {
    setIsCreatingTheme(true);
    setEditingThemeId(null);
    setThemeDraft({
      name: '',
      color: '#8b5cf6',
      aiContextPrompt: '',
      associatedTags: [],
    });
  };

  const handleSaveTheme = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = themeDraft.name.trim();
    if (!cleanName) return;

    if (isCreatingTheme) {
      const newTheme: ContextTheme = {
        id: `theme-${Date.now()}`,
        name: cleanName,
        color: themeDraft.color,
        aiContextPrompt: themeDraft.aiContextPrompt.trim(),
        associatedTags: themeDraft.associatedTags,
      };
      setThemes((prev) => [...prev, newTheme]);
      setActiveThemeId(newTheme.id);
      setIsCreatingTheme(false);
      setEditingThemeId(newTheme.id);
    } else if (editingThemeId) {
      setThemes((prev) =>
        prev.map((t) =>
          t.id === editingThemeId
            ? {
                ...t,
                name: cleanName,
                color: themeDraft.color,
                aiContextPrompt: themeDraft.aiContextPrompt.trim(),
                associatedTags: themeDraft.associatedTags,
              }
            : t
        )
      );
    }
  };

  const handleDuplicateTheme = (theme: ContextTheme) => {
    const duplicated: ContextTheme = {
      ...theme,
      id: `theme-${Date.now()}`,
      name: `${theme.name} (Copy)`,
      isBuiltIn: false,
    };
    setThemes((prev) => [...prev, duplicated]);
    handleSelectThemeForEdit(duplicated);
  };

  const handleDeleteTheme = (id: string) => {
    if (themes.length <= 1) return;
    const remaining = themes.filter((t) => t.id !== id);
    setThemes(remaining);
    if (activeTheme.id === id) {
      setActiveThemeId(remaining[0].id);
    }
    if (editingThemeId === id) {
      handleSelectThemeForEdit(remaining[0]);
    }
  };

  const toggleTagInThemeDraft = (tagName: string) => {
    setThemeDraft((prev) => {
      const exists = prev.associatedTags.includes(tagName);
      return {
        ...prev,
        associatedTags: exists
          ? prev.associatedTags.filter((t) => t !== tagName)
          : [...prev.associatedTags, tagName],
      };
    });
  };

  // Tag & Sub-Tag CRUD handlers
  const handleStartNewTag = () => {
    setIsCreatingTag(true);
    setEditingTagId(null);
    setSubDraftName('');
    setSubDraftDesc('');
    setTagDraft({
      name: '',
      color: activeTheme.color,
      category: 'Archetype',
      isNsfw: false,
      subTags: [],
      aiContextDescription: '',
    });
  };

  const handleSelectTagForEdit = (tag: TagDefinition) => {
    setIsCreatingTag(false);
    setEditingTagId(tag.id);
    setSubDraftName('');
    setSubDraftDesc('');
    setTagDraft({
      name: tag.name,
      color: tag.color,
      category: normalizeTagCategory(tag.category),
      isNsfw: isTagNsfw(tag),
      subTags: Array.isArray(tag.subTags) ? [...tag.subTags] : [],
      aiContextDescription:
        tag.aiContextDescription || tag.aiDescription || '',
    });
  };

  const handleAddSubTagToDraft = () => {
    const cleanName = subDraftName.trim();
    if (!cleanName) return;
    const newSub: SubTagDefinition = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      aiDescription:
        subDraftDesc.trim() ||
        `Specific ${tagDraft.name || 'tag'} modifier: ${cleanName}.`,
    };
    setTagDraft((prev) => ({
      ...prev,
      subTags: [...prev.subTags, newSub],
    }));
    setSubDraftName('');
    setSubDraftDesc('');
  };

  const handleUpdateSubTagInDraft = (
    subId: string,
    patch: Partial<SubTagDefinition>
  ) => {
    setTagDraft((prev) => ({
      ...prev,
      subTags: prev.subTags.map((s) =>
        s.id === subId ? { ...s, ...patch } : s
      ),
    }));
  };

  const handleDeleteSubTagFromDraft = (subId: string) => {
    setTagDraft((prev) => ({
      ...prev,
      subTags: prev.subTags.filter((s) => s.id !== subId),
    }));
  };

  const handleSaveTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tagDraft.name.trim();
    if (!cleanName) return;

    // If user typed a sub-tag in the input box without clicking "+ Add Sub-Tag", include it automatically
    let finalSubTags = [...tagDraft.subTags];
    if (subDraftName.trim()) {
      finalSubTags.push({
        id: `sub-${Date.now()}`,
        name: subDraftName.trim(),
        aiDescription:
          subDraftDesc.trim() ||
          `Specific ${cleanName} modifier: ${subDraftName.trim()}.`,
      });
    }

    if (isCreatingTag) {
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}`,
        name: cleanName,
        color: tagDraft.color,
        category: tagDraft.category,
        isNsfw: tagDraft.isNsfw,
        subTags: finalSubTags,
        aiContextDescription: tagDraft.aiContextDescription.trim(),
      };
      setTags((prev) => [newTag, ...prev]);
      setIsCreatingTag(false);
      setEditingTagId(null);
    } else if (editingTagId) {
      const oldTag = tags.find((t) => t.id === editingTagId);
      setTags((prev) =>
        prev.map((t) =>
          t.id === editingTagId
            ? {
                ...t,
                name: cleanName,
                color: tagDraft.color,
                category: tagDraft.category,
                isNsfw: tagDraft.isNsfw,
                subTags: finalSubTags,
                aiContextDescription: tagDraft.aiContextDescription.trim(),
              }
            : t
        )
      );
      if (oldTag && oldTag.name !== cleanName) {
        setThemes((prev) =>
          prev.map((theme) => ({
            ...theme,
            associatedTags: theme.associatedTags.map((tName) =>
              tName === oldTag.name ? cleanName : tName
            ),
          }))
        );
        if (character.tags.includes(oldTag.name)) {
          updateCharacterField(
            'tags',
            character.tags.map((tName) =>
              tName === oldTag.name ? cleanName : tName
            )
          );
        }
      }
      setEditingTagId(null);
    }
    setSubDraftName('');
    setSubDraftDesc('');
  };

  const handleDeleteTag = (tag: TagDefinition) => {
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
    if (editingTagId === tag.id) {
      setEditingTagId(null);
    }
  };

  const compiledContextPreview = useMemo(
    () => buildActiveAIContextBlock(activeTheme, tags, character.tags),
    [activeTheme, tags, character.tags]
  );

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Context Themes, Tags &amp; Sub-Tags Library
            </h1>
            <Tooltip
              position="right"
              title="Dual-Layer Context System"
              content="Context Themes govern both the UI accent color (--theme-accent) and the system-level AI instructions injected when generating or autocompleting Character and Lorebook fields."
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure overarching AI worldbuilding directives, workspace accent colors, semantic tags, and sub-tags.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => updateSettings({ hideNsfwTags: !hideNsfw })}
            title="Hides all 18+ NSFW tags and sub-tags from the visible UI lists while still injecting any attached NSFW tags into AI generation prompts."
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
              hideNsfw
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            {hideNsfw ? (
              <>
                <EyeOff className="h-3.5 w-3.5 text-rose-500" />
                <span>🔞 NSFW Tags Hidden</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-slate-400" />
                <span>🔞 Hide NSFW Tags</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleStartNewTheme}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
          >
            <Plus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>New Context Theme</span>
          </button>
          <button
            type="button"
            onClick={handleStartNewTag}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Plus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>New Tag / Sub-Tags</span>
          </button>
        </div>
      </div>

      {/* Section 1: Context Themes Fluid Responsive Grid */}
      <div
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        }}
        className="grid gap-6 items-start"
      >
        {/* Left Column: Context Theme List */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
          }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-4 min-w-0"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Context Themes ({themes.length})
              </h2>
            </div>
          </div>

          {/* Search Themes */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={themeSearch}
              onChange={(e) => setThemeSearch(e.target.value)}
              placeholder="Search themes or tags..."
              className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Theme Rows */}
          <div className="space-y-2.5">
            {filteredThemes.map((theme) => {
              const isActive = theme.id === activeTheme.id;
              const isEditing = !isCreatingTheme && editingThemeId === theme.id;

              return (
                <div
                  key={theme.id}
                  style={
                    isActive
                      ? { borderColor: theme.color }
                      : isEditing
                        ? { borderColor: 'var(--theme-accent)' }
                        : undefined
                  }
                  className={`rounded-lg border p-3 transition-colors ${
                    isActive
                      ? 'bg-slate-50/90 dark:bg-slate-800/60'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        style={{ backgroundColor: theme.color }}
                        className="h-3.5 w-3.5 rounded-sm shrink-0 border border-black/10"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectThemeForEdit(theme)}
                        className="text-left text-xs font-semibold text-slate-900 dark:text-white hover:underline truncate cursor-pointer"
                      >
                        {theme.name}
                      </button>
                      <span className="font-mono text-[11px] uppercase text-slate-400 dark:text-slate-500 tabular-nums">
                        {theme.color}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveThemeId(theme.id)}
                        style={
                          isActive
                            ? {
                                borderColor: theme.color,
                                color: theme.color,
                              }
                            : undefined
                        }
                        className={`rounded px-2 py-0.5 text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-white dark:bg-slate-900'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {isActive ? 'Active' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectThemeForEdit(theme)}
                        title="Edit Context Theme"
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateTheme(theme)}
                        title="Duplicate Context Theme"
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {themes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTheme(theme.id)}
                          title="Delete Context Theme"
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {theme.aiContextPrompt}
                  </p>

                  {theme.associatedTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {theme.associatedTags.map((tag, idx) => (
                        <React.Fragment key={tag}>
                          {idx > 0 && <span aria-hidden="true">·</span>}
                          <span>{tag}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Context Theme Editor + Live Compiled AI Context Preview */}
        <div className="space-y-6 min-w-0">
          <form
            onSubmit={handleSaveTheme}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {isCreatingTheme
                    ? 'Create New Context Theme'
                    : `Edit Theme: ${themeDraft.name || 'Untitled'}`}
                </h3>
                <Tooltip
                  title="Context Theme Configuration"
                  content="Changes saved here update the theme's global AI prompt instructions, associated genre tags, and hex accent color."
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isCreatingTheme ? 'Create Theme' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Theme Name</span>
                  <Tooltip content="Concise title displayed in the top header Context Theme switcher." />
                </label>
                <input
                  type="text"
                  required
                  value={themeDraft.name}
                  onChange={(e) =>
                    setThemeDraft((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Cosmic Horror, Regency Romance..."
                  className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Hex Accent Color</span>
                  <Tooltip content="Dynamically styles all active borders, tab highlights, and hover outlines when this theme is active." />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themeDraft.color}
                    onChange={(e) =>
                      setThemeDraft((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="h-8 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-800 bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={themeDraft.color}
                    onChange={(e) =>
                      setThemeDraft((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs uppercase text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {PRESET_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setThemeDraft((prev) => ({ ...prev, color: hex }))
                      }
                      style={{ backgroundColor: hex }}
                      title={`Use ${hex}`}
                      className={`h-4 w-4 rounded-xs border cursor-pointer transition-transform ${
                        themeDraft.color.toLowerCase() === hex.toLowerCase()
                          ? 'scale-110 border-slate-900 dark:border-white'
                          : 'border-black/15 opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Global AI Prompt Context</span>
                <Tooltip content="Overarching prose style, vocabulary rules, and worldbuilding constraints sent to the AI assistant during character and lore generation." />
              </label>
              <textarea
                rows={4}
                value={themeDraft.aiContextPrompt}
                onChange={(e) =>
                  setThemeDraft((prev) => ({
                    ...prev,
                    aiContextPrompt: e.target.value,
                  }))
                }
                placeholder="Describe tone, sensory cues, dialogue register, and genre boundaries for the AI..."
                className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs leading-relaxed text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Associated Genre Tags Selector */}
            <TagSelector
              tags={tags}
              selectedTagNames={themeDraft.associatedTags}
              onToggleTag={toggleTagInThemeDraft}
              label="Associated Genre & Tone Tags"
              tooltip="Select tags or sub-tags from the Global Tag Library to automatically attach their AI context rules whenever this theme is active."
              maxHeightClass="max-h-48"
            />
          </form>

          {/* Live Synthesized AI Context Prompt Preview */}
          <div
            style={{
              borderColor:
                'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            }}
            className="rounded-xl border bg-slate-50/70 dark:bg-slate-900/50 p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles
                  className="h-4 w-4"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Active AI Context System Prompt Preview ({activeTheme.name})
                </span>
              </div>
              <Tooltip content="This synthesized context block is automatically prepended to AI generation and inline ghost-text requests. Note: Attached NSFW tags are always included in AI context even when hidden in the UI." />
            </div>
            <pre className="font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3">
              {compiledContextPreview}
            </pre>
          </div>
        </div>
      </div>

      {/* Section 2: Global Tag & Sub-Tag Library CRUD */}
      <div
        style={{
          borderColor:
            'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
        }}
        className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <TagIcon
              className="h-4 w-4"
              style={{ color: 'var(--theme-accent)' }}
            />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Global Tag &amp; Sub-Tag Library ({visibleTags.length} shown /{' '}
              {tags.length} total)
            </h2>
            <Tooltip
              title="Semantic AI Context Tags & Sub-Tags"
              content="Each Tag and Sub-Tag carries an AI Context Directive so the LLM understands how that tag shapes character anatomy, personality, kinks, or lore entries."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => updateSettings({ hideNsfwTags: !hideNsfw })}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                hideNsfw
                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200'
              }`}
            >
              {hideNsfw ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-rose-500" />
                  <span>🔞 NSFW Tags Hidden</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                  <span>🔞 Hide NSFW Tags</span>
                </>
              )}
            </button>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags, sub-tags, or directives..."
                className="theme-focus-ring rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              {tagSearch && (
                <button
                  type="button"
                  onClick={() => setTagSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Segmented Filter Pills */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800">
              {(hideNsfw
                ? (['All', 'Rating', 'Archetype', 'Body & Attire'] as TagFilterCategory[])
                : ([
                    'All',
                    'Rating',
                    'Archetype',
                    'Body & Attire',
                    'NSFW & Kinks',
                    'Extreme & Hentai Physics',
                  ] as TagFilterCategory[])
              )
                .concat(categoryCounts.Custom > 0 ? ['Custom'] : [])
                .map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-[var(--theme-accent)] text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {cat} ({categoryCounts[cat] ?? 0})
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Inline Tag + Sub-Tag Create / Edit Drawer */}
        {(isCreatingTag || editingTagId) && (
          <form
            onSubmit={handleSaveTag}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="rounded-lg border bg-slate-50 dark:bg-slate-950 p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {isCreatingTag
                  ? 'Create Semantic Tag & Sub-Tags'
                  : `Edit Semantic Tag: ${tagDraft.name}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingTag(false);
                  setEditingTagId(null);
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Tag Name
                </label>
                <input
                  type="text"
                  required
                  value={tagDraft.name}
                  onChange={(e) =>
                    setTagDraft((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Big Breasts, Bondage, Tsundere..."
                  className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Category
                </label>
                <select
                  value={tagDraft.category}
                  onChange={(e) => {
                    const cat = e.target.value as TagDefinition['category'];
                    setTagDraft((prev) => ({
                      ...prev,
                      category: cat,
                      isNsfw:
                        cat === 'NSFW & Kinks' ||
                        cat === 'Extreme & Hentai Physics'
                          ? true
                          : prev.isNsfw,
                    }));
                  }}
                  className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs capitalize text-slate-900 dark:text-white"
                >
                  {TAG_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Tag Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={tagDraft.color}
                    onChange={(e) =>
                      setTagDraft((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="h-7 w-9 cursor-pointer rounded border border-slate-200 dark:border-slate-800 bg-transparent"
                  />
                  <input
                    type="text"
                    value={tagDraft.color}
                    onChange={(e) =>
                      setTagDraft((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="font-mono w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs uppercase text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              {/* NSFW Tag Checkbox */}
              <div className="flex items-center justify-between sm:justify-end gap-3 pb-1">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tagDraft.isNsfw}
                    onChange={(e) =>
                      setTagDraft((prev) => ({
                        ...prev,
                        isNsfw: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-rose-500 cursor-pointer"
                  />
                  <span>🔞 NSFW Tag</span>
                </label>

                <button
                  type="submit"
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-md border bg-slate-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Tag</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                AI Context Directive (Injected when tag is active on Character, Lorebook, or Theme)
              </label>
              <input
                type="text"
                required
                value={tagDraft.aiContextDescription}
                onChange={(e) =>
                  setTagDraft((prev) => ({
                    ...prev,
                    aiContextDescription: e.target.value,
                  }))
                }
                placeholder="Explain how the AI should interpret this tag when writing dialogue or lore..."
                className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            {/* Sub-Tags Builder inside Tag Create/Edit Form */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <CornerDownRight
                    className="h-3.5 w-3.5"
                    style={{ color: tagDraft.color }}
                  />
                  <span>
                    Sub-Tags ({tagDraft.subTags.length}) — Specific Nuances &amp; Variations
                  </span>
                </div>
              </div>

              {tagDraft.subTags.length > 0 && (
                <div className="space-y-1.5">
                  {tagDraft.subTags.map((sub) => (
                    <div
                      key={sub.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                    >
                      <input
                        type="text"
                        value={sub.name}
                        onChange={(e) =>
                          handleUpdateSubTagInDraft(sub.id, {
                            name: e.target.value,
                          })
                        }
                        placeholder="Sub-Tag Name"
                        className="sm:col-span-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-900 dark:text-white"
                      />
                      <input
                        type="text"
                        value={sub.aiDescription}
                        onChange={(e) =>
                          handleUpdateSubTagInDraft(sub.id, {
                            aiDescription: e.target.value,
                          })
                        }
                        placeholder="Sub-Tag AI Context Description"
                        className="sm:col-span-8 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteSubTagFromDraft(sub.id)}
                        className="sm:col-span-1 flex items-center justify-center p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        title="Remove Sub-Tag"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap sm:flex-nowrap gap-2 pt-1">
                <input
                  type="text"
                  value={subDraftName}
                  onChange={(e) => setSubDraftName(e.target.value)}
                  placeholder="New Sub-Tag name (e.g., Shibari Rope, Perky)..."
                  className="w-full sm:w-52 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={subDraftDesc}
                  onChange={(e) => setSubDraftDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubTagToDraft();
                    }
                  }}
                  placeholder="Sub-Tag AI context directive..."
                  className="flex-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddSubTagToDraft}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Sub-Tag</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* High-Density Tag Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">Tag &amp; Sub-Tags</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">AI Context Directive</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 text-xs">
              {filteredTags.map((tag) => {
                const nsfw = isTagNsfw(tag);
                const subs = tag.subTags || [];
                return (
                  <tr
                    key={tag.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors align-top"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: tag.color }}
                          className="h-3 w-3 rounded-xs shrink-0"
                        />
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {tag.name}
                        </span>
                        {nsfw && (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-500">
                            18+ NSFW
                          </span>
                        )}
                      </div>

                      {subs.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-4">
                          <CornerDownRight className="h-3 w-3 text-slate-400 shrink-0 mr-0.5" />
                          {subs.map((sub) => (
                            <span
                              key={sub.id}
                              title={sub.aiDescription}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300"
                            >
                              {sub.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap capitalize text-slate-500 dark:text-slate-400">
                      {tag.category}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {tag.aiContextDescription}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectTagForEdit(tag)}
                          className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          title="Edit Tag & Sub-Tags"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag)}
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          title="Delete Tag"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredTags.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-xs text-slate-400 dark:text-slate-500"
                  >
                    No visible tags match your current filter. Click &ldquo;New Tag / Sub-Tags&rdquo; to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
