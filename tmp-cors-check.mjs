// Verificação rápida (não faz parte da suíte): headers CORS das fontes de capa.
const targets = [
    ['Steam CDN 600x900', 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/library_600x900.jpg'],
    ['RAWG media', 'https://media.rawg.io/media/games/618/618c2031a079164b62342623d318c8d0.jpg'],
    ['Wikimedia', 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a5/Super_Mario_Bros._box_art.jpg/220px-Super_Mario_Bros._box_art.jpg'],
];
for (const [name, url] of targets) {
    try {
        const res = await fetch(url, { method: 'GET', headers: { Origin: 'http://127.0.0.1:19387' } });
        const buf = await res.arrayBuffer();
        console.log(`${name}: HTTP ${res.status} · ACAO="${res.headers.get('access-control-allow-origin')}" · ${buf.byteLength} bytes · type=${res.headers.get('content-type')}`);
    } catch (e) { console.log(`${name}: FALHOU ${e.message} (${e.cause && e.cause.code || ''})`); }
}
