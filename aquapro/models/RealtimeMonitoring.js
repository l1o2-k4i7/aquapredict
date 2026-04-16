// ================================================================
// models/RealtimeMonitoring.js
// ADD THIS FILE to ~/aquapredict/aquapro/models/
//
// Matches EXACT schema from p1.py output:
// {testNumber, projectTitle, status, waterParameters,
//  fishPrediction, stackingData{..., stockingRatio}, __v,
//  createdAt, updatedAt}
// ================================================================

const mongoose = require('mongoose');

const WaterParametersSchema = new mongoose.Schema({
  ph:              { type: Number, required: true },
  dissolvedOxygen: { type: Number, required: true },
  temperature:     { type: Number, required: true },
  ammonia:         { type: Number, required: true },
  turbidity:       { type: Number, required: true }
}, { _id: false });

const GroupedSpeciesSchema = new mongoose.Schema({
  surface:    [String],
  middle:     [String],
  bottom:     [String],
  vegetation: [String]
}, { _id: false });

const FishPredictionSchema = new mongoose.Schema({
  predictedSpecies: [String],
  removedPredators: [String],
  groupedSpecies:   GroupedSpeciesSchema
}, { _id: false });

const StackingDataSchema = new mongoose.Schema({
  cultureSystem: { type: String },
  priority:      { type: String, enum: ['High', 'Medium', 'Low'] },
  status:        { type: String, enum: ['Approved', 'Conditional', 'Rejected', 'Not Recommended'] },
  stockingRatio: { type: mongoose.Schema.Types.Mixed }  // {"Rohu":30,...} or {"Rohu":"20-25%",...}
}, { _id: false });

const RealtimeMonitoringSchema = new mongoose.Schema({
  testNumber:      { type: Number, unique: true },
  projectTitle:    { type: String },
  status:          { type: String, default: 'Completed' },
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  waterParameters: WaterParametersSchema,
  fishPrediction:  FishPredictionSchema,
  stackingData:    StackingDataSchema,
  __v:             { type: Number, default: 0 }
}, {
  timestamps: true,   // adds createdAt and updatedAt automatically
  collection: 'realtime_monitoring'
});

// Index for fast queries from dashboard
RealtimeMonitoringSchema.index({ createdAt: -1 });
RealtimeMonitoringSchema.index({ userId: 1 });

module.exports = mongoose.model('RealtimeMonitoring', RealtimeMonitoringSchema);
