#!/usr/bin/env node
import { fail, harnessMain } from '../src/cli/main.js';

harnessMain(process.argv.slice(2)).catch(fail);
