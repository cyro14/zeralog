// Testes do arrastar-e-soltar da Fila (js/dragdrop.js): trocar de posição na
// seção, de categoria/prateleira e de status (arrastar pro hero = jogando,
// pros contínuos = jogo contínuo, pra prateleira = volta pra fila).
// O núcleo (placeGame/applyDrop) roda direto — a camada de ponteiro é fina.
import { test, assert, assertEq } from './shim.mjs';
import { appData } from '../js/store.js';
import { placeGame, applyDrop } from '../js/dragdrop.js';

const mk = (id, cat, extra = {}) => Object.assign({ id, title: id, catId: cat, state: null, continuous: false }, extra);
const CAT = id => ({ kind: 'cat', id });
const HERO = { kind: 'playing' };
const CONT = { kind: 'continuous' };
const ordemDe = (games, cat) => games.filter(g => g.catId === cat && !g.state && !g.continuous).map(g => g.id).join(',');
const fila = () => appData.games.filter(g => !g.state && !g.continuous).map(g => g.id).join(',');
const hero = () => appData.games.filter(g => g.state === 'playing' && !g.continuous).map(g => g.id).join(',');
const conts = () => appData.games.filter(g => g.continuous).map(g => g.id).join(',');

test('placeGame: reordena na mesma categoria (antes e depois da referência)', () => {
    const games = [mk('a', 'c1'), mk('b', 'c1'), mk('x', 'c2'), mk('c', 'c1')];
    assert(placeGame(games, 'c', 'a', true, CAT('c1')), 'moveu');
    assertEq(games.map(g => g.id).join(','), 'c,a,b,x', 'c entrou na frente de a (e o jogo de outra categoria não foi chacoalhado para fora)');
    placeGame(games, 'a', 'b', false, CAT('c1'));
    assertEq(games.map(g => g.id).join(','), 'c,b,a,x', 'a caiu depois de b');
});

test('placeGame: posiciona no array pela referência (a troca de categoria é do applyDrop)', () => {
    const games = [mk('a', 'c1'), mk('b', 'c1'), mk('y', 'c2'), mk('z', 'c2')];
    placeGame(games, 'a', 'z', false, CAT('c2'));
    assertEq(games.map(g => g.id).join(','), 'b,y,z,a', 'a caiu depois de z (referência da c2)');
    assertEq(games.find(g => g.id === 'a').catId, 'c1', 'o placeGame NÃO mexe no catId (isso é do applyDrop)');
});

test('placeGame: sem referência vai para o FIM da seção (não do array)', () => {
    const games = [mk('a', 'c1'), mk('b', 'c1'), mk('x', 'c9'), mk('c', 'c1')];
    placeGame(games, 'a', null, true, CAT('c1'));
    assertEq(ordemDe(games, 'c1'), 'b,c,a', 'a foi para o fim da prateleira c1');
    // o fim do HERO é o último jogo JOGANDO; o dos contínuos, o último contínuo
    const games2 = [mk('p1', 'c1', { state: 'playing' }), mk('z', 'c9'), mk('p2', 'c1', { state: 'playing' }), mk('back', 'c1')];
    placeGame(games2, 'p1', null, true, HERO);
    assertEq(games2.filter(g => g.state === 'playing').map(g => g.id).join(','), 'p2,p1', 'p1 foi para o fim do hero');
    const games3 = [mk('k1', 'c1', { continuous: true }), mk('z', 'c9'), mk('k2', 'c1', { continuous: true })];
    placeGame(games3, 'k1', null, true, CONT);
    assertEq(games3.filter(g => g.continuous).map(g => g.id).join(','), 'k2,k1', 'k1 foi para o fim dos contínuos');
});

test('placeGame: seção alvo vazia recebe o jogo no fim do array', () => {
    const games = [mk('a', 'c1'), mk('x', 'c9')];
    placeGame(games, 'a', null, true, CAT('c2'));
    assertEq(games.map(g => g.id).join(','), 'x,a', 'sem irmãos, entra no fim do array');
    // (o catId novo é aplicado pelo applyDrop — o placeGame só posiciona)
});

test('placeGame: jogando/zerado da categoria NÃO conta como irmão do fim', () => {
    // a prateleira da Fila só mostra backlog: o fim dela é o último backlog,
    // mesmo que um jogo zerado da categoria venha depois no array
    const games = [mk('b', 'c1'), mk('done', 'c1', { state: 'finished' }), mk('c', 'c1')];
    placeGame(games, 'b', null, true, CAT('c1'));
    assertEq(ordemDe(games, 'c1'), 'c,b', 'b caiu depois do último backlog da c1');
});

