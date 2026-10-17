// Testes da página do jogo (js/ui.js): banner "capa de Facebook", atalhos da
// capa/fundo, screenshots do usuário e extras da RAWG. Hermético: o fetch é
// mockado, nenhuma rede é necessária.
import { test, assert, assertEq, mockFetch, elById, created, sleep } from './shim.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appData } from '../js/store.js';
import { openGamePage } from '../js/ui.js';

const DETAILS = {
    id: 3328, name: 'The Witcher 3: Wild Hunt',
    description_raw: 'RPG de mundo abitermo.'.repeat(20),
    released: '2015-05-18', tba: false,
    background_image: 'https://media.rawg.io/media/games/618/game.jpg',
    background_image_additional: 'https://media.rawg.io/media/screenshots/3e4/arte-extra.jpg',
    genres: [{ id: 5, name: 'RPG' }, { id: 4, name: 'Action' }],
    metacritic: 92, playtime: 43,
    developers: [{ id: 9023, name: 'CD PROJEKT RED' }],
    publishers: [{ id: 7411, name: 'CD PROJEKT RED' }],
};
const SHOTS = { count: 3, results: [
    { id: 1, image: 'https://media.rawg.io/media/screenshots/1ac/s1.jpg' },
    { id: 2, image: 'https://media.rawg.io/media/screenshots/1ac/s2.jpg' },
    { id: 3, image: 'https://media.rawg.io/media/screenshots/1ac/s3.jpg' },
] };

function addGame(id, extra = {}) {
    const g = { id, title: `Jogo ${id}`, state: 'playing', platform: 'PC', genres: ['RPG'], catId: 'c1', rawgId: 3328, description: 'Descrição.', ...extra };
    appData.games.push(g);
    return g;
}
const lastPage = () => created[0];
const hydrate = () => sleep(30);   // fetch mockado resolve na hora

test('página do jogo abre sem erro e com a seção Sobre já expandida', async () => {
    addGame('g1');
    await openGamePage('g1', false);
    const page = lastPage();
    assert(page.innerHTML.includes('<details class="gp-sec" open>'), 'Sobre o jogo começa aberto');
    assert(page.innerHTML.includes('gp-banner'), 'container do fundo existe');
    assert(page.innerHTML.includes('gp-bg-file'), 'input de fundo existe');
});

test('hero "Jogando Atualmente": o fundo é a cor do tema, não a capa do jogo', async () => {
    appData.games.push({ id: 'hp1', title: 'Jogo Hero', platform: 'PC', state: 'playing', image: 'data:image/jpeg;base64,CAPAHERO', catId: 'c1' });
    const { render } = await import('../js/ui.js');
    // o render monta o DOM todo; o hero não deve carregar mais a capa do jogo
    try { render(); } catch (e) { /* DOM falso pode falhar em partes; o essencial é o hero */ }
    // o elemento é criado via createElement, não getElementById: procurar no created
    const playing = created.find(c => c.id === 'playing-category');
    assert(playing, 'seção Jogando Atualmente existe');
    const bg = playing.style.getPropertyValue('--hero-bg');
    assert(!bg, `o hero não deve usar a capa do jogo (variável --hero-bg veio: "${bg}")`);
    // o blur da cor do tema mora no CSS (#playing-category::before), não no JS
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'style.css'), 'utf8');
    assert(!css.includes('var(--hero-bg'), 'CSS não deveria mais ler --hero-bg');
    assert(css.includes('#playing-category::before'), 'o fundo do hero continua definido no CSS');
});

test('capa é um atalho para Trocar capa (gpDo openImageModal)', async () => {
    addGame('g2', { image: 'data:image/jpeg;base64,CAPA' });
    await openGamePage('g2', false);
    assert(lastPage().innerHTML.includes(`gpDo('openImageModal', 'g2')`), 'clique na capa abre a troca');
});

