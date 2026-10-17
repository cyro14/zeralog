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

// A RAWG serve versões redimensionadas das imagens (mais leve) — vale para capas e screenshots
export function resizeUrl(url, width) {
    if (!url) return url;
    if (url.includes('/media/games/')) return url.replace('/media/games/', `/media/resize/${width}/-/games/`);
    if (url.includes('/media/screenshots/')) return url.replace('/media/screenshots/', `/media/resize/${width}/-/screenshots/`);
    return url;
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
        description: (g.description_raw || '').trim(),
        developers: (g.developers || []).map(x => x.name).filter(Boolean),        // só no endpoint de detalhes
        publishers: (g.publishers || []).map(x => x.name).filter(Boolean),        // só no endpoint de detalhes
        screenshots: (g.short_screenshots || []).map(x => x.image).filter(Boolean) // miniaturas vindas da listagem
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

// Screenshots oficiais do jogo (o detalhe só traz a contagem, as imagens moram aqui)
export async function getGameScreenshots(id, pageSize = 10) {
    const data = await rawg(`/games/${id}/screenshots`, { page_size: pageSize });
    return (data.results || []).map(x => x.image).filter(Boolean);
}

// Galeria de screenshots (página do jogo na biblioteca e no Explorar):
// clique abre a imagem em tela cheia dentro do próprio app (viewImage)
export function shotsGalleryHtml(urls) {
    return `<div class="gp-shots">${(urls || []).map(u => `<button type="button" class="gp-shot" onclick="window.viewImage && window.viewImage('${esc(u)}')" title="Ver em tamanho cheio"><img src="${esc(resizeUrl(u, 640))}" alt="Screenshot do jogo" loading="lazy"></button>`).join('')}</div>`;
}

// Abre uma imagem em tela cheia no próprio app: toque/clique em qualquer lugar, Esc
// ou o botão voltar do celular fecham. Usado pelas screenshots e capa do jogo.
let lbKeyClose = e => { if (e.key === 'Escape') viewImageClose(); };
export function viewImage(url) {
    viewImageClose();
    const lb = document.createElement('div');
    lb.id = 'gp-lightbox';
    lb.className = 'gp-lightbox';
    lb.innerHTML = `<img src="${esc(url)}" alt="Imagem ampliada"><button type="button" class="lb-close" title="Fechar (Esc)">✕</button>`;
    lb.addEventListener('click', () => viewImageClose());
    document.body.appendChild(lb);
    document.addEventListener('keydown', lbKeyClose);
    if (window.zlNavPush) window.zlNavPush(() => { if (document.getElementById('gp-lightbox')) { viewImageClose(); return true; } return false; });
}
export function viewImageClose() {
    const el = document.getElementById('gp-lightbox');
    if (el) el.remove();
    document.removeEventListener('keydown', lbKeyClose);
}

// Dados extras usados pelo GameMatch e pela busca avançada (plataformas, tags, avaliações)
function normalizeFull(g) {
    const base = normalize(g);
    return {
        ...base,
        rating: g.rating || 0,
        ratingsCount: g.ratings_count || 0,
        added: g.added || 0,   // quantas pessoas adicionaram o jogo: o "hype" da RAWG (ordering=-added)
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

// Busca estúdios (developers) ou publicadoras (publishers) pelo nome — filtro do Explorar.
// São ~465 mil cadastros, então a lista é digitada e buscada, não baixada inteira.
// A busca da RAWG ordena por "score" e traz muito nome pequeno: pegamos uma página maior,
// jogamos fora quem não tem jogos e colocamos os estúdios maiores na frente.
export async function searchCompanies(kind, query) {
    const data = await rawg(`/${kind}`, { search: query, page_size: 20 });
    return (data.results || [])
        .map(x => ({ id: x.id, name: x.name, gamesCount: x.games_count || 0 }))
        .filter(c => c.gamesCount > 0)
        .sort((a, b) => b.gamesCount - a.gamesCount)
        .slice(0, 8);
}
export const normText = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Adivinha a franquia a partir do título: corta subtítulo ("The Witcher 3: Wild Hunt" -> "The Witcher"),
// número final, edição e variações ("Remake", "HD", "GOTY"...). Vazio se não parecer série.
export function guessFranchise(title) {
    const t = String(title || '').trim();
    if (!t) return '';
    const base = t.split(/\s*[:–—]\s*/)[0]
        .replace(/\s+(?:Episode\s+\w+|[IVX]{2,}|\d+|HD|Remastered|Remaster|Remake|Definitive Edition|GOTY|Game of the Year.*)$/i, '')
        .replace(/\s+(?:Collection|Trilogy|Anthology)$/i, '')
        .trim();
    return base.length >= 3 && t.length - base.length >= 2 ? base : '';
}

// ---------- fontes diretas (fallback quando a RAWG falha ou não tem o dado) ----------
// HLTB e Metacritic não têm CORS aberto; as chamadas passam por proxies públicos.
// O Worker do projeto (mesmo das lojas) encabeça a fila — é o único que passa POST
// (necessário para a busca do HowLongToBeat) e o único que repassa cabeçalhos
// (o token curto do HLTB) para hosts permitidos.
// O corsproxy.io (401 sem chave) e o api.cors.lol (429 direto) saíram daqui: só
// apareciam no console como erro e nunca respondiam.
const ZERALOG_PROXY = 'https://worker-rapid-dawn-e634.cyromtg.workers.dev/';
const workerProxy = u => `${ZERALOG_PROXY}?url=${encodeURIComponent(u)}`;
workerProxy.worker = true;   // marca: só ele repassa os cabeçalhos do app
const SCRAPE_PROXIES = [
    workerProxy,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
];
async function scrape(url, postBody, headers) {
    for (const mk of SCRAPE_PROXIES) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
            const opt = postBody
                ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: postBody, signal: ctrl.signal }
                : { signal: ctrl.signal };
            // cabeçalho próprio (token do HLTB) só vai pelo Worker: proxy público não é confiável
            if (headers && mk.worker) opt.headers = { ...(opt.headers || {}), ...headers };
            const res = await fetch(mk(url), opt);
            clearTimeout(t);
            if (res.ok) return await res.text();
        } catch (e) { clearTimeout(t); }
    }
    return null;
}
export const scrapeUrl = scrape;

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

