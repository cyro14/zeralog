// ============================================================================
// Testes da busca em CAMADAS (js/gameApi.js + js/steamstore.js + js/igdb.js):
// RAWG fora do ar → Steam (loja) → IGDB. Tudo hermético (mockFetch): nenhum
// teste aqui depende de rede. Motivo: a RAWG ficou dias fora do ar (522) e o
// app precisa continuar achando jogos novos enquanto ela não volta.
// ============================================================================
import { test, assert, assertEq, mockFetch } from './shim.mjs';
import { appData } from '../js/store.js';
import { steamDateToIso, textFromHtml, steamSearch, steamDetails } from '../js/steamstore.js';
import { searchGames, detailsForGame, screenshotsForGame, hydrateSearchHit, describeError } from '../js/gameApi.js';
import { setIgdbClient } from '../js/igdb.js';
import { refreshReleaseDates } from '../js/releases.js';

// "&" montado por charCode: um literal de entidade no código-fonte corre o risco
// de ser decodificado no caminho até o arquivo (bug real que já aconteceu aqui).
const AMP = String.fromCharCode(38);

// ---------- respostas falsas ----------
const STORESEARCH = {
    total: 2,
    items: [
        { type: 'app', name: 'Yu-Gi-Oh! Master Duel', id: 1449850, tiny_image: 'https://shared.akamai.steamstatic.com/cap1.jpg', metascore: '' },
        { type: 'app', name: 'Yu-Gi-Oh! Duel Links', id: 601510, tiny_image: 'https://shared.akamai.steamstatic.com/cap2.jpg', metascore: '85' }
    ]
};
const APPDETAILS = {
    '1449850': {
        success: true,
        data: {
            type: 'game', name: 'Yu-Gi-Oh! Master Duel', steam_appid: 1449850,
            short_description: 'Duelo com <b>4.000</b> cartas ' + AMP + 'amp; mais',
            release_date: { coming_soon: false, date: '19 de janeiro de 2022' },
            developers: ['Konami'], publishers: ['Konami'],
            genres: [{ id: '1', description: 'Estratégia' }, { id: '2', description: 'Cartas' }],
            metacritic: { score: 82 },
            header_image: 'https://cdn.cloudflare.steamstatic.com/header.jpg',
            background_raw: 'https://cdn.cloudflare.steamstatic.com/bg.jpg',
            screenshots: [{ id: 0, path_full: 'https://cdn.cloudflare.steamstatic.com/ss1.jpg' }, { id: 1, path_full: 'https://cdn.cloudflare.steamstatic.com/ss2.jpg' }]
        }
    },
    '999999': {
        success: true,
        data: {
            type: 'game', name: 'Jogo Sem Data', steam_appid: 999999,
            short_description: 'Vai sair um dia.',
            release_date: { coming_soon: true, date: 'Coming soon' }
        }
    }
};
// Serve o appdetails pelo appid pedido, no MESMO formato da API real:
// { "<appid>": { success, data } } (a URL vem codificada pelo Worker: %3D)
const serveAppDetails = async url => {
    const m = String(url).match(/appids(?:%3D|=)(\d+)/);
    const id = m ? m[1] : '';
    return APPDETAILS[id] ? { [id]: APPDETAILS[id] } : { [id || '0']: { success: false } };
};
// A RAWG como estava em nov/2025: Cloudflare sem alcançar a origem (522)
const RAWG_DOWN = ['api.rawg.io', () => ({ __res: { ok: false, status: 522 } })];
const IGDB_GAMES = [{
    id: 55, name: 'Gamedec', first_release_date: 1609459200,
    summary: 'Detetive de realidades virtuais.',
    genres: [{ name: 'Role-playing (RPG)' }],
    involved_companies: [{ company: { name: 'Anshar Studios' }, developer: true, publisher: true }],
    cover: { image_id: 'cov1' },
    screenshots: [{ image_id: 's1' }]
}];
const semIgdb = () => setIgdbClient('', '');

// ---------- puros: conversões da Steam ----------
test('steamDateToIso: data em português e inglês da Steam vira AAAA-MM-DD', () => {
    assertEq(steamDateToIso('19 de janeiro de 2022'), '2022-01-19', 'PT: "19 de janeiro de 2022"');
    assertEq(steamDateToIso('10 de dezembro de 2020'), '2020-12-10', 'PT com dia de 1 dígito');
    assertEq(steamDateToIso('10 dez. 2020'), '2020-12-10', 'PT abreviado');
    assertEq(steamDateToIso('Dec 19, 2023'), '2023-12-19', 'EN: "Dec 19, 2023"');
    assertEq(steamDateToIso('February 22, 2024'), '2024-02-22', 'EN mês longo');
});

test('steamDateToIso: datas vagas ficam vazias (o jogo fica como tba)', () => {
    assertEq(steamDateToIso('Coming soon'), '', 'coming soon');
    assertEq(steamDateToIso('Em breve'), '', 'PT');
    assertEq(steamDateToIso('To be announced'), '', 'tba');
    assertEq(steamDateToIso('2024'), '', 'só o ano, sem mês: não inventa dia');
    assertEq(steamDateToIso(''), '', 'vazio');
    assertEq(steamDateToIso(null), '', 'null');
});

