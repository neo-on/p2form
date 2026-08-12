/**
 * Builds the final P2 API JSON payload by merging:
 * - User constants from MongoDB (approvalId, swsId, mill details)
 * - Form data submitted by the user
 *
 * The shape produced here mirrors, byte for byte, the payload accepted by
 * https://api.nsws.gov.in/nsws_license/saveP2Data :
 *
 *   [ { approvalId, swsId, projectNumber, forms: [ { name, sections: [
 *         { sectionName, fieldResponses: [ { fieldName, inputValue } |
 *                                          { fieldName, serialNumber?, subFields: [...] } ] } ] } ] } ]
 *
 * IMPORTANT: `fieldResponses` is a FLAT array of objects. It must never contain
 * nested arrays - NSWS rejects those payloads.
 */

// ---------------------------------------------------------------------------
// Value coercion helpers
//
// NSWS expects every inputValue to be a non-empty STRING. Blank values are
// rejected, so numeric fields fall back to "0.00", counters to "0" and free
// text to "0" (which is what the reference payload uses for "not applicable").
// ---------------------------------------------------------------------------

const MAX_SERIAL_ROWS = 25;

/**
 * The farmer-count subField label, used identically for ALL five cane-dues seasons.
 *
 * The captured reference request used "No. of farmers from which cane procured -
 * During the Month" for the two most recent previous seasons and the plain label for
 * the other three. Replicating that inconsistency made NSWS reject the submission:
 *
 *   {"status":"200","message":" Kindly provide mandatory subField under Field
 *    Sugar Season - 2024-25 under section Cane Dues Data Kindly provide mandatory
 *    subField under Field Sugar Season - 2023-24 under section Cane Dues Data",
 *    "uniqueId":null}
 *
 * The two seasons named in that error are exactly the two that carried the
 * "- During the Month" suffix, so NSWS does not recognise that variant and treats
 * the mandatory subField as missing. The plain label is the one it accepts.
 */
const FARMERS_FIELD = 'No. of farmers from which cane procured';

/** Decimal quantity -> always 2 decimal places, e.g. "1487.90". */
function num(value) {
  if (value === undefined || value === null) return '0.00';
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '') return '0.00';
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return '0.00';
  return parsed.toFixed(2);
}

/** Whole-number counter (e.g. number of farmers) -> "699". */
function int(value) {
  if (value === undefined || value === null) return '0';
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '') return '0';
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return '0';
  return String(Math.round(parsed));
}

/** Free text / codes -> "0" when blank (NSWS placeholder for "none"). */
function text(value) {
  if (value === undefined || value === null) return '0';
  const trimmed = String(value).trim();
  return trimmed === '' ? '0' : trimmed;
}

