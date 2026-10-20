// Testes dos logos das lojas/conexões (js/stores.js + js/icons.js + js/steam.js):
// toda loja com o mesmo ícone-proporção em hub, categoria e plataforma — e os
// arquivos da pasta icons/ realmente existem.
import { test, assert, assertEq, sleep } from './shim.mjs';
import { appData } from '../js/store.js';
import { applyStoreCatIcons, gogSaveCode, epicSaveCode, cleanStoreTitle, enrichStoreGames } from '../js/stores.js';
import { STORE_ICONS, brandImg, platformIcons } from '../js/icons.js';
import { anyIconHtml } from '../js/phosphor.js';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('STORE_ICONS: as 5 lojas com logo, e todo arquivo existe na pasta icons/', () => {
    for (const key of ['Steam', 'GOG', 'Epic Games', 'Itch.io', 'Amazon Games']) {
        assert(STORE_ICONS[key], `logo da ${key} definido`);
        assert(existsSync(join(ROOT, STORE_ICONS[key])), `arquivo ${STORE_ICONS[key]} existe`);
    }
    assert(brandImg('icons/Steam.webp').includes('class="brand-ico"'), 'brandImg usa a classe única de proporção');
});

test('applyStoreCatIcons: logo na categoria de cada loja, retroativo (inclusive Steam)', () => {
    appData.categories.push(
        { id: 'loj-steam', name: 'Steam' },
        { id: 'loj-gog', name: 'GOG' },
        { id: 'loj-epic', name: 'Epic Games' },
        { id: 'loj-itch', name: 'Itch.io' },
        { id: 'loj-amazon', name: 'Amazon Games' },
    );
    applyStoreCatIcons();
    for (const id of ['loj-steam', 'loj-gog', 'loj-epic', 'loj-itch', 'loj-amazon']) {
        const c = appData.categories.find(x => x.id === id);
        assert(c.icon && String(c.icon).includes(STORE_ICONS[c.name]), `categoria ${c.name} com o logo`);
        assert(String(c.icon).includes('brand-ico'), `${c.name}: mesmo HTML de proporção`);
    }
});

test('applyStoreCatIcons: preserva ícone que o usuário escolheu (phosphor próprio)', () => {
    appData.categories.push({ id: 'cx', name: 'Steam', icon: { name: 'sword', weight: 'fill' } });
    applyStoreCatIcons();
    const cat = appData.categories.find(c => c.id === 'cx');
    assertEq(typeof cat.icon, 'object', 'escolha própria mantida');
});

test('applyStoreCatIcons: o phosphor steam-logo antigo vira o logo de verdade', () => {
    appData.categories.push({ id: 'cy', name: 'Steam', icon: { name: 'steam-logo', weight: 'fill' } });
    applyStoreCatIcons();
    const cat = appData.categories.find(c => c.id === 'cy');
    assert(String(cat.icon).includes('Steam.webp'), 'trocado pelo logo');
});

test('applyStoreCatIcons: plataforma da loja troca o SVG antigo e preserva custom', () => {
    appData.platforms.push(
        { name: 'GOG', icon: '<img src="icons/gog.svg" alt="">' },   // padrão antigo do app
        { name: 'Epic Games', icon: { name: 'monitor', weight: 'fill' } },   // escolha do usuário
        { name: 'Amazon Games' },   // sem ícone
    );
    applyStoreCatIcons();
    assert(String(appData.platforms.find(p => p.name === 'GOG').icon).includes('gog-galaxy.webp'), 'SVG antigo atualizado');
    assertEq(typeof appData.platforms.find(p => p.name === 'Epic Games').icon, 'object', 'custom preservado');
    assert(String(appData.platforms.find(p => p.name === 'Amazon Games').icon).includes('brand-ico'), 'sem ícone ganha o logo');
});

test('applyStoreCatIcons: markup antigo com estilo inline (largura fixa em quadrado) é renovado', () => {
    appData.platforms.push({ name: 'Steam', icon: '<img src="icons/Steam.webp" alt="" style="width: 1.2em; height: 1.2em;">' });
    applyStoreCatIcons();
    const ic = String(appData.platforms.find(p => p.name === 'Steam').icon);
    assert(ic.includes('brand-ico') && !ic.includes('width: 1.2em'), 'vira a classe de altura única');
});

