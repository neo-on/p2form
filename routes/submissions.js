const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Submission = require('../models/Submission');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');

// GET /past-requests — List all past submissions for the logged-in user
router.get('/past-requests', ensureAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).lean();
  const submissions = await Submission.find({ userId: req.session.userId })
    .sort({ createdAt: -1 })
    .lean();
  res.render('past-requests', { user, submissions });
});

// GET /past-requests/:id — View detail of a single submission
router.get('/past-requests/:id', ensureAuth, async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      userId: req.session.userId
    }).lean();
    if (!submission) return res.redirect('/past-requests');

    const user = await User.findById(req.session.userId).lean();
    res.render('past-request-detail', { user, submission });
  } catch (err) {
    res.redirect('/past-requests');
  }
});

// GET /past-requests/:id/pdf — Download a PDF of the submission
router.get('/past-requests/:id/pdf', ensureAuth, async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      userId: req.session.userId
    }).lean();
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });

    const user = await User.findById(req.session.userId).lean();

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

    const filename = `P2_Submission_${submission.sugarSeason || 'NA'}_${submission.month || 'NA'}_${submission._id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // --- Color Palette ---
    const COLORS = {
      primary: '#6366f1',
      primaryDark: '#4f46e5',
      success: '#10b981',
      text: '#1e293b',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      bgLight: '#f8f9fc',
      white: '#ffffff'
    };

    // --- Header Band ---
    doc.rect(0, 0, doc.page.width, 110).fill(COLORS.primary);

    doc.fontSize(22).fillColor(COLORS.white).font('Helvetica-Bold')
      .text('P2 Form — Submission Report', 50, 30);

    doc.fontSize(10).fillColor('#c7d2fe').font('Helvetica')
      .text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 50, 58);

    doc.fontSize(10).fillColor('#c7d2fe')
      .text(`Reference ID: ${submission._id}`, 50, 74);

    // --- Company Details Box ---
    const boxY = 130;
    doc.roundedRect(50, boxY, doc.page.width - 100, 90, 8).fill(COLORS.bgLight);
    doc.roundedRect(50, boxY, doc.page.width - 100, 90, 8).lineWidth(1).stroke(COLORS.border);

    doc.fontSize(9).fillColor(COLORS.primary).font('Helvetica-Bold')
      .text('MILL DETAILS', 65, boxY + 12);

    doc.fontSize(9).fillColor(COLORS.text).font('Helvetica');
    const col1X = 65;
    const col2X = 300;
    let detY = boxY + 30;

    doc.font('Helvetica-Bold').text('Undertaking:', col1X, detY, { continued: true })
      .font('Helvetica').text(` ${user.undertakingName}`);
    doc.font('Helvetica-Bold').text('Plant:', col2X, detY, { continued: true })
      .font('Helvetica').text(` ${user.plantName} (${user.plantCode})`);
    detY += 18;
    doc.font('Helvetica-Bold').text('State:', col1X, detY, { continued: true })
      .font('Helvetica').text(` ${user.state}`);
    doc.font('Helvetica-Bold').text('SWS ID:', col2X, detY, { continued: true })
      .font('Helvetica').text(` ${user.swsId}`);
    detY += 18;
    doc.font('Helvetica-Bold').text('Sugar Season:', col1X, detY, { continued: true })
      .font('Helvetica').text(` ${submission.sugarSeason || 'N/A'}`);
    doc.font('Helvetica-Bold').text('Month:', col2X, detY, { continued: true })
      .font('Helvetica').text(` ${submission.month || 'N/A'}`);

    // --- Submission Metadata ---
    let curY = boxY + 110;

    // Status badge
    const statusText = submission.statusCode === 200 ? 'SUCCESS' : `STATUS ${submission.statusCode}`;
    const statusColor = submission.statusCode === 200 ? COLORS.success : '#ef4444';
    doc.roundedRect(50, curY, 90, 22, 4).fill(statusColor);
    doc.fontSize(9).fillColor(COLORS.white).font('Helvetica-Bold')
      .text(statusText, 55, curY + 6, { width: 80, align: 'center' });

    doc.fontSize(9).fillColor(COLORS.textSecondary).font('Helvetica')
      .text(`Submitted: ${new Date(submission.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 155, curY + 5);

    curY += 45;

    // --- Section Helper ---
    function drawSection(title, jsonData, yPos) {
      // Section title
      doc.fontSize(12).fillColor(COLORS.primary).font('Helvetica-Bold')
        .text(title, 50, yPos);
      yPos += 20;

      // Draw a thin accent line
      doc.moveTo(50, yPos).lineTo(200, yPos).lineWidth(2).strokeColor(COLORS.primary).stroke();
      yPos += 12;

      // JSON content
      const jsonStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
      const lines = jsonStr.split('\n');

      doc.font('Courier').fontSize(7.5).fillColor(COLORS.text);

      for (const line of lines) {
        if (yPos > doc.page.height - 80) {
          doc.addPage();
          yPos = 50;
        }
        doc.text(line, 60, yPos, { width: doc.page.width - 120 });
        yPos += 10;
      }

      return yPos + 15;
    }

    // --- Request JSON Section ---
    curY = drawSection('Request Payload (P2 JSON)', submission.p2Json, curY);

    // --- API Response Section ---
    if (curY > doc.page.height - 150) {
      doc.addPage();
      curY = 50;
    }
    curY = drawSection('API Response', submission.apiResponse, curY);

    // --- Footer on every page ---
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor(COLORS.textSecondary).font('Helvetica')
        .text(
          `P2 Form App — ${user.plantName} | Page ${i + 1} of ${pages.count}`,
          50, doc.page.height - 30,
          { width: doc.page.width - 100, align: 'center' }
        );
    }

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF.' });
    }
  }
});

module.exports = router;
