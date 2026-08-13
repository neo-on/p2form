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
 * IMPORTANT: `fieldResponses` is a FLAT array of objects.
 *
 *   The official "P2 Form API Document v1.3" and the shipped `P2_Request_json_...json`
 *   sample both wrap every entry in its own array - `"fieldResponses": [ [ {...} ], [ {...} ] ]`.
 *   We deliberately do NOT copy that. The flat form is the one used by the request that
 *   is actually accepted by the production endpoint, and nested arrays were rejected.
 *   Both documents target the UAT host; treat the flat form as authoritative.
 *
 * IMPORTANT: the P2 return is a COMPLETE monthly declaration. NSWS expects every
 * section, every subsection and every subField on every filing, zero-filled where
 * the mill has nothing to report - exactly as the accepted reference payload does
 * (all `Select` lists full, unused quantities `"0.00"`, unused text `"0"`, unused
 * dates carrying a filler date). Consequently the `*_enabled` checkboxes in the UI
 * only control which rows are *editable on screen*; they never remove anything from
 * the payload. Sending a subset produced "Kindly provide mandatory subField..."
 * rejections; sending extra/unknown fields produced hard HTTP 500s. The safe
 * envelope is: exactly the reference field set, no more, no less, always.
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
 * The farmer-count subField label. NSWS uses TWO different labels depending on how
 * recent the season is, and the choice is part of its schema - not a typo:
 *
 *   Sugar Season - 2024-25 (prev 1)  ->  "... procured - During the Month"
 *   Sugar Season - 2023-24 (prev 2)  ->  "... procured - During the Month"
 *   Sugar Season - 2022-23 (prev 3)  ->  "... procured"
 *   Sugar Season - 2021-22 (prev 4)  ->  "... procured"
 *   Current season                   ->  "... procured"
 *
 * The two most recent previous seasons are the ones whose cane dues are still being
 * settled month by month, so NSWS asks for a monthly farmer count there and a plain
 * seasonal one for the older, purely historical seasons.
 *
 * This was previously "normalised" to the plain label for every season, and NSWS
 * answered:
 *
 *   {"status":"200","message":" Kindly provide mandatory subField under Field
 *    Sugar Season - 2024-25 under section Cane Dues Data Kindly provide mandatory
 *    subField under Field Sugar Season - 2023-24 under section Cane Dues Data",
 *    "uniqueId":null}
 *
 * The two seasons it named are exactly the two whose label had been changed, which
 * confirms the suffixed label is mandatory for them. Do not "tidy up" this asymmetry.
 */
const FARMERS_FIELD = 'No. of farmers from which cane procured';
const FARMERS_FIELD_MONTH = `${FARMERS_FIELD} - During the Month`;

/**
 * Previous seasons 1 and 2 use the monthly farmer label; 3 and 4 use the plain one.
 *
 * The asymmetry is POSITIONAL, not tied to specific years, and it is confirmed by two
 * independent sources:
 *   - the accepted production request (season 2025-26): 2024-25 and 2023-24 carry
 *     "- During the Month", 2022-23 and 2021-22 do not;
 *   - the official "P2 Form API Document v1.3" sample (season 2024-25): 2023-24 and
 *     2022-23 carry it, 2021-22 and 2020-21 do not.
 * Different years, same slot 1-2 vs 3-4 split. Normalising these to one spelling is what
 * produced "Kindly provide mandatory subField under Field Sugar Season - ..." rejections.
 */
function farmersFieldFor(previousSeasonIndex) {
  return previousSeasonIndex <= 2 ? FARMERS_FIELD_MONTH : FARMERS_FIELD;
}

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

/**
 * Every subsection NSWS defines for the Production section, in its own order.
 *
 * The whole block is sent on every filing, exactly as the known-good request does -
 * see the "COMPLETE monthly declaration" note at the top of this file. The `_enabled`
 * toggles on the form only decide whether the fields are shown for editing; a subsection
 * the mill did not use goes out zero-filled rather than being omitted.
 */
