'use strict';
const db=require('../db');
async function list(req,res,next){try{res.json({services:await db.query('SELECT service_id,service_code,service_name FROM services WHERE is_active=TRUE ORDER BY service_name')})}catch(e){next(e)}}
async function create(req,res,next){try{const code=String(req.body?.serviceCode||'').trim(),name=String(req.body?.serviceName||'').trim();if(!/^[A-Za-z0-9._-]{2,40}$/.test(code)||name.length<2||name.length>120)return res.status(400).json({error:'Code ou nom de service invalide.'});const result=await db.query('INSERT INTO services(service_code,service_name,description) VALUES(?,?,?)',[code,name,req.body?.description||null]);res.status(201).json({ok:true,serviceId:result.insertId})}catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ce code ou nom de service existe déjà.'});next(e)}}
module.exports={list,create};
