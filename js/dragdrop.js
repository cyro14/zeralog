// ============================================================================
// Arrastar jogos da Fila: trocar de POSIÇÃO dentro da categoria e de
// CATEGORIA/PRATELEIRA. Pointer Events puros — o HTML5 drag-and-drop não
// existe no toque do celular, então o mesmo código atende os dois:
//   • Desktop: clique e mova (um tiquinho de movimento já pega).
//   • Celular: SEGURE o cartucho um instante (ele "pula" com uma leve trepi-
//     dação) e então arraste — soltar no meio de uma rolagem cancela.
// Soltar em cima de outro cartucho insere naquela posição (metade esquerda =
// antes, direita = depois); soltar em qualquer outro ponto de uma categoria
// manda para o fim da prateleira dela. O hero "Jogando Atualmente" e os
// "Jogos Contínuos" não participam (não são categorias da Fila).
// ============================================================================
import { appData, saveData } from './store.js';
import { render, triggerToast, saveStateForUndo } from './ui.js';

const HOLD_MS = 260;    // toque: quanto tempo segurar para pegar o cartucho
const ARM_PX = 7;       // mouse: quanto mover para começar a arrastar
const SCROLL_PX = 12;   // toque: mover além disso antes de segurar = rolagem (cancela)

const isFilaCat = id => !!id && appData.categories.some(c => c.id === id);

// A lista é a prateleira de uma categoria da Fila? (as listas do hero e dos
// contínuos têm ids próprios e não são alvo)
function catOfList(ul) {
    if (!ul || !ul.id || !ul.id.startsWith('list-')) return null;
    const id = ul.id.slice(5);
    return isFilaCat(id) ? id : null;
}

// ================= NÚCLEO (testado direto em tests/dragdrop.test.mjs) =================
// Insere o jogo arrastado na posição nova do array GLOBAL — a ordem manual da
// Fila é a ordem de appData.games (cada prateleira é um recorte dele).
// ref = cartucho de referência (entra antes ou depois dele); sem ref, cai no
// fim da categoria alvo, depois do último jogo de backlog dela.
export function placeGame(games, dragId, ref, before, targetCatId) {
    const from = games.findIndex(g => g.id === dragId);
    if (from < 0) return null;
    const [game] = games.splice(from, 1);
    const catChanged = !!targetCatId && game.catId !== targetCatId;
    if (catChanged) game.catId = targetCatId;
    if (ref) {
        const at = games.findIndex(g => g.id === ref);
        games.splice(at < 0 ? games.length : (before ? at : at + 1), 0, game);
    } else {
        let last = -1;
        games.forEach((g, i) => { if (g.catId === targetCatId && !g.state && !g.continuous) last = i; });
        games.splice(last < 0 ? games.length : last + 1, 0, game);
    }
    return { catChanged };
}

// Aplica o soltar no banco: move o jogo e, se a Fila estiver com outra
// ordenação, volta para a MANUAL (arrastar É ordem manual — avisar no toast).
export function applyDrop(dragId, ref, before, targetCatId) {
    const game = appData.games.find(g => g.id === dragId);
    if (!game || !isFilaCat(targetCatId)) return null;
    const sameCat = game.catId === targetCatId;
    const flipped = sameCat && appData.settings.sort !== 'manual';
    if (flipped) appData.settings.sort = 'manual';
    const res = placeGame(appData.games, dragId, ref, before, targetCatId);
    return res ? { ...res, flipped } : null;
}

// ================= UI: pegar, arrastar e soltar =================
let drag = null;
let marks = null;   // { item, list } marcados como alvo agora

function clearMarks() {
    if (!marks) return;
    if (marks.item) marks.item.classList.remove('drop-hover');
    if (marks.list) marks.list.classList.remove('drop-target');
    marks = null;
}

function cleanupDrag() {
    const d = drag;
    drag = null;
    if (d) {
        clearTimeout(d.timer);
        if (d.ghost) d.ghost.remove();
        d.li.classList.remove('drag-src');
    }
    document.body.classList.remove('dragging');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', blockScroll, true);
    clearMarks();
}

// Toque simples (sem ter armado o arrasto) deixa o clique abrir o jogo — só
// arrasto de verdade engole o clique no fim, para não abrir a ficha do cartucho.
function suppressClick() {
    const kill = ev => { ev.stopPropagation(); ev.preventDefault(); document.removeEventListener('click', kill, true); };
    document.addEventListener('click', kill, true);
    setTimeout(() => document.removeEventListener('click', kill, true), 0);
}

// Toque: com o arrasto ativo o dedo não pode rolar a página
function blockScroll(e) { if (drag) e.preventDefault(); }

