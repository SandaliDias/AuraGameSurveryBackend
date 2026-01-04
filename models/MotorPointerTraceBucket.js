import mongoose from 'mongoose';

/**
 * MotorPointerTraceBucket - Bucketed Pointer Trace Storage
 * 
 * Stores downsampled pointer samples (30-60Hz) for motor skills assessment.
 * Used for:
 * - Movement trajectory analysis
 * - Velocity/acceleration profiles
 * - Tremor detection
 * - Kinematics computation
 * - Fitts' Law metrics
 */

const MAX_TRACE_SAMPLES_PER_BUCKET = 5000;

const pointerSampleSchema = new mongoose.Schema({
  round: { 
    type: Number, 
    min: 1, 
    max: 3, 
    required: true 
  },
  tms: { 
    type: Number, 
    required: true 
  }, // ms since epoch (absolute timestamp)
  x: { 
    type: Number, 
    required: true 
  },   // normalized 0..1
  y: { 
    type: Number, 
    required: true 
  },   // normalized 0..1
  isDown: { 
    type: Boolean, 
    default: false 
  },
  pointerType: { 
    type: String, 
    enum: ['mouse', 'touch', 'pen', 'unknown'], 
    default: 'mouse' 
  },
}, { _id: false });

const motorPointerTraceBucketSchema = new mongoose.Schema({
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
  
  firstTms: { 
    type: Number, 
    default: 0 
  },
  
  lastTms: { 
    type: Number, 
    default: 0 
  },
  
  samples: { 
    type: [pointerSampleSchema], 
    default: [] 
  },
}, { 
  timestamps: true,
  strict: true,
});

// Indexes for efficient bucket lookup
motorPointerTraceBucketSchema.index({ sessionId: 1, bucketNumber: 1 });
motorPointerTraceBucketSchema.index({ sessionId: 1, isFull: 1 });

// TTL: Raw trace data expires after 90 days
motorPointerTraceBucketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Pre-save validation
motorPointerTraceBucketSchema.pre('save', async function(next) {
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

// Static method to add pointer samples to appropriate bucket
motorPointerTraceBucketSchema.statics.addSamples = async function(sessionId, userId, samplesArray) {
  if (!Array.isArray(samplesArray) || samplesArray.length === 0) {
    throw new Error('samplesArray must be a non-empty array');
  }
  
  // Validate session exists
  const Session = mongoose.model('Session');
  const session = await Session.findOne({ sessionId });
  
  if (!session) {
    throw new Error(`Session with sessionId "${sessionId}" does not exist.`);
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
      samples: [],
    });
  } else if (userId && !bucket.userId) {
    // Update userId if not set
    bucket.userId = userId;
  }
  
  // Add samples, creating new buckets as needed
  for (const sample of samplesArray) {
    // Check if current bucket is full
    if (bucket.count >= MAX_TRACE_SAMPLES_PER_BUCKET) {
      bucket.isFull = true;
      await bucket.save();
      
      // Create new bucket
      bucket = await this.create({
        sessionId,
        userId,
        bucketNumber: bucket.bucketNumber + 1,
        count: 0,
        samples: [],
      });
    }
    
    // Add sample
    bucket.samples.push(sample);
    bucket.count = bucket.samples.length;
    
    // Update time range
    if (bucket.firstTms === 0) {
      bucket.firstTms = sample.tms;
    }
    bucket.lastTms = sample.tms;
  }
  
  await bucket.save();
  
  return bucket;
};

// Static method to get all samples for a session
motorPointerTraceBucketSchema.statics.getSessionSamples = async function(sessionId, round = null) {
  const buckets = await this.find({ sessionId }).sort({ bucketNumber: 1 });
  
  // Flatten all samples from all buckets
  const allSamples = [];
  for (const bucket of buckets) {
    if (round !== null) {
      // Filter by round
      allSamples.push(...bucket.samples.filter(s => s.round === round));
    } else {
      allSamples.push(...bucket.samples);
    }
  }
  
  return allSamples;
};

// Static method to get samples for a specific time range
motorPointerTraceBucketSchema.statics.getSamplesInRange = async function(sessionId, startTms, endTms, round = null) {
  const allSamples = await this.getSessionSamples(sessionId, round);
  return allSamples.filter(s => s.tms >= startTms && s.tms <= endTms);
};

const MotorPointerTraceBucket = mongoose.model('MotorPointerTraceBucket', motorPointerTraceBucketSchema);

export default MotorPointerTraceBucket;

