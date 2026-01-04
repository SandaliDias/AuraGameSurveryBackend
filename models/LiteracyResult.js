import mongoose from 'mongoose';

const questionResponseSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true,
  },
  question: String,
  userAnswer: {
    type: String,
    required: true,
  },
  correctAnswer: String,
  isCorrect: Boolean,
  responseTime: Number, // milliseconds
}, { _id: false });

const literacyResultSchema = new mongoose.Schema({
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
  
  responses: [questionResponseSchema],
  
  // Score as decimal (0.0 - 1.0)
  score: {
    type: Number,
    min: 0,
    max: 1,
  },
  
  // Raw counts
  correctAnswers: Number,
  totalQuestions: Number,
  
  // Category Breakdown with decimal scores
  categoryScores: [{
    category: String, // e.g., "icons", "terminology", "interaction"
    correct: Number,
    total: Number,
    score: Number, // Decimal score (0.0 - 1.0)
  }],
});

// Auto-expire results after 1 year
literacyResultSchema.index({ completedAt: 1 }, { expireAfterSeconds: 31536000 });

export default mongoose.model('LiteracyResult', literacyResultSchema);

