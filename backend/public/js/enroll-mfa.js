'use strict';
const alertBox = document.querySelector('#error-message');
let redirectAfterEnroll = '/';
(async () => {
  try {
    await MatApi.getCsrf();
    const setup = await MatApi.request('/api/auth/mfa/setup', { method: 'POST', body: {} });
    document.querySelector('#qr-code').src = setup.qrDataUrl;
    document.querySelector('#secret-value').textContent = setup.secret;
  } catch (error) { alertBox.textContent = error.message; alertBox.classList.add('show'); }
})();
document.querySelector('#enroll-form').addEventListener('submit', async event => {
  event.preventDefault(); alertBox.classList.remove('show');
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const result = await MatApi.request('/api/auth/mfa/confirm', { method: 'POST', body: { code: event.currentTarget.code.value } });
    redirectAfterEnroll = result.redirect;
    document.querySelector('#setup-step').hidden = true;
    document.querySelector('#recovery-codes').innerHTML = result.recoveryCodes.map(code => `<div>${MatApi.escape(code)}</div>`).join('');
    document.querySelector('#recovery-step').hidden = false;
  } catch (error) { alertBox.textContent = error.message; alertBox.classList.add('show'); }
  finally { button.disabled = false; }
});
document.querySelector('#finish-button').addEventListener('click', () => location.assign(redirectAfterEnroll));
