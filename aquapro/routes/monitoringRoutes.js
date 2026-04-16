// routes/monitoringRoutes.js

const express = require('express');
const router  = express.Router();
const {
  receiveSensorData,
  getLatestSensorData,
  getCurrentSensorData,
} = require('../controllers/MonitorControl');

// ESP32-RX pushes data here
router.post('/sensor', receiveSensorData);

// Dashboard live graph (last 50 readings)
router.get('/sensor/latest/:pondId', getLatestSensorData);

// Dashboard live value cards (single latest reading)
router.get('/sensor/realtime/:pondId', getCurrentSensorData);

module.exports = router;
