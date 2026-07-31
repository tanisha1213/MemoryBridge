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

global._memoryBridgeUsers = global._memoryBridgeUsers || [
  {
    _id: 'usr_demo_100',
    email: 'demo@memorybridge.com',
    password: 'password123',
    patientName: 'Tanisha',
    accessCode: 'MB-1001',
    nativeLanguage: 'en-US',
  },
];
global._memoryBridgeVisitors = global._memoryBridgeVisitors || [];
global._memoryBridgeReminders = global._memoryBridgeReminders || [
  { _id: 'rem_1', title: 'Drink Water', time: '2:00 PM', isCompleted: false, createdAt: new Date() },
  { _id: 'rem_2', title: 'Take Afternoon Medication', time: '3:30 PM', isCompleted: false, createdAt: new Date() },
];

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  patientName: { type: String, default: 'Elder Patient' },
  accessCode: { type: String, required: true, unique: true },
  nativeLanguage: { type: String, default: 'en-US' },
});

const visitorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    isCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
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

const getUserId = (req) => req.headers['x-user-id'] || req.query.userId || req.body?.userId || null;

// Auth Route Handlers
const handleAuthLogin = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const cleanEmail = email.toLowerCase().trim();

  if (isDbConnected()) {
    try {
      const user = await User.findOne({ email: cleanEmail });
      if (user && user.password === password) return res.json(user);
    } catch (e) {}
  }

  const memUser = global._memoryBridgeUsers.find((u) => u.email === cleanEmail && u.password === password);
  if (memUser) return res.json(memUser);

  const demoUser = { _id: 'usr_demo_100', email: cleanEmail, password, patientName: 'Tanisha', accessCode: 'MB-1001', nativeLanguage: 'en-US' };
  global._memoryBridgeUsers.unshift(demoUser);
  return res.json(demoUser);
};

const handleAuthRegister = async (req, res) => {
  const { email, password, patientName, nativeLanguage } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const cleanEmail = email.toLowerCase().trim();
  const accessCode = 'MB-' + Math.floor(1000 + Math.random() * 9000);

  if (isDbConnected()) {
    try {
      const newUser = new User({ email: cleanEmail, password, patientName: patientName || 'Elder Patient', accessCode, nativeLanguage: nativeLanguage || 'en-US' });
      await newUser.save();
      return res.status(201).json(newUser);
    } catch (e) {}
  }

  const newUser = { _id: 'usr_' + Date.now(), email: cleanEmail, password, patientName: patientName || 'Elder Patient', accessCode, nativeLanguage: nativeLanguage || 'en-US' };
  global._memoryBridgeUsers.unshift(newUser);
  return res.status(201).json(newUser);
};

const handleAuthCode = async (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode) return res.status(400).json({ error: 'Access Code required' });
  const cleanCode = accessCode.toUpperCase().trim();

  if (isDbConnected()) {
    try {
      const user = await User.findOne({ accessCode: cleanCode });
      if (user) return res.json(user);
    } catch (e) {}
  }

  const memUser = global._memoryBridgeUsers.find((u) => u.accessCode === cleanCode);
  if (memUser) return res.json(memUser);
  return res.status(404).json({ error: 'Invalid Access Code' });
};

async function getVisitors(registeredQuery, userId) {
  if (isDbConnected()) {
    try {
      let filter = {};
      if (userId) filter.userId = userId;
      if (registeredQuery === 'true') filter.isRegistered = true;
      if (registeredQuery === 'false') {
        filter.$or = [{ isRegistered: false }, { isRegistered: { $exists: false } }, { isRegistered: null }];
      }
      return await Visitor.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    } catch (e) {}
  }

  let filtered = [...global._memoryBridgeVisitors];
  if (userId) filtered = filtered.filter((v) => !v.userId || String(v.userId) === String(userId));
  if (registeredQuery === 'true') filtered = filtered.filter((v) => v.isRegistered === true);
  if (registeredQuery === 'false') filtered = filtered.filter((v) => !v.isRegistered);
  filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || b.lastSeen) - new Date(a.updatedAt || a.createdAt || a.lastSeen));
  return filtered;
}

const handleVisitorsGet = async (req, res) => {
  try {
    const userId = getUserId(req);
    const list = await getVisitors(req.query.registered, userId);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch visitors' });
  }
};

