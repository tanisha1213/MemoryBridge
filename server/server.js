const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const visitorRoutes = require('./routes/visitorRoutes');
const reminderRoutes = require('./routes/reminderRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://StackNovas:E1w8oBHfD71MzbEG@cluster0.c4jlm5g.mongodb.net/memorybridge?retryWrites=true&w=majority';

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
