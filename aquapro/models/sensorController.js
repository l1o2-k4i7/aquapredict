// ================================================================
// controllers/sensorController.js
// ADD THIS FILE to ~/aquapredict/aquapro/controllers/
//
// Handles all sensor/pipeline interaction:
//   POST /api/sensor/test       ← user creates test, enters ammonia
//   GET  /api/sensor/realtime   ← latest prediction documents
//   GET  /api/sensor/stream     ← raw live sensor values for charts
//   GET  /api/sensor/tests      ← all tests for logged-in user
//   GET  /api/sensor/tests/:id  ← single test by ObjectId
// ================================================================

const fs   = require('fs');
const path = require('path');
const RealtimeMonitoring = require('../models/RealtimeMonitoring');
const TestSession        = require('../models/TestSession');
const RealtimeStream     = require('../models/RealtimeStream');

// Path where ammonia.txt is written — pipeline2 reads this
const AMMONIA_FILE = path.join(process.env.HOME || '/home/aqua', 'aquapredict', 'ammonia.txt');

// ================================================================
// POST /api/sensor/test
//
// Called when a logged-in user creates a test from the dashboard.
// Body: { ammonia, testName, projectTitle }
//
// Writes ammonia.txt so pipeline2 picks it up on next sensor reading.
// ================================================================
exports.createTest = async (req, res) => {
  try {
    const { ammonia, testName, projectTitle } = req.body;

    // Validate ammonia
    const ammoniaVal = parseFloat(ammonia);
    if (isNaN(ammoniaVal) || ammoniaVal < 0 || ammoniaVal > 5) {
      return res.status(400).json({
        success: false,
        message: 'Ammonia must be a number between 0.00 and 5.00 mg/L'
      });
    }

    // Write ammonia.txt — pipeline2_continuous.py reads this
    const payload = JSON.stringify({
      ammonia:      ammoniaVal,
      userId:       req.user._id.toString(),
      testName:     testName     || `Test_${new Date().toISOString().slice(0,10)}`,
      projectTitle: projectTitle || 'Pond A – Water Quality Trial',
      createdAt:    new Date().toISOString()
    });

    fs.writeFileSync(AMMONIA_FILE, payload, 'utf8');

    res.status(200).json({
      success: true,
      message: 'Test created. Waiting for next sensor reading from ESP32...',
      data: {
        ammonia:     ammoniaVal,
        testName:    testName,
        ammoniaFile: AMMONIA_FILE
      }
    });

  } catch (err) {
    console.error('createTest error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/realtime?limit=20
//
// Returns last N realtime_monitoring documents (newest first).
// Each document includes full prediction result.
// ================================================================
exports.getRealtimeReadings = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const docs  = await RealtimeMonitoring
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, count: docs.length, data: docs });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/realtime/latest
//
// Returns the single most recent realtime_monitoring document.
// Used by dashboard cards to show latest prediction.
// ================================================================
exports.getLatestReading = async (req, res) => {
  try {
    const doc = await RealtimeMonitoring
      .findOne()
      .sort({ createdAt: -1 })
      .lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'No data yet' });
    }

    res.status(200).json({ success: true, data: doc });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/stream?limit=50
//
// Returns raw realtime stream values for live charts.
// Schema: timestamp, ph, do, turbidity, temperature
// ================================================================
exports.getRealtimeStream = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const docs  = await RealtimeStream
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, count: docs.length, data: docs.reverse() });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/tests?page=1&limit=10
//
// Returns test sessions for the logged-in user.
// Supports pagination.
// ================================================================
exports.getUserTests = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const [tests, total] = await Promise.all([
      TestSession
        .find({ userId: req.user._id })
        .sort({ testedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TestSession.countDocuments({ userId: req.user._id })
    ]);

    res.status(200).json({
      success: true,
      count:   tests.length,
      total,
      page,
      pages:   Math.ceil(total / limit),
      data:    tests
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/tests/:id
//
// Returns a single test session by MongoDB ObjectId.
// Also returns the linked realtime_monitoring document.
// ================================================================
exports.getTestById = async (req, res) => {
  try {
    const test = await TestSession
      .findOne({ _id: req.params.id, userId: req.user._id })
      .lean();

    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    // Fetch the linked realtime_monitoring doc by testIndex
    let realtimeDoc = null;
    if (test.testIndex) {
      realtimeDoc = await RealtimeMonitoring
        .findOne({ testNumber: test.testIndex })
        .lean();
    }

    res.status(200).json({
      success: true,
      data:    { test, realtimeDoc }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/stats
//
// Returns summary statistics for dashboard header.
// ================================================================
exports.getStats = async (req, res) => {
  try {
    const [totalReadings, totalTests, latest] = await Promise.all([
      RealtimeMonitoring.countDocuments({}),
      TestSession.countDocuments({ userId: req.user._id }),
      RealtimeMonitoring.findOne().sort({ createdAt: -1 }).lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalReadings,
        totalTests,
        latestParams:   latest?.waterParameters   || null,
        latestSpecies:  latest?.fishPrediction?.predictedSpecies || [],
        latestStacking: latest?.stackingData       || {},
        lastUpdated:    latest?.createdAt          || null
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================================================
// GET /api/sensor/ammonia/status
//
// Returns whether ammonia.txt is waiting (pending test) or empty.
// Dashboard polls this to show "Waiting for sensor..." status.
// ================================================================
exports.getAmmoniaStatus = async (req, res) => {
  try {
    const exists = fs.existsSync(AMMONIA_FILE);
    let pending  = null;

    if (exists) {
      try {
        pending = JSON.parse(fs.readFileSync(AMMONIA_FILE, 'utf8'));
      } catch {
        pending = null;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        waiting:  exists,
        pending:  pending,
        message:  exists
          ? 'Ammonia set — waiting for next ESP32 sensor reading...'
          : 'No pending test. Create a test to set ammonia.'
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
