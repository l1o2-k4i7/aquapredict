// ================================================================
// models/RealtimeStream.js
// ADD THIS FILE to ~/aquapredict/aquapro/models/
//
// Lightweight raw sensor stream — no prediction, just raw values.
// Schema: timestamp, ph, do, turbidity, temperature
// Auto-deleted after 7 days via TTL index.
// Used for live charts on the dashboard.
// ================================================================

const mongoose = require('mongoose');

const RealtimeStreamSchema = new mongoose.Schema({
  timestamp:   { type: Date, default: Date.now, index: true },
  ph:          { type: Number },
  do:          { type: Number },   // dissolvedOxygen
  turbidity:   { type: Number },
  temperature: { type: Number }
}, {
  collection: 'realtime_stream'
});

// TTL — auto-delete after 7 days to save disk space on Jetson SD card
RealtimeStreamSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 604800, name: 'timestamp_ttl' }
);

module.exports = mongoose.model('RealtimeStream', RealtimeStreamSchema);
