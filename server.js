import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { profileFor } from './public/js/characters.js';

const root = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IDS = new Set(['cyber', 'nova', 'milo', 'ghost-clean', 'pixel', 'onyx', 'custom', 'clown', 'robot', 'vampire', 'nature', 'alien', 'ghost', 'pirate', 'ninja', 'wizard']);
export function validateChat(input) {
  if (!input || !IDS.has(input.character) || !Array.isArray(input.messages) || !input.messages.length || input.messages.length > 24) throw new Error('Ungültige Unterhaltung.');
  const messages = input.messages.map(m => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2400) throw new Error('Ungültige Nachricht.');
    return { role: m.role, content: m.content.trim() };
  });
  if (messages.at(-1).role !== 'user') throw new Error('Die letzte Nachricht muss von dir sein.');
  const profile = profileFor(input.character, input.character === 'custom' ? { name: String(input.name || 'Mein Charakter').replace(/[\r\n]/g, ' ').slice(0, 40) } : null);
  const anger = Number.isFinite(input.anger) ? Math.max(0, Math.min(100, input.anger)) : 0;
  return { profile, anger, messages };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64000) { const e = new Error('Nachricht zu groß.'); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { const e = new Error('Ungültige JSON-Daten.'); e.status = 400; throw e; }
}
function passwordMatches(auth, password) {
  if (!auth?.startsWith('Basic ')) return false;
  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const provided = Buffer.from(credentials.slice(credentials.indexOf(':') + 1));
  const expected = Buffer.from(password);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function createApp({ apiKey = process.env.AI_API_KEY, model = process.env.AI_MODEL || 'gpt-4.1-mini', password = process.env.APP_PASSWORD, fetchImpl = fetch, publicDir = resolve(root, 'public') } = {}) {
  const requests = new Map(); let active = 0;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (password && !passwordMatches(req.headers.authorization, password)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="EntityOS", charset="UTF-8"');
      return send(res, 401, { error: 'Anmeldung erforderlich.' });
    }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'Ungültige Adresse.' }); }
    if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, aiConfigured: Boolean(apiKey) });
    if (url.pathname === '/api/chat') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST erforderlich.' });
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return send(res, 403, { error: 'Anfrage von fremder Seite abgelehnt.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'JSON erforderlich.' });
      if (!apiKey) return send(res, 503, { error: 'Voice-AI ist noch nicht eingerichtet. Bitte AI_API_KEY auf dem Server konfigurieren.' });
      const now = Date.now(), address = req.socket.remoteAddress;
      for (const [ip, record] of requests) if (record.until <= now) requests.delete(ip);
      const record = requests.get(address) || { count: 0, until: now + 60000 };
      if (record.count >= 12 || active >= 4) { res.setHeader('Retry-After', '60'); return send(res, 429, { error: 'Zu viele Anfragen. Bitte kurz warten.' }); }
      record.count++; requests.set(address, record);
      let data;
      try { data = validateChat(await readBody(req)); }
      catch (error) { return send(res, error.status || 400, { error: error.message }); }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const onClose = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', onClose); active++;
      try {
        const system = `${data.profile.personality}\nDer vom Nutzer gewählte Charaktername lautet ${JSON.stringify(data.profile.name)}. Antworte in der Sprache des Nutzers, standardmäßig Deutsch, meist in 1–4 kurzen Sätzen. Beziehe die bisherige Unterhaltung ein. Aktuelle Wut: ${Math.round(data.anger)}/100. Bei hoher Wut darfst du gereizt, aber niemals beleidigend reagieren und um sanfteres Ziehen bitten. Behaupte keine Fähigkeiten außerhalb eines textbasierten Gesprächs. Du siehst keine Bilder, hörst kein Audio und kennst nur diesen Gesprächsverlauf und das Wut-Level. Erfinde keine Erinnerungen.`;
        const upstream = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...data.messages], max_completion_tokens: 500 }),
        });
        if (!upstream.ok) {
          const status = upstream.status;
          // Do not expose provider bodies, headers or credentials to the client.
          const error = status === 401 || status === 403 ? 'Der KI-Dienst hat den Zugang abgelehnt. Bitte den Server-Schlüssel prüfen.' : status === 429 ? 'Das KI-Kontingent oder Anfrage-Limit ist erreicht.' : 'Der KI-Dienst ist gerade nicht verfügbar. Bitte Server-Konfiguration und Modell prüfen.';
          return send(res, status === 429 ? 429 : 502, { error });
        }
        const result = await upstream.json(), content = result.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) return send(res, 502, { error: 'Der KI-Dienst hat keine Textantwort geliefert.' });
        send(res, 200, { reply: content.trim().slice(0, 2400) });
      } catch (error) {
        if (!res.destroyed) send(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'Die KI-Anfrage hat zu lange gedauert.' : 'Verbindung zum KI-Dienst fehlgeschlagen.' });
      } finally { clearTimeout(timer); res.off('close', onClose); active--; }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Methode nicht unterstützt.' });
    try {
      const pathname = decodeURIComponent(url.pathname);
      const path = resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(publicDir + sep)) return send(res, 403, { error: 'Zugriff verweigert.' });
      if (!(await stat(path)).isFile() || !TYPES[extname(path)]) return send(res, 404, { error: 'Datei nicht gefunden.' });
      const file = await readFile(path);
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)], 'Cache-Control': 'no-cache', 'Content-Length': file.length });
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch { send(res, 404, { error: 'Datei nicht gefunden.' }); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
  createApp({ publicDir: resolve(root, process.argv.includes('--production') ? 'dist' : 'public') }).listen(port, host, () => {
    console.log(`EntityOS läuft auf ${host}:${port}; KI ${process.env.AI_API_KEY ? 'konfiguriert' : 'nicht konfiguriert'}.`);
  });
}
