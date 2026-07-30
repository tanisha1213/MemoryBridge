const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const visitorRoutes = require('./routes/visitorRoutes');
const reminderRoutes = require('./routes/reminderRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/memorybridge';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cached MongoDB Connection for Serverless (Vercel)
let cachedConn = null;

async function connectToDatabase() {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  if (!cachedConn) {
    cachedConn = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
    }).catch((err) => {
      console.warn('⚠️ MongoDB connection attempt failed:', err.message);
      cachedConn = null;
    });
  }
  return cachedConn;
}

// Auto-connect middleware for all API calls
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
  } catch (err) {
    // Continue even if DB offline (will use in-memory fallback)
  }
  next();
});

// API Routes
app.use('/api/visitors', visitorRoutes);
app.use('/api/reminders', reminderRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'MemoryBridge Server',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'in-memory fallback mode',
    timestamp: new Date().toISOString(),
  });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 MemoryBridge Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
