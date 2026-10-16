// ================= GameMatch: o "Tinder de jogos" do ZeraLog =================
// Módulo isolado: cuida do perfil gamer, do motor de compatibilidade, do deck de
// swipe, da página Explorar e da página de Perfil. Os dados vivem em
// appData.gamematch (persistidos junto com o resto do banco local).
import { appData, saveData } from './store.js';
import { listGames, esc, normText, resizeUrl, guessFranchise, getGameDetails, searchCompanies, getGameScreenshots, shotsGalleryHtml, fileToSmallJpeg } from './gameApi.js';
import { autoVerticalCover } from './covers.js';
import { icon } from './icons.js';
import { fetchPersona } from './steam.js';
import { ACHIEVEMENTS, gamerXp, levelFromXp, rankOf } from './achievements.js';
import { openGamerIdShare } from './share.js';

const gm = () => appData.gamematch || (appData.gamematch = {});
let DEPS = { toast: (m) => console.log(m), render: null };   // injetado por initGameMatch (main.js)
const toast = (m) => DEPS.toast(m);
const renderApp = () => { if (DEPS.render) DEPS.render(); };   // atualiza Fila/Desejos sem reiniciar o app

// ---------- Opções do perfil (onboarding) ----------
export const GM_PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Mobile', 'Steam Deck'];
export const GM_GENRES = ['RPG', 'Ação', 'Aventura', 'Estratégia', 'Simulação', 'Terror', 'FPS', 'Corrida', 'Esportes', 'Indie', 'Roguelike', 'Soulslike', 'MMORPG', 'Puzzle', 'Luta', 'Plataforma', 'Arcade', 'Casual', 'Família', 'Tabuleiro', 'Cartas', 'Educacional'];
// Estilos "à la Steam" (tags da RAWG): aparecem só no filtro do Explorar, para refinar além
// dos gêneros oficiais. O servidor aceita as tags como filtro de busca normalmente.
export const GM_X_STYLES = ['Mundo Aberto', 'Sobrevivência', 'Zumbi', 'Furtivo', 'Point & Click', 'Visual Novel', 'Metroidvania', 'Tower Defense', 'Battle Royale', 'Co-op', 'História Rica'];
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
export const GENRE_RAWG = {
    'Ação': { genre: 'action' }, 'Aventura': { genre: 'adventure' }, 'RPG': { genre: 'role-playing-games-rpg' },
    'Estratégia': { genre: 'strategy' }, 'Simulação': { genre: 'simulation' }, 'FPS': { genre: 'shooter' },
    'Corrida': { genre: 'racing' }, 'Esportes': { genre: 'sports' }, 'Indie': { genre: 'indie' }, 'Puzzle': { genre: 'puzzle' },
    'Terror': { tag: 'horror' }, 'Roguelike': { tag: 'roguelike' }, 'Soulslike': { tag: 'souls-like' }, 'MMORPG': { tag: 'massively-multiplayer' },
    'Luta': { genre: 'fighting' }, 'Plataforma': { genre: 'platformer' }, 'Arcade': { genre: 'arcade' },
    'Casual': { genre: 'casual' }, 'Família': { genre: 'family' }, 'Tabuleiro': { genre: 'board-games' },
    'Cartas': { genre: 'card' }, 'Educacional': { genre: 'educational' },
    'Mundo Aberto': { tag: 'open-world' }, 'Sobrevivência': { tag: 'survival' }, 'Zumbi': { tag: 'zombies' },
    'Furtivo': { tag: 'stealth' }, 'Point & Click': { tag: 'point-and-click' }, 'Visual Novel': { tag: 'visual-novel' },
    'Metroidvania': { tag: 'metroidvania' }, 'Tower Defense': { tag: 'tower-defense' },
    'Battle Royale': { tag: 'battle-royale' }, 'Co-op': { tag: 'co-op' }, 'História Rica': { tag: 'story-rich' }
};
export const PLAT_RAWG_IDS = {
    'PC': [4], 'PlayStation': [18, 187, 19, 16, 15], 'Xbox': [1, 186, 14, 80],
    'Nintendo Switch': [7], 'Mobile': [3, 21], 'Steam Deck': [4, 6]
};
// Nomes das plataformas vindos da API ("PlayStation 5", "iOS"...): substring minúscula
const PLAT_KEYWORDS = {
    'PC': ['pc'], 'PlayStation': ['playstation', 'ps '], 'Xbox': ['xbox'],
    'Nintendo Switch': ['nintendo switch', 'nintendo'], 'Mobile': ['android', 'ios'], 'Steam Deck': ['pc', 'linux', 'steamos']
};
// Gêneros que a API devolve -> nome usado no perfil do usuário
const GENRE_ALIAS = { 'Tiro': 'FPS', 'Quebra-cabeça': 'Puzzle', 'Multiplayer massivo': 'MMORPG', 'Jogos de tabuleiro': 'Tabuleiro' };
const GENRE_TAG_ALIAS = {
    'horror': 'Terror', 'roguelike': 'Roguelike', 'souls-like': 'Soulslike', 'massively multiplayer': 'MMORPG',
    'open world': 'Mundo Aberto', 'survival': 'Sobrevivência', 'zombies': 'Zumbi', 'stealth': 'Furtivo',
    'point-and-click': 'Point & Click', 'point & click': 'Point & Click', 'visual novel': 'Visual Novel',
    'metroidvania': 'Metroidvania', 'tower defense': 'Tower Defense', 'battle royale': 'Battle Royale',
    'co-op': 'Co-op', 'story rich': 'História Rica'
};
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
const POOL_ORDERS = ['-rating', '-added', '-popularity', '-metacritic'];   // sem '-released': puxava jogos de 2030 desconhecidos
let poolOrder = POOL_ORDERS[0];
function reseedPool() {
    poolPage = 1 + Math.floor(Math.random() * 15);   // páginas 1..15 do catálogo — variedade real entre contas
    poolOrder = POOL_ORDERS[Math.floor(Math.random() * POOL_ORDERS.length)];
    poolExhausted = false; usingDemo = false;
}
reseedPool();