test('sem fundo próprio: a arte da RAWG vira a capa de Facebook', async () => {
    mockFetch([['/games/3328/screenshots', SHOTS], ['/games/3328?', DETAILS]]);
    addGame('g3');
    await openGamePage('g3', false);
    await hydrate();
    const banner = elById('gp-banner').innerHTML;
    assert(banner.includes('/media/resize/1280/-/screenshots/'), 'arte extra em alta resolução');
    assert(banner.includes('arte-extra.jpg'), 'usa a arte adicional da RAWG');
    const extra = elById('gp-extra').innerHTML;
    assert(extra.includes('Desenvolvedora:'), 'créditos hidratam');
    assert(extra.includes('CD PROJEKT RED'), 'nome do estúdio');
    assert(extra.includes('gp-shots'), 'galeria de screenshots');
});

test('fundo próprio do usuário tem prioridade e a RAWG não sobrescreve', async () => {
    mockFetch([['/games/3328/screenshots', SHOTS], ['/games/3328?', DETAILS]]);
    addGame('g4', { userBanner: 'data:image/jpeg;base64,MEUFUNDO' });
    await openGamePage('g4', false);
    const page = lastPage();
    assert(page.innerHTML.includes('MEUFUNDO'), 'fundo próprio entra na abertura');
    assert(page._cls.includes('with-banner'), 'página recebe with-banner');
    await hydrate();
    const b = elById('gp-banner');
    assert(!((b && b.innerHTML) || '').includes('rawg'), 'RAWG não sobrescreveu o fundo do usuário');
    assert(page.innerHTML.includes('MEUFUNDO'), 'o fundo do usuário segue na página');
});

test('bloco "Suas screenshots" sempre aparece (mesmo sem RAWG)', async () => {
    addGame('g5');
    await openGamePage('g5', false);
    const mine = elById('gp-mine').innerHTML;
    assert(mine.includes('Suas screenshots'), 'título do bloco');
    assert(mine.includes('Adicionar'), 'botão de adicionar');
    assert(mine.includes('gp-shot-file'), 'campo de arquivo');
});

test('jogo manual (sem rawgId) abre a página sem crashar', async () => {
    addGame('g6', { rawgId: undefined });
    await openGamePage('g6', false);
    assert(lastPage().innerHTML.includes('Jogo g6'), 'página renderiza');
    await hydrate();
    const b = elById('gp-banner');
    assert(!((b && b.innerHTML) || ''), 'sem RAWG não injeta fundo');
});

test('wishlist também ganha a página completa', async () => {
    appData.wishlist.push({ id: 'w1', title: 'Desejo Teste', platform: 'PC', genres: [], rawgId: 3328 });
    mockFetch([['/games/3328/screenshots', SHOTS], ['/games/3328?', DETAILS]]);
    await openGamePage('w1', true);
    await hydrate();
    assert(lastPage().innerHTML.includes('Desejo Teste'), 'página do desejo abre');
    assert(elById('gp-extra').innerHTML.includes('Desenvolvedora:'), 'extras hidratam no desejo também');
});

test('diário: o botão de anotar mora na própria seção do diário (não nas ações)', async () => {
    addGame('g7', { journalNotes: 'Primeira entrada do diário' });
    await openGamePage('g7', false);
    const h = lastPage().innerHTML;
    // o botão está DENTRO da seção "Anotações e diário"
    assert(h.includes('gp-sec-foot'), 'rodapé da seção do diário');
    assert(h.includes(`openJournalEntry('g7')`), 'botão de anotar na própria tela do diário');
    // e saiu da fileira de ações do topo
    const actions = h.split('class="gp-actions"')[1].split('</div>')[0];
    assert(!actions.includes('openJournalEntry'), 'fileira de ações sem o botão de diário');
    // sem notas, a dica aponta para o botão que está logo abaixo
    addGame('g8');
    await openGamePage('g8', false);
    const h8 = created[created.length - 1].innerHTML;   // a página de g8 (a segunda criada neste teste)
    assert(h8.includes('pelo botão abaixo'), 'texto de vazio orienta para o botão da seção');
});

