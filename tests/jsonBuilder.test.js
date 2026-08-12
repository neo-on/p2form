const fs = require('fs');
const path = require('path');
const { buildP2Json, helpers } = require('../utils/jsonBuilder');

const referencePayload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'nsws-reference-payload.json'), 'utf8')
);

/** The exact mill account behind the known-good NSWS request. */
const referenceUser = {
  approvalId: 'M009_D001_A076',
  swsId: 'SW4110180373',
  projectNumber: 'P_1',
  undertakingName: 'REVA KRIPA SUGARS PRIVATE LIMITED',
  plantName: 'REVAKRIPA',
  plantCode: '66801',
  state: 'MADHYA PRADESH',
  capacity: '2500'
};

/** Form input that must reproduce the reference payload byte for byte. */
const referenceFormData = {
  sugarSeason: '2025-26',
  month: 'February',
  caneCrushedMonth: '12054.80',

  prod_white_enabled: true,
  white_from_cane: '1487.90',
  white_from_reprocessing: '0',
  white_from_raw_procured: '0',
  white_from_transferred: '0',
  white_from_own_raw: '0',
  white_from_own_raw_produced: '0',

  prod_raw_enabled: true,
  raw_from_cane: '0',
  raw_from_reprocessing: '0',
  raw_procured_domestic: '0',

  prod_procured_enabled: true,
  procured_internal_transfer: '0',
  procured_transfer_plant_code: '0',
  procured_transfer_plant_name: '0',
  procured_imported_raw: '0',

  prod_diversion_enabled: true,
  div_syrup_ethanol: '0',
  div_bheavy_ethanol: '0',
  div_cheavy_ethanol: '0',
  div_bheavy_sale: '0',
  div_syrup_sale: '0',
  div_cheavy_sale: '0',

  prod_ethanol_enabled: true,
  ethanol_syrup: '0',
  ethanol_bheavy: '0',
  ethanol_cheavy: '0',

  recovery_purity: '80.90',
  recovery_pol: '11.53',

  disp_611_enabled: true,
  disp_611_date: '2026-01-30',
  disp_611_qty_released: '1278',
  disp_611_qty_dispatched: '1133',
  disp_611_remarks: '0',

  disp_612_enabled: true,
  disp_612_date: '16/03/2026',
  disp_612_qty_released: '0',
  disp_612_qty_dispatched: '0',
  disp_612_remarks: '0',

  disp_613_enabled: true,
  disp_613_date: '16/03/2026',
  disp_613_qty_released: '0',
  disp_613_qty_dispatched: '0',
  disp_613_remarks: '0',

  disp_614_enabled: true,
  disp_614_date: '16/03/2026',
  disp_614_qty_released: '0',
  disp_614_qty_dispatched: '0',
  disp_614_remarks: '0',

  disp_62_enabled: true,
  disp_62_date: '16/03/2026',
  disp_62_qty: '0',

  disp_63_enabled: true,
  disp_63_1_plant_code: '0',
  disp_63_1_qty: '0',

  disp_64_enabled: true,
  disp_64_1_plant_code: '0',
  disp_64_1_qty: '0',

  disp_65_enabled: true,
  disp_65_1_plant_code: '0',
  disp_65_1_qty: '0',

  hsn_17011490: '1133',
  hsn_17019990: '0',
  hsn_others: '0',

  exp_661_enabled: true,
  exp_661_order_no: '0',
  exp_661_date: '16/03/2026',
  exp_661_qty_released: '0',
  exp_661_qty_dispatched: '0',

  exp_662_enabled: true,
  exp_662_order_no: '0',
  exp_662_date: '16/03/2026',
  exp_662_qty_released: '0',
  exp_662_qty_dispatched: '0',

  exp_663_enabled: true,
  exp_663_order_no: '0',
  exp_663_date: '16/03/2026',
  exp_663_qty_dispatched: '0',
  exp_663_mill_name: '0',

  exp_66b_enabled: true,
  exp_66b_order_no: '0',
  exp_66b_date: '16/03/2026',
  exp_66b_qty_released: '0',
  exp_66b_qty_received: '0',

  import_applicable: 'Yes',
  import_ogl_white: '0',
  import_ogl_raw: '0',
  import_aas: '0',

  stock_factory_white_open: '7879.70',
  stock_factory_biss_open: '0',
  stock_factory_biss_close: '0',
  stock_factory_raw_open: '0',
  stock_godown_white_open: '0',
  stock_godown_white_close: '0',
  stock_godown_biss_open: '0',
  stock_godown_biss_close: '0',
  stock_godown_raw_open: '0',
  stock_godown_raw_close: '0',

  pack_jute_50: '0',
  pack_jute_100: '0',
  pack_pp_50: '8234.60',
  pack_other: '0',

  cane_current_payable: '4.68',
  cane_current_paid: '4.24',
  cane_current_farmers: '699',

  cane_prev1_crushed: '75428',
  cane_prev1_production: '6548.10',
  cane_prev1_recovery: '8.68',
  cane_prev1_payable: '25.52',
  cane_prev1_paid: '0',
  cane_prev1_farmers: '710',

  cane_prev2_crushed: '122454.80',
  cane_prev2_production: '12331.50',
  cane_prev2_recovery: '0',
  cane_prev2_payable: '42.21',
  cane_prev2_paid: '0',
  cane_prev2_farmers: '0',

  cane_prev3_crushed: '0',
  cane_prev3_production: '0',
  cane_prev3_recovery: '0',
  cane_prev3_payable: '32.14',
  cane_prev3_paid: '0',
  cane_prev3_farmers: '0',

  cane_prev4_crushed: '117367.50',
  cane_prev4_production: '11674.00',
  cane_prev4_recovery: '9.95',
  cane_prev4_payable: '38.48',
  cane_prev4_paid: '0',
  cane_prev4_farmers: '986'
};

