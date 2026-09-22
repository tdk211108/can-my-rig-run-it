import { RANKED_CPUS } from './rankedCpuData';

export interface CpuMatchResult {
  score: number;
  rank: number | null;
  matchedName: string;
  matchType: 'ranked-list' | 'fallback';
}

const CPU_RANKS = RANKED_CPUS.reduce<Record<string, number>>((ranks, cpu) => {
  ranks[cpu.name.toLowerCase()] = cpu.rank;
  return ranks;
}, {});

function normalizeCpuName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getCpuScore(cpuName: string): CpuMatchResult {
  const normalized = normalizeCpuName(cpuName);
  const exactRank = CPU_RANKS[normalized];
  if (exactRank) return { score: exactRank, rank: exactRank, matchedName: normalized, matchType: 'ranked-list' };

  const alias = Object.entries(CPU_RANKS).find(([name]) => (
    name.startsWith(`${normalized} @`) || normalized.startsWith(`${name} @`)
  ));
  if (alias) return { score: alias[1], rank: alias[1], matchedName: alias[0], matchType: 'ranked-list' };

  return { score: RANKED_CPUS.length + 1, rank: null, matchedName: 'CPU fallback', matchType: 'fallback' };
}
