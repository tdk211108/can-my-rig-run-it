/**
 * Matches free-form publisher requirement strings ("NVIDIA GeForce GTX 960 4GB or AMD Radeon
 * RX 470 4GB") against the ranked CPU/GPU catalogs used by the comparison engine.
 *
 * Exact lookups fail constantly because:
 *  - requirement text mixes vendors, lists alternatives with "or" / "/" / "," and adds memory
 *    sizes, marketing suffixes and junk ("(MORE DETAILS HERE)", "or equivalent", "6G");
 *  - the ranked catalogs are benchmark lists that do not contain every legacy model
 *    (no GeForce GTX 9xx, no Radeon HD / R9, no FX / Phenom / Haswell parts);
 *  - some requirements only describe a tier ("1GB VRAM / DirectX 10+ support",
 *    "Quad core 3Ghz+", "Intel i7 7th generation").
 *
 * Matching therefore runs through confidence layers and always reports which layer matched:
 *  1. `exact`      – the model exists in the ranked list.
 *  2. `equivalent` – same vendor/model number with different suffixes, or a curated
 *                    legacy-equivalent entry (GTX 970 → GeForce GTX 1060 3GB).
 *  3. `family`     – only a family/generation is known ("i7 7th generation", "Ryzen 5 CPU");
 *                    the family floor (weakest ranked member) is used.
 *  4. `generic`    – the requirement only states VRAM/DirectX/core count; a tier
 *                    representative from the ranked list is used.
 *
 * When a requirement lists several alternatives, the *weakest* matched alternative becomes the
 * threshold, because the publisher accepts either option ("A or B" ⇒ a machine that only
 * satisfies B still passes).
 */

import { RANKED_CPUS } from './rankedCpuData';
import { RANKED_GPUS } from './rankedGpuData';

export type HardwareKind = 'gpu' | 'cpu';

export type MatchConfidence = 'exact' | 'equivalent' | 'family' | 'generic';

export interface RankedHardwareEntry {
  name: string;
  rank: number;
}

export interface HardwareNameMatch {
  /** Canonical catalog entry name used as the comparison threshold. */
  name: string;
  /** Catalog rank of that entry (1 = strongest). */
  rank: number;
  confidence: MatchConfidence;
  /** The requirement fragment this match was derived from. */
  matchedFrom: string;
  /** Human-readable explanation, surfaced in the compatibility panel. */
  note: string;
}

/** Words that never help identify a model and are removed before matching. */
const NOISE_WORDS = new Set([
  'nvidia', 'geforce', 'gforce', 'amd', 'ati', 'radeon', 'intel', 'qualcomm', 'snapdragon',
  'adreno', 'mali', 'powervr', 'apple', 'graphics', 'graphic', 'processor', 'processors',
  'cpu', 'cpus', 'gpu', 'gpus', 'core', 'coretm', 'corertm', 'coret', 'corert', 'apus', 'apu',
  'video', 'card', 'cards', 'memory', 'vram', 'ram', 'gb', 'mb', 'dedicated', 'integrated',
  'series', 'level', 'capable', 'compatible', 'support', 'supports', 'supported', 'shader',
  'model', 'directx', 'dx', 'opengl', 'pixel', 'pixels', 'thread', 'threads', 'hardware',
  'or', 'and', 'with', 'without', 'any', 'minimum', 'required', 'requires', 'recommended',
  'better', 'higher', 'newer', 'equivalent', 'similar', 'more', 'than', 'at', 'least', 'of',
  'the', 'a', 'an', 'is', 'based', 'only', 'plus', 'over', 'other', 'such', 'as', 'that',
  'details', 'here', 'resolution', 'capability', 'engine', 'size', 'video', 'vis', 'ca',
]);

/** Marketing suffixes that are relevant for performance matching. */
const PERFORMANCE_SUFFIXES = new Set([
  'ti', 'super', 'xt', 'xtx', 'gre', 'x', 's', 'd', 'se', 'le', 'x3d', 'oc', 'k', 'kf', 'ks',
  'f', 't', 'g', 'ge', 'h', 'hq', 'u', 'e', 'b', 'c', 'v', 'p', 'pro', 'x2', 'x4', 'x6',
  'x8', 'gt', 'gts', 'go',
]);

/** Portable / low-power markers that should not represent a whole hardware family. */
const MOBILE_MARKERS = /\b(mobile|laptop|max-?q|notebook|embedded|low power|with radeon graphics|with graphics)\b/i;

/** Tokens dropped when building the variant-free key of a catalog entry. */
const VARIANT_TOKENS = new Set([
  'mobile', 'laptop', 'notebook', 'max', 'maxq', 'q', 'design', 'edition', 'ceo', 'oem', 'prd',
  '50th', 'anniversary', 'sp', '2048sp', 'processor', 'radeon', 'graphics', 'pro', 'gpu',
]);

/** Tier markers that make a VRAM/DirectX/core-count-only requirement comparable. */
const TIER_SIGNALS: Record<HardwareKind, RegExp> = {
  gpu: /\b(vram|video\s*memory|video\s*ram|dedicated|directx|dx\d*|opengl|shader|pixel)\b|\d+\s*(?:gb|mb)\b/i,
  cpu: /\b(ghz|mhz|dual|quad|hexa|octa|cores?|threads?)\b/i,
};


