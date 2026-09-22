import { RANKED_GPUS } from './rankedGpuData';

export interface GpuMatchResult {
  score: number;
  mark: null;
  rank: number | null;
  matchedName: string;
  matchType: 'ranked-list' | 'fallback';
}

const GPU_RANKS = RANKED_GPUS.reduce<Record<string, number>>((ranks, gpu) => {
  ranks[gpu.name.toLowerCase()] = gpu.rank;
  return ranks;
}, {});

function normalizeGpuName(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getGpuScore(gpuName: string): GpuMatchResult {
  const normalized = normalizeGpuName(gpuName);
  const exactRank = GPU_RANKS[normalized];
  if (exactRank) return { score: exactRank, mark: null, rank: exactRank, matchedName: normalized, matchType: 'ranked-list' };

  const aliases = Object.entries(GPU_RANKS).filter(([name]) => (
    name.startsWith(normalized) || normalized.startsWith(name)
  ));
  const alias = aliases.sort(([, left], [, right]) => left - right)[0];
  if (alias) return { score: alias[1], mark: null, rank: alias[1], matchedName: alias[0], matchType: 'ranked-list' };

  return { score: RANKED_GPUS.length + 1, mark: null, rank: null, matchedName: 'GPU fallback', matchType: 'fallback' };
}
