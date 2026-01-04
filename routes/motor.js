import express from 'express';
import {
  logPointerSamples,
  getPointerSamples,
  logAttempts,
  getAttempts,
  getAttemptStats,
  computeRoundSummary,
  computeSessionSummary,
  getRoundSummary,
  getSessionSummary,
  updateLabel,
  getTrainingData,
} from '../controllers/motorController.js';

const router = express.Router();

// ========== POINTER TRACE ROUTES ==========

/**
 * @route   POST /api/motor/trace
 * @desc    Log pointer trace samples (batch)
 * @body    { sessionId, userId, samples: [{round, tms, x, y, ...}] }
 */
router.post('/trace', logPointerSamples);

/**
 * @route   GET /api/motor/trace/:sessionId
 * @desc    Get pointer samples for a session
 * @query   round (optional): filter by round number
 */
router.get('/trace/:sessionId', getPointerSamples);

// ========== ATTEMPT ROUTES ==========

/**
 * @route   POST /api/motor/attempts
 * @desc    Log motor attempts (batch)
 * @body    { sessionId, attempts: [{round, attemptId, bubbleId, ...}] }
 */
router.post('/attempts', logAttempts);

/**
 * @route   GET /api/motor/attempts/:sessionId
 * @desc    Get attempts for a session
 * @query   round (optional): filter by round number
 */
router.get('/attempts/:sessionId', getAttempts);

/**
 * @route   GET /api/motor/attempts/:sessionId/stats
 * @desc    Get attempt statistics for a session
 */
router.get('/attempts/:sessionId/stats', getAttemptStats);

// ========== SUMMARY ROUTES ==========

/**
 * @route   POST /api/motor/summary/round
 * @desc    Compute and save round summary
 * @body    { sessionId, participantId, round }
 */
router.post('/summary/round', computeRoundSummary);

/**
 * @route   POST /api/motor/summary/session
 * @desc    Compute and save session summary
 * @body    { sessionId, participantId, label (optional) }
 */
router.post('/summary/session', computeSessionSummary);

/**
 * @route   GET /api/motor/summary/round/:sessionId/:round
 * @desc    Get round summary
 */
router.get('/summary/round/:sessionId/:round', getRoundSummary);

/**
 * @route   GET /api/motor/summary/session/:sessionId
 * @desc    Get session summary
 */
router.get('/summary/session/:sessionId', getSessionSummary);

/**
 * @route   PATCH /api/motor/summary/session/:sessionId/label
 * @desc    Update label for session summary
 * @body    { label: { level, score, source, version } }
 */
router.patch('/summary/session/:sessionId/label', updateLabel);

/**
 * @route   GET /api/motor/training
 * @desc    Get all session summaries for ML training
 * @query   labelLevel (optional): filter by label level
 * @query   participantId (optional): filter by participant
 * @query   limit (default: 1000): pagination limit
 * @query   offset (default: 0): pagination offset
 */
router.get('/training', getTrainingData);

export default router;


