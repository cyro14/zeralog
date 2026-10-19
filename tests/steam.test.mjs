// Testes da conexão com a Steam (js/steam.js): persona/avatar, configurações e o
// fluxo "só login e sincroniza" (sem chave própria — o Worker injeta a padrão).
// A rede é mockada — nenhum proxy real é chamado.
import { test, assert, assertEq, mockFetch, elById, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { fetchPersona, steamSaveKey, steamLogout, steamSync, initSteam } from '../js/steam.js';

const SUMMARY = {
    response: { players: [{
        personaname: 'TestePersona',
        avatar: 'https://avatars/32.jpg',             // 32px
        avatarmedium: 'https://avatars/64_medium.jpg', // 64px (o antigo, borrava no perfil)
        avatarfull: 'https://avatars/steam_full.jpg',  // 184px — é este que o perfil usa
    }] },
};

test('fetchPersona guarda o avatar FULL (não o de 64px que ficava borrado)', async () => {
    appData.settings.steam = { steamId: '76561197960287930', apiKey: 'CHAVE' };
    mockFetch([['GetPlayerSummaries', SUMMARY]]);
    await fetchPersona();
    assertEq(appData.settings.steam.avatar, 'https://avatars/steam_full.jpg', 'avatarfull tem prioridade');
    assertEq(appData.settings.steam.persona, 'TestePersona', 'persona salvo');
});

test('fetchPersona sem login não faz nada (nem erro)', async () => {
    appData.settings.steam = { steamId: null, apiKey: '' };
    await fetchPersona();
    assertEq(appData.settings.steam.avatar, undefined, 'nada foi gravado');
});

test('fetchPersona SEM chave própria usa a do servidor (Worker) e salva o perfil', async () => {
    appData.settings.steam = { steamId: '76561197960287930' };   // sem apiKey: a chave vem do Worker
    mockFetch([['GetPlayerSummaries', SUMMARY]]);
    await fetchPersona();
    assertEq(appData.settings.steam.persona, 'TestePersona', 'persona salvo sem chave própria');
    assertEq(appData.settings.steam.avatar, 'https://avatars/steam_full.jpg', 'avatarfull salvo');
});

test('steamSaveKey guarda a chave sem espaços', () => {
    appData.settings.steam = {};
    steamSaveKey('  ABC123  ');
    assertEq(appData.settings.steam.apiKey, 'ABC123', 'trim aplicado');
});

test('steamLogout desconecta o usuário mas mantém chave e proxy configurados', () => {
    appData.settings.steam = { steamId: '123', persona: 'X', avatar: 'https://a.jpg', apiKey: 'CHAVE', proxy: 'https://p.com/?url=%s', catId: 'c1', lastSync: 1, lastCount: 2 };
    steamLogout();
    const s = appData.settings.steam;
    assertEq(s.steamId, null, 'steamId limpo');
    assertEq(s.avatar, '', 'avatar limpo');
    assertEq(s.persona, '', 'persona limpo');
    assertEq(s.apiKey, 'CHAVE', 'chave preservada');
    assertEq(s.proxy, 'https://p.com/?url=%s', 'proxy preservado');
});

test('Steam avisa o topo quando a foto muda (zeralog:photo-changed)', async () => {
    // A coroa do header só vira foto quando o topo é repinto — quem pinta são os
    // círculos do GameMatch. Ao chegar avatar (fetchPersona) e ao desconectar a
    // conta (steamLogout) a Steam dispara o evento para repintar.
    const fired = [];
    const orig = document.dispatchEvent;
    document.dispatchEvent = ev => { fired.push(ev.type); return true; };
    try {
        appData.settings.steam = { steamId: '76561197960287930', apiKey: 'CHAVE' };
        mockFetch([['GetPlayerSummaries', SUMMARY]]);
        await fetchPersona();
        assert(fired.includes('zeralog:photo-changed'), 'avatar chegando dispara o evento (coroa → foto)');
        appData.settings.steam = { steamId: '123', persona: 'X', avatar: 'https://a.jpg', apiKey: 'CHAVE', proxy: 'https://p.com/?url=%s', catId: 'c1', lastSync: 1, lastCount: 2 };
        steamLogout();
    } finally { document.dispatchEvent = orig; }
    assertEq(fired.filter(t => t === 'zeralog:photo-changed').length, 2, 'desconectar também dispara (foto → coroa)');
});

test('steamSync sem chave própria NÃO envia key= (o Worker injeta a padrão)', async () => {
    appData.settings.steam = { steamId: '76561197960287930' };   // sem apiKey
    const calls = [];
    const dec = u => { try { return decodeURIComponent(String(u)); } catch (e) { return String(u); } };   // o proxy encodeia a URL inteira
    globalThis.fetch = async url => {
        calls.push(String(url));
        return { ok: true, status: 200, text: async () => JSON.stringify({ response: { game_count: 0 } }) };
    };
    await steamSync();
    assert(calls.some(u => dec(u).includes('steamid=76561197960287930')), 'chamou a Steam com o steamid');
    assert(!calls.some(u => /key=/.test(dec(u))), 'nenhuma chamada com parâmetro key (nem o literal key=undefined)');
    assert(appData.settings.steam.lastSync, 'sincronização concluiu');
});

test('steamSync com chave própria envia a chave do usuário na URL', async () => {
    appData.settings.steam = { steamId: '76561197960287930', apiKey: 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6' };
    const calls = [];
    const dec = u => { try { return decodeURIComponent(String(u)); } catch (e) { return String(u); } };
    globalThis.fetch = async url => {
        calls.push(String(url));
        return { ok: true, status: 200, text: async () => JSON.stringify({ response: { game_count: 0 } }) };
    };
    await steamSync();
    assert(calls.some(u => dec(u).includes('key=A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6')), 'a chave do usuário vai na chamada');
});

test('login OpenID com a chave do servidor: conecta e sincroniza sozinho (não pede chave)', async () => {
    appData.settings.steam = {};
    const toasts = [];
    mockFetch([
        ['GetOwnedGames', { response: { game_count: 0, games: [] } }],
        ['GetPlayerSummaries', { response: { players: [] } }],
    ]);
    try {
        globalThis.location.search = '?openid.mode=id_res&openid.claimed_id=http://steamcommunity.com/openid/id/76561198000000001';
        initSteam({ render() {}, toast: m => toasts.push(m), undo() {} });
        assertEq(appData.settings.steam.steamId, '76561198000000001', 'SteamID capturado do retorno do OpenID');
        assert(toasts.some(m => String(m).includes('Sincronizando')), 'a sincronização dispara sozinha depois do login');
        assert(!toasts.some(m => String(m).includes('Cole sua chave')), 'ninguém é obrigado a digitar chave');
        await sleep(30);   // deixa a steamSync de segundo plano terminar
    } finally {
        globalThis.location.search = '';
        initSteam({});   // devolve os hooks do módulo ao neutro
    }
});

test('Steam responde 400 (servidor sem a chave padrão): mensagem aponta o conserto', async () => {
    appData.settings.steam = { steamId: '76561197960287930' };   // sem apiKey
    globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => "Required parameter 'key' is missing" });
    await steamSync();
    const msg = elById('steam-sync-status').textContent;
    assert(msg.includes('STEAM_DEFAULT_KEY'), 'mensagem menciona a variável do Worker');
    assert(!appData.settings.steam.lastSync, 'nada foi marcado como sincronizado');
});
