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

// Helper to extract userId and familyCode from request
const getUserId = (req) => {
  const val = req.headers['x-user-id'] || req.query.userId || req.body?.userId || null;
  return (!val || val === 'null' || val === 'undefined') ? null : val;
};

const getFamilyCode = (req) => {
  const val = req.headers['x-family-code'] || req.query.familyCode || req.body?.familyCode || req.body?.accessCode || req.params?.familyCode || null;
  return (!val || val === 'null' || val === 'undefined') ? 'MB-1001' : val.toUpperCase().trim();
};

// Server-Side Cosine Similarity Vector Matching Route
router.post(['/match-vector', '/:familyCode/match-vector'], async (req, res) => {
  try {
    const { liveDescriptor } = req.body;
    const familyCode = req.params.familyCode || getFamilyCode(req);

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
});

// Express Route: Proxy or Execute Recognition & Snapshot
router.post(['/recognize-and-snapshot', '/:familyCode/recognize-and-snapshot'], async (req, res) => {
  try {
    const familyCode = req.params.familyCode || getFamilyCode(req);
    const { image, photoThumbnail, saveSnapshot } = req.body;
    const imageB64 = image || photoThumbnail;

    if (!imageB64) {
      return res.status(400).json({ error: 'image base64 string is required' });
    }

    // 1. Try forwarding to Python dlib microservice on port 5001 first
    try {
      const axios = require('axios');
      const pyRes = await axios.post('http://localhost:5001/api/visitors/recognize', {
        familyCode,
        image: imageB64,
        saveSnapshot: !!saveSnapshot
      }, { timeout: 2500 });

      if (pyRes.status === 200 && pyRes.data) {
        return res.json(pyRes.data);
      }
    } catch (pyErr) {}

    // 2. Express Server Fallback: Query MongoDB Atlas
    let registeredVisitors = [];
    if (isDbConnected()) {
      registeredVisitors = await Visitor.find({ familyCode, isRegistered: true }).lean();
    } else {
      registeredVisitors = global._memoryBridgeVisitors.filter(v => v.familyCode === familyCode && v.isRegistered);
    }

    if (!registeredVisitors || registeredVisitors.length === 0) {
      if (saveSnapshot) {
        const unknownDoc = {
          familyCode,
          name: 'Unrecognized Person',
          relationship: 'Unknown',
          photoThumbnail: imageB64,
          isRegistered: false,
          status: 'PENDING_REVIEW',
          createdAt: new Date()
        };
        if (isDbConnected()) {
          const newV = new Visitor(unknownDoc);
          await newV.save();
        } else {
          global._memoryBridgeVisitors.unshift({ _id: 'mem_' + Date.now(), ...unknownDoc });
        }
      }
      return res.json({ status: 'UNKNOWN', snapshotSaved: !!saveSnapshot });
    }

    return res.json({ status: 'UNKNOWN', snapshotSaved: false });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Recognition route failed' });
  }
});

// GET /api/visitors - Account & Family Isolated Query
router.get('/', async (req, res) => {
  try {
    const { registered } = req.query;
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);

    if (!userId && !familyCode) {
      return res.json([]);
    }

    if (isDbConnected()) {
      try {
        let filter = {};
        const conditions = [];
        if (userId) conditions.push({ userId });
        if (familyCode) conditions.push({ familyCode });

        if (conditions.length > 0) {
          filter.$or = conditions;
        }

        if (registered === 'true') filter.isRegistered = true;
        if (registered === 'false') filter.isRegistered = { $ne: true };

        const visitors = await Visitor.find(filter).sort({ updatedAt: -1, createdAt: -1 });
        return res.json(visitors);
      } catch (dbErr) {
        console.warn('MongoDB query error, falling back to memory:', dbErr.message);
      }
    }

    let filtered = global._memoryBridgeVisitors.filter((v) => {
      if (userId && String(v.userId) === String(userId)) return true;
      if (familyCode && String(v.familyCode) === String(familyCode)) return true;
      return false;
    });

    if (registered === 'true') filtered = filtered.filter((v) => v.isRegistered === true);
    if (registered === 'false') filtered = filtered.filter((v) => !v.isRegistered);

    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || b.lastSeen) - new Date(a.updatedAt || a.createdAt || a.lastSeen));
    return res.json(filtered);
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ error: 'Failed to fetch visitors' });
  }
});

// Express Route: Fetch Unknown Visitors for Caregiver Review
router.get(['/unknowns', '/:familyCode/unknowns'], async (req, res) => {
  try {
    const familyCode = req.params.familyCode || getFamilyCode(req);
    const userId = getUserId(req);

    if (isDbConnected()) {
      try {
        const unknowns = await Visitor.find({ isRegistered: { $ne: true } }).sort({ createdAt: -1, updatedAt: -1 }).lean();
        return res.json(unknowns || []);
      } catch (e) {}
    }

    const filtered = (global._memoryBridgeVisitors || []).filter((v) => !v.isRegistered);
    return res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unknown visitor queue' });
  }
});

// GET /api/visitors/unknown
router.get('/unknown', async (req, res) => {
  try {
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);

    if (!userId && !familyCode) {
      return res.json([]);
    }

    if (isDbConnected()) {
      try {
        let filter = {
          isRegistered: false,
          $or: [
            ...(userId ? [{ userId }] : []),
            ...(familyCode ? [{ familyCode }] : []),
          ],
        };
        const unknowns = await Visitor.find(filter).sort({ lastSeen: -1, createdAt: -1 });
        return res.json(unknowns);
      } catch (dbErr) {}
    }

    let unknowns = global._memoryBridgeVisitors.filter((v) => {
      if (v.isRegistered) return false;
      if (userId && String(v.userId) === String(userId)) return true;
      if (familyCode && String(v.familyCode) === String(familyCode)) return true;
      return false;
    });
    unknowns.sort((a, b) => new Date(b.lastSeen || b.createdAt) - new Date(a.lastSeen || a.createdAt));
    return res.json(unknowns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unknown visitors' });
  }
});

