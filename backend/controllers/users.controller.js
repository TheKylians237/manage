'use strict';

const argon2 = require('argon2');
const db = require('../db');
const mailer = require('../mailer');
const { decryptSecret, verifyTotp } = require('./auth.controller');

const PASSWORD_RULE=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,256}$/;

async function list(req,res,next){
  try{
    const q=String(req.query.q||'').trim().slice(0,100),role=String(req.query.role||'').slice(0,40);
    const rows=await db.query(`SELECT u.user_id,u.matricule,u.full_name,u.email,u.phone,u.department_name,u.avatar_url,u.is_active,u.mfa_enabled,u.created_at,r.role_code,r.role_name
       FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE (?='' OR u.full_name LIKE ? OR u.matricule LIKE ? OR u.email LIKE ?) AND (?='' OR r.role_code=?)
       ORDER BY u.full_name LIMIT 300`,[q,`%${q}%`,`%${q}%`,`%${q}%`,role,role]);
    res.json({users:rows});
  }catch(error){next(error)}
}

async function create(req,res,next){
  try{
    const d=req.body||{},badge=String(d.matricule||d.badge||'').trim(),name=String(d.fullName||'').trim(),email=String(d.email||'').trim().toLowerCase(),roleCode=String(d.roleCode||''),department=String(d.departmentName||'').trim();
    if(!/^[\p{L}\p{N}._-]{2,40}$/u.test(badge)||name.length<2||name.length>150||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!PASSWORD_RULE.test(String(d.initialPassword||'')))return res.status(400).json({error:'Vérifiez le matricule, le nom, l’adresse et le mot de passe (12 caractères minimum, majuscule, minuscule, chiffre et symbole).'});
    const roles=await db.query('SELECT role_id FROM roles WHERE role_code=?',[roleCode]);
    if(!roles.length)return res.status(400).json({error:'Rôle inconnu.'});
    const hash=await argon2.hash(d.initialPassword,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
    if(department.length>120)return res.status(400).json({error:'Le département ne peut pas dépasser 120 caractères.'});
    const result=await db.query(`INSERT INTO users(matricule,full_name,email,password_hash,role_id,department_name,mfa_enabled,is_active) VALUES(?,?,?,?,?,?,FALSE,TRUE)`,[badge,name,email,hash,roles[0].role_id,department||null]);
    let emailSent=false;
    try{await mailer.sendNewAccountCredentials({full_name:name,email},badge,String(d.initialPassword));emailSent=true}
    catch(error){console.error('Échec de l’envoi des identifiants du nouveau compte.',error.code||error.name)}
    res.status(201).json({ok:true,emailSent,message:emailSent?'Compte créé. Les identifiants ont été envoyés par e-mail; un TOTP sera configuré à la première connexion.':'Compte créé, mais l’e-mail n’a pas pu être envoyé. Vérifiez la configuration SMTP et l’adresse saisie.',userId:result.insertId});
  }catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ce matricule ou cette adresse e-mail est déjà utilisé.'});next(error)}
}

async function update(req,res,next){
  try{
    const id=Number(req.params.userId),d=req.body||{};
    if(!Number.isSafeInteger(id))return res.status(400).json({error:'Identifiant invalide.'});
    if(id===Number(req.auth.userId)&&d.isActive===false)return res.status(400).json({error:'Vous ne pouvez pas désactiver votre propre compte.'});
    const roleCode=String(d.roleCode||'');
    if(id===Number(req.auth.userId)&&roleCode&&roleCode!=='ADMIN')return res.status(400).json({error:'Vous ne pouvez pas modifier votre propre rôle administrateur.'});
    const role=roleCode?await db.query('SELECT role_id FROM roles WHERE role_code=?',[roleCode]):[];
    if(roleCode&&!role.length)return res.status(400).json({error:'Rôle inconnu.'});
    const updates=[],params=[];
    if(Object.hasOwn(d,'departmentName')){const department=String(d.departmentName||'').trim();if(department.length>120)return res.status(400).json({error:'Le département ne peut pas dépasser 120 caractères.'});updates.push('department_name=?');params.push(department||null)}
    if(role.length){updates.push('role_id=?');params.push(role[0].role_id);updates.push('session_version=session_version+1')}
    if(typeof d.isActive==='boolean'){updates.push('is_active=?');params.push(d.isActive?1:0);if(!d.isActive)updates.push('session_version=session_version+1')}
    if(!updates.length)return res.status(400).json({error:'Aucune modification valide.'});
    params.push(id);
    const result=await db.query(`UPDATE users SET ${updates.join(',')} WHERE user_id=?`,params);
    if(!result.affectedRows)return res.status(404).json({error:'Utilisateur introuvable.'});
    res.json({ok:true});
  }catch(error){next(error)}
}

async function resetMfa(req,res,next){
  try{
    const id=Number(req.params.userId);
    if(!Number.isSafeInteger(id)||id===Number(req.auth.userId))return res.status(400).json({error:'Compte cible invalide. Un administrateur ne peut pas réinitialiser son propre MFA ici.'});
    const admin=(await db.query('SELECT password_hash,totp_secret_enc,totp_last_step FROM users WHERE user_id=? AND mfa_enabled=TRUE',[req.auth.userId]))[0];
    let validPassword=false;try{validPassword=Boolean(admin)&&await argon2.verify(admin.password_hash,String(req.body?.currentPassword||''))}catch{}
    if(!validPassword)return res.status(401).json({error:'Mot de passe administrateur invalide.'});
    const step=admin?.totp_secret_enc?verifyTotp(decryptSecret(admin.totp_secret_enc),String(req.body?.totpCode||'')):null;
    if(step===null||(admin.totp_last_step!==null&&step<=Number(admin.totp_last_step)))return res.status(401).json({error:'Code TOTP invalide ou déjà utilisé.'});
    const consumed=await db.query('UPDATE users SET totp_last_step=? WHERE user_id=? AND (totp_last_step IS NULL OR totp_last_step<?)',[step,req.auth.userId,step]);
    if(!consumed.affectedRows)return res.status(401).json({error:'Code TOTP invalide ou déjà utilisé.'});
    const rows=await db.query('SELECT user_id,full_name,email FROM users WHERE user_id=?',[id]);
    if(!rows.length)return res.status(404).json({error:'Utilisateur introuvable.'});
    await db.transaction(async tx=>{
      await tx.query('UPDATE users SET mfa_enabled=FALSE,totp_secret_enc=NULL,totp_last_step=NULL,session_version=session_version+1 WHERE user_id=?',[id]);
      await tx.query('DELETE FROM mfa_recovery_codes WHERE user_id=?',[id]);
    });
    await db.query('INSERT INTO audit_logs (user_id,action_code,entity_name,entity_id) VALUES (?,?,?,?)',[req.auth.userId,'USER_MFA_RESET','users',id]);
    sendSecurityNotice(rows[0],'Un administrateur a réinitialisé le second facteur de votre compte. Au prochain accès, enregistrez votre application TOTP à nouveau.').catch(()=>{});
    res.json({ok:true,message:'MFA réinitialisé; la personne devra le réenrôler après son mot de passe.'});
  }catch(error){next(error)}
}

module.exports={list,create,update,resetMfa};