/** Pass-through string that keeps whatever the account holds (may be blank). */
function raw(value) {
  return value === undefined || value === null ? '' : String(value);
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Normalises a date to NSWS's DD/MM/YYYY format.
 * Accepts "YYYY-MM-DD" (HTML date input) and "DD/MM/YYYY".
 * Blank dates fall back to today, because NSWS rejects empty date fields on
 * sections the user has explicitly selected.
 */
function date(value) {
  const trimmed = value === undefined || value === null ? '' : String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;

  if (trimmed !== '') {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return formatDate(parsed);
  }
  return formatDate(new Date());
}

/** NSWS stores the month in upper case, e.g. "FEBRUARY". */
function monthValue(value) {
  return raw(value).trim().toUpperCase();
}

/** "2024-25" -> 2024. Returns null when the label is unusable. */
function seasonStartYear(label) {
  const match = /^(\d{4})/.exec(String(label || '').trim());
  return match ? Number(match[1]) : null;
}

function seasonLabel(year) {
  return `${year}-${String(year + 1).slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function buildP2Json(user, formData) {
  const u = user || {};
  const f = formData || {};

  return [{
    approvalId: u.approvalId,
    swsId: u.swsId,
    projectNumber: u.projectNumber,
    forms: [{
      name: 'P2 Form (Directorate of Sugar)',
      sections: [
        buildFormAppliedFor(f),
        buildSugarMillDetails(u),
        buildCaneCrushed(u, f),
        buildProduction(f),
        buildDispatches(f),
        buildExport(f),
        buildImport(f),
        buildStockOfSugar(f),
        buildPackingDetails(f),
        buildCaneDuesData(f)
      ]
    }]
  }];
}

function buildFormAppliedFor(f) {
  return {
    sectionName: 'Form applied for -',
    fieldResponses: [
      { fieldName: 'Sugar Season', inputValue: raw(f.sugarSeason) },
      { fieldName: 'Month', inputValue: monthValue(f.month) }
    ]
  };
}

function buildSugarMillDetails(user) {
  return {
    sectionName: 'Sugar Mill Details',
    fieldResponses: [
      { fieldName: 'Name of the Undertaking/Group', inputValue: raw(user.undertakingName) },
      { fieldName: 'Plant Name', inputValue: raw(user.plantName) },
      { fieldName: 'Plant Code', inputValue: raw(user.plantCode) },
      { fieldName: 'State', inputValue: raw(user.state) }
    ]
  };
}

function buildCaneCrushed(user, f) {
  return {
    sectionName: 'Cane Crushed',
    fieldResponses: [
      {
        fieldName: 'Capacity (In TCD for sugar mills/Tons Per Day (TPD) for refineries)',
        inputValue: raw(user.capacity)
      },
      {
        fieldName: 'Cane Crushed - During the Month (MT)',
        inputValue: num(f.caneCrushedMonth)
      }
    ]
  };
}

function buildProduction(f) {
  const selected = [];
  const entries = [];

  if (f.prod_white_enabled) {
    selected.push('2(I) White / Refined Sugar');
    entries.push({
      fieldName: '2(I) White / Refined Sugar',
      subFields: [
        { fieldName: 'a) From Cane - During the Month (MT)', inputValue: num(f.white_from_cane) },
        { fieldName: 'b) From Reprocessing unmarketable old Sugar - During the Month (MT)', inputValue: num(f.white_from_reprocessing) },
        { fieldName: 'c) From raw procured from other domestic sugar mills - During the Month (MT)', inputValue: num(f.white_from_raw_procured) },
        { fieldName: 'c(1) From transferred white sugar from other domestic sugar mills - During the Month (MT)', inputValue: num(f.white_from_transferred) },
        { fieldName: 'c(2) From Raw Sugar used from own Stock - During the Month (MT)', inputValue: num(f.white_from_own_raw) },
        { fieldName: 'c(3) White sugar produced from own stock of raw sugar - During the Month (MT)', inputValue: num(f.white_from_own_raw_produced) }
      ]
    });
  }

  if (f.prod_raw_enabled) {
    selected.push('2(II) Raw Sugar');
    entries.push({
      fieldName: '2(II) Raw Sugar',
      subFields: [
        { fieldName: 'a) From Cane - During the Month (MT)', inputValue: num(f.raw_from_cane) },
        { fieldName: 'b) From Reprocessing unmarketable old Sugar - During the Month (MT)', inputValue: num(f.raw_from_reprocessing) },
        { fieldName: 'c) Raw sugar procured from other domestic sugar mills', inputValue: num(f.raw_procured_domestic) }
      ]
    });
  }

  if (f.prod_procured_enabled) {
    selected.push('2(III) Procured sugar');
    entries.push({
      fieldName: '2(III) Procured sugar',
      subFields: [
        { fieldName: 'a) Raw Sugar - Internal transfer from other group sugar mills - During the Month (MT)', inputValue: num(f.procured_internal_transfer) },
        { fieldName: 'Internal transfer - Plant Code', inputValue: text(f.procured_transfer_plant_code) },
        { fieldName: 'Internal transfer - Plant Name', inputValue: text(f.procured_transfer_plant_name) },
        { fieldName: 'b) From Imported Raw Sugar - During the Month (MT)', inputValue: num(f.procured_imported_raw) }
      ]
    });
  }

  if (f.prod_diversion_enabled) {
    selected.push('3(1) Diversion/sale of B-heavy/Syrup/sugarcane juice/sugar');
    entries.push({
      fieldName: '3(1) Diversion/sale of B-heavy/Syrup/sugarcane juice/sugar',
      subFields: [
        { fieldName: '(i).a. Qty of Syrup/Sugarcane Juice/Sugar diverted for ethanol - During the Month (in MT)', inputValue: num(f.div_syrup_ethanol) },
        { fieldName: '(ii).a. Qty of B-Heavy diverted for ethanol - During the Month (MT)', inputValue: num(f.div_bheavy_ethanol) },
        { fieldName: '(iii).a. Qty of C-Heavy diverted for ethanol - During the Month (MT)', inputValue: num(f.div_cheavy_ethanol) },
        { fieldName: '(iv) Sale of B-Heavy - During the Month (MT)', inputValue: num(f.div_bheavy_sale) },
        { fieldName: '(v) Sale of Syrup/Sugarcane Juice/Sugar - During the Month (MT)', inputValue: num(f.div_syrup_sale) },
        { fieldName: '(vi) Sale of C-Heavy - During the Month (MT)', inputValue: num(f.div_cheavy_sale) }
      ]
    });
  }

  if (f.prod_ethanol_enabled) {
    selected.push('3(2) Ethanol Production');
    entries.push({
      fieldName: '3(2) Ethanol Production',
      subFields: [
        { fieldName: '(i).b. Ethanol Production from In-house Syrup/Sugarcane Juice/Sugar - During the Month (in KL)', inputValue: num(f.ethanol_syrup) },
        { fieldName: '(ii).b. Ethanol Production from In-house B-Heavy - During the Month (in KL)', inputValue: num(f.ethanol_bheavy) },
        { fieldName: '(iii).b. Ethanol Production from In-house C-Heavy - During the Month (in KL)', inputValue: num(f.ethanol_cheavy) }
      ]
    });
  }

  // "4. Recovery % age" is mandatory for every P2 filing.
  entries.push({
    fieldName: '4. Recovery % age',
    subFields: [
      { fieldName: '4 (i) Purity of Mixed Juice (Monthly Average) - During Month (in MT)', inputValue: num(f.recovery_purity) },
      { fieldName: '4 (ii) Pol in Mixed Juice % Cane (Monthly Average) - During the Month (in MT)', inputValue: num(f.recovery_pol) }
    ]
  });

  return {
    sectionName: 'Production of white / refined / Raw Sugar from Domestic sources',
    fieldResponses: [
      { fieldName: 'Select', inputValue: JSON.stringify(selected) },
      ...entries
    ]
  };
}

const DISPATCH_RELEASE_SECTIONS = [
  { key: 'disp_611', label: '6.1.1 Domestic Dispatch w.r.t. monthly release quantity' },
  { key: 'disp_612', label: '6.1.2 Domestic Dispatch w.r.t. additional allotment, if any' },
  { key: 'disp_613', label: '6.1.3 Domestic Dispatch w.r.t. extended quota' },
  { key: 'disp_614', label: '6.1.4 Any other domestic Dispatch' }
];

const DISPATCH_TRANSFER_SECTIONS = [
  { key: 'disp_63', label: '6.3 Internal transfer of raw sugar within a group' },
  { key: 'disp_64', label: '6.4 Internal transfer of white sugar within a group' },
  { key: 'disp_65', label: '6.5 Sale of raw sugar to other sugar mills for domestic purpose' }
];

function buildDispatches(f) {
  const selected = [];
  const entries = [];

  for (const s of DISPATCH_RELEASE_SECTIONS) {
    if (!f[`${s.key}_enabled`]) continue;
    selected.push(s.label);
    entries.push({
      fieldName: s.label,
      subFields: [
        { fieldName: 'Release Order - Date', inputValue: date(f[`${s.key}_date`]) },
        { fieldName: 'Release order - Qty Released (MT)', inputValue: num(f[`${s.key}_qty_released`]) },
        { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f[`${s.key}_qty_dispatched`]) },
        { fieldName: 'Remarks', inputValue: text(f[`${s.key}_remarks`]) }
      ]
    });
  }

  if (f.disp_62_enabled) {
    selected.push('6.2 BISS Dispatch of unmarketable old Sugar for further processing');
    entries.push({
      fieldName: '6.2 BISS Dispatch of unmarketable old Sugar for further processing',
      subFields: [
        { fieldName: 'Release Order - Date', inputValue: date(f.disp_62_date) },
        { fieldName: 'Qty Used for reprocessing - During the Month (MT)', inputValue: num(f.disp_62_qty) }
      ]
    });
  }

  for (const s of DISPATCH_TRANSFER_SECTIONS) {
    if (!f[`${s.key}_enabled`]) continue;
    selected.push(s.label);
    // Spread: every serial row becomes its own top-level fieldResponse entry.
    entries.push(...buildSerialEntries(f, s.key, s.label));
  }

  // HSN details are mandatory for every P2 filing.
  entries.push({
    fieldName: 'HSN code and related details',
    subFields: [
      { fieldName: 'Total Quantity of Sales (in MT) for HSN Code - 17011490', inputValue: num(f.hsn_17011490) },
      { fieldName: 'Total Quantity of Sales (in MT) for HSN Code - 17019990', inputValue: num(f.hsn_17019990) },
      { fieldName: 'Total Quantity of Sales (in MT) for HSN Code - Others', inputValue: num(f.hsn_others) }
    ]
  });

  return {
    sectionName: 'Dispatches',
    fieldResponses: [
      { fieldName: 'Select', inputValue: JSON.stringify(selected) },
      ...entries
    ]
  };
}

/** Serial (repeatable) rows for dispatch sections 6.3 / 6.4 / 6.5. */
function buildSerialEntries(f, prefix, fieldName) {
  const entries = [];

  for (let i = 1; i <= MAX_SERIAL_ROWS; i++) {
    const plantCode = f[`${prefix}_${i}_plant_code`];
    const qty = f[`${prefix}_${i}_qty`];
    const hasPlantCode = plantCode !== undefined && String(plantCode).trim() !== '';
    const hasQty = qty !== undefined && String(qty).trim() !== '';
    if (!hasPlantCode && !hasQty) continue;

    entries.push({
      fieldName,
      serialNumber: String(entries.length + 1),
      subFields: [
        { fieldName: 'Plant code of sugar mill to which sugar transferred', inputValue: text(plantCode) },
        { fieldName: 'Qty Transferred to other mills - During the Month (MT)', inputValue: num(qty) }
      ]
    });
  }

  // NSWS requires at least one row when the section is selected.
  if (entries.length === 0) {
    entries.push({
      fieldName,
      serialNumber: '1',
      subFields: [
        { fieldName: 'Plant code of sugar mill to which sugar transferred', inputValue: '0' },
        { fieldName: 'Qty Transferred to other mills - During the Month (MT)', inputValue: '0.00' }
      ]
    });
  }

  return entries;
}

function buildExport(f) {
  const selected = [];
  const entries = [];

  if (f.exp_661_enabled) {
    selected.push('6.6 (a) Export under OGL/Export Quota- (i) White/ refined Sugar');
    entries.push({
      fieldName: '6.6 (a) Export under OGL/Export Quota- (i) White/ refined Sugar',
      subFields: [
        { fieldName: 'Release Order (if applicable) - No.', inputValue: text(f.exp_661_order_no) },
        { fieldName: 'Release Order (if applicable) - Date', inputValue: date(f.exp_661_date) },
        { fieldName: 'Release Order (if applicable) - Qty released (MT)', inputValue: num(f.exp_661_qty_released) },
        { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f.exp_661_qty_dispatched) }
      ]
    });
  }

  if (f.exp_662_enabled) {
    selected.push('6.6 (a) Export under OGL- (ii) Raw Sugar (including SEZ refinery)');
    entries.push({
      fieldName: '6.6 (a) Export under OGL- (ii) Raw Sugar (including SEZ refinery)',
      subFields: [
        { fieldName: 'Release Order (if applicable) - No.', inputValue: text(f.exp_662_order_no) },
        { fieldName: 'Release Order (if applicable) - Date', inputValue: date(f.exp_662_date) },
        { fieldName: 'Release Order (if applicable) - Qty released (MT)', inputValue: num(f.exp_662_qty_released) },
        { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f.exp_662_qty_dispatched) }
      ]
    });
  }

  if (f.exp_663_enabled) {
    selected.push('6.6 (a) Export under OGL- (iii) Raw Sugar Sold to Refineries for Export by Invoice');
    entries.push({
      fieldName: '6.6 (a) Export under OGL- (iii) Raw Sugar Sold to Refineries for Export by Invoice',
      subFields: [
        { fieldName: 'Release Order (if applicable) - No.', inputValue: text(f.exp_663_order_no) },
        { fieldName: 'Release Order (if applicable) - Date', inputValue: date(f.exp_663_date) },
        { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f.exp_663_qty_dispatched) },
        { fieldName: 'Name of mill/refinery to whom sold', inputValue: text(f.exp_663_mill_name) }
      ]
    });
  }

  if (f.exp_66b_enabled) {
    selected.push('6.6 (b) Export under AAS (White Sugar)');
    entries.push({
      fieldName: '6.6 (b) Export under AAS (White Sugar)',
      subFields: [
        { fieldName: 'Export Order (if applicable) - No.', inputValue: text(f.exp_66b_order_no) },
        { fieldName: 'Export Order (if applicable) - Date', inputValue: date(f.exp_66b_date) },
        { fieldName: 'Export Order (if applicable) - Qty released', inputValue: num(f.exp_66b_qty_released) },
        { fieldName: 'Qty Received - During the Month (MT)', inputValue: num(f.exp_66b_qty_received) }
      ]
    });
  }

  return {
    sectionName: 'Export',
    fieldResponses: [
      { fieldName: 'Select', inputValue: JSON.stringify(selected) },
      ...entries
    ]
  };
}

function buildImport(f) {
  const applicable = raw(f.import_applicable).trim() === 'Yes' ? 'Yes' : 'No';

  // The three quantity fields are always sent. When the answer is "No" the mill has
  // nothing to declare, so they go out as "0.00" rather than being omitted - we have
  // no confirmation that NSWS tolerates a partial Import section, and sending zeros
  // is unambiguous either way.
  // Note the plain ASCII hyphens - NSWS matches field names literally.
  const quantities = applicable === 'Yes'
    ? [f.import_ogl_white, f.import_ogl_raw, f.import_aas]
    : ['0', '0', '0'];

  return {
    sectionName: 'Import',
    fieldResponses: [
      { fieldName: 'Is there any import applicable?', inputValue: applicable },
      { fieldName: '6.7 (a) Import under OGL - (i) White/refined Sugar - Qty Received - During the Month (MT)', inputValue: num(quantities[0]) },
      { fieldName: '6.7 (a) Import under OGL - (ii) Raw Sugar - Qty Received - During the Month (MT)', inputValue: num(quantities[1]) },
      { fieldName: '6.7 (b) Import under AAS - Qty Received - During the Month (MT)', inputValue: num(quantities[2]) }
    ]
  };
}

function buildStockOfSugar(f) {
  return {
    sectionName: 'Stock of Sugar (In MT)',
    fieldResponses: [
      {
        fieldName: 'Factory Premises - White Sugar',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_factory_white_open) },
          { fieldName: 'Closing Stock', inputValue: num(f.stock_factory_white_close) }
        ]
      },
      {
        fieldName: 'Factory Premises - BISS / Brown Sugar, If any',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_factory_biss_open) },
          { fieldName: 'Closing Stock', inputValue: num(f.stock_factory_biss_close) }
        ]
      },
      {
        fieldName: 'Factory Premises - Raw Sugar',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_factory_raw_open) },
          { fieldName: 'Closing Stock', inputValue: num(f.stock_factory_raw_close) }
        ]
      },
      {
        fieldName: 'Outside Godown (Duty paid) - White Sugar',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_godown_white_open) },
          { fieldName: 'Closing Stock', inputValue: num(f.stock_godown_white_close) }
        ]
      },
      {
        fieldName: 'Outside Godown (Duty paid) - BISS / Brown Sugar, If any',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_godown_biss_open) },
          { fieldName: 'Closing Stock', inputValue: num(f.stock_godown_biss_close) }
        ]
      },
      {
        fieldName: 'Outside Godown (Duty paid) - Raw Sugar',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_godown_raw_open) },
          { fieldName: 'Closing Stock', inputValue: num(f.stock_godown_raw_close) }
        ]
      }
    ]
  };
}

function buildPackingDetails(f) {
  return {
    sectionName: 'Packing details of Sugar (In MT)',
    fieldResponses: [
      { fieldName: '50 Kg Jute Bag - Qty in MT', inputValue: num(f.pack_jute_50) },
      { fieldName: '100 Kg Jute Bag - Qty in MT', inputValue: num(f.pack_jute_100) },
      { fieldName: '50 Kg PP/HDPE Bag - Qty in MT', inputValue: num(f.pack_pp_50) },
      { fieldName: 'Other Retail Bags (<= 25 Kg and > 100 Kg)/ Loose Sugar - Qty in MT', inputValue: num(f.pack_other) }
    ]
  };
}

function buildCaneDuesData(f) {
  const startYear = seasonStartYear(f.sugarSeason);
  const currentLabel = startYear === null ? raw(f.sugarSeason) : seasonLabel(startYear);

  const fieldResponses = [{
    fieldName: `Sugar Season - ${currentLabel}`,
    subFields: [
      { fieldName: 'Cane Price Payable (in Rs Cr) - During the Month', inputValue: num(f.cane_current_payable) },
      { fieldName: 'Cane Price Paid (in Rs Cr) - During the Month', inputValue: num(f.cane_current_paid) },
      { fieldName: FARMERS_FIELD, inputValue: int(f.cane_current_farmers) }
    ]
  }];

  for (let i = 1; i <= 4; i++) {
    const key = `prev${i}`;
    const label = startYear === null ? key : seasonLabel(startYear - i);

    fieldResponses.push({
      fieldName: `Sugar Season - ${label}`,
      subFields: [
        { fieldName: 'Cane Crushed', inputValue: num(f[`cane_${key}_crushed`]) },
        { fieldName: 'Sugar Production (in MT)', inputValue: num(f[`cane_${key}_production`]) },
        { fieldName: 'Sugar Recovery', inputValue: num(f[`cane_${key}_recovery`]) },
        { fieldName: 'Cane Price Payable (in Rs Cr) - During the Sugar Season', inputValue: num(f[`cane_${key}_payable`]) },
        { fieldName: 'Cane Price Paid (in Rs Cr) - During the Month', inputValue: num(f[`cane_${key}_paid`]) },
        { fieldName: FARMERS_FIELD, inputValue: int(f[`cane_${key}_farmers`]) }
      ]
    });
  }

  return { sectionName: 'Cane Dues Data', fieldResponses };
}

module.exports = {
  buildP2Json,
  // Exported for tests and for reuse by the routes layer.
  helpers: { num, int, text, date, monthValue, seasonLabel, seasonStartYear }
};