interface ParsedName {
  /** Requirement text this signature was built from. */
  raw: string;
  /** Normalized signature, e.g. "gtx 1060" or "i5 6600 k". */
  compact: string;
  tokens: string[];
  vendor: string | null;
  series: string | null;
  /** Model numbers (>= 100) found in the text, memory sizes excluded. */
  numbers: number[];
  /** Video memory in GB when the text states it. */
  memoryGB: number | null;
  suffixes: string[];
  mobile: boolean;
  generation: number | null;
  /** Generation stated in words, e.g. "i7 7th generation" → 7. */
  statedGeneration: number | null;
  /** True when the text mentions a tier marker (VRAM, DirectX, core count, clocks). */
  tierSignal: boolean;
  /** True when the text names no model and no family (VRAM/DirectX/core-count only). */
  generic: boolean;
  /** Tokens joined without variant markers ("geforce gtx 1050 ti mobile" → "gtx 1050 ti"). */
  baseKey: string;
}

const GPU_SERIES: Record<string, string[]> = {
  nvidia: ['rtx', 'gtx', 'gts', 'gt', 'mx', 'quadro', 'titan', 'tesla'],
  amd: ['rx', 'vega', 'r9', 'r7', 'r5', 'r3', 'hd', 'firepro', 'instinct'],
  intel: ['uhd', 'iris', 'arc', 'hd', 'gma', 'xe'],
};

function detectVendor(value: string): string | null {
  if (/\b(nvidia|geforce|gforce|quadro|titan|tesla)\b/i.test(value)) return 'nvidia';
  if (/\b(amd|ati|radeon|firepro|instinct)\b/i.test(value)) return 'amd';
  if (/\b(intel|iris|uhd|gma|arc)\b/i.test(value)) return 'intel';
  if (/\b(apple|m1|m2|m3|m4)\b/i.test(value)) return 'apple';
  if (/\b(qualcomm|adreno|snapdragon|mali|powervr)\b/i.test(value)) return 'mobile';
  return null;
}

