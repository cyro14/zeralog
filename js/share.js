// Imagens para compartilhar: cartão de um jogo, prateleira de cartuchos ou a
// linha do tempo dos zerados (prateleiras agrupadas por ano — ou por mês, se a
// tela estiver no modo "Por mês").
// Desenhadas direto num canvas, com as cores do tema e as logos do app.
import { appData } from './store.js';
import { fmtDate, daysUntil, countdownText } from './releases.js';
import { ACHIEVEMENTS, gamerXp, levelFromXp, rankOf } from './achievements.js';

const W = 1080;
const BLOG_URL = 'anywheregamer.blogspot.com/p/zeralog.html';
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
    // Mesma regra da tela: altura fixa, largura pelo formato do logo (PS5 deitado
    // fica mais largo — nunca desenhado espremido num quadrado)
    let gw = 0, ga = 1;
    if (glyph) {
        ga = Math.min(1.6, Math.max(0.75, (glyph.width || 1) / (glyph.height || 1)));
        gw = o.size * 1.15 * ga + 12;
    }
    ctx.font = `500 ${o.size}px ${FONT}`;
    const text = (glyph ? '' : (item.platform ? item.platform + (parts.length ? '  ·  ' : '') : '')) + parts.join('  ·  ');
    const tw = ctx.measureText(text).width;
    const total = Math.min(o.maxW || 9999, gw + tw);
    let sx = o.align === 'center' ? x - total / 2 : x;
    if (glyph) { ctx.drawImage(glyph, sx, y - o.size * 0.6, o.size * 1.15 * ga, o.size * 1.15); sx += gw; }
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
    // Link do app: presente em TODAS as imagens compartilháveis
    ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = light ? 'rgba(255,255,255,0.72)' : p.muted;
    ctx.fillText(BLOG_URL, W / 2, y + 34);
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
function chipsFor(item, rawMode, p) {
    // No modo franquia cada jogo mostra o próprio status: zerado, jogando, na fila ou desejo
    const mode = rawMode === 'franchise' ? (item.state === 'finished' ? 'finished' : item.state === undefined ? 'wish' : 'home') : rawMode;
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
    ctx.font = `700 19px ${FONT}`;
    const widths = chips.map(ch2 => ctx.measureText(ch2.t).width + 26), gap = 10;
    let rowW = 0, row = [], rows = [];
    chips.forEach((ch2, i) => { if (rowW + widths[i] > W - 140 && row.length) { rows.push(row); row = []; rowW = 0; } row.push(i); rowW += widths[i] + gap; });
    if (row.length) rows.push(row);
    rows.slice(0, 2).forEach((r, ri) => {
        const tot = r.reduce((a, i) => a + widths[i] + gap, -gap); let x = (W - tot) / 2;
        r.forEach(i => { const o = chips[i]; pill(ctx, x, y + ri * 44, o.t, { size: 19, bg: o.bg, border: o.border, fg: o.fg || '#fff' }); x += widths[i] + gap; });
    });
    y += Math.min(rows.length, 2) * 44 + 14;
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
async function drawCart(ctx, item, x, y, w, h, p, showBadges, dim, plain = false) {
    const img = await loadImg(item.image);
    if (plain) {
        // Prateleira limpa: só a capa com sombra, sem o desenho do cartucho
        const r = Math.max(10, w * 0.09);
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
        rr(ctx, x, y, w, h, r); ctx.fillStyle = '#101014'; ctx.fill(); ctx.restore();
        if (img) {
            if (dim) { ctx.save(); try { ctx.filter = 'grayscale(1) brightness(0.7)'; } catch (e) {} coverFit(ctx, img, x, y, w, h, r); ctx.restore(); }
            else coverFit(ctx, img, x, y, w, h, r);
        } else {
            rr(ctx, x, y, w, h, r); ctx.fillStyle = '#16161a'; ctx.fill();
            ctx.fillStyle = '#d5d9e2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(13, w * 0.12)}px ${FONT}`;
            wrap(ctx, item.title, w - 12, 5).forEach((l, i, a) => ctx.fillText(l, x + w / 2, y + h / 2 + (i - (a.length - 1) / 2) * w * 0.15));
        }
        if (item.is100) { rr(ctx, x, y, w, h, r); ctx.lineWidth = Math.max(3, w * 0.03); ctx.strokeStyle = p.star; ctx.stroke(); }
        if (showBadges) {
            let bx = x + 6; const by = y + h - 8 - Math.max(24, w * 0.2);
            if (item.is100) { const r0 = pill(ctx, bx, by, '★100%', { size: Math.max(12, w * 0.11), padX: 8, bg: 'rgba(0,0,0,0.78)', fg: p.star }); bx += r0.w + 6; }
            if (item.state === 'finished' && item.userRating) pill(ctx, bx, by, String(item.userRating), { size: Math.max(12, w * 0.11), padX: 9, bg: 'rgba(0,0,0,0.78)', fg: '#fff' });
        }
        return;
    }
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    rr(ctx, x, y, w, h, [w * 0.1, w * 0.1, w * 0.04, w * 0.04]);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a4a52'); g.addColorStop(1, '#2a2a2f'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    if (item.is100) { rr(ctx, x, y, w, h, [w * 0.1, w * 0.1, w * 0.04, w * 0.04]); ctx.lineWidth = Math.max(3, w * 0.03); ctx.strokeStyle = p.star; ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; rr(ctx, x + w * 0.32, y + w * 0.035, w * 0.36, w * 0.03, w * 0.015); ctx.fill();
    const lx = x + w * 0.07, ly = y + w * 0.11, lw = w * 0.86, lh = h - w * 0.11 - w * 0.2;
    if (img) {
        if (dim) { ctx.save(); try { ctx.filter = 'grayscale(1)'; } catch (e) {} coverFit(ctx, img, lx, ly, lw, lh, w * 0.03); ctx.restore(); }
        else coverFit(ctx, img, lx, ly, lw, lh, w * 0.03);
    } else {
        rr(ctx, lx, ly, lw, lh, w * 0.03); ctx.fillStyle = '#16161a'; ctx.fill();
        ctx.fillStyle = '#d5d9e2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(13, w * 0.12)}px ${FONT}`;
        wrap(ctx, item.title, lw - 12, 5).forEach((l, i, a) => ctx.fillText(l, lx + lw / 2, ly + lh / 2 + (i - (a.length - 1) / 2) * w * 0.15));
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(2, w * 0.012);
    for (let i = 0; i < 9; i++) { const gx = x + w * 0.14 + i * (w * 0.72 / 8); ctx.beginPath(); ctx.moveTo(gx, y + h - w * 0.16); ctx.lineTo(gx, y + h - w * 0.05); ctx.stroke(); }
    // Ainda não zerado: cartucho apagado (cinza) por cima de tudo
    if (dim) { rr(ctx, x, y, w, h, [w * 0.1, w * 0.1, w * 0.04, w * 0.04]); ctx.fillStyle = 'rgba(12,12,18,0.52)'; ctx.fill(); }
    if (showBadges) {
        let bx = lx + 6; const by = ly + lh - 8 - Math.max(24, w * 0.2);
        if (item.is100) { const r = pill(ctx, bx, by, '★100%', { size: Math.max(12, w * 0.11), padX: 8, bg: 'rgba(0,0,0,0.78)', fg: p.star }); bx += r.w + 6; }
        if (item.state === 'finished' && item.userRating) pill(ctx, bx, by, String(item.userRating), { size: Math.max(12, w * 0.11), padX: 9, bg: 'rgba(0,0,0,0.78)', fg: '#fff' });
    }
}
// Tábua de madeira da prateleira (usada pela prateleira normal e pela linha do tempo)
function drawBoard(ctx, top, cartH, boardH) {
    const by = top + cartH - 6;
    const bx = 56 - 26, bw = W - (56 - 26) * 2;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 12;
    rr(ctx, bx, by, bw, boardH, 8); const wg = ctx.createLinearGradient(0, by, 0, by + boardH); wg.addColorStop(0, '#a47a4f'); wg.addColorStop(0.35, '#7a5535'); wg.addColorStop(1, '#4a3220'); ctx.fillStyle = wg; ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(bx + 8, by + 2, bw - 16, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const ly = by + 12 + k * (boardH - 16) / 6; ctx.beginPath(); ctx.moveTo(bx + 14, ly); ctx.lineTo(bx + bw - 14, ly + (k % 2 ? 2 : -2)); ctx.stroke(); }
}

export async function renderShelf(items, o) {
    const p = pal(), n = items.length;
    const tiny = !!o.tiny;
    // Capas minúsculas: sem prateleira de madeira, capas menores e colunas extras —
    // tudo vira uma imagem única. Normal: prateleira com a tábua de madeira.
    const cols = tiny
        ? (n <= 25 ? 8 : n <= 50 ? 10 : n <= 80 ? 11 : 12)
        : (n <= 8 ? 4 : n <= 15 ? 5 : n <= 24 ? 6 : n <= 35 ? 7 : 8);
    const pad = 56, gap = tiny ? 8 : Math.round(110 / cols) + 10, cartW = (W - pad * 2 - gap * (cols - 1)) / cols, cartH = cartW * 1.5;
    const showTitles = !tiny && o.titles && cols <= 7, boardH = showTitles ? 64 : 44, rowH = cartH + (tiny ? 16 : boardH + 26);
    const rows = Math.ceil(n / cols);
    const tmp = document.createElement('canvas').getContext('2d'); tmp.font = `800 62px ${FONT}`;
    const hh = (wrap(tmp, o.title, W - 112, 2).length * 70) + (o.subtitle ? 100 : 40) + 170;
    const H = Math.round(hh + rows * rowH + (tiny ? 140 : 170));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    backdrop(ctx, H, p, null);
    let y0 = header(ctx, p, o.title, o.subtitle, false) + 10;
    for (let r = 0; r < rows; r++) {
        const top = y0 + r * rowH;
        if (!tiny) drawBoard(ctx, top, cartH, boardH);
        for (let k = 0; k < cols; k++) {
            const it = items[r * cols + k]; if (!it) break;
            const x = pad + k * (cartW + gap);
            const dim = !!(o.gray && it.state !== 'finished');
            await drawCart(ctx, it, x, top, cartW, cartH, p, !tiny && cols <= 7, dim, tiny ? true : o.plain);
            if (showTitles) { ctx.font = `600 ${cols <= 5 ? 20 : 17}px ${FONT}`; ctx.fillStyle = dim ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ellipsis(ctx, it.title, cartW + gap - 8), x + cartW / 2, top + cartH - 6 + 24 + (boardH - 44) / 2 + 10); }
        }
    }
    footer(ctx, H - 70, p, false);
    return c;
}

// ---------- 3) linha do tempo (prateleira por ano/mês de conclusão) ----------
// A mesma ordem (e o mesmo agrupamento) da aba Zerados: grupos por ANO, que a opção
// "Por mês" da tela separa em meses — a imagem segue o que está escolhido no app.
function parseFinishedDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    let y, mo, d, m;
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return null;
    const date = new Date(y, mo - 1, d);
    return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}