// ---------- Filtro de conteúdo adulto (bloqueado por padrão em todo o GameMatch) ----------
// Cobre tags do catálogo, ESRB "Adults Only" e palavras explícitas no título.
const ADULT_TAGS = ['nsfw', 'hentai', 'eroge', 'erotic', 'sexual-content', 'nudity', 'lewd', 'adult', 'porn', 'mature-content'];
const ADULT_TITLE_RE = /\b(hentai|porn|porno|eroge|erotic|erotica|nude|nudity|nsfw|sexual|lewd|ecchi|oppai|18\+|xxx|sex)\b/i;
// Jogos marcados pra daqui a 1+ ano (ex.: "2030") atrapalham a descoberta — só entram se o
// perfil pedir "só lançamentos"
export function farFuture(g) {
    if (g.tba || !g.released) return false;
    const p = gm().profile || {};
    return !p.upcomingOnly && +String(g.released).slice(0, 4) > new Date().getFullYear();
}

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
        .filter(g => gmIsClean(g) && !farFuture(g) && (g.rawgId < 0 || g.image) && !ids.has(g.rawgId) && !names.has(normText(g.title)) && g._match >= 20)
        .sort((a, b) => b._match - a._match);
    // embaralha mais forte quando o deck está vazio (conta nova: nunca os mesmos primeiros)
    const windowSize = plannedDeck.length ? 5 : fresh.length;
    for (let i = 0; i < fresh.length; i += windowSize) {
        const end = Math.min(i + windowSize, fresh.length);
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
    const item = {
        id: 'w' + Date.now(), title: g.title,
        platform: (g.platforms && g.platforms[0]) || '', rawgId: g.rawgId || undefined,
        genres: g.genres || [], released: g.released || '', tba: !!g.tba,
        metacritic: g.metacritic || null, image: g.image || null, wideCover: true,
        franchise: gmFranchiseOf(g.title),
        addedAt: Date.now(), notifyRelease: false, note: 'Descoberto no GameMatch'
    };
    appData.wishlist.push(item);
    upgradeToPortrait(item, g);   // capa vira retrato assim que a fonte responder
    return true;
}

// Troca a arte horizontal por uma capa retrato (Steam 600×900 / Wikipédia) em segundo plano
function upgradeToPortrait(item, g) {
    if (!item) return;
    autoVerticalCover(g.title, g.rawgId).then(r => {
        if (r && r.data) { item.image = r.data; item.wideCover = false; saveData(); renderApp(); }
    }).catch(() => { /* sem retrato: mantém a arte horizontal como fallback */ });
}

// Franquia do jogo do GameMatch: casa com franquias já cadastradas ou deduz do título
function gmFranchiseOf(title) {
    const tn = normText(title);
    const known = [...new Set([...appData.games, ...(appData.wishlist || [])].map(x => x.franchise).filter(Boolean))]
        .find(f => normText(f) !== tn && tn.startsWith(normText(f)));
    return known || guessFranchise(title) || undefined;
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
    const item = {
        id: 'g' + Date.now(), catId: cat || '', title: g.title,
        platform: (g.platforms && g.platforms[0]) || '', rawgId: g.rawgId || undefined,
        genres: g.genres || [], released: g.released || '', meta: g.playtime ? `${g.playtime}h` : '',
        metacritic: g.metacritic || null, image: g.image || null, wideCover: true,
        franchise: gmFranchiseOf(g.title),
        state: null, userRating: null, dateFinished: null, is100: false, review: '', hoursPlayed: '', journalNotes: ''
    };
    appData.games.push(item);
    upgradeToPortrait(item, g);
    return true;
}

