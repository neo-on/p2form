/**
 * Shared knowledge about the P2 form's HTML field names.
 *
 * Checkbox inputs only appear in the POST body when they are ticked, so both
 * the preview route and the draft editor must normalise them to real booleans
 * before the payload builder or the EJS template sees them.
 */

const CHECKBOX_FIELDS = [
  'prod_white_enabled', 'prod_raw_enabled', 'prod_procured_enabled',
  'prod_diversion_enabled', 'prod_ethanol_enabled',
  'disp_611_enabled', 'disp_612_enabled', 'disp_613_enabled', 'disp_614_enabled',
  'disp_62_enabled', 'disp_63_enabled', 'disp_64_enabled', 'disp_65_enabled',
  'exp_661_enabled', 'exp_662_enabled', 'exp_663_enabled', 'exp_66b_enabled'
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Sections that carry a mandatory date, keyed by the toggle that enables them.
 * When the toggle is on but the date is blank the payload builder would fall back
 * to today's date, which would silently file an incorrect release-order date.
 */
const DATED_SECTIONS = [
  { toggle: 'disp_611_enabled', date: 'disp_611_date', label: '6.1.1 Domestic dispatch w.r.t. monthly release quantity' },
  { toggle: 'disp_612_enabled', date: 'disp_612_date', label: '6.1.2 Domestic dispatch w.r.t. additional allotment' },
  { toggle: 'disp_613_enabled', date: 'disp_613_date', label: '6.1.3 Domestic dispatch w.r.t. extended quota' },
  { toggle: 'disp_614_enabled', date: 'disp_614_date', label: '6.1.4 Any other domestic dispatch' },
  { toggle: 'disp_62_enabled', date: 'disp_62_date', label: '6.2 BISS dispatch of unmarketable old sugar' },
  { toggle: 'exp_661_enabled', date: 'exp_661_date', label: '6.6 (a)(i) Export under OGL — white / refined sugar' },
  { toggle: 'exp_662_enabled', date: 'exp_662_date', label: '6.6 (a)(ii) Export under OGL — raw sugar' },
  { toggle: 'exp_663_enabled', date: 'exp_663_date', label: '6.6 (a)(iii) Raw sugar sold to refineries for export' },
  { toggle: 'exp_66b_enabled', date: 'exp_66b_date', label: '6.6 (b) Export under AAS (white sugar)' }
];

/**
 * Account fields NSWS requires in every payload. They come from the user record,
 * so the filer cannot fix them from the form - we must refuse to submit a payload
 * containing empty strings rather than let NSWS reject it.
 */
const REQUIRED_ACCOUNT_FIELDS = [
  { key: 'approvalId', label: 'Approval ID' },
  { key: 'swsId', label: 'SWS ID' },
  { key: 'projectNumber', label: 'Project number' },
  { key: 'undertakingName', label: 'Name of the undertaking / group' },
  { key: 'plantName', label: 'Plant name' },
  { key: 'plantCode', label: 'Plant code' },
  { key: 'state', label: 'State' },
  { key: 'capacity', label: 'Capacity (TCD / TPD)' }
];

/** Returns a copy of `raw` with every checkbox field coerced to a boolean. */
function normalizeFormData(raw) {
  const formData = { ...(raw || {}) };
  for (const field of CHECKBOX_FIELDS) {
    const v = formData[field];
    formData[field] = v === 'on' || v === 'true' || v === true;
  }
  return formData;
}

/**
 * Server-side mirror of the browser validation.
 * Returns an array of human readable messages (empty when the form is valid).
 */
function validateFormData(formData) {
  const errors = [];
  const f = formData || {};

  if (!String(f.sugarSeason || '').trim()) {
    errors.push('Select the sugar season.');
  } else if (!/^\d{4}-\d{2}$/.test(String(f.sugarSeason).trim())) {
    errors.push('Sugar season must look like "2025-26".');
  }

  const month = String(f.month || '').trim();
  if (!month) {
    errors.push('Select the reporting month.');
  } else if (!MONTHS.some(m => m.toLowerCase() === month.toLowerCase())) {
    errors.push(`"${month}" is not a valid month.`);
  }

  if (!String(f.caneCrushedMonth || '').trim()) {
    errors.push('Enter the cane crushed during the month.');
  }

  // A selected section with no date would otherwise be filed with today's date.
  for (const s of DATED_SECTIONS) {
    if (f[s.toggle] && !String(f[s.date] || '').trim()) {
      errors.push(`Enter the date for "${s.label}" — it is switched on but has no date.`);
    }
  }

  return errors;
}

/**
 * Validates the mill account behind the filing. NSWS rejects empty strings, and
 * these values cannot be typed in on the form, so a blank one must block submission
 * with an actionable message instead of producing an invalid payload.
 */
function validateUserAccount(user) {
  const u = user || {};
  return REQUIRED_ACCOUNT_FIELDS
    .filter(f => !String(u[f.key] === undefined || u[f.key] === null ? '' : u[f.key]).trim())
    .map(f => `Your account is missing "${f.label}". Contact the administrator before filing.`);
}

module.exports = {
  CHECKBOX_FIELDS,
  MONTHS,
  DATED_SECTIONS,
  REQUIRED_ACCOUNT_FIELDS,
  normalizeFormData,
  validateFormData,
  validateUserAccount
};
