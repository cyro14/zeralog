// Testes do progresso das sincronizações (js/syncbar.js): a notificação vai para a
// BARRA DE NOTIFICAÇÕES do sistema (service worker, como a sessão) — com o ÍCONE DA
// PLATAFORMA e o BANNER com a BARRA DE PROGRESSO desenhados na hora — e o fim da
// sincronização é GRAVADO na central de notificações (o sino), com o logo da loja.
import { test, assert, assertEq, sleep, created } from './shim.mjs';
import { appData } from '../js/store.js';
import { syncShow, syncHide, syncAskPermission } from '../js/syncbar.js';
import { STORE_ICONS } from '../js/icons.js';

// Service worker + Notification de mentira: os espiões registram tudo o que a
// barra de notificações receberia.
function fakeSW() {
    const spy = { shown: [], closed: 0, gotTag: null };
    const reg = {
        async showNotification(title, opts) { spy.shown.push({ title, opts }); },
        async getNotifications(q) { spy.gotTag = q && q.tag; return [{ close() { spy.closed++; } }]; },
    };
    globalThis.Notification = class { static permission = 'granted'; };
    globalThis.navigator.serviceWorker = { ready: Promise.resolve(reg) };
    return spy;
}
function cleanSW() { delete globalThis.Notification; delete globalThis.navigator.serviceWorker; }

test('syncShow leva o ÍCONE da plataforma e o BANNER com a barra de progresso', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncShow('Steam: buscando capas', 3, 20, 'steam');
        await sleep(5);
        assertEq(spy.shown.length, 1, 'uma notificação na barra');
        assertEq(spy.shown[0].opts.tag, 'zeralog-sync', 'tag fixa: os updates substituem a mesma notificação');
        assertEq(spy.shown[0].opts.icon, 'data:image/png;base64,TESTE', 'ícone = logo da plataforma desenhado no canvas');
        assertEq(spy.shown[0].opts.image, 'data:image/png;base64,TESTE', 'banner com a barra de progresso vai no image da notificação');
        assert(spy.shown[0].opts.body.includes('3/20'), 'contagem no corpo');
        assertEq(spy.shown[0].opts.silent, true, 'progresso silencioso (nada vibra a cada update)');
        assert(!created.some(el => (el.id || '') === 'syncbar'), 'nada de pílula flutuante na tela');
    } finally { cleanSW(); }
});

test('syncShow sem plataforma conhecida cai no logo do app (retrocompatibilidade)', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncShow('Biblioteca: buscando dados e capas', 1, 10);
        await sleep(5);
        assertEq(spy.shown[0].opts.icon, 'icons/logo-192.png', 'ícone padrão do ZeraLog');
    } finally { cleanSW(); }
});

test('o ícone da plataforma é cacheado (não redesenha a cada progresso)', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncShow('GOG: buscando dados e capas', 1, 10, 'gog');
        await syncShow('GOG: buscando dados e capas', 2, 10, 'gog');
        assertEq(spy.shown.length, 2, 'duas atualizações de progresso');
        assertEq(spy.shown[0].opts.icon, spy.shown[1].opts.icon, 'mesmo ícone entre updates (cache por loja)');
    } finally { cleanSW(); }
});

test('syncHide fecha a notificação ao terminar (sem resumo, sem registro)', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncHide();
        await sleep(5);
        assertEq(spy.gotTag, 'zeralog-sync', 'buscou a notificação pela tag');
        assertEq(spy.closed, 1, 'notificação fechada');
        assertEq(appData.notifications.length, 0, 'nada foi gravado no sino (não há o que registrar)');
    } finally { cleanSW(); }
});

test('syncHide com resumo GRAVA no registro (sino) com o logo da plataforma', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncHide('Steam: capas prontas!', 'steam');
        await sleep(5);
        const n = appData.notifications[0];
        assertEq(n.kind, 'sync', 'kind sync no registro');
        assertEq(n.title, 'Steam · Sincronização', 'título com a plataforma que atualizou');
        assertEq(n.text, 'Steam: capas prontas!', 'resumo da finalização gravado');
        assertEq(n.logo, STORE_ICONS['Steam'], 'logo da loja (aparece no painel do sino)');
        assert(spy.shown.some(s => (s.opts.body || '').includes('capas prontas')), 'aviso final também na barra do sistema');
        assertEq(spy.closed, 0, 'o aviso final fica à mostra antes de fechar sozinho');
    } finally { cleanSW(); }
});

test('sem permissão da barra do sistema: o progresso não vai, mas o FIM AINDA GRAVA no sino', async () => {
    let spy;
    try {
        spy = fakeSW();
        globalThis.Notification = class { static permission = 'denied'; };
        await syncShow('GOG: buscando dados e capas', 1, 10, 'gog');
        assertEq(spy.shown.length, 0, 'bloqueada: progresso não chega na barra');
        await syncHide('GOG: dados e capas de 5/9 jogos.', 'gog');
        assertEq(spy.shown.length, 0, 'nada na barra do sistema sem permissão');
        const n = appData.notifications[0];
        assert(n && n.title === 'GOG · Sincronização', 'o registro do app funciona de qualquer jeito');
        delete globalThis.Notification;   // navegador sem suporte: os fluxos das lojas seguem de pé
        await syncShow('Epic: buscando dados e capas', 1, 10, 'epic');
        await syncHide('Epic: dados e capas de 2/4 jogos.', 'epic');
        assert(appData.notifications.some(x => x.title === 'Epic Games · Sincronização'), 'registro do fim sem Notification definida');
    } finally { cleanSW(); }
});

test('syncAskPermission: o app PERGUNTA na primeira sincronização — e nunca mais', () => {
    const calls = [];
    try {
        globalThis.Notification = class {
            static permission = 'default';
            static requestPermission() { calls.push('ask'); this.permission = 'granted'; return Promise.resolve('granted'); }
        };
        syncAskPermission();
        assertEq(calls.length, 1, 'primeira vez: o prompt da barra de notificações aparece');
        syncAskPermission();
        syncAskPermission();
        assertEq(calls.length, 1, 'concedida: não pergunta de novo');
        globalThis.Notification = class { static permission = 'denied'; static requestPermission() { calls.push('ask'); return Promise.resolve('denied'); } };
        syncAskPermission();
        assertEq(calls.length, 1, 'bloqueada: nunca mais incomoda');
        delete globalThis.Notification;
        syncAskPermission();   // WebView sem suporte: não explode
    } finally { cleanSW(); }
});
