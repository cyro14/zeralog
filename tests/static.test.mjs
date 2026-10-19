// Testes estáticos de integridade — os que pegam as piores pragas antes de qualquer
// coisa rodar: arquivo com encoding quebrado, botão chamando função que não existe
// no window, e import de nome que o módulo alvo não exporta.
import { test, assert, assertEq } from './shim.mjs';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const rel = p => p.slice(ROOT.length + 1).replaceAll('\\', '/');

const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.css', '.md', '.json', '.svg', '.txt', '.webmanifest']);
function walk(dir, out = []) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
        if (name.name === '.git' || name.name === 'node_modules') continue;
        const p = join(dir, name.name);
        if (name.isDirectory()) walk(p, out);
        else if (TEXT_EXT.has(extname(name.name).toLowerCase()) || name.name === '.nojekyll') out.push(p);
    }
    return out;
}
const read = p => readFileSync(p, 'utf8');

// ---------- 1) GUARDA DE ENCODING: o app inteiro é UTF-8 válido, sem mojibake ----------
// Regressão do desastre de acentos (arquivo lido como Windows-1252 e salvo como
// UTF-8): os padrões abaixo são as assinaturas em bytes de texto duplamente
// codificado (o "A com til + cedilha" corrompido e companhia).
test('ENCODING: nenhum arquivo do app com UTF-8 inválido ou mojibake', () => {
    const bad = [];
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (const p of walk(ROOT)) {
        const buf = readFileSync(p);
        try { decoder.decode(buf); } catch (e) { bad.push(`${rel(p)}: não é UTF-8 válido`); continue; }
        const bytes = buf.toString('latin1');   // cada byte vira um caractere: padrões ficam visíveis
        for (const pat of ['\u00c3\u0083\u00c2', '\u00c3\u0083\u00c3', '\u00c3\u0082\u00c2', '\u00c3\u00a2\u00e2']) {
            if (bytes.includes(pat)) { bad.push(`${rel(p)}: mojibake`); break; }
        }
    }
    assertEq(bad.join(' | '), '', 'arquivos corrompidos');
});

// ---------- 2) GUARDA DE BOTÕES: todo onclick (HTML e templates) chama função no window ----------
// O index.html e os innerHTML dos módulos usam onclick inline; a função precisa estar
// anexada em window (Object.assign(window, {...}) ou window.nome = ...) em algum js.
// Esquecer disso = botão morto na tela.
const BUILTIN = new Set(['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'function', 'async', 'await', 'new', 'typeof', 'delete', 'this', 'event', 'window', 'document', 'history', 'location', 'navigator', 'console', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Object', 'Array', 'Promise', 'Set', 'Map', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'confirm', 'alert', 'prompt', 'fetch', 'open', 'close', 'requestAnimationFrame', 'matchMedia', 'URLSearchParams', 'AbortController', 'localStorage', 'sessionStorage']);

function collectWindowBindings() {
    const bound = new Set();
    const sources = [read(join(ROOT, 'index.html')), ...walk(JS).map(read)];
    for (const c of sources) {
        for (const m of c.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) bound.add(m[1]);
        let i = 0;
        while ((i = c.indexOf('Object.assign(window,', i)) !== -1) {
            const open = c.indexOf('{', i);
            if (open === -1) break;
            let depth = 0, j = open;
            for (; j < c.length; j++) {
                if (c[j] === '{') depth++;
                else if (c[j] === '}') { depth--; if (!depth) break; }
            }
            for (const m of c.slice(open, j + 1).matchAll(/(?:^|[{,]\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?=:|,|\})/gm)) bound.add(m[1]);
            i = j;
        }
    }
    return bound;
}

test('Botões: todo manipulador de evento chama função que existe no window', () => {
    const bound = collectWindowBindings();
    assert(bound.size > 50, `coletamos ${bound.size} bindings (sanity)`);
    const missing = new Set();
    const attrRe = /\son(?:click|change|input|keydown|keyup|submit|toggle|focus|blur)\s*=\s*"([^"]*)"/g;
    const sources = [join(ROOT, 'index.html'), ...walk(JS)];
    for (const p of sources) {
        const c = read(p);
        for (const m of c.matchAll(attrRe)) {
            const code = m[1].replace(/\$\{[^}]*\}/g, '""');   // interpolação de template é resolvida antes, não é onclick
            for (const t of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
                if (!BUILTIN.has(t[1]) && !bound.has(t[1])) missing.add(`${rel(p)}: ${t[1]}`);
            }
        }
    }
    // funções removidas do app não podem estar referenciadas no HTML
    for (const gone of ['setHomeView', 'setWishView', 'toggleCompact']) {
        if (bound.has(gone)) missing.add(`REMOVIDA mas ainda no window: ${gone}`);
    }
    assertEq([...missing].sort().join(', '), '', 'onclick chamando função sem binding no window');
});

// ---------- 3) GUARDA DE IMPORTS: nenhum import de nome que o módulo não exporta ----------
// Um nome errado no import quebra o app INTEIRO no carregamento (tela branca).
test('Módulos: todo import nomeado existe como export no módulo alvo', () => {
    const problems = [];
    for (const p of walk(JS)) {
        const c = read(p);
        for (const m of c.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.\/[^'"]+)['"]/g)) {
            const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
            let target;
            try { target = read(join(dirname(p), m[2])); } catch (e) { problems.push(`${rel(p)}: não achei ${m[2]}`); continue; }
            const exports = new Set();
            for (const e of target.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) exports.add(e[1]);
            for (const e of target.matchAll(/export\s*\{([^}]*)\}/g))
                e[1].split(',').forEach(x => exports.add(x.trim().split(/\s+as\s+/)[0].trim()));
            for (const n of names) if (!exports.has(n)) problems.push(`${rel(p)} importa '${n}', mas ${m[2]} não exporta`);
        }
    }
    assertEq(problems.join(' | '), '', 'imports quebrados');
});

