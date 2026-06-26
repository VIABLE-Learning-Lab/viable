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
 *
 * Templates render `{{ path.or.expression }}` against the same scope.
 */

const TOKEN_PATTERNS = [
  ['ws', /^\s+/],
  ['number', /^\d+(?:\.\d+)?/],
  ['string', /^'(?:\\.|[^'\\])*'|^"(?:\\.|[^"\\])*"/],
  ['op', /^(?:===|!==|==|!=|<=|>=|&&|\|\||[!<>+\-*/%().])/],
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

  parsePrimary() {
    const tok = this.next();
    if (!tok) throw new ExpressionError('Unexpected end of expression');

    if (tok.value === '(') {
      const expr = this.parseLogicalOr();
      this.expect(')');
      return expr;
    }
    if (tok.type === 'number') return { kind: 'literal', value: Number(tok.value) };
    if (tok.type === 'string') return { kind: 'literal', value: unquote(tok.value) };
    if (tok.type === 'ident') {
      if (Object.prototype.hasOwnProperty.call(KEYWORDS, tok.value)) {
        return { kind: 'literal', value: KEYWORDS[tok.value] };
      }
      const path = [tok.value];
      while (this.peek() && this.peek().value === '.') {
        this.next();
        const part = this.next();
        if (!part || part.type !== 'ident') throw new ExpressionError('Expected property name after "."');
        path.push(part.value);
      }
      return { kind: 'path', path };
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

function evalNode(node, scope) {
  switch (node.kind) {
    case 'literal':
      return node.value;
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

/** Render `{{ expr }}` placeholders inside a string. */
export function renderTemplate(template, scope = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const value = evaluateExpression(raw.trim(), scope);
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
    if (whole) return evaluateExpression(whole[1].trim(), scope);
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