// Execução de um swipe de fato (chamada depois da animação de saída do card)
function applySwipe(g, action) {
    const d = gm(), entry = { rawgId: g.rawgId || null, title: g.title, at: Date.now() };
    const match = g._match ?? matchScore(g);
    if (action === 'like') {
        d.likes.push(entry); learn(g, 2); pushLog(g, action);
        saveData();
        if (match >= 90) overlayFeedback(`${icon('heart', { size: '0.9em' })} Esse jogo parece feito para você!`, `Match de ${match}% — ${esc(g.title)}`);
        else overlayFeedback('Match!', `${g.title} foi para a sua Wishlist.`);
        addToWishlist(g); saveData();
    } else if (action === 'favorite') {
        d.favorites.push(entry); learn(g, 4); pushLog(g, action);
        addToWishlist(g); saveData();
        overlayFeedback(`${icon('star', { size: '0.9em' })} Favorito!`, `Adicionado aos favoritos (${match}% match).`);
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
    ov.querySelector('.gm-ov-title').innerHTML = title;
    ov.querySelector('.gm-ov-sub').innerHTML = sub;
    ov.classList.add('show');
    clearTimeout(ovT);
    ovT = setTimeout(() => ov.classList.remove('show'), 950);
}

// ---------- Renderização do deck (1 card grande por vez, próximo atrás) ----------
export function gmCurrent() { return plannedDeck[0] || null; }

function gmPlatLabel(g) {
    const plats = (g.platforms || []).slice(0, 3);
    return plats.join(' · ') + ((g.platforms || []).length > 3 ? ' +' + (g.platforms.length - 3) : '');
}

function cardHtml(g, idx) {
    const img = g._vcover || (g.image ? resizeUrl(g.image, 640) : null);
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
    upgradeDeckCovers();   // capas verticais em segundo plano (a horizontal é o placeholder)
}

// ---------- Capas verticais do deck: busca em segundo plano ----------
// A RAWG só devolve arte horizontal na listagem — enquanto a vertical não chega,
// o card mostra a horizontal (cropped). Assim que a vertical é achada, o card
// re-renderiza com a capa de verdade.
let coverUpgrading = false;
async function upgradeDeckCovers() {
    if (coverUpgrading) return;
    const candidates = plannedDeck.filter(g => g.rawgId > 0 && !g._vcover && !g._vcoverTried).slice(0, 6);
    if (!candidates.length) return;
    coverUpgrading = true;
    for (const g of candidates) {
        g._vcoverTried = true;   // não tenta de novo no mesmo jogo (economia de API)
        try {
            const cov = await autoVerticalCover(g.title, g.rawgId);
            if (cov && cov.data) {
                g._vcover = cov.data;
                // re-renderiza a carta se ela ainda está no deck visível
                const idx = plannedDeck.indexOf(g);
                if (idx >= 0 && idx < 3) {
                    const deck = document.getElementById('gm-deck');
                    if (deck) {
                        const el = deck.querySelectorAll('.gm-card')[idx];
                        if (el) {
                            const img = el.querySelector('.gm-cover img');
                            if (img) img.src = cov.data;
                        }
                    }
                }
            }
        } catch (e) { /* segue para a próxima */ }
        await new Promise(r => setTimeout(r, 300));   // não sobrecarrega
    }
    coverUpgrading = false;
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
        card.style.transition = 'transform 0.16s ease, opacity 0.16s ease';
        card.style.transform = `translate(${dirX * 140}%, ${action === 'up' ? '-140%' : 0}) rotate(${dirX * 30}deg)`;
        card.style.opacity = '0';
        const map = { right: 'like', left: 'reject', up: 'backlog' };
        setTimeout(() => { applySwipe(g, map[action]); renderDeck(); }, 120);
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
        card.style.transition = 'transform 0.16s ease, opacity 0.16s ease';
        card.style.transform = `translate(${dirX * 140}%, ${dir === 'up' ? '-140%' : 0}) rotate(${dirX * 30}deg)`;
        card.style.opacity = '0';
        plannedDeck.shift();
        setTimeout(() => { applySwipe(g, action); renderDeck(); }, 120);
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
const exploreState = {};   // cat -> { page, items: [], more }
export let exploreById = new Map();      // id -> objeto de jogo (p/ página do jogo e ações)
let classicDecade = '';           // '' | '1980' | '1990' | '2000' | '2010'
let exploreCat = 'you';

function exploreParams(cat, page) {
    const today = new Date().toISOString().slice(0, 10);
    const y = new Date().getFullYear();
    switch (cat) {
        case 'you': { const p = deckParams(page); return { ...p, ordering: poolOrder }; }
        case 'hot': {
            // "Em alta" = bem avaliados e muito comentados nos últimos ~18 meses
            const from = new Date(); from.setMonth(from.getMonth() - 18);
            return { ordering: '-rating', dates: `${from.toISOString().slice(0, 10)},${today}`, page_size: 20, page, exclude_additions: 'true' };
        }
        case 'releases': {
            // Lançamentos: até 3 anos a partir do ano atual (ex.: 2026 -> até 2029),
            // 40 por página (mais variedade por plataforma) e só jogos com capa
            const maxYear = y + 3;
            return { ordering: 'released', dates: `${today},${maxYear}-12-31`, page_size: 40, page };
        }
        case 'gems': {
            // Joias: indies pouco falados (poucas avaliações) — metade das vezes puxa clássicos indie antigos
            const base = { page_size: 40, page, exclude_additions: 'true' };
            const oldSchool = Math.random() < 0.5;
            return oldSchool
                ? { ...base, ordering: '-rating', genres: 'indie', dates: '2000-01-01,2017-12-31' }
                : { ...base, ordering: '-rating', genres: 'indie' };
        }
        case 'classics': {
            const start = classicDecade ? +classicDecade : 1980;
            const end = classicDecade ? start + 9 : 2012;
            return { ordering: '-rating', dates: `${start}-01-01,${end}-12-31`, page_size: 20, page, exclude_additions: 'true' };
        }
        case 'free': return { ordering: '-popularity', tags: 'free-to-play', page_size: 20, page };
        case 'top': default: return { ordering: '-metacritic', page_size: 20, page, exclude_additions: 'true' };
    }
}

// Submenu de épocas dentro de "Clássicos"
export function gmClassicDecade(dec) {
    classicDecade = dec;
    document.querySelectorAll('#gm-classic-decades .gm-chip').forEach(c => c.classList.toggle('active', c.dataset.dec === dec));
    gmExplore('classics');
}

function exploreCardHtml(g) {
    const img = g.image ? resizeUrl(g.image, 420) : null;
    const m = g._match ?? matchScore(g);
    return `
    <div class="gm-x-card" role="button" tabindex="0" onclick="gmXOpen(${g.rawgId})" onkeydown="if(event.key==='Enter')gmXOpen(${g.rawgId})" title="Abrir ${esc(g.title)}">
        <div class="gm-x-cover">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<div class="gm-cover-empty">${esc(g.title.slice(0, 2))}</div>`}</div>
        <div class="gm-x-body">
            <strong>${esc(g.title)}</strong>
            <small>${esc((g.genres || []).slice(0, 2).join(' · '))}${g.released ? ' · ' + String(g.released).slice(0, 4) : ''}</small>
            <span class="gm-match gm-match-${m >= 90 ? 'hi' : m >= 70 ? 'mid' : 'lo'}">${m}%</span>
        </div>
        <div class="gm-x-actions">
            <button type="button" class="icon-btn xl" title="Adicionar à wishlist" onclick="event.stopPropagation();gmExploreWish(${g.rawgId})"><span data-icon="bookmark" data-size="1.1em"></span></button>
            <button type="button" class="icon-btn xl" title="Comprar na Amazon" onclick="event.stopPropagation();gmBuy(${g.rawgId})"><span data-icon="cart" data-size="1.1em"></span></button>
        </div>
    </div>`;
}

async function fetchExplorePage(cat, append) {
    const state = exploreState[cat] || (exploreState[cat] = { page: 0, items: [], more: true });
    state.page++;
    const params = exploreParams(cat, state.page);
    // Filtros de gênero/plataforma viram parâmetros da busca (servidor), não só corte local:
    if (xFilters.genre) {
        const m = GENRE_RAWG[xFilters.genre];
        if (m && m.genre) { params.genres = m.genre; delete params.tags; }
        else if (m && m.tag) { params.tags = m.tag; delete params.genres; }
    }
    if (xFilters.plat) {
        const ids = PLAT_RAWG_IDS[xFilters.plat];
        if (ids) params.platforms = ids.join(',');
    }
    if (xFilters.devId) params.developers = xFilters.devId;   // estúdio escolhido no autocomplete
    if (xFilters.pubId) params.publishers = xFilters.pubId;   // publicadora escolhida no autocomplete
    const res = await listGames(params);
    let items = res.items.filter(g => gmIsClean(g) && g.image && (cat === 'releases' || !farFuture(g)));   // 2030 só na aba Lançamentos
    if (cat === 'releases') {
        // Lançamentos: precisa ter data de lançamento dentro da janela de 3 anos
        const maxY = new Date().getFullYear() + 3;
        items = items.filter(g => g.released && +String(g.released).slice(0, 4) <= maxY);
    }
    if (cat === 'gems') items = items.filter(g => (g.ratingsCount || 0) >= 25 && (g.ratingsCount || 0) <= 1500);   // só indie pouco falado
    if (cat === 'you') items = items.map(g => ({ ...g, _match: matchScore(g) })).sort((a, b) => b._match - a._match);
    state.items = append ? state.items.concat(items) : items;
    state.more = res.more;
    items.forEach(g => exploreById.set(g.rawgId, g));
    return state;
}

const xFilters = { genre: '', plat: '', devId: 0, devName: '', pubId: 0, pubName: '' };
export function gmXFilterGenre(v) { xFilters.genre = v; gmExplore(exploreCat); }   // rebusca com o filtro no servidor
export function gmXFilterPlat(v) { xFilters.plat = v; gmExplore(exploreCat); }

function fillExploreFilters() {
    const bar = document.getElementById('gm-explore-filters');
    if (!bar || bar.dataset.done) return;
    bar.dataset.done = '1';
    const gs = document.getElementById('gm-x-genre');
    const ps = document.getElementById('gm-x-plat');
    if (gs) gs.innerHTML = '<option value="">Todos os gêneros</option>'
        + '<optgroup label="Gêneros">' + GM_GENRES.map(g => `<option value="${g}">${g}</option>`).join('') + '</optgroup>'
        + '<optgroup label="Estilos (Steam)">' + GM_X_STYLES.map(g => `<option value="${g}">${g}</option>`).join('') + '</optgroup>';
    if (ps) ps.innerHTML = '<option value="">Todas as plataformas</option>' + GM_PLATFORMS.map(p => `<option value="${p}">${p}</option>`).join('');
    setupCompanyFilter(document.getElementById('gm-dev-filter'), 'developers');
    setupCompanyFilter(document.getElementById('gm-pub-filter'), 'publishers');
}

// ---------- Filtro de desenvolvedora/publicadora com autocomplete ----------
// A RAWG tem ~465 mil estúdios, então não dá para baixar uma lista fixa: o usuário
// digita 2+ letras, busca na API e escolhe na lista de sugestões que abre embaixo.
function setupCompanyFilter(wrap, kind) {
    if (!wrap || wrap.dataset.done) return;
    wrap.dataset.done = '1';
    const input = wrap.querySelector('input');
    if (!input) return;
    const isDev = kind === 'developers';
    const list = document.createElement('div');
    list.className = 'gm-co-list';
    list.hidden = true;
    list.addEventListener('mousedown', e => e.preventDefault());   // clicar numa sugestão não desfoca o campo
    document.body.appendChild(list);   // fixo na tela: não fica preso no overflow da barra de filtros
    let timer = null, seq = 0;
    const curName = () => isDev ? xFilters.devName : xFilters.pubName;
    const apply = (id, name) => {
        if (isDev) { xFilters.devId = id; xFilters.devName = name; }
        else { xFilters.pubId = id; xFilters.pubName = name; }
        gmExplore(exploreCat);
    };
    const close = () => { list.hidden = true; list.innerHTML = ''; };
    const openAt = () => {
        const r = input.getBoundingClientRect();
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 240));
        list.style.left = `${Math.round(left)}px`;
        list.style.maxWidth = `${Math.round(window.innerWidth - left - 8)}px`;   // nunca estoura a tela no celular
        list.style.top = `${Math.round(r.bottom + 6)}px`;
        list.hidden = false;
    };
    const search = async () => {
        const q = input.value.trim();
        if (q.length < 2) { close(); return; }
        const my = ++seq;
        try {
            const res = await searchCompanies(kind, q);
            if (my !== seq) return;   // resposta velha chegando depois de nova digitação
            if (!res.length) list.innerHTML = '<div class="gm-co-empty">Nada encontrado.</div>';
            else {
                list.innerHTML = res.map(c => `<button type="button" class="gm-co-item" data-id="${c.id}" data-name="${esc(c.name)}"><strong>${esc(c.name)}</strong><small>${c.gamesCount} jogos</small></button>`).join('');
                list.querySelectorAll('.gm-co-item').forEach(btn => btn.addEventListener('click', () => {
                    const name = btn.dataset.name || '';
                    input.value = name;
                    close();
                    apply(+btn.dataset.id, name);
                }));
            }
            openAt();
        } catch (e) { close(); }
    };
    input.addEventListener('input', () => {
        clearTimeout(timer);
        if (!input.value.trim()) { close(); if (curName()) apply(0, ''); return; }   // campo vazio: limpa o filtro
        if (input.value.trim() !== curName()) timer = setTimeout(search, 350);
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const f = list.querySelector('.gm-co-item'); if (f && !list.hidden) f.click(); }
        else if (e.key === 'Escape') { close(); input.value = curName(); }
    });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && input.value.trim() !== curName()) search(); });
    input.addEventListener('blur', () => setTimeout(() => { close(); if (input.value.trim() !== curName()) input.value = curName(); }, 160));
    window.addEventListener('scroll', () => close(), { passive: true });
    window.addEventListener('resize', () => close());
}

function paintExplore(cat) {
    fillExploreFilters();
    const grid = document.getElementById('gm-explore-grid');
    const state = exploreState[cat];
    if (!grid || !state) return;
    // filtros de client-side (gênero/plataforma) valem para todas as abas
    const iw = xFilters.genre ? state.items.filter(g => profileGenreOf(g).includes(xFilters.genre)) : state.items;
    // Plataforma: a RAWG devolve nomes como "Android"/"iOS"/"PC" — o filtro antigo comparava
    // "mobile" com esses nomes (nunca dava match) e a grade ficava vazia. Usa os apelidos.
    const platMatch = g => {
        const kws = PLAT_KEYWORDS[xFilters.plat] || [];
        return (g.platforms || []).some(p => {
            const np = normText(p);
            return np === normText(xFilters.plat) || np.includes(normText(xFilters.plat)) || kws.some(k => np.includes(k));
        });
    };
    const shown = xFilters.plat ? iw.filter(platMatch) : iw;
    const moreBtn = state.more ? `<div class="gm-x-more"><button type="button" class="gm-cta" onclick="gmXMore()">Carregar mais jogos</button></div>` : (state.items.length ? `<div class="gm-x-more gm-note">Chegamos ao fim por aqui — troque de categoria para descobrir mais.</div>` : '');
    if (!shown.length) { grid.innerHTML = `<div class="gm-empty"><p>Nenhum jogo com esses filtros${state.more ? ' — toque em "Carregar mais jogos" para ampliar' : ''}.</p></div>` + moreBtn; return; }
    grid.innerHTML = shown.map(exploreCardHtml).join('') + moreBtn;
    if (DEPS.hydrateIcons) DEPS.hydrateIcons(grid);
}

export async function gmExplore(cat = 'you') {
    exploreCat = cat;
    document.querySelectorAll('#gm-explore-cats .gm-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
    const decBar = document.getElementById('gm-classic-decades');
    if (decBar) {
        decBar.hidden = cat !== 'classics';
        if (cat === 'classics') decBar.querySelectorAll('.gm-chip').forEach(c => c.classList.toggle('active', c.dataset.dec === classicDecade));
    }
    const grid = document.getElementById('gm-explore-grid');
    if (!grid) return;
    exploreState[cat] = { page: 0, items: [], more: true };   // categoria nova sempre sorteia a 1ª página
    grid.innerHTML = '<div class="gm-loading">Carregando...</div>';
    try { await fetchExplorePage(cat, false); paintExplore(cat); }
    catch (e) { grid.innerHTML = `<div class="gm-empty"><p>Não consegui carregar o catálogo agora. Tente de novo em instantes — ou use o deck (modo demonstração).</p></div>`; }
}

export async function gmXMore() {
    const grid = document.getElementById('gm-explore-grid');
    const btn = grid && grid.querySelector('.gm-x-more button');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }
    try { await fetchExplorePage(exploreCat, true); } catch (e) { /* mantém o que já tinha */ }
    paintExplore(exploreCat);
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

export function gmExploreBacklog(rawgId) {
    const g = exploreById.get(rawgId);
    if (!g) return;
    const ok = addToBacklog(g); saveData(); renderApp();
    toast(ok ? `${g.title} foi para o backlog (categoria GameMatch)!` : `${g.title} já estava na sua biblioteca.`);
}

export function gmGoogle(rawgId) {
    const g = exploreById.get(rawgId) || plannedDeck.find(x => x.rawgId === rawgId);
    if (!g) return;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(g.title + ' jogo')}`, '_blank', 'noopener');
}

