// middleware/Validation.js
// Simple request validators used in routes

const validateSensorData = (req, res, next) => {
  const { pondId, ph, dissolvedOxygen, temperature, turbidity } = req.body;
  const missing = [];

  if (!pondId)            missing.push('pondId');
  if (ph === undefined)   missing.push('ph');
  if (dissolvedOxygen === undefined) missing.push('dissolvedOxygen');
  if (temperature === undefined)     missing.push('temperature');
  if (turbidity === undefined)       missing.push('turbidity');

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing fields: ${missing.join(', ')}`,
    });
  }
  next();
};

const validateTestCreate = (req, res, next) => {
  const { pondId, ammonia } = req.body;
  if (!pondId || ammonia === undefined) {
    return res.status(400).json({
      success: false,
      message: 'pondId and ammonia are required to create a test',
    });
  }
  next();
};

module.exports = { validateSensorData, validateTestCreate };
