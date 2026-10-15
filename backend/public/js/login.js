'use strict';
const form = document.querySelector('#login-form'), alertBox = document.querySelector('#error-message');
form.addEventListener('submit', async event => {
  event.preventDefault(); alertBox.classList.remove('show');
  const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Vérification…';
  try {
    await MatApi.getCsrf();
    const data = await MatApi.request('/api/auth/login', { method: 'POST', body: { badge: form.matricule.value, password: form.password.value } });
    location.assign(data.next);
  } catch (error) { alertBox.textContent = error.message; alertBox.classList.add('show'); }
  finally { button.disabled = false; button.textContent = 'Continuer avec le second facteur'; }
});
