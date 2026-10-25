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
 *   grouping:    ( ... )
 *   functions:   len(x) lower(s) upper(s) trim(s) contains(a, b) join(list, sep)
 *                split(s, sep) default(a, b) number(x) string(x) json(x) round(n, d)
 *                min(a, b) max(a, b) first(list) last(list) slice(x, a, b) keys(obj)
 *                append(list, item) now()  — a fixed allowlist of pure helpers
 *
 * Templates render `{{ path.or.expression }}` against the same scope.
 */

const TOKEN_PATTERNS = [
  ['ws', /^\s+/],
  ['number', /^\d+(?:\.\d+)?/],
  ['string', /^'(?:\\.|[^'\\])*'|^"(?:\\.|[^"\\])*"/],
  ['op', /^(?:===|!==|==|!=|<=|>=|&&|\|\||[!<>+\-*/%().,])/],
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
    const node = this.parseLogicalOr();
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

  // Member access after a call or group: first(items).title, (a || b).name
  parsePrimary() {
    let node = this.parseAtom();
    while (!node.bare && this.peek()?.value === '.') {
      this.next();
      const part = this.next();
      if (!part || part.type !== 'ident') throw new ExpressionError('Expected property name after "."');
      node = { kind: 'member', object: node, name: part.value };
    }
    return node;
  }

  parseAtom() {
    const tok = this.next();
    if (!tok) throw new ExpressionError('Unexpected end of expression');

    if (tok.value === '(') {
      const expr = this.parseLogicalOr();
      this.expect(')');
      return { kind: 'group', expr };
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
        const args = [];
        if (this.peek()?.value !== ')') {
          do args.push(this.parseLogicalOr());
          while (this.peek()?.value === ',' && this.next());
        }
        this.expect(')');
        return { kind: 'call', name: tok.value, args };
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

export function resolvePath(scope, path) {
  let current = scope;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

const text = (value) => (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
const list = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
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
  now: () => new Date().toISOString()
});

function evalNode(node, scope) {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'call':
      return FUNCTIONS[node.name](...node.args.map((arg) => evalNode(arg, scope)));
    case 'group':
      return evalNode(node.expr, scope);
    case 'member': {
      const object = evalNode(node.object, scope);
      return object == null || !Object.hasOwn(Object(object), node.name) ? undefined : object[node.name];
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

/** Render `{{ expr }}` placeholders inside a string. */
export function renderTemplate(template, scope = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const value = evaluateOpen(raw.trim(), scope);
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

/** Deep-render templates inside strings/arrays/objects. */
export function renderValue(value, scope = {}) {
  if (typeof value === 'string') {
    // A lone `{{ expr }}` returns the raw (possibly non-string) value.
    const whole = /^\{\{([^}]+)\}\}$/.exec(value.trim());
    if (whole) return evaluateOpen(whole[1].trim(), scope);
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
