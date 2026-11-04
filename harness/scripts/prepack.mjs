// The repository's license, notice and examples go with the package.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

const repository = new URL('../../', import.meta.url);
const here = new URL('../', import.meta.url);
for (const name of ['LICENSE', 'NOTICE']) copyFileSync(new URL(name, repository), new URL(name, here));
mkdirSync(new URL('examples/', here), { recursive: true });
for (const name of readdirSync(new URL('examples/', repository)).filter((file) => file.endsWith('.json'))) copyFileSync(new URL(`examples/${name}`, repository), new URL(`examples/${name}`, here));
