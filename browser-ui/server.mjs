import express from 'express';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.AIDER_UI_API_PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001));
const MODEL = process.env.AIDER_MODEL || 'ollama_chat/huihui_ai/qwen3-abliterated:8b';
const OLLAMA_BASE = process.env.OLLAMA_API_BASE || 'http://127.0.0.1:11434';
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'local-store.json');
const preferredWorkspace = 'C:\Games\Chair\CS2\Qwen';
const fallbackWorkspace = path.join(os.homedir(), 'Documents', 'AiderWorkspace');
const DEFAULT_WORKSPACE = process.env.AIDER_WORKSPACE || (existsSync(preferredWorkspace) ? preferredWorkspace : fallbackWorkspace);
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(DEFAULT_WORKSPACE, { recursive: true });
if (!existsSync(STORE_FILE)) writeFileSync(STORE_FILE, JSON.stringify({ conversations: [], memories: [], settings: { workspace: DEFAULT_WORKSPACE, cloudSyncEnabled: false, cloudUrl: '', cloudLoginEmail: '', cloudSyncToken: '' } }, null, 2));
let store = JSON.parse(readFileSync(STORE_FILE, 'utf8'));
const persist = () => writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
if (!process.env.AIDER_WORKSPACE && path.resolve(store.settings.workspace || '') === path.resolve(__dirname, '..')) { store.settings.workspace = DEFAULT_WORKSPACE; persist(); }
const now = () => new Date().toISOString();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (!['127.0.0.1:3001', 'localhost:3001', '127.0.0.1:3000', 'localhost:3000'].includes(host) && process.env.NODE_ENV !== 'production') return res.status(403).json({ error: 'Loopback host only.' });
  const origin = req.headers.origin;
  if (origin && !['http://127.0.0.1:3000', 'http://localhost:3000'].includes(origin)) return res.status(403).json({ error: 'Unexpected browser origin.' });
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function cleanFinalAnswer(raw) {
  const text = String(raw || '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
  const markers = [...text.matchAll(/►\s*(?:\*\*)?ANSWER(?:\*\*)?/gi)];
  if (markers.length) {
    const marker = markers[markers.length - 1];
    return text.slice(marker.index + marker[0].length).replace(/\n?Tokens:\s*\d+ sent,\s*\d+ received\.?/gi, '').trim();
  }
  if (/►\s*(?:\*\*)?THINKING/i.test(text)) return '';
  return text
    .replace(/Detected dumb terminal[^\n]*\n?/gi, '')
    .replace(/^Aider v[^\n]*\n?/gm, '')
    .replace(/^Model: [^\n]*\n?/gm, '')
    .replace(/^Git repo: [^\n]*\n?/gm, '')
    .replace(/^Repo-map: [^\n]*\n?/gm, '')
    .replace(/^Tokens:.*$/gm, '')
    .trim();
}
function getConversation(id) { return store.conversations.find(c => c.id === id); }
function cleanConversation(c) { return { id: c.id, title: c.title, updatedAt: c.updatedAt, syncEnabled: !!c.syncEnabled, messages: c.messages }; }
function workspacePath() { return path.resolve(store.settings.workspace || DEFAULT_WORKSPACE); }
function ensureWorkspace() {
  const root = workspacePath();
  if (!existsSync(root)) throw new Error('Workspace folder does not exist. Choose an existing folder in Settings.');
  return root;
}
app.get('/api/health', asyncRoute(async (_req, res) => {
  let ollama = { ok: false, model: MODEL, error: '' };
  try {
    const r = await fetch(new URL('/api/tags', OLLAMA_BASE), { signal: AbortSignal.timeout(2500) });
    ollama.ok = r.ok;
    if (!r.ok) ollama.error = 'Ollama returned HTTP ' + r.status;
  } catch (e) { ollama.error = e.message; }
  res.json({ ok: true, ollama, workspace: store.settings.workspace, cloudSyncEnabled: !!store.settings.cloudSyncEnabled, cloudConfigured: !!store.settings.cloudUrl, platform: os.platform() });
}));
app.get('/api/conversations', (_req, res) => res.json(store.conversations.map(cleanConversation).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))));
app.post('/api/conversations', (req, res) => {
  const id = randomUUID();
  const title = String(req.body?.title || 'New Chat').trim().slice(0, 120) || 'New Chat';
  const c = { id, title, updatedAt: now(), syncEnabled: false, messages: [] };
  store.conversations.unshift(c); persist(); res.status(201).json(cleanConversation(c));
});
app.get('/api/conversations/:id', (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversation not found.' });
  res.json(cleanConversation(c));
});
app.delete('/api/conversations/:id', (req, res) => {
  const i = store.conversations.findIndex(c => c.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Conversation not found.' });
  store.conversations.splice(i, 1); persist(); res.status(204).end();
});
app.patch('/api/conversations/:id', (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversation not found.' });
  if (typeof req.body?.syncEnabled === 'boolean') c.syncEnabled = req.body.syncEnabled;
  if (typeof req.body?.title === 'string') c.title = req.body.title.slice(0, 120);
  c.updatedAt = now(); persist(); res.json(cleanConversation(c));
});
app.get('/api/memories', (_req, res) => res.json(store.memories));
app.post('/api/memories', (req, res) => {
  const content = String(req.body?.content || '').trim().slice(0, 4000);
  if (!content) return res.status(400).json({ error: 'Memory cannot be empty.' });
  const memory = { id: randomUUID(), content, category: String(req.body?.category || 'project').slice(0, 40), project: String(req.body?.project || '').slice(0, 260), syncEnabled: false, updatedAt: now() };
  store.memories.unshift(memory); persist(); res.status(201).json(memory);
});
app.patch('/api/memories/:id', (req, res) => {
  const memory = store.memories.find(m => m.id === req.params.id);
  if (!memory) return res.status(404).json({ error: 'Memory not found.' });
  if (typeof req.body?.syncEnabled === 'boolean') memory.syncEnabled = req.body.syncEnabled;
  memory.updatedAt = now(); persist(); res.json(memory);
});
app.delete('/api/memories/:id', (req, res) => {
  store.memories = store.memories.filter(m => m.id !== req.params.id); persist(); res.status(204).end();
});
app.get('/api/settings', (_req, res) => res.json({ ...store.settings, model: MODEL, ollamaBase: OLLAMA_BASE }));
app.patch('/api/settings', (req, res) => {
  const body = req.body || {};
  if (typeof body.workspace === 'string') {
    const candidate = path.resolve(body.workspace.trim());
    if (!existsSync(candidate)) return res.status(400).json({ error: 'That workspace path does not exist.' });
    store.settings.workspace = candidate;
  }
  if (typeof body.cloudUrl === 'string') store.settings.cloudUrl = body.cloudUrl.trim().replace(/\/$/, '');
  if (typeof body.cloudSyncEnabled === 'boolean') store.settings.cloudSyncEnabled = body.cloudSyncEnabled;
  if (typeof body.cloudLoginEmail === 'string') store.settings.cloudLoginEmail = body.cloudLoginEmail.trim().slice(0, 200);
  if (typeof body.cloudSyncToken === 'string') store.settings.cloudSyncToken = body.cloudSyncToken.trim().slice(0, 500);
  persist(); res.json({ ...store.settings, model: MODEL, ollamaBase: OLLAMA_BASE });
});
app.post('/api/chat/:id', asyncRoute(async (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversation not found.' });
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Enter a message first.' });
  if (prompt.length > 20000) return res.status(413).json({ error: 'Prompt is too long (20,000 characters max).' });
  const userMessage = { id: randomUUID(), role: 'user', content: prompt, createdAt: now() };
  c.messages.push(userMessage); c.updatedAt = now();
  if (c.messages.length === 1 && c.title === 'New Chat') c.title = prompt.replace(/\s+/g, ' ').slice(0, 48);
  persist();
  const memoryContext = store.memories.map(m => '- [' + m.category + '] ' + m.content).slice(0, 12).join('\n');
  const recent = c.messages.slice(-12).map(m => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content).join('\n\n');
  const instruction = 'You are the coding assistant in a local Aider web interface. Use the selected project workspace. Respect the user request and inspect relevant project files before changing code.\n' +
    (memoryContext ? 'Relevant saved memory:\n' + memoryContext + '\n\n' : '') +
    'Recent conversation context:\n' + recent + '\n\nRespond to the latest user message. Do not claim to have changed files unless you actually did.';
  const workspace = ensureWorkspace();
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');
  send({ type: 'status', text: 'Starting Aider in ' + workspace });
  const args = ['tool','run','--python','3.12','--from','aider-chat','aider','--model',MODEL,'--yes-always','--no-auto-commits','--no-pretty','--message',instruction];
  const child = spawn(process.platform === 'win32' ? 'uv.exe' : 'uv', args, { cwd: workspace, env: { ...process.env, OLLAMA_API_BASE: OLLAMA_BASE, NO_COLOR: '1', PYTHONIOENCODING: 'utf-8', TERM: 'dumb' }, windowsHide: true, shell: false });
  let output = '';
  let stderr = '';
  let closed = false;
  let streamedAnswer = '';
  const finish = (code) => {
    if (closed) return; closed = true;
    const content = cleanFinalAnswer(output) || (stderr.trim() ? 'Aider error: ' + stderr.trim().slice(-2500) : 'Aider did not produce a separate final answer. Try a shorter prompt or check the model output format.');
    const assistantMessage = { id: randomUUID(), role: 'assistant', content, createdAt: now(), error: code !== 0 || !cleanFinalAnswer(output) };
    c.messages.push(assistantMessage); c.updatedAt = now(); persist();
    send({ type: 'done', message: assistantMessage, exitCode: code });
    res.end();
  };
  child.stdout.on('data', chunk => {
    output += chunk.toString();
    const answer = cleanFinalAnswer(output);
    if (answer.length > streamedAnswer.length) {
      send({ type: 'chunk', text: answer.slice(streamedAnswer.length) });
      streamedAnswer = answer;
    }
  });
  child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; send({ type: 'status', text: text.slice(-1000) }); });
  child.on('error', err => { send({ type: 'error', error: err.message }); finish(1); });
  child.on('close', code => finish(code ?? 1));
  res.on('close', () => { if (!res.writableEnded && !closed) child.kill(); });
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, _req, res, _next) => { console.error(err); if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal server error.' }); else res.end(); });

const production = process.env.NODE_ENV === 'production';
if (production) {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.listen(PORT, '127.0.0.1', () => console.log('Aider UI API listening on http://127.0.0.1:' + PORT));