// ---------- 4) GUARDA DE HTML: ids essenciais usados pelo JS existem no index.html ----------
test('HTML: ids essenciais referenciados pelo JS existem no index.html', () => {
    const html = read(join(ROOT, 'index.html'));
    for (const id of ['gm-profile', 'gm-explore-filters', 'gm-explore-grid', 'tab-profile', 'gm-x-genre', 'gm-x-plat', 'gm-dev-filter', 'gm-pub-filter', 'gm-x-owned', 'gm-classic-decades', 'quick-match', 'qm-body', 'sh-tiny', 'fin-view-timeline', 'fin-view-shelf', 'fin-sort-btn', 'fin-sort-panel', 'modal-ach', 'ach-detail', 'sh-style-timeline', 'wish-pane-list', 'wish-pane-releases', 'wish-sub-list', 'wish-sub-releases', 'wish-releases-grid', 'wish-summary', 'wish-list-container', 'wish-filter-btn', 'wish-sort-btn', 'wish-x-filter-panel', 'wish-x-sort-panel', 'wish-x-genre', 'wish-x-plat', 'wish-dev-filter', 'wish-pub-filter', 'home-sort-btn', 'home-sort-panel', 'wish-sortlist-btn', 'wish-sortlist-panel'])
        assert(html.includes(`id="${id}"`), `index.html deveria ter #${id}`);
    // ids que FORAM REMOVIDOS não podem estar no HTML (senão o JS pode tentar usá-los de volta)
    for (const gone of ['fin-view-list', 'home-view-list', 'home-view-shelf', 'wish-view-list', 'wish-view-shelf', 'compact-toggle', 'sh-style-cards', 'sh-chips', 'qm-count', 'home-sort-bar', 'sort-home-manual', 'sort-home-az', 'sort-home-time', 'sort-home-meta', 'fin-sort-bar', 'sort-fin-date', 'sort-fin-rating', 'sort-fin-time', 'sort-fin-played', 'sort-fin-portable', 'wish-sort-bar', 'sort-wish-release', 'sort-wish-added', 'sort-wish-az', 'sort-wish-meta', 'modal-image', 'edit-img-game-id', 'edit-game-icon', 'edit-img-wide', 'image-preview', 'edit-game-name'])
        assert(!html.includes(`id="${gone}"`), `index.html NÃO deveria ter #${gone} (foi removido)`);
    // o botão de sortear não tem mais números nem o "Sortear agora!" de cima
    assert(!html.includes('Sortear agora!'), 'o botão de sortear em cima foi removido (o confirmar é no final do carrossel)');
    // o modo "cards" acabou: nenhum botão de compartilhar pode oferecer cards
    assert(!html.includes('>Cards</button>'), 'sem botão de estilo Cards no compartilhar');
    const share = read(join(JS, 'share.js'));
    assert(!share.includes('renderCards'), 'renderCards foi aposentado junto com a exibição em cards');
});

// ---------- 5) GUARDA DO HUB MOBILE: abas com nome, perfil e settings no topo ----------
test('Hub mobile: cada aba tem o mini texto com o nome; perfil mora no header', () => {
    const html = read(join(ROOT, 'index.html'));
    // mini texto (o nome da tab) dentro de cada botão de aba
    for (const id of ['btn-tab-home', 'btn-tab-gamematch', 'btn-tab-wish', 'btn-tab-finished', 'btn-tab-stats', 'btn-tab-profile']) {
        const at = html.indexOf(`id="${id}"`);
        assert(at > -1, `#${id} existe`);
        const btn = html.slice(at, html.indexOf('</button>', at));
        assert(btn.includes('class="tab-label"'), `#${id} deveria ter o nome no <span class="tab-label">`);
    }
    // perfil acessível lá em cima, ao lado das configurações (header que só existe no mobile)
    const head = html.slice(html.indexOf('class="header-container"'), html.indexOf('id="btn-tab-home"'));
    assert(head.includes('btn-top-profile'), 'botão do perfil no header');
    assert(head.includes("switchTab('profile')"), 'botão do perfil abre a aba Perfil');
    assert(head.includes('class="dtb-avatar-wrap"'), 'círculo de avatar do perfil no header');
    // e o CSS tira perfil e settings da barra fixa de baixo
    const css = read(join(ROOT, 'style.css'));
    assert(css.includes('#btn-tab-profile { display: none; }'), 'aba Perfil escondida na barra de baixo');
    assert(css.includes('.tabs .dtb-settings { display: none; }'), 'settings escondido na barra de baixo (a regra precisa vencer o .tab-btn flex)');
});

// ---------- 6) GUARDA DO SCROLL: nada de zl-rail no mobile (o "delay" ao rolar) ----------
test('Scroll: esconder filtros ao rolar (zl-rail) só existe no desktop', () => {
    const main = read(join(JS, 'main.js'));
    assert(main.includes("matchMedia('(min-width: 900px)')"), 'main.js confere o breakpoint desktop antes de mexer no zl-rail');
    const css = read(join(ROOT, 'style.css'));
    // nenhuma regra zl-rail pode viver num bloco de tela pequena (mobile/tablet)
    assert(!/max-width[^{}]*\{[^}]*zl-rail/.test(css), 'style.css não deve ter zl-rail em bloco mobile');
});

