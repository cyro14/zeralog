// Testes da Central de Notificações (js/notify.js): o sino do topo abre o
// registro de TUDO que o app avisou — sessões de jogo, lançamentos da wishlist
// e conquistas. Testa o registro em si (badge, limite, ler/limpar), o painel
// pintado e as INTEGRAÇÕES REAIS: checkReleases (releases.js), checkNew
// Achievements (ui.js) e o ciclo da sessão (session.js), incluindo a pausa
// feita pela notificação da barra com o app fechado (IndexedDB falso).
import { test, assert, assertEq, elById, sleep } from './shim.mjs';
import { appData, defaultData, migrateData } from '../js/store.js';
import { notifyPush, notifyToggle, notifyClose, notifyClear, notifyGo, notifyUnread, paintNotifBadge, renderNotificationCenter, fmtAgo, NOTIF_KINDS } from '../js/notify.js';
import { checkReleases } from '../js/releases.js';
import { checkNewAchievements } from '../js/ui.js';
import { initSession, startSession, pauseSession, resumeSession, sessionFinish, syncSessionFromIdb } from '../js/session.js';

const isoDaysFromNow = n => { const d = new Date(Date.now() + n * 86400000); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const kindOf = i => (appData.notifications[i] || {}).kind;
// o banco zera entre um teste e outro: a sessão precisa do jogo na lista
const addGame = (id, title) => appData.games.push({ id, title, platform: 'PC', genres: [], state: 'playing' });

// IndexedDB mínimo (o que session.js/releases.js usam): get/put/delete por chave
function fakeIndexedDb() {
    const store = new Map();
    const req = result => { const r = { result, onsuccess: null, onerror: null }; Promise.resolve().then(() => r.onsuccess && r.onsuccess({})); return r; };
    globalThis.indexedDB = {
        open() {
            const r = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
            Promise.resolve().then(() => {
                r.result = {
                    transaction() {
                        return {
                            objectStore() {
                                return {
                                    get(k) { return req(store.has(k) ? store.get(k) : null); },
                                    put(v, k) { store.set(k, v); return req(undefined); },
                                    delete(k) { store.delete(k); return req(undefined); }
                                };
                            }
                        };
                    }
                };
                r.onsuccess && r.onsuccess({});
            });
            return r;
        }
    };
    return store;
}

test('registro: notifyPush grava no topo, conta não lidas e pinta o badge dos dois sinos', () => {
    assertEq(appData.notifications.length, 0, 'começa vazio');
    notifyPush('session', 'Sessão iniciada', 'Hades');
    notifyPush('release', 'Jogo do Ano já está disponível!', 'Lançamento em 12 de março');
    notifyPush('achievement', 'Conquista: Primeiro Passo', 'Zerou seu primeiro jogo! (+25 XP)');
    assertEq(appData.notifications.length, 3, 'três registros');
    assertEq(appData.notifications[0].title, 'Conquista: Primeiro Passo', 'a mais nova fica no topo');
    assertEq(appData.notifications[2].text, 'Hades', 'a mais antiga no fim');
    assertEq(notifyUnread(), 3, 'três não lidas');
    for (const id of ['notif-badge', 'notif-badge-mob']) {
        assertEq(elById(id).textContent, '3', `badge ${id} com o contador`);
        assertEq(elById(id).hidden, false, `badge ${id} visível`);
    }
    // kind desconhecido não quebra: cai no padrão
    notifyPush('coisa-nenhuma', 'Título', '');
    assertEq(kindOf(0), 'session', 'kind inválido vira session');
    assertEq(appData.notifications[0].title, 'Título', 'registro do kind inválido entra');
});

test('registro: guarda no máximo as 60 mais recentes (o sino não vira um baú)', () => {
    for (let i = 0; i < 70; i++) notifyPush('session', `Sessão ${i}`, '');
    assertEq(appData.notifications.length, 60, 'cap em 60');
    assertEq(appData.notifications[0].title, 'Sessão 69', 'a última pushada (mais nova) sobrevive no topo');
    assertEq(appData.notifications[59].title, 'Sessão 10', 'as antigas descartam');
});

test('badge: acima de 9 vira "9+" e zera quando tudo é lido', () => {
    notifyClear();
    for (let i = 0; i < 12; i++) notifyPush('session', `S ${i}`, '');
    assertEq(elById('notif-badge').textContent, '9+', 'contador cheio abrevia');
    elById('notif-center').hidden = true;   // como no index.html, o painel nasce fechado
    notifyToggle();   // abrir marca tudo como lido
    assertEq(elById('notif-badge').hidden, true, 'sem não lidas, badge some');
    assertEq(elById('notif-badge-mob').hidden, true, 'no celular também');
});

test('painel: abre pintado com o destaque das não lidas e marca como lido ao abrir', () => {
    notifyClear();
    notifyPush('release', 'Silksong já está disponível!', 'Lançamento em 12 de março', { tab: 'wish' });
    notifyPush('session', 'Sessão pausada', 'Hades · 12 min');
    const panel = elById('notif-center');
    panel.hidden = true;   // no navegador, o hidden vem do próprio index.html
    notifyToggle();
    assertEq(panel.hidden, false, 'sino abre o painel');
    const html = elById('notif-list').innerHTML;
    assert(html.includes('Silksong já está disponível!'), 'título do lançamento pintado');
    assert(html.includes('Sessão pausada'), 'título da sessão pintado');
    assert(html.includes('unread'), 'as não lidas vêm destacadas');
    assert(html.includes('k-release') && html.includes('k-session'), 'ícone por origem (calendário e relógio)');
    assert(html.includes(`notifyGo('wish')`), 'lançamento é tocável e leva à aba Desejos');
    assert(html.includes('há ') || html.includes('agora'), 'idade do registro visível');
    assertEq(notifyUnread(), 0, 'abrir marcou tudo como lido');
    notifyToggle();
    assertEq(panel.hidden, true, 'sino de novo fecha');
});

test('painel: Limpar esvazia o registro e mostra o estado vazio convidativo', () => {
    notifyPush('session', 'Algo', '');
    notifyClear();
    assertEq(appData.notifications.length, 0, 'registro vazio');
    elById('notif-center').hidden = true;   // painel fechado, como no HTML
    notifyToggle();
    const html = elById('notif-list').innerHTML;
    assert(html.includes('Sem notificações'), 'mensagem de vazio');
    assert(html.includes('lançamentos da wishlist'), 'explica o que vai aparecer ali');
    notifyClose();
    assertEq(elById('notif-center').hidden, true, 'botão X fecha');
});

test('painel: tocar num lançamento fecha e leva à aba (sem tab válido, só fecha)', () => {
    notifyClear();
    notifyPush('release', 'Jogo X já está disponível!', 'hoje', { tab: 'wish' });
    notifyPush('session', 'Sessão iniciada', 'Y');
    elById('notif-center').hidden = true;   // abre de verdade antes de tocar
    notifyToggle();
    assertEq(elById('notif-center').hidden, false, 'painel aberto');
    notifyGo('wish');
    assertEq(elById('notif-center').hidden, true, 'painel fecha ao tocar no item');
    // tab inválida (backup adulterado) não gera onclick: o registro é só texto
    appData.notifications[1].tab = "'); alert(1); ('";
    renderNotificationCenter();
    const html = elById('notif-list').innerHTML;
    assert(!html.includes('alert(1)'), 'tab de fora da whitelist não vira onclick');
    notifyClose();
});

test('idades: agora, minutos, horas, ontem, dias e data seca', () => {
    assertEq(fmtAgo(Date.now() - 5000), 'agora');
    assertEq(fmtAgo(Date.now() - (5 * 60000 + 500)), 'há 5 min');
    assertEq(fmtAgo(Date.now() - (3 * 3600000 + 30000)), 'há 3 h');
    assertEq(fmtAgo(Date.now() - (30 * 3600000 + 60000)), 'ontem');
    assertEq(fmtAgo(Date.now() - (3 * 86400000 + 3600000)), 'há 3 dias');
    assert(!fmtAgo(Date.now() - 10 * 86400000).includes('há'), 'mais antiga: data seca, sem contagem');
    assertEq(paintNotifBadge(), undefined, 'repintar o badge é idempotente');
});

test('wishlist real: checkReleases registra o jogo que lançou (e o sem aviso fica de fora)', async () => {
    notifyClear();
    appData.wishlist.push(
        { id: 'w1', title: 'Jogo Lançado', platform: 'PC', genres: [], released: isoDaysFromNow(-1), notifyRelease: true },
        { id: 'w2', title: 'Jogo Sem Aviso', platform: 'PC', genres: [], released: isoDaysFromNow(-1), notifyRelease: false },
        { id: 'w3', title: 'Jogo Futuro', platform: 'PC', genres: [], released: isoDaysFromNow(30), notifyRelease: true },
    );
    const due = await checkReleases();
    assertEq(due.length, 1, 'só o jogo com aviso vencido dispara');
    assert(appData.notifications.some(n => n.kind === 'release' && n.title === 'Jogo Lançado já está disponível!'), 'registro do lançamento');
    const rel = appData.notifications.find(n => n.title.includes('Jogo Lançado'));
    assertEq(rel.tab, 'wish', 'leva à aba Desejos');
    assert(rel.text.includes('Lançamento em'), 'texto com a data');
    assert(!appData.notifications.some(n => n.title.includes('Sem Aviso')), 'sem aviso ligado não registra');
    assert(!appData.notifications.some(n => n.title.includes('Futuro')), 'lançamento futuro não registra');
    // segunda conferência não duplica (o jogo já foi avisado)
    const again = await checkReleases();
    assertEq(again.length, 0, 'não volta a avisar');
    assertEq(appData.notifications.filter(n => n.kind === 'release').length, 1, 'sem duplicatas no registro');
});

test('conquistas reais: desbloquear entra na central com nome e XP', () => {
    notifyClear();
    appData.achSeeded = true;
    appData.games.push({ id: 'g1', title: 'Jogo Zerado', platform: 'PC', genres: [], state: 'finished' });
    checkNewAchievements();
    const ach = appData.notifications.find(n => n.kind === 'achievement');
    assert(ach, 'conquista registrada');
    assert(ach.title.includes('Primeiro Passo'), 'nome da conquista');
    assert(ach.text.includes('+25 XP'), 'XP no texto');
    // zerar de novo não re-registra (conquista já desbloqueada)
    appData.games.push({ id: 'g2', title: 'Outro', platform: 'PC', genres: [], state: 'finished' });
    checkNewAchievements();
    assertEq(appData.notifications.filter(n => n.title.includes('Primeiro Passo')).length, 1, 'sem duplicata da mesma conquista');
});

test('sessão real: início, pausa, retomada e fim entram no registro', () => {
    localStorage.removeItem('zeralog_session');
    notifyClear();
    initSession({ render() {}, toast() {}, undo() {} });
    addGame('gs', 'Hades');
    startSession('gs');
    assert(kindOf(0) === 'session' && appData.notifications[0].title === 'Sessão iniciada', 'início registrado');
    assertEq(appData.notifications[0].text, 'Hades', 'com o nome do jogo');
    pauseSession();
    assertEq(appData.notifications[0].title, 'Sessão pausada', 'pausa registrada');
    resumeSession();
    assertEq(appData.notifications[0].title, 'Sessão retomada', 'retomada registrada');
    document.getElementById('session-minutes').value = '90';   // como openEndSession preenche
    sessionFinish(true);   // Somar às horas
    assertEq(appData.notifications[0].title, 'Sessão finalizada', 'fim registrado');
    assert(appData.notifications[0].text.includes('+1h 30min'), 'com o tempo somado');
    assert(appData.notifications[0].text.includes('Hades'), 'e o jogo');
    assertEq(appData.notifications.filter(n => n.kind === 'session').length, 4, 'quatro eventos da sessão');
});

test('sessão real: descartar também fica no registro', () => {
    localStorage.removeItem('zeralog_session');
    notifyClear();
    initSession({ render() {}, toast() {}, undo() {} });
    addGame('gs', 'Hades');
    startSession('gs');
    sessionFinish(false);   // Descartar
    assertEq(appData.notifications[0].title, 'Sessão descartada', 'descarte registrado');
    assertEq(appData.notifications[0].text, 'Hades', 'com o nome do jogo');
});

test('sessão em segundo plano: pausa pela notificação da barra (app fechado) é registrada ao voltar', async () => {
    localStorage.removeItem('zeralog_session');
    notifyClear();
    const store = fakeIndexedDb();
    try {
        initSession({ render() {}, toast() {}, undo() {} });
        addGame('gs', 'Hades');
        startSession('gs');
        await sleep(10);   // grava a sessão no IndexedDB falso
        // o service worker pausou com o app fechado: o registro dele fica mais novo
        const local = JSON.parse(localStorage.getItem('zeralog_session'));
        store.set('session', { ...local, paused: true, runStart: null, accMs: 300000, updatedAt: local.updatedAt + 1000 });
        await syncSessionFromIdb();
        const n = appData.notifications[0];
        assertEq(n.title, 'Sessão pausada', 'pausa do fundo registrada');
        assert(n.text.includes('pela notificação da barra'), 'diz de onde veio o comando');
        // de novo sem mudança: não registra nada novo (não é um evento novo)
        const antes = appData.notifications.length;
        await syncSessionFromIdb();
        assertEq(appData.notifications.length, antes, 'sem diferença de estado, sem registro novo');
        sessionFinish(false);   // limpa a sessão (e o timer)
    } finally {
        delete globalThis.indexedDB;
        localStorage.removeItem('zeralog_session');
    }
});

test('persistência: registro sobrevive ao migrateData (backup/restore) limpo e com whitelist', () => {
    assertEq(defaultData.notifications.length, 0, 'default com a lista vazia');
    appData.notifications.push(
        { id: 'ok1', kind: 'release', title: 'Jogo já disponível', text: 'data', at: 1710000000000, read: true, tab: 'wish', logo: 'icons/Steam.webp' },
        { tab: "'); ruim", kind: 'hack', logo: 'https://malicioso.com/x.png' },
        'lixo'
    );
    const m = migrateData(JSON.parse(JSON.stringify(appData)));
    assertEq(m.notifications.length, 2, 'objetos ficam (string vira nada), lixo sai');
    const ok = m.notifications.find(n => n.id === 'ok1');
    assert(ok && ok.title === 'Jogo já disponível' && ok.read === true && ok.tab === 'wish', 'registro válido preservado');
    assertEq(ok.logo, 'icons/Steam.webp', 'logo de loja válido preservado');
    const sus = m.notifications.find(n => n.id !== 'ok1');
    assertEq(sus.tab, '', 'tab fora da whitelist zera');
    assertEq(sus.kind, 'hack', 'kind desconhecido preserva (só não tem ícone próprio)');
    assertEq(sus.logo, '', 'logo fora do padrão zera no migrate');
    // cap do migrate: 65 antigas viram 60
    const many = { ...m, notifications: Array.from({ length: 65 }, (_, i) => ({ id: 'k' + i, kind: 'session', title: 'n' + i, at: i })) };
    const m2 = migrateData(many);
    assertEq(m2.notifications.length, 60, 'migrate também limita a 60');
    assertEq(m2.notifications[0].title, 'n0', 'mantém o topo (as mais novas)');
});

test('tipos: cada origem tem ícone e rótulo no painel', () => {
    for (const [kind, meta] of Object.entries(NOTIF_KINDS)) {
        assert(meta.ic && meta.label, `${kind} com ícone e rótulo`);
    }
    assertEq(NOTIF_KINDS.session.ic, 'clock', 'sessão = relógio');
    assertEq(NOTIF_KINDS.release.ic, 'calendar', 'lançamento = calendário');
    assertEq(NOTIF_KINDS.achievement.ic, 'trophy', 'conquista = troféu');
    assertEq(NOTIF_KINDS.sync.ic, 'refresh', 'sincronização = setas de atualizar');
});

test('painel: sincronização de loja com o LOGO da plataforma no lugar do ícone', () => {
    notifyClear();
    notifyPush('sync', 'Steam · Sincronização', 'Steam: capas prontas!', { logo: 'icons/Steam.webp' });
    notifyPush('sync', 'GOG · Sincronização', 'GOG: dados e capas de 5/9 jogos.', { logo: 'icons/arquivo-que-nao-existe.png' });
    elById('notif-center').hidden = true;   // painel fechado, como no index.html
    notifyToggle();
    const html = elById('notif-list').innerHTML;
    assert(html.includes('icons/Steam.webp'), 'logo da Steam pintado no item');
    assert(html.includes('has-logo'), 'classe do item com logo');
    assert(html.includes('k-sync'), 'kind da sincronização com cor própria');
    assert(!html.includes('arquivo-que-nao-existe'), 'logo fora da lista das lojas não vira <img>');
    notifyClose();
});
