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
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ContextTheme, TagDefinition } from '../types';
import { Tooltip } from '../components/Tooltip';
import { buildActiveAIContextBlock } from '../services/aiService';

const PRESET_SWATCHES = [
  '#d97706', // Amber
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#eab308', // Gold
  '#ec4899', // Pink
];

const TAG_CATEGORIES: TagDefinition['category'][] = [
  'genre',
  'archetype',
  'tone',
  'mechanic',
  'world',
  'custom',
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
  } = useStore();

  // Search & Filter states
  const [themeSearch, setThemeSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Theme Editor state
  const [editingThemeId, setEditingThemeId] = useState<string | null>(activeTheme.id);
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [themeDraft, setThemeDraft] = useState<Omit<ContextTheme, 'id'>>({
    name: activeTheme.name,
    color: activeTheme.color,
    aiContextPrompt: activeTheme.aiContextPrompt,
    associatedTags: activeTheme.associatedTags,
  });

  // Tag Editor state
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState<Omit<TagDefinition, 'id'>>({
    name: '',
    color: '#8b5cf6',
    category: 'genre',
    aiContextDescription: '',
  });

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

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return tags.filter((tag) => {
      const matchesCat =
        selectedCategory === 'all' || tag.category === selectedCategory;
      const matchesQuery =
        !q ||
        tag.name.toLowerCase().includes(q) ||
        tag.aiContextDescription.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [tags, tagSearch, selectedCategory]);

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

  // Tag CRUD handlers
  const handleStartNewTag = () => {
    setIsCreatingTag(true);
    setEditingTagId(null);
    setTagDraft({
      name: '',
      color: activeTheme.color,
      category: 'genre',
      aiContextDescription: '',
    });
  };

  const handleSelectTagForEdit = (tag: TagDefinition) => {
    setIsCreatingTag(false);
    setEditingTagId(tag.id);
    setTagDraft({
      name: tag.name,
      color: tag.color,
      category: tag.category,
      aiContextDescription: tag.aiContextDescription,
    });
  };

  const handleSaveTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tagDraft.name.trim();
    if (!cleanName) return;

    if (isCreatingTag) {
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}`,
        name: cleanName,
        color: tagDraft.color,
        category: tagDraft.category,
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
                aiContextDescription: tagDraft.aiContextDescription.trim(),
              }
            : t
        )
      );
      // If tag name changed, sync references in themes and character
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
            character.tags.map((tName) => (tName === oldTag.name ? cleanName : tName))
          );
        }
      }
      setEditingTagId(null);
    }
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
              Context Themes & Global Tag Library
            </h1>
            <Tooltip
              position="right"
              title="Dual-Layer Context System"
              content="Context Themes govern both the UI accent color (--theme-accent) and the system-level AI instructions injected when generating or autocompleting Character and Lorebook fields."
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure overarching AI worldbuilding directives, workspace accent colors, and semantic tags.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleStartNewTheme}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" style={{ color: 'var(--theme-accent)' }} />
            <span>New Context Theme</span>
          </button>
          <button
            type="button"
            onClick={handleStartNewTag}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" style={{ color: 'var(--theme-accent)' }} />
            <span>New Tag</span>
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
          style={{ borderColor: 'color-mix(in srgb, var(--theme-accent) 35%, transparent)' }}
          className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-4 min-w-0"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} />
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
                      setThemeDraft((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="h-8 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-800 bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={themeDraft.color}
                    onChange={(e) =>
                      setThemeDraft((prev) => ({ ...prev, color: e.target.value }))
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Associated Genre & Tone Tags</span>
                  <Tooltip content="Select tags from the Global Tag Library to automatically attach their AI context rules whenever this theme is active." />
                </label>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {themeDraft.associatedTags.length} selected
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {tags.map((tag) => {
                  const selected = themeDraft.associatedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTagInThemeDraft(tag.name)}
                      style={
                        selected
                          ? {
                              borderColor: tag.color,
                              backgroundColor: `color-mix(in srgb, ${tag.color} 14%, transparent)`,
                            }
                          : undefined
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>

          {/* Live Synthesized AI Context Prompt Preview */}
          <div
            style={{ borderColor: 'color-mix(in srgb, var(--theme-accent) 35%, transparent)' }}
            className="rounded-xl border bg-slate-50/70 dark:bg-slate-900/50 p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Active AI Context System Prompt Preview ({activeTheme.name})
                </span>
              </div>
              <Tooltip content="This synthesized context block is automatically prepended to AI generation and inline ghost-text requests." />
            </div>
            <pre className="font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3">
              {compiledContextPreview}
            </pre>
          </div>
        </div>
      </div>

      {/* Section 2: Global Tag Library CRUD */}
      <div
        style={{ borderColor: 'color-mix(in srgb, var(--theme-accent) 35%, transparent)' }}
        className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <TagIcon className="h-4 w-4" style={{ color: 'var(--theme-accent)' }} />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Global Tag Library ({tags.length})
            </h2>
            <Tooltip
              title="Semantic AI Context Tags"
              content="Unlike plain text labels, each Tag in TavernSmith carries an AI Context Description so the LLM understands how that tag should shape character behavior or lore entries."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags..."
                className="theme-focus-ring rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            {/* Category Segmented Filter */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All
              </button>
              {TAG_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Inline Tag Create / Edit Drawer */}
        {(isCreatingTag || editingTagId) && (
          <form
            onSubmit={handleSaveTag}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="rounded-lg border bg-slate-50 dark:bg-slate-950 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {isCreatingTag ? 'Create Semantic Tag' : 'Edit Semantic Tag'}
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

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
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
                  placeholder="e.g., Eldritch, Tsundere..."
                  className="theme-focus-ring w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Category
                </label>
                <select
                  value={tagDraft.category}
                  onChange={(e) =>
                    setTagDraft((prev) => ({
                      ...prev,
                      category: e.target.value as TagDefinition['category'],
                    }))
                  }
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
                      setTagDraft((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="h-7 w-9 cursor-pointer rounded border border-slate-200 dark:border-slate-800 bg-transparent"
                  />
                  <input
                    type="text"
                    value={tagDraft.color}
                    onChange={(e) =>
                      setTagDraft((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="font-mono w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs uppercase text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-end justify-end gap-2">
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
                AI Context Directive (Injected when tag is active on Character or Theme)
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
          </form>
        )}

        {/* High-Density Tag Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">Tag</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">AI Context Directive</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 text-xs">
              {filteredTags.map((tag) => (
                <tr
                  key={tag.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: tag.color }}
                        className="h-3 w-3 rounded-xs shrink-0"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {tag.name}
                      </span>
                    </div>
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
                        title="Edit Tag"
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
              ))}
              {filteredTags.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-xs text-slate-400 dark:text-slate-500"
                  >
                    No tags match your current filter. Click &ldquo;New Tag&rdquo; to add one.
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
