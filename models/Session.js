import mongoose from 'mongoose';

/**
 * SessionMeta - ML-Ready Session Metadata
 * 
 * This schema stores all session-level information needed for ML training:
 * - Device capabilities and constraints
 * - Game configuration and versioning
 * - Performance quality metrics
 * - Demographics (privacy-preserving)
 */

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  // User-provided identifier (nickname/alias from intro popup)
  // Must be unique - each user gets one userId forever
  userId: {
    type: String,
    unique: true,
    sparse: true, // Allow null but enforce uniqueness for non-null values
    index: true,
  },
  
  // Anonymized stable participant identifier (NOT userId/email)
  participantId: {
    type: String,
    required: true,
    index: true,
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active',
    index: true,
  },
  
  // ===== Legacy device info (kept for backwards compatibility) =====
  userAgent: String,
  screenResolution: {
    width: Number,
    height: Number,
  },
  deviceType: String,
  preferredTheme: String,
  viewportWidth: Number,
  viewportHeight: Number,
  highContrastMode: Boolean,
  reducedMotionPreference: Boolean,
  devicePixelRatio: Number,
  hardwareConcurrency: Number,
  pageLoadTime: Number,
  connectionType: String,
  memory: Number,
  platform: String,
  language: String,
  
  // ===== NEW: Normalized device block (helps ML + reduces ambiguity) =====
  device: {
    pointerPrimary: {
      type: String,
      enum: ['mouse', 'touchpad', 'touch', 'pen', 'unknown'],
      default: 'unknown',
      index: true,
    },
    os: String,
    browser: String,
  },
  
  screen: {
    width: Number,
    height: Number,
    dpr: Number,
  },
  
  // ===== NEW: Game + metrics versioning =====
  game: {
    gameVersion: { type: String, required: true },      // e.g., "1.2.0"
    metricsVersion: { type: String, required: true },   // e.g., "ms-v3"
    difficultyPreset: { type: String },                 // "baseline" / "hard"
    roundCount: { type: Number, default: 3 },
    columns: { type: Number, default: 5 },
    
    // Needed for Fitts + normalization
    bubbleRadiusPx: { type: Number, required: true },
    bubbleTTLms: { type: Number, required: true },
    
    spawnRate: Number, // optional
  },
  
  // ===== NEW: Performance quality signals (prevents "slow PC" == impaired) =====
  perf: {
    samplingHzTarget: { type: Number, default: 60 },
    samplingHzEstimated: Number,
    avgFrameMs: Number,
    p95FrameMs: Number,
    droppedFrames: Number,
    inputLagMsEstimate: Number,
  },
  
  // ===== Demographics (privacy-preserving) =====
  userInfo: {
    age: { 
      type: Number, 
      min: 18, 
      max: 120 
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    },
    
    // Recommended: store ageBucket instead of exact age for privacy
    ageBucket: {
      type: String,
      enum: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'unknown'],
      default: 'unknown',
      index: true,
    },
  },
  
  completedModules: [{
    moduleName: String,
    completedAt: Date,
  }],
});

// TTL Strategy: SessionMeta kept longer than raw interaction buckets
// Keep sessions for 1 year (for longitudinal analysis)
// Raw buckets have separate 90-day TTL
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 }); // 365 days

// Virtual fields to get all interaction buckets for this session
sessionSchema.virtual('motorPointerTraces', {
  ref: 'MotorPointerTraceBucket',
  localField: 'sessionId',
  foreignField: 'sessionId',
});

sessionSchema.virtual('motorAttempts', {
  ref: 'MotorAttemptBucket',
  localField: 'sessionId',
  foreignField: 'sessionId',
});

// Method to get motor pointer traces for this session
sessionSchema.methods.getMotorPointerTraces = async function(round = null) {
  const MotorPointerTraceBucket = mongoose.model('MotorPointerTraceBucket');
  return await MotorPointerTraceBucket.getSessionSamples(this.sessionId, round);
};

// Method to get motor attempts for this session
sessionSchema.methods.getMotorAttempts = async function(round = null) {
  const MotorAttemptBucket = mongoose.model('MotorAttemptBucket');
  return await MotorAttemptBucket.getSessionAttempts(this.sessionId, round);
};

// Method to get motor attempt statistics
sessionSchema.methods.getMotorStats = async function() {
  const MotorAttemptBucket = mongoose.model('MotorAttemptBucket');
  return await MotorAttemptBucket.getSessionStats(this.sessionId);
};

// Method to delete all associated interaction buckets
sessionSchema.methods.deleteAllBuckets = async function() {
  const MotorPointerTraceBucket = mongoose.model('MotorPointerTraceBucket');
  const MotorAttemptBucket = mongoose.model('MotorAttemptBucket');
  
  const results = await Promise.all([
    MotorPointerTraceBucket.deleteMany({ sessionId: this.sessionId }),
    MotorAttemptBucket.deleteMany({ sessionId: this.sessionId }),
  ]);
  
  return {
    motorPointerTraces: results[0].deletedCount,
    motorAttempts: results[1].deletedCount,
    total: results.reduce((sum, r) => sum + r.deletedCount, 0),
  };
};

// Pre-remove hook to clean up associated buckets and summaries
sessionSchema.pre('remove', async function(next) {
  try {
    // Delete all bucket types
    const MotorPointerTraceBucket = mongoose.model('MotorPointerTraceBucket');
    const MotorAttemptBucket = mongoose.model('MotorAttemptBucket');
    
    await Promise.all([
      MotorPointerTraceBucket.deleteMany({ sessionId: this.sessionId }),
      MotorAttemptBucket.deleteMany({ sessionId: this.sessionId }),
    ]);
    
    // Delete summaries
    const { MotorRoundSummary, MotorSessionSummary } = await import('./MotorSummary.js');
    await Promise.all([
      MotorRoundSummary.deleteMany({ sessionId: this.sessionId }),
      MotorSessionSummary.deleteMany({ sessionId: this.sessionId }),
    ]);
    
    next();
  } catch (error) {
    next(error);
  }
});

// Enable virtuals in JSON and Object outputs
sessionSchema.set('toJSON', { virtuals: true });
sessionSchema.set('toObject', { virtuals: true });

const Session = mongoose.model('Session', sessionSchema);

export default Session;