const PRODUCTION_SUBSECTIONS = [
  {
    label: '2(I) White / Refined Sugar',
    subFields: f => [
      { fieldName: 'a) From Cane - During the Month (MT)', inputValue: num(f.white_from_cane) },
      { fieldName: 'b) From Reprocessing unmarketable old Sugar - During the Month (MT)', inputValue: num(f.white_from_reprocessing) },
      { fieldName: 'c) From raw procured from other domestic sugar mills - During the Month (MT)', inputValue: num(f.white_from_raw_procured) },
      { fieldName: 'c(1) From transferred white sugar from other domestic sugar mills - During the Month (MT)', inputValue: num(f.white_from_transferred) },
      { fieldName: 'c(2) From Raw Sugar used from own Stock - During the Month (MT)', inputValue: num(f.white_from_own_raw) },
      { fieldName: 'c(3) White sugar produced from own stock of raw sugar - During the Month (MT)', inputValue: num(f.white_from_own_raw_produced) }
    ]
  },
  {
    label: '2(II) Raw Sugar',
    subFields: f => [
      { fieldName: 'a) From Cane - During the Month (MT)', inputValue: num(f.raw_from_cane) },
      { fieldName: 'b) From Reprocessing unmarketable old Sugar - During the Month (MT)', inputValue: num(f.raw_from_reprocessing) },
      { fieldName: 'c) Raw sugar procured from other domestic sugar mills', inputValue: num(f.raw_procured_domestic) }
    ]
  },
  {
    label: '2(III) Procured sugar',
    subFields: f => [
      { fieldName: 'a) Raw Sugar - Internal transfer from other group sugar mills - During the Month (MT)', inputValue: num(f.procured_internal_transfer) },
      { fieldName: 'Internal transfer - Plant Code', inputValue: text(f.procured_transfer_plant_code) },
      { fieldName: 'Internal transfer - Plant Name', inputValue: text(f.procured_transfer_plant_name) },
      { fieldName: 'b) From Imported Raw Sugar - During the Month (MT)', inputValue: num(f.procured_imported_raw) }
    ]
  },
  {
    label: '3(1) Diversion/sale of B-heavy/Syrup/sugarcane juice/sugar',
    subFields: f => [
      { fieldName: '(i).a. Qty of Syrup/Sugarcane Juice/Sugar diverted for ethanol - During the Month (in MT)', inputValue: num(f.div_syrup_ethanol) },
      { fieldName: '(ii).a. Qty of B-Heavy diverted for ethanol - During the Month (MT)', inputValue: num(f.div_bheavy_ethanol) },
      { fieldName: '(iii).a. Qty of C-Heavy diverted for ethanol - During the Month (MT)', inputValue: num(f.div_cheavy_ethanol) },
      { fieldName: '(iv) Sale of B-Heavy - During the Month (MT)', inputValue: num(f.div_bheavy_sale) },
      { fieldName: '(v) Sale of Syrup/Sugarcane Juice/Sugar - During the Month (MT)', inputValue: num(f.div_syrup_sale) },
      { fieldName: '(vi) Sale of C-Heavy - During the Month (MT)', inputValue: num(f.div_cheavy_sale) }
    ]
  },
  {
    label: '3(2) Ethanol Production',
    subFields: f => [
      { fieldName: '(i).b. Ethanol Production from In-house Syrup/Sugarcane Juice/Sugar - During the Month (in KL)', inputValue: num(f.ethanol_syrup) },
      { fieldName: '(ii).b. Ethanol Production from In-house B-Heavy - During the Month (in KL)', inputValue: num(f.ethanol_bheavy) },
      { fieldName: '(iii).b. Ethanol Production from In-house C-Heavy - During the Month (in KL)', inputValue: num(f.ethanol_cheavy) }
    ]
  }
];

