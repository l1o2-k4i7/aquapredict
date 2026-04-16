const WaterMonitoringData = require('../models/WaterMonitoringData');

let latestSensorSnapshot = null;

function minuteKey(date) {
  const dt = new Date(date);
  dt.setSeconds(0, 0);
  return dt.toISOString();
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function pickNumeric(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      const num = Number(source[key]);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

function normalizeMonitoringRow(row) {
  const timestampValue = row.timestamp || row.createdAt || row.updatedAt;
  if (!timestampValue) return null;

  const timestamp = new Date(timestampValue);
  if (Number.isNaN(timestamp.getTime())) return null;

  const normalized = {
    timestamp,
    pH: pickNumeric(row, ['pH', 'ph']),
    dissolvedOxygen: pickNumeric(row, ['dissolvedOxygen', 'do', 'DO']),
    turbidity: pickNumeric(row, ['turbidity']),
    temperature: pickNumeric(row, ['temperature', 'temp']),
    ammonia: pickNumeric(row, ['ammonia', 'nh3']),
  };

  const hasAnyMetric = ['pH', 'dissolvedOxygen', 'turbidity', 'temperature', 'ammonia']
    .some((key) => normalized[key] !== null);

  return hasAnyMetric ? normalized : null;
}

function calculatePredictions(minuteRows) {
  const metrics = ['pH', 'dissolvedOxygen', 'turbidity', 'temperature', 'ammonia'];
  const predictions = {};
  
  // Use last 60 points if available
  const dataPoints = minuteRows.slice(-60); 
  if (dataPoints.length < 2) {
    metrics.forEach(m => predictions[m] = { predictedValue: null, trend: 'stable' });
    return predictions;
  }

  metrics.forEach(metric => {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = dataPoints.length;

    dataPoints.forEach((row, idx) => {
      const x = idx;
      const y = row[metric];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    const b = (sumY - m * sumX) / n || 0;

    // +30 mins
    const futureX = (n - 1) + 30;
    let predictedValue = m * futureX + b;
    
    if (predictedValue < 0) predictedValue = 0;
    if (metric === 'pH' && predictedValue > 14) predictedValue = 14;

    let trend = 'stable';
    if (m > 0.003) trend = 'up';
    else if (m < -0.003) trend = 'down';

    predictions[metric] = {
      predictedValue: Number(predictedValue.toFixed(2)),
      trend,
      slope: Number(m.toFixed(4))
    };
  });

  return predictions;
}

exports.receiveLiveReading = async (req, res) => {
  try {
    latestSensorSnapshot = {
      pH: toNumber(req.body.pH),
      dissolvedOxygen: toNumber(req.body.dissolvedOxygen),
      turbidity: toNumber(req.body.turbidity),
      temperature: toNumber(req.body.temperature),
      ammonia: toNumber(req.body.ammonia),
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
    };

    return res.status(200).json({ success: true, data: latestSensorSnapshot });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

exports.insertMonitoringReadingNow = async (req, res) => {
  try {
    if (!latestSensorSnapshot) {
      return res.status(400).json({ success: false, message: 'No live sensor reading available yet' });
    }

    const created = await WaterMonitoringData.create({
      ...latestSensorSnapshot,
      timestamp: new Date(),
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

exports.insertScheduledMonitoringReading = async () => {
  if (!latestSensorSnapshot) return null;

  const payload = {
    pH: toNumber(latestSensorSnapshot.pH),
    dissolvedOxygen: toNumber(latestSensorSnapshot.dissolvedOxygen),
    turbidity: toNumber(latestSensorSnapshot.turbidity),
    temperature: toNumber(latestSensorSnapshot.temperature),
    ammonia: toNumber(latestSensorSnapshot.ammonia),
    timestamp: new Date(),
  };

  return WaterMonitoringData.create(payload);
};

exports.getMonitoringData = async (req, res) => {
  try {
    const minutes = Math.min(Math.max(parseInt(req.query.minutes, 10) || 240, 1), 240);
    const from = new Date(Date.now() - minutes * 60 * 1000);

    let rawRows = await WaterMonitoringData.find({
      $or: [
        { timestamp: { $gte: from } },
        { createdAt: { $gte: from } },
      ],
    }).sort({ timestamp: 1, createdAt: 1 }).lean();

    if (!rawRows.length) {
      rawRows = await WaterMonitoringData.find({})
        .sort({ timestamp: -1, createdAt: -1 })
        .limit(500)
        .lean();
      rawRows.reverse();
    }

    // Support older records that may have missing/alternate key names.
    const rows = rawRows
      .map((row) => normalizeMonitoringRow(row))
      .filter((row) => row !== null);

    const minuteMap = new Map();

    rows.forEach((row) => {
      const key = minuteKey(row.timestamp);
      if (!minuteMap.has(key)) {
        minuteMap.set(key, {
          minute: key,
          pH: row.pH,
          dissolvedOxygen: row.dissolvedOxygen,
          turbidity: row.turbidity,
          temperature: row.temperature,
          ammonia: row.ammonia,
          candles: {
            pH: { open: row.pH, high: row.pH, low: row.pH, close: row.pH },
            dissolvedOxygen: { open: row.dissolvedOxygen, high: row.dissolvedOxygen, low: row.dissolvedOxygen, close: row.dissolvedOxygen },
            turbidity: { open: row.turbidity, high: row.turbidity, low: row.turbidity, close: row.turbidity },
            temperature: { open: row.temperature, high: row.temperature, low: row.temperature, close: row.temperature },
            ammonia: { open: row.ammonia, high: row.ammonia, low: row.ammonia, close: row.ammonia },
          },
          samples: 1,
        });
        return;
      }

      const bucket = minuteMap.get(key);
      bucket.pH = row.pH;
      bucket.dissolvedOxygen = row.dissolvedOxygen;
      bucket.turbidity = row.turbidity;
      bucket.temperature = row.temperature;
      bucket.ammonia = row.ammonia;

      const updateCandle = (metric, value) => {
        bucket.candles[metric].high = Math.max(bucket.candles[metric].high, value);
        bucket.candles[metric].low = Math.min(bucket.candles[metric].low, value);
        bucket.candles[metric].close = value;
      };

      updateCandle('pH', row.pH);
      updateCandle('dissolvedOxygen', row.dissolvedOxygen);
      updateCandle('turbidity', row.turbidity);
      updateCandle('temperature', row.temperature);
      updateCandle('ammonia', row.ammonia);

      bucket.samples += 1;
    });

    const minuteRows = Array.from(minuteMap.values()).sort((a, b) => new Date(a.minute) - new Date(b.minute));

    const predictions = calculatePredictions(minuteRows);

    return res.status(200).json({
      success: true,
      data: {
        count: rawRows.length,
        minuteRows,
        latest: rows.length ? rows[rows.length - 1] : null,
        predictions,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
