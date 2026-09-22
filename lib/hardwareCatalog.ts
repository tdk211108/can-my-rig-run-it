import { RANKED_CPUS } from './rankedCpuData';
import { RANKED_GPUS } from './rankedGpuData';

export const CPU_CATALOG: string[] = RANKED_CPUS.map((cpu) => cpu.name);
export const GPU_CATALOG: string[] = RANKED_GPUS.map((gpu) => gpu.name);

export type DeviceKind = 'pc' | 'laptop';

export function guessDeviceKind(gpuName: string): DeviceKind {
  return /laptop|mobile|max-q|notebook/i.test(gpuName) ? 'laptop' : 'pc';
}

export function cpuGroup(name: string): string {
  if (name.startsWith('Intel')) return 'Intel';
  if (name.startsWith('AMD')) return 'AMD';
  if (name.startsWith('Apple')) return 'Apple';
  return 'Khác';
}

export function gpuGroup(name: string): string {
  if (/^(NVIDIA|GeForce|RTX|GTX|GT |Quadro|TITAN|Tesla)\b/i.test(name)) return 'NVIDIA';
  if (/^(AMD|Radeon|RX |FirePro|Instinct)\b/i.test(name)) return 'AMD';
  if (/^(Intel|Arc|Iris|UHD|HD Graphics)\b/i.test(name)) return 'Intel';
  return 'Khác';
}
