// Mode développement : navigateur recompilé à la volée + serveur relancé à chaque modification.
import { spawn } from 'node:child_process';

const opts = { stdio: 'inherit', shell: process.platform === 'win32' };
const procs = [
  spawn('node', ['scripts/build.mjs', '--watch'], opts),
  spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], opts),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