function timelineGroups(items) {
    const byMonth = appData.settings.timelineGroup === 'month';
    const groups = [];
    items.forEach(g => {
        const d = parseFinishedDate(g.dateFinished);
        let key = 'none', label = 'Sem data';
        if (d) {
            if (byMonth) {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const txt = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                label = txt.charAt(0).toUpperCase() + txt.slice(1);
            } else {
                key = String(d.getFullYear()); label = String(d.getFullYear());
            }
        }
        let grp = groups.find(x => x.key === key);
        if (!grp) { grp = { key, label, items: [] }; groups.push(grp); }
        grp.items.push(g);
    });
    return groups;
}
export async function renderTimelineImg(items, o) {
    const p = pal();
    const groups = timelineGroups(items);
    const cols = 8, pad = 56, gap = 16;
    const cartW = (W - pad * 2 - gap * (cols - 1)) / cols, cartH = cartW * 1.5;
    const boardH = 44, rowH = cartH + boardH + 26, labelH = 58;
    const rowsTotal = groups.reduce((a, g) => a + Math.ceil(g.items.length / cols), 0);
    const tmp = document.createElement('canvas').getContext('2d'); tmp.font = `800 62px ${FONT}`;
    const hh = (wrap(tmp, o.title, W - 112, 2).length * 70) + (o.subtitle ? 100 : 40) + 170;
    const H = Math.round(hh + groups.length * labelH + rowsTotal * rowH + 170);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    backdrop(ctx, H, p, null);
    let y = header(ctx, p, o.title, o.subtitle, false) + 10;
    for (const grp of groups) {
        // rótulo do mês: "Março 2025 · 3 jogos"
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = `800 36px ${FONT}`; ctx.fillStyle = p.text;
        const label = ellipsis(ctx, grp.label, W - pad * 2 - 130);
        ctx.fillText(label, pad, y + 14);
        ctx.font = `600 24px ${FONT}`; const lw = ctx.measureText(label).width;
        ctx.fillStyle = p.muted;
        ctx.fillText(`${grp.items.length} ${grp.items.length === 1 ? 'jogo' : 'jogos'}`, pad + lw + 16, y + 16);
        y += labelH;
        const rows = Math.ceil(grp.items.length / cols);
        for (let r = 0; r < rows; r++) {
            const top = y + r * rowH;
            drawBoard(ctx, top, cartH, boardH);
            for (let k = 0; k < cols; k++) {
                const it = grp.items[r * cols + k]; if (!it) break;
                await drawCart(ctx, it, pad + k * (cartW + gap), top, cartW, cartH, p, false, false, o.plain);
            }
        }
        y += rows * rowH;
    }
    footer(ctx, H - 70, p, false);
    return c;
}

