// Testes da camada da RAWG (js/gameApi.js): helpers puros + chamadas ao vivo.
import { test, assert, assertEq, live, mockFetch, sleep } from './shim.mjs';
import {
    resizeUrl, esc, shotsGalleryHtml, normText, guessFranchise, describeError,
    searchCompanies, listGames, getGameDetails, getGameScreenshots,
    fetchImageBlob, imageAttempts, IMAGE_PROXIES,
    fetchHLTBData, fetchHLTBTime, scrapeUrl, _resetHltbToken, searchTitle, bestRawgMatch
} from '../js/gameApi.js';

// ---------- puros (rodam sempre) ----------
test('resizeUrl redimensiona capas e screenshots da RAWG', () => {
    assertEq(resizeUrl('https://media.rawg.io/media/games/618/abc.jpg', 420), 'https://media.rawg.io/media/resize/420/-/games/618/abc.jpg');
    assertEq(resizeUrl('https://media.rawg.io/media/screenshots/1ac/x.jpg', 640), 'https://media.rawg.io/media/resize/640/-/screenshots/1ac/x.jpg');
    assertEq(resizeUrl('https://outro-site.com/a.jpg', 420), 'https://outro-site.com/a.jpg', 'fora da RAWG: não mexe');
    assertEq(resizeUrl(null, 420), null, 'url vazia');
});

test('esc escapa o que vem da API antes de virar HTML', () => {
    // o resultado precisa ter TODOS os caracteres perigosos como entidades
    const saida = esc('<b>&"x"</b>');
    assert(!saida.includes('<') && !saida.includes('"') && !saida.includes('&"'), 'tags e aspas viram entidades');
    assertEq(saida.length > 10, true, 'a saída cresceu (entidades)');
    assertEq(esc(null), '', 'null vira string vazia (não explode)');
    assertEq(esc(undefined), '', 'undefined idem');
});

test('shotsGalleryHtml: miniaturas redimensionadas + clique abre o visualizador do app', () => {
    const h = shotsGalleryHtml(['https://media.rawg.io/media/screenshots/a/1.jpg', 'data:image/jpeg;base64,ABC']);
    assert(h.includes('class="gp-shot"'), 'cada screenshot é um botão');
    assert(h.includes("window.viewImage && window.viewImage('"), 'clique chama o visualizador interno');
    assert(h.includes('/media/resize/640/-/screenshots/'), 'miniatura usa a versão leve');
    assert(h.includes('data:image/jpeg;base64,ABC'), 'screenshots do usuário (data URL) passam inteiras');
});

test('normText dobra acentos para comparação (o filtro de plataforma depende disso)', () => {
    assertEq(normText('Configuração'), 'configuracao');
    assertEq(normText('Época'), 'epoca');
});

test('guessFranchise deduz a franquia a partir do título', () => {
    assertEq(guessFranchise('The Witcher 3: Wild Hunt'), 'The Witcher', 'corta o subtítulo');
});

test('searchTitle: edições e versões saem do título de BUSCA (o título salvo fica como está)', () => {
    // A loja colou a edição no nome — a RAWG quase sempre só tem o jogo base.
    assertEq(searchTitle('The Witcher 3: Wild Hunt – Complete Edition'), 'The Witcher 3: Wild Hunt', 'Complete Edition');
    assertEq(searchTitle('Divinity: Original Sin 2 - Definitive Edition'), 'Divinity: Original Sin 2', 'Definitive Edition');
    assertEq(searchTitle('Baldur’s Gate II: Enhanced Edition'), 'Baldur’s Gate II', 'Enhanced Edition');
    assertEq(searchTitle('Gothic II Gold Edition'), 'Gothic II', 'Gold Edition');
    assertEq(searchTitle('Monster Hunter World: Iceborne Master Edition'), 'Monster Hunter World: Iceborne', 'Master Edition');
    assertEq(searchTitle('Dark Souls: Remastered'), 'Dark Souls', 'Remastered sozinho');
    assertEq(searchTitle('Mafia: Trilogy'), 'Mafia', 'Trilogy');
    assertEq(searchTitle('Doom 3: BFG Edition'), 'Doom 3', 'termo exótico + Edition');
    // títulos legítimos não são mexidos
    assertEq(searchTitle('Pokémon Gold'), 'Pokémon Gold', '"Gold" sem Edition depois fica');
    assertEq(searchTitle('The Witcher 3: Wild Hunt'), 'The Witcher 3: Wild Hunt', 'sem edição: intocado');
    assertEq(searchTitle('Metroid Prime'), 'Metroid Prime', 'idem');
    assertEq(searchTitle(''), '', 'vazio não explode');
});

