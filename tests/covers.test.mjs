// Testes da capa vertical (js/covers.js): o fluxo completo autoVerticalCover com
// as fontes mockadas (RAWG, Steam, Wikipédia, HLTB) — incluindo o STREAMING
// (a fonte lenta não pode segurar a capa) — e o buscador manual em tela cheia
// (modo capa x modo fundo horizontal). Este teste existe porque o bug do "sg"
// (variável errada engolida por .catch) deixou TODAS as capas automáticas
// caindo no horizontal por semanas — nunca mais.
import { test, assert, assertEq, mockFetch, sleep } from './shim.mjs';
import { autoVerticalCover, openCoverPicker, coversSearch } from '../js/covers.js';

const MOCK_VERTICAL = [
    // busca na RAWG (searchGames)
    ['/api/games?', { count: 1, results: [{ id: 42, name: 'Jogo Teste', released: '2020-01-01', background_image: 'https://media.rawg.io/media/games/abc/wide.jpg' }] }],
    // lojas do jogo (getGameStores): tem link da Steam
    ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
    // capa 600x900 da Steam (fetchImageBlob)
    ['steamstatic.com/steam/apps/12345/library_600x900.jpg', null],
    // fallback da busca direta na Steam (scrapeUrl via proxy — nunca precisa, mas mockado)
    ['store.steampowered.com', {}],
    // Wikipédia sem resultado (wikipedia())
    ['wikipedia.org', { query: { pages: [] } }],
    // HLTB sem resultado
    ['howlongtobeat.com', {}],
];

test('autoVerticalCover acha a capa vertical da Steam de ponta a ponta', async () => {
    mockFetch(MOCK_VERTICAL);
    const cov = await autoVerticalCover('Jogo Teste', null);
    assert(cov, 'retornou uma capa');
    assert(cov.source === 'Steam', `fonte correta (obtido: ${cov.source})`);
    assert(String(cov.data).startsWith('data:image/'), 'capa convertida em JPEG local');
    assert(cov.rawgId === 42, 'rawgId descoberto no caminho');
});

test('autoVerticalCover não explode e retorna null quando nenhuma fonte acha', async () => {
    mockFetch([
        ['/api/games?', { count: 0, results: [] }],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['howlongtobeat.com', {}],
    ]);
    const cov = await autoVerticalCover('Jogo Inexistente Total', null);
    assert(cov === null || cov === undefined, 'sem capa sem crash');
});

// A reprovação do bug: se alguém reintroduzir o erro de variável (tipo "sg"),
// o ReferenceError sobe e este teste falha na hora.
test('autoVerticalCover: nenhuma variável solta no caminho (regressão do bug do sg)', async () => {
    mockFetch(MOCK_VERTICAL);
    let erro = null;
    try { await autoVerticalCover('Jogo Teste', null); } catch (e) { erro = e; }
    assert(!erro, `não pode lançar erro interno: ${erro && erro.message}`);
});

// STREAMING: a barreira antiga (allSettled) esperava TODAS as fontes — o HLTB
// tenta 5 proxies com 12s de timeout cada e a capa só aparecia depois de ~25s
// (na prática: nunca). Agora a primeira vertical válida vence.
test('streaming: a fonte lenta (HLTB) não segura a capa achada pela Steam', async () => {
    mockFetch([
        ['/api/games?', { count: 1, results: [{ id: 42, name: 'Jogo Teste', released: '2020-01-01', background_image: 'https://media.rawg.io/media/games/abc/wide.jpg' }] }],
        ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
        ['steamstatic.com/steam/apps/12345/library_600x900.jpg', null],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        // HLTB demora 400ms para responder (simula a fila de proxies)
        ['howlongtobeat.com', () => sleep(400).then(() => ({}))],
    ]);
    const t0 = Date.now();
    const cov = await autoVerticalCover('Jogo Teste', null);
    const dt = Date.now() - t0;
    assert(cov && cov.source === 'Steam', 'capa da Steam chegou');
    assert(dt < 400, `resolveu em ${dt}ms (a fonte lenta não pode segurar — era o bug dos 25s)`);
});

