// ================================================================
// models/TestSession.js
// ADD THIS FILE to ~/aquapredict/aquapro/models/
//
// Stores per-user test sessions.
// Linked to User via userId.
// Linked to realtime_monitoring via testNumber and MongoDB _id.
// ================================================================

const mongoose = require('mongoose');

const TestSessionSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionName:  { type: String, required: true },
  projectTitle: { type: String },
  testIndex:    { type: Number },

  // Snapshot of water parameters at test time
  waterParameters: {
    ph:              Number,
    dissolvedOxygen: Number,
    temperature:     Number,
    ammonia:         Number,
    turbidity:       Number
  },

  // Prediction result snapshot
  prediction: {
    predictedSpecies: [String],
    cultureSystem:    String,
    priority:         String,
    status:           String,
    stockingRatio:    mongoose.Schema.Types.Mixed
  },

  // Reference back to the realtime_monitoring document
  realtimeDocId: { type: mongoose.Schema.Types.ObjectId, ref: 'RealtimeMonitoring' },

  testedAt:  { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'test_sessions'
});

TestSessionSchema.index({ userId: 1, testedAt: -1 });

module.exports = mongoose.model('TestSession', TestSessionSchema);
