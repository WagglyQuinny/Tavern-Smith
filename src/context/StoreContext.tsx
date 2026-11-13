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
  ContextTheme,
  Lorebook,
  NameConflictRequest,
  SavedFileEntry,
  SaveLogEntry,
  StatBlockConfig,
  TagDefinition,
  TavernSmithMetaPayload,
  TokenBreakdown,
  WorkspaceTab,
} from '../types';
import { calculateCardTokenBreakdown } from '../utils/tokenCounter';
import {
  importCardFromFile,
  parseImportedJsonString,
  sanitizeFilename,
  serializeCharacterCard,
  triggerBrowserDownload,
} from '../utils/cardIO';
import {
  clearDirectoryHandleFromIndexedDB,
  loadDirectoryHandleFromIndexedDB,
  queryDirectoryHandlePermission,
  requestDirectoryHandlePermission,
  saveDirectoryHandleToIndexedDB,
  StoredDirectoryRecord,
} from '../utils/folderDb';
import { AI_BACKEND_PRESETS, getProviderKeyId } from '../services/aiService';
import {
  decryptProviderKeysFromVault,
  encryptAndSaveProviderKeys,
  getInMemoryDecryptedKeys,
  loadProviderModelsMap,
  saveProviderModelsMap,
} from '../utils/cryptoVault';

const PREFERENCES_STORAGE_KEY = 'tavernsmith_preferences_v1';
const SAVE_FOLDER_FILES_STORAGE_KEY = 'tavernsmith_save_folder_files_v1';
const PROVIDER_CREDENTIALS_STORAGE_KEY = 'tavernsmith_provider_credentials_v1';
const LEGACY_STORAGE_KEYS = [
  'tavernsmith_store_v2',
  'tavernsmith_ide_state_v2',
  'tavernsmith_ide_state_v1',
  'tavernsmith_store_v1',
];
export const META_FILENAME = '_tavernsmith_meta.json';
export const UNIFIED_INTERNAL_ROOT = '/TavernSmith_Saves/';

/**
 * Safe localStorage wrappers that never throw on `file://` origins, strict privacy modes,
 * or non-admin standard user accounts.
 */
function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore quota or SecurityError in restricted origins
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore SecurityError in restricted origins
  }
}

/**
 * Purges all registered Service Workers and browser CacheStorage entries
 * so the browser NEVER caches stale HTML, JS, CSS, or tag schemas across sessions.
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

  // C. Body Types, Attire & Physical Fetish Tags
  createBuiltInTag(
    'tag-glasses-megane',
    'Glasses / Megane',
    '#3b82f6',
    'Body & Attire',
    'Wears glasses that frame expressive eyes and slip askew or fog up during emotional or intimate moments.',
    false
  ),
  createBuiltInTag(
    'tag-muscular-fit-female',
    'Muscular / Fit Female',
    '#f97316',
    'Body & Attire',
    'Toned abs, defined athletic musculature, physical strength, and sweat-glistening skin.',
    false
  ),
  createBuiltInTag(
    'tag-tanlines-dark-skin',
    'Tanlines / Dark Skin',
    '#d97706',
    'Body & Attire',
    'Sun-kissed or rich dark skin with contrasting pale tanlines.',
    false
  ),
  createBuiltInTag(
    'tag-petite-slender-adult',
    'Petite / Slender (Adult)',
    '#f472b6',
    'Body & Attire',
    'Lithe, compact adult frame emphasizing size contrast and delicate proportions.',
    false
  ),
  createBuiltInTag(
    'tag-big-breasts',
    'Big Breasts',
    '#ec4899',
    'Body & Attire',
    'Full, heavy, supple breasts that bounce, press against clothing, and draw constant visual and tactile focus.',
    true,
    [
      {
        id: 'sub-breasts-huge-hyper',
        name: 'Huge / Hyper',
        aiDescription:
          'Massively proportioned, overflowing hyper-bust that strains fabric and dominates physical contact.',
      },
      {
        id: 'sub-breasts-perky',
        name: 'Perky',
        aiDescription:
          'Firm, uplifted, gravity-defying full breasts with prominent, sensitive peaks.',
      },
      {
        id: 'sub-breasts-natural-sag',
        name: 'Natural Sag',
        aiDescription:
          'Heavy, natural teardrop weight and realistic pendulous sway when unrestrained.',
      },
      {
        id: 'sub-breasts-cleavage',
        name: 'Cleavage Window',
        aiDescription:
          'Attire features a plunging neckline or keyhole cutout framing deep, plush cleavage.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-huge-breasts-hyper',
    'Huge Breasts / Hyper',
    '#db2777',
    'Body & Attire',
    'Massively proportioned, overflowing bust that strains fabric and dominates physical contact.',
    true
  ),
  createBuiltInTag(
    'tag-thick-thighs-wide-hips',
    'Thick Thighs / Wide Hips',
    '#d946ef',
    'Body & Attire',
    'Plush, curvy lower body with soft, squeezing thighs, wide childbearing hips, and a prominent rear.',
    true,
    [
      {
        id: 'sub-thighs-plush',
        name: 'Thigh Squeeze',
        aiDescription:
          'Soft, heavy inner thighs that cushion and grip {{user}} warmly.',
      },
      {
        id: 'sub-hips-hourglass',
        name: 'Extreme Hourglass',
        aiDescription:
          'Narrow waist flaring dramatically into wide, curvaceous hips and a full rear.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-shortstack',
    'Shortstack',
    '#a855f7',
    'Body & Attire',
    'Short adult stature paired with exaggerated curves, heavy bust, and thick hips.',
    true
  ),
  createBuiltInTag(
    'tag-stockings-thighhighs',
    'Stockings / Thighhighs',
    '#8b5cf6',
    'Body & Attire',
    'Sheer nylon stockings, garter belts, or thigh-highs accentuating the absolute territory of the thighs.',
    true,
    [
      {
        id: 'sub-stockings-zettai',
        name: 'Zettai Ryouiki',
        aiDescription:
          'Tantalizing strip of bare, soft thigh skin framed between skirt hem and thigh-high stockings.',
      },
      {
        id: 'sub-stockings-garters',
        name: 'Garter Belt',
        aiDescription:
          'Lace garter straps biting softly into plush thighs.',
      },
      {
        id: 'sub-stockings-torn',
        name: 'Torn Nylon',
        aiDescription:
          'Ripped or parted nylon stockings exposing bare skin during heated intimacy.',
      },
    ]
  ),
  createBuiltInTag(
    'tag-lingerie-babydoll',
    'Lingerie / Babydoll',
    '#ec4899',
    'Body & Attire',
    'Lace, sheer fabric, or provocative straps designed to frame and expose the body.',
    true
  ),
  createBuiltInTag(
    'tag-latex-bodysuit',
    'Latex / Bodysuit',
    '#3f3f46',
    'Body & Attire',
    'Skin-tight, glossy latex or spandex bodysuit that clings to every contour.',
    true
  ),
  createBuiltInTag(
    'tag-collar-leash',
    'Collar / Leash',
    '#ef4444',
    'Body & Attire',
    'Wears a collar symbolizing ownership, submission, or pet-play devotion.',
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
  if (tag.isNsfw !== undefined) return Boolean(tag.isNsfw);
  const cat = (tag.category || '').toLowerCase();
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
 * Extracts ONLY user-created custom tags (or built-in tags whose NSFW flag or description was customized)
 * so the built-in `DEFAULT_TAGS` array is NEVER cached in `localStorage`.
 */
export function extractCustomUserTags(
  allTags?: TagDefinition[] | null
): TagDefinition[] {
  if (!Array.isArray(allTags) || allTags.length === 0) return [];

  const builtInByName = new Map(
    DEFAULT_TAGS.map((b) => [b.name.trim().toLowerCase(), b])
  );

  const customOnly: TagDefinition[] = [];
  for (const tag of allTags) {
    if (!tag || typeof tag.name !== 'string') continue;
    const key = tag.name.trim().toLowerCase();
    const idKey = (tag.id || '').trim().toLowerCase();
    if (RETIRED_BUILTIN_TAG_KEYS.has(key) || RETIRED_BUILTIN_TAG_KEYS.has(idKey)) {
      continue;
    }
    const builtIn = builtInByName.get(key);

    if (!builtIn) {
      const { ...cleanTag } = tag;
      customOnly.push(cleanTag);
      continue;
    }

    // If user toggled isNsfw or customized aiContextDescription on a built-in tag, record that override
    if (
      Boolean(tag.isNsfw) !== Boolean(builtIn.isNsfw) ||
      (tag.aiContextDescription &&
        tag.aiContextDescription !== builtIn.aiContextDescription) ||
      (tag.color && tag.color !== builtIn.color)
    ) {
      customOnly.push({
        ...builtIn,
        color: tag.color || builtIn.color,
        isNsfw: Boolean(tag.isNsfw),
        aiContextDescription:
          tag.aiContextDescription || builtIn.aiContextDescription,
        aiDescription:
          tag.aiContextDescription ||
          tag.aiDescription ||
          builtIn.aiDescription,
      });
    }
  }

  return customOnly;
}

/**
 * Always loads the built-in `DEFAULT_TAGS` (including their `isNsfw` flags, categories,
 * colors, and `aiDescription`) 100% fresh from source code, and merges user-created custom tags on top.
 */
export function mergeWithDefaultTags(
  customOrMetaTags?: TagDefinition[] | null
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
  const seenCustomNames = new Set<string>();

  for (const incoming of customOrMetaTags) {
    if (!incoming || typeof incoming.name !== 'string') continue;
    const cleanName = incoming.name.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    const idKey = (incoming.id || '').trim().toLowerCase();
    if (RETIRED_BUILTIN_TAG_KEYS.has(key) || RETIRED_BUILTIN_TAG_KEYS.has(idKey)) {
      continue;
    }

    const builtInIdx = builtInIndexByName.get(key);
    if (builtInIdx !== undefined) {
      const targetBuiltIn = freshBuiltIns[builtInIdx];
      freshBuiltIns[builtInIdx] = {
        ...targetBuiltIn,
        color: incoming.color || targetBuiltIn.color,
        isNsfw:
          incoming.isNsfw !== undefined
            ? Boolean(incoming.isNsfw)
            : targetBuiltIn.isNsfw,
        aiContextDescription:
          incoming.aiContextDescription || targetBuiltIn.aiContextDescription,
        aiDescription:
          incoming.aiContextDescription ||
          incoming.aiDescription ||
          targetBuiltIn.aiDescription,
      };
      continue;
    }

    if (!seenCustomNames.has(key)) {
      seenCustomNames.add(key);
      userCustomTags.push({
        id: incoming.id || `tag-custom-${Date.now()}-${userCustomTags.length}`,
        name: cleanName,
        color: incoming.color || '#a855f7',
        category: incoming.category || 'Custom',
        isNsfw:
          incoming.isNsfw !== undefined
            ? Boolean(incoming.isNsfw)
            : incoming.category === 'NSFW & Kinks' ||
              incoming.category === 'Extreme & Hentai Physics',
        aiContextDescription:
          incoming.aiContextDescription ||
          incoming.aiDescription ||
          incoming.description ||
          `Incorporate thematic, tonal, and character elements consistent with "${cleanName}".`,
        aiDescription:
          incoming.aiContextDescription ||
          incoming.aiDescription ||
          incoming.description ||
          `Incorporate thematic, tonal, and character elements consistent with "${cleanName}".`,
      });
    }
  }

  return [...freshBuiltIns, ...userCustomTags];
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
  formatTemplate: `<details><summary>Status & Telemetry</summary>\n\`\`\`yaml\nAffection: {{stat:Affection}}\nCurrent Mood: {{stat:Current Mood}}\n\`\`\`\n</details>`,
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
  creation_date: Math.floor(Date.now() / 1000),
  modification_date: Math.floor(Date.now() / 1000),
  extensions: {
    talkativeness: '0.5',
    fav: false,
    statBlock: DEFAULT_STAT_BLOCK,
  },
};

