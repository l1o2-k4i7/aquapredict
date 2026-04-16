// models/Project.js
// Each "project" = one pond.
// Contains:
//   - pond info
//   - embedded tests[] array (each test = one prediction run)
//   - reference to the latest test
//   - reference to the owner user

const mongoose = require('mongoose');

// ─── Sub-schema: a single test result ────────────────────────────────────────
const TestSchema = new mongoose.Schema(
  {
    testNumber: { type: Number, required: true },
    projectTitle: { type: String },

    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending',
    },

    // Water parameters collected at test time
    waterParameters: {
      dissolvedOxygen: { type: Number },
      ph:              { type: Number },
      temperature:     { type: Number },
      ammonia:         { type: Number },  // manual input from dashboard
      turbidity:       { type: Number },
    },

    // Output from p1.py
    fishPrediction: {
      predictedSpecies: [String],
      removedPredators: [String],
      groupedSpecies: {
        surface:    [String],
        middle:     [String],
        bottom:     [String],
        vegetation: [String],
      },
    },

    stackingData: {
      cultureSystem: String,
      priority:      String,
      status:        String,
    },

    stockingRatio: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// ─── Main Project (Pond) Schema ───────────────────────────────────────────────
const ProjectSchema = new mongoose.Schema(
  {
    pondName: { type: String, required: true, trim: true },

    // Owner of this pond
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Snapshot of latest realtime sensor data (updated by ESP32 stream)
    lastRealtime: {
      ph:              { type: Number, default: null },
      dissolvedOxygen: { type: Number, default: null },
      temperature:     { type: Number, default: null },
      turbidity:       { type: Number, default: null },
      updatedAt:       { type: Date,   default: null },
    },

    // All tests conducted on this pond
    tests: [TestSchema],

    // Quick reference to the latest test ObjectId
    latestTestId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', ProjectSchema);
