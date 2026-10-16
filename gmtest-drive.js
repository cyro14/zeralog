window.addEventListener('load', function () {
  setTimeout(async function () {
    var log = [];
    var T = function (k, v) { log.push(k + '=' + v); };
    try {
      openSettings(); openSettingsSection('shops');
      T('hubCards', document.querySelectorAll('.shop-card').length);
      var am = document.querySelector('.shop-card[onclick*="amazon"]');
      T('amazonCard', !!am);
      if (am) { am.click(); }
      T('amazonPage', !document.getElementById('settings-page-amazon').hidden);
      document.getElementById('store-import-amazon').value = 'Control\nResident Evil 4\nControl';
      storeImport('amazon');
      T('amazonImported', window.__zlData().games.filter(function (g) { return g.store === 'amazon'; }).length);
      var ep = await import('./js/stores.js');
      T('statusShown', document.getElementById('store-status-amazon').textContent.indexOf('importad') > -1);
      T('platCreated', window.__zlData().platforms.some(function (p) { return p.name === 'Amazon Games'; }));
      T('catCreated', window.__zlData().categories.some(function (c) { return c.name === 'Amazon Games'; }));
    } catch (e) { log.push('EXCEPTION ' + e.message); }
    var e2 = document.createElement('div');
    e2.textContent = 'DRIVE ' + log.join(' | ');
    document.documentElement.appendChild(e2);
  }, 1500);
});