test('applyDrop: arrastar dentro da mesma seção volta a ordenação para MANUAL', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }, { id: 'c2', name: 'Retro' }];
    appData.settings.sort = 'az';
    appData.games = [mk('a', 'c1'), mk('b', 'c1')];
    const res = applyDrop('a', 'b', false, CAT('c1'));
    assert(res && res.flipped && !res.statusChanged, 'só reordenou — e pediu ordem manual');
    assertEq(appData.settings.sort, 'manual', 'settings.sort virou manual');
    assertEq(appData.games.map(g => g.id).join(','), 'b,a', 'posição aplicada');
    // o hero segue a MESMA ordenação da Fila: reordenar lá também pede manual
    appData.settings.sort = 'az';
    appData.games = [mk('p1', 'c1', { state: 'playing' }), mk('p2', 'c1', { state: 'playing' })];
    const res2 = applyDrop('p1', 'p2', false, HERO);
    assert(res2 && res2.flipped, 'reordenar no hero também volta pro manual');
    assertEq(appData.settings.sort, 'manual', 'de novo manual');
});

test('applyDrop: contínuos se ordenam por HORAS — reordenar lá não mexe na ordenação', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }];
    appData.settings.sort = 'az';
    appData.games = [mk('k1', 'c1', { continuous: true }), mk('k2', 'c1', { continuous: true })];
    const res = applyDrop('k1', 'k2', false, CONT);
    assert(res && !res.flipped && !res.statusChanged, 'mesma seção, nada de ordenação manual');
    assertEq(appData.settings.sort, 'az', 'a ordenação da Fila segue intacta');
});

test('applyDrop: mudar de categoria preserva a ordenação escolhida', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }, { id: 'c2', name: 'Retro' }];
    appData.settings.sort = 'az';
    appData.games = [mk('a', 'c1'), mk('b', 'c2')];
    const res = applyDrop('a', 'b', true, CAT('c2'));
    assert(res && res.catChanged && !res.flipped, 'trocou de categoria sem tocar na ordenação');
    assertEq(appData.settings.sort, 'az', 'a ordenação da Fila continua a mesma');
    assertEq(appData.games.find(g => g.id === 'a').catId, 'c2', 'jogo na categoria nova');
});

test('applyDrop: arrastar pro HERO marca como JOGANDO (status troca sozinho)', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }];
    appData.settings.sort = 'manual';
    appData.games = [mk('back', 'c1'), mk('p1', 'c1', { state: 'playing' })];
    const res = applyDrop('back', 'p1', true, HERO);
    assert(res && res.statusChanged && !res.wasPlaying, 'backlog virou jogando');
    const g = appData.games.find(x => x.id === 'back');
    assertEq(g.state, 'playing', 'estado playing');
    assertEq(hero(), 'back,p1', 'entrou no hero antes da referência');
    assertEq(fila(), '', 'e saiu da prateleira');
    // contínuo arrastado pro hero vira jogando (sai dos contínuos)
    appData.games.push(mk('k1', 'c1', { continuous: true }));
    const res2 = applyDrop('k1', null, true, HERO);
    assert(res2 && res2.statusChanged && res2.wasContinuous, 'contínuo também pode virar jogando');
    assertEq(appData.games.find(x => x.id === 'k1').continuous, false, 'e não é mais contínuo');
});

test('applyDrop: arrastar pros CONTÍNUOS vira jogo contínuo', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }];
    appData.settings.sort = 'manual';
    appData.games = [mk('back', 'c1'), mk('k1', 'c1', { continuous: true }), mk('p1', 'c1', { state: 'playing' })];
    const res = applyDrop('back', 'k1', true, CONT);
    assert(res && res.statusChanged && !res.wasContinuous && !res.wasPlaying, 'backlog virou contínuo');
    const g = appData.games.find(x => x.id === 'back');
    assertEq(g.continuous, true, 'flag contínua');
    assertEq(g.state, null, 'sem estado');
    assertEq(conts(), 'back,k1', 'na seção dos contínuos, antes da referência');
    // jogando -> contínuo também funciona
    const res2 = applyDrop('p1', null, true, CONT);
    assert(res2 && res2.statusChanged && res2.wasPlaying, 'jogando virou contínuo');
    assertEq(appData.games.find(x => x.id === 'p1').state, null, 'não está mais jogando');
});

