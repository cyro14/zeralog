// Barra de progresso fixa no rodapé (usada na sincronização das lojas).
// syncShow("Steam: buscando capas", 3, 20)  → barra em 15%
// syncHide()                                → esconde com desvanecer
let hideTimer = null;
export function syncShow(text, done, total, key = 'sync') {
    let el = document.getElementById('syncbar');
    if (!el) {
        el = document.createElement('div');
        el.id = 'syncbar';
        el.innerHTML = `<span class="syncbar-label"></span><span class="syncbar-track"><span class="syncbar-fill"></span></span><span class="syncbar-count"></span>`;
        document.body.appendChild(el);
    }
    clearTimeout(hideTimer);
    el.querySelector('.syncbar-label').textContent = text;
    el.querySelector('.syncbar-count').textContent = total ? `${done}/${total}` : '';
    el.querySelector('.syncbar-fill').style.width = total ? `${Math.round(done / total * 100)}%` : '15%';
    el.classList.add('show');
}
export function syncHide(text) {
    const el = document.getElementById('syncbar');
    if (!el) return;
    if (text) el.querySelector('.syncbar-label').textContent = text;
    el.querySelector('.syncbar-fill').style.width = '100%';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
