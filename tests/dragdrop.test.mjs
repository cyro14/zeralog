// Testes do arrastar-e-soltar da Fila (js/dragdrop.js): trocar de posição na
// categoria e de categoria/prateleira. O núcleo (placeGame/applyDrop) roda
// direto — a camada de ponteiro (mouse/toque) é fina em cima dele.
import { test, assert, assertEq } from './shim.mjs';
import { appData } from '../js/store.js';
import { placeGame, applyDrop } from '../js/dragdrop.js';

const mk = (id, cat, extra = {}) => Object.assign({ id, title: id, catId: cat, state: null, continuous: false }, extra);
const ordemDe = (games, cat) => games.filter(g => g.catId === cat && !g.state && !g.continuous).map(g => g.id).join(',');

test('placeGame: reordena na mesma categoria (antes e depois da referência)', () => {
    const games = [mk('a', 'c1'), mk('b', 'c1'), mk('x', 'c2'), mk('c', 'c1')];
    assertEq(placeGame(games, 'c', 'a', true, 'c1').catChanged, false, 'mesma categoria');
    assertEq(games.map(g => g.id).join(','), 'c,a,b,x', 'c entrou na frente de a (e o jogo de outra categoria não foi chacoalhado para fora)');
    placeGame(games, 'a', 'b', false, 'c1');
    assertEq(games.map(g => g.id).join(','), 'c,b,a,x', 'a caiu depois de b');
});

test('placeGame: muda de categoria e cai na posição da referência', () => {
    const games = [mk('a', 'c1'), mk('b', 'c1'), mk('y', 'c2'), mk('z', 'c2')];
    const res = placeGame(games, 'a', 'z', false, 'c2');
    assertEq(res.catChanged, true, 'trocou de categoria');
    assertEq(games.find(g => g.id === 'a').catId, 'c2', 'catId atualizado');
    assertEq(ordemDe(games, 'c2'), 'y,z,a', 'a entrou depois de z (fim da c2 na ordem visível)');
    assertEq(ordemDe(games, 'c1'), 'b', 'e a c1 ficou só com o jogo que sobrou');
});

test('placeGame: sem referência vai para o FIM da categoria alvo (não do array)', () => {
    const games = [mk('a', 'c1'), mk('b', 'c1'), mk('x', 'c9'), mk('c', 'c1')];
    placeGame(games, 'a', null, true, 'c1');
    assertEq(ordemDe(games, 'c1'), 'b,c,a', 'a foi para o fim da prateleira c1');
    assertEq(games.find(g => g.id === 'a').catId, 'c1', 'categoria intacta');
});

test('placeGame: categoria alvo vazia recebe o jogo no fim do array', () => {
    const games = [mk('a', 'c1'), mk('x', 'c9')];
    placeGame(games, 'a', null, true, 'c2');
    assertEq(games.map(g => g.id).join(','), 'x,a', 'sem irmãos, entra no fim do array');
    assertEq(games.find(g => g.id === 'a').catId, 'c2', 'e com o catId novo');
});

test('placeGame: jogando/zerado da categoria NÃO conta como irmão do fim', () => {
    // a prateleira da Fila só mostra backlog: o fim dela é o último backlog,
    // mesmo que um jogo zerado da categoria venha depois no array
    const games = [mk('b', 'c1'), mk('done', 'c1', { state: 'finished' }), mk('c', 'c1')];
    placeGame(games, 'b', null, true, 'c1');
    assertEq(ordemDe(games, 'c1'), 'c,b', 'b caiu depois do último backlog da c1');
});

test('applyDrop: arrastar dentro da categoria volta a ordenação para MANUAL', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }, { id: 'c2', name: 'Retro' }];
    appData.settings.sort = 'az';
    appData.games = [mk('a', 'c1'), mk('b', 'c1')];
    const res = applyDrop('a', 'b', false, 'c1');
    assert(res && res.flipped, 'arrastar pede ordem manual — e avisa');
    assertEq(appData.settings.sort, 'manual', 'settings.sort virou manual');
    assertEq(appData.games.map(g => g.id).join(','), 'b,a', 'posição aplicada');
});

test('applyDrop: mudar de categoria preserva a ordenação escolhida', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }, { id: 'c2', name: 'Retro' }];
    appData.settings.sort = 'az';
    appData.games = [mk('a', 'c1'), mk('b', 'c2')];
    const res = applyDrop('a', 'b', true, 'c2');
    assert(res && res.catChanged && !res.flipped, 'trocou de categoria sem tocar na ordenação');
    assertEq(appData.settings.sort, 'az', 'a ordenação da Fila continua a mesma');
    assertEq(appData.games.find(g => g.id === 'a').catId, 'c2', 'jogo na categoria nova');
});

test('applyDrop: hero e contínuos não são alvo (nada acontece)', () => {
    appData.categories = [{ id: 'c1', name: 'Backlog' }];
    appData.settings.sort = 'manual';
    appData.games = [mk('a', 'c1'), mk('b', 'c1')];
    assertEq(applyDrop('a', 'b', false, 'playing-category'), null, 'hero não recebe arrasto');
    assertEq(applyDrop('a', 'b', false, 'continuous-category'), null, 'contínuos não recebem');
    assertEq(applyDrop('a', 'b', false, null), null, 'sem alvo não move');
    assertEq(appData.games.map(g => g.id).join(','), 'a,b', 'array intacto');
});

test('Prateleira: o cartucho leva o id do jogo (o arrasto lê dele)', async () => {
    const { createShelfItem } = await import('../js/ui.js');
    const li = createShelfItem({ id: 'drag1', title: 'Jogo Arrastável', platform: 'PC', state: 'playing', catId: 'c1' });
    assertEq(li.dataset.id, 'drag1', 'dataset.id com o id do jogo para o dragdrop');
});
