const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Visitor = require('../models/Visitor');

global._memoryBridgeVisitors = global._memoryBridgeVisitors || [];

const DATA_DIR = path.join(__dirname, '../data');
const FILE_PATH = path.join(DATA_DIR, 'visitors.json');

try {
  if (fs.existsSync(FILE_PATH) && global._memoryBridgeVisitors.length === 0) {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    global._memoryBridgeVisitors = JSON.parse(raw);
  }
} catch (e) {}

const saveLocalVisitors = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(global._memoryBridgeVisitors, null, 2), 'utf8');
  } catch (e) {}
};

const isDbConnected = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

// Helper to extract userId
const getUserId = (req) => {
  return req.headers['x-user-id'] || req.query.userId || req.body?.userId || null;
};

// GET /api/visitors
router.get('/', async (req, res) => {
  try {
    const { registered } = req.query;
    const userId = getUserId(req);

    if (isDbConnected()) {
      try {
        let filter = {};
        if (userId) filter.userId = userId;
        if (registered === 'true') filter.isRegistered = true;
        if (registered === 'false') {
          filter.$or = [{ isRegistered: false }, { isRegistered: { $exists: false } }, { isRegistered: null }];
        }
        const visitors = await Visitor.find(filter).sort({ updatedAt: -1, createdAt: -1 });
        return res.json(visitors);
      } catch (dbErr) {
        console.warn('MongoDB query error, falling back to memory:', dbErr.message);
      }
    }

    let filtered = [...global._memoryBridgeVisitors];
    if (userId) filtered = filtered.filter((v) => !v.userId || String(v.userId) === String(userId));
    if (registered === 'true') filtered = filtered.filter((v) => v.isRegistered === true);
    if (registered === 'false') filtered = filtered.filter((v) => !v.isRegistered);

    filtered.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || b.lastSeen) -
        new Date(a.updatedAt || a.createdAt || a.lastSeen)
    );
    return res.json(filtered);
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ error: 'Failed to fetch visitors' });
  }
});

// GET /api/visitors/unknown
router.get('/unknown', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (isDbConnected()) {
      try {
        let filter = {
          $or: [{ isRegistered: false }, { isRegistered: { $exists: false } }, { isRegistered: null }],
        };
        if (userId) filter.userId = userId;
        const unknowns = await Visitor.find(filter).sort({ lastSeen: -1, createdAt: -1 });
        return res.json(unknowns);
      } catch (dbErr) {}
    }

    let unknowns = global._memoryBridgeVisitors.filter((v) => !v.isRegistered);
    if (userId) unknowns = unknowns.filter((v) => !v.userId || String(v.userId) === String(userId));
    unknowns.sort((a, b) => new Date(b.lastSeen || b.createdAt) - new Date(a.lastSeen || a.createdAt));
    return res.json(unknowns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unknown visitors' });
  }
});

// POST /api/visitors/unknown - Log unrecognized face snapshot
router.post('/unknown', async (req, res) => {
  try {
    const { photoThumbnail, faceDescriptor, outfitVector } = req.body;
    const userId = getUserId(req);

    if (!photoThumbnail) {
      return res.status(400).json({ error: 'photoThumbnail is required' });
    }

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
        saveLocalVisitors();
        return res.status(201).json(newVisitor);
      } catch (dbErr) {
        console.warn('MongoDB save error on unknown visitor:', dbErr.message);
      }
    }

    const newVisitor = {
      _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      ...newVisitorData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    global._memoryBridgeVisitors.unshift(newVisitor);
    saveLocalVisitors();
    return res.status(201).json(newVisitor);
  } catch (error) {
    console.error('Error logging unknown visitor:', error);
    res.status(500).json({ error: error.message || 'Failed to log unknown visitor' });
  }
});

// POST /api/visitors/register - Save or update registered visitor
router.post('/register', async (req, res) => {
  try {
    const { id, name, relationship, contextNote, faceDescriptor, outfitVector, photoThumbnail, preferredLanguage } = req.body;
    const userId = getUserId(req);

    if (!name || !relationship) {
      return res.status(400).json({ error: 'Name and Relationship are required' });
    }

    if (isDbConnected()) {
      try {
        let visitor;
        if (id) visitor = await Visitor.findById(id);
        if (!visitor && photoThumbnail) {
          let query = { photoThumbnail };
          if (userId) query.userId = userId;
          visitor = await Visitor.findOne(query);
        }

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
          if (idx !== -1) {
            global._memoryBridgeVisitors[idx] = visitor.toObject();
          } else {
            global._memoryBridgeVisitors.unshift(visitor.toObject());
          }
          saveLocalVisitors();

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
            lastSeen: new Date(),
          });
          await newVisitor.save();
          global._memoryBridgeVisitors.unshift(newVisitor.toObject());
          saveLocalVisitors();
          return res.status(201).json(newVisitor);
        }
      } catch (dbErr) {
        console.warn('MongoDB register error:', dbErr.message);
      }
    }

    let existingIndex = -1;
    if (id) {
      existingIndex = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(id));
    }
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
      saveLocalVisitors();
      return res.json(item);
    } else {
      const newVisitor = {
        _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
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
        updatedAt: new Date(),
      };
      global._memoryBridgeVisitors.unshift(newVisitor);
      saveLocalVisitors();
      return res.status(201).json(newVisitor);
    }
  } catch (error) {
    console.error('Error registering visitor:', error);
    res.status(500).json({ error: error.message || 'Failed to register visitor' });
  }
});

// DELETE /api/visitors/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      try {
        await Visitor.findByIdAndDelete(id);
      } catch (e) {}
    }
    global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter((v) => String(v._id) !== String(id));
    saveLocalVisitors();
    res.json({ message: 'Visitor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete visitor' });
  }
});

module.exports = router;
