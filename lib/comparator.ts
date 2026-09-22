import type { GameRequirement, HardwareRequirement } from '@/data/hardwareAndGames';
import type { UserHardwareSpec } from './hardwareDetector';
import { getCpuScore } from './cpuBenchmarks';
import type { CpuMatchResult } from './cpuBenchmarks';
import { getGpuScore } from './gpuBenchmarks';
import type { GpuMatchResult } from './gpuBenchmarks';

export type ComponentStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type OverallStatus = 'CAN_RUN_RECOMMENDED' | 'CAN_RUN_MINIMUM' | 'CANNOT_RUN';

export interface ComponentComparison {
  name: string;
  userValue: string;
  targetValue: string;
  diff: number; // userValue - targetValue
  status: ComponentStatus;
  percentMatch: number;
}

export interface LevelEvaluation {
  isOverallPass: boolean;
  percentMatch: number;
  gpu: ComponentComparison;
  ram: ComponentComparison;
  cpu: ComponentComparison;
}

export interface CompatibilityReport {
  gameId: string;
  gameName: string;
  userSpecs: {
    gpuName: string;
    gpuMatched: GpuMatchResult;
    cpuName: string;
    cpuMatched: CpuMatchResult;
    ramGB: number;
    cpuCores: number;
  };
  overallStatus: OverallStatus;
  overallMatchPercent: number;
  minimumEvaluation: LevelEvaluation;
  recommendedEvaluation: LevelEvaluation;
  /** How the requirements were interpreted (equivalent matches, unspecified components). */
  notes: string[];
  advice: {
    summary: string;
    details: string[];
    bottleneckComponent: 'GPU' | 'RAM' | 'CPU' | null;
  };
}

/**
 * Evaluate each hardware component (GPU, RAM, CPU).
 */
function evaluateComponent(
  name: string,
  userVal: number,
  targetVal: number,
  unit: string
): ComponentComparison {
  const isPass = userVal >= targetVal;
  const ratio = targetVal > 0 ? userVal / targetVal : 1;
  const percentMatch = Math.min(150, Math.round(ratio * 100));

  return {
    name,
    userValue: `${userVal} ${unit}`.trim(),
    targetValue: `${targetVal} ${unit}`.trim(),
    diff: userVal - targetVal,
    status: isPass ? 'PASS' : 'FAIL',
    percentMatch,
  };
}

function evaluateRankedComponent(
  name: string,
  userRank: number,
  requiredRank: number
): ComponentComparison {
  const isPass = userRank <= requiredRank;
  const ratio = userRank > 0 ? requiredRank / userRank : 0;
  return {
    name,
    userValue: `Rank #${userRank}`,
    targetValue: `Rank #${requiredRank} or better`,
    diff: requiredRank - userRank,
    status: isPass ? 'PASS' : 'FAIL',
    percentMatch: Math.min(150, Math.round(ratio * 100)),
  };
}

/**
 * Components the publisher never states stay visible in the report as UNKNOWN instead of
 * silently passing or blocking the verdict.
 */
function unspecifiedComponent(name: string, userValue: string): ComponentComparison {
  return {
    name,
    userValue,
    targetValue: 'Not specified',
    diff: 0,
    status: 'UNKNOWN',
    percentMatch: 0,
  };
}

/**
 * Evaluate one requirement level.
 * Overall match weighting: GPU 50%, RAM 30%, CPU 20%, re-normalized over the components the
 * publisher actually specifies. A level passes when the GPU clears its bar and no stated
 * component fails; components the publisher does not mention are reported as UNKNOWN.
 */
function evaluateLevel(
  userGpuScore: number,
  userCpuScore: number,
  userRam: number,
  req: HardwareRequirement
): LevelEvaluation {
  const requiredGpuRank = req.gpuName ? getGpuScore(req.gpuName).score : null;
  const requiredCpuRank = req.cpuName ? getCpuScore(req.cpuName).score : null;
  const gpu = requiredGpuRank === null
    ? unspecifiedComponent('GPU Rank', `Rank #${userGpuScore}`)
    : evaluateRankedComponent('GPU Rank', userGpuScore, requiredGpuRank);
  const ram = req.ramGB === null
    ? unspecifiedComponent('RAM', `${userRam} GB`)
    : evaluateComponent('RAM', userRam, req.ramGB, 'GB');
  const cpu = requiredCpuRank === null
    ? unspecifiedComponent('CPU Rank', `Rank #${userCpuScore}`)
    : evaluateRankedComponent('CPU Rank', userCpuScore, requiredCpuRank);

  const isOverallPass = gpu.status === 'PASS' && ram.status !== 'FAIL' && cpu.status !== 'FAIL';

  const ratios: { weight: number; ratio: number | null }[] = [
    { weight: 0.5, ratio: requiredGpuRank === null ? null : requiredGpuRank / userGpuScore },
    { weight: 0.3, ratio: req.ramGB === null ? null : userRam / req.ramGB },
    { weight: 0.2, ratio: requiredCpuRank === null ? null : requiredCpuRank / userCpuScore },
  ];
  let weightSum = 0;
  let weightedTotal = 0;
  for (const { weight, ratio } of ratios) {
    if (ratio === null) continue;
    weightSum += weight;
    weightedTotal += Math.min(100, ratio * 100) * weight;
  }
  const percentMatch = weightSum > 0 ? Math.min(100, Math.round(weightedTotal / weightSum)) : 0;

  return {
    isOverallPass,
    percentMatch,
    gpu,
    ram,
    cpu,
  };
}

