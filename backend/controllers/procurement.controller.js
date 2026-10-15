'use strict';

const db = require('../db');

async function suppliers(req, res, next) {
  try { const q=String(req.query.q||'').trim().slice(0,100);res.json({ suppliers: await db.query(`SELECT supplier_id,supplier_name,contact_name,email,phone,address,specialty,is_active,created_at FROM suppliers WHERE (? IS NULL OR is_active=?) AND (?='' OR supplier_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY supplier_name LIMIT 500`, [req.query.active === 'all' ? null : 1, req.query.active === 'all' ? null : 1,q,...Array(4).fill(`%${q}%`)]) }); }
  catch (error) { next(error); }
}

async function createSupplier(req, res, next) {
  try {
    const d=req.body||{},name=String(d.name||'').trim();
    if(name.length<2||name.length>160||String(d.email||'').length>254||String(d.phone||'').length>30)return res.status(400).json({error:'Informations fournisseur invalides.'});
    const result=await db.query('INSERT INTO suppliers(supplier_name,contact_name,email,phone,address,specialty) VALUES(?,?,?,?,?,?)',[name,d.contactName||null,d.email||null,d.phone||null,d.address||null,d.specialty||null]);
    res.status(201).json({ok:true,supplierId:result.insertId});
  }catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ce fournisseur existe déjà.'});next(error)}
}

async function listOrders(req,res,next){
  try{
    const allowed=new Set(['DRAFT','SENT','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED']);
    const status=allowed.has(req.query.status)?req.query.status:null;
    const q=String(req.query.q||'').trim().slice(0,100);
    const rows=await db.query(`SELECT po.purchase_order_id,po.order_number,po.order_date,po.expected_date,po.status,po.currency_code,
       s.supplier_name,u.full_name AS created_by,
       SUM(pol.quantity*pol.unit_price) AS subtotal,
       GROUP_CONCAT(CONCAT(m.designation,' × ',pol.quantity) ORDER BY m.designation SEPARATOR '; ') AS items
       FROM purchase_orders po JOIN suppliers s ON s.supplier_id=po.supplier_id JOIN users u ON u.user_id=po.created_by
       LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id=po.purchase_order_id
       LEFT JOIN materials m ON m.material_id=pol.material_id
       WHERE (? IS NULL OR po.status=?) AND (?='' OR po.order_number LIKE ? OR s.supplier_name LIKE ? OR m.designation LIKE ?) GROUP BY po.purchase_order_id,po.order_number,po.order_date,po.expected_date,po.status,po.currency_code,s.supplier_name,u.full_name
       ORDER BY po.order_date DESC LIMIT 300`,[status,status,q,...Array(3).fill(`%${q}%`)]);
    res.json({orders:rows});
  }catch(error){next(error)}
}

async function createOrder(req,res,next){
  try{
    const supplierId=Number(req.body?.supplierId),lines=Array.isArray(req.body?.lines)?req.body.lines.slice(0,100):[];
    if(!Number.isSafeInteger(supplierId)||!lines.length)return res.status(400).json({error:'Choisissez un fournisseur et au moins un article.'});
    for(const line of lines)if(!Number.isSafeInteger(Number(line.materialId))||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0||!Number.isFinite(Number(line.unitPrice))||Number(line.unitPrice)<0)return res.status(400).json({error:'Ligne de commande invalide.'});
    const orderNumber=String(req.body?.orderNumber||`CMD-${Date.now()}`).trim().slice(0,50);
    const orderId=await db.transaction(async tx=>{
      const po=await tx.query(`INSERT INTO purchase_orders(order_number,supplier_id,created_by,order_date,expected_date,status,currency_code,notes)
        VALUES(?,?,?,UTC_DATE(),?,'DRAFT',?,?)`,[orderNumber,supplierId,req.auth.userId,req.body?.expectedDate||null,req.body?.currencyCode||'XAF',req.body?.notes||null]);
      for(const line of lines)await tx.query(`INSERT INTO purchase_order_lines(purchase_order_id,material_id,description,quantity,unit_price,tax_rate)
        VALUES(?,?,?,?,?,?)`,[po.insertId,Number(line.materialId),line.description||null,Number(line.quantity),Number(line.unitPrice),Number(line.taxRate||0)]);
      return po.insertId;
    });
    res.status(201).json({ok:true,purchaseOrderId:orderId});
  }catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ce numéro de commande est déjà utilisé.'});next(error)}
}

async function updateOrderStatus(req,res,next){
  try{
    const id=Number(req.params.orderId),status=String(req.body?.status||'');
    if(!Number.isSafeInteger(id)||!['DRAFT','SENT','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'].includes(status))return res.status(400).json({error:'Statut de commande invalide.'});
    const result=await db.query('UPDATE purchase_orders SET status=? WHERE purchase_order_id=?',[status,id]);
    if(!result.affectedRows)return res.status(404).json({error:'Commande introuvable.'});
    res.json({ok:true});
  }catch(error){next(error)}
}

