// Generate Chrome extension icons (16/32/48/128) from logo.png at the repo root.
// Uses 'cover' so the rectangular source is center-cropped to a square — the
// circular logo sits centered in the source so cover keeps it tight in frame
// at every size. (contain would letter-box and shrink it inside transparent bars.)
//
// Run: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'logo.png');
const outDir = resolve(root, 'src/assets/icons');
const sizes = [16, 32, 48, 128];

mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const out = resolve(outDir, `icon-${size}.png`);
  await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(out);
  console.log(`  ✓ ${out.replace(root + '\\', '').replace(root + '/', '')}`);
}
