// Testes da capa vertical (js/covers.js): o fluxo completo autoVerticalCover com
// as fontes mockadas (RAWG, Steam, Wikipédia, HLTB) — incluindo o STREAMING
// (a fonte lenta não pode segurar a capa) — e o buscador manual em tela cheia
// (modo capa x modo fundo horizontal). Este teste existe porque o bug do "sg"
// (variável errada engolida por .catch) deixou TODAS as capas automáticas
// caindo no horizontal por semanas — nunca mais.
// Também cobre a busca automática de FUNDO (autoBanner), que é o que põe a arte
// horizontal nos dados do jogo (campo `banner`) e vira a "capa de Facebook".
import { test, assert, assertEq, mockFetch, sleep } from './shim.mjs';
import { autoVerticalCover, openCoverPicker, coversSearch, coversPick, coversPickFile, autoBanner, bannerUrlOf, probeImage } from '../js/covers.js';

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

// ---------- FOTO DO APARELHO dentro da própria busca (a tela "Editar Capa" saiu) ----------
// Mesma regra das candidatas: vertical entra direto, horizontal abre o recorte —
// e a opção "usar na horizontal" salva a imagem inteira como capa larga.
const fotoFake = () => new Blob([Buffer.alloc(300, 1)], { type: 'image/jpeg' });

test('picker: foto do APARELHO vertical entra direto (sem recorte)', async () => {
    let picked = null;
    openCoverPicker({ title: '', onPick: (src, horizontal) => { picked = { src, horizontal }; } });   // título vazio: não dispara busca
    // o createImageBitmap do shim devolve 600x900 (vertical)
    await coversPickFile({ files: [fotoFake()], value: '' });
    assert(picked && typeof picked.src === 'string' && picked.src.startsWith('data:'), 'foto processada e salva direto');
    assertEq(picked.horizontal, false, 'sem a flag de capa larga');
    // com a opção "usar na horizontal" marcada: a MESMA foto entra inteira e larga
    document.getElementById('cv-horizontal').checked = true;
    picked = null;
    await coversPickFile({ files: [fotoFake()], value: '' });
    assert(picked && picked.horizontal === true, 'capa LARGA quando a opção está marcada');
    document.getElementById('cv-horizontal').checked = false;
});

test('picker: foto do APARELHO horizontal abre o RECORTADOR (como as candidatas)', async () => {
    let picked = null;
    openCoverPicker({ title: '', onPick: (src, horizontal) => { picked = { src, horizontal }; } });
    // o bitmap do shim é sempre vertical: fingir uma foto horizontal (900x600)
    const orig = globalThis.createImageBitmap;
    globalThis.createImageBitmap = async () => ({ width: 900, height: 600, close() {} });
    try {
        await coversPickFile({ files: [fotoFake()], value: '' });
    } finally { globalThis.createImageBitmap = orig; }
    assert(!picked, 'nada foi salvo direto: foi para o recorte');
    assertEq(document.getElementById('modal-crop')._shown, 1, 'recortador aberto para a foto horizontal');
});

// ---------- Busca AUTOMÁTICA de fundo (autoBanner) ----------
// O fundo da página do jogo ("capa de Facebook") sai de uma arte HORIZONTAL: arte
// extra da RAWG, screenshots, arte hero 16:9 da Steam. Devolve só a URL (um <img>
// mostra a imagem sem passar por CORS — era aí que o app travava) e essa URL fica
// guardada nos dados do jogo, no campo `banner`.
const BANNER_SOURCES = () => [
    ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
    ['/api/games/42?', { id: 42, name: 'Jogo Teste', background_image: 'https://media.rawg.io/media/games/abc/wide.jpg', background_image_additional: 'https://media.rawg.io/media/screenshots/abc/extra.jpg' }],
    ['/api/games/42/screenshots', { results: [{ image: 'https://media.rawg.io/media/screenshots/x/shot1.jpg' }] }],
    ['/api/games?', { count: 1, results: [{ id: 42, name: 'Jogo Teste', background_image: 'https://media.rawg.io/media/games/abc/wide.jpg' }] }],
    ['store.steampowered.com', {}],
    ['wikipedia.org', { query: { pages: [] } }],
];

test('autoBanner: a arte extra que já veio nos dados é usada na hora (sem baixar nada)', async () => {
    mockFetch(BANNER_SOURCES());
    const Orig = globalThis.Image;
    // nenhuma imagem "abre" (simula o site barrando o <img>): a semente confiável
    // (URL que o cadastro já trouxe da RAWG) não precisa de teste nenhum
    globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
    try {
        const t0 = Date.now();
        const b = await autoBanner('Jogo Teste', 42, { seed: ['https://media.rawg.io/media/screenshots/abc/ja-temos.jpg'] });
        assert(b, 'achou um fundo');
        assertEq(b.url, 'https://media.rawg.io/media/screenshots/abc/ja-temos.jpg', 'usa a URL que o cadastro já tinha');
        assertEq(b.source, 'RAWG', 'fonte informada');
        assert(Date.now() - t0 < 800, 'não fica esperando as fontes para entregar o que já estava na mão');
    } finally { globalThis.Image = Orig; }
});