// ---------- 4) Gamer ID: o perfil do jogador como imagem ----------
// Foto, nível/XP, contadores, bio e a prateleira do que está jogando.
export async function renderGamerId() {
    const p = pal();
    const steam = appData.settings.steam || {};
    const gm = appData.gamematch || {};
    const name = (gm.profile && gm.profile.name) || steam.persona || 'Seu Gamer';
    const bio = String(appData.settings.profileBio || '').trim();
    const photo = appData.settings.userPhoto || steam.avatar || '';
    const xp = gamerXp(), lvl = levelFromXp(xp), rank = rankOf(lvl.level);
    const playing = appData.games.filter(g => g.state === 'playing' && !g.continuous).slice(0, 7);
    const backlog = appData.games.filter(g => !g.continuous && g.state !== 'finished' && g.state !== 'playing').length;
    const zerados = appData.games.filter(g => !g.continuous && g.state === 'finished').length;
    const unCount = (appData.unlockedAchievements || []).length;

    const tmp = document.createElement('canvas').getContext('2d'); tmp.font = `500 30px ${FONT}`;
    const bioLines = bio ? wrap(tmp, bio, W - 180, 4).length : 0;
    const gap = 20, cw = Math.min(150, (W - 112 - (playing.length - 1) * gap) / Math.max(1, playing.length)), ch = cw * 1.5;
    const H = Math.round(560 + bioLines * 42 + (playing.length ? 44 + ch + 20 : 0) + 100);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    backdrop(ctx, H, p, null);
    // topo: logo + selo GAMER ID
    drawLogo(ctx, 56, 48, 54, p);
    ctx.font = `800 38px ${FONT}`; ctx.fillStyle = p.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('ZeraLog', 124, 76);
    pill(ctx, W - 262, 52, 'GAMER ID', { size: 26, padX: 24, bg: p.play, fg: '#fff' });
    // foto do perfil (círculo), com a inicial de fallback
    const ax = 128, ay = 218, ar = 78;
    const av = await loadImg(photo);
    if (av) {
        ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
        const s = Math.max(ar * 2 / av.width, ar * 2 / av.height);
        ctx.drawImage(av, ax - av.width * s / 2, ay - av.height * s / 2, av.width * s, av.height * s); ctx.restore();
    } else {
        const g = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar); g.addColorStop(0, p.play); g.addColorStop(1, p.fin);
        ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText((name.trim()[0] || '?').toUpperCase(), ax, ay + 4);
    }
    ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = rgba(p.play, 0.85); ctx.stroke();
    // nome, título e barra de XP
    const nx = ax + ar + 34;
    ctx.textAlign = 'left'; ctx.font = `800 58px ${FONT}`; ctx.fillStyle = p.text;
    ctx.fillText(ellipsis(ctx, name, W - nx - 220), nx, 182);
    ctx.font = `600 30px ${FONT}`; ctx.fillStyle = p.muted;
    ctx.fillText(`Nível ${lvl.level} · ${rank}`, nx, 234);
    const bw = Math.min(520, W - nx - 60), bx = nx, by = 258;
    rr(ctx, bx, by, bw, 20, 10); ctx.fillStyle = rgba(p.muted, 0.25); ctx.fill();
    const g2 = ctx.createLinearGradient(bx, by, bx + bw, by); g2.addColorStop(0, p.play); g2.addColorStop(1, p.fin);
    rr(ctx, bx, by, Math.max(20, bw * (lvl.into / lvl.need)), 20, 10); ctx.fillStyle = g2; ctx.fill();
    ctx.font = `600 22px ${FONT}`; ctx.fillStyle = p.muted;
    ctx.fillText(`${lvl.into}/${lvl.need} XP para o nível ${lvl.level + 1} · ${xp} XP · ${unCount}/${ACHIEVEMENTS.length} conquistas`, nx, by + 40);
    // contadores
    const sy = 356, sw = (W - 112 - 3 * 18) / 4, sh = 120;
    [['Jogando', playing.length], ['No backlog', backlog], ['Zerados', zerados], ['Conquistas', unCount]].forEach(([label, n], i) => {
        const x = 56 + i * (sw + 18);
        rr(ctx, x, sy, sw, sh, 16); ctx.fillStyle = rgba(p.card, 0.92); ctx.fill();
        rr(ctx, x, sy, sw, sh, 16); ctx.lineWidth = 1.5; ctx.strokeStyle = p.border; ctx.stroke();
        ctx.textAlign = 'center'; ctx.font = `900 54px ${FONT}`; ctx.fillStyle = p.text; ctx.fillText(String(n), x + sw / 2, sy + 48);
        ctx.font = `600 24px ${FONT}`; ctx.fillStyle = p.muted; ctx.fillText(label, x + sw / 2, sy + 92);
    });
    // bio livre
    let y = sy + sh + 46;
    if (bio) {
        ctx.font = `italic 500 30px ${FONT}`; ctx.fillStyle = p.text; ctx.textAlign = 'left';
        wrap(ctx, bio, W - 180, 4).forEach((l, i) => ctx.fillText(l, 56, y + i * 42));
        y += bioLines * 42 + 26;
    }
    // prateleira do que está jogando
    if (playing.length) {
        ctx.font = `800 34px ${FONT}`; ctx.fillStyle = p.text; ctx.textAlign = 'left';
        ctx.fillText('Jogando agora', 56, y + 14); y += 40;
        for (let i = 0; i < playing.length; i++) await drawCart(ctx, playing[i], 56 + i * (cw + gap), y, cw, ch, p, false, false, true);
    }
    footer(ctx, H - 64, p, false);
    return c;
}

