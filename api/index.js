const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://StackNovas:E1w8oBHfD71MzbEG@cluster0.c4jlm5g.mongodb.net/memorybridge?retryWrites=true&w=majority';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

global._memoryBridgeVisitors = global._memoryBridgeVisitors || [];
global._memoryBridgeReminders = global._memoryBridgeReminders || [
  { _id: 'rem_1', title: 'Drink Water', time: '2:00 PM', isCompleted: false, createdAt: new Date() },
  { _id: 'rem_2', title: 'Take Afternoon Medication', time: '3:30 PM', isCompleted: false, createdAt: new Date() },
];
global._memoryBridgeSettings = global._memoryBridgeSettings || {
  nativeLanguage: 'en-US',
  patientName: 'Elder Patient',
};

const visitorSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Unrecognized Person', trim: true },
    relationship: { type: String, default: 'Unknown', trim: true },
    contextNote: { type: String, default: '', trim: true },
    preferredLanguage: { type: String, default: 'en-US', trim: true },
    faceDescriptor: { type: [Number], default: [] },
    photoThumbnail: { type: String, required: true },
    isRegistered: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const reminderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    isCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Visitor = mongoose.models.Visitor || mongoose.model('Visitor', visitorSchema);
const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);

let cachedConn = null;
async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  if (!cachedConn) {
    cachedConn = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3500,
    }).catch((err) => {
      cachedConn = null;
    });
  }
  return cachedConn;
}

const isDbConnected = () => mongoose.connection.readyState === 1;

app.use(async (req, res, next) => {
  try { await connectDB(); } catch (e) {}
  next();
});

async function getVisitors(registeredQuery) {
  if (isDbConnected()) {
    try {
      let filter = {};
      if (registeredQuery === 'true') filter.isRegistered = true;
      if (registeredQuery === 'false') {
        filter.$or = [{ isRegistered: false }, { isRegistered: { $exists: false } }, { isRegistered: null }];
      }
      return await Visitor.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    } catch (e) {}
  }

  let filtered = [...global._memoryBridgeVisitors];
  if (registeredQuery === 'true') filtered = filtered.filter((v) => v.isRegistered === true);
  if (registeredQuery === 'false') filtered = filtered.filter((v) => !v.isRegistered);
  filtered.sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || b.lastSeen) - new Date(a.updatedAt || a.createdAt || a.lastSeen)
  );
  return filtered;
}

const handleVisitorsGet = async (req, res) => {
  try {
    const list = await getVisitors(req.query.registered);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch visitors' });
  }
};