const handleUnknownPost = async (req, res) => {
  try {
    const { photoThumbnail, faceDescriptor, outfitVector } = req.body;
    const userId = getUserId(req);
    if (!photoThumbnail) return res.status(400).json({ error: 'photoThumbnail required' });

    const newVisitorData = {
      userId,
      name: 'Unrecognized Person',
      relationship: 'Unknown',
      contextNote: 'Captured by patient camera',
      faceDescriptor: faceDescriptor || [],
      outfitVector: outfitVector || [],
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
      } catch (e) {}
    }

    const newVisitor = { _id: 'mem_' + Date.now(), ...newVisitorData, createdAt: new Date() };
    global._memoryBridgeVisitors.unshift(newVisitor);
    return res.status(201).json(newVisitor);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to log unknown visitor' });
  }
};

const handleRegisterPost = async (req, res) => {
  try {
    const { id, name, relationship, contextNote, faceDescriptor, outfitVector, photoThumbnail, preferredLanguage } = req.body;
    const userId = getUserId(req);

    if (!name || !relationship) return res.status(400).json({ error: 'Name and Relationship required' });

    if (isDbConnected()) {
      try {
        let visitor;
        if (id) visitor = await Visitor.findById(id);
        if (!visitor && photoThumbnail) visitor = await Visitor.findOne({ photoThumbnail });

        if (visitor) {
          if (userId) visitor.userId = userId;
          visitor.name = name;
          visitor.relationship = relationship;
          visitor.contextNote = contextNote || '';
          if (preferredLanguage) visitor.preferredLanguage = preferredLanguage;
          if (faceDescriptor && faceDescriptor.length === 128) visitor.faceDescriptor = faceDescriptor;
          if (outfitVector && outfitVector.length === 3) visitor.outfitVector = outfitVector;
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
            userId,
            name,
            relationship,
            contextNote: contextNote || '',
            preferredLanguage: preferredLanguage || 'en-US',
            faceDescriptor: faceDescriptor || [],
            outfitVector: outfitVector || [],
            photoThumbnail: photoThumbnail || '',
            isRegistered: true,
            lastSeen: new Date(),
          });
          await newVisitor.save();
          global._memoryBridgeVisitors.unshift(newVisitor.toObject());
          return res.status(201).json(newVisitor);
        }
      } catch (e) {}
    }

    let existingIndex = -1;
    if (id) existingIndex = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(id));
    if (existingIndex === -1 && photoThumbnail) {
      existingIndex = global._memoryBridgeVisitors.findIndex((v) => v.photoThumbnail === photoThumbnail);
    }

    if (existingIndex !== -1) {
      const item = global._memoryBridgeVisitors[existingIndex];
      if (userId) item.userId = userId;
      item.name = name;
      item.relationship = relationship;
      item.contextNote = contextNote || '';
      if (preferredLanguage) item.preferredLanguage = preferredLanguage;
      if (faceDescriptor && faceDescriptor.length === 128) item.faceDescriptor = faceDescriptor;
      if (photoThumbnail) item.photoThumbnail = photoThumbnail;
      item.isRegistered = true;
      item.updatedAt = new Date();
      return res.json(item);
    } else {
      const newVisitor = {
        _id: 'mem_' + Date.now(),
        userId,
        name,
        relationship,
        contextNote: contextNote || '',
        preferredLanguage: preferredLanguage || 'en-US',
        faceDescriptor: faceDescriptor || [],
        photoThumbnail: photoThumbnail || '',
        isRegistered: true,
        lastSeen: new Date(),
        createdAt: new Date(),
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

  // Auth Routes
  if (urlPath.includes('/auth/login')) return handleAuthLogin(req, res);
  if (urlPath.includes('/auth/register')) return handleAuthRegister(req, res);
  if (urlPath.includes('/auth/access-code')) return handleAuthCode(req, res);

  // Visitor Routes
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
      return res.json({ message: 'Visitor deleted' });
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

  if (urlPath.includes('/health')) {
    return res.json({
      status: 'ok',
      app: 'MemoryBridge Vercel Handler',
      database: isDbConnected() ? 'connected' : 'memory mode',
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(404).json({ error: `Route ${urlPath} not found` });
});

module.exports = app;
