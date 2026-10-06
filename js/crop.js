// Recorte de capa em formato vertical (2:3): arraste para posicionar e use o zoom.
// "Imagem inteira" encaixa a arte horizontal inteira sobre um fundo desfocado.
import { fetchImageBlob } from './gameApi.js';

const RATIO = 2 / 3;            // largura / altura
const VIEW_W = 300, VIEW_H = 450;
const $ = id => document.getElementById(id);
let st = null;

function bounds() {
    const bw = st.bmp.width * st.scale, bh = st.bmp.height * st.scale;
    return { bw, bh };
}
function clamp() {
    const { bw, bh } = bounds();
    st.x = bw >= VIEW_W ? Math.min(0, Math.max(VIEW_W - bw, st.x)) : (VIEW_W - bw) / 2;
    st.y = bh >= VIEW_H ? Math.min(0, Math.max(VIEW_H - bh, st.y)) : (VIEW_H - bh) / 2;
}

// Desenha a composição na escala f (1 = tela de prévia; maior = saída final)
function draw(ctx, f) {
    const { bw, bh } = bounds();
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, VIEW_W * f, VIEW_H * f);
    if (bw < VIEW_W || bh < VIEW_H) {   // sobra espaço: fundo desfocado com a própria imagem
        const cover = Math.max(VIEW_W / st.bmp.width, VIEW_H / st.bmp.height) * f;
        const w = st.bmp.width * cover, h = st.bmp.height * cover;
        ctx.save();
        try { ctx.filter = `blur(${Math.round(14 * f)}px) brightness(0.65)`; } catch (e) { /* sem suporte */ }
        ctx.drawImage(st.bmp, (VIEW_W * f - w) / 2, (VIEW_H * f - h) / 2, w, h);
        ctx.restore();
    }
    ctx.drawImage(st.bmp, st.x * f, st.y * f, bw * f, bh * f);
}

function paint() {
    clamp();
    draw($('crop-canvas').getContext('2d'), 1);
    $('crop-zoom').value = String(st.scale / st.cover);
}

function setScale(next, cx = VIEW_W / 2, cy = VIEW_H / 2) {
    const s = Math.min(st.cover * 4, Math.max(st.contain, next));
    const k = s / st.scale;
    st.x = cx - (cx - st.x) * k;        // zoom em torno do ponto indicado
    st.y = cy - (cy - st.y) * k;
    st.scale = s;
    paint();
}

export async function openCropper({ src, blob, onDone }) {
    const status = $('crop-status');
    status.textContent = 'Carregando imagem...';
    $('modal-crop').showModal();
    let b = blob || await fetchImageBlob(src);
    if (!b) { status.textContent = 'Não consegui abrir essa imagem (o site bloqueou o acesso). Baixe-a e envie como foto.'; return; }
    let bmp;
    try { bmp = await createImageBitmap(b); } catch (e) { status.textContent = 'Formato de imagem não suportado.'; return; }
    const cover = Math.max(VIEW_W / bmp.width, VIEW_H / bmp.height);
    const contain = Math.min(VIEW_W / bmp.width, VIEW_H / bmp.height);
    st = { bmp, cover, contain, scale: cover, x: 0, y: 0, onDone, pointers: new Map(), last: null };
    st.x = (VIEW_W - bmp.width * cover) / 2; st.y = (VIEW_H - bmp.height * cover) / 2;
    const z = $('crop-zoom');
    z.min = String(contain / cover); z.max = '4'; z.step = '0.01';
    status.textContent = 'Arraste para posicionar. Use o controle para ampliar.';
    paint();
}

export function cropReset() { if (st) { st.scale = st.cover; st.x = (VIEW_W - st.bmp.width * st.cover) / 2; st.y = (VIEW_H - st.bmp.height * st.cover) / 2; paint(); } }
export function cropFit() { if (st) { setScale(st.contain); } }

export async function cropApply() {
    if (!st) return;
    const outW = Math.max(200, Math.min(360, Math.round(VIEW_W / st.scale)));   // sem ampliar além da resolução real
    const f = outW / VIEW_W;
    const out = document.createElement('canvas');
    out.width = outW; out.height = Math.round(outW / RATIO);
    draw(out.getContext('2d'), f);
    const data = out.toDataURL('image/jpeg', 0.86);
    const done = st.onDone;
    $('modal-crop').close();
    st.bmp.close && st.bmp.close();
    st = null;
    if (done) done(data);
}

export function cropCancel() { $('modal-crop').close(); if (st) { st.bmp.close && st.bmp.close(); st = null; } }

function init() {
    const cv = $('crop-canvas');
    if (!cv) return;
    const toLocal = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * VIEW_W / r.width, y: (e.clientY - r.top) * VIEW_H / r.height }; };
    cv.addEventListener('pointerdown', e => { if (!st) return; cv.setPointerCapture(e.pointerId); st.pointers.set(e.pointerId, toLocal(e)); st.pinch = null; });
    cv.addEventListener('pointermove', e => {
        if (!st || !st.pointers.has(e.pointerId)) return;
        const prev = st.pointers.get(e.pointerId), cur = toLocal(e);
        st.pointers.set(e.pointerId, cur);
        if (st.pointers.size === 1) { st.x += cur.x - prev.x; st.y += cur.y - prev.y; paint(); }
        else if (st.pointers.size === 2) {   // pinça para dar zoom
            const [a, b] = [...st.pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (st.pinch) setScale(st.scale * d / st.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
            st.pinch = d;
        }
    });
    const up = e => { if (st) { st.pointers.delete(e.pointerId); st.pinch = null; } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (!st) return; e.preventDefault(); const p = toLocal(e); setScale(st.scale * (e.deltaY < 0 ? 1.08 : 0.93), p.x, p.y); }, { passive: false });
    $('crop-zoom').addEventListener('input', e => { if (st) setScale(st.cover * parseFloat(e.target.value)); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
