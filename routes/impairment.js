import express from 'express';
import {
  saveImpairmentProfile,
  getProfileBySession,
  getUserProfile,
  deleteProfile,
  bulkGetProfiles,
} from '../controllers/impairmentController.js';

const router = express.Router();

/**
 * Impairment Profile Routes
 * Base path: /api/impairment
 * 
 * user_id is the primary key - one profile per user
 */

// POST /api/impairment/profile - Save or update impairment profile (upsert by user_id)
router.post('/profile', saveImpairmentProfile);

// GET /api/impairment/profile/:sessionId - Get profile by session ID
router.get('/profile/:sessionId', getProfileBySession);

// GET /api/impairment/user/:userId - Get profile for a user (unique per user)
router.get('/user/:userId', getUserProfile);

// DELETE /api/impairment/user/:userId - Delete profile by user ID
router.delete('/user/:userId', deleteProfile);

// POST /api/impairment/bulk - Bulk get profiles by user IDs
router.post('/bulk', bulkGetProfiles);

export default router;

