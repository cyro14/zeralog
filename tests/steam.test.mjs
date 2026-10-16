// Testes da conexão com a Steam (js/steam.js): persona/avatar e configurações.
// A rede é mockada — nenhum proxy real é chamado.
import { test, assert, assertEq, mockFetch } from './shim.mjs';
import { appData } from '../js/store.js';
import { fetchPersona, steamSaveKey, steamLogout } from '../js/steam.js';

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

test('fetchPersona sem login ou sem chave não faz nada (nem erro)', async () => {
    appData.settings.steam = { steamId: null, apiKey: '' };
    await fetchPersona();
    assertEq(appData.settings.steam.avatar, undefined, 'nada foi gravado');
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
