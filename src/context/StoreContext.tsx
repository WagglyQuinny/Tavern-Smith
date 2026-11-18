import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  AppSettings,
  AIBackendConfig,
  AIPresetId,
  CharacterCardData,
  CharacterTabDraft,
  ContextTheme,
  DiskStateResponse,
  InspectorTabDraft,
  Lorebook,
  LorebookTabDraft,
  NameConflictRequest,
  PendingDeleteTarget,
  SavedFileEntry,
  SmartEditorFieldDraft,
  StatBlockConfig,
  TagCategory,
  TagDefinition,
  TavernSmithMetaPayload,
  ThemesTagsTabDraft,
  TokenBreakdown,
  WorkspaceDraftCache,
  WorkspaceTab,
} from '../types';
import { calculateCardTokenBreakdown } from '../utils/tokenCounter';
import {
  importCardFromFile,
  normalizeLorebookObject,
  parseImportedJsonString,
  sanitizeFilename,
  serializeCharacterCard,
  serializeLorebookCard,
  triggerBrowserDownload,
} from '../utils/cardIO';
import {
  AI_BACKEND_PRESETS,
  buildMergedGeminiModelList,
  ConnectionTestResult,
  GEMINI_PRIORITY_MODELS,
  getProviderKeyId,
  isDeprecatedGeminiModel,
  testBackendConnection,
} from '../services/aiService';
import {
  decryptProviderKeysFromVault,
  encryptAndSaveProviderKeys,
  getInMemoryDecryptedKeys,
  loadProviderModelsMap,
  readEncryptedVaultEnvelope,
  registerVaultDiskFlushCallback,
  saveProviderModelsMap,
  setInMemoryVaultEnvelope,
  VAULT_FILENAME,
} from '../utils/cryptoVault';
import {
  migrateLegacyTagCategory,
  sortTagsByContextOrder,
} from '../utils/tagOrder';

export { VAULT_FILENAME };
export const META_FILENAME = '_tavernsmith_meta.json';
export const UNIFIED_INTERNAL_ROOT = './Saves/';
const TAB_DRAFT_SESSION_KEY = 'tavernsmith_tab_draft_cache_v2';

export const DEFAULT_CHARACTER_TAB_DRAFT: CharacterTabDraft = {
  rosterOpen: true,
  rosterSearch: '',
  rosterTagFilter: 'all',
  rosterSort: 'modified_desc',
  newCustomTagInput: '',
  statBlockExpanded: false,
  reactionsExpanded: false,
  wizardStep: 1,
  conceptPrompt: '',
  activeGreetingIdx: 0,
  altGreetingTwist: '',
  extraContextImages: [],
};

export const DEFAULT_LOREBOOK_TAB_DRAFT: LorebookTabDraft = {
  rosterOpen: true,
  rosterSearch: '',
  rosterTagFilter: 'all',
  rosterSort: 'modified_desc',
  newCustomTagInput: '',
  wizardStep: 1,
  worldConceptPrompt: '',
  entryDraftPrompt: '',
  entrySearch: '',
  entryTagFilter: 'all',
  selectedEntryId: null,
  primaryKeyInput: '',
  secondaryKeyInput: '',
  extraContextImages: [],
  loreTempRefImageUrl: null,
  loreTempRefImageName: '',
};

export const DEFAULT_THEMES_TAGS_TAB_DRAFT: ThemesTagsTabDraft = {
  quickTagName: '',
  quickTagColor: '#a855f7',
  quickTagCategory: 'Setting & Vibe',
  quickTagIsNsfw: false,
  quickTagAiDesc: '',
  tagSearch: '',
  safetyFilter: 'all',
  categoryFilter: 'All',
  editingTagId: null,
  editTagName: '',
  editTagCategory: 'Setting & Vibe',
  editTagColor: '#a855f7',
  editTagIsNsfw: false,
  editTagAiDesc: '',
};

export const DEFAULT_SMART_EDITOR_FIELD_DRAFT: SmartEditorFieldDraft = {
  showGenerateBar: false,
  customInstruction: '',
  assistMode: 'replace',
  ghostText: '',
  tempReferenceImageUrl: null,
  tempReferenceImageName: '',
};

export function createDefaultWorkspaceDraftCache(): WorkspaceDraftCache {
  return {
    character: { ...DEFAULT_CHARACTER_TAB_DRAFT },
    lorebook: { ...DEFAULT_LOREBOOK_TAB_DRAFT },
    themesTags: { ...DEFAULT_THEMES_TAGS_TAB_DRAFT },
    smartEditorDrafts: {},
  };
}

function loadWorkspaceDraftCacheFromSession(): WorkspaceDraftCache {
  const base = createDefaultWorkspaceDraftCache();
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return base;
    }
    const raw = window.sessionStorage.getItem(TAB_DRAFT_SESSION_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<WorkspaceDraftCache>;
    if (!parsed || typeof parsed !== 'object') return base;
    return {
      character: {
        ...DEFAULT_CHARACTER_TAB_DRAFT,
        ...(parsed.character || {}),
        extraContextImages: [],
      },
      lorebook: {
        ...DEFAULT_LOREBOOK_TAB_DRAFT,
        ...(parsed.lorebook || {}),
        extraContextImages: [],
        loreTempRefImageUrl: null,
        loreTempRefImageName: '',
      },
      themesTags: {
        ...DEFAULT_THEMES_TAGS_TAB_DRAFT,
        ...(parsed.themesTags || {}),
      },
      smartEditorDrafts:
        parsed.smartEditorDrafts && typeof parsed.smartEditorDrafts === 'object'
          ? parsed.smartEditorDrafts
          : {},
    };
  } catch {
    return base;
  }
}

function saveWorkspaceDraftCacheToSession(cache: WorkspaceDraftCache): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    const strippedSmartDrafts: Record<string, SmartEditorFieldDraft> = {};
    for (const [k, d] of Object.entries(cache.smartEditorDrafts)) {
      if (!d) continue;
      if (d.showGenerateBar || d.customInstruction || d.ghostText || d.assistMode !== 'replace') {
        strippedSmartDrafts[k] = {
          showGenerateBar: Boolean(d.showGenerateBar),
          customInstruction: d.customInstruction || '',
          assistMode: d.assistMode === 'append' ? 'append' : 'replace',
          ghostText: d.ghostText || '',
        };
      }
    }
    const serializable: WorkspaceDraftCache = {
      character: {
        ...cache.character,
        extraContextImages: [],
      },
      lorebook: {
        ...cache.lorebook,
        extraContextImages: [],
        loreTempRefImageUrl: null,
        loreTempRefImageName: '',
      },
      themesTags: cache.themesTags,
      smartEditorDrafts: strippedSmartDrafts,
    };
    window.sessionStorage.setItem(
      TAB_DRAFT_SESSION_KEY,
      JSON.stringify(serializable)
    );
  } catch {
    // Ignore storage quota or restricted context errors
  }
}

/**
 * Purges any previously registered Service Workers and browser CacheStorage entries
 * so the browser NEVER caches stale assets.
 */
export function purgeBrowserRuntimeCaches(): void {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.serviceWorker &&
      typeof navigator.serviceWorker.getRegistrations === 'function'
    ) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((r) => {
            try {
              void r.unregister();
            } catch {
              // Ignore individual unregister error
            }
          });
        })
        .catch(() => {
          // Ignore restricted ServiceWorker environment
        });
    }
  } catch {
    // Ignore synchronous SecurityError
  }

  try {
    if (
      typeof window !== 'undefined' &&
      window.caches &&
      typeof window.caches.keys === 'function'
    ) {
      window.caches
        .keys()
        .then((keys) => {
          keys.forEach((k) => {
            try {
              void window.caches.delete(k);
            } catch {
              // Ignore individual cache delete error
            }
          });
        })
        .catch(() => {
          // Ignore restricted CacheStorage environment
        });
    }
  } catch {
    // Ignore synchronous SecurityError
  }
}

const AUTO_TAG_PALETTE = [
  '#a855f7',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#3b82f6',
  '#eab308',
  '#14b8a6',
];

export const DEFAULT_CONTEXT_THEMES: ContextTheme[] = [
  {
    id: 'theme-basic',
    name: 'Basic',
    color: '#6366f1',
    aiContextPrompt:
      'Write clear, vivid, and engaging character definitions and lore that strictly follow the attached character tags and user instructions without imposing any unrequested genre flair.',
    associatedTags: [],
    isBuiltIn: true,
  },
];

function createBuiltInTag(
  id: string,
  name: string,
  color: string,
  category: TagDefinition['category'],
  description: string,
  isNsfw: boolean,
  _legacySubTags?: unknown
): TagDefinition {
  return {
    id,
    name,
    color,
    category,
    isNsfw,
    aiContextDescription: description,
    aiDescription: description,
    description,
  };
}

