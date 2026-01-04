import ImpairmentProfile from '../models/ImpairmentProfile.js';
import { logger } from '../services/logging/logger.js';

/**
 * Save impairment profile
 * POST /api/impairment/profile
 * 
 * user_id is the primary key - one profile per user
 * Updates existing profile if user has one, creates new if not
 */
export const saveImpairmentProfile = async (req, res) => {
  try {
    const {
      user_id,
      session_id,
      captured_at,
      impairment_probs,
      onboarding_metrics,
      device_context,
    } = req.body;

    // Validate required fields
    if (!user_id || !session_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and session_id are required',
      });
    }

    if (!impairment_probs) {
      return res.status(400).json({
        success: false,
        error: 'impairment_probs is required',
      });
    }

    // Upsert by user_id (one profile per user)
    const profile = await ImpairmentProfile.findOneAndUpdate(
      { user_id },
      {
        user_id,
        session_id,
        captured_at: captured_at ? new Date(captured_at) : new Date(),
        impairment_probs,
        onboarding_metrics,
        device_context,
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info(`Impairment profile saved: user=${user_id}, session=${session_id}`);

    res.status(201).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Error saving impairment profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save impairment profile',
    });
  }
};

/**
 * Get impairment profile by session ID
 * GET /api/impairment/profile/:sessionId
 */
export const getProfileBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const profile = await ImpairmentProfile.findOne({ session_id: sessionId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Error fetching impairment profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch impairment profile',
    });
  }
};

/**
 * Get impairment profile for a user
 * GET /api/impairment/user/:userId
 * 
 * Since user_id is unique, there's only one profile per user
 */
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await ImpairmentProfile.findOne({ user_id: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'No profile found for this user',
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
    });
  }
};

/**
 * Delete impairment profile by user_id
 * DELETE /api/impairment/user/:userId
 */
export const deleteProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await ImpairmentProfile.findOneAndDelete({ user_id: userId });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    res.json({
      success: true,
      message: 'Profile deleted',
    });
  } catch (error) {
    logger.error('Error deleting profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete profile',
    });
  }
};

/**
 * Bulk get profiles
 * POST /api/impairment/bulk
 */
export const bulkGetProfiles = async (req, res) => {
  try {
    const { user_ids } = req.body;

    if (!user_ids || !Array.isArray(user_ids)) {
      return res.status(400).json({
        success: false,
        error: 'user_ids array is required',
      });
    }

    const profiles = await ImpairmentProfile.find({ user_id: { $in: user_ids } });

    res.json({
      success: true,
      data: profiles,
    });
  } catch (error) {
    logger.error('Error bulk fetching profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profiles',
    });
  }
};
