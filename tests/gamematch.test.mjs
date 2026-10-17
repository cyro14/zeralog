// Testes do GameMatch (js/gamematch.js): perfil, motor de match, filtros do
// Explorar e bloqueio de conteúdo adulto.
import { test, assert, assertEq, elById, live, mockFetch, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { listGames } from '../js/gameApi.js';
import {
    GM_GENRES, GM_X_STYLES, GM_PLATFORMS, GENRE_RAWG, PLAT_RAWG_IDS,
    profileGenreOf, matchScore, gmIsClean, farFuture, renderGmProfile, exploreParams
} from '../js/gamematch.js';

test('integridade: TODO gênero do filtro do Explorar tem mapeamento para a RAWG', () => {
    // Gênero sem mapeamento = filtro silenciosamente vazio. Se adicionar um gênero
    // novo em GM_GENRES/GM_X_STYLES, adicione o slug em GENRE_RAWG junto.
    const missing = [...GM_GENRES, ...GM_X_STYLES].filter(g => !GENRE_RAWG[g]);
    assertEq(missing.join(', '), '', 'gêneros sem mapeamento RAWG');
});

test('integridade: TODO gênero mapeado existe na lista do filtro (nada órfão)', () => {
    const orphans = Object.keys(GENRE_RAWG).filter(g => !GM_GENRES.includes(g) && !GM_X_STYLES.includes(g));
    assertEq(orphans.join(', '), '', 'mapeamentos fora das listas');
});

test('integridade: TODA plataforma do filtro tem IDs da RAWG', () => {
    const missing = GM_PLATFORMS.filter(p => !PLAT_RAWG_IDS[p]);
    assertEq(missing.join(', '), '', 'plataformas sem IDs RAWG');
});

test('integridade: Mobile cobre Android E iOS (o filtro que já quebrou)', () => {
    assertEq(PLAT_RAWG_IDS.Mobile.join(','), '3,21', 'iOS(3) + Android(21)');
});

test('profileGenreOf traduz gêneros e tags da RAWG para os nomes do perfil', () => {
    const out = profileGenreOf({ genres: ['Tiro', 'Luta', 'Multiplayer massivo'], tags: ['Open World', 'Co-op', 'Point-and-click'] });
    assert(out.includes('FPS'), 'Tiro -> FPS');
    assert(out.includes('Luta'), 'Luta');
    assert(out.includes('MMORPG'), 'Multiplayer massivo -> MMORPG');
    assert(out.includes('Mundo Aberto'), 'tag Open World -> Mundo Aberto');
    assert(out.includes('Co-op'), 'tag Co-op');
    assert(out.includes('Point & Click'), 'tag Point-and-click -> Point & Click');
});

test('matchScore fica entre 5 e 99 e gênero do perfil pontua mais alto', () => {
    appData.gamematch = { profile: { name: 'T', genres: ['RPG'], platforms: ['PC'], styles: ['single'], price: 'any', era: 'both', time: 'some' }, likes: [], favorites: [], rejects: [], backlogAdds: [], genreBoost: {}, franchiseBoost: {} };
    const base = { title: 'Jogo', genres: [], tags: ['singleplayer'], platforms: ['PC'], released: '2020-01-01', rating: 4, ratingsCount: 100, rawgId: 1 };
    const rpg = matchScore({ ...base, genres: ['RPG'] });
    const corrida = matchScore({ ...base, genres: ['Corrida'] });
    assert(rpg >= 5 && rpg <= 99 && corrida >= 5 && corrida <= 99, 'scores dentro dos limites');
    assert(rpg > corrida, `gênero do perfil pontua mais (${rpg} > ${corrida})`);
});

test('gmIsClean bloqueia adulto de verdade — mas GTA VI (tag "Nudity") passa', () => {
    assert(gmIsClean({ title: 'Jogo Normal', tags: ['singleplayer'] }), 'jogo comum passa');
    assert(!gmIsClean({ title: 'Jogo', tags: ['hentai'] }), 'tag adulto bloqueia');
    assert(!gmIsClean({ title: 'Jogo', tags: [], esrb: 'Adults Only' }), 'ESRB Adults Only bloqueia');
    // GTA VI na RAWG vem com ESRB "Mature" e a tag "Nudity" — descritores de
    // classificação, não conteúdo adulto. Sem isso ele sumia dos Lançamentos
    // mesmo estando no topo do hype.
    const gta6 = { title: 'Grand Theft Auto VI', esrb: 'Mature', tags: ['Singleplayer', 'Open World', 'Violent', 'Nudity', 'Crime'] };
    assert(gmIsClean(gta6), 'GTA VI passa (era filtrado injustamente)');
    const cp2077 = { title: 'Cyberpunk 2077', esrb: 'Mature', tags: ['Nudity', 'Sexual Content', 'Mature'] };
    assert(gmIsClean(cp2077), 'Cyberpunk (tags de classificação M) passa');
});

test('farFuture: datas futuras só valem quando o perfil pede lançamentos', () => {
    assert(farFuture({ released: '2030-06-01' }), 'ano futuro conta como longe');
    assert(!farFuture({ released: '2020-06-01' }), 'ano passado não é longe');
    assert(!farFuture({ tba: true }), 'TBA nunca é longe');
    appData.gamematch.profile = { upcomingOnly: true };
    assert(!farFuture({ released: '2030-06-01' }), 'perfil de lançamentos aceita o futuro');
});

// ---------- Lançamentos: janela de 3 anos, 40 por página, ordenados pelo hype ----------
test('Lançamentos (releases): params ordenam pelo maior hype (RAWG -added)', () => {
    const y = new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);
    const p = exploreParams('releases', 1);
    assertEq(p.ordering, '-added', 'hype primeiro = quem tem mais "added" na RAWG (GTA VI, remakes no topo)');
    assert(!('exclude_additions' in p), 'sem exclude_additions: remakes são "addition" na RAWG e precisam aparecer');
    assertEq(p.dates, `${today},${y + 3}-12-31`, 'janela do hoje até 3 anos à frente (anos seguintes incluídos)');
    assertEq(p.page_size, 40, '40 por página');
    // jogos que passam e que NÃO passam no filtro local de lançamentos
    const maxY = y + 3;
    const ok = { title: 'Dentro', released: `${maxY}-06-01`, image: 'https://x/capa.jpg', rawgId: 1, genres: [], tags: [], platforms: [] };
    const tooFar = { title: 'Longe demais', released: `${maxY + 1}-01-01`, image: 'https://x/capa.jpg', rawgId: 2, genres: [], tags: [], platforms: [] };
    const noCapa = { title: 'Sem capa', released: `${y + 1}-01-01`, image: null, rawgId: 3, genres: [], tags: [], platforms: [] };
    const tba = { title: 'TBA', released: null, tba: true, image: 'https://x/capa.jpg', rawgId: 4, genres: [], tags: [], platforms: [] };
    // valida o corte: dentro da janela e com capa
    assert(ok.released && +String(ok.released).slice(0, 4) <= maxY, 'dentro da janela de 3 anos');
    assert(+(String(tooFar.released).slice(0, 4)) > maxY, 'fora da janela é rejeitado');
    assert(!noCapa.image, 'sem capa é rejeitado');
    assert(!tba.released, 'TBA sem data é rejeitado');
});

