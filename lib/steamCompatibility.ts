import type { HardwareRequirement } from '@/data/hardwareAndGames';
import type { ParsedRequirement } from '@/lib/steamParser';
import { RANKED_CPUS } from '@/lib/rankedCpuData';
import { RANKED_GPUS } from '@/lib/rankedGpuData';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/@\s*[\d.]+\s*(?:ghz)?/g, ' ')
    .replace(/nvidia|amd|radeon|geforce|intel|graphics|processor|cpu|gpu/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findRankedName(value: string | undefined, entries: ReadonlyArray<{ name: string; rank: number }>): string | undefined {
  if (!value) return undefined;
  const alternatives = value
    .split(/\s+\bor\b\s+|\/|,/i)
    .map((part) => normalize(part))
    .filter(Boolean);

  const matches = entries
    .map((entry) => ({ entry, name: normalize(entry.name) }))
    .filter(({ name }) => alternatives.some((alternative) =>
      alternative.includes(name) || name.includes(alternative)
    ));

  // A requirement such as "GTX 960 or RX 470" is satisfied by either
  // option, so use the weakest matched option as the single comparison
  // threshold (the highest rank number).
  const match = matches.sort((left, right) => right.entry.rank - left.entry.rank)[0];
  return match?.entry.name;
}

function extractRamGB(value: string | undefined): number | undefined {
  const match = value?.match(/(\d+(?:\.\d+)?)\s*(?:gb|gib)/i);
  return match ? Math.ceil(Number(match[1])) : undefined;
}

function extractCpuCores(value: string | undefined): number {
  const explicit = value?.match(/(\d+)\s*cores?/i);
  if (explicit) return Number(explicit[1]);
  if (/\bdual[-\s]?core\b/i.test(value ?? '')) return 2;
  if (/\bquad[-\s]?core\b/i.test(value ?? '')) return 4;
  return 4;
}

export function steamRequirementToHardware(requirement: ParsedRequirement | undefined): HardwareRequirement | undefined {
  if (!requirement?.processor || !requirement.graphics) return undefined;

  const cpuName = findRankedName(requirement.processor, RANKED_CPUS);
  const gpuName = findRankedName(requirement.graphics, RANKED_GPUS);
  const ramGB = extractRamGB(requirement.memory);
  if (!cpuName || !gpuName || !ramGB) return undefined;

  return {
    cpuName,
    gpuName,
    ramGB,
    cpuCores: extractCpuCores(requirement.processor),
  };
}
