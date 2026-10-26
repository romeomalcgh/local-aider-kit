interface Env {
  DB: D1Database;
  SYNC_ACCESS_TOKEN: string;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
function cors(request: Request, response: Response) {
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  }
  return new Response(response.body, { status: response.status, headers });
}
async function identity(request: Request, env: Env) {
  const configured = env.SYNC_ACCESS_TOKEN || '';
  const supplied = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (configured.length < 32) throw new Error('Cloud sync token is not configured. Set a random SYNC_ACCESS_TOKEN secret on the Worker.');
  if (!supplied || supplied.length !== configured.length) throw new Error('Enter your cloud sync token in Local Aider Settings.');
  let difference = 0;
  for (let i = 0; i < configured.length; i++) difference |= configured.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (difference !== 0) throw new Error('Invalid cloud sync token.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(supplied));
  const subject = 'token:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { subject, email: '' };
}
async function userId(request: Request, env: Env) {
  const who = await identity(request, env);
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, external_subject) VALUES (?, ?)').bind(crypto.randomUUID(), who.subject).run();
  const row = await env.DB.prepare('SELECT id FROM users WHERE external_subject = ?').bind(who.subject).first<{id:string}>();
  if (!row) throw new Error('Could not resolve user record.');
  return { id: row.id, email: who.email };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(request, new Response(null, { status: 204 }));
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return cors(request, json({ ok: true, auth: 'token' }));
      const user = await userId(request, env);
      if (request.method === 'GET' && url.pathname === '/api/me') return cors(request, json({ id: user.id, email: user.email, auth: 'token' }));
      if (request.method === 'GET' && url.pathname === '/api/conversations') {
        const result = await env.DB.prepare('SELECT id, title, updated_at AS updatedAt FROM conversations WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200').bind(user.id).all();
        return cors(request, json(result.results));
      }
      const match = url.pathname.match(/^\/api\/conversations\/([0-9a-f-]+)$/i);
      if (match && request.method === 'PUT') {
        const body = await request.json() as { title?: string; messages?: Array<{id:string;role:string;content:string;createdAt?:string}> };
        if (!Array.isArray(body.messages) || body.messages.length > 500) return cors(request, json({ error: 'Invalid messages payload.' }, 400));
        if (body.messages.some(m => String(m.content || '').length > 50000)) return cors(request, json({ error: 'A message exceeds the 50,000 character limit.' }, 413));
        const id = match[1], title = String(body.title || 'New Chat').slice(0, 120), stamp = new Date().toISOString();
        await env.DB.prepare('INSERT INTO conversations (id,user_id,title,sync_enabled,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, sync_enabled=1, deleted_at=NULL, updated_at=excluded.updated_at WHERE conversations.user_id=excluded.user_id').bind(id,user.id,title,stamp).run();
        const own = await env.DB.prepare('SELECT id FROM conversations WHERE id=? AND user_id=?').bind(id,user.id).first();
        if (!own) return cors(request, json({ error: 'Not found.' }, 404));
        await env.DB.prepare('DELETE FROM messages WHERE conversation_id=?').bind(id).run();
        const batch = body.messages.map(m => env.DB.prepare('INSERT INTO messages (id,conversation_id,role,content,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(String(m.id).slice(0,80),id,['user','assistant','system'].includes(m.role)?m.role:'assistant',String(m.content || ''),m.createdAt || stamp,stamp));
        if (batch.length) await env.DB.batch(batch);
        return cors(request, json({ ok: true, id, synced: body.messages.length }));
      }
      if (match && request.method === 'GET') {
        const conversation = await env.DB.prepare('SELECT id,title,updated_at AS updatedAt FROM conversations WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(match[1],user.id).first();
        if (!conversation) return cors(request, json({ error: 'Not found.' },404));
        const messages = await env.DB.prepare('SELECT id,role,content,created_at AS createdAt FROM messages WHERE conversation_id=? ORDER BY created_at').bind(match[1]).all();
        return cors(request, json({ ...conversation, messages: messages.results }));
      }
      if (match && request.method === 'DELETE') {
        await env.DB.prepare('UPDATE conversations SET deleted_at=?,updated_at=? WHERE id=? AND user_id=?').bind(new Date().toISOString(),new Date().toISOString(),match[1],user.id).run();
        return cors(request, json({ ok: true }));
      }
      if (url.pathname === '/api/memories' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,project_id AS projectId,category,content,updated_at AS updatedAt FROM memories WHERE user_id=? ORDER BY updated_at DESC LIMIT 200').bind(user.id).all();
        return cors(request, json(rows.results));
      }
      if (url.pathname === '/api/memories' && request.method === 'PUT') {
        const body = await request.json() as { id?:string; projectId?:string; category?:string; content?:string };
        if (!body.id || !body.content?.trim()) return cors(request, json({ error: 'id and content are required.' },400));
        if (body.content.length > 4000) return cors(request, json({ error: 'Memory exceeds the 4,000 character limit.' },413));
        const stamp = new Date().toISOString();
        await env.DB.prepare('INSERT INTO memories (id,user_id,project_id,category,content,sync_enabled,updated_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,category=excluded.category,content=excluded.content,updated_at=excluded.updated_at WHERE memories.user_id=excluded.user_id').bind(body.id,user.id,body.projectId || null,(body.category || 'project').slice(0,40),body.content,stamp).run();
        return cors(request, json({ ok: true, id: body.id }));
      }
      if (url.pathname.startsWith('/api/memories/') && request.method === 'DELETE') {
        const id = url.pathname.slice('/api/memories/'.length);
        await env.DB.prepare('DELETE FROM memories WHERE id=? AND user_id=?').bind(id,user.id).run();
        return cors(request, json({ ok: true }));
      }
      return cors(request, json({ error: 'Not found.' },404));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.';
      return cors(request, json({ error: message }, message.includes('not configured') ? 503 : 401));
    }
  },
};