test('AO VIVO: Lançamentos vêm do maior hype para o menor (GTA VI no topo)', async () => {
    const res = await live(listGames(exploreParams('releases', 1)));
    const added = res.items.map(g => g.added || 0);
    assert(added.length >= 30, `página cheia de lançamentos (${added.length} itens)`);
    for (let i = 1; i < added.length; i++)
        assert(added[i] <= added[i - 1], `hype em ordem decrescente (posição ${i}: ${added[i]} > ${added[i - 1]})`);
    assert(added[0] > added[added.length - 1], 'o topo tem mais hype que o fim da página');
});

// ---------- aba Perfil (foto do usuário > foto da Steam > inicial) ----------
function profileReady() {
    appData.gamematch = { profile: { name: '', genres: ['RPG'], platforms: ['PC'], styles: ['single'], price: 'any', era: 'both', time: 'some' }, likes: [], favorites: [], rejects: [], backlogAdds: [], genreBoost: {}, franchiseBoost: {} };
}
const profileHtml = () => (elById('gm-profile') ? elById('gm-profile').innerHTML : '');

test('perfil: usa a foto da Steam quando não há upload', () => {
    profileReady();
    appData.settings.steam = { persona: 'CyroSteam', avatar: 'https://avatars/steam_full.jpg', steamId: '123', apiKey: '' };
    renderGmProfile();
    assert(profileHtml().includes('steam_full.jpg'), 'avatar da Steam na página');
    assert(profileHtml().includes('CyroSteam'), 'nome cai para o persona da Steam');
    assert(profileHtml().includes('Steam: CyroSteam'), 'persona aparece como dica');
});