test('proporção: platformIcons usa a MESMA marcação (classe brand-ico) das lojas', () => {
    const pc = platformIcons['PC'];
    assert(String(pc).includes('class="brand-ico"') && !String(pc).includes('style='), 'sem estilo inline');
});

// O GOG trocou o logo .jpg por .webp: quem já tinha o ícone SALVO com o arquivo
// antigo ficava com um <img> apontando para o arquivo que não existe mais — um 404
// no console do navegador a cada abertura do app. A passada do boot tem que limpar.
test('applyStoreCatIcons: gog-galaxy.jpg antigo (categoria e plataforma) vira o .webp', () => {
    appData.categories.push({ id: 'loj-gog-velha', name: 'GOG', icon: brandImg('icons/gog-galaxy.jpg') });
    appData.platforms.push({ name: 'GOG', icon: brandImg('icons/gog-galaxy.jpg') });
    applyStoreCatIcons();
    const cat = String(appData.categories.find(c => c.id === 'loj-gog-velha').icon);
    const plat = String(appData.platforms.find(p => p.name === 'GOG').icon);
    assert(cat.includes('icons/gog-galaxy.webp') && !cat.includes('.jpg'), 'categoria com o logo novo');
    assert(plat.includes('icons/gog-galaxy.webp') && !plat.includes('.jpg'), 'plataforma com o logo novo');
    // ícone de imagem escolhido pelo usuário (outro arquivo seu) continua intocado
    appData.platforms.push({ name: 'Itch.io', icon: '<img src="data:image/png;base64,MEU">' });
    applyStoreCatIcons();
    assert(String(appData.platforms.find(p => p.name === 'Itch.io').icon).includes('base64,MEU'), 'escolha do usuário preservada');
});

test('anyIconHtml: Phosphor vira <i>, logo HTML passa direto, lixo vira vazio', () => {
    assert(anyIconHtml({ name: 'sword', weight: 'fill' }).includes('ph-ico'), 'phosphor renderiza');
    assertEq(anyIconHtml(brandImg('icons/Steam.webp')), brandImg('icons/Steam.webp'), 'logo HTML passa inteiro');
    assertEq(anyIconHtml('steam-logo'), '', 'nome solto não vira nada');
    assertEq(anyIconHtml(null), '', 'nulo não explode');
});

// Os logins de GOG/Epic terminam numa página de erro com o código no endereço —
// o usuário só cola esse endereço. Aqui o fluxo inteiro roda com a rede mockada.
test('GOG: colar o endereço depois do login (?code=...) conecta e importa a biblioteca', async () => {
    globalThis.fetch = async url => {
        const u = String(url);
        if (u.includes('auth.gog.com'))
            return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'TOKEN_GOG', refresh_token: 'REFR_GOG', user_id: 'u1', expires_in: 3600 }) };
        if (u.includes('embed.gog.com'))
            return { ok: true, status: 200, text: async () => JSON.stringify({ owned: [1207658924, 2083224] }) };
        if (u.includes('api.gog.com'))
            return { ok: true, status: 200, text: async () => JSON.stringify({
                1207658924: { title: 'The Witcher 3: Wild Hunt' },
                2083224: { title: 'ControlAmazon Prime' }   // jogo resgatado pela Prime: nome vem sujo da GOG
            }) };
        // RAWG/capas (enriquecimento em segundo plano): vazio, nada de rede
        return { ok: true, status: 200, text: async () => '{}', json: async () => ({ results: [] }), blob: async () => new Blob(['x'], { type: 'image/jpeg' }) };
    };
    document.getElementById('gog-code-input').value = 'https://embed.gog.com/on_login_success?origin=client&code=CODIGO_ABC123XYZ';
    // jogo que já entrou SUJO numa sincronização antiga: a sync nova renomeia
    // para o título limpo em vez de criar um segundo registro
    appData.games.push({ id: 'gog-velho', title: 'GhostrunnerAmazon Prime', platform: 'GOG', store: 'gog', catId: 'c', genres: [] });
    await gogSaveCode();
    await sleep(500);   // gogSync e o enriquecimento rodam em segundo plano
    assertEq(appData.settings.stores.gog.token, 'TOKEN_GOG', 'endereço colado trocado por token');
    assertEq(appData.settings.stores.gog.userId, 'u1', 'usuário da conta salvo');
    const gogGames = appData.games.filter(g => g.store === 'gog');
    assertEq(gogGames.length, 3, 'os jogos da conta entraram na categoria GOG');
    assert(gogGames.some(g => g.title === 'Control'), 'o jogo da Prime entrou com o nome LIMPO');
    assert(!gogGames.some(g => /amazon|prime/i.test(g.title)), 'nenhum sufixo de promoção no nome dos jogos');
    const velho = appData.games.find(g => g.id === 'gog-velho');
    assertEq(velho.title, 'Ghostrunner', 'o jogo antigo foi RENOMEADO (limpo), não duplicado');
});