/**
 * Generate compatibility advice.
 */
function generateAdvice(
  userGpuRank: number,
  userGpuMatch: GpuMatchResult,
  userCpuRank: number,
  userCpuMatch: CpuMatchResult,
  userRam: number,
  userCpuCores: number,
  game: GameRequirement,
  minEval: LevelEvaluation,
  recEval: LevelEvaluation
): { summary: string; details: string[]; bottleneckComponent: 'GPU' | 'RAM' | 'CPU' | null } {
  const details: string[] = [];
  let bottleneck: 'GPU' | 'RAM' | 'CPU' | null = null;

  // 1. GPU analysis
  const minimumGpuRank = game.minimum.gpuName ? getGpuScore(game.minimum.gpuName).score : null;
  const recommendedGpuRank = game.recommended.gpuName ? getGpuScore(game.recommended.gpuName).score : null;
  if (minimumGpuRank === null && recommendedGpuRank === null) {
    details.push('The publisher does not state a GPU requirement for this game, so the GPU was not compared.');
  } else if (minimumGpuRank !== null && userGpuRank > minimumGpuRank) {
    bottleneck = 'GPU';
    details.push(
      `Your GPU is rank #${userGpuRank}, below the minimum rank #${minimumGpuRank}. ${userGpuMatch.rank ? `The ranked list confirms it is below the required performance tier. ` : ''}Severe stutter may occur even at low settings.`
    );
  } else if (minimumGpuRank !== null && userGpuRank > Math.round(minimumGpuRank * 0.9)) {
    details.push(`Your GPU just clears the minimum rank target (#${userGpuRank} vs. #${minimumGpuRank}). Expect limited settings headroom and possible dips in demanding scenes.`);
  } else if (recommendedGpuRank !== null && userGpuRank <= recommendedGpuRank) {
    details.push(
      `Your GPU meets or exceeds the recommended rank (#${userGpuRank} vs. #${recommendedGpuRank}). High or Ultra settings should be comfortable.`
    );
  } else if (recommendedGpuRank !== null && userGpuRank <= Math.round(recommendedGpuRank * 1.1)) {
    details.push(`Your GPU is close to the recommended rank (#${userGpuRank} vs. #${recommendedGpuRank}). High settings may work, but demanding effects could require tuning.`);
  } else if (recommendedGpuRank !== null) {
    details.push(
      `Your GPU meets the minimum rank but is below the recommended rank (#${userGpuRank} vs. #${recommendedGpuRank}). Medium settings are a safer starting point.`
    );
  }

  // 2. RAM analysis
  if (game.minimum.ramGB === null && game.recommended.ramGB === null) {
    details.push('The publisher does not state a memory requirement, so RAM was not compared.');
  } else if (game.minimum.ramGB !== null && userRam < game.minimum.ramGB) {
    if (!bottleneck) bottleneck = 'RAM';
    details.push(
      `Your ${userRam}GB of RAM is below the ${game.minimum.ramGB}GB minimum. Crashes or memory pressure are possible.`
    );
  } else if (game.recommended.ramGB !== null && userRam < game.recommended.ramGB) {
    if (!bottleneck) bottleneck = 'RAM';
    details.push(
      `Your ${userRam}GB of RAM is below the recommended ${game.recommended.ramGB}GB. Close background apps before playing.`
    );
  } else {
    const target = game.recommended.ramGB ?? game.minimum.ramGB;
    details.push(`Your ${userRam}GB of RAM meets the recommended target${target === null ? '' : ` (${target}GB)`}.`);
  }

  // 3. CPU analysis
  if (userCpuCores < game.minimum.cpuCores) {
    if (!bottleneck) bottleneck = 'CPU';
    details.push(
      `Your CPU reports ${userCpuCores} cores/threads, below the ${game.minimum.cpuCores}-core minimum. CPU bottlenecks may occur.`
    );
  }
  const minimumCpuRank = game.minimum.cpuName ? getCpuScore(game.minimum.cpuName).score : null;
  const recommendedCpuRank = game.recommended.cpuName ? getCpuScore(game.recommended.cpuName).score : null;
  if (minimumCpuRank === null && recommendedCpuRank === null) {
    details.push('The publisher does not state a CPU requirement for this game, so the CPU was not compared.');
  } else if (minimumCpuRank !== null && userCpuRank > minimumCpuRank) {
    if (!bottleneck) bottleneck = 'CPU';
    details.push(`Your CPU is rank #${userCpuRank}, below the minimum CPU rank target #${minimumCpuRank}. ${userCpuMatch.rank ? 'CPU performance may limit frame pacing in busy scenes.' : 'Select a CPU from the ranked list for a more precise comparison.'}`);
  } else if (recommendedCpuRank !== null && userCpuRank <= recommendedCpuRank) {
    details.push(`Your CPU meets the recommended rank target (#${userCpuRank} vs. #${recommendedCpuRank}).`);
  } else if (recommendedCpuRank !== null) {
    details.push(`Your CPU meets the minimum rank target but is below the recommended target (#${userCpuRank} vs. #${recommendedCpuRank}).`);
  }

  // 4. Overall advice
  let summary = '';
  if (recEval.isOverallPass) {
    summary = `Great! Your PC meets the recommended requirements for "${game.name}" (High/Ultra).`;
  } else if (minEval.isOverallPass) {
    summary = `Your PC meets the minimum requirements for "${game.name}" (Low to Medium settings).`;
  } else {
    summary = `Your current hardware does not meet the minimum requirements for "${game.name}".`;
  }

  return {
    summary,
    details,
    bottleneckComponent: bottleneck,
  };
}

