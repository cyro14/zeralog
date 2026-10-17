// Testes da gamificação (js/achievements.js): XP por conquista, curva de nível,
// detecção, integridade da lista, detalhe (como conquistar) e a PLATINA.
import { test, assert, assertEq, elById } from './shim.mjs';
import { appData } from '../js/store.js';
import {
    ACHIEVEMENTS, buildContext, detectNewAchievements, openAchDetail, renderAchievements,
    gamerXp, levelFromXp, rankOf, RANKS
} from '../js/achievements.js';

test('integridade: toda conquista tem id único, xp positivo, ícone, teste e COMO conquistar', () => {
    const ids = new Set();
    for (const a of ACHIEVEMENTS) {
        assert(!ids.has(a.id), `id repetido: ${a.id}`);
        ids.add(a.id);
        assert(typeof a.xp === 'number' && a.xp > 0, `${a.id} precisa de xp`);
        assert(typeof a.name === 'string' && a.desc && a.icon && typeof a.test === 'function', `${a.id} incompleta`);
        assert(typeof a.how === 'string' && a.how.length > 15, `${a.id} precisa de instruções de como conquistar (how)`);
    }
    assert(ACHIEVEMENTS.length >= 30, 'a lista cresceu com a gamificação');
});

test('curva de nível: marcos conhecidos e progresso sempre dentro dos limites', () => {
    assertEq(levelFromXp(0).level, 1, 'zero xp = nível 1');
    assertEq(levelFromXp(99).level, 1, 'quase 100 ainda é 1');
    assertEq(levelFromXp(100).level, 2, '100 xp = nível 2');
    assertEq(levelFromXp(250).level, 3, '250 xp = nível 3');
    assertEq(levelFromXp(700).level, 5, '700 xp = nível 5');
    assertEq(levelFromXp(2200).level, 9, '2200 xp = nível 9');
    const l = levelFromXp(1234);
    assert(l.into < l.need && l.pct >= 0 && l.pct <= 100, 'progresso consistente');
    assertEq(rankOf(1), 'Novato');
    assertEq(rankOf(9), 'Lenda');
    assertEq(rankOf(99), 'Imortal', 'acima do topo repete o último');
});

test('gamerXp soma o xp das conquistas desbloqueadas (retroativo, sem migrar nada)', () => {
    assertEq(gamerXp(), 0, 'sem conquistas, sem xp');
    appData.unlockedAchievements = ['ach-1', 'ach-5', 'ach-legend'];
    const soma = ACHIEVEMENTS.filter(a => appData.unlockedAchievements.includes(a.id)).reduce((s, a) => s + a.xp, 0);
    assertEq(gamerXp(), soma, `xp bate com a soma (${soma})`);
});

test('buildContext traz os novos indicadores da gamificação', () => {
    appData.games.push(
        { id: 'a', title: 'A', platform: 'PC', state: 'playing', userShots: ['x'], userBanner: 'data:x' },
        { id: 'b', title: 'B', platform: 'PC', state: 'backlog', franchise: 'Zelda' },
        { id: 'c', title: 'C', platform: 'PC', state: 'finished' },
    );
    appData.gamematch = { likes: [{}, {}], favorites: [{}] };
    appData.settings.profileBio = 'RPG é vida';
    appData.settings.userPhoto = 'data:photo';
    const c = buildContext();
    assertEq(c.playing, 1, 'playing');
    assertEq(c.backlog, 1, 'backlog não conta o que está jogando');
    assertEq(c.finished, 1, 'zerados');
    assertEq(c.userShots, 1, 'screenshots do usuário');
    assertEq(c.banners, 1, 'fundos personalizados');
    assertEq(c.matches, 3, 'matches do GameMatch');
    assertEq(c.franchises, 1, 'franquias');
    assertEq(c.photo, true, 'foto definida');
    assertEq(c.bio, true, 'bio definida');
});

test('detectNewAchievements desbloqueia as novas conquistas e o xp acompanha', () => {
    detectNewAchievements();   // semeia com a biblioteca vazia: nada desbloqueia ainda
    assertEq(appData.unlockedAchievements.length, 0, 'sem dados, sem conquistas');
    appData.games.push({ id: 'c', title: 'C', platform: 'PC', state: 'finished', userShots: ['x'] });
    appData.settings.userPhoto = 'data:photo';
    appData.settings.profileBio = 'RPG é vida';
    const fresh = detectNewAchievements();
    const ids = fresh.map(a => a.id);
    assert(ids.includes('ach-1'), 'zerou o primeiro: Primeiro Passo');
    assert(ids.includes('ach-shots'), 'screenshot própria: Fotógrafo de Tela');
    assert(ids.includes('ach-photo'), 'foto de perfil: Rosto Marcado');
    assert(ids.includes('ach-bio'), 'bio: Cronista Pessoal');
    const soma = fresh.reduce((s, a) => s + a.xp, 0);
    assertEq(gamerXp(), soma, 'xp reflete tudo o que desbloqueou');
    assertEq(detectNewAchievements().length, 0, 'não repete conquistas');
});

