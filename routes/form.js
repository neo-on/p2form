const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { buildP2Json } = require('../utils/jsonBuilder');
const { normalizeFormData, validateFormData } = require('../utils/formFields');

const Draft = require('../models/Draft');
const Submission = require('../models/Submission');

// GET / - Form page
router.get('/', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  req.session.activeDraftId = null; // Clear active draft for new forms
  res.render('home', { user });
});

// POST /preview - Build JSON and show preview
router.post('/preview', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const formData = normalizeFormData(req.body);

  const errors = validateFormData(formData);
  if (errors.length) {
    return res.status(400).render('home', { user, formData, errors });
  }

  const p2Json = buildP2Json(user, formData);

  // Load active draft if we are editing an existing one
  let draft = null;
  if (req.session.activeDraftId) {
    draft = await Draft.findOne({ _id: req.session.activeDraftId, userId: req.session.userId }).lean();
  }

  // Store in session for the send step
  req.session.p2Json = p2Json;
  req.session.formData = formData;

  res.render('preview', { user, p2Json: JSON.stringify(p2Json, null, 2), jsonData: p2Json, draft });
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

    const data = response.data;

    // NSWS signals rejection with HTTP 200 *and* a body like:
    //   {"status":"200","message":"Kindly provide mandatory subField ...","uniqueId":null}
    // The only reliable success signal is a non-empty uniqueId - the acknowledgement
    // reference NSWS issues once the filing is actually recorded. Checking `status`
    // alone silently recorded rejected filings as successful (and deleted the draft).
    const uniqueId = data && (data.uniqueId || data.uniqueID || data.unique_id);
    const statusOk = !data || data.status === '200' || data.status === 200;

    if (!statusOk || !uniqueId) {
      const rejection = new Error(JSON.stringify(data));
      rejection.nswsStatusCode = response.status;
      throw rejection;
    }

    // Persist the successful submission for "Past Requests"
    try {
      await Submission.create({
        userId: req.session.userId,
        formData: req.session.formData || {},
        p2Json,
        apiResponse: data,
        statusCode: response.status,
        sugarSeason: (req.session.formData && req.session.formData.sugarSeason) || '',
        month: (req.session.formData && req.session.formData.month) || ''
      });
    } catch (saveErr) {
      console.warn('Failed to save submission record:', saveErr.message);
    }

    // Proactive cleanup: If they successfully submitted a loaded draft, delete it from MongoDB
    if (req.session.activeDraftId) {
      await Draft.deleteOne({ _id: req.session.activeDraftId, userId: req.session.userId });
      req.session.activeDraftId = null; // Clear the session tracker
    }

    res.render('result', {
      user,
      success: true,
      statusCode: response.status,
      responseData: JSON.stringify(data, null, 2)
    });
  } catch (err) {
    console.error('NSWS Request Failed:', err.message);
    const statusCode = err.nswsStatusCode || (err.response ? err.response.status : 500);
    
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
