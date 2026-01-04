import VisionResult from '../models/VisionResult.js';
import LiteracyResult from '../models/LiteracyResult.js';
import Session from '../models/Session.js';
import { logger } from '../services/logging/logger.js';

// Save vision test results
export const saveVisionResults = async (req, res) => {
  try {
    const { sessionId, userId, colorBlindness, visualAcuity, testConditions } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID is required' 
      });
    }

    // Check if results already exist
    let visionResult = await VisionResult.findOne({ sessionId });
    
    if (visionResult) {
      // Update existing results
      if (userId) visionResult.userId = userId;
      if (colorBlindness) visionResult.colorBlindness = colorBlindness;
      if (visualAcuity) visionResult.visualAcuity = visualAcuity;
      if (testConditions) visionResult.testConditions = testConditions;
      visionResult.completedAt = new Date();
      
      await visionResult.save();
    } else {
      // Create new results
      visionResult = new VisionResult({
        sessionId,
        userId,
        colorBlindness,
        visualAcuity,
        testConditions,
      });
      
      await visionResult.save();
    }

    // Update session
    await Session.findOneAndUpdate(
      { sessionId },
      { 
        $addToSet: { 
          completedModules: { 
            moduleName: 'vision', 
            completedAt: new Date() 
          } 
        } 
      },
      { upsert: true }
    );

    logger.info(`Vision results saved for session ${sessionId}`);

    res.status(201).json({ 
      success: true, 
      message: 'Vision results saved',
      data: visionResult 
    });
  } catch (error) {
    logger.error('Error saving vision results:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save vision results' 
    });
  }
};

// Save literacy test results
export const saveLiteracyResults = async (req, res) => {
  try {
    const { 
      sessionId,
      userId,
      responses, 
      score, // Decimal score (0.0 - 1.0)
      correctAnswers,
      totalQuestions,
      categoryScores 
    } = req.body;

    // Validate required fields
    if (!sessionId || !responses) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID and responses are required' 
      });
    }

    // Create new results with simplified schema
    const literacyResult = new LiteracyResult({
      sessionId,
      userId,
      responses,
      score, // Decimal score
      correctAnswers,
      totalQuestions,
      categoryScores,
    });
    
    await literacyResult.save();

    // Update session
    await Session.findOneAndUpdate(
      { sessionId },
      { 
        $addToSet: { 
          completedModules: { 
            moduleName: 'literacy', 
            completedAt: new Date() 
          } 
        } 
      },
      { upsert: true }
    );

    logger.info(`Literacy results saved for session ${sessionId}`);

    res.status(201).json({ 
      success: true, 
      message: 'Literacy results saved',
      data: literacyResult 
    });
  } catch (error) {
    logger.error('Error saving literacy results:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save literacy results' 
    });
  }
};

// Get all results for a session
export const getSessionResults = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const [session, visionResult, literacyResult] = await Promise.all([
      Session.findOne({ sessionId }),
      VisionResult.findOne({ sessionId }),
      LiteracyResult.findOne({ sessionId }),
    ]);

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }

    res.json({ 
      success: true, 
      data: {
        session,
        visionResult,
        literacyResult,
      }
    });
  } catch (error) {
    logger.error('Error fetching session results:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch results' 
    });
  }
};

// Update module completion
export const updateModuleCompletion = async (req, res) => {
  try {
    const { sessionId, moduleName } = req.body;

    if (!sessionId || !moduleName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID and module name are required' 
      });
    }

    // Use upsert to create session if it doesn't exist
    const session = await Session.findOneAndUpdate(
      { sessionId },
      { 
        $addToSet: { 
          completedModules: { 
            moduleName, 
            completedAt: new Date() 
          } 
        },
        $setOnInsert: {
          participantId: `participant_${sessionId.split('_')[1] || Date.now()}`,
          createdAt: new Date(),
          status: 'active',
        }
      },
      { new: true, upsert: true }
    );

    logger.info(`Module completed: ${moduleName} for session ${sessionId}`);

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Error updating module completion:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update module completion' 
    });
  }
};

// Update session performance metrics
export const updateSessionPerformance = async (req, res) => {
  try {
    const { sessionId, perf } = req.body;

    if (!sessionId || !perf) {
      return res.status(400).json({ 
        success: false, 
        error: 'Session ID and performance metrics are required' 
      });
    }

    const session = await Session.findOneAndUpdate(
      { sessionId },
      { 
        perf: {
          samplingHzTarget: perf.samplingHzTarget || 60,
          samplingHzEstimated: perf.samplingHzEstimated,
          avgFrameMs: perf.avgFrameMs,
          p95FrameMs: perf.p95FrameMs,
          droppedFrames: perf.droppedFrames,
          inputLagMsEstimate: perf.inputLagMsEstimate,
        }
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }

    logger.info(`Performance metrics updated for session ${sessionId}`, perf);

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Error updating session performance:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update session performance' 
    });
  }
};