// ---------- 7) GUARDA DO PERFIL NO TOPO: círculo preenchido + aba sem filtros ----------
test('Perfil no topo: círculo preenchido pela foto; aba Perfil sem busca nem filtros', () => {
    const css = read(join(ROOT, 'style.css'));
    const rule = sel => { const at = css.indexOf(sel + ' {'); assert(at > -1, `regra ${sel} existe`); return css.slice(at, css.indexOf('}', at)); };
    // anel POR FORA (box-shadow), sem borda comendo a foto — círculo do desktop e do mobile
    for (const sel of ['.btn-top-profile', '.dtb-profile']) {
        const r = rule(sel);
        assert(r.includes('box-shadow'), `${sel} com anel via box-shadow (fora do círculo)`);
        assert(!r.includes('border:'), `${sel} não pode ter border (a foto preenche o círculo inteiro)`);
    }
    assert(rule('.dtb-avatar-wrap img').includes('object-fit: cover'), 'foto cobre o círculo inteiro (object-fit: cover)');
    // sem foto nenhuma o círculo de entrada continua CHEIO (gradiente do tema),
    // não uma coroa flutuando num círculo vazio
    assert(rule('.dtb-avatar-wrap.no-photo').includes('linear-gradient'), 'círculo de entrada preenchido mesmo sem foto');
    // página do Perfil: o avatar também é preenchido pela foto INTEIRA — o anel
    // fica POR FORA (a borda interna de 3px comia as bordas da foto)
    const gphoto = rule('.gm-p-photo');
    assert(gphoto.includes('object-fit: cover'), 'avatar da página do perfil cobre o círculo');
    assert(!gphoto.includes('border: 3px'), 'sem borda interna comendo a foto (anel via box-shadow)');
    // aba Perfil esconde a busca e os filtros de plataforma (igual ao GameMatch)
    const ui = read(join(JS, 'ui.js'));
    assert(ui.includes("classList.toggle('profile-tab'"), 'switchTab liga a classe profile-tab');
    assert(css.includes('body.profile-tab .search-container'), 'busca escondida na aba Perfil');
    assert(css.includes('body.profile-tab #platform-chips-container'), 'filtros de plataforma escondidos na aba Perfil');
});

// ---------- 8) GUARDA DO HEADER: logo no canto superior esquerdo ----------
test('Header (mobile): a logo fica no canto superior esquerdo', () => {
    const html = read(join(ROOT, 'index.html'));
    const head = html.slice(html.indexOf('class="header-container"'), html.indexOf('id="btn-tab-home"'));
    const brandAt = head.indexOf('app-brand');
    const actionsAt = head.indexOf('class="header-actions"');
    assert(brandAt > -1 && actionsAt > -1, 'header com marca e ações');
    assert(brandAt < actionsAt, 'a marca vem primeiro (canto esquerdo), botões empurrados pra direita');
    assert(!head.includes('width: 32px;'), 'o espaçador antigo da esquerda foi removido');
});

// ---------- 9) GUARDA DA TELA DO JOGO: fundo na cor do tema ----------
test('Tela do jogo: o fundo segue a cor do tema (nada de gradiente preto fixo)', () => {
    const css = read(join(ROOT, 'style.css'));
    const rule = sel => { const at = css.indexOf(sel + ' {'); assert(at > -1, `regra ${sel} existe`); return css.slice(at, css.indexOf('}', at)); };
    for (const sel of ['.gp-page', '.gm-xpage']) {
        const r = rule(sel);
        assert(r.includes('var(--accent-playing)'), `${sel} com a cor principal do tema no fundo`);
        assert(r.includes('var(--bg-color)'), `${sel} com a cor de fundo do tema`);
    }
    const veil = rule('.gp-bg::after');
    assert(veil.includes('var(--accent-playing)') && veil.includes('var(--accent-finished)'), 'véu por cima da capa com as cores do tema');
    assert(veil.includes('var(--bg-color)'), 'véu usa o fundo do tema (escuro escurece, claro clareia)');
    assert(!veil.includes('rgba(0,0,0'), 'véu sem preto fixo (quebrava os temas claros)');
    // A ARTE de fundo também segue o tema (--gp-bg-filter): a versão com brightness
    // 0.32 fixa virava, nos temas claros, uma sombra suja por baixo do véu branco
    const artAt = css.indexOf('.gp-bg img { filter:');
    assert(artAt > -1, 'regra do filtro da arte de fundo existe');
    const art = css.slice(artAt, css.indexOf('}', artAt));
    assert(art.includes('var(--gp-bg-filter,'), 'o tratamento da arte vem do tema (--gp-bg-filter)');
    assert(art.includes('brightness(0.32)'), 'temas escuros: arte escurecida (clima de sala escura)');
    for (const t of ['light', 'sepia', 'pink']) {
        const start = css.indexOf(`html[data-theme="${t}"]`);
        const block = css.slice(start, css.indexOf('}', start));
        assert(block.includes('--gp-bg-filter'), `tema ${t} define o tratamento claro da arte`);
        assert(/brightness\(1\./.test(block), `tema ${t}: a arte CLAREIA (não pode escurecer no tema claro)`);
    }
});

// ---------- 10) GUARDA DE ÍCONES: todo arquivo icons/... citado no código existe ----------
// Um logo renomeado ou excluído quebraria o hub, plataformas e categorias.
test('Ícones: todo icons/... referenciado no código existe na pasta', () => {
    const missing = [];
    const re = /icons\/[\w.\-]+\.(?:svg|webp|png|jpe?g)/g;
    for (const p of [join(ROOT, 'index.html'), ...walk(JS)]) {
        for (const m of read(p).matchAll(re)) {
            if (!existsSync(join(ROOT, m[0]))) missing.push(`${rel(p)}: ${m[0]}`);
        }
    }
    assertEq([...new Set(missing)].join(', '), '', 'arquivos de ícone faltando');
});

// ---------- 11) GUARDA DO BUSCADOR DE CAPAS: dialog fechado não pode aparecer ----------
// Regressão: o `.covers-full` ganhou `display: flex` — e o display do app vence o
// `dialog:not([open]) { display: none }` do navegador. Resultado: a tela inteira do
// buscador de capas ficava presa sobre o app, sem sentido, em qualquer página.
test('Buscador de capas: fechado, o dialog some (display só com [open])', () => {
    const css = read(join(ROOT, 'style.css'));
    // 1) o guarda-chuva que devolve o esconderijo para TODO dialog fechado
    assert(/dialog:not\(\[open\]\)\s*\{[^}]*display\s*:\s*none/.test(css), 'style.css esconde dialog:not([open])');
    // 2) o display do buscador não pode viver na classe "solta" (vale com o dialog fechado)
    assert(!/\.covers-full\s*\{[^}]*display\s*:/.test(css), '.covers-full não pode ter display sem [open]');
    // 3) o layout de coluna continua existindo, agora preso ao [open]
    const open = /\.covers-full\[open\]\s*\{([^}]*)\}/.exec(css);
    assert(open, 'regra .covers-full[open] existe');
    assert(open[1].includes('display: flex'), 'aberto: o buscador é flex');
    assert(open[1].includes('flex-direction: column'), 'aberto: topo, busca, grade e rodapé empilhados');
    // 4) aberto, ele ocupa a tela inteira (é isso que o usuário vê ao tocar em "Trocar capa")
    const base = /\.covers-full\s*\{([^}]*)\}/.exec(css);
    assert(base, 'regra .covers-full existe');
    assert(base[1].includes('100vw') && base[1].includes('100dvh'), 'aberto: tela cheia (100vw x 100dvh)');
    // 5) e o dialog do HTML não pode carregar display no style inline
    const html = read(join(ROOT, 'index.html'));
    const tag = /<dialog id="modal-covers"[^>]*>/.exec(html);
    assert(tag, 'dialog#modal-covers existe no index.html');
    assert(!/style\s*=\s*"[^"]*display/.test(tag[0]), 'sem display inline no dialog do buscador');
    // 6) a FOTO DO APARELHO mora DENTRO da própria busca (a tela "Editar Capa"
    //    foi aposentada: capa clicada abre a busca automática direto)
    assert(html.includes('id="cv-file"'), 'botão de foto do aparelho no buscador');
    assert(html.includes('coversPickFile(this)'), 'o input chama o coversPickFile');
    assert(!html.includes('id="modal-image"'), 'a tela antiga "Editar Capa" saiu do HTML');
});

