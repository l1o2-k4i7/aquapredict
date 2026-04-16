const Project = require('../models/Project');

// @desc    Get all projects
// @route   GET /api/projects
exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Create project
// @route   POST /api/projects
exports.createProject = async (req, res) => {
  try {
    const { name, phoneNumber, email, place } = req.body;

    // Check for duplicate phone number
    const existing = await Project.findOne({ phoneNumber });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Phone number already exists. Each project must have a unique phone number.' });
    }

    const project = await Project.create({ name, phoneNumber, email, place, tests: [] });
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Phone number already exists.' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Add test to project
// @route   POST /api/projects/:id/tests
exports.addTest = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.tests.length >= 10) {
      return res.status(400).json({ success: false, message: 'Maximum 10 tests allowed per project.' });
    }

    const testData = {
      waterParameters: req.body.waterParameters || {},
      fishPrediction: req.body.fishPrediction || {},
      stackingData: req.body.stackingData || {}
    };

    project.tests.push(testData);
    await project.save();

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Update a test
// @route   PUT /api/projects/:id/tests/:testId
exports.updateTest = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const test = project.tests.id(req.params.testId);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    if (req.body.waterParameters) test.waterParameters = { ...test.waterParameters.toObject(), ...req.body.waterParameters };
    if (req.body.fishPrediction) {
      test.fishPrediction = { ...test.fishPrediction.toObject(), ...req.body.fishPrediction };
      if (req.body.fishPrediction.groupedSpecies) {
        test.fishPrediction.groupedSpecies = { ...test.fishPrediction.groupedSpecies.toObject(), ...req.body.fishPrediction.groupedSpecies };
      }
    }
    if (req.body.stackingData) test.stackingData = { ...test.stackingData.toObject(), ...req.body.stackingData };

    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Delete a test
// @route   DELETE /api/projects/:id/tests/:testId
exports.deleteTest = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const test = project.tests.id(req.params.testId);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    test.deleteOne();
    await project.save();

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Get single test
// @route   GET /api/projects/:id/tests/:testId
exports.getTest = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const test = project.tests.id(req.params.testId);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    res.status(200).json({ success: true, data: test });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Check if user exists by phone number
// @route   POST /api/projects/check-user
exports.checkUser = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !phoneNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const project = await Project.findOne({ phoneNumber: phoneNumber.trim() });
    if (!project) {
      return res.status(404).json({ success: false, message: 'User not found with this phone number' });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: project._id,
        name: project.name,
        email: project.email,
        phoneNumber: project.phoneNumber,
        place: project.place,
        testsCount: project.tests.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Create test with only ammonia value
// @route   POST /api/projects/create-test
exports.createTestWithAmmonia = async (req, res) => {
  try {
    const { projectId, ammonia } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID is required' });
    }
    if (ammonia === undefined || ammonia === null || ammonia === '') {
      return res.status(400).json({ success: false, message: 'Ammonia value is required' });
    }
    const ammoniaNum = Number(ammonia);
    if (Number.isNaN(ammoniaNum)) {
      return res.status(400).json({ success: false, message: 'Ammonia must be a valid number' });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.tests.length >= 10) {
      return res.status(400).json({ success: false, message: 'Maximum 10 tests allowed per project.' });
    }

    const testData = {
      waterParameters: {
        ph: 0,
        dissolvedOxygen: 0,
        turbidity: 0,
        ammonia: ammoniaNum,
        temperature: 0
      },
      fishPrediction: {
        predictedSpecies: [],
        removedPredators: [],
        groupedSpecies: { surface: [], middle: [], bottom: [], vegetation: [] }
      },
      stackingData: {
        cultureSystem: '',
        priority: '',
        status: 'Pending',
        stockingRatio: {}
      }
    };

    project.tests.push(testData);
    await project.save();

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