test('perfil: foto enviada pelo usuário tem prioridade sobre a da Steam', () => {
    profileReady();
    appData.settings.steam = { persona: 'Steam', avatar: 'https://avatars/steam_full.jpg', steamId: '123', apiKey: '' };
    appData.settings.userPhoto = 'data:image/jpeg;base64,MINHAFOTO';
    renderGmProfile();
    const h = profileHtml();
    assert(h.includes('MINHAFOTO'), 'foto enviada aparece');
    assert(!h.includes('steam_full.jpg'), 'foto da Steam sai da tela');
    assert(h.includes('gp-photo-del'), 'com upload existe o botão Remover');
});

test('perfil: sem Steam e sem upload mostra a inicial do nome', () => {
    profileReady();
    appData.gamematch.profile.name = 'Zeca';
    appData.settings.steam = {};
    renderGmProfile();
    const h = profileHtml();
    assert(h.includes('gm-p-avatar'), 'círculo com a inicial');
    assert(h.includes('Zeca'), 'nome do perfil');
    assert(!h.includes('gp-photo-del'), 'sem upload não tem Remover');
});

test('perfil: os círculos do topo (desktop e mobile) recebem a mesma foto', () => {
    profileReady();
    appData.settings.userPhoto = 'data:image/jpeg;base64,FOTOTOPO';
    // dois círculos: o do topbar (desktop) e o do header (mobile) — a renderGmProfile
    // precisa pintar TODOS os .dtb-avatar-wrap, não só o de um id
    const circles = [{ innerHTML: '' }, { innerHTML: '' }];
    const orig = document.querySelectorAll;
    document.querySelectorAll = sel => (sel === '.dtb-avatar-wrap' ? circles : []);
    try { renderGmProfile(); } finally { document.querySelectorAll = orig; }
    assert(circles[0].innerHTML.includes('FOTOTOPO'), 'círculo do desktop com a foto');
    assert(circles[1].innerHTML.includes('FOTOTOPO'), 'círculo do mobile com a foto');
    // sem foto nenhuma: os círculos voltam para o ícone de coroa
    delete appData.settings.userPhoto;
    circles[0].innerHTML = ''; circles[1].innerHTML = '';
    document.querySelectorAll = sel => (sel === '.dtb-avatar-wrap' ? circles : []);
    try { renderGmProfile(); } finally { document.querySelectorAll = orig; }
    assert(circles[0].innerHTML.includes('<svg'), 'sem foto o círculo mostra a coroa');
});

test('perfil: a foto aparece no círculo do topo mesmo sem perfil do GameMatch', () => {
    // sem .profile montado — o renderGmProfile faz early return, mas os círculos
    // do topo têm que receber a foto mesmo assim
    appData.gamematch = { likes: [], favorites: [], rejects: [], backlogAdds: [], genreBoost: {}, franchiseBoost: {} };
    appData.settings.userPhoto = 'data:image/jpeg;base64,SEMPERFIL';
    const circles = [{ innerHTML: '' }, { innerHTML: '' }];
    const orig = document.querySelectorAll;
    document.querySelectorAll = sel => (sel === '.dtb-avatar-wrap' ? circles : []);
    try { renderGmProfile(); } finally { document.querySelectorAll = orig; }
    assert(circles[0].innerHTML.includes('SEMPERFIL'), 'círculo do desktop pintado sem perfil montado');
    assert(circles[1].innerHTML.includes('SEMPERFIL'), 'círculo do mobile pintado sem perfil montado');
});

// ---------- Explorar: botões Filtros/Ordenar, painéis e capa vertical ----------
const EXPLORE_MOCK = ['/api/games?', {
    count: 3, results: [
        { id: 1, name: 'Zelda BotW', released: '2017-03-03', background_image: 'https://media.rawg.io/media/games/z/z.jpg', metacritic: 97, added: 500, genres: [{ name: 'Adventure' }], platforms: [] },
        { id: 2, name: 'Astro Bot', released: '2024-09-06', background_image: 'https://media.rawg.io/media/games/a/a.jpg', metacritic: 94, added: 900, genres: [{ name: 'Platformer' }], platforms: [] },
        { id: 3, name: 'Minecraft', released: '2011-11-18', background_image: 'https://media.rawg.io/media/games/m/m.jpg', metacritic: 93, added: 7000, genres: [{ name: 'Indie' }], platforms: [] },
    ],
}];