test('autoBanner: sem arte extra, prefere a arte hero 16:9 da Steam às horizontais pequenas', async () => {
    mockFetch(BANNER_SOURCES());
    const b = await autoBanner('Jogo Teste', 42);
    assert(b, 'achou um fundo');
    assertEq(b.source, 'Steam', 'veio da Steam');
    assert(b.url.includes('library_hero.jpg'), `arte hero 16:9 na frente (obtido: ${b.url})`);
});

test('autoBanner: a fonte lenta (Wikipédia) não segura o fundo', async () => {
    mockFetch([
        ...BANNER_SOURCES().filter(([k]) => k !== 'wikipedia.org'),
        ['wikipedia.org', () => sleep(600).then(() => ({ query: { pages: [] } }))],
    ]);
    const t0 = Date.now();
    const b = await autoBanner('Jogo Teste', 42, { waitMs: 150 });
    const dt = Date.now() - t0;
    assert(b, 'achou um fundo mesmo com a fonte lenta pendurada');
    assert(dt < 500, `resolveu em ${dt}ms (a barreira de todas as fontes segurava a tela)`);
});

test('autoBanner: jogo sem arte nenhuma devolve null (melhor sem fundo do que com um quebrado)', async () => {
    mockFetch([
        ['/api/games/42/stores', { results: [] }],
        ['/api/games/42?', { id: 42, name: 'Jogo Sem Arte' }],
        ['/api/games/42/screenshots', { results: [] }],
        ['/api/games?', { count: 0, results: [] }],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
    ]);
    const b = await autoBanner('Jogo Sem Arte', 42, { waitMs: 200 });
    assert(b === null, `sem fundo (obtido: ${b && b.url})`);
});

test('bannerUrlOf: a escolha do usuário vence a arte automática; sem nada, vazio', () => {
    assertEq(bannerUrlOf({ userBanner: 'MEU', banner: 'AUTO' }), 'MEU', 'fundo do usuário na frente');
    assertEq(bannerUrlOf({ banner: 'AUTO' }), 'AUTO', 'arte automática quando não há enviada');
    assertEq(bannerUrlOf({}), '', 'sem fundo');
    assertEq(bannerUrlOf(null), '', 'sem jogo');
});

test('probeImage: aceita imagem horizontal e recusa a que não abre', async () => {
    assertEq(await probeImage('https://media.rawg.io/media/games/abc/wide.jpg'), true, 'imagem que abre é aceita');
    assertEq(await probeImage(''), false, 'sem URL não há imagem');
    const Orig = globalThis.Image;
    let passou = false;
    globalThis.Image = class { set src(v) { passou = true; setTimeout(() => this.onerror && this.onerror(), 0); } };
    try {
        assertEq(await probeImage('https://exemplo.invalido/quebrada.jpg'), false, 'imagem que não carrega é recusada');
    } finally { globalThis.Image = Orig; }
    assert(passou, 'o caminho falsificado do <img> foi exercitado');
});

// O bug que o usuário viu no console: CORS barrando o fetch de media.rawg.io e o
// corsproxy.io respondendo 401 — o seletor de fundo desistia da imagem escolhida.
// Agora, se o download falhar, o LINK entra no jogo (o <img> mostra sem CORS).
test('picker do fundo: imagem barrada por CORS entra como LINK (a escolha não se perde)', async () => {
    mockFetch([
        ['/api/games/42/stores', { results: [{ url: 'https://store.steampowered.com/app/12345/' }] }],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['howlongtobeat.com', {}],
        ['/api/games/42?', { id: 42, name: 'Jogo Teste', background_image_additional: 'https://media.rawg.io/media/screenshots/abc/extra.jpg' }],
        ['/api/games/42/screenshots', { results: [] }],
        // TODO download falha: direto, cache-buster e os proxies caem aqui (403)
        ['media.rawg.io', () => ({ __res: { ok: false, status: 403 } })],
        ['steamstatic.com', () => ({ __res: { ok: false, status: 403 } })],
    ]);
    let picked = null;
    openCoverPicker({ title: 'Jogo Teste', rawgId: 42, mode: 'banner', onPick: (src, wide) => { picked = { src, wide }; } });
    await sleep(80);
    await coversPick(0);   // a primeira candidata é a arte extra da RAWG
    assert(picked, 'a imagem escolhida foi entregue (antes, morria com "bloqueada pelo site")');
    assertEq(picked.src, 'https://media.rawg.io/media/screenshots/abc/extra.jpg', 'guarda o LINK do fundo');
    assertEq(picked.wide, true, 'entra como fundo horizontal, sem recorte');
});
