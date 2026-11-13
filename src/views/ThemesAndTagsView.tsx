import React, { useState, useMemo } from 'react';
import {
  Palette,
  Plus,
  Trash2,
  Check,
  Tag,
  Search,
  RotateCcw,
  Sparkles,
  Loader2,
  AlertTriangle,
  X,
  Edit3,
  ShieldAlert,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import {
  DEFAULT_CONTEXT_THEMES,
  DEFAULT_TAGS,
  isTagNsfwFlagged,
  mergeWithDefaultTags,
  useStore,
} from '../context/StoreContext';
import { ContextTheme, TagCategory, TagDefinition } from '../types';
import { SmartEditor } from '../components/SmartEditor';
import { Tooltip } from '../components/Tooltip';
import { isTagNsfw, TagSelector } from '../components/TagSelector';
import { AIServiceError, generateCompletionDetailed } from '../services/aiService';

const TAG_CATEGORIES: { value: TagCategory; label: string }[] = [
  { value: 'Setting & Vibe', label: 'Setting & Vibe' },
  { value: 'Narrative & Meta', label: 'Narrative & Meta' },
  { value: 'Rating', label: 'Rating' },
  { value: 'Archetype', label: 'Archetype' },
  { value: 'Body & Attire', label: 'Body & Attire' },
  { value: 'NSFW & Kinks', label: 'NSFW & Kinks' },
  { value: 'Extreme & Hentai Physics', label: 'Extreme & Hentai Physics' },
  { value: 'Genre & Setting', label: 'Genre & Setting' },
  { value: 'Personality & Archetype', label: 'Personality & Archetype' },
  { value: 'Relationship & Role', label: 'Relationship & Role' },
  { value: 'Tone & Style', label: 'Tone & Style' },
  { value: 'Custom', label: 'Custom' },
];

const QUICK_SWATCHES = [
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
];

export const ThemesAndTagsView: React.FC = () => {
  const {
    themes,
    setThemes,
    activeTheme,
    setActiveThemeId,
    tags,
    setTags,
    aiConfig,
    settings,
    setActiveTab,
  } = useStore();

  // Context Theme Creation State
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeColor, setNewThemeColor] = useState('#ec4899');
  const [newThemePrompt, setNewThemePrompt] = useState('');
  const [newThemeTags, setNewThemeTags] = useState<string[]>([]);
  const [generatingThemeMode, setGeneratingThemeMode] = useState<
    'new' | 'active' | null
  >(null);
  const [themeAiError, setThemeAiError] = useState<string | null>(null);

  // Streamlined Quick-Creator Bar State for Tags
  const [quickTagName, setQuickTagName] = useState('');
  const [quickTagColor, setQuickTagColor] = useState('#a855f7');
  const [quickTagCategory, setQuickTagCategory] =
    useState<TagCategory>('Setting & Vibe');
  const [quickTagIsNsfw, setQuickTagIsNsfw] = useState(false);
  const [quickTagAiDesc, setQuickTagAiDesc] = useState('');
  const [generatingQuickTagDesc, setGeneratingQuickTagDesc] = useState(false);
  const [quickTagFeedback, setQuickTagFeedback] = useState<string | null>(null);

  // Tag Grid Filter & Search State
  const [tagSearch, setTagSearch] = useState('');
  const [safetyFilter, setSafetyFilter] = useState<'all' | 'sfw' | 'nsfw'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [resetConfirm, setResetConfirm] = useState(false);

  // Focused Edit Tag Modal State
  const [editingTag, setEditingTag] = useState<TagDefinition | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagCategory, setEditTagCategory] =
    useState<TagCategory>('Genre & Setting');
  const [editTagColor, setEditTagColor] = useState('#a855f7');
  const [editTagIsNsfw, setEditTagIsNsfw] = useState(false);
  const [editTagAiDesc, setEditTagAiDesc] = useState('');
  const [generatingEditTagDesc, setGeneratingEditTagDesc] = useState(false);

  const hideNsfw = Boolean(settings.hideNsfwTags);

  const handleUpdateActiveTheme = (partial: Partial<ContextTheme>) => {
    setThemes((prev) =>
      prev.map((t) => (t.id === activeTheme.id ? { ...t, ...partial } : t))
    );
  };

  const handleCreateTheme = () => {
    if (!newThemeName.trim()) return;
    const created: ContextTheme = {
      id: `theme-${Date.now()}`,
      name: newThemeName.trim(),
      color: newThemeColor,
      aiContextPrompt:
        newThemePrompt.trim() ||
        `Write in a compelling ${newThemeName.trim()} style with strong atmospheric detail.`,
      associatedTags: newThemeTags,
      isBuiltIn: false,
    };
    setThemes((prev) => [...prev, created]);
    setActiveThemeId(created.id);
    setNewThemeName('');
    setNewThemePrompt('');
    setNewThemeTags([]);
  };

  const handleDeleteTheme = (id: string) => {
    if (themes.length <= 1) return;
    const filtered = themes.filter((t) => t.id !== id);
    setThemes(filtered);
    if (activeTheme.id === id) {
      setActiveThemeId(filtered[0].id);
    }
  };

  const handleGenerateThemeWithAI = async (mode: 'new' | 'active') => {
    const targetName =
      mode === 'new' ? newThemeName.trim() : activeTheme.name.trim();
    const targetTags =
      mode === 'new' ? newThemeTags : activeTheme.associatedTags || [];

    if (!targetName) {
      setThemeAiError('Enter a Theme Name first so the AI knows what genre or atmosphere to synthesize.');
      return;
    }

    setGeneratingThemeMode(mode);
    setThemeAiError(null);

    const attachedTagDetails = targetTags
      .map((tagName) => {
        const found = tags.find(
          (t) => t.name.toLowerCase() === tagName.toLowerCase()
        );
        const desc =
          found?.aiContextDescription ||
          found?.aiDescription ||
          found?.description ||
          '';
        return found ? `- [${found.name}]: ${desc}` : `- [${tagName}]`;
      })
      .join('\n');

    const systemPrompt = [
      'You are an expert SillyTavern prompt engineer and narrative director.',
      'Write a rich, authoritative Context Theme AI Instruction Block (2 to 4 sentences) that instructs an AI writer on the exact tone, vocabulary, sensory atmosphere, and pacing to use when generating character cards and lorebooks under this theme.',
      'Return ONLY the instruction paragraph itself with no markdown headers or introductory chatter.',
    ].join('\n');

    const userPrompt = [
      `Context Theme Name: "${targetName}"`,
      attachedTagDetails
        ? `Associated Semantic Tags:\n${attachedTagDetails}`
        : 'No specific tags attached yet; infer the strongest matching genre & stylistic conventions from the theme name.',
      '\nWrite the overarching Context Theme AI Instruction Prompt now:',
    ].join('\n\n');

    try {
      const res = await generateCompletionDetailed(
        userPrompt,
        systemPrompt,
        aiConfig
      );
      const cleaned = res.content.trim();
      if (cleaned) {
        if (mode === 'new') {
          setNewThemePrompt(cleaned);
        } else {
          handleUpdateActiveTheme({ aiContextPrompt: cleaned });
        }
      }
    } catch (err) {
      setThemeAiError(
        err instanceof AIServiceError
          ? `${err.message} (${err.corsHint})`
          : err instanceof Error
            ? err.message
            : 'Failed to generate theme instructions.'
      );
    } finally {
      setGeneratingThemeMode(null);
    }
  };

  /**
   * AI Auto-Write Description from Tag Name (works with connected AI backend or smart local synthesis fallback)
   */
  const synthesizeTagDescription = async (
    tagName: string,
    category: TagCategory,
    isNsfwFlag: boolean
  ): Promise<string> => {
    const clean = tagName.trim();
    if (!clean) return '';

    const sys = [
      'You are a SillyTavern character & lorebook prompt engineer.',
      'Write a concise 1-to-2 sentence AI Context Directive explaining how the AI should adjust characterization, tone, or imagery when this tag is attached.',
      'Return ONLY the directive sentence(s) with no quotes or preamble.',
    ].join('\n');

    const usr = `Tag Name: "${clean}"\nCategory: ${category}\nRating: ${
      isNsfwFlag ? 'NSFW (18+ Adult)' : 'SFW / General'
    }\nWrite the AI Context Description:`;

    try {
      const res = await generateCompletionDetailed(usr, sys, aiConfig);
      if (res.content && res.content.trim()) {
        return res.content.trim();
      }
    } catch {
      // Fallback to instant smart template if offline / local server not running
    }

    if (isNsfwFlag) {
      return `Explicit 18+ directive for "${clean}" (${category}): emphasize vivid, uncensored sensory detail, physical chemistry, and authentic adult characterization matching "${clean}".`;
    }
    return `Incorporate authentic "${clean}" (${category}) themes, dialogue nuances, and atmospheric storytelling details throughout character responses and world lore.`;
  };

  const handleAutoWriteQuickTagDesc = async () => {
    const clean = quickTagName.trim();
    if (!clean) {
      setQuickTagFeedback('Type a Tag Name first to auto-write its AI description.');
      window.setTimeout(() => setQuickTagFeedback(null), 3500);
      return;
    }
    setGeneratingQuickTagDesc(true);
    try {
      const generated = await synthesizeTagDescription(
        clean,
        quickTagCategory,
        quickTagIsNsfw
      );
      setQuickTagAiDesc(generated);
    } finally {
      setGeneratingQuickTagDesc(false);
    }
  };

  const handleAutoWriteEditTagDesc = async () => {
    const clean = editTagName.trim();
    if (!clean) return;
    setGeneratingEditTagDesc(true);
    try {
      const generated = await synthesizeTagDescription(
        clean,
        editTagCategory,
        editTagIsNsfw
      );
      setEditTagAiDesc(generated);
    } finally {
      setGeneratingEditTagDesc(false);
    }
  };

  const handleCreateQuickTag = () => {
    const clean = quickTagName.trim();
    if (!clean) return;

    const existing = tags.find(
      (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
    );
    const desc =
      quickTagAiDesc.trim() ||
      (quickTagIsNsfw
        ? `Explicit 18+ directive for "${clean}": incorporate vivid sensory and thematic elements consistent with "${clean}".`
        : `Incorporate thematic, tonal, and character elements consistent with "${clean}".`);

    if (existing) {
      setTags((prev) =>
        prev.map((t) =>
          t.id === existing.id
            ? {
                ...t,
                color: quickTagColor,
                category: quickTagCategory,
                isNsfw: quickTagIsNsfw,
                aiContextDescription: desc,
                aiDescription: desc,
              }
            : t
        )
      );
      setQuickTagFeedback(`Updated existing tag "${clean}".`);
    } else {
      const created: TagDefinition = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        color: quickTagColor,
        category: quickTagCategory,
        isNsfw: quickTagIsNsfw,
        aiContextDescription: desc,
        aiDescription: desc,
      };
      setTags((prev) => [created, ...prev]);
      setQuickTagFeedback(`Created tag "${clean}" (${quickTagIsNsfw ? 'NSFW 18+' : 'SFW'}).`);
    }

    setQuickTagName('');
    setQuickTagAiDesc('');
    window.setTimeout(() => setQuickTagFeedback(null), 3500);
  };

  // 1-Click Toggle NSFW Flag directly on any Tag Card
  const handleToggleTagNsfwDirect = (
    e: React.MouseEvent,
    tagId: string
  ) => {
    e.stopPropagation();
    setTags((prev) =>
      prev.map((t) =>
        t.id === tagId ? { ...t, isNsfw: !isTagNsfwFlagged(t) } : t
      )
    );
  };

  const handleOpenEditModal = (tag: TagDefinition) => {
    setEditingTag(tag);
    setEditTagName(tag.name);
    setEditTagCategory(tag.category || 'Custom');
    setEditTagColor(tag.color || '#a855f7');
    setEditTagIsNsfw(isTagNsfwFlagged(tag));
    setEditTagAiDesc(
      tag.aiContextDescription || tag.aiDescription || tag.description || ''
    );
  };

  const handleSaveEditModal = () => {
    if (!editingTag) return;
    const cleanName = editTagName.trim();
    if (!cleanName) return;
    const cleanDesc =
      editTagAiDesc.trim() ||
      `Incorporate thematic, tonal, and character elements consistent with "${cleanName}".`;

    setTags((prev) =>
      prev.map((t) =>
        t.id === editingTag.id
          ? {
              ...t,
              name: cleanName,
              category: editTagCategory,
              color: editTagColor,
              isNsfw: editTagIsNsfw,
              aiContextDescription: cleanDesc,
              aiDescription: cleanDesc,
            }
          : t
      )
    );
    setEditingTag(null);
  };

  const handleDeleteTag = (id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    if (editingTag?.id === id) {
      setEditingTag(null);
    }
  };

  const handleResetBuiltInTags = () => {
    setTags((prev) => mergeWithDefaultTags(prev));
    setResetConfirm(false);
  };

  const availableCategories = useMemo(() => {
    const visiblePool = hideNsfw ? tags.filter((t) => !isTagNsfw(t)) : tags;
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
      if (visiblePool.some((t) => t.category === p)) {
        set.add(p);
      }
    }
    for (const c of TAG_CATEGORIES) {
      if (visiblePool.some((t) => t.category === c.value)) {
        set.add(c.value);
      }
    }
    for (const t of visiblePool) {
      if (t.category) set.add(t.category);
    }
    return ['All', ...Array.from(set)];
  }, [tags, hideNsfw]);

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return tags.filter((t) => {
      const nsfw = isTagNsfw(t);
      if (hideNsfw && nsfw) return false;
      if (safetyFilter === 'sfw' && nsfw) return false;
      if (safetyFilter === 'nsfw' && !nsfw) return false;
      if (categoryFilter !== 'All' && t.category !== categoryFilter) {
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
        (t.category || '').toLowerCase().includes(q) ||
        desc.includes(q)
      );
    });
  }, [tags, hideNsfw, safetyFilter, categoryFilter, tagSearch]);

  // Group filtered tags by category for clean visual browsing
  const groupedTags = useMemo(() => {
    const groups = new Map<string, TagDefinition[]>();
    for (const t of filteredTags) {
      const cat = t.category || 'Custom';
      const list = groups.get(cat) || [];
      list.push(t);
      groups.set(cat, list);
    }
    return Array.from(groups.entries());
  }, [filteredTags]);

  const totalNsfwCount = useMemo(
    () => tags.filter((t) => isTagNsfw(t)).length,
    [tags]
  );
  const totalSfwCount = tags.length - totalNsfwCount;

  return (
    <div className="space-y-8 min-w-0 w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Themes &amp; Tags
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Manage writing themes and character/lorebook tags ({tags.length} total: {totalSfwCount} SFW · {totalNsfwCount} NSFW 18+). Tags marked NSFW automatically mark any card or lorebook using them.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hideNsfw && (
            <button
              type="button"
              onClick={() => setActiveTab('options')}
              title="NSFW Content is currently hidden. Click to open Options (⚙️) to change visibility."
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>NSFW Hidden in Options (⚙️)</span>
            </button>
          )}

          {resetConfirm ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1">
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-300">
                Restore {DEFAULT_TAGS.length} built-in tags?
              </span>
              <button
                type="button"
                onClick={handleResetBuiltInTags}
                className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white cursor-pointer"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setResetConfirm(false)}
                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restore Built-In Tags ({DEFAULT_TAGS.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PART 1: STREAMLINED TAG QUICK-CREATOR BAR & INTERACTIVE TAG STUDIO     */}
      {/* ===================================================================== */}
      <section className="space-y-4">
        {/* Streamlined Quick-Creator Bar at the Top */}
        <div
          style={{ borderColor: 'var(--theme-accent)' }}
          className="rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Create or Update a Tag
              </h2>
              <Tooltip content="Type a tag name, pick a category and color, mark it NSFW if it's 18+, and let AI write the description if you want." />
            </div>
            {quickTagFeedback && (
              <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                {quickTagFeedback}
              </span>
            )}
          </div>

          {/* Row 1: Tag Name + Category Dropdown + 1-Click NSFW Flag Switch + Color Swatch */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Tag Name */}
            <div className="md:col-span-4 space-y-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tag Name
              </label>
              <input
                type="text"
                value={quickTagName}
                onChange={(e) => setQuickTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateQuickTag();
                  }
                }}
                placeholder="e.g., Cyberpunk Noir, Enemies to Lovers, Breeding..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            {/* Category Dropdown */}
            <div className="md:col-span-3 space-y-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Category
              </label>
              <select
                aria-label="Tag Category"
                value={quickTagCategory}
                onChange={(e) => {
                  const nextCat = e.target.value as TagCategory;
                  setQuickTagCategory(nextCat);
                  if (
                    nextCat === 'NSFW & Kinks' ||
                    nextCat === 'Extreme & Hentai Physics'
                  ) {
                    setQuickTagIsNsfw(true);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {TAG_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 1-Click NSFW Flag Switch */}
            <div className="md:col-span-2 space-y-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Rating
              </label>
              <button
                type="button"
                onClick={() => setQuickTagIsNsfw((prev) => !prev)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer transition-all ${
                  quickTagIsNsfw
                    ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300 shadow-2xs'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {quickTagIsNsfw ? (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>🔞 NSFW (18+)</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>SFW Tag</span>
                  </>
                )}
              </button>
            </div>

            {/* Color Swatch Picker + Presets */}
            <div className="md:col-span-3 space-y-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tag Accent Color
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1.5">
                <input
                  type="color"
                  aria-label="Tag Accent Color"
                  value={quickTagColor}
                  onChange={(e) => setQuickTagColor(e.target.value)}
                  className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent shrink-0"
                />
                <div className="flex items-center gap-1 overflow-x-auto">
                  {QUICK_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setQuickTagColor(swatch)}
                      title={`Select color ${swatch}`}
                      style={{ backgroundColor: swatch }}
                      className={`h-4 w-4 rounded-full cursor-pointer transition-transform ${
                        quickTagColor.toLowerCase() === swatch.toLowerCase()
                          ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110'
                          : 'opacity-75 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: AI Context Description + Auto-Write Button + Create Button */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={quickTagAiDesc}
                onChange={(e) => setQuickTagAiDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateQuickTag();
                  }
                }}
                placeholder="Tag description (tells the AI what this tag means when writing your card or lorebook)..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={generatingQuickTagDesc}
                onClick={() => void handleAutoWriteQuickTagDesc()}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer disabled:opacity-50"
              >
                {generatingQuickTagDesc ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                ) : (
                  <Sparkles
                    className="h-3.5 w-3.5"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                )}
                <span>✨ Auto-Write Description</span>
              </button>

              <button
                type="button"
                onClick={handleCreateQuickTag}
                disabled={!quickTagName.trim()}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Tag</span>
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Tag Grid Toolbar: Search + Safety Filter (`All`, `SFW Only`, `NSFW Flagged`) + Category Pills */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder={`Search ${filteredTags.length} tags by name, category, or description...`}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              {tagSearch && (
                <button
                  type="button"
                  onClick={() => setTagSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Rating Filter Pills (`All`, `SFW Only`, `NSFW Flagged`) */}
            {!hideNsfw && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => setSafetyFilter('all')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    safetyFilter === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({tags.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSafetyFilter('sfw')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    safetyFilter === 'sfw'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  SFW Only ({totalSfwCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSafetyFilter('nsfw')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    safetyFilter === 'nsfw'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🔞 NSFW Flagged ({totalNsfwCount})
                </button>
              </div>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {availableCategories.map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  style={
                    active
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 15%, transparent)',
                        }
                      : undefined
                  }
                  className={`rounded-lg border px-3 py-1 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Grouped Clean Interactive Tag Cards Grid */}
          {groupedTags.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
              No tags match that filter. Try clearing your search or switching categories.
            </div>
          ) : (
            <div className="space-y-5 max-h-[600px] overflow-y-auto pr-1">
              {groupedTags.map(([categoryName, categoryTags]) => (
                <div key={categoryName} className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-1.5">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {categoryName}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {categoryTags.length} tag{categoryTags.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {categoryTags.map((tag) => {
                      const nsfw = isTagNsfw(tag);
                      const desc =
                        tag.aiContextDescription ||
                        tag.aiDescription ||
                        tag.description ||
                        '';

                      return (
                        <div
                          key={tag.id}
                          onClick={() => handleOpenEditModal(tag)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenEditModal(tag);
                            }
                          }}
                          style={{
                            borderColor: `color-mix(in srgb, ${tag.color} 40%, transparent)`,
                          }}
                          className="group flex flex-col justify-between rounded-xl border bg-slate-50/70 dark:bg-slate-950/60 p-3 hover:bg-white dark:hover:bg-slate-900 transition-all cursor-pointer shadow-2xs"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: tag.color }}
                                />
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {tag.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* 1-Click Direct NSFW Toggle Pill */}
                                <button
                                  type="button"
                                  onClick={(e) =>
                                    handleToggleTagNsfwDirect(e, tag.id)
                                  }
                                  title={
                                    nsfw
                                      ? 'Flagged NSFW (18+). Click to switch to SFW.'
                                      : 'Currently SFW. Click to flag as NSFW (18+).'
                                  }
                                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase transition-colors cursor-pointer ${
                                    nsfw
                                      ? 'border border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/25'
                                      : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                  }`}
                                >
                                  {nsfw ? '🔞 NSFW' : 'SFW'}
                                </button>

                                <span className="rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Edit3 className="h-3 w-3" />
                                </span>
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                              {desc || 'Click to add AI notes for this tag...'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* PART 2: CONTEXT THEMES STUDIO                                         */}
      {/* ===================================================================== */}
      <section
        style={{
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
        }}
        className="grid gap-6 items-start"
      >
        {/* Left Column: Active Context Theme Customizer */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
          }}
          className="rounded-2xl border bg-white dark:bg-slate-900 p-5 space-y-4 min-w-0"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Themes ({themes.length})
              </h2>
              <Tooltip content="Pick or customize a theme. Its style notes and default tags guide the AI whenever you generate or edit text." />
            </div>
          </div>

          {/* Theme Selector Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {themes.map((theme) => {
              const isSelected = theme.id === activeTheme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => setActiveThemeId(theme.id)}
                  style={
                    isSelected ? { borderColor: theme.color } : undefined
                  }
                  className={`theme-hover-outline group relative flex flex-col justify-between rounded-xl border p-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-950 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {theme.name}
                      </span>
                    </div>
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: theme.color }}
                      />
                    )}
                    {!theme.isBuiltIn && themes.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTheme(theme.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                    {theme.aiContextPrompt}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Active Theme Editor */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Editing Theme: {activeTheme.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={generatingThemeMode !== null}
                  onClick={() => void handleGenerateThemeWithAI('active')}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100 cursor-pointer disabled:opacity-50"
                >
                  {generatingThemeMode === 'active' ? (
                    <Loader2
                      className="h-3 w-3 animate-spin"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                  ) : (
                    <Sparkles
                      className="h-3 w-3"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                  )}
                  <span>✨ Write Prompt with AI</span>
                </button>
                <label className="text-[11px] text-slate-500">Accent:</label>
                <input
                  type="color"
                  aria-label="Active Theme Accent Color"
                  value={activeTheme.color}
                  onChange={(e) =>
                    handleUpdateActiveTheme({ color: e.target.value })
                  }
                  className="h-6 w-8 cursor-pointer rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                />
              </div>
            </div>

            <SmartEditor
              label="Theme Style Prompt"
              fieldKey="theme_ai_context_prompt"
              value={activeTheme.aiContextPrompt}
              onChange={(val) =>
                handleUpdateActiveTheme({ aiContextPrompt: val })
              }
              rows={3}
              tooltip="Sent to the AI whenever this theme is selected so your cards and lore match this vibe."
            />

            <TagSelector
              selectedTags={activeTheme.associatedTags || []}
              onChange={(nextTags) =>
                handleUpdateActiveTheme({ associatedTags: nextTags })
              }
              title="Theme Default Tags"
              subtitle="Tags included automatically whenever this theme is active"
              tooltip="Attach default tags to guide AI writing for this theme."
              compact
            />
          </div>
        </div>

        {/* Right Column: Create New Context Theme */}
        <div
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
          }}
          className="rounded-2xl border bg-white dark:bg-slate-900 p-5 space-y-4 min-w-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Create Custom Theme
            </h3>
            <button
              type="button"
              disabled={generatingThemeMode !== null}
              onClick={() => void handleGenerateThemeWithAI('new')}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer disabled:opacity-50"
            >
              {generatingThemeMode === 'new' ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  style={{ color: 'var(--theme-accent)' }}
                />
              ) : (
                <Sparkles
                  className="h-3.5 w-3.5"
                  style={{ color: 'var(--theme-accent)' }}
                />
              )}
              <span>✨ Generate from Name &amp; Tags</span>
            </button>
          </div>

          {themeAiError && (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-400">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{themeAiError}</span>
              </div>
              <button
                type="button"
                onClick={() => setThemeAiError(null)}
                className="text-[11px] underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <input
                type="text"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                placeholder="Theme Name (e.g., Space Opera, Cozy Tavern, Dark Romance)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="New Theme Accent Color"
                value={newThemeColor}
                onChange={(e) => setNewThemeColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-slate-200 dark:border-slate-800 bg-transparent"
              />
              <span className="font-mono text-xs text-slate-500">
                {newThemeColor}
              </span>
            </div>
          </div>

          <TagSelector
            selectedTags={newThemeTags}
            onChange={setNewThemeTags}
            title="Tags for This Theme"
            tooltip="Pick tags for your theme, then click '✨ Generate from Name & Tags' above to draft the style prompt."
            compact
          />

          <textarea
            value={newThemePrompt}
            onChange={(e) => setNewThemePrompt(e.target.value)}
            rows={3}
            placeholder="Style instructions for this theme (or click ✨ Generate above)..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white focus:outline-none"
          />

          <button
            type="button"
            onClick={handleCreateTheme}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Theme</span>
          </button>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* FOCUSED EDIT TAG MODAL                                                */}
      {/* ===================================================================== */}
      {editingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div
            style={{ borderColor: editTagColor || 'var(--theme-accent)' }}
            className="w-full max-w-lg rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="h-3.5 w-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: editTagColor }}
                />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Edit Tag: {editingTag.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTag(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Tag Name
                </label>
                <input
                  type="text"
                  value={editTagName}
                  onChange={(e) => setEditTagName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Category
                </label>
                <select
                  aria-label="Edit Tag Category"
                  value={editTagCategory}
                  onChange={(e) =>
                    setEditTagCategory(e.target.value as TagCategory)
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {TAG_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Rating
                </label>
                <button
                  type="button"
                  onClick={() => setEditTagIsNsfw((prev) => !prev)}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer transition-all ${
                    editTagIsNsfw
                      ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {editTagIsNsfw ? (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>🔞 Flagged NSFW (18+)</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>SFW / All-Ages</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Tag Color
                </label>
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5">
                  <input
                    type="color"
                    aria-label="Edit Tag Color"
                    value={editTagColor}
                    onChange={(e) => setEditTagColor(e.target.value)}
                    className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent shrink-0"
                  />
                  <div className="flex items-center gap-1">
                    {QUICK_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setEditTagColor(swatch)}
                        style={{ backgroundColor: swatch }}
                        className="h-4 w-4 rounded-full cursor-pointer"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  AI Tag Notes
                </label>
                <button
                  type="button"
                  disabled={generatingEditTagDesc}
                  onClick={() => void handleAutoWriteEditTagDesc()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-400 cursor-pointer disabled:opacity-50"
                >
                  {generatingEditTagDesc ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span>✨ Auto-Write Description</span>
                </button>
              </div>
              <textarea
                value={editTagAiDesc}
                onChange={(e) => setEditTagAiDesc(e.target.value)}
                rows={3}
                placeholder="Describe how the AI should adjust tone, style, or characterization when this tag is attached..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleDeleteTag(editingTag.id)}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Tag</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTag(null)}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditModal}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Tag Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
