// server.js
// Entry point for AquaPro backend
// Connects to MongoDB, loads all routes, starts server

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const connectDB  = require('./config/db');
require('dotenv').config();

const app = express();

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
connectDB();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Serve static frontend (public/) ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', require('./routes/monitoringRoutes'));
app.use('/api', require('./routes/ProjectRoutes'));
app.use('/api', require('./routes/aiRoutes'));
app.use('/api', require('./routes/userRoutes'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: '✅ AquaPro backend running', time: new Date().toISOString() });
});

// ─── Catch-all: serve frontend for any unknown route ─────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AquaPro server running at http://localhost:${PORT}`);
  console.log(`📡 Sensor endpoint : POST http://localhost:${PORT}/api/sensor`);
  console.log(`🧪 Test endpoint   : POST http://localhost:${PORT}/api/test/create`);
  console.log(`🖥️  Dashboard       : http://localhost:${PORT}`);
});
