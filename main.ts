// SOLARA BAY entry program (Node 22, standard library only): copies game/
// and screenshots/ into the output directory and writes dossier.json with
// the kit's buildDossier, exactly as the scorer re-derives it. The repo
// root comes from this file's own location, never from the process working
// directory: the grader runs this program from a different working
// directory, and a working-directory root would crash with a missing
// folder error.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  if (existsSync(src)) cpSync(src, dst, { recursive: true });
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
copyTree(join(here, 'game'), join(outDir, 'game'));
copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('dossier written: ' + dossier.length + ' bytes');
