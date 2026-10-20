// Central de Notificações: o REGISTRO de tudo que o app já avisou — sessões de
// jogo, lançamentos da wishlist, conquistas desbloqueadas. Os avisos da barra do
// celular (service worker) são passageiros; aqui eles ficam guardados no banco
// (appData.notifications), com contador de não lidas no sino e o painel que
// abre ao tocá-lo. Cada origem tem seu ícone e cor; lançamentos levam à aba
// Desejos ao serem tocados.
import { appData, saveData } from './store.js';
import { icon, STORE_ICONS } from './icons.js';
import { esc } from './gameApi.js';

// Quantos registros ficam guardados (os mais recentes; o resto descarta)
const MAX_KEEP = 60;

// Abas para as quais uma notificação pode levar ao ser tocada (whitelist: o
// campo entra num onclick, então só aceita valores conhecidos)
const SAFE_TABS = new Set(['home', 'gamematch', 'wish', 'finished', 'stats', 'profile']);

// Cada origem de notificação: ícone (js/icons.js) e rótulo. Sincronizações das
// lojas (kind 'sync') podem chegar com o LOGO da plataforma no lugar do ícone.
export const NOTIF_KINDS = {
    session: { ic: 'clock', label: 'Sessão' },
    release: { ic: 'calendar', label: 'Lançamento' },
    achievement: { ic: 'trophy', label: 'Conquista' },
    sync: { ic: 'refresh', label: 'Sincronização' }
};

// Logos aceitos no registro: só os arquivos das lojas (o campo vem de dados que
// passam por backup/restore — lixo restaurado não vira <img> na página)
const SAFE_LOGOS = new Set(Object.values(STORE_ICONS));

const list = () => (Array.isArray(appData.notifications) ? appData.notifications : []);

// Registra uma notificação no topo da lista. extra: { tab } — a aba que abre ao
// tocar no item (ex.: lançamentos da wishlist levam a 'wish'); { logo } — arquivo
// de logo de loja (sincronizações) no lugar do ícone por origem.
export function notifyPush(kind, title, text, extra = {}) {
    if (!Array.isArray(appData.notifications)) appData.notifications = [];
    appData.notifications.unshift({
        id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        kind: NOTIF_KINDS[kind] ? kind : 'session',
        title: String(title || ''),
        text: String(text || ''),
        at: extra.at || Date.now(),
        read: false,
        tab: SAFE_TABS.has(extra.tab) ? extra.tab : '',
        logo: SAFE_LOGOS.has(extra.logo) ? extra.logo : ''
    });
    if (appData.notifications.length > MAX_KEEP) appData.notifications.length = MAX_KEEP;
    saveData(null);
    paintNotifBadge();
    // painel aberto quando o aviso chega: a lista atualiza na hora
    const panel = document.getElementById('notif-center');
    if (panel && !panel.hidden) renderNotificationCenter();
    return appData.notifications[0];
}

export function notifyUnread() { return list().filter(n => !n.read).length; }

// Contador de não lidas no sino (desktop e celular usam badges próprios)
export function paintNotifBadge() {
    const n = notifyUnread();
    ['notif-badge', 'notif-badge-mob'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.hidden = n === 0;
        b.textContent = n > 9 ? '9+' : String(n);
    });
}

// "agora", "há 5 min", "há 3 h", "ontem"… (depois de uma semana, a data seca)
export function fmtAgo(at) {
    const s = Math.max(0, Math.floor((Date.now() - (at || 0)) / 1000));
    if (s < 60) return 'agora';
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'ontem';
    if (d < 7) return `há ${d} dias`;
    try { return new Date(at).toLocaleDateString('pt-BR'); } catch (e) { return ''; }
}

export function renderNotificationCenter() {
    const el = document.getElementById('notif-list');
    if (!el) return;
    const items = list();
    if (!items.length) {
        el.innerHTML = `<div class="notif-empty">${icon('bell', { size: '1.7em' })}<strong>Sem notificações</strong><small>Sessões de jogo, lançamentos da wishlist e conquistas aparecem aqui.</small></div>`;
        return;
    }
    el.innerHTML = items.map(n => {
        const k = NOTIF_KINDS[n.kind] || NOTIF_KINDS.session;
        // lançamentos são tocáveis: fecham o painel e abrem a aba do jogo
        // (o tab volta de dados restaurados: só valores conhecidos geram onclick)
        const tab = SAFE_TABS.has(n.tab) ? n.tab : '';
        const go = tab ? ` role="button" tabindex="0" onclick="notifyGo('${tab}')"` : '';
        // sincronizações de loja trazem o LOGO da plataforma no lugar do ícone
        const inner = n.logo ? `<img src="${esc(n.logo)}" alt="" class="brand-ico notif-logo">` : icon(k.ic, { size: '1.1em' });
        return `<div class="notif-item${n.read ? '' : ' unread'}"${go}>
            <span class="notif-ic k-${esc(n.kind)}${n.logo ? ' has-logo' : ''}" title="${esc(k.label)}">${inner}</span>
            <div class="notif-body">
                <div class="notif-title">${esc(n.title)}</div>
                ${n.text ? `<div class="notif-text">${esc(n.text)}</div>` : ''}
            </div>
            <span class="notif-when">${esc(fmtAgo(n.at))}</span>
        </div>`;
    }).join('');
}

// O sino abre/fecha o painel. Ao abrir, pinta com o destaque das não lidas e
// SÓ DEPOIS marca tudo como lido — o badge conta "novas desde a última visita".
export function notifyToggle() {
    const panel = document.getElementById('notif-center');
    if (!panel) return;
    if (panel.hidden) {
        renderNotificationCenter();
        panel.hidden = false;
        const fresh = list().filter(n => !n.read);
        if (fresh.length) { fresh.forEach(n => { n.read = true; }); saveData(null); }
        paintNotifBadge();
    } else {
        panel.hidden = true;
    }
}

export function notifyClose() { const p = document.getElementById('notif-center'); if (p) p.hidden = true; }

// Tocar numa notificação de lançamento fecha o painel e abre a aba certa
export function notifyGo(tab) {
    notifyClose();
    if (tab && typeof window !== 'undefined' && window.switchTab) { try { window.switchTab(tab); } catch (e) { /* aba inexistente */ } }
}

export function notifyClear() {
    appData.notifications = [];
    saveData(null);
    renderNotificationCenter();
    paintNotifBadge();
}

// Boot: badge do sino + fechar o painel ao clicar fora (como os painéis de ordenar)
export function initNotify() {
    paintNotifBadge();
    document.addEventListener('click', e => {
        const panel = document.getElementById('notif-center');
        if (!panel || panel.hidden) return;
        const t = e.target;
        if (t && t.closest && (t.closest('#notif-center') || t.closest('.notif-bell'))) return;
        notifyClose();
    }, true);
}
