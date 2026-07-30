const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Visitor = require('../models/Visitor');

// Use global object to preserve memory across Vercel serverless function warm starts
global._memoryBridgeVisitors = global._memoryBridgeVisitors || [];

const DATA_DIR = path.join(__dirname, '../data');
const FILE_PATH = path.join(DATA_DIR, 'visitors.json');

// Safely load initial file storage if writeable
try {
  if (fs.existsSync(FILE_PATH) && global._memoryBridgeVisitors.length === 0) {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    global._memoryBridgeVisitors = JSON.parse(raw);
  }
} catch (e) {
  // Ignore read errors on serverless environments
}

const saveLocalVisitors = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(global._memoryBridgeVisitors, null, 2), 'utf8');
  } catch (e) {
    // EROFS (Read-only file system on Vercel) -> Safely ignore disk write, keep in global memory
  }
};

const isDbConnected = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

// GET /api/visitors - Get all visitors (optional query ?registered=true/false)
router.get('/', async (req, res) => {
  try {
    const { registered } = req.query;

    if (isDbConnected()) {
      let filter = {};
      if (registered === 'true') filter.isRegistered = true;
      if (registered === 'false') {
        filter.$or = [{ isRegistered: false }, { isRegistered: { $exists: false } }, { isRegistered: null }];
      }

      const visitors = await Visitor.find(filter).sort({ updatedAt: -1, createdAt: -1 });
      return res.json(visitors);
    } else {
      let filtered = [...global._memoryBridgeVisitors];
      if (registered === 'true') filtered = filtered.filter((v) => v.isRegistered === true);
      if (registered === 'false') filtered = filtered.filter((v) => !v.isRegistered);

      filtered.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || b.lastSeen) -
          new Date(a.updatedAt || a.createdAt || a.lastSeen)
      );
      return res.json(filtered);
    }
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ error: 'Failed to fetch visitors' });
  }
});

// GET /api/visitors/unknown - Dedicated endpoint to fetch unrecognized visitor queue
router.get('/unknown', async (req, res) => {
  try {
    if (isDbConnected()) {
      const unknowns = await Visitor.find({
        $or: [{ isRegistered: false }, { isRegistered: { $exists: false } }, { isRegistered: null }],
      }).sort({ lastSeen: -1, createdAt: -1 });
      return res.json(unknowns);
    } else {
      const unknowns = global._memoryBridgeVisitors.filter((v) => !v.isRegistered);
      unknowns.sort((a, b) => new Date(b.lastSeen || b.createdAt) - new Date(a.lastSeen || a.createdAt));
      return res.json(unknowns);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unknown visitors' });
  }
});

// POST /api/visitors/unknown - Log an unrecognized face snapshot
router.post('/unknown', async (req, res) => {
  try {
    const { photoThumbnail, faceDescriptor } = req.body;
    if (!photoThumbnail) {
      return res.status(400).json({ error: 'photoThumbnail is required' });
    }

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
      const newVisitor = new Visitor(newVisitorData);
      await newVisitor.save();

      global._memoryBridgeVisitors.unshift(newVisitor.toObject());
      saveLocalVisitors();

      return res.status(201).json(newVisitor);
    } else {
      const newVisitor = {
        _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        ...newVisitorData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      global._memoryBridgeVisitors.unshift(newVisitor);
      saveLocalVisitors();
      return res.status(201).json(newVisitor);
    }
  } catch (error) {
    console.error('Error logging unknown visitor:', error);
    res.status(500).json({ error: 'Failed to log unknown visitor' });
  }
});

// POST /api/visitors/register - Save or update registered visitor
router.post('/register', async (req, res) => {
  try {
    const { id, name, relationship, contextNote, faceDescriptor, photoThumbnail } = req.body;

    if (!name || !relationship) {
      return res.status(400).json({ error: 'Name and Relationship are required' });
    }

    if (isDbConnected()) {
      let visitor;
      if (id) {
        visitor = await Visitor.findById(id);
      }
      if (!visitor && photoThumbnail) {
        visitor = await Visitor.findOne({ photoThumbnail });
      }

      if (visitor) {
        visitor.name = name;
        visitor.relationship = relationship;
        visitor.contextNote = contextNote || '';
        if (faceDescriptor && faceDescriptor.length) visitor.faceDescriptor = faceDescriptor;
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
          name,
          relationship,
          contextNote: contextNote || '',
          faceDescriptor: faceDescriptor || [],
          photoThumbnail: photoThumbnail || '',
          isRegistered: true,
          lastSeen: new Date(),
        });
        await newVisitor.save();
        global._memoryBridgeVisitors.unshift(newVisitor.toObject());
        saveLocalVisitors();
        return res.status(201).json(newVisitor);
      }
    } else {
      let existingIndex = -1;
      if (id) {
        existingIndex = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(id));
      }
      if (existingIndex === -1 && photoThumbnail) {
        existingIndex = global._memoryBridgeVisitors.findIndex((v) => v.photoThumbnail === photoThumbnail);
      }

      if (existingIndex !== -1) {
        const item = global._memoryBridgeVisitors[existingIndex];
        item.name = name;
        item.relationship = relationship;
        item.contextNote = contextNote || '';
        if (faceDescriptor && faceDescriptor.length) item.faceDescriptor = faceDescriptor;
        if (photoThumbnail) item.photoThumbnail = photoThumbnail;
        item.isRegistered = true;
        item.updatedAt = new Date();
        saveLocalVisitors();
        return res.json(item);
      } else {
        const newVisitor = {
          _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name,
          relationship,
          contextNote: contextNote || '',
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
    }
  } catch (error) {
    console.error('Error registering visitor:', error);
    res.status(500).json({ error: 'Failed to register visitor' });
  }
});

// DELETE /api/visitors/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      await Visitor.findByIdAndDelete(id);
    }
    global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter((v) => String(v._id) !== String(id));
    saveLocalVisitors();
    res.json({ message: 'Visitor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete visitor' });
  }
});

module.exports = router;
