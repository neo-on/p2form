const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { getConnectionStatus } = require('../config/db');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 10 login requests per window
  message: 'Too many login attempts, please try again later.'
});

// GET /login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

// POST /login
router.post('/login', loginLimiter, async (req, res) => {
  if (!getConnectionStatus()) {
    return res.render('login', { error: 'MongoDB is not connected. Please configure MONGODB_URI in .env and restart.' });
  }
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password))) {
      return res.render('login', { error: 'Invalid email or password' });
    }
    if (!user.isApproved) {
      return res.render('pending', { email: user.email });
    }
    req.session.userId = user._id;
    res.redirect('/');
  } catch (err) {
    res.render('login', { error: 'Something went wrong. Please try again.' });
  }
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('register', { error: null });
});

// POST /register
router.post('/register', async (req, res) => {
  if (!getConnectionStatus()) {
    return res.render('register', { error: 'MongoDB is not connected. Please configure MONGODB_URI in .env and restart.' });
  }
  try {
    const { email, password, approvalId, swsId, projectNumber, undertakingName, plantName, plantCode, state, capacity } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.render('register', { error: 'Email already registered' });
    }

    const user = new User({
      email, password, approvalId, swsId, projectNumber,
      undertakingName, plantName, plantCode, state, capacity
    });
    await user.save();

    // Don't auto-login — redirect to pending approval page
    res.render('pending', { email: user.email });
  } catch (err) {
    res.render('register', { error: err.message || 'Registration failed' });
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
