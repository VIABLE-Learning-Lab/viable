/**
 * viable-engine knowledge refresh <package> --out <folder>: a package's websites read again
 * (knowledgeRefresh.js), with what happened to each. Exits non-zero when a site ended with no pages.
 */
import { parseArgs } from 'node:util';
import { refreshPackage } from '../knowledgeRefresh.js';

export const KNOWLEDGE_USAGE = `  viable-engine knowledge refresh <course.viable.zip | package.json | folder> --out <folder> [--delay <seconds>] [--json]`;

export async function knowledgeCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' }, delay: { type: 'string' }, json: { type: 'boolean' } } });
  const [action, path] = positionals;
  if (action !== 'refresh' || !path || !values.out) throw new Error(`Usage:\n${KNOWLEDGE_USAGE}`);
  const delay = values.delay == null ? null : Number(values.delay);
  if (delay != null && !(delay >= 0)) throw new Error(`--delay takes a number of seconds, not "${values.delay}".`);
  const result = await refreshPackage(path, { out: values.out, ...(delay != null ? { delayMs: delay * 1000 } : {}), log: values.json ? null : (line) => console.error(line) });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const site of result.sites) {
      console.log(`${site.url}: ${site.read} read, ${site.kept} kept from the snapshot, ${site.gone} gone${site.left ? `, ${site.left} left out (the package's 25 MB)` : ''}`);
      if (site.stopped) console.log(`  stopped: ${site.stopped}`);
      for (const page of site.failed) console.log(`  ${page.url}: ${page.reason}`);
    }
    console.log(`\nThe refreshed package is at ${result.path}. Serve that folder, or deploy it.`);
  }
  if (result.sites.some((site) => !site.read && !site.kept)) process.exitCode = 1;
}
