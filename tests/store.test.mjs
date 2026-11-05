// Testes do banco local (js/store.js): migração de dados e padrões.
// O migrateData roda no carregamento de TODO usuário — erros aqui são críticos.
import { test, assert, assertEq } from './shim.mjs';
import { defaultData, migrateData } from '../js/store.js';

test('defaultData tem o formato esperado (listas e configurações)', () => {
    for (const k of ['categories', 'games', 'wikis', 'wishlist', 'savedFilters', 'collapsedCats', 'unlockedAchievements'])
        assert(Array.isArray(defaultData[k]), `defaultData.${k} é lista`);
    assert(typeof defaultData.settings === 'object', 'settings é objeto');
    assert(Array.isArray(defaultData.platforms) && defaultData.platforms.length > 0, 'plataformas padrão existem');
    assertEq(defaultData.categories.length, 1, 'uma categoria só no banco novo');
    assertEq(defaultData.categories[0].name, 'Principal', 'e ela se chama Principal');
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

test('migrateData: a linha do tempo agrupa por ANO por padrão (valor inválido cai em year)', () => {
    for (const d of [migrateData({}), migrateData({ settings: {} }), migrateData({ settings: { timelineGroup: 'dia' } })])
        assertEq(d.settings.timelineGroup, 'year', 'padrão por ano');
    // quem escolheu "Por mês" continua no mês
    assertEq(migrateData({ settings: { timelineGroup: 'month' } }).settings.timelineGroup, 'month', 'escolha preservada');
});

test('migrateData: as duas categorias padrão antigas viram uma só, "Principal"', () => {
    const d = migrateData({
        categories: [{ id: 'c1', name: 'Cartas e Estratégia' }, { id: 'c2', name: 'Plataforma 3D' }],
        games: [
            { id: 'g1', title: 'Da Removida', platform: 'PC', catId: 'c2' },
            { id: 'g2', title: 'Da Principal', platform: 'PC', catId: 'c1' }
        ],
        collapsedCats: ['c2'],
        settings: { steam: { catId: 'c2' }, stores: { gog: { catId: 'c2' }, epic: { catId: 'c1' } } }
    });
    assertEq(d.categories.length, 1, 'uma categoria só');
    assertEq(d.categories[0].name, 'Principal');
    assertEq(d.categories[0].id, 'c1', 'a Principal herda o id da antiga (a referência dos jogos dela continua válida)');
    assertEq(d.games.find(g => g.id === 'g1').catId, 'c1', 'jogos da categoria removida migram');
    assertEq(d.games.find(g => g.id === 'g2').catId, 'c1', 'jogos da Principal ficam onde estão');
    assert(!d.collapsedCats.includes('c2'), 'colapsada órfã sai da lista');
    assertEq(d.settings.steam.catId, 'c1', 'categoria da Steam sincronizada remigra');
    assertEq(d.settings.stores.gog.catId, 'c1', 'categoria da loja remigra');
    assertEq(d.settings.stores.epic.catId, 'c1', 'loja que já apontava para a Principal fica');
    // idempotente: rodar de novo não mexe em nada
    const d2 = migrateData(JSON.parse(JSON.stringify(d)));
    assertEq(d2.categories.length, 1, 'continua uma');
    assertEq(d2.categories[0].name, 'Principal');
});

test('migrateData: categorias personalizadas não são mexidas pela migração', () => {
    const d = migrateData({ categories: [{ id: 'c1', name: 'Backlog' }, { id: 'c2', name: 'Retro' }] });
    assertEq(d.categories.length, 2, 'as duas continuam');
    assertEq(d.categories[0].name, 'Backlog');
    assertEq(d.categories[1].name, 'Retro');
    // e quem tinha os padrões MAIS categorias próprias também não é tocado
    const d2 = migrateData({
        categories: [{ id: 'c1', name: 'Cartas e Estratégia' }, { id: 'c2', name: 'Plataforma 3D' }, { id: 'c3', name: 'Minha Lista' }]
    });
    assertEq(d2.categories.length, 3, 'personalizada preserva o conjunto inteiro');
    assertEq(d2.categories[2].name, 'Minha Lista');
});
