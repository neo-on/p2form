const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { buildP2Json } = require('../utils/jsonBuilder');

// GET / - Form page
router.get('/', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  res.render('home', { user });
});

// POST /preview - Build JSON and show preview
router.post('/preview', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const formData = req.body;

  // Convert checkbox values to boolean
  const checkboxFields = [
    'prod_white_enabled', 'prod_raw_enabled', 'prod_procured_enabled',
    'prod_diversion_enabled', 'prod_ethanol_enabled',
    'disp_611_enabled', 'disp_612_enabled', 'disp_613_enabled', 'disp_614_enabled',
    'disp_62_enabled', 'disp_63_enabled', 'disp_64_enabled', 'disp_65_enabled',
    'exp_661_enabled', 'exp_662_enabled', 'exp_663_enabled', 'exp_66b_enabled'
  ];
  for (const field of checkboxFields) {
    formData[field] = formData[field] === 'on' || formData[field] === 'true' || formData[field] === true;
  }

  const p2Json = buildP2Json(user, formData);

  // Store in session for the send step
  req.session.p2Json = p2Json;
  req.session.formData = formData;

  res.render('preview', { user, p2Json: JSON.stringify(p2Json, null, 2), jsonData: p2Json, draft: null });
});

// POST /send - Send to NSWS API
router.post('/send', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const p2Json = req.session.p2Json;

  if (!p2Json) {
    return res.redirect('/');
  }

  // PRE-FLIGHT VALIDATION: ensure PM2 loaded the environment variables
  if (!process.env.NSWS_ACCESS_ID || !process.env.NSWS_ACCESS_SECRET || !process.env.NSWS_API_KEY || !process.env.NSWS_API_URL) {
    console.error("NSWS Environment variables are missing! Your server is misconfigured.");
    return res.render('result', {
      user,
      success: false,
      statusCode: 500,
      responseData: "Server Configuration Error: The NSWS credentials are fully or partially missing. Please ensure your .env file is correct and the application has been restarted (pm2 restart)."
    });
  }

  try {
    const response = await axios.post(
      process.env.NSWS_API_URL,
      p2Json,
      {
        headers: {
          'Content-Type': 'application/json',
          'access-id': process.env.NSWS_ACCESS_ID,
          'access-secret': process.env.NSWS_ACCESS_SECRET,
          'api-key': process.env.NSWS_API_KEY
        },
        timeout: 30000
      }
    );

    // Some 200 OK responses from NSWS might contain error messages (e.g. invalid swsId payload)
    const data = response.data;
    if (data && data.status !== "200" && data.status !== 200 && data.message) {
      // NSWS accepted the credentials but rejected the payload geometry
      throw new Error(JSON.stringify(data));
    }

    res.render('result', {
      user,
      success: true,
      statusCode: response.status,
      responseData: JSON.stringify(data, null, 2)
    });
  } catch (err) {
    console.error('NSWS Request Failed:', err.message);
    const statusCode = err.response ? err.response.status : 500;
    
    // Parse NSWS's specific rejection message gracefully
    let responseData;
    if (err.response && err.response.data) {
      responseData = JSON.stringify(err.response.data, null, 2);
    } else if (err.message) {
      try { responseData = JSON.stringify(JSON.parse(err.message), null, 2); } catch(e) { responseData = err.message; }
    } else {
      responseData = 'Unknown Server Error';
    }

    res.render('result', {
      user,
      success: false,
      statusCode,
      responseData
    });
  }
});

// POST /back-to-edit - Go back to form with previous data
router.post('/back-to-edit', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const formData = req.session.formData || {};
  res.render('home', { user, formData });
});

module.exports = router;
