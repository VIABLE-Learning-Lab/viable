// LaTeX to native MathML for chat page math (temml), loaded the first time a reply contains math.
// MathML needs no fonts or stylesheets in current browsers. See render.browser.js.
import temml from 'temml';

window.ViableMath = temml;
