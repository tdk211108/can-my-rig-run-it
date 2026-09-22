import fs from 'node:fs';
import path from 'node:path';

const cpuSource = fs.readFileSync(path.resolve('lib/rankedCpuData.ts'), 'utf8');
const gpuSource = fs.readFileSync(path.resolve('lib/rankedGpuData.ts'), 'utf8');
let failed = false;

function validateRankedList(label, source) {
  const entries = [...source.matchAll(/"name":\s*"([^"]+)",\s*"rank":\s*(\d+)/g)]
    .map((match) => ({ name: match[1], rank: Number(match[2]) }));
  const duplicateNames = entries
    .map((entry) => entry.name.toLowerCase())
    .filter((entry, index, all) => all.indexOf(entry) !== index);
  const sequential = entries.every((entry, index) => entry.rank === index + 1);

  console.log(`${label}: ${entries.length} entries`);
  if (!entries.length || duplicateNames.length || !sequential) {
    failed = true;
    if (!entries.length) console.error(`${label} is empty or missing`);
    if (duplicateNames.length) console.error(`duplicate ${label}: ${[...new Set(duplicateNames)].join(', ')}`);
    if (!sequential) console.error(`${label} ranks must be sequential from 1`);
  }
}

validateRankedList('RANKED_CPUS', cpuSource);
validateRankedList('RANKED_GPUS', gpuSource);

if (failed) process.exit(1);
