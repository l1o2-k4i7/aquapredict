// serial_reader.js
// Runs on Jetson Nano.
// Reads JSON from ESP32-RX via USB serial port,
// then POSTs the sensor data to the local AquaPro API.
//
// Usage: node serial_reader.js <pondId>
// Example: node serial_reader.js 64a7c3f2e1d2b3a4c5d6e7f8
//
// Install dependency: npm install serialport axios

const { SerialPort }    = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const axios              = require('axios');

// ── Config ───────────────────────────────────────────────────────────────────
const SERIAL_PORT  = process.env.SERIAL_PORT  || '/dev/ttyUSB0'; // ESP32-RX USB port
const BAUD_RATE    = parseInt(process.env.BAUD_RATE || '115200');
const API_BASE     = process.env.API_BASE     || 'http://localhost:3000/api';
const POND_ID      = process.argv[2];           // pass pondId as CLI argument

if (!POND_ID) {
  console.error('❌ Usage: node serial_reader.js <pondId>');
  process.exit(1);
}

console.log(`📡 Opening serial port: ${SERIAL_PORT} @ ${BAUD_RATE} baud`);
console.log(`🏞️  Pond ID: ${POND_ID}`);
console.log(`🌐 Posting to: ${API_BASE}/sensor`);

// ── Open serial port ──────────────────────────────────────────────────────────
const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.on('open', () => {
  console.log('✅ Serial port opened. Waiting for ESP32-RX data...');
});

port.on('error', (err) => {
  console.error('❌ Serial port error:', err.message);
});

// ── On each line received from ESP32-RX ───────────────────────────────────────
parser.on('data', async (line) => {
  line = line.trim();

  // Skip non-JSON lines (debug messages from ESP32)
  if (!line.startsWith('{')) return;

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    console.warn('⚠️  Not valid JSON - skipping:', line);
    return;
  }

  // ESP32 sends: { ph, temp, turbidity, do }
  // Map to API format
  const payload = {
    pondId:          POND_ID,
    ph:              parsed.ph,
    dissolvedOxygen: parsed.do,
    temperature:     parsed.temp,
    turbidity:       parsed.turbidity,
  };

  try {
    const res = await axios.post(`${API_BASE}/sensor`, payload);
    console.log(`✅ [${new Date().toLocaleTimeString()}] Sensor data sent → pH:${payload.ph} DO:${payload.dissolvedOxygen} Temp:${payload.temperature} Turbidity:${payload.turbidity}`);
  } catch (err) {
    console.error('❌ Failed to post sensor data:', err.message);
  }
});
