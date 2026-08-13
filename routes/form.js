const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { buildP2Json, findEmptyPayloadValues } = require('../utils/jsonBuilder');
const { normalizeFormData, validateFormData, validateUserAccount } = require('../utils/formFields');
const { interpretNswsResponse } = require('../utils/nswsResponse');

const Draft = require('../models/Draft');
const Submission = require('../models/Submission');

/**
 * Sessions with a /send request currently in flight.
 *
 * A P2 filing cannot be withdrawn: NSWS accepts every well-formed payload and issues a
 * fresh acknowledgement id, so sending the same return twice leaves the mill with two
 * filings for one month. The preview page disables the Send button on submit, but that
 * does not stop a second tab or a double POST, and the payload lives in the session
 * where both requests can read it before either finishes.
 *
 * A per-process set is enough here - ecosystem.config.js runs a single instance.
 */
const sendsInFlight = new Set();

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

  const errors = validateFormData(formData).concat(validateUserAccount(user));
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

  // A concurrent /send for the same session is already talking to NSWS. Both requests
  // read the same session payload, so letting this one through would file twice.
  const sendKey = String(req.session.userId);
  if (sendsInFlight.has(sendKey)) {
    return res.render('result', {
      user,
      success: false,
      statusCode: 409,
      responseData: 'A submission for this account is already being sent to NSWS. Please wait for it to finish, then check Past Requests before trying again.'
    });
  }
  sendsInFlight.add(sendKey);

  try {
    // Last line of defence: never let a blank value reach NSWS, it rejects them.
    const blanks = findEmptyPayloadValues(p2Json);
    if (blanks.length) {
      return res.render('result', {
        user,
        success: false,
        statusCode: 400,
        responseData:
          'Submission blocked before sending: the following fields are empty and NSWS would reject them.\n\n' +
          blanks.map(b => `  - ${b}`).join('\n')
      });
    }

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

    // NSWS answers HTTP 200 for accepted AND rejected filings; the acknowledgement id
    // is the only reliable success signal. Its key casing varies between the official
    // documents (`UniqueId` on success, `uniqueId` on failure), so the lookup is
    // case-insensitive - see utils/nswsResponse.js.
    const { accepted, uniqueId } = interpretNswsResponse(data);

    if (!accepted) {
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
        uniqueId,
        sugarSeason: (req.session.formData && req.session.formData.sugarSeason) || '',
        month: (req.session.formData && req.session.formData.month) || ''
      });
    } catch (saveErr) {
      console.warn('Failed to save submission record:', saveErr.message);
    }

    // Proactive cleanup: If they successfully submitted a loaded draft, delete it from MongoDB
    if (req.session.activeDraftId) {
      await Draft.deleteOne({ _id: req.session.activeDraftId, userId: req.session.userId });
    }

    // The filing is recorded and cannot be withdrawn, so the payload must not survive
    // in the session: the result page is a normal POST response, and a refresh or a
    // Back-then-resubmit would otherwise re-POST /send and file the same month again.
    // With the payload gone that replay lands on the `if (!p2Json)` guard above and
    // redirects to a fresh form instead.
    // Only the success path clears - a rejected filing was never recorded, so keeping
    // its data lets the user retry without re-entering the whole form.
    req.session.p2Json = null;
    req.session.formData = null;
    req.session.activeDraftId = null;

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
  } finally {
    sendsInFlight.delete(sendKey);
  }
});

// POST /back-to-edit - Go back to form with previous data
router.post('/back-to-edit', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const formData = req.session.formData || {};
  res.render('home', { user, formData });
});

module.exports = router;
