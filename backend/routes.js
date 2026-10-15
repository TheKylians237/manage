'use strict';

const express = require('express');
const multer = require('multer');
const auth = require('./controllers/auth.controller');
const profile = require('./controllers/profile.controller');
const dashboard = require('./controllers/dashboard.controller');
const materials = require('./controllers/materials.controller');
const inventory = require('./controllers/inventory.controller');
const maintenance = require('./controllers/maintenance.controller');
const procurement = require('./controllers/procurement.controller');
const users = require('./controllers/users.controller');
const services = require('./controllers/services.controller');
const settings = require('./controllers/settings.controller');
const { csrfToken, requireAuth, requirePermission } = require('./middleware/security');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const materialRead = requirePermission('MATERIALS_READ');

router.get('/auth/csrf', csrfToken);
router.get('/auth/status', auth.status);
router.post('/auth/login', auth.login);
router.post('/auth/register', auth.register);
router.post('/auth/password-reset/request', auth.requestPasswordReset);
router.post('/auth/password-reset/confirm', auth.resetPassword);
router.post('/auth/mfa/setup', auth.beginEnrollment);
router.post('/auth/mfa/confirm', auth.confirmEnrollment);
router.post('/auth/mfa/verify', auth.verifySecondFactor);
router.post('/auth/logout', auth.logout);

router.use(requireAuth);
router.get('/dashboard', requirePermission('REPORTS_READ'), dashboard.dashboard);

router.get('/profile', profile.getProfile);
router.patch('/profile', profile.updateProfile);
router.post('/profile/avatar', upload.single('avatar'), profile.uploadAvatar);
router.post('/profile/password', profile.changePassword);

router.get('/materials', materialRead, materials.listMaterials);
router.get('/material-summaries', materialRead, materials.summaries);
router.get('/mercuriale', materialRead, materials.mercuriale);
router.post('/materials', requirePermission('MATERIALS_MANAGE'), materials.createMaterial);
router.patch('/materials/:materialId/status', requirePermission('MATERIALS_MANAGE'), materials.updateMaterialStatus);
router.get('/categories', materialRead, materials.categories);
router.get('/locations', materialRead, materials.locations);
router.post('/locations', requirePermission('STOCK_MOVE'), materials.createLocation);
router.get('/services', materialRead, services.list);
router.post('/services', requirePermission('ALLOCATIONS_MANAGE'), services.create);

router.get('/movements', materialRead, inventory.listMovements);
router.post('/movements', requirePermission('STOCK_MOVE'), inventory.createMovement);
router.get('/allocations', requirePermission('ALLOCATIONS_MANAGE'), inventory.listAllocations);
router.post('/allocations', requirePermission('ALLOCATIONS_MANAGE'), inventory.createAllocation);

router.get('/maintenance', requirePermission('MAINTENANCE_MANAGE'), maintenance.list);
router.post('/maintenance', requirePermission('MAINTENANCE_MANAGE'), maintenance.create);
router.patch('/maintenance/:maintenanceId/status', requirePermission('MAINTENANCE_MANAGE'), maintenance.updateStatus);
router.get('/maintenance/:maintenanceId/parts', requirePermission('MAINTENANCE_MANAGE'), maintenance.listParts);
router.post('/maintenance/:maintenanceId/parts', requirePermission('MAINTENANCE_MANAGE'), maintenance.consumePart);

router.get('/suppliers', requirePermission('SUPPLIERS_MANAGE'), procurement.suppliers);
router.post('/suppliers', requirePermission('SUPPLIERS_MANAGE'), procurement.createSupplier);
router.get('/orders', requirePermission('PURCHASING_MANAGE'), procurement.listOrders);
router.post('/orders', requirePermission('PURCHASING_MANAGE'), procurement.createOrder);
router.patch('/orders/:orderId/status', requirePermission('PURCHASING_MANAGE'), procurement.updateOrderStatus);
router.get('/quote-requests', requirePermission('PURCHASING_MANAGE'), procurement.listQuoteRequests);
router.post('/quote-requests', requirePermission('PURCHASING_MANAGE'), procurement.createQuoteRequest);
router.get('/quote-requests/:quoteRequestId', requirePermission('PURCHASING_MANAGE'), procurement.getQuoteRequest);
router.get('/quote-requests/:quoteRequestId/quotes', requirePermission('PURCHASING_MANAGE'), procurement.listSupplierQuotes);
router.post('/quote-requests/:quoteRequestId/quotes', requirePermission('PURCHASING_MANAGE'), procurement.recordSupplierQuote);

router.get('/users', requirePermission('USERS_MANAGE'), users.list);
router.post('/users', requirePermission('USERS_MANAGE'), users.create);
router.patch('/users/:userId', requirePermission('USERS_MANAGE'), users.update);
router.post('/users/:userId/reset-mfa', requirePermission('USERS_MANAGE'), users.resetMfa);
router.get('/settings', requirePermission('USERS_MANAGE'), settings.get);
router.patch('/settings', requirePermission('USERS_MANAGE'), settings.update);
router.get('/notifications', settings.notifications);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'La taille maximale de l’avatar est de 5 Mo.' : 'Fichier avatar invalide.' });
  }
  next(error);
});

module.exports = { router };