/** Walks the payload and collects "section > field > subField" paths. */
function collectPaths(payload) {
  const paths = [];
  for (const section of payload[0].forms[0].sections) {
    for (const fr of section.fieldResponses) {
      const base = `${section.sectionName} > ${fr.fieldName}${fr.serialNumber ? ` #${fr.serialNumber}` : ''}`;
      if (Array.isArray(fr.subFields)) {
        for (const sf of fr.subFields) paths.push(`${base} > ${sf.fieldName}`);
      } else {
        paths.push(base);
      }
    }
  }
  return paths;
}

/**
 * Deliberate superset over the captured reference request.
 *
 * The reference sample omitted "Closing Stock" for the two factory-premises rows
 * (white and raw sugar). We cannot verify that NSWS derives those server-side, so
 * we always send both opening and closing figures for every stock row. Everything
 * else must still match the reference exactly.
 */
const INTENTIONAL_ADDITIONS = [
  { fieldName: 'Factory Premises - White Sugar', subField: 'Closing Stock' },
  { fieldName: 'Factory Premises - Raw Sugar', subField: 'Closing Stock' }
];

/** Reference payload with the intentional additions applied, for strict comparison. */
function expectedPayload() {
  const clone = JSON.parse(JSON.stringify(referencePayload));
  const stock = clone[0].forms[0].sections.find(s => s.sectionName === 'Stock of Sugar (In MT)');
  for (const add of INTENTIONAL_ADDITIONS) {
    const row = stock.fieldResponses.find(fr => fr.fieldName === add.fieldName);
    row.subFields.push({ fieldName: add.subField, inputValue: '0.00' });
  }
  return clone;
}