test('bestRawgMatch: acha o jogo BASE quando a loja colou edição no nome', () => {
    // a RAWG traz o jogo base — o título da loja não casa exato com ele
    const results = [{ title: 'Divinity: Original Sin' }, { title: 'Divinity: Original Sin 2' }];
    assertEq(bestRawgMatch(results, 'Divinity: Original Sin 2 - Definitive Edition').title, 'Divinity: Original Sin 2', 'casa pelo título sem edição');
    // quando a edição EXISTE na RAWG, o exato com o título inteiro vence
    const goty = [{ title: 'Age of Empires II' }, { title: 'Age of Empires II: Definitive Edition' }];
    assertEq(bestRawgMatch(goty, 'Age of Empires II: Definitive Edition').title, 'Age of Empires II: Definitive Edition', 'exato com o título inteiro tem prioridade');
    // começa-com também casa ("Mafia" acha "Mafia", mesmo com outro jogo no topo)
    assertEq(bestRawgMatch([{ title: 'Mafia II' }, { title: 'Mafia' }], 'Mafia: Trilogy').title, 'Mafia', 'cascata passa pelo contains');
    // título sem edição continua casando como antes
    assertEq(bestRawgMatch([{ title: 'Hades' }], 'Hades').title, 'Hades');
    assertEq(bestRawgMatch([], 'X'), undefined, 'sem resultados não explode');
});

test('describeError explica erros de rede/chave/limite para o usuário', () => {
    assert(describeError({ kind: 'http', status: 429 }).includes('Limite'), '429 = limite');
    assert(describeError({ kind: 'network' }).includes('RAWG'), 'sem rede menciona a RAWG');
});

// ---------- download de imagens (CORS): a ordem das tentativas e o 401 do corsproxy ----------
// Bug real: as screenshots da RAWG eram barradas por CORS e o app só tentava UM proxy
// (o corsproxy.io, que passou a responder 401). O fundo do jogo "nunca" era baixado.
test('imageAttempts: direta, cache-buster, o WORKER do projeto e depois os proxies', () => {
    const url = 'https://media.rawg.io/media/screenshots/202/abc.jpg';
    const tries = imageAttempts(url);
    assertEq(tries[0], url, 'a primeira tentativa é sempre o link direto');
    assert(tries[1].startsWith(url + '?'), 'a segunda é a mesma URL com cache-buster');
    assert(tries[1] !== url, 'o cache-buster muda a URL (fura cache sem CORS)');
    assert(tries[2].startsWith('https://worker-') && tries[2].includes(encodeURIComponent(url)), 'a terceira é o Worker do projeto (CORS de verdade para hosts permitidos, como as capas do HLTB)');
    assert(tries.some(u => u.includes('allorigins.win/raw')), 'allorigins na lista');
    assert(tries.some(u => u.includes('api.codetabs.com')), 'codetabs na lista');
    assertEq(tries.length, 3 + IMAGE_PROXIES.length * 2, 'as duas versões de cada proxy público entram na fila');
});

test('fetchImageBlob: 401 de um proxy não mata a fila — o próximo proxy salva o download', async () => {
    // direto e cache-buster: bloqueados por CORS (erro de rede); corsproxy.io: 401;
    // allorigins: responde a imagem. Antes disso o app desistia na primeira falha.
    mockFetch([
        ['allorigins.win/raw', null],   // resposta "ok" com bytes de imagem
        ['corsproxy.io', () => ({ __res: { ok: false, status: 401 } })],
        ['media.rawg.io', () => { throw new Error('blocked by CORS'); }],
    ]);
    const blob = await fetchImageBlob('https://media.rawg.io/media/screenshots/202/abc.jpg');
    assert(blob && blob.size > 0, 'baixou a imagem por um proxy que funciona');
    assertEq(blob.type, 'image/jpeg', 'é mesmo uma imagem');
});

