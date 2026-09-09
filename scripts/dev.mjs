import { spawn, spawnSync } from 'node:child_process';
const first = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'backend/tsconfig.json'],
  { stdio: 'inherit', windowsHide: true },
);
if (first.status) process.exit(first.status);
const commands = [
  [
    'node_modules/typescript/bin/tsc',
    '-p',
    'backend/tsconfig.json',
    '--watch',
    '--preserveWatchOutput',
  ],
  ['--watch', 'dist/backend/src/server.js'],
  [
    'node_modules/vite/bin/vite.js',
    '--config',
    'frontend/vite.config.ts',
    '--configLoader',
    'native',
  ],
];
const children = commands.map((args) =>
  spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true }),
);
const stop = () => {
  for (const c of children) c.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) =>
  c.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
  }),
);
