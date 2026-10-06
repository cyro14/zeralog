// Configurações → Banco de dados: motor em uso, espaço, pontos de restauração e cópia antiga.
import { getStorageInfo, listSnapshots, restoreSnapshot, storageState, hasLegacyCopy, clearLegacyCopy } from './store.js';
import { esc } from './gameApi.js';

let hooks = { render() {}, toast() {} };
const $ = id => document.getElementById(id);
const mb = n => (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace('.', ',') + ' MB';
const gb = n => (n / 1073741824).toFixed(1).replace('.', ',') + ' GB';

export function initStorageUI(h) {
    hooks = h;
    window.addEventListener('zeralog:save-error', e => hooks.toast(`Não consegui salvar no banco (${e.detail}). Faça um backup agora.`, false));
    if (storageState.recovered) hooks.toast('Os dados salvos estavam ilegíveis. Uma cópia ficou guardada e o app abriu limpo.', false);
    else if (storageState.lastError && storageState.migrated) hooks.toast(storageState.lastError, false);
}

export async function renderStorageSettings() {
    if (!$('storage-text')) return;
    const info = await getStorageInfo();
    const bar = $('storage-bar');
    const pct = info.quota ? Math.max(1, Math.min(100, Math.round(info.usage / info.quota * 100))) : 0;
    bar.style.width = (info.usage ? pct : 0) + '%';
    $('storage-text').textContent = info.engine === 'indexeddb'
        ? `${mb(info.usage)} usados de ~${gb(info.quota)} disponíveis neste aparelho.`
        : `${mb(info.usage)} de ~5 MB. Modo compatível: faça backups com frequência.`;
    $('storage-engine').textContent = `Banco: ${info.label}${info.engine === 'indexeddb' ? (info.persistent ? ' · armazenamento protegido contra limpeza automática' : ' · o navegador pode limpar se faltar espaço (faça backups)') : ''}`;

    const snaps = await listSnapshots();
    $('snap-count').textContent = snaps.length;
    $('snap-list').innerHTML = snaps.length ? snaps.map(s => `<li><span>${s.key === 'pre-migracao' ? 'Antes da migração' : new Date(s.at).toLocaleDateString('pt-BR')}<small> · ${s.games} jogos</small></span><button type="button" class="pill-btn" data-snap="${esc(s.key)}">Restaurar</button></li>`).join('') : '<li class="snap-empty">Os pontos de restauração diários aparecem aqui.</li>';
    $('legacy-clear').style.display = hasLegacyCopy() ? '' : 'none';
}

export async function restoreSnapshotUI(key) {
    if (!confirm('Restaurar este ponto? Os dados atuais (exceto as imagens) serão substituídos. Faça um backup antes se tiver dúvida.')) return;
    try { await restoreSnapshot(key); hooks.render(); hooks.toast('Ponto de restauração aplicado.', false); renderStorageSettings(); }
    catch (e) { hooks.toast(String(e.message || e), false); }
}

export function clearLegacyCopyUI() {
    if (!confirm('Apagar a cópia antiga guardada no armazenamento do navegador? Seus dados já estão no novo banco.')) return;
    clearLegacyCopy(); renderStorageSettings(); hooks.toast('Cópia antiga apagada.', false);
}

function init() {
    const list = $('snap-list');
    if (list) list.addEventListener('click', e => { const b = e.target.closest('[data-snap]'); if (b) restoreSnapshotUI(b.dataset.snap); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
