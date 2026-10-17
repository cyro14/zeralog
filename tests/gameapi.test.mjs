// Testes da camada da RAWG (js/gameApi.js): helpers puros + chamadas ao vivo.
import { test, assert, assertEq, live, mockFetch } from './shim.mjs';
import {
    resizeUrl, esc, shotsGalleryHtml, normText, guessFranchise, describeError,
    searchCompanies, listGames, getGameDetails, getGameScreenshots,
    fetchImageBlob, imageAttempts, IMAGE_PROXIES
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

test('describeError explica erros de rede/chave/limite para o usuário', () => {
    assert(describeError({ kind: 'http', status: 429 }).includes('Limite'), '429 = limite');
    assert(describeError({ kind: 'network' }).includes('RAWG'), 'sem rede menciona a RAWG');
});

// ---------- download de imagens (CORS): a ordem das tentativas e o 401 do corsproxy ----------
// Bug real: as screenshots da RAWG eram barradas por CORS e o app só tentava UM proxy
// (o corsproxy.io, que passou a responder 401). O fundo do jogo "nunca" era baixado.
test('imageAttempts: direta, direta com cache-buster e depois os proxies', () => {
    const url = 'https://media.rawg.io/media/screenshots/202/abc.jpg';
    const tries = imageAttempts(url);
    assertEq(tries[0], url, 'a primeira tentativa é sempre o link direto');
    assert(tries[1].startsWith(url + '?'), 'a segunda é a mesma URL com cache-buster');
    assert(tries[1] !== url, 'o cache-buster muda a URL (fura cache sem CORS)');
    assert(tries.some(u => u.includes('allorigins.win/raw')), 'allorigins na lista');
    assert(tries.some(u => u.includes('api.codetabs.com')), 'codetabs na lista');
    assert(tries.length >= 2 + IMAGE_PROXIES.length * 2, 'as duas versões de cada proxy entram na fila');
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
