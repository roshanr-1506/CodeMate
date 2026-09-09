$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeExecutable = $nodeCommand.Source } else {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $nodeExecutable = $bundledNode } else { throw 'Install Node.js 22.18 or newer from nodejs.org, then run this launcher again.' }
}
if (!(Test-Path 'node_modules')) { throw 'Run npm install, npm run setup and npm run build once before using the launcher.' }
if (!(Test-Path '.env')) { & $nodeExecutable scripts/bootstrap.mjs; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
if (!(Test-Path 'dist/frontend/index.html')) {
    & $nodeExecutable node_modules/typescript/bin/tsc -p backend/tsconfig.json
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
    & $nodeExecutable node_modules/vite/bin/vite.js build --config frontend/vite.config.ts --configLoader native
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
Write-Host 'CodeMate is starting. Open http://127.0.0.1:3001'
& $nodeExecutable scripts/local.mjs