test('"Dados do jogo" virou "Editar" com ícone de lápis', async () => {
    addGame('g9');
    await openGamePage('g9', false);
    const h = lastPage().innerHTML;
    assert(!h.includes('Dados do jogo'), 'rótulo antigo sumiu');
    const seg = h.split(`gpDo('openEditGameModal', 'g9')`)[1].split('</button>')[0];
    assert(seg.includes('Editar'), 'botão agora se chama Editar');
    assert(seg.includes('M16.5 3.5'), 'ícone de lápis no Editar');
});

test('wishlist: sem botão de diário (diário é só dos jogos da biblioteca)', async () => {
    appData.wishlist.push({ id: 'w2', title: 'Desejo Sem Diário', platform: 'PC', genres: [] });
    await openGamePage('w2', true);
    assert(!lastPage().innerHTML.includes('openJournalEntry'), 'wishlist sem botão de diário');
    assert(!lastPage().innerHTML.includes('gp-sec-foot'), 'sem rodapé de diário na wishlist');
});

// ---------- Fundo automático nos dados do jogo (campo `banner`) ----------
// A busca automática escolhe uma arte HORIZONTAL e guarda só a URL no jogo: a página
// abre com o fundo no lugar, sem depender de fetch (o <img> não passa por CORS — era
// o que quebrava com as screenshots da RAWG).
test('fundo automático guardado nos dados abre a página como "capa de Facebook"', async () => {
    addGame('g10', { rawgId: undefined, banner: 'https://media.rawg.io/media/games/abc/fundo.jpg' });
    await openGamePage('g10', false);
    const page = lastPage();
    assert(page._cls.includes('with-banner'), 'a página já abre com o fundo no lugar');
    assert(page.innerHTML.includes('/media/resize/1280/-/games/'), 'fundo servido em alta resolução');
    assert(page.innerHTML.includes('fundo.jpg'), 'usa a arte que está nos dados do jogo');
});

test('primeira abertura: a busca automática GUARDA o fundo no jogo', async () => {
    mockFetch([
        ['/games/3328/stores', { results: [] }],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['/games/3328/screenshots', SHOTS],
        ['/games/3328?', DETAILS],
    ]);
    const g = addGame('g11');
    await openGamePage('g11', false);
    assert(!g.banner, 'ainda não havia fundo nos dados');
    await sleep(120);
    assertEq(g.banner, DETAILS.background_image_additional, 'arte extra da RAWG guardada no jogo');
    assert(elById('gp-banner').innerHTML.includes('arte-extra.jpg'), 'e já aparece no topo da página');
});

test('busca automática do cadastro: o fundo entra no jogo ao salvar', async () => {
    mockFetch([
        ['/api/games?', { count: 1, results: [{ id: 3328, name: 'The Witcher 3', background_image: DETAILS.background_image }] }],
        ['/api/games/3328/stores', { results: [{ url: 'https://store.steampowered.com/app/292030/' }] }],
        ['steamstatic.com', null],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['howlongtobeat.com', {}],
        ['/api/games/3328/screenshots', SHOTS],
        ['/api/games/3328?', DETAILS],
    ]);
    const { applyRawgGame, saveGame } = await import('../js/ui.js');
    document.getElementById('game-cat-id').value = 'c1';
    document.getElementById('game-mode').value = 'game';
    await applyRawgGame({ rawgId: 3328, title: 'The Witcher 3', image: DETAILS.background_image });
    assert(!appData.games.some(g => g.rawgId === 3328), 'o cadastro ainda não foi salvo');
    try { saveGame(); } catch (e) { /* o render do shim pode falhar; o dado é o que interessa */ }
    const saved = appData.games.find(g => g.rawgId === 3328);
    assert(saved, 'jogo salvo pelo formulário');
    assertEq(saved.title, DETAILS.name, 'título completo vindo da RAWG');
    assertEq(saved.banner, DETAILS.background_image_additional, 'fundo automático foi para os dados do jogo');
});

