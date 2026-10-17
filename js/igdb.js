// IGDB (https://api.igdb.com/v4) — fichas e capas dos jogos.
//
// ATENÇÃO: a "chave da IGDB" na verdade é da TWITCH (a IGDB é da Twitch desde 2019).
// Não existe mais página de chave no site da IGDB; o caminho é:
//   1. dev.twitch.tv/console/apps → "Registrar aplicativo" (categoria "Integração de site");
//   2. copiar o CLIENT ID e o CLIENT SECRET para Configurações → Capas e Busca.
// O token é gerado com o fluxo client_credentials da Twitch e vale ~60 dias.
//
// CORS: id.twitch.tv aceita chamadas do navegador; api.igdb.com NÃO — por isso as
// consultas passam pelo Worker do projeto (steam-proxy/worker.js, host api.igdb.com).
// Se o Worker não estiver atualizado, a consulta ainda é tentada direto.
const CLIENT_KEY = 'zeralog_igdb_client';     // { id, secret }
const TOKEN_KEY = 'zeralog_igdb_token';       // { token, expiresAt }
const PROXY = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';
const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token';
const API = 'https://api.igdb.com/v4';
const WORKER_HINT = 'Atualize o Worker do projeto (docs/steam-proxy.md) — ele precisa liberar a api.igdb.com.';

// ---------- credenciais (Client ID + Client Secret da Twitch) ----------
export function getIgdbClient() {
    try {
        const raw = localStorage.getItem(CLIENT_KEY);
        if (!raw) return { id: '', secret: '' };
        try {
            const o = JSON.parse(raw);
            if (o && typeof o === 'object') return { id: String(o.id || '').trim(), secret: String(o.secret || '').trim() };
        } catch (e) { /* valor antigo: uma string solta (o token que a tela pedia antes) */ }
        return { id: String(raw).trim(), secret: '' };
    } catch (e) { return { id: '', secret: '' }; }
}

export function setIgdbClient(id, secret) {
    try {
        const c = { id: String(id || '').trim(), secret: String(secret || '').trim() };
        if (!c.id && !c.secret) localStorage.removeItem(CLIENT_KEY);
        else localStorage.setItem(CLIENT_KEY, JSON.stringify(c));
        // credencial nova = token velho não serve mais
        clearIgdbToken();
    } catch (e) {}
}

export function igdbConfigured() {
    const c = getIgdbClient();
    return !!(c.id && c.secret);
}

// ---------- token (client_credentials da Twitch) ----------
let cache = { token: '', expiresAt: 0 };

function loadCachedToken() {
    if (cache.token && Date.now() < cache.expiresAt) return cache.token;
    try {
        const raw = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
        if (raw && raw.token && Date.now() < (raw.expiresAt || 0)) {
            cache = { token: raw.token, expiresAt: raw.expiresAt };
            return cache.token;
        }
    } catch (e) {}
    return '';
}

function saveToken(token, expiresIn) {
    // 1 minuto de margem para não usar um token que vence no meio da chamada
    const expiresAt = Date.now() + Math.max(60, (Number(expiresIn) || 3600) - 60) * 1000;
    cache = { token, expiresAt };
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(cache)); } catch (e) {}
}

export function clearIgdbToken() {
    cache = { token: '', expiresAt: 0 };
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

export function hasIgdbToken() { return !!loadCachedToken(); }

async function twitchToken(force = false) {
    if (!force) {
        const cached = loadCachedToken();
        if (cached) return cached;
    }
    const c = getIgdbClient();
    if (!c.id || !c.secret) throw new Error('IGDB: preencha o Client ID e o Client Secret (Configurações → Capas e Busca).');
    const qs = new URLSearchParams({ client_id: c.id, client_secret: c.secret, grant_type: 'client_credentials' });
    const res = await fetch(`${TWITCH_TOKEN}?${qs}`, { method: 'POST' });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (res.status === 400 || res.status === 401) throw new Error('A Twitch recusou o Client ID/Secret da IGDB. Confira os dois campos (são do app em dev.twitch.tv/console/apps).');
        throw new Error(`Twitch ${res.status} ao gerar o token da IGDB. ${txt.slice(0, 120)}`);
    }
    const data = await res.json();
    if (!data || !data.access_token) throw new Error('A Twitch não devolveu o token da IGDB.');
    saveToken(data.access_token, data.expires_in);
    return data.access_token;
}

