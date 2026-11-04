// The repository's license and notice go with the package.
import { copyFileSync } from 'node:fs';

for (const name of ['LICENSE', 'NOTICE']) copyFileSync(new URL(`../../${name}`, import.meta.url), new URL(`../${name}`, import.meta.url));
