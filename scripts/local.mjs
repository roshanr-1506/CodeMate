import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('dist/backend/src/server.js') || !existsSync('dist/frontend/index.html'))
  throw Error('Run npm run setup and npm run build first.');
const port = process.env.PORT || '3001';
const child = spawn(process.execPath, ['dist/backend/src/server.js'], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, NODE_ENV: 'development', FRONTEND_URL: 'http://127.0.0.1:' + port },
});
console.log('Open http://127.0.0.1:' + port + ' in your browser. Press Ctrl+C to stop.');
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
child.on('exit', (code) => process.exit(code ?? 0));
