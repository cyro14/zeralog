// SteamGridDB API (https://www.steamgriddb.com/api/v2): capas feitas pela comunidade.
// A chave é gratuita (Settings → API Keys na conta SteamGridDB) e fica neste navegador.
import { normText } from './gameApi.js';

const KEY_STORAGE = 'zeralog_sgdb_key';
const API = 'https://www.steamgriddb.com/api/v2';
const PROXY = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';

export const getSgdbKey = () => { try { return (localStorage.getItem(KEY_STORAGE) || '').trim(); } catch (e) { return ''; } };
export const setSgdbKey = k => { try { k ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE); } catch (e) {} };
export const hasSgdbKey = () => !!getSgdbKey();

const norm = s => normText(s).replace(/[^a-z0-9]+/g, '');

async function sgdbApi(path, params = {}) {
    const key = getSgdbKey();
    if (!key) return null;
    const url = `${API}${path}?${new URLSearchParams(params)}`;
    const opts = { headers: { Authorization: 'Bearer ' + key } };
    const urls = [url, `${PROXY}?url=${encodeURIComponent(url)}`];
    let last = null;
    for (const u of urls) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        try {
            const res = await fetch(u, { ...opts, signal: ctrl.signal });
            clearTimeout(timer);
            const data = res.ok ? await res.json() : null;
            if (res.status === 401 || res.status === 403) throw Object.assign(new Error('SteamGridDB recusou a chave. Gere outra em steamgriddb.com/profile/preferences/api.'), { status: res.status });
            if (!res.ok) { last = Object.assign(new Error(`SteamGridDB ${res.status}`), { status: res.status }); continue; }
            return data;
        } catch (e) {
            clearTimeout(timer);
            if (e && (e.status === 401 || e.status === 403)) throw e;
            last = e;
        }
    }
    throw last || new Error('Não consegui falar com a SteamGridDB.');
}

// Procurar o jogo e depois os grids verticais (600×900, 342×482 etc.).
export async function fetchSgdbCovers(title, limit = 12) {
    const q = String(title || '').trim();
    if (!q || !getSgdbKey()) return [];
    const found = await sgdbApi(`/search/autocomplete/${encodeURIComponent(q)}`);
    if (!found || found.success === false || !Array.isArray(found.data)) return [];
    const want = norm(q);
    const game = found.data.find(x => norm(x.name) === want)
        || found.data.find(x => { const n = norm(x.name); return n && (n.startsWith(want) || want.startsWith(n)); })
        || found.data[0];
    if (!game || !game.id) return [];
    const grids = await sgdbApi(`/grids/game/${game.id}`, {
        dimensions: '600x900,342x482,660x930',
        types: 'static',
        limit
    });
    const data = grids && Array.isArray(grids.data) ? grids.data : [];
    return data.map(g => ({
        url: g.url || g.thumb,
        previewUrl: g.thumb || g.url,
        source: 'SteamGridDB',
        label: `${game.name}${g.width && g.height ? ` · ${g.width}×${g.height}` : ''}`,
        vertical: !g.width || !g.height || g.height >= g.width,
        sgdbId: g.id
    }));
}
