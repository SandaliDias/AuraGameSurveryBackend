import mongoose from 'mongoose';

const colorBlindnessPlateSchema = new mongoose.Schema({
  plateId: {
    type: Number,
    required: true,
  },
  imageName: String,
  userAnswer: {
    type: String, // Can be number or "nothing"
    required: true,
  },
  responseTime: Number, // milliseconds
  isCorrect: Boolean,
  interactions: [{
    eventType: String,
    timestamp: Date,
  }],
}, { _id: false });

const visualAcuityAttemptSchema = new mongoose.Schema({
  level: Number,
  size: {
    type: Number,
    required: true,
  },
  number: Number,
  userAnswer: Number,
  isCorrect: Boolean,
  responseTime: Number,
  attemptNumber: Number, // 1 or 2 (for retry)
}, { _id: false });

const visionResultSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    index: true,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Color Blindness Test Results
  colorBlindness: {
    plates: [colorBlindnessPlateSchema],
    
    // Decimal score (0.0 to 1.0) - PRIMARY
    colorVisionScore: {
      type: Number,
      min: 0,
      max: 1,
    },
    
    // Legacy percentage score (0-100)
    colorVisionPercent: Number,
    
    diagnosis: {
      type: String,
      enum: ['Normal', 'Suspected Red-Green Deficiency', 'Suspected Color Deficiency', 'Inconclusive'],
    },
    
    // Category
    colorVisionCategory: {
      type: String,
      enum: ['normal', 'mild', 'moderate', 'significant'],
    },
    
    // Counts
    normalVisionCount: Number,
    colorBlindCount: Number,
    totalPlates: Number,
    
    // Timing
    totalResponseTime: Number,
    averageResponseTime: Number,
  },
  
  // Visual Acuity Test Results
  visualAcuity: {
    attempts: [visualAcuityAttemptSchema],
    
    // Final level achieved (1-7, where 7 = 20/20)
    finalLevel: Number,
    
    // Size metrics
    finalResolvedSize: Number, // in pixels
    twentyTwentyThreshold: Number, // 20/20 pixel size for this screen
    
    // Angle metrics
    visualAngle: Number, // in degrees
    mar: Number, // Minimum Angle of Resolution
    
    // Snellen notation
    snellenDenominator: Number,
    snellenEstimate: String, // e.g., "20/40"
    
    // Decimal scores (0.0 to 1.0+) - PRIMARY
    visualAcuityDecimal: {
      type: Number,
      min: 0,
      // Can be > 1.0 for better than 20/20 vision
    },
    
    // Vision loss as decimal (0.0 = no loss, 1.0 = total loss)
    visionLoss: {
      type: Number,
      min: 0,
      max: 1,
    },
    
    // Vision category
    visionCategory: {
      type: String,
      enum: ['normal', 'mild', 'moderate', 'severe', 'profound'],
    },
    visionCategoryName: String,
    
    // Screen calibration info
    screenCalibration: {
      ppi: Number,
      estimatedDiagonal: Number,
      sizes: [Number], // Array of test sizes used
    },
    
    // Rating
    visionRating: String, // e.g., "20/20 (Perfect)"
    isPerfectVision: Boolean,
    
    // Timing
    totalResponseTime: Number,
    viewingDistanceCM: Number,
  },
  
  // Metadata
  testConditions: {
    screenSize: {
      width: Number,
      height: Number,
    },
    devicePixelRatio: Number,
    viewingDistance: Number, 
    brightness: Number,
    timeOfDay: String,
    distanceCalibrated: Boolean,
  },
});

// Auto-expire results after 1 year
visionResultSchema.index({ completedAt: 1 }, { expireAfterSeconds: 31536000 });

export default mongoose.model('VisionResult', visionResultSchema);
