/**
 * Safe expression evaluator + template renderer for the agent engine.
 *
 * Deliberately tiny and self-contained — NEVER uses `eval`/`Function`. Supports
 * a read-only expression grammar over a scope object:
 *
 *   literals:    true false null numbers 'strings' "strings"
 *   paths:       router.json.use_image   vars.count   input
 *   unary:       !expr   -expr
 *   arithmetic:  + - * / %
 *   relational:  < > <= >=
 *   equality:    == != === !==
 *   logical:     && ||
 *   choice:      cond ? a : b        (only the chosen side is evaluated)
 *   grouping:    ( ... )
 *   lists, maps: [a, b]   {key: value, "other key": value}
 *   index:       items[0]   items[-1]   map["key"]   items[i].prompt
 *   functions:   a fixed allowlist of pure helpers (FUNCTIONS below), e.g. len, default, if,
 *                where, pluck, count, and_list
 *
 * Templates render `{{ path.or.expression }}` against the same scope.
 */

const TOKEN_PATTERNS = [
  ['ws', /^\s+/],
  ['number', /^\d+(?:\.\d+)?/],
  ['string', /^'(?:\\.|[^'\\])*'|^"(?:\\.|[^"\\])*"/],
  ['op', /^(?:===|!==|==|!=|<=|>=|&&|\|\||[!<>+\-*/%().,?:[\]{}])/],
  ['ident', /^[A-Za-z_$][A-Za-z0-9_$]*/]
];

const KEYWORDS = { true: true, false: false, null: null };

function tokenize(input) {
  const tokens = [];
  let rest = String(input);
  while (rest.length) {
    let matched = false;
    for (const [type, re] of TOKEN_PATTERNS) {
      const m = re.exec(rest);
      if (!m) continue;
      matched = true;
      if (type !== 'ws') tokens.push({ type, value: m[0] });
      rest = rest.slice(m[0].length);
      break;
    }
    if (!matched) {
      throw new ExpressionError(`Unexpected token near "${rest.slice(0, 12)}"`);
    }
  }
  return tokens;
}