test('Zerados (linha do tempo): cada mês vira uma PRATELEIRA, sem cards', async () => {
    appData.settings.finishedView = 'timeline';
    appData.games.push(
        { id: 'tl1', title: 'Jogo Zerado Um', state: 'finished', platform: 'PC', dateFinished: '15/03/2025', image: 'data:image/jpeg;base64,CAPATL', catId: 'c1' },
        { id: 'tl2', title: 'Jogo Zerado Dois', state: 'finished', platform: 'PC', dateFinished: '20/04/2025', catId: 'c1' }
    );
    const { renderFinishedTab } = await import('../js/ui.js');
    renderFinishedTab();
    const wrap = created.find(c => c.id === 'finished-timeline');
    assert(wrap, 'a linha do tempo foi montada');
    assert(wrap.innerHTML.includes('tl-top'), 'resumo no topo');
    const months = created.filter(c => String(c.className) === 'tl-month');
    assertEq(months.length, 2, 'um bloco por mês');
    assert(months.some(m => m.innerHTML.includes('Março de 2025')), 'grupo de março');
    assert(months.some(m => m.innerHTML.includes('Abril de 2025')), 'grupo de abril separado');
    assert(!months.some(m => m.innerHTML.includes('tl-card')), 'sem cards na linha do tempo (foi substituída pela prateleira)');
    const shelves = created.filter(c => String(c.className) === 'game-list shelf');
    assertEq(shelves.length, 2, 'cada mês vira uma prateleira');
    const carts = created.filter(c => String(c.className).includes('shelf-item'));
    assertEq(carts.length, 2, 'um cartucho por jogo zerado');
    assert(carts.every(c => c.innerHTML.includes('cart')), 'cartuchos desenhados na tábua');
});

// ---------- FAB "+" da aba Fila: atalho de cadastro com duas opções ----------
test('FAB "+": abre as duas opções de cadastro e fecha ao toque', async () => {
    const { toggleAddMenu, closeAddMenu } = await import('../js/ui.js');
    const menu = document.getElementById('fab-add-menu');
    const fab = document.getElementById('fab-add');
    menu.hidden = true;   // estado do HTML estático (atributo hidden)
    toggleAddMenu();
    assertEq(menu.hidden, false, 'o + abre o menu com jogo e categoria');
    assertEq(elById('fab-add-backdrop').hidden, false, 'fundo para fechar ao toque fora');
    assert(fab._cls.includes('open'), 'o + gira para X quando o menu abre');
    closeAddMenu();
    assertEq(menu.hidden, true, 'fechar esconde o menu');
    assertEq(elById('fab-add-backdrop').hidden, true, 'e o fundo some');
    assert(!fab._cls.includes('open'), 'o + volta ao normal');
});

test('FAB "+" → Adicionar jogo: abre o cadastro já na primeira categoria', async () => {
    const { fabAddGame } = await import('../js/ui.js');
    document.getElementById('fab-add-menu').hidden = false;
    fabAddGame();
    assertEq(elById('modal-game')._shown, 1, 'o modal de cadastro de jogo abriu');
    assertEq(elById('game-cat-id').value, appData.categories[0].id, 'já vem na primeira categoria');
    assertEq(elById('fab-add-menu').hidden, true, 'e o menu fecha ao escolher');
});

test('FAB "+" → Adicionar Categoria: abre o cadastro de categoria', async () => {
    const { fabAddCategory } = await import('../js/ui.js');
    document.getElementById('fab-add-menu').hidden = false;
    fabAddCategory();
    assertEq(elById('modal-cat')._shown, 1, 'o modal de categoria abriu');
    assertEq(elById('cat-modal-title').innerText, 'Nova Categoria', 'título de categoria nova');
    assertEq(elById('fab-add-menu').hidden, true, 'e o menu fecha ao escolher');
});

