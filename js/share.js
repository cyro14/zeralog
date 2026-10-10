// Imagens para compartilhar: cartão de um jogo, prateleira de cartuchos ou lista de cards
// (inclusive já filtrados). Desenhadas direto num canvas, com as cores do tema e as logos do app.
import { appData } from './store.js';
import { fmtDate, daysUntil, countdownText } from './releases.js';

const W = 1080;
const FONT = '"Segoe UI", Roboto, system-ui, -apple-system, "Helvetica Neue", sans-serif';
const LOGO_PATH = 'M4 4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4H4ZM4 6H20V12H4V6ZM10.59 17.41L7 13.83L8.41 12.41L10.59 14.58L15.59 9.59L17 11L10.59 17.41Z';
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const pal = () => ({ bg: css('--bg-color') || '#121212', card: css('--card-bg') || '#1e1e1e', text: css('--text-main') || '#fff', muted: css('--text-muted') || '#aaa', border: css('--border-color') || '#333', play: css('--accent-playing') || '#2196f3', fin: css('--accent-finished') || '#4caf50', star: css('--star-color') || '#ffd700', add: css('--accent-add') || '#ff9800', live: css('--accent-live') || '#a77bff' });

// ---------- utilidades de desenho ----------
const imgCache = new Map();
function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (!imgCache.has(src)) imgCache.set(src, new Promise(res => { const i = new Image(); if (!String(src).startsWith('data:')) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
    return imgCache.get(src);
}
function rr(ctx, x, y, w, h, r) {
    const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.arcTo(x + w, y, x + w, y + b, b);
    ctx.lineTo(x + w, y + h - c); ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
    ctx.lineTo(x + d, y + h); ctx.arcTo(x, y + h, x, y + h - d, d);
    ctx.lineTo(x, y + a); ctx.arcTo(x, y, x + a, y, a); ctx.closePath();
}
function rgba(c, a) {
    let h = String(c).trim();
    if (h.startsWith('#')) { h = h.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
    return c;
}
function coverFit(ctx, img, x, y, w, h, r) {
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
}
function wrap(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        let l = lines[maxLines - 1];
        while (l.length > 1 && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1);
        lines[maxLines - 1] = l + '…';
    }
    return lines;
}
function ellipsis(ctx, text, maxW) {
    let t = String(text);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
}
function drawLogo(ctx, x, y, size, p) {
    ctx.save(); ctx.translate(x, y); const k = size / 24; ctx.scale(k, k);
    const g = ctx.createLinearGradient(0, 0, 24, 24); g.addColorStop(0, p.play); g.addColorStop(1, p.fin);
    ctx.fillStyle = g; ctx.fill(new Path2D(LOGO_PATH)); ctx.restore();
}
function pill(ctx, x, y, text, o = {}) {
    const size = o.size || 24, padX = o.padX || 16, h = size + 18;
    ctx.font = `700 ${size}px ${FONT}`;
    const w = Math.max(h, ctx.measureText(text).width + padX * 2);   // nunca mais estreita que alta (vira círculo)
    rr(ctx, x, y, w, h, h / 2);
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fill(); }
    if (o.border) { ctx.lineWidth = 2; ctx.strokeStyle = o.border; ctx.stroke(); }
    ctx.fillStyle = o.fg || '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    return { w, h };
}
function dominant(img) {
    try {
        const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 3; if (lum < 30 || lum > 235) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : null;
    } catch (e) { return null; }
}

// ícone da plataforma como imagem (SVG do app, imagem enviada ou nome em texto, se for fonte Phosphor)
async function platformGlyph(name, px, color) {
    const p = appData.platforms.find(x => x.name === name);
    const html = (p && p.icon) || '';
    let src = null;
    if (html.includes('<svg')) {
        let svg = html.replace(/currentColor/g, color).replace(/width="[^"]*"/, `width="${px}"`).replace(/height="[^"]*"/, `height="${px}"`);
        if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } else { const m = html.match(/<img[^>]*src="([^"]+)"/); if (m) src = m[1]; }
    return src ? loadImg(src) : null;
}
// "[ícone] Nintendo · 2017 · Aventura" centralizado ou à esquerda; retorna a largura usada
async function metaLine(ctx, x, y, item, o) {
    const parts = [];
    if (item.released) parts.push(String(item.released).slice(0, 4));
    if (item.genres && item.genres.length) parts.push(item.genres.slice(0, 2).join(', '));
    const glyph = o.icons === false ? null : await platformGlyph(item.platform, o.size, o.color);
    ctx.font = `500 ${o.size}px ${FONT}`;
    const text = (glyph ? '' : (item.platform ? item.platform + (parts.length ? '  ·  ' : '') : '')) + parts.join('  ·  ');
    const tw = ctx.measureText(text).width, gw = glyph ? o.size * 1.15 + 12 : 0;
    const total = Math.min(o.maxW || 9999, gw + tw);
    let sx = o.align === 'center' ? x - total / 2 : x;
    if (glyph) { ctx.drawImage(glyph, sx, y - o.size * 0.6, o.size * 1.15, o.size * 1.15); sx += gw; }
    ctx.fillStyle = o.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(ellipsis(ctx, text, (o.maxW || 9999) - gw), sx, y);
    return total;
}

function backdrop(ctx, H, p, img) {
    if (img) {
        ctx.save();
        try { ctx.filter = 'blur(38px) brightness(0.55) saturate(1.2)'; } catch (e) {}
        const s = Math.max(W / img.width, H / img.height) * 1.25;
        ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
        ctx.restore();
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.78)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, p.bg); g.addColorStop(1, rgba(p.card, 1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.9); r.addColorStop(0, rgba(p.play, 0.22)); r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    const r2 = ctx.createRadialGradient(W, H, 0, W, H, W * 0.8); r2.addColorStop(0, rgba(p.fin, 0.16)); r2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r2; ctx.fillRect(0, 0, W, H);
}
function footer(ctx, y, p, light) {
    const fg = light ? '#ffffff' : p.text;
    ctx.font = `800 34px ${FONT}`; ctx.textBaseline = 'middle';
    const a = 'ZeraLog ', b = 'x Anywhere Gamer';
    const wa = ctx.measureText(a).width; ctx.font = `800 34px ${FONT}`; const wb = ctx.measureText(b).width;
    const total = 54 + 14 + wa + wb, x = (W - total) / 2;
    drawLogo(ctx, x, y - 27, 54, p);
    ctx.textAlign = 'left'; ctx.fillStyle = fg; ctx.fillText(a, x + 68, y + 2);
    ctx.fillStyle = p.play; ctx.fillText(b, x + 68 + wa, y + 2);
}
function header(ctx, p, title, subtitle, light) {
    const fg = light ? '#fff' : p.text, mu = light ? 'rgba(255,255,255,0.75)' : p.muted;
    drawLogo(ctx, 56, 52, 64, p);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `800 44px ${FONT}`; ctx.fillStyle = fg; ctx.fillText('ZeraLog', 134, 86);
    ctx.font = `800 62px ${FONT}`; ctx.fillStyle = fg;
    const lines = wrap(ctx, title, W - 112, 2);
    lines.forEach((l, i) => ctx.fillText(l, 56, 190 + i * 70));
    let y = 190 + lines.length * 70 + 4;
    if (subtitle) {
        ctx.font = `500 27px ${FONT}`; ctx.fillStyle = mu;
        const sl = wrap(ctx, subtitle, W - 112, 2);
        sl.forEach((l, i) => ctx.fillText(l, 56, y + 18 + i * 36));
        y += sl.length * 36 + 14;
    }
    return y + 30;
}

// ---------- informações de cada jogo conforme a tela de origem ----------
const DIFF = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', extreme: 'Extremo' };
function chipsFor(item, mode, p) {
    const chips = [];
    if (mode === 'finished' || item.state === 'finished') {
        if (item.is100) chips.push({ t: '100%', bg: p.star, fg: '#241a00' });
        if (item.dateFinished) chips.push({ t: item.dateFinished, border: rgba(p.fin, 0.9), fg: p.fin });
    } else if (mode === 'wish') {
        if (item.released) {
            const n = daysUntil(item.released);
            chips.push({ t: n !== null && n > 0 ? countdownText(item).replace('Lança ', '') : fmtDate(item.released), bg: n !== null && n > 0 ? p.add : null, border: n !== null && n > 0 ? null : p.muted, fg: n !== null && n > 0 ? '#1a1000' : p.muted });
            if (n !== null && n > 0) chips.push({ t: fmtDate(item.released), border: p.add, fg: p.add });
        } else chips.push({ t: item.tba ? 'Data a confirmar' : 'Sem data', border: p.muted, fg: p.muted });
        if (item.notifyRelease) chips.push({ t: 'Avisar ao lançar', border: p.play, fg: p.play });
    } else {
        if (item.continuous) chips.push({ t: 'Contínuo', border: p.live, fg: p.live });
        else if (item.state === 'playing') chips.push({ t: 'Jogando', bg: p.play, fg: '#fff' });
        else chips.push({ t: 'Na fila', border: p.muted, fg: p.muted });
        if (item.hoursPlayed) chips.push({ t: `${item.hoursPlayed}h jogadas`, border: p.muted, fg: p.muted });
    }
    if (item.emulated) chips.push({ t: 'Emulado' + (item.originalConsole ? ' · ' + item.originalConsole : ''), border: '#26c6da', fg: '#26c6da' });
    if (item.difficulty && DIFF[item.difficulty]) chips.push({ t: DIFF[item.difficulty], border: p.muted, fg: p.muted });
    if (item.isPortable) chips.push({ t: 'Portátil', border: p.play, fg: p.play });
    if (item.metacritic) chips.push({ t: `Metacritic ${item.metacritic}`, bg: item.metacritic >= 75 ? '#2e9e4f' : item.metacritic >= 50 ? '#c9a227' : '#d64541', fg: item.metacritic >= 50 && item.metacritic < 75 ? '#111' : '#fff' });
    return chips;
}

// ---------- 1) cartão de um jogo ----------
export async function renderGameCard(game) {
    const p = pal();
    const H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = await loadImg(game.image);
    const accent = (img && dominant(img)) || p.fin;
    backdrop(ctx, H, p, img);
    // topo
    drawLogo(ctx, 56, 50, 64, p);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = `800 44px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText('ZeraLog', 134, 84);
    const label = game.state === 'finished' ? 'ZERADO' : game.continuous ? 'CONTÍNUO' : game.state === 'playing' ? 'JOGANDO' : 'NA FILA';
    ctx.font = `800 26px ${FONT}`; const lw = ctx.measureText(label).width + 44;
    pill(ctx, W - 56 - lw, 56, label, { size: 26, padX: 22, bg: accent, fg: '#fff' });
    // capa
    const cw = 470, ch = 705, cx = (W - cw) / 2, cy = 170;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24; rr(ctx, cx, cy, cw, ch, 28); ctx.fillStyle = '#111'; ctx.fill(); ctx.restore();
    if (img) coverFit(ctx, img, cx, cy, cw, ch, 28);
    else { rr(ctx, cx, cy, cw, ch, 28); ctx.fillStyle = rgba(accent, 0.35); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `800 220px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText((game.title.trim()[0] || '?').toUpperCase(), W / 2, cy + ch / 2); }
    rr(ctx, cx, cy, cw, ch, 28); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
    // nota e 100%
    if (game.userRating && game.state === 'finished') {
        const r = 70, bx = cx + cw - 20, by = cy + 20;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fillStyle = p.star; ctx.fill(); ctx.restore();
        ctx.fillStyle = '#241a00'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 64px ${FONT}`; ctx.fillText(String(game.userRating), bx, by - 4);
        ctx.font = `700 22px ${FONT}`; ctx.fillText('/10', bx, by + 40);
    }
    if (game.is100) pill(ctx, cx + 20, cy + ch - 70, '★ 100%', { size: 30, padX: 22, bg: p.star, fg: '#241a00' });
    // título e meta
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 62px ${FONT}`;
    const tl = wrap(ctx, game.title, W - 140, 2);
    tl.forEach((l, i) => ctx.fillText(l, W / 2, 940 + i * 68));
    let y = 940 + tl.length * 68 + 22;
    await metaLine(ctx, W / 2, y, game, { size: 30, color: 'rgba(255,255,255,0.85)', align: 'center', maxW: W - 160 });
    y += 54;
    // selos
    const chips = chipsFor(game, game.state === 'finished' ? 'finished' : 'home', p).slice(0, 6);
    ctx.font = `700 24px ${FONT}`;
    const widths = chips.map(ch2 => ctx.measureText(ch2.t).width + 32), gap = 12;
    let rowW = 0, row = [], rows = [];
    chips.forEach((ch2, i) => { if (rowW + widths[i] > W - 140 && row.length) { rows.push(row); row = []; rowW = 0; } row.push(i); rowW += widths[i] + gap; });
    if (row.length) rows.push(row);
    rows.slice(0, 2).forEach((r, ri) => {
        const tot = r.reduce((a, i) => a + widths[i] + gap, -gap); let x = (W - tot) / 2;
        r.forEach(i => { const o = chips[i]; pill(ctx, x, y + ri * 54, o.t, { size: 24, bg: o.bg, border: o.border, fg: o.fg || '#fff' }); x += widths[i] + gap; });
    });
    y += Math.min(rows.length, 2) * 54 + 14;
    // resenha
    const quote = game.review && game.review.trim();
    if (quote && y < 1180) {
        ctx.font = `italic 500 29px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.textAlign = 'center';
        const ql = wrap(ctx, `“${quote}”`, W - 200, Math.max(1, Math.min(3, Math.floor((1235 - y) / 40))));
        ql.forEach((l, i) => ctx.fillText(l, W / 2, y + 16 + i * 40));
    }
    footer(ctx, 1292, p, true);
    return c;
}

// ---------- 2) prateleira de cartuchos ----------
async function drawCart(ctx, item, x, y, w, h, p, showBadges) {
    const img = await loadImg(item.image);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    rr(ctx, x, y, w, h, [w * 0.1, w * 0.1, w * 0.04, w * 0.04]);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a4a52'); g.addColorStop(1, '#2a2a2f'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    if (item.is100) { rr(ctx, x, y, w, h, [w * 0.1, w * 0.1, w * 0.04, w * 0.04]); ctx.lineWidth = Math.max(3, w * 0.03); ctx.strokeStyle = p.star; ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; rr(ctx, x + w * 0.32, y + w * 0.035, w * 0.36, w * 0.03, w * 0.015); ctx.fill();
    const lx = x + w * 0.07, ly = y + w * 0.11, lw = w * 0.86, lh = h - w * 0.11 - w * 0.2;
    if (img) coverFit(ctx, img, lx, ly, lw, lh, w * 0.03);
    else {
        rr(ctx, lx, ly, lw, lh, w * 0.03); ctx.fillStyle = '#16161a'; ctx.fill();
        ctx.fillStyle = '#d5d9e2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(13, w * 0.12)}px ${FONT}`;
        wrap(ctx, item.title, lw - 12, 5).forEach((l, i, a) => ctx.fillText(l, lx + lw / 2, ly + lh / 2 + (i - (a.length - 1) / 2) * w * 0.15));
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(2, w * 0.012);
    for (let i = 0; i < 9; i++) { const gx = x + w * 0.14 + i * (w * 0.72 / 8); ctx.beginPath(); ctx.moveTo(gx, y + h - w * 0.16); ctx.lineTo(gx, y + h - w * 0.05); ctx.stroke(); }
    if (showBadges) {
        let bx = lx + 6; const by = ly + lh - 8 - Math.max(24, w * 0.2);
        if (item.is100) { const r = pill(ctx, bx, by, '★100%', { size: Math.max(12, w * 0.11), padX: 8, bg: 'rgba(0,0,0,0.78)', fg: p.star }); bx += r.w + 6; }
        if (item.state === 'finished' && item.userRating) pill(ctx, bx, by, String(item.userRating), { size: Math.max(12, w * 0.11), padX: 9, bg: 'rgba(0,0,0,0.78)', fg: '#fff' });
    }
}
export async function renderShelf(items, o) {
    const p = pal(), n = items.length;
    const cols = n <= 8 ? 4 : n <= 15 ? 5 : n <= 24 ? 6 : n <= 35 ? 7 : 8;
    const pad = 56, gap = Math.round(110 / cols) + 10, cartW = (W - pad * 2 - gap * (cols - 1)) / cols, cartH = cartW * 1.5;
    const showTitles = o.titles && cols <= 7, boardH = showTitles ? 64 : 44, rowH = cartH + boardH + 26;
    const rows = Math.ceil(n / cols);
    const tmp = document.createElement('canvas').getContext('2d'); tmp.font = `800 62px ${FONT}`;
    const hh = (wrap(tmp, o.title, W - 112, 2).length * 70) + (o.subtitle ? 100 : 40) + 170;
    const H = Math.round(hh + rows * rowH + 170);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    backdrop(ctx, H, p, null);
    let y0 = header(ctx, p, o.title, o.subtitle, false) + 10;
    for (let r = 0; r < rows; r++) {
        const top = y0 + r * rowH, by = top + cartH - 6;
        // tábua de madeira
        const bx = pad - 26, bw = W - (pad - 26) * 2;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 12;
        rr(ctx, bx, by, bw, boardH, 8); const wg = ctx.createLinearGradient(0, by, 0, by + boardH); wg.addColorStop(0, '#a47a4f'); wg.addColorStop(0.35, '#7a5535'); wg.addColorStop(1, '#4a3220'); ctx.fillStyle = wg; ctx.fill(); ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(bx + 8, by + 2, bw - 16, 3);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
        for (let k = 0; k < 7; k++) { const ly = by + 12 + k * (boardH - 16) / 6; ctx.beginPath(); ctx.moveTo(bx + 14, ly); ctx.lineTo(bx + bw - 14, ly + (k % 2 ? 2 : -2)); ctx.stroke(); }
        for (let k = 0; k < cols; k++) {
            const it = items[r * cols + k]; if (!it) break;
            const x = pad + k * (cartW + gap);
            await drawCart(ctx, it, x, top, cartW, cartH, p, cols <= 7);
            if (showTitles) { ctx.font = `600 ${cols <= 5 ? 20 : 17}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ellipsis(ctx, it.title, cartW + gap - 8), x + cartW / 2, by + 24 + (boardH - 44) / 2 + 10); }
        }
    }
    footer(ctx, H - 70, p, false);
    return c;
}

// ---------- 3) lista de cards ----------
export async function renderCards(items, o) {
    const p = pal(), n = items.length, cols = 2, pad = 48, gap = 22, cw = (W - pad * 2 - gap) / 2, chh = 214;
    const rows = Math.ceil(n / cols);
    const tmp = document.createElement('canvas').getContext('2d'); tmp.font = `800 62px ${FONT}`;
    const hh = (wrap(tmp, o.title, W - 112, 2).length * 70) + (o.subtitle ? 100 : 40) + 170;
    const H = Math.round(hh + rows * (chh + gap) + 150);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    backdrop(ctx, H, p, null);
    const y0 = header(ctx, p, o.title, o.subtitle, false) + 4;
    for (let i = 0; i < n; i++) {
        const it = items[i], x = pad + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (chh + gap);
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8; rr(ctx, x, y, cw, chh, 22); ctx.fillStyle = p.card; ctx.fill(); ctx.restore();
        rr(ctx, x, y, cw, chh, 22); ctx.lineWidth = it.is100 ? 3 : 1.5; ctx.strokeStyle = it.is100 ? p.star : p.border; ctx.stroke();
        const img = await loadImg(it.image), iw = 118, ih = chh - 36, ix = x + 18, iy = y + 18;
        if (img) coverFit(ctx, img, ix, iy, iw, ih, 12);
        else { rr(ctx, ix, iy, iw, ih, 12); ctx.fillStyle = rgba(p.muted, 0.2); ctx.fill(); ctx.fillStyle = p.muted; ctx.font = `800 54px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((it.title.trim()[0] || '?').toUpperCase(), ix + iw / 2, iy + ih / 2); }
        const tx = ix + iw + 18, tw = cw - iw - 18 * 3;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `800 29px ${FONT}`; ctx.fillStyle = p.text;
        const tl = wrap(ctx, it.title, tw - (it.state === 'finished' && it.userRating ? 70 : 0), 2);
        tl.forEach((l, k) => ctx.fillText(l, tx, y + 42 + k * 34));
        const my = y + 42 + tl.length * 34 + 8;
        await metaLine(ctx, tx, my, it, { size: 21, color: p.muted, maxW: tw });
        // selos
        let cx2 = tx, cy2 = my + 22; const chips = chipsFor(it, o.mode, p).slice(0, 4);
        for (const ch of chips) {
            ctx.font = `700 19px ${FONT}`; const w2 = ctx.measureText(ch.t).width + 24;
            if (cx2 + w2 > tx + tw) { cx2 = tx; cy2 += 38; if (cy2 > y + chh - 36) break; }
            const r = pill(ctx, cx2, cy2, ch.t, { size: 19, padX: 12, bg: ch.bg, border: ch.border, fg: ch.fg || '#fff' }); cx2 += r.w + 8;
        }
        if (it.state === 'finished' && it.userRating) {
            const bx = x + cw - 46, by = y + 44;
            ctx.beginPath(); ctx.arc(bx, by, 30, 0, Math.PI * 2); ctx.fillStyle = p.star; ctx.fill();
            ctx.fillStyle = '#241a00'; ctx.textAlign = 'center'; ctx.font = `900 28px ${FONT}`; ctx.fillText(String(it.userRating), bx, by + 1);
        }
    }
    footer(ctx, H - 66, p, false);
    return c;
}

// ---------- janela de compartilhamento ----------
const $ = id => document.getElementById(id);
const PER_PAGE = { shelf: 40, cards: 12 };
let S = null, timer = null, urls = [];
let hooks = { toast() {} };
export const initShare = h => { hooks = h; };

const blobOf = c => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('canvas vazio')), 'image/png'));
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'zeralog';

