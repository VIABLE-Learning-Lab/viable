// Writes schemas/steps.json from the step manifests (src/agents/steps). Run with `npm run steps:build`;
// never edit the file by hand. VIABLE's API writes the portal's copy from the same manifests.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STEP_MANIFESTS } from '../src/agents/steps/index.js';

export const stepsPath = fileURLToPath(new URL('../schemas/steps.json', import.meta.url));
export const stepsText = () => `${JSON.stringify({ object: 'agent.step_manifests', version: 1, steps: STEP_MANIFESTS }, null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(stepsPath, stepsText());
  console.log(`Wrote ${stepsPath}`);
}
