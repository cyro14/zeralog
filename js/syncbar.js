// Progresso das sincronizações (Steam/GOG/Epic/Itch.io) na BARRA DE NOTIFICAÇÕES do
// sistema — o mesmo lugar do timer da sessão (js/session.js). A notificação leva o
// ÍCONE DA PLATAFORMA que está atualizando e, como a Notification API não tem barra
// de progresso nativa, um BANNER DESENHADO NA HORA (canvas → PNG): o `image` da
// notificação, que o Android mostra grande — logo da loja + barra andando. Ao
// terminar, o resumo é GRAVADO na central de notificações (o sino, js/notify.js),
// como sessões e lançamentos: o aviso passageiro da barra some, o registro fica.
//
// syncShow("Steam: buscando capas", 3, 20, 'steam') → notificação de progresso (tag única)
// syncHide("Steam: capas prontas!", 'steam')         → grava no sino + aviso final + fecha
// syncHide()                                        → só fecha
//
// Sem permissão de notificação nada flutua na tela: o progresso continua no status
// da própria página da loja, dentro de Configurações › Conexões.
import { STORE_ICONS } from './icons.js';
import { notifyPush } from './notify.js';

const TAG = 'zeralog-sync';
let gen = 0;   // um fechamento automático antigo não pode fechar a notificação de uma sincronização nova

// Plataformas que sincronizam — nome e LOGO vêm da mesma fonte de verdade das lojas
const PLATFORM = {
    steam: { name: 'Steam', icon: STORE_ICONS['Steam'] },
    gog: { name: 'GOG', icon: STORE_ICONS['GOG'] },
    epic: { name: 'Epic Games', icon: STORE_ICONS['Epic Games'] },
    itch: { name: 'Itch.io', icon: STORE_ICONS['Itch.io'] },
    amazon: { name: 'Amazon Games', icon: STORE_ICONS['Amazon Games'] }
};

const canNotify = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

// Pede a permissão da barra de notificações UMA vez, direto no gesto do botão de
// sincronizar/vincular (o Chrome só mostra o prompt com um toque recente; sem
// gesto o pedido fica pendente e não incomoda ninguém). Quem já decidiu nunca é
// perguntado de novo: 'granted' e 'denied' não repetem o prompt.
export function syncAskPermission() {
    try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
        const p = Notification.requestPermission();
        if (p && typeof p.then === 'function') p.then(() => {}, () => {});
    } catch (e) { /* WebView sem prompt: o progresso segue no status da tela de Conexões */ }
}

async function swReg() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 2500))]); } catch (e) { return null; }
}
const BASE = { tag: TAG, renotify: false, silent: true, icon: 'icons/logo-192.png', badge: 'icons/badge-96.png' };

// ---------- artes desenhadas na hora (canvas → PNG data URL) ----------
// Ícone: logo da plataforma (não muda durante a sincronização → cache por loja).
// Banner (o `image` da notificação): logo + BARRA DE PROGRESSO no gradiente do app
// (a mesma da pílula flutuante aposentada) → cache por loja + percentual.
const cssVar = (name, fb) => { try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; } };
const logoImg = src => new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
});
function fitDraw(ctx, im, x, y, w, h) {
    if (!im || !im.width || !im.height) return;
    const r = Math.min(w / im.width, h / im.height);
    const dw = im.width * r, dh = im.height * r;
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
const iconCache = new Map();
async function platformIcon(key) {
    const p = PLATFORM[key];
    if (!p || !p.icon) return BASE.icon;
    if (iconCache.has(key)) return iconCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 192;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = cssVar('--bg-color', '#141420');
    rr(ctx, 0, 0, 192, 192, 40);
    ctx.fill();
    fitDraw(ctx, await logoImg(p.icon), 26, 26, 140, 140);
    const data = cv.toDataURL('image/png');
    iconCache.set(key, data);
    return data;
}
const bannerCache = new Map();
async function progressBanner(key, done, total) {
    const pct = total ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
    const ck = key + ':' + pct;
    if (bannerCache.has(ck)) return bannerCache.get(ck);
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = cssVar('--bg-color', '#141420');
    ctx.fillRect(0, 0, 512, 256);
    const p = PLATFORM[key];
    if (p && p.icon) fitDraw(ctx, await logoImg(p.icon), 156, 20, 200, 200);
    // barra de progresso: fundo fosco + preenchimento no gradiente do app
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    rr(ctx, 32, 212, 448, 22, 11);
    ctx.fill();
    if (pct > 0) {
        const grad = ctx.createLinearGradient(32, 0, 480, 0);
        grad.addColorStop(0, cssVar('--accent-playing', '#b366f0'));
        grad.addColorStop(1, cssVar('--accent-finished', '#5eeaa0'));
        ctx.fillStyle = grad;
        rr(ctx, 32, 212, Math.max(22, 448 * pct / 100), 22, 11);
        ctx.fill();
    }
    const data = cv.toDataURL('image/png');
    bannerCache.set(ck, data);
    return data;
}

export async function syncShow(text, done, total, key = '') {
    gen++;
    if (!canNotify()) return;
    const reg = await swReg();
    if (!reg) return;
    const [icon, image] = await Promise.all([platformIcon(key), progressBanner(key, done, total)]);
    try {
        await reg.showNotification('ZeraLog · Sincronizando', { ...BASE, requireInteraction: true, icon, image, body: `${text}${total ? ` — ${done}/${total}` : ''}` });
    } catch (e) { /* navegador sem notificações de PWA: o status na tela de Conexões cobre */ }
}

async function closeSync() {
    const reg = await swReg();
    if (!reg) return;
    try { (await reg.getNotifications({ tag: TAG })).forEach(n => n.close()); } catch (e) {}
}

export async function syncHide(text, key = '') {
    if (!text) {
        if (!canNotify()) return;
        gen++;
        await closeSync();
        return;
    }
    // O fim da sincronização é GRAVADO na central de notificações (o sino) — com o
    // logo da plataforma, como sessões e lançamentos. Vale mesmo sem a permissão
    // da barra do sistema: o registro é do app.
    const p = PLATFORM[key] || {};
    try { notifyPush('sync', `${p.name || 'ZeraLog'} · Sincronização`, text, { logo: p.icon || '' }); } catch (e) {}
    if (!canNotify()) return;
    const icon = await platformIcon(key);
    const reg = await swReg();
    if (reg) {
        try { await reg.showNotification('ZeraLog', { ...BASE, requireInteraction: false, icon, body: text }); } catch (e) {}
    }
    const mine = ++gen;   // fecha sozinho daqui a pouco — a menos que outra sincronização comece
    setTimeout(() => { if (mine === gen) closeSync(); }, 4000);
}
