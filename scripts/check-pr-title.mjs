// A pull request's title becomes its squash commit's subject, so it follows Conventional Commits:
// type(scope)!: description, the scope optional. node scripts/check-pr-title.mjs "title" | --self-test
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'perf', 'chore', 'ci'];
const pattern = new RegExp(`^(${TYPES.join('|')})(\\([a-z][a-z0-9-]*\\))?!?: \\S(?:[^\\r\\n]*\\S)?$`);
export const isValid = (title) => !/[\r\n]/.test(title) && pattern.test(title);

if (process.argv[2] === '--self-test') {
  for (const type of TYPES) assert.ok(isValid(`${type}(vetting): check replies against an answer key`), type);
  for (const title of ['fix: handle an empty reply', 'feat(formats)!: rename course package refs', 'docs(mcp-server): add client setup']) assert.ok(isValid(title), title);
  for (const title of ['', 'Add a component', 'unknown(x): y', 'Fix(x): y', 'fix(): y', 'fix(Big Scope): y', 'fix(x):', 'fix(x): ', 'fix(x):  y', 'fix(x): y ', 'fix(x): a\nb', 'fix(x) y']) {
    assert.equal(isValid(title), false, JSON.stringify(title));
  }
  console.log('PR title self-test passed.');
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const title = process.argv[2] ?? process.env.PR_TITLE ?? '';
  if (isValid(title)) console.log('PR title format passed.');
  else {
    console.error(`"${title}" isn't type(scope): description, e.g. "fix(vetting): keep the reviewer's reason" or "docs: fix a link".`);
    console.error(`Types: ${TYPES.join(', ')}. The scope is optional, lowercase kebab-case; add ! before the colon for a breaking change.`);
    process.exitCode = 1;
  }
}
