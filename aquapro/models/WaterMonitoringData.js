// models/WaterMonitoringData.js
// Schema for REALTIME water monitoring.
// Every sensor push from ESP32 creates one document here.
// Schema: { waterParameters, timestamp, pond }

const mongoose = require('mongoose');

const WaterMonitoringSchema = new mongoose.Schema(
  {
    // Which pond this reading belongs to
    pondId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },

    // Optional: link to a test if reading was taken during a test
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Sensor values at this instant
    ph:              { type: Number, required: true },
    dissolvedOxygen: { type: Number, required: true },
    temperature:     { type: Number, required: true },
    turbidity:       { type: Number, required: true },

    // Auto-set timestamp
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }  // we manage timestamp manually above
);

// Index for fast queries: get latest readings for a pond
WaterMonitoringSchema.index({ pondId: 1, timestamp: -1 });

module.exports = mongoose.model('WaterMonitoringData', WaterMonitoringSchema);
