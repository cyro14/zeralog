// ============================================================================
// Testes da busca em CAMADAS (js/gameApi.js + js/steamstore.js + js/igdb.js):
// RAWG fora do ar → Steam (loja) → IGDB. Tudo hermético (mockFetch): nenhum
// teste aqui depende de rede. Motivo: a RAWG ficou dias fora do ar (522) e o
// app precisa continuar achando jogos novos enquanto ela não volta.
// ============================================================================
import { test, assert, assertEq, mockFetch, elById, created, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { steamDateToIso, textFromHtml, steamSearch, steamDetails } from '../js/steamstore.js';
import { searchGames, listGames, detailsForGame, screenshotsForGame, hydrateSearchHit, describeError, _setRawgTimeout } from '../js/gameApi.js';
import { setIgdbClient, igdbListQuery, _resetIgdbSynthetic } from '../js/igdb.js';
import { refreshReleaseDates } from '../js/releases.js';
import { gmExplore, gmExploreWish, renderDeck, gmXOpen, gmResetPool } from '../js/gamematch.js';

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

// ---------- RAWG pendurada não segura a busca (teto antes do fallback) ----------
test('searchGames: RAWG pendurada é abortada no teto — o fallback começa na hora', async () => {
    semIgdb();
    _setRawgTimeout(80);   // cap curtinho: o teste não pode esperar 6s
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
        if (String(url).includes('api.rawg.io')) {
            return new Promise((resolve, reject) => {
                if (opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('abortado')));
            });
        }
        throw new Error('fonte alternativa fora');   // Steam/IGDB falham na hora
    };
    const t0 = Date.now();
    let err = null;
    try { await searchGames('qualquer'); } catch (e) { err = e; }
    globalThis.fetch = prevFetch;
    _setRawgTimeout(6000);   // devolve o teto real
    assert(err, 'erro sobe quando todas as fontes falham');
    assertEq(err.kind, 'network', 'abort do teto vira network');
    assert(Date.now() - t0 < 3000, 'não fica esperando o 522 do Cloudflare (~15s)');
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

// ---------- catálogo do GameMatch pela IGDB (RAWG fora do ar) ----------
const IGDB_CATALOG = [
    {
        id: 55, name: 'Gamedec', first_release_date: 1609459200,
        summary: 'Detetive de realidades virtuais.',
        genres: [{ name: 'Role-playing (RPG)' }],
        involved_companies: [{ company: { name: 'Anshar Studios' }, developer: true, publisher: true }],
        cover: { image_id: 'cov1' }, screenshots: [{ image_id: 's1' }],
        total_rating: 92, total_rating_count: 350, hypes: 12,
        platforms: [{ name: 'PC (Microsoft Windows)' }, { name: 'Nintendo Switch' }],
        themes: [{ name: 'Science fiction' }], keywords: [{ name: 'cyberpunk' }],
        age_ratings: [{ category: 1, rating: 6 }]
    },
    { id: 56, name: 'Jogo Dois', first_release_date: 1577836800, summary: 'Outro.', genres: [{ name: 'Shooter' }], cover: { image_id: 'cov2' }, total_rating: 80, total_rating_count: 40 }
];
const IGDB_TOKEN = ['id.twitch.tv', { access_token: 'tok-igdb', expires_in: 3600 }];

test('igdbListQuery traduz os parâmetros da RAWG para o dialeto da IGDB', () => {
    const q = igdbListQuery({
        page: 2, page_size: 20, ordering: '-rating', exclude_additions: 'true',
        genres: 'action,role-playing-games-rpg', platforms: '4,7,187,999',
        dates: '2022-01-01,2023-12-31'
    });
    assert(q.includes('genres.slug = ("action","role-playing-rpg")'), 'gêneros RAWG -> IGDB');
    assert(q.includes('platforms = (6,130,167)'), 'plataformas traduzidas (id 999 sem mapa cai fora)');
    assert(q.includes(`first_release_date >= ${Date.UTC(2022, 0, 1) / 1000}`), 'janela começa no dia');
    assert(q.includes(`first_release_date < ${Date.UTC(2023, 11, 31) / 1000 + 86400}`), 'janela inclusiva no fim (a RAWG é)');
    assert(q.includes('game_type = (0,4,8,9,10,11)'), 'exclude_additions tira DLC/complemento (game_type: category foi aposentado)');
    assert(q.includes('sort total_rating desc;'), 'ordering -rating vira total_rating');
    assert(q.includes('limit 21; offset 20;'), 'paginação: limit page_size+1 (deteta "more") e offset da página');
    assert(igdbListQuery({ ordering: '-popularity' }).includes('sort total_rating_count desc;'), '-popularity = mais comentados');
    assert(igdbListQuery({ ordering: '-added' }).includes('sort hypes desc;'), '-added = hype');
    assert(igdbListQuery({ ordering: 'released' }).includes('sort first_release_date asc;'), 'upcomingOnly ordena por data');
    assertEq(igdbListQuery({ developers: '802' }), null, 'filtro de estúdio da RAWG não tem tradução: prefere o erro a lista errada');
    assertEq(igdbListQuery({ search: 'zelda' }), null, 'busca por texto não é catálogo');
});

test('listGames: RAWG fora do ar → o catálogo vem da IGDB em formato RAWG', async () => {
    setIgdbClient('cid-teste', 'segredo-teste');
    _resetIgdbSynthetic();
    mockFetch([RAWG_DOWN, IGDB_TOKEN, ['api.igdb.com', IGDB_CATALOG]]);
    try {
        const res = await listGames({ page: 1, page_size: 20, ordering: '-popularity', exclude_additions: 'true', platforms: '4,7' });
        assertEq(res.items.length, 2, 'itens do catálogo');
        const g = res.items[0];
        assert(g.rawgId < 0, 'rawgId SINTÉTICO (negativo): só para o encanamento das telas');
        assertEq(g.igdbId, 55, 'igdbId de verdade para as consultas seguintes');
        assertEq(g.title, 'Gamedec');
        assertEq(g.released, '2021-01-01');
        assertEq(g.rating, 4.6, 'total_rating 92 na régua 0-5 da RAWG');
        assertEq(g.ratingsCount, 350, 'total_rating_count (o filtro de "joias" usa)');
        assertEq(g.platforms[0], 'PC', '"PC (Microsoft Windows)" no idioma do app');
        assertEq(g.genres[0], 'RPG', 'gênero traduzido para o matchScore');
        assert((g.tags || []).includes('cyberpunk'), 'keywords viram tags (bloqueio adulto e perfil)');
        assertEq(g.esrb, 'Mature', 'ESRB lido do age_ratings');
        assertEq(res.more, false, 'menos itens que o pedido: acabou');
    } finally { semIgdb(); }
});

test('Deck: a lupa do cartão vira "mais informações" (abre a página do jogo, não o Google)', async () => {
    setIgdbClient('cid-teste', 'segredo-teste');
    _resetIgdbSynthetic();
    mockFetch([RAWG_DOWN, IGDB_TOKEN, ['api.igdb.com', IGDB_CATALOG]]);
    try {
        appData.gamematch.profile = { name: 'Teste', platforms: [], genres: [], styles: [], era: 'both', time: 'some', upcomingOnly: false };
        await renderDeck();
        const html = elById('gm-deck').innerHTML;
        assert(html.includes('gm-info-btn'), 'o cartão tem o botão de lupa');
        assert(html.includes('data-id="-1001"') && html.includes('data-id="-1002"'), 'cada lupa leva o id do SEU jogo');
        assert(html.includes('Mais informações do jogo'), 'o tooltip agora é a tela de informações');
        assert(!html.includes('Pesquisar no Google') && !html.includes('data-t='), 'a busca no Google saiu do cartão');
        // o coração do wiring: o id do dataset (string) vira número e abre a página certa
        await gmXOpen(Number('-1001'));
        const page = created.find(c => c.id === 'gm-xpage');
        assert(page && page.innerHTML.includes('Gamedec'), 'o id da lupa abre a página do jogo certo');
    } finally {
        semIgdb();
        gmResetPool();   // plannedDeck/poolExhausted não vazam para os testes do gamematch
    }
});

test('gmXOpen: o fundo busca arte horizontal (library_hero da Steam) em vez de repetir a capa', async () => {
    setIgdbClient('cid-teste', 'segredo-teste');
    _resetIgdbSynthetic();
    mockFetch([
        RAWG_DOWN, IGDB_TOKEN, ['api.igdb.com', IGDB_CATALOG],
        ['storesearch', { total: 1, items: [{ type: 'app', name: 'Gamedec', id: 917720 }] }],
        ['wikipedia.org', { query: { pages: [] } }]
    ]);
    try {
        await gmExplore('top');   // mesmo caminho do Explorar: o item entra no exploreById
        await gmXOpen(-1001);
        const page = created.find(c => c.id === 'gm-xpage');
        assert(page, 'a página de informações abriu');
        // instantâneo: o banner usa a screenshot horizontal que veio na listagem...
        assert(page.innerHTML.includes('t_screenshot_huge/s1.jpg'), 'banner instantâneo = screenshot (horizontal)');
        // ...e a CAPA nunca vira fundo (era o comportamento antigo: página igual ao cartão)
        assert(page.innerHTML.includes('id="gm-x-bg"'), 'o fundo existe');
        assert(!page.innerHTML.includes('gp-bg"><img src="https://images.igdb.com/igdb/image/upload/t_cover_big'), 'a capa não é o fundo');
        // em segundo plano o autoBanner acha o library_hero da Steam (via storesearch) e troca
        await sleep(2700);
        // (o shim registra os nós por id: as mutações do paintArt aparecem neles)
        assert(elById('gm-x-bg').innerHTML.includes('steam/apps/917720/library_hero.jpg'), 'fundo trocado pela arte hero da Steam');
        assert(elById('gm-x-banner').innerHTML.includes('library_hero.jpg'), 'banner trocado pela arte hero da Steam');
    } finally { semIgdb(); }
});

test('listGames: sem IGDB configurada o erro da RAWG sobe (Deck cai nos demonstrativos)', async () => {
    semIgdb();
    mockFetch([RAWG_DOWN]);
    let err = null;
    try { await listGames({ ordering: '-popularity' }); } catch (e) { err = e; }
    assert(err, 'erro sobe quando ninguém responde');
    assertEq(err.status, 522);
});

test('GameMatch sem RAWG: Explorar lista pela IGDB e o desejo salvo leva igdbId (não o id sintético)', async () => {
    setIgdbClient('cid-teste', 'segredo-teste');
    _resetIgdbSynthetic();
    mockFetch([RAWG_DOWN, IGDB_TOKEN, ['api.igdb.com', IGDB_CATALOG]]);
    try {
        await gmExplore('top');
        const grid = elById('gm-explore-grid');
        assert(grid.innerHTML.includes('Gamedec'), 'cartão da IGDB pintado no Explorar');
        gmExploreWish(-1001);   // o mesmo id que o onclick do cartão recebeu
        const w = appData.wishlist.find(x => x.title === 'Gamedec');
        assert(w, 'o desejo entrou pelo botão do cartão');
        assertEq(w.igdbId, 55, 'o id DA FONTE fica salvo');
        assert(!w.rawgId, 'o id sintético NUNCA vira rawgId do jogo');
        assertEq(w.genres[0], 'RPG', 'gênero em português');
        assert(String(w.image).includes('cov1'), 'capa da IGDB no jogo salvo');
    } finally { semIgdb(); }
});