const handleUnknownPost = async (req, res) => {
  try {
    const { photoThumbnail, faceDescriptor } = req.body;
    if (!photoThumbnail) return res.status(400).json({ error: 'photoThumbnail is required' });

    const newVisitorData = {
      name: 'Unrecognized Person',
      relationship: 'Unknown',
      contextNote: 'Captured by patient camera',
      faceDescriptor: faceDescriptor || [],
      photoThumbnail,
      isRegistered: false,
      lastSeen: new Date(),
    };

    if (isDbConnected()) {
      try {
        const newVisitor = new Visitor(newVisitorData);
        await newVisitor.save();
        global._memoryBridgeVisitors.unshift(newVisitor.toObject());
        return res.status(201).json(newVisitor);
      } catch (dbErr) {}
    }

    const newVisitor = {
      _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      ...newVisitorData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    global._memoryBridgeVisitors.unshift(newVisitor);
    return res.status(201).json(newVisitor);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to log unknown visitor' });
  }
};

const handleRegisterPost = async (req, res) => {
  try {
    const { id, name, relationship, contextNote, faceDescriptor, photoThumbnail, preferredLanguage } = req.body;
    if (!name || !relationship) return res.status(400).json({ error: 'Name and Relationship required' });

    if (isDbConnected()) {
      try {
        let visitor;
        if (id) visitor = await Visitor.findById(id);
        if (!visitor && photoThumbnail) visitor = await Visitor.findOne({ photoThumbnail });

        if (visitor) {
          visitor.name = name;
          visitor.relationship = relationship;
          visitor.contextNote = contextNote || '';
          if (preferredLanguage) visitor.preferredLanguage = preferredLanguage;
          if (faceDescriptor && faceDescriptor.length) visitor.faceDescriptor = faceDescriptor;
          if (photoThumbnail) visitor.photoThumbnail = photoThumbnail;
          visitor.isRegistered = true;
          visitor.lastSeen = new Date();
          await visitor.save();

          const idx = global._memoryBridgeVisitors.findIndex(
            (v) => String(v._id) === String(id) || v.photoThumbnail === photoThumbnail
          );
          if (idx !== -1) global._memoryBridgeVisitors[idx] = visitor.toObject();
          else global._memoryBridgeVisitors.unshift(visitor.toObject());

          return res.json(visitor);
        } else {
          const newVisitor = new Visitor({
            name,
            relationship,
            contextNote: contextNote || '',
            preferredLanguage: preferredLanguage || 'en-US',
            faceDescriptor: faceDescriptor || [],
            photoThumbnail: photoThumbnail || '',
            isRegistered: true,
            lastSeen: new Date(),
          });
          await newVisitor.save();
          global._memoryBridgeVisitors.unshift(newVisitor.toObject());
          return res.status(201).json(newVisitor);
        }
      } catch (dbErr) {}
    }

    let existingIndex = -1;
    if (id) existingIndex = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(id));
    if (existingIndex === -1 && photoThumbnail) {
      existingIndex = global._memoryBridgeVisitors.findIndex((v) => v.photoThumbnail === photoThumbnail);
    }

    if (existingIndex !== -1) {
      const item = global._memoryBridgeVisitors[existingIndex];
      item.name = name;
      item.relationship = relationship;
      item.contextNote = contextNote || '';
      if (preferredLanguage) item.preferredLanguage = preferredLanguage;
      if (faceDescriptor && faceDescriptor.length) item.faceDescriptor = faceDescriptor;
      if (photoThumbnail) item.photoThumbnail = photoThumbnail;
      item.isRegistered = true;
      item.updatedAt = new Date();
      return res.json(item);
    } else {
      const newVisitor = {
        _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name,
        relationship,
        contextNote: contextNote || '',
        preferredLanguage: preferredLanguage || 'en-US',
        faceDescriptor: faceDescriptor || [],
        photoThumbnail: photoThumbnail || '',
        isRegistered: true,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      global._memoryBridgeVisitors.unshift(newVisitor);
      return res.status(201).json(newVisitor);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to register visitor' });
  }
};

app.all('*', async (req, res) => {
  const urlPath = req.path || req.url || '';
  const method = req.method.toUpperCase();

  if (urlPath.includes('/visitors/unknown')) {
    if (method === 'GET') return handleVisitorsGet({ ...req, query: { ...req.query, registered: 'false' } }, res);
    if (method === 'POST') return handleUnknownPost(req, res);
  }

  if (urlPath.includes('/visitors/register')) {
    if (method === 'POST') return handleRegisterPost(req, res);
  }

  if (urlPath.includes('/visitors')) {
    const parts = urlPath.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (method === 'DELETE' && lastPart && lastPart !== 'visitors') {
      if (isDbConnected()) {
        try { await Visitor.findByIdAndDelete(lastPart); } catch (e) {}
      }
      global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter((v) => String(v._id) !== String(lastPart));
      return res.json({ message: 'Visitor deleted successfully' });
    }
    if (method === 'GET') return handleVisitorsGet(req, res);
  }

  if (urlPath.includes('/reminders')) {
    if (method === 'GET') return res.json(global._memoryBridgeReminders);
    if (method === 'POST') {
      const { title, time } = req.body;
      const reminder = { _id: 'rem_' + Date.now(), title, time, isCompleted: false, createdAt: new Date() };
      global._memoryBridgeReminders.push(reminder);
      return res.status(201).json(reminder);
    }
  }

  if (urlPath.includes('/settings')) {
    if (method === 'GET') return res.json(global._memoryBridgeSettings);
    if (method === 'POST') {
      global._memoryBridgeSettings = { ...global._memoryBridgeSettings, ...req.body };
      return res.json(global._memoryBridgeSettings);
    }
  }

  if (urlPath.includes('/health')) {
    return res.json({
      status: 'ok',
      app: 'MemoryBridge Serverless Handler',
      database: isDbConnected() ? 'connected' : 'memory mode',
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(404).json({ error: `Route ${urlPath} not found` });
});

module.exports = app;
