import mongoose from 'mongoose';

/**
 * Device Context Schema
 * Stores device/viewport information captured during onboarding
 * user_id is the primary key - one record per user
 */

const deviceContextSchema = new mongoose.Schema({
  // Primary identifier - one record per user
  user_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Session ID when this was captured
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
  // Viewport dimensions
  viewportWidth: {
    type: Number,
    required: true,
  },
  viewportHeight: {
    type: Number,
    required: true,
  },
  // Device pixel ratio
  devicePixelRatio: {
    type: Number,
    required: true,
    default: 1,
  },
});

// Index for queries
deviceContextSchema.index({ user_id: 1, captured_at: -1 });

export default mongoose.model('DeviceContext', deviceContextSchema);