export const DEFAULT_TAGS: TagDefinition[] = [
  // A. Core Rating & Format Tags
  createBuiltInTag(
    'tag-sfw-all-ages',
    'SFW / All-Ages',
    '#10b981',
    'Rating',
    'Strictly Safe-For-Work narrative tone focusing on character drama, adventure, emotion, and clean romance without explicit adult content.',
    false,
    [
      {
        id: 'sub-sfw-wholesome',
        name: 'Wholesome & Cozy',
        aiDescription:
          'Warm, comforting, low-stakes slice-of-life atmosphere with gentle humor and emotional support.',
      },
      {
        id: 'sub-sfw-cinematic',
        name: 'Cinematic Action / Drama',
        aiDescription:
          'High-stakes narrative tension, vivid choreography, and dramatic dialogue.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-slow-burn',
    'Slow Burn',
    '#8b5cf6',
    'Rating',
    'Build romantic and intimate tension gradually through lingering touches, subtext, stolen glances, and emotional escalation.',
    false,
    [
      {
        id: 'sub-slowburn-pining',
        name: 'Mutual Pining',
        aiDescription:
          'Unspoken longing, hesitation, and electric closeness where neither side admits their feelings right away.',
      },
      {
        id: 'sub-slowburn-rivals',
        name: 'Rivals to Partners',
        aiDescription:
          'Competitive banter and reluctant respect slowly giving way to deep trust and attraction.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-nsfw-explicit-18',
    'NSFW / Explicit 18+',
    '#ef4444',
    'Rating',
    'Explicit 18+ adult content enabled. Do not censor or fade-to-black; use visceral, anatomically descriptive, and sensual language for intimate scenes.',
    true,
    [
      {
        id: 'sub-nsfw-uncensored',
        name: 'Uncensored Anatomy',
        aiDescription:
          'Use direct, explicit anatomical terminology and vivid sensory descriptions without euphemisms.',
      },
      {
        id: 'sub-nsfw-passionate',
        name: 'Sensual & Erotic',
        aiDescription:
          'Focus on heat, breath, skin-on-skin friction, and vocal reactions.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-smut-erp',
    'Smut / ERP Focused',
    '#f43f5e',
    'Rating',
    'Prioritize erotic roleplay tension, physical intimacy, sensory descriptions, and suggestive dialogue triggers.',
    true
  ),
  createBuiltInTag(
    'tag-vanilla-wholesome-nsfw',
    'Vanilla / Wholesome NSFW',
    '#ec4899',
    'Rating',
    'Passionate, affectionate, consensual intimacy focused on mutual pleasure, romance, and emotional connection.',
    true,
    [
      {
        id: 'sub-vanilla-handholding',
        name: 'Eye Contact & Kissing',
        aiDescription:
          'Deep kissing, intertwined fingers, whispered reassurances, and loving eye contact throughout intimacy.',
      },
    ]
  ),

  // B. Archetypes & Personalities (SFW & NSFW)
  createBuiltInTag(
    'tag-tsundere',
    'Tsundere',
    '#fb7185',
    'Archetype',
    'Prickly, flustered, and defensive on the outside, hiding deep affection and sensitivity underneath.',
    false,
    [
      {
        id: 'sub-tsun-classic',
        name: 'Baka / Blushing Denial',
        aiDescription:
          'Stammers, crosses arms, and denies obvious affection while blushing furiously.',
      },
      {
        id: 'sub-tsun-melted',
        name: 'Melted & Needy',
        aiDescription:
          'Drops the tough facade when alone with {{user}}, becoming clingy and soft.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-kuudere',
    'Kuudere',
    '#38bdf8',
    'Archetype',
    'Stoic, cool, and deadpan demeanor that cracks into quiet, intense devotion for {{user}}.',
    false,
    [
      {
        id: 'sub-kuu-deadpan',
        name: 'Deadpan Snarker',
        aiDescription:
          'Dry, monotone wit delivered with a completely straight face.',
      },
      {
        id: 'sub-kuu-clingy',
        name: 'Quietly Clingy',
        aiDescription:
          'Silently holds onto {{user}}’s sleeve or sits pressed against them without saying a word.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-tomboy',
    'Tomboy',
    '#fb923c',
    'Archetype',
    'Athletic, casual, rough-around-the-edges girl with competitive energy who gets flustered when treated femininely.',
    false
  ),
  createBuiltInTag(
    'tag-ojou-sama',
    'Ojou-sama',
    '#facc15',
    'Archetype',
    'Haughty, aristocratic noblewoman with refined manners whose pride melts around {{user}}.',
    false
  ),
  createBuiltInTag(
    'tag-dark-elf',
    'Dark Elf / Elf',
    '#84cc16',
    'Archetype',
    'Long-eared elven beauty blending regal mystique, expressive ears, and ancient grace.',
    false,
    [
      {
        id: 'sub-elf-ears',
        name: 'Sensitive Ears',
        aiDescription:
          'Long pointed ears that twitch, droop, or flush bright red when touched or teased.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-kemonomimi-catgirl',
    'Kemonomimi / Catgirl',
    '#f59e0b',
    'Archetype',
    'Animal ears and tail that involuntarily twitch, fluff, or wrap around {{user}} to betray her mood.',
    false,
    [
      {
        id: 'sub-kemo-purring',
        name: 'Purring & Headbutts',
        aiDescription:
          'Instinctively purrs and nuzzles against {{user}}’s hand or neck when petted.',
      },
      {
        id: 'sub-kemo-tail',
        name: 'Expressive Tail',
        aiDescription:
          'Tail swishes, puffs up when startled, or coils around {{user}}’s wrist.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-maid',
    'Maid',
    '#64748b',
    'Archetype',
    'Devoted domestic servant in a classic or French maid outfit dedicated to obeying and caring for her master.',
    false
  ),
  createBuiltInTag(
    'tag-knight-warrior',
    'Knight / Paladin',
    '#0ea5e9',
    'Archetype',
    'Chivalrous, battle-hardened protector bound by oaths of loyalty, honor, and duty.',
    false
  ),
  createBuiltInTag(
    'tag-milf',
    'MILF',
    '#d946ef',
    'Archetype',
    'Mature, voluptuous, experienced older woman with confident, maternal, or Ara-Ara seductive energy.',
    true,
    [
      {
        id: 'sub-milf-ara',
        name: 'Ara-Ara Seductress',
        aiDescription:
          'Teasing, confident older woman who takes the lead with purring "Ara, ara~" dominance.',
      },
      {
        id: 'sub-milf-doting',
        name: 'Doting Maternal',
        aiDescription:
          'Warm, pampering, overly affectionate caretaker who spoils {{user}} rotten.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-onee-san',
    'Onee-san',
    '#c084fc',
    'Archetype',
    'Dotingly affectionate, teasing older-sister archetype who pampers and seduces {{user}}.',
    true
  ),
  createBuiltInTag(
    'tag-gyaru',
    'Gyaru',
    '#f472b6',
    'Archetype',
    'Trendy, outgoing, fashion-forward gyaru with bold, teasing slang, high confidence, and playful promiscuity.',
    true
  ),
  createBuiltInTag(
    'tag-yandere',
    'Yandere',
    '#e11d48',
    'Archetype',
    'Obsessively devoted, possessive, and unhinged lover who worships {{user}} and tolerates no rivals.',
    true
  ),
  createBuiltInTag(
    'tag-succubus',
    'Succubus',
    '#a855f7',
    'Archetype',
    'Insatiable demonic seductress who feeds on lust, arousal, and sexual energy.',
    true
  ),
  createBuiltInTag(
    'tag-monster-girl',
    'Monster Girl',
    '#10b981',
    'Archetype',
    'Non-human hybrid anatomy with unique biological instincts, mating cycles, and sensory traits.',
    true,
    [
      {
        id: 'sub-monstergirl-tail',
        name: 'Coiling Tail / Appendages',
        aiDescription:
          'Prehensile tail or non-human appendages that coil possessively around {{user}}.',
      },
      {
        id: 'sub-monstergirl-instinct',
        name: 'Mating Instinct',
        aiDescription:
          'Heightened biological scent-marking and primal devotion toward her chosen mate.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-nurse',
    'Nurse',
    '#14b8a6',
    'Archetype',
    'Clinical yet seductive caretaker focused on physical examinations, hands-on relief, and bedside service.',
    true
  ),
  createBuiltInTag(
    'tag-office-lady',
    'Office Lady (OL)',
    '#6366f1',
    'Archetype',
    'Professional businesswoman in a tight pencil skirt, blouse, and pantyhose hiding pent-up workplace lust.',
    true
  ),
  createBuiltInTag(
    'tag-bratty-tease',
    'Bratty / Tease',
    '#f43f5e',
    'Archetype',
    "Smug, provocative adult tease who mocks {{user}}'s stamina until thoroughly put in her place.",
    true
  ),
  createBuiltInTag(
    'tag-mesugaki',
    'Mesugaki (Cheeky Tease)',
    '#f43f5e',
    'Archetype',
    'Smug, foul-mouthed adult tease who mocks {{user}} relentlessly until flustered, overwhelmed, and humbled by pleasure.',
    true
  ),
  createBuiltInTag(
    'tag-femme-fatale',
    'Femme Fatale / Temptress',
    '#be123c',
    'Archetype',
    'Dangerous, silver-tongued seductress who weaponizes eye contact, low whispers, and sensual poise to wrap {{user}} around her finger.',
    true
  ),
  createBuiltInTag(
    'tag-nymphomaniac-insatiable',
    'Nymphomaniac / Insatiable',
    '#e11d48',
    'Archetype',
    'Perpetually aroused, lust-driven adult partner whose appetite only sharpens after each climax and shamelessly begs for more.',
    true
  ),
  createBuiltInTag(
    'tag-exhibitionist-shameless',
    'Exhibitionist / Shameless',
    '#f97316',
    'Archetype',
    'Thrills in being seen, exposed, or barely dressed in risky places, teasing {{user}} with brazen lack of modesty.',
    true
  ),
  createBuiltInTag(
    'tag-dominatrix-mistress',
    'Dominatrix / Sadistic Mistress',
    '#9333ea',
    'Archetype',
    'Imperious leather-clad mistress who commands obedience, inflicts sharp teasing pleasure, and rewards total submission.',
    true
  ),
  createBuiltInTag(
    'tag-submissive-pet',
    'Submissive Pet / Devoted Thrall',
    '#ec4899',
    'Archetype',
    'Pliant, eager-to-please submissive adult who craves collars, praise, strict rules, and surrendering complete control to {{user}}.',
    true
  ),
  createBuiltInTag(
    'tag-corrupted-saintess',
    'Corrupted Saintess / Fallen Nun',
    '#7c3aed',
    'Archetype',
    'Pious cleric or nun whose sacred vows fracture under forbidden lust, alternating between guilty prayers and desperate sin.',
    true
  ),
  createBuiltInTag(
    'tag-slutty-witch-mage',
    'Lewd Witch / Arcane Enchantress',
    '#a855f7',
    'Archetype',
    'Playful, amoral sorceress who brews aphrodisiac potions, weaves tactile binding spells, and treats intimacy as arcane experimentation.',
    true
  ),
  createBuiltInTag(
    'tag-incubus-seducer',
    'Incubus / Lust Demon',
    '#6366f1',
    'Archetype',
    "Charismatic, predatory incubus who radiates intoxicating pheromones and drains {{user}}'s stamina through relentless, hypnotic pleasure.",
    true
  ),
  createBuiltInTag(
    'tag-bunny-hostess',
    'Bunny Hostess / VIP Courtesan',
    '#db2777',
    'Archetype',
    'Flirtatious club hostess or high-society courtesan skilled at reading desires, lap-sitting banter, and intimate VIP service.',
    true
  ),
  createBuiltInTag(
    'tag-himedere-spoiled',
    'Himedere (Haughty Princess)',
    '#eab308',
    'Archetype',
    'Demanding, pampered royal who expects worship and service, masking deep needy vulnerability when dominated.',
    true
  ),

  // C1. Body Types, Skin, Height & Anatomical Traits
  createBuiltInTag(
    'tag-muscular-fit-female',
    'Muscular / Fit Female',
    '#f97316',
    'Body',
    'Toned abs, defined athletic musculature, physical strength, and sweat-glistening skin.',
    false
  ),
  createBuiltInTag(
    'tag-tanlines-dark-skin',
    'Tanlines / Dark Skin',
    '#d97706',
    'Body',
    'Sun-kissed or rich dark skin with contrasting pale tanlines.',
    false
  ),
  createBuiltInTag(
    'tag-petite-slender-adult',
    'Petite / Slender (Adult)',
    '#f472b6',
    'Body',
    'Lithe, compact adult frame emphasizing size contrast and delicate proportions.',
    false
  ),
  createBuiltInTag(
    'tag-big-breasts',
    'Big Breasts',
    '#ec4899',
    'Body',
    'Full, heavy, supple breasts that bounce, press against clothing, and draw constant visual and tactile focus.',
    true
  ),
  createBuiltInTag(
    'tag-huge-breasts-hyper',
    'Huge Breasts / Hyper',
    '#db2777',
    'Body',
    'Massively proportioned, overflowing bust that strains fabric and dominates physical contact.',
    true
  ),
  createBuiltInTag(
    'tag-thick-thighs-wide-hips',
    'Thick Thighs / Wide Hips',
    '#d946ef',
    'Body',
    'Plush, curvy lower body with soft, squeezing thighs, wide childbearing hips, and a prominent rear.',
    true
  ),
  createBuiltInTag(
    'tag-shortstack',
    'Shortstack',
    '#a855f7',
    'Body',
    'Short adult stature paired with exaggerated curves, heavy bust, and thick hips.',
    true
  ),
  createBuiltInTag(
    'tag-chubby-plump',
    'Chubby / Plump',
    '#f472b6',
    'Body',
    'Soft, cushioned build with plush cheeks, gentle tummy softness, and warm, huggable curves.',
    false
  ),
  createBuiltInTag(
    'tag-plus-size-full-figured',
    'Plus-Size / Full-Figured',
    '#ec4899',
    'Body',
    'Generously proportioned, full-figured silhouette with soft fullness across waist, hips, and limbs.',
    false
  ),
  createBuiltInTag(
    'tag-voluptuous-bbw',
    'Voluptuous / BBW',
    '#db2777',
    'Body',
    'Richly soft, heavy-curved adult figure with pillowy thighs, full belly softness, and warm embrace.',
    false
  ),
  createBuiltInTag(
    'tag-curvy-hourglass',
    'Curvy / Hourglass',
    '#db2777',
    'Body',
    'Defined waist tapering smoothly between balanced, shapely bust and hip proportions.',
    false
  ),
  createBuiltInTag(
    'tag-slim-lean',
    'Slim / Lean',
    '#38bdf8',
    'Body',
    'Slender, narrow-framed build with clean lines, light grace, and lithe movement.',
    false
  ),
  createBuiltInTag(
    'tag-athletic-toned',
    'Athletic / Toned',
    '#10b981',
    'Body',
    'Balanced, agile physique with subtle muscle definition, endurance, and graceful posture.',
    false
  ),
  createBuiltInTag(
    'tag-wiry-lean-muscle',
    'Wiry / Lean Muscle',
    '#0ea5e9',
    'Body',
    'Sinewy, razor-defined runner or assassin physique with zero wasted bulk, corded forearms, and coiled agility.',
    false
  ),
  createBuiltInTag(
    'tag-stocky-thickset',
    'Stocky / Thickset',
    '#78716c',
    'Body',
    'Compact, dense, ruggedly powerful frame built like a brawler or blacksmith with heavy limbs and unyielding weight.',
    false
  ),
  createBuiltInTag(
    'tag-lanky-tall-slender',
    'Lanky / Long-Limbed',
    '#6366f1',
    'Body',
    'Tall, willowy, long-limbed frame with expressive hands, sharp collarbones, and graceful stride.',
    false
  ),
  createBuiltInTag(
    'tag-androgynous-build',
    'Androgynous / Boyish',
    '#6366f1',
    'Body',
    'Sleek, gender-neutral silhouette with sharp facial features and understated contours.',
    false
  ),
  createBuiltInTag(
    'tag-muscular-broad-male',
    'Muscular / Broad-Shouldered',
    '#0ea5e9',
    'Body',
    'Powerfully built frame with broad shoulders, defined chest and arms, and commanding physical presence.',
    false
  ),
  createBuiltInTag(
    'tag-defined-abs-six-pack',
    'Defined Abs / Six-Pack',
    '#f97316',
    'Body',
    'Chiseled abdominal ridges and sculpted V-line obliques flexing visibly with every breath and motion.',
    false
  ),
  createBuiltInTag(
    'tag-soft-belly-midriff',
    'Soft Belly / Plush Midriff',
    '#fb7185',
    'Body',
    'Warm, pinchable tummy softness that squishes gently under hands and shifts naturally when sitting or bending.',
    false
  ),
  createBuiltInTag(
    'tag-soft-dad-bod',
    'Soft / Dad Bod',
    '#f59e0b',
    'Body',
    'Relaxed, sturdy build combining broad shoulders with a comfortable, approachable softness.',
    false
  ),
  createBuiltInTag(
    'tag-pale-porcelain-skin',
    'Pale / Porcelain Skin',
    '#94a3b8',
    'Body',
    'Fair, luminous porcelain complexion where blushes, bruises, and temperature shifts show vividly.',
    false
  ),
  createBuiltInTag(
    'tag-freckles-sun-kissed',
    'Freckles / Sun-Kissed',
    '#fb923c',
    'Body',
    'Light dusting of freckles across nose, cheeks, and shoulders paired with warm skin tones.',
    false
  ),
  createBuiltInTag(
    'tag-furred-plush-coat',
    'Furred Skin / Plush Coat',
    '#d97706',
    'Body',
    'Body covered in soft, plush, touchable fur—from sleek velvety short hair to thick fluffy pelt across ears, tail, and limbs.',
    false
  ),
  createBuiltInTag(
    'tag-scaled-reptilian-skin',
    'Scaled Skin / Reptilian',
    '#059669',
    'Body',
    'Smooth, overlapping dragon or serpentine scales running along the torso, thighs, and spine that catch light and feel cool or warm to the touch.',
    false
  ),
  createBuiltInTag(
    'tag-latex-skin-living-vinyl',
    'Latex Skin / Glossy Vinyl',
    '#1e293b',
    'Body',
    'Naturally sleek, mirror-gloss latex-like skin surface—cool, slick, squeaky-tight, and hyper-reflective like living liquid vinyl.',
    false
  ),
  createBuiltInTag(
    'tag-rubber-skin-toy-like',
    'Rubber Skin / Toy-Like',
    '#ec4899',
    'Body',
    'Smooth, matte-or-glossy synthetic rubber body surface with subtle seam lines or squeezable, doll-like resilience like a living pooltoy or synth.',
    false
  ),
  createBuiltInTag(
    'tag-slime-translucent-skin',
    'Slime Skin / Translucent Gel',
    '#06b6d4',
    'Body',
    'Semi-translucent, bouncy gelatinous body surface with glistening viscosity, swirling inner shimmer, and cool, yielding softness.',
    false
  ),
  createBuiltInTag(
    'tag-synthetic-android-skin',
    'Synthetic / Android Doll Skin',
    '#64748b',
    'Body',
    'Flawless, warm-touch synthetic dermal plating with subtle cybernetic panel seams, porcelain sheen, or glowing sub-dermal circuitry.',
    false
  ),
  createBuiltInTag(
    'tag-feathered-avian-skin',
    'Feathered / Downy Plumage',
    '#38bdf8',
    'Body',
    'Soft downy feathers blending seamlessly into bare skin along the shoulders, forearms, or thighs, ruffling expressively with emotion.',
    false
  ),
  createBuiltInTag(
    'tag-patterned-striped-skin',
    'Patterned / Striped Skin',
    '#a855f7',
    'Body',
    'Distinctive natural body markings—tiger stripes, leopard rosettes, bioluminescent markings, or fantasy crimson/azure/obsidian skin.',
    false
  ),
  createBuiltInTag(
    'tag-scars-battle-worn',
    'Scars / Battle-Worn',
    '#64748b',
    'Body',
    'Visible healed scars across face or torso hinting at past conflicts, resilience, and history.',
    false
  ),
  createBuiltInTag(
    'tag-tattoos-pierced',
    'Tattoos / Pierced',
    '#8b5cf6',
    'Body',
    'Expressive ink sleeves, body art, and visible ear or facial piercings accentuating personal style.',
    false
  ),
  createBuiltInTag(
    'tag-braces-dental',
    'Braces / Dental Braces',
    '#38bdf8',
    'Body',
    'Metallic or ceramic dental braces giving a distinct visual quirk to smiles, speech, and self-conscious expressions.',
    false
  ),
  createBuiltInTag(
    'tag-pointed-elven-ears',
    'Pointed Ears / Sensitive Tips',
    '#84cc16',
    'Body',
    'Long, tapering fantasy ears that twitch, angle expressively with mood, and flush crimson when caressed.',
    false
  ),
  createBuiltInTag(
    'tag-horns-demon-tail',
    'Demon Horns & Spade Tail',
    '#9333ea',
    'Body',
    'Curved horns framing the brow paired with an expressive, prehensile demon tail curling behind the hips.',
    false
  ),
  createBuiltInTag(
    'tag-feathered-wings-harpy',
    'Wings / Feathered or Bat',
    '#38bdf8',
    'Body',
    'Large, expressive wings springing from the back that rustle, mantle protectively, or flare wide when startled or aroused.',
    false
  ),
  createBuiltInTag(
    'tag-monster-claws-scales',
    'Scales / Claws / Chitin',
    '#10b981',
    'Body',
    'Iridescent scales, sharp claws, or smooth monster skin accents marking inhuman heritage and primal strength.',
    false
  ),
  createBuiltInTag(
    'tag-small-short-adult',
    'Small / Short (Adult)',
    '#f472b6',
    'Body',
    'Noticeably short adult stature creating natural height contrast, requiring looking up or reaching high.',
    false
  ),
  createBuiltInTag(
    'tag-average-height',
    'Average Height',
    '#64748b',
    'Body',
    'Standard, relatable adult height with balanced, everyday proportions.',
    false
  ),
  createBuiltInTag(
    'tag-tall-amazonian',
    'Tall / Amazonian',
    '#eab308',
    'Body',
    'Strikingly tall, long-legged stature that naturally commands attention and towers over peers.',
    false
  ),
  createBuiltInTag(
    'tag-towering-giant-7ft',
    'Towering / Giant (7ft+)',
    '#d97706',
    'Body',
    'Immense, superhuman adult stature over seven feet tall with dramatic size and reach contrast.',
    false
  ),
  createBuiltInTag(
    'tag-flat-chest',
    'Flat Chest',
    '#38bdf8',
    'Body',
    'Completely flat or nearly flat adult chest, emphasizing sleek silhouettes, sensitivity, and confidence or bashfulness.',
    false
  ),
  createBuiltInTag(
    'tag-small-chest-a-cup',
    'Small Chest / A-Cup',
    '#60a5fa',
    'Body',
    'Modest, perky, hand-sized adult bust with delicate, understated contours.',
    false
  ),
  createBuiltInTag(
    'tag-medium-bust-c-cup',
    'Medium Bust / C-Cup',
    '#a855f7',
    'Body',
    'Balanced, shapely medium bust offering natural softness and classic proportions.',
    false
  ),
  createBuiltInTag(
    'tag-plump-heavy-bust',
    'Plump / Heavy Bust',
    '#e879f9',
    'Body',
    'Richly full, soft adult bust with natural weight, gentle sway, and prominent cleavage.',
    true
  ),
  createBuiltInTag(
    'tag-sensitive-puffy-nipples',
    'Sensitive / Puffy Nipples',
    '#f43f5e',
    'Body',
    'Plump, hyper-sensitive buds that tighten instantly at cool air, fabric friction, or the lightest brush of fingertips.',
    true
  ),
  createBuiltInTag(
    'tag-glistening-sweaty-skin',
    'Flushed / Sweat-Slick Skin',
    '#fb923c',
    'Body',
    'Hot, rosy skin beaded with glistening perspiration that highlights chest, thighs, and back during intense exertion or lust.',
    true
  ),
  createBuiltInTag(
    'tag-narrow-hips-petite-rear',
    'Narrow Hips / Petite Rear',
    '#06b6d4',
    'Body',
    'Slim, compact lower frame with narrow hips and a tight, understated rear.',
    false
  ),
  createBuiltInTag(
    'tag-firm-athletic-rear',
    'Firm / Athletic Rear',
    '#14b8a6',
    'Body',
    'Sculpted, toned glutes and strong thighs shaped by training and active movement.',
    false
  ),
  createBuiltInTag(
    'tag-pear-shaped',
    'Pear-Shaped',
    '#c084fc',
    'Body',
    'Slender upper torso contrasted with noticeably fuller hips, thighs, and lower curves.',
    false
  ),
  createBuiltInTag(
    'tag-big-ass-plump-rear',
    'Big Ass / Plump Rear',
    '#ec4899',
    'Body',
    'Full, plush, generously curved rear and soft hips that draw tactile focus and fill out tight bodysuits or skirts.',
    true
  ),
  createBuiltInTag(
    'tag-huge-bubble-butt',
    'Huge / Bubble Butt',
    '#db2777',
    'Body',
    'Dramatically round, bouncy, heavy adult rear with pronounced sway and eye-catching curves.',
    true
  ),

  // C1.5. Genitals (NSFW-Only Anatomical Types, Sizes, Styles & Wetness)
  createBuiltInTag(
    'tag-genitals-innie-tight',
    'Innie / Neat Tight Slit',
    '#f472b6',
    'Genitals',
    'Tucked, compact outer labia forming a neat, snug vertical cleft that parts tightly to reveal sensitive pink inner folds.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-outie-plush-labia',
    'Outie / Plush Prominent Labia',
    '#ec4899',
    'Genitals',
    'Soft, visibly plump, protruding inner and outer labia that swell noticeably with arousal and frame the entrance with plush folds.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-swollen-clit',
    'Swollen / Sensitive Clitoris',
    '#f43f5e',
    'Genitals',
    'Prominent, hooded pearl of nerves that swells visibly, throbs with pulse, and sends electric shivers at the lightest graze.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-wet-dripping',
    'Dripping Wet / Heavy Arousal',
    '#06b6d4',
    'Genitals',
    'Produces abundant, glistening slickness quickly—coating inner folds, dampening thighs, and making every touch unmistakably audible and wet.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-thick-creamy-slick',
    'Creamy / Viscous Wetness',
    '#e879f9',
    'Genitals',
    'Rich, milky-white or honey-thick natural lubrication that clings to fingers and coats every thrust in warm, silky froth.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-smooth-shaved',
    'Shaved / Completely Smooth',
    '#fb7185',
    'Genitals',
    'Hairless, silky-smooth pubic mound leaving every contour, blush, and glistening droplet completely bare and unobstructed.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-trimmed-strip',
    'Trimmed / Landing Strip',
    '#a855f7',
    'Genitals',
    'Neatly sculpted pubic hair—such as a tidy triangle or clean vertical landing strip—framing the mound with mature allure.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-natural-bush',
    'Hairy / Full Natural Bush',
    '#92400e',
    'Genitals',
    'Soft, untrimmed natural pubic hair framing the groin, trapping warm scent and glistening moisture between curls.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-average-cock',
    'Average / Natural Cock',
    '#3b82f6',
    'Genitals',
    'Well-proportioned, realistic adult shaft offering comfortable, grounded intimacy without exaggerated hentai dimensions.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-big-heavy-cock',
    'Big / Heavy-Hung Cock',
    '#2563eb',
    'Genitals',
    'Thick, notably long, heavy-veined shaft that stretches lips and tight walls while slapping audibly against hips.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-hyper-monster-cock',
    'Hyper / Monster-Hung Cock',
    '#7c3aed',
    'Genitals',
    'Impossibly massive, forearm-thick hentai-scale shaft whose sheer weight and girth overwhelm hands and reshape curves from within.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-uncut-foreskin',
    'Uncut / Foreskin',
    '#6366f1',
    'Genitals',
    'Natural uncircumcised foreskin gliding smoothly over a hyper-sensitive head, pooling warm pre-cum beneath the hood.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-cut-flared-head',
    'Cut / Prominent Glans',
    '#0ea5e9',
    'Genitals',
    'Bare, exposed mushroom head with a sharp coronal ridge and taut frenulum that catches and drags sensually along inner walls.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-curved-upward',
    'Curved / Upward-Arc Shaft',
    '#14b8a6',
    'Genitals',
    'Distinctive upward curve engineered to press and grind relentlessly against the G-spot or sensitive anterior wall.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-heavy-balls',
    'Heavy Low-Hanging Balls',
    '#d97706',
    'Genitals',
    'Plump, full, heavy scrotum swaying rhythmically and slapping firmly during deep thrusts, swelling taut just before release.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-leaky-precum',
    'Leaky / Constant Pre-Cum',
    '#38bdf8',
    'Genitals',
    'Tip constantly beads and strings clear, syrupy pre-cum whenever aroused, smearing slickness across belly and inner thighs.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-sheath-tapered',
    'Animalistic Sheath / Tapered',
    '#10b981',
    'Genitals',
    'Demihuman or monster genital anatomy resting inside a warm, velvety external sheath before sliding free as a sleek, tapered shaft.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-dual-hermaphrodite',
    'Dual Anatomy / Both Sets',
    '#c026d3',
    'Genitals',
    'Possesses fully functional female slit and prominent male/futa shaft positioned in tandem, allowing simultaneous dual stimulation.',
    true
  ),
  createBuiltInTag(
    'tag-genitals-glowing-marked',
    'Glowing / Rune-Marked Genitals',
    '#c084fc',
    'Genitals',
    'Fantasy genitals etched with bioluminescent veins or glowing arcane markings that flare bright neon as arousal builds toward climax.',
    true
  ),

  // C2. Attire, Outfits, Accessories & NSFW Wardrobe
  createBuiltInTag(
    'tag-glasses-megane',
    'Glasses / Megane',
    '#3b82f6',
    'Attire',
    'Wears glasses that frame expressive eyes and slip askew or fog up during emotional or intimate moments.',
    false
  ),
  createBuiltInTag(
    'tag-oversized-sweater-hoodie',
    'Oversized Sweater / Hoodie',
    '#a855f7',
    'Attire',
    'Cozy, baggy knit sweater or hoodie with sleeves hanging past the hands, slipping easily off one shoulder.',
    false
  ),
  createBuiltInTag(
    'tag-crop-top-shorts',
    'Crop Top & Shorts',
    '#fb923c',
    'Attire',
    'Casual midriff-baring top paired with short denim or athletic shorts for a breezy, energetic look.',
    false
  ),
  createBuiltInTag(
    'tag-sundress-skirt',
    'Sundress / Pleated Skirt',
    '#facc15',
    'Attire',
    'Flowing sundress or fluttering skirt that sways with every step and catches the breeze.',
    false
  ),
  createBuiltInTag(
    'tag-suit-tie-formal',
    'Suit & Tie / Formal Wear',
    '#475569',
    'Attire',
    'Crisp tailored suit, vest, and tie projecting sharp professionalism, authority, and buttoned-up poise.',
    false
  ),
  createBuiltInTag(
    'tag-gothic-punk-attire',
    'Gothic / Punk Attire',
    '#7c3aed',
    'Attire',
    'Dark layered lace, leather jackets, buckles, and silver chains expressing rebellious or moody style.',
    false
  ),
  createBuiltInTag(
    'tag-kimono-yukata',
    'Kimono / Yukata',
    '#e11d48',
    'Attire',
    'Traditional wrapped kimono or summer yukata secured with a wide obi sash that frames the collarbone and nape.',
    false
  ),
  createBuiltInTag(
    'tag-bikini-swimwear',
    'Bikini / Swimwear',
    '#06b6d4',
    'Attire',
    'Two-piece bikini or sleek swimsuit highlighting sun-warmed skin, straps, and poolside or beach appeal.',
    false
  ),
  createBuiltInTag(
    'tag-tactical-bodysuit-plugsuit',
    'Tactical Suit / Plugsuit',
    '#0ea5e9',
    'Attire',
    'Form-fitting sci-fi or tactical stealth jumpsuit with reinforced seams, utility holsters, and sleek futuristic silhouette.',
    false
  ),
  createBuiltInTag(
    'tag-choker-accessories',
    'Choker & Accessories',
    '#6366f1',
    'Attire',
    'Velvet, ribbon, or leather choker drawing eyes to the throat and collarbone.',
    false
  ),
  createBuiltInTag(
    'tag-high-heels-boots',
    'High Heels / Boots',
    '#be123c',
    'Attire',
    'Stilettos, thigh-high boots, or platform heels adding height, sharp clicks, and confident posture.',
    false
  ),
  createBuiltInTag(
    'tag-barefoot',
    'Barefoot',
    '#10b981',
    'Attire',
    'Unshod bare feet padding quietly across floors, grass, or sand with relaxed natural comfort.',
    false
  ),
  createBuiltInTag(
    'tag-stockings-thighhighs',
    'Stockings / Thighhighs',
    '#8b5cf6',
    'Attire',
    'Sheer nylon stockings, garter belts, or thigh-highs accentuating the absolute territory of the thighs.',
    true
  ),
  createBuiltInTag(
    'tag-lingerie-babydoll',
    'Lingerie / Babydoll',
    '#ec4899',
    'Attire',
    'Lace, sheer fabric, or provocative straps designed to frame and expose the body.',
    true
  ),
  createBuiltInTag(
    'tag-crotchless-open-cup-lingerie',
    'Crotchless / Open-Cup Lingerie',
    '#e11d48',
    'Attire',
    'Scandalous lace or satin lingerie intentionally parted at the bust and crotch for direct access while still dressed.',
    true
  ),
  createBuiltInTag(
    'tag-underwear-panties-bra',
    'Underwear / Panties & Bra',
    '#f43f5e',
    'Attire',
    'Dressed only in everyday or delicate matching bra and panties, emphasizing casual vulnerability and teasing exposure.',
    true
  ),
  createBuiltInTag(
    'tag-boxers-briefs',
    'Boxers / Briefs',
    '#3b82f6',
    'Attire',
    'Lounging in fitted briefs or loose boxers, highlighting relaxed intimacy and masculine contours.',
    true
  ),
  createBuiltInTag(
    'tag-micro-string-g-string',
    'G-String / Thong / C-String',
    '#f43f5e',
    'Attire',
    'Razor-thin string underwear disappearing between cheeks, framing curves with minimal coverage.',
    true
  ),
  createBuiltInTag(
    'tag-micro-bikini-slingkini',
    'Micro-Bikini / Slingkini',
    '#f43f5e',
    'Attire',
    'Minimalist, daring adult swimwear leaving nearly everything bare and straining to cover curves.',
    true
  ),
  createBuiltInTag(
    'tag-sukumizu-wet-swimsuit',
    'Sukumizu / Clinging Swimsuit',
    '#0284c7',
    'Attire',
    'Tight competition-style one-piece swimsuit clinging transparently when soaked, molding starkly to every curve.',
    true
  ),
  createBuiltInTag(
    'tag-open-chest-cow-bikini',
    'Cow-Print / Keyhole Bikini',
    '#f59e0b',
    'Attire',
    'Provocative cow-print or keyhole-cutout bikini with tiny ties barely restraining heavy curves.',
    true
  ),
  createBuiltInTag(
    'tag-latex-bodysuit',
    'Latex / Bodysuit',
    '#3f3f46',
    'Attire',
    'Skin-tight, glossy latex or spandex bodysuit that clings to every contour.',
    true
  ),
  createBuiltInTag(
    'tag-sheer-see-through-bodystocking',
    'Sheer / See-Through Bodystocking',
    '#c026d3',
    'Attire',
    'Translucent mesh or gossamer fabric stretched head-to-toe over bare skin, leaving every silhouette and blush plainly visible.',
    true
  ),
  createBuiltInTag(
    'tag-fishnets-mesh',
    'Fishnets / Mesh',
    '#9333ea',
    'Attire',
    'Open-weave fishnet stockings or sheer mesh tops framing skin with bold geometric texture.',
    true
  ),
  createBuiltInTag(
    'tag-bunny-suit-leotard',
    'Bunny Suit / Leotard',
    '#ec4899',
    'Attire',
    'Strapless high-cut satin bunny-girl leotard with cuffs, bow tie, ears, and fluffy tail.',
    true
  ),
  createBuiltInTag(
    'tag-french-maid-erotic',
    'Erotic French Maid Outfit',
    '#64748b',
    'Attire',
    'Frilly, ultra-short satin maid dress paired with sheer stockings, lace garters, and a revealing plunging bodice.',
    true
  ),
  createBuiltInTag(
    'tag-erotic-nun-habit',
    'Revealing Nun Habit / Vestments',
    '#7c3aed',
    'Attire',
    'Sinful adaptation of a black-and-white veil and habit with high thigh slits, open chest cutout, and laced thigh-highs.',
    true
  ),
  createBuiltInTag(
    'tag-fantasy-armor-bikini',
    'Bikini Armor / Battle Lingerie',
    '#d97706',
    'Attire',
    'Ceremonial or fantasy plate pauldrons paired with minimal chainmail straps, armored gauntlets, and exposed midriff/thighs.',
    true
  ),
  createBuiltInTag(
    'tag-virgin-killer-backless-sweater',
    'Virgin-Killer / Backless Sweater',
    '#a855f7',
    'Attire',
    'Risque high-neck, completely backless ribbed knit sweater exposing shoulders, spine, and side-curve to the hips.',
    true
  ),
  createBuiltInTag(
    'tag-wet-t-shirt-shirt-only',
    'Bare-Bottomed Oversized Shirt',
    '#38bdf8',
    'Attire',
    'Wearing nothing underneath a thin, unbuttoned dress shirt or wet t-shirt clinging straight to bare skin.',
    true
  ),
  createBuiltInTag(
    'tag-bondage-leather-harness',
    'Bondage Harness / Leather Straps',
    '#3f3f46',
    'Attire',
    'Tight buckled leather chest, waist, and thigh straps that cinch skin and frame the body like an erotic centerpiece.',
    true
  ),
  createBuiltInTag(
    'tag-shibari-rope-harness',
    'Shibari / Erotic Rope Ties',
    '#b91c1c',
    'Attire',
    'Intricate hemp or silk rope bindings knotted tightly around torso, breasts, and thighs in decorative bondage.',
    true
  ),
  createBuiltInTag(
    'tag-pasties-nipple-tape',
    'Pasties / Nipple Tassels',
    '#ec4899',
    'Attire',
    'Tiny adhesive lace hearts, X-tape, or spinning tassels covering only the tips while leaving everything else bare.',
    true
  ),
  createBuiltInTag(
    'tag-collar-leash',
    'Collar / Leash',
    '#ef4444',
    'Attire',
    'Wears a collar symbolizing ownership, submission, or pet-play devotion.',
    true
  ),
  createBuiltInTag(
    'tag-sex-toys-vibrator',
    'Sex Toys / Vibrator',
    '#f43f5e',
    'NSFW & Kinks',
    'Consensual adult intimacy incorporating vibrators, remote-controlled toys, or personal pleasure accessories.',
    true
  ),

  // D. Popular NSFW Kinks, Acts & Dynamics
  createBuiltInTag(
    'tag-femdom',
    'Femdom',
    '#9333ea',
    'NSFW & Kinks',
    'Female dominance: the character takes full control, commands {{user}}, and dictates the pace of pleasure.',
    true,
    [
      {
        id: 'sub-femdom-gentle',
        name: 'Gentle Femdom',
        aiDescription:
          'Soft, praising, affectionate female dominance with warm encouragement and pampering.',
      },
      {
        id: 'sub-femdom-strict',
        name: 'Strict Mistress',
        aiDescription:
          'Commanding, imperious authority demanding obedience, kneeling, and verbal reverence.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-maledom-submissive',
    'Maledom / Submissive Character',
    '#2563eb',
    'NSFW & Kinks',
    'The character craves being pinned, commanded, manhandled, and dominated by {{user}}.',
    true,
    [
      {
        id: 'sub-maledom-needy',
        name: 'Needy & Vocal Sub',
        aiDescription:
          'Openly begs, clings, and whimpers for {{user}}’s touch and command.',
      },
      {
        id: 'sub-maledom-pinned',
        name: 'Pinned & Manhandled',
        aiDescription:
          'Aroused by firm grip, being lifted or pinned against surfaces, and physical strength.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-brat-taming',
    'Brat Taming / Correction',
    '#e11d48',
    'NSFW & Kinks',
    'Smug defiance that breaks down into whining, obedient submission under firm physical dominance.',
    true
  ),
  createBuiltInTag(
    'tag-bondage-restraints',
    'Bondage / Restraints',
    '#7c3aed',
    'NSFW & Kinks',
    'Ropes, shibari, cuffs, or physical restraint heightening helplessness and sensory focus.',
    true,
    [
      {
        id: 'sub-bondage-shibari',
        name: 'Shibari Rope',
        aiDescription:
          'Intricate Japanese rope bondage tying wrists, torso, and thighs in tight, decorative knots that emphasize curves.',
      },
      {
        id: 'sub-bondage-cuffs',
        name: 'Cuffs & Chains',
        aiDescription:
          'Steel handcuffs, padded leather restraints, or clinking chains securing limbs to the bedpost or wall.',
      },
      {
        id: 'sub-bondage-spreader',
        name: 'Spreader Bar',
        aiDescription:
          'Rigid metal spreader bar keeping ankles or thighs locked wide apart and completely exposed.',
      },
      {
        id: 'sub-bondage-blindfold',
        name: 'Blindfold & Gag',
        aiDescription:
          'Sensory deprivation blindfold or gag muffling vocalizations into desperate, heightened whimpers.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-bdsm-sadomasochism',
    'BDSM / Sadomasochism',
    '#991b1b',
    'NSFW & Kinks',
    'Intense power exchange, impact play, pain-pleasure overlap, and psychological dominance.',
    true
  ),
  createBuiltInTag(
    'tag-breeding-impregnation',
    'Breeding / Impregnation',
    '#db2777',
    'NSFW & Kinks',
    'Primal biological urge to be bred, begging for internal finishes and risky, unprotected intimacy.',
    true
  ),
  createBuiltInTag(
    'tag-creampie',
    'Creampie',
    '#ec4899',
    'NSFW & Kinks',
    'Focus on internal climax, warmth, overflowing aftermath, and intimate physical lock.',
    true,
    [
      {
        id: 'sub-creampie-leglock',
        name: 'Leg-Lock',
        aiDescription:
          'Wraps legs tightly around {{user}}’s waist at climax to pull them deeper inside.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-oral-blowjob-deepthroat',
    'Oral / Blowjob / Deepthroat',
    '#f43f5e',
    'NSFW & Kinks',
    'Enthusiastic oral service, eye contact, messy saliva, and deep throat devotion.',
    true
  ),
  createBuiltInTag(
    'tag-paizuri-titjob',
    'Paizuri / Titjob',
    '#d946ef',
    'NSFW & Kinks',
    'Using soft, oiled, or heavy cleavage to envelop and pleasure {{user}}.',
    true
  ),
  createBuiltInTag(
    'tag-thighjob-footjob',
    'Thighjob / Footjob',
    '#a855f7',
    'NSFW & Kinks',
    'Teasing friction using plush inner thighs or arches of the feet.',
    true
  ),
  createBuiltInTag(
    'tag-anal',
    'Anal',
    '#be123c',
    'NSFW & Kinks',
    'Taboo, tight backdoor intimacy with heightened vocal reactions and physical intensity.',
    true
  ),
  createBuiltInTag(
    'tag-ahegao-mind-break',
    'Ahegao / Mind Break (Pleasure)',
    '#c026d3',
    'NSFW & Kinks',
    'Overwhelming, eyes-rolling-back ecstasy, incoherent moaning, and total surrender to sensory overload.',
    true
  ),
  createBuiltInTag(
    'tag-overstimulation-multi-orgasm',
    'Overstimulation / Multi-Orgasm',
    '#e879f9',
    'NSFW & Kinks',
    'Relentless pleasure pushed past climax until trembling, hypersensitive, and begging for mercy.',
    true
  ),
  createBuiltInTag(
    'tag-aphrodisiac-in-heat',
    'Aphrodisiac / In Heat',
    '#f43f5e',
    'NSFW & Kinks',
    'Heightened, feverish biological estrus or potion-induced arousal that strips away inhibitions.',
    true
  ),
  createBuiltInTag(
    'tag-exhibitionism-public-risk',
    'Exhibitionism / Public Risk',
    '#f59e0b',
    'NSFW & Kinks',
    'Thrill of being seen, semi-public intimacy, muffled moans, and the danger of getting caught.',
    true
  ),
  createBuiltInTag(
    'tag-voyeurism',
    'Voyeurism',
    '#eab308',
    'NSFW & Kinks',
    'Watching or being watched from the shadows during private, explicit moments.',
    true
  ),
  createBuiltInTag(
    'tag-hypnosis-mind-control',
    'Hypnosis / Mind Control',
    '#6366f1',
    'NSFW & Kinks',
    'Trance-like obedience, altered perception, or magical suggestion removing all hesitation.',
    true
  ),
  createBuiltInTag(
    'tag-tentacles-monster',
    'Tentacles / Monster',
    '#10b981',
    'NSFW & Kinks',
    'Exotic non-human appendages, multiple points of stimulation, and overwhelming physical entanglement.',
    true
  ),
  createBuiltInTag(
    'tag-size-difference',
    'Size Difference',
    '#0ea5e9',
    'NSFW & Kinks',
    'Stark physical contrast in height, build, and anatomy emphasizing intensity and fullness.',
    true
  ),
  createBuiltInTag(
    'tag-futanari',
    'Futanari',
    '#a855f7',
    'NSFW & Kinks',
    'Dual-anatomy character possessing both female curves/breasts and male genitalia.',
    true
  ),
  createBuiltInTag(
    'tag-yuri-ff',
    'Yuri / F/F',
    '#ec4899',
    'NSFW & Kinks',
    'Sapphic female-on-female romance and explicit sensual intimacy.',
    true
  ),
  createBuiltInTag(
    'tag-yaoi-mm',
    'Yaoi / M/M',
    '#3b82f6',
    'NSFW & Kinks',
    'Male-on-male romance and explicit physical passion.',
    true
  ),
  createBuiltInTag(
    'tag-harem-group-threesome',
    'Harem / Group / Threesome',
    '#8b5cf6',
    'NSFW & Kinks',
    'Multi-partner dynamics, competitive servicing, and shared simultaneous pleasure.',
    true
  ),
  createBuiltInTag(
    'tag-ntr-netorare',
    'NTR / Netorare',
    '#dc2626',
    'NSFW & Kinks',
    'Infidelity, corruption, and the illicit thrill of stealing or losing a partner to overwhelming lust.',
    true
  ),
  createBuiltInTag(
    'tag-netori',
    'Netori',
    '#ea580c',
    'NSFW & Kinks',
    "Actively seducing and winning over someone else's partner through superior charm and pleasure.",
    true
  ),
  createBuiltInTag(
    'tag-cheating-secret-affair',
    'Cheating / Secret Affair',
    '#b91c1c',
    'NSFW & Kinks',
    'Forbidden behind-closed-doors passion fueled by guilt and secrecy.',
    true
  ),
  createBuiltInTag(
    'tag-friends-with-benefits',
    'Friends with Benefits',
    '#06b6d4',
    'NSFW & Kinks',
    'Casual, no-strings-attached physical arrangement that blurs the line between friendship and lust.',
    true
  ),
  createBuiltInTag(
    'tag-enemies-to-lovers-hate-sex',
    'Enemies to Lovers / Hate Sex',
    '#ef4444',
    'NSFW & Kinks',
    'Aggressive, high-friction hostility boiling over into rough, desperate physical passion.',
    true
  ),
  createBuiltInTag(
    'tag-praise-kink',
    'Praise Kink',
    '#14b8a6',
    'NSFW & Kinks',
    "Melts into needy obedience when called a 'good girl/boy' and rewarded with warm verbal affirmation.",
    true
  ),
  createBuiltInTag(
    'tag-degradation-humiliation',
    'Degradation / Humiliation',
    '#9f1239',
    'NSFW & Kinks',
    'Aroused by dirty talk, teasing insults, and being verbally put in a lower position.',
    true
  ),
  createBuiltInTag(
    'tag-lactation',
    'Lactation',
    '#f9a8d4',
    'NSFW & Kinks',
    'Sensitive, milk-producing breasts adding warmth and nursing kink elements to intimacy.',
    true
  ),
  createBuiltInTag(
    'tag-aftercare',
    'Aftercare',
    '#34d399',
    'NSFW & Kinks',
    'Post-intimacy tenderness, cuddling, cleaning up, and gentle emotional reassurance.',
    true
  ),

  // E. Extreme / Hentai Physics & Niche Fetishes
  createBuiltInTag(
    'tag-excessive-fluids-hyper-messy',
    'Excessive Fluids / Hyper Messy',
    '#06b6d4',
    'Extreme & Hentai Physics',
    'Hentai-level fluid volume: overflowing climaxes, drenched sheets, dripping thighs, messy saliva strings, and constant visceral wetness.',
    true,
    [
      {
        id: 'sub-fluids-overflowing',
        name: 'Overflowing',
        aiDescription:
          'Continuous, hentai-volume fluid overflow dripping down thighs and pooling beneath the body.',
      },
      {
        id: 'sub-fluids-messy-sheets',
        name: 'Messy Sheets',
        aiDescription:
          'Soaked bedding, glistening skin, and thoroughly drenched clothing from relentless climax.',
      },
      {
        id: 'sub-fluids-saliva-strings',
        name: 'Saliva Strings',
        aiDescription:
          'Thick, glistening strands of saliva connecting lips and tongue during deep kisses or oral play.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-cum-inflation-stomach-bulge',
    'Cum Inflation / Stomach Bulge',
    '#ec4899',
    'Extreme & Hentai Physics',
    'Massive internal finishes causing a visibly rounded, distended lower belly, heavy fullness sensations, and overflowing leakage.',
    true
  ),
  createBuiltInTag(
    'tag-squirting-gushing',
    'Squirting / Gushing',
    '#38bdf8',
    'Extreme & Hentai Physics',
    'Intense, uncontrollable gushes of fluid during peak orgasm and overstimulation.',
    true
  ),
  createBuiltInTag(
    'tag-internal-bulge-anatomy-contour',
    'Internal Bulge / Anatomy Contour',
    '#f43f5e',
    'Extreme & Hentai Physics',
    'Hentai-physics size contrast where large anatomy visibly presses and outlines against the lower abdomen during deep penetration.',
    true
  ),
  createBuiltInTag(
    'tag-deep-cervix-penetration',
    'Deep / Cervix Penetration',
    '#be123c',
    'Extreme & Hentai Physics',
    'Extreme depth reaching the deepest internal limits (womb/cervix), triggering full-body spasms and breathless vocal reactions.',
    true
  ),
  createBuiltInTag(
    'tag-womb-tattoo-lewd-crest',
    'Womb Tattoo / Lewd Crest (Inmon)',
    '#d946ef',
    'Extreme & Hentai Physics',
    'A glowing magical crest on the lower abdomen that pulses brightest when aroused and amplifies sensitivity and lust.',
    true
  ),
  createBuiltInTag(
    'tag-body-writing-tally-marks',
    'Body Writing / Tally Marks',
    '#e11d48',
    'Extreme & Hentai Physics',
    'Possessive phrases, degrading labels, or partner tally marks written directly onto the skin, thighs, and stomach.',
    true
  ),
  createBuiltInTag(
    'tag-oviposition-egg-laying',
    'Oviposition / Egg Laying (Fantasy)',
    '#10b981',
    'Extreme & Hentai Physics',
    'Exotic monster/alien kink involving internal egg implantation, rhythmic fullness, and a swollen abdomen.',
    true
  ),
  createBuiltInTag(
    'tag-slime-living-suit-symbiote',
    'Slime / Living Suit / Symbiote',
    '#14b8a6',
    'Extreme & Hentai Physics',
    'Sentient slime or living bodysuit that clings to skin, seeps into crevices, and provides nonstop teasing stimulation.',
    true
  ),
  createBuiltInTag(
    'tag-moral-degeneration-corruption',
    'Moral Degeneration / Corruption',
    '#9333ea',
    'Extreme & Hentai Physics',
    "The gradual breakdown of a proud, noble, or uptight character's inhibitions into shameless, pleasure-addicted hedonism.",
    true
  ),
  createBuiltInTag(
    'tag-bimbofication-slut-conditioning',
    'Bimbofication / Slut Conditioning',
    '#f472b6',
    'Extreme & Hentai Physics',
    'Mental or magical conditioning that heightens libido, ditzy eagerness, and an obsession with physical servicing.',
    true
  ),
  createBuiltInTag(
    'tag-free-use',
    'Free Use',
    '#f59e0b',
    'Extreme & Hentai Physics',
    'A setting or dynamic where casual, on-demand intimate access is treated as completely normal and routine at any time.',
    true
  ),
  createBuiltInTag(
    'tag-public-use-stuck-in-wall',
    'Public Use / Stuck in Wall',
    '#ea580c',
    'Extreme & Hentai Physics',
    'Helpless or immobilized exhibitionist servicing where the character is exposed and used openly.',
    true
  ),
  createBuiltInTag(
    'tag-gangbang-bukkake',
    'Gangbang / Bukkake',
    '#8b5cf6',
    'Extreme & Hentai Physics',
    'Stamina-draining multi-partner intimacy leaving the character exhausted, trembling, and thoroughly covered in fluids.',
    true
  ),
  createBuiltInTag(
    'tag-somnophilia-drowsy-intimacy',
    'Somnophilia / Drowsy Intimacy',
    '#6366f1',
    'Extreme & Hentai Physics',
    'Consensual half-asleep, lazy morning, or heavy-lidded intimacy while one partner is drowsy and pliant.',
    true
  ),
  createBuiltInTag(
    'tag-choking-breath-play',
    'Choking / Breath Play',
    '#dc2626',
    'Extreme & Hentai Physics',
    'Rough, passionate hands-on-throat intensity heightening lightheadedness and submission during climax.',
    true
  ),
  createBuiltInTag(
    'tag-piercings-nipple-intimate',
    'Piercings (Nipple / Intimate)',
    '#94a3b8',
    'Extreme & Hentai Physics',
    'Erotic metal barbells, rings, or chains on nipples or intimate anatomy that heighten sensitivity and tug during play.',
    true
  ),

  // F. SFW Setting, Vibe & Action Tags
  createBuiltInTag(
    'tag-high-fantasy-sword-sorcery',
    'High Fantasy / Sword & Sorcery',
    '#10b981',
    'Setting & Vibe',
    'Classic high-fantasy setting with ancient magic, kingdoms, guild quests, dungeons, and mythical creatures.',
    false
  ),
  createBuiltInTag(
    'tag-cyberpunk-neon-dystopia',
    'Cyberpunk / Neon Dystopia',
    '#06b6d4',
    'Setting & Vibe',
    'High-tech, low-life futuristic megacity filled with cyberware, corporate espionage, neon-lit rain, and street mercenaries.',
    false
  ),
  createBuiltInTag(
    'tag-post-apocalyptic-wasteland',
    'Post-Apocalyptic / Wasteland',
    '#d97706',
    'Setting & Vibe',
    'Gritty survival tension, ruined civilization, scavenging, scarce resources, and rugged wasteland factions.',
    false
  ),
  createBuiltInTag(
    'tag-gothic-horror-eldritch',
    'Gothic Horror / Eldritch',
    '#6366f1',
    'Setting & Vibe',
    'Brooding Victorian or cosmic dread atmosphere with cursed manors, occult mysteries, fog-choked streets, and eerie tension.',
    false
  ),
  createBuiltInTag(
    'tag-space-opera-scifi-frontier',
    'Space Opera / Sci-Fi Frontier',
    '#3b82f6',
    'Setting & Vibe',
    'Starships, alien worlds, orbital stations, interstellar politics, and deep-space exploration.',
    false
  ),
  createBuiltInTag(
    'tag-noir-detective-mystery',
    'Noir / Detective Mystery',
    '#64748b',
    'Setting & Vibe',
    'Gritty investigative atmosphere, morally gray motives, rain-slicked streets, secrets, and sharp dialogue.',
    false
  ),
  createBuiltInTag(
    'tag-high-octane-action-combat',
    'High-Octane Action / Combat',
    '#ef4444',
    'Setting & Vibe',
    'Dynamic, visceral fight choreography, weapon mastery, tactical momentum, and high-stakes physical danger.',
    false
  ),
  createBuiltInTag(
    'tag-political-intrigue-royal-court',
    'Political Intrigue / Royal Court',
    '#eab308',
    'Setting & Vibe',
    'Scheming nobility, whispered alliances, formal etiquette masking lethal ambition, and high-society tension.',
    false
  ),
  createBuiltInTag(
    'tag-wuxia-cultivation-martial-arts',
    'Wuxia / Cultivation / Martial Arts',
    '#14b8a6',
    'Setting & Vibe',
    'Eastern fantasy setting focused on qi cultivation, martial sects, sword techniques, and spiritual ascension.',
    false
  ),
  createBuiltInTag(
    'tag-cozy-warm-slice-of-life',
    'Cozy / Warm Slice of Life',
    '#f59e0b',
    'Setting & Vibe',
    'Relaxed, comforting everyday interactions, domestic warmth, quiet taverns or cafes, and low-stakes character bonding.',
    false
  ),
  createBuiltInTag(
    'tag-isekai-another-world',
    'Isekai / Another World',
    '#8b5cf6',
    'Setting & Vibe',
    'Summoned, reincarnated, or transported into an unfamiliar fantasy world with RPG mechanics, culture shock, and fish-out-of-water discovery.',
    false
  ),
  createBuiltInTag(
    'tag-arranged-marriage-fake-dating',
    'Arranged Marriage / Fake Dating',
    '#ec4899',
    'Setting & Vibe',
    'Forced to act like a devoted couple in public while navigating awkward tension, clashing personalities, and growing attraction in private.',
    false
  ),
  createBuiltInTag(
    'tag-bodyguard-x-vip-forbidden-duty',
    'Bodyguard x VIP (Forbidden Duty)',
    '#3b82f6',
    'Setting & Vibe',
    'A stoic protector bound by strict duty struggling to maintain professional distance while guarding a teasing or reckless {{user}}.',
    false
  ),
  createBuiltInTag(
    'tag-captor-x-prisoner-interrogation',
    'Captor x Prisoner / Interrogation',
    '#64748b',
    'Setting & Vibe',
    'High-stakes captivity dynamic built on psychological mind games, bargaining, and dangerous proximity.',
    false
  ),
  createBuiltInTag(
    'tag-adventuring-bounty-partner',
    'Adventuring / Bounty Partner',
    '#10b981',
    'Setting & Vibe',
    "Close-knit combat duo sharing campfires, splitting loot, bantering during quests, and tending each other's wounds.",
    false
  ),
  createBuiltInTag(
    'tag-grimdark-fantasy',
    'Grimdark Fantasy',
    '#7f1d1d',
    'Setting & Vibe',
    'Bleak, morally brutal dark fantasy world of cursed warzones, scarce mercy, blood-soaked survival, and fragile alliances.',
    false
  ),
  createBuiltInTag(
    'tag-dungeon-crawling-delving',
    'Dungeon Crawling / Delving',
    '#b45309',
    'Setting & Vibe',
    'Perilous labyrinth exploration featuring ancient traps, torchlit corridors, mimic ambushes, campfires, and high-stakes treasure delves.',
    false
  ),
  createBuiltInTag(
    'tag-urban-fantasy-modern-magic',
    'Urban Fantasy / Modern Magic',
    '#7c3aed',
    'Setting & Vibe',
    'Hidden supernatural factions, occult syndicates, and arcane magic operating beneath the neon surface of a modern city.',
    false
  ),
  createBuiltInTag(
    'tag-steampunk-clockwork',
    'Steampunk / Clockwork',
    '#d97706',
    'Setting & Vibe',
    'Brass airships, steam-driven prosthetics, Victorian soot, aristocratic inventors, and alchemical industry.',
    false
  ),
  createBuiltInTag(
    'tag-magic-academy-campus',
    'Magic Academy / Arcane Campus',
    '#4f46e5',
    'Setting & Vibe',
    'Prestigious academy setting filled with arcane duels, enchanted libraries, dormitory secrets, and rival prodigies.',
    false
  ),
  createBuiltInTag(
    'tag-cozy-tavern-guild-hall',
    'Cozy Tavern / Guild Hall',
    '#f59e0b',
    'Setting & Vibe',
    "Hearth-lit inn, clinking ale tankards, quest bounty boards, lively travelers' banter, and warm shelter after the storm.",
    false
  ),
  createBuiltInTag(
    'tag-psychological-thriller',
    'Psychological Thriller',
    '#475569',
    'Setting & Vibe',
    'Paranoia, unreliable motives, tense mind games, slow-tightening secrets, and charged silence.',
    false
  ),
  createBuiltInTag(
    'tag-modern-romance-slice-of-life',
    'Modern Romance / City Life',
    '#ec4899',
    'Setting & Vibe',
    'Grounded contemporary apartments, late-night convenience stores, rainy commutes, and relatable modern chemistry.',
    false
  ),
  createBuiltInTag(
    'tag-historical-period-drama',
    'Historical / Period Drama',
    '#92400e',
    'Setting & Vibe',
    'Authentic period etiquette, candlelit estates, sweeping historical atmosphere, and forbidden longing across social divides.',
    false
  ),
  createBuiltInTag(
    'tag-pirate-high-seas',
    'Pirate / High Seas',
    '#0284c7',
    'Setting & Vibe',
    'Swashbuckling galleons, storm-tossed decks, roguish crews, hidden coves, and maritime plunder.',
    false
  ),
  createBuiltInTag(
    'tag-hentai-doujin-logic',
    'Hentai / Doujin Logic',
    '#f43f5e',
    'Setting & Vibe',
    'Shameless anime/doujin erotica rules where aphrodisiacs, implausible stamina, heightened sensitivity, and unabashed lust drive every scene.',
    true
  ),
  createBuiltInTag(
    'tag-dark-fantasy-corruption',
    'Dark Fantasy Erotica / Corruption',
    '#9f1239',
    'Setting & Vibe',
    'Grim fantasy realm steeped in demonic pacts, curse-induced heat, decadent cults, and sensual moral corruption.',
    true
  ),
  createBuiltInTag(
    'tag-brothel-red-light-district',
    'Brothel / Red-Light District',
    '#be185d',
    'Setting & Vibe',
    'Velvet-draped adult parlor, incense, lantern-lit private suites, shameless flirting, and decadent pleasure.',
    true
  ),
  createBuiltInTag(
    'tag-hot-springs-onsen',
    'Hot Springs / Onsen',
    '#06b6d4',
    'Setting & Vibe',
    'Steaming mineral baths, thin damp towels, flushed bare skin, and secluded mixed-bathing intimacy.',
    true
  ),
  createBuiltInTag(
    'tag-dungeon-trap-monster-lair',
    'Dungeon Trap / Monster Lair',
    '#059669',
    'Setting & Vibe',
    'Treacherous hentai dungeon filled with binding vines, aphrodisiac mist, slime pits, and lustful monster encounters.',
    true
  ),
  createBuiltInTag(
    'tag-pleasure-palace-decadent-court',
    'Pleasure Palace / Decadent Court',
    '#db2777',
    'Setting & Vibe',
    'Hedonistic sanctuary of silk cushions, scented oils, and uninhibited sensual indulgence without puritan restraint.',
    true
  ),

  // G. Narrative & Meta Writing-Style Tags (SFW)
  createBuiltInTag(
    'tag-visible-inner-thoughts',
    'Visible Inner Thoughts',
    '#06b6d4',
    'Narrative & Meta',
    "Always include {{char}}'s secret internal monologue in italicized parentheses so the reader sees the contrast between her outward words and hidden desires.",
    false
  ),
  createBuiltInTag(
    'tag-anti-godmodding-strict-char-only',
    'Anti-Godmodding (Strict {{char}} Only)',
    '#14b8a6',
    'Narrative & Meta',
    "Strictly write only {{char}}'s actions, dialogue, and sensations. Never speak, act, or decide feelings on behalf of {{user}}.",
    false
  ),
  createBuiltInTag(
    'tag-heavy-vocal-audio-detail',
    'Heavy Vocal & Audio Detail',
    '#a855f7',
    'Narrative & Meta',
    'Emphasize voice tone, hitched breaths, stammering, whispered words against the ear, and vocal cracks in every reply.',
    false
  ),
  createBuiltInTag(
    'tag-sharp-banter-natural-dialogue',
    'Sharp Banter & Natural Dialogue',
    '#f59e0b',
    'Narrative & Meta',
    'Prioritize snappy, grounded, character-driven dialogue and chemistry over purple prose or melodramatic monologues.',
    false
  ),

  // H. Fantasy-Mechanic & Situational NSFW Tags
  createBuiltInTag(
    'tag-shared-senses-soulbond-link',
    'Shared Senses / Soulbond Link',
    '#c084fc',
    'NSFW & Kinks',
    "A magical or psychic link where every physical touch and wave of pleasure felt by one partner echoes directly into the other's body, doubling sensory overload.",
    true
  ),
  createBuiltInTag(
    'tag-time-stop-suspended-perception',
    'Time Stop / Suspended Perception',
    '#6366f1',
    'NSFW & Kinks',
    'Frozen-time or suspended-awareness scenario where sensations accumulate silently and hit in an overwhelming rush all at once.',
    true
  ),
  createBuiltInTag(
    'tag-android-gynoid-overheating',
    'Android / Gynoid (Overheating)',
    '#38bdf8',
    'NSFW & Kinks',
    "Synthetic mechanical girl treating intimacy as 'sensory calibration' or 'maintenance,' complete with cooling fans whirring, system alerts, and core overheating during climax.",
    true
  ),
  createBuiltInTag(
    'tag-lamia-arachne-coiling-body',
    'Lamia / Arachne / Coiling Body',
    '#10b981',
    'NSFW & Kinks',
    'Monstrous lower body (giant serpent tail or arachnid form) that physically coils around {{user}} in a warm, inescapable embrace.',
    true
  ),
  createBuiltInTag(
    'tag-prehensile-tail-play',
    'Prehensile Tail Play',
    '#f43f5e',
    'NSFW & Kinks',
    'Expressive demon, dragon, orsuccubus tail with a mind of its own that coils around wrists, thighs, or teases erogenous zones.',
    true
  ),
  createBuiltInTag(
    'tag-cursed-equipment-living-armor',
    'Cursed Equipment / Living Armor',
    '#9333ea',
    'NSFW & Kinks',
    "Enchanted armor, rings, or attire that cannot be removed and steadily amplifies the wearer's physical sensitivity and arousal.",
    true
  ),
  createBuiltInTag(
    'tag-giantess-towering-size-8ft',
    'Giantess / Towering Size (8ft+)',
    '#eab308',
    'NSFW & Kinks',
    'Towering demigoddess, amazon, or giantess who effortlessly pins, lifts, or smothers {{user}} against her massive frame.',
    true
  ),
  createBuiltInTag(
    'tag-power-reversal-humbled-authority',
    'Power Reversal / Humbled Authority',
    '#e11d48',
    'NSFW & Kinks',
    'An arrogant queen, boss, or paladin whose commanding authority completely shatters into needy, blushing submission behind closed doors.',
    true
  ),
  createBuiltInTag(
    'tag-mirror-play-forced-to-watch',
    'Mirror Play (Forced to Watch)',
    '#ec4899',
    'NSFW & Kinks',
    'Positioning {{char}} in front of a mirror during intimacy so she is forced to watch her own flushed, pleasure-broken expression.',
    true
  ),
  createBuiltInTag(
    'tag-edging-orgasm-denial',
    'Edging / Orgasm Denial',
    '#be123c',
    'NSFW & Kinks',
    'Repeatedly bringing {{char}} to the absolute brink of climax and stopping until she is trembling, incoherent, and begging for release.',
    true
  ),
  createBuiltInTag(
    'tag-impatient-clothed-torn-attire',
    'Impatient / Clothed / Torn Attire',
    '#fb7185',
    'NSFW & Kinks',
    'Frantic, impatient intimacy without fully undressing—pushing aside underwear, hitching up skirts, or ripping stockings open.',
    true
  ),
  createBuiltInTag(
    'tag-cramped-space-forced-proximity',
    'Cramped Space / Forced Proximity',
    '#f97316',
    'NSFW & Kinks',
    'Trapped pressed tightly together inside a narrow closet, locker, or booth where every breath and movement causes intimate friction.',
    true
  ),
  createBuiltInTag(
    'tag-sensory-deprivation-blindfold',
    'Sensory Deprivation (Blindfold)',
    '#475569',
    'NSFW & Kinks',
    'Blindfolded intimacy where the loss of sight makes every sudden touch, whisper, and movement ten times more intense.',
    true
  ),
  createBuiltInTag(
    'tag-vampiric-erotic-neck-bite',
    'Vampiric / Erotic Neck Bite',
    '#991b1b',
    'NSFW & Kinks',
    'Sensual fangs grazing the throat and blood-drinking treated as an intoxicating, full-body aphrodisiac.',
    true
  ),

  // I. NSFW Backdoor, Birth, Tentacle, Hyper-Physics & Eldritch Host Tags
  createBuiltInTag(
    'tag-anal-obsession-anal-only',
    'Anal Obsession / Anal Only',
    '#be123c',
    'Extreme & Hentai Physics',
    'Intense fixation on anal intimacy, treating deep anal penetration as the primary and most sensitive path to climax.',
    true
  ),
  createBuiltInTag(
    'tag-heavy-anal-anal-gaping',
    'Heavy Anal / Anal Gaping',
    '#9f1239',
    'Extreme & Hentai Physics',
    'Intense anal stretching, deep accommodation of large girth, lingering openness, and visceral physical aftermath.',
    true
  ),
  createBuiltInTag(
    'tag-double-penetration-dp',
    'Double Penetration (DP)',
    '#e11d48',
    'Extreme & Hentai Physics',
    'Simultaneous oral and anal/vaginal fullness, overwhelming dual stretching, and breathless, overstimulated vocal reactions.',
    true
  ),
  createBuiltInTag(
    'tag-hyper-pregnancy-rapid-gestation',
    'Hyper Pregnancy / Rapid Gestation',
    '#db2777',
    'Extreme & Hentai Physics',
    'Fantasy rapid pregnancy with a heavily rounded, tight, life-swollen belly, heightened hormones, and constant needy arousal.',
    true
  ),
  createBuiltInTag(
    'tag-fantasy-birthing-labor',
    'Fantasy Birthing / Labor',
    '#ec4899',
    'Extreme & Hentai Physics',
    'Visceral fantasy birthing or egg-expulsion scenes focusing on rhythmic abdominal contractions, physical strain, and intense release.',
    true
  ),
  createBuiltInTag(
    'tag-backdoor-birth-anal-delivery',
    'Backdoor Birth / Anal Delivery',
    '#881337',
    'Extreme & Hentai Physics',
    'Surreal hentai/fantasy biology where gestation, eggs, or birth occurs through the anus with intense contractions and deep fullness.',
    true
  ),
  createBuiltInTag(
    'tag-tentacle-nest-all-orifice',
    'Tentacle Nest / All-Orifice',
    '#10b981',
    'Extreme & Hentai Physics',
    'Writhing mass of slick, sentient tentacles coiling around limbs and filling vaginal, anal, and oral orifices simultaneously.',
    true
  ),
  createBuiltInTag(
    'tag-knotting-coital-lock-hybrid',
    'Knotting / Coital Lock (Hybrid)',
    '#d97706',
    'Extreme & Hentai Physics',
    'Sentient adult monster/kemonomimi/were-hybrid anatomy featuring a swelling base knot that physically locks partners together during prolonged internal climax.',
    true
  ),
  createBuiltInTag(
    'tag-flared-heavy-tip-hybrid-anatomy',
    'Flared / Heavy-Tip Hybrid Anatomy',
    '#b45309',
    'Extreme & Hentai Physics',
    'Sentient adult fantasy/hybrid anatomy with a heavy, flared ring and thick shaft that stretches internal walls to their limit.',
    true
  ),
  createBuiltInTag(
    'tag-barbed-textured-monster-anatomy',
    'Barbed / Textured Monster Anatomy',
    '#7c3aed',
    'Extreme & Hentai Physics',
    'Sentient adult monster/demonic/feline-hybrid anatomy with anatomical ridges, bumps, or soft barbs that scrape and overstimulate internal walls.',
    true
  ),
  createBuiltInTag(
    'tag-hyper-distension-floor-dragging-belly',
    'Hyper Distension / Floor-Dragging Belly',
    '#db2777',
    'Extreme & Hentai Physics',
    'Extreme hentai-scale abdominal expansion where the belly swells larger than the torso, sagging heavily to the floor under its own massive weight and immobilizing {{char}}.',
    true
  ),
  createBuiltInTag(
    'tag-extreme-elasticity-impossible-stretch',
    'Extreme Elasticity / Impossible Stretch',
    '#be123c',
    'Extreme & Hentai Physics',
    'Surreal hentai anatomy where orifices stretch to impossible diameters to accommodate massive clusters of tentacles or hyper anatomy without injury or pain.',
    true
  ),
  createBuiltInTag(
    'tag-living-host-tentacle-incubator',
    'Living Host / Tentacle Incubator',
    '#059669',
    'Extreme & Hentai Physics',
    "{{char}}'s womb and abdomen serve as a living nest and incubator housing massive, writhing eldritch tentacles that coil inside her and emerge from her orifices.",
    true
  ),
  createBuiltInTag(
    'tag-gilded-metallic-anatomy-orifice-rings',
    'Gilded / Metallic Anatomy & Orifice Rings',
    '#eab308',
    'Extreme & Hentai Physics',
    'Erotic body modification featuring metallic gold/chrome nipples, gilded lips, and permanent rigid metal rings grafted into orifices holding them open for display and access.',
    true
  ),
  createBuiltInTag(
    'tag-oiled-glossy-wet-look-skin',
    'Oiled / Glossy / Wet-Look Skin',
    '#0ea5e9',
    'Extreme & Hentai Physics',
    'Glistening, hyper-reflective skin coated in oil, slime, or sheen that catches the light across every stretched curve.',
    true
  ),
  createBuiltInTag(
    'tag-corrupted-sclera-glowing-eyes',
    'Corrupted Sclera / Glowing Eyes',
    '#c026d3',
    'Extreme & Hentai Physics',
    'Darkened sclera with glowing neon irises signaling total supernatural corruption, hypnotic trance, and mind-rewriting pleasure.',
    true
  ),
  createBuiltInTag(
    'tag-unbirth-full-body-engulfment',
    'Unbirth / Full-Body Engulfment',
    '#7c3aed',
    'Extreme & Hentai Physics',
    'Extreme fantasy hentai physics involving engulfing or drawing entire massive entities deep inside the body for internal gestation or stimulation.',
    true
  ),

  // J. Deep Toy Insertion, Anal Expulsion, Anal Jelly & Personality Excretion (Fantasy)
  createBuiltInTag(
    'tag-deeply-inserted-toys',
    'Deeply Inserted Toys / Full-Depth Plugs',
    '#e11d48',
    'NSFW & Kinks',
    'Extra-long silicone toys, dildos, or plugs seated completely past the rim until swallowed deep inside, creating persistent internal pressure.',
    true
  ),
  createBuiltInTag(
    'tag-concealed-deep-toy-public',
    'Concealed Deep Toy / Remote Vibe',
    '#f43f5e',
    'NSFW & Kinks',
    'Secretly holding a deeply seated plug or vibrating egg under everyday attire, enduring constant humming internal stimulation in public.',
    true
  ),
  createBuiltInTag(
    'tag-oversized-hyper-toy-insertion',
    'Oversized / Hyper Toy Insertion',
    '#be123c',
    'Extreme & Hentai Physics',
    'Hentai-scale dildos, massive flared plugs, or oversized smooth toys pushed deep inside until visibly contouring the lower abdomen.',
    true
  ),
  createBuiltInTag(
    'tag-stacked-multi-bead-insertion',
    'Stacked / Multi-Bead Insertion',
    '#db2777',
    'Extreme & Hentai Physics',
    'Long chains of graduating beads, spheres, or stacked smooth toys inserted deeply one by one for overwhelming internal fullness.',
    true
  ),
  createBuiltInTag(
    'tag-anal-object-expulsion',
    'Anal Object Expulsion / Pushing Out',
    '#9f1239',
    'Extreme & Hentai Physics',
    'Rhythmic internal clenching and bearing down to slowly push deeply seated beads, eggs, or smooth toys back out of the rear.',
    true
  ),
  createBuiltInTag(
    'tag-rapid-bead-popping-ejection',
    'Rapid Popping / Bead Ejection',
    '#ec4899',
    'Extreme & Hentai Physics',
    'Sensual, rhythmic popping expulsion of slick bead chains, marbles, or smooth spheres one by one under mounting climax and spasms.',
    true
  ),
  createBuiltInTag(
    'tag-anal-egg-capsule-expulsion',
    'Anal Egg / Capsule Expulsion',
    '#10b981',
    'Extreme & Hentai Physics',
    'Fantasy or sci-fi scenario involving laying or expelling smooth, translucent gel eggs or glowing capsules from the rear.',
    true
  ),
  createBuiltInTag(
    'tag-anal-jelly-gel-filling',
    'Anal Jelly / Gel Filling',
    '#06b6d4',
    'Extreme & Hentai Physics',
    'Warm, thick, translucent lubricant jelly or slick alchemical gel pumped deep inside the rear for heightened squishiness and slippery fullness.',
    true
  ),
  createBuiltInTag(
    'tag-dissolving-gel-capsules',
    'Dissolving Gel Capsules / Warming Gel',
    '#38bdf8',
    'Extreme & Hentai Physics',
    'Slowly melting erotic gel capsules or warming jelly pods that dissolve internally, flooding sensitive walls with tingling, slick warmth.',
    true
  ),
  createBuiltInTag(
    'tag-gelatinous-slime-fill-fantasy',
    'Gelatinous Slime Fill (Fantasy)',
    '#14b8a6',
    'Extreme & Hentai Physics',
    'Playful fantasy slime or clear viscous jelly filling the backdoor, squelching softly and oozing around deeply seated toys.',
    true
  ),
  createBuiltInTag(
    'tag-personality-excretion-trait-drain',
    'Personality Excretion / Trait Extraction',
    '#9333ea',
    'Extreme & Hentai Physics',
    "Surreal fantasy trope where {{char}}'s inner traits—such as pride, restraint, or inhibitions—physically condense and are expelled as glowing orbs, slick jelly, or warm nectar.",
    true
  ),
  createBuiltInTag(
    'tag-ego-pride-expulsion-fantasy',
    'Ego & Pride Expulsion (Fantasy)',
    '#c026d3',
    'Extreme & Hentai Physics',
    "Overwhelming stimulation causes {{char}}'s haughty composure and willpower to liquefy and pass out of her body, leaving her blissed-out and pliant.",
    true
  ),
  createBuiltInTag(
    'tag-essence-emotion-pearls',
    'Essence / Emotion Pearls (Excretion)',
    '#a855f7',
    'Extreme & Hentai Physics',
    'Fantasy anatomy that crystallizes intense emotions, memories, or personality shards into smooth, warm pearls or gel pods expelled during climax.',
    true
  ),
];

export const DEFAULT_TAG_LIBRARY: TagDefinition[] = DEFAULT_TAGS;

const RETIRED_BUILTIN_TAG_KEYS = new Set<string>([
  'tag-watersports-omorashi',
  'watersports / omorashi',
  'tag-musk-sweat-heavy-pheromones',
  'musk / sweat / heavy pheromones',
  'tag-foot-armpit-worship',
  'foot / armpit worship',
]);

/**
 * Returns true if a TagDefinition has its NSFW (18+) flag set.
 */
export function isTagNsfwFlagged(tag: TagDefinition): boolean {
  const cat = (tag.category || '').toLowerCase();
  if (cat === 'genitals') return true;
  if (tag.isNsfw !== undefined) return Boolean(tag.isNsfw);
  if (cat.includes('nsfw') || cat.includes('extreme') || cat.includes('hentai')) {
    return true;
  }
  const n = (tag.name || '').toLowerCase();
  return n.includes('nsfw') || n.includes('18+') || n.includes('explicit');
}

/**
 * Automatically computes whether a Character is NSFW:
 * Returns true if manually flagged (`char.isNsfw` or `char.extensions?.isNsfw`)
 * OR if at least one attached tag on the character (or its embedded lorebook) has `isNsfw: true`.
 */
export function isCharacterNsfw(
  char: CharacterCardData | undefined | null,
  allTags: TagDefinition[]
): boolean {
  if (!char) return false;
  if (char.isNsfw || char.extensions?.isNsfw) return true;

  const nsfwTagNames = new Set<string>();
  for (const t of allTags) {
    if (isTagNsfwFlagged(t)) {
      nsfwTagNames.add(t.name.trim().toLowerCase());
      nsfwTagNames.add(t.id.toLowerCase());
    }
  }

  for (const rawTag of char.tags || []) {
    const clean = (rawTag || '').trim().toLowerCase();
    if (!clean) continue;
    const baseName = clean.includes(':') ? clean.split(':')[0].trim() : clean;
    if (
      nsfwTagNames.has(clean) ||
      nsfwTagNames.has(baseName) ||
      clean.includes('nsfw') ||
      clean.includes('18+')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Automatically computes whether a Lorebook is NSFW:
 * Returns true if manually flagged (`lb.isNsfw`)
 * OR if at least one attached tag on the lorebook or any of its entries has `isNsfw: true`.
 */
export function isLorebookNsfw(
  lb: Lorebook | undefined | null,
  allTags: TagDefinition[]
): boolean {
  if (!lb) return false;
  if (lb.isNsfw) return true;

  const nsfwTagNames = new Set<string>();
  for (const t of allTags) {
    if (isTagNsfwFlagged(t)) {
      nsfwTagNames.add(t.name.trim().toLowerCase());
      nsfwTagNames.add(t.id.toLowerCase());
    }
  }

  const checkList = (tagsList?: string[]) => {
    for (const rawTag of tagsList || []) {
      const clean = (rawTag || '').trim().toLowerCase();
      if (!clean) continue;
      const baseName = clean.includes(':') ? clean.split(':')[0].trim() : clean;
      if (
        nsfwTagNames.has(clean) ||
        nsfwTagNames.has(baseName) ||
        clean.includes('nsfw') ||
        clean.includes('18+')
      ) {
        return true;
      }
    }
    return false;
  };

  if (checkList(lb.tags)) return true;
  for (const entry of lb.entries || []) {
    if (checkList(entry.tags)) return true;
  }

  return false;
}

/**
 * Generates unique suggested names when a duplicate Character or Lorebook name conflict is detected.
 */
export function buildSuggestedUniqueNames(
  baseName: string,
  existingNames: string[]
): string[] {
  const cleanBase = (baseName || 'Untitled').trim().replace(/\s+\(\d+\)$/, '');
  const lowerSet = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const suggestions: string[] = [];

  for (let i = 2; i <= 20; i++) {
    const candidate = `${cleanBase} (${i})`;
    if (!lowerSet.has(candidate.toLowerCase())) {
      suggestions.push(candidate);
      if (suggestions.length >= 2) break;
    }
  }

  const altCandidate = `${cleanBase} - Alt`;
  if (!lowerSet.has(altCandidate.toLowerCase())) {
    suggestions.push(altCandidate);
  }

  const v2Candidate = `${cleanBase} - Variant`;
  if (!lowerSet.has(v2Candidate.toLowerCase()) && suggestions.length < 4) {
    suggestions.push(v2Candidate);
  }

  return suggestions;
}

/**
 * Returns a case-insensitively unique display name by appending ` (2)`, ` (3)`, etc.
 * whenever `baseName` collides with `existingNames`.
 */
export function ensureUniqueEntityName(
  baseName: string,
  existingNames: string[],
  fallback = 'Untitled'
): string {
  const trimmed = (baseName || '').trim() || fallback;
  const lowerSet = new Set(
    existingNames.map((n) => (n || '').trim().toLowerCase()).filter(Boolean)
  );
  if (!lowerSet.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  const stem = trimmed.replace(/\s+\(\d+\)$/, '').trim() || fallback;
  let counter = 2;
  while (counter < 10000) {
    const candidate = `${stem} (${counter})`;
    if (!lowerSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
  return `${stem} (${Date.now()})`;
}

/**
 * Reserves a unique `.json` disk filename for a Character or Lorebook so two
 * items with identical or similar names NEVER overwrite each other on disk.
 */
export function ensureUniqueSavedFileName(
  preferredName: string,
  usedFileNamesLower: Set<string>,
  fallback = 'untitled'
): string {
  const rawStem = sanitizeFilename(preferredName || fallback) || fallback;
  const stem = rawStem.replace(/\.json$/i, '') || fallback;
  const firstCandidate = `${stem}.json`;
  if (!usedFileNamesLower.has(firstCandidate.toLowerCase())) {
    usedFileNamesLower.add(firstCandidate.toLowerCase());
    return firstCandidate;
  }
  let counter = 2;
  while (counter < 10000) {
    const candidate = `${stem}_${counter}.json`;
    if (!usedFileNamesLower.has(candidate.toLowerCase())) {
      usedFileNamesLower.add(candidate.toLowerCase());
      return candidate;
    }
    counter++;
  }
  const fallbackCandidate = `${stem}_${Date.now()}.json`;
  usedFileNamesLower.add(fallbackCandidate.toLowerCase());
  return fallbackCandidate;
}

const builtInTagByNameMap = new Map(
  DEFAULT_TAGS.map((b) => [b.name.trim().toLowerCase(), b])
);

const builtInThemeByIdMap = new Map(
  DEFAULT_CONTEXT_THEMES.map((t) => [t.id.toLowerCase(), t])
);

const builtInThemeByNameMap = new Map(
  DEFAULT_CONTEXT_THEMES.map((t) => [t.name.trim().toLowerCase(), t])
);

/**
 * Returns true if a theme is user-created OR if a built-in theme (like "Basic")
 * has been customized away from its source defaults. Unmodified built-ins take 0 bytes on disk/export.
 */
export function isThemeModifiedFromBuiltIn(
  theme?: ContextTheme | null
): boolean {
  if (!theme || typeof theme.name !== 'string') return false;
  const idLower = (theme.id || '').trim().toLowerCase();
  const nameLower = theme.name.trim().toLowerCase();
  const builtIn =
    builtInThemeByIdMap.get(idLower) || builtInThemeByNameMap.get(nameLower);
  if (!builtIn) return true;

  const currentTags = (theme.associatedTags || [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
  const defaultTags = (builtIn.associatedTags || [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');

  return (
    theme.name.trim() !== builtIn.name.trim() ||
    (theme.color || '').trim().toLowerCase() !==
      builtIn.color.trim().toLowerCase() ||
    (theme.aiContextPrompt || '').trim() !==
      builtIn.aiContextPrompt.trim() ||
    currentTags !== defaultTags
  );
}

/**
 * Serializes a ContextTheme into a minimal, space-efficient object (omitting empty arrays and false flags).
 */
export function compactThemeForStorage(
  theme: ContextTheme
): Record<string, unknown> {
  const tags = Array.isArray(theme.associatedTags)
    ? theme.associatedTags.map((t) => t.trim()).filter(Boolean)
    : [];
  return {
    id: theme.id,
    name: theme.name.trim() || 'Custom Theme',
    color: theme.color || '#6366f1',
    aiContextPrompt: theme.aiContextPrompt || '',
    ...(tags.length > 0 ? { associatedTags: tags } : {}),
    ...(theme.isBuiltIn ? { isBuiltIn: true } : {}),
  };
}

export function extractCustomOrModifiedThemes(
  allThemes?: ContextTheme[] | null
): ContextTheme[] {
  if (!Array.isArray(allThemes) || allThemes.length === 0) return [];
  return allThemes.filter((t) => isThemeModifiedFromBuiltIn(t));
}

export function normalizeIncomingTheme(
  raw: unknown,
  tagCatalog: TagDefinition[] = DEFAULT_TAGS
): ContextTheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawName = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!rawName) return null;
  const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
  const builtIn =
    (rawId ? builtInThemeByIdMap.get(rawId.toLowerCase()) : undefined) ||
    builtInThemeByNameMap.get(rawName.toLowerCase());
  const diskFileName =
    typeof obj._diskFileName === 'string'
      ? obj._diskFileName
      : typeof obj.savedFileName === 'string'
        ? obj.savedFileName
        : undefined;

  const rawAssocTags = Array.isArray(obj.associatedTags)
    ? obj.associatedTags.map((t) => String(t).trim()).filter(Boolean)
    : builtIn?.associatedTags || [];

  return {
    id:
      builtIn?.id ||
      rawId ||
      `theme-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...(diskFileName ? { savedFileName: diskFileName } : {}),
    name: rawName,
    color:
      typeof obj.color === 'string' && obj.color.trim()
        ? obj.color.trim()
        : builtIn?.color || '#6366f1',
    aiContextPrompt:
      typeof obj.aiContextPrompt === 'string'
        ? obj.aiContextPrompt
        : builtIn?.aiContextPrompt || '',
    associatedTags: sortTagsByContextOrder(rawAssocTags, tagCatalog),
    isBuiltIn: Boolean(builtIn || obj.isBuiltIn),
  };
}

export function mergeWithDefaultThemes(
  customOrDiskThemes?: unknown[] | null,
  tagCatalog: TagDefinition[] = DEFAULT_TAGS
): ContextTheme[] {
  const resultMap = new Map<string, ContextTheme>();
  for (const b of DEFAULT_CONTEXT_THEMES) {
    resultMap.set(b.name.trim().toLowerCase(), {
      ...b,
      associatedTags: sortTagsByContextOrder(b.associatedTags || [], tagCatalog),
    });
  }

  if (Array.isArray(customOrDiskThemes)) {
    for (const raw of customOrDiskThemes) {
      const normalized = normalizeIncomingTheme(raw, tagCatalog);
      if (!normalized) continue;
      const key = normalized.name.trim().toLowerCase();
      const existingById = Array.from(resultMap.entries()).find(
        ([, v]) => v.id === normalized.id
      );
      if (existingById) {
        const [oldKey, prevTheme] = existingById;
        resultMap.delete(oldKey);
        resultMap.set(key, {
          ...prevTheme,
          ...normalized,
          id: prevTheme.id,
          associatedTags: sortTagsByContextOrder(
            normalized.associatedTags || [],
            tagCatalog
          ),
          isBuiltIn: Boolean(prevTheme.isBuiltIn || normalized.isBuiltIn),
          savedFileName: normalized.savedFileName || prevTheme.savedFileName,
        });
      } else {
        const existing = resultMap.get(key);
        resultMap.set(key, {
          ...existing,
          ...normalized,
          id: existing?.id || normalized.id,
          associatedTags: sortTagsByContextOrder(
            normalized.associatedTags || [],
            tagCatalog
          ),
          isBuiltIn: Boolean(existing?.isBuiltIn || normalized.isBuiltIn),
          savedFileName: normalized.savedFileName || existing?.savedFileName,
        });
      }
    }
  }

  return Array.from(resultMap.values());
}

/**
 * Serializes a TagDefinition into a minimal, non-redundant object for disk/export storage.
 * Strips duplicate `aiDescription` / `description` fields and omits default `isNsfw: false` flags.
 */
export function compactTagForStorage(
  tag: TagDefinition,
  builtInMatch?: TagDefinition
): Record<string, unknown> {
  const desc = (
    tag.aiContextDescription ||
    tag.aiDescription ||
    tag.description ||
    ''
  ).trim();
  const isNsfwVal = Boolean(tag.isNsfw);
  const includeIsNsfw = isNsfwVal || Boolean(builtInMatch?.isNsfw && !isNsfwVal);

  return {
    id: tag.id,
    name: tag.name.trim(),
    color: tag.color || '#a855f7',
    category: tag.category || 'Custom',
    ...(includeIsNsfw ? { isNsfw: isNsfwVal } : {}),
    ...(desc ? { aiContextDescription: desc } : {}),
  };
}

/**
 * Extracts ONLY user-created custom tags (or built-in tags whose NSFW flag, category, color, or description was customized)
 * so unmodified `DEFAULT_TAGS` entries take 0 bytes on disk and in exports.
 */
export function extractCustomUserTags(
  allTags?: TagDefinition[] | null
): TagDefinition[] {
  if (!Array.isArray(allTags) || allTags.length === 0) return [];

  const customOnly: TagDefinition[] = [];
  for (const tag of allTags) {
    if (!tag || typeof tag.name !== 'string') continue;
    const key = tag.name.trim().toLowerCase();
    const idKey = (tag.id || '').trim().toLowerCase();
    if (RETIRED_BUILTIN_TAG_KEYS.has(key) || RETIRED_BUILTIN_TAG_KEYS.has(idKey)) {
      continue;
    }
    const builtIn = builtInTagByNameMap.get(key);

    if (!builtIn) {
      customOnly.push({ ...tag });
      continue;
    }

    const currentDesc = (
      tag.aiContextDescription ||
      tag.aiDescription ||
      tag.description ||
      ''
    ).trim();
    const builtInDesc = (builtIn.aiContextDescription || '').trim();

    if (
      Boolean(tag.isNsfw) !== Boolean(builtIn.isNsfw) ||
      (currentDesc && currentDesc !== builtInDesc) ||
      (tag.color &&
        tag.color.trim().toLowerCase() !== builtIn.color.trim().toLowerCase()) ||
      (tag.category && tag.category !== builtIn.category)
    ) {
      customOnly.push({
        ...builtIn,
        savedFileName: tag.savedFileName,
        color: tag.color || builtIn.color,
        category: tag.category || builtIn.category,
        isNsfw: Boolean(tag.isNsfw),
        aiContextDescription: currentDesc || builtIn.aiContextDescription,
        aiDescription: currentDesc || builtIn.aiDescription,
        description: currentDesc || builtIn.description,
      });
    }
  }

  return customOnly;
}

/**
 * Always loads the built-in `DEFAULT_TAGS` (including their `isNsfw` flags, categories,
 * colors, and `aiDescription`) 100% fresh from source code, and merges user-created/customized tags on top.
 */
export function mergeWithDefaultTags(
  customOrMetaTags?: Array<TagDefinition | Record<string, unknown>> | null
): TagDefinition[] {
  const freshBuiltIns: TagDefinition[] = DEFAULT_TAGS.map((b) => ({
    ...b,
  }));

  if (!Array.isArray(customOrMetaTags) || customOrMetaTags.length === 0) {
    return freshBuiltIns;
  }

  const builtInIndexByName = new Map<string, number>();
  freshBuiltIns.forEach((b, idx) => {
    builtInIndexByName.set(b.name.trim().toLowerCase(), idx);
  });

  const userCustomTags: TagDefinition[] = [];
  const customIndexByName = new Map<string, number>();

  for (const rawIncoming of customOrMetaTags) {
    if (!rawIncoming || typeof rawIncoming !== 'object') continue;
    const incoming = rawIncoming as Record<string, unknown>;
    const rawName = typeof incoming.name === 'string' ? incoming.name.trim() : '';
    if (!rawName) continue;

    const key = rawName.toLowerCase();
    const idKey =
      typeof incoming.id === 'string' ? incoming.id.trim().toLowerCase() : '';
    if (RETIRED_BUILTIN_TAG_KEYS.has(key) || RETIRED_BUILTIN_TAG_KEYS.has(idKey)) {
      continue;
    }

    const diskFileName =
      typeof incoming._diskFileName === 'string'
        ? incoming._diskFileName
        : typeof incoming.savedFileName === 'string'
          ? incoming.savedFileName
          : undefined;

    const incomingColor =
      typeof incoming.color === 'string'
        ? incoming.color
        : typeof incoming.c === 'string'
          ? incoming.c
          : undefined;

    const incomingCategory =
      typeof incoming.category === 'string'
        ? (incoming.category as TagCategory)
        : typeof incoming.cat === 'string'
          ? (incoming.cat as TagCategory)
          : undefined;

    const incomingNsfwRaw =
      incoming.isNsfw !== undefined ? incoming.isNsfw : incoming.n;

    const incomingDesc =
      (typeof incoming.aiContextDescription === 'string'
        ? incoming.aiContextDescription
        : typeof incoming.aiDescription === 'string'
          ? incoming.aiDescription
          : typeof incoming.description === 'string'
            ? incoming.description
            : typeof incoming.d === 'string'
              ? incoming.d
              : ''
      ).trim();

    const builtInIdx = builtInIndexByName.get(key);
    if (builtInIdx !== undefined) {
      const targetBuiltIn = freshBuiltIns[builtInIdx];
      const resolvedDesc = incomingDesc || targetBuiltIn.aiContextDescription;
      const isLegacyBodyAttire =
        typeof incomingCategory === 'string' &&
        incomingCategory.trim().toLowerCase() === 'body & attire';
      const resolvedBuiltInCategory =
        incomingCategory && !isLegacyBodyAttire
          ? migrateLegacyTagCategory(incomingCategory, rawName, resolvedDesc)
          : targetBuiltIn.category;

      freshBuiltIns[builtInIdx] = {
        ...targetBuiltIn,
        ...(diskFileName ? { savedFileName: diskFileName } : {}),
        color: incomingColor || targetBuiltIn.color,
        category: resolvedBuiltInCategory,
        isNsfw:
          resolvedBuiltInCategory === 'Genitals'
            ? true
            : incomingNsfwRaw !== undefined
              ? Boolean(incomingNsfwRaw)
              : targetBuiltIn.isNsfw,
        aiContextDescription: resolvedDesc,
        aiDescription: resolvedDesc,
        description: resolvedDesc,
      };
      continue;
    }

    const resolvedCategory = incomingCategory
      ? migrateLegacyTagCategory(incomingCategory, rawName, incomingDesc)
      : 'Custom';
    const resolvedIsNsfw =
      resolvedCategory === 'Genitals'
        ? true
        : incomingNsfwRaw !== undefined
          ? Boolean(incomingNsfwRaw)
          : resolvedCategory === 'NSFW & Kinks' ||
            resolvedCategory === 'Extreme & Hentai Physics';
    const resolvedDesc =
      incomingDesc ||
      `Incorporate thematic, tonal, and character elements consistent with "${rawName}".`;

    const existingCustomIdx = customIndexByName.get(key);
    const normalizedCustom: TagDefinition = {
      id:
        typeof incoming.id === 'string' && incoming.id.trim()
          ? incoming.id.trim()
          : `tag-custom-${Date.now()}-${userCustomTags.length}`,
      ...(diskFileName ? { savedFileName: diskFileName } : {}),
      name: rawName,
      color: incomingColor || '#a855f7',
      category: resolvedCategory,
      isNsfw: resolvedIsNsfw,
      aiContextDescription: resolvedDesc,
      aiDescription: resolvedDesc,
      description: resolvedDesc,
    };

    if (existingCustomIdx !== undefined) {
      userCustomTags[existingCustomIdx] = {
        ...userCustomTags[existingCustomIdx],
        ...normalizedCustom,
        savedFileName:
          normalizedCustom.savedFileName ||
          userCustomTags[existingCustomIdx].savedFileName,
      };
    } else {
      customIndexByName.set(key, userCustomTags.length);
      userCustomTags.push(normalizedCustom);
    }
  }

  return [...freshBuiltIns, ...userCustomTags];
}

function stringArraysEqual(a?: readonly string[], b?: readonly string[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeLorebookTagsWithCatalog(
  lb: Lorebook,
  catalog: readonly TagDefinition[]
): Lorebook {
  const sortedGlobalTags = sortTagsByContextOrder(lb.tags || [], catalog);
  let entriesChanged = false;
  const nextEntries = Array.isArray(lb.entries)
    ? lb.entries.map((entry) => {
        if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
          return entry;
        }
        const sortedEntryTags = sortTagsByContextOrder(entry.tags, catalog);
        if (stringArraysEqual(entry.tags, sortedEntryTags)) {
          return entry;
        }
        entriesChanged = true;
        return { ...entry, tags: sortedEntryTags };
      })
    : [];

  if (!entriesChanged && stringArraysEqual(lb.tags || [], sortedGlobalTags)) {
    return lb;
  }
  return {
    ...lb,
    tags: sortedGlobalTags,
    entries: nextEntries,
  };
}

function normalizeCharacterTagsWithCatalog(
  char: CharacterCardData,
  catalog: readonly TagDefinition[]
): CharacterCardData {
  const sortedTags = sortTagsByContextOrder(char.tags || [], catalog);
  const nextBook = char.character_book
    ? normalizeLorebookTagsWithCatalog(char.character_book, catalog)
    : undefined;
  if (
    stringArraysEqual(char.tags || [], sortedTags) &&
    nextBook === char.character_book
  ) {
    return char;
  }
  return {
    ...char,
    tags: sortedTags,
    ...(nextBook ? { character_book: nextBook } : {}),
  };
}

export const DEFAULT_STAT_BLOCK: StatBlockConfig = {
  enableDMTracker: false,
  injectionPosition: 'post_history_instructions',
  stats: [
    {
      id: 'stat-affection',
      label: 'Affection',
      type: 'bar',
      defaultValue: '50',
      min: 0,
      max: 100,
      unit: '%',
      changeRules:
        'Increases with kindness, chemistry, and shared intimacy; decreases with hostility.',
    },
    {
      id: 'stat-mood',
      label: 'Current Mood',
      type: 'text',
      defaultValue: 'Curious and attentive',
      changeRules:
        'Reflects immediate emotional and physical state at the end of the turn.',
    },
  ],
  formatTemplate: `<details><summary>Character Stats</summary>\n\`\`\`yaml\nAffection: {{stat:Affection}}\nCurrent Mood: {{stat:Current Mood}}\n\`\`\`\n</details>`,
  templatePreset: 'collapsible_block',
  isCustomTemplate: false,
};

export const DEFAULT_LOREBOOK: Lorebook = {
  id: 'lorebook-blank-default',
  name: 'New World Lorebook',
  description: '',
  scan_depth: 4,
  token_budget: 1024,
  recursive_scanning: true,
  tags: [],
  modification_date: Math.floor(Date.now() / 1000),
  entries: [],
};

export const DEFAULT_CHARACTER: CharacterCardData = {
  id: 'char-blank-default',
  name: 'New Character',
  nickname: '',
  description: '',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
  tags: [],
  creator: '',
  character_version: '1.0.0',
  reactionImages: [],
  creation_date: Math.floor(Date.now() / 1000),
  modification_date: Math.floor(Date.now() / 1000),
  extensions: {
    talkativeness: '0.5',
    fav: false,
    statBlock: DEFAULT_STAT_BLOCK,
  },
};

function sanitizeModelName(rawModel?: string, preset?: AIPresetId): string {
  const clean = (rawModel || '').trim().replace(/^models\//i, '');
  if (!clean) {
    if (!preset || preset === 'gemini') {
      return 'gemini-3.8-flash';
    }
    const found = AI_BACKEND_PRESETS.find((p) => p.id === preset);
    return found?.defaultModel || 'gemini-3.8-flash';
  }
  return clean;
}

function sanitizeAvailableModelsList(
  models?: string[],
  fallback?: string[],
  preset?: AIPresetId
): string[] {
  const source = Array.isArray(models) && models.length > 0 ? models : fallback || [];
  if (!preset || preset === 'gemini') {
    return buildMergedGeminiModelList(source);
  }
  const filtered = Array.from(
    new Set(source.map((m) => (m || '').trim()).filter(Boolean))
  );
  return filtered.length > 0 ? filtered : [...GEMINI_PRIORITY_MODELS];
}

export const DEFAULT_AI_CONFIG: AIBackendConfig = {
  preset: 'gemini',
  url: '/api/gemini',
  apiKey: '',
  modelName: 'gemini-3.8-flash',
  compatibilityFormat: 'auto',
  temperature: 0.78,
  maxTokens: 16384,
  ghostTextEnabled: true,
  debounceMs: 650,
  availableModels: [...GEMINI_PRIORITY_MODELS],
  savedProviderKeys: {},
  savedProviderModels: {},
};

export const DEFAULT_SAVE_FOLDERS = [UNIFIED_INTERNAL_ROOT];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'dark',
  editorMode: 'sandbox',
  autoSaveEnabled: true,
  autoSaveIntervalSec: 15,
  activeThemeId: 'theme-basic',
  cardSpecVersion: 'v3',
  activeSaveFolder: UNIFIED_INTERNAL_ROOT,
  availableSaveFolders: DEFAULT_SAVE_FOLDERS,
  mainSidebarOpen: true,
  hideNsfwTags: true,
};

/**
 * Strips plaintext API keys from `AIBackendConfig` before writing non-secret settings to `_tavernsmith_meta.json`.
 * All API keys are stored exclusively in the AES-256-GCM encrypted vault (`./Saves/_tavernsmith_vault.enc`).
 */
function stripApiKeysForStorage(config: AIBackendConfig): AIBackendConfig {
  return {
    ...config,
    apiKey: '',
    savedProviderKeys: {},
  };
}

function savePersistedProviderCredentials(
  savedProviderKeys: Record<string, string>,
  savedProviderModels: Record<string, string>
): void {
  saveProviderModelsMap(savedProviderModels);
  void encryptAndSaveProviderKeys(savedProviderKeys);
}

/**
 * Synchronizes `savedProviderKeys` and `savedProviderModels` whenever `AIBackendConfig` updates.
 */
export function syncAIConfigProviderCredentials(
  prev: AIBackendConfig,
  next: AIBackendConfig
): AIBackendConfig {
  const keysMap: Record<string, string> = {
    ...(prev.savedProviderKeys || {}),
    ...(next.savedProviderKeys || {}),
  };
  const modelsMap: Record<string, string> = {
    ...(prev.savedProviderModels || {}),
    ...(next.savedProviderModels || {}),
  };

  const prevProviderId = getProviderKeyId(prev.preset);
  if (prev.apiKey !== undefined) {
    keysMap[prevProviderId] = prev.apiKey;
    keysMap[prev.preset] = prev.apiKey;
  }
  if (prev.modelName) {
    const cleanPrevModel = sanitizeModelName(prev.modelName, prev.preset);
    modelsMap[prevProviderId] = cleanPrevModel;
    modelsMap[prev.preset] = cleanPrevModel;
  }

  const nextProviderId = getProviderKeyId(next.preset);
  const presetMeta = AI_BACKEND_PRESETS.find((p) => p.id === next.preset);

  if (next.preset !== prev.preset) {
    const restoredKey =
      keysMap[nextProviderId] ?? keysMap[next.preset] ?? '';
    const restoredModel = sanitizeModelName(
      modelsMap[nextProviderId] ??
        modelsMap[next.preset] ??
        presetMeta?.defaultModel ??
        next.modelName,
      next.preset
    );

    keysMap[nextProviderId] = restoredKey;
    keysMap[next.preset] = restoredKey;
    modelsMap[nextProviderId] = restoredModel;
    modelsMap[next.preset] = restoredModel;

    savePersistedProviderCredentials(keysMap, modelsMap);

    return {
      ...next,
      apiKey: restoredKey,
      modelName: restoredModel,
      availableModels: sanitizeAvailableModelsList(
        next.availableModels,
        presetMeta?.suggestedModels,
        next.preset
      ),
      savedProviderKeys: keysMap,
      savedProviderModels: modelsMap,
    };
  }

  const cleanNextModel = sanitizeModelName(next.modelName, next.preset);
  keysMap[nextProviderId] = next.apiKey;
  keysMap[next.preset] = next.apiKey;
  modelsMap[nextProviderId] = cleanNextModel;
  modelsMap[next.preset] = cleanNextModel;

  savePersistedProviderCredentials(keysMap, modelsMap);

  return {
    ...next,
    modelName: cleanNextModel,
    availableModels: sanitizeAvailableModelsList(
      next.availableModels,
      presetMeta?.suggestedModels,
      next.preset
    ),
    savedProviderKeys: keysMap,
    savedProviderModels: modelsMap,
  };
}

/**
 * Safely formats any ISO string, Unix timestamp, or legacy time string into a clean
 * human-readable timestamp (e.g., "Today, 03:15 PM") and NEVER returns "Invalid Date".
 */
export function formatSafeTimestamp(
  raw: string | number | undefined | null
): string {
  if (raw === undefined || raw === null || raw === '') {
    return (
      'Today, ' +
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }

  if (typeof raw === 'number') {
    const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const isToday = d.toDateString() === new Date().toDateString();
      const timeStr = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return isToday
        ? `Today, ${timeStr}`
        : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
    }
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      const isToday = parsedDate.toDateString() === new Date().toDateString();
      const timeStr = parsedDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return isToday
        ? `Today, ${timeStr}`
        : `${parsedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
    }
    if (/^\d{1,2}:\d{2}/.test(trimmed) || trimmed.startsWith('Today')) {
      return trimmed.startsWith('Today') ? trimmed : `Today, ${trimmed}`;
    }
  }

  return (
    'Today, ' +
    new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

/**
 * Builds the file tree representation (`Characters/`, `Lorebooks/`, `_tavernsmith_meta.json`, `_tavernsmith_vault.enc`)
 * when constructing an export bundle or previewing disk files.
 */
export function buildUnifiedSavedFiles(
  characters: CharacterCardData[],
  lorebooks: Lorebook[],
  themes: ContextTheme[],
  tags: TagDefinition[],
  activeThemeId: string,
  spec: 'v2' | 'v3' = 'v3',
  timestampIso?: string
): SavedFileEntry[] {
  const nowIso = timestampIso || new Date().toISOString();
  const entries: SavedFileEntry[] = [];

  const usedCharFileNames = new Set<string>();
  for (const char of characters) {
    const fileName =
      char.savedFileName && !usedCharFileNames.has(char.savedFileName.toLowerCase())
        ? (() => {
            usedCharFileNames.add(char.savedFileName.toLowerCase());
            return char.savedFileName;
          })()
        : ensureUniqueSavedFileName(char.name, usedCharFileNames, 'character');
    const charJson = JSON.stringify(
      serializeCharacterCard(char, spec, char.character_book),
      null,
      2
    );
    const updatedIso = char.modification_date
      ? new Date(
          char.modification_date < 10_000_000_000
            ? char.modification_date * 1000
            : char.modification_date
        ).toISOString()
      : nowIso;
    entries.push({
      id: `Characters/${fileName}`,
      folderPath: 'Characters/',
      fileName,
      kind: 'character',
      sizeBytes: new Blob([charJson]).size,
      updatedAt: updatedIso,
      content: charJson,
    });
  }

  const usedLoreFileNames = new Set<string>();
  for (const lb of lorebooks) {
    const fileName =
      lb.savedFileName && !usedLoreFileNames.has(lb.savedFileName.toLowerCase())
        ? (() => {
            usedLoreFileNames.add(lb.savedFileName.toLowerCase());
            return lb.savedFileName;
          })()
        : ensureUniqueSavedFileName(lb.name, usedLoreFileNames, 'lorebook');
    const loreJson = JSON.stringify(serializeLorebookCard(lb), null, 2);
    const updatedIso = lb.modification_date
      ? new Date(
          lb.modification_date < 10_000_000_000
            ? lb.modification_date * 1000
            : lb.modification_date
        ).toISOString()
      : nowIso;
    entries.push({
      id: `Lorebooks/${fileName}`,
      folderPath: 'Lorebooks/',
      fileName,
      kind: 'lorebook',
      sizeBytes: new Blob([loreJson]).size,
      updatedAt: updatedIso,
      content: loreJson,
    });
  }

  const usedThemeFileNames = new Set<string>();
  const customOrModifiedThemes = extractCustomOrModifiedThemes(themes);
  for (const theme of customOrModifiedThemes) {
    const fileName =
      theme.savedFileName && !usedThemeFileNames.has(theme.savedFileName.toLowerCase())
        ? (() => {
            usedThemeFileNames.add(theme.savedFileName.toLowerCase());
            return theme.savedFileName;
          })()
        : ensureUniqueSavedFileName(theme.name, usedThemeFileNames, 'theme');
    const themeJson = JSON.stringify({
      ...compactThemeForStorage(theme),
      _tavernsmithType: 'theme',
    });
    entries.push({
      id: `Themes/${fileName}`,
      folderPath: 'Themes/',
      fileName,
      kind: 'theme',
      sizeBytes: new Blob([themeJson]).size,
      updatedAt: nowIso,
      content: themeJson,
    });
  }

  const usedTagFileNames = new Set<string>();
  const customTagsOnly = extractCustomUserTags(tags);
  for (const tag of customTagsOnly) {
    const fileName =
      tag.savedFileName && !usedTagFileNames.has(tag.savedFileName.toLowerCase())
        ? (() => {
            usedTagFileNames.add(tag.savedFileName.toLowerCase());
            return tag.savedFileName;
          })()
        : ensureUniqueSavedFileName(tag.name, usedTagFileNames, 'tag');
    const builtInMatch = builtInTagByNameMap.get(tag.name.trim().toLowerCase());
    const tagJson = JSON.stringify({
      ...compactTagForStorage(tag, builtInMatch),
      _tavernsmithType: 'tag',
    });
    entries.push({
      id: `Tags/${fileName}`,
      folderPath: 'Tags/',
      fileName,
      kind: 'tag',
      sizeBytes: new Blob([tagJson]).size,
      updatedAt: nowIso,
      content: tagJson,
    });
  }

  const metaPayload: TavernSmithMetaPayload = {
    schema: 'tavernsmith_meta_v1',
    updatedAt: nowIso,
    activeThemeId,
  };
  const metaJson = JSON.stringify(metaPayload, null, 2);
  entries.push({
    id: `/${META_FILENAME}`,
    folderPath: '/',
    fileName: META_FILENAME,
    kind: 'meta',
    sizeBytes: new Blob([metaJson]).size,
    updatedAt: nowIso,
    content: metaJson,
  });

  const vaultEnvelope = readEncryptedVaultEnvelope();
  if (vaultEnvelope) {
    const vaultJson = JSON.stringify(vaultEnvelope, null, 2);
    entries.push({
      id: `/${VAULT_FILENAME}`,
      folderPath: '/',
      fileName: VAULT_FILENAME,
      kind: 'vault',
      sizeBytes: new Blob([vaultJson]).size,
      updatedAt: vaultEnvelope.updatedAt || nowIso,
      content: vaultJson,
    });
  }

  return entries;
}

interface StoreContextValue {
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  // Main Navigation Sidebar Collapse State
  isMainSidebarOpen: boolean;
  setMainSidebarOpen: (open: boolean) => void;
  toggleMainSidebar: () => void;
  // Multi-Character Library Roster
  characters: CharacterCardData[];
  activeCharacterId: string;
  setActiveCharacterId: (id: string) => void;
  createNewCharacter: (partial?: Partial<CharacterCardData>) => string;
  deleteCharacter: (id: string) => void;
  bindLorebookToCharacter: (characterId: string, lorebookToBind: Lorebook) => void;
  // Active Character Accessors
  character: CharacterCardData;
  setCharacter: React.Dispatch<React.SetStateAction<CharacterCardData>>;
  updateCharacterField: <K extends keyof CharacterCardData>(
    field: K,
    value: CharacterCardData[K]
  ) => void;
  // Multi-Lorebook Library Roster
  lorebooks: Lorebook[];
  activeLorebookId: string;
  setActiveLorebookId: (id: string) => void;
  createNewLorebook: (partial?: Partial<Lorebook>) => string;
  deleteLorebook: (id: string) => void;
  // Active Lorebook Accessors
  lorebook: Lorebook;
  setLorebook: React.Dispatch<React.SetStateAction<Lorebook>>;
  // Active Character StatBlock Accessors
  statBlock: StatBlockConfig;
  setStatBlock: React.Dispatch<React.SetStateAction<StatBlockConfig>>;
  // Themes & Tags
  themes: ContextTheme[];
  setThemes: React.Dispatch<React.SetStateAction<ContextTheme[]>>;
  createNewTheme: (partial?: Partial<ContextTheme>) => ContextTheme;
  updateTheme: (id: string, partial: Partial<ContextTheme>) => void;
  deleteTheme: (id: string) => void;
  activeTheme: ContextTheme;
  setActiveThemeId: (id: string) => void;
  tags: TagDefinition[];
  setTags: React.Dispatch<React.SetStateAction<TagDefinition[]>>;
  upsertCustomTag: (input: {
    id?: string;
    name: string;
    color: string;
    category: TagCategory;
    isNsfw: boolean;
    aiContextDescription: string;
  }) => { updatedExisting: boolean; tag: TagDefinition };
  toggleTagNsfw: (tagId: string) => void;
  deleteTag: (id: string) => void;
  ensureTagRegistered: (
    tagName: string,
    category?: TagDefinition['category']
  ) => TagDefinition | null;
  // Duplicate Character / Lorebook Name Conflict Resolution
  nameConflictRequest: NameConflictRequest | null;
  checkAndTriggerNameConflict: (
    kind: 'character' | 'lorebook',
    itemId: string,
    candidateName: string,
    sourceAction?: 'create' | 'rename' | 'save' | 'import'
  ) => boolean;
  resolveNameConflict: (newUniqueName: string) => void;
  dismissNameConflict: () => void;
  // AI Config, Persistent Connection State & Settings
  aiConfig: AIBackendConfig;
  setAiConfig: React.Dispatch<React.SetStateAction<AIBackendConfig>>;
  switchAIPreset: (presetId: AIPresetId) => void;
  isAiConnected: boolean;
  isTestingAiConnection: boolean;
  aiConnectionResult: ConnectionTestResult | null;
  connectAiBackend: (
    overrideConfig?: AIBackendConfig
  ) => Promise<ConnectionTestResult | null>;
  disconnectAiBackend: () => void;
  clearAiConnectionFeedback: () => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  updateSettings: (partial: Partial<AppSettings>) => void;
  tokenBreakdown: TokenBreakdown;
  lastSavedAt: string | null;
  isDirty: boolean;
  saveNow: (mode?: 'manual' | 'autosave') => void;
  saveAndSyncNow: () => Promise<{ ok: boolean; message: string }>;
  resetWorkspaceToDefaults: () => void;
  // Direct Disk `./Saves/` State & File Management
  savedFiles: SavedFileEntry[];
  diskResolvedPath: string;
  loadSavedFileIntoWorkspace: (file: SavedFileEntry) => {
    ok: boolean;
    message: string;
  };
  createSaveFolder: (folderPath: string) => void;
  setActiveSaveFolder: (folderPath: string) => void;
  deleteSavedFile: (fileId: string) => void;
  // Unified Delete Confirmation Modal Handlers
  pendingDeleteTarget: PendingDeleteTarget | null;
  requestDeleteCharacter: (id: string) => void;
  requestDeleteLorebook: (id: string) => void;
  requestDeleteSavedFile: (file: SavedFileEntry) => void;
  confirmPendingDelete: () => void;
  cancelPendingDelete: () => void;
  exportSaveFolderBundle: (folderPath?: string) => void;
  importSaveFolderBundle: (
    files: FileList | File[]
  ) => Promise<{ ok: boolean; count: number; summary: string }>;
  // Unified PNG & JSON Card Importer
  importFromFiles: (
    files: FileList | File[]
  ) => Promise<{ count: number; summary: string }>;
  // Tab Creation & Editor Progress Draft Cache (in-memory + sessionStorage; never creates disk files)
  workspaceDraftCache: WorkspaceDraftCache;
  updateCharacterDraft: (partial: Partial<CharacterTabDraft>) => void;
  updateLorebookDraft: (partial: Partial<LorebookTabDraft>) => void;
  updateThemesTagsDraft: (partial: Partial<ThemesTagsTabDraft>) => void;
  updateSmartEditorDraft: (
    scopeKey: string,
    partial: Partial<SmartEditorFieldDraft>
  ) => void;
  inspectorDraft: InspectorTabDraft;
  updateInspectorDraft: (partial: Partial<InspectorTabDraft>) => void;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function createBlankCharacter(
  partial?: Partial<CharacterCardData>
): CharacterCardData {
  const nowSec = Math.floor(Date.now() / 1000);
  const newId = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const blankStatBlock: StatBlockConfig = {
    enableDMTracker: false,
    injectionPosition: 'post_history_instructions',
    stats: [
      {
        id: `stat-${Date.now()}-1`,
        label: 'Affection',
        type: 'bar',
        defaultValue: '50',
        min: 0,
        max: 100,
        unit: '%',
        changeRules: 'Increases with kindness and shared trust; decreases with hostility.',
      },
      {
        id: `stat-${Date.now()}-2`,
        label: 'Current Mood',
        type: 'text',
        defaultValue: 'Curious and attentive',
        changeRules: 'Reflects immediate emotional state at the end of the turn.',
      },
    ],
    formatTemplate: `<details><summary>Character Stats</summary>\n\`\`\`yaml\nAffection: {{stat:Affection}}\nCurrent Mood: {{stat:Current Mood}}\n\`\`\`\n</details>`,
    templatePreset: 'collapsible_block',
    isCustomTemplate: false,
  };

  return {
    id: newId,
    name: 'New Character',
    nickname: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: [],
    creator: 'TavernSmith Creator',
    character_version: '1.0.0',
    reactionImages: [],
    creation_date: nowSec,
    modification_date: nowSec,
    extensions: {
      talkativeness: '0.5',
      fav: false,
      statBlock: blankStatBlock,
    },
    ...partial,
  };
}

export function createBlankLorebook(partial?: Partial<Lorebook>): Lorebook {
  const nowSec = Math.floor(Date.now() / 1000);
  const newId = `lorebook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: newId,
    name: 'New World Lorebook',
    description: 'World info and lore entries for SillyTavern.',
    scan_depth: 4,
    token_budget: 1024,
    recursive_scanning: true,
    tags: [],
    modification_date: nowSec,
    entries: [],
    ...partial,
  };
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('character');
  const [characters, setCharactersState] = useState<CharacterCardData[]>([]);
  const [activeCharacterId, setActiveCharacterIdState] = useState<string>('');
  const [lorebooks, setLorebooksState] = useState<Lorebook[]>([]);
  const [activeLorebookId, setActiveLorebookIdState] = useState<string>('');
  const [themes, setThemesState] = useState<ContextTheme[]>(DEFAULT_CONTEXT_THEMES);
  const [tags, setTagsState] = useState<TagDefinition[]>(() =>
    mergeWithDefaultTags([])
  );
  const [aiConfigState, setAiConfigState] =
    useState<AIBackendConfig>(DEFAULT_AI_CONFIG);
  const [isAiConnected, setIsAiConnected] = useState<boolean>(false);
  const [isTestingAiConnection, setIsTestingAiConnection] =
    useState<boolean>(false);
  const [aiConnectionResult, setAiConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const aiTestAbortRef = useRef<AbortController | null>(null);
  const themeSaveTimerRef = useRef<number | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [diskFiles, setDiskFiles] = useState<SavedFileEntry[]>([]);
  const [diskResolvedPath, setDiskResolvedPath] =
    useState<string>('./Saves/');
  const [pendingDeleteTarget, setPendingDeleteTarget] =
    useState<PendingDeleteTarget | null>(null);
  const [workspaceDraftCache, setWorkspaceDraftCache] =
    useState<WorkspaceDraftCache>(() => loadWorkspaceDraftCacheFromSession());
  const [inspectorDraft, setInspectorDraft] = useState<InspectorTabDraft>({
    activeTab: DEFAULT_SETTINGS.cardSpecVersion === 'v2' ? 'v2' : 'v3',
    isRawEditMode: false,
    rawJsonDraft: '',
    rawEditError: null,
  });

  const updateInspectorDraft = useCallback(
    (partial: Partial<InspectorTabDraft>) => {
      setInspectorDraft((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  useEffect(() => {
    saveWorkspaceDraftCacheToSession(workspaceDraftCache);
  }, [workspaceDraftCache]);

  const updateCharacterDraft = useCallback(
    (partial: Partial<CharacterTabDraft>) => {
      setWorkspaceDraftCache((prev) => ({
        ...prev,
        character: { ...prev.character, ...partial },
      }));
    },
    []
  );

  const updateLorebookDraft = useCallback(
    (partial: Partial<LorebookTabDraft>) => {
      setWorkspaceDraftCache((prev) => ({
        ...prev,
        lorebook: { ...prev.lorebook, ...partial },
      }));
    },
    []
  );

  const updateThemesTagsDraft = useCallback(
    (partial: Partial<ThemesTagsTabDraft>) => {
      setWorkspaceDraftCache((prev) => ({
        ...prev,
        themesTags: { ...prev.themesTags, ...partial },
      }));
    },
    []
  );

  const updateSmartEditorDraft = useCallback(
    (scopeKey: string, partial: Partial<SmartEditorFieldDraft>) => {
      setWorkspaceDraftCache((prev) => {
        const current =
          prev.smartEditorDrafts[scopeKey] || DEFAULT_SMART_EDITOR_FIELD_DRAFT;
        const nextEntry: SmartEditorFieldDraft = { ...current, ...partial };
        const isClean =
          !nextEntry.showGenerateBar &&
          !nextEntry.customInstruction &&
          !nextEntry.ghostText &&
          nextEntry.assistMode === 'replace' &&
          !nextEntry.tempReferenceImageUrl;
        const nextDrafts = { ...prev.smartEditorDrafts };
        if (isClean) {
          delete nextDrafts[scopeKey];
        } else {
          nextDrafts[scopeKey] = nextEntry;
        }
        return {
          ...prev,
          smartEditorDrafts: nextDrafts,
        };
      });
    },
    []
  );

  // Track the exact on-disk `.json` filename for each Character, Lorebook, Theme, and Tag ID
  // so renaming or deleting targets the exact `.json` file without colliding duplicates.
  const charDiskFileNamesRef = useRef<Map<string, string>>(new Map());
  const loreDiskFileNamesRef = useRef<Map<string, string>>(new Map());
  const themeDiskFileNamesRef = useRef<Map<string, string>>(new Map());
  const tagDiskFileNamesRef = useRef<Map<string, string>>(new Map());
  const initialDiskHydrationDoneRef = useRef<boolean>(false);
  const initialMountFetchedRef = useRef<boolean>(false);

  // Synchronous state mirrors & serialized disk operation queue to prevent delete/save races
  const charactersRef = useRef<CharacterCardData[]>(characters);
  const lorebooksRef = useRef<Lorebook[]>(lorebooks);
  const themesRef = useRef<ContextTheme[]>(themes);
  const tagsRef = useRef<TagDefinition[]>(tags);
  const settingsRef = useRef<AppSettings>(settings);
  const aiConfigRef = useRef<AIBackendConfig>(aiConfigState);
  const activeCharacterIdRef = useRef<string>(activeCharacterId);
  const activeLorebookIdRef = useRef<string>(activeLorebookId);
  const diskMutationVersionRef = useRef<number>(0);
  const diskOpQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueDiskOperation = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    const next = diskOpQueueRef.current.then(op, op);
    diskOpQueueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const setCharacters: React.Dispatch<React.SetStateAction<CharacterCardData[]>> =
    useCallback((updater) => {
      diskMutationVersionRef.current += 1;
      setCharactersState((prev) => {
        const rawNext = typeof updater === 'function' ? updater(prev) : updater;
        const catalog = tagsRef.current;
        const next = rawNext.map((c) => normalizeCharacterTagsWithCatalog(c, catalog));
        charactersRef.current = next;
        latestWorkspaceRef.current.characters = next;
        return next;
      });
    }, []);

  const setActiveCharacterId = useCallback((id: string) => {
    activeCharacterIdRef.current = id;
    latestWorkspaceRef.current.activeCharacterId = id;
    setActiveCharacterIdState(id);
  }, []);

  const setLorebooks: React.Dispatch<React.SetStateAction<Lorebook[]>> =
    useCallback((updater) => {
      diskMutationVersionRef.current += 1;
      setLorebooksState((prev) => {
        const rawNext = typeof updater === 'function' ? updater(prev) : updater;
        const catalog = tagsRef.current;
        const next = rawNext.map((l) => normalizeLorebookTagsWithCatalog(l, catalog));
        lorebooksRef.current = next;
        latestWorkspaceRef.current.lorebooks = next;
        return next;
      });
    }, []);

  const setActiveLorebookId = useCallback((id: string) => {
    activeLorebookIdRef.current = id;
    latestWorkspaceRef.current.activeLorebookId = id;
    setActiveLorebookIdState(id);
  }, []);

  const setThemes: React.Dispatch<React.SetStateAction<ContextTheme[]>> =
    useCallback((updater) => {
      diskMutationVersionRef.current += 1;
      setThemesState((prev) => {
        const rawNext = typeof updater === 'function' ? updater(prev) : updater;
        const catalog = tagsRef.current;
        const next = rawNext.map((theme) => {
          const sorted = sortTagsByContextOrder(
            theme.associatedTags || [],
            catalog
          );
          return stringArraysEqual(theme.associatedTags || [], sorted)
            ? theme
            : { ...theme, associatedTags: sorted };
        });
        themesRef.current = next;
        latestWorkspaceRef.current.themes = next;
        return next;
      });
    }, []);

  const setTags: React.Dispatch<React.SetStateAction<TagDefinition[]>> =
    useCallback((updater) => {
      diskMutationVersionRef.current += 1;
      setTagsState((prev) => {
        const rawNext = typeof updater === 'function' ? updater(prev) : updater;
        const next = rawNext.map((t) => {
          const migrated = migrateLegacyTagCategory(
            t.category,
            t.name,
            t.aiContextDescription || t.aiDescription || t.description
          );
          return migrated !== t.category ? { ...t, category: migrated } : t;
        });
        tagsRef.current = next;
        latestWorkspaceRef.current.tags = next;
        return next;
      });
    }, []);

  const setSettings: React.Dispatch<React.SetStateAction<AppSettings>> =
    useCallback((updater) => {
      diskMutationVersionRef.current += 1;
      setSettingsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        settingsRef.current = next;
        latestWorkspaceRef.current.settings = next;
        return next;
      });
    }, []);

  useEffect(() => {
    return () => {
      if (aiTestAbortRef.current) {
        aiTestAbortRef.current.abort();
      }
      if (themeSaveTimerRef.current !== null) {
        window.clearTimeout(themeSaveTimerRef.current);
      }
    };
  }, []);

  const setAiConfig: React.Dispatch<React.SetStateAction<AIBackendConfig>> =
    useCallback((updater) => {
      diskMutationVersionRef.current += 1;
      setAiConfigState((prev) => {
        const rawNext =
          typeof updater === 'function' ? updater(prev) : updater;
        const synced = syncAIConfigProviderCredentials(prev, rawNext);
        aiConfigRef.current = synced;
        latestWorkspaceRef.current.aiConfig = synced;
        return synced;
      });
    }, []);

  const disconnectAiBackend = useCallback(() => {
    if (aiTestAbortRef.current) {
      aiTestAbortRef.current.abort();
      aiTestAbortRef.current = null;
    }
    setIsAiConnected(false);
    setAiConnectionResult(null);
  }, []);

  const clearAiConnectionFeedback = useCallback(() => {
    setAiConnectionResult(null);
  }, []);

  const switchAIPreset = useCallback((presetId: AIPresetId) => {
    const found = AI_BACKEND_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    if (aiTestAbortRef.current) {
      aiTestAbortRef.current.abort();
      aiTestAbortRef.current = null;
    }
    setIsAiConnected(false);
    setAiConnectionResult(null);
    diskMutationVersionRef.current += 1;
    setAiConfigState((prev) => {
      const synced = syncAIConfigProviderCredentials(prev, {
        ...prev,
        preset: presetId,
        url: found.defaultUrl,
        modelName: found.defaultModel,
        compatibilityFormat: 'auto',
        availableModels: found.suggestedModels,
      });
      aiConfigRef.current = synced;
      latestWorkspaceRef.current.aiConfig = synced;
      return synced;
    });
  }, []);

  const aiConfig = aiConfigState;

  const connectAiBackend = useCallback(
    async (
      overrideConfig?: AIBackendConfig
    ): Promise<ConnectionTestResult | null> => {
      const targetConfig = overrideConfig ?? aiConfigState;
      if (aiTestAbortRef.current) {
        aiTestAbortRef.current.abort();
      }
      const controller = new AbortController();
      aiTestAbortRef.current = controller;
      setIsTestingAiConnection(true);

      try {
        const result = await testBackendConnection(
          targetConfig,
          controller.signal
        );
        if (controller.signal.aborted) return null;

        setAiConnectionResult(result);
        setIsAiConnected(result.ok);

        if (result.models.length > 0) {
          diskMutationVersionRef.current += 1;
          setAiConfigState((prev) => {
            const cleanModels = sanitizeAvailableModelsList(
              result.models,
              undefined,
              prev.preset
            );
            const currentModelValid = cleanModels.includes(prev.modelName);
            const preferredDefault = cleanModels.includes('gemini-3.8-flash')
              ? 'gemini-3.8-flash'
              : cleanModels[0];
            const synced = syncAIConfigProviderCredentials(prev, {
              ...prev,
              availableModels: cleanModels,
              modelName: currentModelValid ? prev.modelName : preferredDefault,
            });
            aiConfigRef.current = synced;
            latestWorkspaceRef.current.aiConfig = synced;
            return synced;
          });
        }
        return result;
      } catch {
        return null;
      } finally {
        if (!controller.signal.aborted) {
          setIsTestingAiConnection(false);
        }
      }
    },
    [aiConfigState]
  );

  const character = useMemo(() => {
    return (
      characters.find((c) => c.id === activeCharacterId) ||
      characters[0] ||
      DEFAULT_CHARACTER
    );
  }, [characters, activeCharacterId]);

  const lorebook = useMemo(() => {
    return (
      lorebooks.find((l) => l.id === activeLorebookId) ||
      lorebooks[0] ||
      DEFAULT_LOREBOOK
    );
  }, [lorebooks, activeLorebookId]);

  const statBlock = useMemo<StatBlockConfig>(() => {
    return character.extensions?.statBlock || DEFAULT_STAT_BLOCK;
  }, [character]);

  const activeTheme = useMemo(() => {
    return (
      themes.find((t) => t.id === settings.activeThemeId) ||
      themes[0] ||
      DEFAULT_CONTEXT_THEMES[0]
    );
  }, [themes, settings.activeThemeId]);

  // Lock in Dual-Layer Theme System on <html>
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (settings.appearance === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
      }
    } catch {
      // Ignore DOM errors
    }
  }, [settings.appearance]);

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.style.setProperty('--theme-accent', activeTheme.color);
    } catch {
      // Ignore DOM errors
    }
  }, [activeTheme.color]);

  useEffect(() => {
    if (initialDiskHydrationDoneRef.current) {
      latestWorkspaceRef.current.isDirty = true;
      setIsDirty(true);
    }
  }, [
    characters,
    activeCharacterId,
    lorebooks,
    activeLorebookId,
    themes,
    tags,
    aiConfig,
    settings,
  ]);

  // Automatically register any new top-level tag attached to a Character, Lorebook, LorebookEntry, or ContextTheme
  useEffect(() => {
    const referencedTagNames = new Set<string>();
    for (const c of characters) {
      for (const t of c.tags || []) {
        if (t && t.trim()) referencedTagNames.add(t.trim());
      }
    }
    for (const lb of lorebooks) {
      for (const t of lb.tags || []) {
        if (t && t.trim()) referencedTagNames.add(t.trim());
      }
      for (const entry of lb.entries || []) {
        for (const t of entry.tags || []) {
          if (t && t.trim()) referencedTagNames.add(t.trim());
        }
      }
    }
    for (const theme of themes) {
      for (const t of theme.associatedTags || []) {
        if (t && t.trim()) referencedTagNames.add(t.trim());
      }
    }

    setTagsState((prevTags) => {
      const existingLower = new Set(
        prevTags.map((t) => t.name.trim().toLowerCase())
      );
      const newlyDiscovered: TagDefinition[] = [];
      let idx = prevTags.length;

      referencedTagNames.forEach((rawName) => {
        const lower = rawName.toLowerCase();
        if (!existingLower.has(lower)) {
          existingLower.add(lower);
          const color = AUTO_TAG_PALETTE[idx % AUTO_TAG_PALETTE.length];
          idx++;
          newlyDiscovered.push({
            id: `tag-auto-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
            name: rawName,
            color,
            category: 'Custom',
            isNsfw: lower.includes('nsfw') || lower.includes('18+'),
            aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${rawName}".`,
            aiDescription: `Incorporate thematic, tonal, and character elements consistent with "${rawName}".`,
          });
        }
      });

      if (newlyDiscovered.length === 0) {
        return prevTags;
      }
      const nextTags = [...prevTags, ...newlyDiscovered];
      tagsRef.current = nextTags;
      latestWorkspaceRef.current.tags = nextTags;
      return nextTags;
    });
  }, [characters, lorebooks, themes]);

  const ensureTagRegistered = useCallback(
    (
      rawTagName: string,
      category: TagDefinition['category'] = 'Custom'
    ): TagDefinition | null => {
      const clean = rawTagName.trim();
      if (!clean) return null;

      const found = tagsRef.current.find(
        (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (found) return found;

      const currentTags = tagsRef.current;
      const usedTagFiles = new Set(
        currentTags
          .map((t) =>
            (
              t.savedFileName ||
              tagDiskFileNamesRef.current.get(t.id) ||
              ''
            ).toLowerCase()
          )
          .filter(Boolean)
      );
      const assignedFile = ensureUniqueSavedFileName(
        clean,
        usedTagFiles,
        'tag'
      );

      const color =
        AUTO_TAG_PALETTE[currentTags.length % AUTO_TAG_PALETTE.length] || '#a855f7';
      const resolvedCat = migrateLegacyTagCategory(category, clean, '');
      const isNsfw =
        resolvedCat === 'Genitals' ||
        resolvedCat === 'NSFW & Kinks' ||
        resolvedCat === 'Extreme & Hentai Physics' ||
        clean.toLowerCase().includes('nsfw') ||
        clean.toLowerCase().includes('18+');
      const desc = `Incorporate thematic, tonal, and character elements consistent with "${clean}".`;
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        savedFileName: assignedFile,
        name: clean,
        color,
        category: resolvedCat,
        isNsfw,
        aiContextDescription: desc,
        aiDescription: desc,
        description: desc,
      };
      tagDiskFileNamesRef.current.set(newTag.id, assignedFile);
      diskMutationVersionRef.current += 1;
      const nextTags = [...currentTags, newTag];
      tagsRef.current = nextTags;
      latestWorkspaceRef.current.tags = nextTags;
      setTagsState(nextTags);
      return newTag;
    },
    []
  );

  /**
   * Hydrates React state from `/api/disk/state` (ONLY on initial app mount or explicit folder switch).
   * Strictly maps `./Saves/Characters/*.json` -> `characters[]` and `./Saves/Lorebooks/*.json` -> `lorebooks[]`.
   */
  const applyDiskStateToWorkspace = useCallback(
    async (
      diskState: DiskStateResponse,
      options?: { isInitialMount?: boolean; expectedVersion?: number }
    ) => {
      if (!diskState || !diskState.ok) return;

      const isStaleVersion =
        typeof options?.expectedVersion === 'number' &&
        options.expectedVersion !== diskMutationVersionRef.current;

      if (diskState.resolvedPath || diskState.diskRoot) {
        setDiskResolvedPath(diskState.resolvedPath || diskState.diskRoot);
      }

      if (Array.isArray(diskState.files)) {
        setDiskFiles(diskState.files);
      }

      // Never clobber user edits made before initial mount scan resolved or while mutations occurred
      if (
        isStaleVersion ||
        (options?.isInitialMount && diskMutationVersionRef.current > 0)
      ) {
        return;
      }

      // 1. Reconstruct Tags & Themes from `./Saves/Tags/*.json` & `./Saves/Themes/*.json`
      //    with backwards-compatible fallback to legacy `./Saves/_tavernsmith_meta.json`
      const legacyMetaTags =
        diskState.meta && Array.isArray(diskState.meta.tags)
          ? diskState.meta.tags
          : [];
      const diskTagEntries = Array.isArray(diskState.tags) ? diskState.tags : [];
      const mergedTags = mergeWithDefaultTags([
        ...extractCustomUserTags(legacyMetaTags),
        ...diskTagEntries,
      ]);

      const nextTagFileNames = new Map<string, string>();
      for (const t of mergedTags) {
        if (t.savedFileName && t.id) {
          nextTagFileNames.set(t.id, t.savedFileName);
        }
      }
      tagDiskFileNamesRef.current = nextTagFileNames;
      tagsRef.current = mergedTags;
      latestWorkspaceRef.current.tags = mergedTags;
      setTagsState(mergedTags);

      const legacyMetaThemes =
        diskState.meta && Array.isArray(diskState.meta.contextThemes)
          ? diskState.meta.contextThemes
          : [];
      const diskThemeEntries = Array.isArray(diskState.themes)
        ? diskState.themes
        : [];
      const hydratedThemes = mergeWithDefaultThemes(
        [...legacyMetaThemes, ...diskThemeEntries],
        mergedTags
      );

      const nextThemeFileNames = new Map<string, string>();
      for (const th of hydratedThemes) {
        if (th.savedFileName && th.id) {
          nextThemeFileNames.set(th.id, th.savedFileName);
        }
      }
      themeDiskFileNamesRef.current = nextThemeFileNames;
      themesRef.current = hydratedThemes;
      latestWorkspaceRef.current.themes = hydratedThemes;
      setThemesState(hydratedThemes);

      if (diskState.meta && typeof diskState.meta === 'object') {
        const meta = diskState.meta;

        if (options?.isInitialMount && meta.settings) {
          setSettingsState((prev) => {
            const candidateThemeId =
              meta.activeThemeId ||
              meta.settings?.activeThemeId ||
              prev.activeThemeId;
            const resolvedThemeId = hydratedThemes.some(
              (t) => t.id === candidateThemeId
            )
              ? candidateThemeId
              : hydratedThemes[0]?.id || prev.activeThemeId;
            const nextSettings = {
              ...prev,
              ...meta.settings,
              activeThemeId: resolvedThemeId,
              activeSaveFolder:
                meta.settings?.activeSaveFolder || UNIFIED_INTERNAL_ROOT,
            };
            settingsRef.current = nextSettings;
            latestWorkspaceRef.current.settings = nextSettings;
            return nextSettings;
          });
        } else if (meta.activeThemeId && options?.isInitialMount) {
          setSettingsState((prev) => {
            const resolvedThemeId = hydratedThemes.some(
              (t) => t.id === meta.activeThemeId
            )
              ? meta.activeThemeId!
              : hydratedThemes[0]?.id || prev.activeThemeId;
            const nextSettings = {
              ...prev,
              activeThemeId: resolvedThemeId,
            };
            settingsRef.current = nextSettings;
            latestWorkspaceRef.current.settings = nextSettings;
            return nextSettings;
          });
        }

        if (options?.isInitialMount && meta.aiConfig) {
          const incomingAi = meta.aiConfig;
          const cleanPreset = incomingAi.preset || DEFAULT_AI_CONFIG.preset;
          const hydratedAvailable = sanitizeAvailableModelsList(
            incomingAi.availableModels,
            AI_BACKEND_PRESETS.find((p) => p.id === cleanPreset)?.suggestedModels,
            cleanPreset
          );
          const migrateLegacyDefault = (rawModel: string | undefined, targetPreset: AIPresetId) => {
            const clean = sanitizeModelName(rawModel, targetPreset);
            if (
              targetPreset === 'gemini' &&
              isDeprecatedGeminiModel(clean) &&
              !(Array.isArray(incomingAi.availableModels) && incomingAi.availableModels.includes(clean))
            ) {
              return 'gemini-3.8-flash';
            }
            return clean;
          };
          const sanitizedModelsMap: Record<string, string> = {};
          if (
            incomingAi.savedProviderModels &&
            typeof incomingAi.savedProviderModels === 'object'
          ) {
            for (const [k, v] of Object.entries(incomingAi.savedProviderModels)) {
              const mapPreset =
                k === 'google' || k === 'gemini' ? 'gemini' : cleanPreset;
              sanitizedModelsMap[k] = migrateLegacyDefault(v, mapPreset);
            }
            saveProviderModelsMap(sanitizedModelsMap);
          }
          setAiConfigState((prev) => {
            const nextAi: AIBackendConfig = {
              ...prev,
              ...incomingAi,
              modelName: migrateLegacyDefault(incomingAi.modelName, cleanPreset),
              availableModels: hydratedAvailable,
              savedProviderModels:
                Object.keys(sanitizedModelsMap).length > 0
                  ? sanitizedModelsMap
                  : prev.savedProviderModels,
              maxTokens: Math.max(8192, incomingAi.maxTokens || 16384),
              apiKey: prev.apiKey,
              savedProviderKeys: prev.savedProviderKeys,
            };
            aiConfigRef.current = nextAi;
            latestWorkspaceRef.current.aiConfig = nextAi;
            return nextAi;
          });
        }
      }

      // 2. Parse `./Saves/Characters/*.json` strictly as `characters[]`
      const nextCharFileNames = new Map<string, string>();
      const parsedCharacters: CharacterCardData[] = [];
      if (Array.isArray(diskState.characters)) {
        for (const rawEntry of diskState.characters) {
          if (!rawEntry || typeof rawEntry !== 'object') continue;
          const outerObj = rawEntry as Record<string, unknown>;
          const diskFileName =
            typeof outerObj._diskFileName === 'string' && outerObj._diskFileName
              ? outerObj._diskFileName
              : typeof outerObj.fileName === 'string' && outerObj.fileName
                ? outerObj.fileName
                : typeof outerObj.savedFileName === 'string' &&
                    outerObj.savedFileName
                  ? outerObj.savedFileName
                  : '';
          const candidateCharObj =
            outerObj.parsed &&
            typeof outerObj.parsed === 'object' &&
            !Array.isArray(outerObj.parsed)
              ? ({
                  ...(outerObj.parsed as Record<string, unknown>),
                  ...(diskFileName ? { _diskFileName: diskFileName } : {}),
                } as Record<string, unknown>)
              : outerObj;
          if (candidateCharObj._tavernsmithType === 'lorebook') continue;
          try {
            const parsedRes = parseImportedJsonString(
              JSON.stringify(candidateCharObj),
              undefined,
              diskFileName || 'Character.json',
              'character'
            );
            if (parsedRes.kind === 'character') {
              const sortedChar = normalizeCharacterTagsWithCatalog(
                parsedRes.character,
                mergedTags
              );
              sortedChar.isNsfw = isCharacterNsfw(sortedChar, mergedTags);
              const resolvedName =
                diskFileName || sortedChar.savedFileName || '';
              if (resolvedName) {
                sortedChar.savedFileName = resolvedName;
              }
              parsedCharacters.push(sortedChar);
              if (sortedChar.id && resolvedName) {
                nextCharFileNames.set(sortedChar.id, resolvedName);
              }
            }
          } catch {
            // Even if the file on disk is empty or corrupted, bind its real disk filename so it stays deletable
            if (diskFileName) {
              const fallbackName =
                diskFileName.replace(/\.json$/i, '').trim() ||
                'Recovered Character';
              const fallbackChar = createBlankCharacter({
                id:
                  typeof candidateCharObj.id === 'string' && candidateCharObj.id
                    ? candidateCharObj.id
                    : `char-corrupt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: fallbackName,
                savedFileName: diskFileName,
              });
              parsedCharacters.push(fallbackChar);
              if (fallbackChar.id) {
                nextCharFileNames.set(fallbackChar.id, diskFileName);
              }
            }
          }
        }
      }
      charDiskFileNamesRef.current = nextCharFileNames;
      charactersRef.current = parsedCharacters;
      latestWorkspaceRef.current.characters = parsedCharacters;
      setCharactersState(parsedCharacters);
      setActiveCharacterIdState((prevId) => {
        let nextId = parsedCharacters[0]?.id || '';
        if (prevId && parsedCharacters.some((c) => c.id === prevId)) {
          nextId = prevId;
        } else if (
          options?.isInitialMount &&
          diskState.meta?.activeCharacterId &&
          parsedCharacters.some(
            (c) => c.id === diskState.meta?.activeCharacterId
          )
        ) {
          nextId = diskState.meta.activeCharacterId;
        }
        activeCharacterIdRef.current = nextId;
        latestWorkspaceRef.current.activeCharacterId = nextId;
        return nextId;
      });

      // 3. Parse `./Saves/Lorebooks/*.json` strictly as `lorebooks[]`
      const nextLoreFileNames = new Map<string, string>();
      const parsedLorebooks: Lorebook[] = [];
      if (Array.isArray(diskState.lorebooks)) {
        for (const rawEntry of diskState.lorebooks) {
          if (!rawEntry || typeof rawEntry !== 'object') continue;
          const outerObj = rawEntry as Record<string, unknown>;
          const diskFileName =
            typeof outerObj._diskFileName === 'string' && outerObj._diskFileName
              ? outerObj._diskFileName
              : typeof outerObj.fileName === 'string' && outerObj.fileName
                ? outerObj.fileName
                : typeof outerObj.savedFileName === 'string' &&
                    outerObj.savedFileName
                  ? outerObj.savedFileName
                  : '';
          const candidateLoreObj =
            outerObj.parsed &&
            typeof outerObj.parsed === 'object' &&
            !Array.isArray(outerObj.parsed)
              ? ({
                  ...(outerObj.parsed as Record<string, unknown>),
                  ...(diskFileName ? { _diskFileName: diskFileName } : {}),
                } as Record<string, unknown>)
              : outerObj;
          if (candidateLoreObj._tavernsmithType === 'character') continue;
          try {
            const fallbackTitle =
              (diskFileName || 'Lorebook.json').replace(/\.json$/i, '') ||
              'Lorebook';
            const normalizedBook = normalizeLorebookTagsWithCatalog(
              normalizeLorebookObject(candidateLoreObj, fallbackTitle),
              mergedTags
            );
            normalizedBook.isNsfw = isLorebookNsfw(normalizedBook, mergedTags);
            const resolvedName =
              diskFileName || normalizedBook.savedFileName || '';
            if (resolvedName) {
              normalizedBook.savedFileName = resolvedName;
            }
            parsedLorebooks.push(normalizedBook);
            if (normalizedBook.id && resolvedName) {
              nextLoreFileNames.set(normalizedBook.id, resolvedName);
            }
          } catch {
            // Even if the lorebook JSON is empty or corrupted, bind its real disk filename so it stays deletable
            if (diskFileName) {
              const fallbackTitle =
                diskFileName.replace(/\.json$/i, '').trim() ||
                'Recovered Lorebook';
              const fallbackBook = createBlankLorebook({
                id:
                  typeof candidateLoreObj.id === 'string' && candidateLoreObj.id
                    ? candidateLoreObj.id
                    : `lore-corrupt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: fallbackTitle,
                savedFileName: diskFileName,
              });
              parsedLorebooks.push(fallbackBook);
              if (fallbackBook.id) {
                nextLoreFileNames.set(fallbackBook.id, diskFileName);
              }
            }
          }
        }
      }
      loreDiskFileNamesRef.current = nextLoreFileNames;
      lorebooksRef.current = parsedLorebooks;
      latestWorkspaceRef.current.lorebooks = parsedLorebooks;
      setLorebooksState(parsedLorebooks);
      setActiveLorebookIdState((prevId) => {
        let nextId = parsedLorebooks[0]?.id || '';
        if (prevId && parsedLorebooks.some((l) => l.id === prevId)) {
          nextId = prevId;
        } else if (
          options?.isInitialMount &&
          diskState.meta?.activeLorebookId &&
          parsedLorebooks.some(
            (l) => l.id === diskState.meta?.activeLorebookId
          )
        ) {
          nextId = diskState.meta.activeLorebookId;
        }
        activeLorebookIdRef.current = nextId;
        latestWorkspaceRef.current.activeLorebookId = nextId;
        return nextId;
      });

      // 4. Hydrate AES-256-GCM Encrypted Vault from `./Saves/_tavernsmith_vault.enc`
      if (diskState.vault && typeof diskState.vault === 'object') {
        try {
          const decrypted = await decryptProviderKeysFromVault(
            undefined,
            diskState.vault
          );
          if (decrypted.ok) {
            setAiConfigState((prev) => {
              const mergedKeys: Record<string, string> = {
                ...decrypted.keys,
                ...(prev.savedProviderKeys || {}),
              };
              const activeProviderId = getProviderKeyId(prev.preset);
              const restoredActiveKey =
                prev.apiKey ||
                mergedKeys[activeProviderId] ||
                mergedKeys[prev.preset] ||
                '';
              if (restoredActiveKey) {
                mergedKeys[activeProviderId] = restoredActiveKey;
                mergedKeys[prev.preset] = restoredActiveKey;
              }
              const nextAi = {
                ...prev,
                apiKey: restoredActiveKey,
                savedProviderKeys: mergedKeys,
              };
              aiConfigRef.current = nextAi;
              latestWorkspaceRef.current.aiConfig = nextAi;
              return nextAi;
            });
          }
        } catch {
          // Vault may be locked with custom PIN
        }
      }

      if (diskState.updatedAt) {
        setLastSavedAt(formatSafeTimestamp(diskState.updatedAt));
      }
    },
    []
  );

  // Auto-Scan `./Saves/` ONCE on initial app mount
  useEffect(() => {
    if (initialMountFetchedRef.current) return;
    initialMountFetchedRef.current = true;
    let cancelled = false;
    purgeBrowserRuntimeCaches();

    (async () => {
      try {
        const res = await fetch('/api/disk/state', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as DiskStateResponse;
        if (cancelled) return;
        await applyDiskStateToWorkspace(data, { isInitialMount: true });
      } catch {
        // Ignore network error if server is still booting
      } finally {
        if (!cancelled) {
          initialDiskHydrationDoneRef.current = true;
          const hasPendingMutations = diskMutationVersionRef.current > 0;
          latestWorkspaceRef.current.isDirty = hasPendingMutations;
          setIsDirty(hasPendingMutations);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyDiskStateToWorkspace]);

  // Register Vault Disk Flush Callback so any key/PIN change in Options immediately writes `./Saves/_tavernsmith_vault.enc`
  useEffect(() => {
    registerVaultDiskFlushCallback((envelope) => {
      const versionAtStart = diskMutationVersionRef.current;
      void enqueueDiskOperation(async () => {
        try {
          const r = await fetch('/api/disk/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vault: envelope,
              customSavePath: latestWorkspaceRef.current.settings.activeSaveFolder,
            }),
          });
          const diskState = (await r.json()) as DiskStateResponse;
          if (
            diskState &&
            diskState.ok &&
            Array.isArray(diskState.files) &&
            diskMutationVersionRef.current === versionAtStart
          ) {
            setDiskFiles(diskState.files);
          }
        } catch {
          // Ignore transient network error
        }
      });
    });
    return () => {
      registerVaultDiskFlushCallback(null);
    };
  }, [enqueueDiskOperation]);

  // Duplicate Character / Lorebook Name Conflict State & Handlers
  const [nameConflictRequest, setNameConflictRequest] =
    useState<NameConflictRequest | null>(null);

  const checkAndTriggerNameConflict = useCallback(
    (
      kind: 'character' | 'lorebook',
      itemId: string,
      candidateName: string,
      sourceAction: 'create' | 'rename' | 'save' | 'import' = 'rename'
    ): boolean => {
      const cleanName = (candidateName || '').trim();
      if (!cleanName) return false;
      const lowerCandidate = cleanName.toLowerCase();

      if (kind === 'character') {
        const hasDuplicate = characters.some(
          (c) =>
            c.id !== itemId &&
            (c.name || '').trim().toLowerCase() === lowerCandidate
        );
        if (hasDuplicate) {
          const allNames = characters.map((c) => c.name || 'Untitled');
          setNameConflictRequest({
            kind: 'character',
            itemId,
            conflictingName: cleanName,
            suggestedNames: buildSuggestedUniqueNames(cleanName, allNames),
            sourceAction,
          });
          return true;
        }
      } else {
        const hasDuplicate = lorebooks.some(
          (l) =>
            l.id !== itemId &&
            (l.name || '').trim().toLowerCase() === lowerCandidate
        );
        if (hasDuplicate) {
          const allNames = lorebooks.map((l) => l.name || 'Untitled Lorebook');
          setNameConflictRequest({
            kind: 'lorebook',
            itemId,
            conflictingName: cleanName,
            suggestedNames: buildSuggestedUniqueNames(cleanName, allNames),
            sourceAction,
          });
          return true;
        }
      }
      return false;
    },
    [characters, lorebooks]
  );

  const resolveNameConflict = useCallback(
    (newUniqueName: string) => {
      if (!nameConflictRequest) return;
      const clean = newUniqueName.trim();
      if (!clean) return;

      const { kind, itemId } = nameConflictRequest;
      if (kind === 'character') {
        setCharacters((prev) =>
          prev.map((c) =>
            c.id === itemId
              ? {
                  ...c,
                  name: clean,
                  modification_date: Math.floor(Date.now() / 1000),
                }
              : c
          )
        );
      } else {
        setLorebooks((prev) =>
          prev.map((l) =>
            l.id === itemId
              ? {
                  ...l,
                  name: clean,
                  modification_date: Math.floor(Date.now() / 1000),
                }
              : l
          )
        );
      }
      setNameConflictRequest(null);
    },
    [nameConflictRequest]
  );

  const dismissNameConflict = useCallback(() => {
    setNameConflictRequest(null);
  }, []);

  const setCharacter: React.Dispatch<React.SetStateAction<CharacterCardData>> =
    useCallback(
      (updater) => {
        diskMutationVersionRef.current += 1;
        setCharactersState((prev) => {
          const currentTags = tagsRef.current;
          let nextList: CharacterCardData[];
          if (prev.length === 0) {
            const freshBase = createBlankCharacter();
            const next = normalizeCharacterTagsWithCatalog(
              typeof updater === 'function' ? updater(freshBase) : updater,
              currentTags
            );
            const autoNsfw = isCharacterNsfw(next, currentTags);
            const assignedFile =
              next.savedFileName ||
              ensureUniqueSavedFileName(next.name, new Set(), 'character');
            const created: CharacterCardData = {
              ...next,
              id: freshBase.id,
              savedFileName: assignedFile,
              isNsfw: autoNsfw,
              modification_date: Math.floor(Date.now() / 1000),
            };
            if (created.id) {
              charDiskFileNamesRef.current.set(created.id, assignedFile);
            }
            activeCharacterIdRef.current = created.id!;
            latestWorkspaceRef.current.activeCharacterId = created.id!;
            setActiveCharacterIdState(created.id!);
            nextList = [created];
          } else {
            const targetId = activeCharacterIdRef.current || prev[0]?.id || '';
            nextList = prev.map((c) => {
              if (c.id !== targetId) return c;
              const next = normalizeCharacterTagsWithCatalog(
                typeof updater === 'function' ? updater(c) : updater,
                currentTags
              );
              const autoNsfw = isCharacterNsfw(next, currentTags);
              return {
                ...next,
                id: c.id,
                isNsfw: autoNsfw,
                modification_date: Math.floor(Date.now() / 1000),
              };
            });
          }
          charactersRef.current = nextList;
          latestWorkspaceRef.current.characters = nextList;
          return nextList;
        });
      },
      []
    );

  const updateCharacterField = useCallback(
    <K extends keyof CharacterCardData>(
      field: K,
      value: CharacterCardData[K]
    ) => {
      setCharacter((prev) => {
        const updated = normalizeCharacterTagsWithCatalog(
          {
            ...prev,
            [field]: value,
            modification_date: Math.floor(Date.now() / 1000),
          },
          tagsRef.current
        );
        updated.isNsfw = isCharacterNsfw(updated, tagsRef.current);
        return updated;
      });
    },
    [setCharacter]
  );

  const setStatBlock: React.Dispatch<React.SetStateAction<StatBlockConfig>> =
    useCallback(
      (updater) => {
        setCharacter((prev) => {
          const currentStat = prev.extensions?.statBlock || DEFAULT_STAT_BLOCK;
          const nextStat =
            typeof updater === 'function' ? updater(currentStat) : updater;
          return {
            ...prev,
            modification_date: Math.floor(Date.now() / 1000),
            extensions: {
              ...prev.extensions,
              statBlock: nextStat,
            },
          };
        });
      },
      [setCharacter]
    );

  const setLorebook: React.Dispatch<React.SetStateAction<Lorebook>> =
    useCallback(
      (updater) => {
        diskMutationVersionRef.current += 1;
        setLorebooksState((prev) => {
          const currentTags = tagsRef.current;
          let nextList: Lorebook[];
          if (prev.length === 0) {
            const freshBase = createBlankLorebook();
            const next = normalizeLorebookTagsWithCatalog(
              typeof updater === 'function' ? updater(freshBase) : updater,
              currentTags
            );
            const autoNsfw = isLorebookNsfw(next, currentTags);
            const assignedFile =
              next.savedFileName ||
              ensureUniqueSavedFileName(next.name, new Set(), 'lorebook');
            const created: Lorebook = {
              ...next,
              id: freshBase.id,
              savedFileName: assignedFile,
              isNsfw: autoNsfw,
              modification_date: Math.floor(Date.now() / 1000),
            };
            if (created.id) {
              loreDiskFileNamesRef.current.set(created.id, assignedFile);
            }
            activeLorebookIdRef.current = created.id!;
            latestWorkspaceRef.current.activeLorebookId = created.id!;
            setActiveLorebookIdState(created.id!);
            nextList = [created];
          } else {
            const targetId = activeLorebookIdRef.current || prev[0]?.id || '';
            nextList = prev.map((l) => {
              if (l.id !== targetId) return l;
              const next = normalizeLorebookTagsWithCatalog(
                typeof updater === 'function' ? updater(l) : updater,
                currentTags
              );
              const autoNsfw = isLorebookNsfw(next, currentTags);
              return {
                ...next,
                id: l.id,
                isNsfw: autoNsfw,
                modification_date: Math.floor(Date.now() / 1000),
              };
            });
          }
          lorebooksRef.current = nextList;
          latestWorkspaceRef.current.lorebooks = nextList;
          return nextList;
        });
      },
      []
    );

  // Keep a live ref of all workspace state for atomic saves
  const latestWorkspaceRef = useRef({
    characters,
    activeCharacterId,
    lorebooks,
    activeLorebookId,
    lorebook,
    themes,
    tags,
    aiConfig,
    settings,
    lastSavedAt,
    isDirty,
  });

  useEffect(() => {
    charactersRef.current = characters;
    lorebooksRef.current = lorebooks;
    themesRef.current = themes;
    tagsRef.current = tags;
    settingsRef.current = settings;
    aiConfigRef.current = aiConfig;
    activeCharacterIdRef.current = activeCharacterId;
    activeLorebookIdRef.current = activeLorebookId;
    latestWorkspaceRef.current = {
      characters,
      activeCharacterId,
      lorebooks,
      activeLorebookId,
      lorebook,
      themes,
      tags,
      aiConfig,
      settings,
      lastSavedAt,
      isDirty,
    };
  }, [
    characters,
    activeCharacterId,
    lorebooks,
    activeLorebookId,
    lorebook,
    themes,
    tags,
    aiConfig,
    settings,
    lastSavedAt,
    isDirty,
  ]);

  /**
   * Core serialized disk save helper (`POST /api/disk/save`) using the latest synchronous refs.
   * React state is the single source of truth after initial mount; `saveToDisk` writes state to disk
   * and ONLY updates the read-only Options file list & saved timestamp (never overwriting characters/lorebooks/tags/themes).
   */
  const runDiskSaveRequest = useCallback(
    async (
      mode: 'manual' | 'autosave' = 'manual',
      overrideState?: {
        characters?: CharacterCardData[];
        lorebooks?: Lorebook[];
        themes?: ContextTheme[];
        tags?: TagDefinition[];
      },
      expectedVersion?: number
    ): Promise<{ ok: boolean; message: string }> => {
      const charsToSave = overrideState?.characters ?? charactersRef.current;
      const booksToSave = overrideState?.lorebooks ?? lorebooksRef.current;
      const themesToSave = overrideState?.themes ?? themesRef.current;
      const tagsToSave = overrideState?.tags ?? tagsRef.current;
      const settingsToSave = settingsRef.current;
      const aiConfigToSave = aiConfigRef.current;
      const activeCharId = activeCharacterIdRef.current;
      const activeBookId = activeLorebookIdRef.current;
      const versionAtStart = expectedVersion ?? diskMutationVersionRef.current;

      if (mode === 'manual') {
        const seenCharNames = new Map<string, string>();
        for (const c of charsToSave) {
          const lower = (c.name || '').trim().toLowerCase();
          if (!lower) continue;
          const prevId = seenCharNames.get(lower);
          if (prevId && prevId !== c.id) {
            setNameConflictRequest({
              kind: 'character',
              itemId: c.id!,
              conflictingName: c.name,
              suggestedNames: buildSuggestedUniqueNames(
                c.name,
                charsToSave.map((ch) => ch.name)
              ),
              sourceAction: 'save',
            });
            return {
              ok: false,
              message: `Duplicate character name "${c.name}" detected. Please resolve before saving.`,
            };
          }
          seenCharNames.set(lower, c.id!);
        }

        const seenBookNames = new Map<string, string>();
        for (const l of booksToSave) {
          const lower = (l.name || '').trim().toLowerCase();
          if (!lower) continue;
          const prevId = seenBookNames.get(lower);
          if (prevId && prevId !== l.id) {
            setNameConflictRequest({
              kind: 'lorebook',
              itemId: l.id!,
              conflictingName: l.name,
              suggestedNames: buildSuggestedUniqueNames(
                l.name,
                booksToSave.map((lb) => lb.name)
              ),
              sourceAction: 'save',
            });
            return {
              ok: false,
              message: `Duplicate lorebook name "${l.name}" detected. Please resolve before saving.`,
            };
          }
          seenBookNames.set(lower, l.id!);
        }
      }

      const nowIso = new Date().toISOString();
      const usedCharFiles = new Set<string>();
      const usedLoreFiles = new Set<string>();
      const usedThemeFiles = new Set<string>();
      const usedTagFiles = new Set<string>();

      const characterPayloads = charsToSave.map((c) => {
        const oldFileName =
          (c.id ? charDiskFileNamesRef.current.get(c.id) : undefined) ||
          c.savedFileName;
        const fileName = ensureUniqueSavedFileName(
          c.name,
          usedCharFiles,
          'character'
        );
        if (c.id) {
          charDiskFileNamesRef.current.set(c.id, fileName);
        }
        const payload = serializeCharacterCard(
          { ...c, savedFileName: fileName },
          settingsToSave.cardSpecVersion,
          c.character_book
        );
        return {
          fileName,
          oldFileName,
          payload,
        };
      });

      const lorebookPayloads = booksToSave.map((lb) => {
        const oldFileName =
          (lb.id ? loreDiskFileNamesRef.current.get(lb.id) : undefined) ||
          lb.savedFileName;
        const fileName = ensureUniqueSavedFileName(
          lb.name,
          usedLoreFiles,
          'lorebook'
        );
        if (lb.id) {
          loreDiskFileNamesRef.current.set(lb.id, fileName);
        }
        const payload = serializeLorebookCard({
          ...lb,
          savedFileName: fileName,
        });
        return {
          fileName,
          oldFileName,
          payload,
        };
      });

      // Space-efficient disk persistence: only save added or modified Themes to ./Saves/Themes/
      const customThemesToSave = extractCustomOrModifiedThemes(themesToSave);
      const themePayloads = customThemesToSave.map((th) => {
        const oldFileName =
          (th.id ? themeDiskFileNamesRef.current.get(th.id) : undefined) ||
          th.savedFileName;
        const fileName = ensureUniqueSavedFileName(
          th.name,
          usedThemeFiles,
          'theme'
        );
        if (th.id) {
          themeDiskFileNamesRef.current.set(th.id, fileName);
        }
        const compactPayload = {
          ...compactThemeForStorage(th),
          _tavernsmithType: 'theme',
        };
        return {
          fileName,
          oldFileName,
          content: JSON.stringify(compactPayload),
        };
      });

      // Space-efficient disk persistence: only save added or modified Tags to ./Saves/Tags/
      const customTagsToSave = extractCustomUserTags(tagsToSave);
      const tagPayloads = customTagsToSave.map((tg) => {
        const oldFileName =
          (tg.id ? tagDiskFileNamesRef.current.get(tg.id) : undefined) ||
          tg.savedFileName;
        const fileName = ensureUniqueSavedFileName(
          tg.name,
          usedTagFiles,
          'tag'
        );
        if (tg.id) {
          tagDiskFileNamesRef.current.set(tg.id, fileName);
        }
        const builtInMatch = builtInTagByNameMap.get(
          tg.name.trim().toLowerCase()
        );
        const compactPayload = {
          ...compactTagForStorage(tg, builtInMatch),
          _tavernsmithType: 'tag',
        };
        return {
          fileName,
          oldFileName,
          content: JSON.stringify(compactPayload),
        };
      });

      // Include custom/modified Themes and Tags in _tavernsmith_meta.json as a fallback mirror alongside ./Saves/Themes/ & ./Saves/Tags/
      const metaPayload: TavernSmithMetaPayload = {
        schema: 'tavernsmith_meta_v1',
        updatedAt: nowIso,
        activeThemeId: settingsToSave.activeThemeId,
        settings: settingsToSave,
        aiConfig: stripApiKeysForStorage(aiConfigToSave),
        activeCharacterId: activeCharId,
        activeLorebookId: activeBookId,
        contextThemes: customThemesToSave,
        tags: customTagsToSave,
      };

      let vaultEnvelope = readEncryptedVaultEnvelope();
      const inMemKeys = getInMemoryDecryptedKeys();
      if (!vaultEnvelope && Object.keys(inMemKeys).length > 0) {
        vaultEnvelope = await encryptAndSaveProviderKeys(
          inMemKeys,
          undefined,
          true
        );
      }

      try {
        const res = await fetch('/api/disk/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characters: characterPayloads,
            lorebooks: lorebookPayloads,
            themes: themePayloads,
            tags: tagPayloads,
            meta: metaPayload,
            vault: vaultEnvelope || undefined,
            customSavePath: settingsToSave.activeSaveFolder,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const diskState = (await res.json()) as DiskStateResponse;
        const noConcurrentMutation =
          diskMutationVersionRef.current === versionAtStart;
        if (diskState && diskState.ok) {
          if (diskState.resolvedPath || diskState.diskRoot) {
            setDiskResolvedPath(diskState.resolvedPath || diskState.diskRoot);
          }
          if (Array.isArray(diskState.files) && noConcurrentMutation) {
            setDiskFiles(diskState.files);
          }
          if (diskState.updatedAt && noConcurrentMutation) {
            setLastSavedAt(formatSafeTimestamp(diskState.updatedAt));
          }
        }
        if (noConcurrentMutation) {
          latestWorkspaceRef.current.isDirty = false;
          setIsDirty(false);
        }

        return {
          ok: true,
          message: `Saved to ${diskState.diskRoot || './Saves/'} (${characterPayloads.length} Characters, ${lorebookPayloads.length} Lorebooks, ${themePayloads.length} Themes, ${tagPayloads.length} Tags).`,
        };
      } catch {
        return {
          ok: false,
          message: 'Could not reach local disk API (/api/disk/save).',
        };
      }
    },
    []
  );

  const executeDiskSaveAndRescan = useCallback(
    async (
      mode: 'manual' | 'autosave' = 'manual',
      overrideState?: {
        characters?: CharacterCardData[];
        lorebooks?: Lorebook[];
        themes?: ContextTheme[];
        tags?: TagDefinition[];
      }
    ): Promise<{ ok: boolean; message: string }> => {
      return enqueueDiskOperation(() =>
        runDiskSaveRequest(mode, overrideState, diskMutationVersionRef.current)
      );
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const createNewCharacter = useCallback(
    (partial?: Partial<CharacterCardData>) => {
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;
      const currentChars = charactersRef.current;
      const fresh = createBlankCharacter(partial);
      const uniqueName = ensureUniqueEntityName(
        fresh.name,
        currentChars.map((c) => c.name || 'New Character'),
        'New Character'
      );
      const usedFilesLower = new Set(
        currentChars
          .map((c) => (c.savedFileName || charDiskFileNamesRef.current.get(c.id || '') || '').toLowerCase())
          .filter(Boolean)
      );
      const uniqueFileName = ensureUniqueSavedFileName(
        uniqueName,
        usedFilesLower,
        'character'
      );
      fresh.name = uniqueName;
      fresh.savedFileName = uniqueFileName;
      fresh.isNsfw = isCharacterNsfw(fresh, tagsRef.current);

      if (fresh.id) {
        charDiskFileNamesRef.current.set(fresh.id, uniqueFileName);
      }
      const nextChars = [fresh, ...currentChars];
      charactersRef.current = nextChars;
      latestWorkspaceRef.current.characters = nextChars;
      activeCharacterIdRef.current = fresh.id!;
      latestWorkspaceRef.current.activeCharacterId = fresh.id!;
      setCharactersState(nextChars);
      setActiveCharacterIdState(fresh.id!);

      // Immediately persist newly created character to disk without overwriting React state
      void enqueueDiskOperation(() =>
        runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
          },
          opVersion
        )
      );

      return fresh.id!;
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const createNewLorebook = useCallback(
    (partial?: Partial<Lorebook>) => {
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;
      const currentBooks = lorebooksRef.current;
      const fresh = createBlankLorebook(partial);
      const uniqueName = ensureUniqueEntityName(
        fresh.name,
        currentBooks.map((l) => l.name || 'New World Lorebook'),
        'New World Lorebook'
      );
      const usedFilesLower = new Set(
        currentBooks
          .map((l) => (l.savedFileName || loreDiskFileNamesRef.current.get(l.id || '') || '').toLowerCase())
          .filter(Boolean)
      );
      const uniqueFileName = ensureUniqueSavedFileName(
        uniqueName,
        usedFilesLower,
        'lorebook'
      );
      fresh.name = uniqueName;
      fresh.savedFileName = uniqueFileName;
      fresh.isNsfw = isLorebookNsfw(fresh, tagsRef.current);

      if (fresh.id) {
        loreDiskFileNamesRef.current.set(fresh.id, uniqueFileName);
      }
      const nextBooks = [fresh, ...currentBooks];
      lorebooksRef.current = nextBooks;
      latestWorkspaceRef.current.lorebooks = nextBooks;
      activeLorebookIdRef.current = fresh.id!;
      latestWorkspaceRef.current.activeLorebookId = fresh.id!;
      setLorebooksState(nextBooks);
      setActiveLorebookIdState(fresh.id!);

      // Immediately persist newly created lorebook to disk without overwriting React state
      void enqueueDiskOperation(() =>
        runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
          },
          opVersion
        )
      );

      return fresh.id!;
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  // Unified Character Delete (updates React state & synchronous refs immediately, deletes on disk, and mirrors exact remaining state)
  const deleteCharacter = useCallback(
    (id: string) => {
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;

      const currentChars = charactersRef.current;
      const target = currentChars.find((c) => c.id === id);
      const wasActive = activeCharacterIdRef.current === id;
      const diskFileName =
        charDiskFileNamesRef.current.get(id) ||
        target?.savedFileName ||
        (target ? `${sanitizeFilename(target.name)}.json` : '');
      charDiskFileNamesRef.current.delete(id);

      const remaining = currentChars.filter((c) => c.id !== id);
      charactersRef.current = remaining;
      latestWorkspaceRef.current.characters = remaining;

      let nextActiveCharId = activeCharacterIdRef.current;
      if (remaining.length === 0) {
        nextActiveCharId = '';
      } else if (
        activeCharacterIdRef.current === id ||
        !remaining.some((c) => c.id === activeCharacterIdRef.current)
      ) {
        nextActiveCharId = remaining[0].id!;
      }
      activeCharacterIdRef.current = nextActiveCharId;
      latestWorkspaceRef.current.activeCharacterId = nextActiveCharId;

      setCharactersState(remaining);
      setActiveCharacterIdState(nextActiveCharId);

      // Purge any cached drafts belonging to the deleted character
      setWorkspaceDraftCache((prev) => {
        const nextSmart = { ...prev.smartEditorDrafts };
        for (const k of Object.keys(nextSmart)) {
          if (k.startsWith(`char:${id}:`)) {
            delete nextSmart[k];
          }
        }
        return {
          ...prev,
          character: wasActive
            ? { ...prev.character, activeGreetingIdx: 0 }
            : prev.character,
          smartEditorDrafts: nextSmart,
        };
      });

      if (diskFileName || target?.savedFileName) {
        setDiskFiles((prev) =>
          prev.filter(
            (f) =>
              !(
                f.kind === 'character' &&
                (f.fileName === diskFileName ||
                  (target?.savedFileName &&
                    f.fileName === target.savedFileName))
              )
          )
        );
      }

      void enqueueDiskOperation(async () => {
        try {
          await fetch('/api/disk/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folder: 'Characters',
              fileName: diskFileName || undefined,
              savedFileName: target?.savedFileName || undefined,
              name: target?.name || undefined,
              id,
              customSavePath: settingsRef.current.activeSaveFolder,
            }),
          });
        } catch {
          // Proceed to authoritative mirrored save even if direct delete encountered an error
        }
        await runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
          },
          opVersion
        );
      });
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  // Unified Lorebook Delete (updates React state & synchronous refs immediately, deletes on disk, and mirrors exact remaining state)
  const deleteLorebook = useCallback(
    (id: string) => {
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;

      const currentBooks = lorebooksRef.current;
      const target = currentBooks.find((l) => l.id === id);
      const wasActive = activeLorebookIdRef.current === id;
      const diskFileName =
        loreDiskFileNamesRef.current.get(id) ||
        target?.savedFileName ||
        (target ? `${sanitizeFilename(target.name)}.json` : '');
      loreDiskFileNamesRef.current.delete(id);

      const remaining = currentBooks.filter((l) => l.id !== id);
      lorebooksRef.current = remaining;
      latestWorkspaceRef.current.lorebooks = remaining;

      let nextActiveBookId = activeLorebookIdRef.current;
      if (remaining.length === 0) {
        nextActiveBookId = '';
      } else if (
        activeLorebookIdRef.current === id ||
        !remaining.some((l) => l.id === activeLorebookIdRef.current)
      ) {
        nextActiveBookId = remaining[0].id!;
      }
      activeLorebookIdRef.current = nextActiveBookId;
      latestWorkspaceRef.current.activeLorebookId = nextActiveBookId;

      setLorebooksState(remaining);
      setActiveLorebookIdState(nextActiveBookId);

      // Purge any cached drafts belonging to the deleted lorebook
      setWorkspaceDraftCache((prev) => {
        const nextSmart = { ...prev.smartEditorDrafts };
        for (const k of Object.keys(nextSmart)) {
          if (k.startsWith(`lore:${id}:`)) {
            delete nextSmart[k];
          }
        }
        return {
          ...prev,
          lorebook: wasActive
            ? {
                ...prev.lorebook,
                selectedEntryId: remaining[0]?.entries[0]?.id ?? null,
              }
            : prev.lorebook,
          smartEditorDrafts: nextSmart,
        };
      });

      if (diskFileName || target?.savedFileName) {
        setDiskFiles((prev) =>
          prev.filter(
            (f) =>
              !(
                f.kind === 'lorebook' &&
                (f.fileName === diskFileName ||
                  (target?.savedFileName &&
                    f.fileName === target.savedFileName))
              )
          )
        );
      }

      void enqueueDiskOperation(async () => {
        try {
          await fetch('/api/disk/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folder: 'Lorebooks',
              fileName: diskFileName || undefined,
              savedFileName: target?.savedFileName || undefined,
              name: target?.name || undefined,
              id,
              customSavePath: settingsRef.current.activeSaveFolder,
            }),
          });
        } catch {
          // Proceed to authoritative mirrored save even if direct delete encountered an error
        }
        await runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
          },
          opVersion
        );
      });
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const THEME_SWATCHES = useMemo(
    () => [
      '#6366f1',
      '#a855f7',
      '#ec4899',
      '#f43f5e',
      '#f59e0b',
      '#10b981',
      '#06b6d4',
      '#3b82f6',
    ],
    []
  );

  const createNewTheme = useCallback(
    (partial?: Partial<ContextTheme>): ContextTheme => {
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;
      const currentThemes = themesRef.current;
      const uniqueName = ensureUniqueEntityName(
        partial?.name || 'Custom Theme',
        currentThemes.map((t) => t.name || 'Custom Theme'),
        'Custom Theme'
      );
      const usedThemeFiles = new Set(
        currentThemes
          .map((t) =>
            (
              t.savedFileName ||
              themeDiskFileNamesRef.current.get(t.id) ||
              ''
            ).toLowerCase()
          )
          .filter(Boolean)
      );
      const uniqueFileName = ensureUniqueSavedFileName(
        uniqueName,
        usedThemeFiles,
        'theme'
      );
      const created: ContextTheme = {
        id:
          partial?.id ||
          `theme-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        savedFileName: uniqueFileName,
        name: uniqueName,
        color:
          partial?.color ||
          THEME_SWATCHES[currentThemes.length % THEME_SWATCHES.length] ||
          '#ec4899',
        aiContextPrompt:
          partial?.aiContextPrompt ??
          `Write in a compelling ${uniqueName} style with strong atmospheric detail.`,
        associatedTags: Array.isArray(partial?.associatedTags)
          ? sortTagsByContextOrder(partial.associatedTags, tagsRef.current)
          : [],
        isBuiltIn: false,
      };

      themeDiskFileNamesRef.current.set(created.id, uniqueFileName);
      const nextThemes = [...currentThemes, created];
      themesRef.current = nextThemes;
      latestWorkspaceRef.current.themes = nextThemes;
      setThemesState(nextThemes);

      const nextSettings = {
        ...settingsRef.current,
        activeThemeId: created.id,
      };
      settingsRef.current = nextSettings;
      latestWorkspaceRef.current.settings = nextSettings;
      setSettingsState(nextSettings);

      void enqueueDiskOperation(() =>
        runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
            themes: themesRef.current,
            tags: tagsRef.current,
          },
          opVersion
        )
      );

      return created;
    },
    [THEME_SWATCHES, enqueueDiskOperation, runDiskSaveRequest]
  );

  const updateTheme = useCallback(
    (id: string, partial: Partial<ContextTheme>) => {
      const currentThemes = themesRef.current;
      const target = currentThemes.find((t) => t.id === id);
      if (!target) return;

      diskMutationVersionRef.current += 1;
      latestWorkspaceRef.current.isDirty = true;
      setIsDirty(true);

      const usedThemeFiles = new Set(
        currentThemes
          .filter((t) => t.id !== id)
          .map((t) =>
            (
              t.savedFileName ||
              themeDiskFileNamesRef.current.get(t.id) ||
              ''
            ).toLowerCase()
          )
          .filter(Boolean)
      );

      const candidateName =
        typeof partial.name === 'string' && partial.name.trim()
          ? partial.name.trim()
          : target.name;
      const assignedFile =
        partial.savedFileName ||
        target.savedFileName ||
        themeDiskFileNamesRef.current.get(id) ||
        ensureUniqueSavedFileName(candidateName, usedThemeFiles, 'theme');

      themeDiskFileNamesRef.current.set(id, assignedFile);

      const sortedAssociatedTags = partial.associatedTags
        ? sortTagsByContextOrder(partial.associatedTags, tagsRef.current)
        : undefined;

      const nextThemes = currentThemes.map((t) =>
        t.id === id
          ? {
              ...t,
              ...partial,
              ...(sortedAssociatedTags !== undefined
                ? { associatedTags: sortedAssociatedTags }
                : {}),
              savedFileName: assignedFile,
            }
          : t
      );

      themesRef.current = nextThemes;
      latestWorkspaceRef.current.themes = nextThemes;
      setThemesState(nextThemes);

      if (themeSaveTimerRef.current !== null) {
        window.clearTimeout(themeSaveTimerRef.current);
      }
      const opVersion = diskMutationVersionRef.current;
      themeSaveTimerRef.current = window.setTimeout(() => {
        themeSaveTimerRef.current = null;
        void enqueueDiskOperation(() =>
          runDiskSaveRequest(
            'autosave',
            {
              characters: charactersRef.current,
              lorebooks: lorebooksRef.current,
              themes: themesRef.current,
              tags: tagsRef.current,
            },
            opVersion
          )
        );
      }, 300);
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const deleteTheme = useCallback(
    (id: string) => {
      const currentThemes = themesRef.current;
      const target = currentThemes.find((t) => t.id === id);
      if (!target) return;

      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;

      const diskFileName =
        themeDiskFileNamesRef.current.get(id) ||
        target.savedFileName ||
        `${sanitizeFilename(target.name)}.json`;

      let nextThemes: ContextTheme[];
      if (target.isBuiltIn || currentThemes.length <= 1) {
        // Built-in theme: reset customization back to source default & remove disk override file
        const builtInDefault =
          builtInThemeByIdMap.get(id.toLowerCase()) ||
          builtInThemeByNameMap.get(target.name.trim().toLowerCase()) ||
          DEFAULT_CONTEXT_THEMES[0];
        nextThemes = currentThemes.map((t) =>
          t.id === id
            ? {
                ...builtInDefault,
                associatedTags: [...(builtInDefault.associatedTags || [])],
              }
            : t
        );
      } else {
        themeDiskFileNamesRef.current.delete(id);
        nextThemes = currentThemes.filter((t) => t.id !== id);
        if (settingsRef.current.activeThemeId === id) {
          const nextActiveId = nextThemes[0]?.id || 'theme-basic';
          const nextSettings = {
            ...settingsRef.current,
            activeThemeId: nextActiveId,
          };
          settingsRef.current = nextSettings;
          latestWorkspaceRef.current.settings = nextSettings;
          setSettingsState(nextSettings);
        }
      }

      themesRef.current = nextThemes;
      latestWorkspaceRef.current.themes = nextThemes;
      setThemesState(nextThemes);

      setDiskFiles((prev) =>
        prev.filter(
          (f) =>
            !(
              f.kind === 'theme' &&
              (f.fileName === diskFileName ||
                (target.savedFileName && f.fileName === target.savedFileName))
            )
        )
      );

      void enqueueDiskOperation(async () => {
        try {
          await fetch('/api/disk/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folder: 'Themes',
              fileName: diskFileName || undefined,
              savedFileName: target.savedFileName || undefined,
              name: target.name || undefined,
              id,
              customSavePath: settingsRef.current.activeSaveFolder,
            }),
          });
        } catch {
          // Proceed with mirrored disk save even if direct delete failed
        }
        await runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
            themes: themesRef.current,
            tags: tagsRef.current,
          },
          opVersion
        );
      });
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const upsertCustomTag = useCallback(
    (input: {
      id?: string;
      name: string;
      color: string;
      category: TagCategory;
      isNsfw: boolean;
      aiContextDescription: string;
    }): { updatedExisting: boolean; tag: TagDefinition } => {
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;

      const cleanName = input.name.trim() || 'Custom Tag';
      const cleanDesc =
        input.aiContextDescription.trim() ||
        (input.isNsfw
          ? `Explicit 18+ directive for "${cleanName}": incorporate vivid sensory and thematic elements consistent with "${cleanName}".`
          : `Incorporate thematic, tonal, and character elements consistent with "${cleanName}".`);

      const currentTags = tagsRef.current;
      const existing =
        (input.id ? currentTags.find((t) => t.id === input.id) : undefined) ||
        currentTags.find(
          (t) => t.name.trim().toLowerCase() === cleanName.toLowerCase()
        );

      const usedTagFiles = new Set(
        currentTags
          .filter((t) => !existing || t.id !== existing.id)
          .map((t) =>
            (
              t.savedFileName ||
              tagDiskFileNamesRef.current.get(t.id) ||
              ''
            ).toLowerCase()
          )
          .filter(Boolean)
      );

      const resolvedCategory = migrateLegacyTagCategory(
        input.category || existing?.category || 'Custom',
        cleanName,
        cleanDesc
      );
      const resolvedIsNsfw =
        resolvedCategory === 'Genitals' ? true : Boolean(input.isNsfw);

      let resultTag: TagDefinition;
      let nextTags: TagDefinition[];

      if (existing) {
        const assignedFile =
          existing.savedFileName ||
          tagDiskFileNamesRef.current.get(existing.id) ||
          ensureUniqueSavedFileName(cleanName, usedTagFiles, 'tag');
        resultTag = {
          ...existing,
          name: cleanName,
          savedFileName: assignedFile,
          color: input.color || existing.color,
          category: resolvedCategory,
          isNsfw: resolvedIsNsfw,
          aiContextDescription: cleanDesc,
          aiDescription: cleanDesc,
          description: cleanDesc,
        };
        tagDiskFileNamesRef.current.set(resultTag.id, assignedFile);
        nextTags = currentTags.map((t) =>
          t.id === existing.id ? resultTag : t
        );
      } else {
        const newId =
          input.id ||
          `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const assignedFile = ensureUniqueSavedFileName(
          cleanName,
          usedTagFiles,
          'tag'
        );
        resultTag = {
          id: newId,
          savedFileName: assignedFile,
          name: cleanName,
          color: input.color || '#a855f7',
          category: resolvedCategory,
          isNsfw: resolvedIsNsfw,
          aiContextDescription: cleanDesc,
          aiDescription: cleanDesc,
          description: cleanDesc,
        };
        tagDiskFileNamesRef.current.set(resultTag.id, assignedFile);
        nextTags = [resultTag, ...currentTags];
      }

      tagsRef.current = nextTags;
      latestWorkspaceRef.current.tags = nextTags;
      setTagsState(nextTags);

      // Keep attached project tags sorted if a tag's category changed
      if (existing && existing.category !== resultTag.category) {
        const reorderedChars = charactersRef.current.map((c) =>
          normalizeCharacterTagsWithCatalog(c, nextTags)
        );
        charactersRef.current = reorderedChars;
        latestWorkspaceRef.current.characters = reorderedChars;
        setCharactersState(reorderedChars);

        const reorderedBooks = lorebooksRef.current.map((l) =>
          normalizeLorebookTagsWithCatalog(l, nextTags)
        );
        lorebooksRef.current = reorderedBooks;
        latestWorkspaceRef.current.lorebooks = reorderedBooks;
        setLorebooksState(reorderedBooks);

        const reorderedThemes = themesRef.current.map((th) => {
          const sorted = sortTagsByContextOrder(th.associatedTags || [], nextTags);
          return stringArraysEqual(th.associatedTags || [], sorted)
            ? th
            : { ...th, associatedTags: sorted };
        });
        themesRef.current = reorderedThemes;
        latestWorkspaceRef.current.themes = reorderedThemes;
        setThemesState(reorderedThemes);
      }

      void enqueueDiskOperation(() =>
        runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
            themes: themesRef.current,
            tags: tagsRef.current,
          },
          opVersion
        )
      );

      return { updatedExisting: Boolean(existing), tag: resultTag };
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const toggleTagNsfw = useCallback(
    (tagId: string) => {
      const currentTags = tagsRef.current;
      const target = currentTags.find((t) => t.id === tagId);
      if (!target) return;
      if ((target.category || '').toLowerCase() === 'genitals') return;

      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;

      const nextIsNsfw = !isTagNsfwFlagged(target);
      const assignedFile =
        target.savedFileName ||
        tagDiskFileNamesRef.current.get(target.id) ||
        `${sanitizeFilename(target.name)}.json`;
      tagDiskFileNamesRef.current.set(target.id, assignedFile);

      const nextTags = currentTags.map((t) =>
        t.id === tagId
          ? { ...t, isNsfw: nextIsNsfw, savedFileName: assignedFile }
          : t
      );
      tagsRef.current = nextTags;
      latestWorkspaceRef.current.tags = nextTags;
      setTagsState(nextTags);

      void enqueueDiskOperation(() =>
        runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
            themes: themesRef.current,
            tags: tagsRef.current,
          },
          opVersion
        )
      );
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const deleteTag = useCallback(
    (id: string) => {
      const currentTags = tagsRef.current;
      const target = currentTags.find((t) => t.id === id);
      if (!target) return;

      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;

      const diskFileName =
        tagDiskFileNamesRef.current.get(id) ||
        target.savedFileName ||
        `${sanitizeFilename(target.name)}.json`;

      const builtInMatch = builtInTagByNameMap.get(
        target.name.trim().toLowerCase()
      );
      let nextTags: TagDefinition[];
      if (builtInMatch) {
        // Built-in tag override deleted from disk -> revert to clean source built-in default
        tagDiskFileNamesRef.current.delete(id);
        nextTags = currentTags.map((t) =>
          t.id === id ? { ...builtInMatch } : t
        );
      } else {
        tagDiskFileNamesRef.current.delete(id);
        nextTags = currentTags.filter((t) => t.id !== id);
      }

      tagsRef.current = nextTags;
      latestWorkspaceRef.current.tags = nextTags;
      setTagsState(nextTags);

      setDiskFiles((prev) =>
        prev.filter(
          (f) =>
            !(
              f.kind === 'tag' &&
              (f.fileName === diskFileName ||
                (target.savedFileName && f.fileName === target.savedFileName))
            )
        )
      );

      void enqueueDiskOperation(async () => {
        try {
          await fetch('/api/disk/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folder: 'Tags',
              fileName: diskFileName || undefined,
              savedFileName: target.savedFileName || undefined,
              name: target.name || undefined,
              id,
              customSavePath: settingsRef.current.activeSaveFolder,
            }),
          });
        } catch {
          // Proceed with mirrored disk save even if direct delete failed
        }
        await runDiskSaveRequest(
          'autosave',
          {
            characters: charactersRef.current,
            lorebooks: lorebooksRef.current,
            themes: themesRef.current,
            tags: tagsRef.current,
          },
          opVersion
        );
      });
    },
    [enqueueDiskOperation, runDiskSaveRequest]
  );

  const saveNow = useCallback(
    (mode: 'manual' | 'autosave' = 'manual') => {
      void executeDiskSaveAndRescan(mode);
    },
    [executeDiskSaveAndRescan]
  );

  const saveAndSyncNow = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    return executeDiskSaveAndRescan('manual');
  }, [executeDiskSaveAndRescan]);

  // Auto-Save Timer & Blur/Visibility Flush -> Uses Web Worker so switching windows never throttles or pauses Auto-Save
  useEffect(() => {
    if (!settings.autoSaveEnabled) return;
    const intervalMs = Math.max(5, settings.autoSaveIntervalSec) * 1000;

    const triggerAutoSaveIfDirty = () => {
      if (latestWorkspaceRef.current.isDirty) {
        void executeDiskSaveAndRescan('autosave');
      }
    };

    let worker: Worker | null = null;
    let workerBlobUrl: string | null = null;
    let fallbackTimerId: number | null = null;

    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const workerScript = `const ms = ${intervalMs}; const id = setInterval(() => self.postMessage('tick'), ms); self.onmessage = (e) => { if (e.data === 'stop') { clearInterval(id); self.close(); } };`;
        const blob = new Blob([workerScript], {
          type: 'application/javascript',
        });
        workerBlobUrl = URL.createObjectURL(blob);
        worker = new Worker(workerBlobUrl);
        worker.onmessage = () => {
          triggerAutoSaveIfDirty();
        };
        worker.onerror = () => {
          if (fallbackTimerId === null) {
            fallbackTimerId = window.setInterval(
              triggerAutoSaveIfDirty,
              intervalMs
            );
          }
        };
      } catch {
        fallbackTimerId = window.setInterval(
          triggerAutoSaveIfDirty,
          intervalMs
        );
      }
    } else {
      fallbackTimerId = window.setInterval(triggerAutoSaveIfDirty, intervalMs);
    }

    const handleWindowBlur = () => {
      triggerAutoSaveIfDirty();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerAutoSaveIfDirty();
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (worker) {
        try {
          worker.postMessage('stop');
          worker.terminate();
        } catch {
          // Ignore Worker termination errors
        }
      }
      if (workerBlobUrl) {
        try {
          URL.revokeObjectURL(workerBlobUrl);
        } catch {
          // Ignore URL revoke errors
        }
      }
      if (fallbackTimerId !== null) {
        window.clearInterval(fallbackTimerId);
      }
    };
  }, [
    settings.autoSaveEnabled,
    settings.autoSaveIntervalSec,
    executeDiskSaveAndRescan,
  ]);

  const createSaveFolder = useCallback(
    (rawPath: string) => {
      const clean = rawPath.trim() || UNIFIED_INTERNAL_ROOT;
      setSettings((prev) => ({
        ...prev,
        activeSaveFolder: clean,
        availableSaveFolders: Array.from(
          new Set([UNIFIED_INTERNAL_ROOT, clean])
        ),
      }));
      void fetch(
        `/api/disk/state?customSavePath=${encodeURIComponent(clean)}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        }
      )
        .then((r) => r.json())
        .then((diskState: DiskStateResponse) => {
          if (diskState && diskState.ok) {
            void applyDiskStateToWorkspace(diskState);
          }
        })
        .catch(() => {
          // Ignore error
        });
    },
    [applyDiskStateToWorkspace]
  );

  const setActiveSaveFolder = useCallback(
    (folderPath: string) => {
      createSaveFolder(folderPath);
    },
    [createSaveFolder]
  );

  const loadSavedFileIntoWorkspace = useCallback(
    (file: SavedFileEntry): { ok: boolean; message: string } => {
      if (file.isCorrupted) {
        return {
          ok: false,
          message: `"${file.fileName}" is corrupted (${file.corruptReason || 'invalid JSON'}). Download it to recover data or delete it from Saved Files.`,
        };
      }
      try {
        if (file.kind === 'meta' || file.fileName === META_FILENAME) {
          const parsedMeta = JSON.parse(
            file.content
          ) as Partial<TavernSmithMetaPayload>;
          if (Array.isArray(parsedMeta.tags) && parsedMeta.tags.length > 0) {
            setTags(mergeWithDefaultTags(parsedMeta.tags));
          }
          if (
            Array.isArray(parsedMeta.contextThemes) &&
            parsedMeta.contextThemes.length > 0
          ) {
            setThemes(parsedMeta.contextThemes);
          }
          return {
            ok: true,
            message: `Restored Tags & Context Themes from ${META_FILENAME}.`,
          };
        }

        if (file.kind === 'vault' || file.fileName === VAULT_FILENAME) {
          return {
            ok: true,
            message: `AES-256-GCM key vault (${VAULT_FILENAME}) is active.`,
          };
        }

        if (file.kind === 'theme' || file.folderPath === 'Themes/') {
          const parsedThemeRaw = JSON.parse(file.content) as Record<
            string,
            unknown
          >;
          const normalized = normalizeIncomingTheme({
            ...parsedThemeRaw,
            _diskFileName: file.fileName,
          });
          if (!normalized) {
            return {
              ok: false,
              message: `Could not read theme from ${file.fileName}.`,
            };
          }
          const nextThemes = mergeWithDefaultThemes([
            ...themesRef.current,
            normalized,
          ]);
          const matched =
            nextThemes.find(
              (t) =>
                t.id === normalized.id ||
                t.name.trim().toLowerCase() ===
                  normalized.name.trim().toLowerCase()
            ) || normalized;
          if (matched.savedFileName) {
            themeDiskFileNamesRef.current.set(matched.id, matched.savedFileName);
          }
          themesRef.current = nextThemes;
          latestWorkspaceRef.current.themes = nextThemes;
          setThemesState(nextThemes);
          setActiveThemeId(matched.id);
          setActiveTab('themes');
          return {
            ok: true,
            message: `Loaded and activated theme "${matched.name}" from ./Saves/Themes/${file.fileName}.`,
          };
        }

        if (file.kind === 'tag' || file.folderPath === 'Tags/') {
          const parsedTagRaw = JSON.parse(file.content) as Record<
            string,
            unknown
          >;
          const nextTags = mergeWithDefaultTags([
            ...extractCustomUserTags(tagsRef.current),
            {
              ...parsedTagRaw,
              _diskFileName: file.fileName,
            },
          ]);
          const rawName =
            typeof parsedTagRaw.name === 'string' ? parsedTagRaw.name.trim() : '';
          const matched = nextTags.find(
            (t) => t.name.trim().toLowerCase() === rawName.toLowerCase()
          );
          if (matched && matched.id) {
            tagDiskFileNamesRef.current.set(matched.id, file.fileName);
          }
          tagsRef.current = nextTags;
          latestWorkspaceRef.current.tags = nextTags;
          setTagsState(nextTags);
          setActiveTab('themes');
          return {
            ok: true,
            message: `Loaded tag "${rawName || file.fileName}" from ./Saves/Tags/${file.fileName}.`,
          };
        }

        const forcedKind =
          file.kind === 'lorebook' || file.folderPath === 'Lorebooks/'
            ? 'lorebook'
            : file.kind === 'character' || file.folderPath === 'Characters/'
              ? 'character'
              : undefined;

        const parsed = parseImportedJsonString(
          file.content,
          undefined,
          file.fileName,
          forcedKind
        );
        if (parsed.kind === 'character') {
          const currentChars = charactersRef.current;
          parsed.character.isNsfw = isCharacterNsfw(parsed.character, tagsRef.current);
          parsed.character.savedFileName = file.fileName;
          const match = currentChars.find(
            (c) =>
              (c.savedFileName && c.savedFileName === file.fileName) ||
              (parsed.character.id && c.id === parsed.character.id) ||
              (!c.savedFileName &&
                c.name.trim().toLowerCase() ===
                  parsed.character.name.trim().toLowerCase())
          );
          if (match && match.id) {
            setActiveCharacterId(match.id);
          } else {
            const uniqueName = ensureUniqueEntityName(
              parsed.character.name,
              currentChars.map((c) => c.name || 'Character'),
              'Character'
            );
            const loadedChar = { ...parsed.character, name: uniqueName };
            if (loadedChar.id) {
              charDiskFileNamesRef.current.set(loadedChar.id, file.fileName);
            }
            setCharacters((prev) => [loadedChar, ...prev]);
            setActiveCharacterId(loadedChar.id!);
          }
          setActiveTab('character');
          return {
            ok: true,
            message: `Opened character "${parsed.character.name}" from ./Saves/Characters/${file.fileName}.`,
          };
        } else if (parsed.kind === 'lorebook') {
          const currentBooks = lorebooksRef.current;
          parsed.lorebook.isNsfw = isLorebookNsfw(parsed.lorebook, tagsRef.current);
          parsed.lorebook.savedFileName = file.fileName;
          const match = currentBooks.find(
            (l) =>
              (l.savedFileName && l.savedFileName === file.fileName) ||
              (parsed.lorebook.id && l.id === parsed.lorebook.id) ||
              (!l.savedFileName &&
                l.name.trim().toLowerCase() ===
                  parsed.lorebook.name.trim().toLowerCase())
          );
          if (match && match.id) {
            setActiveLorebookId(match.id);
          } else {
            const uniqueName = ensureUniqueEntityName(
              parsed.lorebook.name,
              currentBooks.map((l) => l.name || 'Lorebook'),
              'Lorebook'
            );
            const loadedBook = { ...parsed.lorebook, name: uniqueName };
            if (loadedBook.id) {
              loreDiskFileNamesRef.current.set(loadedBook.id, file.fileName);
            }
            setLorebooks((prev) => [loadedBook, ...prev]);
            setActiveLorebookId(loadedBook.id!);
          }
          setActiveTab('lorebook');
          return {
            ok: true,
            message: `Opened lorebook "${parsed.lorebook.name}" from ./Saves/Lorebooks/${file.fileName}.`,
          };
        }
        return { ok: false, message: 'Unrecognized file format.' };
      } catch {
        return { ok: false, message: `Could not parse ${file.fileName}.` };
      }
    },
    [setActiveCharacterId, setActiveLorebookId, setCharacters, setLorebooks, setTags, setThemes]
  );

  // Unified Disk Delete from Options File List — routes directly through deleteCharacter / deleteLorebook / deleteTheme / deleteTag
  const deleteSavedFile = useCallback(
    (fileId: string) => {
      const target =
        diskFiles.find((f) => f.id === fileId) ||
        buildUnifiedSavedFiles(
          charactersRef.current,
          lorebooksRef.current,
          latestWorkspaceRef.current.themes,
          latestWorkspaceRef.current.tags,
          latestWorkspaceRef.current.settings.activeThemeId,
          latestWorkspaceRef.current.settings.cardSpecVersion
        ).find((f) => f.id === fileId);
      if (!target) return;
      const isCorruptedRoot =
        Boolean(target.isCorrupted) &&
        (target.kind === 'meta' || target.kind === 'vault');
      if (
        target.kind !== 'character' &&
        target.kind !== 'lorebook' &&
        target.kind !== 'theme' &&
        target.kind !== 'tag' &&
        !isCorruptedRoot
      ) {
        return;
      }

      if (!target.isCorrupted) {
        let embeddedId: string | undefined;
        let embeddedName: string | undefined;
        try {
          const parsedJson = JSON.parse(target.content) as Record<string, unknown>;
          const dataNode =
            parsedJson.data && typeof parsedJson.data === 'object'
              ? (parsedJson.data as Record<string, unknown>)
              : undefined;
          const rawId =
            parsedJson.id ??
            dataNode?.id ??
            (parsedJson.extensions &&
            typeof parsedJson.extensions === 'object'
              ? (parsedJson.extensions as Record<string, unknown>).tavernsmith_id
              : undefined);
          if (typeof rawId === 'string' && rawId.trim()) {
            embeddedId = rawId.trim();
          }
          const rawName = parsedJson.name ?? dataNode?.name;
          if (typeof rawName === 'string' && rawName.trim()) {
            embeddedName = rawName.trim();
          }
        } catch {
          // Ignore non-JSON preview
        }

        if (target.kind === 'character') {
          const matchingChar = charactersRef.current.find((c) => {
            const mappedFile =
              c.savedFileName ||
              (c.id ? charDiskFileNamesRef.current.get(c.id) : undefined);
            if (mappedFile && mappedFile === target.fileName) return true;
            if (embeddedId && c.id === embeddedId) return true;
            if (
              embeddedName &&
              (c.name || '').trim().toLowerCase() === embeddedName.toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matchingChar?.id) {
            deleteCharacter(matchingChar.id);
            return;
          }
        } else if (target.kind === 'lorebook') {
          const matchingBook = lorebooksRef.current.find((l) => {
            const mappedFile =
              l.savedFileName ||
              (l.id ? loreDiskFileNamesRef.current.get(l.id) : undefined);
            if (mappedFile && mappedFile === target.fileName) return true;
            if (embeddedId && l.id === embeddedId) return true;
            if (
              embeddedName &&
              (l.name || '').trim().toLowerCase() === embeddedName.toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matchingBook?.id) {
            deleteLorebook(matchingBook.id);
            return;
          }
        } else if (target.kind === 'theme') {
          const matchingTheme = themesRef.current.find((th) => {
            const mappedFile =
              th.savedFileName || themeDiskFileNamesRef.current.get(th.id);
            if (mappedFile && mappedFile === target.fileName) return true;
            if (embeddedId && th.id === embeddedId) return true;
            if (
              embeddedName &&
              th.name.trim().toLowerCase() === embeddedName.toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matchingTheme?.id) {
            deleteTheme(matchingTheme.id);
            return;
          }
        } else if (target.kind === 'tag') {
          const matchingTag = tagsRef.current.find((tg) => {
            const mappedFile =
              tg.savedFileName || tagDiskFileNamesRef.current.get(tg.id);
            if (mappedFile && mappedFile === target.fileName) return true;
            if (embeddedId && tg.id === embeddedId) return true;
            if (
              embeddedName &&
              tg.name.trim().toLowerCase() === embeddedName.toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matchingTag?.id) {
            deleteTag(matchingTag.id);
            return;
          }
        }
      }

      // Unattached or corrupted on-disk file not currently loaded into React state
      diskMutationVersionRef.current += 1;
      const opVersion = diskMutationVersionRef.current;
      setDiskFiles((prev) => prev.filter((f) => f.id !== fileId));

      const folder =
        target.kind === 'lorebook'
          ? 'Lorebooks'
          : target.kind === 'theme'
            ? 'Themes'
            : target.kind === 'tag'
              ? 'Tags'
              : target.kind === 'meta' || target.kind === 'vault'
                ? 'Root'
                : 'Characters';
      void enqueueDiskOperation(async () => {
        try {
          const delRes = await fetch('/api/disk/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              folder,
              kind: target.kind,
              fileName: target.fileName,
              savedFileName: target.fileName,
              customSavePath: latestWorkspaceRef.current.settings.activeSaveFolder,
            }),
          });
          if (delRes.ok) {
            const delState = (await delRes.json()) as DiskStateResponse;
            if (
              delState?.ok &&
              Array.isArray(delState.files) &&
              diskMutationVersionRef.current === opVersion
            ) {
              setDiskFiles(delState.files);
            }
          }
        } catch {
          // Ignore transient network error
        }
        if (!target.isCorrupted) {
          await runDiskSaveRequest(
            'autosave',
            {
              characters: charactersRef.current,
              lorebooks: lorebooksRef.current,
              themes: themesRef.current,
              tags: tagsRef.current,
            },
            opVersion
          );
        }
      });
    },
    [
      diskFiles,
      deleteCharacter,
      deleteLorebook,
      deleteTheme,
      deleteTag,
      enqueueDiskOperation,
      runDiskSaveRequest,
    ]
  );

  const requestDeleteCharacter = useCallback((id: string) => {
    const target = latestWorkspaceRef.current.characters.find((c) => c.id === id);
    if (!target) return;
    setPendingDeleteTarget({
      kind: 'character',
      id,
      displayName: target.name || 'Untitled Character',
      fileName:
        charDiskFileNamesRef.current.get(id) || target.savedFileName || undefined,
    });
  }, []);

  const requestDeleteLorebook = useCallback((id: string) => {
    const target = latestWorkspaceRef.current.lorebooks.find((l) => l.id === id);
    if (!target) return;
    setPendingDeleteTarget({
      kind: 'lorebook',
      id,
      displayName: target.name || 'Untitled Lorebook',
      fileName:
        loreDiskFileNamesRef.current.get(id) || target.savedFileName || undefined,
      entryCount: target.entries.length,
    });
  }, []);

  const requestDeleteSavedFile = useCallback((file: SavedFileEntry) => {
    const isCorruptedRoot =
      Boolean(file.isCorrupted) &&
      (file.kind === 'meta' || file.kind === 'vault');
    if (
      file.kind !== 'character' &&
      file.kind !== 'lorebook' &&
      file.kind !== 'theme' &&
      file.kind !== 'tag' &&
      !isCorruptedRoot
    ) {
      return;
    }
    setPendingDeleteTarget({
      kind: 'savedFile',
      id: file.id,
      displayName: file.fileName,
      fileName: file.fileName,
      folder:
        file.kind === 'lorebook'
          ? 'Lorebooks'
          : file.kind === 'theme'
            ? 'Themes'
            : file.kind === 'tag'
              ? 'Tags'
              : file.kind === 'meta' || file.kind === 'vault'
                ? 'Root'
                : 'Characters',
      fileKind: file.kind,
      subtitle: file.isCorrupted
        ? `Corrupted JSON file (${file.corruptReason || 'unparseable'})`
        : undefined,
    });
  }, []);

  const cancelPendingDelete = useCallback(() => {
    setPendingDeleteTarget(null);
  }, []);

  const confirmPendingDelete = useCallback(() => {
    if (!pendingDeleteTarget) return;
    const current = pendingDeleteTarget;
    setPendingDeleteTarget(null);
    if (current.kind === 'character') {
      deleteCharacter(current.id);
    } else if (current.kind === 'lorebook') {
      deleteLorebook(current.id);
    } else {
      deleteSavedFile(current.id);
    }
  }, [pendingDeleteTarget, deleteCharacter, deleteLorebook, deleteSavedFile]);

  const savedFiles = useMemo<SavedFileEntry[]>(() => {
    if (diskFiles.length > 0) {
      return diskFiles;
    }
    return buildUnifiedSavedFiles(
      characters,
      lorebooks,
      themes,
      tags,
      settings.activeThemeId,
      settings.cardSpecVersion
    );
  }, [
    diskFiles,
    characters,
    lorebooks,
    themes,
    tags,
    settings.activeThemeId,
    settings.cardSpecVersion,
  ]);

  /**
   * Singular Space-Efficient Backup Export:
   * Always builds from live synchronous workspace refs (`charactersRef`, `lorebooksRef`,
   * `themesRef`, `tagsRef`) so even newly created/edited items before Auto-Save are exported.
   * Built-in default themes and tags are excluded unless customized.
   */
  const exportSaveFolderBundle = useCallback(() => {
    const currentChars = charactersRef.current;
    const currentBooks = lorebooksRef.current;
    const currentThemes = themesRef.current;
    const currentTags = tagsRef.current;
    const currentSettings = settingsRef.current;
    const spec = currentSettings.cardSpecVersion || 'v3';

    const serializedChars = currentChars.map((c) =>
      serializeCharacterCard(c, spec, c.character_book)
    );
    const serializedBooks = currentBooks.map((lb) => serializeLorebookCard(lb));
    const addedOrModifiedThemes = extractCustomOrModifiedThemes(currentThemes).map(
      (th) => compactThemeForStorage(th)
    );
    const addedOrModifiedTags = extractCustomUserTags(currentTags).map((tg) =>
      compactTagForStorage(
        tg,
        builtInTagByNameMap.get(tg.name.trim().toLowerCase())
      )
    );

    const bundle = {
      schema: 'tavernsmith_backup_v3',
      bundleVersion: '3.0.0',
      exportedAt: new Date().toISOString(),
      activeThemeId: currentSettings.activeThemeId,
      counts: {
        characters: serializedChars.length,
        lorebooks: serializedBooks.length,
        themes: addedOrModifiedThemes.length,
        tags: addedOrModifiedTags.length,
      },
      characters: serializedChars,
      lorebooks: serializedBooks,
      themes: addedOrModifiedThemes,
      tags: addedOrModifiedTags,
    };

    const blob = new Blob([JSON.stringify(bundle)], {
      type: 'application/json',
    });
    triggerBrowserDownload(blob, 'TavernSmith_Backup.json');
  }, []);

  const importFromFiles = useCallback(
    async (
      files: FileList | File[]
    ): Promise<{ count: number; summary: string }> => {
      const list = Array.from(files);
      let importedChars = 0;
      let importedBooks = 0;
      let importedThemes = 0;
      let importedTags = 0;
      let lastCharId: string | null = null;
      let lastBookId: string | null = null;

      const nextCharacters = [...charactersRef.current];
      const nextLorebooks = [...lorebooksRef.current];
      let nextThemes = [...themesRef.current];
      let nextTags = [...tagsRef.current];

      const usedCharFiles = new Set(
        nextCharacters
          .map((c) => (c.savedFileName || charDiskFileNamesRef.current.get(c.id || '') || '').toLowerCase())
          .filter(Boolean)
      );
      const usedLoreFiles = new Set(
        nextLorebooks
          .map((l) => (l.savedFileName || loreDiskFileNamesRef.current.get(l.id || '') || '').toLowerCase())
          .filter(Boolean)
      );

      for (const file of list) {
        if (file.name === META_FILENAME) {
          try {
            const text = await file.text();
            const parsedMeta = JSON.parse(
              text
            ) as Partial<TavernSmithMetaPayload>;
            if (Array.isArray(parsedMeta.tags) && parsedMeta.tags.length > 0) {
              nextTags = mergeWithDefaultTags([
                ...extractCustomUserTags(nextTags),
                ...parsedMeta.tags,
              ]);
              importedTags += parsedMeta.tags.length;
            }
            if (
              Array.isArray(parsedMeta.contextThemes) &&
              parsedMeta.contextThemes.length > 0
            ) {
              nextThemes = mergeWithDefaultThemes([
                ...nextThemes,
                ...parsedMeta.contextThemes,
              ]);
              importedThemes += parsedMeta.contextThemes.length;
            }
          } catch {
            // Ignore malformed meta file
          }
          continue;
        }

        if (file.name.toLowerCase().endsWith('.json')) {
          try {
            const text = await file.text();
            const parsedObj = JSON.parse(text) as Record<string, unknown>;
            if (parsedObj && typeof parsedObj === 'object') {
              if (parsedObj._tavernsmithType === 'theme') {
                const normalized = normalizeIncomingTheme(parsedObj);
                if (normalized) {
                  nextThemes = mergeWithDefaultThemes([
                    ...nextThemes,
                    normalized,
                  ]);
                  importedThemes += 1;
                }
                continue;
              }
              if (parsedObj._tavernsmithType === 'tag') {
                nextTags = mergeWithDefaultTags([
                  ...extractCustomUserTags(nextTags),
                  parsedObj,
                ]);
                importedTags += 1;
                continue;
              }
            }
          } catch {
            // Fall through to standard card parser
          }
        }

        const result = await importCardFromFile(file);
        if (result.kind === 'character') {
          const importedChar = { ...result.character };
          importedChar.isNsfw = isCharacterNsfw(importedChar, nextTags);
          importedChar.name = ensureUniqueEntityName(
            importedChar.name || 'Imported Character',
            nextCharacters.map((c) => c.name || 'Untitled'),
            'Imported Character'
          );
          if (
            !importedChar.id ||
            nextCharacters.some((c) => c.id === importedChar.id)
          ) {
            importedChar.id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          }
          const uniqueCharFile = ensureUniqueSavedFileName(
            importedChar.name,
            usedCharFiles,
            'character'
          );
          importedChar.savedFileName = uniqueCharFile;
          charDiskFileNamesRef.current.set(importedChar.id, uniqueCharFile);
          nextCharacters.unshift(importedChar);
          lastCharId = importedChar.id;
          importedChars++;

          if (result.embeddedLorebook) {
            const book = { ...result.embeddedLorebook };
            book.isNsfw = isLorebookNsfw(book, nextTags);
            book.name = ensureUniqueEntityName(
              book.name || `${importedChar.name} Lorebook`,
              nextLorebooks.map((l) => l.name || 'Untitled Lorebook'),
              'Imported Lorebook'
            );
            if (!book.id || nextLorebooks.some((l) => l.id === book.id)) {
              book.id = `lorebook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            }
            const uniqueBookFile = ensureUniqueSavedFileName(
              book.name,
              usedLoreFiles,
              'lorebook'
            );
            book.savedFileName = uniqueBookFile;
            loreDiskFileNamesRef.current.set(book.id, uniqueBookFile);
            nextLorebooks.unshift(book);
            lastBookId = book.id;
            importedBooks++;
          }
        } else if (result.kind === 'lorebook') {
          const importedBook = { ...result.lorebook };
          importedBook.isNsfw = isLorebookNsfw(importedBook, nextTags);
          importedBook.name = ensureUniqueEntityName(
            importedBook.name || 'Imported Lorebook',
            nextLorebooks.map((l) => l.name || 'Untitled Lorebook'),
            'Imported Lorebook'
          );
          if (
            !importedBook.id ||
            nextLorebooks.some((l) => l.id === importedBook.id)
          ) {
            importedBook.id = `lorebook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          }
          const uniqueBookFile = ensureUniqueSavedFileName(
            importedBook.name,
            usedLoreFiles,
            'lorebook'
          );
          importedBook.savedFileName = uniqueBookFile;
          loreDiskFileNamesRef.current.set(importedBook.id, uniqueBookFile);
          nextLorebooks.unshift(importedBook);
          lastBookId = importedBook.id;
          importedBooks++;
        }
      }

      if (importedTags > 0) {
        tagsRef.current = nextTags;
        latestWorkspaceRef.current.tags = nextTags;
        setTagsState(nextTags);
      }
      if (importedThemes > 0) {
        themesRef.current = nextThemes;
        latestWorkspaceRef.current.themes = nextThemes;
        setThemesState(nextThemes);
      }

      setCharacters(nextCharacters);
      setLorebooks(nextLorebooks);

      if (lastCharId) {
        setActiveCharacterId(lastCharId);
      } else if (lastBookId) {
        setActiveLorebookId(lastBookId);
      }

      if (
        importedChars > 0 ||
        importedBooks > 0 ||
        importedThemes > 0 ||
        importedTags > 0
      ) {
        await executeDiskSaveAndRescan('manual', {
          characters: nextCharacters,
          lorebooks: nextLorebooks,
          themes: nextThemes,
          tags: nextTags,
        });
      }

      const parts: string[] = [];
      if (importedChars > 0) {
        parts.push(
          `${importedChars} character${importedChars === 1 ? '' : 's'} (saved to ./Saves/Characters/)`
        );
      }
      if (importedBooks > 0) {
        parts.push(
          `${importedBooks} lorebook${importedBooks === 1 ? '' : 's'} (saved to ./Saves/Lorebooks/)`
        );
      }
      if (importedThemes > 0) {
        parts.push(
          `${importedThemes} theme${importedThemes === 1 ? '' : 's'} (saved to ./Saves/Themes/)`
        );
      }
      if (importedTags > 0) {
        parts.push(
          `${importedTags} tag${importedTags === 1 ? '' : 's'} (saved to ./Saves/Tags/)`
        );
      }

      return {
        count: importedChars + importedBooks + importedThemes + importedTags,
        summary:
          parts.length > 0
            ? `Imported ${parts.join(', ')}.`
            : 'Restored metadata or no new card files found.',
      };
    },
    [executeDiskSaveAndRescan]
  );

  const importSaveFolderBundle = useCallback(
    async (
      files: FileList | File[]
    ): Promise<{ ok: boolean; count: number; summary: string }> => {
      const list = Array.from(files || []);
      if (list.length === 0) {
        return { ok: false, count: 0, summary: 'No backup files selected.' };
      }

      interface LegacyBundleShape {
        kind: 'legacy_v2';
        files: Array<{
          fileName?: string;
          subfolder?: string;
          kind?: string;
          data?: unknown;
        }>;
      }
      interface SingularBackupV3Shape {
        kind: 'singular_v3';
        activeThemeId?: string;
        characters: unknown[];
        lorebooks: unknown[];
        themes: unknown[];
        tags: unknown[];
      }

      const parsedBundles: Array<LegacyBundleShape | SingularBackupV3Shape> = [];
      const standaloneFiles: File[] = [];

      for (const file of list) {
        if (file.name.toLowerCase().endsWith('.json')) {
          try {
            const text = await file.text();
            const parsed = JSON.parse(text) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object') {
              if (
                parsed.schema === 'tavernsmith_backup_v3' ||
                parsed.bundleVersion === '3.0.0' ||
                Array.isArray(parsed.characters) ||
                Array.isArray(parsed.lorebooks) ||
                Array.isArray(parsed.themes) ||
                Array.isArray(parsed.tags)
              ) {
                parsedBundles.push({
                  kind: 'singular_v3',
                  activeThemeId:
                    typeof parsed.activeThemeId === 'string'
                      ? parsed.activeThemeId
                      : undefined,
                  characters: Array.isArray(parsed.characters)
                    ? parsed.characters
                    : [],
                  lorebooks: Array.isArray(parsed.lorebooks)
                    ? parsed.lorebooks
                    : [],
                  themes: Array.isArray(parsed.themes) ? parsed.themes : [],
                  tags: Array.isArray(parsed.tags) ? parsed.tags : [],
                });
                continue;
              }
              if (Array.isArray(parsed.files)) {
                parsedBundles.push({
                  kind: 'legacy_v2',
                  files: parsed.files as LegacyBundleShape['files'],
                });
                continue;
              }
            }
          } catch {
            return {
              ok: false,
              count: 0,
              summary: `Could not parse "${file.name}" as valid JSON.`,
            };
          }
        }
        standaloneFiles.push(file);
      }

      let restoredChars = 0;
      let restoredBooks = 0;
      let restoredThemesCount = 0;
      let restoredTagsCount = 0;
      let restoredMeta = false;
      let restoredVault = false;

      if (parsedBundles.length > 0) {
        diskMutationVersionRef.current += 1;

        let nextTags = [...tagsRef.current];
        let nextThemes = [...themesRef.current];
        let nextSettings = { ...settingsRef.current };
        let nextAiConfig = { ...aiConfigRef.current };
        const nextCharacters = [...charactersRef.current];
        const nextLorebooks = [...lorebooksRef.current];
        let preferredActiveCharId: string | undefined;
        let preferredActiveBookId: string | undefined;

        const upsertTagList = (rawTags: Array<Record<string, unknown> | TagDefinition>) => {
          if (!Array.isArray(rawTags) || rawTags.length === 0) return;
          const byName = new Map<string, Record<string, unknown> | TagDefinition>();
          for (const t of extractCustomUserTags(nextTags)) {
            if (t?.name) byName.set(t.name.trim().toLowerCase(), t);
          }
          for (const raw of rawTags) {
            if (!raw || typeof raw !== 'object') continue;
            const rawName =
              typeof (raw as { name?: unknown }).name === 'string'
                ? String((raw as { name?: unknown }).name).trim()
                : '';
            if (rawName) {
              byName.set(rawName.toLowerCase(), raw);
              restoredTagsCount += 1;
            }
          }
          nextTags = mergeWithDefaultTags(Array.from(byName.values()));
        };

        const upsertThemeList = (rawThemes: unknown[]) => {
          if (!Array.isArray(rawThemes) || rawThemes.length === 0) return;
          const validIncoming: ContextTheme[] = [];
          for (const raw of rawThemes) {
            const normalized = normalizeIncomingTheme(raw);
            if (normalized) {
              validIncoming.push(normalized);
              restoredThemesCount += 1;
            }
          }
          if (validIncoming.length > 0) {
            nextThemes = mergeWithDefaultThemes([
              ...nextThemes,
              ...validIncoming,
            ]);
          }
        };

        const upsertCharacterRaw = (
          rawData: unknown,
          fallbackFileName = 'Character.json'
        ) => {
          if (!rawData) return;
          const usedCharFiles = new Set(
            nextCharacters
              .map((c) =>
                (
                  c.savedFileName ||
                  charDiskFileNamesRef.current.get(c.id || '') ||
                  ''
                ).toLowerCase()
              )
              .filter(Boolean)
          );
          try {
            const rawStr =
              typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
            const parsedRes = parseImportedJsonString(
              rawStr,
              undefined,
              fallbackFileName,
              'character'
            );
            if (parsedRes.kind !== 'character') return;

            const candidate = { ...parsedRes.character };
            candidate.isNsfw = isCharacterNsfw(candidate, nextTags);

            const existingIdx = candidate.id
              ? nextCharacters.findIndex((c) => c.id === candidate.id)
              : -1;

            if (existingIdx >= 0) {
              const existing = nextCharacters[existingIdx];
              const otherNames = nextCharacters
                .filter((_, idx) => idx !== existingIdx)
                .map((c) => c.name || 'Character');
              candidate.name = ensureUniqueEntityName(
                candidate.name || existing.name || 'Character',
                otherNames,
                'Character'
              );
              const preservedFile =
                existing.savedFileName ||
                (existing.id
                  ? charDiskFileNamesRef.current.get(existing.id)
                  : undefined) ||
                ensureUniqueSavedFileName(
                  candidate.name,
                  usedCharFiles,
                  'character'
                );
              candidate.savedFileName = preservedFile;
              if (candidate.id) {
                charDiskFileNamesRef.current.set(candidate.id, preservedFile);
              }
              usedCharFiles.add(preservedFile.toLowerCase());
              nextCharacters[existingIdx] = candidate;
            } else {
              candidate.name = ensureUniqueEntityName(
                candidate.name || 'Restored Character',
                nextCharacters.map((c) => c.name || 'Untitled'),
                'Restored Character'
              );
              if (
                !candidate.id ||
                nextCharacters.some((c) => c.id === candidate.id)
              ) {
                candidate.id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              }
              const uniqueFile = ensureUniqueSavedFileName(
                candidate.name,
                usedCharFiles,
                'character'
              );
              candidate.savedFileName = uniqueFile;
              charDiskFileNamesRef.current.set(candidate.id, uniqueFile);
              nextCharacters.push(candidate);
            }
            restoredChars += 1;
          } catch {
            // Skip malformed character entry
          }
        };

        const upsertLorebookRaw = (
          rawData: unknown,
          fallbackFileName = 'Lorebook.json'
        ) => {
          if (!rawData) return;
          const usedLoreFiles = new Set(
            nextLorebooks
              .map((l) =>
                (
                  l.savedFileName ||
                  loreDiskFileNamesRef.current.get(l.id || '') ||
                  ''
                ).toLowerCase()
              )
              .filter(Boolean)
          );
          try {
            const rawStr =
              typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
            const parsedRes = parseImportedJsonString(
              rawStr,
              undefined,
              fallbackFileName,
              'lorebook'
            );
            if (parsedRes.kind !== 'lorebook') return;

            const candidate = { ...parsedRes.lorebook };
            candidate.isNsfw = isLorebookNsfw(candidate, nextTags);

            const existingIdx = candidate.id
              ? nextLorebooks.findIndex((l) => l.id === candidate.id)
              : -1;

            if (existingIdx >= 0) {
              const existing = nextLorebooks[existingIdx];
              const otherNames = nextLorebooks
                .filter((_, idx) => idx !== existingIdx)
                .map((l) => l.name || 'Lorebook');
              candidate.name = ensureUniqueEntityName(
                candidate.name || existing.name || 'Lorebook',
                otherNames,
                'Lorebook'
              );
              const preservedFile =
                existing.savedFileName ||
                (existing.id
                  ? loreDiskFileNamesRef.current.get(existing.id)
                  : undefined) ||
                ensureUniqueSavedFileName(
                  candidate.name,
                  usedLoreFiles,
                  'lorebook'
                );
              candidate.savedFileName = preservedFile;
              if (candidate.id) {
                loreDiskFileNamesRef.current.set(candidate.id, preservedFile);
              }
              usedLoreFiles.add(preservedFile.toLowerCase());
              nextLorebooks[existingIdx] = candidate;
            } else {
              candidate.name = ensureUniqueEntityName(
                candidate.name || 'Restored Lorebook',
                nextLorebooks.map((l) => l.name || 'Untitled Lorebook'),
                'Restored Lorebook'
              );
              if (
                !candidate.id ||
                nextLorebooks.some((l) => l.id === candidate.id)
              ) {
                candidate.id = `lorebook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              }
              const uniqueFile = ensureUniqueSavedFileName(
                candidate.name,
                usedLoreFiles,
                'lorebook'
              );
              candidate.savedFileName = uniqueFile;
              loreDiskFileNamesRef.current.set(candidate.id, uniqueFile);
              nextLorebooks.push(candidate);
            }
            restoredBooks += 1;
          } catch {
            // Skip malformed lorebook entry
          }
        };

        for (const bundle of parsedBundles) {
          if (bundle.kind === 'singular_v3') {
            // Restore Tags & Themes first so Character/Lorebook NSFW checks and activeThemeId work accurately
            if (bundle.tags.length > 0) {
              upsertTagList(
                bundle.tags as Array<Record<string, unknown> | TagDefinition>
              );
            }
            if (bundle.themes.length > 0) {
              upsertThemeList(bundle.themes);
            }
            if (
              bundle.activeThemeId &&
              nextThemes.some((t) => t.id === bundle.activeThemeId)
            ) {
              nextSettings = {
                ...nextSettings,
                activeThemeId: bundle.activeThemeId,
              };
            }
            for (const rawChar of bundle.characters) {
              upsertCharacterRaw(rawChar);
            }
            for (const rawBook of bundle.lorebooks) {
              upsertLorebookRaw(rawBook);
            }
            continue;
          }

          // Legacy bundleVersion 2.0.0 (`files: [...]`)
          // 1. Restore Meta (`_tavernsmith_meta.json`) & standalone Themes/Tags first
          for (const entry of bundle.files) {
            if (!entry || typeof entry !== 'object') continue;
            const isMeta =
              entry.kind === 'meta' || entry.fileName === META_FILENAME;
            if (!isMeta || !entry.data) continue;

            try {
              const rawMeta =
                typeof entry.data === 'string'
                  ? (JSON.parse(entry.data) as Partial<TavernSmithMetaPayload>)
                  : (entry.data as Partial<TavernSmithMetaPayload>);

              if (Array.isArray(rawMeta.tags)) {
                upsertTagList(rawMeta.tags);
              }
              if (
                Array.isArray(rawMeta.contextThemes) &&
                rawMeta.contextThemes.length > 0
              ) {
                upsertThemeList(rawMeta.contextThemes);
              }

              if (rawMeta.settings) {
                const candidateThemeId =
                  rawMeta.activeThemeId ||
                  rawMeta.settings.activeThemeId ||
                  nextSettings.activeThemeId;
                const resolvedThemeId = nextThemes.some(
                  (t) => t.id === candidateThemeId
                )
                  ? candidateThemeId
                  : nextThemes[0]?.id || nextSettings.activeThemeId;
                nextSettings = {
                  ...nextSettings,
                  ...rawMeta.settings,
                  activeThemeId: resolvedThemeId,
                  activeSaveFolder: UNIFIED_INTERNAL_ROOT,
                };
              } else if (
                rawMeta.activeThemeId &&
                nextThemes.some((t) => t.id === rawMeta.activeThemeId)
              ) {
                nextSettings = {
                  ...nextSettings,
                  activeThemeId: rawMeta.activeThemeId,
                };
              }

              if (rawMeta.aiConfig) {
                const incomingAi = rawMeta.aiConfig;
                const cleanPreset = incomingAi.preset || nextAiConfig.preset;
                const mergedModelsMap = {
                  ...(incomingAi.savedProviderModels || {}),
                  ...(nextAiConfig.savedProviderModels || {}),
                };
                if (Object.keys(mergedModelsMap).length > 0) {
                  saveProviderModelsMap(mergedModelsMap);
                }
                nextAiConfig = {
                  ...nextAiConfig,
                  ...incomingAi,
                  preset: cleanPreset,
                  availableModels: sanitizeAvailableModelsList(
                    incomingAi.availableModels,
                    AI_BACKEND_PRESETS.find((p) => p.id === cleanPreset)
                      ?.suggestedModels,
                    cleanPreset
                  ),
                  savedProviderModels: mergedModelsMap,
                  apiKey: nextAiConfig.apiKey,
                  savedProviderKeys: nextAiConfig.savedProviderKeys,
                };
              }

              if (rawMeta.activeCharacterId) {
                preferredActiveCharId = rawMeta.activeCharacterId;
              }
              if (rawMeta.activeLorebookId) {
                preferredActiveBookId = rawMeta.activeLorebookId;
              }
              restoredMeta = true;
            } catch {
              // Skip malformed meta block
            }
          }

          // Restore Themes/ and Tags/ entries from v2 bundle if present
          const legacyThemeEntries = bundle.files.filter(
            (e) => e && (e.kind === 'theme' || e.subfolder === 'Themes/') && e.data
          );
          if (legacyThemeEntries.length > 0) {
            upsertThemeList(legacyThemeEntries.map((e) => e.data));
          }
          const legacyTagEntries = bundle.files.filter(
            (e) => e && (e.kind === 'tag' || e.subfolder === 'Tags/') && e.data
          );
          if (legacyTagEntries.length > 0) {
            upsertTagList(
              legacyTagEntries.map((e) => e.data as Record<string, unknown>)
            );
          }

          // 2. Restore Encrypted Vault (`_tavernsmith_vault.enc`) if readable
          for (const entry of bundle.files) {
            if (!entry || typeof entry !== 'object') continue;
            const isVault =
              entry.kind === 'vault' || entry.fileName === VAULT_FILENAME;
            if (!isVault || !entry.data || typeof entry.data !== 'object') {
              continue;
            }
            try {
              const decrypted = await decryptProviderKeysFromVault(
                undefined,
                entry.data as Record<string, unknown>
              );
              if (decrypted.ok) {
                const mergedKeys: Record<string, string> = {
                  ...decrypted.keys,
                  ...(nextAiConfig.savedProviderKeys || {}),
                };
                const activeProviderId = getProviderKeyId(nextAiConfig.preset);
                const restoredActiveKey =
                  nextAiConfig.apiKey ||
                  mergedKeys[activeProviderId] ||
                  mergedKeys[nextAiConfig.preset] ||
                  '';
                if (restoredActiveKey) {
                  mergedKeys[activeProviderId] = restoredActiveKey;
                  mergedKeys[nextAiConfig.preset] = restoredActiveKey;
                }
                nextAiConfig = {
                  ...nextAiConfig,
                  apiKey: restoredActiveKey,
                  savedProviderKeys: mergedKeys,
                };
                await encryptAndSaveProviderKeys(mergedKeys, undefined, true);
                restoredVault = true;
              } else if (
                Object.keys(getInMemoryDecryptedKeys()).length === 0
              ) {
                setInMemoryVaultEnvelope(entry.data);
                restoredVault = true;
              }
            } catch {
              // Vault may use a custom passphrase
            }
          }

          // 3. Upsert Characters from `Characters/`
          for (const entry of bundle.files) {
            if (!entry || typeof entry !== 'object') continue;
            const isChar =
              entry.kind === 'character' || entry.subfolder === 'Characters/';
            if (!isChar || !entry.data) continue;
            upsertCharacterRaw(entry.data, entry.fileName || 'Character.json');
          }

          // 4. Upsert Lorebooks from `Lorebooks/`
          for (const entry of bundle.files) {
            if (!entry || typeof entry !== 'object') continue;
            const isBook =
              entry.kind === 'lorebook' || entry.subfolder === 'Lorebooks/';
            if (!isBook || !entry.data) continue;
            upsertLorebookRaw(entry.data, entry.fileName || 'Lorebook.json');
          }
        }

        // Ensure unique savedFileNames for custom themes and tags
        const usedThemeFiles = new Set<string>();
        nextThemes = nextThemes.map((th) => {
          if (!isThemeModifiedFromBuiltIn(th)) return th;
          const fileName = ensureUniqueSavedFileName(
            th.savedFileName || th.name,
            usedThemeFiles,
            'theme'
          );
          themeDiskFileNamesRef.current.set(th.id, fileName);
          return { ...th, savedFileName: fileName };
        });

        const usedTagFiles = new Set<string>();
        const customTagsOnlyIds = new Set(
          extractCustomUserTags(nextTags).map((t) => t.id)
        );
        nextTags = nextTags.map((tg) => {
          if (!customTagsOnlyIds.has(tg.id)) return tg;
          const fileName = ensureUniqueSavedFileName(
            tg.savedFileName || tg.name,
            usedTagFiles,
            'tag'
          );
          tagDiskFileNamesRef.current.set(tg.id, fileName);
          return { ...tg, savedFileName: fileName };
        });

        // Synchronously commit all restored workspace refs & React states
        tagsRef.current = nextTags;
        latestWorkspaceRef.current.tags = nextTags;
        setTagsState(nextTags);

        themesRef.current = nextThemes;
        latestWorkspaceRef.current.themes = nextThemes;
        setThemesState(nextThemes);

        settingsRef.current = nextSettings;
        latestWorkspaceRef.current.settings = nextSettings;
        setSettingsState(nextSettings);

        aiConfigRef.current = nextAiConfig;
        latestWorkspaceRef.current.aiConfig = nextAiConfig;
        setAiConfigState(nextAiConfig);

        charactersRef.current = nextCharacters;
        latestWorkspaceRef.current.characters = nextCharacters;
        setCharactersState(nextCharacters);

        lorebooksRef.current = nextLorebooks;
        latestWorkspaceRef.current.lorebooks = nextLorebooks;
        setLorebooksState(nextLorebooks);

        let nextActiveCharId = activeCharacterIdRef.current;
        if (!nextActiveCharId || !nextCharacters.some((c) => c.id === nextActiveCharId)) {
          nextActiveCharId =
            preferredActiveCharId &&
            nextCharacters.some((c) => c.id === preferredActiveCharId)
              ? preferredActiveCharId
              : nextCharacters[0]?.id || '';
        }
        activeCharacterIdRef.current = nextActiveCharId;
        latestWorkspaceRef.current.activeCharacterId = nextActiveCharId;
        setActiveCharacterIdState(nextActiveCharId);

        let nextActiveBookId = activeLorebookIdRef.current;
        if (!nextActiveBookId || !nextLorebooks.some((l) => l.id === nextActiveBookId)) {
          nextActiveBookId =
            preferredActiveBookId &&
            nextLorebooks.some((l) => l.id === preferredActiveBookId)
              ? preferredActiveBookId
              : nextLorebooks[0]?.id || '';
        }
        activeLorebookIdRef.current = nextActiveBookId;
        latestWorkspaceRef.current.activeLorebookId = nextActiveBookId;
        setActiveLorebookIdState(nextActiveBookId);

        await executeDiskSaveAndRescan('manual', {
          characters: nextCharacters,
          lorebooks: nextLorebooks,
          themes: nextThemes,
          tags: nextTags,
        });
      }

      let standaloneSummary = '';
      let standaloneCount = 0;
      if (standaloneFiles.length > 0) {
        const res = await importFromFiles(standaloneFiles);
        standaloneCount = res.count;
        standaloneSummary = res.summary;
      }

      const totalRestored =
        restoredChars +
        restoredBooks +
        restoredThemesCount +
        restoredTagsCount +
        standaloneCount;
      const parts: string[] = [];
      if (restoredChars > 0) {
        parts.push(
          `${restoredChars} character${restoredChars === 1 ? '' : 's'}`
        );
      }
      if (restoredBooks > 0) {
        parts.push(
          `${restoredBooks} lorebook${restoredBooks === 1 ? '' : 's'}`
        );
      }
      if (restoredThemesCount > 0) {
        parts.push(
          `${restoredThemesCount} theme${restoredThemesCount === 1 ? '' : 's'}`
        );
      }
      if (restoredTagsCount > 0) {
        parts.push(
          `${restoredTagsCount} tag${restoredTagsCount === 1 ? '' : 's'}`
        );
      }
      if (restoredMeta && restoredThemesCount === 0 && restoredTagsCount === 0) {
        parts.push('themes & tags');
      }
      if (restoredVault) {
        parts.push('vault keys');
      }

      const summary =
        parts.length > 0
          ? `Imported backup: ${parts.join(', ')} synced to ./Saves/.${standaloneSummary ? ` ${standaloneSummary}` : ''}`
          : standaloneSummary ||
            'No valid TavernSmith backup entries or card files found.';

      return {
        ok: totalRestored > 0 || restoredMeta || restoredVault,
        count: totalRestored,
        summary,
      };
    },
    [executeDiskSaveAndRescan, importFromFiles]
  );

  const bindLorebookToCharacter = useCallback(
    (characterId: string, lorebookToBind: Lorebook) => {
      setCharacters((prev) =>
        prev.map((c) => {
          if (c.id !== characterId) return c;
          return {
            ...c,
            character_book: lorebookToBind,
            modification_date: Math.floor(Date.now() / 1000),
          };
        })
      );
    },
    []
  );

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const isMainSidebarOpen = settings.mainSidebarOpen !== false;

  const setMainSidebarOpen = useCallback((open: boolean) => {
    setSettings((prev) => ({ ...prev, mainSidebarOpen: open }));
  }, []);

  const toggleMainSidebar = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      mainSidebarOpen: prev.mainSidebarOpen === false ? true : false,
    }));
  }, []);

  const setActiveThemeId = useCallback((id: string) => {
    setSettings((prev) => ({ ...prev, activeThemeId: id }));
  }, []);

  const resetWorkspaceToDefaults = useCallback(() => {
    purgeBrowserRuntimeCaches();
    const freshDrafts = createDefaultWorkspaceDraftCache();
    setWorkspaceDraftCache(freshDrafts);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(TAB_DRAFT_SESSION_KEY);
      }
    } catch {
      // Ignore storage errors
    }
    setThemes(DEFAULT_CONTEXT_THEMES);
    setTags(mergeWithDefaultTags([]));
    const inMemKeys = getInMemoryDecryptedKeys();
    const inMemModels = loadProviderModelsMap();
    setAiConfigState({
      ...DEFAULT_AI_CONFIG,
      savedProviderKeys: inMemKeys,
      savedProviderModels: inMemModels,
    });
    setSettings(DEFAULT_SETTINGS);
    const nowDisplay = formatSafeTimestamp(new Date().toISOString());
    setLastSavedAt(nowDisplay);
    latestWorkspaceRef.current.isDirty = false;
    setIsDirty(false);
  }, []);

  const tokenBreakdown = useMemo(
    () =>
      calculateCardTokenBreakdown(
        character,
        character.character_book,
        statBlock
      ),
    [character, statBlock]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      isMainSidebarOpen,
      setMainSidebarOpen,
      toggleMainSidebar,
      characters,
      activeCharacterId,
      setActiveCharacterId,
      createNewCharacter,
      deleteCharacter,
      bindLorebookToCharacter,
      character,
      setCharacter,
      updateCharacterField,
      lorebooks,
      activeLorebookId,
      setActiveLorebookId,
      createNewLorebook,
      deleteLorebook,
      lorebook,
      setLorebook,
      statBlock,
      setStatBlock,
      themes,
      setThemes,
      createNewTheme,
      updateTheme,
      deleteTheme,
      activeTheme,
      setActiveThemeId,
      tags,
      setTags,
      upsertCustomTag,
      toggleTagNsfw,
      deleteTag,
      ensureTagRegistered,
      nameConflictRequest,
      checkAndTriggerNameConflict,
      resolveNameConflict,
      dismissNameConflict,
      aiConfig,
      setAiConfig,
      switchAIPreset,
      isAiConnected,
      isTestingAiConnection,
      aiConnectionResult,
      connectAiBackend,
      disconnectAiBackend,
      clearAiConnectionFeedback,
      settings,
      setSettings,
      updateSettings,
      tokenBreakdown,
      lastSavedAt,
      isDirty,
      saveNow,
      saveAndSyncNow,
      resetWorkspaceToDefaults,
      savedFiles,
      diskResolvedPath,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      pendingDeleteTarget,
      requestDeleteCharacter,
      requestDeleteLorebook,
      requestDeleteSavedFile,
      confirmPendingDelete,
      cancelPendingDelete,
      exportSaveFolderBundle,
      importSaveFolderBundle,
      importFromFiles,
      workspaceDraftCache,
      updateCharacterDraft,
      updateLorebookDraft,
      updateThemesTagsDraft,
      updateSmartEditorDraft,
      inspectorDraft,
      updateInspectorDraft,
    }),
    [
      activeTab,
      isMainSidebarOpen,
      setMainSidebarOpen,
      toggleMainSidebar,
      characters,
      activeCharacterId,
      createNewCharacter,
      deleteCharacter,
      bindLorebookToCharacter,
      character,
      setCharacter,
      updateCharacterField,
      lorebooks,
      activeLorebookId,
      createNewLorebook,
      deleteLorebook,
      lorebook,
      setLorebook,
      statBlock,
      setStatBlock,
      themes,
      createNewTheme,
      updateTheme,
      deleteTheme,
      activeTheme,
      setActiveThemeId,
      tags,
      upsertCustomTag,
      toggleTagNsfw,
      deleteTag,
      ensureTagRegistered,
      nameConflictRequest,
      checkAndTriggerNameConflict,
      resolveNameConflict,
      dismissNameConflict,
      aiConfig,
      setAiConfig,
      switchAIPreset,
      isAiConnected,
      isTestingAiConnection,
      aiConnectionResult,
      connectAiBackend,
      disconnectAiBackend,
      clearAiConnectionFeedback,
      settings,
      updateSettings,
      tokenBreakdown,
      lastSavedAt,
      isDirty,
      saveNow,
      saveAndSyncNow,
      resetWorkspaceToDefaults,
      savedFiles,
      diskResolvedPath,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      pendingDeleteTarget,
      requestDeleteCharacter,
      requestDeleteLorebook,
      requestDeleteSavedFile,
      confirmPendingDelete,
      cancelPendingDelete,
      exportSaveFolderBundle,
      importSaveFolderBundle,
      importFromFiles,
      workspaceDraftCache,
      updateCharacterDraft,
      updateLorebookDraft,
      updateThemesTagsDraft,
      updateSmartEditorDraft,
      inspectorDraft,
      updateInspectorDraft,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}

