// Testes da IGDB (js/igdb.js): a "chave" vem da Twitch (Client ID + Client Secret),
// o token é gerado por client_credentials, e a consulta é Apicalypse (texto, não JSON)
// mandada pelo Worker do projeto — a api.igdb.com não abre CORS para o navegador.
// Regressão que estes testes guardam: a tela pedia "sua chave da IGDB" (que não
// existe) e mandava o usuário para uma página 404; e o módulo consultava endpoints
// que não existem na IGDB (/media) com corpo JSON.
import { test, assert, assertEq } from './shim.mjs';
import {
    getIgdbClient, setIgdbClient, igdbConfigured, fetchIGDBCovers, igdbSelfTest,
    hasIgdbToken, clearIgdbToken
} from '../js/igdb.js';

// fetch controlado: grava as chamadas (url + opções) e responde pelo mapa
function stubFetch(routes) {
    const calls = [];
    globalThis.fetch = async (url, opts = {}) => {
        const u = String(url);
        calls.push({ url: u, opts });
        for (const [key, make] of routes) {
            if (u.includes(key)) {
                const r = typeof make === 'function' ? make(u, opts) : make;
                return {
                    ok: r.ok !== false, status: r.status || 200,
                    json: async () => r.json || {}, text: async () => r.text || ''
                };
            }
        }
        throw new Error('CORS/network: ' + u);
    };
    return calls;
}

const TOKEN_OK = { json: { access_token: 'tok-1', expires_in: 5184000 } };
const GAMES_OK = { json: [{ id: 7346, name: 'Portal 2', cover: { id: 1, image_id: 'co1r7f' } }] };
// a rota casa com a URL do Worker (que carrega o destino codificado) e com a direta
const ROTAS_OK = [['id.twitch.tv/oauth2/token', TOKEN_OK], ['api.igdb.com', GAMES_OK]];

test('IGDB: sem Client ID/Secret não chama nada (nada de erro no console do usuário)', async () => {
    localStorage.removeItem('zeralog_igdb_client');
    clearIgdbToken();
    const calls = stubFetch([]);
    assertEq(igdbConfigured(), false, 'não configurada por padrão');
    const covers = await fetchIGDBCovers('Portal 2');
    assertEq(covers.length, 0, 'sem capas');
    assertEq(calls.length, 0, 'nenhuma requisição de rede');
});

test('IGDB: Client ID + Secret ficam salvos neste navegador (e apagar desliga tudo)', () => {
    setIgdbClient('  meu-id  ', ' segredo ');
    assertEq(getIgdbClient().id, 'meu-id', 'id sem espaços');
    assertEq(getIgdbClient().secret, 'segredo', 'secret sem espaços');
    assertEq(igdbConfigured(), true, 'configurada');
    setIgdbClient('', '');
    assertEq(igdbConfigured(), false, 'apagar os dois desliga a IGDB');
});

test('IGDB: token da Twitch é pedido com client_credentials e fica em cache', async () => {
    setIgdbClient('id-abc', 'secret-xyz');
    clearIgdbToken();
    const calls = stubFetch(ROTAS_OK);
    const covers = await fetchIGDBCovers('Portal 2', 5);
    assertEq(covers.length, 1, 'achou a capa do jogo');
    assertEq(covers[0].source, 'IGDB', 'fonte marcada');
    assertEq(covers[0].vertical, true, 'capa vertical');
    assert(String(covers[0].url).includes('images.igdb.com/igdb/image/upload/'), 'URL de imagem da IGDB');
    assert(String(covers[0].url).includes('co1r7f.jpg'), 'usa o image_id da capa');
    const tokenCall = calls.find(c => c.url.includes('id.twitch.tv'));
    assert(tokenCall.url.includes('client_id=id-abc'), 'manda o Client ID');
    assert(tokenCall.url.includes('grant_type=client_credentials'), 'fluxo client_credentials');
    assertEq(tokenCall.opts.method, 'POST', 'token é POST');
    assertEq(hasIgdbToken(), true, 'token guardado');
    // segunda busca: o token em cache evita novo pedido
    const calls2 = stubFetch(ROTAS_OK);
    await fetchIGDBCovers('Portal 2');
    assertEq(calls2.filter(c => c.url.includes('id.twitch.tv')).length, 0, 'nenhum pedido novo de token');
    assertEq(calls2.filter(c => c.url.includes('api.igdb.com')).length, 1, 'só a consulta vai para a rede');
});

