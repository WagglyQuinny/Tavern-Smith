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
  SavedFileEntry,
  SaveLogEntry,
  StatBlockConfig,
  SubTagDefinition,
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

const STORAGE_KEY = 'tavernsmith_store_v2';
const PROVIDER_CREDENTIALS_STORAGE_KEY = 'tavernsmith_provider_credentials_v1';
const LEGACY_STORAGE_KEYS = [
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
  subTags?: SubTagDefinition[]
): TagDefinition {
  return {
    id,
    name,
    color,
    category,
    isNsfw,
    subTags: subTags || [],
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
    'tag-musk-sweat-heavy-pheromones',
    'Musk / Sweat / Heavy Pheromones',
    '#d97706',
    'Extreme & Hentai Physics',
    'Intense olfactory focus: thick arousal scent, steamy post-exertion sweat, intoxicating pheromones, and skin-licking.',
    true
  ),
  createBuiltInTag(
    'tag-watersports-omorashi',
    'Watersports / Omorashi',
    '#eab308',
    'Extreme & Hentai Physics',
    'Loss of bladder control from overwhelming overstimulation, desperation, or explicit watersports kink.',
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
  createBuiltInTag(
    'tag-foot-armpit-worship',
    'Foot / Armpit Worship',
    '#fb923c',
    'Extreme & Hentai Physics',
    'Dedicated focus on kissing, licking, smelling, and servicing bare soles, toes, or glistening underarms.',
    true
  ),
];

export const DEFAULT_TAG_LIBRARY: TagDefinition[] = DEFAULT_TAGS;

/**
 * Merges any missing built-in tags from `DEFAULT_TAGS` by `name` (case-insensitive)
 * into an existing persisted tag array AND backfills `isNsfw` and `subTags` on built-in tags
 * so newly added sub-tags and NSFW classifications appear automatically without wiping user edits.
 */
export function mergeWithDefaultTags(
  existingTags?: TagDefinition[] | null
): TagDefinition[] {
  if (!Array.isArray(existingTags) || existingTags.length === 0) {
    return DEFAULT_TAGS;
  }

  const builtInByName = new Map(
    DEFAULT_TAGS.map((b) => [b.name.trim().toLowerCase(), b])
  );

  const merged: TagDefinition[] = existingTags
    .filter((t) => t && typeof t.name === 'string')
    .map((existing) => {
      const key = existing.name.trim().toLowerCase();
      const builtIn = builtInByName.get(key);
      if (!builtIn) {
        return {
          ...existing,
          isNsfw:
            existing.isNsfw !== undefined
              ? existing.isNsfw
              : existing.category === 'NSFW & Kinks' ||
                existing.category === 'Extreme & Hentai Physics',
          subTags: Array.isArray(existing.subTags) ? existing.subTags : [],
        };
      }
      return {
        ...existing,
        isNsfw:
          existing.isNsfw !== undefined ? existing.isNsfw : builtIn.isNsfw,
        subTags:
          Array.isArray(existing.subTags) && existing.subTags.length > 0
            ? existing.subTags
            : builtIn.subTags || [],
      };
    });

  const seenNames = new Set(merged.map((t) => t.name.trim().toLowerCase()));
  for (const builtIn of DEFAULT_TAGS) {
    const key = builtIn.name.trim().toLowerCase();
    if (!seenNames.has(key)) {
      merged.push(builtIn);
      seenNames.add(key);
    }
  }
  return merged;
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
  preset: 'lmstudio',
  url: 'http://localhost:1234/v1',
  apiKey: '',
  modelName: 'gemma-4-27b-it',
  compatibilityFormat: 'auto',
  temperature: 0.78,
  maxTokens: 512,
  ghostTextEnabled: true,
  debounceMs: 650,
  availableModels: [],
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
 * Loads and merges per-provider credentials (`savedProviderKeys` and `savedProviderModels`)
 * from dedicated `localStorage` so switching between providers never loses an API key.
 */
function loadPersistedProviderCredentials(): {
  savedProviderKeys: Record<string, string>;
  savedProviderModels: Record<string, string>;
} {
  try {
    const raw = safeLocalStorageGet(PROVIDER_CREDENTIALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        savedProviderKeys:
          parsed && typeof parsed.savedProviderKeys === 'object'
            ? { ...parsed.savedProviderKeys }
            : {},
        savedProviderModels:
          parsed && typeof parsed.savedProviderModels === 'object'
            ? { ...parsed.savedProviderModels }
            : {},
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { savedProviderKeys: {}, savedProviderModels: {} };
}

function savePersistedProviderCredentials(
  savedProviderKeys: Record<string, string>,
  savedProviderModels: Record<string, string>
): void {
  safeLocalStorageSet(
    PROVIDER_CREDENTIALS_STORAGE_KEY,
    JSON.stringify({ savedProviderKeys, savedProviderModels })
  );
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
        name: lb.name,
        description: lb.description,
        scan_depth: lb.scan_depth,
        token_budget: lb.token_budget,
        recursive_scanning: lb.recursive_scanning,
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

  // 3. Root _tavernsmith_meta.json
  const metaPayload: TavernSmithMetaPayload = {
    schema: 'tavernsmith_meta_v1',
    updatedAt: nowIso,
    activeThemeId,
    contextThemes: themes,
    tags,
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

interface PersistedWorkspaceState {
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
  addSubTagToTag: (
    parentTagId: string,
    subTagName: string,
    subTagAiDescription: string
  ) => void;
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

function loadInitialState(): PersistedWorkspaceState {
  const nowIso = new Date().toISOString();
  const nowDisplay = formatSafeTimestamp(nowIso);
  const dedicatedCreds = loadPersistedProviderCredentials();

  try {
    for (const oldKey of LEGACY_STORAGE_KEYS) {
      safeLocalStorageRemove(oldKey);
    }

    const raw = safeLocalStorageGet(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceState>;
      const characters = Array.isArray(parsed.characters)
        ? parsed.characters
        : [];
      const lorebooks = Array.isArray(parsed.lorebooks) ? parsed.lorebooks : [];
      const themes =
        Array.isArray(parsed.themes) && parsed.themes.length > 0
          ? parsed.themes
          : DEFAULT_CONTEXT_THEMES;
      const tags = mergeWithDefaultTags(parsed.tags);

      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings || {}),
        activeSaveFolder: UNIFIED_INTERNAL_ROOT,
        availableSaveFolders: [UNIFIED_INTERNAL_ROOT],
        mainSidebarOpen:
          parsed.settings?.mainSidebarOpen !== undefined
            ? parsed.settings.mainSidebarOpen
            : true,
        hideNsfwTags: Boolean(parsed.settings?.hideNsfwTags),
      };
      if (!themes.some((t) => t.id === settings.activeThemeId)) {
        settings.activeThemeId = themes[0].id;
      }

      const activeCharacterId =
        parsed.activeCharacterId &&
        characters.some((c) => c.id === parsed.activeCharacterId)
          ? parsed.activeCharacterId
          : characters[0]?.id || '';

      const activeLorebookId =
        parsed.activeLorebookId &&
        lorebooks.some((l) => l.id === parsed.activeLorebookId)
          ? parsed.activeLorebookId
          : lorebooks[0]?.id || '';

      const mergedProviderKeys: Record<string, string> = {
        ...dedicatedCreds.savedProviderKeys,
        ...(parsed.aiConfig?.savedProviderKeys || {}),
      };
      const mergedProviderModels: Record<string, string> = {
        ...dedicatedCreds.savedProviderModels,
        ...(parsed.aiConfig?.savedProviderModels || {}),
      };

      const activePreset = parsed.aiConfig?.preset || DEFAULT_AI_CONFIG.preset;
      const activeProviderKey = getProviderKeyId(activePreset);
      const currentApiKey =
        parsed.aiConfig?.apiKey ||
        mergedProviderKeys[activeProviderKey] ||
        mergedProviderKeys[activePreset] ||
        '';
      const currentModelName =
        parsed.aiConfig?.modelName ||
        mergedProviderModels[activeProviderKey] ||
        mergedProviderModels[activePreset] ||
        DEFAULT_AI_CONFIG.modelName;

      if (currentApiKey) {
        mergedProviderKeys[activeProviderKey] = currentApiKey;
        mergedProviderKeys[activePreset] = currentApiKey;
      }
      if (currentModelName) {
        mergedProviderModels[activeProviderKey] = currentModelName;
        mergedProviderModels[activePreset] = currentModelName;
      }

      const hydratedAiConfig: AIBackendConfig = {
        ...DEFAULT_AI_CONFIG,
        ...(parsed.aiConfig || {}),
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
        saveLogs: Array.isArray(parsed.saveLogs) ? parsed.saveLogs : [],
        lastSavedAt: parsed.lastSavedAt || nowDisplay,
      };
    }
  } catch {
    // Fallback to clean defaults if storage is corrupted or blocked
  }

  const initialFiles = buildUnifiedSavedFiles(
    [],
    [],
    DEFAULT_CONTEXT_THEMES,
    DEFAULT_TAGS,
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
    tags: DEFAULT_TAGS,
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
        if (t && t.trim() && !t.includes(':')) referencedTagNames.add(t.trim());
      }
    }
    for (const lb of lorebooks) {
      for (const t of lb.tags || []) {
        if (t && t.trim() && !t.includes(':')) referencedTagNames.add(t.trim());
      }
      for (const entry of lb.entries || []) {
        for (const t of entry.tags || []) {
          if (t && t.trim() && !t.includes(':'))
            referencedTagNames.add(t.trim());
        }
      }
    }
    for (const theme of themes) {
      for (const t of theme.associatedTags || []) {
        if (t && t.trim() && !t.includes(':')) referencedTagNames.add(t.trim());
      }
    }

    setTags((prevTags) => {
      const existingLower = new Set(
        prevTags.map((t) => t.name.trim().toLowerCase())
      );
      for (const pt of prevTags) {
        for (const sub of pt.subTags || []) {
          existingLower.add(sub.name.trim().toLowerCase());
          existingLower.add(`${pt.name}: ${sub.name}`.toLowerCase());
        }
      }
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
            category: 'custom',
            isNsfw: false,
            subTags: [],
            aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${rawName}".`,
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
      category: TagDefinition['category'] = 'custom'
    ): TagDefinition | null => {
      const clean = rawTagName.trim();
      if (!clean) return null;

      // If it's a sub-tag reference ("Parent: Sub"), return the parent tag if found
      if (clean.includes(':')) {
        const parentPart = clean.split(':')[0].trim().toLowerCase();
        const parentFound = tags.find(
          (t) => t.name.trim().toLowerCase() === parentPart
        );
        if (parentFound) return parentFound;
      }

      const found = tags.find(
        (t) => t.name.trim().toLowerCase() === clean.toLowerCase()
      );
      if (found) return found;

      const color =
        AUTO_TAG_PALETTE[tags.length % AUTO_TAG_PALETTE.length] || '#a855f7';
      const newTag: TagDefinition = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        color,
        category,
        isNsfw:
          category === 'NSFW & Kinks' ||
          category === 'Extreme & Hentai Physics',
        subTags: [],
        aiContextDescription: `Incorporate thematic, tonal, and character elements consistent with "${clean}".`,
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

  const addSubTagToTag = useCallback(
    (parentTagId: string, subTagName: string, subTagAiDescription: string) => {
      const cleanName = subTagName.trim();
      if (!cleanName) return;
      const cleanDesc =
        subTagAiDescription.trim() ||
        `Emphasize ${cleanName} details and nuances.`;

      setTags((prev) =>
        prev.map((t) => {
          if (t.id !== parentTagId) return t;
          const existingSubs = Array.isArray(t.subTags) ? t.subTags : [];
          if (
            existingSubs.some(
              (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()
            )
          ) {
            return t;
          }
          const newSub: SubTagDefinition = {
            id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: cleanName,
            aiDescription: cleanDesc,
          };
          return {
            ...t,
            subTags: [...existingSubs, newSub],
          };
        })
      );
    },
    []
  );

  const setCharacter: React.Dispatch<React.SetStateAction<CharacterCardData>> =
    useCallback(
      (updater) => {
        setCharacters((prev) => {
          if (prev.length === 0) {
            const freshBase = createBlankCharacter();
            const next =
              typeof updater === 'function' ? updater(freshBase) : updater;
            const created: CharacterCardData = {
              ...next,
              id: freshBase.id,
              modification_date: Math.floor(Date.now() / 1000),
            };
            setActiveCharacterId(created.id!);
            return [created];
          }
          return prev.map((c) => {
            if (c.id !== character.id) return c;
            const next = typeof updater === 'function' ? updater(c) : updater;
            return {
              ...next,
              id: c.id,
              modification_date: Math.floor(Date.now() / 1000),
            };
          });
        });
      },
      [character.id]
    );

  const updateCharacterField = useCallback(
    <K extends keyof CharacterCardData>(
      field: K,
      value: CharacterCardData[K]
    ) => {
      setCharacter((prev) => ({
        ...prev,
        [field]: value,
        modification_date: Math.floor(Date.now() / 1000),
      }));
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
        setLorebooks((prev) => {
          if (prev.length === 0) {
            const freshBase = createBlankLorebook();
            const next =
              typeof updater === 'function' ? updater(freshBase) : updater;
            const created: Lorebook = {
              ...next,
              id: freshBase.id,
              modification_date: Math.floor(Date.now() / 1000),
            };
            setActiveLorebookId(created.id!);
            return [created];
          }
          return prev.map((l) => {
            if (l.id !== lorebook.id) return l;
            const next = typeof updater === 'function' ? updater(l) : updater;
            return {
              ...next,
              id: l.id,
              modification_date: Math.floor(Date.now() / 1000),
            };
          });
        });
      },
      [lorebook.id]
    );

  const createNewCharacter = useCallback(
    (partial?: Partial<CharacterCardData>) => {
      const fresh = createBlankCharacter(partial);
      setCharacters((prev) => [fresh, ...prev]);
      setActiveCharacterId(fresh.id!);
      return fresh.id!;
    },
    []
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

  const createNewLorebook = useCallback((partial?: Partial<Lorebook>) => {
    const fresh = createBlankLorebook(partial);
    setLorebooks((prev) => [fresh, ...prev]);
    setActiveLorebookId(fresh.id!);
    return fresh.id!;
  }, []);

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
            loadedCharacters.push(parsedAsset.character);
            if (parsedAsset.embeddedLorebook) {
              loadedLorebooks.push(parsedAsset.embeddedLorebook);
            }
            syncedFileNames.push(`${subfolderPrefix}${entryName}`);
          } else if (parsedAsset.kind === 'lorebook') {
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
              const mapByName = new Map<string, TagDefinition>();
              for (const t of prevTags) {
                mapByName.set(t.name.trim().toLowerCase(), t);
              }
              for (const incoming of metaSnapshot.tags) {
                if (incoming && incoming.name) {
                  const key = incoming.name.trim().toLowerCase();
                  const existing = mapByName.get(key);
                  mapByName.set(key, {
                    ...existing,
                    ...incoming,
                    id: existing?.id || incoming.id || `tag-${Date.now()}`,
                  });
                }
              }
              return mergeWithDefaultTags(Array.from(mapByName.values()));
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
                nextList[idx] = {
                  ...nextList[idx],
                  ...incoming,
                  id: nextList[idx].id,
                  avatar: incoming.avatar || nextList[idx].avatar,
                };
              } else {
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
                nextList[idx] = {
                  ...nextList[idx],
                  ...incoming,
                  id: nextList[idx].id,
                };
              } else {
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
            `${m.tags.length} tags & ${m.contextThemes.length} themes (${META_FILENAME})`
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
    []
  );

  // On App Launch: Safely check IndexedDB for persisted Local PC FileSystemDirectoryHandle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
    [characters, lorebooks]
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
      const nowIso = new Date().toISOString();
      const displayTime = formatSafeTimestamp(nowIso);
      const rootFolderDisplay = nativeDirectoryName
        ? `/${nativeDirectoryName}/`
        : UNIFIED_INTERNAL_ROOT;

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

      setSaveLogs((prev) => [newLog, ...prev.slice(0, 19)]);

      if (nativeDirHandleRef.current) {
        const rootHandle = nativeDirHandleRef.current;
        (async () => {
          try {
            const charsDirHandle = await rootHandle.getDirectoryHandle(
              'Characters',
              { create: true }
            );
            const loreDirHandle = await rootHandle.getDirectoryHandle(
              'Lorebooks',
              { create: true }
            );

            for (const c of characters) {
              const cFileName = `${sanitizeFilename(c.name)}.json`;
              const cContent = JSON.stringify(
                serializeCharacterCard(
                  c,
                  settings.cardSpecVersion,
                  c.character_book || lorebook
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

            for (const lb of lorebooks) {
              const lFileName = `${sanitizeFilename(lb.name)}.json`;
              const lContent = JSON.stringify(
                {
                  name: lb.name,
                  description: lb.description,
                  scan_depth: lb.scan_depth,
                  token_budget: lb.token_budget,
                  recursive_scanning: lb.recursive_scanning,
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
              activeThemeId: settings.activeThemeId,
              contextThemes: themes,
              tags,
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
        })();
      }

      setLastSavedAt(displayTime);
      setIsDirty(false);
    },
    [
      characters,
      lorebooks,
      lorebook,
      themes,
      tags,
      nativeDirectoryName,
      settings.activeThemeId,
      settings.cardSpecVersion,
    ]
  );

  // Sync full state snapshot to localStorage whenever state updates
  useEffect(() => {
    const payload: PersistedWorkspaceState = {
      characters,
      activeCharacterId,
      lorebooks,
      activeLorebookId,
      themes,
      tags,
      aiConfig,
      settings,
      savedFiles,
      saveLogs,
      lastSavedAt,
    };

    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(payload));
  }, [
    characters,
    activeCharacterId,
    lorebooks,
    activeLorebookId,
    themes,
    tags,
    aiConfig,
    settings,
    savedFiles,
    saveLogs,
    lastSavedAt,
  ]);

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
          setCharacters((prev) => [result.character, ...prev]);
          lastCharId = result.character.id!;
          importedChars++;
          if (result.embeddedLorebook) {
            const book = result.embeddedLorebook;
            setLorebooks((prev) => [book, ...prev]);
            lastBookId = book.id!;
            importedBooks++;
          }
        } else if (result.kind === 'lorebook') {
          setLorebooks((prev) => [result.lorebook, ...prev]);
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
    safeLocalStorageRemove(STORAGE_KEY);
    for (const oldKey of LEGACY_STORAGE_KEYS) {
      safeLocalStorageRemove(oldKey);
    }
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
    setTags(DEFAULT_TAGS);
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
      const raw = safeLocalStorageGet(STORAGE_KEY) || '';
      const localBytes = new Blob([raw]).size;
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
      addSubTagToTag,
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
      addSubTagToTag,
      aiConfig,
      setAiConfig,
      switchAIPreset,
      settings,
      updateSettings,
      tokenBreakdown,
      lastSavedAt,
      isDirty,
      saveNow,
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