export const DEFAULT_AI_CONFIG: AIBackendConfig = {
  preset: 'gemini',
  url: '/api/gemini',
  apiKey: '',
  modelName: 'gemini-3.8-flash',
  compatibilityFormat: 'auto',
  temperature: 0.78,
  maxTokens: 512,
  ghostTextEnabled: true,
  debounceMs: 650,
  availableModels: [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemma-3-27b-it',
  ],
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
  hideNsfwTags: false,
};

/**
 * Strips plaintext API keys from `AIBackendConfig` before writing preferences to `localStorage`.
 * All API keys are stored exclusively in the AES-256-GCM encrypted vault (`_tavernsmith_vault_enc`).
 */
function stripApiKeysForStorage(config: AIBackendConfig): AIBackendConfig {
  return {
    ...config,
    apiKey: '',
    savedProviderKeys: {},
  };
}

/**
 * Loads per-provider models and in-memory decrypted keys from the AES-256-GCM vault,
 * and migrates any legacy plaintext credentials into `_tavernsmith_vault_enc`.
 */
function loadPersistedProviderCredentials(): {
  savedProviderKeys: Record<string, string>;
  savedProviderModels: Record<string, string>;
} {
  const modelsMap = loadProviderModelsMap();
  const keysMap = getInMemoryDecryptedKeys();
  try {
    const raw = safeLocalStorageGet(PROVIDER_CREDENTIALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.savedProviderModels === 'object') {
        Object.assign(modelsMap, parsed.savedProviderModels);
        saveProviderModelsMap(modelsMap);
      }
      if (parsed && typeof parsed.savedProviderKeys === 'object') {
        Object.assign(keysMap, parsed.savedProviderKeys);
        void encryptAndSaveProviderKeys(keysMap);
      }
      safeLocalStorageRemove(PROVIDER_CREDENTIALS_STORAGE_KEY);
    }
  } catch {
    // Ignore parse errors
  }
  return { savedProviderKeys: keysMap, savedProviderModels: modelsMap };
}

function savePersistedProviderCredentials(
  savedProviderKeys: Record<string, string>,
  savedProviderModels: Record<string, string>
): void {
  saveProviderModelsMap(savedProviderModels);
  safeLocalStorageRemove(PROVIDER_CREDENTIALS_STORAGE_KEY);
  void encryptAndSaveProviderKeys(savedProviderKeys);
}

/**
 * Synchronizes `savedProviderKeys` and `savedProviderModels` whenever `AIBackendConfig` updates.
 * - When `preset` changes, saves the previous provider's key/model and loads the newly selected provider's saved key/model.
 * - When `apiKey` or `modelName` changes on the active preset, updates the map for both `preset` and `getProviderKeyId(preset)`.
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

  // Always record previous preset's state before switching
  const prevProviderId = getProviderKeyId(prev.preset);
  if (prev.apiKey !== undefined) {
    keysMap[prevProviderId] = prev.apiKey;
    keysMap[prev.preset] = prev.apiKey;
  }
  if (prev.modelName) {
    modelsMap[prevProviderId] = prev.modelName;
    modelsMap[prev.preset] = prev.modelName;
  }

  const nextProviderId = getProviderKeyId(next.preset);
  const presetMeta = AI_BACKEND_PRESETS.find((p) => p.id === next.preset);

  if (next.preset !== prev.preset) {
    // Switching between AI backends -> automatically restore saved key & model for target provider!
    const restoredKey =
      keysMap[nextProviderId] ?? keysMap[next.preset] ?? '';
    const restoredModel =
      modelsMap[nextProviderId] ??
      modelsMap[next.preset] ??
      presetMeta?.defaultModel ??
      next.modelName;

    keysMap[nextProviderId] = restoredKey;
    keysMap[next.preset] = restoredKey;
    modelsMap[nextProviderId] = restoredModel;
    modelsMap[next.preset] = restoredModel;

    savePersistedProviderCredentials(keysMap, modelsMap);

    return {
      ...next,
      apiKey: restoredKey,
      modelName: restoredModel,
      savedProviderKeys: keysMap,
      savedProviderModels: modelsMap,
    };
  }

  // Updating apiKey or modelName on the same preset -> persist immediately
  keysMap[nextProviderId] = next.apiKey;
  keysMap[next.preset] = next.apiKey;
  if (next.modelName) {
    modelsMap[nextProviderId] = next.modelName;
    modelsMap[next.preset] = next.modelName;
  }

  savePersistedProviderCredentials(keysMap, modelsMap);

  return {
    ...next,
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
 * Builds the complete unified file tree (`Characters/`, `Lorebooks/`, and root `_tavernsmith_meta.json`)
 * from the active workspace state so the Storage Manager never shows "0 saved files".
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

  // 1. Characters/ subfolder
  for (const char of characters) {
    const fileName = `${sanitizeFilename(char.name)}.json`;
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

  // 2. Lorebooks/ subfolder
  for (const lb of lorebooks) {
    const fileName = `${sanitizeFilename(lb.name)}.json`;
    const loreJson = JSON.stringify(
      {
        id: lb.id,
        name: lb.name,
        description: lb.description,
        scan_depth: lb.scan_depth,
        token_budget: lb.token_budget,
        recursive_scanning: lb.recursive_scanning,
        modification_date: lb.modification_date,
        entries: lb.entries,
        tags: lb.tags || [],
      },
      null,
      2
    );
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

  // 3. Root _tavernsmith_meta.json (stores ONLY custom user tags + themes, never built-in DEFAULT_TAGS)
  const customTagsOnly = extractCustomUserTags(tags);
  const metaPayload: TavernSmithMetaPayload = {
    schema: 'tavernsmith_meta_v1',
    updatedAt: nowIso,
    activeThemeId,
    contextThemes: themes,
    tags: customTagsOnly,
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

  return entries;
}

interface PersistedPreferencesState {
  activeCharacterId: string;
  activeLorebookId: string;
  aiConfig: AIBackendConfig;
  settings: AppSettings;
  saveLogs: SaveLogEntry[];
  lastSavedAt: string | null;
}

interface InitialWorkspaceBootstrap {
  characters: CharacterCardData[];
  activeCharacterId: string;
  lorebooks: Lorebook[];
  activeLorebookId: string;
  themes: ContextTheme[];
  tags: TagDefinition[];
  aiConfig: AIBackendConfig;
  settings: AppSettings;
  savedFiles: SavedFileEntry[];
  saveLogs: SaveLogEntry[];
  lastSavedAt: string | null;
}

/**
 * Re-reads Characters (`Characters/*.json`), Lorebooks (`Lorebooks/*.json`), and user custom
 * metadata (`_tavernsmith_meta.json`) directly from the Save Folder file entries.
 * Always loads `DEFAULT_TAGS` fresh from source code and merges only user-created custom tags on top.
 */
function reconstructWorkspaceFromSaveFiles(files: SavedFileEntry[]): {
  characters: CharacterCardData[];
  lorebooks: Lorebook[];
  themes: ContextTheme[];
  tags: TagDefinition[];
  activeThemeIdFromMeta?: string;
} {
  const loadedCharacters: CharacterCardData[] = [];
  const loadedLorebooks: Lorebook[] = [];
  let loadedThemes: ContextTheme[] = DEFAULT_CONTEXT_THEMES;
  let customMetaTags: TagDefinition[] = [];
  let activeThemeIdFromMeta: string | undefined;

  for (const entry of files) {
    if (!entry || typeof entry.content !== 'string') continue;
    try {
      if (entry.kind === 'meta' || entry.fileName === META_FILENAME) {
        const parsedMeta = JSON.parse(
          entry.content
        ) as Partial<TavernSmithMetaPayload>;
        if (
          Array.isArray(parsedMeta.contextThemes) &&
          parsedMeta.contextThemes.length > 0
        ) {
          const mapByName = new Map<string, ContextTheme>();
          for (const t of DEFAULT_CONTEXT_THEMES) {
            mapByName.set(t.name.trim().toLowerCase(), t);
          }
          for (const incoming of parsedMeta.contextThemes) {
            if (incoming && incoming.name) {
              mapByName.set(incoming.name.trim().toLowerCase(), incoming);
            }
          }
          loadedThemes = Array.from(mapByName.values());
        }
        if (Array.isArray(parsedMeta.tags)) {
          customMetaTags = parsedMeta.tags;
        }
        if (parsedMeta.activeThemeId) {
          activeThemeIdFromMeta = parsedMeta.activeThemeId;
        }
        continue;
      }

      const parsedAsset = parseImportedJsonString(
        entry.content,
        undefined,
        entry.fileName
      );
      if (parsedAsset.kind === 'character') {
        loadedCharacters.push(parsedAsset.character);
      } else if (parsedAsset.kind === 'lorebook') {
        loadedLorebooks.push(parsedAsset.lorebook);
      }
    } catch {
      // Ignore malformed file entry
    }
  }

  return {
    characters: loadedCharacters,
    lorebooks: loadedLorebooks,
    themes: loadedThemes,
    tags: mergeWithDefaultTags(customMetaTags),
    activeThemeIdFromMeta,
  };
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
  activeTheme: ContextTheme;
  setActiveThemeId: (id: string) => void;
  tags: TagDefinition[];
  setTags: React.Dispatch<React.SetStateAction<TagDefinition[]>>;
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
  // AI Config & Settings
  aiConfig: AIBackendConfig;
  setAiConfig: React.Dispatch<React.SetStateAction<AIBackendConfig>>;
  switchAIPreset: (presetId: AIPresetId) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  updateSettings: (partial: Partial<AppSettings>) => void;
  tokenBreakdown: TokenBreakdown;
  lastSavedAt: string | null;
  isDirty: boolean;
  saveNow: (mode?: 'manual' | 'autosave') => void;
  saveAndSyncNow: () => Promise<{ ok: boolean; message: string }>;
  resetWorkspaceToDefaults: () => void;
  // Unified Save Folder, Two-Way Live Sync & Storage Management
  savedFiles: SavedFileEntry[];
  saveLogs: SaveLogEntry[];
  nativeDirectoryName: string | null;
  pendingReconnectFolderName: string | null;
  isSyncingFolder: boolean;
  selectNativeSaveFolder: () => Promise<{ ok: boolean; message: string }>;
  reconnectNativeSaveFolder: () => Promise<{ ok: boolean; message: string }>;
  scanAndLoadSaveFolder: (options?: {
    dirHandleOverride?: any;
    folderPathOverride?: string;
    silent?: boolean;
  }) => Promise<{ ok: boolean; summary: string }>;
  loadSavedFileIntoWorkspace: (file: SavedFileEntry) => {
    ok: boolean;
    message: string;
  };
  createSaveFolder: (folderPath: string) => void;
  setActiveSaveFolder: (folderPath: string) => void;
  deleteSavedFile: (fileId: string) => void;
  exportSaveFolderBundle: (folderPath?: string) => void;
  storageBytesUsed: number;
  // Unified PNG & JSON Card Importer
  importFromFiles: (
    files: FileList | File[]
  ) => Promise<{ count: number; summary: string }>;
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
    formatTemplate: `<details><summary>Status & Telemetry</summary>\n\`\`\`yaml\nAffection: {{stat:Affection}}\nCurrent Mood: {{stat:Current Mood}}\n\`\`\`\n</details>`,
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
    description: 'Standalone or attachable SillyTavern World Info lorebook.',
    scan_depth: 4,
    token_budget: 1024,
    recursive_scanning: true,
    tags: [],
    modification_date: nowSec,
    entries: [],
    ...partial,
  };
}

