// ================= GameMatch: o "Tinder de jogos" do ZeraLog =================
// Módulo isolado: cuida do perfil gamer, do motor de compatibilidade, do deck de
// swipe, da página Explorar e da página de Perfil. Os dados vivem em
// appData.gamematch (persistidos junto com o resto do banco local).
import { appData, saveData } from './store.js';
import { listGames, esc, normText, resizeUrl } from './gameApi.js';

const gm = () => appData.gamematch || (appData.gamematch = {});
let DEPS = { toast: (m) => console.log(m), render: null };   // injetado por initGameMatch (main.js)
const toast = (m) => DEPS.toast(m);
const renderApp = () => { if (DEPS.render) DEPS.render(); };   // atualiza Fila/Desejos sem reiniciar o app

// ---------- Opções do perfil (onboarding) ----------
export const GM_PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Mobile', 'Steam Deck'];
export const GM_GENRES = ['RPG', 'Ação', 'Aventura', 'Estratégia', 'Simulação', 'Terror', 'FPS', 'Corrida', 'Esportes', 'Indie', 'Roguelike', 'Soulslike', 'MMORPG', 'Puzzle'];
export const GM_STYLES = [
    { id: 'single', label: 'Single-player' },
    { id: 'multi', label: 'Multiplayer' },
    { id: 'coop', label: 'Coop' },
    { id: 'online', label: 'Online' },
    { id: 'local', label: 'Multiplayer local' }
];
export const GM_PRICES = [
    { id: 'any', label: 'Qualquer preço' },
    { id: '60', label: 'Até R$ 60' },
    { id: '100', label: 'Até R$ 100' },
    { id: '200', label: 'Até R$ 200' },
    { id: '200+', label: 'Tanto faz (inclusive R$ 200+)' }
];
export const GM_TIMES = [
    { id: 'casual', label: 'Casual (pouco tempo)' },
    { id: 'some', label: 'Algumas horas por semana' },
    { id: 'alot', label: 'Muitas horas' },
    { id: 'hardcore', label: 'Hardcore' }
];

// ---------- Mapas para o catálogo RAWG ----------
const GENRE_RAWG = {
    'Ação': { genre: 'action' }, 'Aventura': { genre: 'adventure' }, 'RPG': { genre: 'role-playing-games-rpg' },
    'Estratégia': { genre: 'strategy' }, 'Simulação': { genre: 'simulation' }, 'FPS': { genre: 'shooter' },
    'Corrida': { genre: 'racing' }, 'Esportes': { genre: 'sports' }, 'Indie': { genre: 'indie' }, 'Puzzle': { genre: 'puzzle' },
    'Terror': { tag: 'horror' }, 'Roguelike': { tag: 'roguelike' }, 'Soulslike': { tag: 'souls-like' }, 'MMORPG': { tag: 'massively-multiplayer' }
};
const PLAT_RAWG_IDS = {
    'PC': [4], 'PlayStation': [18, 187, 19, 16, 15], 'Xbox': [1, 186, 14, 80],
    'Nintendo Switch': [7], 'Mobile': [3, 21], 'Steam Deck': [4, 6]
};
// Nomes das plataformas vindos da API ("PlayStation 5", "iOS"...): substring minúscula
const PLAT_KEYWORDS = {
    'PC': ['pc'], 'PlayStation': ['playstation', 'ps '], 'Xbox': ['xbox'],
    'Nintendo Switch': ['nintendo switch', 'nintendo'], 'Mobile': ['android', 'ios'], 'Steam Deck': ['pc', 'linux', 'steamos']
};
// Gêneros que a API devolve -> nome usado no perfil do usuário
const GENRE_ALIAS = { 'Tiro': 'FPS', 'Quebra-cabeça': 'Puzzle', 'Multiplayer massivo': 'MMORPG' };
const GENRE_TAG_ALIAS = { 'horror': 'Terror', 'roguelike': 'Roguelike', 'souls-like': 'Soulslike', 'massively multiplayer': 'MMORPG' };
const STYLE_TAGS = {
    single: ['singleplayer'], multi: ['multiplayer'], coop: ['co-op', 'cooperative', 'online co-op'],
    online: ['online', 'cross-platform multiplayer'], local: ['local multiplayer', 'split screen', 'local co-op']
};

