import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Activity, Archive, ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, Cloud, Code2, Copy, FileText, Folder, FolderOpen, Menu, MessageSquare, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Wifi, WifiOff, X, Zap } from 'lucide-react'
import './App.css'

type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string; error?: boolean }
type Conversation = { id: string; title: string; updatedAt: string; syncEnabled: boolean; messages: Message[] }
type Memory = { id: string; content: string; category: string; project?: string; syncEnabled: boolean; updatedAt: string }
type SettingsData = { workspace: string; cloudSyncEnabled: boolean; cloudUrl: string; cloudLoginEmail: string; cloudSyncToken: string; googleClientId: string; storageProvider: 'local' | 'google-drive' | 'cloudflare'; model: string; ollamaBase: string }
declare global { interface Window { google?: { accounts?: { oauth2?: { initTokenClient: (config: {client_id:string;scope:string;callback:(response:{access_token?:string;error?:string;expires_in?:number})=>void;error_callback?:(error:unknown)=>void})=>{requestAccessToken:(options?:{prompt?:string})=>void} } } } } }
const fmtTime = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const api = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!response.ok) { let detail = response.statusText; try { detail = (await response.json()).error || detail } catch {} throw new Error(detail) }
  return response.status === 204 ? null : response.json()
}
function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Connecting to local services…')
  const [ollamaOk, setOllamaOk] = useState(false)
  const [workspace, setWorkspace] = useState('')
  const [workspaces, setWorkspaces] = useState<Array<{id:string;name:string;path:string;updatedAt:string}>>([])
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [googleAccessToken, setGoogleAccessToken] = useState('')
  const [googleEmail, setGoogleEmail] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memories, setMemories] = useState<Memory[]>([])
  const [memoryDraft, setMemoryDraft] = useState('')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const [streamText, setStreamText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const active = conversations.find(c => c.id === activeId)
  const filtered = useMemo(() => conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase())), [conversations, search])

  async function refresh() {
    try {
      const [health, chats, saved, cfg, savedWorkspaces] = await Promise.all([
        api('/api/health'), api('/api/conversations'), api('/api/memories'), api('/api/settings'), api('/api/workspaces'),
      ])
      setOllamaOk(health.ollama.ok)
      setStatus(health.ollama.ok ? 'Local model connected' : 'Ollama is not responding')
      setConversations(chats)
      setMemories(saved)
      setSettings(cfg)
      setWorkspace(cfg.workspace)
      setWorkspaces(savedWorkspaces)
      if (!activeId && chats.length) { setActiveId(chats[0].id); setMessages(chats[0].messages) }
      else if (activeId) { const current = chats.find((c: Conversation) => c.id === activeId); if (current) setMessages(current.messages) }
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Local server unavailable') }
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { void api('/api/health').then(h => { setOllamaOk(h.ollama.ok); setStatus(h.ollama.ok ? 'Local model connected' : 'Ollama is not responding') }).catch(() => setStatus('Local server unavailable')) }, 15000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, streamText])
  async function newChat() {
    try {
      const c = await api('/api/conversations', { method: 'POST', body: JSON.stringify({ title: 'New Chat' }) })
      setConversations(prev => [c, ...prev]); setActiveId(c.id); setMessages([]); setPrompt(''); setNotice('')
    } catch (e) { setNotice(String(e)) }
  }
  async function openChat(c: Conversation) {
    try { const loaded = await api('/api/conversations/' + c.id); setActiveId(c.id); setMessages(loaded.messages); setNotice('') }
    catch (e) { setNotice(String(e)) }
  }
  async function send() {
    const text = prompt.trim()
    if (!text || busy) return
    const command = text.match(/^\/(\w+)(?:\s+(.*))?$/)
    if (command) {
      const name = command[1].toLowerCase()
      if (name === 'help' || name === 'commands') { setNotice('Local commands: /help, /status, /workspace, /sync. Aider’s full interactive slash-command set is not available because each request runs as a one-shot Aider process.'); setPrompt(''); return }
      if (name === 'status') { setNotice(`Model: ${ollamaOk ? 'online' : 'offline'} · Workspace: ${workspace} · Chats: ${conversations.length} · Saved workspaces: ${workspaces.length}`); setPrompt(''); return }
      if (name === 'workspace') { setSettingsOpen(true); setPrompt(''); return }
      if (name === 'sync') { setPrompt(''); if (active) void toggleSync(active); else setNotice('Open a conversation before using /sync.'); return }
    }
    let id = activeId
    if (!id) { try { const c = await api('/api/conversations', { method: 'POST', body: JSON.stringify({ title: text.slice(0, 48) }) }); id = c.id; setActiveId(id); setConversations(prev => [c, ...prev]) } catch (e) { setNotice(String(e)); return } }
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg]); setPrompt(''); setBusy(true); setStreamText(''); setNotice('')
    try {
      const response = await fetch('/api/chat/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text }) })
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || response.statusText) }
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Streaming response unavailable.')
      const decoder = new TextDecoder(); let buffer = ''; let finalMessage: Message | null = null
      while (true) {
        const { value, done } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n'); buffer = events.pop() || ''
        for (const event of events) {
          const line = event.split('\n').find(v => v.startsWith('data: '))
          if (!line) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'chunk') setStreamText(prev => prev + data.text)
            if (data.type === 'status') setStatus(data.text.slice(-100))
            if (data.type === 'error') setNotice(data.error)
            if (data.type === 'done') finalMessage = data.message
          } catch {}
        }
      }
      if (finalMessage) setMessages(prev => [...prev, finalMessage!])
      const chats = await api('/api/conversations'); setConversations(chats)
      if (active?.syncEnabled || settings?.cloudSyncEnabled) {
        const c = chats.find((x: Conversation) => x.id === id)
        if (settings?.cloudSyncEnabled && c?.syncEnabled) void syncConversation(c)
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Request failed.') }
    finally { setBusy(false); setStreamText(''); void refresh() }
  }
  async function googleLogin() {
    const clientId = settings?.googleClientId?.trim()
    if (!clientId) { setNotice('Enter a Google OAuth Web client ID in Settings first.'); return }
    try {
      if (!window.google?.accounts?.oauth2) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]')
          if (existing && window.google?.accounts?.oauth2) { resolve(); return }
          const script = existing || document.createElement('script')
          script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.googleIdentity = 'true'
          script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load Google Identity Services.'))
          if (!existing) document.head.appendChild(script)
        })
      }
      if (!window.google?.accounts?.oauth2) throw new Error('Google sign-in library is unavailable.')
      const token = await new Promise<string>((resolve, reject) => {
        const client = window.google!.accounts!.oauth2!.initTokenClient({ client_id:clientId, scope:'openid email profile https://www.googleapis.com/auth/drive.appdata', callback:response => response.access_token ? resolve(response.access_token) : reject(new Error(response.error || 'Google sign-in failed.')), error_callback:error => reject(new Error(String(error))) })
        client.requestAccessToken({ prompt: 'consent' })
      })
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers:{ Authorization:'Bearer ' + token } })
      if (!profileResponse.ok) throw new Error('Google profile verification failed.')
      const profile = await profileResponse.json()
      setGoogleAccessToken(token); setGoogleEmail(String(profile.email || 'Google account')); setNotice('Signed in with Google. Access token is kept in memory for this session only.')
    } catch (e) { setNotice('Google sign-in failed: ' + (e instanceof Error ? e.message : String(e))) }
  }
  async function googleDriveBackup(mode: 'upload' | 'restore') {
    if (!googleAccessToken) { setNotice('Sign in with Google first.'); return }
    try {
      const headers = { Authorization:'Bearer ' + googleAccessToken }
      const listResponse = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27local-aider-backup.json%27%20and%20trashed%3Dfalse&fields=files(id,name,modifiedTime)", { headers })
      if (!listResponse.ok) throw new Error('Google Drive lookup failed: ' + listResponse.status)
      const listing = await listResponse.json()
      const file = listing.files?.[0]
      if (mode === 'upload') {
        const [chats, saved, savedWorkspaces] = await Promise.all([api('/api/conversations'), api('/api/memories'), api('/api/workspaces')])
        const snapshot = JSON.stringify({ schemaVersion:1, exportedAt:new Date().toISOString(), conversations:chats, memories:saved, workspaces:savedWorkspaces })
        const metadata = { name:'local-aider-backup.json', mimeType:'application/json', ...(file ? {} : { parents:['appDataFolder'] }) }
        const boundary = 'local_aider_' + crypto.randomUUID().replace(/-/g,'')
        const multipart = ['--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata), '--' + boundary, 'Content-Type: application/json', '', snapshot, '--' + boundary + '--'].join(String.fromCharCode(13, 10))
        const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files' + (file ? '/' + file.id : '') + '?uploadType=multipart&fields=id,name,modifiedTime', { method:file ? 'PATCH' : 'POST', headers:{ ...headers, 'Content-Type':'multipart/related; boundary=' + boundary }, body:multipart })
        if (!uploadResponse.ok) throw new Error('Google Drive upload failed: ' + uploadResponse.status + ' ' + (await uploadResponse.text()).slice(0,300))
        setNotice('Backup uploaded to your private Google Drive app-data storage.')
      } else {
        if (!file) throw new Error('No Local Aider backup was found in this Google account.')
        if (!window.confirm('Restore the Google Drive backup? This replaces local conversations, memories and saved workspace entries. A local backup will be created first.')) return
        const downloadResponse = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', { headers })
        if (!downloadResponse.ok) throw new Error('Google Drive download failed: ' + downloadResponse.status)
        const snapshot = await downloadResponse.json()
        await api('/api/backup/restore', { method:'POST', body:JSON.stringify(snapshot) })
        await refresh()
        setNotice('Google Drive backup restored. A pre-restore local backup was created. Imported workspaces are paths only; folders are not downloaded.')
      }
    } catch (e) { setNotice('Google Drive ' + mode + ' failed: ' + (e instanceof Error ? e.message : String(e))) }
  }
  async function syncConversation(c: Conversation): Promise<boolean> {
    if (!settings?.cloudUrl) { setNotice('Set the Cloudflare Worker URL in Settings first.'); return false }
    try {
      const r = await fetch(settings.cloudUrl.replace(/\/$/, '') + '/api/conversations/' + c.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (settings.cloudSyncToken || '') },
        body: JSON.stringify({ title: c.title, messages: c.messages }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Sync failed: ' + r.status) }
      setNotice('Conversation synced to Cloudflare.')
      return true
    } catch (e) { setNotice('Cloud sync failed: ' + (e instanceof Error ? e.message : String(e))); return false }
  }
  async function toggleSync(c: Conversation) {
    if (!settings?.cloudSyncEnabled || !settings.cloudUrl) { setNotice('Enable cloud sync and set the Worker URL in Settings first.'); setSettingsOpen(true); return }
    try {
      if (!c.syncEnabled) {
        const latest = await api('/api/conversations/' + c.id)
        if (!await syncConversation({ ...latest, syncEnabled: true })) return
        const updated = await api('/api/conversations/' + c.id, { method: 'PATCH', body: JSON.stringify({ syncEnabled: true }) })
        setConversations(prev => prev.map(x => x.id === c.id ? updated : x))
      } else {
        const r = await fetch(settings.cloudUrl.replace(/\/$/, '') + '/api/conversations/' + c.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + (settings.cloudSyncToken || '') } })
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Cloud delete failed: ' + r.status) }
        const updated = await api('/api/conversations/' + c.id, { method: 'PATCH', body: JSON.stringify({ syncEnabled: false }) })
        setConversations(prev => prev.map(x => x.id === c.id ? updated : x))
        setNotice('Cloud copy deleted; conversation remains local.')
      }
    } catch (e) { setNotice(String(e)) }
  }
  async function toggleMemorySync(m: Memory) {
    if (!settings?.cloudSyncEnabled || !settings.cloudUrl) { setNotice('Enable cloud sync and set the Worker URL in Settings first.'); setSettingsOpen(true); return }
    try {
      if (!m.syncEnabled) {
        const r = await fetch(settings.cloudUrl.replace(/\/$/, '') + '/api/memories', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (settings.cloudSyncToken || '') },
          body: JSON.stringify({ id: m.id, projectId: workspace, category: m.category, content: m.content }),
        })
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Memory sync failed: ' + r.status) }
        const updated = await api('/api/memories/' + m.id, { method: 'PATCH', body: JSON.stringify({ syncEnabled: true }) })
        setMemories(prev => prev.map(x => x.id === m.id ? updated : x)); setNotice('Memory synced to Cloudflare.')
      } else {
        const r = await fetch(settings.cloudUrl.replace(/\/$/, '') + '/api/memories/' + m.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + (settings.cloudSyncToken || '') } })
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Cloud memory delete failed: ' + r.status) }
        const updated = await api('/api/memories/' + m.id, { method: 'PATCH', body: JSON.stringify({ syncEnabled: false }) })
        setMemories(prev => prev.map(x => x.id === m.id ? updated : x)); setNotice('Cloud memory deleted; local memory kept.')
      }
    } catch (e) { setNotice('Memory sync failed: ' + (e instanceof Error ? e.message : String(e))) }
  }
  async function saveWorkspace() {
    try {
      const item = await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ path: workspace }) })
      setWorkspaces(prev => prev.some(w => w.id === item.id) ? prev : [...prev, item])
      const cfg = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ workspace }) })
      setSettings(s => s ? { ...s, workspace: cfg.workspace } : s)
      setNotice('Workspace saved. Its folder remains on this PC; conversations are stored separately.')
    } catch (e) { setNotice(String(e)) }
  }
  async function selectWorkspace(pathValue: string) {
    setWorkspace(pathValue)
    try {
      const cfg = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ workspace: pathValue }) })
      setSettings(s => s ? { ...s, workspace: cfg.workspace } : s)
      setWorkspace(cfg.workspace)
      setNotice('Active workspace changed. Existing conversations were kept.')
    } catch (e) { setNotice(String(e)) }
  }
  async function saveSettings() {
    try {
      const cfg = await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ workspace, cloudUrl: settings?.cloudUrl || '', cloudSyncEnabled: settings?.cloudSyncEnabled || false, cloudLoginEmail: settings?.cloudLoginEmail || '', cloudSyncToken: settings?.cloudSyncToken || '', googleClientId: settings?.googleClientId || '', storageProvider: settings?.storageProvider || 'local' }) })
      setSettings(cfg); setWorkspace(cfg.workspace); setSettingsOpen(false); setNotice('Settings saved locally.')
    } catch (e) { setNotice(String(e)) }
  }
  async function addMemory() {
    if (!memoryDraft.trim()) return
    try { const m = await api('/api/memories', { method: 'POST', body: JSON.stringify({ content: memoryDraft, category: 'project', project: workspace }) }); setMemories(prev => [m, ...prev]); setMemoryDraft('') }
    catch (e) { setNotice(String(e)) }
  }
  async function deleteMemory(id: string) {
    await api('/api/memories/' + id, { method: 'DELETE' }); setMemories(prev => prev.filter(m => m.id !== id))
  }
  async function deleteChat(c: Conversation) {
    if (!window.confirm('Delete this local conversation? This does not delete a previously synced cloud copy.')) return
    await api('/api/conversations/' + c.id, { method: 'DELETE' }); const rest = conversations.filter(x => x.id !== c.id); setConversations(rest)
    if (activeId === c.id) { setActiveId(rest[0]?.id || ''); setMessages(rest[0]?.messages || []) }
  }
  async function loginCloud() {
    const url = settings?.cloudUrl?.trim()
    const token = settings?.cloudSyncToken?.trim()
    if (!url) { setNotice('Add your Cloudflare Worker URL first.'); return }
    if (!token) { setNotice('Enter the cloud sync token, then save settings.'); return }
    try {
      const response = await fetch(url.replace(/\/$/, '') + '/api/me', { headers: { Authorization: 'Bearer ' + token } })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Authentication failed.')
      setNotice('Cloud sync connected. Token authentication verified.')
    } catch (e) { setNotice('Cloud sign-in failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  return <div className="app-shell">
    {sidebarOpen && <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Code2 size={20}/></div><div><strong>AIDER <span>AI</span></strong><small>LOCAL CODING WORKSPACE</small></div><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={17}/></button></div>
      <button className="new-chat" onClick={newChat}><Plus size={18}/> New Chat <span>Ctrl K</span></button>
      <div className="side-label">WORKSPACE</div>
      <button className="nav-item" onClick={() => setSettingsOpen(true)}><FolderOpen size={17}/> <span className="path-label">{workspace.split(/[\\/]/).filter(Boolean).slice(-2).join(' / ') || 'Choose project'}</span><ChevronDown size={14}/></button>
      <div className="side-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats"/></div>
      <div className="side-label recent-label">RECENT CHATS <MoreHorizontal size={15}/></div>
      <div className="chat-list">{filtered.map(c => <div className={'chat-row ' + (c.id === activeId ? 'selected' : '')} key={c.id}><button className="chat-link" onClick={() => void openChat(c)}><MessageSquare size={16}/><span>{c.title}</span></button><button className={'chat-more sync-chat ' + (c.syncEnabled ? 'is-synced' : '')} title={c.syncEnabled ? 'Disable sync for this conversation' : 'Sync this conversation to Cloudflare'} onClick={() => void toggleSync(c)}><Cloud size={13}/></button><button className="chat-more" title="Delete conversation" onClick={() => void deleteChat(c)}><Trash2 size={14}/></button></div>)}
        {!filtered.length && <div className="empty-side">{search ? 'No matching chats' : 'Your conversations will appear here.'}</div>}
      </div>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => setMemoryOpen(true)}><BookOpen size={17}/> Saved memory <span className="count">{memories.length}</span></button>
        <button className="nav-item" onClick={() => setNotice('Documents view is planned; project files remain in your selected local workspace.')}><FileText size={17}/> Documents</button>
        <div className="side-status"><span className={'status-dot ' + (ollamaOk ? 'online' : '')}/><span>{ollamaOk ? 'Ollama connected' : 'Ollama offline'}</span><span className="local-tag">LOCAL</span></div>
        <button className="nav-item settings-link" onClick={() => setSettingsOpen(true)}><Settings size={17}/> Settings</button>
        <div className="profile"><div className="avatar">U</div><div className="profile-copy"><strong>Local user</strong><small>{settings?.cloudSyncEnabled ? 'Cloud sync enabled' : 'Private · this PC'}</small></div><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Profile settings"><MoreHorizontal size={18}/></button></div>
      </div>
    </aside>}
    <main className="main-panel">
      <header className="topbar"><div className="topbar-left"><button className="icon-button" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle sidebar"><Menu size={19}/></button><div className="breadcrumb"><span>Aider</span><span className="slash">/</span><strong>{active?.title || 'New conversation'}</strong></div></div><div className="topbar-right"><span className={'connection-pill ' + (ollamaOk ? 'connected' : 'disconnected')}>{ollamaOk ? <Wifi size={14}/> : <WifiOff size={14}/>} {ollamaOk ? 'Local model online' : 'Model offline'}</span><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings size={18}/></button></div></header>
      <div className="workspace-bar"><div className="workspace-badge"><Folder size={14}/><span>{workspace || 'No workspace selected'}</span></div><div className="model-badge"><Sparkles size={14}/><span>{settings?.model?.replace('ollama_chat/','') || 'huihui_ai/qwen3-abliterated:8b'}</span><span className="local-dot"/></div></div>
      <section className={'conversation-area ' + (!messages.length ? 'welcome-area' : '')}>
        {!messages.length ? <div className="welcome">
          <div className="welcome-icon"><div className="welcome-grid"/><Code2 size={34}/><span className="spark spark-one">✦</span><span className="spark spark-two">✧</span></div>
          <div className="eyebrow"><span/> YOUR LOCAL CODING PARTNER</div>
          <h1>What are we <em>building</em><br/>today?</h1>
          <p className="welcome-sub">A coding assistant that works with your files.<br/>Your model runs on your machine. Your code stays yours.</p>
          <div className="suggestion-grid">
            {[{icon:<Search size={17}/>,title:'Explore this project',text:'Explain the architecture and important files.',prompt:'Inspect this project and explain its architecture, entry points, key modules, and how to run its tests. Do not modify files yet.'},{icon:<Zap size={17}/>,title:'Fix a bug',text:'Find the cause and propose a targeted fix.',prompt:'Inspect the project for likely bugs. Explain the strongest concrete finding first and wait for my approval before making changes.'},{icon:<Code2 size={17}/>,title:'Build a feature',text:'Plan and implement a change in my repo.',prompt:'Help me plan a feature. First inspect the project conventions and suggest an implementation plan without changing files.'},{icon:<ShieldCheck size={17}/>,title:'Review code',text:'Look for correctness and security issues.',prompt:'Review the selected project for correctness, security, and reliability issues. Prioritize actionable findings with file references. Do not modify files.'}].map(s => <button className="suggestion-card" key={s.title} onClick={() => setPrompt(s.prompt)}><span className="suggestion-icon">{s.icon}</span><span className="suggestion-title">{s.title}</span><span className="suggestion-text">{s.text}</span><ArrowUpRightIcon/></button>)}
          </div>
        </div> : <div className="message-list">{messages.map(m => <article className={'message ' + m.role} key={m.id}><div className="message-avatar">{m.role === 'user' ? 'U' : <Code2 size={16}/>}</div><div className="message-body"><div className="message-meta"><strong>{m.role === 'user' ? 'You' : 'Aider'}</strong><time>{fmtTime(m.createdAt)}</time>{m.error && <span className="error-chip">error</span>}<button className="copy-message" title="Copy message" onClick={() => void navigator.clipboard.writeText(m.content)}><Copy size={13}/></button></div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div></div></article>)}{busy && <article className="message assistant"><div className="message-avatar"><Code2 size={16}/></div><div className="message-body"><div className="message-meta"><strong>Aider</strong><span className="thinking"><i/> Working locally</span></div><div className="markdown">{streamText ? <pre className="stream-output">{streamText.slice(-10000)}</pre> : <div className="thinking-line"><span/><span/><span/> Inspecting your request…</div>}</div></div></article>}<div ref={bottomRef}/></div>}
      </section>
      <footer className="composer-wrap"><div className="composer"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Ask Aider anything… (Shift + Enter for a new line)" rows={Math.min(5, Math.max(1, prompt.split('\n').length))} disabled={busy}/><div className="composer-footer"><div className="composer-hints"><span><kbd>/help</kbd> commands</span><span className="hint-separator">·</span><span><Folder size={12}/> project files</span></div><button className="send-button" onClick={() => void send()} disabled={busy || !prompt.trim()} aria-label="Send message">{busy ? <span className="spinner"/> : <ArrowUp size={19}/>}</button></div></div><div className="composer-disclaimer"><ShieldCheck size={12}/> Local inference · No cloud AI API · Review file changes before keeping them</div></footer>
      {notice && <button className="notice" onClick={() => setNotice('')}><span>{notice}</span><X size={14}/></button>}
      <div className="bottom-status"><span><span className={'status-dot ' + (ollamaOk ? 'online' : '')}/>{status}</span><span><Activity size={13}/> Aider session manager</span><span><Cloud size={13}/> {settings?.cloudSyncEnabled ? 'Selective sync on' : 'Cloud sync off'}</span></div>
    </main>
    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}><section className="settings-modal"><div className="modal-head"><div><div className="eyebrow">PREFERENCES</div><h2>Settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18}/></button></div><div className="settings-section"><h3><FolderOpen size={16}/> Local workspace</h3><label>Project folder path<input value={workspace} onChange={e => setWorkspace(e.target.value)} placeholder="C:\Projects\my-app"/></label><p className="field-help">Aider can read and modify files inside this selected folder. Choose a trusted project directory. Workspaces are saved separately from conversations.</p><label>Saved workspaces<select value={workspaces.some(w => w.path === workspace) ? workspace : ''} onChange={e => { if (e.target.value) void selectWorkspace(e.target.value) }}><option value="">Current path (not saved yet)</option>{workspaces.map(w => <option key={w.id} value={w.path}>{w.name} · {w.path}</option>)}</select></label><button className="secondary-button full" onClick={() => void saveWorkspace()}><FolderOpen size={15}/> Save current workspace</button><div className="readonly-setting"><span>Model</span><strong>{settings?.model || 'huihui_ai/qwen3-abliterated:8b'}</strong></div><div className="readonly-setting"><span>Ollama endpoint</span><strong>{settings?.ollamaBase || 'http://127.0.0.1:11434'}</strong></div></div><div className="settings-section"><h3><Cloud size={16}/> Storage & account</h3><label>Storage provider<select value={settings?.storageProvider || 'local'} onChange={e => setSettings(s => s ? {...s, storageProvider:e.target.value as SettingsData['storageProvider']} : s)}><option value="local">Local only</option><option value="google-drive">Google Drive (private app data)</option><option value="cloudflare">Cloudflare Worker (legacy)</option></select></label><p className="field-help">Google Drive stores a backup of conversations, saved memories and workspace paths in the app-data area, not your visible Drive files. Workspace folders and model files are not uploaded.</p><label>Google OAuth Web client ID<input value={settings?.googleClientId || ''} onChange={e => setSettings(s => s ? {...s, googleClientId:e.target.value} : s)} placeholder="...apps.googleusercontent.com"/></label><button className="secondary-button full" onClick={() => void googleLogin()}><Cloud size={15}/> {googleEmail ? 'Google connected: ' + googleEmail : 'Sign in with Google'}</button><div className="sync-row"><div><strong>Google Drive backup</strong><p>{googleAccessToken ? 'Signed in for this browser session.' : 'Sign in first. Google access is kept in memory and expires.'}</p></div></div><div className="modal-actions"><button className="secondary-button" onClick={() => void googleDriveBackup('upload')} disabled={!googleAccessToken}>Back up to Drive</button><button className="primary-button" onClick={() => void googleDriveBackup('restore')} disabled={!googleAccessToken}>Restore from Drive</button></div><p className="field-help">Setup required once: create a Google OAuth client ID (Web application), add http://localhost:3000 and http://127.0.0.1:3000 as authorized JavaScript origins, and enable the Google Drive API. Do not create or paste a client secret into this local app.</p>{(settings?.storageProvider || 'local') === 'cloudflare' && <><label>Worker URL<input value={settings?.cloudUrl || ''} onChange={e => setSettings(s => s ? {...s, cloudUrl:e.target.value} : s)} placeholder="https://local-aider-sync.example.workers.dev"/></label><label>Cloud sync token<input type="password" autoComplete="off" value={settings?.cloudSyncToken || ''} onChange={e => setSettings(s => s ? {...s, cloudSyncToken:e.target.value} : s)} placeholder="Legacy Worker token"/></label><button className="secondary-button full" onClick={loginCloud}><Cloud size={15}/> Verify legacy token</button></>}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setSettingsOpen(false)}>Cancel</button><button className="primary-button" onClick={() => void saveSettings()}><Check size={15}/> Save settings</button></div></section></div>}
    {memoryOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setMemoryOpen(false) }}><section className="settings-modal memory-modal"><div className="modal-head"><div><div className="eyebrow">PERSISTENT CONTEXT</div><h2>Saved memory</h2></div><button className="icon-button" onClick={() => setMemoryOpen(false)}><X size={18}/></button></div><p className="field-help">These notes are stored on this PC and can be included in future Aider prompts. Nothing is uploaded automatically.</p><textarea className="memory-input" value={memoryDraft} onChange={e => setMemoryDraft(e.target.value)} placeholder="Remember a project convention, decision, or preference…"/><button className="primary-button full" onClick={() => void addMemory()}><Plus size={15}/> Save memory</button><div className="memory-list">{memories.map(m => <div className="memory-card" key={m.id}><div><span className="memory-category">{m.category}</span><p>{m.content}</p><small>{m.syncEnabled ? 'Cloud synced' : 'Local only'}</small></div><button className={'icon-button memory-sync ' + (m.syncEnabled ? 'is-synced' : '')} onClick={() => void toggleMemorySync(m)} aria-label={m.syncEnabled ? 'Remove cloud memory' : 'Sync memory to cloud'} title={m.syncEnabled ? 'Remove cloud copy' : 'Sync this memory'}><Cloud size={14}/></button><button className="icon-button" onClick={() => void deleteMemory(m.id)} aria-label="Delete memory"><Trash2 size={15}/></button></div>)}{!memories.length && <div className="empty-memory"><Archive size={22}/><p>No saved memories yet.</p></div>}</div></section></div>}
  </div>
}
function ArrowUpRightIcon() { return <ArrowDown className="suggestion-arrow" size={15} style={{ transform: 'rotate(-45deg)' }} /> }
export default App
