const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');
const path = require('path');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const visitorRoutes = require('./routes/visitorRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const ActivityLog = require('./models/ActivityLog');
const PatientSetting = require('./models/PatientSetting');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://StackNovas:E1w8oBHfD71MzbEG@cluster0.c4jlm5g.mongodb.net/memorybridge?retryWrites=true&w=majority';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Attach socket instance to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Cached DB Connection for Serverless/Fast start
let cachedConn = null;
async function connectToDatabase() {
  if (mongoose.connection.readyState >= 1) return mongoose.connection;
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

app.use(async (req, res, next) => {
  try { await connectToDatabase(); } catch (e) {}
  next();
});

// Socket.io Connection Event Handler
io.on('connection', (socket) => {
  console.log('⚡ Socket client connected:', socket.id);

  // Relays for Patient -> Caregiver Alerts
  socket.on('UNKNOWN_VISITOR_EVENT', async (data) => {
    console.log('🚨 UNKNOWN_VISITOR_EVENT received from patient camera');
    io.emit('UNKNOWN_VISITOR_DETECTED', {
      ...data,
      timestamp: new Date(),
    });

    // Save to ActivityLog
    try {
      if (mongoose.connection.readyState === 1) {
        await ActivityLog.create({
          eventType: 'UNKNOWN_VISITOR',
          eventData: data,
        });
      }
    } catch (e) {}
  });

  socket.on('MISSED_MEDICATION_EVENT', async (data) => {
    io.emit('MISSED_MEDICATION_ALERT', {
      ...data,
      timestamp: new Date(),
    });
  });

  socket.on('HYDRATION_CHECK_EVENT', async (data) => {
    io.emit('HYDRATION_CHECK_ALERT', {
      ...data,
      timestamp: new Date(),
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket client disconnected:', socket.id);
  });
});

// API Routes
app.use('/api/visitors', visitorRoutes);
app.use('/visitors', visitorRoutes);

app.use('/api/reminders', reminderRoutes);
app.use('/reminders', reminderRoutes);

// Activity Logs Endpoint
app.get('/api/logs', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(50);
      return res.json(logs);
    }
    return res.json([]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Patient Settings Endpoint
app.get('/api/settings', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let settings = await PatientSetting.findOne();
      if (!settings) {
        settings = await PatientSetting.create({ nativeLanguage: 'en-US' });
      }
      return res.json(settings);
    }
    return res.json({ nativeLanguage: 'en-US', patientName: 'Elder Patient' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { nativeLanguage, patientName, caregiverPhone } = req.body;
    if (mongoose.connection.readyState === 1) {
      let settings = await PatientSetting.findOne();
      if (settings) {
        if (nativeLanguage) settings.nativeLanguage = nativeLanguage;
        if (patientName) settings.patientName = patientName;
        if (caregiverPhone) settings.caregiverPhone = caregiverPhone;
        await settings.save();
      } else {
        settings = await PatientSetting.create({ nativeLanguage, patientName, caregiverPhone });
      }
      io.emit('PATIENT_SETTINGS_UPDATED', settings);
      return res.json(settings);
    }
    io.emit('PATIENT_SETTINGS_UPDATED', { nativeLanguage, patientName });
    return res.json({ nativeLanguage, patientName });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.use('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'MemoryBridge Server with Socket.io',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'in-memory fallback mode',
    socketsActive: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
  });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 MemoryBridge Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
