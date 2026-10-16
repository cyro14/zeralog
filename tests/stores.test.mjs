// Testes dos logos das lojas/conexões (js/stores.js + js/icons.js + js/steam.js):
// toda loja com o mesmo ícone-proporção em hub, categoria e plataforma — e os
// arquivos da pasta icons/ realmente existem.
import { test, assert, assertEq } from './shim.mjs';
import { appData } from '../js/store.js';
import { applyStoreCatIcons } from '../js/stores.js';
import { STORE_ICONS, brandImg } from '../js/icons.js';
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
    assert(String(appData.platforms.find(p => p.name === 'GOG').icon).includes('gog-galaxy.jpg'), 'SVG antigo atualizado');
    assertEq(typeof appData.platforms.find(p => p.name === 'Epic Games').icon, 'object', 'custom preservado');
    assert(String(appData.platforms.find(p => p.name === 'Amazon Games').icon).includes('brand-ico'), 'sem ícone ganha o logo');
});

test('anyIconHtml: Phosphor vira <i>, logo HTML passa direto, lixo vira vazio', () => {
    assert(anyIconHtml({ name: 'sword', weight: 'fill' }).includes('ph-ico'), 'phosphor renderiza');
    assertEq(anyIconHtml(brandImg('icons/Steam.webp')), brandImg('icons/Steam.webp'), 'logo HTML passa inteiro');
    assertEq(anyIconHtml('steam-logo'), '', 'nome solto não vira nada');
    assertEq(anyIconHtml(null), '', 'nulo não explode');
});
