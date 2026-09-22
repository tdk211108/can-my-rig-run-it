import type { HardwareRequirement } from '@/data/hardwareAndGames';
import type { HardwareNameMatch } from './hardwareNameMatcher';
import { matchRankedHardware } from './hardwareNameMatcher';
import type { ParsedRequirement } from './steamParser';

export interface SteamRequirementResolution {
  /** Threshold usable by the comparator, or null when nothing could be interpreted. */
  requirement: HardwareRequirement | null;
  gpu: HardwareNameMatch | null;
  cpu: HardwareNameMatch | null;
  ramGB: number | null;
  cpuCores: number;
  /** Requirement fragments the ranked catalogs could not interpret at all. */
  unresolved: string[];
  /** Provenance and limitation notes for the compatibility panel. */
  notes: string[];
}

/** True when the publisher actually filled in at least one requirement field. */
export function hasUsableRequirement(requirement: ParsedRequirement | null | undefined): boolean {
  if (!requirement) return false;
  return [requirement.graphics, requirement.processor, requirement.memory]
    .some((value) => Boolean(value && value.trim()));
}

function extractRamGB(value: string | undefined): number | null {
  if (!value) return null;
  const gigabytes = value.match(/(\d+(?:\.\d+)?)\s*(?:gb|gib)\b/i);
  if (gigabytes) return Math.min(512, Math.ceil(Number(gigabytes[1])));
  const megabytes = value.match(/(\d+)\s*(?:mb|mib)\b/i);
  if (megabytes) return Math.min(512, Math.ceil(Number(megabytes[1]) / 1024));
  return null;
}

/**
 * Publisher requirements sometimes describe the CPU by core count and clock speed only
 * ("4 hardware CPU threads", "Quad Core 3.0 GHz"), so the thread/core wording wins over the
 * browser-reported default.
 */
function extractCpuCores(value: string | undefined): number {
  const text = value ?? '';
  const threads = text.match(/(\d+)\s*(?:hardware\s*)?threads?/i);
  if (threads) return Math.max(1, Math.min(32, Number(threads[1])));
  const explicit = text.match(/(\d+)\s*core/i);
  if (explicit) return Math.max(1, Math.min(32, Number(explicit[1])));
  if (/\bdual[- ]?\s*core\b/i.test(text)) return 2;
  if (/\bquad[- ]?\s*core\b/i.test(text)) return 4;
  if (/\bhexa[- ]?\s*core\b/i.test(text)) return 6;
  if (/\bocta[- ]?\s*core\b/i.test(text)) return 8;
  return 4;
}

/**
 * Converts one publisher requirement block (Steam minimum/recommended HTML-parsed fields) into
 * ranked-catalog thresholds. Every component is resolved independently: a game that only states
 * a GPU requirement still produces a (partial) comparison instead of being skipped.
 */
export function resolveSteamRequirement(
  requirement: ParsedRequirement | null | undefined
): SteamRequirementResolution {
  const graphics = requirement?.graphics?.trim();
  const processor = requirement?.processor?.trim();
  const memory = requirement?.memory?.trim();

  const gpu = matchRankedHardware('gpu', graphics) ?? null;
  const cpu = matchRankedHardware('cpu', processor) ?? null;
  const ramGB = extractRamGB(memory);
  const cpuCores = extractCpuCores(processor);

  const unresolved: string[] = [];
  if (graphics && !gpu) unresolved.push(`Graphics: ${graphics}`);
  if (processor && !cpu) unresolved.push(`Processor: ${processor}`);
  if (memory && ramGB === null) unresolved.push(`Memory: ${memory}`);

  const notes: string[] = [];
  if (gpu && gpu.confidence !== 'exact') notes.push(`GPU estimate — ${gpu.note}`);
  if (cpu && cpu.confidence !== 'exact') notes.push(`CPU estimate — ${cpu.note}`);
  if (graphics && !gpu) notes.push('The stated graphics requirement could not be identified, so the GPU was not evaluated.');
  if (processor && !cpu) notes.push('The stated processor requirement could not be identified, so the CPU was not evaluated.');
  if (memory && ramGB === null) notes.push('The stated memory requirement could not be read, so RAM was not evaluated.');
  if (!graphics) notes.push('The publisher does not state a GPU requirement for this level.');
  if (!processor) notes.push('The publisher does not state a CPU requirement for this level.');
  if (!memory) notes.push('The publisher does not state a memory requirement for this level.');

  const hasThreshold = Boolean(gpu || cpu || ramGB !== null);
  const usedGpu = gpu && gpu.confidence !== 'exact' ? gpu.note : undefined;
  const usedCpu = cpu && cpu.confidence !== 'exact' ? cpu.note : undefined;

  return {
    requirement: hasThreshold
      ? {
          gpuName: gpu?.name ?? null,
          cpuName: cpu?.name ?? null,
          ramGB,
          cpuCores,
          gpuNote: usedGpu,
          cpuNote: usedCpu,
        }
      : null,
    gpu,
    cpu,
    ramGB,
    cpuCores,
    unresolved,
    notes,
  };
}

