import mongoose from 'mongoose';

/**
 * Motor Summary Models - ML Training Records
 * 
 * These collections store derived features ready for ML training.
 * NOT bucketed (one document per round/session).
 * Kept longer than raw data (no TTL or longer TTL).
 */

// ===== MotorRoundSummary =====
// Stores aggregated features for each round

const motorRoundSummarySchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    required: true, 
    index: true,
    ref: 'Session',
  },
  userId: {
    type: String,
    index: true,
  },
  participantId: { 
    type: String, 
    required: true, 
    index: true 
  },
  round: { 
    type: Number, 
    min: 1, 
    max: 3, 
    required: true,
    index: true,
  },
  
  // ===== Counts and basic metrics =====
  counts: {
    nTargets: Number,
    nHits: Number,
    nMisses: Number,
    hitRate: Number,
  },
  
  // ===== Aggregated features =====
  // Store as flexible object to allow different feature sets
  features: mongoose.Schema.Types.Mixed,
  
  // Feature version for tracking
  featureVersion: {
    type: String,
    default: 'v1',
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
}, { 
  timestamps: true,
  strict: true,
});

// Compound unique index
motorRoundSummarySchema.index({ sessionId: 1, round: 1 }, { unique: true });

// Index for ML training queries
motorRoundSummarySchema.index({ participantId: 1, createdAt: 1 });

// NO TTL - keep for research/training
// Optional: Add longer TTL if ethics requires
// motorRoundSummarySchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

export const MotorRoundSummary = mongoose.model('MotorRoundSummary', motorRoundSummarySchema);

// ===== MotorSessionSummary =====
// Stores overall session features and labels

const motorSessionSummarySchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    ref: 'Session',
  },
  userId: {
    type: String,
    index: true,
  },
  participantId: { 
    type: String, 
    required: true, 
    index: true 
  },
  
  // ===== Aggregated features across all rounds =====
  features: mongoose.Schema.Types.Mixed,
  
  // Feature version for tracking
  featureVersion: {
    type: String,
    default: 'v1',
  },
  
  // ===== Label (for supervised learning) =====
  label: {
    level: { 
      type: String, 
      enum: ['normal', 'mild', 'moderate', 'severe', 'unknown'], 
      index: true,
      default: 'unknown',
    },
    score: Number,
    source: { 
      type: String, 
      enum: ['self_report', 'percentile', 'clinician', 'hybrid', 'none'], 
      default: 'none',
    },
    version: Number,
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
}, { 
  timestamps: true,
  strict: true,
});

// Index for ML training queries
motorSessionSummarySchema.index({ participantId: 1, createdAt: 1 });
motorSessionSummarySchema.index({ 'label.level': 1 }); // For stratified sampling

// NO TTL - keep for research/training
// Optional: Add longer TTL if ethics requires
// motorSessionSummarySchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

export const MotorSessionSummary = mongoose.model('MotorSessionSummary', motorSessionSummarySchema);

