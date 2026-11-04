// Repairs for the Mermaid flowchart mistakes models make most, tried only after the diagram fails to
// parse (diagram.browser.js), so correct code is never changed. Each one is Mermaid's own documented
// fix: put a label in double quotes when it holds characters Mermaid reads as syntax (parentheses,
// brackets, braces, quotes; a quote inside becomes #quot;), and write the reserved word "end" as "End"
// when it is used as a node rather than to close a subgraph.

const SYNTAX = /[()[\]{}"]/;
const quote = (text) => `"${text.trim().replace(/"/g, '#quot;')}"`;
const quoted = (text) => /^\s*".*"\s*$/.test(text);
const fix = (text) => (SYNTAX.test(text) && !quoted(text) ? quote(text) : null);
const ARROW = '(?:-->|---|-\\.->|-\\.-|==>|===|--x|--o|<-->)';
const SKIP = /^\s*(?:%%|subgraph\b|end\s*$|classDef\b|class\b|style\b|linkStyle\b|click\b|direction\b)/;

export function repairMermaid(code) {
  const lines = String(code).split('\n');
  const first = lines.find((line) => line.trim() && !line.trim().startsWith('%%')) || '';
  if (!/^\s*(?:flowchart|graph)\b/.test(first)) return code;
  return lines.map((line) => {
    if (line === first || SKIP.test(line)) return line;
    let out = line
      // Edge labels: -->|Yes (maybe)| B
      .replace(/\|([^|\n]+)\|/g, (whole, label) => { const q = fix(label); return q ? `|${q}|` : whole; })
      // Boxes A[…], diamonds A{…} and rounded boxes A(…), in their simple single-bracket forms.
      .replace(/\b(\w+)\[(?![[(/\\])([^\]\n]*)\](?!\])/g, (whole, id, label) => { const q = fix(label); return q ? `${id}[${q}]` : whole; })
      .replace(/\b(\w+)\{(?!\{)([^}\n]*)\}(?!\})/g, (whole, id, label) => { const q = fix(label); return q ? `${id}{${q}}` : whole; })
      .replace(/\b(\w+)\((?![([])([^)\n]*)\)(?!\))/g, (whole, id, label) => { const q = fix(label); return q ? `${id}(${q})` : whole; });
    out = out
      .replace(new RegExp(`(${ARROW}(?:\\|[^|\\n]*\\|)?\\s*)end\\b`, 'g'), '$1End')
      .replace(new RegExp(`^(\\s*)end(\\s*${ARROW})`), '$1End$2');
    return out;
  }).join('\n');
}
