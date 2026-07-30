const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');

let inMemoryReminders = [
  {
    _id: 'rem_1',
    title: 'Drink Water',
    time: '2:00 PM',
    isCompleted: false,
    createdAt: new Date(),
  },
  {
    _id: 'rem_2',
    title: 'Take Afternoon Medication',
    time: '3:30 PM',
    isCompleted: false,
    createdAt: new Date(),
  },
  {
    _id: 'rem_3',
    title: 'Evening Walk in Garden',
    time: '5:30 PM',
    isCompleted: false,
    createdAt: new Date(),
  },
];

const isDbConnected = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

// GET /api/reminders
router.get('/', async (req, res) => {
  try {
    if (isDbConnected()) {
      const reminders = await Reminder.find().sort({ createdAt: 1 });
      return res.json(reminders);
    } else {
      return res.json(inMemoryReminders);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// POST /api/reminders
router.post('/', async (req, res) => {
  try {
    const { title, time } = req.body;
    if (!title || !time) {
      return res.status(400).json({ error: 'Title and time are required' });
    }

    if (isDbConnected()) {
      const reminder = new Reminder({ title, time, isCompleted: false });
      await reminder.save();
      return res.status(201).json(reminder);
    } else {
      const reminder = {
        _id: 'rem_' + Date.now(),
        title,
        time,
        isCompleted: false,
        createdAt: new Date(),
      };
      inMemoryReminders.push(reminder);
      return res.status(201).json(reminder);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PATCH /api/reminders/:id - toggle status
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { isCompleted } = req.body;

    if (isDbConnected()) {
      const reminder = await Reminder.findById(id);
      if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
      if (typeof isCompleted === 'boolean') {
        reminder.isCompleted = isCompleted;
      } else {
        reminder.isCompleted = !reminder.isCompleted;
      }
      await reminder.save();
      return res.json(reminder);
    } else {
      const reminder = inMemoryReminders.find((r) => r._id === id);
      if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
      reminder.isCompleted = typeof isCompleted === 'boolean' ? isCompleted : !reminder.isCompleted;
      return res.json(reminder);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isDbConnected()) {
      await Reminder.findByIdAndDelete(id);
    } else {
      inMemoryReminders = inMemoryReminders.filter((r) => r._id !== id);
    }
    res.json({ message: 'Reminder deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