// POST /api/visitors/unknown or POST /api/visitors/:familyCode/unknown - Log unrecognized face snapshot with Account Isolation
router.post(['/unknown', '/:familyCode/unknown'], async (req, res) => {
  try {
    const { photoThumbnail, faceDescriptor, outfitVector } = req.body;
    const userId = getUserId(req);
    const familyCode = req.params.familyCode || req.body?.familyCode || getFamilyCode(req);

    if (!photoThumbnail) {
      return res.status(400).json({ error: 'photoThumbnail is required' });
    }

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
        saveLocalVisitors();

        if (req.io) {
          const roomKey = userId || familyCode;
          if (roomKey) {
            req.io.to(roomKey).emit('UNKNOWN_VISITOR_DETECTED', { ...newVisitor.toObject(), timestamp: new Date() });
          } else {
            req.io.emit('UNKNOWN_VISITOR_DETECTED', { ...newVisitor.toObject(), timestamp: new Date() });
          }
        }

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

    if (req.io) {
      const roomKey = userId || familyCode;
      if (roomKey) {
        req.io.to(roomKey).emit('UNKNOWN_VISITOR_DETECTED', { ...newVisitor, timestamp: new Date() });
      } else {
        req.io.emit('UNKNOWN_VISITOR_DETECTED', { ...newVisitor, timestamp: new Date() });
      }
    }

    return res.status(201).json(newVisitor);
  } catch (error) {
    console.error('Error logging unknown visitor:', error);
    res.status(500).json({ error: error.message || 'Failed to log unknown visitor' });
  }
});

// POST /api/visitors/append-vector - Continuous Learning (Multi-Vector Array)
router.post('/append-vector', async (req, res) => {
  try {
    const { visitorId, unknownSnapshotId, newDescriptor, newOutfitVector } = req.body;
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);

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
          if (userId) visitor.userId = userId;
          if (familyCode) visitor.familyCode = familyCode;
          visitor.lastSeen = new Date();
          await visitor.save();

          if (unknownSnapshotId) {
            try { await Visitor.findByIdAndDelete(unknownSnapshotId); } catch (e) {}
          }

          global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter(
            (v) => String(v._id) !== String(unknownSnapshotId)
          );
          const idx = global._memoryBridgeVisitors.findIndex((v) => String(v._id) === String(visitorId));
          if (idx !== -1) {
            global._memoryBridgeVisitors[idx] = visitor.toObject();
          }
          saveLocalVisitors();
          return res.json(visitor);
        }
      } catch (dbErr) {
        console.warn('MongoDB append-vector error:', dbErr.message);
      }
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
      saveLocalVisitors();
      return res.json(item);
    }

    return res.status(404).json({ error: 'Registered visitor profile not found' });
  } catch (error) {
    console.error('Error appending vector:', error);
    res.status(500).json({ error: 'Failed to merge pose vector to profile' });
  }
});

// POST /api/visitors/register - Save or update registered visitor
router.post('/register', async (req, res) => {
  try {
    const { id, name, relationship, contextNote, faceDescriptor, outfitVector, photoThumbnail, preferredLanguage } = req.body;
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);

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
          if (idx !== -1) {
            global._memoryBridgeVisitors[idx] = visitor.toObject();
          } else {
            global._memoryBridgeVisitors.unshift(visitor.toObject());
          }
          saveLocalVisitors();
          return res.json(visitor);
        } else {
          const initialDescriptors = faceDescriptor && faceDescriptor.length === 128 ? [faceDescriptor] : [];
          const newVisitor = new Visitor({
            userId,
            familyCode,
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
      item.name = name;
      item.relationship = relationship;
      item.contextNote = contextNote || '';
      if (preferredLanguage) item.preferredLanguage = preferredLanguage;
      if (faceDescriptor && faceDescriptor.length === 128) {
        item.faceDescriptor = faceDescriptor;
        if (!item.faceDescriptors) item.faceDescriptors = [];
        item.faceDescriptors.push(faceDescriptor);
      }
      if (outfitVector && outfitVector.length === 3) item.outfitVector = outfitVector;
      if (photoThumbnail) item.photoThumbnail = photoThumbnail;
      item.isRegistered = true;
      if (userId) item.userId = userId;
      if (familyCode) item.familyCode = familyCode;
      item.lastSeen = new Date();
      saveLocalVisitors();
      return res.json(item);
    }

    const initialDescriptors = faceDescriptor && faceDescriptor.length === 128 ? [faceDescriptor] : [];
    const newVisitor = {
      _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      userId,
      familyCode,
      name,
      relationship,
      contextNote: contextNote || '',
      preferredLanguage: preferredLanguage || 'en-US',
      faceDescriptor: faceDescriptor || [],
      faceDescriptors: initialDescriptors,
      outfitVector: outfitVector || [],
      photoThumbnail: photoThumbnail || '',
      isRegistered: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeen: new Date(),
    };
    global._memoryBridgeVisitors.unshift(newVisitor);
    saveLocalVisitors();
    return res.status(201).json(newVisitor);
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
      try {
        await Visitor.findByIdAndDelete(id);
      } catch (e) {}
    }
    global._memoryBridgeVisitors = global._memoryBridgeVisitors.filter((v) => String(v._id) !== String(id));
    saveLocalVisitors();
    return res.json({ message: 'Visitor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete visitor' });
  }
});

module.exports = router;