export class ExpressionError extends Error {}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }

  expect(value) {
    const tok = this.next();
    if (!tok || tok.value !== value) {
      throw new ExpressionError(`Expected "${value}"`);
    }
  }

  parse() {
    const node = this.parseConditional();
    if (this.pos < this.tokens.length) {
      throw new ExpressionError(`Unexpected trailing token "${this.peek().value}"`);
    }
    return node;
  }

  parseBinary(nextFn, operators) {
    let left = nextFn();
    while (this.peek() && operators.includes(this.peek().value)) {
      const op = this.next().value;
      const right = nextFn();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  // cond ? a : b, right-associative and below ||, as in JavaScript.
  parseConditional() {
    const test = this.parseLogicalOr();
    if (this.peek()?.value !== '?') return test;
    this.next();
    const then = this.parseConditional();
    this.expect(':');
    return { kind: 'conditional', test, then, otherwise: this.parseConditional() };
  }

  parseLogicalOr() { return this.parseBinary(() => this.parseLogicalAnd(), ['||']); }
  parseLogicalAnd() { return this.parseBinary(() => this.parseEquality(), ['&&']); }
  parseEquality() { return this.parseBinary(() => this.parseRelational(), ['==', '!=', '===', '!==']); }
  parseRelational() { return this.parseBinary(() => this.parseAdditive(), ['<', '>', '<=', '>=']); }
  parseAdditive() { return this.parseBinary(() => this.parseMultiplicative(), ['+', '-']); }
  parseMultiplicative() { return this.parseBinary(() => this.parseUnary(), ['*', '/', '%']); }

  parseUnary() {
    const tok = this.peek();
    if (tok && (tok.value === '!' || tok.value === '-')) {
      this.next();
      return { kind: 'unary', op: tok.value, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  // Member and index access after an atom: first(items).title, (a || b).name, items[0].prompt
  parsePrimary() {
    let node = this.parseAtom();
    for (;;) {
      const tok = this.peek()?.value;
      if (tok === '[') {
        this.next();
        const index = this.parseConditional();
        this.expect(']');
        node = { kind: 'index', object: node, index };
      } else if (tok === '.' && !node.bare) {
        this.next();
        const part = this.next();
        if (!part || part.type !== 'ident') throw new ExpressionError('Expected property name after "."');
        node = { kind: 'member', object: node, name: part.value };
      } else {
        return node;
      }
    }
  }

  // Comma-separated items up to `close`; a trailing comma is allowed.
  parseItems(close, parseItem) {
    const items = [];
    while (this.peek()?.value !== close) {
      items.push(parseItem());
      if (this.peek()?.value !== ',') break;
      this.next();
    }
    this.expect(close);
    return items;
  }

  parseAtom() {
    const tok = this.next();
    if (!tok) throw new ExpressionError('Unexpected end of expression');

    if (tok.value === '(') {
      const expr = this.parseConditional();
      this.expect(')');
      return { kind: 'group', expr };
    }
    if (tok.value === '[') return { kind: 'list', items: this.parseItems(']', () => this.parseConditional()) };
    if (tok.value === '{') {
      return {
        kind: 'map',
        entries: this.parseItems('}', () => {
          const key = this.next();
          if (!key || (key.type !== 'ident' && key.type !== 'string')) throw new ExpressionError('Expected a key name in {…}');
          const name = key.type === 'string' ? unquote(key.value) : key.value;
          if (name === '__proto__') throw new ExpressionError('"__proto__" cannot be a key');
          this.expect(':');
          return [name, this.parseConditional()];
        })
      };
    }
    if (tok.type === 'number') return { kind: 'literal', value: Number(tok.value) };
    if (tok.type === 'string') return { kind: 'literal', value: unquote(tok.value) };
    if (tok.type === 'ident') {
      if (Object.prototype.hasOwnProperty.call(KEYWORDS, tok.value)) {
        return { kind: 'literal', value: KEYWORDS[tok.value] };
      }
      if (this.peek()?.value === '(') {
        if (!Object.hasOwn(FUNCTIONS, tok.value)) throw new ExpressionError(`Unknown function "${tok.value}"`);
        this.next();
        return { kind: 'call', name: tok.value, args: this.parseItems(')', () => this.parseConditional()) };
      }
      const path = [tok.value];
      while (this.peek() && this.peek().value === '.') {
        this.next();
        const part = this.next();
        if (!part || part.type !== 'ident') throw new ExpressionError('Expected property name after "."');
        path.push(part.value);
      }
      return { kind: 'path', path, bare: true };
    }
    throw new ExpressionError(`Unexpected token "${tok.value}"`);
  }
}

function unquote(raw) {
  return raw.slice(1, -1).replace(/\\(.)/g, '$1');
}

// Own properties only: a path never reaches a prototype ("name.constructor" is nothing).
export function resolvePath(scope, path) {
  let current = scope;
  for (const key of path) {
    if (current == null || !Object.hasOwn(Object(current), key)) return undefined;
    current = current[key];
  }
  return current;
}

const text = (value) => (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
const list = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
const MAX_LIST = 1000;
// An item's own field, by name or dotted path ("source.number"); never inherited properties.
const field = (item, name) => {
  let current = item;
  for (const key of text(name).split('.')) {
    if (current == null || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
};
// Models write 2 or "2" for the same thing, so plain values compare by their text.
const same = (a, b) => a === b || (a != null && b != null && typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b));
const isEmpty = (x) => x == null || (typeof x === 'string' ? !x.trim() : Array.isArray(x) ? !x.length : typeof x === 'object' && !Object.keys(x).length);
const matches = (args) => (item) => (args.length > 2 ? same(field(item, args[1]), args[2]) : Boolean(field(item, args[1])));
const byValue = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : text(a).localeCompare(text(b)));
// Pure, bounded helpers only: no I/O, no callbacks, no access beyond their arguments.
const FUNCTIONS = Object.freeze({
  len: (x) => (x == null ? 0 : typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).length : (Array.isArray(x) ? x : String(x)).length),
  lower: (s) => text(s).toLowerCase(),
  upper: (s) => text(s).toUpperCase(),
  trim: (s) => text(s).trim(),
  contains: (a, b) => (Array.isArray(a) ? a.includes(b) : text(a).toLowerCase().includes(text(b).toLowerCase())),
  join: (items, sep = ', ') => list(items).map(text).join(text(sep)),
  split: (s, sep = ',') => text(s).split(text(sep)).map((part) => part.trim()).filter(Boolean).slice(0, 1000),
  default: (a, b) => (a == null || a === '' ? b : a),
  number: (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; },
  string: (x) => text(x),
  json: (x) => text(x),
  round: (n, d = 0) => { const f = 10 ** Math.max(0, Math.min(10, Number(d) || 0)); return Math.round(Number(n) * f) / f; },
  min: (a, b) => Math.min(Number(a), Number(b)),
  max: (a, b) => Math.max(Number(a), Number(b)),
  first: (items) => list(items)[0],
  last: (items) => list(items).at(-1),
  slice: (x, a = 0, b) => (Array.isArray(x) ? x : text(x)).slice(Number(a) || 0, b == null ? undefined : Number(b)),
  keys: (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj) : []),
  append: (items, item) => [...list(items), item].slice(-1000),
  now: () => new Date().toISOString(),
  // if(cond, a, b) is evaluated lazily in evalNode; this body only runs for a direct call.
  if: (cond, a, b) => (cond ? a : b),
  empty: (x) => isEmpty(x),
  count: (...args) => (args.length > 1 ? list(args[0]).filter(matches(args)).length : list(args[0]).length),
  where: (...args) => list(args[0]).filter(matches(args)),
  // without(list, "field", value): the items whose field isn't value (or isn't set, without one).
  without: (...args) => list(args[0]).filter((item) => !matches(args)(item)),
  find: (...args) => list(args[0]).find(matches(args)),
  pluck: (items, name) => list(items).map((item) => field(item, name)),
  sum: (items, name) => list(items).reduce((total, item) => total + (Number(name == null ? item : field(item, name)) || 0), 0),
  numbers: (from, to) => {
    const start = Math.trunc(Number(from)) || 0;
    const end = Math.trunc(Number(to)) || 0;
    const step = end >= start ? 1 : -1;
    return Array.from({ length: Math.min(MAX_LIST, Math.abs(end - start) + 1) }, (_, i) => start + i * step);
  },
  compact: (items) => list(items).filter((item) => item != null && item !== '' && item !== false),
  unique: (items) => {
    const seen = new Set();
    return list(items).filter((item) => { const key = typeof item === 'object' ? text(item) : `${typeof item}:${item}`; return !seen.has(key) && seen.add(key); });
  },
  sort: (items, name) => [...list(items)].sort((a, b) => (name == null ? byValue(a, b) : byValue(field(a, name), field(b, name)))),
  reverse: (items) => [...list(items)].reverse(),
  concat: (a, b) => [...list(a), ...list(b)].slice(0, MAX_LIST),
  merge: (a, b) => {
    const out = {};
    for (const source of [a, b]) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
      for (const [key, value] of Object.entries(source)) if (key !== '__proto__') out[key] = value;
    }
    return out;
  },
  // and_list([1, 2, 3]) → "1, 2 and 3"; and_list(names, "or") → "a or b"
  and_list: (items, word = 'and') => {
    const parts = list(items).filter((item) => item != null && item !== '').map(text);
    return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${text(word)} ${parts.at(-1)}`;
  },
  // plural(2, "picture") → "pictures"; plural(1, "child", "children") → "child"
  plural: (n, one, many) => (Number(n) === 1 ? text(one) : many == null ? `${text(one)}s` : text(many)),
  capitalize: (s) => { const t = text(s); return t.charAt(0).toUpperCase() + t.slice(1); }
});

function evalNode(node, scope) {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'call':
      if (node.name === 'if') {
        const [cond, then, otherwise] = node.args;
        return evalNode(cond, scope) ? (then ? evalNode(then, scope) : undefined) : (otherwise ? evalNode(otherwise, scope) : undefined);
      }
      return FUNCTIONS[node.name](...node.args.map((arg) => evalNode(arg, scope)));
    case 'conditional':
      return evalNode(node.test, scope) ? evalNode(node.then, scope) : evalNode(node.otherwise, scope);
    case 'group':
      return evalNode(node.expr, scope);
    case 'list':
      return node.items.map((item) => evalNode(item, scope));
    case 'map':
      return Object.fromEntries(node.entries.map(([key, value]) => [key, evalNode(value, scope)]));
    case 'member': {
      const object = evalNode(node.object, scope);
      return object == null || !Object.hasOwn(Object(object), node.name) ? undefined : object[node.name];
    }
    case 'index': {
      const object = evalNode(node.object, scope);
      const key = evalNode(node.index, scope);
      if (object == null) return undefined;
      if ((Array.isArray(object) || typeof object === 'string') && typeof key === 'number') return Number.isInteger(key) ? object.at(key) : undefined;
      return typeof key === 'string' || typeof key === 'number' ? (Object.hasOwn(Object(object), key) ? object[key] : undefined) : undefined;
    }
    case 'path':
      return resolvePath(scope, node.path);
    case 'unary': {
      const v = evalNode(node.operand, scope);
      return node.op === '!' ? !v : -Number(v);
    }
    case 'binary': {
      if (node.op === '&&') return evalNode(node.left, scope) && evalNode(node.right, scope);
      if (node.op === '||') return evalNode(node.left, scope) || evalNode(node.right, scope);
      const l = evalNode(node.left, scope);
      const r = evalNode(node.right, scope);
      switch (node.op) {
        case '==': return l == r; // eslint-disable-line eqeqeq
        case '!=': return l != r; // eslint-disable-line eqeqeq
        case '===': return l === r;
        case '!==': return l !== r;
        case '<': return l < r;
        case '>': return l > r;
        case '<=': return l <= r;
        case '>=': return l >= r;
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        default: throw new ExpressionError(`Unknown operator "${node.op}"`);
      }
    }
    default:
      throw new ExpressionError(`Unknown node kind "${node.kind}"`);
  }
}

const AST_CACHE = new Map();

function compile(expr) {
  if (AST_CACHE.has(expr)) return AST_CACHE.get(expr);
  const ast = new Parser(tokenize(expr)).parse();
  if (AST_CACHE.size > 500) AST_CACHE.clear();
  AST_CACHE.set(expr, ast);
  return ast;
}

/** The parsed form of an expression (its syntax tree), for tools that read graphs; throws ExpressionError. */
export function parseExpression(expr) {
  return compile(String(expr));
}

/** Evaluate an expression string against a scope. Returns the raw value. */
export function evaluateExpression(expr, scope = {}) {
  if (expr == null || expr === '') return undefined;
  if (typeof expr !== 'string') return expr;
  return evalNode(compile(expr), scope);
}

/** Evaluate an expression and coerce to a boolean. */
export function evaluateCondition(expr, scope = {}) {
  return Boolean(evaluateExpression(expr, scope));
}

/** The paths an expression reads (vars.count, router.json.route), in order, for a step's trace. */
export function expressionPaths(expr) {
  if (typeof expr !== 'string' || !expr) return [];
  const paths = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'path') paths.push(node.path.join('.'));
    const children = [node.operand, node.left, node.right, node.expr, node.object, node.index, node.test, node.then, node.otherwise];
    for (const child of [...children, ...(node.args || []), ...(node.items || []), ...(node.entries || []).map((entry) => entry[1])]) visit(child);
  };
  visit(compile(expr));
  return [...new Set(paths)];
}

// Context fields a step reads only by naming them, as a VETTING step names a question's answer key
// ({{context.answer_key}}): left out wherever the whole context is written out ({{context}}, a step's
// "include context"), so a step that talks to the learner can't be handed the key by accident.
export const SEALED_CONTEXT = ['answer_key'];
export function openContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return context;
  const out = { ...context };
  for (const key of SEALED_CONTEXT) delete out[key];
  return out;
}
const evaluateOpen = (expr, scope) => (expr === 'context' ? openContext(evaluateExpression(expr, scope)) : evaluateExpression(expr, scope));

// The end of the `{{ … }}` opened at `start`: the first `}}` outside quotes and `{…}` maps, so
// `{{ {a: 1} }}` and `{{ default(x, "}") }}` work. Unbalanced text falls back to the first `}}`.
function closingBraces(template, start) {
  let depth = 0;
  let quote = '';
  for (let i = start; i < template.length; i += 1) {
    const ch = template[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '}' && depth === 0 && template[i + 1] === '}') {
      return i;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    }
  }
  return template.indexOf('}}', start);
}

/** The `{{ … }}` placeholders in a template, in order: [{ start, end, expr }] (end is past the `}}`). */
export function templateExpressions(template) {
  const found = [];
  if (typeof template !== 'string') return found;
  let from = 0;
  for (;;) {
    const start = template.indexOf('{{', from);
    if (start < 0) return found;
    const close = closingBraces(template, start + 2);
    if (close < 0) return found;
    const expr = template.slice(start + 2, close).trim();
    if (expr) found.push({ start, end: close + 2, expr });
    from = expr ? close + 2 : start + 2;
  }
}

/** Render `{{ expr }}` placeholders inside a string. */
export function renderTemplate(template, scope = {}) {
  if (typeof template !== 'string') return template;
  let out = '';
  let at = 0;
  for (const { start, end, expr } of templateExpressions(template)) {
    const value = evaluateOpen(expr, scope);
    out += template.slice(at, start) + (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
    at = end;
  }
  return out + template.slice(at);
}

/** Deep-render templates inside strings/arrays/objects. */
export function renderValue(value, scope = {}) {
  if (typeof value === 'string') {
    // A lone `{{ expr }}` returns the raw (possibly non-string) value.
    const trimmed = value.trim();
    const parts = templateExpressions(trimmed);
    if (parts.length === 1 && parts[0].start === 0 && parts[0].end === trimmed.length) return evaluateOpen(parts[0].expr, scope);
    return renderTemplate(value, scope);
  }
  if (Array.isArray(value)) return value.map((item) => renderValue(item, scope));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderValue(v, scope);
    return out;
  }
  return value;
}
