// Busca automática de dados de jogos via RAWG (https://rawg.io/apidocs).
// Dica: crie sua própria chave gratuita lá e troque abaixo.
const DEFAULT_KEY = 'ae08037aa9fb40a48b12090819cedb07';
const KEY_STORAGE = 'zeralog_rawg_key';

// A chave pode ser trocada em Configurações, sem mexer no código
export const getRawgKey = () => { try { return (localStorage.getItem(KEY_STORAGE) || '').trim() || DEFAULT_KEY; } catch (e) { return DEFAULT_KEY; } };
export const setRawgKey = k => { try { k ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE); } catch (e) {} };
export const hasCustomRawgKey = () => { try { return !!localStorage.getItem(KEY_STORAGE); } catch (e) { return false; } };

export const GENRES_PT = {
    'Action': 'Ação', 'Indie': 'Indie', 'Adventure': 'Aventura', 'RPG': 'RPG',
    'Strategy': 'Estratégia', 'Shooter': 'Tiro', 'Casual': 'Casual', 'Simulation': 'Simulação',
    'Puzzle': 'Quebra-cabeça', 'Arcade': 'Arcade', 'Platformer': 'Plataforma', 'Racing': 'Corrida',
    'Massively Multiplayer': 'Multiplayer massivo', 'Sports': 'Esportes', 'Fighting': 'Luta',
    'Family': 'Família', 'Board Games': 'Jogos de tabuleiro', 'Educational': 'Educacional', 'Card': 'Cartas'
};

// Escapa texto vindo de fora antes de usar em innerHTML
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A RAWG serve versões redimensionadas das imagens (mais leve)
export function resizeUrl(url, width) {
    return url && url.includes('/media/games/') ? url.replace('/media/games/', `/media/resize/${width}/-/games/`) : url;
}

function normalize(g) {
    return {
        rawgId: g.id,
        title: g.name,
        released: g.released || '',
        tba: !!g.tba,                       // AAAA-MM-DD
        genres: (g.genres || []).map(x => GENRES_PT[x.name] || x.name),
        metacritic: g.metacritic || null,
        playtime: g.playtime || 0,                        // média de horas dos usuários da RAWG
        image: g.background_image || null,
        imageExtra: g.background_image_additional || null,
        description: (g.description_raw || '').trim()
    };
}

async function rawg(path, params = {}) {
    const qs = new URLSearchParams({ ...params, key: getRawgKey() });
    let res;
    try { res = await fetch(`https://api.rawg.io/api${path}?${qs}`); }
    catch (e) { throw Object.assign(new Error('network'), { kind: 'network' }); }
    if (!res.ok) throw Object.assign(new Error(`RAWG ${res.status}`), { kind: 'http', status: res.status });
    return res.json();
}

// Mensagem clara para o usuário, conforme o tipo de falha
export function describeError(err) {
    if (err && err.kind === 'http') {
        if (err.status === 401 || err.status === 403) return 'A chave da RAWG foi recusada (inválida ou expirada). Gere uma chave grátis em rawg.io/apidocs e cole em Configurações.';
        if (err.status === 429) return 'Limite de buscas da chave da RAWG atingido. Use sua própria chave grátis (rawg.io/apidocs) em Configurações.';
        return `A RAWG respondeu com erro ${err.status}. Tente de novo em instantes.`;
    }
    return 'Não consegui falar com a RAWG. Verifique a internet ou se algum bloqueador de anúncios está barrando api.rawg.io.';
}

export async function searchGames(query, pageSize = 6) {
    const data = await rawg('/games', { search: query, page_size: pageSize });
    return (data.results || []).map(normalize);
}

// Busca paginada sem DLCs/complementos (usada nas sugestões de franquia)
export async function searchFranchiseGames(query, page = 1, pageSize = 10) {
    const data = await rawg('/games', { search: query, page_size: pageSize, page, exclude_additions: 'true' });
    return { items: (data.results || []).map(normalize), more: !!data.next, count: data.count || 0 };
}

// Jogos da mesma série/franquia (RAWG /games/{id}/game-series)
export async function getGameSeries(id) {
    const data = await rawg(`/games/${id}/game-series`, { page_size: 20 });
    return (data.results || []).map(normalize);
}

// Lojas que vendem o jogo (usado para achar o ID da Steam e a capa vertical)
export async function getGameStores(id) {
    const data = await rawg(`/games/${id}/stores`);
    return data.results || [];
}

// A busca não traz a descrição; ela vem do endpoint de detalhes
export async function getGameDetails(id) {
    return normalize(await rawg(`/games/${id}`));
}