test('fetchImageBlob: 404 encerra na hora (imagem não existe mais — proxy nenhum resolve)', async () => {
    mockFetch([['media.rawg.io', () => ({ __res: { ok: false, status: 404 } })]]);
    const t0 = Date.now();
    const blob = await fetchImageBlob('https://media.rawg.io/media/screenshots/404/sumiu.jpg');
    assert(blob === null, 'sem imagem');
    assert(Date.now() - t0 < 500, 'não perde tempo tentando 8 proxies para um 404');
});

// ---------- busca via proxy (HLTB / Metacritic / busca da Steam) ----------
// O HLTB mudou a busca: agora é /api/search/site e exige o token do
// /api/search/site/init no cabeçalho x-auth-token (e um pedido com cara de
// navegador — quem faz isso é o Worker). Antes o app batia em /api/search, que
// respondia 403 e enchia o console de erro a cada busca de jogo.
function resp({ ok = true, status = 200, json = {}, text = '' } = {}) {
    return { ok, status, json: async () => json, text: async () => text || JSON.stringify(json) };
}

test('HLTB: busca nova (/api/search/site) com o token do /init no x-auth-token', async () => {
    _resetHltbToken();   // estado de módulo: começa limpo, sem herdar token de outro teste
    const calls = [];
    globalThis.fetch = async (url, opts = {}) => {
        const u = String(url);
        calls.push({ url: u, opts });
        if (u.includes('init')) return resp({ json: { token: 'tok-hltb' } });          // /api/search/site/init (codificado no ?url=)
        if (u.includes('search%2Fsite')) return resp({ json: { data: [{ game_name: 'Portal 2', comp_main: 36000, game_image: 'portal2.jpg' }] } });
        throw new Error('proxy sem resposta');
    };
    const d = await fetchHLTBData('Portal 2');
    assert(d, 'achou o jogo no HLTB');
    assertEq(d.hours, 10, 'comp_main em segundos vira horas');
    assert(String(d.imageUrl).includes('howlongtobeat.com/games/portal2.jpg'), 'box art do HLTB');
    const search = calls.find(c => c.url.includes('search%2Fsite') && !c.url.includes('init'));
    assertEq(search.opts.method, 'POST', 'a busca é POST');
    assertEq(search.opts.headers['x-auth-token'], 'tok-hltb', 'token do HLTB no cabeçalho');
    assert(String(search.opts.body).includes('"searchTerms":["Portal 2"]'), 'título no corpo da busca');
    assert(calls.every(c => c.url.includes('worker-')), 'tudo pela Worker: é ele que repassa o token e o Referer');
});

test('HLTB: token recusado (403) pega outro token e repete uma vez', async () => {
    _resetHltbToken();   // idem: o teste mede a RENOVAÇÃO, não pode entrar com token fresco herdado
    let buscas = 0, inits = 0;
    globalThis.fetch = async (url) => {
        const u = String(url);
        if (!u.includes('worker-')) throw new Error('proxy público não serve para o HLTB');
        if (u.includes('init')) { inits++; return resp({ json: { token: 'tok-' + inits } }); }
        buscas++;
        return buscas === 1 ? resp({ ok: false, status: 403, text: '{"error":"expired"}' }) : resp({ json: { data: [{ game_name: 'Portal 2', comp_main: 18000 }] } });
    };
    const horas = await fetchHLTBTime('Portal 2');
    assertEq(horas, 5, 'tempo lido depois de renovar o token');
    // o token da busca anterior pode estar em cache: o que importa é que o 403 obrigou um novo
    assert(inits >= 1, `pediu um token novo depois do 403 (obtido: ${inits})`);
    assertEq(buscas, 2, 'duas tentativas de busca');
});

