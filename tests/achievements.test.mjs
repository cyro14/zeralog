// Testes da gamificação (js/achievements.js): XP por conquista, curva de nível,
// detecção e integridade da lista.
import { test, assert, assertEq } from './shim.mjs';
import { appData } from '../js/store.js';
import {
    ACHIEVEMENTS, buildContext, detectNewAchievements,
    gamerXp, levelFromXp, rankOf, RANKS
} from '../js/achievements.js';

test('integridade: toda conquista tem id único, xp positivo, ícone e teste', () => {
    const ids = new Set();
    for (const a of ACHIEVEMENTS) {
        assert(!ids.has(a.id), `id repetido: ${a.id}`);
        ids.add(a.id);
        assert(typeof a.xp === 'number' && a.xp > 0, `${a.id} precisa de xp`);
        assert(typeof a.name === 'string' && a.desc && a.icon && typeof a.test === 'function', `${a.id} incompleta`);
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
