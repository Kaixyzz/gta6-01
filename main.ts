// SOLARA BAY entrypoint: copies game/ and screenshots/ into the output
// directory and writes dossier.json with the kit's buildDossier.
//
// The repo root is derived from this file's own location, never from
// process.cwd(): the grader runs `node /bot/main.ts` from a different
// working directory, and a cwd-based root crashes with ENOENT.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function copyTree(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    const st = statSync(s);
    if (st.isDirectory()) copyTree(s, d);
    else if (st.isFile()) cpSync(s, d);
  }
}

mkdirSync(outDir, { recursive: true });
copyTree(join(here, 'game'), join(outDir, 'game'));
copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
