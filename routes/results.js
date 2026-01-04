import express from 'express';
import { 
  saveVisionResults, 
  saveLiteracyResults,
  getSessionResults,
  createSession,
  updateModuleCompletion,
  updateSessionPerformance,
  checkUserIdExists,
  suggestUserId
} from '../controllers/resultsController.js';

const router = express.Router();

// GET /api/results/check-userid/:userId - Check if userId already exists
router.get('/check-userid/:userId', checkUserIdExists);

// GET /api/results/suggest-userid - Get a unique userId suggestion
router.get('/suggest-userid', suggestUserId);

// POST /api/results/session - Create or update session
router.post('/session', createSession);

// PATCH /api/results/session/performance - Update session performance metrics
router.patch('/session/performance', updateSessionPerformance);

// POST /api/results/module-complete - Update module completion
router.post('/module-complete', updateModuleCompletion);

// POST /api/results/vision - Save vision test results
router.post('/vision', saveVisionResults);

// POST /api/results/literacy - Save literacy test results
router.post('/literacy', saveLiteracyResults);

// GET /api/results/session/:sessionId - Get all results for a session
router.get('/session/:sessionId', getSessionResults);

export default router;

