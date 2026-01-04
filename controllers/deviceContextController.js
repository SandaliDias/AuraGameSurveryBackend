import DeviceContext from '../models/DeviceContext.js';
import { logger } from '../services/logging/logger.js';

/**
 * Save device context
 * POST /api/device-context
 * 
 * user_id is the primary key - one record per user
 * Updates existing record if user has one, creates new if not
 */
export const saveDeviceContext = async (req, res) => {
  try {
    const {
      user_id,
      session_id,
      captured_at,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
    } = req.body;

    // Validate required fields
    if (!user_id || !session_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and session_id are required',
      });
    }

    if (!viewportWidth || !viewportHeight) {
      return res.status(400).json({
        success: false,
        error: 'viewportWidth and viewportHeight are required',
      });
    }

    // Upsert by user_id (one record per user)
    const deviceContext = await DeviceContext.findOneAndUpdate(
      { user_id },
      {
        user_id,
        session_id,
        captured_at: captured_at ? new Date(captured_at) : new Date(),
        viewportWidth,
        viewportHeight,
        devicePixelRatio: devicePixelRatio || 1,
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info(`Device context saved: user=${user_id}, session=${session_id}`);

    res.status(201).json({
      success: true,
      data: deviceContext,
    });
  } catch (error) {
    logger.error('Error saving device context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save device context',
    });
  }
};

/**
 * Get device context for a user
 * GET /api/device-context/user/:userId
 */
export const getDeviceContext = async (req, res) => {
  try {
    const { userId } = req.params;

    const deviceContext = await DeviceContext.findOne({ user_id: userId });

    if (!deviceContext) {
      return res.status(404).json({
        success: false,
        error: 'Device context not found for this user',
      });
    }

    res.json({
      success: true,
      data: deviceContext,
    });
  } catch (error) {
    logger.error('Error fetching device context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device context',
    });
  }
};

/**
 * Get device context by session ID
 * GET /api/device-context/session/:sessionId
 */
export const getDeviceContextBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const deviceContext = await DeviceContext.findOne({ session_id: sessionId });

    if (!deviceContext) {
      return res.status(404).json({
        success: false,
        error: 'Device context not found for this session',
      });
    }

    res.json({
      success: true,
      data: deviceContext,
    });
  } catch (error) {
    logger.error('Error fetching device context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device context',
    });
  }
};

/**
 * Delete device context for a user
 * DELETE /api/device-context/user/:userId
 */
export const deleteDeviceContext = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await DeviceContext.findOneAndDelete({ user_id: userId });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Device context not found',
      });
    }

    res.json({
      success: true,
      message: 'Device context deleted',
    });
  } catch (error) {
    logger.error('Error deleting device context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete device context',
    });
  }
};

/**
 * Bulk get device contexts
 * POST /api/device-context/bulk
 */
export const bulkGetDeviceContexts = async (req, res) => {
  try {
    const { user_ids } = req.body;

    if (!user_ids || !Array.isArray(user_ids)) {
      return res.status(400).json({
        success: false,
        error: 'user_ids array is required',
      });
    }

    const deviceContexts = await DeviceContext.find({ user_id: { $in: user_ids } });

    res.json({
      success: true,
      data: deviceContexts,
    });
  } catch (error) {
    logger.error('Error bulk fetching device contexts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device contexts',
    });
  }
};