async function listQuoteRequests(req,res,next){
  try{
    const status=['DRAFT','SENT','PARTIALLY_ANSWERED','ANSWERED','CANCELLED'].includes(req.query.status)?req.query.status:null;
    const q=String(req.query.q||'').trim().slice(0,80);
    const from=req.query.from&&/^\d{4}-\d{2}-\d{2}$/.test(req.query.from)?req.query.from:null;
    const to=req.query.to&&/^\d{4}-\d{2}-\d{2}$/.test(req.query.to)?req.query.to:null;
    const rows=await db.query(`SELECT qr.quote_request_id,qr.request_number,qr.request_date,qr.required_by,qr.status,
      u.full_name AS requested_by,COUNT(DISTINCT qrl.quote_request_line_id) AS line_count,
      COUNT(DISTINCT CASE WHEN qs.response_status='RECEIVED' THEN qs.supplier_id END) AS responses_received,
      COUNT(DISTINCT qs.supplier_id) AS suppliers_count
      FROM quote_requests qr JOIN users u ON u.user_id=qr.requested_by
      LEFT JOIN quote_request_lines qrl ON qrl.quote_request_id=qr.quote_request_id
      LEFT JOIN quote_request_suppliers qs ON qs.quote_request_id=qr.quote_request_id
      WHERE (? IS NULL OR qr.status=?) AND (?='' OR qr.request_number LIKE ?)
        AND (? IS NULL OR qr.request_date>=?) AND (? IS NULL OR qr.request_date<DATE_ADD(?,INTERVAL 1 DAY))
      GROUP BY qr.quote_request_id,qr.request_number,qr.request_date,qr.required_by,qr.status,u.full_name
      ORDER BY qr.request_date DESC LIMIT 300`,[status,status,q,`%${q}%`,from,from?`${from} 00:00:00`:null,to,to]);
    res.json({quoteRequests:rows});
  }catch(error){next(error)}
}

async function createQuoteRequest(req,res,next){
  try{
    const supplierIds=Array.isArray(req.body?.supplierIds)?[...new Set(req.body.supplierIds.map(Number))].slice(0,100):[];
    const lines=Array.isArray(req.body?.lines)?req.body.lines.slice(0,100):[];
    if(!supplierIds.length||supplierIds.some(id=>!Number.isSafeInteger(id))||!lines.length)return res.status(400).json({error:'Sélectionnez au moins un fournisseur et un article.'});
    if(lines.some(line=>!Number.isSafeInteger(Number(line.materialId))||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0))return res.status(400).json({error:'Une ligne de demande de prix est invalide.'});
    const requestNumber=String(req.body?.requestNumber||`DP-${Date.now()}`).trim().slice(0,50);
    const quoteRequestId=await db.transaction(async tx=>{
      const request=await tx.query(`INSERT INTO quote_requests(request_number,requested_by,required_by,status,notes) VALUES(?,?,?,'DRAFT',?)`,[requestNumber,req.auth.userId,req.body?.requiredBy||null,req.body?.notes||null]);
      for(const supplierId of supplierIds)await tx.query('INSERT INTO quote_request_suppliers(quote_request_id,supplier_id) VALUES(?,?)',[request.insertId,supplierId]);
      for(const line of lines)await tx.query('INSERT INTO quote_request_lines(quote_request_id,material_id,requested_quantity,notes) VALUES(?,?,?,?)',[request.insertId,Number(line.materialId),Number(line.quantity),line.notes||null]);
      return request.insertId;
    });
    res.status(201).json({ok:true,quoteRequestId});
  }catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ce numéro de demande existe déjà.'});next(error)}
}

async function getQuoteRequest(req,res,next){
  try{
    const id=Number(req.params.quoteRequestId);if(!Number.isSafeInteger(id))return res.status(400).json({error:'Demande invalide.'});
    const request=(await db.query('SELECT quote_request_id,request_number,required_by,status FROM quote_requests WHERE quote_request_id=?',[id]))[0];
    if(!request)return res.status(404).json({error:'Demande de prix introuvable.'});
    const [suppliers,lines]=await Promise.all([
      db.query(`SELECT s.supplier_id,s.supplier_name,qs.response_status FROM quote_request_suppliers qs JOIN suppliers s ON s.supplier_id=qs.supplier_id WHERE qs.quote_request_id=? ORDER BY s.supplier_name`,[id]),
      db.query(`SELECT qrl.quote_request_line_id,qrl.requested_quantity,m.material_id,m.material_code,m.designation FROM quote_request_lines qrl JOIN materials m ON m.material_id=qrl.material_id WHERE qrl.quote_request_id=? ORDER BY m.designation`,[id])
    ]);
    res.json({request,suppliers,lines});
  }catch(error){next(error)}
}

