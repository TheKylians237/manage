'use strict';
window.MatApi = (() => {
  let csrf = null;
  const defaultPreferences = { theme: 'system', density: 'comfortable', sounds: true, desktopNotifications: false, reduceMotion: false, dashboardPeriod: '30' };
  let preferenceScope = sessionStorage.getItem('mat-manage-preference-scope') || 'guest';
  function readPreferences(scope = preferenceScope) {
    try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(`mat-manage-preferences:${scope}`) || '{}') }; }
    catch { return { ...defaultPreferences }; }
  }
  function applyPreferences(preferences = readPreferences()) {
    const theme = preferences.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preferences.theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? 'true' : 'false';
  }
  function setPreferenceScope(userId) { preferenceScope = String(userId || 'guest'); sessionStorage.setItem('mat-manage-preference-scope', preferenceScope); applyPreferences(); }
  function savePreferences(patch) {
    const preferences = { ...readPreferences(), ...patch };
    localStorage.setItem(`mat-manage-preferences:${preferenceScope}`, JSON.stringify(preferences));
    applyPreferences(preferences);
    return preferences;
  }
  applyPreferences(readPreferences());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (readPreferences().theme === 'system') applyPreferences(); });
  async function getCsrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) throw new Error(data.error || 'Impossible de préparer la connexion sécurisée.');
    csrf = data.csrfToken; return csrf;
  }
  async function initialize() {
    const [health] = await Promise.all([request('/api/health'), getCsrf()]);
    if (!health.ok) throw new Error('Le serveur n’est pas encore prêt.');
    return health;
  }
  async function request(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
      headers.set('Content-Type', 'application/json'); options.body = JSON.stringify(options.body);
    }
    if (!['GET','HEAD','OPTIONS'].includes(method)) {
      if (!csrf) await getCsrf();
      headers.set('X-CSRF-Token', csrf);
    }
    const response = await fetch(url, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : {};
    if (response.status === 401 && !url.includes('/api/auth/')) { location.assign('/login.html'); throw new Error('Session expirée.'); }
    if (!response.ok) throw new Error(data.error || `Erreur serveur (${response.status}).`);
    return data;
  }
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(message, isError = false) {
    const host = document.querySelector('#toast-host') || document.body;
    const node = document.createElement('div'); node.className = `toast${isError ? ' error' : ''}`; node.textContent = message;
    host.append(node); setTimeout(() => node.remove(), 3500);
  }
  return { request, getCsrf, initialize, escape, toast, readPreferences, savePreferences, setPreferenceScope };
})();
