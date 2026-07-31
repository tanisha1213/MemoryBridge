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

global._memoryBridgeUsers = global._memoryBridgeUsers || [];
global._memoryBridgeVisitors = global._memoryBridgeVisitors || [];
global._memoryBridgeReminders = global._memoryBridgeReminders || [];

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
      let user = await User.findOne({ email: cleanEmail });
      if (user) {
        if (user.password === password) return res.json(user);
        return res.status(401).json({ error: 'Incorrect password for this email' });
      } else {
        const accessCode = 'MB-' + Math.floor(1000 + Math.random() * 9000);
        const newUser = new User({ email: cleanEmail, password, patientName: 'Elder Patient', accessCode, nativeLanguage: 'en-US' });
        await newUser.save();
        return res.status(201).json(newUser);
      }
    } catch (e) {}
  }

  const memUser = global._memoryBridgeUsers.find((u) => u.email === cleanEmail);
  if (memUser) {
    if (memUser.password === password) return res.json(memUser);
    return res.status(401).json({ error: 'Incorrect password for this email' });
  }

  const accessCode = 'MB-' + Math.floor(1000 + Math.random() * 9000);
  const newUser = { _id: 'usr_' + Date.now(), email: cleanEmail, password, patientName: 'Elder Patient', accessCode, nativeLanguage: 'en-US' };
  global._memoryBridgeUsers.unshift(newUser);
  return res.status(201).json(newUser);
};

const handleAuthRegister = async (req, res) => {
  const { email, password, patientName, nativeLanguage } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const cleanEmail = email.toLowerCase().trim();

  if (isDbConnected()) {
    try {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        if (existing.password === password) return res.json(existing);
        return res.status(400).json({ error: 'This email is already registered. Incorrect password entered.' });
      }
      const accessCode = 'MB-' + Math.floor(1000 + Math.random() * 9000);
      const newUser = new User({ email: cleanEmail, password, patientName: patientName || 'Elder Patient', accessCode, nativeLanguage: nativeLanguage || 'en-US' });
      await newUser.save();
      return res.status(201).json(newUser);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Failed to register account' });
    }
  }

  const existingMem = global._memoryBridgeUsers.find((u) => u.email === cleanEmail);
  if (existingMem) {
    if (existingMem.password === password) return res.json(existingMem);
    return res.status(400).json({ error: 'This email is already registered. Incorrect password entered.' });
  }

  const accessCode = 'MB-' + Math.floor(1000 + Math.random() * 9000);
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

  const fallbackUser = {
    _id: 'usr_code_' + cleanCode.replace(/[^a-zA-Z0-9]/g, ''),
    email: `${cleanCode.toLowerCase()}@memorybridge.local`,
    password: 'autogenerated',
    patientName: 'Elder Patient',
    accessCode: cleanCode,
    nativeLanguage: 'en-US',
  };
  global._memoryBridgeUsers.unshift(fallbackUser);
  return res.json(fallbackUser);
};

const getUserId = (req) => {
  const val = req.headers['x-user-id'] || req.query.userId || req.body?.userId || null;
  return (!val || val === 'null' || val === 'undefined') ? null : val;
};

const getFamilyCode = (req) => {
  const val = req.headers['x-family-code'] || req.query.familyCode || req.body?.familyCode || req.body?.accessCode || req.params?.familyCode || null;
  return (!val || val === 'null' || val === 'undefined') ? 'MB-1001' : val.toUpperCase().trim();
};

async function getVisitors(registeredQuery, userId, familyCode) {
  if (isDbConnected()) {
    try {
      let filter = {};
      const conditions = [];
      if (userId) conditions.push({ userId });
      if (familyCode) conditions.push({ familyCode });

      if (conditions.length > 0) {
        filter.$or = conditions;
      } else {
        return [];
      }

      if (registeredQuery === 'true') filter.isRegistered = true;
      if (registeredQuery === 'false') {
        filter.isRegistered = { $ne: true };
      }
      return await Visitor.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    } catch (e) {}
  }

  let filtered = global._memoryBridgeVisitors.filter((v) => {
    if (userId && String(v.userId) === String(userId)) return true;
    if (familyCode && String(v.familyCode) === String(familyCode)) return true;
    return false;
  });
  if (registeredQuery === 'true') filtered = filtered.filter((v) => v.isRegistered === true);
  if (registeredQuery === 'false') filtered = filtered.filter((v) => !v.isRegistered);
  filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || b.lastSeen) - new Date(a.updatedAt || a.createdAt || a.lastSeen));
  return filtered;
}

