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

  return errors;
}

module.exports = { CHECKBOX_FIELDS, MONTHS, normalizeFormData, validateFormData };
