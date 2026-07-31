const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');

global._memoryBridgeReminders = global._memoryBridgeReminders || [];

const isDbConnected = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

// Helper to extract userId and familyCode
const getUserId = (req) => req.headers['x-user-id'] || req.query.userId || req.body?.userId || null;
const getFamilyCode = (req) => req.headers['x-family-code'] || req.query.familyCode || req.body?.familyCode || null;

// GET /api/reminders - Strict Family Isolation
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);

    if (!userId && !familyCode) {
      return res.json([]);
    }

    if (isDbConnected()) {
      try {
        const filter = {
          $or: [
            ...(userId ? [{ userId }] : []),
            ...(familyCode ? [{ familyCode }] : []),
          ],
        };
        const reminders = await Reminder.find(filter).sort({ createdAt: 1 });
        return res.json(reminders);
      } catch (dbErr) {}
    }

    const filtered = global._memoryBridgeReminders.filter((r) => {
      if (userId && String(r.userId) === String(userId)) return true;
      if (familyCode && String(r.familyCode) === String(familyCode)) return true;
      return false;
    });
    return res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// POST /api/reminders - Save Reminder to specific User/Family
router.post('/', async (req, res) => {
  try {
    const { title, time } = req.body;
    const userId = getUserId(req);
    const familyCode = getFamilyCode(req);

    if (!title || !time) {
      return res.status(400).json({ error: 'Title and time are required' });
    }

    const reminderData = {
      userId,
      familyCode,
      title,
      time,
      isCompleted: false,
    };

    if (isDbConnected()) {
      try {
        const newReminder = new Reminder(reminderData);
        await newReminder.save();
        global._memoryBridgeReminders.push(newReminder.toObject());
        return res.status(201).json(newReminder);
      } catch (dbErr) {}
    }

    const newReminder = {
      _id: 'rem_' + Date.now(),
      ...reminderData,
      createdAt: new Date(),
    };
    global._memoryBridgeReminders.push(newReminder);
    return res.status(201).json(newReminder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      try {
        await Reminder.findByIdAndDelete(id);
      } catch (e) {}
    }
    global._memoryBridgeReminders = global._memoryBridgeReminders.filter((r) => String(r._id) !== String(id));
    return res.json({ message: 'Reminder deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
