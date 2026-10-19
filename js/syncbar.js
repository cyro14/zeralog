// Progresso das sincronizações (Steam/GOG/Epic/Itch.io) na BARRA DE NOTIFICAÇÕES do
// sistema — o mesmo lugar do timer da sessão (js/session.js), com a mesma técnica.
// Antes era uma pílula flutuante no rodapé da tela: no celular ela nascia exatamente
// em cima do hub de abas (position: fixed no bottom) e atrapalhava a navegação.
//
// syncShow("Steam: buscando capas", 3, 20) → notificação de progresso (mesma tag, atualiza)
// syncHide()                               → fecha a notificação
// syncHide("Steam: capas prontas!")        → mostra o resultado por alguns segundos e fecha
//
// Sem permissão de notificação nada flutua na tela: o progresso continua no status
// da própria página da loja, dentro de Configurações › Conexões.
const TAG = 'zeralog-sync';
let gen = 0;   // um fechamento automático antigo não pode fechar a notificação de uma sincronização nova

const canNotify = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';
async function swReg() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 2500))]); } catch (e) { return null; }
}
const BASE = { tag: TAG, renotify: false, silent: true, icon: 'icons/logo-192.png', badge: 'icons/badge-96.png' };

export async function syncShow(text, done, total) {
    gen++;
    if (!canNotify()) return;
    const reg = await swReg();
    if (!reg) return;
    try {
        await reg.showNotification('ZeraLog · Sincronizando', { ...BASE, requireInteraction: true, body: `${text}${total ? ` — ${done}/${total}` : ''}` });
    } catch (e) { /* navegador sem notificações de PWA: o status na tela de Conexões cobre */ }
}

async function closeSync() {
    const reg = await swReg();
    if (!reg) return;
    try { (await reg.getNotifications({ tag: TAG })).forEach(n => n.close()); } catch (e) {}
}

export async function syncHide(text) {
    if (!canNotify()) return;
    if (!text) {
        gen++;
        await closeSync();
        return;
    }
    const reg = await swReg();
    if (reg) {
        try { await reg.showNotification('ZeraLog', { ...BASE, requireInteraction: false, body: text }); } catch (e) {}
    }
    const mine = ++gen;   // fecha sozinho daqui a pouco — a menos que outra sincronização comece
    setTimeout(() => { if (mine === gen) closeSync(); }, 4000);
}