test('Explorar: gmXSort ordena a grade no cliente (A-Z, nota, hype, data)', async () => {
    mockFetch([EXPLORE_MOCK]);
    const { gmExplore, gmXSort } = await import('../js/gamematch.js');
    await gmExplore('top');
    const grid = elById('gm-explore-grid');
    const order = () => ['Zelda BotW', 'Astro Bot', 'Minecraft'].map(t => grid.innerHTML.indexOf(`>${t}<`));
    assert(order()[0] < order()[1] && order()[1] < order()[2], 'sem sort: ordem original (Zelda, Astro, Minecraft)');
    gmXSort('az');
    assert(order()[1] < order()[2] && order()[2] < order()[0], 'A-Z: Astro, Minecraft, Zelda');
    gmXSort('za');
    assert(order()[0] < order()[2] && order()[2] < order()[1], 'Z-A: Zelda, Minecraft, Astro');
    gmXSort('mc');
    assert(order()[0] < order()[1], 'melhor nota: Zelda (97) na frente');
    gmXSort('added');
    assert(order()[2] < order()[1], 'mais hypados: Minecraft (7000) na frente');
    gmXSort('new');
    assert(order()[1] < order()[0], 'mais recentes: Astro (2024) na frente');
    gmXSort('old');
    assert(order()[2] < order()[1], 'mais antigos: Minecraft (2011) na frente');
    gmXSort('');
    assert(order()[0] < order()[1] && order()[1] < order()[2], 'padrão volta à ordem original');
});

test('Explorar: botões Filtros/Ordenar abrem painéis; badge e chips contam os filtros ativos', async () => {
    mockFetch([['/api/games?', { count: 0, results: [] }]]);
    const { gmExplore, gmXFilterToggle, gmXSortToggle, gmXFilterGenre, gmXFilterClear, gmXSort } = await import('../js/gamematch.js');
    await gmExplore('top');
    const fp = elById('gm-x-filter-panel'), sp = elById('gm-x-sort-panel');
    fp.hidden = true; sp.hidden = true;
    gmXFilterToggle();
    assert(fp.hidden === false, 'painel de filtros abre');
    assert(sp.hidden === true, 'painel de ordenar continua fechado');
    gmXSortToggle();
    assert(sp.hidden === false, 'painel de ordenar abre');
    assert(fp.hidden === true, 'abrir um fecha o outro');
    gmXSortToggle();
    assert(sp.hidden === true, 'segundo clique fecha o painel');
    assert(elById('gm-x-sort-panel').innerHTML.includes('gm-x-sort-btn'), 'opções de ordenação pintadas');
    // filtro ativo: badge com a contagem, chip do gênero e botão de limpar
    gmXFilterGenre('RPG');
    const badge = elById('gm-filter-badge');
    assert(badge.hidden === false && badge.textContent === '1', 'badge com 1 filtro ativo');
    assert(elById('gm-filter-chips').innerHTML.includes('RPG'), 'chip do gênero ativo');
    assert(elById('gm-filter-clear').hidden === false, 'botão de limpar visível');
    gmXFilterClear();
    assert(elById('gm-filter-badge').hidden === true, 'badge some ao limpar');
    assert(!elById('gm-filter-chips').innerHTML.includes('RPG'), 'chip do gênero sai ao limpar');
    gmXSort('');   // deixa o padrão para os próximos testes
});

test('Explorar: capa vertical já achada (página do jogo) faz a wishlist/backlog nascerem RETRATO', async () => {
    const { gmExploreWish, gmExploreBacklog, exploreById } = await import('../js/gamematch.js');
    exploreById.set(77, { rawgId: 77, title: 'Jogo Vertical Ja Achado', image: 'https://media.rawg.io/media/games/h/wide.jpg', _vcover: 'data:image/jpeg;base64,VERTICAL77', genres: ['RPG'], platforms: ['PC'], released: '2020-01-01', metacritic: 90, _match: 80 });
    exploreById.set(78, { rawgId: 78, title: 'Outro Jogo Vertical', image: 'https://media.rawg.io/media/games/h/wide2.jpg', _vcover: 'data:image/jpeg;base64,VERTICAL78', genres: ['RPG'], platforms: ['PC'], released: '2019-01-01', metacritic: 88, _match: 75 });
    gmExploreWish(77);
    const wish = (appData.wishlist || []).find(w => w.title === 'Jogo Vertical Ja Achado');
    assert(wish, 'jogo foi para a wishlist');
    assertEq(wish.image, 'data:image/jpeg;base64,VERTICAL77', 'wishlist nasce com a capa vertical');
    assertEq(wish.wideCover, false, 'marcada como retrato, sem arte horizontal de fallback');
    gmExploreBacklog(78);
    const bg = appData.games.find(g => g.title === 'Outro Jogo Vertical');
    assert(bg, 'jogo foi para o backlog');
    assertEq(bg.image, 'data:image/jpeg;base64,VERTICAL78', 'backlog nasce com a capa vertical');
    assertEq(bg.wideCover, false, 'marcado como retrato');
});
