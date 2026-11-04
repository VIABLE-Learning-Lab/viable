// Every commit in a pull request carries a Signed-off-by line for its author (the Developer
// Certificate of Origin, CONTRIBUTING.md). node scripts/check-dco.mjs <base> <head>
import { execFileSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
const log = execFileSync('git', ['log', '--no-merges', '--format=%H%x00%an%x00%ae%x00%B%x01', `${base}..${head}`], { encoding: 'utf8' });
const missing = log.split('\x01').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const [sha, name, email, body] = entry.split('\x00');
  if (/\[bot\]@users\.noreply\.github\.com$/i.test(email)) return null; // Dependabot and other apps sign off as themselves
  const signed = [...body.matchAll(/^Signed-off-by: (.+) <([^>]+)>$/gim)].some((match) => match[2].toLowerCase() === email.toLowerCase());
  return signed ? null : `${sha.slice(0, 7)} by ${name} <${email}>`;
}).filter(Boolean);
if (missing.length) {
  console.error(`These commits have no Signed-off-by line for their author:\n${missing.map((line) => `  ${line}`).join('\n')}`);
  console.error('Sign them off with: git rebase --signoff ' + base + ' && git push --force-with-lease');
  process.exitCode = 1;
} else console.log('Every commit is signed off.');