// ---------- consulta (Apicalypse) ----------
// A IGDB não é REST: o corpo do POST é a linguagem de consulta deles
// (ex.: `search "Portal 2"; fields name,cover.image_id; limit 8;`).
async function igdbApi(path, query) {
    const c = getIgdbClient();
    if (!c.id || !c.secret) throw new Error('IGDB: preencha o Client ID e o Client Secret (Configurações → Capas e Busca).');
    const target = `${API}${path}`;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await twitchToken(attempt > 0);
        const opts = {
            method: 'POST',
            headers: { 'Client-ID': c.id, 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain', 'Accept': 'application/json' },
            body: query
        };
        // Worker primeiro (a api.igdb.com não manda CORS); depois direto, caso o Worker esteja velho.
        const urls = PROXY ? [`${PROXY}?url=${encodeURIComponent(target)}`, target] : [target];
        let res = null;
        for (const u of urls) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 15000);
            try {
                const r = await fetch(u, { ...opts, signal: ctrl.signal });
                clearTimeout(timer);
                res = r;
                // 401 (token caiu) e 400 (Worker velho) são respostas para o app, não motivo de nova rota
                if (r.ok || r.status === 400 || r.status === 401) break;
                lastError = new Error(`IGDB ${r.status}`);
            } catch (e) { clearTimeout(timer); lastError = e; }
        }
        if (!res) throw lastError || new Error('Não consegui falar com a IGDB.');
        if (res.status === 401) { clearIgdbToken(); continue; }
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            if (/fora da lista permitida/i.test(txt)) throw new Error(WORKER_HINT);
            throw new Error(`IGDB ${res.status}: ${txt.slice(0, 140)}`);
        }
        return await res.json();
    }
    throw new Error('A IGDB recusou o token gerado pela Twitch. Confira o Client ID/Secret em Configurações → Capas e Busca.');
}

// O título entra numa consulta da IGDB: aspas e barras quebrariam a sintaxe.
const apicalypseText = s => String(s || '').replace(/["\\\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

const coverUrl = (id, size = 't_cover_big_2x') => `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg`;

// Capas verticais dos jogos que casam com o título (a IGDB ordena por relevância).
// Devolve o mesmo formato das outras fontes de capa do app (js/covers.js).
export async function fetchIGDBCovers(title, limit = 8) {
    const q = apicalypseText(title);
    if (!q || !igdbConfigured()) return [];
    try {
        const games = await igdbApi('/games', `search "${q}"; fields name,cover.image_id; limit ${Math.max(1, Number(limit) || 8)};`);
        return (games || [])
            .filter(g => g && g.cover && g.cover.image_id)
            .map(g => ({
                url: coverUrl(g.cover.image_id),
                previewUrl: coverUrl(g.cover.image_id, 't_cover_big'),
                source: 'IGDB',
                label: `${g.name || title} · capa`,
                vertical: true
            }));
    } catch (e) {
        console.warn('IGDB: capas indisponíveis —', e && e.message);
        return [];
    }
}

// Teste da tela de configurações: devolve o que aconteceu, sem engolir o erro.
export async function igdbSelfTest(title = 'Portal 2') {
    if (!igdbConfigured()) return { ok: false, error: 'Preencha o Client ID e o Client Secret primeiro.' };
    try {
        const games = await igdbApi('/games', `search "${apicalypseText(title)}"; fields name,cover.image_id; limit 1;`);
        const g = (games || [])[0];
        if (!g) return { ok: false, error: 'A IGDB respondeu, mas não achou nenhum jogo no teste.' };
        return { ok: true, name: g.name, cover: g.cover && g.cover.image_id ? coverUrl(g.cover.image_id) : '' };
    } catch (e) {
        return { ok: false, error: (e && e.message) || 'falha desconhecida' };
    }
}
