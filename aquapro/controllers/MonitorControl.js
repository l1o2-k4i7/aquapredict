// controllers/MonitorControl.js
// Receives sensor data from ESP32-RX (via USB serial → Node.js)
// Stores in WaterMonitoringData collection
// Updates Project.lastRealtime for live dashboard graph

const WaterMonitoringData = require('../models/WaterMonitoringData');
const Project = require('../models/Project');

// ─── POST /api/sensor ─────────────────────────────────────────────────────────
// ESP32-RX sends JSON: { pondId, ph, do, temp, turbidity }
const receiveSensorData = async (req, res) => {
  try {
    const { pondId, ph, dissolvedOxygen, temperature, turbidity } = req.body;

    // Basic validation
    if (!pondId) {
      return res.status(400).json({ success: false, message: 'pondId is required' });
    }

    // 1. Save to realtime collection
    const reading = await WaterMonitoringData.create({
      pondId,
      ph,
      dissolvedOxygen,
      temperature,
      turbidity,
      timestamp: new Date(),
    });

    // 2. Update pond's lastRealtime snapshot (for dashboard live values)
    await Project.findByIdAndUpdate(pondId, {
      'lastRealtime.ph':              ph,
      'lastRealtime.dissolvedOxygen': dissolvedOxygen,
      'lastRealtime.temperature':     temperature,
      'lastRealtime.turbidity':       turbidity,
      'lastRealtime.updatedAt':       new Date(),
    });

    return res.status(201).json({
      success: true,
      message: '✅ Sensor data stored',
      data: reading,
    });

  } catch (error) {
    console.error('❌ receiveSensorData error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/sensor/latest/:pondId ──────────────────────────────────────────
// Returns the last 50 readings for a pond (used for live graph on dashboard)
const getLatestSensorData = async (req, res) => {
  try {
    const { pondId } = req.params;

    const readings = await WaterMonitoringData.find({ pondId })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      count: readings.length,
      data: readings.reverse(), // chronological order for graph
    });

  } catch (error) {
    console.error('❌ getLatestSensorData error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/sensor/realtime/:pondId ─────────────────────────────────────────
// Returns only the single latest reading (live values card on dashboard)
const getCurrentSensorData = async (req, res) => {
  try {
    const { pondId } = req.params;

    const latest = await WaterMonitoringData.findOne({ pondId })
      .sort({ timestamp: -1 })
      .lean();

    if (!latest) {
      return res.status(404).json({ success: false, message: 'No data found for this pond' });
    }

    return res.status(200).json({ success: true, data: latest });

  } catch (error) {
    console.error('❌ getCurrentSensorData error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  receiveSensorData,
  getLatestSensorData,
  getCurrentSensorData,
};