test('seeding não derruba conquistas que o usuário já merecia', () => {
    appData.games.push({ id: 'd', title: 'D', platform: 'PC', state: 'finished' });
    appData.achSeeded = false;
    const d = detectNewAchievements();
    assertEq(d.length, 0, 'seeding não anuncia');
    assert(appData.unlockedAchievements.includes('ach-1'), 'mas registra o que já valia');
});

// ---------- conquistas clicáveis: o passo a passo de como desbloquear ----------
test('clicar numa conquista abre o detalhe com COMO conquistar', () => {
    appData.unlockedAchievements = ['ach-1'];
    openAchDetail('ach-1');
    const h = elById('ach-detail').innerHTML;
    assert(h.includes('Primeiro Passo'), 'nome da conquista');
    assert(h.includes('Desbloqueada'), 'status de desbloqueada');
    assert(h.includes('+25 XP'), 'xp da conquista');
    assert(h.includes('Como conquistar:'), 'título das instruções');
    assert(h.includes('Marque qualquer jogo como zerado'), 'o passo a passo em si');
    assert(elById('modal-ach')._shown >= 1, 'o modal de detalhe abriu');
    // ainda bloqueada mostra o outro status
    openAchDetail('ach-50');
    assert(elById('ach-detail').innerHTML.includes('Ainda bloqueada'), 'status de bloqueada');
    // conquista inexistente não explode
    openAchDetail('nao-existe');
});

// Biblioteca que satisfaz TODAS as conquistas — o cenário da PLATINA
function platinumData() {
    const genres = ['RPG', 'Ação', 'Aventura', 'Estratégia', 'Simulação', 'Terror', 'FPS', 'Corrida', 'Puzzle', 'Indie'];
    const plats = ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Mobile'];
    const franq = ['Zelda', 'Halo', 'Metroid', 'Mario', 'Castlevania'];
    const mk = (i, extra = {}) => ({ id: 'p' + i, title: 'Jogo ' + i, platform: plats[i % 5], genres: [genres[i % 10]], meta: '12h', image: 'data:image/jpeg;base64,CAPA', catId: 'c1', ...extra });
    for (let i = 0; i < 50; i++) appData.games.push(mk(i, {
        state: 'finished', is100: i < 5, userRating: i < 25 ? 8 : undefined,
        difficulty: i === 0 ? 'hard' : undefined, emulated: i < 3 ? true : undefined,
        wiki: i < 5 ? 'zelda' : undefined, userShots: i === 0 ? ['x'] : undefined,
        userBanner: i === 0 ? 'data:x' : undefined, franchise: i < 15 ? franq[Math.floor(i / 3)] : undefined
    }));
    for (let i = 50; i < 70; i++) appData.games.push(mk(i, { state: 'backlog' }));
    for (let i = 70; i < 73; i++) appData.games.push(mk(i, { state: 'playing' }));
    for (let i = 0; i < 10; i++) appData.games[i].journalNotes = `[0${(i % 9) + 1}/01/2025] Entrada ${i} do diário`;
    appData.games.push({ id: 'c1', title: 'Contínuo', platform: 'PC', continuous: true, hoursPlayed: '60h' });
    appData.games.push({ id: 'c2', title: 'Contínuo 2', platform: 'PC', continuous: true, hoursPlayed: '40h' });
    for (let i = 0; i < 20; i++) appData.wishlist.push({ id: 'w' + i, title: 'Desejo ' + i, platform: 'PC' });
    appData.counters = { wishMoved: 1, sessions: 1, sessionMinutes: 3000 };
    appData.gamematch = { likes: Array.from({ length: 10 }, () => ({})), favorites: [], rejects: [], backlogAdds: [] };
    appData.settings.userPhoto = 'data:photo';
    appData.settings.profileBio = 'Zerando tudo.';
}

test('conquistas: cards clicáveis na grade; PLATINA só quando desbloqueia TUDO', () => {
    renderAchievements();
    const grid = elById('achievements-grid').innerHTML;
    assert(grid.includes(`openAchDetail('ach-1')`), 'cada card abre o detalhe ao clicar');
    assert(!grid.includes('Platina'), 'sem platina com biblioteca pequena');
    assertEq(elById('ach-progress').textContent, `0/${ACHIEVEMENTS.length}`, 'progresso comum');
    // biblioteca que satisfaz tudo: o troféu platina aparece no topo
    platinumData();
    renderAchievements();
    const grid2 = elById('achievements-grid').innerHTML;
    assert(grid2.indexOf('Platina do ZeraLog') > -1, 'troféu platina na grade');
    assert(grid2.indexOf('Platina do ZeraLog') < grid2.indexOf(`openAchDetail('ach-1')`), 'platina no topo, antes dos cards');
    assert(elById('ach-progress').textContent.includes('PLATINA!'), 'progresso anuncia a platina');
    assertEq(elById('sn-ach').textContent, `${ACHIEVEMENTS.length}/${ACHIEVEMENTS.length}`, 'contador do submenu completo');
});
