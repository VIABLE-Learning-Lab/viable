// After `npm install` in a clone, or from GitHub: builds the learner pages' browser files when the build
// tools are here. Without them (--omit=dev) the pages still work, as plain text and without Reading panels.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  await import('esbuild');
} catch {
  console.warn('The learner pages\' browser files were not built: their build tools aren\'t installed (npm run build:assets needs the dev dependencies).');
  process.exit(0);
}
execFileSync(process.execPath, [fileURLToPath(new URL('build-learner-assets.mjs', import.meta.url))], { stdio: 'inherit' });
