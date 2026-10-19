// Testes da tela de Franquias (js/franchises.js): a caixa de capa grande com a
// % de jogos zerados da franquia NA CAPA — o mesmo desenho do hero
// "Jogando Atualmente" (shelf-prog com a legenda na própria barra).
import { test, assert, assertEq, elById } from './shim.mjs';
import { appData } from '../js/store.js';
import { renderFranchiseStats } from '../js/franchises.js';

const boxHtml = () => elById('franchise-stats').innerHTML;

function seed() {
    appData.games = [
        { id: 'z1', title: 'Zelda I', franchise: 'Zelda', state: 'finished', platform: 'NES', released: '1987-02-21', image: 'data:image/jpeg;base64,Z1', catId: 'c1' },
        { id: 'z2', title: 'Zelda II', franchise: 'Zelda', state: 'finished', platform: 'NES', released: '1988-01-14', image: 'data:image/jpeg;base64,Z2', catId: 'c1' },
        { id: 'z3', title: 'Zelda III', franchise: 'Zelda', state: 'playing', platform: 'SNES', released: '1991-11-21', image: 'data:image/jpeg;base64,Z3', catId: 'c1' }
    ];
    appData.wishlist = [{ id: 'w1', title: 'Zelda IV', franchise: 'Zelda', platform: 'N64' }];
}

test('Franquias: caixa de capa GRANDE com a % de zerados na base (como no hero)', () => {
    seed();
    renderFranchiseStats();
    const h = boxHtml();
    assert(h.includes('fr-box'), 'a caixa de capa existe');
    assert(h.includes('shelf-prog'), 'a barra de progresso do hero está na caixa');
    assert(h.includes('width:50%'), 'preenchimento de 50% (2 zerados de 4 jogos, contando a wishlist)');
    assert(h.includes('<b>50%</b>'), 'legenda com a porcentagem escrita na própria barra');
    assert(h.includes('data:image/jpeg;base64,Z1'), 'capa do jogo mais antigo (1987) na caixa');
    assert(h.includes('2/4 zerados · 50%'), 'contagem de zerados ao lado da caixa');
    assert(!h.includes('class="gi-bar"'), 'a barrinha fina de baixo saiu (a barra agora mora na capa)');
});

test('Franquias: completa ganha o done dourado na capa e o selo Completa', () => {
    seed();
    // 3 zerados + 1 na wishlist: NÃO está completa (a wishlist conta no total)
    appData.games = appData.games.map(g => ({ ...g, state: 'finished' }));
    renderFranchiseStats();
    assert(!boxHtml().includes('shelf-prog done'), 'com jogo na wishlist a barra segue na cor do tema');
    // sem wishlist: 3 de 3 zerados → franquia completa
    appData.wishlist = [];
    renderFranchiseStats();
    const h = boxHtml();
    assert(h.includes('shelf-prog done'), 'franquia completa: barra DOURADA na capa');
    assert(h.includes('fr-item complete'), 'e o card com o destaque de completa');
    assert(h.includes('<b>100%</b>'), 'legenda de 100%');
    assert(h.includes('Completa</span>'), 'selo Completa ao lado do nome');
});

test('Franquias: sem capa nenhuma a caixa mostra o ícone e a barra mesmo assim', () => {
    appData.games = [{ id: 's1', title: 'Jogo Sem Capa', franchise: 'Misterio', state: 'playing', platform: 'PC', catId: 'c1' }];
    appData.wishlist = [];
    renderFranchiseStats();
    const h = boxHtml();
    assert(h.includes('fr-box-empty'), 'caixa com o placeholder de ícone');
    assert(h.includes('width:0%') && h.includes('<b>0%</b>'), 'e a barra com 0% (nada zerado ainda)');
    assert(h.includes('data-act="toggle"'), 'e o card continua abrindo a sanfona');
});