// ---------- Página em tela cheia de um jogo do Explorar ----------
// A capa PRINCIPAL é vertical (box art); a arte horizontal da RAWG vira o
// fundo e o banner "capa de Facebook". Se a vertical não for achada, mostra
// a horizontal mesmo (é melhor que nada).
export async function gmXOpen(rawgId) {
    const g = exploreById.get(rawgId) || plannedDeck.find(x => x.rawgId === rawgId);
    if (!g) return;
    let old = document.getElementById('gm-xpage');
    if (old) old.remove();
    const m = g._match ?? matchScore(g);
    const img = g.image ? resizeUrl(g.image, 1280) : null;
    // Capa horizontal estilo "capa de Facebook": arte adicional da RAWG (cai para a principal)
    const bannerSrc = g.imageExtra || g.image || null;
    const el = document.createElement('div');
    el.id = 'gm-xpage';
    el.className = 'gm-xpage';
    if (bannerSrc) el.classList.add('with-banner');
    // A capa do hero começa com a horizontal (placeholder) — a vertical entra
    // logo abaixo, sem re-render, quando a busca em segundo plano responde
    const heroImg = g._vcover || img;
    el.innerHTML = `
        ${img ? `<div class="gp-bg"><img src="${esc(img)}" alt=""></div>` : ''}
        <div class="gp-scroll">
            <button type="button" class="gp-back" onclick="gmXClose()">‹ Voltar</button>
            ${bannerSrc ? `<div class="gp-banner"><img src="${esc(resizeUrl(bannerSrc, 1280))}" alt="" onclick="window.viewImage && window.viewImage('${esc(bannerSrc)}')"></div>` : ''}
            <div class="gp-hero">
                ${heroImg ? `<img class="gp-cover" id="gm-x-hero" src="${esc(heroImg)}" alt="">` : `<div class="gp-cover gp-cover-empty">${esc(g.title.slice(0, 2))}</div>`}
                <div class="gp-hero-info">
                    <span class="gm-match gm-match-${m >= 90 ? 'hi' : m >= 70 ? 'mid' : 'lo'}">${m}% Match</span>
                    <h2>${esc(g.title)}</h2>
                    <div class="gp-sub">${(g.genres || []).slice(0, 3).map(esc).join(' · ')}${g.released ? ' · ' + String(g.released).slice(0, 4) : ''}${g.playtime ? ` · ~${g.playtime}h` : ''}</div>
                    <div class="gp-chips">${(g.platforms || []).slice(0, 4).map(x => `<span class="chip">${esc(x)}</span>`).join('')}${g.rating ? `<span class="chip chip-gold">★ ${g.rating.toFixed(1)}</span>` : ''}${g.metacritic ? `<span class="chip">MC ${g.metacritic}</span>` : ''}</div>
                </div>
            </div>
            <div class="gp-actions">
                <button type="button" class="pill-btn primary" onclick="gmXWish(${g.rawgId})">${icon('heart', { size: '1em' })} Wishlist</button>
                <button type="button" class="pill-btn" onclick="gmXBacklog(${g.rawgId})">${icon('archive', { size: '1em' })} Direto pro backlog</button>
                <button type="button" class="pill-btn" onclick="gmGoogle(${g.rawgId})">${icon('search', { size: '1em' })} Buscar no Google</button>
                <button type="button" class="pill-btn" onclick="gmBuy(${g.rawgId})">${icon('cart', { size: '1em' })} Comprar</button>
            </div>
            <details class="gp-sec" open>
                <summary>${icon('gamepad', { size: '1em' })} Sobre o jogo</summary>
                <div class="gp-sec-body" id="gm-xdesc">Carregando descrição...</div>
                <div class="gp-extra" id="gm-xextra"></div>
            </details>
        </div>`;
    document.body.appendChild(el);
    if (window.zlNavPush) window.zlNavPush(() => { if (document.getElementById('gm-xpage')) { gmXClose(); return true; } return false; });
    requestAnimationFrame(() => el.classList.add('open'));
    // Capa vertical em paralelo com a descrição — assim que chega, troca o hero
    if (rawgId > 0 && !g._vcover) {
        autoVerticalCover(g.title, rawgId).then(cov => {
            if (cov && cov.data) {
                g._vcover = cov.data;
                const hero = document.getElementById('gm-x-hero');
                if (hero && el.contains(hero)) hero.src = cov.data;   // ainda é a página deste jogo
            }
        }).catch(() => {});
    }
    try {
        const d = await getGameDetails(rawgId);
        const box = document.getElementById('gm-xdesc');
        if (box && el.contains(box)) box.textContent = (d && d.description) || 'Sem descrição desse jogo no catálogo.';
        const extra = document.getElementById('gm-xextra');
        if (extra && el.contains(extra)) {   // ainda é a página deste jogo (o usuário pode ter aberto outro)
            // Créditos (desenvolvedora/publicadora) + screenshots abaixo da descrição
            const creds = [];
            if ((d && d.developers || []).length) creds.push(`<strong>Desenvolvedora:</strong> ${esc(d.developers.join(', '))}`);
            if ((d && d.publishers || []).length) creds.push(`<strong>Publicadora:</strong> ${esc(d.publishers.join(', '))}`);
            let html = creds.length ? `<div class="gp-cred">${creds.join(' · ')}</div>` : '';
            let shots = (g.screenshots || []).length ? g.screenshots : [];   // miniaturas que vieram na listagem
            if (!shots.length && rawgId > 0) { try { shots = await getGameScreenshots(rawgId); } catch (e) { /* segue sem */ } }
            if (shots.length) html += shotsGalleryHtml(shots);
            extra.innerHTML = html;
        }
    } catch (e) {
        const box = document.getElementById('gm-xdesc');
        if (box && el.contains(box)) box.textContent = 'Sem descrição por aqui agora.';
    }
}