test('applyDrop: arrastar do hero/contínuos pra prateleira devolve o jogo à FILA', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }, { id: 'c2', name: 'Retro' }];
    appData.settings.sort = 'manual';
    appData.games = [mk('p1', 'c1', { state: 'playing' }), mk('k1', 'c2', { continuous: true }), mk('b1', 'c2')];
    const res = applyDrop('p1', 'b1', true, CAT('c2'));
    assert(res && res.statusChanged && res.wasPlaying && res.catChanged, 'jogando voltou pra fila em outra categoria');
    const g = appData.games.find(x => x.id === 'p1');
    assertEq(g.state, null, 'sem estado');
    assertEq(g.catId, 'c2', 'na categoria alvo');
    assertEq(hero(), '', 'hero vazio');
    const res2 = applyDrop('k1', 'b1', false, CAT('c2'));
    assert(res2 && res2.statusChanged && res2.wasContinuous, 'contínuo saiu dos contínuos');
    assertEq(appData.games.find(x => x.id === 'k1').continuous, false, 'sem a flag contínua');
    assertEq(ordemDe(appData.games, 'c2'), 'p1,b1,k1', 'os dois na prateleira da c2');
});

test('applyDrop: alvo inválido é recusado (nada acontece)', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }];
    appData.settings.sort = 'manual';
    appData.games = [mk('a', 'c1'), mk('b', 'c1')];
    assertEq(applyDrop('a', 'b', false, null), null, 'sem alvo não move');
    assertEq(applyDrop('a', 'b', false, { kind: 'cat', id: 'inexistente' }), null, 'categoria que não existe é recusada');
    assertEq(applyDrop('nao-existe', 'b', false, CAT('c1')), null, 'jogo que não existe não explode');
    assertEq(appData.games.map(g => g.id).join(','), 'a,b', 'array intacto');
});

test('applyDrop: arrastar na WISHLIST reordena e pede ordem MANUAL', () => {
    appData.categories = [];
    appData.settings.sort = 'manual';
    appData.settings.wishSort = 'release';
    appData.wishlist = [
        { id: 'w1', title: 'Futuro A', released: '2099-01-01' },
        { id: 'w3', title: 'Futuro C', released: '2099-06-01' },
    ];
    const res = applyDrop('w3', 'w1', true, { kind: 'wish', id: 'soon' });
    assert(res && res.flipped && res.wish && !res.statusChanged, 'reordenou a wishlist e virou manual');
    assertEq(appData.settings.wishSort, 'manual', 'wishSort virou manual');
    assertEq(appData.settings.sort, 'manual', 'a ordenação da FILA nem foi tocada');
    assertEq(appData.wishlist.map(w => w.id).join(','), 'w3,w1', 'posição aplicada no ARRAY da wishlist (não no de jogos)');
    assertEq(appData.games.length, 0, 'e os jogos da biblioteca continuam lá');
});

test('applyDrop: cruzar "Em breve" ↔ "Já lançados" é recusado (a data manda)', () => {
    appData.categories = [];
    appData.settings.wishSort = 'manual';
    appData.wishlist = [
        { id: 'w1', title: 'Futuro A', released: '2099-01-01' },
        { id: 'w2', title: 'Lançado B', released: '2020-01-01' },
    ];
    assertEq(applyDrop('w1', 'w2', true, { kind: 'wish', id: 'out' }), null, 'futuro não entra em "Já lançados"');
    assertEq(applyDrop('w2', 'w1', true, { kind: 'wish', id: 'soon' }), null, 'e lançado não volta para "Em breve"');
    assertEq(appData.wishlist.map(w => w.id).join(','), 'w1,w2', 'nada foi mexido');
});

test('placeGame: fim da seção da wishlist conta só os desejos DELA', () => {
    const wishes = [
        { id: 's1', released: '2099-01-01' },
        { id: 'out1', released: '2020-01-01' },
        { id: 's2', released: '2099-02-01' },
    ];
    placeGame(wishes, 's1', null, true, { kind: 'wish', id: 'soon' });
    // o fim de "Em breve" é o último futuro — o lançado no meio não conta
    assertEq(wishes.map(w => w.id).join(','), 'out1,s2,s1', 's1 caiu depois do último "Em breve"');
});

test('Prateleira: o cartucho leva o id do jogo (o arrasto lê dele)', async () => {
    const { createShelfItem } = await import('../js/ui.js');
    const li = createShelfItem({ id: 'drag1', title: 'Jogo Arrastável', platform: 'PC', state: 'playing', catId: 'c1' });
    assertEq(li.dataset.id, 'drag1', 'dataset.id com o id do jogo para o dragdrop');
});
