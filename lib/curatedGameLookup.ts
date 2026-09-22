import { GAMES_DATABASE, type GameRequirement } from '@/data/hardwareAndGames';

/**
 * Publisher/Steam titles rarely match the curated catalog verbatim
 * ("Grand Theft Auto V Legacy" vs "Grand Theft Auto V (GTA V)"), so names are normalized and
 * a small alias list covers the popular shortcuts players actually type/search for.
 */
const EDITION_NOISE = /\b(?:legacy|remastered|remake|definitive|complete|special|enhanced|ultimate|deluxe|gold|goty|edition|online|hd)\b/g;

const ALIASES: Record<string, string> = {
  'cs 2': 'counter-strike-2',
  'cs2': 'counter-strike-2',
  'counterstrike 2': 'counter-strike-2',
  'grand theft auto 5': 'gta-v',
  'gta 5': 'gta-v',
  'gta v': 'gta-v',
  'lmht': 'league-of-legends',
  'lol': 'league-of-legends',
  'eldon ring': 'elden-ring',
  'wukong': 'black-myth-wukong',
  'rdr 2': 'rdr-2',
  'rdr2': 'rdr-2',
};

export function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u00ae\u2122\u00a9]/g, ' ')
    .replace(/\((?:[^)]*)\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(EDITION_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Finds a curated catalog entry for a given (Steam) game title, if one exists. */
export function findCuratedGame(gameName: string | null | undefined): GameRequirement | undefined {
  if (!gameName) return undefined;
  const normalized = normalizeGameName(gameName);
  if (!normalized) return undefined;

  const aliasedId = ALIASES[normalized];
  if (aliasedId) return GAMES_DATABASE.find((game) => game.id === aliasedId);

  return GAMES_DATABASE.find((game) => normalizeGameName(game.name) === normalized);
}