function buildProduction(f) {
  const entries = PRODUCTION_SUBSECTIONS.map(s => ({
    fieldName: s.label,
    subFields: s.subFields(f)
  }));

  // "4. Recovery % age" is mandatory and is not part of the Select list.
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
      { fieldName: 'Select', inputValue: JSON.stringify(PRODUCTION_SUBSECTIONS.map(s => s.label)) },
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

const DISPATCH_BISS_SECTION = '6.2 BISS Dispatch of unmarketable old Sugar for further processing';

/** The Select list for Dispatches, in the exact order NSWS uses. */
const DISPATCH_SELECT = [
  ...DISPATCH_RELEASE_SECTIONS.map(s => s.label),
  DISPATCH_BISS_SECTION,
  ...DISPATCH_TRANSFER_SECTIONS.map(s => s.label)
];

function buildDispatches(f) {
  const entries = [];

  for (const s of DISPATCH_RELEASE_SECTIONS) {
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

  entries.push({
    fieldName: DISPATCH_BISS_SECTION,
    subFields: [
      { fieldName: 'Release Order - Date', inputValue: date(f.disp_62_date) },
      { fieldName: 'Qty Used for reprocessing - During the Month (MT)', inputValue: num(f.disp_62_qty) }
    ]
  });

  for (const s of DISPATCH_TRANSFER_SECTIONS) {
    // Spread: every serial row becomes its own top-level fieldResponse entry.
    entries.push(...buildSerialEntries(f, s.key, s.label));
  }

  // HSN details are mandatory and are not part of the Select list.
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
      { fieldName: 'Select', inputValue: JSON.stringify(DISPATCH_SELECT) },
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

/** Every subsection NSWS defines for the Export section, in its own order. */
const EXPORT_SUBSECTIONS = [
  {
    label: '6.6 (a) Export under OGL/Export Quota- (i) White/ refined Sugar',
    subFields: f => [
      { fieldName: 'Release Order (if applicable) - No.', inputValue: text(f.exp_661_order_no) },
      { fieldName: 'Release Order (if applicable) - Date', inputValue: date(f.exp_661_date) },
      { fieldName: 'Release Order (if applicable) - Qty released (MT)', inputValue: num(f.exp_661_qty_released) },
      { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f.exp_661_qty_dispatched) }
    ]
  },
  {
    label: '6.6 (a) Export under OGL- (ii) Raw Sugar (including SEZ refinery)',
    subFields: f => [
      { fieldName: 'Release Order (if applicable) - No.', inputValue: text(f.exp_662_order_no) },
      { fieldName: 'Release Order (if applicable) - Date', inputValue: date(f.exp_662_date) },
      { fieldName: 'Release Order (if applicable) - Qty released (MT)', inputValue: num(f.exp_662_qty_released) },
      { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f.exp_662_qty_dispatched) }
    ]
  },
  {
    label: '6.6 (a) Export under OGL- (iii) Raw Sugar Sold to Refineries for Export by Invoice',
    subFields: f => [
      { fieldName: 'Release Order (if applicable) - No.', inputValue: text(f.exp_663_order_no) },
      { fieldName: 'Release Order (if applicable) - Date', inputValue: date(f.exp_663_date) },
      { fieldName: 'Qty Dispatched - During the Month (MT)', inputValue: num(f.exp_663_qty_dispatched) },
      { fieldName: 'Name of mill/refinery to whom sold', inputValue: text(f.exp_663_mill_name) }
    ]
  },
  {
    label: '6.6 (b) Export under AAS (White Sugar)',
    subFields: f => [
      { fieldName: 'Export Order (if applicable) - No.', inputValue: text(f.exp_66b_order_no) },
      { fieldName: 'Export Order (if applicable) - Date', inputValue: date(f.exp_66b_date) },
      { fieldName: 'Export Order (if applicable) - Qty released', inputValue: num(f.exp_66b_qty_released) },
      { fieldName: 'Qty Received - During the Month (MT)', inputValue: num(f.exp_66b_qty_received) }
    ]
  }
];

function buildExport(f) {
  return {
    sectionName: 'Export',
    fieldResponses: [
      { fieldName: 'Select', inputValue: JSON.stringify(EXPORT_SUBSECTIONS.map(s => s.label)) },
      ...EXPORT_SUBSECTIONS.map(s => ({ fieldName: s.label, subFields: s.subFields(f) }))
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
        // NSWS defines only "Opening Stock" for the two factory-premises rows it can
        // derive the closing figure for (closing = opening + production - dispatches).
        // Sending a "Closing Stock" subField here makes NSWS answer HTTP 500, so the
        // form does not collect one either. The BISS and godown rows DO take both.
        fieldName: 'Factory Premises - White Sugar',
        subFields: [
          { fieldName: 'Opening Stock', inputValue: num(f.stock_factory_white_open) }
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
          { fieldName: 'Opening Stock', inputValue: num(f.stock_factory_raw_open) }
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

    // Exactly the six subFields NSWS defines for a previous season, in its own order.
    // Sending anything beyond this set makes NSWS answer HTTP 500 - it has no schema
    // entry for the unknown label and fails while mapping the section. Extra fields are
    // NOT ignored here, so do not add "helpful" cumulative or arrears figures.
    fieldResponses.push({
      fieldName: `Sugar Season - ${label}`,
      subFields: [
        { fieldName: 'Cane Crushed', inputValue: num(f[`cane_${key}_crushed`]) },
        { fieldName: 'Sugar Production (in MT)', inputValue: num(f[`cane_${key}_production`]) },
        { fieldName: 'Sugar Recovery', inputValue: num(f[`cane_${key}_recovery`]) },
        { fieldName: 'Cane Price Payable (in Rs Cr) - During the Sugar Season', inputValue: num(f[`cane_${key}_payable`]) },
        { fieldName: 'Cane Price Paid (in Rs Cr) - During the Month', inputValue: num(f[`cane_${key}_paid`]) },
        { fieldName: farmersFieldFor(i), inputValue: int(f[`cane_${key}_farmers`]) }
      ]
    });
  }

  return { sectionName: 'Cane Dues Data', fieldResponses };
}

/**
 * Walks a finished payload and reports every field carrying a blank value.
 *
 * NSWS rejects empty strings, so this is the last line of defence before the
 * request leaves the server: it turns a remote rejection into a local, readable
 * error that names the offending field.
 */
function findEmptyPayloadValues(p2Json) {
  const problems = [];
  for (const entry of p2Json || []) {
    for (const key of ['approvalId', 'swsId', 'projectNumber']) {
      if (!String(entry[key] == null ? '' : entry[key]).trim()) problems.push(key);
    }
    for (const form of entry.forms || []) {
      for (const section of form.sections || []) {
        for (const fr of section.fieldResponses || []) {
          for (const sf of fr.subFields || [fr]) {
            if (!String(sf.inputValue == null ? '' : sf.inputValue).trim()) {
              problems.push(`${section.sectionName} > ${fr.fieldName}${fr.subFields ? ` > ${sf.fieldName}` : ''}`);
            }
          }
        }
      }
    }
  }
  return problems;
}

module.exports = {
  buildP2Json,
  findEmptyPayloadValues,
  // Exported for tests and for reuse by the routes layer.
  helpers: { num, int, text, date, monthValue, seasonLabel, seasonStartYear }
};