test('HLTB: sem token (site mudou de novo) devolve null sem barulho no console', async () => {
    globalThis.fetch = async () => resp({ ok: false, status: 403, text: 'nope' });
    const d = await fetchHLTBData('Portal 2');
    assertEq(d, null, 'nenhum dado, nenhum erro lançado');
});

test('Busca via proxy: a fila não perde tempo com proxies mortos (corsproxy/cors.lol)', async () => {
    const urls = [];
    globalThis.fetch = async url => { urls.push(String(url)); throw new Error('bloqueado'); };
    await scrapeUrl('https://www.metacritic.com/game/portal-2/');
    assertEq(urls.length, 3, `três tentativas: Worker + allorigins + codetabs (obtido: ${urls.length})`);
    assert(!urls.some(u => u.includes('corsproxy.io')), 'corsproxy.io (401 sem chave) saiu da fila');
    assert(!urls.some(u => u.includes('cors.lol')), 'api.cors.lol (429) saiu da fila');
    assert(urls[0].includes('worker-'), 'o Worker do projeto continua sendo a primeira tentativa');
});

test('Busca via proxy: cabeçalho próprio (token) só vai pelo Worker', async () => {
    const seen = [];
    globalThis.fetch = async (url, opts = {}) => {
        seen.push({ url: String(url), headers: (opts && opts.headers) || {} });
        if (String(url).includes('allorigins')) return resp({ text: 'chegou' });
        return resp({ ok: false, status: 500, text: 'x' });
    };
    const txt = await scrapeUrl('https://howlongtobeat.com/x', '{"a":1}', { 'x-auth-token': 'segredo' });
    assertEq(txt, 'chegou', 'o conteúdo veio de outro proxy');
    assertEq(seen[0].headers['x-auth-token'], 'segredo', 'o Worker recebe o token');
    assertEq(seen[1].headers['x-auth-token'], undefined, 'proxy público nenhum recebe o token');
});

// ---------- ao vivo (pulam se a RAWG estiver fora do ar ou no limite) ----------
test('AO VIVO: detalhes do jogo trazem descrição, dev, publicadora e arte extra', async () => {
    const d = await live(getGameDetails(3328));   // The Witcher 3
    assert(d.developers.length > 0, 'developers preenchidos');
    assert(d.publishers.length > 0, 'publishers preenchidos');
    assert((d.description || '').length > 50, 'descrição em texto puro');
    assert(!!d.image, 'capa principal');
    assert((d.screenshots || []).length === 0, 'miniaturas só vêm na listagem, não no detalhe');
});

test('AO VIVO: endpoint de screenshots devolve imagens', async () => {
    const shots = await live(getGameScreenshots(3328));
    assert(shots.length > 0, 'pelo menos 1 screenshot');
    assert(shots.every(u => String(u).startsWith('http')), 'são URLs');
});

test('AO VIVO: busca de estúdios acha os grandes primeiro (filtro do Explorar)', async () => {
    const devs = await live(searchCompanies('developers', 'valve'));
    assert(devs.length > 0, 'retorna resultados');
    assertEq(devs[0].name, 'Valve Software', 'o maior estúdio vem primeiro');
    assert(devs.every(c => c.gamesCount > 0), 'sem estúdio sem jogos na lista');
});

test('AO VIVO: filtros de plataforma+gênero funcionam no servidor (caso do bug do Mobile)', async () => {
    const res = await live(listGames({ platforms: '3,21', genres: 'fighting', page_size: 3, ordering: '-rating' }));
    assert(res.count > 100, `tem jogos de luta no celular (count=${res.count})`);
    assert(res.items.every(g => (g.genres || []).includes('Luta')), 'gênero traduzido para Luta');
});

test('AO VIVO: filtro por desenvolvedora no /games (parâmetro developers)', async () => {
    const valve = await live(searchCompanies('developers', 'valve'));
    const res = await live(listGames({ developers: valve[0].id, page_size: 3 }));
    assert(res.count > 0, 'o filtro developers devolve jogos do estúdio');
});
