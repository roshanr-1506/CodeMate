import { fork, spawn } from 'node:child_process';
const server = fork('.data/tools/tests/e2e-server.js', [], {
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  windowsHide: true,
});
let ready = false;
for (let i = 0; i < 100; i++) {
  if (server.exitCode !== null) throw Error('Browser-test server failed to start.');
  try {
    if ((await fetch('http://127.0.0.1:3101/health')).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
if (!ready) {
  server.kill();
  throw Error('Browser-test server did not become ready.');
}
const test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, CODEMATE_E2E_EXTERNAL: '1' },
});
const code = await new Promise((r) => test.on('exit', r));
server.send('stop');
await new Promise((r) => {
  const timer = setTimeout(() => {
    server.kill();
    r();
  }, 5000);
  server.once('exit', () => {
    clearTimeout(timer);
    r();
  });
});
process.exit(code ?? 1);
