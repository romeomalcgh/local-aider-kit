# Local Aider Browser UI

A dark, ChatGPT-style local frontend for Aider + Ollama. Everything for this application lives in this `browser-ui` folder inside the `local-aider-kit` repository.

## Local development

Requirements: Node.js 20.19+ (Node 22+ recommended), npm, `uv`, Ollama, and the model `huihui_ai/qwen3-abliterated:8b`.

```powershell
cd "$HOME\local-aider-kit\browser-ui"
npm install
npm run dev
```

Open http://localhost:3000. The Vite frontend and local API run on loopback only. The API persists conversations and memories in `data/local-store.json`, which is gitignored.

The default workspace uses `C:\Games\Chair\CS2\Qwen` when present; otherwise it creates `Documents\AiderWorkspace` so Aider does not start with the installer repository as its default writable project. Choose a different existing project folder in Settings if needed. Saved workspace paths are stored separately from conversations and can be switched in Settings; the actual source files remain in their original local folders. Aider is launched in the selected workspace using the local Ollama model.

## App commands

Enter `/help` or `/commands` in the composer to list the app-level commands. `/status` shows local model/workspace status, `/workspace` opens workspace settings, and `/sync` syncs the active conversation when selective cloud sync is enabled. These are Local Aider commands, not the full interactive Aider slash-command set: each message currently launches Aider as a one-shot process, so commands such as interactive `/add` and `/drop` are not exposed as native terminal commands in the UI.

For a production-like local launch:

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

Then open http://localhost:3000.

## Google login and Google Drive backup (optional)

1. In Google Cloud Console, create/select a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen. While in testing mode, add your Google account as a test user.
3. Create an OAuth Client ID of type **Web application**. Add `http://localhost:3000` and `http://127.0.0.1:3000` as authorized JavaScript origins. No client secret is needed in this browser-only token flow; never put a client secret in the app.
4. In Local Aider Settings, choose **Google Drive (private app data)**, paste the OAuth client ID ending in `.apps.googleusercontent.com`, save settings, and select **Sign in with Google**.
5. Use **Back up to Drive** or **Restore from Drive**. The backup is stored in Drive's hidden `appDataFolder`, not the visible file list. Restore creates a local pre-restore copy of `data/local-store.json` before replacing conversations, memories and workspace entries. Workspace paths are metadata only; actual project files are not uploaded or restored.

Google access is granted through Google's OAuth popup. The access token is kept in app memory, not saved to the local JSON store, and must be renewed after a page reload or token expiry. This backup is a manual snapshot, not automatic real-time sync. The app stores only conversations, saved memories and workspace path metadata; it does not upload model weights or project source files.

## Cloudflare sync (optional legacy provider)

The Worker and D1 schema are under `cloud/worker`. Local conversations remain local until you explicitly enable sync on a conversation. Source files, project directories and model weights are never uploaded by the sync code.

1. From this folder, authenticate Wrangler: `npx wrangler login`.
2. Create the D1 database: `npx wrangler d1 create local-aider-sync`.
3. Copy the returned database ID into `cloud/worker/wrangler.toml`.
4. Apply the migration: `npx wrangler d1 migrations apply local-aider-sync --remote --config cloud/worker/wrangler.toml`.
5. Set a strong random token as a Worker secret: `npx wrangler secret put SYNC_ACCESS_TOKEN --config cloud/worker/wrangler.toml`. Use at least 32 random characters; never commit the token.
6. Deploy: `npm run cloud:deploy`.
7. In local app Settings, enter the Worker URL and the same token, save, then click **Verify sync token**.

The Worker uses bearer-token authentication and does not require Zero Trust. Anyone with the token can access the synced account, so keep it private and rotate it with `npx wrangler secret put SYNC_ACCESS_TOKEN --config cloud/worker/wrangler.toml` if it is exposed. A `workers.dev` hostname is sufficient; a custom domain is optional.

## Privacy and limitations

- Local inference only; no hosted model API is used.
- Local chat/memory JSON is not committed.
- Cloud sync is opt-in per conversation and requires the private Worker bearer token.
- The local server is loopback-bound. It is not a remote-access service.
- Review changes in Git before accepting them. Aider operates with the Windows permissions of the account running it.
