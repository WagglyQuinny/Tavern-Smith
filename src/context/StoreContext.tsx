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
  DiskStateResponse,
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
  normalizeLorebookObject,
  parseImportedJsonString,
  sanitizeFilename,
  serializeCharacterCard,
  serializeLorebookCard,
  triggerBrowserDownload,
} from '../utils/cardIO';
import { AI_BACKEND_PRESETS, getProviderKeyId } from '../services/aiService';
import {
  decryptProviderKeysFromVault,
  encryptAndSaveProviderKeys,
  getInMemoryDecryptedKeys,
  loadProviderModelsMap,
  readEncryptedVaultEnvelope,
  registerVaultDiskFlushCallback,
  saveProviderModelsMap,
  VAULT_FILENAME,
} from '../utils/cryptoVault';

export { VAULT_FILENAME };
export const META_FILENAME = '_tavernsmith_meta.json';
export const UNIFIED_INTERNAL_ROOT = './Saves/';

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
    modelsMap[prevProviderId] = prev.modelName;
    modelsMap[prev.preset] = prev.modelName;
  }

  const nextProviderId = getProviderKeyId(next.preset);
  const presetMeta = AI_BACKEND_PRESETS.find((p) => p.id === next.preset);

  if (next.preset !== prev.preset) {
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

  for (const lb of lorebooks) {
    const fileName = `${sanitizeFilename(lb.name)}.json`;
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
  exportSaveFolderBundle: (folderPath?: string) => void;
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

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('character');
  const [characters, setCharacters] = useState<CharacterCardData[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string>('');
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [activeLorebookId, setActiveLorebookId] = useState<string>('');
  const [themes, setThemes] = useState<ContextTheme[]>(DEFAULT_CONTEXT_THEMES);
  const [tags, setTags] = useState<TagDefinition[]>(() =>
    mergeWithDefaultTags([])
  );
  const [aiConfigState, setAiConfigState] =
    useState<AIBackendConfig>(DEFAULT_AI_CONFIG);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [diskFiles, setDiskFiles] = useState<SavedFileEntry[]>([]);
  const [diskResolvedPath, setDiskResolvedPath] =
    useState<string>('./Saves/');

  // Track the exact on-disk `.json` filename for each Character ID and Lorebook ID
  // so renaming a Character or Lorebook deletes `oldFileName` before writing the new file.
  const charDiskFileNamesRef = useRef<Map<string, string>>(new Map());
  const loreDiskFileNamesRef = useRef<Map<string, string>>(new Map());
  const initialDiskHydrationDoneRef = useRef<boolean>(false);

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

  /**
   * Hydrates React state from the server's `/api/disk/*` response (`DiskStateResponse`),
   * strictly mapping `./Saves/Characters/*.json` -> `characters[]` and `./Saves/Lorebooks/*.json` -> `lorebooks[]`.
   */
  const applyDiskStateToWorkspace = useCallback(
    async (
      diskState: DiskStateResponse,
      options?: { isInitialMount?: boolean }
    ) => {
      if (!diskState || !diskState.ok) return;

      if (diskState.resolvedPath || diskState.diskRoot) {
        setDiskResolvedPath(diskState.resolvedPath || diskState.diskRoot);
      }

      if (Array.isArray(diskState.files)) {
        setDiskFiles(diskState.files);
      }

      // 1. Reconstruct Tags & Themes from `./Saves/_tavernsmith_meta.json`
      let mergedTags = mergeWithDefaultTags(
        extractCustomUserTags(latestWorkspaceRef.current.tags)
      );

      if (diskState.meta && typeof diskState.meta === 'object') {
        const meta = diskState.meta;

        if (Array.isArray(meta.tags)) {
          mergedTags = mergeWithDefaultTags(extractCustomUserTags(meta.tags));
          setTags(mergedTags);
        }

        if (
          Array.isArray(meta.contextThemes) &&
          meta.contextThemes.length > 0
        ) {
          const mapByName = new Map<string, ContextTheme>();
          for (const t of DEFAULT_CONTEXT_THEMES) {
            mapByName.set(t.name.trim().toLowerCase(), t);
          }
          for (const incoming of meta.contextThemes) {
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
          setThemes(Array.from(mapByName.values()));
        }

        if (options?.isInitialMount && meta.settings) {
          setSettings((prev) => ({
            ...prev,
            ...meta.settings,
            activeThemeId:
              meta.activeThemeId ||
              meta.settings?.activeThemeId ||
              prev.activeThemeId,
            activeSaveFolder:
              meta.settings?.activeSaveFolder || UNIFIED_INTERNAL_ROOT,
          }));
        } else if (meta.activeThemeId && options?.isInitialMount) {
          setSettings((prev) => ({
            ...prev,
            activeThemeId: meta.activeThemeId,
          }));
        }

        if (options?.isInitialMount && meta.aiConfig) {
          const incomingAi = meta.aiConfig;
          if (
            incomingAi.savedProviderModels &&
            typeof incomingAi.savedProviderModels === 'object'
          ) {
            saveProviderModelsMap(incomingAi.savedProviderModels);
          }
          setAiConfigState((prev) => ({
            ...prev,
            ...incomingAi,
            apiKey: prev.apiKey,
            savedProviderKeys: prev.savedProviderKeys,
          }));
        }
      }

      // 2. Parse `./Saves/Characters/*.json` strictly as `characters[]`
      const nextCharFileNames = new Map<string, string>();
      const parsedCharacters: CharacterCardData[] = [];
      if (Array.isArray(diskState.characters)) {
        for (const rawCharObj of diskState.characters) {
          if (!rawCharObj || typeof rawCharObj !== 'object') continue;
          if (rawCharObj._tavernsmithType === 'lorebook') continue;
          try {
            const diskFileName =
              typeof rawCharObj._diskFileName === 'string'
                ? rawCharObj._diskFileName
                : 'Character.json';
            const parsedRes = parseImportedJsonString(
              JSON.stringify(rawCharObj),
              undefined,
              diskFileName,
              'character'
            );
            if (parsedRes.kind === 'character') {
              parsedRes.character.isNsfw = isCharacterNsfw(
                parsedRes.character,
                mergedTags
              );
              parsedCharacters.push(parsedRes.character);
              if (parsedRes.character.id) {
                nextCharFileNames.set(parsedRes.character.id, diskFileName);
              }
            }
          } catch {
            // Skip malformed character JSON
          }
        }
      }
      charDiskFileNamesRef.current = nextCharFileNames;
      setCharacters(parsedCharacters);
      setActiveCharacterId((prevId) => {
        if (prevId && parsedCharacters.some((c) => c.id === prevId)) {
          return prevId;
        }
        if (
          options?.isInitialMount &&
          diskState.meta?.activeCharacterId &&
          parsedCharacters.some(
            (c) => c.id === diskState.meta?.activeCharacterId
          )
        ) {
          return diskState.meta.activeCharacterId;
        }
        return parsedCharacters[0]?.id || '';
      });

      // 3. Parse `./Saves/Lorebooks/*.json` strictly as `lorebooks[]`
      const nextLoreFileNames = new Map<string, string>();
      const parsedLorebooks: Lorebook[] = [];
      if (Array.isArray(diskState.lorebooks)) {
        for (const rawLoreObj of diskState.lorebooks) {
          if (!rawLoreObj || typeof rawLoreObj !== 'object') continue;
          if (rawLoreObj._tavernsmithType === 'character') continue;
          try {
            const diskFileName =
              typeof rawLoreObj._diskFileName === 'string'
                ? rawLoreObj._diskFileName
                : 'Lorebook.json';
            const fallbackTitle = diskFileName.replace(/\.json$/i, '');
            const normalizedBook = normalizeLorebookObject(
              rawLoreObj,
              fallbackTitle
            );
            normalizedBook.isNsfw = isLorebookNsfw(normalizedBook, mergedTags);
            parsedLorebooks.push(normalizedBook);
            if (normalizedBook.id) {
              nextLoreFileNames.set(normalizedBook.id, diskFileName);
            }
          } catch {
            // Skip malformed lorebook JSON
          }
        }
      }
      loreDiskFileNamesRef.current = nextLoreFileNames;
      setLorebooks(parsedLorebooks);
      setActiveLorebookId((prevId) => {
        if (prevId && parsedLorebooks.some((l) => l.id === prevId)) {
          return prevId;
        }
        if (
          options?.isInitialMount &&
          diskState.meta?.activeLorebookId &&
          parsedLorebooks.some(
            (l) => l.id === diskState.meta?.activeLorebookId
          )
        ) {
          return diskState.meta.activeLorebookId;
        }
        return parsedLorebooks[0]?.id || '';
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
              return {
                ...prev,
                apiKey: restoredActiveKey,
                savedProviderKeys: mergedKeys,
              };
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

  // Auto-Scan `./Saves/` on App Startup
  useEffect(() => {
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
          setIsDirty(false);
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
      void fetch('/api/disk/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault: envelope,
          customSavePath: latestWorkspaceRef.current.settings.activeSaveFolder,
        }),
      })
        .then((r) => r.json())
        .then((diskState: DiskStateResponse) => {
          if (diskState && diskState.ok && Array.isArray(diskState.files)) {
            setDiskFiles(diskState.files);
          }
        })
        .catch(() => {
          // Ignore transient network error
        });
    });
    return () => {
      registerVaultDiskFlushCallback(null);
    };
  }, []);

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

  // Real Disk Delete & Auto-Rescan for Character (`POST /api/disk/delete`)
  const deleteCharacter = useCallback(
    (id: string) => {
      const target = characters.find((c) => c.id === id);
      const diskFileName =
        charDiskFileNamesRef.current.get(id) ||
        (target ? `${sanitizeFilename(target.name)}.json` : '');
      charDiskFileNamesRef.current.delete(id);

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

      if (diskFileName) {
        void fetch('/api/disk/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folder: 'Characters',
            fileName: diskFileName,
            customSavePath: settings.activeSaveFolder,
          }),
        })
          .then((r) => r.json())
          .then((diskState: DiskStateResponse) => {
            if (diskState && diskState.ok) {
              void applyDiskStateToWorkspace(diskState);
            }
          })
          .catch(() => {
            // Ignore transient network error
          });
      }
    },
    [
      characters,
      activeCharacterId,
      settings.activeSaveFolder,
      applyDiskStateToWorkspace,
    ]
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

  // Real Disk Delete & Auto-Rescan for Lorebook (`POST /api/disk/delete`)
  const deleteLorebook = useCallback(
    (id: string) => {
      const target = lorebooks.find((l) => l.id === id);
      const diskFileName =
        loreDiskFileNamesRef.current.get(id) ||
        (target ? `${sanitizeFilename(target.name)}.json` : '');
      loreDiskFileNamesRef.current.delete(id);

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

      if (diskFileName) {
        void fetch('/api/disk/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folder: 'Lorebooks',
            fileName: diskFileName,
            customSavePath: settings.activeSaveFolder,
          }),
        })
          .then((r) => r.json())
          .then((diskState: DiskStateResponse) => {
            if (diskState && diskState.ok) {
              void applyDiskStateToWorkspace(diskState);
            }
          })
          .catch(() => {
            // Ignore transient network error
          });
      }
    },
    [
      lorebooks,
      activeLorebookId,
      settings.activeSaveFolder,
      applyDiskStateToWorkspace,
    ]
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
   * Executes a direct disk save (`POST /api/disk/save`) writing:
   * - Characters strictly to `./Saves/Characters/[SanitizedName].json` (deleting `oldFileName` if renamed)
   * - Lorebooks strictly to `./Saves/Lorebooks/[SanitizedName].json` (deleting `oldFileName` if renamed)
   * - Tags, themes, and app settings to `./Saves/_tavernsmith_meta.json`
   * - AES-256-GCM encrypted API keys to `./Saves/_tavernsmith_vault.enc`
   * And immediately re-scans `./Saves/` in one atomic round-trip!
   */
  const executeDiskSaveAndRescan = useCallback(
    async (
      mode: 'manual' | 'autosave' = 'manual',
      overrideState?: {
        characters?: CharacterCardData[];
        lorebooks?: Lorebook[];
      }
    ): Promise<{ ok: boolean; message: string }> => {
      const snap = latestWorkspaceRef.current;
      const charsToSave = overrideState?.characters ?? snap.characters;
      const booksToSave = overrideState?.lorebooks ?? snap.lorebooks;

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

      const characterPayloads = charsToSave.map((c) => {
        const fileName = `${sanitizeFilename(c.name)}.json`;
        const oldFileName = c.id
          ? charDiskFileNamesRef.current.get(c.id)
          : undefined;
        const payload = serializeCharacterCard(
          c,
          snap.settings.cardSpecVersion,
          c.character_book
        );
        return {
          fileName,
          oldFileName,
          payload,
        };
      });

      const lorebookPayloads = booksToSave.map((lb) => {
        const fileName = `${sanitizeFilename(lb.name)}.json`;
        const oldFileName = lb.id
          ? loreDiskFileNamesRef.current.get(lb.id)
          : undefined;
        const payload = serializeLorebookCard(lb);
        return {
          fileName,
          oldFileName,
          payload,
        };
      });

      const metaPayload: TavernSmithMetaPayload = {
        schema: 'tavernsmith_meta_v1',
        updatedAt: nowIso,
        activeThemeId: snap.settings.activeThemeId,
        contextThemes: snap.themes,
        tags: extractCustomUserTags(snap.tags),
        settings: snap.settings,
        aiConfig: stripApiKeysForStorage(snap.aiConfig),
        activeCharacterId: snap.activeCharacterId,
        activeLorebookId: snap.activeLorebookId,
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
            meta: metaPayload,
            vault: vaultEnvelope || undefined,
            customSavePath: snap.settings.activeSaveFolder,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const diskState = (await res.json()) as DiskStateResponse;
        await applyDiskStateToWorkspace(diskState);
        setIsDirty(false);

        return {
          ok: true,
          message: `Saved to ${diskState.diskRoot || './Saves/'} (${characterPayloads.length} Characters, ${lorebookPayloads.length} Lorebooks).`,
        };
      } catch {
        return {
          ok: false,
          message: 'Could not reach local disk API (/api/disk/save).',
        };
      }
    },
    [applyDiskStateToWorkspace]
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

  // Auto-Save Timer -> Saves and auto-rescans `./Saves/` on disk
  useEffect(() => {
    if (!settings.autoSaveEnabled) return;
    const intervalMs = Math.max(5, settings.autoSaveIntervalSec) * 1000;

    const timerId = window.setInterval(() => {
      if (latestWorkspaceRef.current.isDirty) {
        void executeDiskSaveAndRescan('autosave');
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
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
            message: `Opened character "${parsed.character.name}" from ./Saves/Characters/${file.fileName}.`,
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
            message: `Opened lorebook "${parsed.lorebook.name}" from ./Saves/Lorebooks/${file.fileName}.`,
          };
        }
        return { ok: false, message: 'Unrecognized file format.' };
      } catch {
        return { ok: false, message: `Could not parse ${file.fileName}.` };
      }
    },
    [characters, lorebooks, tags]
  );

  // Real Disk Delete & Auto-Rescan from Options File List
  const deleteSavedFile = useCallback(
    (fileId: string) => {
      const target = diskFiles.find((f) => f.id === fileId);
      if (!target) return;
      if (target.kind !== 'character' && target.kind !== 'lorebook') return;

      const folder = target.kind === 'lorebook' ? 'Lorebooks' : 'Characters';
      void fetch('/api/disk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder,
          fileName: target.fileName,
          customSavePath: settings.activeSaveFolder,
        }),
      })
        .then((r) => r.json())
        .then((diskState: DiskStateResponse) => {
          if (diskState && diskState.ok) {
            void applyDiskStateToWorkspace(diskState);
          }
        })
        .catch(() => {
          // Ignore network error
        });
    },
    [diskFiles, settings.activeSaveFolder, applyDiskStateToWorkspace]
  );

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

  const exportSaveFolderBundle = useCallback(() => {
    const bundle = {
      bundleVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      saveFolderRoot: settings.activeSaveFolder || UNIFIED_INTERNAL_ROOT,
      structure: {
        charactersSubfolder: 'Characters/',
        lorebooksSubfolder: 'Lorebooks/',
        metaFile: META_FILENAME,
        vaultFile: VAULT_FILENAME,
      },
      fileCount: savedFiles.length,
      files: savedFiles.map((f) => ({
        path: `${f.folderPath === '/' ? '' : f.folderPath}${f.fileName}`,
        fileName: f.fileName,
        subfolder: f.folderPath,
        kind: f.kind,
        updatedAt: f.updatedAt,
        data: (() => {
          try {
            return JSON.parse(f.content);
          } catch {
            return f.content;
          }
        })(),
      })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    triggerBrowserDownload(blob, 'TavernSmith_Saves_BackupBundle.json');
  }, [savedFiles, settings.activeSaveFolder]);

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

  const importFromFiles = useCallback(
    async (
      files: FileList | File[]
    ): Promise<{ count: number; summary: string }> => {
      const list = Array.from(files);
      let importedChars = 0;
      let importedBooks = 0;
      let lastCharId: string | null = null;
      let lastBookId: string | null = null;

      const nextCharacters = [...latestWorkspaceRef.current.characters];
      const nextLorebooks = [...latestWorkspaceRef.current.lorebooks];

      for (const file of list) {
        if (file.name === META_FILENAME) {
          try {
            const text = await file.text();
            const parsedMeta = JSON.parse(
              text
            ) as Partial<TavernSmithMetaPayload>;
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
          const existingIdx = nextCharacters.findIndex(
            (c) =>
              (c.name || '').trim().toLowerCase() ===
              (result.character.name || '').trim().toLowerCase()
          );
          if (existingIdx !== -1) {
            result.character.id = nextCharacters[existingIdx].id;
            nextCharacters[existingIdx] = result.character;
          } else {
            nextCharacters.unshift(result.character);
          }
          lastCharId = result.character.id!;
          importedChars++;

          if (result.embeddedLorebook) {
            const book = result.embeddedLorebook;
            book.isNsfw = isLorebookNsfw(book, tags);
            const existingBookIdx = nextLorebooks.findIndex(
              (l) =>
                (l.name || '').trim().toLowerCase() ===
                (book.name || '').trim().toLowerCase()
            );
            if (existingBookIdx !== -1) {
              book.id = nextLorebooks[existingBookIdx].id;
              nextLorebooks[existingBookIdx] = book;
            } else {
              nextLorebooks.unshift(book);
            }
            lastBookId = book.id!;
            importedBooks++;
          }
        } else if (result.kind === 'lorebook') {
          result.lorebook.isNsfw = isLorebookNsfw(result.lorebook, tags);
          const existingBookIdx = nextLorebooks.findIndex(
            (l) =>
              (l.name || '').trim().toLowerCase() ===
              (result.lorebook.name || '').trim().toLowerCase()
          );
          if (existingBookIdx !== -1) {
            result.lorebook.id = nextLorebooks[existingBookIdx].id;
            nextLorebooks[existingBookIdx] = result.lorebook;
          } else {
            nextLorebooks.unshift(result.lorebook);
          }
          lastBookId = result.lorebook.id!;
          importedBooks++;
        }
      }

      setCharacters(nextCharacters);
      setLorebooks(nextLorebooks);

      if (lastCharId) {
        setActiveCharacterId(lastCharId);
      } else if (lastBookId) {
        setActiveLorebookId(lastBookId);
      }

      if (importedChars > 0 || importedBooks > 0) {
        await executeDiskSaveAndRescan('manual', {
          characters: nextCharacters,
          lorebooks: nextLorebooks,
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

      return {
        count: importedChars + importedBooks,
        summary:
          parts.length > 0
            ? `Imported ${parts.join(' and ')}.`
            : 'Restored metadata or no new card files found.',
      };
    },
    [tags, executeDiskSaveAndRescan]
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
    setIsDirty(false);
  }, []);

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
      diskResolvedPath,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      exportSaveFolderBundle,
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
      diskResolvedPath,
      loadSavedFileIntoWorkspace,
      createSaveFolder,
      setActiveSaveFolder,
      deleteSavedFile,
      exportSaveFolderBundle,
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

