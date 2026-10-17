// Testes da aba Desejos reformulada (js/wishview.js): as duas telas (Wish list e
// Lançamentos), a grade paginada dos lançamentos e a entrada deles na lista.
import { test, assert, assertEq, elById, mockFetch, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { initGameMatch, exploreById, releaseWindow } from '../js/gamematch.js';
import {
    wishSub, wishSubShow, syncWishView, wishReleasesLoad, wishReleasesMore, wishReleasesAdd, wishReleasesState, initWishView,
    wishFilterToggle, wishSortToggle, wishFilterGenre, wishFilterPlat, wishFilterClear, wishSort,
    wishFiltersState, wishSortState
} from '../js/wishview.js';
import { gmXFilterGenre, gmXFilterClear } from '../js/gamematch.js';
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

test('Lançamentos: grade com os mais esperados primeiro, dentro da janela (últimos meses até +3)', async () => {
    resetReleases();
    let seen = '';
    const w = releaseWindow();
    mockFetch([['/api/games?', u => {
        seen = u;
        return {
            count: 7, next: 'https://api.rawg.io/api/games?page=2',
            results: [
                RAW(1, 'GTA VI', inDays(40), { added: 9000 }),
                RAW(2, 'Jogo Sem Capa', inDays(10), { background_image: null }),
                RAW(3, 'Jogo Adulto', inDays(20), { tags: [{ name: 'hentai' }] }),
                RAW(4, 'Jogo de 2039', `${YEAR + 13}-05-01`),
                RAW(6, 'Prince of Persia Remake', inDays(90), { added: 4000 }),
                RAW(7, 'Saiu Mês Passado', inDays(-45), { added: 3000 }),
                RAW(8, 'Jogo Antigo', `${YEAR - 1}-06-01`, { added: 2000 })
            ]
        };
    }]]);
    await wishReleasesLoad(true);
    const html = grid().innerHTML;
    assert(html.includes('GTA VI'), 'o mais esperado aparece');
    assert(html.includes('Prince of Persia Remake'), 'o segundo também (remakes do hype entram)');
    assert(html.includes('Saiu Mês Passado'), 'o que saiu há poucos meses entra (a RAWG quase não tem data futura)');
    assert(!html.includes('Jogo Antigo'), 'mais velho que a janela fica de fora');
    assert(!html.includes('Jogo Sem Capa'), 'sem capa não entra na vitrine');
    assert(!html.includes('Jogo Adulto'), 'conteúdo adulto continua bloqueado');
    assert(!html.includes('Jogo de 2039'), 'fora da janela de 3 anos à frente não entra');
    // a consulta é a MESMA dos Lançamentos do Explorar: hype primeiro, 40 por página
    const query = decodeURIComponent(seen);
    assert(seen.includes('ordering=-added'), 'os mais esperados primeiro (hype da RAWG)');
    assert(seen.includes('page_size=40'), 'página cheia de lançamentos');
    assert(query.includes(`dates=${w.from},${w.to}`), 'janela: últimos meses até 3 anos à frente');
    assert(html.includes('wishReleasesMore()'), 'tem o botão de carregar mais');
    // o cartão mostra a contagem regressiva (ou "lançado há...") e a % de combinação
    assert(html.includes('wish-rel-when'), 'data em destaque no cartão');
    assert(html.includes('Lançado há'), 'o jogo recente mostra há quanto tempo saiu');
    assert(html.includes('gm-match'), 'a % de combinação continua no cartão');
});

test('Lançamentos: filtro de plataforma com lista longa continua paginando (bug do "só 5")', async () => {
    resetReleases();
    clearWishKeys();
    const urls = [];
    mockFetch([['/api/games?', u => {
        urls.push(decodeURIComponent(u));
        const page = +(u.match(/[?&]page=(\d+)/) || [0, 1])[1];
        const hasNext = page < 3;
        return {
            count: 128, next: hasNext ? `https://api.rawg.io/api/games?page=${page + 1}` : null,
            results: [RAW(100 + page, `Jogo de Switch ${page}`, inDays(30 + page), { platforms: [{ platform: { name: 'Nintendo Switch' } }] })]
        };
    }]]);
    wishFilterPlat('Nintendo Switch');
    await sleep(10);
    assert(urls[0] && urls[0].includes('platforms=7'), 'a plataforma vai na consulta (Switch = 7 na RAWG)');
    assert(urls[0].includes(`dates=${releaseWindow().from}`), 'e a janela é a mesma (últimos meses + futuro)');
    assert(grid().innerHTML.includes('wishReleasesMore()'), 'com 128 jogos o "carregar mais" aparece');
    await wishReleasesMore();
    await wishReleasesMore();
    assertEq(wishReleasesState().page, 3, 'chegou à 3ª página (o filtro não morre na 1ª)');
    assert(grid().innerHTML.includes('Jogo de Switch 1') && grid().innerHTML.includes('Jogo de Switch 3'), 'as páginas emendaram na grade');
    assert(!grid().innerHTML.includes('wishReleasesMore()'), 'sem 4ª página, o botão some no fim');
    clearWishKeys();
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

// ---------- Lançamentos: os filtros e ordenações do Explorar, aqui dentro ----------
const clearWishKeys = () => Object.assign(wishFiltersState(), { genre: '', plat: '', devId: 0, devName: '', pubId: 0, pubName: '' });

test('Lançamentos: filtros e ordenações do Explorar, com estado próprio', async () => {
    resetReleases();
    clearWishKeys();
    const urls = [];
    mockFetch([['/api/games?', u => {
        urls.push(decodeURIComponent(u));
        return { count: 3, next: null, results: [
            RAW(21, 'Zelda do Futuro', inDays(30), { added: 500, metacritic: 90 }),
            RAW(22, 'Astro Lançamento', inDays(60), { added: 900, metacritic: 95, platforms: [{ platform: { name: 'PlayStation 5' } }] }),
            RAW(23, 'Minecraft 2', inDays(90), { added: 7000, metacritic: 80 }),
        ] };
    }]]);
    await wishReleasesLoad(true);   // ordem do servidor: Zelda, Astro, Minecraft (hype)

    // os dois painéis são os mesmos do Explorar (gênero/estilo, plataforma, estúdio, publicadora)
    wishFilterToggle();
    assertEq(elById('wish-x-filter-panel').hidden, false, 'o botão Filtros abre o painel');
    assert(elById('wish-x-genre').innerHTML.includes('RPG'), 'select de gênero com a lista do Explorar');
    assert(elById('wish-x-genre').innerHTML.includes('Metroidvania'), 'inclusive os estilos (Steam)');
    assert(elById('wish-x-plat').innerHTML.includes('Nintendo Switch'), 'select de plataforma do Explorar');
    wishSortToggle();
    assertEq(elById('wish-x-sort-panel').hidden, false, 'o botão Ordenar abre o painel');
    assertEq(elById('wish-x-filter-panel').hidden, true, 'abrir um fecha o outro');
    const sp = elById('wish-x-sort-panel').innerHTML;
    for (const label of ['Padrão', 'A → Z', 'Z → A', 'Melhor nota', 'Mais hypados', 'Mais recentes', 'Mais antigos'])
        assert(sp.includes(label), `opção "${label}" importada do Explorar`);
    assert(sp.includes("wishSort('az')"), 'as opções chamam a ordenação desta tela');
    assert(sp.includes('gm-x-panel-head'), 'painel com cabeçalho, como no Explorar');

    // ordenar é no cliente: muda a ordem e NÃO gasta requisição
    const pos = t => grid().innerHTML.indexOf(t);
    const before = urls.length;
    wishSort('az');
    assert(pos('Astro Lançamento') < pos('Minecraft 2') && pos('Minecraft 2') < pos('Zelda do Futuro'), 'A-Z reordena a grade');
    assertEq(urls.length, before, 'ordenar não refaz a busca');
    assertEq(elById('wish-sort-label').textContent, 'A → Z', 'o botão mostra a ordem ativa');
    assert(elById('wish-sort-btn').classList.contains('on'), 'e fica marcado (como no Explorar)');
    wishSort('added');
    assert(pos('Minecraft 2') < pos('Astro Lançamento'), 'mais hypados primeiro');
    wishSort('');
    assert(pos('Zelda do Futuro') < pos('Astro Lançamento'), 'padrão volta à ordem da categoria');
    assertEq(elById('wish-sort-label').textContent, 'Ordenar', 'e o rótulo volta ao neutro');

    // filtrar é consulta ao servidor: o filtro vai na URL e volta para a 1ª página
    wishFilterGenre('Aventura');
    await sleep(10);
    assert(urls[urls.length - 1].includes('genres=adventure'), 'gênero vai como parâmetro da busca (servidor)');
    assert(elById('wish-filter-chips').innerHTML.includes('Gênero: Aventura'), 'chip do filtro ativo');
    assertEq(elById('wish-filter-badge').textContent, '1', 'badge com 1 filtro');
    assertEq(elById('wish-filter-badge').hidden, false, 'badge visível');
    wishFilterPlat('PC');
    await sleep(10);
    assert(urls[urls.length - 1].includes('platforms=4'), 'plataforma vai como parâmetro da busca');
    assert(!grid().innerHTML.includes('Astro Lançamento'), 'o corte local deixa só o que é PC');
    assertEq(elById('wish-filter-badge').textContent, '2', 'dois filtros ativos');
    wishFilterClear();
    await sleep(20);
    assertEq(elById('wish-filter-badge').hidden, true, 'badge some ao limpar');
    assertEq(wishFiltersState().genre, '', 'gênero limpo');
    assertEq(wishSortState(), '', 'ordenação no padrão');
    assert(grid().innerHTML.includes('Astro Lançamento'), 'a grade volta completa');
});

test('Lançamentos: filtrar aqui não mexe nos filtros do Explorar', async () => {
    resetReleases();
    clearWishKeys();
    mockFetch([['/api/games?', { count: 0, results: [], next: null }]]);
    gmXFilterGenre('RPG');   // filtro ativo no Explorar
    assert(elById('gm-filter-chips').innerHTML.includes('Gênero: RPG'), 'o Explorar marca o filtro dele');
    wishFilterGenre('Aventura');
    await sleep(20);
    assert(elById('gm-filter-chips').innerHTML.includes('Gênero: RPG'), 'o Explorar continua como estava');
    assert(!elById('gm-filter-chips').innerHTML.includes('Aventura'), 'o filtro da wishlist não vaza para o Explorar');
    assert(elById('wish-filter-chips').innerHTML.includes('Aventura'), 'e o da wishlist fica na wishlist');
    clearWishKeys();          // devolve os dois lados ao padrão (sem disparar busca)
    gmXFilterClear();
    await sleep(10);
});

test('Lançamentos: filtro sem resultado explica e oferece limpar', async () => {
    resetReleases();
    clearWishKeys();
    wishSort('');
    mockFetch([['/api/games?', { count: 1, next: null, results: [
        RAW(31, 'Só Plataforma', inDays(20), { platforms: [{ platform: { name: 'Xbox One' } }] })
    ] }]]);
    await wishReleasesLoad(true);
    wishFilterPlat('PC');
    await sleep(10);
    assert(grid().innerHTML.includes('Nenhum lançamento com esses filtros'), 'avisa que o filtro cortou tudo');
    assert(grid().innerHTML.includes('wishFilterClear()'), 'e oferece limpar os filtros');
    assert(!grid().innerHTML.includes('wishReleasesLoad(true)'), 'sem convidar a "tentar de novo" (o catálogo respondeu)');
    wishFilterClear();
    await sleep(20);
    assert(grid().innerHTML.includes('Só Plataforma'), 'limpando, o lançamento volta');
});
