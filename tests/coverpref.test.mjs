// Testes da preferência de capas automáticas (vertical padrão x horizontal):
// onde ela vive (store.js), como o enriquecimento de lojas a respeita e o seletor.
import { test, assert, assertEq, elById, mockFetch, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { defaultData, migrateData } from '../js/store.js';
import { enrichStoreGames } from '../js/stores.js';
import { saveCoverPref, openSettings } from '../js/ui.js';

test('preferência: vertical é o padrão para todos (novo, antigo e quem nunca tocou)', () => {
    assertEq(defaultData.settings.autoCoverPref, 'vertical', 'defaultData');
    assertEq(migrateData({}).settings.autoCoverPref, 'vertical', 'usuário novo');
    assertEq(migrateData({ settings: {} }).settings.autoCoverPref, 'vertical', 'antigo sem a chave');
    assertEq(migrateData({ settings: { autoCoverPref: 'horizontal' } }).settings.autoCoverPref, 'horizontal', 'escolha explícita preservada');
});

test('seletor: saveCoverPref grava e o openSettings mostra o valor certo', () => {
    saveCoverPref('horizontal');
    assertEq(appData.settings.autoCoverPref, 'horizontal');
    saveCoverPref('vertical');
    assertEq(appData.settings.autoCoverPref, 'vertical');
    saveCoverPref('lixo');   // valor inválido cai no padrão
    assertEq(appData.settings.autoCoverPref, 'vertical');
    appData.settings.autoCoverPref = 'horizontal';
    openSettings();
    assertEq(elById('cover-pref-select').value, 'horizontal', 'openSettings sincroniza o select');
});

const RAWG_HIT = [
    ['/api/games?', { count: 1, results: [{ id: 7, name: 'Epic Jogo', released: '2021-01-01', background_image: 'https://media.rawg.io/media/games/xyz/wide.jpg' }] }],
    ['/api/games/7/stores', { results: [{ url: 'https://store.steampowered.com/app/777/' }] }],
    ['steamstatic.com/steam/apps/777/library_600x900.jpg', null],
    ['xyz/wide.jpg', null],   // arte horizontal da RAWG (direta ou redimensionada)
    ['store.steampowered.com', {}],
    ['wikipedia.org', { query: { pages: [] } }],
    ['howlongtobeat.com', {}],
];

async function runEnrich(pref) {
    appData.settings.autoCoverPref = pref;
    const g = { id: 'e1', title: 'Epic Jogo', platform: 'Epic Games', store: 'epic', state: null, image: null, wideCover: true, genres: [], rawgId: null };
    appData.games.push(g);
    mockFetch(RAWG_HIT);
    await enrichStoreGames([g]);
    await sleep(80);   // os workers terminam em background
    return g;
}

test('enriquecimento com padrão (vertical): a capa que entra é vertical', async () => {
    const g = await runEnrich('vertical');
    assert(g.image, 'capa foi salva');
    assertEq(g.wideCover, false, 'marcada como vertical');
    assert(!String(g.image).includes('media/games/xyz/wide.jpg'), 'não usou a arte horizontal da RAWG');
});

test('enriquecimento com "horizontal": a arte wide da RAWG entra direto', async () => {
    const g = await runEnrich('horizontal');
    assert(g.image, 'capa foi salva');
    assertEq(g.wideCover, true, 'marcada como horizontal');
});

test('enriquecimento com vertical SEM achar: jogo fica sem capa (sem fallback horizontal)', async () => {
    appData.settings.autoCoverPref = 'vertical';
    const g = { id: 'e2', title: 'Jogo Obscuro', platform: 'GOG', store: 'gog', state: null, image: null, wideCover: true, genres: [], rawgId: null };
    appData.games.push(g);
    mockFetch([
        ['/api/games?', { count: 0, results: [] }],
        ['store.steampowered.com', {}],
        ['wikipedia.org', { query: { pages: [] } }],
        ['howlongtobeat.com', {}],
    ]);
    await enrichStoreGames([g]);
    await sleep(80);
    assert(!g.image, 'sem capa — a retomada do boot tenta de novo depois');
    assertEq(g.wideCover, true, 'wideCover não mexido');
});
