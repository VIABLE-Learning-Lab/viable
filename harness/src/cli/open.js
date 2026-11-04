import { execFile } from 'node:child_process';

export function openBrowser(url) {
  const [program, ...args] = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];
  execFile(program, args, () => { /* No browser here: the address is printed. */ });
}