test('textFromHtml limpa tags e entidades da descrição da loja', () => {
    const suja = 'Duelo com <b>4.000</b> cartas ' + AMP + 'amp; mais<br>agora';
    const limpa = textFromHtml(suja);
    assert(!limpa.includes('<'), 'nenhuma tag sobra');
    assert(limpa.includes('4.000'), 'o conteúdo fica');
    assert(limpa.includes('cartas ' + AMP + ' mais'), 'a entidade vira o caractere');
    assert(limpa.includes('mais\nagora'), 'o br vira quebra de linha');
    assertEq(textFromHtml(null), '', 'null vazio');
});

// ---------- Steam: busca e ficha ----------
test('steamSearch mapeia a busca da loja (só apps; metascore vira nota)', async () => {
    mockFetch([['storesearch', STORESEARCH]]);
    const hits = await steamSearch('Yu-Gi-Oh!');
    assertEq(hits.length, 2, 'dois apps');
    assertEq(hits[0].steamAppId, 1449850, 'appid da Steam');
    assertEq(hits[0].title, 'Yu-Gi-Oh! Master Duel', 'título');
    assertEq(hits[0].rawgId, null, 'não é da RAWG');
    assertEq(hits[0].metacritic, null, 'metascore vazio = sem nota');
    assertEq(hits[1].metacritic, 85, 'metascore numérico vira nota');
    assert(String(hits[0].image).includes('https://'), 'capa (capsule) presente');
});

test('steamDetails lê a ficha completa (data PT vira ISO, gêneros PT, Metacritic)', async () => {
    mockFetch([['appdetails', serveAppDetails]]);
    const d = await steamDetails(1449850);
    assertEq(d.title, 'Yu-Gi-Oh! Master Duel', 'título do appdetails');
    assertEq(d.released, '2022-01-19', 'data em texto PT convertida');
    assertEq(d.tba, false, 'data firme não é tba');
    assertEq(d.metacritic, 82, 'nota do Metacritic vem DE GRAÇA no appdetails');
    assertEq(d.genres.join(', '), 'Estratégia, Cartas', 'gêneros já em português');
    assertEq(d.developers.join(','), 'Konami', 'desenvolvedora');
    assertEq(d.screenshots.length, 2, 'screenshots do appdetails');
    assert(d.description.includes('4.000') && !d.description.includes('<'), 'descrição em texto puro');
    assert(d.description.includes(AMP), 'entidade decodificada');
    assertEq(d.rawgId, null, 'fonte não é a RAWG');
});

test('steamDetails: lançamento sem data exata vira tba', async () => {
    mockFetch([['appdetails', serveAppDetails]]);
    const d = await steamDetails(999999);
    assertEq(d.released, '', 'sem data ISO');
    assertEq(d.tba, true, 'coming_soon sem data = tba');
});

// ---------- searchGames em camadas ----------
test('searchGames: RAWG fora do ar (522) → a busca cai para a Steam', async () => {
    mockFetch([RAWG_DOWN, ['storesearch', STORESEARCH]]);
    const hits = await searchGames('Yugioh');
    assertEq(hits.length, 2, 'resultados vieram da Steam');
    assertEq(hits[0].title, 'Yu-Gi-Oh! Master Duel');
    assertEq(hits[0].steamAppId, 1449850);
});

test('searchGames: RAWG de pé segue sendo a primária', async () => {
    mockFetch([
        ['api.rawg.io', { results: [{ id: 7, name: 'Portal 2', released: '2011-04-18', genres: [{ name: 'Puzzle' }], background_image: 'https://media.rawg.io/x.jpg', short_screenshots: [] }] }],
        ['storesearch', STORESEARCH]   // NÃO pode ser consultado
    ]);
    const hits = await searchGames('Portal 2');
    assertEq(hits.length, 1, 'só o resultado da RAWG');
    assertEq(hits[0].rawgId, 7, 'id da RAWG');
    assertEq(hits[0].genres[0], 'Quebra-cabeça', 'gênero traduzido (GENRES_PT)');
});

test('searchGames: Steam sem nada → IGDB responde (se configurada)', async () => {
    setIgdbClient('cid-teste', 'segredo-teste');
    mockFetch([
        RAWG_DOWN,
        ['storesearch', { total: 0, items: [] }],
        ['id.twitch.tv', { access_token: 'tok-igdb', expires_in: 3600 }],
        ['api.igdb.com', IGDB_GAMES]
    ]);
    try {
        const hits = await searchGames('Gamedec');
        assertEq(hits.length, 1, 'resultado da IGDB');
        assertEq(hits[0].title, 'Gamedec');
        assertEq(hits[0].igdbId, 55, 'id da IGDB');
        assertEq(hits[0].released, '2021-01-01', 'first_release_date (unix) vira AAAA-MM-DD');
        assertEq(hits[0].genres[0], 'RPG', '"Role-playing (RPG)" traduzido');
        assertEq(hits[0].developers[0], 'Anshar Studios', 'créditos da involved_companies');
        assert(String(hits[0].image).includes('cov1'), 'capa da IGDB');
        assertEq(hits[0].screenshots.length, 1, 'screenshot da IGDB');
    } finally { semIgdb(); }
});