// ---------- 12) GUARDA DO EXPLORAR: painéis de filtros/ordenação legíveis ----------
// O painel esticava na largura toda (selects de 700px no desktop), os campos de
// estúdio colavam um no outro e o rodapé vazio desenhava só a borda de cima.
test('Explorar: painéis de filtros e ordenação com layout contido e campos alinhados', () => {
    const css = read(join(ROOT, 'style.css'));
    const rule = sel => { const at = css.indexOf(sel + ' {'); assert(at > -1, `regra ${sel} existe`); return css.slice(at, css.indexOf('}', at)); };
    const panel = rule('.gm-x-panel');
    assert(panel.includes('width: min(100%, 560px)'), 'painel com largura de leitura (não estica na tela toda)');
    assert(panel.includes('max-height') && panel.includes('overflow-y: auto'), 'painel rola quando a lista não cabe');
    assert(panel.includes('box-sizing: border-box'), 'painel sem estourar a largura por causa do padding');
    const filters = rule('.gm-explore-filters');
    assert(filters.includes('display: grid'), 'filtros em grade (gênero/plataforma em cima, estúdio/publicadora embaixo)');
    assert(filters.includes('gap:'), 'grade dos filtros com respiro entre os campos');
    assert(rule('.gm-x-f-row').includes('display: contents'), 'os selects entram direto na grade do painel');
    // campos não podem somar padding à largura (foi o que estourava a linha no celular)
    for (const sel of ['.gm-select', '.gm-co-input', '.gm-x-sort-btn'])
        assert(rule(sel).includes('box-sizing: border-box'), `${sel} com box-sizing: border-box`);
    // regressões de display vencendo o atributo hidden (bolinha azul vazia / rodapé fantasma)
    assert(css.includes('.gm-tool-badge[hidden] { display: none; }'), 'badge de filtros some quando não há filtro ativo');
    assert(css.includes('.gm-x-panel-foot.is-empty { display: none; }'), 'rodapé do painel some quando não há chip');
    // celular: uma coluna só, sem espremer os campos
    assert(/@media \(max-width: 520px\) \{[\s\S]*?\.gm-explore-filters \{ grid-template-columns: 1fr; \}/.test(css), 'no celular os filtros viram uma coluna');
    // e o HTML acompanha: rodapé com id (o JS liga/desliga) e o X de fechar nos painéis
    const html = read(join(ROOT, 'index.html'));
    assert(html.includes('id="gm-filter-foot"'), 'index.html tem o rodapé #gm-filter-foot');
    const panelAt = html.indexOf('id="gm-x-filter-panel"');
    assert(panelAt > -1 && html.slice(panelAt, html.indexOf('id="gm-x-sort-panel"')).includes('data-x-close'), 'painel de filtros tem o botão X de fechar');
    // a checkbox "Ocultar jogos já cadastrados" mora no painel de filtros do Explorar,
    // nasce marcada e ocupa a linha inteira da grade
    const checkAt = html.indexOf('id="gm-x-owned"');
    assert(checkAt > -1, 'checkbox dos já cadastrados existe');
    assert(/id="gm-x-owned"[^>]*checked/.test(html.slice(checkAt - 200, checkAt + 200)), 'nasce marcada (padrão ligado)');
    assert(html.includes('gmXHideOwned(this.checked)'), 'a checkbox chama gmXHideOwned');
    assert(rule('.gm-x-check').includes('grid-column: 1 / -1'), 'linha da checkbox ocupa a grade inteira');
});

// ---------- 13) GUARDA DA ABA DESEJOS: duas telas + nada de texto solto no topo ----------
// A aba Desejos abria com um parágrafo solto e um resumo sem estilo ("3 lançamentos
// futuros Próximo: ..."), parecendo texto jogado na tela. Agora ela tem um submenu
// com as duas telas (Wish list e Lançamentos) e o resumo é um painel desenhado.
test('Desejos: submenu alterna as duas telas; resumo é painel e não texto solto', () => {
    const html = read(join(ROOT, 'index.html'));
    const css = read(join(ROOT, 'style.css'));
    const ui = read(join(JS, 'ui.js'));
    const view = read(join(JS, 'wishview.js'));
    const tabAt = html.indexOf('id="tab-wish"');
    assert(tabAt > -1, '#tab-wish existe');
    const tab = html.slice(tabAt, html.indexOf('<!-- FINISHED TAB -->', tabAt));
    // as DUAS telas, cada uma com seu botão no submenu (o que troca de tela)
    assert(tab.includes('class="subnav wish-subnav"'), 'submenu com as duas telas no topo da aba');
    for (const [id, label] of [['wish-sub-list', 'Wish list'], ['wish-sub-releases', 'Lançamentos']]) {
        const at = tab.indexOf(`id="${id}"`);
        assert(at > -1, `botão #${id} existe`);
        const btn = tab.slice(at, tab.indexOf('</button>', at));
        assert(btn.includes(label), `#${id} tem o rótulo "${label}"`);
        assert(btn.includes(`wishSubShow(`), `#${id} chama wishSubShow (o clique troca de tela)`);
    }
    // uma tela por vez: .wish-pane só aparece com .active (como as sub-telas do GameMatch)
    assert(css.includes('.wish-pane { display: none; }'), 'as telas fora de cena somem');
    assert(css.includes('.wish-pane.active { display: block;'), 'só a tela ativa aparece');
    assert(view.includes("classList.toggle('active', on)"), 'wishview liga/desliga as telas e os botões');
    // o parágrafo solto do topo foi embora e o resumo virou painel de verdade
    assert(!tab.includes('wish-hint'), 'sem parágrafo solto de explicação no topo');
    assert(!css.includes('.wish-hint'), 'o estilo do texto solto também saiu');
    assert(ui.includes('class="wish-sum"'), 'o resumo é pintado como painel (.wish-sum)');
    assert(css.includes('.wish-sum {') && css.includes('.wish-stat {'), 'o painel do resumo tem estilo');
    assert(!tab.includes('wish-bar'), 'a barra antiga (texto + botão) saiu do HTML');
});

// ---------- 15) IGDB: a tela pede Client ID + Client Secret da Twitch ----------
// A IGDB é da Twitch desde 2019: não existe "gerar chave" no site deles (a tela
// apontava para uma página que responde 404) e a API recusa um token avulso. O
// certo é o Client ID + Client Secret de um app da Twitch.
test('IGDB: configuração pede Client ID e Client Secret da Twitch (link sem 404)', () => {
    const html = read(join(ROOT, 'index.html'));
    assert(html.includes('id="igdb-client-input"') && html.includes('id="igdb-secret-input"'), 'os dois campos existem');
    assert(html.includes('onclick="testIGDB()"'), 'botão para testar a configuração');
    assert(html.includes('https://dev.twitch.tv/console/apps'), 'link para criar o app na Twitch');
    assert(!html.includes('igdb.com/api-box'), 'sem a página morta da IGDB (api-box)');
    assert(!/IGDB\.fr/i.test(html), 'sem o link 404 do IGDB.fr');
    assert(!html.includes('id="sgdb-key-input"'), 'o campo antigo (que salvava "chave" da IGDB) saiu');
    const igdb = read(join(JS, 'igdb.js'));
    assert(igdb.includes('id.twitch.tv/oauth2/token'), 'token gerado pela Twitch');
    assert(igdb.includes('grant_type') && igdb.includes('client_credentials'), 'fluxo client_credentials');
    assert(igdb.includes("'Client-ID'"), 'a consulta manda o Client-ID');
    assert(!/(\/media|api\/media)/.test(igdb), 'sem endpoints inventados (a IGDB não tem /media)');
    assert(igdb.includes('search "${q}"'), 'consulta no formato Apicalypse da IGDB');
});

// ---------- 14) ORDENAÇÃO PADRONIZADA: botão + painel (Fila e Lançamentos) ----------
// A Fila usava uma barra de chips (Manual / A-Z / Tempo / Nota) que ocupava a largura
// toda. Ela passou a usar o MESMO botão de ordenação das outras telas (botão que abre
// um painel). Os Lançamentos da wishlist também importaram os filtros/ordenações do
// Explorar em vez de inventar uma segunda barra de filtros.

test('Ordenação: a Fila e os Zerados usam botão com painel; Lançamentos importam os do Explorar', () => {
    const html = read(join(ROOT, 'index.html'));
    const css = read(join(ROOT, 'style.css'));
    const ui = read(join(JS, 'ui.js'));
    const view = read(join(JS, 'wishview.js'));
    // a Fila perdeu a barra de chips e ganhou o botão "Ordenar"
    assert(!html.includes('id="home-sort-bar"'), 'a barra de ordenação da Fila saiu do HTML');
    const home = html.slice(html.indexOf('id="tab-home"'), html.indexOf('id="tab-gamematch"'));
    const at = home.indexOf('id="home-sort-btn"');
    assert(at > -1, 'a Fila tem o botão de ordenação');
    assert(home.slice(at, home.indexOf('</button>', at)).includes('homeSortToggle()'), 'o botão abre o painel');
    assert(home.includes('id="home-sort-panel"'), 'e o painel existe dentro da barra de ferramentas');
    assert(ui.includes('function homeSortPanelHtml'), 'o painel da Fila é montado no ui.js');
    assert(ui.includes('gm-x-sort-btn'), 'com as mesmas opções (.gm-x-sort-btn) das outras telas');
    assert(ui.includes('function paintHomeSort'), 'o render pinta o botão (ordem ativa) a cada redesenho');
    // o painel abre ancorado na barra de ferramentas, não no botãozinho de 90px
    assert(/\.tab-tools\s*\{[^}]*position:\s*relative/.test(css), '.tab-tools posiciona o painel de ordenação');
    // Wish LIST: a MESMA troca — as tabs de ordenação (Lançamento/Adicionado/
    // A-Z/Nota) saíram e o botão com painel entrou (com a opção Manual p/ arrastar)
    const wishList = html.slice(html.indexOf('id="wish-pane-list"'), html.indexOf('id="wish-pane-releases"'));
    assert(!wishList.includes('class="sort-bar"'), 'a Wish list não tem mais tabs de ordenação');
    const wlAt = wishList.indexOf('id="wish-sortlist-btn"');
    assert(wlAt > -1, 'a Wish list tem o botão de ordenação');
    assert(wishList.slice(wlAt, wishList.indexOf('</button>', wlAt)).includes('wishListSortToggle()'), 'o botão abre o painel');
    assert(wishList.includes('id="wish-sortlist-panel"'), 'e o painel existe dentro da barra de ferramentas');
    assert(ui.includes('function wishListSortPanelHtml'), 'o painel da Wish list é montado no ui.js');
    assert(ui.includes('function paintWishListSort'), 'o render pinta o botão (ordem ativa) a cada redesenho');
    assert(ui.includes("['manual', 'Manual', 'a ordem em que você arrastou']"), 'com a opção Manual (a ordem do arrasto)');
    // Lançamentos da wishlist: os MESMOS botões e painéis do Explorar, com estado próprio
    const wish = html.slice(html.indexOf('id="wish-pane-releases"'), html.indexOf('<!-- FINISHED TAB -->'));
    for (const id of ['wish-filter-btn', 'wish-sort-btn', 'wish-x-filter-panel', 'wish-x-sort-panel', 'wish-filter-foot', 'wish-filter-clear'])
        assert(wish.includes(`id="${id}"`), `#${id} na tela dos lançamentos`);
    assert(wish.includes('wishFilterToggle()') && wish.includes('wishSortToggle()'), 'os botões abrem os painéis');
    assert(wish.includes('wishFilterGenre(this.value)') && wish.includes('wishFilterPlat(this.value)'), 'os selects aplicam o filtro');
    assert(view.includes('sortPanelHtml(wSort'), 'a ordenação importa as opções do Explorar (js/gamematch.js)');
    assert(view.includes('paintFilterWidget'), 'e os filtros usam a mesma pintura de chips/badge do Explorar');
    // e nenhum dos dois voltou a ganhar uma barra de chips própria
    assert(!home.includes('class="sort-bar"'), 'a Fila não tem mais barra de ordenação');
    assert(!wish.includes('class="sort-bar"'), 'a tela dos lançamentos não tem barra de chips');
    // Zerados: a MESMA troca — a barra de chips (Data/Nota/Tempo/Horas/Portátil) saiu
    // e o botão com painel entrou, na cor de destaque da aba (troféu)
    const finished = html.slice(html.indexOf('id="tab-finished"'), html.indexOf('id="tab-stats"'));
    assert(!finished.includes('class="sort-bar"'), 'os Zerados não têm mais barra de ordenação');
    const finAt = finished.indexOf('id="fin-sort-btn"');
    assert(finAt > -1, 'os Zerados têm o botão de ordenação');
    assert(finished.slice(finAt, finished.indexOf('</button>', finAt)).includes('finSortToggle()'), 'o botão abre o painel');
    assert(finished.includes('id="fin-sort-panel"'), 'e o painel existe dentro da barra de ferramentas');
    assert(ui.includes('function finSortPanelHtml'), 'o painel dos Zerados é montado no ui.js');
    assert(ui.includes('gm-x-sort-btn'), 'com as mesmas opções (.gm-x-sort-btn) das outras telas');
    assert(ui.includes('function paintFinSort'), 'o render pinta o botão (ordem ativa) a cada redesenho');
    assert(css.includes('#tab-finished .tool-btn.on'), 'marcação do botão na cor dos zerados');
    assert(css.includes('#tab-finished .gm-x-sort-btn.on'), 'e a opção ativa do painel também');
});

// ---------- 17) GUARDA DO HERO "JOGANDO ATUALMENTE": cards altos e centrados + painel escuro ----------
// Duas lições travadas aqui:
// 1) Colunas contadas pelo PISO (máx 1fr): um teto DEFINIDO dentro do minmax
//    faz o auto-fit contar as colunas pelo teto — o celular ficava em UMA
//    capa por linha. O teto mora no CARD (max-width + margin auto).
// 2) Altura PROPORCIONAL à largura (aspect-ratio): sem altura fixa de linha,
//    a capa fica alta igual no celular e no desktop (nada de faixa achatada).
// O painel segue num azul quase preto com o roxo no topo e nas bordas.
test('Hero "Jogando Atualmente": duas capas por linha no celular, altas e centradas', () => {
    const css = read(join(ROOT, 'style.css'));
    const heroGrid = /#playing-category \.game-list\.shelf \{([^}]*)\}/.exec(css);
    assert(heroGrid, 'regra da grade do hero existe');
    assert(heroGrid[1].includes('repeat(auto-fit, minmax(min(100%, var(--cart-min)), 1fr))'), 'colunas contadas pelo PISO (máx 1fr): duas por linha no celular');
    assert(heroGrid[1].includes('--cart-min: 130px'), 'piso baixo para caberem 2 colunas no celular');
    assert(heroGrid[1].includes('--cart-max: 190px'), 'teto da largura (consumido pelo card)');
    assert(heroGrid[1].includes('justify-content: center'), 'grade centralizada quando sobra espaço');
    assert(heroGrid[1].includes('grid-auto-rows: auto'), 'altura da linha vem do próprio card');
    assert(!heroGrid[1].includes('--row-h'), 'sem altura de linha fixa no hero');
    // altura PROPORCIONAL à largura: capa estreita no celular fica ALTA igual à do desktop
    const heroItem = /#playing-category \.shelf-item \{([^}]*)\}/.exec(css);
    assert(heroItem, 'regra do item do hero existe');
    assert(heroItem[1].includes('height: auto') && heroItem[1].includes('aspect-ratio: 7 / 10'), 'a altura acompanha a largura (cartucho em pé, proporção de desktop)');
    assert(heroItem[1].includes('max-width: var(--cart-max)'), 'teto no CARD, não na coluna: um jogo sozinho não vira faixa larga');
    assert(heroItem[1].includes('margin-inline: auto'), 'card com teto centraliza dentro da coluna');
    // desktop: mesmo comportamento, só com cartuchos maiores
    assert(css.includes('--cart-min: 165px; --cart-max: 210px;'), 'desktop sobe o piso e o teto da largura');
    assert(!/--row-h: (215|270)px/.test(css), 'as alturas fixas do hero (215/270px) saíram de vez');
    assert(!heroGrid[1].includes('justify-content: flex-start'), 'nada de cards colados à esquerda');
    assert(!heroGrid[1].includes('--cart-w'), 'o hero não usa a largura fixa da prateleira comum');
    // TODAS as capas do hero com a mesma dimensão (capa larga não ocupa 2 colunas)
    assert(css.includes('#playing-category .shelf-item.wide { grid-column: auto; }'), 'capa larga tem a mesma largura das outras no hero');
    // painel num azul quase preto, com roxo no topo e nas bordas
    assert(css.includes('background: color-mix(in srgb, var(--bg-color) 80%, #060a18)'), 'fundo do painel puxado para o preto azulado');
    const glow = /#playing-category::before \{([^}]*)\}/.exec(css);
    assert(glow, 'o brilho roxo do hero continua no CSS (::before)');
    assert(glow[1].includes('at 50% -14%'), 'roxo concentrado no TOPO do painel');
    assert(!css.includes('var(--accent-playing) 16%, var(--card-bg)'), 'sem tint roxo cobrindo o painel inteiro');
    assert(!css.includes('min-height: 400px') && !css.includes('min-height: 320px'), 'sem altura mínima deixando o painel oco');
    // cabeçalho mais baixo e colado nos cards
    const heroHead = /#playing-category \.category-header \{([^}]*)\}/.exec(css);
    assert(heroHead, 'regra do cabeçalho do hero existe');
    assert(heroHead[1].includes('padding: 12px 20px 8px'), 'cabeçalho com menos respiro');
    assert(heroHead[1].includes('margin-bottom: 0'), 'sem vão entre o cabeçalho e os cards');
});

// ---------- 18) GUARDA DE LAYOUT: divisores discretos, menu lateral e legenda de progresso ----------
// Seções separadas por um fio discreto (em vez de grandes painéis de vidro),
// opções da sidebar mais baixas com o settings ISOLADO no rodapé (divisor em
// cima) e a barra de progresso das capas com a porcentagem escrita nela.
test('Layout: seções com divisores discretos, sidebar mais baixa e % na barra de progresso', () => {
    const css = read(join(ROOT, 'style.css'));
    // categorias: sem painel colorido — só o divisor discreto sob o título
    const cat = /\n\.category \{([^}]*)\}/.exec(css);
    assert(cat, 'regra .category existe');
    assert(cat[1].includes('background: none'), 'categoria sem painel de fundo');
    assert(!cat[1].includes('box-shadow'), 'categoria sem sombra de painel');
    const catHead = /\n\.category-header \{([^}]*)\}/.exec(css);
    assert(catHead && catHead[1].includes('border-bottom: 1px'), 'divisor discreto sob o título da seção');
    // menu lateral (desktop): opções mais baixas e settings isolado lá embaixo
    const btn = /\n    \.tab-btn \{([^}]*)\}/.exec(css);
    assert(btn, 'regra .tab-btn do desktop existe');
    assert(btn[1].includes('padding: 8px 12px'), 'opções da sidebar mais baixas');
    assert(btn[1].includes('flex: 0 0 auto'), 'opções não esticam na altura da sidebar (o flex:1 da barra de celular)');
    const set = /\n    \.dtb-settings \{([^}]*)\}/.exec(css);
    assert(set, 'regra .dtb-settings do desktop existe');
    assert(set[1].includes('margin-top: auto'), 'settings empurrado para o fundo da sidebar');
    assert(set[1].includes('border-top: 1px'), 'divisor separa o settings das abas');
    // barra de progresso das capas: a legenda da porcentagem tem estilo próprio
    const prog = /\n\.shelf-prog b \{([^}]*)\}/.exec(css);
    assert(prog, 'legenda da porcentagem estilizada (.shelf-prog b)');
    assert(prog[1].includes('margin-left: auto'), 'a % fica na ponta direita da barra');
    // legenda mais bonita: pílula de vidro com números tabulares
    assert(prog[1].includes('font-variant-numeric: tabular-nums'), 'números tabulares na legenda');
    assert(prog[1].includes('box-shadow: inset 0 0 0 1px'), 'pílula com aro interno (vidro)');
    // trilho com profundidade e preenchimento em gradiente da cor do tema
    const progTrack = /\n\.shelf-prog \{([^}]*)\}/.exec(css);
    assert(progTrack, 'regra do trilho da barra existe');
    assert(progTrack[1].includes('box-shadow'), 'trilho com sombra interna (profundidade)');
    const progFill = /\n\.shelf-prog i \{([^}]*)\}/.exec(css);
    assert(progFill, 'regra do preenchimento existe');
    assert(progFill[1].includes('linear-gradient(90deg'), 'preenchimento em gradiente');
    assert(progFill[1].includes('color-mix(in srgb, var(--accent-playing) 55%'), 'gradiente nas cores do próprio tema');
    assert(/\n\.shelf-prog i::after \{/.test(css), 'ponta do preenchimento iluminada (::after)');
    // 100%: barra dourada na cor do selo "100%" (classe .done pintada pelo ui.js)
    assert(/\n\.shelf-prog\.done i \{/.test(css), 'estado .done pinta o preenchimento de dourado');
    assert(/\n\.shelf-prog\.done b \{/.test(css), 'legenda do .done também dourada');
    // no hero os cartuchos são maiores: barra e legenda acompanham
    const heroProg = /#playing-category \.shelf-prog \{([^}]*)\}/.exec(css);
    assert(heroProg && heroProg[1].includes('height: 14px'), 'barra do hero é mais alta (cartucho grande)');
    const heroCart = /#playing-category \.cart \{([^}]*)\}/.exec(css);
    assert(heroCart && heroCart[1].includes('padding: 7px 8px 18px'), 'base do cartucho do hero dá lugar à barra maior');
});

// ---------- 16) CARDS E CATEGORIAS: alinhamento uniforme + categoria compartilhável ----------
// Explorar e Lançamentos: título de 1 ou 2 linhas não pode mais mover os ícones do
// card (corpo estica, selo e botões colam no fundo). Categorias: o NOME ganha a
// primeira linha inteira (uma linha, reticências só em nomes enormes) e os
// botões ficam numa linha própria, embaixo — e cada categoria tem um botão para
// compartilhar só ela.
test('Cards e categorias: zona de baixo alinhada, nome da categoria na própria linha e botão de compartilhar', () => {
    const css = read(join(ROOT, 'style.css'));
    const ui = read(join(JS, 'ui.js'));
    const main = read(join(JS, 'main.js'));
    // cards do Explorar/Lançamentos: o corpo absorve a folga e os ícones colam no fundo
    assert(/^\.gm-x-body \{[^}]*flex: 1 1 auto/m.test(css), 'corpo do card estica (flex: 1 1 auto)');
    assert(/^\.gm-x-actions \{[^}]*margin-top: auto/m.test(css), 'ícones ancorados no fundo do card');
    assert(/^\.gm-x-actions \{[^}]*align-items: center/m.test(css), 'ícones centrados na linha de ações');
    // o selo de match desceu para a MESMA linha dos ícones: alinhado embaixo, colado
    // na esquerda, com os botões empurrados para a direita
    assert(/^\.gm-x-actions \.gm-match \{[^}]*margin-right: auto/m.test(css), 'selo de match na linha dos ícones, botões empurrados para a direita');
    assert(!/\.gm-x-body \.gm-match/.test(css), 'selo de match saiu do corpo do card');
    const gmsrc = read(join(JS, 'gamematch.js'));
    const wvsrc = read(join(JS, 'wishview.js'));
    assert(/<div class="gm-x-actions">\s*<span class="gm-match/.test(gmsrc), 'Explorar: o selo abre a linha de ações (alinhado com os ícones)');
    assert(/<div class="gm-x-actions">\s*<span class="gm-match/.test(wvsrc), 'Lançamentos: o selo abre a linha de ações (alinhado com os ícones)');
    // categorias: o cabeçalho é em DUAS linhas — nome na primeira (inteiro até onde
    // caber) e botões na linha de baixo, sem roubar a largura do nome
    const head = /^\.category-header \{[^}]*\}/m.exec(css);
    assert(head && head[0].includes('flex-direction: column'), 'cabeçalho da categoria em duas linhas (nome em cima, botões embaixo)');
    assert(head && !head[0].includes('flex-wrap'), 'nada de embrulhar: nome e botões nunca dividem a mesma linha');
    const title = /^\.cat-title-area h2 \{[^}]*\}/m.exec(css);
    assert(title && title[0].includes('white-space: nowrap') && title[0].includes('text-overflow: ellipsis'), 'título da categoria em uma linha (reticências só em nomes enormes)');
    assert(/^\.cat-title-area \{[^}]*min-width: 0/m.test(css), 'área do título pode encolher (min-width: 0)');
    assert(/^\.cat-actions \{[^}]*flex-shrink: 0/m.test(css), 'botões da categoria não encolhem (linha própria embaixo do nome)');
    // e cada categoria tem o botão de compartilhar ela inteira
    assert(/openCategoryShare\('\$\{cat\.id\}'\)/.test(ui), 'o header de cada categoria chama openCategoryShare com o id dela');
    assert(ui.includes('Compartilhar categoria'), 'botão com rótulo acessível');
    assert(/export function openCategoryShare/.test(ui), 'openCategoryShare exportada no ui.js');
    assert(/window\.openCategoryShare\s*=/.test(main), 'openCategoryShare anexada no window (onclick do header)');
    assert(ui.includes("mode: 'home'"), 'a prateleira da categoria usa o mesmo modo da Fila');
});

// ---------- 19) GUARDA DA CENTRAL DE NOTIFICAÇÕES: o sino abre o registro ----------
// O sino abria as configurações; agora abre a CENTRAL — o registro de tudo que
// o app avisou (sessões, lançamentos da wishlist, conquistas), com badge de não
// lidas. Os avisos da barra do celular são passageiros; o registro fica salvo.
test('Central de notificações: sino abre o registro (badge, painel e origens)', () => {
    const html = read(join(ROOT, 'index.html'));
    const css = read(join(ROOT, 'style.css'));
    const notify = read(join(JS, 'notify.js'));
    // o painel e a lista existem no HTML estático
    for (const id of ['notif-center', 'notif-list', 'notif-badge', 'notif-badge-mob'])
        assert(html.includes(`id="${id}"`), `index.html deveria ter #${id}`);
    assert(html.includes('<div id="notif-center" hidden>'), 'painel nasce fechado (atributo hidden no HTML)');
    // dois sinos (topbar do desktop e header do celular), ambos abrindo a central
    const bellHtml = [];
    for (const m of html.matchAll(/<button[^>]*notif-bell[^>]*>/g)) {
        bellHtml.push(html.slice(m.index, html.indexOf('</button>', m.index)));   // botão inteiro, badge incluso
    }
    assert(bellHtml.length >= 2, 'sino no desktop E no celular');
    for (const b of bellHtml) {
        assert(b.includes('notifyToggle()'), 'o sino chama notifyToggle (abre a central, não as configurações)');
        assert(b.includes('notif-badge'), 'cada sino carrega seu badge de não lidas');
    }
    assert(html.includes('onclick="notifyClear()"') && html.includes('onclick="notifyClose()"'), 'painel com Limpar e Fechar');
    // display flex/none: o painel e o badge SÓ podem ter display via classe — o
    // [hidden] explícito é o que devolve o esconderijo (regressão do guard 11)
    assert(css.includes('#notif-center[hidden] { display: none; }'), 'painel some com [hidden]');
    assert(css.includes('.notif-badge[hidden] { display: none; }'), 'badge some com [hidden]');
    // as três origens têm ícone próprio no registro (kind → ícone na central)
    assert(/session:\s*\{\s*ic:\s*'clock'/.test(notify), 'sessão com ícone de relógio');
    assert(/release:\s*\{\s*ic:\s*'calendar'/.test(notify), 'lançamento com ícone de calendário');
    assert(/achievement:\s*\{\s*ic:\s*'trophy'/.test(notify), 'conquista com ícone de troféu');
    // os registros ficam no banco: defaultData e migrateData mantêm a lista
    const store = read(join(JS, 'store.js'));
    assert(store.includes('notifications: []'), 'defaultData nasce com a lista de notificações');
    assert(/data\.notifications = \(Array\.isArray/.test(store), 'migrateData sanitiza as notificações');
});
