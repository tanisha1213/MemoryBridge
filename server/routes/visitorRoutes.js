const express = require('express');
const router = express.Router();
const Visitor = require('../models/Visitor');

// In-memory storage fallback if MongoDB is not connected
let inMemoryVisitors = [];

const isDbConnected = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

// GET /api/visitors - Get all visitors (optional query ?registered=true/false)
router.get('/', async (req, res) => {
  try {
    const { registered } = req.query;
    let filter = {};
    if (registered === 'true') filter.isRegistered = true;
    if (registered === 'false') filter.isRegistered = false;

    if (isDbConnected()) {
      const visitors = await Visitor.find(filter).sort({ updatedAt: -1 });
      return res.json(visitors);
    } else {
      let filtered = [...inMemoryVisitors];
      if (registered === 'true') filtered = filtered.filter((v) => v.isRegistered);
      if (registered === 'false') filtered = filtered.filter((v) => !v.isRegistered);
      filtered.sort((a, b) => new Date(b.updatedAt || b.lastSeen) - new Date(a.updatedAt || a.lastSeen));
      return res.json(filtered);
    }
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ error: 'Failed to fetch visitors' });
  }
});

// POST /api/visitors/unknown - Log an unrecognized face snapshot
router.get('/unknown', async (req, res) => {
  // Alias GET unknown for convenience
  try {
    if (isDbConnected()) {
      const unknowns = await Visitor.find({ isRegistered: false }).sort({ lastSeen: -1 });
      return res.json(unknowns);
    } else {
      const unknowns = inMemoryVisitors.filter((v) => !v.isRegistered);
      return res.json(unknowns);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unknown visitors' });
  }
});

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
      return res.status(201).json(newVisitor);
    } else {
      const newVisitor = {
        _id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        ...newVisitorData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryVisitors.unshift(newVisitor);
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
        // Try finding by thumbnail if ID not matched
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
        return res.status(201).json(newVisitor);
      }
    } else {
      let existingIndex = -1;
      if (id) {
        existingIndex = inMemoryVisitors.findIndex((v) => v._id === id);
      }
      if (existingIndex === -1 && photoThumbnail) {
        existingIndex = inMemoryVisitors.findIndex((v) => v.photoThumbnail === photoThumbnail);
      }

      if (existingIndex !== -1) {
        const item = inMemoryVisitors[existingIndex];
        item.name = name;
        item.relationship = relationship;
        item.contextNote = contextNote || '';
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
          faceDescriptor: faceDescriptor || [],
          photoThumbnail: photoThumbnail || '',
          isRegistered: true,
          lastSeen: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        inMemoryVisitors.unshift(newVisitor);
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
    } else {
      inMemoryVisitors = inMemoryVisitors.filter((v) => v._id !== id);
    }
    res.json({ message: 'Visitor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete visitor' });
  }
});

module.exports = router;
