# Local Aider Kit

A Windows installer and browser UI for Aider + Ollama using the local model `huihui_ai/qwen3-abliterated:8b`. AI inference and source-code editing happen on your PC; no hosted AI API key is required.

## Install

Run `LocalAiderKit-Setup.exe`, or run this from PowerShell in the repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Setup installs or locates Ollama, uv, Node.js LTS, Aider and the local model, then installs and builds the browser UI.

## Launch

Run `launch.bat`. It opens the browser UI at http://localhost:3000. Choose your project folder in Settings. The default is `C:\Games\Chair\CS2\Qwen` if that folder exists; otherwise `Documents\AiderWorkspace` is created so the installer repository is not the default writable project.

## Browser UI

All application source, local backend and Cloudflare sync files are contained under `browser-ui\`.

For development:

```powershell
cd .\browser-ui
npm install
npm run dev
```

The frontend is served on loopback at port 3000. Local chat history and saved memory live in the gitignored `browser-ui\data\local-store.json`.

## Optional Cloudflare sync

Cloud sync is off by default and must be enabled per conversation. Project files and model weights are never uploaded by the sync feature.

The D1 database `local-aider-sync` has been created in the Cloudflare account and migration `0001_initial.sql` applied remotely. Before enabling cloud sync, finish configuring Cloudflare Access (team domain and application audience) and a protected Worker URL. Details are in [browser-ui/README.md](browser-ui/README.md).

## Requirements

Windows 10/11 x64, internet for initial downloads, and sufficient disk space for the model. GPU acceleration depends on hardware. The model is not bundled in the installer.
