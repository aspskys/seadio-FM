(function () {
  const KEY = 'seadio:server-base';

  function serverBase() {
    const raw = (localStorage.getItem(KEY) || '').trim();
    if (!raw) return location.origin;
    return raw.replace(/\/+$/, '');
  }

  function setServerBase(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, trimmed);
  }

  function clearServerBase() {
    localStorage.removeItem(KEY);
  }

  function api(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const base = serverBase();
    if (pathOrUrl.startsWith('/')) return base + pathOrUrl;
    return base + '/' + pathOrUrl;
  }

  function wsUrl(pathStr) {
    const base = serverBase();
    const ws = base.replace(/^http/i, 'ws');
    return ws + (pathStr.startsWith('/') ? pathStr : '/' + pathStr);
  }

  window.SeadioConfig = { serverBase, setServerBase, clearServerBase, api, wsUrl };
})();
