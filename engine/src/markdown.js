// The Harness's HTML to Markdown, with a full entity decoder, for a local run's Fetch URL steps and knowledge files.
import { decodeHTML, decodeHTMLAttribute } from 'entities';
import { useDecoders } from '../../harness/src/markdown.js';

useDecoders({ text: decodeHTML, attribute: decodeHTMLAttribute });

export { htmlToMarkdown, toMarkdown } from '../../harness/src/markdown.js';
