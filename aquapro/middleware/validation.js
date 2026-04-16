// Validate project creation fields
exports.validateProject = (req, res, next) => {
  const { name, phoneNumber, email, place } = req.body;
  const errors = [];

  if (!name || !name.trim()) errors.push('Name is required');
  if (!phoneNumber || !phoneNumber.trim()) errors.push('Phone number is required');
  if (!email || !email.trim()) errors.push('Email is required');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('Please enter a valid email');
  if (!place || !place.trim()) errors.push('Place is required');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join(', ') });
  }
  next();
};

// Validate test data
exports.validateTest = (req, res, next) => {
  const { waterParameters, fishPrediction, stackingData } = req.body;

  if (!waterParameters && !fishPrediction && !stackingData) {
    return res.status(400).json({ success: false, message: 'Test data is required. Provide at least one section.' });
  }

  if (waterParameters) {
    const wp = waterParameters;
    if (wp.ph !== undefined && (wp.ph < 0 || wp.ph > 14)) {
      return res.status(400).json({ success: false, message: 'pH must be between 0 and 14' });
    }
    if (wp.temperature !== undefined && (wp.temperature < -10 || wp.temperature > 60)) {
      return res.status(400).json({ success: false, message: 'Temperature must be between -10 and 60°C' });
    }
  }

  next();
};

exports.validateMonitoringReading = (req, res, next) => {
  const required = ['pH', 'dissolvedOxygen', 'turbidity', 'temperature', 'ammonia'];

  for (const key of required) {
    if (req.body[key] === undefined || req.body[key] === null || req.body[key] === '') {
      return res.status(400).json({ success: false, message: `${key} is required` });
    }
    const numeric = Number(req.body[key]);
    if (Number.isNaN(numeric)) {
      return res.status(400).json({ success: false, message: `${key} must be numeric` });
    }
    req.body[key] = numeric;
  }

  if (req.body.timestamp) {
    const dt = new Date(req.body.timestamp);
    if (Number.isNaN(dt.getTime())) {
      return res.status(400).json({ success: false, message: 'timestamp must be a valid date' });
    }
    req.body.timestamp = dt;
  }

  next();
};

// Error handler middleware
exports.errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
};
