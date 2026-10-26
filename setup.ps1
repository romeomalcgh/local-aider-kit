$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Has-Command($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Check-Exit($message) { if ($LASTEXITCODE -ne 0) { throw $message } }

if (-not (Has-Command 'winget')) { throw 'Install App Installer / winget from Microsoft Store, then retry.' }
if (-not (Has-Command 'ollama')) { winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements; Check-Exit 'Ollama installation failed.' }
if (-not (Has-Command 'uv')) { winget install --id astral-sh.uv --exact --accept-package-agreements --accept-source-agreements; Check-Exit 'uv installation failed.' }
if (-not (Has-Command 'node') -or -not (Has-Command 'npm')) { winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements; Check-Exit 'Node.js LTS installation failed.' }

# Refresh PATH after package installation.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
if (-not (Has-Command 'ollama')) {
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $candidate) { $env:Path += ';' + (Split-Path $candidate) }
}
foreach ($command in @('ollama','uv','node','npm')) {
    if (-not (Has-Command $command)) { throw "$command is not on PATH. Reopen PowerShell and rerun setup.ps1." }
}

Write-Host 'Installing Aider...' -ForegroundColor Cyan
uv tool install --python 3.12 aider-chat
if ($LASTEXITCODE -ne 0) { throw 'Aider installation failed.' }

Write-Host 'Downloading the local abliterated model (several GB)...' -ForegroundColor Cyan
ollama pull huihui_ai/qwen3-abliterated:8b
if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Check the model name and network, then rerun setup.ps1.' }

Write-Host 'Installing browser UI dependencies and building the UI...' -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot 'browser-ui')
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'Browser UI dependency installation failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Browser UI production build failed.' }
} finally {
    Pop-Location
}
Write-Host 'Setup complete. Run launch.bat to open the browser UI at http://localhost:3000.' -ForegroundColor Green
