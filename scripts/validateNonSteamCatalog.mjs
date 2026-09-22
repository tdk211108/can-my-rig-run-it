import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('lib/nonSteamGames.ts'), 'utf8');
const ids = [...source.matchAll(/game\('([^']+)'/g)].map((match) => `local:${match[1]}`);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

console.log(`Non-Steam catalog: ${ids.length} games`);
if (!ids.length || duplicates.length) {
  if (!ids.length) console.error('No local game entries found');
  if (duplicates.length) console.error(`Duplicate ids: ${[...new Set(duplicates)].join(', ')}`);
  process.exit(1);
}

if (!source.includes('rawHtml:')) {
  console.error('Requirement helper does not provide rawHtml');
  process.exit(1);
}
