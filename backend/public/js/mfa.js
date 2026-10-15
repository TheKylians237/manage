'use strict';
const form = document.querySelector('#mfa-form'), alertBox = document.querySelector('#error-message');
form.addEventListener('submit', async event => {
  event.preventDefault(); alertBox.classList.remove('show');
  const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Vérification…';
  try { const data = await MatApi.request('/api/auth/mfa/verify', { method: 'POST', body: { code: form.code.value.trim() } }); location.assign(data.redirect); }
  catch (error) { alertBox.textContent = error.message; alertBox.classList.add('show'); }
  finally { button.disabled = false; button.textContent = 'Vérifier et ouvrir ma session'; }
});
document.querySelector('#logout-button').addEventListener('click', async () => { try { await MatApi.request('/api/auth/logout', { method: 'POST', body: {} }); } finally { location.assign('/login.html'); } });