// Dados extras usados pelo GameMatch e pela busca avançada (plataformas, tags, avaliações)
function normalizeFull(g) {
    const base = normalize(g);
    return {
        ...base,
        rating: g.rating || 0,
        ratingsCount: g.ratings_count || 0,
        platforms: (g.platforms || []).map(p => p.platform && p.platform.name).filter(Boolean),
        tags: (g.tags || []).map(t => t.name).filter(Boolean),
        esrb: (g.esrb_rating && g.esrb_rating.name) || ''
    };
}
// Lista genérica da RAWG com os campos completos
export async function listGames(params) {
    const data = await rawg('/games', params);
    return { items: (data.results || []).map(normalizeFull), more: !!data.next, count: data.count || 0 };
}
export const normText = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- fontes diretas (fallback quando a RAWG falha ou não tem o dado) ----------
// HLTB e Metacritic não têm CORS aberto; as chamadas passam por proxies públicos.
const SCRAPE_PROXIES = [
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`
];
async function scrape(url, postBody) {
    for (const mk of SCRAPE_PROXIES) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
            const opt = postBody
                ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: postBody, signal: ctrl.signal }
                : { signal: ctrl.signal };
            const res = await fetch(mk(url), opt);
            clearTimeout(t);
            if (res.ok) return await res.text();
        } catch (e) { clearTimeout(t); }
    }
    return null;
}

const metaSlug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Nota do Metacritic lida da página do jogo (JSON-LD da própria página)
export async function fetchMetacriticScore(title) {
    const slugs = [metaSlug(title)];
    const short = metaSlug(String(title).replace(/\s+(?:[ivx]+|\d+)\s*$/i, ''));
    if (short && short !== slugs[0]) slugs.push(short);
    for (const slug of slugs) {
        if (!slug) continue;
        const html = await scrape(`https://www.metacritic.com/game/${slug}/`);
        if (!html) continue;
        const m = html.match(/"aggregateRating"\s*:\s*\{[^}]*"ratingValue"\s*:\s*(\d{1,3})/) || html.match(/"ratingValue"\s*:\s*(\d{1,3})/);
        if (m) { const v = parseInt(m[1], 10); if (v >= 0 && v <= 100) return v; }
    }
    return null;
}

// Tempo para zerar (história principal) lido da busca do HowLongToBeat
export async function fetchHLTBTime(title) {
    const body = JSON.stringify({
        searchType: 'games', searchTerms: [title], searchPage: 1, size: 3,
        searchOptions: { games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: 0, max: 0 }, gameplay: { perspective: '', flow: '', genre: '' }, modifier: '' }, users: { sortCategory: 'postcount' } },
        filter: '', sort: 0, randomizer: 0
    });
    const txt = await scrape('https://howlongtobeat.com/api/search', body);
    if (!txt) return null;
    try {
        const data = JSON.parse(txt);
        const g = (data.data || [])[0];
        const sec = g && (g.comp_main || 0);
        return sec > 0 ? Math.round(sec / 360) / 10 : null;
    } catch (e) { return null; }
}

export async function blobToSmallJpeg(blob, maxSide = 420) {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));   // serve para capa vertical e horizontal
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
}

// Baixa uma imagem como Blob (direto; se o site bloquear, tenta por um proxy CORS). Retorna null se falhar.
export async function fetchImageBlob(url) {
    if (String(url).startsWith('data:')) { try { return await (await fetch(url)).blob(); } catch (e) { return null; } }
    const tries = [url, 'https://corsproxy.io/?url=' + encodeURIComponent(url)];
    for (const u of tries) {
        try {
            const res = await fetch(u);
            if (!res.ok) continue;
            const blob = await res.blob();
            if (blob.size > 200 && (!blob.type || blob.type.startsWith('image/'))) return blob;
        } catch (e) { /* tenta a próxima opção */ }
    }
    return null;
}

// Baixa a capa e guarda como base64 pequeno (o localStorage tem ~5MB de limite)
export async function coverToDataURL(url) {
    const first = url.includes('/media/games/') ? resizeUrl(url, 420) : url;
    for (const u of [first, url]) {
        const blob = await fetchImageBlob(u);
        if (blob) { try { return await blobToSmallJpeg(blob); } catch (e) { /* tenta a próxima */ } }
    }
    return url; // último recurso: guarda o link (aparece na lista, mas pode falhar no card de compartilhar)
}

// Largura e altura de uma imagem (Blob ou URL de dados)
export async function imageSize(src) {
    try {
        const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
        const bmp = await createImageBitmap(blob);
        const out = { w: bmp.width, h: bmp.height };
        bmp.close && bmp.close();
        return out;
    } catch (e) { return null; }
}
export const isVerticalSize = s => !!s && s.h >= s.w * 1.1;

// Fotos enviadas pelo usuário também são reduzidas (evita estourar o localStorage)
export async function fileToSmallJpeg(file) {
    try { return await blobToSmallJpeg(file); }
    catch (e) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
}
