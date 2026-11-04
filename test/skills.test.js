// The Agent Skills in skills/: valid frontmatter, and only commands and MCP tools that exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../src/mcp.js';

const DIR = new URL('../skills/', import.meta.url);
const SKILLS = ['checking-replies-with-vetting', 'reading-learning-evidence', 'writing-agent-tests', 'writing-how-the-ai-helps'];
const FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const read = (name) => readFileSync(new URL(`${name}/SKILL.md`, DIR), 'utf8');

// The frontmatter's key: value lines, each value a plain YAML scalar (no ": " or " #", which YAML reads otherwise).
function frontmatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(block, 'starts with a --- frontmatter block');
  return Object.fromEntries(block[1].split('\n').map((line) => {
    const [, key, value] = line.match(/^([a-z-]+): (.+)$/) || [];
    assert.ok(key, `"${line}" is a key: value line`);
    assert.ok(!/: | #|^[-?:,[\]{}#&*!|>'"%@`]/.test(value), `${key}'s value is a plain YAML scalar`);
    return [key, value];
  }));
}

test('each skill is a folder with a SKILL.md whose frontmatter names it and says when to use it', () => {
  assert.deepEqual(readdirSync(DIR).sort(), SKILLS);
  for (const name of SKILLS) {
    const fields = frontmatter(read(name));
    for (const key of Object.keys(fields)) assert.ok(FIELDS.has(key), `${name}: ${key} isn't a SKILL.md field`);
    assert.equal(fields.name, name);
    assert.match(fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(fields.name.length <= 64);
    assert.ok(fields.description.length >= 80 && fields.description.length <= 1024, `${name}: description length`);
    assert.match(fields.description, /\bUse when\b/, `${name}: the description says when to use it`);
  }
});

test('every viable-harness command and MCP tool a skill names exists', () => {
  const usage = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url)), '--help'], { encoding: 'utf8' }).stdout;
  const commands = new Set([...usage.matchAll(/^ {2}viable-harness ([a-z-]+)/gm)].map((match) => match[1]));
  assert.ok(commands.has('mcp') && commands.has('check'), usage);
  const tools = new Set(TOOLS.map((tool) => tool.name));
  for (const name of SKILLS) {
    const text = read(name);
    for (const [, command] of text.matchAll(/\bviable-harness ([a-z][a-z-]*)/g)) assert.ok(commands.has(command), `${name}: viable-harness ${command} isn't a command`);
    // A tool is named as "the `check_reply` tool" (or "check_reply MCP tool" in the description).
    const named = [...text.matchAll(/`?\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b`?(?= (?:MCP )?tools?\b)/g)].map((match) => match[1]);
    assert.ok(named.length, `${name} names a tool`);
    for (const tool of named) assert.ok(tools.has(tool), `${name}: ${tool} isn't a tool`);
  }
});
