'use strict';

require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const readline = require('node:readline');
const argon2 = require('argon2');
const db = require('../db');

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') return reject(new Error('La saisie cachée nécessite un terminal interactif.'));
    let value = '';
    process.stdout.write(question);
    input.setRawMode(true); input.resume(); input.setEncoding('utf8');
    const onData = char => {
      if (char === '\u0003') { cleanup(); reject(new Error('Opération annulée.')); return; }
      if (char === '\r' || char === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
      if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); return; }
      if (char >= ' ' && char !== '\u001b') value += char;
    };
    function cleanup() { input.removeListener('data', onData); input.setRawMode(false); input.pause(); }
    input.on('data', onData);
  });
}

async function main() {
  const matricule = await ask('Matricule administrateur: ');
  const fullName = await ask('Nom complet: ');
  const email = await ask('Adresse e-mail: ');
  const password = await askHidden('Mot de passe initial (12 caractères min.): ');
  if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(matricule) || fullName.length < 2 || !/^\S+@\S+\.\S+$/.test(email) ||
      password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('Les informations ou la robustesse du mot de passe ne satisfont pas la politique.');
  }
  const role = (await db.query("SELECT role_id FROM roles WHERE role_code='ADMIN' LIMIT 1"))[0];
  if (!role) throw new Error('Le rôle ADMIN est absent. Importez le schéma de la base.');
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await db.query('INSERT INTO users (matricule,full_name,email,password_hash,role_id,mfa_enabled,is_active) VALUES (?,?,?,?,?,FALSE,TRUE)', [matricule,fullName,email.toLowerCase(),hash,role.role_id]);
  console.log('Administrateur créé. À la première connexion, il devra enregistrer une application TOTP avant d’accéder au tableau de bord.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.pool.end());