// Check if userId already exists
export const checkUserIdExists = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'User ID must be at least 2 characters',
      });
    }

    const existingSession = await Session.findOne({ userId: userId.trim() });

    res.json({
      success: true,
      exists: !!existingSession,
      userId: userId.trim(),
    });
  } catch (error) {
    logger.error('Error checking userId:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check user ID',
    });
  }
};

// Generate a unique userId suggestion
export const suggestUserId = async (req, res) => {
  try {
    const { baseId } = req.query;
    
    let suggestion;
    let attempts = 0;
    const maxAttempts = 10;
    
    // Generate suggestions based on baseId or random
    while (attempts < maxAttempts) {
      if (baseId && baseId.trim().length >= 2) {
        // Add random suffix to base ID
        const suffix = Math.random().toString(36).slice(2, 6);
        suggestion = `${baseId.trim()}_${suffix}`;
      } else {
        // Generate completely random ID
        const prefix = ['user', 'player', 'test'][Math.floor(Math.random() * 3)];
        const suffix = Math.random().toString(36).slice(2, 8);
        suggestion = `${prefix}_${suffix}`;
      }
      
      // Check if this suggestion is unique
      const exists = await Session.findOne({ userId: suggestion });
      if (!exists) {
        break;
      }
      attempts++;
    }

    res.json({
      success: true,
      suggestion,
    });
  } catch (error) {
    logger.error('Error generating userId suggestion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate suggestion',
    });
  }
};

// Helper: Compute age bucket from age
function computeAgeBucket(age) {
  if (!age || age < 18) return 'unknown';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
}

// Create or update session
export const createSession = async (req, res) => {
  try {
    const { 
      sessionId,
      userId, // User's anonymous ID
      userAgent, 
      screenResolution, 
      deviceType,
      preferredTheme,
      viewportWidth,
      viewportHeight,
      highContrastMode,
      reducedMotionPreference,
      devicePixelRatio,
      hardwareConcurrency,
      pageLoadTime,
      connectionType,
      memory,
      platform,
      language,
      // ML-ready normalized fields
      device,
      screen,
      userInfo 
    } = req.body;

    // Validate userInfo
    if (!userInfo || !userInfo.age || !userInfo.gender) {
      return res.status(400).json({ 
        success: false, 
        error: 'User information (age and gender) is required' 
      });
    }

    // Generate participantId (anonymized hash based on session)
    const participantId = `participant_${sessionId.split('_')[1] || Date.now()}`;

    const session = await Session.findOneAndUpdate(
      { sessionId },
      { 
        sessionId,
        userId, // Save the user ID
        participantId,
        // Basic device info (legacy)
        userAgent,
        screenResolution,
        deviceType,
        // Enhanced device metrics (legacy)
        preferredTheme,
        viewportWidth,
        viewportHeight,
        highContrastMode,
        reducedMotionPreference,
        devicePixelRatio,
        hardwareConcurrency,
        pageLoadTime,
        connectionType,
        memory,
        platform,
        language,
        // ML-ready normalized device block
        device: device ? {
          pointerPrimary: device.pointerPrimary || 'unknown',
          os: device.os || 'unknown',
          browser: device.browser || 'unknown',
        } : undefined,
        // ML-ready screen info
        screen: screen ? {
          width: screen.width,
          height: screen.height,
          dpr: screen.dpr || devicePixelRatio || 1,
        } : undefined,
        // User demographic info with ageBucket
        userInfo: {
          age: parseInt(userInfo.age),
          gender: userInfo.gender,
          ageBucket: computeAgeBucket(parseInt(userInfo.age)),
        },
        createdAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info(`Session created/updated: ${sessionId}`, { 
      userId,
      participantId,
      age: userInfo.age, 
      ageBucket: computeAgeBucket(parseInt(userInfo.age)),
      gender: userInfo.gender,
      deviceType,
      device: device ? `${device.os} / ${device.browser} / ${device.pointerPrimary}` : 'legacy',
      viewport: `${viewportWidth}x${viewportHeight}`
    });

    res.status(201).json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Error creating session:', error);
    
    // Handle duplicate key errors (userId already exists)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      if (duplicateField === 'userId') {
        return res.status(409).json({ 
          success: false, 
          error: 'This User ID is already taken. Please choose a different one.',
          code: 11000,
          field: 'userId'
        });
      }
      return res.status(409).json({ 
        success: false, 
        error: `Duplicate ${duplicateField} detected`,
        code: 11000,
        field: duplicateField
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user information provided',
        details: error.message
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create session' 
    });
  }
};