// ---------- janela de compartilhamento ----------
const $ = id => document.getElementById(id);
// Estilos de imagem: prateleira (qualquer lista) e linha do tempo (zerados, que
// têm data de conclusão para agrupar por ano — ou por mês). O modo "cards" não existe mais.
const PER_PAGE = { shelf: 40, timeline: 30 };
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
        if (S.kind === 'gamerid') canvas = await renderGamerId();
        else if (S.kind === 'game') canvas = await renderGameCard(S.game);
        else {
            // "Capas minúsculas": tudo numa imagem só (sem paginação)
            const tiny = !!($('sh-tiny') && $('sh-tiny').checked);
            const per = tiny ? 99999 : PER_PAGE[S.style];
            const pages = Math.max(1, Math.ceil(S.items.length / per));
            S.page = Math.min(S.page, pages - 1);
            const slice = tiny ? S.items : S.items.slice(S.page * per, (S.page + 1) * per);
            const title = S.title + (pages > 1 ? ` · parte ${S.page + 1}/${pages}` : '');
            const o = { title, subtitle: S.subtitle, titles: $('sh-titles').checked, mode: S.mode, gray: S.gray, plain: !!appData.settings.shelfPlain, tiny };
            canvas = S.style === 'timeline' ? await renderTimelineImg(slice, o) : await renderShelf(slice, o);
            $('sh-pages').style.display = pages > 1 ? '' : 'none';
            $('sh-page-label').textContent = `Parte ${S.page + 1} de ${pages}`;
        }
        S.blob = await blobOf(canvas);
        urls.forEach(u => URL.revokeObjectURL(u)); urls = [URL.createObjectURL(S.blob)];
        $('sh-preview').src = urls[0];
        status.textContent = S.kind === 'game' || S.kind === 'gamerid' ? '' : `${S.items.length} ${S.items.length === 1 ? 'jogo' : 'jogos'} na seleção.`;
    } catch (e) {
        console.error(e);
        status.textContent = 'Não consegui gerar a imagem (alguma capa externa bloqueou o canvas). Tente trocar as capas por imagens salvas no app.';
    }
}
const rebuildSoon = () => { clearTimeout(timer); timer = setTimeout(build, 260); };

