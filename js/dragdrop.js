// ============================================================================
// Arrastar jogos da Fila. Pointer Events puros — o HTML5 drag-and-drop não
// existe no toque do celular, então o mesmo código atende os dois:
//   • Desktop: clique e mova (um tiquinho de movimento já pega).
//   • Celular: SEGURE o cartucho um instante (ele "pula" com uma trepidação)
//     e então arraste — soltar no meio de uma rolagem cancela.
//
// Alvos (o STATUS troca sozinho conforme onde cai):
//   • prateleira de categoria → jogo de fila (state null) naquela categoria;
//   • hero "Jogando Atualmente" → marcado como JOGANDO;
//   • "Jogos Contínuos" → vira jogo CONTÍNUO (horas ficam).
// Soltar em cima de outro cartucho insere naquela posição (metade esquerda =
// antes, direita = depois); em outro ponto da seção vai para o fim dela.
//
// Desempenho: a troca pinta NA HORA e o banco grava DEPOIS do frame —
// serializar appData inteiro (todas as capas) na hora do soltar travava o
// gesto por um tempo (o "lag" de antes). Arrastar de volta é o desfazer.
// ============================================================================
import { appData, saveData } from './store.js';
import { render, triggerToast } from './ui.js';

const HOLD_MS = 260;    // toque: quanto tempo segurar para pegar o cartucho
const ARM_PX = 7;       // mouse: quanto mover para começar a arrastar
const SCROLL_PX = 12;   // toque: mover além disso antes de segurar = rolagem (cancela)

const isFilaCat = id => !!id && appData.categories.some(c => c.id === id);

// Seção da Fila: uma prateleira de categoria, o hero ou os contínuos. As
// listas seguem o padrão list-<id da categoria>, list-playing e list-continuous
// (as prateleiras dos Zerados e da wishlist não têm id — ficam fora).
function sectionOfList(ul) {
    if (!ul || !ul.id || !ul.id.startsWith('list-')) return null;
    const id = ul.id.slice(5);
    if (id === 'playing') return { kind: 'playing' };
    if (id === 'continuous') return { kind: 'continuous' };
    return isFilaCat(id) ? { kind: 'cat', id } : null;
}
function sectionOfCategory(el) {
    if (!el || !el.id) return null;
    if (el.id === 'playing-category') return { kind: 'playing' };
    if (el.id === 'continuous-category') return { kind: 'continuous' };
    return isFilaCat(el.id) ? { kind: 'cat', id: el.id } : null;
}
const listIdOf = sec => sec.kind === 'cat' ? `list-${sec.id}` : `list-${sec.kind}`;

// O jogo pertence à seção? (define o "fim da seção" quando não há referência)
function inSection(g, sec) {
    if (sec.kind === 'cat') return g.catId === sec.id && !g.state && !g.continuous;
    if (sec.kind === 'playing') return g.state === 'playing' && !g.continuous;
    return !!g.continuous;
}

// ================= NÚCLEO (testado direto em tests/dragdrop.test.mjs) =================
// Insere o jogo arrastado na posição nova do array GLOBAL — a ordem manual da
// Fila é a ordem de appData.games (cada seção é um recorte dele).
// ref = cartucho de referência (entra antes ou depois dele); sem ref, cai no
// fim da seção alvo, depois do último jogo dela.
export function placeGame(games, dragId, ref, before, sec) {
    const from = games.findIndex(g => g.id === dragId);
    if (from < 0) return null;
    const [game] = games.splice(from, 1);
    if (ref) {
        const at = games.findIndex(g => g.id === ref);
        games.splice(at < 0 ? games.length : (before ? at : at + 1), 0, game);
    } else {
        let last = -1;
        games.forEach((g, i) => { if (inSection(g, sec)) last = i; });
        games.splice(last < 0 ? games.length : last + 1, 0, game);
    }
    return true;
}

