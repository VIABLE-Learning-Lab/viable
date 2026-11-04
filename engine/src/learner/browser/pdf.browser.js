/*
 * pdf.js for an activity's Reading panel (workspace/reading.js), as a classic script the page
 * loads only when it has one: window.ViablePdf. Its worker and data files are static assets beside it
 * (scripts/build-learner-assets.mjs).
 */
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';

window.ViablePdf = pdfjs;