// onCandidate: a URL vertical entra no <img> NA HORA (sem download) — mesmo
// quando o download do JPEG local falha (site bloqueou), a capa aparece.
test('onCandidate entrega a URL antes do download — e segue de pé se o download falhar', async () => {
    let urlVista = '', fonteVista = '';
    mockFetch([
        ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
        // o download da capa quebra (404 direto e no proxy de fallback)
        ['steamstatic.com/steam/apps/12345/library_600x900.jpg', () => ({ __res: { ok: false, status: 404 } })],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['howlongtobeat.com', {}],
    ]);
    const cov = await autoVerticalCover('Jogo Teste', 42, { onCandidate: (u, s) => { urlVista = u; fonteVista = s; } });
    assert(urlVista.includes('steamstatic.com/steam/apps/12345/library_600x900.jpg'), `onCandidate recebeu a URL direta (obtido: ${urlVista})`);
    assertEq(fonteVista, 'Steam', 'fonte informada');
    assert(cov === null, 'sem JPEG local quando tudo falha — mas a URL já tinha sido entregue');
});

// ---------- Buscador manual (tela cheia): modo capa x modo fundo ----------
function mockPickerSources() {
    return [
        // getGameStores via rawgId direto (o picker já recebe rawgId)
        ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['howlongtobeat.com', {}],
        ['/api/games/42?', { id: 42, name: 'Jogo Teste', background_image: 'https://media.rawg.io/media/games/abc/wide.jpg', background_image_additional: 'https://media.rawg.io/media/games/abc/extra.jpg' }],
        ['/api/games/42/screenshots', { results: [{ image: 'https://media.rawg.io/media/screenshots/x/shot1.jpg' }] }],
    ];
}

test('picker modo fundo (banner): busca artes HORIZONTAIS (Steam header, arte e screenshots da RAWG)', async () => {
    mockFetch(mockPickerSources());
    let picked = null;
    openCoverPicker({ title: 'Jogo Teste', rawgId: 42, mode: 'banner', onPick: (src, wide) => { picked = { src, wide }; } });
    const grid = document.getElementById('cv-grid');
    assert(grid._cls.includes('mode-banner'), 'grid no aspecto 16:9 (horizontal)');
    assert(document.getElementById('cv-mode-title').textContent.includes('fundo'), 'título da tela informa o modo fundo');
    assert(document.getElementById('cv-hrow').style.display === 'none', 'sem opção de recorte no modo fundo (entra inteira)');
    await sleep(60);   // o openCoverPicker já dispara a busca
    const html = grid.innerHTML;
    assert(html.includes('header.jpg'), 'header horizontal da Steam na lista');
    assert(html.includes('capsule_616x353.jpg'), 'capsule da Steam na lista');
    assert(html.includes('extra.jpg'), 'arte extra da RAWG na lista');
    assert(html.includes('shot1.jpg'), 'screenshot da RAWG na lista');
    assert(!html.includes('library_600x900.jpg'), 'capa VERTICAL da Steam não serve de fundo — fica de fora');
});

test('picker modo capa (padrão): continua priorizando verticais e chamando o recorte', async () => {
    mockFetch(mockPickerSources());
    openCoverPicker({ title: 'Jogo Teste', rawgId: 42, onPick: () => {} });
    const grid = document.getElementById('cv-grid');
    assert(!grid._cls.includes('mode-banner'), 'grid no aspecto de capa');
    assert(!document.getElementById('cv-mode-title').textContent.includes('fundo'), 'título no modo capa');
    assert(document.getElementById('cv-hrow').style.display !== 'none', 'opção de horizontal visível no modo capa');
    await sleep(60);
    assert(grid.innerHTML.includes('library_600x900.jpg'), 'capa vertical da Steam na lista');
    assert(grid.innerHTML.includes('recortar'), 'horizontais marcadas para recorte');
});
