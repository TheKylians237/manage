'use strict';

const express = require('express');
const multer = require('multer');
const auth = require('./controllers/auth.controller');
const profile = require('./controllers/profile.controller');
const dashboard = require('./controllers/dashboard.controller');
const materials = require('./controllers/materials.controller');
const inventory = require('./controllers/inventory.controller');
const maintenance = require('./controllers/maintenance.controller');
const oversight = require('./controllers/oversight.controller');
const users = require('./controllers/users.controller');
const services = require('./controllers/services.controller');
const settings = require('./controllers/settings.controller');
const site = require('./controllers/site.controller');
const { describeClientIp, confirmLoginIp } = require('./middleware/network-access');
const { csrfToken, requireAuth, requirePermission, auditMutations } = require('./middleware/security');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const materialRead = requirePermission('MATERIALS_READ');

router.get('/auth/csrf', csrfToken);
router.get('/auth/client-ip', describeClientIp);
router.get('/auth/status', auth.status);
router.post('/auth/login', confirmLoginIp, auth.login);
router.post('/auth/register', auth.register);
router.post('/auth/password-reset/request', auth.requestPasswordReset);
router.post('/auth/password-reset/confirm', auth.resetPassword);
router.post('/auth/mfa/setup', auth.beginEnrollment);
router.post('/auth/mfa/confirm', auth.confirmEnrollment);
router.post('/auth/mfa/verify', auth.verifySecondFactor);
router.post('/auth/logout', auth.logout);
router.post('/public/reviews', site.submitReview);

router.use(requireAuth);
router.use(auditMutations);
router.get('/dashboard', requirePermission('REPORTS_READ'), dashboard.dashboard);

router.get('/profile', profile.getProfile);
router.get('/profile/history', profile.history);
router.patch('/profile', profile.updateProfile);
router.post('/profile/avatar', upload.single('avatar'), profile.uploadAvatar);
router.post('/profile/password', profile.changePassword);

router.get('/materials', materialRead, materials.listMaterials);
router.get('/stock-organization', materialRead, materials.stockOrganization);
router.get('/material-summaries', materialRead, materials.summaries);
router.get('/mercuriale', materialRead, materials.mercuriale);
router.get('/materials/match', materialRead, materials.matchMaterial);
router.post('/materials', requirePermission('MATERIALS_MANAGE'), materials.createMaterial);
router.patch('/materials/:materialId/status', requirePermission('MATERIALS_MANAGE'), materials.updateMaterialStatus);
router.get('/categories', materialRead, materials.categories);
router.get('/locations', materialRead, materials.locations);
router.get('/services', materialRead, services.list);
router.post('/services', requirePermission('ALLOCATIONS_MANAGE'), services.create);

router.get('/movements', materialRead, inventory.listMovements);
router.post('/movements', requirePermission('STOCK_MOVE'), inventory.createMovement);
router.get('/allocations', requirePermission('ALLOCATIONS_MANAGE'), inventory.listAllocations);
router.post('/allocations', requirePermission('ALLOCATIONS_MANAGE'), inventory.createAllocation);

router.get('/maintenance', requirePermission('MAINTENANCE_MANAGE'), maintenance.list);
router.get('/maintenance/technicians', requirePermission('USERS_MANAGE'), maintenance.technicians);
router.get('/maintenance/available-materials', requirePermission('MAINTENANCE_MANAGE'), maintenance.availableMaterials);
router.get('/maintenance/upcoming-reminders', requirePermission('MAINTENANCE_MANAGE'), maintenance.upcomingReminders);
router.post('/maintenance', requirePermission('MAINTENANCE_MANAGE'), maintenance.create);
router.patch('/maintenance/:maintenanceId/status', requirePermission('MAINTENANCE_MANAGE'), maintenance.updateStatus);
router.get('/maintenance/:maintenanceId/parts', requirePermission('MAINTENANCE_MANAGE'), maintenance.listParts);
router.post('/maintenance/:maintenanceId/parts', requirePermission('MAINTENANCE_MANAGE'), maintenance.consumePart);

router.get('/supervision/overview', requirePermission('SUPERVISION_READ'), oversight.overview);
router.get('/supervision/reviews', requirePermission('SUPERVISION_READ'), oversight.reviews);
router.post('/supervision/reviews', requirePermission('SUPERVISION_REVIEW'), oversight.saveReview);
router.get('/audit-logs', requirePermission('USERS_MANAGE'), oversight.logs);

router.get('/users', requirePermission('USERS_MANAGE'), users.list);
router.post('/users', requirePermission('USERS_MANAGE'), users.create);
router.patch('/users/:userId', requirePermission('USERS_MANAGE'), users.update);
router.post('/users/:userId/reset-mfa', requirePermission('USERS_MANAGE'), users.resetMfa);
router.get('/settings', requirePermission('USERS_MANAGE'), settings.get);
router.patch('/settings', requirePermission('USERS_MANAGE'), settings.update);
router.get('/notifications', settings.notifications);
router.patch('/notifications/:notificationId/read', settings.markNotificationRead);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'La taille maximale de l’avatar est de 5 Mo.' : 'Fichier avatar invalide.' });
  }
  next(error);
});

module.exports = { router };