function loadInitialState(): InitialWorkspaceBootstrap {
  purgeBrowserRuntimeCaches();

  const nowIso = new Date().toISOString();
  const nowDisplay = formatSafeTimestamp(nowIso);
  const dedicatedCreds = loadPersistedProviderCredentials();

  try {
    // 1. One-time migration from legacy monolithic `tavernsmith_store_v2` into Save Folder files, then delete legacy keys
    const legacyRaw = safeLocalStorageGet('tavernsmith_store_v2');
    if (legacyRaw) {
      try {
        const legacyParsed = JSON.parse(legacyRaw);
        const migratedFiles = buildUnifiedSavedFiles(
          Array.isArray(legacyParsed.characters) ? legacyParsed.characters : [],
          Array.isArray(legacyParsed.lorebooks) ? legacyParsed.lorebooks : [],
          Array.isArray(legacyParsed.themes) && legacyParsed.themes.length > 0
            ? legacyParsed.themes
            : DEFAULT_CONTEXT_THEMES,
          extractCustomUserTags(legacyParsed.tags),
          legacyParsed.settings?.activeThemeId || DEFAULT_SETTINGS.activeThemeId,
          legacyParsed.settings?.cardSpecVersion || DEFAULT_SETTINGS.cardSpecVersion,
          nowIso
        );
        if (!safeLocalStorageGet(SAVE_FOLDER_FILES_STORAGE_KEY)) {
          safeLocalStorageSet(
            SAVE_FOLDER_FILES_STORAGE_KEY,
            JSON.stringify(migratedFiles)
          );
        }
        if (!safeLocalStorageGet(PREFERENCES_STORAGE_KEY)) {
          const migratedPrefs: PersistedPreferencesState = {
            activeCharacterId: legacyParsed.activeCharacterId || '',
            activeLorebookId: legacyParsed.activeLorebookId || '',
            aiConfig: legacyParsed.aiConfig || DEFAULT_AI_CONFIG,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(legacyParsed.settings || {}),
            },
            saveLogs: Array.isArray(legacyParsed.saveLogs)
              ? legacyParsed.saveLogs
              : [],
            lastSavedAt: legacyParsed.lastSavedAt || nowDisplay,
          };
          safeLocalStorageSet(
            PREFERENCES_STORAGE_KEY,
            JSON.stringify(migratedPrefs)
          );
        }
      } catch {
        // Ignore malformed legacy state
      }
    }

    for (const oldKey of LEGACY_STORAGE_KEYS) {
      safeLocalStorageRemove(oldKey);
    }

    // 2. Read saved files from Save Folder storage (`Characters/`, `Lorebooks/`, `_tavernsmith_meta.json`)
    let persistedFiles: SavedFileEntry[] = [];
    const rawFiles = safeLocalStorageGet(SAVE_FOLDER_FILES_STORAGE_KEY);
    if (rawFiles) {
      const parsedFiles = JSON.parse(rawFiles);
      if (Array.isArray(parsedFiles)) {
        persistedFiles = parsedFiles;
      }
    }

    const {
      characters,
      lorebooks,
      themes,
      tags,
      activeThemeIdFromMeta,
    } = reconstructWorkspaceFromSaveFiles(persistedFiles);

    // 3. Read essential user preferences (Appearance mode, active Save Folder, AI Provider keys/models)
    const rawPrefs = safeLocalStorageGet(PREFERENCES_STORAGE_KEY);
    const parsedPrefs = rawPrefs
      ? (JSON.parse(rawPrefs) as Partial<PersistedPreferencesState>)
      : {};

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...(parsedPrefs.settings || {}),
      activeSaveFolder: UNIFIED_INTERNAL_ROOT,
      availableSaveFolders: [UNIFIED_INTERNAL_ROOT],
      mainSidebarOpen:
        parsedPrefs.settings?.mainSidebarOpen !== undefined
          ? parsedPrefs.settings.mainSidebarOpen
          : true,
      hideNsfwTags: Boolean(parsedPrefs.settings?.hideNsfwTags),
    };

    if (
      activeThemeIdFromMeta &&
      themes.some((t) => t.id === activeThemeIdFromMeta)
    ) {
      settings.activeThemeId = activeThemeIdFromMeta;
    } else if (!themes.some((t) => t.id === settings.activeThemeId)) {
      settings.activeThemeId = themes[0].id;
    }

    const activeCharacterId =
      parsedPrefs.activeCharacterId &&
      characters.some((c) => c.id === parsedPrefs.activeCharacterId)
        ? parsedPrefs.activeCharacterId
        : characters[0]?.id || '';

    const activeLorebookId =
      parsedPrefs.activeLorebookId &&
      lorebooks.some((l) => l.id === parsedPrefs.activeLorebookId)
        ? parsedPrefs.activeLorebookId
        : lorebooks[0]?.id || '';

    const mergedProviderKeys: Record<string, string> = {
      ...dedicatedCreds.savedProviderKeys,
      ...(parsedPrefs.aiConfig?.savedProviderKeys || {}),
    };
    const mergedProviderModels: Record<string, string> = {
      ...dedicatedCreds.savedProviderModels,
      ...(parsedPrefs.aiConfig?.savedProviderModels || {}),
    };

    const activePreset =
      parsedPrefs.aiConfig?.preset || DEFAULT_AI_CONFIG.preset;
    const activeProviderKey = getProviderKeyId(activePreset);
    const currentApiKey =
      parsedPrefs.aiConfig?.apiKey ||
      mergedProviderKeys[activeProviderKey] ||
      mergedProviderKeys[activePreset] ||
      '';
    const rawModelCandidate =
      parsedPrefs.aiConfig?.modelName ||
      mergedProviderModels[activeProviderKey] ||
      mergedProviderModels[activePreset] ||
      DEFAULT_AI_CONFIG.modelName;

    const currentModelName =
      activePreset === 'gemini' &&
      (rawModelCandidate.startsWith('gemini-1.') ||
        rawModelCandidate.startsWith('gemini-2.') ||
        rawModelCandidate === 'gemini-pro')
        ? 'gemini-3.8-flash'
        : rawModelCandidate;

    const rawUrlCandidate =
      parsedPrefs.aiConfig?.url || DEFAULT_AI_CONFIG.url;
    const normalizedUrl =
      activePreset === 'gemini' ||
      rawUrlCandidate.includes('generativelanguage.googleapis.com')
        ? '/api/gemini'
        : rawUrlCandidate;

    if (currentApiKey) {
      mergedProviderKeys[activeProviderKey] = currentApiKey;
      mergedProviderKeys[activePreset] = currentApiKey;
    }
    if (currentModelName) {
      mergedProviderModels[activeProviderKey] = currentModelName;
      mergedProviderModels[activePreset] = currentModelName;
    }

    // If any legacy plaintext keys were present in preferences, encrypt them into the AES-256-GCM vault
    if (Object.values(mergedProviderKeys).some((k) => Boolean(k && k.trim()))) {
      void encryptAndSaveProviderKeys(mergedProviderKeys);
    }
    if (Object.keys(mergedProviderModels).length > 0) {
      saveProviderModelsMap(mergedProviderModels);
    }

    const hydratedAiConfig: AIBackendConfig = {
      ...DEFAULT_AI_CONFIG,
      ...(parsedPrefs.aiConfig || {}),
      url: normalizedUrl,
      apiKey: currentApiKey,
      modelName: currentModelName,
      savedProviderKeys: mergedProviderKeys,
      savedProviderModels: mergedProviderModels,
    };

    const unifiedFiles = buildUnifiedSavedFiles(
      characters,
      lorebooks,
      themes,
      tags,
      settings.activeThemeId,
      settings.cardSpecVersion,
      nowIso
    );

    return {
      characters,
      activeCharacterId,
      lorebooks,
      activeLorebookId,
      themes,
      tags,
      aiConfig: hydratedAiConfig,
      settings,
      savedFiles: unifiedFiles,
      saveLogs: Array.isArray(parsedPrefs.saveLogs) ? parsedPrefs.saveLogs : [],
      lastSavedAt: parsedPrefs.lastSavedAt || nowDisplay,
    };
  } catch {
    // Fallback to clean defaults if storage is restricted
  }

  const initialFiles = buildUnifiedSavedFiles(
    [],
    [],
    DEFAULT_CONTEXT_THEMES,
    mergeWithDefaultTags([]),
    DEFAULT_SETTINGS.activeThemeId,
    DEFAULT_SETTINGS.cardSpecVersion,
    nowIso
  );

  const defaultProviderKey = getProviderKeyId(DEFAULT_AI_CONFIG.preset);
  return {
    characters: [],
    activeCharacterId: '',
    lorebooks: [],
    activeLorebookId: '',
    themes: DEFAULT_CONTEXT_THEMES,
    tags: mergeWithDefaultTags([]),
    aiConfig: {
      ...DEFAULT_AI_CONFIG,
      apiKey:
        dedicatedCreds.savedProviderKeys[defaultProviderKey] ||
        dedicatedCreds.savedProviderKeys[DEFAULT_AI_CONFIG.preset] ||
        '',
      modelName:
        dedicatedCreds.savedProviderModels[defaultProviderKey] ||
        dedicatedCreds.savedProviderModels[DEFAULT_AI_CONFIG.preset] ||
        DEFAULT_AI_CONFIG.modelName,
      savedProviderKeys: dedicatedCreds.savedProviderKeys,
      savedProviderModels: dedicatedCreds.savedProviderModels,
    },
    settings: DEFAULT_SETTINGS,
    savedFiles: initialFiles,
    saveLogs: [
      {
        id: 'log-init',
        timestamp: nowDisplay,
        mode: 'autosave',
        folderPath: UNIFIED_INTERNAL_ROOT,
        filesWritten: [META_FILENAME],
        nativeSynced: false,
      },
    ],
    lastSavedAt: nowDisplay,
  };
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const initial = useMemo(() => loadInitialState(), []);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('character');
  const [characters, setCharacters] = useState<CharacterCardData[]>(
    initial.characters
  );
  const [activeCharacterId, setActiveCharacterId] = useState<string>(
    initial.activeCharacterId
  );
  const [lorebooks, setLorebooks] = useState<Lorebook[]>(initial.lorebooks);
  const [activeLorebookId, setActiveLorebookId] = useState<string>(
    initial.activeLorebookId
  );
  const [themes, setThemes] = useState<ContextTheme[]>(initial.themes);
  const [tags, setTags] = useState<TagDefinition[]>(initial.tags);
  const [aiConfigState, setAiConfigState] = useState<AIBackendConfig>(
    initial.aiConfig
  );
  const [settings, setSettings] = useState<AppSettings>(initial.settings);
  const [saveLogs, setSaveLogs] = useState<SaveLogEntry[]>(initial.saveLogs);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initial.lastSavedAt
  );
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Wrapped setAiConfig that automatically persists & restores per-provider API keys and models
  const setAiConfig: React.Dispatch<React.SetStateAction<AIBackendConfig>> =
    useCallback((updater) => {
      setAiConfigState((prev) => {
        const rawNext =
          typeof updater === 'function' ? updater(prev) : updater;
        return syncAIConfigProviderCredentials(prev, rawNext);
      });
    }, []);

  const switchAIPreset = useCallback((presetId: AIPresetId) => {
    const found = AI_BACKEND_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setAiConfigState((prev) =>
      syncAIConfigProviderCredentials(prev, {
        ...prev,
        preset: presetId,
        url: found.defaultUrl,
        modelName: found.defaultModel,
        compatibilityFormat: 'auto',
        availableModels: found.suggestedModels,
      })
    );
  }, []);

  // Hydrate AES-256-GCM encrypted provider keys (`_tavernsmith_vault_enc`) into memory on startup
  useEffect(() => {
    let cancelled = false;
    decryptProviderKeysFromVault()
      .then((res) => {
        if (cancelled || !res.ok) return;
        setAiConfigState((prev) => {
          const mergedKeys: Record<string, string> = {
            ...res.keys,
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
          return {
            ...prev,
            apiKey: restoredActiveKey,
            savedProviderKeys: mergedKeys,
          };
        });
      })
      .catch(() => {
        // Ignore if vault requires custom passphrase unlock
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const aiConfig = aiConfigState;

  // Native FileSystemDirectoryHandle & IndexedDB Two-Way Sync State
  const nativeDirHandleRef = useRef<any>(null);
  const pendingReconnectRecordRef = useRef<StoredDirectoryRecord | null>(null);
  const [nativeDirectoryName, setNativeDirectoryName] = useState<string | null>(
    null
  );
  const [pendingReconnectFolderName, setPendingReconnectFolderName] = useState<
    string | null
  >(null);
  const [isSyncingFolder, setIsSyncingFolder] = useState<boolean>(false);

  const savedFiles = useMemo<SavedFileEntry[]>(
    () =>
      buildUnifiedSavedFiles(
        characters,
        lorebooks,
        themes,
        tags,
        settings.activeThemeId,
        settings.cardSpecVersion
      ),
    [
      characters,
      lorebooks,
      themes,
      tags,
      settings.activeThemeId,
      settings.cardSpecVersion,
    ]
  );

  const savedFilesRef = useRef<SavedFileEntry[]>(savedFiles);
  useEffect(() => {
    savedFilesRef.current = savedFiles;
  }, [savedFiles]);

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
    setIsDirty(true);
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

    setTags((prevTags) => {
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

      return newlyDiscovered.length > 0
        ? [...prevTags, ...newlyDiscovered]
        : prevTags;
    });
  }, [characters, lorebooks, themes]);

  const ensureTagRegistered = useCallback(
    (
      rawTagName: string,
      category: TagDefinition['category'] = 'Custom'
    ): TagDefinition | null => {
      const clean = rawTagName.trim();
      if (!clean) return null;

      const found = tags.find(
        (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (found) return found;

      const color =
        AUTO_TAG_PALETTE[tags.length % AUTO_TAG_PALETTE.length] || '#a855f7';
      const isNsfw =
        category === 'NSFW & Kinks' ||
        category === 'Extreme & Hentai Physics' ||
        clean.toLowerCase().includes('nsfw') ||
        clean.toLowerCase().includes('18+');
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        color,
        category,
        isNsfw,
        aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${clean}".`,
        aiDescription: `Incorporate thematic, tonal, and character elements consistent with "${clean}".`,
      };
      setTags((prev) => {
        if (
          prev.some((t) => t.name.trim().toLowerCase() === clean.toLowerCase())
        ) {
          return prev;
        }
        return [...prev, newTag];
      });
      return newTag;
    },
    [tags]
  );

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
        setCharacters((prev) => {
          if (prev.length === 0) {
            const freshBase = createBlankCharacter();
            const next =
              typeof updater === 'function' ? updater(freshBase) : updater;
            const autoNsfw = isCharacterNsfw(next, tags);
            const created: CharacterCardData = {
              ...next,
              id: freshBase.id,
              isNsfw: autoNsfw,
              modification_date: Math.floor(Date.now() / 1000),
            };
            setActiveCharacterId(created.id!);
            return [created];
          }
          return prev.map((c) => {
            if (c.id !== character.id) return c;
            const next = typeof updater === 'function' ? updater(c) : updater;
            const autoNsfw = isCharacterNsfw(next, tags);
            return {
              ...next,
              id: c.id,
              isNsfw: autoNsfw,
              modification_date: Math.floor(Date.now() / 1000),
            };
          });
        });
      },
      [character.id, tags]
    );

  const updateCharacterField = useCallback(
    <K extends keyof CharacterCardData>(
      field: K,
      value: CharacterCardData[K]
    ) => {
      setCharacter((prev) => {
        const updated = {
          ...prev,
          [field]: value,
          modification_date: Math.floor(Date.now() / 1000),
        };
        updated.isNsfw = isCharacterNsfw(updated, tags);
        return updated;
      });
    },
    [setCharacter, tags]
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
        setLorebooks((prev) => {
          if (prev.length === 0) {
            const freshBase = createBlankLorebook();
            const next =
              typeof updater === 'function' ? updater(freshBase) : updater;
            const autoNsfw = isLorebookNsfw(next, tags);
            const created: Lorebook = {
              ...next,
              id: freshBase.id,
              isNsfw: autoNsfw,
              modification_date: Math.floor(Date.now() / 1000),
            };
            setActiveLorebookId(created.id!);
            return [created];
          }
          return prev.map((l) => {
            if (l.id !== lorebook.id) return l;
            const next = typeof updater === 'function' ? updater(l) : updater;
            const autoNsfw = isLorebookNsfw(next, tags);
            return {
              ...next,
              id: l.id,
              isNsfw: autoNsfw,
              modification_date: Math.floor(Date.now() / 1000),
            };
          });
        });
      },
      [lorebook.id, tags]
    );

  const createNewCharacter = useCallback(
    (partial?: Partial<CharacterCardData>) => {
      const fresh = createBlankCharacter(partial);
      fresh.isNsfw = isCharacterNsfw(fresh, tags);
      setCharacters((prev) => {
        const conflict = prev.some(
          (c) =>
            c.id !== fresh.id &&
            (c.name || '').trim().toLowerCase() ===
              (fresh.name || '').trim().toLowerCase()
        );
        if (conflict) {
          const allNames = prev.map((c) => c.name || 'Untitled');
          window.setTimeout(() => {
            setNameConflictRequest({
              kind: 'character',
              itemId: fresh.id!,
              conflictingName: fresh.name,
              suggestedNames: buildSuggestedUniqueNames(fresh.name, allNames),
              sourceAction: 'create',
            });
          }, 0);
        }
        return [fresh, ...prev];
      });
      setActiveCharacterId(fresh.id!);
      return fresh.id!;
    },
    [tags]
  );

  const deleteCharacter = useCallback(
    (id: string) => {
      setCharacters((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          setActiveCharacterId('');
          return [];
        }
        if (activeCharacterId === id) {
          setActiveCharacterId(remaining[0].id!);
        }
        return remaining;
      });
    },
    [activeCharacterId]
  );

  const createNewLorebook = useCallback(
    (partial?: Partial<Lorebook>) => {
      const fresh = createBlankLorebook(partial);
      fresh.isNsfw = isLorebookNsfw(fresh, tags);
      setLorebooks((prev) => {
        const conflict = prev.some(
          (l) =>
            l.id !== fresh.id &&
            (l.name || '').trim().toLowerCase() ===
              (fresh.name || '').trim().toLowerCase()
        );
        if (conflict) {
          const allNames = prev.map((l) => l.name || 'Untitled Lorebook');
          window.setTimeout(() => {
            setNameConflictRequest({
              kind: 'lorebook',
              itemId: fresh.id!,
              conflictingName: fresh.name,
              suggestedNames: buildSuggestedUniqueNames(fresh.name, allNames),
              sourceAction: 'create',
            });
          }, 0);
        }
        return [fresh, ...prev];
      });
      setActiveLorebookId(fresh.id!);
      return fresh.id!;
    },
    [tags]
  );

  const deleteLorebook = useCallback(
    (id: string) => {
      setLorebooks((prev) => {
        const remaining = prev.filter((l) => l.id !== id);
        if (remaining.length === 0) {
          setActiveLorebookId('');
          return [];
        }
        if (activeLorebookId === id) {
          setActiveLorebookId(remaining[0].id!);
        }
        return remaining;
      });
    },
    [activeLorebookId]
  );

  const scanNativeDirectoryHandle = async (
    dirHandle: any,
    subfolderPrefix: '' | 'Characters/' | 'Lorebooks/',
    loadedCharacters: CharacterCardData[],
    loadedLorebooks: Lorebook[],
    syncedFileNames: string[],
    onMetaLoaded: (meta: TavernSmithMetaPayload) => void
  ) => {
    if (!dirHandle || typeof dirHandle.entries !== 'function') return;

    try {
      for await (const [entryName, entryHandle] of dirHandle.entries()) {
        if (!entryHandle || entryHandle.kind !== 'file') continue;
        const lowerName = String(entryName).toLowerCase();
        if (!lowerName.endsWith('.json') && !lowerName.endsWith('.png')) {
          continue;
        }
        if (lowerName.endsWith('_backupbundle.json')) {
          continue;
        }

        try {
          const file: File = await entryHandle.getFile();
          const fileLastModSec = Math.floor(
            (file.lastModified || Date.now()) / 1000
          );
          const updatedIso = new Date(
            file.lastModified || Date.now()
          ).toISOString();

          if (entryName === META_FILENAME) {
            const text = await file.text();
            const parsedMeta = JSON.parse(text) as Partial<TavernSmithMetaPayload>;
            if (
              parsedMeta &&
              (Array.isArray(parsedMeta.tags) ||
                Array.isArray(parsedMeta.contextThemes))
            ) {
              onMetaLoaded({
                schema: 'tavernsmith_meta_v1',
                updatedAt: parsedMeta.updatedAt || updatedIso,
                activeThemeId:
                  parsedMeta.activeThemeId || DEFAULT_SETTINGS.activeThemeId,
                contextThemes: Array.isArray(parsedMeta.contextThemes)
                  ? parsedMeta.contextThemes
                  : [],
                tags: Array.isArray(parsedMeta.tags) ? parsedMeta.tags : [],
              });
              syncedFileNames.push(`${subfolderPrefix}${META_FILENAME}`);
            }
            continue;
          }

          const parsedAsset = await importCardFromFile(file);
          if (parsedAsset.kind === 'character') {
            parsedAsset.character.modification_date =
              parsedAsset.character.modification_date || fileLastModSec;
            loadedCharacters.push(parsedAsset.character);
            if (parsedAsset.embeddedLorebook) {
              parsedAsset.embeddedLorebook.modification_date =
                parsedAsset.embeddedLorebook.modification_date || fileLastModSec;
              loadedLorebooks.push(parsedAsset.embeddedLorebook);
            }
            syncedFileNames.push(`${subfolderPrefix}${entryName}`);
          } else if (parsedAsset.kind === 'lorebook') {
            parsedAsset.lorebook.modification_date =
              parsedAsset.lorebook.modification_date || fileLastModSec;
            loadedLorebooks.push(parsedAsset.lorebook);
            syncedFileNames.push(`${subfolderPrefix}${entryName}`);
          }
        } catch {
          // Ignore non-card PNGs or unrelated JSON files
        }
      }
    } catch {
      // Ignore directory iteration permission errors
    }
  };

  const writeFilesToNativeDirectory = useCallback(
    async (
      rootHandle: any,
      charsToWrite: CharacterCardData[],
      booksToWrite: Lorebook[],
      fallbackBook: Lorebook,
      themesToWrite: ContextTheme[],
      tagsToWrite: TagDefinition[],
      activeThemeIdToWrite: string,
      specVersion: 'v2' | 'v3',
      nowIso: string
    ) => {
      if (!rootHandle) return;
      try {
        const charsDirHandle = await rootHandle.getDirectoryHandle(
          'Characters',
          { create: true }
        );
        const loreDirHandle = await rootHandle.getDirectoryHandle(
          'Lorebooks',
          { create: true }
        );

        for (const c of charsToWrite) {
          const cFileName = `${sanitizeFilename(c.name)}.json`;
          const cContent = JSON.stringify(
            serializeCharacterCard(
              c,
              specVersion,
              c.character_book || fallbackBook
            ),
            null,
            2
          );
          const cHandle = await charsDirHandle.getFileHandle(cFileName, {
            create: true,
          });
          const cWritable = await cHandle.createWritable();
          await cWritable.write(cContent);
          await cWritable.close();
        }

        for (const lb of booksToWrite) {
          const lFileName = `${sanitizeFilename(lb.name)}.json`;
          const lContent = JSON.stringify(
            {
              id: lb.id,
              name: lb.name,
              description: lb.description,
              scan_depth: lb.scan_depth,
              token_budget: lb.token_budget,
              recursive_scanning: lb.recursive_scanning,
              modification_date: lb.modification_date,
              isNsfw: Boolean(lb.isNsfw),
              entries: lb.entries,
              tags: lb.tags || [],
            },
            null,
            2
          );
          const lHandle = await loreDirHandle.getFileHandle(lFileName, {
            create: true,
          });
          const lWritable = await lHandle.createWritable();
          await lWritable.write(lContent);
          await lWritable.close();
        }

        const metaPayload: TavernSmithMetaPayload = {
          schema: 'tavernsmith_meta_v1',
          updatedAt: nowIso,
          activeThemeId: activeThemeIdToWrite,
          contextThemes: themesToWrite,
          tags: extractCustomUserTags(tagsToWrite),
        };
        const metaSerialized = JSON.stringify(metaPayload, null, 2);
        const mHandle = await rootHandle.getFileHandle(META_FILENAME, {
          create: true,
        });
        const mWritable = await mHandle.createWritable();
        await mWritable.write(metaSerialized);
        await mWritable.close();
      } catch {
        // Ignore transient native permission loss
      }
    },
    []
  );

  /**
   * Scans the Save Folder and applies Smart Cache-to-Folder Sync (Newest Wins):
   * - Compares `updatedAt` / `modification_date` of any cached item against the stored file in the Save Folder
   *   ONLY if they share the exact same name.
   * - If the cached version is newer than the folder file, overwrites the stored folder file with the newer cached version
   *   and immediately clears the browser cache copy (`SAVE_FOLDER_FILES_STORAGE_KEY`) so old cached items never resurface.
   */
  const scanAndLoadSaveFolder = useCallback(
    async (options?: {
      dirHandleOverride?: any;
      folderPathOverride?: string;
      silent?: boolean;
    }): Promise<{ ok: boolean; summary: string }> => {
      const rootHandle = options?.dirHandleOverride ?? nativeDirHandleRef.current;
      const folderDisplay = rootHandle
        ? `/${rootHandle.name || 'SaveFolder'}/`
        : UNIFIED_INTERNAL_ROOT;

      setIsSyncingFolder(true);

      const loadedCharacters: CharacterCardData[] = [];
      const loadedLorebooks: Lorebook[] = [];
      let loadedMeta: TavernSmithMetaPayload | null = null;
      const syncedFileNames: string[] = [];

      // Read any temporary browser cached items so we can compare timestamps (Newest Wins) when syncing with a Save Folder
      let cachedCharacters: CharacterCardData[] = [];
      let cachedLorebooks: Lorebook[] = [];
      let cachedMeta: TavernSmithMetaPayload | null = null;
      const rawCache = safeLocalStorageGet(SAVE_FOLDER_FILES_STORAGE_KEY);
      if (rawCache) {
        try {
          const parsedCacheEntries = JSON.parse(rawCache) as SavedFileEntry[];
          if (Array.isArray(parsedCacheEntries)) {
            for (const entry of parsedCacheEntries) {
              if (entry.kind === 'meta' || entry.fileName === META_FILENAME) {
                cachedMeta = JSON.parse(entry.content) as TavernSmithMetaPayload;
              } else {
                const asset = parseImportedJsonString(
                  entry.content,
                  undefined,
                  entry.fileName
                );
                const entrySec = entry.updatedAt
                  ? Math.floor(new Date(entry.updatedAt).getTime() / 1000)
                  : 0;
                if (asset.kind === 'character') {
                  asset.character.modification_date = Math.max(
                    asset.character.modification_date || 0,
                    entrySec
                  );
                  cachedCharacters.push(asset.character);
                } else if (asset.kind === 'lorebook') {
                  asset.lorebook.modification_date = Math.max(
                    asset.lorebook.modification_date || 0,
                    entrySec
                  );
                  cachedLorebooks.push(asset.lorebook);
                }
              }
            }
          }
        } catch {
          // Ignore malformed cache
        }
      }

      try {
        if (rootHandle && typeof rootHandle.entries === 'function') {
          const perm = await queryDirectoryHandlePermission(rootHandle, 'read');
          if (perm === 'granted') {
            let charsDirHandle: any = null;
            let loreDirHandle: any = null;
            try {
              charsDirHandle = await rootHandle.getDirectoryHandle(
                'Characters',
                { create: true }
              );
              loreDirHandle = await rootHandle.getDirectoryHandle(
                'Lorebooks',
                { create: true }
              );
            } catch {
              try {
                charsDirHandle =
                  await rootHandle.getDirectoryHandle('Characters');
              } catch {
                // Ignore
              }
              try {
                loreDirHandle =
                  await rootHandle.getDirectoryHandle('Lorebooks');
              } catch {
                // Ignore
              }
            }

            await scanNativeDirectoryHandle(
              rootHandle,
              '',
              loadedCharacters,
              loadedLorebooks,
              syncedFileNames,
              (meta) => {
                loadedMeta = meta;
              }
            );

            if (charsDirHandle) {
              await scanNativeDirectoryHandle(
                charsDirHandle,
                'Characters/',
                loadedCharacters,
                loadedLorebooks,
                syncedFileNames,
                (meta) => {
                  loadedMeta = meta;
                }
              );
            }

            if (loreDirHandle) {
              await scanNativeDirectoryHandle(
                loreDirHandle,
                'Lorebooks/',
                loadedCharacters,
                loadedLorebooks,
                syncedFileNames,
                (meta) => {
                  loadedMeta = meta;
                }
              );
            }

            // SMART CACHE-TO-FOLDER SYNC (NEWEST WINS):
            // Compare cached items against stored folder files ONLY if they share the exact same name.
            // If cached version is newer, overwrite folder file with newer cached version, then clear browser cache copy.
            const newerCachedCharsToFlush: CharacterCardData[] = [];
            for (const cachedChar of cachedCharacters) {
              const cachedNameLower = (cachedChar.name || '').trim().toLowerCase();
              const folderIdx = loadedCharacters.findIndex(
                (fc) => (fc.name || '').trim().toLowerCase() === cachedNameLower
              );
              if (folderIdx !== -1) {
                const folderChar = loadedCharacters[folderIdx];
                const cachedTime = cachedChar.modification_date || 0;
                const folderTime = folderChar.modification_date || 0;
                if (cachedTime > folderTime) {
                  loadedCharacters[folderIdx] = {
                    ...folderChar,
                    ...cachedChar,
                    id: folderChar.id || cachedChar.id,
                  };
                  newerCachedCharsToFlush.push(loadedCharacters[folderIdx]);
                }
              }
            }

            const newerCachedBooksToFlush: Lorebook[] = [];
            for (const cachedBook of cachedLorebooks) {
              const cachedNameLower = (cachedBook.name || '').trim().toLowerCase();
              const folderIdx = loadedLorebooks.findIndex(
                (fb) => (fb.name || '').trim().toLowerCase() === cachedNameLower
              );
              if (folderIdx !== -1) {
                const folderBook = loadedLorebooks[folderIdx];
                const cachedTime = cachedBook.modification_date || 0;
                const folderTime = folderBook.modification_date || 0;
                if (cachedTime > folderTime) {
                  loadedLorebooks[folderIdx] = {
                    ...folderBook,
                    ...cachedBook,
                    id: folderBook.id || cachedBook.id,
                  };
                  newerCachedBooksToFlush.push(loadedLorebooks[folderIdx]);
                }
              }
            }

            if (loadedMeta && cachedMeta) {
              const folderMetaTime = new Date(
                (loadedMeta as TavernSmithMetaPayload).updatedAt || 0
              ).getTime();
              const cachedMetaTime = new Date(cachedMeta.updatedAt || 0).getTime();
              if (cachedMetaTime > folderMetaTime) {
                loadedMeta = cachedMeta;
              }
            } else if (!loadedMeta && cachedMeta) {
              loadedMeta = cachedMeta;
            }

            if (
              newerCachedCharsToFlush.length > 0 ||
              newerCachedBooksToFlush.length > 0
            ) {
              const nowIso = new Date().toISOString();
              const snap = latestWorkspaceRef.current;
              await writeFilesToNativeDirectory(
                rootHandle,
                newerCachedCharsToFlush,
                newerCachedBooksToFlush,
                snap.lorebook,
                snap.themes,
                snap.tags,
                snap.settings.activeThemeId,
                snap.settings.cardSpecVersion,
                nowIso
              );
            }

            // Immediately clear the browser cache copy once synced with the Save Folder so stale cached items never resurface
            safeLocalStorageRemove(SAVE_FOLDER_FILES_STORAGE_KEY);
          }
        } else {
          for (const entry of savedFilesRef.current) {
            try {
              if (
                entry.fileName === META_FILENAME ||
                entry.kind === 'meta'
              ) {
                const parsedMeta = JSON.parse(
                  entry.content
                ) as Partial<TavernSmithMetaPayload>;
                if (
                  parsedMeta &&
                  (Array.isArray(parsedMeta.tags) ||
                    Array.isArray(parsedMeta.contextThemes))
                ) {
                  loadedMeta = {
                    schema: 'tavernsmith_meta_v1',
                    updatedAt: parsedMeta.updatedAt || entry.updatedAt,
                    activeThemeId:
                      parsedMeta.activeThemeId ||
                      DEFAULT_SETTINGS.activeThemeId,
                    contextThemes: Array.isArray(parsedMeta.contextThemes)
                      ? parsedMeta.contextThemes
                      : [],
                    tags: Array.isArray(parsedMeta.tags) ? parsedMeta.tags : [],
                  };
                  syncedFileNames.push(entry.fileName);
                }
                continue;
              }

              const parsedAsset = parseImportedJsonString(
                entry.content,
                undefined,
                entry.fileName
              );
              if (parsedAsset.kind === 'character') {
                loadedCharacters.push(parsedAsset.character);
                if (parsedAsset.embeddedLorebook) {
                  loadedLorebooks.push(parsedAsset.embeddedLorebook);
                }
                syncedFileNames.push(`Characters/${entry.fileName}`);
              } else if (parsedAsset.kind === 'lorebook') {
                loadedLorebooks.push(parsedAsset.lorebook);
                syncedFileNames.push(`Lorebooks/${entry.fileName}`);
              }
            } catch {
              // Ignore unparseable entry
            }
          }
        }

        let mergedTagsList = mergeWithDefaultTags(
          extractCustomUserTags(latestWorkspaceRef.current.tags)
        );

        if (loadedMeta) {
          const metaSnapshot: TavernSmithMetaPayload = loadedMeta;
          if (metaSnapshot.contextThemes.length > 0) {
            setThemes((prevThemes) => {
              const mapByName = new Map<string, ContextTheme>();
              for (const t of prevThemes) {
                mapByName.set(t.name.trim().toLowerCase(), t);
              }
              for (const incoming of metaSnapshot.contextThemes) {
                if (incoming && incoming.name) {
                  const key = incoming.name.trim().toLowerCase();
                  const existing = mapByName.get(key);
                  mapByName.set(key, {
                    ...existing,
                    ...incoming,
                    id: existing?.id || incoming.id || `theme-${Date.now()}`,
                  });
                }
              }
              return Array.from(mapByName.values());
            });
          }

          if (metaSnapshot.tags.length > 0) {
            setTags((prevTags) => {
              const customCurrent = extractCustomUserTags(prevTags);
              const customIncoming = extractCustomUserTags(metaSnapshot.tags);
              mergedTagsList = mergeWithDefaultTags([
                ...customCurrent,
                ...customIncoming,
              ]);
              return mergedTagsList;
            });
          } else {
            setTags((prevTags) => {
              mergedTagsList = mergeWithDefaultTags(
                extractCustomUserTags(prevTags)
              );
              return mergedTagsList;
            });
          }
        }

        if (loadedCharacters.length > 0) {
          setCharacters((prevChars) => {
            const nextList = [...prevChars];
            for (const incoming of loadedCharacters) {
              const idx = nextList.findIndex(
                (c) =>
                  c.name.trim().toLowerCase() ===
                  incoming.name.trim().toLowerCase()
              );
              if (idx !== -1) {
                const existing = nextList[idx];
                const incomingMod = incoming.modification_date || 0;
                const existingMod = existing.modification_date || 0;
                const winner = incomingMod >= existingMod ? incoming : existing;
                const merged: CharacterCardData = {
                  ...existing,
                  ...winner,
                  id: existing.id,
                  avatar: winner.avatar || existing.avatar,
                };
                merged.isNsfw = isCharacterNsfw(merged, mergedTagsList);
                nextList[idx] = merged;
              } else {
                incoming.isNsfw = isCharacterNsfw(incoming, mergedTagsList);
                nextList.unshift(incoming);
              }
            }
            return nextList;
          });
        }

        if (loadedLorebooks.length > 0) {
          setLorebooks((prevBooks) => {
            const nextList = [...prevBooks];
            for (const incoming of loadedLorebooks) {
              const idx = nextList.findIndex(
                (b) =>
                  b.name.trim().toLowerCase() ===
                  incoming.name.trim().toLowerCase()
              );
              if (idx !== -1) {
                const existing = nextList[idx];
                const incomingMod = incoming.modification_date || 0;
                const existingMod = existing.modification_date || 0;
                const winner = incomingMod >= existingMod ? incoming : existing;
                const merged: Lorebook = {
                  ...existing,
                  ...winner,
                  id: existing.id,
                };
                merged.isNsfw = isLorebookNsfw(merged, mergedTagsList);
                nextList[idx] = merged;
              } else {
                incoming.isNsfw = isLorebookNsfw(incoming, mergedTagsList);
                nextList.unshift(incoming);
              }
            }
            return nextList;
          });
        }

        if (!options?.silent && syncedFileNames.length > 0) {
          const nowDisplay = formatSafeTimestamp(new Date().toISOString());
          const syncLog: SaveLogEntry = {
            id: `sync-${Date.now()}`,
            timestamp: nowDisplay,
            mode: 'sync',
            folderPath: folderDisplay,
            filesWritten: syncedFileNames,
            nativeSynced: Boolean(rootHandle),
          };
          setSaveLogs((prev) => [syncLog, ...prev.slice(0, 19)]);
        }

        const summaryParts: string[] = [];
        if (loadedCharacters.length > 0) {
          summaryParts.push(
            `${loadedCharacters.length} character${loadedCharacters.length === 1 ? '' : 's'} (Characters/)`
          );
        }
        if (loadedLorebooks.length > 0) {
          summaryParts.push(
            `${loadedLorebooks.length} lorebook${loadedLorebooks.length === 1 ? '' : 's'} (Lorebooks/)`
          );
        }
        if (loadedMeta) {
          const m: TavernSmithMetaPayload = loadedMeta;
          summaryParts.push(
            `${m.tags.length} custom tags & ${m.contextThemes.length} themes (${META_FILENAME})`
          );
        }

        return {
          ok: true,
          summary:
            summaryParts.length > 0
              ? `Synced ${summaryParts.join(', ')} from ${folderDisplay}`
              : `Scanned ${folderDisplay} (all subfolders up to date).`,
        };
      } catch {
        return {
          ok: false,
          summary: `Could not scan ${folderDisplay} in this environment.`,
        };
      } finally {
        setIsSyncingFolder(false);
      }
    },
    [writeFilesToNativeDirectory]
  );

  // On App Launch: Purge runtime caches, re-read Save Folder files (`Characters/`, `Lorebooks/`, `_tavernsmith_meta.json`),
  // and check IndexedDB for a linked Local PC FileSystemDirectoryHandle.
  useEffect(() => {
    let cancelled = false;
    purgeBrowserRuntimeCaches();

    (async () => {
      try {
        await scanAndLoadSaveFolder({ silent: true });
        if (cancelled) return;

        const storedRecord = await loadDirectoryHandleFromIndexedDB();
        if (cancelled) return;

        if (storedRecord && storedRecord.handle) {
          const perm = await queryDirectoryHandlePermission(
            storedRecord.handle,
            'readwrite'
          );
          if (cancelled) return;

          if (perm === 'granted') {
            nativeDirHandleRef.current = storedRecord.handle;
            const folderPath = `/${storedRecord.folderName}/`;
            setNativeDirectoryName(storedRecord.folderName);
            setPendingReconnectFolderName(null);
            setSettings((prev) => ({
              ...prev,
              activeSaveFolder: folderPath,
              availableSaveFolders: [folderPath],
            }));
            await scanAndLoadSaveFolder({
              dirHandleOverride: storedRecord.handle,
              folderPathOverride: folderPath,
              silent: true,
            });
            return;
          } else {
            pendingReconnectRecordRef.current = storedRecord;
            setPendingReconnectFolderName(storedRecord.folderName);
          }
        }
      } catch {
        // Ignore any startup IndexedDB/FileSystem error in restricted environments
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scanAndLoadSaveFolder]);

  const reconnectNativeSaveFolder = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    try {
      const record = pendingReconnectRecordRef.current;
      if (!record || !record.handle) {
        return {
          ok: false,
          message: 'No stored local directory handle found. Please select a folder.',
        };
      }

      const perm = await requestDirectoryHandlePermission(
        record.handle,
        'readwrite'
      );
      if (perm !== 'granted') {
        return {
          ok: false,
          message: `Permission to access "${record.folderName}" was not granted.`,
        };
      }

      nativeDirHandleRef.current = record.handle;
      const folderPath = `/${record.folderName}/`;
      setNativeDirectoryName(record.folderName);
      setPendingReconnectFolderName(null);
      pendingReconnectRecordRef.current = null;

      setSettings((prev) => ({
        ...prev,
        activeSaveFolder: folderPath,
        availableSaveFolders: [folderPath],
      }));

      const syncRes = await scanAndLoadSaveFolder({
        dirHandleOverride: record.handle,
        folderPathOverride: folderPath,
        silent: false,
      });

      return {
        ok: true,
        message: `Reconnected Local PC Hard Drive Folder "${record.folderName}/". ${syncRes.summary}`,
      };
    } catch {
      return {
        ok: false,
        message: 'Could not reconnect local folder in this browser context.',
      };
    }
  }, [scanAndLoadSaveFolder]);

  const selectNativeSaveFolder = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<any>;
    };

    if (typeof win.showDirectoryPicker !== 'function') {
      return {
        ok: false,
        message:
          'Native OS directory picker is not supported in this browser or preview iframe. Open TavernSmith in a standalone browser tab to link a Local PC Hard Drive folder.',
      };
    }

    try {
      const rootHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
      nativeDirHandleRef.current = rootHandle;
      const folderName = rootHandle.name || 'TavernSmith_Saves';
      const folderPath = `/${folderName}/`;
      setNativeDirectoryName(folderName);
      setPendingReconnectFolderName(null);
      pendingReconnectRecordRef.current = null;

      await rootHandle.getDirectoryHandle('Characters', { create: true });
      await rootHandle.getDirectoryHandle('Lorebooks', { create: true });

      await saveDirectoryHandleToIndexedDB(rootHandle, folderPath);

      setSettings((prev) => ({
        ...prev,
        activeSaveFolder: folderPath,
        availableSaveFolders: [folderPath],
      }));

      const syncRes = await scanAndLoadSaveFolder({
        dirHandleOverride: rootHandle,
        folderPathOverride: folderPath,
        silent: false,
      });

      return {
        ok: true,
        message: `Linked Local PC Hard Drive Folder "${folderName}/" with automatic Characters/ and Lorebooks/ subfolders. ${syncRes.summary}`,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, message: 'Folder selection cancelled.' };
      }
      return {
        ok: false,
        message:
          'Browser preview iframe restricted the native OS folder picker. Open TavernSmith in a new standalone tab to link a Local PC Hard Drive folder (currently using Browser Internal Storage).',
      };
    }
  }, [scanAndLoadSaveFolder]);

  const createSaveFolder = useCallback((rawPath: string) => {
    const clean = rawPath.trim();
    if (!clean) return;
    setSettings((prev) => ({
      ...prev,
      activeSaveFolder: clean.startsWith('/') ? clean : `/${clean}/`,
    }));
  }, []);

  const setActiveSaveFolder = useCallback(
    (folderPath: string) => {
      setSettings((prev) => ({
        ...prev,
        activeSaveFolder: folderPath,
      }));
      void scanAndLoadSaveFolder({
        folderPathOverride: folderPath,
        silent: false,
      });
    },
    [scanAndLoadSaveFolder]
  );

  const loadSavedFileIntoWorkspace = useCallback(
    (file: SavedFileEntry): { ok: boolean; message: string } => {
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

        const parsed = parseImportedJsonString(
          file.content,
          undefined,
          file.fileName
        );
        if (parsed.kind === 'character') {
          parsed.character.isNsfw = isCharacterNsfw(parsed.character, tags);
          const match = characters.find(
            (c) =>
              c.name.trim().toLowerCase() ===
              parsed.character.name.trim().toLowerCase()
          );
          if (match && match.id) {
            setActiveCharacterId(match.id);
          } else {
            setCharacters((prev) => [parsed.character, ...prev]);
            setActiveCharacterId(parsed.character.id!);
          }
          setActiveTab('character');
          return {
            ok: true,
            message: `Loaded character "${parsed.character.name}" into Character Workbench.`,
          };
        } else if (parsed.kind === 'lorebook') {
          parsed.lorebook.isNsfw = isLorebookNsfw(parsed.lorebook, tags);
          const match = lorebooks.find(
            (l) =>
              l.name.trim().toLowerCase() ===
              parsed.lorebook.name.trim().toLowerCase()
          );
          if (match && match.id) {
            setActiveLorebookId(match.id);
          } else {
            setLorebooks((prev) => [parsed.lorebook, ...prev]);
            setActiveLorebookId(parsed.lorebook.id!);
          }
          setActiveTab('lorebook');
          return {
            ok: true,
            message: `Loaded lorebook "${parsed.lorebook.name}" into Lorebook Workbench.`,
          };
        }
        return { ok: false, message: 'Unrecognized file format.' };
      } catch {
        return { ok: false, message: `Could not parse ${file.fileName}.` };
      }
    },
    [characters, lorebooks, tags]
  );

  const deleteSavedFile = useCallback(
    (fileId: string) => {
      const target = savedFiles.find((f) => f.id === fileId);
      if (!target) return;

      if (target.kind === 'character') {
        const match = characters.find(
          (c) => `${sanitizeFilename(c.name)}.json` === target.fileName
        );
        if (match && match.id) {
          deleteCharacter(match.id);
        }
        if (nativeDirHandleRef.current) {
          const rootHandle = nativeDirHandleRef.current;
          (async () => {
            try {
              const charsDir = await rootHandle.getDirectoryHandle('Characters');
              await charsDir.removeEntry(target.fileName);
            } catch {
              // Ignore if not present on disk
            }
          })();
        }
      } else if (target.kind === 'lorebook') {
        const match = lorebooks.find(
          (l) => `${sanitizeFilename(l.name)}.json` === target.fileName
        );
        if (match && match.id) {
          deleteLorebook(match.id);
        }
        if (nativeDirHandleRef.current) {
          const rootHandle = nativeDirHandleRef.current;
          (async () => {
            try {
              const loreDir = await rootHandle.getDirectoryHandle('Lorebooks');
              await loreDir.removeEntry(target.fileName);
            } catch {
              // Ignore if not present on disk
            }
          })();
        }
      }
    },
    [savedFiles, characters, lorebooks, deleteCharacter, deleteLorebook]
  );

  const exportSaveFolderBundle = useCallback(() => {
    const rootLabel = nativeDirectoryName
      ? `/${nativeDirectoryName}/`
      : UNIFIED_INTERNAL_ROOT;
    const bundle = {
      bundleVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      saveFolderRoot: rootLabel,
      structure: {
        charactersSubfolder: 'Characters/',
        lorebooksSubfolder: 'Lorebooks/',
        metaFile: META_FILENAME,
      },
      fileCount: savedFiles.length,
      files: savedFiles.map((f) => ({
        path: `${f.folderPath === '/' ? '' : f.folderPath}${f.fileName}`,
        fileName: f.fileName,
        subfolder: f.folderPath,
        kind: f.kind,
        updatedAt: f.updatedAt,
        data: JSON.parse(f.content),
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const folderSlug = sanitizeFilename(
      nativeDirectoryName || 'TavernSmith_Saves'
    );
    triggerBrowserDownload(
      blob,
      `TavernSmith_${folderSlug}_BackupBundle.json`
    );
  }, [savedFiles, nativeDirectoryName]);

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

  const saveNow = useCallback(
    (mode: 'manual' | 'autosave' = 'manual') => {
      // Check for duplicate Character or Lorebook names on manual save
      if (mode === 'manual') {
        const seenCharNames = new Map<string, string>();
        for (const c of characters) {
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
                characters.map((ch) => ch.name)
              ),
              sourceAction: 'save',
            });
            return;
          }
          seenCharNames.set(lower, c.id!);
        }

        const seenBookNames = new Map<string, string>();
        for (const l of lorebooks) {
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
                lorebooks.map((lb) => lb.name)
              ),
              sourceAction: 'save',
            });
            return;
          }
          seenBookNames.set(lower, l.id!);
        }
      }

      const nowIso = new Date().toISOString();
      const displayTime = formatSafeTimestamp(nowIso);
      const rootFolderDisplay = nativeDirectoryName
        ? `/${nativeDirectoryName}/`
        : UNIFIED_INTERNAL_ROOT;

      const latestFiles = buildUnifiedSavedFiles(
        characters,
        lorebooks,
        themes,
        tags,
        settings.activeThemeId,
        settings.cardSpecVersion,
        nowIso
      );
      savedFilesRef.current = latestFiles;

      // Only persist in browser fallback storage when NO Local PC Save Folder is connected
      if (nativeDirHandleRef.current) {
        void writeFilesToNativeDirectory(
          nativeDirHandleRef.current,
          characters,
          lorebooks,
          lorebook,
          themes,
          tags,
          settings.activeThemeId,
          settings.cardSpecVersion,
          nowIso
        ).then(() => {
          safeLocalStorageRemove(SAVE_FOLDER_FILES_STORAGE_KEY);
        });
      } else {
        safeLocalStorageSet(
          SAVE_FOLDER_FILES_STORAGE_KEY,
          JSON.stringify(latestFiles)
        );
      }

      const filesWrittenList: string[] = [];
      for (const c of characters) {
        filesWrittenList.push(`Characters/${sanitizeFilename(c.name)}.json`);
      }
      for (const l of lorebooks) {
        filesWrittenList.push(`Lorebooks/${sanitizeFilename(l.name)}.json`);
      }
      filesWrittenList.push(META_FILENAME);

      const newLog: SaveLogEntry = {
        id: `savelog-${Date.now()}`,
        timestamp: displayTime,
        mode,
        folderPath: rootFolderDisplay,
        filesWritten: filesWrittenList,
        nativeSynced: Boolean(nativeDirHandleRef.current),
      };

      setSaveLogs((prev) => {
        const updatedLogs = [newLog, ...prev.slice(0, 19)];
        const prefsPayload: PersistedPreferencesState = {
          activeCharacterId,
          activeLorebookId,
          aiConfig: stripApiKeysForStorage(aiConfig),
          settings,
          saveLogs: updatedLogs,
          lastSavedAt: displayTime,
        };
        safeLocalStorageSet(
          PREFERENCES_STORAGE_KEY,
          JSON.stringify(prefsPayload)
        );
        return updatedLogs;
      });

      if (mode === 'manual') {
        purgeBrowserRuntimeCaches();
      }

      setLastSavedAt(displayTime);
      setIsDirty(false);
    },
    [
      characters,
      activeCharacterId,
      lorebooks,
      activeLorebookId,
      lorebook,
      themes,
      tags,
      aiConfig,
      settings,
      nativeDirectoryName,
      writeFilesToNativeDirectory,
    ]
  );

  const saveAndSyncNow = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    saveNow('manual');
    if (nativeDirHandleRef.current) {
      await scanAndLoadSaveFolder({
        dirHandleOverride: nativeDirHandleRef.current,
        silent: true,
      });
      safeLocalStorageRemove(SAVE_FOLDER_FILES_STORAGE_KEY);
    }
    purgeBrowserRuntimeCaches();
    setIsDirty(false);
    return {
      ok: true,
      message: nativeDirectoryName
        ? `Saved & synced to Local PC Folder (${nativeDirectoryName}/) and cleared temporary browser cache.`
        : `Saved & synced to Save Folder (${UNIFIED_INTERNAL_ROOT}) and cleared temporary runtime cache.`,
    };
  }, [saveNow, scanAndLoadSaveFolder, nativeDirectoryName]);

  // Only persist user data in localStorage fallback when NO Local PC Save Folder is configured,
  // and NEVER cache built-in DEFAULT_TAGS or UI code in localStorage.
  useEffect(() => {
    if (!nativeDirHandleRef.current) {
      safeLocalStorageSet(
        SAVE_FOLDER_FILES_STORAGE_KEY,
        JSON.stringify(savedFiles)
      );
    } else {
      safeLocalStorageRemove(SAVE_FOLDER_FILES_STORAGE_KEY);
    }
    const prefsPayload: PersistedPreferencesState = {
      activeCharacterId,
      activeLorebookId,
      aiConfig: stripApiKeysForStorage(aiConfig),
      settings,
      saveLogs,
      lastSavedAt,
    };
    safeLocalStorageSet(PREFERENCES_STORAGE_KEY, JSON.stringify(prefsPayload));
  }, [
    activeCharacterId,
    activeLorebookId,
    aiConfig,
    settings,
    savedFiles,
    saveLogs,
    lastSavedAt,
  ]);

  // Keep a live ref of all workspace state including `isDirty` for `beforeunload` / `pagehide`
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
    saveLogs,
    lastSavedAt,
    isDirty,
  });

  useEffect(() => {
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
      saveLogs,
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
    saveLogs,
    lastSavedAt,
    isDirty,
  ]);

  // Attach lifecycle listeners for `beforeunload`, `pagehide`, and `visibilitychange`:
  // - Prompts the user before closing the tab/window if unsaved changes exist (`isDirty`)
  // - Flushes data to Save Folder and wipes temporary browser cache
  useEffect(() => {
    const flushForceSaveOnClose = (purgeCache: boolean) => {
      try {
        const snap = latestWorkspaceRef.current;
        const nowIso = new Date().toISOString();
        const displayTime = formatSafeTimestamp(nowIso);

        const latestFiles = buildUnifiedSavedFiles(
          snap.characters,
          snap.lorebooks,
          snap.themes,
          snap.tags,
          snap.settings.activeThemeId,
          snap.settings.cardSpecVersion,
          nowIso
        );
        savedFilesRef.current = latestFiles;

        if (nativeDirHandleRef.current) {
          void writeFilesToNativeDirectory(
            nativeDirHandleRef.current,
            snap.characters,
            snap.lorebooks,
            snap.lorebook,
            snap.themes,
            snap.tags,
            snap.settings.activeThemeId,
            snap.settings.cardSpecVersion,
            nowIso
          );
          safeLocalStorageRemove(SAVE_FOLDER_FILES_STORAGE_KEY);
        } else {
          safeLocalStorageSet(
            SAVE_FOLDER_FILES_STORAGE_KEY,
            JSON.stringify(latestFiles)
          );
        }

        const prefsPayload: PersistedPreferencesState = {
          activeCharacterId: snap.activeCharacterId,
          activeLorebookId: snap.activeLorebookId,
          aiConfig: stripApiKeysForStorage(snap.aiConfig),
          settings: snap.settings,
          saveLogs: snap.saveLogs,
          lastSavedAt: displayTime,
        };
        safeLocalStorageSet(
          PREFERENCES_STORAGE_KEY,
          JSON.stringify(prefsPayload)
        );
        savePersistedProviderCredentials(
          snap.aiConfig.savedProviderKeys || {},
          snap.aiConfig.savedProviderModels || {}
        );
      } catch {
        // Ignore storage errors during unload
      }

      if (purgeCache) {
        purgeBrowserRuntimeCaches();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const snap = latestWorkspaceRef.current;
      flushForceSaveOnClose(true);
      if (snap.isDirty) {
        e.preventDefault();
        e.returnValue =
          'You have unsaved changes in TavernSmith. Save & Sync before exiting?';
        return e.returnValue;
      }
    };

    const handlePageHide = () => {
      flushForceSaveOnClose(true);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushForceSaveOnClose(false);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [writeFilesToNativeDirectory]);

  useEffect(() => {
    if (!settings.autoSaveEnabled) return;
    const intervalMs = Math.max(5, settings.autoSaveIntervalSec) * 1000;

    const timerId = window.setInterval(() => {
      saveNow('autosave');
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [settings.autoSaveEnabled, settings.autoSaveIntervalSec, saveNow]);

  const importFromFiles = useCallback(
    async (
      files: FileList | File[]
    ): Promise<{ count: number; summary: string }> => {
      const list = Array.from(files);
      let importedChars = 0;
      let importedBooks = 0;
      let lastCharId: string | null = null;
      let lastBookId: string | null = null;

      for (const file of list) {
        if (file.name === META_FILENAME) {
          try {
            const text = await file.text();
            const parsedMeta = JSON.parse(text) as Partial<TavernSmithMetaPayload>;
            if (Array.isArray(parsedMeta.tags) && parsedMeta.tags.length > 0) {
              setTags((prev) => {
                const byName = new Map(
                  prev.map((t) => [t.name.toLowerCase(), t])
                );
                for (const incoming of parsedMeta.tags!) {
                  if (incoming?.name) {
                    byName.set(incoming.name.toLowerCase(), incoming);
                  }
                }
                return mergeWithDefaultTags(Array.from(byName.values()));
              });
            }
            if (
              Array.isArray(parsedMeta.contextThemes) &&
              parsedMeta.contextThemes.length > 0
            ) {
              setThemes((prev) => {
                const byName = new Map(
                  prev.map((t) => [t.name.toLowerCase(), t])
                );
                for (const incoming of parsedMeta.contextThemes!) {
                  if (incoming?.name) {
                    byName.set(incoming.name.toLowerCase(), incoming);
                  }
                }
                return Array.from(byName.values());
              });
            }
          } catch {
            // Ignore malformed meta file
          }
          continue;
        }

        const result = await importCardFromFile(file);
        if (result.kind === 'character') {
          result.character.isNsfw = isCharacterNsfw(result.character, tags);
          setCharacters((prev) => {
            const conflict = prev.some(
              (c) =>
                c.id !== result.character.id &&
                (c.name || '').trim().toLowerCase() ===
                  (result.character.name || '').trim().toLowerCase()
            );
            if (conflict) {
              const allNames = prev.map((c) => c.name || 'Untitled');
              window.setTimeout(() => {
                setNameConflictRequest({
                  kind: 'character',
                  itemId: result.character.id!,
                  conflictingName: result.character.name,
                  suggestedNames: buildSuggestedUniqueNames(
                    result.character.name,
                    allNames
                  ),
                  sourceAction: 'import',
                });
              }, 0);
            }
            return [result.character, ...prev];
          });
          lastCharId = result.character.id!;
          importedChars++;
          if (result.embeddedLorebook) {
            const book = result.embeddedLorebook;
            book.isNsfw = isLorebookNsfw(book, tags);
            setLorebooks((prev) => [book, ...prev]);
            lastBookId = book.id!;
            importedBooks++;
          }
        } else if (result.kind === 'lorebook') {
          result.lorebook.isNsfw = isLorebookNsfw(result.lorebook, tags);
          setLorebooks((prev) => {
            const conflict = prev.some(
              (l) =>
                l.id !== result.lorebook.id &&
                (l.name || '').trim().toLowerCase() ===
                  (result.lorebook.name || '').trim().toLowerCase()
            );
            if (conflict) {
              const allNames = prev.map((l) => l.name || 'Untitled Lorebook');
              window.setTimeout(() => {
                setNameConflictRequest({
                  kind: 'lorebook',
                  itemId: result.lorebook.id!,
                  conflictingName: result.lorebook.name,
                  suggestedNames: buildSuggestedUniqueNames(
                    result.lorebook.name,
                    allNames
                  ),
                  sourceAction: 'import',
                });
              }, 0);
            }
            return [result.lorebook, ...prev];
          });
          lastBookId = result.lorebook.id!;
          importedBooks++;
        }
      }

      if (lastCharId) {
        setActiveCharacterId(lastCharId);
      } else if (lastBookId) {
        setActiveLorebookId(lastBookId);
      }

      const parts: string[] = [];
      if (importedChars > 0) {
        parts.push(
          `${importedChars} character${importedChars === 1 ? '' : 's'} (saved to Characters/)`
        );
      }
      if (importedBooks > 0) {
        parts.push(
          `${importedBooks} lorebook${importedBooks === 1 ? '' : 's'} (saved to Lorebooks/)`
        );
      }

      return {
        count: importedChars + importedBooks,
        summary:
          parts.length > 0
            ? `Imported ${parts.join(' and ')}.`
            : 'Restored metadata or no new card files found.',
      };
    },
    [tags]
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
    safeLocalStorageRemove(PREFERENCES_STORAGE_KEY);
    safeLocalStorageRemove(SAVE_FOLDER_FILES_STORAGE_KEY);
    for (const oldKey of LEGACY_STORAGE_KEYS) {
      safeLocalStorageRemove(oldKey);
    }
    purgeBrowserRuntimeCaches();
    void clearDirectoryHandleFromIndexedDB();
    nativeDirHandleRef.current = null;
    pendingReconnectRecordRef.current = null;
    setNativeDirectoryName(null);
    setPendingReconnectFolderName(null);
    setCharacters([]);
    setActiveCharacterId('');
    setLorebooks([]);
    setActiveLorebookId('');
    setThemes(DEFAULT_CONTEXT_THEMES);
    setTags(mergeWithDefaultTags([]));
    // Preserve saved provider API keys across workspace resets so users never lose keys!
    const creds = loadPersistedProviderCredentials();
    setAiConfigState({
      ...DEFAULT_AI_CONFIG,
      savedProviderKeys: creds.savedProviderKeys,
      savedProviderModels: creds.savedProviderModels,
    });
    setSettings(DEFAULT_SETTINGS);
    const nowDisplay = formatSafeTimestamp(new Date().toISOString());
    setSaveLogs([
      {
        id: `log-reset-${Date.now()}`,
        timestamp: nowDisplay,
        mode: 'manual',
        folderPath: UNIFIED_INTERNAL_ROOT,
        filesWritten: [META_FILENAME],
        nativeSynced: false,
      },
    ]);
    setLastSavedAt(nowDisplay);
    setIsDirty(false);
  }, []);

  const storageBytesUsed = useMemo(() => {
    try {
      const rawPrefs = safeLocalStorageGet(PREFERENCES_STORAGE_KEY) || '';
      const rawFiles = safeLocalStorageGet(SAVE_FOLDER_FILES_STORAGE_KEY) || '';
      const localBytes = new Blob([rawPrefs, rawFiles]).size;
      const filesBytes = savedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
      return Math.max(localBytes, filesBytes);
    } catch {
      return savedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
    }
  }, [savedFiles]);

  const tokenBreakdown = useMemo(
    () =>
      calculateCardTokenBreakdown(
        character,
        character.character_book || lorebook,
        statBlock
      ),
    [character, lorebook, statBlock]
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
      activeTheme,
      setActiveThemeId,
      tags,
      setTags,
      ensureTagRegistered,
      nameConflictRequest,
      checkAndTriggerNameConflict,
      resolveNameConflict,
      dismissNameConflict,
      aiConfig,
      setAiConfig,
      switchAIPreset,
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
      saveLogs,
      nativeDirectoryName,
      pendingReconnectFolderName,
      isSyncingFolder,
      selectNativeSaveFolder,
      reconnectNativeSaveFolder,
      scanAndLoadSaveFolder,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      exportSaveFolderBundle,
      storageBytesUsed,
      importFromFiles,
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
      activeTheme,
      setActiveThemeId,
      tags,
      ensureTagRegistered,
      nameConflictRequest,
      checkAndTriggerNameConflict,
      resolveNameConflict,
      dismissNameConflict,
      aiConfig,
      setAiConfig,
      switchAIPreset,
      settings,
      updateSettings,
      tokenBreakdown,
      lastSavedAt,
      isDirty,
      saveNow,
      saveAndSyncNow,
      resetWorkspaceToDefaults,
      savedFiles,
      saveLogs,
      nativeDirectoryName,
      pendingReconnectFolderName,
      isSyncingFolder,
      selectNativeSaveFolder,
      reconnectNativeSaveFolder,
      scanAndLoadSaveFolder,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      exportSaveFolderBundle,
      storageBytesUsed,
      importFromFiles,
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
