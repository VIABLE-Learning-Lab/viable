// viable-harness records export and forget, inside the container, on the volume it keeps what it keeps in.
import { forgetCommand, recordsCommand } from './vendor/harness/src/cli/records.js';

const [command, ...rest] = process.argv.slice(2);
await (command === 'forget' ? forgetCommand(rest) : recordsCommand(process.argv.slice(2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
