export interface HardwareRequirement {
  gpuName: string;
  cpuName: string;
  ramGB: number;
  cpuCores: number;
}

export interface GameRequirement {
  id: string;
  name: string;
  genre: string;
  minimum: HardwareRequirement;
  recommended: HardwareRequirement;
}

export const GAMES_DATABASE: GameRequirement[] = [
  {
    id: 'black-myth-wukong',
    name: 'Black Myth: Wukong',
    genre: 'Action RPG / Souls-like',
    minimum: {
      gpuName: 'GeForce GTX 1060',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 16,
      cpuCores: 6,
    },
    recommended: {
      gpuName: 'GeForce RTX 2060',
      cpuName: 'Intel Core i7-8700 @ 3.20GHz',
      ramGB: 16,
      cpuCores: 8,
    },
  },
  {
    id: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    genre: 'Open World RPG',
    minimum: {
      gpuName: 'GeForce GTX 1060',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 12,
      cpuCores: 6,
    },
    recommended: {
      gpuName: 'GeForce RTX 2060 SUPER',
      cpuName: 'Intel Core i7-8700 @ 3.20GHz',
      ramGB: 16,
      cpuCores: 8,
    },
  },
  {
    id: 'gta-v',
    name: 'Grand Theft Auto V (GTA V)',
    genre: 'Action / Open World',
    minimum: {
      gpuName: 'GeForce GTX 1050 Ti',
      cpuName: 'Intel Core i3-8100 @ 3.60GHz',
      ramGB: 4,
      cpuCores: 4,
    },
    recommended: {
      gpuName: 'GeForce GTX 1060',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 8,
      cpuCores: 4,
    },
  },
  {
    id: 'league-of-legends',
    name: 'League of Legends (LMHT)',
    genre: 'MOBA',
    minimum: {
      gpuName: 'Intel UHD Graphics 630',
      cpuName: 'Intel Core i3-8100 @ 3.60GHz',
      ramGB: 4,
      cpuCores: 2,
    },
    recommended: {
      gpuName: 'GeForce GTX 1050 Ti',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 8,
      cpuCores: 4,
    },
  },
  {
    id: 'valorant',
    name: 'Valorant',
    genre: 'Tactical Shooter',
    minimum: {
      gpuName: 'Intel UHD Graphics 630',
      cpuName: 'Intel Core i3-8100 @ 3.60GHz',
      ramGB: 4,
      cpuCores: 2,
    },
    recommended: {
      gpuName: 'GeForce GTX 1050 Ti',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 8,
      cpuCores: 4,
    },
  },
  {
    id: 'elden-ring',
    name: 'Elden Ring',
    genre: 'Action RPG',
    minimum: {
      gpuName: 'GeForce GTX 1060 3GB',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 12,
      cpuCores: 6,
    },
    recommended: {
      gpuName: 'GeForce GTX 1060',
      cpuName: 'Intel Core i7-8700 @ 3.20GHz',
      ramGB: 16,
      cpuCores: 8,
    },
  },
  {
    id: 'counter-strike-2',
    name: 'Counter-Strike 2 (CS2)',
    genre: 'Competitive FPS',
    minimum: {
      gpuName: 'GeForce GTX 1050 Ti',
      cpuName: 'Intel Core i3-8100 @ 3.60GHz',
      ramGB: 8,
      cpuCores: 4,
    },
    recommended: {
      gpuName: 'GeForce RTX 2060',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 16,
      cpuCores: 6,
    },
  },
  {
    id: 'rdr-2',
    name: 'Red Dead Redemption 2',
    genre: 'Action-Adventure',
    minimum: {
      gpuName: 'GeForce GTX 1050 Ti',
      cpuName: 'Intel Core i3-8100 @ 3.60GHz',
      ramGB: 8,
      cpuCores: 4,
    },
    recommended: {
      gpuName: 'GeForce GTX 1060',
      cpuName: 'Intel Core i5-8400 @ 2.80GHz',
      ramGB: 12,
      cpuCores: 6,
    },
  },
];
