// The knowledge files a local run reads: plain text formats as they are, HTML as Markdown. VIABLE's API
// packages a text copy (a file's text_path) of any other knowledge file, so a local run can search it.
export const TEXT_FORMATS = new Set(['txt', 'md', 'markdown', 'mdx', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'log', 'rst', 'tex', 'srt', 'vtt']);
export const HTML_FORMATS = new Set(['html', 'htm']);

export const extensionOf = (name) => /\.([A-Za-z0-9]{1,8})$/.exec(String(name))?.[1].toLowerCase() || '';
export const readsAsText = (name) => TEXT_FORMATS.has(extensionOf(name)) || HTML_FORMATS.has(extensionOf(name));
