// Testes da aba Desejos reformulada (js/wishview.js): as duas telas (Wish list e
// Lançamentos), a grade paginada dos lançamentos e a entrada deles na lista.
import { test, assert, assertEq, elById, mockFetch, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { initGameMatch, exploreById } from '../js/gamematch.js';
import {
    wishSub, wishSubShow, syncWishView, wishReleasesLoad, wishReleasesMore, wishReleasesAdd, wishReleasesState, initWishView
} from '../js/wishview.js';
import { renderWishlist } from '../js/ui.js';

initWishView({ toast: () => {} });   // silencia os avisos (o app injeta o toast de verdade no main.js)
initGameMatch({ toast: () => {} });  // idem para o aviso do gmExploreWish (usado pelo cartão)

// Datas relativas a hoje: a tela só aceita lançamentos de hoje até 3 anos à frente
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const YEAR = new Date().getFullYear();
const RAW = (id, name, released, extra = {}) => ({
    id, name, released, added: 100,
    background_image: `https://media.rawg.io/media/games/${id}/${id}.jpg`,
    genres: [{ name: 'Adventure' }], platforms: [], tags: [], ...extra
});

// Zera o estado da grade entre um teste e outro (o módulo é carregado uma vez só)
function resetReleases() {
    const st = wishReleasesState();
    st.page = 0; st.items = []; st.more = true; st.loaded = false; st.busy = false; st.error = '';
    document.getElementById('wish-releases-grid').innerHTML = '';
    appData.settings.wishSub = 'list';
}

const grid = () => elById('wish-releases-grid');

test('Desejos: o submenu alterna entre Wish list e Lançamentos e lembra a escolha', async () => {
    resetReleases();
    mockFetch([['/api/games?', { count: 0, results: [], next: null }]]);
    const tab = document.getElementById('tab-wish');
    tab.classList.add('active');   // a aba está aberta (é o que o switchTab faz)
    wishSubShow('list');
    assertEq(wishSub(), 'list', 'padrão: a lista');
    assert(elById('wish-pane-list').classList.contains('active'), 'a lista começa visível');
    assert(!elById('wish-pane-releases').classList.contains('active'), 'os lançamentos começam escondidos');
    assert(elById('wish-sub-list').classList.contains('active'), 'botão "Wish list" marcado');
    assertEq(elById('wish-sub-list')['aria-selected'], 'true', 'botão marcado para leitores de tela');
    assert(!document.body.classList.contains('wish-rel-tab'), 'na lista, a busca do topo continua à vista');

    wishSubShow('releases');
    await sleep(10);   // deixa a busca (mockada) terminar dentro do teste
    assertEq(wishSub(), 'releases', 'a tela escolhida fica salva nas preferências');
    assertEq(appData.settings.wishSub, 'releases', 'gravada em settings.wishSub');
    assert(elById('wish-pane-releases').classList.contains('active'), 'lançamentos na frente');
    assert(!elById('wish-pane-list').classList.contains('active'), 'a lista sai de cena (as telas não se misturam)');
    assert(elById('wish-sub-releases').classList.contains('active'), 'botão "Lançamentos" marcado');
    assertEq(elById('wish-sub-list')['aria-selected'], 'false', 'o outro botão fica desmarcado');
    assert(document.body.classList.contains('wish-rel-tab'), 'lançamentos não usam a busca/filtros do topo (somem)');

    wishSubShow('list');
    assert(elById('wish-pane-list').classList.contains('active'), 'volta para a lista');
    assertEq(wishSub(), 'list', 'e a escolha volta a ser a lista');
    assert(!document.body.classList.contains('wish-rel-tab'), 'a busca do topo volta com a lista');
});

test('Desejos: ao abrir a aba a tela salva é restaurada (e só busca se a aba estiver aberta)', async () => {
    resetReleases();
    mockFetch([['/api/games?', { count: 0, results: [], next: null }]]);
    appData.settings.wishSub = 'releases';
    const tab = document.getElementById('tab-wish');
    tab.classList.add('active');
    syncWishView();
    await sleep(10);
    assert(elById('wish-pane-releases').classList.contains('active'), 'a tela dos lançamentos volta ao abrir a aba');
    assert(wishReleasesState().loaded, 'e ela busca a grade');

    // Fora da aba, nada de gastar requisição da RAWG
    resetReleases();
    appData.settings.wishSub = 'releases';
    tab.classList.remove('active');
    syncWishView();
    await sleep(10);
    assertEq(wishReleasesState().loaded, false, 'aba fechada: nem tenta buscar');
    assertEq(wishReleasesState().page, 0, 'nenhuma página pedida');
});

test('Lançamentos: grade com os mais esperados primeiro, só o que ainda vai lançar', async () => {
    resetReleases();
    let seen = '';
    mockFetch([['/api/games?', u => {
        seen = u;
        return {
            count: 6, next: 'https://api.rawg.io/api/games?page=2',
            results: [
                RAW(1, 'GTA VI', inDays(40), { added: 9000 }),
                RAW(2, 'Jogo Sem Capa', inDays(10), { background_image: null }),
                RAW(3, 'Jogo Adulto', inDays(20), { tags: [{ name: 'hentai' }] }),
                RAW(4, 'Jogo de 2039', `${YEAR + 13}-05-01`),
                RAW(6, 'Prince of Persia Remake', inDays(90), { added: 4000 })
            ]
        };
    }]]);
    await wishReleasesLoad(true);
    const html = grid().innerHTML;
    assert(html.includes('GTA VI'), 'o mais esperado aparece');
    assert(html.includes('Prince of Persia Remake'), 'o segundo também (remakes do hype entram)');
    assert(!html.includes('Jogo Sem Capa'), 'sem capa não entra na vitrine');
    assert(!html.includes('Jogo Adulto'), 'conteúdo adulto continua bloqueado');
    assert(!html.includes('Jogo de 2039'), 'fora da janela de 3 anos não entra');
    // a consulta é a MESMA dos Lançamentos do Explorar: hype primeiro, 40 por página
    const query = decodeURIComponent(seen);
    assert(seen.includes('ordering=-added'), 'os mais esperados primeiro (hype da RAWG)');
    assert(seen.includes('page_size=40'), 'página cheia de lançamentos');
    assert(/dates=\d{4}-\d{2}-\d{2},\d{4}-12-31/.test(query), 'a janela tem começo e fim');
    assert(query.includes(`${YEAR + 3}-12-31`), 'vai de hoje até 3 anos à frente');
    assert(html.includes('wishReleasesMore()'), 'tem o botão de carregar mais');
    // o cartão mostra a contagem regressiva e a % de combinação
    assert(html.includes('wish-rel-when'), 'data em destaque no cartão');
    assert(html.includes('gm-match'), 'a % de combinação continua no cartão');
});

test('Lançamentos: "carregar mais" emenda a próxima página e some no fim da lista', async () => {
    resetReleases();
    mockFetch([['/api/games?', u => (u.includes('page=2')
        ? { count: 2, next: null, results: [RAW(11, 'Lançamento do Segundo Lote', inDays(120))] }
        : { count: 2, next: 'https://api.rawg.io/api/games?page=2', results: [RAW(10, 'GTA VI', inDays(40))] })]]);
    await wishReleasesLoad(true);
    assert(grid().innerHTML.includes('GTA VI'), 'primeira página pintada');
    assertEq(wishReleasesState().page, 1, 'começa na página 1');
    await wishReleasesMore();
    assert(grid().innerHTML.includes('Lançamento do Segundo Lote'), 'a segunda página entra na mesma grade');
    assertEq(wishReleasesState().page, 2, 'página avançou');
    assert(!grid().innerHTML.includes('wishReleasesMore()'), 'sem próxima página, o botão some');
    assert(grid().innerHTML.includes('gm-note'), 'e a tela avisa que chegou ao fim');
});

test('Lançamentos: falha de rede mostra o erro e um botão de tentar de novo', async () => {
    resetReleases();
    mockFetch([['/api/games?', () => { throw new Error('sem rede'); }]]);
    await wishReleasesLoad(true);
    assert(grid().innerHTML.includes('Tentar de novo'), 'botão de tentar de novo');
    assert(grid().innerHTML.includes('wishReleasesLoad(true)'), 'o botão refaz a busca');
    assert(grid().innerHTML.includes('gm-empty'), 'mensagem de erro (não fica "Carregando..." para sempre)');
});

test('Lançamentos: catálogo sem nada para mostrar não deixa a tela em branco', async () => {
    resetReleases();
    mockFetch([['/api/games?', { count: 0, results: [], next: null }]]);
    await wishReleasesLoad(true);
    assert(grid().innerHTML.includes('Nenhum lançamento para mostrar agora'), 'mensagem de vazio');
    assert(grid().innerHTML.includes('Tentar de novo'), 'e a saída para tentar de novo');
});

test('Lançamentos: o cartão manda o jogo para a Wish list já com o aviso de lançamento', async () => {
    resetReleases();
    const ID = 9001;
    mockFetch([['/api/games?', { count: 1, next: null, results: [RAW(ID, 'Desejo dos Lançamentos', inDays(30))] }]]);
    await wishReleasesLoad(true);
    // a capa vertical já pronta evita a busca de capa em segundo plano no teste
    exploreById.get(ID)._vcover = 'data:image/jpeg;base64,VERTICAL9001';
    assert(!grid().innerHTML.includes('Na wish list'), 'antes de adicionar, o cartão oferece o botão');

    wishReleasesAdd(ID);
    const w = appData.wishlist.find(x => x.title === 'Desejo dos Lançamentos');
    assert(w, 'o jogo entrou na wish list pelo cartão dos lançamentos');
    assertEq(w.notifyRelease, true, 'é um lançamento: já entra com o aviso ligado');
    assertEq(w.note, 'Descoberto nos lançamentos', 'a nota diz de onde veio');
    assert(grid().innerHTML.includes('Na wish list'), 'o cartão vira "Na wish list" na hora');

    wishReleasesAdd(ID);   // clicar de novo não pode duplicar
    assertEq(appData.wishlist.filter(x => x.title === 'Desejo dos Lançamentos').length, 1, 'sem duplicata');
});

test('Wish list: o resumo do topo é um painel com números e o próximo lançamento', () => {
    appData.wishlist = [
        { id: 'w1', title: 'Primeiro da Fila', platform: 'PC', genres: [], image: null, released: inDays(10) },
        { id: 'w2', title: 'Segundo da Fila', platform: 'PC', genres: [], image: null, released: inDays(30), notifyRelease: true },
        { id: 'w3', title: 'Já Lançado', platform: 'PC', genres: [], image: null, released: '2020-05-05' },
    ];
    renderWishlist();
    const sum = elById('wish-summary').innerHTML;
    assert(sum.includes('wish-sum'), 'resumo em painel (classe própria), não texto solto');
    assert(sum.includes('wish-stat'), 'números em blocos');
    assert(sum.includes('<strong>3</strong>'), 'conta os jogos da lista (3)');
    assert(sum.includes('jogos na lista'), 'rótulo do total');
    assert(sum.includes('lançamentos futuros'), 'rótulo dos lançamentos futuros');
    assert(sum.includes('Próximo: <strong>Primeiro da Fila</strong>'), 'aponta o próximo lançamento');
    assert(sum.includes('Lança em'), 'com a contagem regressiva');
    assertEq(String(elById('count-wish').innerText), '3', 'contador da aba também é atualizado');
});

test('Wish list vazia: a mensagem ensina as duas telas em vez de deixar um texto solto', () => {
    appData.wishlist = [];
    renderWishlist();
    const box = elById('wish-list-container').innerHTML;
    assert(box.includes('+ Desejo'), 'aponta o botão de cadastrar');
    assert(box.includes('Lançamentos'), 'e a outra tela da aba');
    assertEq(elById('wish-summary').innerHTML, '', 'sem jogos, nenhum resumo sobrando no topo');
});