function armDrag(d, x, y) {
    d.armed = true;
    document.body.classList.add('dragging');
    // fantasma: clone do cartucho com o tamanho original fixado (fora da grade)
    const r = d.li.getBoundingClientRect();
    const ghost = d.li.cloneNode(true);
    ghost.className = `${d.li.className} drag-ghost`;
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.appendChild(ghost);
    d.ghost = ghost;
    d.li.classList.add('drag-src');
    try { d.li.setPointerCapture(d.pointerId); } catch (e) { /* sem captura o arrasto segue no document */ }
    // a partir daqui o gesto é nosso: mover roda o arrasto, subir solta
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', blockScroll, { passive: false, capture: true });
    moveGhost(d, x, y);
    if (d.touch && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* sem vibração, sem drama */ } }
}

function moveGhost(d, x, y) {
    d.ghost.style.left = `${x}px`;
    d.ghost.style.top = `${y}px`;
}

// O que está sob o dedo/mouse: cartucho de referência (com o lado) ou apenas
// a categoria (vai para o fim da prateleira). Nada disso = soltar cancela.
function hitTest(d, x, y) {
    const el = document.elementFromPoint(x, y);
    const item = el && el.closest ? el.closest('.shelf-item') : null;
    let target = null, ref = null, before = true;
    if (item && item !== d.li && item.dataset && item.dataset.id) {
        const c = catOfList(item.closest('ul'));
        if (c) {
            target = c; ref = item.dataset.id;
            const r = item.getBoundingClientRect();
            before = x < r.left + r.width / 2;
        }
    }
    if (!target) {
        const cat = el && el.closest ? el.closest('.category') : null;
        if (isFilaCat(cat && cat.id)) target = cat.id;
    }
    d.target = target; d.ref = ref; d.before = before;
    const list = target ? document.getElementById(`list-${target}`) : null;
    if (!marks || marks.item !== item || marks.list !== list) {
        clearMarks();
        if (item && item !== d.li) item.classList.add('drop-hover');
        if (list) list.classList.add('drop-target');
        marks = { item, list };
    }
}

function onDown(e) {
    if (drag) return;
    if (e.button !== undefined && e.button !== 0) return;   // só o botão principal
    const li = e.target && e.target.closest ? e.target.closest('.shelf-item') : null;
    if (!li) return;
    const catId = catOfList(li.closest('ul'));
    if (!catId) return;   // hero e contínuos não arrastam
    const d = {
        armed: false, li, id: li.dataset.id, catId, pointerId: e.pointerId,
        x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY,
        touch: e.pointerType === 'touch', timer: 0, ghost: null,
        target: null, ref: null, before: true
    };
    drag = d;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    if (d.touch) d.timer = setTimeout(() => { if (drag === d && !d.moved) armDrag(d, d.x, d.y); }, HOLD_MS);
}

function onMove(e) {
    if (!drag) return;
    const d = drag;
    if (typeof e.clientX === 'number') { d.x = e.clientX; d.y = e.clientY; }
    if (!d.armed) {
        const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
        if (d.touch) {
            if (dist > SCROLL_PX) { d.moved = true; cleanupDrag(); return; }   // é rolagem: entrega pro navegador
        } else if (dist > ARM_PX) {
            clearTimeout(d.timer);
            armDrag(d, e.clientX, e.clientY);
        }
        return;
    }
    moveGhost(d, d.x, d.y);
    hitTest(d, d.x, d.y);
}

function onUp(e) {
    if (!drag) return;
    const d = drag;
    if (!d.armed) { cleanupDrag(); return; }   // foi só um toque: o clique segue normal
    // posição final: a do próprio soltar (ou a última do arrasto, se o evento veio seco)
    hitTest(d, typeof e.clientX === 'number' ? e.clientX : d.x, typeof e.clientY === 'number' ? e.clientY : d.y);
    cleanupDrag();
    if (!d.target) return;                     // soltou fora de qualquer categoria
    saveStateForUndo();                        // o botão Desfazer (e o toast) tem o estado de antes
    const res = applyDrop(d.id, d.ref, d.before, d.target);
    if (!res) return;
    saveData(() => render());
    const g = appData.games.find(x => x.id === d.id);
    const cat = appData.categories.find(c => c.id === d.target);
    if (res.catChanged) triggerToast(`"${g.title}" foi para a categoria ${cat.name}.`);
    else if (res.flipped) triggerToast('Ordenação da Fila trocada para manual.');
    suppressClick();
}

function onCancel() { cleanupDrag(); }

export function initDragDrop() {
    const tab = document.getElementById('tab-home');
    if (!tab) return;
    tab.addEventListener('pointerdown', onDown);
    // o <img> das capas é arrastável por padrão no desktop: não pode roubar o gesto
    tab.addEventListener('dragstart', e => { if (e.target && e.target.closest && e.target.closest('.shelf-item')) e.preventDefault(); });
}
