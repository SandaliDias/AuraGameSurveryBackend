import mongoose from 'mongoose';

/**
 * MotorAttemptBucket - Bucketed Attempt-Level Features
 * 
 * Stores one record per bubble attempt with computed features.
 * This is the PRIMARY collection for ML training.
 * 
 * Each attempt includes:
 * - Target properties (spawn, position, size)
 * - Click outcome (hit/miss, position, timing)
 * - Derived features (kinematics, spatial, Fitts)
 */

const MAX_ATTEMPTS_PER_BUCKET = 2000;

const motorAttemptSchema = new mongoose.Schema({
  round: { 
    type: Number, 
    min: 1, 
    max: 3, 
    required: true,
    index: true,
  },
  attemptId: { 
    type: String, 
    required: true 
  }, // unique within session
  bubbleId: { 
    type: String, 
    required: true 
  },
  
  // ===== Target properties =====
  spawnTms: { 
    type: Number, 
    required: true 
  },
  despawnTms: { type: Number }, // if timed out
  ttlMs: { type: Number },       // bubble lifetime
  column: Number,
  speedNorm: Number,             // normalized speed
  
  target: {
    x: { type: Number, required: true },        // xNorm (0..1)
    y: { type: Number, required: true },        // yNorm (0..1)
    radius: { type: Number, required: true },   // radiusNorm
  },
  
  // ===== Input outcome =====
  click: {
    clicked: { type: Boolean, default: false },
    hit: { type: Boolean, default: false },
    missType: { 
      type: String, 
      enum: ['hit', 'bubble_miss', 'stage_miss', 'timeout', 'unknown'], 
      default: 'unknown' 
    },
    tms: Number,
    x: Number, // xNorm
    y: Number, // yNorm
  },
  
  // ===== Derived timing =====
  timing: {
    reactionTimeMs: Number,  // spawn -> first click attempt
    movementTimeMs: Number,  // first movement after spawn -> click
    interTapMs: Number,      // previous click -> this click
  },
  
  // ===== Derived geometry =====
  spatial: {
    errorDistNorm: Number,    // distance(click, target)/radius
    pathLengthNorm: Number,   // sum step lengths
    directDistNorm: Number,   // distance(start, target)
    straightness: Number,     // direct/path
  },
  
  // ===== Derived kinematics =====
  kinematics: {
    meanSpeed: Number,
    peakSpeed: Number,
    speedVar: Number,
    meanAccel: Number,
    peakAccel: Number,
    jerkRMS: Number,
    submovementCount: Number,
    overshootCount: Number,
  },
  
  // ===== Fitts' law =====
  fitts: {
    D: Number,          // directDistNorm
    W: Number,          // target diameter norm (2*radius)
    ID: Number,         // log2(D/W + 1)
    throughput: Number, // ID / movementTimeSeconds
  },
}, { _id: false });

const motorAttemptBucketSchema = new mongoose.Schema({
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
  
  bucketNumber: { 
    type: Number, 
    required: true, 
    default: 1 
  },
  
  count: { 
    type: Number, 
    default: 0 
  },
  
  isFull: { 
    type: Boolean, 
    default: false 
  },
  
  attempts: { 
    type: [motorAttemptSchema], 
    default: [] 
  },
}, { 
  timestamps: true,
  strict: true,
});

// Indexes for efficient bucket lookup
motorAttemptBucketSchema.index({ sessionId: 1, bucketNumber: 1 });
motorAttemptBucketSchema.index({ sessionId: 1, isFull: 1 });

// TTL: Raw attempt data expires after 90 days
motorAttemptBucketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Pre-save validation
motorAttemptBucketSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('sessionId')) {
    const Session = mongoose.model('Session');
    const sessionExists = await Session.findOne({ sessionId: this.sessionId });
    
    if (!sessionExists) {
      const error = new Error(`Session with sessionId "${this.sessionId}" does not exist.`);
      error.name = 'SessionValidationError';
      return next(error);
    }
  }
  next();
});

