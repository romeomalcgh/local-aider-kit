$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Has-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Has-Command 'winget')) {
    throw 'Install App Installer / winget from Microsoft Store, then retry.'
}

if (-not (Has-Command 'ollama')) {
    winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
}
if (-not (Has-Command 'uv')) {
    winget install --id astral-sh.uv --exact --accept-package-agreements --accept-source-agreements
}

# Refresh PATH after package installation.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path','User')

if (-not (Has-Command 'ollama')) {
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $candidate) { $env:Path += ';' + (Split-Path $candidate) }
}
if (-not (Has-Command 'ollama')) {
    throw 'Ollama was installed or attempted, but is not on PATH. Reopen PowerShell and rerun setup.ps1.'
}
if (-not (Has-Command 'uv')) {
    throw 'uv is not on PATH. Reopen PowerShell and rerun setup.ps1.'
}

uv tool install --python 3.12 aider-chat
if ($LASTEXITCODE -ne 0) { throw 'Aider installation failed.' }

ollama pull huihui_ai/qwen3-abliterated:8b
if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Check the model name and network, then retry.' }

Write-Host 'Setup complete. Run launch.bat to start Aider.' -ForegroundColor Green
