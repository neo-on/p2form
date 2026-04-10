const express = require('express');
const router = express.Router();
const Draft = require('../models/Draft');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { buildP2Json } = require('../utils/jsonBuilder');

// GET /drafts — List all drafts for the logged-in user
router.get('/drafts', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const drafts = await Draft.find({ userId: req.session.userId })
    .sort({ updatedAt: -1 })
    .lean();
  res.render('drafts', { user, drafts });
});

// POST /drafts — Save a new draft from the preview page
router.post('/drafts', ensureAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const formData = req.session.formData;
    const p2Json = req.session.p2Json;

    if (!formData || !p2Json) {
      return res.status(400).json({ error: 'No form data in session. Please fill the form first.' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Draft name is required.' });
    }

    const draft = new Draft({
      userId: req.session.userId,
      name: name.trim(),
      formData,
      p2Json,
      sugarSeason: formData.sugarSeason || '',
      month: formData.month || ''
    });
    await draft.save();

    res.json({ success: true, id: draft._id, message: 'Draft saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to save draft.' });
  }
});

// GET /drafts/:id/preview — Load a draft into preview
router.get('/drafts/:id/preview', ensureAuth, async (req, res) => {
  try {
    const draft = await Draft.findOne({ _id: req.params.id, userId: req.session.userId }).lean();
    if (!draft) return res.redirect('/drafts');

    const user = await User.findById(req.session.userId).lean();

    // Restore session state so Send/Back-to-edit work seamlessly
    req.session.p2Json = draft.p2Json;
    req.session.formData = draft.formData;
    req.session.activeDraftId = draft._id.toString();

    res.render('preview', {
      user,
      p2Json: JSON.stringify(draft.p2Json, null, 2),
      jsonData: draft.p2Json,
      draft
    });
  } catch (err) {
    res.redirect('/drafts');
  }
});

// POST /drafts/:id/edit — Load draft data back into the form editor
router.post('/drafts/:id/edit', ensureAuth, async (req, res) => {
  try {
    const draft = await Draft.findOne({ _id: req.params.id, userId: req.session.userId }).lean();
    if (!draft) return res.redirect('/drafts');

    const user = await User.findById(req.session.userId).lean();

    // Restore form data into session
    req.session.formData = draft.formData;
    req.session.activeDraftId = draft._id.toString();

    // Re-process checkbox fields to booleans for the EJS template
    const formData = { ...draft.formData };
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

    res.render('home', { user, formData });
  } catch (err) {
    res.redirect('/drafts');
  }
});

// DELETE /drafts/:id — Delete a draft
router.delete('/drafts/:id', ensureAuth, async (req, res) => {
  try {
    const result = await Draft.deleteOne({ _id: req.params.id, userId: req.session.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Draft not found.' });
    }
    res.json({ success: true, message: 'Draft deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete draft.' });
  }
});

// PUT /drafts/:id — Update an existing draft with current session data
router.put('/drafts/:id', ensureAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const formData = req.session.formData;
    const p2Json = req.session.p2Json;

    if (!formData || !p2Json) {
      return res.status(400).json({ error: 'No form data in session.' });
    }

    const update = {
      formData,
      p2Json,
      sugarSeason: formData.sugarSeason || '',
      month: formData.month || ''
    };
    if (name && name.trim()) update.name = name.trim();

    const draft = await Draft.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      update,
      { new: true }
    );

    if (!draft) return res.status(404).json({ error: 'Draft not found.' });

    res.json({ success: true, id: draft._id, message: 'Draft updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update draft.' });
  }
});

module.exports = router;
