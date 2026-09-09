import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const run = (args) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!existsSync('node_modules/typescript/bin/tsc')) {
  if (!process.env.npm_execpath) throw Error('Install Node.js and run npm install first.');
  run([process.env.npm_execpath, 'install']);
}
run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.tools.json']);
run(['.data/tools/scripts/setup.js']);