describe('utils/jsonBuilder.js — NSWS payload parity', () => {
  const payload = buildP2Json(referenceUser, referenceFormData);

  test('reproduces the known-good NSWS payload exactly', () => {
    expect(payload).toEqual(expectedPayload());
  });

  test('only the documented closing-stock additions differ from the reference', () => {
    const ours = new Set(collectPaths(payload));
    const theirs = new Set(collectPaths(referencePayload));
    const extra = [...ours].filter(p => !theirs.has(p));
    const missing = [...theirs].filter(p => !ours.has(p));

    expect(missing).toEqual([]);
    expect(extra).toEqual(
      INTENTIONAL_ADDITIONS.map(a => `Stock of Sugar (In MT) > ${a.fieldName} > ${a.subField}`)
    );
  });

  test('every stock row reports both opening and closing stock', () => {
    const stock = payload[0].forms[0].sections.find(s => s.sectionName === 'Stock of Sugar (In MT)');
    expect(stock.fieldResponses).toHaveLength(6);
    for (const row of stock.fieldResponses) {
      expect(row.subFields.map(sf => sf.fieldName)).toEqual(['Opening Stock', 'Closing Stock']);
    }
  });

  test('field name coverage matches the reference payload with no gaps', () => {
    expect(collectPaths(payload)).toEqual(collectPaths(expectedPayload()));
  });

  test('fieldResponses is always a flat array of objects (never nested arrays)', () => {
    for (const section of payload[0].forms[0].sections) {
      expect(Array.isArray(section.fieldResponses)).toBe(true);
      for (const fr of section.fieldResponses) {
        expect(Array.isArray(fr)).toBe(false);
        expect(typeof fr).toBe('object');
        expect(typeof fr.fieldName).toBe('string');
        if (fr.subFields) {
          for (const sf of fr.subFields) {
            expect(Array.isArray(sf)).toBe(false);
            expect(typeof sf.inputValue).toBe('string');
          }
        } else {
          expect(typeof fr.inputValue).toBe('string');
        }
      }
    }
  });

  test('every inputValue is a non-empty string', () => {
    for (const section of payload[0].forms[0].sections) {
      for (const fr of section.fieldResponses) {
        const values = fr.subFields ? fr.subFields.map(sf => sf.inputValue) : [fr.inputValue];
        for (const v of values) {
          expect(typeof v).toBe('string');
          expect(v.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('Import field names use ASCII hyphens, not en dashes', () => {
    const importSection = payload[0].forms[0].sections.find(s => s.sectionName === 'Import');
    for (const fr of importSection.fieldResponses) {
      expect(fr.fieldName).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe('utils/jsonBuilder.js — defaults & coercion', () => {
  test('blank form still produces a structurally valid payload with 0.00 defaults', () => {
    const payload = buildP2Json(referenceUser, { sugarSeason: '2024-25', month: 'November' });
    const sections = payload[0].forms[0].sections;

    const caneCrushed = sections.find(s => s.sectionName === 'Cane Crushed');
    expect(caneCrushed.fieldResponses[1].inputValue).toBe('0.00');

    const production = sections.find(s => s.sectionName.startsWith('Production of white'));
    expect(production.fieldResponses[0].inputValue).toBe('[]');
    // Only "Select" + mandatory "4. Recovery % age" remain.
    expect(production.fieldResponses).toHaveLength(2);
    expect(production.fieldResponses[1].fieldName).toBe('4. Recovery % age');

    const dispatches = sections.find(s => s.sectionName === 'Dispatches');
    expect(dispatches.fieldResponses[0].inputValue).toBe('[]');
    expect(dispatches.fieldResponses[1].fieldName).toBe('HSN code and related details');

    const importSection = sections.find(s => s.sectionName === 'Import');
    expect(importSection.fieldResponses).toHaveLength(4);
    expect(importSection.fieldResponses[0].inputValue).toBe('No');
  });

  test('Import always sends all four fields, zero-filled when not applicable', () => {
    for (const answer of ['No', '', undefined, 'Yes']) {
      const sections = buildP2Json(referenceUser, {
        sugarSeason: '2025-26',
        import_applicable: answer
      })[0].forms[0].sections;
      const importSection = sections.find(s => s.sectionName === 'Import');

      expect(importSection.fieldResponses.map(fr => fr.fieldName)).toEqual([
        'Is there any import applicable?',
        '6.7 (a) Import under OGL - (i) White/refined Sugar - Qty Received - During the Month (MT)',
        '6.7 (a) Import under OGL - (ii) Raw Sugar - Qty Received - During the Month (MT)',
        '6.7 (b) Import under AAS - Qty Received - During the Month (MT)'
      ]);
      expect(importSection.fieldResponses.slice(1).map(fr => fr.inputValue)).toEqual(['0.00', '0.00', '0.00']);
    }
  });

  test('Import quantities are zeroed when the mill answers "No", even if values were typed', () => {
    const sections = buildP2Json(referenceUser, {
      sugarSeason: '2025-26',
      import_applicable: 'No',
      import_ogl_white: '120.50',
      import_ogl_raw: '80',
      import_aas: '15.25'
    })[0].forms[0].sections;
    const importSection = sections.find(s => s.sectionName === 'Import');
    expect(importSection.fieldResponses.slice(1).map(fr => fr.inputValue)).toEqual(['0.00', '0.00', '0.00']);
  });

  test('month is uppercased for NSWS', () => {
    const payload = buildP2Json(referenceUser, { sugarSeason: '2025-26', month: 'February' });
    const applied = payload[0].forms[0].sections[0];
    expect(applied.fieldResponses[1].inputValue).toBe('FEBRUARY');
  });

  test('cane dues seasons are derived from the selected sugar season', () => {
    const payload = buildP2Json(referenceUser, { sugarSeason: '2025-26' });
    const caneDues = payload[0].forms[0].sections.find(s => s.sectionName === 'Cane Dues Data');
    expect(caneDues.fieldResponses.map(fr => fr.fieldName)).toEqual([
      'Sugar Season - 2025-26',
      'Sugar Season - 2024-25',
      'Sugar Season - 2023-24',
      'Sugar Season - 2022-23',
      'Sugar Season - 2021-22'
    ]);
  });

  test('serial rows are renumbered contiguously and blank rows are skipped', () => {
    const payload = buildP2Json(referenceUser, {
      sugarSeason: '2025-26',
      disp_63_enabled: true,
      disp_63_1_plant_code: '',
      disp_63_1_qty: '',
      disp_63_2_plant_code: '12345',
      disp_63_2_qty: '10',
      disp_63_3_plant_code: '67890',
      disp_63_3_qty: '20.5'
    });
    const dispatches = payload[0].forms[0].sections.find(s => s.sectionName === 'Dispatches');
    const rows = dispatches.fieldResponses.filter(fr => fr.fieldName.startsWith('6.3 '));
    expect(rows.map(r => r.serialNumber)).toEqual(['1', '2']);
    expect(rows[0].subFields[0].inputValue).toBe('12345');
    expect(rows[1].subFields[1].inputValue).toBe('20.50');
  });

  test('helpers coerce values the way NSWS expects', () => {
    expect(helpers.num('1,234.5')).toBe('1234.50');
    expect(helpers.num('')).toBe('0.00');
    expect(helpers.num('abc')).toBe('0.00');
    expect(helpers.int('699.4')).toBe('699');
    expect(helpers.text('  ')).toBe('0');
    expect(helpers.date('2026-01-30')).toBe('30/01/2026');
    expect(helpers.date('16/03/2026')).toBe('16/03/2026');
    expect(helpers.date('')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(helpers.seasonLabel(2025)).toBe('2025-26');
    expect(helpers.seasonStartYear('2025-26')).toBe(2025);
  });
});