export function gmXWish(rawgId) { gmExploreWish(rawgId); }
export function gmXBacklog(rawgId) { gmExploreBacklog(rawgId); }
export function gmXClose() { const el = document.getElementById('gm-xpage'); if (el) { el.classList.remove('open'); setTimeout(() => el.remove(), 220); } }

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
    // Foto do perfil: a enviada pelo usuário ganha; sem ela, a da Steam (quando conectado); senão a inicial
    const steam = appData.settings.steam || {};
    const photo = appData.settings.userPhoto || steam.avatar || '';
    const name = p.name || steam.persona || 'Seu Gamer';
    // Atualiza TODOS os círculos do perfil no topo: o do topbar (desktop) e o do
    // header (mobile) — ambos usam a classe .dtb-avatar-wrap
    document.querySelectorAll('.dtb-avatar-wrap').forEach(el => { el.innerHTML = photo ? `<img src="${esc(photo)}" alt="Perfil">` : icon('crown', { size: '1.2em' }); });
    // Nível/XP: somados das conquistas desbloqueadas
    const xp = gamerXp(), lvl = levelFromXp(xp), rank = rankOf(lvl.level);
    const unlocked = new Set(appData.unlockedAchievements || []);
    const bio = String(appData.settings.profileBio || '').trim();
    el.innerHTML = `
    <div class="gm-p-head">
        ${photo ? `<img class="gm-p-photo" src="${esc(photo)}" alt="Foto de ${esc(name)}">` : `<div class="gm-p-avatar">${esc((name || 'G')[0].toUpperCase())}</div>`}
        <div>
            <h3 class="gm-p-name">${esc(name)}</h3>
            <div class="gm-p-sub">Perfil Gamer${p.upcomingOnly ? ' · só lançamentos' : ''}${steam.persona ? ` · Steam: ${esc(steam.persona)}` : ''}</div>
        </div>
        <button type="button" class="pill-btn" onclick="gmOnboardOpen(true)" title="Editar preferências"><span data-icon="edit" data-size="0.9em"></span> Editar</button>
    </div>
    <div class="gm-p-photo-actions">
        <button type="button" class="pill-btn" id="gp-photo-add">${icon('image', { size: '1em' })} ${photo ? 'Trocar foto' : 'Enviar foto'}</button>
        ${appData.settings.userPhoto ? `<button type="button" class="pill-btn" id="gp-photo-del" title="Volta para a foto da Steam (ou para a inicial)">${icon('trash', { size: '1em' })} Remover</button>` : ''}
        <input type="file" id="gp-photo-file" accept="image/*" hidden>
    </div>
    <div class="gm-level-card">
        <div class="gm-lv-badge"><span>${lvl.level}</span><small>NÍVEL</small></div>
        <div class="gm-lv-info">
            <strong>${esc(rank)}</strong>
            <div class="gm-lv-bar"><span style="width:${lvl.pct}%"></span></div>
            <small>${lvl.into}/${lvl.need} XP para o nível ${lvl.level + 1} · ${xp} XP de conquistas</small>
        </div>
        <button type="button" class="pill-btn primary" id="gm-share-id">${icon('share', { size: '1em' })} Compartilhar Gamer ID</button>
    </div>
    <details class="gp-sec" open>
        <summary>${icon('star', { size: '1em' })} Conquistas (${unlocked.size}/${ACHIEVEMENTS.length})</summary>
        <div class="gm-ach-mini">
            ${ACHIEVEMENTS.map(a => `<div class="gm-ach-it ${unlocked.has(a.id) ? '' : 'off'}" title="${esc(a.desc)}">${icon(a.icon, { size: '1.25em' })}<span>${esc(a.name)}</span><small>+${a.xp} XP</small></div>`).join('')}
        </div>
    </details>
    <details class="gp-sec" open>
        <summary>${icon('pen', { size: '1em' })} Sobre você (aparece no seu Gamer ID)</summary>
        <div class="gp-sec-body">
            <textarea id="gm-bio" rows="3" placeholder="Ex.: RPG de turnos acima de tudo. Zerando o backlog uma sessão por dia.">${esc(bio)}</textarea>
            <div><button type="button" class="pill-btn" id="gm-bio-save" style="margin-top: 8px;">Salvar descrição</button></div>
        </div>
    </details>
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
    // Foto do perfil: envio local (a da Steam entra sozinha quando a conta está conectada)
    const file = el.querySelector('#gp-photo-file');
    const addBtn = el.querySelector('#gp-photo-add');
    if (addBtn && file) {
        addBtn.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
            const f = file.files && file.files[0];
            file.value = '';
            if (!f) return;
            try {
                appData.settings.userPhoto = await fileToSmallJpeg(f, 640);   // 640px: nítida no círculo grande
                saveData(null);
                toast('Foto do perfil salva!');
            } catch (e) { toast('Não consegui usar essa imagem.', false); }
            renderGmProfile();
        });
    }
    const delBtn = el.querySelector('#gp-photo-del');
    if (delBtn) delBtn.addEventListener('click', () => { delete appData.settings.userPhoto; saveData(null); renderGmProfile(); });
    // Botão do Gamer ID (abre a tela cheia de compartilhamento com o perfil)
    const idBtn = el.querySelector('#gm-share-id');
    if (idBtn) idBtn.addEventListener('click', () => openGamerIdShare());
    // Descrição livre do perfil (vai no Gamer ID compartilhado)
    const bioSave = el.querySelector('#gm-bio-save');
    if (bioSave) bioSave.addEventListener('click', () => {
        const ta = el.querySelector('#gm-bio');
        appData.settings.profileBio = String((ta && ta.value) || '').trim();
        saveData(null);
        toast('Descrição salva!');
    });
    // Steam conectada: se ainda não buscou o avatar (ou salvou o de 64px de versões
    // antigas), busca o avatarfull em segundo plano e atualiza quando chegar
    const oldAvatar = steam.avatar && steam.avatar.includes('_medium');
    if (steam.steamId && steam.apiKey && !appData.settings.userPhoto && (!steam.avatar || oldAvatar)) {
        fetchPersona().then(() => { if ((appData.settings.steam || {}).avatar) renderGmProfile(); }).catch(() => {});
    }
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
            <div class="gm-ob-logo">${icon('heart', { size: '52px' })}</div>
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
         <button type="button" class="gm-chip gm-toggle ${obSel.upcomingOnly ? 'active' : ''}" onclick="gmObToggleUpcoming(this)">${icon('calendar', { size: '1em' })} Só mostrar jogos que ainda vão lançar</button>`,
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
                : `<button type="button" class="gm-cta" onclick="gmObFinish()">Começar o swipe! ${icon('gamepad', { size: '1em' })}</button>`}
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

// ---------- Ativação da aba e suas 2 sub-telas (o Perfil virou aba do app) ----------
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
}

// ---------- Inicialização ----------
export function initGameMatch(deps) {
    DEPS = { ...DEPS, ...deps };
    document.addEventListener('zeralog:tab-changed', e => {
        if (!e.detail) return;
        if (e.detail.tab === 'gamematch') gmActivate();
        if (e.detail.tab === 'profile') renderGmProfile();   // aba Perfil do app
    });
}



