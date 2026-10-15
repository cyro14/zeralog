(async function () {
  var b = document.createElement('div');
  try {
    var r = await fetch('https://api.steamgriddb.com/v2/search/autocomplete/Hollow%20Knight', { headers: { Authorization: 'Bearer TESTE' }, signal: AbortSignal.timeout(15000) });
    var txt = await r.text();
    b.textContent = 'SGDB ' + r.status + ': ' + txt.slice(0, 200);
  } catch (e) { b.textContent = 'SGDBÈROR: ' + e.message; }
  document.documentElement.appendChild(b);
})();
