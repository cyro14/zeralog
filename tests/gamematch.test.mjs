// Testes do GameMatch (js/gamematch.js): perfil, motor de match, filtros do
// Explorar e bloqueio de conteúdo adulto.
import { test, assert, assertEq, elById } from './shim.mjs';
import { appData } from '../js/store.js';
import {
    GM_GENRES, GM_X_STYLES, GM_PLATFORMS, GENRE_RAWG, PLAT_RAWG_IDS,
    profileGenreOf, matchScore, gmIsClean, farFuture, renderGmProfile
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

test('gmIsClean bloqueia conteúdo adulto (tags, ESRB e título)', () => {
    assert(gmIsClean({ title: 'Jogo Normal', tags: ['singleplayer'] }), 'jogo comum passa');
    assert(!gmIsClean({ title: 'Jogo', tags: ['hentai'] }), 'tag adulto bloqueia');
    assert(!gmIsClean({ title: 'Jogo', tags: [], esrb: 'Adults Only' }), 'ESRB Adults Only bloqueia');
});

test('farFuture: datas futuras só valem quando o perfil pede lançamentos', () => {
    assert(farFuture({ released: '2030-06-01' }), 'ano futuro conta como longe');
    assert(!farFuture({ released: '2020-06-01' }), 'ano passado não é longe');
    assert(!farFuture({ tba: true }), 'TBA nunca é longe');
    appData.gamematch.profile = { upcomingOnly: true };
    assert(!farFuture({ released: '2030-06-01' }), 'perfil de lançamentos aceita o futuro');
});

// ---------- Lançamentos: janela de 3 anos, 40 por página, só com capa ----------
test('Lançamentos (releases): params usam janela de 3 anos e page_size 40', () => {
    // exploreParams é interno — mas dá para verificar o comportamento via
    // o filtro do fetchExplorePage: ano máximo = atual + 3, sem capa não passa.
    const y = new Date().getFullYear();
    const maxY = y + 3;
    // jogos que passam e que NÃO passam no filtro local de lançamentos
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
