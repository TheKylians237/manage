'use strict';
const status = document.querySelector('#connection-status');
const retry = document.querySelector('#connection-retry');
const submit = document.querySelector('form button[type="submit"]');
const ipInput = document.querySelector('#client-ip');
const ipHelp = document.querySelector('#ip-help');
async function checkConnection() {
  if (submit) submit.disabled = true;
  if (retry) retry.hidden = true;
  if (status) { status.textContent = 'Vérification du serveur, de la base et de la connexion sécurisée…'; status.classList.remove('error'); }
  try {
    await MatApi.initialize();
    if (ipInput) {
      const address = await MatApi.request('/api/auth/client-ip');
      ipInput.value = address.clientIp;
      if (!address.allowed) throw new Error('Ce réseau n’est pas autorisé par l’administrateur.');
      if (ipHelp) ipHelp.textContent = address.restricted ? 'Adresse vérifiée dans le réseau autorisé par l’administrateur. Confirmez-la pour continuer.' : 'Confirmez l’adresse observée par le serveur. La connexion reste protégée par votre mot de passe et le second facteur.';
    }
    if (status) status.textContent = 'Serveur prêt. Vous pouvez continuer.';
    if (submit) submit.disabled = false;
  } catch (error) {
    if (status) { status.textContent = `${error.message} Vérifiez que le serveur et la base de données sont démarrés.`; status.classList.add('error'); }
    if (retry) retry.hidden = false;
  }
}
retry?.addEventListener('click', checkConnection);
checkConnection();
