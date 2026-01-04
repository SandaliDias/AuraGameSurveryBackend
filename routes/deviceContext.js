import express from 'express';
import {
  saveDeviceContext,
  getDeviceContext,
  getDeviceContextBySession,
  deleteDeviceContext,
  bulkGetDeviceContexts,
} from '../controllers/deviceContextController.js';

const router = express.Router();

/**
 * Device Context Routes
 * Base path: /api/device-context
 * 
 * user_id is the primary key - one record per user
 */

// POST /api/device-context - Save or update device context (upsert by user_id)
router.post('/', saveDeviceContext);

// GET /api/device-context/user/:userId - Get device context for a user
router.get('/user/:userId', getDeviceContext);

// GET /api/device-context/session/:sessionId - Get device context by session ID
router.get('/session/:sessionId', getDeviceContextBySession);

// DELETE /api/device-context/user/:userId - Delete device context by user ID
router.delete('/user/:userId', deleteDeviceContext);

// POST /api/device-context/bulk - Bulk get device contexts by user IDs
router.post('/bulk', bulkGetDeviceContexts);

export default router;

