import mongoose from 'mongoose';

/**
 * Impairment Profile Schema
 * Stores computed impairment probabilities from assessments
 * EXACT match to research specification - no extra fields
 */

const impairmentProfileSchema = new mongoose.Schema({
  // Primary identifier - one profile per user
  user_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Latest session ID (updated on each session)
  session_id: {
    type: String,
    required: true,
    index: true,
  },
  
  // Timestamp
  captured_at: {
    type: Date,
    required: true,
    default: Date.now,
  },
  
  // Impairment probabilities (0.0 to 1.0)
  impairment_probs: {
    vision: {
      vision_loss: {
        type: Number,
        min: 0,
        max: 1,
      },
      color_blindness: {
        type: Number,
        min: 0,
        max: 1,
      },
    },
    motor: {
      inaccurate_click: {
        type: Number,
        min: 0,
        max: 1,
      },
    },
    literacy: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  
  // Onboarding metrics
  onboarding_metrics: {
    avg_reaction_ms: Number,
    hit_rate: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  
  // Device context
  device_context: {
    os: String,
    browser: String,
    screen_w: Number,
    screen_h: Number,
    dpr: Number,
  },
});

// Index for queries
impairmentProfileSchema.index({ user_id: 1, captured_at: -1 });

export default mongoose.model('ImpairmentProfile', impairmentProfileSchema);
