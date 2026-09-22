import { GameRequirement, HardwareRequirement } from '@/data/hardwareAndGames';
import { UserHardwareSpec } from './hardwareDetector';
import { getCpuScore, CpuMatchResult } from './cpuBenchmarks';
import { getGpuScore, GpuMatchResult } from './gpuBenchmarks';

export type PassFailStatus = 'PASS' | 'FAIL';
export type OverallStatus = 'CAN_RUN_RECOMMENDED' | 'CAN_RUN_MINIMUM' | 'CANNOT_RUN';

export interface ComponentComparison {
  name: string;
  userValue: string;
  targetValue: string;
  diff: number; // userValue - targetValue
  status: PassFailStatus;
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
 * Evaluate one requirement level.
 * Overall match weighting: GPU 50%, RAM 30%, CPU 20%.
 */
function evaluateLevel(
  userGpuScore: number,
  userCpuScore: number,
  userRam: number,
  req: HardwareRequirement
): LevelEvaluation {
  const requiredGpuRank = getGpuScore(req.gpuName).score;
  const requiredCpuRank = getCpuScore(req.cpuName).score;
  const gpu = evaluateRankedComponent('GPU Rank', userGpuScore, requiredGpuRank);
  const ram = evaluateComponent('RAM', userRam, req.ramGB, 'GB');
  const cpu = evaluateRankedComponent('CPU Rank', userCpuScore, requiredCpuRank);

  const isOverallPass = gpu.status === 'PASS' && ram.status === 'PASS' && cpu.status === 'PASS';

  const weightedGpu = Math.min(100, (requiredGpuRank / userGpuScore) * 100) * 0.5;
  const weightedRam = Math.min(100, (userRam / req.ramGB) * 100) * 0.3;
  const weightedCpu = Math.min(100, (requiredCpuRank / userCpuScore) * 100) * 0.2;
  const percentMatch = Math.min(100, Math.round(weightedGpu + weightedRam + weightedCpu));

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

  // 1. Phân tích GPU
  const minimumGpuRank = getGpuScore(game.minimum.gpuName).score;
  const recommendedGpuRank = getGpuScore(game.recommended.gpuName).score;
  if (userGpuRank > minimumGpuRank) {
    bottleneck = 'GPU';
    details.push(
      `Your GPU is rank #${userGpuRank}, below the minimum rank #${minimumGpuRank}. ${userGpuMatch.rank ? `The ranked list confirms it is below the required performance tier. ` : ''}Severe stutter may occur even at low settings.`
    );
  } else if (userGpuRank > Math.round(minimumGpuRank * 0.9)) {
    details.push(`Your GPU just clears the minimum rank target (#${userGpuRank} vs. #${minimumGpuRank}). Expect limited settings headroom and possible dips in demanding scenes.`);
  } else if (userGpuRank <= recommendedGpuRank) {
    details.push(
      `Your GPU meets or exceeds the recommended rank (#${userGpuRank} vs. #${recommendedGpuRank}). High or Ultra settings should be comfortable.`
    );
  } else if (userGpuRank <= Math.round(recommendedGpuRank * 1.1)) {
    details.push(`Your GPU is close to the recommended rank (#${userGpuRank} vs. #${recommendedGpuRank}). High settings may work, but demanding effects could require tuning.`);
  } else {
    details.push(
      `Your GPU meets the minimum rank but is below the recommended rank (#${userGpuRank} vs. #${recommendedGpuRank}). Medium settings are a safer starting point.`
    );
  }

  // 2. Phân tích RAM
  if (userRam < game.minimum.ramGB) {
    if (!bottleneck) bottleneck = 'RAM';
    details.push(
      `Your ${userRam}GB of RAM is below the ${game.minimum.ramGB}GB minimum. Crashes or memory pressure are possible.`
    );
  } else if (userRam < game.recommended.ramGB) {
    if (!bottleneck) bottleneck = 'RAM';
    details.push(
      `Your ${userRam}GB of RAM is below the recommended ${game.recommended.ramGB}GB. Close background apps before playing.`
    );
  } else {
    details.push(`Your ${userRam}GB of RAM meets the recommended target.`);
  }

  // 3. Phân tích CPU
  if (userCpuCores < game.minimum.cpuCores) {
    if (!bottleneck) bottleneck = 'CPU';
    details.push(
      `Your CPU reports ${userCpuCores} cores/threads, below the ${game.minimum.cpuCores}-core minimum. CPU bottlenecks may occur.`
    );
  }
  const minimumCpuRank = getCpuScore(game.minimum.cpuName).score;
  const recommendedCpuRank = getCpuScore(game.recommended.cpuName).score;
  if (userCpuRank > minimumCpuRank) {
    if (!bottleneck) bottleneck = 'CPU';
    details.push(`Your CPU is rank #${userCpuRank}, below the minimum CPU rank target #${minimumCpuRank}. ${userCpuMatch.rank ? 'CPU performance may limit frame pacing in busy scenes.' : 'Select a CPU from the ranked list for a more precise comparison.'}`);
  } else if (userCpuRank <= recommendedCpuRank) {
    details.push(`Your CPU meets the recommended rank target (#${userCpuRank} vs. #${recommendedCpuRank}).`);
  } else {
    details.push(`Your CPU meets the minimum rank target but is below the recommended target (#${userCpuRank} vs. #${recommendedCpuRank}).`);
  }

  // 4. Lời khuyên tổng quan
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
    advice,
  };
}
