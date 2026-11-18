// SOLARA BAY — Streets of the Bay: entry program for make.fun gta6-01.
//
// Copies game/ and screenshots/ from this repository into the output
// directory, then writes dossier.json with the kit's buildDossier. Running it
// twice produces byte-identical output: the copies are exact and the dossier
// is a deterministic function of the copied files.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Without MAKEFUN_OUTPUT_DIR it writes to /output, as the grader does.

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function copyFresh(name) {
  const from = join(repoRoot, name);
  const to = join(outDir, name);
  if (!existsSync(from)) throw new Error(`missing ${name}/ in ${repoRoot}`);
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  return to;
}

mkdirSync(outDir, { recursive: true });
copyFresh('game');
copyFresh('screenshots');

const dossier = buildDossier(outDir, dossierCaps);
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossier);
console.log(`SOLARA BAY entry written to ${outDir} (dossier ${dossier.length} bytes)`);