/**
 * Phân tích tương thích giữa thông số máy tính và tựa game
 */
export function analyzeGameCompatibility(
  userSpec: UserHardwareSpec,
  targetGame: GameRequirement
): CompatibilityReport {
  const gpuMatch = getGpuScore(userSpec.gpuCleaned);
  const userGpuRank = gpuMatch.score;
  const cpuMatch = getCpuScore(userSpec.cpuName ?? '');
  const userCpuScore = cpuMatch.score;

  const minEval = evaluateLevel(userGpuRank, userCpuScore, userSpec.ramGB, targetGame.minimum);
  const recEval = evaluateLevel(userGpuRank, userCpuScore, userSpec.ramGB, targetGame.recommended);

  let overallStatus: OverallStatus = 'CANNOT_RUN';
  if (recEval.isOverallPass) {
    overallStatus = 'CAN_RUN_RECOMMENDED';
  } else if (minEval.isOverallPass) {
    overallStatus = 'CAN_RUN_MINIMUM';
  }

  const advice = generateAdvice(
    userGpuRank,
    gpuMatch,
    userCpuScore,
    cpuMatch,
    userSpec.ramGB,
    userSpec.cpuCores,
    targetGame,
    minEval,
    recEval
  );

  return {
    gameId: targetGame.id,
    gameName: targetGame.name,
    userSpecs: {
      gpuName: userSpec.gpuCleaned,
      gpuMatched: gpuMatch,
      cpuName: userSpec.cpuName ?? 'Unknown CPU',
      cpuMatched: cpuMatch,
      ramGB: userSpec.ramGB,
      cpuCores: userSpec.cpuCores,
    },
    overallStatus,
    overallMatchPercent: recEval.percentMatch,
    minimumEvaluation: minEval,
    recommendedEvaluation: recEval,
    notes: buildNotes(targetGame, minEval, recEval),
    advice,
  };
}

/** Provenance notes for the panel: how requirements were matched and what stayed unscored. */
function buildNotes(
  game: GameRequirement,
  minEval: LevelEvaluation,
  recEval: LevelEvaluation
): string[] {
  const notes = [...(game.notes ?? [])];
  if (game.minimum.gpuNote) notes.push(`Minimum • ${game.minimum.gpuNote}`);
  if (game.recommended.gpuNote && game.recommended.gpuNote !== game.minimum.gpuNote) {
    notes.push(`Recommended • ${game.recommended.gpuNote}`);
  }
  if (game.minimum.cpuNote) notes.push(`Minimum • ${game.minimum.cpuNote}`);
  if (game.recommended.cpuNote && game.recommended.cpuNote !== game.minimum.cpuNote) {
    notes.push(`Recommended • ${game.recommended.cpuNote}`);
  }
  if (recEval.gpu.status === 'UNKNOWN' && minEval.gpu.status === 'UNKNOWN') {
    notes.push('No GPU requirement is published for this game, so the GPU was not scored.');
  }
  if (recEval.ram.status === 'UNKNOWN' && minEval.ram.status === 'UNKNOWN') {
    notes.push('No memory requirement is published for this game, so RAM was not scored.');
  }
  if (recEval.cpu.status === 'UNKNOWN' && minEval.cpu.status === 'UNKNOWN') {
    notes.push('No CPU requirement is published for this game, so the CPU was not scored.');
  }
  // De-duplicate while keeping the order stable.
  return Array.from(new Set(notes));
}
