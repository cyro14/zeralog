// Testes da capa vertical (js/covers.js): o fluxo completo autoVerticalCover com
// as fontes mockadas (RAWG, Steam, Wikipédia, HLTB). Este teste existe porque o
// bug do "sg" (variável errada engolida por .catch) deixou TODAS as capas
// automáticas caindo no horizontal por semanas — nunca mais.
import { test, assert, mockFetch, sleep } from './shim.mjs';
import { autoVerticalCover } from '../js/covers.js';

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