test('cleanStoreTitle: sufixos de promoção da GOG saem do nome (títulos legítimos ficam)', () => {
    assertEq(cleanStoreTitle('GhostrunnerAmazon Prime'), 'Ghostrunner', 'colado, sem separador');
    assertEq(cleanStoreTitle('Control (Amazon Prime)'), 'Control', 'com parêntese');
    assertEq(cleanStoreTitle('Ghostrunner 2 — Amazon Prime Gaming'), 'Ghostrunner 2', 'travessão e "Gaming"');
    assertEq(cleanStoreTitle('Some Game - Prime Gaming'), 'Some Game', 'só "Prime Gaming"');
    assertEq(cleanStoreTitle('The Witcher 3: Wild Hunt'), 'The Witcher 3: Wild Hunt', 'nome limpo intocado');
    assertEq(cleanStoreTitle('Metroid Prime'), 'Metroid Prime', '"Prime" legítimo no fim não é mexido');
    assertEq(cleanStoreTitle(''), '', 'vazio não explode');
});

test('enriquecimento acha o jogo BASE quando a loja colou "Gold Edition" no nome', async () => {
    // A RAWG responde com o jogo base — antes o casamento era EXATO com o título
    // da loja ("Gothic II Gold Edition") e os dados/capas nunca chegavam.
    globalThis.fetch = async url => {
        const u = String(url);
        if (u.includes('api.rawg.io/api/games?'))
            return { ok: true, status: 200, text: async () => JSON.stringify({ results: [
                { id: 77, name: 'Gothic II', released: '2002-11-29', genres: [{ name: 'RPG' }] }
            ] }), json: async () => ({ results: [
                { id: 77, name: 'Gothic II', released: '2002-11-29', genres: [{ name: 'RPG' }] }
            ] }) };
        // capas/wikis/Steam: vazio, nada de rede
        return { ok: true, status: 200, text: async () => '{}', json: async () => ({}), blob: async () => new Blob(['x'], { type: 'image/jpeg' }) };
    };
    const g = { id: 'gx', title: 'Gothic II Gold Edition', platform: 'GOG', store: 'gog', catId: 'c', genres: [], rawgId: null, image: null, state: null };
    await enrichStoreGames([g]);
    assertEq(g.rawgId, 77, 'casou com o jogo base da RAWG (pelo título sem edição)');
    assertEq(g.genres.length, 1, 'gênero do jogo base preenchido');
    assert(g.released, 'ano de lançamento preenchido');
});

test('Epic: colar o endereço da página final (localhost/launcher/authorized?code=...) conecta', async () => {
    globalThis.fetch = async url => {
        const u = String(url);
        if (u.includes('account-public-service-prod03'))
            return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'TOKEN_EPIC', refresh_token: 'REFR_EPIC', expires_in: 7200, displayName: 'Zé' }) };
        if (u.includes('library-service.live.use1a.on.epicgames.com'))
            return { ok: true, status: 200, text: async () => JSON.stringify({ records: [] }) };
        return { ok: true, status: 200, text: async () => '{}', json: async () => ({ results: [] }), blob: async () => new Blob(['x'], { type: 'image/jpeg' }) };
    };
    document.getElementById('epic-code-input').value = 'https://localhost/launcher/authorized?code=abc123def4567890abc123def4567890';
    await epicSaveCode();
    await sleep(30);   // a sincronização da biblioteca roda em segundo plano
    assertEq(appData.settings.stores.epic.token, 'TOKEN_EPIC', 'código do endereço trocado por token');
    assertEq(appData.settings.stores.epic.user, 'Zé', 'nome da conta salvo');
});
