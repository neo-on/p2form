const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { getConnectionStatus } = require('../config/db');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const nodemailer = require('nodemailer');

// TTL of 900 seconds = 15 minutes
const otpCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // Must be false for port 587 (STARTTLS); set true only for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  connectionTimeout: 10000, // 10s — fail fast if SMTP server unreachable
  greetingTimeout: 10000,   // 10s — fail fast if SMTP doesn't respond to EHLO
  socketTimeout: 15000      // 15s — fail fast if connection stalls mid-send
});

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

// =========================
// FORGOT PASSWORD / OTP FLOW
// =========================

// GET /forgot-password
router.get('/forgot-password', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('forgot-password', { error: null });
});

// POST /forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const email = req.body.email.toLowerCase().trim();
    if (!email) {
      return res.render('forgot-password', { error: 'Please enter a valid email.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal that the user doesn't exist, but we can't send an email
      // To improve UX internally, we'll let them know since this is a restricted app.
      return res.render('forgot-password', { error: 'No account found with that email address.' });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Store in node-cache (key: email, value: otp)
    otpCache.set(email, otp);

    // If SMTP is not fully configured, log it to the console (development fallback)
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`[DEVELOPMENT MODE] OTP for ${email} is ${otp}`);
    } else {
      // Send the email
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"P2 Form Admin" <noreply@p2form.com>',
        to: email,
        subject: 'Password Reset Verification Code',
        html: `<p>You requested a password reset.</p>
               <p>Your 6-digit Verification Code is: <strong>${otp}</strong></p>
               <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>`
      });
    }

    // Redirect to the reset screen with the email populated so they know where to put the OTP
    res.redirect(`/reset-password?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.render('forgot-password', { error: 'Failed to process request. Please try again.' });
  }
});

// GET /reset-password
router.get('/reset-password', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  const email = req.query.email || '';
  res.render('reset-password', { error: null, email });
});

// POST /reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword, confirmNewPassword } = req.body;
    
    if (!email) return res.render('reset-password', { error: 'Missing email address.', email });
    if (!otp) return res.render('reset-password', { error: 'Please enter the 6-digit OTP.', email });

    if (newPassword !== confirmNewPassword) {
      return res.render('reset-password', { error: 'Passwords do not match.', email });
    }

    if (newPassword.length < 6) {
      return res.render('reset-password', { error: 'Password must be at least 6 characters.', email });
    }

    // Verify OTP from memory cache
    const storedOtp = otpCache.get(email.toLowerCase().trim());
    if (!storedOtp) {
      return res.render('reset-password', { error: 'OTP is expired or invalid. Please request a new one.', email });
    }

    if (storedOtp !== otp.trim()) {
      return res.render('reset-password', { error: 'Incorrect OTP.', email });
    }

    // Valid OTP! Update password
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.render('reset-password', { error: 'User no longer exists.', email });
    }

    user.password = newPassword; // the pre-save hook will hash this
    await user.save();

    // Clear the OTP from cache to prevent reuse
    otpCache.del(email.toLowerCase().trim());

    // Redirect to login with success indicator
    res.render('login', { error: null, success: 'Password has been safely reset! You may now log in.' });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.render('reset-password', { error: 'Failed to reset password. Please try again.', email: req.body.email });
  }
});

module.exports = router;
