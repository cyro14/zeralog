// ============================================================================
// Rodador da suíte de testes do ZeraLog.
// Uso:  node tests/run.mjs      (ou `npm test`)
// Sai com código 1 se qualquer teste falhar — use isso antes de encerrar mudanças.
// ============================================================================
import { tests, resetShim } from './shim.mjs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();
console.log(`ZeraLog — suíte de testes (${files.length} arquivo(s))\n`);

for (const f of files) await import('./' + f);   // cada arquivo registra seus testes

let pass = 0, fail = 0, skip = 0;
for (const t of tests) {
    resetShim();   // estado novo (DOM falso + banco limpo) para cada teste
    const t0 = Date.now();
    try {
        await t.fn();
        pass++;
        console.log(`OK    ${t.name} (${Date.now() - t0}ms)`);
    } catch (e) {
        if (e && e.skip) { skip++; console.log(`PULA  ${t.name} — ${e.message}`); }
        else {
            fail++;
            console.log(`FALHA ${t.name}`);
            console.log(`      ${String((e && e.stack) || e).split('\n').slice(0, 3).join('\n      ')}`);
        }
    }
}

console.log(`\n${pass} ok · ${fail} falha(s) · ${skip} pulado(s)`);
process.exit(fail ? 1 : 0);