// Helper function to compute features from attempts
export async function computeRoundFeatures(sessionId, round) {
  const MotorAttemptBucket = mongoose.model('MotorAttemptBucket');
  const attempts = await MotorAttemptBucket.getSessionAttempts(sessionId, round);
  
  if (attempts.length === 0) {
    return null;
  }
  
  const hits = attempts.filter(a => a.click.hit);
  const misses = attempts.filter(a => !a.click.hit);
  
  // Aggregate timing features
  const reactionTimes = attempts.map(a => a.timing.reactionTimeMs).filter(v => v != null);
  const movementTimes = hits.map(a => a.timing.movementTimeMs).filter(v => v != null);
  const interTapTimes = attempts.map(a => a.timing.interTapMs).filter(v => v != null);
  
  // Aggregate spatial features (hits only)
  const errorDists = hits.map(a => a.spatial.errorDistNorm).filter(v => v != null);
  const pathLengths = hits.map(a => a.spatial.pathLengthNorm).filter(v => v != null);
  const straightness = hits.map(a => a.spatial.straightness).filter(v => v != null);
  
  // Aggregate kinematic features (hits only)
  const meanSpeeds = hits.map(a => a.kinematics.meanSpeed).filter(v => v != null);
  const peakSpeeds = hits.map(a => a.kinematics.peakSpeed).filter(v => v != null);
  const jerkRMS = hits.map(a => a.kinematics.jerkRMS).filter(v => v != null);
  const submovements = hits.map(a => a.kinematics.submovementCount).filter(v => v != null);
  const overshoots = hits.map(a => a.kinematics.overshootCount).filter(v => v != null);
  
  // Aggregate Fitts features (hits only)
  const throughputs = hits.map(a => a.fitts.throughput).filter(v => v != null);
  const IDs = hits.map(a => a.fitts.ID).filter(v => v != null);
  
  // Helper functions
  const mean = arr => arr.length > 0 ? arr.reduce((a,b) => a+b, 0) / arr.length : null;
  const std = arr => {
    if (arr.length < 2) return null;
    const m = mean(arr);
    const variance = arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };
  const median = arr => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a,b) => a-b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid];
  };
  
  return {
    // Timing
    reactionTime_mean: mean(reactionTimes),
    reactionTime_std: std(reactionTimes),
    reactionTime_median: median(reactionTimes),
    movementTime_mean: mean(movementTimes),
    movementTime_std: std(movementTimes),
    movementTime_median: median(movementTimes),
    interTapTime_mean: mean(interTapTimes),
    interTapTime_std: std(interTapTimes),
    
    // Spatial
    errorDist_mean: mean(errorDists),
    errorDist_std: std(errorDists),
    pathLength_mean: mean(pathLengths),
    straightness_mean: mean(straightness),
    straightness_std: std(straightness),
    
    // Kinematics
    meanSpeed_mean: mean(meanSpeeds),
    peakSpeed_mean: mean(peakSpeeds),
    jerkRMS_mean: mean(jerkRMS),
    jerkRMS_std: std(jerkRMS),
    submovementCount_mean: mean(submovements),
    submovementCount_std: std(submovements),
    overshootCount_mean: mean(overshoots),
    overshootCount_std: std(overshoots),
    
    // Fitts
    throughput_mean: mean(throughputs),
    throughput_std: std(throughputs),
    ID_mean: mean(IDs),
    
    // Counts
    nAttempts: attempts.length,
    nHits: hits.length,
    nMisses: misses.length,
    hitRate: attempts.length > 0 ? hits.length / attempts.length : 0,
  };
}

// Helper function to compute session-level features
export async function computeSessionFeatures(sessionId) {
  const features1 = await computeRoundFeatures(sessionId, 1);
  const features2 = await computeRoundFeatures(sessionId, 2);
  const features3 = await computeRoundFeatures(sessionId, 3);
  
  // Combine all rounds
  const allFeatures = {};
  
  // Per-round features
  for (let r = 1; r <= 3; r++) {
    const rf = [features1, features2, features3][r-1];
    if (rf) {
      for (const [key, value] of Object.entries(rf)) {
        allFeatures[`r${r}_${key}`] = value;
      }
    }
  }
  
  // Cross-round features (trends)
  // E.g., does performance improve/degrade across rounds?
  const hitRates = [features1?.hitRate, features2?.hitRate, features3?.hitRate].filter(v => v != null);
  if (hitRates.length > 1) {
    allFeatures.hitRate_trend = hitRates[hitRates.length - 1] - hitRates[0];
  }
  
  const throughputs = [features1?.throughput_mean, features2?.throughput_mean, features3?.throughput_mean].filter(v => v != null);
  if (throughputs.length > 1) {
    allFeatures.throughput_trend = throughputs[throughputs.length - 1] - throughputs[0];
  }
  
  return allFeatures;
}

export default {
  MotorRoundSummary,
  MotorSessionSummary,
  computeRoundFeatures,
  computeSessionFeatures,
};