const handleVisitorsGet = async (req, res) => {
  try {
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);
    const list = await getVisitors(req.query.registered, userId, familyCode);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch visitors' });
  }
};

const handleUnknownPost = async (req, res) => {
  try {
    const { photoThumbnail, faceDescriptor, outfitVector } = req.body;
    const userId = getUserId(req);
    const familyCode = req.body?.familyCode || getFamilyCode(req);
    if (!photoThumbnail) return res.status(400).json({ error: 'photoThumbnail required' });

    const initialDescriptors = faceDescriptor && faceDescriptor.length === 128 ? [faceDescriptor] : [];
    const newVisitorData = {
      userId,
      familyCode,
      name: 'Unrecognized Person',
      relationship: 'Unknown',
      contextNote: 'Captured by patient camera',
      faceDescriptor: faceDescriptor || [],
      faceDescriptors: initialDescriptors,
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

const handleAppendVectorPost = async (req, res) => {
  try {
    const { visitorId, unknownSnapshotId, newDescriptor, newOutfitVector } = req.body;
    if (!visitorId || !newDescriptor || newDescriptor.length !== 128) {
      return res.status(400).json({ error: 'visitorId and valid 128-D newDescriptor are required' });
    }

    if (isDbConnected()) {
      try {
        const visitor = await Visitor.findById(visitorId);
        if (visitor) {
          if (!visitor.faceDescriptors) visitor.faceDescriptors = [];
          if (visitor.faceDescriptor && visitor.faceDescriptor.length === 128 && visitor.faceDescriptors.length === 0) {
            visitor.faceDescriptors.push(visitor.faceDescriptor);
          }
          visitor.faceDescriptors.push(newDescriptor);
          visitor.faceDescriptor = newDescriptor;
          if (newOutfitVector && newOutfitVector.length === 3) visitor.outfitVector = newOutfitVector;
          visitor.lastSeen = new Date();
          await visitor.save();

          if (unknownSnapshotId) {
            try {
              await Visitor.findByIdAndDelete(unknownSnapshotId);
            } catch (e) {}
          }

          global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter(
            (v) => String(v._id) !== String(unknownSnapshotId)
          );
          const idx = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(visitorId));
          if (idx !== -1) global._memoryBridgeVisitors[idx] = visitor.toObject();

          return res.json(visitor);
        }
      } catch (e) {}
    }

    const idx = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(visitorId));
    if (idx !== -1) {
      const item = global._memoryBridgeVisitors[idx];
      if (!item.faceDescriptors) item.faceDescriptors = [];
      item.faceDescriptors.push(newDescriptor);
      item.faceDescriptor = newDescriptor;
      if (newOutfitVector && newOutfitVector.length === 3) item.outfitVector = newOutfitVector;
      item.lastSeen = new Date();

      if (unknownSnapshotId) {
        global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter(
          (v) => String(v._id) !== String(unknownSnapshotId)
        );
      }
      return res.json(item);
    }

    return res.status(404).json({ error: 'Visitor profile not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to append vector' });
  }
};

const handleRegisterPost = async (req, res) => {
  try {
    const { id, name, relationship, contextNote, faceDescriptor, outfitVector, photoThumbnail, preferredLanguage, familyCode } = req.body;
    const userId = getUserId(req);

    if (!name || !relationship) return res.status(400).json({ error: 'Name and Relationship required' });

    if (isDbConnected()) {
      try {
        let visitor;
        if (id) visitor = await Visitor.findById(id);
        if (!visitor && photoThumbnail) visitor = await Visitor.findOne({ photoThumbnail });

        if (visitor) {
          if (userId) visitor.userId = userId;
          if (familyCode) visitor.familyCode = familyCode;
          visitor.name = name;
          visitor.relationship = relationship;
          visitor.contextNote = contextNote || '';
          if (preferredLanguage) visitor.preferredLanguage = preferredLanguage;
          if (faceDescriptor && faceDescriptor.length === 128) {
            visitor.faceDescriptor = faceDescriptor;
            if (!visitor.faceDescriptors) visitor.faceDescriptors = [];
            visitor.faceDescriptors.push(faceDescriptor);
          }
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
          const initialDescriptors = faceDescriptor && faceDescriptor.length === 128 ? [faceDescriptor] : [];
          const newVisitor = new Visitor({
            userId,
            familyCode: familyCode || 'MB-1001',
            name,
            relationship,
            contextNote: contextNote || '',
            preferredLanguage: preferredLanguage || 'en-US',
            faceDescriptor: faceDescriptor || [],
            faceDescriptors: initialDescriptors,
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
      if (familyCode) item.familyCode = familyCode;
      item.name = name;
      item.relationship = relationship;
      item.contextNote = contextNote || '';
      if (preferredLanguage) item.preferredLanguage = preferredLanguage;
      if (faceDescriptor && faceDescriptor.length === 128) {
        item.faceDescriptor = faceDescriptor;
        if (!item.faceDescriptors) item.faceDescriptors = [];
        item.faceDescriptors.push(faceDescriptor);
      }
      if (photoThumbnail) item.photoThumbnail = photoThumbnail;
      item.isRegistered = true;
      item.updatedAt = new Date();
      return res.json(item);
    } else {
      const newVisitor = {
        _id: 'mem_' + Date.now(),
        userId,
        familyCode,
        name,
        relationship,
        contextNote: contextNote || '',
        preferredLanguage: preferredLanguage || 'en-US',
        faceDescriptor: faceDescriptor || [],
        faceDescriptors: faceDescriptor && faceDescriptor.length === 128 ? [faceDescriptor] : [],
        photoThumbnail: photoThumbnail || '',
        isRegistered: true,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      global._memoryBridgeVisitors.unshift(newVisitor);
      return res.status(201).json(newVisitor);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to register visitor' });
  }
};

const handleMatchVectorPost = async (req, res) => {
  try {
    const { liveDescriptor } = req.body;
    const familyCode = getFamilyCode(req);

    if (!liveDescriptor || liveDescriptor.length !== 128) {
      return res.status(400).json({ error: 'Valid 128-D liveDescriptor vector is required' });
    }

    let visitors = [];
    if (isDbConnected()) {
      visitors = await Visitor.find({ ...(familyCode ? { familyCode } : {}), isRegistered: true }).lean();
    } else {
      visitors = global._memoryBridgeVisitors.filter((v) => (!familyCode || v.familyCode === familyCode) && v.isRegistered);
    }

    let bestMatch = null;
    let maxSimilarity = -1;

    for (const visitor of visitors) {
      const descriptors = visitor.faceDescriptors || (visitor.faceDescriptor ? [visitor.faceDescriptor] : []);
      for (const descriptorArray of descriptors) {
        if (descriptorArray && descriptorArray.length === 128) {
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < 128; i++) {
            dot += liveDescriptor[i] * descriptorArray[i];
            normA += liveDescriptor[i] ** 2;
            normB += descriptorArray[i] ** 2;
          }
          const sim = normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : -1;
          if (sim > maxSimilarity) {
            maxSimilarity = sim;
            bestMatch = visitor;
          }
        }
      }
    }

    if (bestMatch && maxSimilarity > 0.82) {
      return res.json({ matched: true, visitor: bestMatch, similarity: maxSimilarity });
    }

    return res.json({ matched: false, visitor: null, similarity: maxSimilarity });
  } catch (err) {
    res.status(500).json({ error: 'Server vector match failed' });
  }
};

const handleRecognizeAndSnapshotPost = async (req, res) => {
  try {
    const familyCode = getFamilyCode(req);
    const { image, photoThumbnail, saveSnapshot } = req.body;
    const imageB64 = image || photoThumbnail;

    if (!imageB64) {
      return res.status(400).json({ error: 'image base64 string is required' });
    }

    if (saveSnapshot) {
      const unknownDoc = {
        userId: getUserId(req),
        familyCode,
        name: 'Unrecognized Person',
        relationship: 'Unknown',
        photoThumbnail: imageB64,
        isRegistered: false,
        status: 'PENDING_REVIEW',
        createdAt: new Date()
      };
      if (isDbConnected()) {
        try {
          const newV = new Visitor(unknownDoc);
          await newV.save();
          global._memoryBridgeVisitors.unshift(newV.toObject());
        } catch (e) {}
      } else {
        global._memoryBridgeVisitors.unshift({ _id: 'mem_' + Date.now(), ...unknownDoc });
      }
      return res.json({ status: 'UNKNOWN', snapshotSaved: true });
    }

    return res.json({ status: 'UNKNOWN', snapshotSaved: false });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Recognition failed' });
  }
};

app.all('*', async (req, res) => {
  try {
    await connectDB().catch(() => {});
  } catch (e) {}

  const urlPath = req.path || req.url || '';
  const method = req.method.toUpperCase();

  // Auth Routes
  if (urlPath.includes('/auth/login')) return handleAuthLogin(req, res);
  if (urlPath.includes('/auth/register')) return handleAuthRegister(req, res);
  if (urlPath.includes('/auth/access-code')) return handleAuthCode(req, res);

  // Visitor Routes
  if (urlPath.includes('/visitors/match-vector')) {
    if (method === 'POST') return handleMatchVectorPost(req, res);
  }

  if (urlPath.includes('/visitors/append-vector')) {
    if (method === 'POST') return handleAppendVectorPost(req, res);
  }

  if (urlPath.includes('/recognize-and-snapshot')) {
    if (method === 'POST') return handleRecognizeAndSnapshotPost(req, res);
  }

  if (urlPath.includes('/visitors/unknown') || urlPath.includes('/visitors/unknowns')) {
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
    const parts = urlPath.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (method === 'DELETE' && lastPart && lastPart !== 'reminders') {
      if (isDbConnected()) {
        try { await Reminder.findByIdAndDelete(lastPart); } catch (e) {}
      }
      global._memoryBridgeReminders = global._memoryBridgeReminders.filter((r) => String(r._id) !== String(lastPart));
      return res.json({ message: 'Reminder deleted' });
    }

    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);
    if (method === 'GET') {
      if (!userId && !familyCode) return res.json([]);
      if (isDbConnected()) {
        try {
          const filter = { $or: [...(userId ? [{ userId }] : []), ...(familyCode ? [{ familyCode }] : [])] };
          const items = await Reminder.find(filter).sort({ createdAt: 1 });
          return res.json(items);
        } catch (e) {}
      }
      const filtered = global._memoryBridgeReminders.filter((r) => {
        if (userId && String(r.userId) === String(userId)) return true;
        if (familyCode && String(r.familyCode) === String(familyCode)) return true;
        return false;
      });
      return res.json(filtered);
    }
    if (method === 'POST') {
      const { title, time } = req.body;
      const reminderData = { userId, familyCode, title, time, isCompleted: false };
      if (isDbConnected()) {
        try {
          const newRem = new Reminder(reminderData);
          await newRem.save();
          global._memoryBridgeReminders.push(newRem.toObject());
          return res.status(201).json(newRem);
        } catch (e) {}
      }
      const reminder = { _id: 'rem_' + Date.now(), ...reminderData, createdAt: new Date() };
      global._memoryBridgeReminders.push(reminder);
      return res.status(201).json(reminder);
    }
  }

  if (urlPath.includes('/settings')) {
    const familyCode = getFamilyCode(req);
    return res.json({ nativeLanguage: 'hi-IN', familyCode: familyCode || 'MB-1001' });
  }

  if (urlPath.includes('/tts/stream')) {
    const text = req.query.text || '';
    const lang = req.query.lang || 'hi';
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang.split('-')[0]}&client=tw-ob`;
    const https = require('https');
    https.get(googleTtsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (stream) => {
      res.set('Content-Type', 'audio/mpeg');
      stream.pipe(res);
    }).on('error', (err) => {
      res.status(500).json({ error: 'TTS stream failed' });
    });
    return;
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
