import MotorPointerTraceBucket from '../models/MotorPointerTraceBucket.js';
import MotorAttemptBucket from '../models/MotorAttemptBucket.js';
import { MotorRoundSummary, MotorSessionSummary, computeRoundFeatures, computeSessionFeatures } from '../models/MotorSummary.js';
import { logger } from '../services/logging/logger.js';

/**
 * Motor Controllers - ML-Ready Motor Skills Data Management
 */

// ========== POINTER TRACE ENDPOINTS ==========

/**
 * Log pointer trace samples (batch)
 * Optimized for low-latency response
 */
export const logPointerSamples = async (req, res) => {
  try {
    const { sessionId, userId, samples } = req.body;

    if (!sessionId || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and samples array are required',
      });
    }

    // Send immediate response to reduce client-side latency
    // Process in background
    res.json({
      success: true,
      data: {
        received: samples.length,
        processing: true,
      },
    });

    // Process samples asynchronously after response
    setImmediate(async () => {
      try {
        const bucket = await MotorPointerTraceBucket.addSamples(sessionId, userId, samples);
        logger.info('Pointer samples logged', {
          sessionId,
          count: samples.length,
          bucketNumber: bucket.bucketNumber,
        });
      } catch (error) {
        logger.error('Error processing pointer samples:', {
          sessionId,
          error: error.message,
        });
      }
    });
  } catch (error) {
    logger.error('Error logging pointer samples:', error);
    
    if (error.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get pointer samples for a session
 */
export const getPointerSamples = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { round } = req.query;

    const samples = await MotorPointerTraceBucket.getSessionSamples(
      sessionId,
      round ? parseInt(round) : null
    );

    res.json({
      success: true,
      data: {
        sessionId,
        round: round || 'all',
        count: samples.length,
        samples,
      },
    });
  } catch (error) {
    logger.error('Error retrieving pointer samples:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========== ATTEMPT ENDPOINTS ==========

/**
 * Log motor attempts (batch)
 * Optimized for low-latency response during gameplay
 */
export const logAttempts = async (req, res) => {
  try {
    const { sessionId, userId, attempts } = req.body;

    if (!sessionId || !Array.isArray(attempts) || attempts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and attempts array are required',
      });
    }

    // Send immediate response to reduce client-side latency
    res.json({
      success: true,
      data: {
        received: attempts.length,
        processing: true,
      },
    });

    // Process attempts asynchronously after response
    setImmediate(async () => {
      try {
        const bucket = await MotorAttemptBucket.addAttempts(sessionId, userId, attempts);
        logger.info('Motor attempts logged', {
          sessionId,
          count: attempts.length,
          bucketNumber: bucket.bucketNumber,
        });
      } catch (error) {
        logger.error('Error processing motor attempts:', {
          sessionId,
          error: error.message,
        });
      }
    });
  } catch (error) {
    logger.error('Error logging attempts:', error);
    
    if (error.message.includes('does not exist')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get attempts for a session
 */
export const getAttempts = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { round } = req.query;

    const attempts = await MotorAttemptBucket.getSessionAttempts(
      sessionId,
      round ? parseInt(round) : null
    );

    res.json({
      success: true,
      data: {
        sessionId,
        round: round || 'all',
        count: attempts.length,
        attempts,
      },
    });
  } catch (error) {
    logger.error('Error retrieving attempts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get attempt statistics for a session
 */
export const getAttemptStats = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const stats = await MotorAttemptBucket.getSessionStats(sessionId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error retrieving attempt stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ========== SUMMARY ENDPOINTS ==========

/**
 * Compute and save round summary
 */
export const computeRoundSummary = async (req, res) => {
  try {
    const { sessionId, participantId, round } = req.body;

    if (!sessionId || !participantId || !round) {
      return res.status(400).json({
        success: false,
        error: 'Session ID, participant ID, and round are required',
      });
    }

    // Get session to retrieve userId
    const Session = (await import('../models/Session.js')).default;
    const session = await Session.findOne({ sessionId });
    const userId = session?.userId || null;

    // Compute features for this round
    const features = await computeRoundFeatures(sessionId, round);

    if (!features) {
      return res.status(404).json({
        success: false,
        error: 'No attempts found for this round',
      });
    }

    // Save or update summary
    const summary = await MotorRoundSummary.findOneAndUpdate(
      { sessionId, round },
      {
        sessionId,
        userId,
        participantId,
        round,
        counts: {
          nTargets: features.nAttempts,
          nHits: features.nHits,
          nMisses: features.nMisses,
          hitRate: features.hitRate,
        },
        features,
        featureVersion: 'v1',
      },
      { upsert: true, new: true }
    );

    logger.info('Round summary computed', {
      sessionId,
      round,
      hitRate: features.hitRate,
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error computing round summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Compute and save session summary
 */
export const computeSessionSummary = async (req, res) => {
  try {
    const { sessionId, participantId, label } = req.body;

    if (!sessionId || !participantId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and participant ID are required',
      });
    }

    // Get session to retrieve userId
    const Session = (await import('../models/Session.js')).default;
    const session = await Session.findOne({ sessionId });
    const userId = session?.userId || null;

    // Compute features across all rounds
    const features = await computeSessionFeatures(sessionId);

    // Save or update summary
    const summary = await MotorSessionSummary.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        userId,
        participantId,
        features,
        featureVersion: 'v1',
        label: label || {
          level: 'unknown',
          source: 'none',
        },
      },
      { upsert: true, new: true }
    );

    logger.info('Session summary computed', {
      sessionId,
      featureCount: Object.keys(features).length,
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error computing session summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get round summary
 */
export const getRoundSummary = async (req, res) => {
  try {
    const { sessionId, round } = req.params;

    const summary = await MotorRoundSummary.findOne({ 
      sessionId, 
      round: parseInt(round) 
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Round summary not found',
      });
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error retrieving round summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get session summary
 */
export const getSessionSummary = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const summary = await MotorSessionSummary.findOne({ sessionId });

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Session summary not found',
      });
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error retrieving session summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Update label for session summary
 */
export const updateLabel = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { label } = req.body;

    if (!label || !label.level) {
      return res.status(400).json({
        success: false,
        error: 'Label with level is required',
      });
    }

    const summary = await MotorSessionSummary.findOneAndUpdate(
      { sessionId },
      { label },
      { new: true }
    );

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Session summary not found',
      });
    }

    logger.info('Label updated', {
      sessionId,
      level: label.level,
      source: label.source,
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error updating label:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get all session summaries for ML training (with optional filters)
 */
export const getTrainingData = async (req, res) => {
  try {
    const { labelLevel, participantId, limit = 1000, offset = 0 } = req.query;

    const query = {};
    
    if (labelLevel) {
      query['label.level'] = labelLevel;
    }
    
    if (participantId) {
      query.participantId = participantId;
    }

    const summaries = await MotorSessionSummary.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await MotorSessionSummary.countDocuments(query);

    res.json({
      success: true,
      data: {
        summaries,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('Error retrieving training data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};