// Syntax highlighting for chat page code blocks (highlight.js with its common languages), loaded the
// first time a reply contains code. See render.browser.js.
import hljs from 'highlight.js/lib/common';

hljs.configure({ ignoreUnescapedHTML: true });
window.ViableHighlight = hljs;
