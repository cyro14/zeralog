// Testes do banco local (js/store.js): migração de dados e padrões.
// O migrateData roda no carregamento de TODO usuário — erros aqui são críticos.
import { test, assert, assertEq } from './shim.mjs';
import { defaultData, migrateData } from '../js/store.js';

test('defaultData tem o formato esperado (listas e configurações)', () => {
    for (const k of ['categories', 'games', 'wikis', 'wishlist', 'savedFilters', 'collapsedCats', 'unlockedAchievements'])
        assert(Array.isArray(defaultData[k]), `defaultData.${k} é lista`);
    assert(typeof defaultData.settings === 'object', 'settings é objeto');
    assert(Array.isArray(defaultData.platforms) && defaultData.platforms.length > 0, 'plataformas padrão existem');
});

test('migrateData: usuário novo recebe Prateleira limpa ligada por padrão', () => {
    const d = migrateData({});
    assertEq(d.settings.shelfPlain, true);
});

test('migrateData: usuário antigo que nunca tocou no toggle ganha o novo padrão', () => {
    const d = migrateData({ settings: {} });
    assertEq(d.settings.shelfPlain, true);
});

test('migrateData: quem desligou a Prateleira limpa continua desligado (nada é sobrescrito)', () => {
    const d = migrateData({ settings: { shelfPlain: false } });
    assertEq(d.settings.shelfPlain, false);
});

test('migrateData: dado corrompido vira um banco válido sem perder o que deu para salvar', () => {
    const d = migrateData('lixo');
    assert(Array.isArray(d.games), 'games volta a ser lista');
    assert(d.settings.shelfPlain === true || d.settings.shelfPlain === false, 'settings existe');
    const d2 = migrateData({ games: 'não é lista', settings: { sort: 'az' } });
    assertEq(d2.settings.sort, 'az', 'configuração válida é preservada');
    assert(Array.isArray(d2.games), 'campo inválido é corrigido');
});

test('migrateData: filtros salvos por aba sempre existem como listas', () => {
    const d = migrateData({ settings: { filters: { home: 'quebrou' } } });
    assert(Array.isArray(d.settings.filters.home), 'filtro inválido vira lista');
    for (const t of ['home', 'finished', 'wish'])
        assert(Array.isArray(d.settings.filters[t]), `filters.${t} é lista`);
});

test('migrateData: o modo "cards" foi removido — quem tinha "list" volta para "shelf"', () => {
    // vShelfDefault=1 simula usuário existente (a migração one-time já rodou)
    const d = migrateData({ settings: { homeView: 'list', wishView: 'list', finishedView: 'list', vShelfDefault: 1 } });
    assertEq(d.settings.homeView, 'shelf', 'home');
    assertEq(d.settings.wishView, 'shelf', 'wish');
    assertEq(d.settings.finishedView, 'shelf', 'finished');
    // quem já tinha shelf/timeline não é mexido
    const d2 = migrateData({ settings: { homeView: 'shelf', finishedView: 'timeline', vShelfDefault: 1 } });
    assertEq(d2.settings.finishedView, 'timeline', 'timeline preservado');
});
