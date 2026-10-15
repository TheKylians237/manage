'use strict';
window.MatApi = (() => {
  let csrf = null;
  async function getCsrf() {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json(); csrf = data.csrfToken; return csrf;
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
  return { request, getCsrf, escape, toast };
})();
