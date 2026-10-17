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
    for (const id of ['gm-profile', 'gm-explore-filters', 'gm-explore-grid', 'tab-profile', 'gm-x-genre', 'gm-x-plat', 'gm-dev-filter', 'gm-pub-filter', 'gm-classic-decades', 'quick-match', 'qm-body', 'sh-tiny', 'fin-view-timeline', 'fin-view-shelf', 'modal-ach', 'ach-detail', 'sh-style-timeline', 'wish-pane-list', 'wish-pane-releases', 'wish-sub-list', 'wish-sub-releases', 'wish-releases-grid', 'wish-summary', 'wish-list-container', 'wish-filter-btn', 'wish-sort-btn', 'wish-x-filter-panel', 'wish-x-sort-panel', 'wish-x-genre', 'wish-x-plat', 'wish-dev-filter', 'wish-pub-filter', 'home-sort-btn', 'home-sort-panel'])
        assert(html.includes(`id="${id}"`), `index.html deveria ter #${id}`);
    // ids que FORAM REMOVIDOS não podem estar no HTML (senão o JS pode tentar usá-los de volta)
    for (const gone of ['fin-view-list', 'home-view-list', 'home-view-shelf', 'wish-view-list', 'wish-view-shelf', 'compact-toggle', 'sh-style-cards', 'sh-chips', 'qm-count', 'home-sort-bar', 'sort-home-manual', 'sort-home-az', 'sort-home-time', 'sort-home-meta'])
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

// ---------- 14) ORDENAÇÃO PADRONIZADA: botão + painel (Fila e Lançamentos) ----------
// A Fila usava uma barra de chips (Manual / A-Z / Tempo / Nota) que ocupava a largura
// toda. Ela passou a usar o MESMO botão de ordenação das outras telas (botão que abre
// um painel). Os Lançamentos da wishlist também importaram os filtros/ordenações do
// Explorar em vez de inventar uma segunda barra de filtros.
test('Ordenação: a Fila usa o botão com painel e os Lançamentos importam os do Explorar', () => {
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
});