test('IGDB: a consulta é Apicalypse (texto) e passa pelo Worker com Client-ID e Bearer', async () => {
    setIgdbClient('id-abc', 'secret-xyz');
    clearIgdbToken();
    const calls = stubFetch(ROTAS_OK);
    await fetchIGDBCovers('The Witcher 3: Wild Hunt');
    const q = calls.find(c => c.url.includes('api.igdb.com'));
    assert(q.url.startsWith('https://worker-rapid-dawn-e634.cyromtg.workers.dev/?url='), 'sai pelo Worker do projeto (a IGDB não manda CORS)');
    assert(q.url.includes(encodeURIComponent('https://api.igdb.com/v4/games')), 'destino codificado no ?url=');
    assertEq(q.opts.method, 'POST', 'consulta é POST');
    assertEq(q.opts.headers['Client-ID'], 'id-abc', 'Client-ID no cabeçalho');
    assertEq(q.opts.headers['Authorization'], 'Bearer tok-1', 'Bearer do token da Twitch');
    assert(/^\s*search "/.test(q.opts.body), `corpo no formato de consulta da IGDB (obtido: ${q.opts.body})`);
    assert(q.opts.body.includes('cover.image_id'), 'pede o image_id da capa');
    assert(!String(q.opts.body).trim().startsWith('{'), 'corpo NÃO é JSON');
    // títulos com aspas/barra não quebram a sintaxe da consulta
    const calls2 = stubFetch(ROTAS_OK);
    await fetchIGDBCovers('Jogo "Aspas" \\ Barra');
    const q2 = calls2.find(c => c.url.includes('api.igdb.com'));
    assertEq((q2.opts.body.match(/"/g) || []).length, 2, 'só as duas aspas do search');
});

test('IGDB: token recusado (401) renova sozinho e a busca continua', async () => {
    setIgdbClient('id-abc', 'secret-xyz');
    clearIgdbToken();
    let buscas = 0, tokens = 0;
    const calls = stubFetch([
        ['id.twitch.tv/oauth2/token', () => { tokens++; return { json: { access_token: 'tok-' + tokens + '-' + Date.now(), expires_in: 5184000 } }; }],
        ['api.igdb.com', () => { buscas++; return buscas === 1 ? { ok: false, status: 401, text: 'expired' } : GAMES_OK; }],
    ]);
    const covers = await fetchIGDBCovers('Portal 2');
    assertEq(covers.length, 1, 'achou a capa depois de renovar o token');
    assertEq(tokens, 2, 'pediu um token novo');
    assertEq(buscas, 2, 'tentou a consulta duas vezes');
    assertEq(calls.filter(c => c.url.includes('id.twitch.tv')).length, 2, 'duas idas à Twitch');
});

test('IGDB: Worker desatualizado (host fora da lista) explica o que fazer', async () => {
    setIgdbClient('id-abc', 'secret-xyz');
    clearIgdbToken();
    stubFetch([
        ['id.twitch.tv/oauth2/token', TOKEN_OK],
        ['api.igdb.com/v4/games', { ok: false, status: 400, text: 'Host fora da lista permitida do ZeraLog.' }],
    ]);
    const r = await igdbSelfTest('Portal 2');
    assertEq(r.ok, false, 'teste falha com resposta clara');
    assert(/Worker/i.test(r.error) && /steam-proxy/i.test(r.error), `mensagem manda atualizar o Worker (obtido: ${r.error})`);
});

test('IGDB: "Testar IGDB" relata o jogo encontrado', async () => {
    setIgdbClient('id-abc', 'secret-xyz');
    clearIgdbToken();
    stubFetch(ROTAS_OK);
    const r = await igdbSelfTest();
    assertEq(r.ok, true, 'ok');
    assertEq(r.name, 'Portal 2', 'nome do jogo no teste');
    assert(String(r.cover).includes('co1r7f.jpg'), 'capa do teste');
});

test('IGDB: Twitch recusando as credenciais não vira erro feio na tela', async () => {
    setIgdbClient('id-errado', 'secret-errado');
    clearIgdbToken();
    stubFetch([['id.twitch.tv/oauth2/token', { ok: false, status: 400, text: '{"message":"invalid client"}' }]]);
    const r = await igdbSelfTest();
    assertEq(r.ok, false, 'falhou');
    assert(/Client ID/i.test(r.error), `mensagem aponta os campos (obtido: ${r.error})`);
    const covers = await fetchIGDBCovers('Portal 2');
    assertEq(covers.length, 0, 'a busca de capas segue vazia, sem quebrar a tela');
    setIgdbClient('', '');   // não deixa credencial de teste vazando para os outros testes
});