async function build() {
    if (!S) return;
    const status = $('sh-status');
    status.textContent = 'Gerando a imagem...';
    try {
        let canvas;
        if (S.kind === 'game') canvas = await renderGameCard(S.game);
        else {
            const per = PER_PAGE[S.style], pages = Math.max(1, Math.ceil(S.items.length / per));
            S.page = Math.min(S.page, pages - 1);
            const slice = S.items.slice(S.page * per, (S.page + 1) * per);
            const title = S.title + (pages > 1 ? ` · parte ${S.page + 1}/${pages}` : '');
            const o = { title, subtitle: S.subtitle, titles: $('sh-titles').checked, mode: S.mode };
            canvas = S.style === 'shelf' ? await renderShelf(slice, o) : await renderCards(slice, o);
            $('sh-pages').style.display = pages > 1 ? '' : 'none';
            $('sh-page-label').textContent = `Parte ${S.page + 1} de ${pages}`;
        }
        S.blob = await blobOf(canvas);
        urls.forEach(u => URL.revokeObjectURL(u)); urls = [URL.createObjectURL(S.blob)];
        $('sh-preview').src = urls[0];
        status.textContent = S.kind === 'game' ? '' : `${S.items.length} ${S.items.length === 1 ? 'jogo' : 'jogos'} na seleção.`;
    } catch (e) {
        console.error(e);
        status.textContent = 'Não consegui gerar a imagem (alguma capa externa bloqueou o canvas). Tente trocar as capas por imagens salvas no app.';
    }
}
const rebuildSoon = () => { clearTimeout(timer); timer = setTimeout(build, 260); };

