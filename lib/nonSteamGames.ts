import type { HardwareRequirement } from '@/data/hardwareAndGames';
import type { ParsedRequirement } from '@/lib/steamParser';

export type NonSteamGame = {
  id: string;
  name: string;
  aliases: string[];
  publisher: string;
  sourceLabel: string;
  platform: 'Windows' | 'Windows / macOS';
  website?: string;
  imageUrl?: string;
  minimum: ParsedRequirement;
  recommended?: ParsedRequirement;
  benchmark: {
    minimum: HardwareRequirement;
    recommended?: HardwareRequirement;
  };
};

export type NonSteamSearchResultItem = Pick<
  NonSteamGame,
  'id' | 'name' | 'publisher' | 'sourceLabel' | 'platform' | 'imageUrl'
>;

const LOCAL_COVER_URLS: Record<string, string> = {
  'genshin-impact': '/game-covers/genshin.jpg',
  'honkai-star-rail': '/game-covers/hsr.webp',
  'league-of-legends': '/game-covers/league-of-legends.jpg',
  valorant: '/game-covers/valorant.jpg',
  'teamfight-tactics': '/game-covers/teamfight-tactics.png',
  fortnite: '/game-covers/fortnite.webp',
  'minecraft-java': '/game-covers/minecraft.png',
  roblox: '/game-covers/roblox.webp',
};

function requirement(
  processor: string,
  memory: string,
  graphics: string,
  os = 'Windows 10 64-bit',
): ParsedRequirement {
  return {
    os,
    processor,
    memory,
    graphics,
    rawHtml: `<strong>OS:</strong>${os}<br><strong>Processor:</strong>${processor}<br><strong>Memory:</strong>${memory}<br><strong>Graphics:</strong>${graphics}`,
  };
}

function game(
  id: string,
  name: string,
  publisher: string,
  aliases: string[],
  minimum: ParsedRequirement,
  benchmarkMinimum: HardwareRequirement,
  recommended?: ParsedRequirement,
  benchmarkRecommended?: HardwareRequirement,
): NonSteamGame {
  const coverUrl = LOCAL_COVER_URLS[id];

  return {
    id: `local:${id}`,
    name,
    aliases,
    publisher,
    sourceLabel: publisher,
    platform: 'Windows',
    imageUrl: coverUrl,
    minimum,
    recommended,
    benchmark: {
      minimum: benchmarkMinimum,
      recommended: benchmarkRecommended,
    },
  };
}

const req = {
  lightCpu: 'Intel Core i3-8100 @ 3.60GHz',
  modernCpu: 'Intel Core i5-8400 @ 2.80GHz',
  highCpu: 'Intel Core i7-8700 @ 3.20GHz',
  lightGpu: 'GeForce GTX 1050 Ti',
  midGpu: 'GeForce GTX 1060',
  highGpu: 'GeForce RTX 2060',
};

export const NON_STEAM_GAMES: NonSteamGame[] = [
  game('genshin-impact', 'Genshin Impact', 'HoYoverse', ['genshin', 'mihoyo'], requirement(req.lightCpu, '8 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 8, cpuCores: 4 }, requirement(req.modernCpu, '16 GB', req.midGpu), { gpuName: req.midGpu, cpuName: req.modernCpu, ramGB: 16, cpuCores: 6 }),
  game('honkai-star-rail', 'Honkai: Star Rail', 'HoYoverse', ['hsr', 'star rail'], requirement(req.lightCpu, '8 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 8, cpuCores: 4 }, requirement(req.modernCpu, '16 GB', req.midGpu), { gpuName: req.midGpu, cpuName: req.modernCpu, ramGB: 16, cpuCores: 6 }),
  game('tears-of-themis', 'Tears of Themis', 'HoYoverse', ['tears of themis'], requirement(req.lightCpu, '8 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 8, cpuCores: 4 }),
  game('league-of-legends', 'League of Legends', 'Riot Games', ['lol', 'league'], requirement(req.lightCpu, '4 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 4, cpuCores: 2 }, requirement(req.modernCpu, '8 GB', req.midGpu), { gpuName: req.midGpu, cpuName: req.modernCpu, ramGB: 8, cpuCores: 4 }),
  game('valorant', 'VALORANT', 'Riot Games', ['val', 'riot fps'], requirement(req.lightCpu, '4 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 4, cpuCores: 2 }, requirement(req.modernCpu, '4 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.modernCpu, ramGB: 4, cpuCores: 4 }),
  game('teamfight-tactics', 'Teamfight Tactics', 'Riot Games', ['tft'], requirement(req.lightCpu, '4 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 4, cpuCores: 2 }),
  game('fortnite', 'Fortnite', 'Epic Games', ['fortnite battle royale'], requirement(req.lightCpu, '8 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 8, cpuCores: 4 }, requirement(req.modernCpu, '16 GB', req.midGpu), { gpuName: req.midGpu, cpuName: req.modernCpu, ramGB: 16, cpuCores: 6 }),
  game('minecraft-java', 'Minecraft: Java Edition', 'Mojang Studios', ['minecraft java', 'mc'], requirement(req.lightCpu, '4 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 4, cpuCores: 4 }),
  game('roblox', 'Roblox', 'Roblox Corporation', ['roblox player'], requirement(req.lightCpu, '4 GB', req.lightGpu), { gpuName: req.lightGpu, cpuName: req.lightCpu, ramGB: 4, cpuCores: 2 }),
];

export function searchNonSteamGames(term: string): NonSteamSearchResultItem[] {
  const query = term.trim().toLowerCase();
  if (!query) return [];
  return NON_STEAM_GAMES
    .map((game) => {
      const name = game.name.toLowerCase();
      const aliases = game.aliases.map((alias) => alias.toLowerCase());
      const publisher = game.publisher.toLowerCase();
      const exact = name === query || aliases.includes(query);
      const prefix = name.startsWith(query) || aliases.some((alias) => alias.startsWith(query));
      const match = exact || prefix || name.includes(query) || aliases.some((alias) => alias.includes(query)) || publisher.includes(query);
      return match ? { game, rank: exact ? 0 : prefix ? 1 : 2 } : null;
    })
    .filter((entry): entry is { game: NonSteamGame; rank: number } => Boolean(entry))
    .sort((a, b) => a.rank - b.rank || a.game.name.localeCompare(b.game.name))
    .map(({ game }) => ({
      id: game.id,
      name: game.name,
      publisher: game.publisher,
      sourceLabel: game.sourceLabel,
      platform: game.platform,
      imageUrl: game.imageUrl,
    }));
}

export function getNonSteamGame(id: string): NonSteamGame | undefined {
  return NON_STEAM_GAMES.find((game) => game.id === id);
}
