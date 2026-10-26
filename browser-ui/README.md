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

The default workspace uses `C:\Games\Chair\CS2\Qwen` when present; otherwise it creates `Documents\AiderWorkspace` so Aider does not start with the installer repository as its default writable project. Choose a different existing project folder in Settings if needed. Aider is launched in the selected workspace using the local Ollama model.

For a production-like local launch:

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

Then open http://localhost:3000.

## Cloudflare sync (optional)

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