// Busca completa no HowLongToBeat: retorna { hours, imageUrl } do melhor resultado.
// A imagem do HLTB é boxart vertical — boa fonte para jogos antigos/ausentes da RAWG.
//
// A busca do site mudou: agora é /api/search/site e exige o cabeçalho x-auth-token
// com um token curto de /api/search/site/init. O token vale para o IP + o User-Agent
// de quem pediu, e o site só responde 200 para quem manda Referer dele mesmo (o
// navegador não deixa o app mandar Referer) — por isso TUDO passa pelo Worker, que
// repassa o token e se apresenta como navegador. Sem o Worker atualizado o HLTB
// simplesmente fica indisponível (e o app segue com as outras fontes).
const HLTB_SEARCH = 'https://howlongtobeat.com/api/search/site';
const HLTB_INIT = 'https://howlongtobeat.com/api/search/site/init';
let hltbToken = { token: '', at: 0 };

function hltbBody(title) {
    return JSON.stringify({
        searchType: 'games', searchTerms: [title], searchPage: 1, size: 3,
        searchOptions: {
            games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: 0, max: 0 }, gameplay: { perspective: '', flow: '', genre: '' }, modifier: '' },
            users: { sortCategory: 'postcount' }, lists: { sortCategory: 'postcount' }
        },
        useCache: true
    });
}

async function hltbNewToken() {
    const txt = await scrape(HLTB_INIT);
    if (!txt) { hltbToken = { token: '', at: 0 }; return ''; }
    try {
        const t = JSON.parse(txt).token;
        if (!t) return '';
        hltbToken = { token: t, at: Date.now() };
        return t;
    } catch (e) { return ''; }
}