// ---------- Jogos demonstrativos (fallback sem internet p/ o MVP) ----------
const DEMO_GAMES = [
    { title: 'Elden Ring', genres: ['RPG', 'Ação'], tags: ['souls-like', 'singleplayer'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X'], released: '2022-02-25', rating: 4.6, ratingsCount: 18500, playtime: 55 },
    { title: 'Hollow Knight', genres: ['Ação', 'Indie', 'Plataforma'], tags: ['souls-like', 'singleplayer'], platforms: ['PC', 'Nintendo Switch', 'PlayStation 4', 'Xbox One'], released: '2017-02-24', rating: 4.6, ratingsCount: 9200, playtime: 26 },
    { title: 'Stardew Valley', genres: ['RPG', 'Simulação', 'Indie'], tags: ['singleplayer', 'co-op'], platforms: ['PC', 'Nintendo Switch', 'PlayStation 4', 'Mobile'], released: '2016-02-26', rating: 4.5, ratingsCount: 15000, playtime: 80 },
    { title: 'The Witcher 3: Wild Hunt', genres: ['RPG', 'Ação'], tags: ['singleplayer', 'open world'], platforms: ['PC', 'PlayStation 4', 'Xbox One', 'Nintendo Switch'], released: '2015-05-18', rating: 4.7, ratingsCount: 24000, playtime: 70 },
    { title: 'Hades', genres: ['Ação', 'Indie'], tags: ['roguelike', 'singleplayer'], platforms: ['PC', 'Nintendo Switch', 'PlayStation 5'], released: '2020-09-17', rating: 4.5, ratingsCount: 9800, playtime: 23 },
    { title: 'Minecraft', genres: ['Simulação', 'Indie'], tags: ['multiplayer', 'co-op', 'online'], platforms: ['PC', 'Nintendo Switch', 'Mobile', 'PlayStation 4'], released: '2011-11-18', rating: 4.4, ratingsCount: 40000, playtime: 100 },
    { title: 'Dark Souls III', genres: ['RPG', 'Ação'], tags: ['souls-like', 'singleplayer', 'multiplayer'], platforms: ['PC', 'PlayStation 4', 'Xbox One'], released: '2016-04-11', rating: 4.6, ratingsCount: 12000, playtime: 45 },
    { title: 'Celeste', genres: ['Indie', 'Plataforma'], tags: ['singleplayer'], platforms: ['PC', 'Nintendo Switch', 'PlayStation 4', 'Xbox One'], released: '2018-01-25', rating: 4.7, ratingsCount: 8000, playtime: 10 },
    { title: 'Portal 2', genres: ['Puzzle', 'Ação'], tags: ['singleplayer', 'co-op'], platforms: ['PC', 'PlayStation 3', 'Xbox 360'], released: '2011-04-18', rating: 4.8, ratingsCount: 22000, playtime: 9 },
    { title: 'Dead Cells', genres: ['Ação', 'Indie', 'Plataforma'], tags: ['roguelike', 'singleplayer'], platforms: ['PC', 'Nintendo Switch', 'PlayStation 4', 'Mobile'], released: '2018-08-07', rating: 4.5, ratingsCount: 8500, playtime: 30 },
    { title: 'Forza Horizon 5', genres: ['Corrida'], tags: ['multiplayer', 'online', 'open world'], platforms: ['PC', 'Xbox Series X', 'Xbox One'], released: '2021-11-09', rating: 4.4, ratingsCount: 7000, playtime: 30 },
    { title: 'FIFA 23', genres: ['Esportes'], tags: ['multiplayer', 'online', 'local multiplayer'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X', 'Nintendo Switch'], released: '2022-09-30', rating: 3.2, ratingsCount: 5000, playtime: 60 },
    { title: 'World of Warcraft', genres: ['RPG'], tags: ['massively multiplayer', 'online'], platforms: ['PC'], released: '2004-11-23', rating: 4.3, ratingsCount: 9000, playtime: 500 },
    { title: 'Baldur\'s Gate 3', genres: ['RPG', 'Estratégia', 'Aventura'], tags: ['singleplayer', 'co-op', 'local co-op'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X'], released: '2023-08-03', rating: 4.8, ratingsCount: 11000, playtime: 90 },
    { title: 'Resident Evil 4', genres: ['Ação', 'Aventura'], tags: ['horror', 'singleplayer'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X'], released: '2023-03-24', rating: 4.6, ratingsCount: 9500, playtime: 16 },
    { title: 'It Takes Two', genres: ['Ação', 'Aventura', 'Plataforma'], tags: ['co-op', 'local multiplayer', 'online co-op'], platforms: ['PC', 'PlayStation 5', 'Xbox One', 'Nintendo Switch'], released: '2021-03-26', rating: 4.7, ratingsCount: 13000, playtime: 11 },
    { title: 'Factorio', genres: ['Estratégia', 'Simulação', 'Indie'], tags: ['singleplayer', 'multiplayer'], platforms: ['PC'], released: '2020-08-14', rating: 4.6, ratingsCount: 6000, playtime: 120 },
    { title: 'Civilization VI', genres: ['Estratégia', 'Simulação'], tags: ['singleplayer', 'multiplayer'], platforms: ['PC', 'Nintendo Switch', 'Mobile'], released: '2016-10-21', rating: 4.2, ratingsCount: 10000, playtime: 150 },
    { title: 'Counter-Strike 2', genres: ['Ação'], tags: ['shooter', 'multiplayer', 'online'], platforms: ['PC'], released: '2023-09-27', rating: 3.9, ratingsCount: 30000, playtime: 400 },
    { title: 'Chrono Trigger', genres: ['RPG'], tags: ['singleplayer'], platforms: ['Nintendo Switch', 'Mobile', 'PC'], released: '1995-03-11', rating: 4.8, ratingsCount: 4500, playtime: 25 },
    { title: 'The Legend of Zelda: Breath of the Wild', genres: ['Ação', 'Aventura'], tags: ['singleplayer', 'open world'], platforms: ['Nintendo Switch'], released: '2017-03-03', rating: 4.8, ratingsCount: 9500, playtime: 80 },
    { title: 'Among Us', genres: ['Indie', 'Casual'], tags: ['multiplayer', 'online', 'local multiplayer'], platforms: ['PC', 'Nintendo Switch', 'Mobile'], released: '2018-06-15', rating: 3.5, ratingsCount: 20000, playtime: 15 },
    { title: 'Hogwarts Legacy', genres: ['RPG', 'Ação', 'Aventura'], tags: ['singleplayer', 'open world'], platforms: ['PC', 'PlayStation 5', 'Xbox Series X', 'Nintendo Switch'], released: '2023-02-10', rating: 4.2, ratingsCount: 11000, playtime: 35 },
    { title: 'Hollow Knight: Silksong', genres: ['Ação', 'Indie', 'Plataforma'], tags: ['singleplayer'], platforms: ['PC', 'Nintendo Switch', 'PlayStation 5', 'Xbox Series X'], released: null, tba: true, rating: 0, ratingsCount: 0, playtime: 0 }
];

// ---------- Perfil: leitura, criação e "usar dados da biblioteca" ----------
export function gmHasProfile() { return !!gm().profile; }

// Gênero de um jogo da API mapeado para o nome que o usuário escolhe no perfil
export function profileGenreOf(g) {
    const out = new Set();
    (g.genres || []).forEach(x => out.add(GENRE_ALIAS[x] || x));
    (g.tags || []).map(t => String(t).toLowerCase()).forEach(t => { if (GENRE_TAG_ALIAS[t]) out.add(GENRE_TAG_ALIAS[t]); });
    return [...out];
}

// Monta um perfil inicial a partir do que o usuário já cadastrou no app
export function gmProfileFromLibrary() {
    const freqG = {}, freqP = {};
    [...appData.games, ...(appData.wishlist || [])].forEach(item => {
        (item.genres || []).forEach(g => { const k = GENRE_ALIAS[g] || g; if (GM_GENRES.includes(k)) freqG[k] = (freqG[k] || 0) + 1; });
        const p = (item.platform || '').toLowerCase();
        Object.keys(PLAT_KEYWORDS).forEach(k => { if (PLAT_KEYWORDS[k].some(s => p.includes(s))) freqP[k] = (freqP[k] || 0) + 1; });
    });
    const favRated = appData.games.filter(x => x.state === 'finished' && (x.userRating || 0) >= 4);
    if (!favRated.length) favRated.push(...appData.games.filter(x => x.state === 'finished'));
    return {
        name: 'Seu Gamer', age: '', fromLibrary: true,
        platforms: Object.keys(freqP).sort((a, b) => freqP[b] - freqP[a]).slice(0, 4),
        genres: Object.keys(freqG).sort((a, b) => freqG[b] - freqG[a]).slice(0, 6),
        styles: ['single'], price: 'any', era: 'both', time: 'some', upcomingOnly: false
    };
}

// ---------- Motor de compatibilidade (0-99%) ----------
function boostVal(map, key) { return (map && map[key]) || 0; }

export function matchScore(g, seedFromLibrary = false) {
    const d = gm(), p = d.profile || (seedFromLibrary ? gmProfileFromLibrary() : null);
    let score = 42;
    const gs = profileGenreOf(g);
    const pgen = (p && p.genres) || [];
    // Gêneros do perfil + aprendizado (genreBoost cresce com likes e cai com rejeições)
    gs.forEach(x => {
        if (pgen.includes(x)) score += 10;
        else score += 2;   // descoberta: gênero não favorito não zera
        const b = boostVal(d.genreBoost, x);
        score += b >= 0 ? Math.min(10, b * 1.5) : Math.max(-16, b * 3);
    });
    // Plataformas
    const pplat = (p && p.platforms) || [];
    const gPlat = (g.platforms || []).map(x => x.toLowerCase());
    if (pplat.length) {
        const hit = pplat.some(k => (PLAT_KEYWORDS[k] || []).some(s => gPlat.some(x => x.includes(s))));
        score += hit ? 12 : -18;
    }
    // Estilos (single/multi/coop...) pelas tags
    const tags = (g.tags || []).map(t => String(t).toLowerCase());
    const pst = (p && p.styles) || [];
    pst.forEach(s => { if ((STYLE_TAGS[s] || []).some(t => tags.includes(t))) score += 5; });
    if (pst.length && pst.includes('single') === false && tags.includes('singleplayer')) score += 2;
    // Era (novo x clássico x lançamentos futuros)
    const isFuture = !g.released || g.tba;
    const year = g.released ? +String(g.released).slice(0, 4) : new Date().getFullYear() + 1;
    if (p && p.upcomingOnly) score += isFuture ? 10 : -60;   // filtro duro: só futuros
    else if (p && p.era === 'new') score += year >= new Date().getFullYear() - 3 ? 8 : -6;
    else if (p && p.era === 'classic') score += year <= 2009 ? 8 : -4;
    // Tempo de jogo x tempo disponível
    const pt = g.playtime || 0;
    if (p && p.time === 'casual') score += pt && pt <= 15 ? 5 : pt > 60 ? -4 : 0;
    if (p && (p.time === 'alot' || p.time === 'hardcore')) score += pt >= 40 ? 4 : 0;
    // Qualidade e popularidade
    const rate = g.metacritic ? g.metacritic / 20 : (g.rating || 0);
    score += rate ? Math.round((rate - 3) * 8) : 0;
    score += Math.min(8, Math.round(Math.log10((g.ratingsCount || 0) + 1) * 2));
    // Franquias aprendidas
    const fr = normText(String(g.title).split(/[:\-–]/)[0]);
    score += Math.max(-12, Math.min(12, boostVal(d.franchiseBoost, fr) * 2));
    return Math.max(5, Math.min(99, Math.round(score)));
}

// ---------- Candidatos: busca na RAWG conforme o perfil ----------
const PLAT_FALLBACK = [4, 18, 187, 1, 186, 7, 3, 21];
function deckParams(page) {
    const p = gm().profile || {};
    const params = { page, page_size: 20, ordering: '-rating,-added', exclude_additions: 'true' };
    const gs = [], ts = [];
    (p.genres || []).forEach(x => { const m = GENRE_RAWG[x]; if (m && m.genre) gs.push(m.genre); if (m && m.tag) ts.push(m.tag); });
    if (gs.length) params.genres = gs.join(','); else if (ts.length) params.tags = ts.join(',');
    const plats = [...new Set((p.platforms || []).flatMap(x => PLAT_RAWG_IDS[x] || []))];
    params.platforms = (plats.length ? plats : PLAT_FALLBACK).join(',');
    const today = new Date().toISOString().slice(0, 10);
    if (p.upcomingOnly) { params.dates = `${today},2035-12-31`; params.ordering = 'released'; }
    else if (p.era === 'new') { const y = new Date().getFullYear() - 3; params.dates = `${y}-01-01,${today}`; }
    else if (p.era === 'classic') params.dates = '1980-01-01,2012-12-31';
    return params;
}

// Jogos que não devem mais aparecer: já avaliados no swipe ou já na biblioteca/wishlist
function knownGameKeys() {
    const d = gm();
    const ids = new Set(), names = new Set();
    [...d.likes, ...d.favorites, ...d.rejects, ...d.backlogAdds].forEach(x => {
        if (x.rawgId) ids.add(x.rawgId);
        if (x.title) names.add(normText(x.title));
    });
    [...appData.games, ...(appData.wishlist || [])].forEach(x => {
        if (x.rawgId) ids.add(x.rawgId);
        names.add(normText(x.title));
    });
    return { ids, names };
}
const plannedDeck = [];        // fila de cartas (objetos de jogo)
// Deck procedural: cada sessão começa numa página e ordenação diferentes,
// então abrir o app mostra sempre jogos novos (o score de match ainda ordena dentro do lote)
let poolPage = 1, poolExhausted = false, poolLoading = null, usingDemo = false;
const POOL_ORDERS = ['-rating', '-added', '-popularity', '-metacritic', '-released'];
let poolOrder = POOL_ORDERS[0];
function reseedPool() {
    poolPage = 1 + Math.floor(Math.random() * 8);   // páginas 1..8 do catálogo
    poolOrder = POOL_ORDERS[Math.floor(Math.random() * POOL_ORDERS.length)];
    poolExhausted = false; usingDemo = false;
}
reseedPool();

// ---------- Filtro de conteúdo adulto (bloqueado por padrão em todo o GameMatch) ----------
// Cobre tags do catálogo, ESRB "Adults Only" e palavras explícitas no título.
const ADULT_TAGS = ['nsfw', 'hentai', 'eroge', 'erotic', 'sexual-content', 'nudity', 'lewd', 'adult', 'porn', 'mature-content'];
const ADULT_TITLE_RE = /\b(hentai|porn|porno|eroge|erotic|erotica|nude|nudity|nsfw|sexual|lewd|ecchi|oppai|18\+|xxx|sex)\b/i;
export function gmIsClean(g) {
    const tags = (g.tags || []).map(t => String(t).toLowerCase());
    if (tags.some(t => ADULT_TAGS.some(b => t === b || t.includes(b)))) return false;
    if (String(g.esrb || '').toLowerCase().includes('adults only')) return false;
    if (ADULT_TITLE_RE.test(String(g.title || ''))) return false;
    return true;
}

// Melhor recomendação primeiro, com leve embaralhado entre os melhores p/ variar
function insertDeck(items) {
    const { ids, names } = knownGameKeys();
    const fresh = items.map(g => ({ ...g, _match: matchScore(g) }))
        .filter(g => gmIsClean(g) && !ids.has(g.rawgId) && !names.has(normText(g.title)) && g._match >= 20)
        .sort((a, b) => b._match - a._match);
    // embaralha janelas de 5 para não ficar sempre do maior pro menor match
    for (let i = 0; i < fresh.length; i += 5) {
        const end = Math.min(i + 5, fresh.length);
        for (let j = i; j < end; j++) {
            const k = j + Math.floor(Math.random() * (end - j));
            [fresh[j], fresh[k]] = [fresh[k], fresh[j]];
        }
    }
    plannedDeck.push(...fresh);
}

async function ensureDeck(min = 6) {
    if (plannedDeck.length >= min || poolExhausted) return;
    if (poolLoading) return poolLoading;
    poolLoading = (async () => {
        try {
            while (plannedDeck.length < min + 5 && !poolExhausted && poolPage <= 40) {
                const res = await listGames({ ...deckParams(poolPage), ordering: gm().profile && gm().profile.upcomingOnly ? 'released' : poolOrder });
                poolPage++;
                if (!res.items.length || !res.more) poolExhausted = true;
                insertDeck(res.items);
                if (!res.items.length) break;
            }
        } catch (e) {
            console.warn('GameMatch indisponível online, usando jogos demonstrativos:', e);
            usingDemo = true;
            poolExhausted = true;
            insertDeck(DEMO_GAMES.map((g, i) => ({ rawgId: -100 - i, image: null, ...g })));
        } finally { poolLoading = null; }
    })();
    await poolLoading;
}

export function gmResetPool() {   // chamado quando o perfil muda — novo sorteio também
    plannedDeck.length = 0;
    reseedPool();
}

// ---------- Aprendizado: cada swipe ajusta gostos, gêneros e franquias ----------
function learn(g, delta) {
    const d = gm();
    const bump = (map, key, v) => { map[key] = (map[key] || 0) + v; if (Math.abs(map[key]) < 1) delete map[key]; };
    profileGenreOf(g).forEach(x => bump(d.genreBoost, x, delta));
    (g.platforms || []).forEach(x => bump(d.platformBoost, x, delta > 0 ? 1 : -1));
    const fr = normText(String(g.title).split(/[:\-–]/)[0]);
    if (fr.length >= 3) bump(d.franchiseBoost, fr, delta);
}

function pushLog(g, action) {
    const d = gm();
    d.swipeLog.push({ rawgId: g.rawgId || null, title: g.title, action, match: g._match ?? matchScore(g), at: Date.now() });
    if (d.swipeLog.length > 300) d.swipeLog.splice(0, d.swipeLog.length - 300);
    d.totalSwipes++;
}

function addToWishlist(g) {
    const t = normText(g.title);
    if ((appData.wishlist || []).some(x => normText(x.title) === t)) return false;
    appData.wishlist.push({
        id: 'w' + Date.now(), title: g.title,
        platform: (g.platforms && g.platforms[0]) || '', rawgId: g.rawgId || undefined,
        genres: g.genres || [], released: g.released || '', tba: !!g.tba,
        metacritic: g.metacritic || null, image: g.image || null, wideCover: true,
        addedAt: Date.now(), notifyRelease: false, note: 'Descoberto no GameMatch'
    });
    return true;
}

// Categoria própria para os jogos vindos do swipe: criada uma única vez
function gmBacklogCatId() {
    const name = 'GameMatch';
    let cat = appData.categories.find(c => normText(c.name) === normText(name));
    if (!cat) {
        cat = { id: 'cat-gm', name };
        if (appData.categories.some(c => c.id === cat.id)) cat.id = 'cat-gm-' + Math.random().toString(36).slice(2, 6);
        appData.categories.push(cat);
    }
    return cat.id;
}

function addToBacklog(g) {
    const t = normText(g.title);
    if (appData.games.some(x => normText(x.title) === t)) return false;
    const cat = gmBacklogCatId();
    appData.games.push({
        id: 'g' + Date.now(), catId: cat || '', title: g.title,
        platform: (g.platforms && g.platforms[0]) || '', rawgId: g.rawgId || undefined,
        genres: g.genres || [], released: g.released || '', meta: g.playtime ? `${g.playtime}h` : '',
        metacritic: g.metacritic || null, image: g.image || null, wideCover: true,
        state: null, userRating: null, dateFinished: null, is100: false, review: '', hoursPlayed: '', journalNotes: ''
    });
    return true;
}

// Execução de um swipe de fato (chamada depois da animação de saída do card)
function applySwipe(g, action) {
    const d = gm(), entry = { rawgId: g.rawgId || null, title: g.title, at: Date.now() };
    const match = g._match ?? matchScore(g);
    if (action === 'like') {
        d.likes.push(entry); learn(g, 2); pushLog(g, action);
        saveData();
        if (match >= 90) overlayFeedback(`Esse jogo parece feito para você!`, `💘 Match de ${match}% — ${esc(g.title)}`);
        else overlayFeedback('Match!', `${g.title} foi para a sua Wishlist.`);
        addToWishlist(g); saveData();
    } else if (action === 'favorite') {
        d.favorites.push(entry); learn(g, 4); pushLog(g, action);
        addToWishlist(g); saveData();
        overlayFeedback('Favorito! ⭐', `Adicionado aos favoritos (${match}% match).`);
    } else if (action === 'backlog') {
        d.backlogAdds.push(entry); learn(g, 3); pushLog(g, action);
        const ok = addToBacklog(g); saveData();
        toast(ok ? `Salvo no backlog: ${g.title}!` : `${g.title} já estava na sua biblioteca.`);
    } else {
        d.rejects.push(entry); learn(g, -3); pushLog(g, action);
        saveData();
        toast('Talvez na próxima...');
    }
    renderApp();   // Fila e Wishlist atualizam na hora, sem precisar reabrir o app
}

// ---------- Microanimações de feedback ----------
let ovT = null;
export function overlayFeedback(title, sub = '') {
    let ov = document.getElementById('gm-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'gm-overlay'; ov.className = 'gm-overlay';
        ov.innerHTML = `<div class="gm-ov-title"></div><div class="gm-ov-sub"></div>`;
        document.body.appendChild(ov);
    }
    ov.querySelector('.gm-ov-title').textContent = title;
    ov.querySelector('.gm-ov-sub').innerHTML = sub;
    ov.classList.add('show');
    clearTimeout(ovT);
    ovT = setTimeout(() => ov.classList.remove('show'), 1400);
}

// ---------- Renderização do deck (1 card grande por vez, próximo atrás) ----------
export function gmCurrent() { return plannedDeck[0] || null; }

function gmPlatLabel(g) {
    const plats = (g.platforms || []).slice(0, 3);
    return plats.join(' · ') + ((g.platforms || []).length > 3 ? ' +' + (g.platforms.length - 3) : '');
}

function cardHtml(g, idx) {
    const img = g.image ? resizeUrl(g.image, 640) : null;
    const match = g._match ?? matchScore(g);
    const mcls = match >= 90 ? 'hi' : match >= 70 ? 'mid' : 'lo';
    const year = g.released ? String(g.released).slice(0, 4) : (g.tba ? 'Em breve' : '');
    return `
    <article class="gm-card ${idx === 0 ? 'gm-top' : ''}" style="--i:${idx}">
        <div class="gm-cover">${img
            ? `<img src="${esc(img)}" alt="Capa de ${esc(g.title)}" draggable="false">`
            : `<div class="gm-cover-empty">${esc(g.title.slice(0, 2))}</div>`}
        </div>
        <div class="gm-stamp gm-stamp-like">MATCH</div>
        <div class="gm-stamp gm-stamp-nope">PASSAR</div>
        <div class="gm-stamp gm-stamp-up">BACKLOG</div>
        <div class="gm-info">
            <div class="gm-match gm-match-${mcls}" title="Compatibilidade com o seu perfil">${match}% Match</div>
            <h3 class="gm-title">${esc(g.title)}</h3>
            <div class="gm-meta">
                ${g.rating ? `<span class="gm-rate">★ ${g.rating ? g.rating.toFixed(1) : ''}</span>` : ''}
                ${g.metacritic ? `<span class="gm-mc">MC ${g.metacritic}</span>` : ''}
                ${year ? `<span>${year}</span>` : ''}
                ${g.playtime ? `<span>~${g.playtime}h</span>` : ''}
            </div>
            <div class="gm-genres">${(g.genres || []).slice(0, 3).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>
            <div class="gm-plats">${esc(gmPlatLabel(g))}</div>
            <button type="button" class="gm-info-btn" data-t="${esc(g.title)}" title="Pesquisar no Google"><svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></button>
        </div>
    </article>`;
}

export async function renderDeck() {
    const deck = document.getElementById('gm-deck');
    if (!deck) return;
    if (!gmHasProfile()) { deck.innerHTML = `<div class="gm-empty"><p>Configure seu perfil gamer para começar a descobrir jogos.</p><button type="button" class="gm-cta" onclick="gmOnboardOpen(true)">Criar meu perfil</button></div>`; return; }
    deck.innerHTML = `<div class="gm-loading">Buscando jogos que combinam com você...</div>`;
    await ensureDeck();
    // re-filtra na hora de mostrar: remove jogos que entraram na biblioteca/wishlist depois de montar o deck
    const { ids, names } = knownGameKeys();
    for (let i = plannedDeck.length - 1; i >= 0; i--) {
        const g = plannedDeck[i];
        if (ids.has(g.rawgId) || names.has(normText(g.title))) plannedDeck.splice(i, 1);
    }
    if (plannedDeck.length < 6) await ensureDeck();
    if (!plannedDeck.length) {
        deck.innerHTML = `<div class="gm-empty"><p>Você já viu tudo por aqui! Ajuste seu perfil ou volte mais tarde.</p><button type="button" class="gm-cta" onclick="gmOnboardOpen(true)">Editar perfil</button></div>`;
        return;
    }
    deck.innerHTML = plannedDeck.slice(0, 3).map((g, i) => cardHtml(g, i)).join('');
    deck.querySelectorAll('.gm-card').forEach((el, i) => { el.style.zIndex = 10 - i; });
    // botão de pesquisa no Google: não pode iniciar o arrasto do card
    deck.querySelectorAll('.gm-info-btn').forEach(b => {
        b.addEventListener('pointerdown', e => e.stopPropagation());
        b.addEventListener('click', e => {
            e.stopPropagation();
            const q = encodeURIComponent((b.dataset.t || '') + ' jogo');
            window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener');
        });
    });
    attachDrag(deck.querySelector('.gm-top'));
    if (DEPS.hydrateIcons) DEPS.hydrateIcons(deck);
    const h = document.getElementById('gm-deck-hint');
    if (h) h.textContent = usingDemo ? `${plannedDeck.length} jogos de demonstração (modo offline)` : `Restam ${plannedDeck.length} jogos no seu deck`;
}

// ---------- Gestos de arrasto (toque e mouse) ----------
function attachDrag(card) {
    if (!card) return;
    let sx = 0, sy = 0, dx = 0, dy = 0, down = false;
    const move = (x, y) => {
        dx = x - sx; dy = y - sy;
        const rot = dx / 18;
        card.classList.add('gm-dragging');
        card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
        card.classList.toggle('gm-t-right', dx > 60);
        card.classList.toggle('gm-t-left', dx < -60);
        card.classList.toggle('gm-t-up', dy < -60 && Math.abs(dy) > Math.abs(dx));
    };
    const commit = action => {
        const g = plannedDeck.shift();
        const dirX = action === 'right' ? 1 : action === 'left' ? -1 : 0;
        card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        card.style.transform = `translate(${dirX * 140}%, ${action === 'up' ? '-140%' : 0}) rotate(${dirX * 30}deg)`;
        card.style.opacity = '0';
        const map = { right: 'like', left: 'reject', up: 'backlog' };
        setTimeout(() => { applySwipe(g, map[action]); renderDeck(); }, 220);
    };
    card.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); });
    card.addEventListener('pointermove', e => { if (down) move(e.clientX, e.clientY); });
    const end = () => {
        if (!down) return; down = false;
        card.classList.remove('gm-dragging', 'gm-t-right', 'gm-t-left', 'gm-t-up');
        card.style.transform = '';
        if (dx > 90) commit('right');
        else if (dx < -90) commit('left');
        else if (dy < -90 && Math.abs(dy) > Math.abs(dx)) commit('up');
        dx = dy = 0;
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
}

// ---------- Ações por botões e teclado ----------
export function gmSwipe(action) {   // 'like' | 'reject' | 'backlog' | 'favorite'
    const g = plannedDeck[0];
    if (!g) return;
    const card = document.querySelector('#gm-deck .gm-top');
    if (card && action !== 'favorite') {
        const dir = action === 'like' ? 'right' : action === 'backlog' ? 'up' : 'left';
        const dirX = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
        card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        card.style.transform = `translate(${dirX * 140}%, ${dir === 'up' ? '-140%' : 0}) rotate(${dirX * 30}deg)`;
        card.style.opacity = '0';
        plannedDeck.shift();
        setTimeout(() => { applySwipe(g, action); renderDeck(); }, 180);
    } else {
        plannedDeck.shift(); applySwipe(g, action); renderDeck();
    }
}

// Teclado: ← passar, → match, ↑ backlog, F favorito (só quando a aba está ativa)
document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    const tab = document.getElementById('tab-gamematch');
    if (!tab || !tab.classList.contains('active')) return;
    if (e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); gmSwipe('reject'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); gmSwipe('like'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); gmSwipe('backlog'); }
    else if (e.key.toLowerCase() === 'f') gmSwipe('favorite');
});

// ================= PÁGINA EXPLORAR =================
// Categorias de descoberta além do swipe. Cada uma vira uma consulta ao catálogo.
export const GM_EXPLORE_CATS = [
    { id: 'you', label: 'Combina com você' },
    { id: 'hot', label: 'Em alta' },
    { id: 'releases', label: 'Lançamentos' },
    { id: 'gems', label: 'Joias escondidas' },
    { id: 'classics', label: 'Clássicos' },
    { id: 'free', label: 'Grátis / Ofertas' },
    { id: 'top', label: 'Mais bem avaliados' }
];
const exploreCache = {};   // categoria -> { items, more }
let exploreById = new Map();   // id -> objeto de jogo (p/ os botões de ação)
let classicDecade = '';   // '' | '1980' | '1990' | '2000' | '2010'

function exploreParams(cat) {
    const today = new Date().toISOString().slice(0, 10);
    const y = new Date().getFullYear();
    const rp = n => 1 + Math.floor(Math.random() * n);   // página aleatória: variedade a cada visita
    switch (cat) {
        case 'you': { const p = deckParams(rp(4)); return { ...p, ordering: poolOrder }; }
        case 'hot': return { ordering: '-added', dates: `${y - 2}-01-01,${today}`, page_size: 20, page: rp(2), exclude_additions: 'true' };
        case 'releases': return { ordering: 'released', dates: `${today},2030-12-31`, page_size: 20, page: rp(3) };
        case 'gems': return { ordering: '-rating', genres: 'indie', page_size: 40, page: rp(4), exclude_additions: 'true' };
        case 'classics': {
            // submenu de décadas: '1980' -> 1980-1989, etc.
            const start = classicDecade ? +classicDecade : 1980;
            const end = classicDecade ? start + 9 : 2012;
            return { ordering: '-rating', dates: `${start}-01-01,${end}-12-31`, page_size: 20, page: rp(3), exclude_additions: 'true' };
        }
        case 'free': return { ordering: '-popularity', tags: 'free-to-play', page_size: 20 };
        case 'top': default: return { ordering: '-metacritic', page_size: 20, exclude_additions: 'true' };
    }
}

// Submenu de épocas dentro de "Clássicos"
export function gmClassicDecade(dec) {
    classicDecade = dec;
    document.querySelectorAll('#gm-classic-decades .gm-chip').forEach(c => c.classList.toggle('active', c.dataset.dec === dec));
    gmExplore('classics');
}

export async function gmExplore(cat = 'you') {
    document.querySelectorAll('#gm-explore-cats .gm-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
    const decBar = document.getElementById('gm-classic-decades');
    if (decBar) {
        decBar.hidden = cat !== 'classics';
        if (cat === 'classics') decBar.querySelectorAll('.gm-chip').forEach(c => c.classList.toggle('active', c.dataset.dec === classicDecade));
    }
    const grid = document.getElementById('gm-explore-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="gm-loading">Carregando...</div>';
    try {
        const res = await listGames(exploreParams(cat));
        let items = res.items.filter(gmIsClean);   // conteúdo adulto nunca aparece
        if (cat === 'gems') items = items.filter(g => (g.ratingsCount || 0) > 300 && (g.ratingsCount || 0) < 25000).slice(0, 20);
        if (cat === 'you') items = items.map(g => ({ ...g, _match: matchScore(g) })).sort((a, b) => b._match - a._match);
        exploreById = new Map(items.map(g => [g.rawgId, g]));
        if (!items.length) { grid.innerHTML = '<div class="gm-empty"><p>Nada por aqui agora.</p></div>'; return; }
        grid.innerHTML = items.map(g => {
            const img = g.image ? resizeUrl(g.image, 420) : null;
            const m = g._match ?? matchScore(g);
            return `
            <div class="gm-x-card">
                <div class="gm-x-cover">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<div class="gm-cover-empty">${esc(g.title.slice(0, 2))}</div>`}</div>
                <div class="gm-x-body">
                    <strong>${esc(g.title)}</strong>
                    <small>${esc((g.genres || []).slice(0, 2).join(' · '))}${g.released ? ' · ' + String(g.released).slice(0, 4) : ''}</small>
                    <span class="gm-match gm-match-${m >= 90 ? 'hi' : m >= 70 ? 'mid' : 'lo'}">${m}%</span>
                </div>
                <div class="gm-x-actions">
                    <button type="button" class="icon-btn xl" title="Adicionar à wishlist" onclick="gmExploreWish(${g.rawgId})"><span data-icon="bookmark" data-size="1.1em"></span></button>
                    <button type="button" class="icon-btn xl" title="Comprar na Amazon" onclick="gmBuy(${g.rawgId})"><span data-icon="cart" data-size="1.1em"></span></button>
                </div>
            </div>`;
        }).join('');
        if (DEPS.hydrateIcons) DEPS.hydrateIcons(grid);
    } catch (e) {
        grid.innerHTML = `<div class="gm-empty"><p>Não consegui carregar o catálogo agora. Tente de novo em instantes — ou use o deck (modo demonstração).</p></div>`;
    }
}

export function gmExploreWish(rawgId) {
    const g = exploreById.get(rawgId);
    if (!g) return;
    const ok = addToWishlist(g); saveData(); renderApp();
    toast(ok ? `${g.title} foi para a sua Wishlist!` : `${g.title} já estava na Wishlist.`);
}

export function gmBuy(rawgId) {
    const g = exploreById.get(rawgId) || plannedDeck.find(x => x.rawgId === rawgId);
    if (!g) return;
    const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(g.title + ' jogo')}`;
    window.open(url, '_blank', 'noopener');
}

// ================= PÁGINA DE PERFIL =================
function styleLabel(id) { const s = GM_STYLES.find(x => x.id === id); return s ? s.label : id; }
function priceLabel(id) { const s = GM_PRICES.find(x => x.id === id); return s ? s.label : 'Qualquer'; }
function timeLabel(id) { const s = GM_TIMES.find(x => x.id === id); return s ? s.label : ''; }
const ERA_LABEL = { new: 'Jogos novos', classic: 'Clássicos', both: 'Novos e clássicos' };

// Gêneros que mais combinam com o usuário, considerando perfil + aprendizado
function genreAffinity() {
    const d = gm(), p = d.profile || {};
    const score = {};
    (p.genres || []).forEach(x => { score[x] = 40; });
    Object.entries(d.genreBoost || {}).forEach(([k, v]) => { score[k] = (score[k] || 0) + v * 12; });
    return Object.entries(score).filter(([, v]) => v > 5)
        .sort((a, b) => b[1] - a[1]).slice(0, 7);
}

export function renderGmProfile() {
    const el = document.getElementById('gm-profile');
    if (!el) return;
    const d = gm(), p = d.profile;
    if (!p) { el.innerHTML = `<div class="gm-empty"><p>Você ainda não montou seu perfil gamer.</p><button type="button" class="gm-cta" onclick="gmOnboardOpen(true)">Criar perfil</button></div>`; return; }
    const matches = d.likes.length + d.favorites.length;
    const affinity = genreAffinity();
    const max = affinity.length ? affinity[0][1] : 1;
    el.innerHTML = `
    <div class="gm-p-head">
        <div class="gm-p-avatar">${esc((p.name || 'G')[0].toUpperCase())}</div>
        <div>
            <h3 class="gm-p-name">${esc(p.name || 'Seu Gamer')}</h3>
            <div class="gm-p-sub">Perfil Gamer${p.upcomingOnly ? ' · só lançamentos' : ''}</div>
        </div>
        <button type="button" class="pill-btn" onclick="gmOnboardOpen(true)" title="Editar preferências"><span data-icon="edit" data-size="0.9em"></span> Editar</button>
    </div>
    <div class="gm-p-chips">
        ${(p.genres || []).map(x => `<span class="chip chip-accent">${esc(x)}</span>`).join('')}
        ${(p.platforms || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}
        ${(p.styles || []).map(x => `<span class="chip">${esc(styleLabel(x))}</span>`).join('')}
    </div>
    <div class="gm-p-summary">
        ${esc(priceLabel(p.price))} · ${esc(ERA_LABEL[p.era] || '')} · ${esc(timeLabel(p.time))}
    </div>
    <div class="gm-p-stats">
        <div class="stat-box"><span class="stat-num">${d.likes.length}</span><span class="stat-label">Jogos que gostei</span></div>
        <div class="stat-box"><span class="stat-num">${d.favorites.length}</span><span class="stat-label">Favoritos</span></div>
        <div class="stat-box"><span class="stat-num" style="color:var(--accent-playing)">${matches}</span><span class="stat-label">Matches</span></div>
        <div class="stat-box"><span class="stat-num" style="color:var(--danger)">${d.rejects.length}</span><span class="stat-label">Ignorados</span></div>
    </div>
    ${affinity.length ? `
    <h4 class="gm-p-subtitle">Gêneros que mais combinam com você</h4>
    <div class="gm-p-bars">
        ${affinity.map(([k, v]) => `<div class="gm-p-bar"><span class="gm-p-bar-label">${esc(k)}</span><span class="gm-p-bar-track"><span style="width:${Math.round(v / max * 100)}%"></span></span><span class="gm-p-bar-val">${Math.round(v / max * 100)}%</span></div>`).join('')}
    </div>` : ''}
    <details class="gm-rejects">
        <summary>Ver jogos ignorados (${d.rejects.length}) — para desfazer um toque errado</summary>
        ${d.rejects.length ? `<ul>${d.rejects.map((r, i) => `<li><span>${esc(r.title)}</span><button type="button" class="pill-btn" onclick="gmUnreject(${i})">Recuperar</button></li>`).join('')}</ul>` : '<p class="gm-note">Nenhum jogo ignorado até agora.</p>'}
    </details>`;
    if (DEPS.hydrateIcons) DEPS.hydrateIcons(el);
}

export function gmUnreject(index) {
    const d = gm();
    const r = d.rejects[index];
    if (!r) return;
    d.rejects.splice(index, 1);
    saveData();
    gmResetPool();
    toast(`"${r.title}" voltou para a rotação.`);
    renderGmProfile();
    renderDeck();
}

// ================= ONBOARDING =================
// Questionário rápido que monta o perfil gamer. Pode ser reaberto a qualquer momento.
let obStep = 0, obSel = null;
const obDefaults = () => ({ name: '', age: '', platforms: [], genres: [], styles: ['single'], price: 'any', era: 'both', time: 'some', upcomingOnly: false });

function obDlg() { return document.getElementById('modal-gamematch-onboard'); }

export function gmOnboardOpen(edit = true) {
    obSel = gmHasProfile() ? JSON.parse(JSON.stringify({ ...obDefaults(), ...gm().profile })) : obDefaults();
    obStep = 0;
    renderOb();
    const d = obDlg();
    if (d && !d.open) d.showModal();
}

// chips multi/selecionável com re-render leve
export function gmObToggle(group, value, el) {
    const arr = obSel[group];
    const i = arr.indexOf(value);
    if (i > -1) arr.splice(i, 1); else arr.push(value);
    el.classList.toggle('active');
}
export function gmObPick(group, value, container, ...cls) {
    obSel[group] = value;
    container.querySelectorAll('.gm-chip').forEach(c => c.classList.remove('active'));
    container.querySelector(`[data-v="${value}"]`).classList.add('active');
    renderObSummary();
}
export function gmObToggleUpcoming(el) {
    obSel.upcomingOnly = !obSel.upcomingOnly;
    el.classList.toggle('active', obSel.upcomingOnly);
    renderObSummary();
}
export function gmObSetName(v) { obSel.name = v; renderObSummary(); }

function obChips(group, options) {
    return `<div class="gm-ob-chips">${options.map(o => {
        const v = typeof o === 'string' ? o : o.id, lbl = typeof o === 'string' ? o : o.label;
        return `<button type="button" class="gm-chip ${obSel[group].includes(v) ? 'active' : ''}" data-v="${esc(v)}" onclick="gmObToggle('${group}','${esc(v)}',this)">${esc(lbl)}</button>`;
    }).join('')}</div>`;
}

function obSingle(group, options) {
    return `<div class="gm-ob-chips" onclick="void 0">${options.map(o =>
        `<button type="button" class="gm-chip ${obSel[group] === o.id ? 'active' : ''}" data-v="${o.id}" onclick="gmObPick('${group}','${o.id}',this.parentElement)">${esc(o.label)}</button>`
    ).join('')}</div>`;
}

function obErr() {
    const s = document.getElementById('gm-ob-err');
    return msg => { if (s) { s.textContent = msg || ''; s.style.display = msg ? 'block' : 'none'; } };
}

// Resumo "seu gamer" mostrado em todas as etapas após escolhas relevantes
function renderObSummary() {
    const s = document.getElementById('gm-ob-summary');
    if (!s) return;
    const parts = [];
    if (obSel.genres.length) parts.push(esc(obSel.genres.slice(0, 4).join(' • ')));
    if (obSel.platforms.length) parts.push(esc(obSel.platforms.join(' • ')));
    if (obSel.styles.length) parts.push(esc(obSel.styles.map(styleLabel).join(' • ')));
    if (obSel.price !== 'any') parts.push(priceLabel(obSel.price));
    s.textContent = parts.join(' | ') || 'Suas escolhas aparecem aqui montando seu perfil.';
}

function renderOb() {
    const body = document.getElementById('gm-ob-body');
    const name = esc(obSel.name || 'gamer');
    const steps = [
        // 0: boas-vindas
        `<div class="gm-ob-hero">
            <div class="gm-ob-logo">💘</div>
            <h2>Encontre seu próximo jogo.</h2>
            <p class="gm-ob-sub">O GameMatch cruza seu gosto com o catálogo e mostra um jogo por vez, no estilo Tinder. Deslize, dê match e descubra.</p>
            ${appData.games.length + (appData.wishlist || []).length >= 5 ? `
            <button type="button" class="gm-cta" onclick="gmUseLibrary()">Usar minha biblioteca atual (${appData.games.length} jogos)</button>
            <div class="gm-ob-or">ou responda rapidinho:</div>` : ''}
            <label class="gm-ob-label">Como quer ser chamado(a)?</label>
            <input type="text" maxlength="24" placeholder="Seu nome ou apelido" value="${name === 'gamer' ? '' : name}" oninput="gmObSetName(this.value)" class="gm-ob-input">
        </div>`,
        // 1: plataformas
        `<h3>Em quais plataformas você joga?</h3>
         ${obChips('platforms', GM_PLATFORMS)}
         <label class="gm-ob-label">Faixa etária (opcional)</label>
         <select class="gm-ob-input" onchange="obSel.age=this.value">
            ${['', 'Livre', '10+', '12+', '14+', '16+', '18+'].map(x => `<option value="${x}" ${obSel.age === x ? 'selected' : ''}>${x || 'Prefiro não dizer'}</option>`).join('')}
         </select>`,
        // 2: gêneros
        `<h3>Quais gêneros você mais curte?</h3>
         <p class="gm-ob-sub">Escolha pelo menos 2 — é o que mais pesa nas recomendações.</p>
         ${obChips('genres', GM_GENRES)}`,
        // 3: estilos e preferências
        `<h3>Como você gosta de jogar?</h3>
         ${obChips('styles', GM_STYLES)}
         <label class="gm-ob-label">Faixa de preço</label>${obSingle('price', GM_PRICES)}
         <label class="gm-ob-label">Época</label>${obSingle('era', [{ id: 'new', label: 'Jogos novos' }, { id: 'classic', label: 'Clássicos' }, { id: 'both', label: 'Os dois' }])}
         <label class="gm-ob-label">Tempo disponível</label>${obSingle('time', GM_TIMES)}
         <button type="button" class="gm-chip gm-toggle ${obSel.upcomingOnly ? 'active' : ''}" onclick="gmObToggleUpcoming(this)">🚀 Só mostrar jogos que ainda vão lançar</button>`,
        // 4: confirmação
        `<div class="gm-ob-hero">
            <h2>Perfil pronto, ${esc(obSel.name || 'gamer')}!</h2>
            <div class="gm-ob-card">
                <strong>"${esc(obSel.name || 'Seu Gamer')}"</strong>
                <div id="gm-ob-final-summary"></div>
            </div>
            <p class="gm-ob-sub">As recomendações melhoram a cada swipe. Errar o dedo não tem problema: dá para recuperar "ignorados" no seu perfil.</p>
        </div>`
    ];
    // estilos guardados como ids mas exibidos por rótulo
    let html = steps[obStep];
    body.innerHTML = html + `
        <div id="gm-ob-summary" class="gm-ob-summary"></div>
        <div id="gm-ob-err" class="gm-ob-err" style="display:none"></div>
        <div class="gm-ob-nav">
            ${obStep > 0 && obStep < steps.length - 1 ? `<button type="button" class="btn-cancel" onclick="gmObGo(${obStep - 1})">Voltar</button>` : '<span></span>'}
            ${obStep < steps.length - 1
                ? `<button type="button" class="gm-cta" onclick="gmObGo(${obStep + 1})">${obStep === 0 ? 'Começar' : 'Avançar'}</button>`
                : `<button type="button" class="gm-cta" onclick="gmObFinish()">Começar o swipe! 🎮</button>`}
        </div>`;
    if (obStep === steps.length - 1) {
        const f = document.getElementById('gm-ob-final-summary');
        if (f) f.innerHTML = `<div class="gm-ob-sumline">${esc(obSel.genres.join(' • ') || 'Sem gêneros')}</div><div class="gm-ob-sumline">${esc(obSel.platforms.join(' • ') || 'Sem plataformas')}</div><div class="gm-ob-sumline">${esc(obSel.styles.map(styleLabel).join(' • '))} · ${esc(ERA_LABEL[obSel.era])} · ${esc(priceLabel(obSel.price))}</div>`;
    }
    renderObSummary();
}

export function gmObGo(step) {
    const err = obErr();
    if (step > obStep) {   // validações leves, sem travar
        if (obStep === 2 && obSel.genres.length < 1) { err()('Escolha ao menos 1 gênero (pode variar depois).'); return; }
        if (obStep === 1 && !obSel.platforms.length) { err()('Escolha ao menos 1 plataforma.'); return; }
    }
    obStep = Math.max(0, Math.min(4, step));
    renderOb();
}

// "Continuar com os dados que já tem no app"
export function gmUseLibrary() {
    const from = gmProfileFromLibrary();
    if (!from.platforms.length) from.platforms = ['PC'];
    if (!from.genres.length) from.genres = ['RPG', 'Ação'];
    obSel = { ...obSel, ...from, name: obSel.name || 'Seu Gamer' };
    obStep = 4;
    renderOb();
}

export function gmObFinish() {
    obSel.name = (obSel.name || '').trim() || 'Seu Gamer';
    gm().profile = obSel;
    saveData();
    gmResetPool();
    const d = obDlg(); if (d) d.close();
    toast(`Perfil gamer criado! Bora descobrir jogos, ${obSel.name}.`);
    renderDeck(); renderGmProfile(); gmExplore('you');
}

// ---------- Ativação da aba e suas 3 sub-telas ----------
let gmActiveSub = 'swipe';
export function gmActivate() {
    if (!gmHasProfile()) { gmOnboardOpen(true); }
    gmSubShow(gmActiveSub);
}

export function gmSubShow(name) {
    gmActiveSub = name;
    document.querySelectorAll('#tab-gamematch .gm-sub').forEach(s => s.classList.toggle('active', s.dataset.sub === name));
    document.querySelectorAll('#gm-subnav button').forEach(b => b.classList.toggle('active', b.dataset.sub === name));
    if (name === 'swipe') renderDeck();
    if (name === 'explore') gmExplore(document.querySelector('#gm-explore-cats .gm-chip.active') ? document.querySelector('#gm-explore-cats .gm-chip.active').dataset.cat : 'you');
    if (name === 'profile') renderGmProfile();
}

// ---------- Inicialização ----------
export function initGameMatch(deps) {
    DEPS = { ...DEPS, ...deps };
    document.addEventListener('zeralog:tab-changed', e => { if (e.detail && e.detail.tab === 'gamematch') gmActivate(); });
}