test('FAB "+": HTML dentro da aba Fila, círculo no CSS e menu com as duas opções', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const home = html.slice(html.indexOf('id="tab-home"'), html.indexOf('id="tab-gamematch"'));
    assert(home.includes('id="fab-add"'), 'botão flutuante dentro da aba Fila');
    assert(home.includes('onclick="toggleAddMenu()"'), 'o + chama toggleAddMenu');
    assert(home.includes('onclick="fabAddGame()"') && home.includes('Adicionar jogo'), 'opção Adicionar jogo');
    assert(home.includes('onclick="fabAddCategory()"') && home.includes('Adicionar Categoria'), 'opção Adicionar Categoria');
    assert(!html.includes('class="btn-add-cat"'), 'o botão antigo de categoria saiu (o atalho é o FAB)');
    const css = readFileSync(join(root, 'style.css'), 'utf8');
    const rule = sel => { const at = css.indexOf(sel + ' {'); assert(at > -1, `regra ${sel} existe`); return css.slice(at, css.indexOf('}', at)); };
    assert(rule('.fab-add').includes('border-radius: 50%'), 'FAB circular');
    assert(rule('.fab-add').includes('var(--accent-playing)'), 'FAB na cor principal do tema');
    assert(css.includes('.fab-add-menu[hidden] { display: none; }'), 'menu fechado não aparece (display não vence o hidden)');
    assert(!css.includes('.btn-add-cat'), 'CSS do botão antigo removido junto');
});

// ---------- Ordenação da Fila: botão com painel (mesmo padrão do Explorar) ----------
// A Fila tinha uma barra de chips (Manual / A-Z / Tempo / Nota) que ocupava a largura
// toda. Agora ela usa o mesmo botão de ordenação das outras telas: um botão que abre
// um painel com as opções e mostra a ordem ativa no próprio rótulo.
test('Fila: a ordenação é um botão com painel (a barra de chips saiu da tela)', async () => {
    const { homeSortToggle } = await import('../js/ui.js');
    const panel = document.getElementById('home-sort-panel');
    panel.hidden = true;
    homeSortToggle();
    assertEq(panel.hidden, false, 'o botão Ordenar abre o painel');
    assertEq(document.getElementById('home-sort-btn')['aria-expanded'], 'true', 'o botão avisa que está aberto');
    for (const label of ['Manual', 'A-Z', 'Nota', 'Tempo p/ zerar', 'Tempo jogado', 'Perto de zerar'])
        assert(panel.innerHTML.includes(label), `opção "${label}" no painel`);
    assert(panel.innerHTML.includes("setHomeSort('manual')"), 'cada opção chama setHomeSort');
    assert(panel.innerHTML.includes('gm-x-panel-head'), 'painel com cabeçalho (mesmo estilo do Explorar)');
    assert(panel.innerHTML.includes("homeSortClose()"), 'e com o X de fechar');
    homeSortToggle();
    assertEq(panel.hidden, true, 'tocar de novo fecha');
    assertEq(document.getElementById('home-sort-btn')['aria-expanded'], 'false', 'aria-expanded volta a false');
});

test('Fila: escolher a ordem fecha o painel, marca o botão e escreve a ordem nele', async () => {
    const { setHomeSort } = await import('../js/ui.js');
    const panel = document.getElementById('home-sort-panel');
    const btn = document.getElementById('home-sort-btn');
    const label = document.getElementById('home-sort-label');
    panel.hidden = false;
    setHomeSort('az');
    assertEq(appData.settings.sort, 'az', 'ordem gravada nas preferências');
    assertEq(panel.hidden, true, 'o painel fecha ao escolher');
    assert(btn.classList.contains('on'), 'o botão fica marcado (como no Explorar)');
    assert(label.textContent.includes('A-Z'), 'o botão mostra a ordem ativa');
    assert(label.textContent.includes('↑'), 'e a direção');
    setHomeSort('az');   // tocar na ordem ativa inverte
    assertEq(appData.settings.homeSortDir, 'desc', 'tocar na ordem ativa inverte a direção');
    assert(label.textContent.includes('↓'), 'a seta acompanha');
    setHomeSort('manual');
    assertEq(label.textContent, 'Ordenar', 'Manual volta ao rótulo neutro');
    assert(!btn.classList.contains('on'), 'e sem marcação no padrão');
    appData.settings.sort = 'manual'; appData.settings.homeSortDir = 'asc';
});