export function openShare({ items, mode, title, subtitle, style }) {
    S = { kind: 'list', items, mode, title, subtitle, style: style || 'shelf', page: 0, blob: null };
    $('sh-style-row').style.display = '';
    $('sh-title').value = title; $('sh-title').style.display = ''; $('sh-titles-row').style.display = '';
    $('sh-titles').checked = items.length <= 24;
    paintStyle();
    $('modal-share').showModal();
    build();
}
export function openCardGenerator(gameId) {
    const game = appData.games.find(g => g.id === gameId) || (appData.wishlist || []).find(g => g.id === gameId);
    if (!game) return;
    S = { kind: 'game', game, page: 0, blob: null, title: game.title };
    $('sh-style-row').style.display = 'none'; $('sh-title').style.display = 'none'; $('sh-titles-row').style.display = 'none'; $('sh-pages').style.display = 'none';
    $('modal-share').showModal();
    build();
}
function paintStyle() {
    $('sh-style-shelf').classList.toggle('active', S.style === 'shelf');
    $('sh-style-cards').classList.toggle('active', S.style === 'cards');
}
export function shareSetStyle(st) { if (!S || S.kind !== 'list') return; S.style = st; S.page = 0; paintStyle(); build(); }
export function sharePage(d) { if (!S) return; S.page = Math.max(0, S.page + d); build(); }
export function shareTitleChanged() { if (S && S.kind === 'list') { S.title = $('sh-title').value || S.title; rebuildSoon(); } }
export function shareTitlesChanged() { rebuildSoon(); }

const fileName = () => `ZeraLog_${slug(S.title)}${S.kind === 'list' && S.items.length > PER_PAGE[S.style] ? `_parte-${S.page + 1}` : ''}.png`;
export function shareDownload() {
    if (!S || !S.blob) return;
    const a = document.createElement('a'); a.href = urls[0]; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    hooks.toast('Imagem salva!');
}
export async function shareShare() {
    if (!S || !S.blob) return;
    const file = new File([S.blob], fileName(), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: S.title, text: `${S.title} · ZeraLog x Anywhere Gamer` }); } catch (e) { /* cancelado */ }
    } else { hooks.toast('Este navegador não compartilha arquivos direto. Use "Baixar" e envie a imagem.'); }
}
export const canShareFiles = () => !!(navigator.canShare && (() => { try { return navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }); } catch (e) { return false; } })());
