// controllers/ProjectControl.js
// Handles:
//   - Create pond (project) for a user
//   - Fetch pond details
//   - Create a test: takes pondId + ammonia, fetches latest realtime data,
//     calls pythonService, stores result inside tests[], updates latestTestId

const Project  = require('../models/Project');
const User     = require('../models/User');
const WaterMonitoringData = require('../models/WaterMonitoringData');
const { runPrediction }   = require('../services/pythonService');

// ─── POST /api/project/create ─────────────────────────────────────────────────
// Body: { pondName, userId }
const createProject = async (req, res) => {
  try {
    const { pondName, userId } = req.body;

    if (!pondName || !userId) {
      return res.status(400).json({ success: false, message: 'pondName and userId are required' });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create the pond
    const project = await Project.create({ pondName, userId });

    // Add pond reference to user
    await User.findByIdAndUpdate(userId, { $push: { ponds: project._id } });

    return res.status(201).json({
      success: true,
      message: '✅ Pond created',
      data: project,
    });

  } catch (error) {
    console.error('❌ createProject error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/project/:pondId ─────────────────────────────────────────────────
const getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.pondId).lean();
    if (!project) {
      return res.status(404).json({ success: false, message: 'Pond not found' });
    }
    return res.status(200).json({ success: true, data: project });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/project/user/:userId ───────────────────────────────────────────
// Get all ponds for a user
const getUserProjects = async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.params.userId }).lean();
    return res.status(200).json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/test/create ────────────────────────────────────────────────────
// Body: { pondId, ammonia }
// Steps:
//   1. Fetch latest realtime sensor data for pondId
//   2. Combine with manual ammonia input
//   3. Call pythonService (p1.py)
//   4. Store test result in project.tests[]
//   5. Update project.latestTestId
const createTest = async (req, res) => {
  try {
    const { pondId, ammonia } = req.body;

    if (!pondId || ammonia === undefined) {
      return res.status(400).json({ success: false, message: 'pondId and ammonia are required' });
    }

    // 1. Get the pond
    const project = await Project.findById(pondId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Pond not found' });
    }

    // 2. Get latest sensor reading
    const latestReading = await WaterMonitoringData.findOne({ pondId })
      .sort({ timestamp: -1 })
      .lean();

    if (!latestReading) {
      return res.status(400).json({
        success: false,
        message: 'No sensor data available for this pond yet. Wait for ESP32 data.',
      });
    }

    // 3. Build waterParameters (sensor data + manual ammonia)
    const waterParameters = {
      dissolvedOxygen: latestReading.dissolvedOxygen,
      ph:              latestReading.ph,
      temperature:     latestReading.temperature,
      turbidity:       latestReading.turbidity,
      ammonia:         parseFloat(ammonia),
    };

    // 4. Determine next test number
    const testNumber = (project.tests.length || 0) + 1;
    const projectTitle = `${project.pondName} – Water Quality Trial`;

    // 5. Call p1.py via pythonService
    let predictionResult;
    try {
      predictionResult = await runPrediction(waterParameters, projectTitle, testNumber);
    } catch (pyError) {
      console.error('❌ Prediction failed:', pyError.message);
      return res.status(500).json({
        success: false,
        message: `Prediction failed: ${pyError.message}`,
      });
    }

    // 6. Build test document
    const newTest = {
      testNumber,
      projectTitle,
      status: 'Completed',
      waterParameters,
      fishPrediction:  predictionResult.fishPrediction,
      stackingData:    predictionResult.stackingData,
      stockingRatio:   predictionResult.stockingRatio,
    };

    // 7. Push test into project.tests and update latestTestId
    project.tests.push(newTest);
    const insertedTest = project.tests[project.tests.length - 1];
    project.latestTestId = insertedTest._id;
    await project.save();

    return res.status(201).json({
      success: true,
      message: '✅ Test created & prediction complete',
      testId: insertedTest._id,
      testNumber,
      data: insertedTest,
    });

  } catch (error) {
    console.error('❌ createTest error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/project/tests/:pondId ──────────────────────────────────────────
// Get all tests for a pond
const getTests = async (req, res) => {
  try {
    const project = await Project.findById(req.params.pondId).select('tests pondName').lean();
    if (!project) {
      return res.status(404).json({ success: false, message: 'Pond not found' });
    }
    return res.status(200).json({
      success: true,
      pondName: project.pondName,
      count: project.tests.length,
      data: project.tests,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/test/:pondId/:testId ────────────────────────────────────────────
// Get one specific test by ObjectId
const getTestById = async (req, res) => {
  try {
    const { pondId, testId } = req.params;
    const project = await Project.findById(pondId).lean();
    if (!project) {
      return res.status(404).json({ success: false, message: 'Pond not found' });
    }
    const test = project.tests.find(t => t._id.toString() === testId);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }
    return res.status(200).json({ success: true, data: test });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createProject,
  getProject,
  getUserProjects,
  createTest,
  getTests,
  getTestById,
};