// Estado que o jogo ganha ao cair na seção (o arrasto TROCA O STATUS sozinho)
function landOnSection(g, sec) {
    const wasPlaying = g.state === 'playing', wasContinuous = !!g.continuous, wasCat = g.catId;
    if (sec.kind === 'cat') { g.state = null; g.continuous = false; g.catId = sec.id; }
    else if (sec.kind === 'playing') { g.state = 'playing'; g.continuous = false; }
    else { g.continuous = true; g.state = null; }
    return {
        statusChanged: wasPlaying !== (g.state === 'playing') || wasContinuous !== !!g.continuous,
        catChanged: wasCat !== g.catId,
        wasPlaying, wasContinuous
    };
}

// Aplica o soltar no banco: troca o status/categoria, posiciona e, se a Fila
// estiver com outra ordenação, volta para a MANUAL (arrastar É ordem manual —
// exceto nos contínuos, que se ordenam pelas horas jogadas).
export function applyDrop(dragId, ref, before, sec) {
    const game = appData.games.find(g => g.id === dragId);
    if (!game || !sec || (sec.kind === 'cat' && !isFilaCat(sec.id))) return null;
    const same = inSection(game, sec);   // já estava na seção? então é só reordenar
    const flip = same && sec.kind !== 'continuous' && appData.settings.sort !== 'manual';
    if (flip) appData.settings.sort = 'manual';
    const landed = landOnSection(game, sec);
    placeGame(appData.games, dragId, ref, before, sec);
    return { ...landed, flipped: flip };
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
    document.addEventListener('touchmove', blockScroll, { passive: false, capture: true });
    moveGhost(d, x, y);
    if (d.touch && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* sem vibração, sem drama */ } }
}

function moveGhost(d, x, y) {
    d.ghost.style.left = `${x}px`;
    d.ghost.style.top = `${y}px`;
}

// O que está sob o dedo/mouse: cartucho de referência (com o lado) ou apenas
// a seção (cai no fim dela). Nada disso = soltar cancela.
function hitTest(d, x, y) {
    const el = document.elementFromPoint(x, y);
    const item = el && el.closest ? el.closest('.shelf-item') : null;
    let target = null, ref = null, before = true;
    if (item && item !== d.li && item.dataset && item.dataset.id) {
        const sec = sectionOfList(item.closest('ul'));
        if (sec) {
            target = sec; ref = item.dataset.id;
            const r = item.getBoundingClientRect();
            before = x < r.left + r.width / 2;
        }
    }
    if (!target) target = sectionOfCategory(el && el.closest ? el.closest('.category') : null);
    d.target = target; d.ref = ref; d.before = before;
    const list = target ? document.getElementById(listIdOf(target)) : null;
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
    if (!sectionOfList(li.closest('ul'))) return;   // prateleiras sem id (Zerados, wishlist) ficam fora
    const d = {
        armed: false, li, id: li.dataset.id, pointerId: e.pointerId,
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
    if (!d.target) return;                     // soltou fora de qualquer seção
    const res = applyDrop(d.id, d.ref, d.before, d.target);
    if (!res) return;
    // SEM LAG: pinta na hora; o banco (que serializa o appData inteiro, capas
    // inclusas) só grava DEPOIS do frame do soltar
    render();
    setTimeout(() => saveData(), 0);
    const g = appData.games.find(x => x.id === d.id);
    const cat = d.target.kind === 'cat' ? appData.categories.find(c => c.id === d.target.id) : null;
    let msg = null;
    if (d.target.kind === 'playing' && res.statusChanged) msg = `"${g.title}" agora está sendo jogado.`;
    else if (d.target.kind === 'continuous' && res.statusChanged) msg = `"${g.title}" agora é um jogo contínuo.`;
    else if (d.target.kind === 'cat') {
        if (res.wasPlaying) msg = `"${g.title}" parou de ser jogado e foi para ${cat.name}.`;
        else if (res.wasContinuous) msg = `"${g.title}" saiu dos contínuos e foi para ${cat.name}.`;
        else if (res.catChanged) msg = `"${g.title}" foi para a categoria ${cat.name}.`;
    }
    // sem retrato de estado para o Desfazer: arrastar é manipulação direta —
    // arrastar de volta é o desfazer (e o snapshot serializava tudo, era o lag)
    if (msg) triggerToast(msg, false);
    else if (res.flipped) triggerToast('Ordenação da Fila trocada para manual.', false);
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
