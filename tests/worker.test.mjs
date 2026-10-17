// Testes do Worker (steam-proxy/worker.js) — o único caminho para as APIs que não
// aceitam CORS: Steam(biblioteca/busca da loja), GOG, Epic, Itch.io, SteamGridDB,
// HowLongToBeat e IGDB.
//
// Guarda o que já quebrou de verdade:
//  - store.steampowered.com não estava na lista → a busca da loja respondia 400;
//  - o HLTB recusava (403) porque o Worker se apresentava como "ZeraLog/1.0" e não
//    mandava o Referer do site — precisa se apresentar como navegador;
//  - o token curto do HLTB (x-auth-token) e o Client-ID da IGDB não eram repassados.
import { test, assert, assertEq } from './shim.mjs';
import worker from '../steam-proxy/worker.js';

const W = 'https://worker.teste/';
const enc = encodeURIComponent;

// intercepta a chamada que o Worker faz para fora e devolve uma resposta qualquer
function spyFetch(status = 200, body = '{"ok":true}') {
    const seen = [];
    globalThis.fetch = async (url, init = {}) => {
        seen.push({ url: String(url), init });
        return new Response(body, { status, headers: { 'content-type': 'application/json' } });
    };
    return seen;
}

const call = (target, init = {}, env = {}) => worker.fetch(new Request(`${W}?url=${enc(target)}`, init), env);

test('Worker: preflight libera os cabeçalhos que o app manda (Client-ID, x-auth-token)', async () => {
    const res = await worker.fetch(new Request(W, { method: 'OPTIONS' }), {});
    assertEq(res.status, 200, 'responde o OPTIONS');
    assertEq(res.headers.get('access-control-allow-origin'), '*', 'CORS aberto');
    const allow = res.headers.get('access-control-allow-headers');
    for (const h of ['Client-ID', 'x-auth-token', 'Authorization', 'Content-Type'])
        assert(allow.includes(h), `preflight libera ${h} (obtido: ${allow})`);
});

test('Worker: busca da loja da Steam está liberada (era 400 "host fora da lista")', async () => {
    const seen = spyFetch(200, '{"total":1,"items":[]}');
    const res = await call('https://store.steampowered.com/api/storesearch/?term=portal&cc=us&l=en');
    assertEq(res.status, 200, 'a busca da Steam passa');
    assertEq(seen.length, 1, 'chamou a Steam de verdade');
    assert(seen[0].url.startsWith('https://store.steampowered.com/api/storesearch/'), 'destino certo');
    assertEq(res.headers.get('access-control-allow-origin'), '*', 'a resposta volta com CORS para o navegador');
});

test('Worker: no HowLongToBeat ele se apresenta como navegador (UA + Referer) e repassa o token', async () => {
    const seen = spyFetch(200, '{"data":[]}');
    await call('https://howlongtobeat.com/api/search/site', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-token': 'tok-123', 'user-agent': 'UA-do-app' },
        body: '{"searchTerms":["Portal 2"]}'
    });
    const h = seen[0].init.headers;
    assert(/^Mozilla\/5\.0/.test(h['User-Agent']), `User-Agent de navegador (obtido: ${h['User-Agent']})`);
    assertEq(h['Referer'], 'https://howlongtobeat.com/', 'Referer que o site exige (o navegador não deixa o app mandar)');
    assertEq(h['x-auth-token'], 'tok-123', 'token do HLTB repassado');
    assertEq(seen[0].init.method, 'POST', 'POST repassado');
    assertEq(seen[0].init.body, '{"searchTerms":["Portal 2"]}', 'corpo repassado');
});

test('Worker: a IGDB recebe Client-ID e Authorization e o corpo de consulta', async () => {
    const seen = spyFetch(200, '[]');
    await call('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'client-id': 'id-abc', authorization: 'Bearer tok-1', 'content-type': 'text/plain' },
        body: 'search "Portal 2"; fields name,cover.image_id;'
    });
    const h = seen[0].init.headers;
    assertEq(h['client-id'], 'id-abc', 'Client-ID repassado');
    assertEq(h['authorization'], 'Bearer tok-1', 'Bearer repassado');
    assertEq(h['content-type'], 'text/plain', 'Content-Type da consulta (Apicalypse, não JSON)');
    assert(seen[0].init.body.startsWith('search "'), 'corpo da consulta intacto');
});

test('Worker: host fora da lista é barrado sem tocar na internet', async () => {
    const seen = spyFetch();
    const res = await call('https://exemplo-malicioso.com/roubar');
    assertEq(res.status, 400, '400 para host não permitido');
    assertEq(seen.length, 0, 'nenhuma chamada externa');
});

test('Worker: a chave padrão da Steam só entra quando o app não manda uma', async () => {
    const seen = [];
    globalThis.fetch = async (url) => { seen.push(String(url)); return new Response('{}', { status: 200 }); };
    await call('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/', {}, { STEAM_DEFAULT_KEY: 'chave-do-dono' });
    await call('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=chave-do-usuario', {}, { STEAM_DEFAULT_KEY: 'chave-do-dono' });
    assert(seen[0].includes('key=chave-do-dono'), 'sem chave própria: usa a do dono do Worker');
    assert(seen[1].includes('key=chave-do-usuario') && !seen[1].includes('chave-do-dono'), 'a chave do usuário tem prioridade');
});

test('Worker: as lojas continuam recebendo o token delas (Authorization)', async () => {
    const seen = spyFetch(200, '{"owned":[]}');
    await call('https://embed.gog.com/user/data/games', { headers: { authorization: 'Bearer gog-token' } });
    assertEq(seen[0].init.headers['authorization'], 'Bearer gog-token', 'token da GOG repassado');
});
