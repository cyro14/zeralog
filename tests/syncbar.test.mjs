// Testes do progresso das sincronizações (js/syncbar.js): a notificação vai para a
// BARRA DE NOTIFICAÇÕES do sistema (service worker, como a sessão) — a pílula
// flutuante que nascia em cima do hub de abas no celular saiu da tela de vez.
import { test, assert, assertEq, sleep, created } from './shim.mjs';
import { syncShow, syncHide } from '../js/syncbar.js';

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

test('syncShow pinta o progresso como notificação do sistema (sem pílula na tela)', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncShow('Steam: buscando capas', 3, 20);
        await sleep(5);
        assertEq(spy.shown.length, 1, 'uma notificação na barra');
        assertEq(spy.shown[0].opts.tag, 'zeralog-sync', 'tag fixa: os updates substituem a mesma notificação');
        assert(spy.shown[0].opts.body.includes('Steam: buscando capas'), 'o texto do progresso vai no corpo');
        assert(spy.shown[0].opts.body.includes('3/20'), 'com a contagem');
        assertEq(spy.shown[0].opts.silent, true, 'progresso silencioso (nada vibra a cada update)');
        assertEq(spy.shown[0].opts.icon, 'icons/logo-192.png', 'logo da PWA na notificação');
        assertEq(created.length, 0, 'nenhum elemento criado na tela — a pílula que cobria o hub de abas não existe mais');
    } finally { cleanSW(); }
});

test('syncHide fecha a notificação ao terminar', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncHide();
        await sleep(5);
        assertEq(spy.gotTag, 'zeralog-sync', 'buscou a notificação pela tag');
        assertEq(spy.closed, 1, 'notificação fechada');
    } finally { cleanSW(); }
});

test('syncHide com texto mostra o resultado antes de fechar (fechamento automático depois)', async () => {
    let spy;
    try {
        spy = fakeSW();
        await syncHide('Steam: capas prontas!');
        await sleep(5);
        assert(spy.shown.some(s => (s.opts.body || '').includes('capas prontas')), 'texto final na barra de notificações');
        assertEq(spy.closed, 0, 'a notificação final fica um pouco à mostra antes de fechar sozinha');
    } finally { cleanSW(); }
});

test('sem permissão de notificação nada acontece — e nada explode em navegador sem suporte', async () => {
    const spy = { shown: [] };
    try {
        globalThis.Notification = class { static permission = 'denied'; };
        globalThis.navigator.serviceWorker = { ready: Promise.resolve({ async showNotification() { spy.shown.push(1); }, async getNotifications() { return []; } }) };
        await syncShow('GOG: buscando dados e capas', 1, 10);
        await syncHide('Steam: fim');
        await syncHide();
        assertEq(spy.shown.length, 0, 'bloqueada: nada chega na barra');
        delete globalThis.Notification;   // navegador sem suporte (o shim do Node nasce assim)
        await syncShow('Epic: buscando dados e capas', 1, 10);
        await syncHide('Epic: fim');
        await syncHide();
        assertEq(spy.shown.length, 0, 'sem Notification definida: os fluxos das lojas seguem de pé');
    } finally { cleanSW(); }
});
