// controllers/aiControl.js
// Direct AI prediction endpoint (optional, for testing p1.py standalone)
// POST /api/ai/predict
// Body: { waterParameters: { dissolvedOxygen, ph, temperature, ammonia, turbidity } }

const { runPrediction } = require('../services/pythonService');

const predict = async (req, res) => {
  try {
    const { waterParameters, projectTitle, testNumber } = req.body;

    if (!waterParameters) {
      return res.status(400).json({ success: false, message: 'waterParameters required' });
    }

    const result = await runPrediction(
      waterParameters,
      projectTitle || 'Direct Test',
      testNumber  || 1
    );

    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error('❌ aiControl predict error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { predict };