async function hltbSearch(title) {
    if (!title) return null;
    const fresh = hltbToken.token && Date.now() - hltbToken.at < 10 * 60 * 1000;
    let token = fresh ? hltbToken.token : await hltbNewToken();
    if (!token) return null;
    let txt = await scrape(HLTB_SEARCH, hltbBody(title), { 'x-auth-token': token });
    // 403 = token expirado (o site renova na hora): pega outro e repete UMA vez
    if (!txt) {
        token = await hltbNewToken();
        if (!token) return null;
        txt = await scrape(HLTB_SEARCH, hltbBody(title), { 'x-auth-token': token });
    }
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
}

export async function fetchHLTBData(title) {
    const data = await hltbSearch(title);
    if (!data) return null;
    const g = (data.data || [])[0];
    if (!g) return null;
    const sec = g.comp_main || 0;
    const img = g.game_image ? `https://howlongtobeat.com/games/${g.game_image}` : null;
    return { hours: sec > 0 ? Math.round(sec / 360) / 10 : null, imageUrl: img };
}

// Tempo para zerar (história principal) lido da busca do HowLongToBeat
export async function fetchHLTBTime(title) {
    const data = await hltbSearch(title);
    if (!data) return null;
    const g = (data.data || [])[0];
    const sec = g && (g.comp_main || 0);
    return sec > 0 ? Math.round(sec / 360) / 10 : null;
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

// Proxies de IMAGEM (binário): devolvem os bytes crus do arquivo com CORS liberado.
// O corsproxy.io passou a exigir chave (401 nas chamadas sem token) — ele continua na
// lista, mas no fim: quem responde primeiro resolve (allorigins e codetabs).
export const IMAGE_PROXIES = [
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
];

// URLs que valem uma tentativa, em ordem de preferência:
//  1) direta;
//  2) direta com "cache-buster" — o navegador pode ter guardado a resposta de um <img>
//     SEM "Access-Control-Allow-Origin" e então barra o fetch com "bloqueado pela
//     política de CORS"; trocar a URL força a ida ao servidor (era o bug das
//     screenshots da RAWG que "não existiam" para o app);
//  3) cada proxy público, nas duas versões.
export function imageAttempts(url) {
    const bust = `${url}${url.includes('?') ? '&' : '?'}zl=${Date.now()}`;
    const out = [url, bust];
    IMAGE_PROXIES.forEach(mk => out.push(mk(url)));
    IMAGE_PROXIES.forEach(mk => out.push(mk(bust)));
    return out;
}

// Baixa uma imagem como Blob (direto; se o site bloquear, tenta os proxies CORS).
// Timeout curto por tentativa e um teto total: uma fonte pendurada não pode segurar
// a fila de capas verticais nem o seletor de fundos.
export async function fetchImageBlob(url, { timeout = 7000, deadline = 15000 } = {}) {
    if (String(url).startsWith('data:')) { try { return await (await fetch(url)).blob(); } catch (e) { return null; } }
    const started = Date.now();
    for (const u of imageAttempts(url)) {
        if (Date.now() - started > deadline) break;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
            const res = await fetch(u, { signal: ctrl.signal, cache: 'no-store' });
            clearTimeout(timer);
            // 404/410 = a imagem não existe mais: nenhum proxy vai inventar o arquivo
            if (res.status === 404 || res.status === 410) return null;
            if (!res.ok) continue;
            // um proxy pode devolver a página de erro em HTML dizendo "ok"
            const type = (res.headers && res.headers.get('content-type')) || '';
            if (type && !/^image\//i.test(type)) continue;
            const blob = await res.blob();
            if (blob.size > 200 && (!blob.type || blob.type.startsWith('image/'))) return blob;
        } catch (e) { clearTimeout(timer); /* tenta a próxima opção */ }
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

// Fotos enviadas pelo usuário também são reduzidas (evita estourar o localStorage).
// Screenshots pedem resolução maior que capa: chame com maxSide=1080.
export async function fileToSmallJpeg(file, maxSide = 420) {
    try { return await blobToSmallJpeg(file, maxSide); }
    catch (e) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
}
