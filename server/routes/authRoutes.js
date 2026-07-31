const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Helper to generate 6-character Family Access Code
const generateAccessCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MB-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Global memory cache for demo/offline auth fallback
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

const isDbConnected = () => {
  const mongoose = require('mongoose');
  return mongoose.connection.readyState === 1;
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, patientName, nativeLanguage } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const accessCode = generateAccessCode();
    const userData = {
      email: email.toLowerCase().trim(),
      password,
      patientName: patientName || 'Elder Patient',
      accessCode,
      nativeLanguage: nativeLanguage || 'en-US',
    };

    if (isDbConnected()) {
      try {
        const existing = await User.findOne({ email: userData.email });
        if (existing) {
          return res.status(400).json({ error: 'An account with this email already exists' });
        }
        const newUser = new User(userData);
        await newUser.save();
        global._memoryBridgeUsers.unshift(newUser.toObject());
        return res.status(201).json(newUser);
      } catch (dbErr) {
        console.warn('MongoDB register user error:', dbErr.message);
        if (dbErr.code === 11000) {
          return res.status(400).json({ error: 'An account with this email already exists' });
        }
        return res.status(400).json({ error: dbErr.message || 'Failed to register account' });
      }
    }

    // Memory Fallback
    const existingMem = global._memoryBridgeUsers.find((u) => u.email === userData.email);
    if (existingMem) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const newUser = {
      _id: 'usr_' + Date.now(),
      ...userData,
      createdAt: new Date(),
    };
    global._memoryBridgeUsers.unshift(newUser);
    return res.status(201).json(newUser);
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login - Caregiver Login (Auto-creates account if new email)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (isDbConnected()) {
      try {
        let user = await User.findOne({ email: cleanEmail });
        if (user) {
          if (user.password === password) {
            return res.json(user);
          } else {
            return res.status(401).json({ error: 'Incorrect password for this email' });
          }
        } else {
          // Auto-register new family if email doesn't exist yet
          const accessCode = generateAccessCode();
          const newUser = new User({
            email: cleanEmail,
            password,
            patientName: 'Elder Patient',
            accessCode,
            nativeLanguage: 'en-US',
          });
          await newUser.save();
          global._memoryBridgeUsers.unshift(newUser.toObject());
          return res.status(201).json(newUser);
        }
      } catch (dbErr) {
        console.warn('MongoDB login error:', dbErr.message);
      }
    }

    let memUser = global._memoryBridgeUsers.find((u) => u.email === cleanEmail);
    if (memUser) {
      if (memUser.password === password) {
        return res.json(memUser);
      } else {
        return res.status(401).json({ error: 'Incorrect password for this email' });
      }
    }

    // Fallback auto-create user in memory
    const accessCode = generateAccessCode();
    const newUser = {
      _id: 'usr_' + Date.now(),
      email: cleanEmail,
      password,
      patientName: 'Elder Patient',
      accessCode,
      nativeLanguage: 'en-US',
      createdAt: new Date(),
    };
    global._memoryBridgeUsers.unshift(newUser);
    return res.status(201).json(newUser);
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// POST /api/auth/access-code (Patient Mirror device quick login)
router.post('/access-code', async (req, res) => {
  try {
    const { accessCode } = req.body;
    if (!accessCode) {
      return res.status(400).json({ error: 'Access Code is required' });
    }

    const cleanCode = accessCode.toUpperCase().trim();

    if (isDbConnected()) {
      try {
        const user = await User.findOne({ accessCode: cleanCode });
        if (user) return res.json(user);
      } catch (e) {}
    }

    const memUser = global._memoryBridgeUsers.find((u) => u.accessCode === cleanCode);
    if (memUser) return res.json(memUser);

    // Auto-create room for new access code
    const fallbackUser = {
      _id: 'usr_code_' + cleanCode.replace(/[^a-zA-Z0-9]/g, ''),
      email: `${cleanCode.toLowerCase()}@memorybridge.local`,
      password: 'autogenerated',
      patientName: 'Elder Patient',
      accessCode: cleanCode,
      nativeLanguage: 'en-US',
      createdAt: new Date(),
    };
    global._memoryBridgeUsers.unshift(fallbackUser);
    return res.json(fallbackUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate access code' });
  }
});

module.exports = router;