export function openShare({ items, mode, title, subtitle, style, gray }) {
    S = { kind: 'list', items, mode, title, subtitle, style: style || 'shelf', gray: gray || null, page: 0, blob: null };
    // A linha do tempo só existe para os zerados (agrupa pela data de conclusão);
    // nas outras listas a prateleira é o único estilo — a fileira de estilos soma.
    const timeline = mode === 'finished';
    $('sh-style-row').style.display = timeline ? '' : 'none';
    if ($('sh-style-timeline')) $('sh-style-timeline').style.display = timeline ? '' : 'none';
    $('sh-title').value = title; $('sh-title').style.display = ''; $('sh-titles-row').style.display = '';
    $('sh-titles').checked = items.length <= 24;
    $('sh-heading').textContent = 'Compartilhar imagem';
    paintStyle();
    $('modal-share').showModal();
    build();
}
export function openCardGenerator(gameId) {
    const game = appData.games.find(g => g.id === gameId) || (appData.wishlist || []).find(g => g.id === gameId);
    if (!game) return;
    S = { kind: 'game', game, page: 0, blob: null, title: game.title };
    $('sh-style-row').style.display = 'none'; $('sh-title').style.display = 'none'; $('sh-titles-row').style.display = 'none'; $('sh-pages').style.display = 'none';
    $('sh-heading').textContent = 'Cartão do jogo';
    $('modal-share').showModal();
    build();
}
// Gamer ID: o perfil (foto, nível, prateleira, contadores e bio) como imagem
export function openGamerIdShare() {
    S = { kind: 'gamerid', page: 0, blob: null, title: 'Meu Gamer ID' };
    $('sh-style-row').style.display = 'none'; $('sh-title').style.display = 'none'; $('sh-titles-row').style.display = 'none'; $('sh-pages').style.display = 'none';
    $('sh-heading').textContent = 'Seu Gamer ID';
    $('modal-share').showModal();
    build();
}
function paintStyle() {
    $('sh-style-timeline').classList.toggle('active', S.style === 'timeline');
    $('sh-style-shelf').classList.toggle('active', S.style === 'shelf');
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