// ---------- roteadores (detailsForGame / screenshotsForGame / hydrate) ----------
test('detailsForGame: roteia pelo steamAppId sem tocar na RAWG', async () => {
    semIgdb();
    mockFetch([['appdetails', serveAppDetails]]);   // sem mock da RAWG: se ela for chamada, o teste falha na rede
    const d = await detailsForGame({ steamAppId: 1449850 });
    assertEq(d.title, 'Yu-Gi-Oh! Master Duel');
    assertEq(d.released, '2022-01-19');
});

test('detailsForGame: jogo antigo só com rawgId → RAWG caiu e a Steam resgata pelo título', async () => {
    semIgdb();
    mockFetch([RAWG_DOWN, ['storesearch', STORESEARCH], ['appdetails', serveAppDetails]]);
    const d = await detailsForGame({ rawgId: 321, title: 'Yu-Gi-Oh! Master Duel' });
    assertEq(d.released, '2022-01-19', 'ficha veio da Steam');
    assertEq(d.steamAppId, 1449850, 'e já sai com o appid para as próximas');
});

test('detailsForGame: RAWG fora do ar e nada que responde → erro marca exhausted', async () => {
    semIgdb();
    mockFetch([RAWG_DOWN, ['storesearch', { total: 0, items: [] }]]);
    let err = null;
    try { await detailsForGame({ rawgId: 321, title: 'Jogo Inexistente Em Qualquer Lugar' }); }
    catch (e) { err = e; }
    assert(err, 'erro sobe quando todas as fontes falham');
    assertEq(err.exhausted, true, 'marcado como "tentei tudo"');
    assertEq(err.status, 522, 'o erro original da RAWG preservado');
});

test('hydrateSearchHit: ficha da RAWG não gera chamada; ficha da Steam é completada', async () => {
    semIgdb();
    const prevFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async u => { calls.push(String(u)); throw new Error('bloqueado'); };
    const rawg = await hydrateSearchHit({ rawgId: 9, title: 'Jogo da RAWG', genres: ['RPG'] });
    globalThis.fetch = prevFetch;   // devolve o fetch do shim: o mockFetch volta a valer
    assertEq(calls.length, 0, 'a RAWG respondeu: nenhuma chamada extra');
    assertEq(rawg.title, 'Jogo da RAWG');
    mockFetch([['appdetails', serveAppDetails]]);
    const cheia = await hydrateSearchHit({ steamAppId: 1449850, title: 'Yu-Gi-Oh! Master Duel', genres: [] });
    assert(cheia.description && cheia.description.includes('4.000'), 'descrição veio do appdetails');
    assertEq(cheia.metacritic, 82, 'nota veio junto');
});

test('screenshotsForGame: traz as screenshots que vêm dentro do appdetails', async () => {
    semIgdb();
    mockFetch([['appdetails', serveAppDetails]]);
    const shots = await screenshotsForGame({ steamAppId: 1449850 });
    assertEq(shots.join('|'), 'https://cdn.cloudflare.steamstatic.com/ss1.jpg|https://cdn.cloudflare.steamstatic.com/ss2.jpg');
});

// ---------- mensagens de erro ----------
test('describeError: 522 explica que é a RAWG fora do ar (e não a chave do usuário)', () => {
    const fora = describeError({ kind: 'http', status: 522 });
    assert(fora.includes('fora do ar'), 'diz claramente que o serviço caiu');
    assert(fora.includes('não na sua chave'), 'tira a culpa do usuário');
    assert(fora.includes('Steam'), 'conta que a busca caiu para as alternativas');
    const semSorte = describeError({ kind: 'http', status: 522, exhausted: true });
    assert(semSorte.includes('também não responderam'), 'quando nem Steam nem IGDB responderam, a mensagem diz');
    assert(describeError({ kind: 'http', status: 429 }).includes('Limite'), '429 continua sendo limite da chave');
});

// ---------- fim a fim: datas da wishlist ----------
test('refreshReleaseDates: a data da wishlist vem da Steam quando a RAWG caiu', async () => {
    semIgdb();
    mockFetch([RAWG_DOWN, ['storesearch', STORESEARCH], ['appdetails', serveAppDetails]]);
    appData.wishlist.push({ id: 'w1', title: 'Yu-Gi-Oh! Master Duel', platform: 'PC' });
    const r = await refreshReleaseDates({ force: true });
    const w = appData.wishlist.find(x => x.id === 'w1');
    assertEq(r.changed, 1, 'a data foi atualizada');
    assertEq(w.released, '2022-01-19', 'data convertida do texto da Steam');
    assertEq(w.steamAppId, 1449850, 'o appid fica salvo: próximas rodadas nem buscam');
});