/** Removes HTML entities, trademark marks, bullet noise and bracketed side notes. */
function stripNoise(value: string): string {
  return value
    .replace(/&(?:reg|trade|copy|nbsp|amp|quot|#\d+|x[0-9a-f]+);/gi, ' ')
    .replace(/[\u00ae\u2122\u00a9\u2018\u2019\u201c\u201d]/g, ' ')
    .replace(/\((?:[^)]*)\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/@\s*\d+(?:\.\d+)?\s*(?:ghz|mhz)?/gi, ' ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Splits `750TI`/`RX480` into `750 ti`/`rx 480`, then re-joins short prefixes that came from the
 * same word (`i5`, `r9`, `a380`) so they stay recognisable as one product code.
 */
function splitAlphaNumeric(value: string): string[] {
  const tokens: string[] = [];
  for (const rawToken of value.split(' ')) {
    const parts = rawToken
      .replace(/([a-z]+)(\d)/g, '$1 $2')
      .replace(/(\d)([a-z]+)/g, '$1 $2')
      .split(' ')
      .filter(Boolean);
    const [head, next] = parts;
    if (parts.length > 1 && /^[a-z]{1,2}$/.test(head) && /^\d/.test(next)) {
      tokens.push(`${head}${next}`, ...parts.slice(2));
    } else {
      tokens.push(...parts);
    }
  }
  return tokens;
}

function tokenNumber(token: string): number | null {
  const match = token.match(/^([a-z]*)(\d{2,5})([a-z]*)$/);
  return match ? Number(match[2]) : null;
}

function detectGeneration(kind: HardwareKind, series: string | null, numbers: number[]): number | null {
  if (kind !== 'cpu' || !numbers.length) return null;
  const number = numbers[0];
  if (!series) return null;
  if (/^i[3579]$/.test(series)) {
    // Intel Core numbering is generation-prefixed: 8400 → 8th gen, 10400 → 10th gen, 750 → 1st gen.
    return number < 1000 ? 1 : Math.floor(number / 1000);
  }
  if (/^ryzen[3579]$/.test(series)) return Math.floor(number / 1000);
  return null;
}

function parseName(raw: string, kind: HardwareKind): ParsedName {
  const vendor = detectVendor(raw);
  const cleaned = stripNoise(raw.replace(/\b\d+(?:\.\d+)?\s*(?:ghz|mhz)\b/gi, ' '));

  // Video memory ("4GB", "6G", "512MB") is tracked separately from model numbers. A bare "G"
  // suffix is only memory when the value is plausible, so model numbers such as 8305G, 5700G or
  // 3400G are never mistaken for a memory size.
  const memoryPattern = /(\d+(?:\.\d+)?)\s*(gb|g|mb)\b/gi;
  const asMemoryGB = (value: number, unit: string): number | null => {
    const gb = /mb/i.test(unit) ? value / 1024 : value;
    return gb > 0 && gb <= 128 ? gb : null;
  };

  let memoryGB: number | null = null;
  const memoryMatch = memoryPattern.exec(cleaned);
  if (memoryMatch) memoryGB = asMemoryGB(Number(memoryMatch[1]), memoryMatch[2]);
  memoryPattern.lastIndex = 0;

  const withoutMemory = cleaned.replace(memoryPattern, (match, rawValue: string, unit: string) => (
    asMemoryGB(Number(rawValue), unit) === null ? match : ' '
  ));

  const words = normalizeWhitespace(
    withoutMemory
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
  )
    .split(' ')
    .filter((word) => word && !NOISE_WORDS.has(word));

  const tokens = splitAlphaNumeric(words.join(' '));

  const series = kind === 'gpu'
    ? (vendor ? (GPU_SERIES[vendor] ?? []).find((candidate) => tokens.includes(candidate)) ?? null : null)
    : (() => {
        if (/core\s*2\s*(?:quad|duo)/i.test(raw)) return 'core2';
        const ryzen = tokens.indexOf('ryzen');
        if (ryzen >= 0) {
          const tier = tokens[ryzen + 1];
          if (tier && /^[3579]$/.test(tier)) return `ryzen${tier}`;
          return 'ryzen';
        }
        return tokens.find((token) => /^(i[3579]|fx|phenom|athlon|a\d{1,2}|pentium|celeron|atom|xeon|m[1-4])$/.test(token)) ?? null;
      })();

  const numbers = tokens.map(tokenNumber).filter((value): value is number => value !== null && value >= 100);
  const suffixes = tokens.filter((token) => !
    /^\d+$/.test(token) &&
    token !== series &&
    !tokenNumber(token) &&
    PERFORMANCE_SUFFIXES.has(token) &&
    token.length <= 5
  );

  const statedGenerationMatch = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)\s*(?:gen\b|generation\b)/i);

  return {
    raw,
    compact: tokens.join(' '),
    tokens,
    vendor,
    series,
    numbers,
    memoryGB,
    suffixes,
    mobile: MOBILE_MARKERS.test(raw),
    generation: detectGeneration(kind, series, numbers),
    statedGeneration: statedGenerationMatch ? Number(statedGenerationMatch[1]) : null,
    tierSignal: TIER_SIGNALS[kind].test(raw),
    generic: !series && numbers.length === 0 && !vendor,
    baseKey: tokens.filter((token) => !VARIANT_TOKENS.has(token)).join(' '),
  };
}

/**
 * Curated equivalence table for models that are common in Steam requirements but missing from
 * the ranked catalogs (which start roughly at the 2015 generation plus modern integrated GPUs).
 * Values are the closest ranked entry by real-world performance, so the comparison keeps a
 * sensible threshold instead of dropping the game entirely.
 */
const GPU_EQUIVALENTS: Record<string, string> = {
  // NVIDIA (Fermi / Kepler / Maxwell era)
  'gt 240': 'GeForce 920MX',
  'gt 430': 'GeForce 920MX',
  'gt 440': 'GeForce 920MX',
  'gt 610': 'GeForce 920MX',
  'gt 630': 'GeForce GT 1030',
  'gt 640': 'GeForce GT 1030',
  'gt 730': 'GeForce GT 1030',
  'gt 740': 'GeForce GT 1030',
  'gtx 470': 'GeForce GT 1030',
  'gtx 480': 'GeForce GT 1030',
  'gtx 550 ti': 'GeForce GT 1030',
  'gtx 560': 'GeForce GTX 1050',
  'gtx 560 ti': 'GeForce GTX 1050',
  'gtx 570': 'GeForce GTX 1050',
  'gtx 580': 'GeForce GTX 1050 Ti',
  'gtx 650': 'GeForce GT 1030',
  'gtx 650 ti': 'GeForce GTX 1050',
  'gtx 660': 'GeForce GTX 1050',
  'gtx 660 ti': 'GeForce GTX 1050 Ti',
  'gtx 670': 'GeForce GTX 1050 Ti',
  'gtx 680': 'GeForce GTX 1050 Ti',
  'gtx 690': 'GeForce GTX 1060',
  'gtx 745': 'GeForce GT 1030',
  'gtx 750': 'GeForce GTX 1050',
  'gtx 750 ti': 'GeForce GTX 1050',
  'gtx 760': 'GeForce GTX 1050 Ti',
  'gtx 770': 'GeForce GTX 1050 Ti',
  'gtx 780': 'GeForce GTX 1060 3GB',
  'gtx 780 ti': 'GeForce GTX 1060',
  'gtx 950': 'GeForce GTX 1050',
  'gtx 960': 'GeForce GTX 1050 Ti',
  'gtx 970': 'GeForce GTX 1060 3GB',
  'gtx 980': 'GeForce GTX 1060',
  'gtx 980 ti': 'GeForce GTX 1660',
  'gtx titan': 'GeForce GTX 1660',
  'gtx titan x': 'GeForce GTX 1660 Ti',
  'gt 7900': 'GeForce 920MX',
  'gt 8600': 'GeForce 920MX',
  'gt 8800': 'GeForce GT 1030',
  'gt 9800': 'GeForce GT 1030',
  'nvidia 6600': 'GeForce 920MX',
  // AMD (Terascale / GCN 1-2 era)
  'hd 4870': 'Radeon RX 550',
  'hd 5770': 'Radeon RX 550',
  'hd 5850': 'Radeon RX 560',
  'hd 5870': 'Radeon RX 560',
  'hd 6670': 'Radeon RX 550',
  'hd 6770': 'Radeon RX 550',
  'hd 6850': 'Radeon RX 550',
  'hd 6870': 'Radeon RX 560',
  'hd 6950': 'Radeon RX 550',
  'hd 6970': 'Radeon RX 560',
  'hd 7750': 'Radeon RX 550',
  'hd 7770': 'Radeon RX 550',
  'hd 7790': 'Radeon RX 550',
  'hd 7850': 'Radeon RX 560',
  'hd 7870': 'Radeon RX 560',
  'hd 7950': 'Radeon RX 480',
  'hd 7970': 'Radeon RX 480',
  'r7 240': 'Radeon RX 550',
  'r7 250': 'Radeon RX 550',
  'r7 260 x': 'Radeon RX 550',
  'r7 265': 'Radeon RX 560',
  'r7 360': 'Radeon RX 550',
  'r7 370': 'Radeon RX 560',
  'r9 270': 'Radeon RX 560',
  'r9 270 x': 'Radeon RX 560',
  'r9 280': 'Radeon RX 480',
  'r9 280 x': 'Radeon RX 480',
  'r9 285': 'Radeon RX 480',
  'r9 290': 'Radeon RX 580',
  'r9 290 x': 'Radeon RX 580',
  'r9 380': 'Radeon RX 480',
  'r9 380 x': 'Radeon RX 480',
  'r9 390': 'Radeon RX 580',
  'r9 390 x': 'Radeon RX 580',
  'r9 fury': 'Radeon RX 580',
  'r9 fury x': 'Radeon RX 590',
  // Intel integrated graphics that predate the ranked list
  'gma 4500': 'Intel UHD Graphics 600',
  'gma x4500': 'Intel UHD Graphics 600',
  'hd 3000': 'Intel UHD Graphics 600',
  'hd 4000': 'Intel UHD Graphics 605',
  'hd 4200': 'Intel UHD Graphics 600',
  'hd 4400': 'Intel UHD Graphics 605',
  'hd 4600': 'Intel UHD Graphics 610',
  'hd 5000': 'Intel UHD Graphics 610',
  'hd 515': 'Intel UHD Graphics 600',
  'hd 520': 'Intel UHD Graphics 620',
  'hd 530': 'Intel UHD Graphics 630',
  'iris 540': 'Intel Iris Plus 640',
  'iris 550': 'Intel Iris Plus 650',
  'iris pro 5200': 'Intel Iris Plus 640',
  'iris pro 6200': 'Intel Iris Plus 650',
};

/** CPU counterpart of {@link GPU_EQUIVALENTS}. */
const CPU_EQUIVALENTS: Record<string, string> = {
  // Intel Core 2 and 1st-4th generation Core
  'intel 6600': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 6600': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 6700': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 8300': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 8400': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 8500': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 9400': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 9550': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'core2 9650': 'Intel Pentium Silver A1030 @ 2.00GHz',
  'i3 2100': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 2120': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 3220': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 3225': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 4130': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 4160': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 4170': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 6300': 'Intel Core i3-6100 @ 3.70GHz',
  'i3 6300 t': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 750': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 2300': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 2310': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 2320': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 2400': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 2500': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 2500 k': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 3450': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 3470': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 3550': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 3570': 'Intel Core i3-6100 @ 3.70GHz',
  'i5 4430': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4440': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4460': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4570': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4590': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4670': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4670 k': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4690': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 4690 k': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 6500': 'Intel Core i5-7400 @ 3.00GHz',
  'i5 7500': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 870': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 920': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 930': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 2600': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 2600 k': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 3770': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 3770 k': 'Intel Core i5-7400 @ 3.00GHz',
  'i7 4770': 'Intel Core i7-6700 @ 3.40GHz',
  'i7 4770 k': 'Intel Core i7-6700 @ 3.40GHz',
  'i7 4790': 'Intel Core i7-6700 @ 3.40GHz',
  'i7 4790 k': 'Intel Core i7-6700 @ 3.40GHz',
  'i7 4820 k': 'Intel Core i7-6700 @ 3.40GHz',
  // AMD FX / Phenom / Athlon / APU
  'fx 4100': 'AMD Athlon X4 950',
  'fx 4300': 'AMD Athlon X4 950',
  'fx 4350': 'AMD Athlon X4 950',
  'fx 6100': 'AMD Athlon X4 950',
  'fx 6300': 'AMD Athlon X4 950',
  'fx 6350': 'AMD Athlon X4 950',
  'fx 8120': 'AMD Ryzen 3 1200',
  'fx 8150': 'AMD Ryzen 3 1200',
  'fx 8320': 'AMD Ryzen 3 1200',
  'fx 8350': 'AMD Ryzen 3 1200',
  'fx 8370': 'AMD Ryzen 3 1200',
  'fx 9370': 'AMD Ryzen 3 1200',
  'fx 9590': 'AMD Ryzen 3 1200',
  'phenom 945': 'AMD Athlon X4 950',
  'phenom 955': 'AMD Athlon X4 950',
  'phenom 965': 'AMD Athlon X4 950',
  'phenom 9850': 'AMD Athlon X4 950',
  'phenom 1055 t': 'AMD Athlon X4 950',
  'phenom 1090 t': 'AMD Athlon X4 950',
  'phenom 1100 t': 'AMD Athlon X4 950',
  'athlon 640': 'AMD Athlon X4 950',
  'athlon 645': 'AMD Athlon X4 950',
  'athlon 860 k': 'AMD Athlon X4 950',
  'athlon 880 k': 'AMD Athlon X4 950',
  'a10 5800 k': 'AMD A10-9700',
  'a10 6700': 'AMD A10-9700',
  'a10 6800 k': 'AMD A10-9700',
  'a10 7850 k': 'AMD A10-9700',
  'a8 5600 k': 'AMD A8-9600',
  'a8 6600 k': 'AMD A8-9600',
  'a8 7600': 'AMD A8-9600',
  'a6 6400 k': 'AMD A6-9200',
  'a6 7400 k': 'AMD A6-9200',
};

/**
 * Tier representatives used when a requirement only describes a class of hardware
 * ("Quad core 3Ghz+", "4 GB VRAM / DirectX 12"), so the floor stays machine-checkable.
 */
const GENERIC_CPU_TIERS = {
  octaCore: 'Intel Core i7-9700 @ 3.00GHz',
  hexaCore: 'Intel Core i5-9400F @ 2.90GHz',
  quadCoreHighClock: 'Intel Core i5-10400 @ 2.90GHz',
  quadCore: 'Intel Core i5-7400 @ 3.00GHz',
  dualCore: 'Intel Core i3-6100 @ 3.70GHz',
};

interface IndexedEntry {
  /** Entry name as published by the ranked list (used for exact rank lookups). */
  canonicalName: string;
  /** Normalized key, e.g. "gtx 1050 ti". */
  key: string;
  /** Key without variant markers, e.g. "gtx 1050 ti". */
  baseKey: string;
  rank: number;
  vendor: string | null;
  series: string | null;
  tokens: string[];
  numbers: number[];
  memoryGB: number | null;
  suffixes: string[];
  mobile: boolean;
  generation: number | null;
}

interface HardwareIndex {
  entries: IndexedEntry[];
  byKey: Map<string, IndexedEntry[]>;
  byVendorNumber: Map<string, IndexedEntry[]>;
  byVendorSeries: Map<string, IndexedEntry[]>;
  bySeries: Map<string, IndexedEntry[]>;
  byVendor: Map<string, IndexedEntry[]>;
  byName: Map<string, IndexedEntry>;
  equivalents: Record<string, string>;
  /** Weakest ranked entry of the catalog (the absolute hardware floor). */
  floor: IndexedEntry;
}

/** `Radeon RX 470/570` describes two models, so the entry is indexed under both names. */
function expandEntryNames(name: string): string[] {
  const tokens = name.split(' ');
  const slashIndex = tokens.findIndex((token) => token.includes('/'));
  if (slashIndex < 0) return [name];
  return tokens[slashIndex]
    .split('/')
    .filter(Boolean)
    .map((side) => [...tokens.slice(0, slashIndex), side, ...tokens.slice(slashIndex + 1)].join(' '));
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildIndex(kind: HardwareKind, source: ReadonlyArray<RankedHardwareEntry>): HardwareIndex {
  const entries: IndexedEntry[] = [];

  for (const item of source) {
    for (const name of expandEntryNames(item.name)) {
      const parsed = parseName(name, kind);
      entries.push({
        canonicalName: item.name,
        key: parsed.compact,
        baseKey: parsed.baseKey,
        rank: item.rank,
        vendor: parsed.vendor,
        series: parsed.series,
        tokens: parsed.tokens,
        numbers: parsed.numbers,
        memoryGB: parsed.memoryGB,
        suffixes: parsed.suffixes,
        mobile: parsed.mobile,
        generation: parsed.generation,
      });
    }
  }

  entries.sort((left, right) => left.rank - right.rank || left.canonicalName.localeCompare(right.canonicalName));

  const byKey = new Map<string, IndexedEntry[]>();
  const byVendorNumber = new Map<string, IndexedEntry[]>();
  const byVendorSeries = new Map<string, IndexedEntry[]>();
  const bySeries = new Map<string, IndexedEntry[]>();
  const byVendor = new Map<string, IndexedEntry[]>();
  const byName = new Map<string, IndexedEntry>();

  for (const entry of entries) {
    if (!byName.has(entry.canonicalName)) byName.set(entry.canonicalName, entry);
    for (const key of Array.from(new Set([entry.key, entry.baseKey]))) {
      if (key) push(byKey, key, entry);
    }
    if (entry.vendor) {
      push(byVendor, entry.vendor, entry);
      for (const number of entry.numbers) push(byVendorNumber, `${entry.vendor}:${number}`, entry);
    }
    if (entry.series) {
      push(bySeries, entry.series, entry);
      push(byVendorSeries, `${entry.vendor ?? '*'}:${entry.series}`, entry);
    }
  }

  const floor = entries.reduce((acc, entry) => (entry.rank > acc.rank ? entry : acc), entries[0]);

  return {
    entries,
    byKey,
    byVendorNumber,
    byVendorSeries,
    bySeries,
    byVendor,
    byName,
    equivalents: kind === 'gpu' ? GPU_EQUIVALENTS : CPU_EQUIVALENTS,
    floor,
  };
}

let gpuIndex: HardwareIndex | null = null;
let cpuIndex: HardwareIndex | null = null;

function getIndex(kind: HardwareKind): HardwareIndex {
  if (kind === 'gpu') {
    if (!gpuIndex) gpuIndex = buildIndex('gpu', RANKED_GPUS);
    return gpuIndex;
  }
  if (!cpuIndex) cpuIndex = buildIndex('cpu', RANKED_CPUS);
  return cpuIndex;
}

interface Candidate {
  entry: IndexedEntry;
  confidence: MatchConfidence;
}

/** Scores how well a catalog entry matches a parsed requirement fragment. */
function scoreEntry(option: ParsedName, entry: IndexedEntry, keyMatch: 'full' | 'base' | 'none'): number {
  let score = keyMatch === 'full' ? 8 : keyMatch === 'base' ? 6 : 0;

  const optionSuffixes = new Set(option.suffixes);
  const entrySuffixes = new Set(entry.suffixes);
  const missingInEntry = Array.from(optionSuffixes).filter((suffix) => !entrySuffixes.has(suffix));
  const extraInEntry = Array.from(entrySuffixes).filter((suffix) => !optionSuffixes.has(suffix));
  score -= missingInEntry.length * 4;
  score -= extraInEntry.length * 3;

  if (option.memoryGB !== null && entry.memoryGB !== null) {
    score += option.memoryGB === entry.memoryGB ? 2 : -3;
  }
  // Extra descriptive tokens the requirement never mentioned ("... Creator Edition", "HS")
  // make an entry a worse interpretation of the requirement.
  const optionTokens = new Set(option.tokens);
  const extraTokens = entry.tokens.filter((token) => !
    optionTokens.has(token) &&
    !/^\d+$/.test(token) &&
    token !== entry.series &&
    !entry.suffixes.includes(token)
  );
  score -= Math.min(3, extraTokens.length);
  if (entry.mobile && !option.mobile) score -= 5;
  if (option.mobile && !entry.mobile) score -= 2;
  if (option.series && entry.series === option.series) score += 2;
  if (option.vendor && entry.vendor === option.vendor) score += 1;
  if (option.numbers.length && entry.numbers.length) {
    score += option.numbers[0] === entry.numbers[0] ? 2 : -6;
  }
  return score;
}

function pickBest(option: ParsedName, entries: ReadonlyArray<IndexedEntry>, minScore = 1): Candidate | null {
  const seen = new Set<string>();
  let best: { entry: IndexedEntry; score: number; keyMatch: 'full' | 'base' | 'none' } | null = null;

  for (const entry of entries) {
    const id = `${entry.canonicalName}#${entry.rank}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const keyMatch: 'full' | 'base' | 'none' =
      entry.key === option.compact ? 'full'
        : entry.baseKey === option.compact || entry.key === option.baseKey || entry.baseKey === option.baseKey ? 'base'
          : 'none';
    const score = scoreEntry(option, entry, keyMatch);
    if (score < minScore) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && entry.rank < best.entry.rank) ||
      (score === best.score && entry.rank === best.entry.rank && entry.canonicalName.length < best.entry.canonicalName.length)
    ) {
      best = { entry, score, keyMatch };
    }
  }

  if (!best) return null;
  return { entry: best.entry, confidence: best.keyMatch === 'full' ? 'exact' : 'equivalent' };
}

/** Keys used to look up the curated legacy-equivalence tables. */
function equivalenceKeys(option: ParsedName): string[] {
  const head = option.series ?? option.vendor ?? '';
  const withSuffixes = [head, ...option.numbers.map(String), ...option.suffixes].filter(Boolean).join(' ');
  const withoutSuffixes = [head, ...option.numbers.map(String)].filter(Boolean).join(' ');
  return Array.from(new Set([withSuffixes, withoutSuffixes, option.compact, option.baseKey].filter(Boolean)));
}

function matchEquivalence(option: ParsedName, index: HardwareIndex): Candidate | null {
  for (const key of equivalenceKeys(option)) {
    const target = index.equivalents[key];
    if (!target) continue;
    const entry = index.byName.get(target);
    if (entry) return { entry, confidence: 'equivalent' };
  }
  return null;
}

/** Same vendor + same model number, e.g. "GeForce 1080 Ti" → GeForce GTX 1080 Ti. */
/** Same vendor + same model number, e.g. "GeForce 1080 Ti" → GeForce GTX 1080 Ti. */
function matchVendorNumber(option: ParsedName, index: HardwareIndex): Candidate | null {
  if (!option.vendor || !option.numbers.length) return null;
  const entries = option.numbers
    .flatMap((number) => index.byVendorNumber.get(`${option.vendor}:${number}`) ?? [])
    // A named series must stay consistent, so "FX-4350" never becomes a Ryzen 3 4350GE.
    .filter((entry) => !option.series || !entry.series || entry.series === option.series);
  // This layer is a safety net for names without a series prefix, so it needs a solid signal
  // (matching vendor + model number) before it may claim a match.
  return pickBest(option, entries, 3);
}

function isUsableRepresentative(entry: IndexedEntry, option: ParsedName): boolean {
  return option.mobile || !entry.mobile;
}

function weakest(entries: ReadonlyArray<IndexedEntry>, option: ParsedName): IndexedEntry | null {
  const usable = entries.filter((entry) => isUsableRepresentative(entry, option));
  const pool = usable.length ? usable : entries;
  return pool.reduce<IndexedEntry | null>((acc, entry) => (!acc || entry.rank > acc.rank ? entry : acc), null);
}

/**
 * Family/generation fallback for requirements that only name a product line
 * ("Intel i7 7th generation", "Ryzen 5 CPU or Equivalent", "AMD Radeon R9 series").
 */
function matchFamily(option: ParsedName, index: HardwareIndex): Candidate | null {
  let pool: ReadonlyArray<IndexedEntry> = [];
  if (option.series) {
    pool = (option.vendor ? index.byVendorSeries.get(`${option.vendor}:${option.series}`) : undefined)
      ?? index.bySeries.get(option.series)
      ?? [];
  }
  if (!pool.length && option.vendor) pool = index.byVendor.get(option.vendor) ?? [];
  if (!pool.length) return null;

  if (option.statedGeneration !== null) {
    const sameGeneration = pool.filter((entry) => entry.generation === option.statedGeneration);
    if (sameGeneration.length) {
      // A generation spans a range of chips, so the median member is the fairest representative.
      const sorted = [...sameGeneration].sort((left, right) => left.rank - right.rank);
      return { entry: sorted[Math.floor(sorted.length / 2)], confidence: 'family' };
    }
  }

  if (option.numbers.length) {
    const closest = [...pool].sort((left, right) => {
      const leftDelta = left.numbers.length ? Math.abs(left.numbers[0] - option.numbers[0]) : Number.MAX_SAFE_INTEGER;
      const rightDelta = right.numbers.length ? Math.abs(right.numbers[0] - option.numbers[0]) : Number.MAX_SAFE_INTEGER;
      return leftDelta - rightDelta || right.rank - left.rank;
    })[0];
    if (closest) return { entry: closest, confidence: 'family' };
  }

  const floor = weakest(pool, option);
  return floor ? { entry: floor, confidence: 'family' } : null;
}

/** Last resort for requirements that only describe a tier ("4 GB VRAM", "Quad core 3Ghz+"). */
function matchGeneric(kind: HardwareKind, option: ParsedName, index: HardwareIndex): Candidate | null {
  if (!option.tierSignal && !option.generic) return null;
  if (kind === 'gpu') return { entry: index.floor, confidence: 'generic' };

  const coreWord = option.raw.match(/\b(dual|quad|hexa|octa)[- ]?\s*core\b/i)?.[1]?.toLowerCase();
  const wordCores = coreWord === 'dual' ? 2 : coreWord === 'quad' ? 4 : coreWord === 'hexa' ? 6 : coreWord === 'octa' ? 8 : null;
  const explicitCores = Number(option.raw.match(/\b(\d+)\s*core/i)?.[1] ?? 0);
  const cores = wordCores ?? (explicitCores > 0 ? explicitCores : null);
  const clocks = Array.from(option.raw.matchAll(/(\d+(?:\.\d+)?)\s*ghz/gi)).map((match) => Number(match[1]));
  const ghz = clocks.length ? Math.max(...clocks) : null;

  let target = index.floor.canonicalName;
  if (cores !== null && cores >= 8) target = GENERIC_CPU_TIERS.octaCore;
  else if (cores !== null && cores >= 6) target = GENERIC_CPU_TIERS.hexaCore;
  else if (cores !== null && cores >= 4) {
    target = ghz !== null && ghz >= 4
      ? GENERIC_CPU_TIERS.quadCoreHighClock
      : ghz !== null && ghz >= 3
        ? GENERIC_CPU_TIERS.quadCore
        : GENERIC_CPU_TIERS.dualCore;
  } else if (ghz !== null && ghz >= 3) {
    target = GENERIC_CPU_TIERS.dualCore;
  }

  return { entry: index.byName.get(target) ?? index.floor, confidence: 'generic' };
}

/** Runs every matching layer for a single requirement alternative. */
function matchOption(kind: HardwareKind, parsed: ParsedName, index: HardwareIndex): Candidate | null {
  const keyed = [
    ...(index.byKey.get(parsed.compact) ?? []),
    ...(index.byKey.get(parsed.baseKey) ?? []),
  ];
  return pickBest(parsed, keyed)
    ?? matchVendorNumber(parsed, index)
    ?? matchEquivalence(parsed, index)
    ?? matchFamily(parsed, index)
    ?? matchGeneric(kind, parsed, index);
}

/**
 * Splits a requirement value into the individual alternatives the publisher accepts
 * ("A or B", "A / B", "A, B", "A; B", sentence breaks).
 */
export function splitRequirementOptions(value: string | null | undefined): string[] {
  if (!value) return [];
  const normalized = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/(?<=\.)\s+/g, ' ; ')
    .replace(/\bor\b/gi, ' ; ')
    .replace(/[|,;:>+&/]/g, ' ; ');
  return normalized.split(';').map((part) => part.trim()).filter(Boolean);
}

function shorten(value: string, maxLength = 90): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function buildNote(kind: HardwareKind, confidence: MatchConfidence, matchedFrom: string, entry: IndexedEntry): string {
  const source = shorten(matchedFrom);
  switch (confidence) {
    case 'exact':
      return `Matched "${source}" to ${entry.canonicalName} (rank #${entry.rank}).`;
    case 'equivalent':
      return `"${source}" is not in the ranked list; using ${entry.canonicalName} (rank #${entry.rank}) as the closest equivalent.`;
    case 'family':
      return `"${source}" only names a hardware family; using ${entry.canonicalName} (rank #${entry.rank}) as that family's ranked floor.`;
    default:
      return `"${source}" does not name a specific model; using ${entry.canonicalName} (rank #${entry.rank}) as the ranked ${kind.toUpperCase()} floor.`;
  }
}

/**
 * Resolves a free-form requirement value to the ranked catalog entry used as the comparison
 * threshold. Returns `undefined` when the text carries no usable hardware signal at all.
 */
export function matchRankedHardware(
  kind: HardwareKind,
  value: string | null | undefined
): HardwareNameMatch | undefined {
  const options = splitRequirementOptions(value);
  if (!options.length) return undefined;

  const index = getIndex(kind);
  const candidates: { entry: IndexedEntry; confidence: MatchConfidence; matchedFrom: string }[] = [];
  let previous: ParsedName | null = null;

  for (const option of options) {
    let parsed = parseName(option, kind);

    // "GTX 970 / 1060" – a bare follow-up number inherits the series of the previous
    // alternative so it is still recognised as a model.
    if (!parsed.series && parsed.numbers.length && previous?.series) {
      parsed = parseName(`${previous.series} ${option}`, kind);
    }

    const hasSignal = Boolean(parsed.series || parsed.vendor || parsed.numbers.length || parsed.tierSignal);
    if (hasSignal) {
      const candidate = matchOption(kind, parsed, index);
      if (candidate) candidates.push({ entry: candidate.entry, confidence: candidate.confidence, matchedFrom: option });
    }
    previous = parsed;
  }

  if (!candidates.length) return undefined;

  // Publisher requirements are "satisfied by either option", so the weakest alternative of the
  // most reliable match tier becomes the threshold. Approximate tiers are only used when no
  // precise match exists, so a vague fragment cannot lower a well-defined requirement.
  const precise = candidates.filter((candidate) => candidate.confidence === 'exact' || candidate.confidence === 'equivalent');
  const families = candidates.filter((candidate) => candidate.confidence === 'family');
  const pool = precise.length ? precise : families.length ? families : candidates;
  const chosen = pool.reduce((acc, candidate) => (candidate.entry.rank > acc.entry.rank ? candidate : acc), pool[0]);

  return {
    name: chosen.entry.canonicalName,
    rank: chosen.entry.rank,
    confidence: chosen.confidence,
    matchedFrom: shorten(chosen.matchedFrom),
    note: buildNote(kind, chosen.confidence, chosen.matchedFrom, chosen.entry),
  };
}

/** True when the requirement could not be matched to an exact catalog model. */
export function isEstimatedMatch(match: HardwareNameMatch): boolean {
  return match.confidence !== 'exact';
}

/**
 * Self-check used by `npm run validate:matching`: every curated equivalence target and generic
 * tier representative must exist in the ranked catalog, otherwise the table silently rots.
 */
export function findUnknownCatalogTargets(): string[] {
  const unknown: string[] = [];
  const gpu = getIndex('gpu');
  const cpu = getIndex('cpu');

  for (const [key, target] of Object.entries(GPU_EQUIVALENTS)) {
    if (!gpu.byName.has(target)) unknown.push(`gpu "${key}" → "${target}"`);
  }
  for (const [key, target] of Object.entries(CPU_EQUIVALENTS)) {
    if (!cpu.byName.has(target)) unknown.push(`cpu "${key}" → "${target}"`);
  }
  for (const [tier, target] of Object.entries(GENERIC_CPU_TIERS)) {
    if (!cpu.byName.has(target)) unknown.push(`cpu tier ${tier} → "${target}"`);
  }
  return unknown;
}


