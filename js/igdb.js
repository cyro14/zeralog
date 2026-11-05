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
// Padrão do APP (colado aqui pelo dono do projeto): a IGDB já vem ativa de fábrica,
// sem ninguém precisar configurar nada. Quem quiser usar as PRÓPRIAS credenciais,
// preenche em Configurações → Capas e Busca (vale por cima do padrão).
const DEFAULT_CLIENT = { id: '3z03dhefpo4ktv8fhnmykftbli2ri3', secret: 'czb366a75zpiejx86t70xvsuj4dvh1' };

export function getIgdbClient() {
    try {
        const raw = localStorage.getItem(CLIENT_KEY);
        if (!raw) return { ...DEFAULT_CLIENT };   // navegador "de fábrica": par padrão do app
        try {
            const o = JSON.parse(raw);
            if (o && o.off) return { id: '', secret: '' };   // apagado de propósito nas Configurações: desligada
            if (o && typeof o === 'object') return { id: String(o.id || '').trim(), secret: String(o.secret || '').trim() };
        } catch (e) { /* valor antigo: uma string solta (o token que a tela pedia antes) */ }
        return { id: String(raw).trim(), secret: '' };
    } catch (e) { return { ...DEFAULT_CLIENT }; }
}

export function setIgdbClient(id, secret) {
    try {
        const c = { id: String(id || '').trim(), secret: String(secret || '').trim() };
        if (!c.id && !c.secret) localStorage.setItem(CLIENT_KEY, JSON.stringify({ off: true }));
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

// ---------- busca e ficha completas (segunda fonte de dados) ----------
// A RAWG anda ficando fora do ar por dias; a IGDB cobre TODOS os jogos (não só os
// da Steam). Usa o mesmo igdbApi de cima (token da Twitch + Worker do projeto).
// Gêneros da IGDB vêm em inglês com nomes próprios deles — traduza os comuns.
const GENRES_IGDB_PT = {
    'Role-playing (RPG)': 'RPG', 'Shooter': 'Tiro', 'Platform': 'Plataforma', 'Adventure': 'Aventura',
    'Puzzle': 'Quebra-cabeça', 'Strategy': 'Estratégia', 'Simulator': 'Simulação', 'Sport': 'Esportes',
    'Racing': 'Corrida', 'Fighting': 'Luta', 'Music': 'Música', 'Arcade': 'Arcade', 'Indie': 'Indie',
    'Point-and-click': 'Aponte e clique', 'Visual Novel': 'Novela visual', 'Card & Board Game': 'Cartas e tabuleiro',
    'Turn-based strategy (TBS)': 'Estratégia por turnos', 'Tactical': 'Tático', 'Quiz/Trivia': 'Quiz',
    'Pinball': 'Pinball', 'MOBA': 'MOBA', 'Real Time Strategy (RTS)': 'Estratégia em tempo real',
    'Hack and slash/Beat \'em up': 'Hack and slash'
};
const igdbGenrePt = n => GENRES_IGDB_PT[n] || n || '';
const shotUrl = id => `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${id}.jpg`;

const IGDB_FIELDS = 'name,first_release_date,summary,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.image_id,screenshots.image_id';

// Ficha da IGDB no MESMO formato do normalize() da RAWG (js/gameApi.js)
function mapIgdbGame(g) {
    const dev = [], pub = [];
    (g.involved_companies || []).forEach(ic => {
        const n = ic.company && ic.company.name;
        if (!n) return;
        if (ic.developer) dev.push(n);
        if (ic.publisher) pub.push(n);
    });
    return {
        rawgId: null,
        igdbId: g.id || null,
        title: g.name || '',
        released: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : '',
        tba: false,
        genres: (g.genres || []).map(x => igdbGenrePt(x.name)).filter(Boolean),
        metacritic: null,   // a nota da IGDB é outra régua (agregado próprio): não finja Metacritic
        playtime: 0,
        image: g.cover && g.cover.image_id ? coverUrl(g.cover.image_id) : null,
        imageExtra: null,
        description: String(g.summary || '').trim(),
        developers: dev.slice(0, 8),
        publishers: pub.slice(0, 8),
        screenshots: (g.screenshots || []).map(s => s.image_id ? shotUrl(s.image_id) : null).filter(Boolean)
    };
}

// Busca por título com a ficha já completa (a IGDB devolve tudo de uma vez — não
// precisa de segunda chamada como a Steam). Erro devolve lista vazia: é fallback.
export async function igdbSearchFull(title, limit = 6) {
    const q = apicalypseText(title);
    if (!q || !igdbConfigured()) return [];
    try {
        const games = await igdbApi('/games', `search "${q}"; fields ${IGDB_FIELDS}; limit ${Math.max(1, Number(limit) || 6)};`);
        return (games || []).filter(g => g && g.name).map(mapIgdbGame);
    } catch (e) {
        console.warn('IGDB: busca indisponível —', e && e.message);
        return [];
    }
}

// Ficha pelo id da IGDB (roteada por detailsForGame quando o jogo tem igdbId)
export async function igdbDetailsById(id) {
    if (!id || !igdbConfigured()) return null;
    const games = await igdbApi('/games', `fields ${IGDB_FIELDS}; where id = ${Number(id)}; limit 1;`);
    const g = (games || [])[0];
    return g && g.name ? mapIgdbGame(g) : null;
}

// Screenshots do endpoint próprio da IGDB (a busca pode vir sem elas)
export async function igdbScreenshotsById(id, limit = 10) {
    if (!id || !igdbConfigured()) return [];
    const shots = await igdbApi('/screenshots', `fields image_id; where game = ${Number(id)}; limit ${Math.max(1, Number(limit) || 10)};`);
    return (shots || []).map(s => s.image_id ? shotUrl(s.image_id) : null).filter(Boolean);
}

// ---------- catálogo (Deck/Explorar/Lançamentos) sem a RAWG ----------
// O GameMatch pede catálogo ORDENADO com filtros (ordering/genres/platforms/dates) —
// consulta que só a RAWG oferecia. Com ela fora do ar, a IGDB faz o mesmo papel:
// sort + where + limit/offset no dialeto Apicalypse. A tradução mora aqui.

// Slug de gênero da RAWG -> slug de gênero da IGDB (o que não existe lá é descartado)
const GENRE_SLUG_IGDB = {
    action: 'action', adventure: 'adventure', 'role-playing-games-rpg': 'role-playing-rpg',
    strategy: 'strategy', simulation: 'simulator', shooter: 'shooter', racing: 'racing',
    sports: 'sport', indie: 'indie', puzzle: 'puzzle', fighting: 'fighting',
    platformer: 'platform', arcade: 'arcade', card: 'card-and-board-game', 'board-games': 'card-and-board-game'
};
// Slug de tag da RAWG -> slug de keyword da IGDB (filtros de estilo do perfil)
const TAG_SLUG_IGDB = {
    horror: 'horror', roguelike: 'roguelike', 'souls-like': 'souls-like', 'open-world': 'open-world',
    survival: 'survival', zombies: 'zombies', stealth: 'stealth', 'point-and-click': 'point-and-click',
    'visual-novel': 'visual-novel', metroidvania: 'metroidvania', 'tower-defense': 'tower-defense',
    'battle-royale': 'battle-royale', 'co-op': 'co-op', 'story-rich': 'story-rich', 'free-to-play': 'free-to-play'
};
// Id de plataforma da RAWG -> id de plataforma da IGDB
const PLAT_ID_IGDB = {
    1: 49, 3: 39, 4: 6, 5: 14, 6: 3, 7: 130, 14: 11, 15: 8, 16: 9, 18: 48,
    19: 46, 21: 34, 27: 7, 80: 58, 83: 47, 105: 4, 186: 169, 187: 167
};
// Nome de plataforma da IGDB -> como o app chama (chips e casamento por palavra-chave)
const PLAT_NAME_APP = { 'PC (Microsoft Windows)': 'PC', 'Xbox Series X|S': 'Xbox Series X', Mac: 'macOS' };
// Ordenação da RAWG -> campo de sort da IGDB
const SORT_IGDB = {
    '-popularity': 'total_rating_count desc', '-added': 'hypes desc', '-metacritic': 'aggregated_rating desc',
    '-rating': 'total_rating desc', rating: 'total_rating asc', released: 'first_release_date asc',
    '-released': 'first_release_date desc', name: 'name asc', '-name': 'name desc'
};
const ESRB_NAMES = { 1: 'Rating Pending', 3: 'Everyone', 4: 'Everyone 10+', 5: 'Teen', 6: 'Mature', 7: 'Adults Only' };

const dayTs = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : 0; };

// Traduz os parâmetros do listGames para a consulta da IGDB. Devolve a string
// Apicalypse, ou null quando NÃO dá para reproduzir o filtro (ids de estúdio da
// RAWG, busca por texto) — nesse caso é melhor a tela mostrar o erro do que
// uma lista que ignora o que o usuário pediu.
export function igdbListQuery(params = {}) {
    const p = params || {};
    if (p.developers || p.publishers || p.search) return null;
    const where = [];
    const gslug = String(p.genres || '').split(',').map(s => GENRE_SLUG_IGDB[s.trim()]).filter(Boolean);
    if (p.genres && gslug.length) where.push(`genres.slug = (${gslug.map(s => `"${s}"`).join(',')})`);
    const kslug = String(p.tags || '').split(',').map(s => TAG_SLUG_IGDB[s.trim()]).filter(Boolean);
    if (p.tags && kslug.length) where.push(`keywords.slug = (${kslug.map(s => `"${s}"`).join(',')})`);
    const plats = [...new Set(String(p.platforms || '').split(',').map(Number).map(id => PLAT_ID_IGDB[id]).filter(Boolean))];
    if (p.platforms && plats.length) where.push(`platforms = (${plats.join(',')})`);
    const dates = String(p.dates || '').split(',');
    if (p.dates && dayTs(dates[0])) {
        where.push(`first_release_date >= ${dayTs(dates[0])}`);
        if (dayTs(dates[1])) where.push(`first_release_date < ${dayTs(dates[1]) + 86400}`);   // o fim é inclusivo na RAWG
    }
    // exclude_additions: jogo principal, expansão standalone, remake, remaster, port.
    // ATENÇÃO: é game_type — o campo category foi aposentado pela IGDB (voltou vazio).
    if (p.exclude_additions === 'true') where.push('game_type = (0,4,8,9,10,11)');
    if (p.ordering === '-metacritic') where.push('aggregated_rating > 0');
    // nota sem quem avalie infla jogo obscuro ("5 estrelas" com 2 votos); o piso de 25
    // é o mesmo corte inferior da aba Joias (25–1500), então ela continua funcionando
    if (p.ordering === '-rating') where.push('total_rating_count >= 25');
    const page = Math.max(1, Number(p.page) || 1);
    const size = Math.max(1, Number(p.page_size) || 20);
    return `fields ${IGDB_FIELDS_CATALOG}; `
        + (where.length ? `where ${where.join(' & ')}; ` : '')
        + `sort ${SORT_IGDB[p.ordering] || 'total_rating_count desc'}; limit ${size + 1}; offset ${(page - 1) * size};`;
}

const IGDB_FIELDS_CATALOG = IGDB_FIELDS + ',total_rating,total_rating_count,hypes,platforms.name,themes.name,keywords.name,age_ratings.category,age_ratings.rating';

// Ids de PLUMBING para o deck/Explorar (os onclicks e o exploreById andam por
// rawgId). Negativos e sequenciais: nunca colidem com ids reais nem são salvos
// como rawgId do jogo (addToWishlist/addToBacklog guardam o igdbId em vez dele).
let igdbSynthetic = -1001;
export function _resetIgdbSynthetic() { igdbSynthetic = -1001; }   // determinismo nos testes

// Ficha de catálogo: a base da busca + os campos do normalizeFull da RAWG
function mapIgdbGameFull(g) {
    const base = mapIgdbGame(g);
    const esrb = (g.age_ratings || []).find(a => a.category === 1) || {};   // 1 = ESRB
    return {
        ...base,
        rawgId: igdbSynthetic--,
        rating: g.total_rating ? Math.round(g.total_rating / 2) / 10 : 0,   // régua 0-5 da RAWG
        ratingsCount: g.total_rating_count || 0,
        added: g.hypes || 0,
        platforms: (g.platforms || []).map(x => PLAT_NAME_APP[x.name] || x.name).filter(Boolean),
        tags: [...(g.themes || []), ...(g.keywords || [])].map(x => x.name).filter(Boolean),
        esrb: ESRB_NAMES[esrb.rating] || ''
    };
}

// Catálogo do GameMatch pela IGDB. Devolve no MESMO formato do listGames da RAWG
// ({ items, more, count }) ou null quando não dá para atender (sem credenciais,
// filtro sem tradução, erro) — quem decide é o listGames no gameApi.js.
export async function igdbListGames(params = {}) {
    if (!igdbConfigured()) return null;
    const query = igdbListQuery(params);
    if (!query) return null;
    const size = Math.max(1, Number(params.page_size) || 20);
    try {
        const games = await igdbApi('/games', query);
        const list = games || [];
        return { items: list.slice(0, size).map(mapIgdbGameFull), more: list.length > size };
    } catch (e) {
        console.warn('IGDB: catálogo indisponível —', e && e.message);
        return null;
    }
}
