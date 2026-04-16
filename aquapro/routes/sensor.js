// ================================================================
// routes/sensor.js
// ADD THIS FILE to ~/aquapredict/aquapro/routes/
//
// Mount in server.js with:
//   const sensorRoutes = require('./routes/sensor');
//   app.use('/api/sensor', sensorRoutes);
// ================================================================

const express = require('express');
const router  = express.Router();
const {
  createTest,
  getRealtimeReadings,
  getLatestReading,
  getRealtimeStream,
  getUserTests,
  getTestById,
  getStats,
  getAmmoniaStatus
} = require('../controllers/sensorController');

// Reuse whatever auth middleware your app already has.
// Typically: require('../middleware/auth') or similar.
// CHANGE THIS IMPORT to match your existing middleware file name.
const protect = require('../middleware/auth');

// ── Public (no auth needed) ──────────────────────────────────────
// Latest reading for dashboard cards (used before login too)
router.get('/realtime/latest', getLatestReading);

// Raw stream for live charts
router.get('/stream',          getRealtimeStream);

// ── Protected (must be logged in) ───────────────────────────────
// Create a test — user enters ammonia, sets ammonia.txt
router.post('/test',           protect, createTest);

// All realtime prediction documents
router.get('/realtime',        protect, getRealtimeReadings);

// Dashboard header stats
router.get('/stats',           protect, getStats);

// All tests for the current user
router.get('/tests',           protect, getUserTests);

// Single test by ObjectId (also returns linked realtime doc)
router.get('/tests/:id',       protect, getTestById);

// Check if ammonia.txt is waiting
router.get('/ammonia/status',  protect, getAmmoniaStatus);

module.exports = router;
