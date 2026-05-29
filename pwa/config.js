(function () {
  const KEY = 'seadio:server-base';
  // Native (Capacitor) builds have no meaningful page origin to talk to, so they
  // default to the public backend. Web/desktop keep using their own origin.
  const NATIVE_DEFAULT_BASE = 'https://seadio.pokewo.cn';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function serverBase() {
    const raw = (localStorage.getItem(KEY) || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
    return isNative() ? NATIVE_DEFAULT_BASE : location.origin;
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
