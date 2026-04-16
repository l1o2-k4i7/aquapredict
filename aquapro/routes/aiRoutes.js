// routes/aiRoutes.js

const express = require('express');
const router  = express.Router();
const { predict } = require('../controllers/aiControl');

// Direct prediction (for testing)
router.post('/ai/predict', predict);

module.exports = router;