// Static method to add attempts to appropriate bucket
motorAttemptBucketSchema.statics.addAttempts = async function(sessionId, userId, attemptsArray) {
  if (!Array.isArray(attemptsArray) || attemptsArray.length === 0) {
    throw new Error('attemptsArray must be a non-empty array');
  }
  
  // Validate session exists
  const Session = mongoose.model('Session');
  const session = await Session.findOne({ sessionId });
  
  if (!session) {
    throw new Error(`Session with sessionId "${sessionId}" does not exist.`);
  }
  
  // Get pointer samples for kinematics/Fitts computation
  const MotorPointerTraceBucket = mongoose.model('MotorPointerTraceBucket');
  const allSamples = await MotorPointerTraceBucket.getSessionSamples(sessionId);
  
  // Import feature extraction utility
  const { extractAttemptFeatures } = await import('../utils/featureExtraction.js');
  
  // Enrich attempts with kinematics and Fitts' Law features
  const enrichedAttempts = attemptsArray.map((attempt, idx) => {
    // Get previous click time for inter-tap interval
    const prevClickTms = idx > 0 ? attemptsArray[idx - 1].click?.tms : null;
    
    // Try to compute full kinematics from pointer samples
    let features = {};
    
    if (allSamples.length > 0 && attempt.click?.clicked) {
      try {
        features = extractAttemptFeatures({
          samples: allSamples,
          spawnTms: attempt.spawnTms,
          clickTms: attempt.click.tms,
          target: attempt.target,
          prevClickTms,
        });
        
      } catch (err) {
        console.error(`⚠️ Error extracting features for attempt ${attempt.attemptId}:`, err.message);
        // Fall back to basic features
        features = buildBasicFeatures(attempt, prevClickTms);
      }
    } else {
      // No pointer samples or missed bubble - use basic features
      features = buildBasicFeatures(attempt, prevClickTms);
    }
    
    // Merge attempt with computed features
    return {
      ...attempt,
      ...features,
    };
  });
  
  // Helper function to build basic features when pointer samples aren't available
  function buildBasicFeatures(attempt, prevClickTms) {
    let reactionTimeMs = null;
    if (attempt.timing?.reactionTimeMs !== undefined && attempt.timing?.reactionTimeMs !== null) {
      reactionTimeMs = attempt.timing.reactionTimeMs;
    } else if (attempt.click?.clicked && attempt.click?.tms && attempt.spawnTms) {
      reactionTimeMs = attempt.click.tms - attempt.spawnTms;
    }
    
    const interTapMs = (prevClickTms && attempt.click?.tms) 
      ? attempt.click.tms - prevClickTms 
      : null;
    
    const errorDistNorm = attempt.spatial?.errorDistNorm !== undefined && attempt.spatial?.errorDistNorm !== null
      ? attempt.spatial.errorDistNorm
      : null;
    
    return {
      timing: {
        reactionTimeMs,
        movementTimeMs: null,
        interTapMs,
      },
      spatial: {
        errorDistNorm,
      },
      kinematics: {},
      fitts: {},
    };
  }
  
  // Find current active bucket
  let bucket = await this.findOne({
    sessionId,
    isFull: false,
  }).sort({ bucketNumber: -1 });
  
  // Create new bucket if needed
  if (!bucket) {
    bucket = await this.create({
      sessionId,
      userId,
      bucketNumber: 1,
      count: 0,
      attempts: [],
    });
  } else if (userId && !bucket.userId) {
    // Update userId if not set
    bucket.userId = userId;
  }
  
  // Add enriched attempts, creating new buckets as needed
  for (const attempt of enrichedAttempts) {
    // Check if current bucket is full
    if (bucket.count >= MAX_ATTEMPTS_PER_BUCKET) {
      bucket.isFull = true;
      await bucket.save();
      
      // Create new bucket
      bucket = await this.create({
        sessionId,
        userId,
        bucketNumber: bucket.bucketNumber + 1,
        count: 0,
        attempts: [],
      });
    }
    
    // Add enriched attempt
    bucket.attempts.push(attempt);
    bucket.count = bucket.attempts.length;
  }
  
  await bucket.save();
  return bucket;
};

// Static method to get all attempts for a session
motorAttemptBucketSchema.statics.getSessionAttempts = async function(sessionId, round = null) {
  const buckets = await this.find({ sessionId }).sort({ bucketNumber: 1 });
  
  // Flatten all attempts from all buckets
  const allAttempts = [];
  for (const bucket of buckets) {
    if (round !== null) {
      // Filter by round
      allAttempts.push(...bucket.attempts.filter(a => a.round === round));
    } else {
      allAttempts.push(...bucket.attempts);
    }
  }
  
  return allAttempts;
};

// Static method to get attempt statistics
motorAttemptBucketSchema.statics.getSessionStats = async function(sessionId) {
  const allAttempts = await this.getSessionAttempts(sessionId);
  
  const byRound = {
    1: allAttempts.filter(a => a.round === 1),
    2: allAttempts.filter(a => a.round === 2),
    3: allAttempts.filter(a => a.round === 3),
  };
  
  const stats = {
    sessionId,
    total: allAttempts.length,
    rounds: {},
  };
  
  for (const [round, attempts] of Object.entries(byRound)) {
    const hits = attempts.filter(a => a.click.hit);
    stats.rounds[round] = {
      totalAttempts: attempts.length,
      hits: hits.length,
      misses: attempts.length - hits.length,
      hitRate: attempts.length > 0 ? (hits.length / attempts.length) : 0,
      avgReactionTime: attempts.length > 0 
        ? attempts.reduce((sum, a) => sum + (a.timing.reactionTimeMs || 0), 0) / attempts.length
        : null,
      avgMovementTime: attempts.length > 0
        ? attempts.reduce((sum, a) => sum + (a.timing.movementTimeMs || 0), 0) / attempts.length
        : null,
      avgThroughput: hits.length > 0
        ? hits.reduce((sum, a) => sum + (a.fitts.throughput || 0), 0) / hits.length
        : null,
    };
  }
  
  return stats;
};

const MotorAttemptBucket = mongoose.model('MotorAttemptBucket', motorAttemptBucketSchema);

export default MotorAttemptBucket;


