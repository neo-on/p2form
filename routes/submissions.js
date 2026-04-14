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

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

    const filename = `P2_Submission_${submission.sugarSeason || 'NA'}_${submission.month || 'NA'}_${submission._id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const W = doc.page.width;
    const M = 40;                     // margin
    const CW = W - M * 2;            // content width
    const COL1 = M + 12;             // label X
    const COL2 = M + CW * 0.42;     // value X

    const C = {
      primary: '#6366f1',
      primaryLight: '#e0e7ff',
      success: '#10b981',
      successLight: '#d1fae5',
      text: '#1e293b',
      textSec: '#64748b',
      textMuted: '#94a3b8',
      border: '#cbd5e1',
      borderLight: '#e2e8f0',
      bg: '#f8fafc',
      white: '#ffffff',
      danger: '#ef4444'
    };

    // ── Helper: ensure Y doesn't overflow, add page if needed ──
    function ensureSpace(y, needed) {
      if (y + needed > doc.page.height - 60) {
        doc.addPage();
        return 50;
      }
      return y;
    }

    // ── Helper: draw a section header bar ──
    function sectionHeader(title, sectionNum, y) {
      y = ensureSpace(y, 40);
      doc.roundedRect(M, y, CW, 28, 4).fill(C.primary);
      doc.fontSize(10).fillColor(C.white).font('Helvetica-Bold')
        .text(`${sectionNum}. ${title}`, M + 12, y + 8, { width: CW - 24 });
      return y + 38;
    }

    // ── Helper: draw a key-value row ──
    function kvRow(label, value, y, opts = {}) {
      if (!value && value !== 0) return y;
      const val = String(value);
      y = ensureSpace(y, 18);
      const indent = opts.indent || 0;
      const lx = COL1 + indent;

      if (opts.highlight) {
        doc.rect(M + 2, y - 2, CW - 4, 17).fill(C.primaryLight);
      }

      doc.fontSize(8).fillColor(C.textSec).font('Helvetica')
        .text(label, lx, y + 1, { width: COL2 - lx - 8 });
      doc.fontSize(8.5).fillColor(C.text).font('Helvetica-Bold')
        .text(val, COL2, y + 1, { width: M + CW - COL2 - 12 });

      // Subtle separator
      doc.moveTo(M + 8, y + 15).lineTo(M + CW - 8, y + 15)
        .lineWidth(0.3).strokeColor(C.borderLight).stroke();

      return y + 18;
    }

    // ── Helper: sub-section title ──
    function subHeader(title, y) {
      y = ensureSpace(y, 24);
      doc.roundedRect(M + 6, y, CW - 12, 20, 3).fill(C.bg);
      doc.roundedRect(M + 6, y, CW - 12, 20, 3).lineWidth(0.5).strokeColor(C.borderLight).stroke();
      doc.fontSize(8).fillColor(C.primary).font('Helvetica-Bold')
        .text(title, M + 16, y + 5, { width: CW - 32 });
      return y + 26;
    }

    // ════════════════════════════════════════════════
    // PAGE 1 — HEADER
    // ════════════════════════════════════════════════

    // Top gradient bar
    doc.rect(0, 0, W, 100).fill(C.primary);
    // Decorative lighter stripe
    doc.rect(0, 90, W, 10).fill('#4f46e5');

    // Title
    doc.fontSize(20).fillColor(C.white).font('Helvetica-Bold')
      .text('P2 Form — Submission Report', M + 2, 22);
    doc.fontSize(9).fillColor('#c7d2fe').font('Helvetica')
      .text('NSWS — Directorate of Sugar', M + 2, 48);

    // Right-side metadata on header
    const dateStr = new Date(submission.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    doc.fontSize(8).fillColor('#c7d2fe').font('Helvetica')
      .text(`Submitted: ${dateStr}`, W - 230, 28, { width: 190, align: 'right' })
      .text(`Ref: ${submission._id}`, W - 230, 42, { width: 190, align: 'right' });

    // Status pill
    const isOk = submission.statusCode === 200;
    const pillColor = isOk ? C.success : C.danger;
    const pillText = isOk ? '✓ SUCCESS' : `✗ STATUS ${submission.statusCode}`;
    doc.roundedRect(W - 230, 58, 80, 18, 9).fill(pillColor);
    doc.fontSize(8).fillColor(C.white).font('Helvetica-Bold')
      .text(pillText, W - 228, 63, { width: 76, align: 'center' });

    // ════════════════════════════════════════════════
    // MILL DETAILS BOX
    // ════════════════════════════════════════════════

    let y = 118;
    doc.roundedRect(M, y, CW, 72, 6).fill(C.bg);
    doc.roundedRect(M, y, CW, 72, 6).lineWidth(0.8).strokeColor(C.border).stroke();
    // Accent left stripe
    doc.rect(M, y, 4, 72).fill(C.primary);

    doc.fontSize(7).fillColor(C.primary).font('Helvetica-Bold')
      .text('SUGAR MILL DETAILS', M + 16, y + 8);

    const midX = M + CW / 2;
    let dy = y + 24;
    doc.fontSize(8).fillColor(C.textSec).font('Helvetica');

    function millRow(lbl1, val1, lbl2, val2, ry) {
      doc.font('Helvetica').fillColor(C.textSec).text(lbl1, M + 16, ry);
      doc.font('Helvetica-Bold').fillColor(C.text).text(val1, M + 110, ry);
      doc.font('Helvetica').fillColor(C.textSec).text(lbl2, midX + 10, ry);
      doc.font('Helvetica-Bold').fillColor(C.text).text(val2, midX + 90, ry);
    }

    millRow('Undertaking:', user.undertakingName, 'Plant:', `${user.plantName} (${user.plantCode})`, dy);
    millRow('State:', user.state, 'SWS ID:', user.swsId, dy + 16);
    millRow('Sugar Season:', submission.sugarSeason || 'N/A', 'Month:', submission.month || 'N/A', dy + 32);

    y = 204;

    // ════════════════════════════════════════════════
    // PARSE THE P2 JSON INTO READABLE SECTIONS
    // ════════════════════════════════════════════════

    const p2 = submission.p2Json;
    let sections = [];
    if (Array.isArray(p2) && p2[0] && p2[0].forms && p2[0].forms[0]) {
      sections = p2[0].forms[0].sections || [];
    }

    sections.forEach((section, sIdx) => {
      y = sectionHeader(section.sectionName, sIdx + 1, y);

      if (!section.fieldResponses) return;

      section.fieldResponses.forEach(field => {
        // fieldResponses can be: object, or array of objects
        const items = Array.isArray(field) ? field : [field];

        items.forEach(item => {
          if (!item || !item.fieldName) return;

          // Skip "Select" fields (they list enabled checkboxes as JSON array)
          if (item.fieldName === 'Select') return;

          // If item has subFields → it's a grouped section
          if (item.subFields && item.subFields.length > 0) {
            const label = item.serialNumber
              ? `${item.fieldName} (#${item.serialNumber})`
              : item.fieldName;
            y = subHeader(label, y);

            item.subFields.forEach(sf => {
              y = kvRow(sf.fieldName, sf.inputValue, y, { indent: 8 });
            });
          } else if (item.inputValue !== undefined) {
            // Simple key-value
            y = kvRow(item.fieldName, item.inputValue, y);
          }
        });
      });

      y += 8; // spacing between sections
    });

    // ════════════════════════════════════════════════
    // FORM DATA SUMMARY (user-entered fields)
    // ════════════════════════════════════════════════

    const formData = submission.formData || {};
    const formEntries = Object.entries(formData).filter(
      ([k, v]) => v !== '' && v !== null && v !== undefined && v !== false && v !== 'false' && !k.endsWith('_enabled')
    );

    if (formEntries.length > 0) {
      y = sectionHeader('Form Input Summary', sections.length + 1, y);

      formEntries.forEach(([key, value]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        y = kvRow(label, val, y);
      });
      y += 8;
    }

    // ════════════════════════════════════════════════
    // API RESPONSE
    // ════════════════════════════════════════════════

    y = ensureSpace(y, 80);
    y = sectionHeader('API Response', sections.length + 2, y);

    const respStr = JSON.stringify(submission.apiResponse, null, 2);
    const respLines = respStr.split('\n');

    doc.font('Courier').fontSize(7).fillColor(C.textSec);
    respLines.forEach(line => {
      y = ensureSpace(y, 12);
      doc.text(line, M + 14, y, { width: CW - 28 });
      y += 10;
    });

    // ════════════════════════════════════════════════
    // PAGE FOOTERS
    // ════════════════════════════════════════════════

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - 32;
      // Separator line
      doc.moveTo(M, fy - 4).lineTo(W - M, fy - 4)
        .lineWidth(0.4).strokeColor(C.borderLight).stroke();
      doc.fontSize(7).fillColor(C.textMuted).font('Helvetica')
        .text(
          `P2 Form App · ${user.plantName} · ${submission.sugarSeason || ''} ${submission.month || ''}`,
          M, fy, { width: CW * 0.7 }
        );
      doc.text(
        `Page ${i + 1} of ${pages.count}`,
        M, fy, { width: CW, align: 'right' }
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
