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
    for (const id of ['gm-profile', 'gm-explore-filters', 'gm-explore-grid', 'tab-profile', 'gm-x-genre', 'gm-x-plat', 'gm-dev-filter', 'gm-pub-filter', 'gm-classic-decades', 'quick-match', 'qm-body', 'qm-count', 'sh-tiny', 'fin-view-timeline', 'fin-view-shelf'])
        assert(html.includes(`id="${id}"`), `index.html deveria ter #${id}`);
    // ids que FORAM REMOVIDOS não podem estar no HTML (senão o JS pode tentar usá-los de volta)
    for (const gone of ['fin-view-list', 'home-view-list', 'home-view-shelf', 'wish-view-list', 'wish-view-shelf', 'compact-toggle'])
        assert(!html.includes(`id="${gone}"`), `index.html NÃO deveria ter #${gone} (foi removido)`);
});

// ---------- 5) GUARDA DE ÍCONES: todo arquivo icons/... citado no código existe ----------
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