async function listSupplierQuotes(req,res,next){
  try{
    const id=Number(req.params.quoteRequestId);if(!Number.isSafeInteger(id))return res.status(400).json({error:'Demande invalide.'});
    const rows=await db.query(`SELECT sq.supplier_quote_id,sq.quote_number,sq.received_at,sq.valid_until,sq.status,s.supplier_name,
      qrl.quote_request_line_id,m.material_code,m.designation,qrl.requested_quantity,sqln.quoted_quantity,sqln.unit_price,sqln.tax_rate,sqln.delivery_days
      FROM supplier_quotes sq JOIN suppliers s ON s.supplier_id=sq.supplier_id
      JOIN supplier_quote_lines sqln ON sqln.supplier_quote_id=sq.supplier_quote_id
      JOIN quote_request_lines qrl ON qrl.quote_request_line_id=sqln.quote_request_line_id
      JOIN materials m ON m.material_id=qrl.material_id WHERE sq.quote_request_id=? ORDER BY sq.received_at DESC,s.supplier_name,m.designation`,[id]);
    res.json({supplierQuotes:rows});
  }catch(error){next(error)}
}

async function recordSupplierQuote(req,res,next){
  try{
    const requestId=Number(req.params.quoteRequestId),supplierId=Number(req.body?.supplierId),lines=Array.isArray(req.body?.lines)?req.body.lines.slice(0,100):[];
    if(!Number.isSafeInteger(requestId)||!Number.isSafeInteger(supplierId)||!lines.length)return res.status(400).json({error:'Demande, fournisseur et articles sont requis.'});
    if(lines.some(line=>!Number.isSafeInteger(Number(line.requestLineId))||!Number.isFinite(Number(line.unitPrice))||Number(line.unitPrice)<0||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0))return res.status(400).json({error:'Une ligne de devis est invalide.'});
    const quoteId=await db.transaction(async tx=>{
      const request=(await tx.query('SELECT quote_request_id FROM quote_requests WHERE quote_request_id=?',[requestId]))[0];
      if(!request)throw Object.assign(new Error('Demande de prix introuvable.'),{statusCode:404});
      const supplierLink=(await tx.query('SELECT 1 FROM quote_request_suppliers WHERE quote_request_id=? AND supplier_id=?',[requestId,supplierId]))[0];
      if(!supplierLink)throw Object.assign(new Error('Ce fournisseur ne figure pas dans la demande.'),{statusCode:400});
      for(const line of lines){const valid=(await tx.query('SELECT quote_request_line_id FROM quote_request_lines WHERE quote_request_line_id=? AND quote_request_id=?',[Number(line.requestLineId),requestId]))[0];if(!valid)throw Object.assign(new Error('La ligne de prix ne correspond pas à cette demande.'),{statusCode:400})}
      const quote=await tx.query(`INSERT INTO supplier_quotes(quote_request_id,supplier_id,quote_number,valid_until,status,notes) VALUES(?,?,?,?, 'RECEIVED',?)`,[requestId,supplierId,req.body?.quoteNumber||null,req.body?.validUntil||null,req.body?.notes||null]);
      for(const line of lines)await tx.query(`INSERT INTO supplier_quote_lines(supplier_quote_id,quote_request_line_id,unit_price,quoted_quantity,tax_rate,delivery_days) VALUES(?,?,?,?,?,?)`,[quote.insertId,Number(line.requestLineId),Number(line.unitPrice),Number(line.quantity),Number(line.taxRate||0),line.deliveryDays?Number(line.deliveryDays):null]);
      await tx.query(`UPDATE quote_request_suppliers SET response_status='RECEIVED' WHERE quote_request_id=? AND supplier_id=?`,[requestId,supplierId]);
      await tx.query(`UPDATE quote_requests SET status=CASE WHEN (SELECT COUNT(*) FROM quote_request_suppliers WHERE quote_request_id=? AND response_status<>'PENDING') >= (SELECT COUNT(*) FROM quote_request_suppliers WHERE quote_request_id=?) THEN 'ANSWERED' ELSE 'PARTIALLY_ANSWERED' END WHERE quote_request_id=?`,[requestId,requestId,requestId]);
      return quote.insertId;
    });
    res.status(201).json({ok:true,supplierQuoteId:quoteId});
  }catch(error){if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Une réponse existe déjà pour ce fournisseur.'});next(error)}
}

module.exports={suppliers,createSupplier,listOrders,createOrder,updateOrderStatus,listQuoteRequests,createQuoteRequest,getQuoteRequest,listSupplierQuotes,recordSupplierQuote};
