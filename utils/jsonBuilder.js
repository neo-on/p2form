/**
 * Builds the final P2 API JSON payload by merging:
 * - User constants from MongoDB (approvalId, swsId, mill details)
 * - Form data submitted by the user
 */

function buildP2Json(user, formData) {
  const json = [{
    approvalId: user.approvalId,
    swsId: user.swsId,
    projectNumber: user.projectNumber,
    forms: [{
      name: "P2 Form (Directorate of Sugar)",
      sections: [
        buildFormAppliedFor(formData),
        buildSugarMillDetails(user),
        buildCaneCrushed(user, formData),
        buildProduction(formData),
        buildDispatches(formData),
        buildExport(formData),
        buildImport(formData),
        buildStockOfSugar(formData),
        buildPackingDetails(formData),
        buildCaneDuesData(formData)
      ]
    }]
  }];
  return json;
}

function buildFormAppliedFor(f) {
  return {
    sectionName: "Form applied for -",
    fieldResponses: [
      { fieldName: "Sugar Season", inputValue: f.sugarSeason || "" },
      { fieldName: "Month", inputValue: f.month || "" }
    ]
  };
}

function buildSugarMillDetails(user) {
  return {
    sectionName: "Sugar Mill Details",
    fieldResponses: [
      { fieldName: "Name of the Undertaking/Group", inputValue: user.undertakingName },
      { fieldName: "Plant Name", inputValue: user.plantName },
      { fieldName: "Plant Code", inputValue: user.plantCode },
      { fieldName: "State", inputValue: user.state }
    ]
  };
}

function buildCaneCrushed(user, f) {
  return {
    sectionName: "Cane Crushed",
    fieldResponses: [
      [{ fieldName: "Capacity (In TCD for sugar mills/Tons Per Day (TPD) for refineries)", inputValue: user.capacity }],
      [{ fieldName: "Cane Crushed - During the Month (MT)", inputValue: f.caneCrushedMonth || "" }]
    ]
  };
}

function buildProduction(f) {
  // Build select values based on which sub-sections user chose
  const selectedProduction = [];
  if (f.prod_white_enabled) selectedProduction.push("2(I) White / Refined Sugar");
  if (f.prod_raw_enabled) selectedProduction.push("2(II) Raw Sugar");
  if (f.prod_procured_enabled) selectedProduction.push("2(III) Procured sugar");
  if (f.prod_diversion_enabled) selectedProduction.push("3(1) Diversion/sale of B-heavy/Syrup/sugarcane juice/sugar");
  if (f.prod_ethanol_enabled) selectedProduction.push("3(2) Ethanol Production");

  const fieldResponses = [
    [{ fieldName: "Select", inputValue: JSON.stringify(selectedProduction) }]
  ];

  if (f.prod_white_enabled) {
    fieldResponses.push([{
      fieldName: "2(I) White / Refined Sugar",
      subFields: [
        { fieldName: "a) From Cane - During the Month (MT)", inputValue: f.white_from_cane || "" },
        { fieldName: "b) From Reprocessing unmarketable old Sugar - During the Month (MT)", inputValue: f.white_from_reprocessing || "" },
        { fieldName: "c) From raw procured from other domestic sugar mills - During the Month (MT)", inputValue: f.white_from_raw_procured || "" },
        { fieldName: "c(1) From transferred white sugar from other domestic sugar mills - During the Month (MT)", inputValue: f.white_from_transferred || "" },
        { fieldName: "c(2) From Raw Sugar used from own Stock - During the Month (MT)", inputValue: f.white_from_own_raw || "" },
        { fieldName: "c(3) White sugar produced from own stock of raw sugar - During the Month (MT)", inputValue: f.white_from_own_raw_produced || "" }
      ]
    }]);
  }

  if (f.prod_raw_enabled) {
    fieldResponses.push([{
      fieldName: "2(II) Raw Sugar",
      subFields: [
        { fieldName: "a) From Cane - During the Month (MT)", inputValue: f.raw_from_cane || "" },
        { fieldName: "b) From Reprocessing unmarketable old Sugar - During the Month (MT)", inputValue: f.raw_from_reprocessing || "" },
        { fieldName: "c) Raw sugar procured from other domestic sugar mills", inputValue: f.raw_procured_domestic || "" }
      ]
    }]);
  }

  if (f.prod_procured_enabled) {
    fieldResponses.push([{
      fieldName: "2(III) Procured sugar",
      subFields: [
        { fieldName: "a) Raw Sugar - Internal transfer from other group sugar mills - During the Month (MT)", inputValue: f.procured_internal_transfer || "" },
        { fieldName: "Internal transfer - Plant Code", inputValue: f.procured_transfer_plant_code || "" },
        { fieldName: "Internal transfer - Plant Name", inputValue: f.procured_transfer_plant_name || "" },
        { fieldName: "b) From Imported Raw Sugar - During the Month (MT)", inputValue: f.procured_imported_raw || "" }
      ]
    }]);
  }

  if (f.prod_diversion_enabled) {
    fieldResponses.push([{
      fieldName: "3(1) Diversion/sale of B-heavy/Syrup/sugarcane juice/sugar",
      subFields: [
        { fieldName: "(i).a. Qty of Syrup/Sugarcane Juice/Sugar diverted for ethanol - During the Month (in MT)", inputValue: f.div_syrup_ethanol || "" },
        { fieldName: "(ii).a. Qty of B-Heavy diverted for ethanol - During the Month (MT)", inputValue: f.div_bheavy_ethanol || "" },
        { fieldName: "(iii).a. Qty of C-Heavy diverted for ethanol - During the Month (MT)", inputValue: f.div_cheavy_ethanol || "" },
        { fieldName: "(iv) Sale of B-Heavy - During the Month (MT)", inputValue: f.div_bheavy_sale || "" },
        { fieldName: "(v) Sale of Syrup/Sugarcane Juice/Sugar - During the Month (MT)", inputValue: f.div_syrup_sale || "" },
        { fieldName: "(vi) Sale of C-Heavy - During the Month (MT)", inputValue: f.div_cheavy_sale || "" }
      ]
    }]);
  }

  if (f.prod_ethanol_enabled) {
    fieldResponses.push([{
      fieldName: "3(2) Ethanol Production",
      subFields: [
        { fieldName: "(i).b. Ethanol Production from In-house Syrup/Sugarcane Juice/Sugar - During the Month (in KL)", inputValue: f.ethanol_syrup || "" },
        { fieldName: "(ii).b. Ethanol Production from In-house B-Heavy - During the Month (in KL)", inputValue: f.ethanol_bheavy || "" },
        { fieldName: "(iii).b. Ethanol Production from In-house C-Heavy - During the Month (in KL)", inputValue: f.ethanol_cheavy || "" }
      ]
    }]);
  }

  // Recovery % age is always included
  fieldResponses.push([{
    fieldName: "4. Recovery % age",
    subFields: [
      { fieldName: "4 (i) Purity of Mixed Juice (Monthly Average) - During Month (in MT)", inputValue: f.recovery_purity || "" },
      { fieldName: "4 (ii) Pol in Mixed Juice % Cane (Monthly Average) - During the Month (in MT)", inputValue: f.recovery_pol || "" }
    ]
  }]);

  return {
    sectionName: "Production of white / refined / Raw Sugar from Domestic sources",
    fieldResponses
  };
}

function buildDispatches(f) {
  const selectedDispatches = [];
  if (f.disp_611_enabled) selectedDispatches.push("6.1.1 Domestic Dispatch w.r.t. monthly release quantity");
  if (f.disp_612_enabled) selectedDispatches.push("6.1.2 Domestic Dispatch w.r.t. additional allotment, if any");
  if (f.disp_613_enabled) selectedDispatches.push("6.1.3 Domestic Dispatch w.r.t. extended quota");
  if (f.disp_614_enabled) selectedDispatches.push("6.1.4 Any other domestic Dispatch");
  if (f.disp_62_enabled) selectedDispatches.push("6.2 BISS Dispatch of unmarketable old Sugar for further processing");
  if (f.disp_63_enabled) selectedDispatches.push("6.3 Internal transfer of raw sugar within a group");
  if (f.disp_64_enabled) selectedDispatches.push("6.4 Internal transfer of white sugar within a group");
  if (f.disp_65_enabled) selectedDispatches.push("6.5 Sale of raw sugar to other sugar mills for domestic purpose");

  const fieldResponses = [
    [{ fieldName: "Select", inputValue: JSON.stringify(selectedDispatches) }]
  ];

  if (f.disp_611_enabled) {
    fieldResponses.push([{
      fieldName: "6.1.1 Domestic Dispatch w.r.t. monthly release quantity",
      subFields: [
        { fieldName: "Release Order - Date", inputValue: f.disp_611_date || "" },
        { fieldName: "Release order - Qty Released (MT)", inputValue: f.disp_611_qty_released || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.disp_611_qty_dispatched || "" },
        { fieldName: "Remarks", inputValue: f.disp_611_remarks || "" }
      ]
    }]);
  }

  if (f.disp_612_enabled) {
    fieldResponses.push([{
      fieldName: "6.1.2 Domestic Dispatch w.r.t. additional allotment, if any",
      subFields: [
        { fieldName: "Release Order - Date", inputValue: f.disp_612_date || "" },
        { fieldName: "Release order - Qty Released (MT)", inputValue: f.disp_612_qty_released || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.disp_612_qty_dispatched || "" },
        { fieldName: "Remarks", inputValue: f.disp_612_remarks || "" }
      ]
    }]);
  }

  if (f.disp_613_enabled) {
    fieldResponses.push([{
      fieldName: "6.1.3 Domestic Dispatch w.r.t. extended quota",
      subFields: [
        { fieldName: "Release Order - Date", inputValue: f.disp_613_date || "" },
        { fieldName: "Release order - Qty Released (MT)", inputValue: f.disp_613_qty_released || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.disp_613_qty_dispatched || "" },
        { fieldName: "Remarks", inputValue: f.disp_613_remarks || "" }
      ]
    }]);
  }

  if (f.disp_614_enabled) {
    fieldResponses.push([{
      fieldName: "6.1.4 Any other domestic Dispatch",
      subFields: [
        { fieldName: "Release Order - Date", inputValue: f.disp_614_date || "" },
        { fieldName: "Release order - Qty Released (MT)", inputValue: f.disp_614_qty_released || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.disp_614_qty_dispatched || "" },
        { fieldName: "Remarks", inputValue: f.disp_614_remarks || "" }
      ]
    }]);
  }

  if (f.disp_62_enabled) {
    fieldResponses.push([{
      fieldName: "6.2 BISS Dispatch of unmarketable old Sugar for further processing",
      subFields: [
        { fieldName: "Release Order - Date", inputValue: f.disp_62_date || "" },
        { fieldName: "Qty Used for reprocessing - During the Month (MT)", inputValue: f.disp_62_qty || "" }
      ]
    }]);
  }

  // 6.3 Internal transfer of raw sugar - supports multiple entries
  if (f.disp_63_enabled) {
    const entries63 = buildSerialEntries(f, 'disp_63', "6.3 Internal transfer of raw sugar within a group");
    fieldResponses.push(entries63);
  }

  // 6.4 Internal transfer of white sugar - supports multiple entries
  if (f.disp_64_enabled) {
    const entries64 = buildSerialEntries(f, 'disp_64', "6.4 Internal transfer of white sugar within a group");
    fieldResponses.push(entries64);
  }

  // 6.5 Sale of raw sugar - supports multiple entries
  if (f.disp_65_enabled) {
    const entries65 = buildSerialEntries(f, 'disp_65', "6.5 Sale of raw sugar to other sugar mills for domestic purpose");
    fieldResponses.push(entries65);
  }

  // HSN code details (always included)
  fieldResponses.push([{
    fieldName: "HSN code and related details",
    subFields: [
      { fieldName: "Total Quantity of Sales (in MT) for HSN Code - 17011490", inputValue: f.hsn_17011490 || "" },
      { fieldName: "Total Quantity of Sales (in MT) for HSN Code - 17019990", inputValue: f.hsn_17019990 || "" },
      { fieldName: "Total Quantity of Sales (in MT) for HSN Code - Others", inputValue: f.hsn_others || "" }
    ]
  }]);

  return {
    sectionName: "Dispatches",
    fieldResponses
  };
}

function buildSerialEntries(f, prefix, fieldName) {
  const entries = [];
  for (let i = 1; i <= 10; i++) {
    const plantCode = f[`${prefix}_${i}_plant_code`];
    const qty = f[`${prefix}_${i}_qty`];
    if (plantCode !== undefined && plantCode !== '') {
      entries.push({
        fieldName: fieldName,
        serialNumber: String(i),
        subFields: [
          { fieldName: "Plant code of sugar mill to which sugar transferred", inputValue: plantCode },
          { fieldName: "Qty Transferred to other mills - During the Month (MT)", inputValue: qty || "0" }
        ]
      });
    }
  }
  // Ensure at least one empty entry if section enabled but no data
  if (entries.length === 0) {
    entries.push({
      fieldName: fieldName,
      serialNumber: "1",
      subFields: [
        { fieldName: "Plant code of sugar mill to which sugar transferred", inputValue: "0" },
        { fieldName: "Qty Transferred to other mills - During the Month (MT)", inputValue: "0" }
      ]
    });
  }
  return entries;
}

function buildExport(f) {
  const selectedExport = [];
  if (f.exp_661_enabled) selectedExport.push("6.6 (a) Export under OGL/Export Quota- (i) White/ refined Sugar");
  if (f.exp_662_enabled) selectedExport.push("6.6 (a) Export under OGL- (ii) Raw Sugar (including SEZ refinery)");
  if (f.exp_663_enabled) selectedExport.push("6.6 (a) Export under OGL- (iii) Raw Sugar Sold to Refineries for Export by Invoice");
  if (f.exp_66b_enabled) selectedExport.push("6.6 (b) Export under AAS (White Sugar)");

  const fieldResponses = [
    [{ fieldName: "Select", inputValue: JSON.stringify(selectedExport) }]
  ];

  if (f.exp_661_enabled) {
    fieldResponses.push([{
      fieldName: "6.6 (a) Export under OGL/Export Quota- (i) White/ refined Sugar",
      subFields: [
        { fieldName: "Release Order (if applicable) - No.", inputValue: f.exp_661_order_no || "" },
        { fieldName: "Release Order (if applicable) - Date", inputValue: f.exp_661_date || "" },
        { fieldName: "Release Order (if applicable) - Qty released (MT)", inputValue: f.exp_661_qty_released || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.exp_661_qty_dispatched || "" }
      ]
    }]);
  }

  if (f.exp_662_enabled) {
    fieldResponses.push([{
      fieldName: "6.6 (a) Export under OGL- (ii) Raw Sugar (including SEZ refinery)",
      subFields: [
        { fieldName: "Release Order (if applicable) - No.", inputValue: f.exp_662_order_no || "" },
        { fieldName: "Release Order (if applicable) - Date", inputValue: f.exp_662_date || "" },
        { fieldName: "Release Order (if applicable) - Qty released (MT)", inputValue: f.exp_662_qty_released || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.exp_662_qty_dispatched || "" }
      ]
    }]);
  }

  if (f.exp_663_enabled) {
    fieldResponses.push([{
      fieldName: "6.6 (a) Export under OGL- (iii) Raw Sugar Sold to Refineries for Export by Invoice",
      subFields: [
        { fieldName: "Release Order (if applicable) - No.", inputValue: f.exp_663_order_no || "" },
        { fieldName: "Release Order (if applicable) - Date", inputValue: f.exp_663_date || "" },
        { fieldName: "Qty Dispatched - During the Month (MT)", inputValue: f.exp_663_qty_dispatched || "" },
        { fieldName: "Name of mill/refinery to whom sold", inputValue: f.exp_663_mill_name || "" }
      ]
    }]);
  }

  if (f.exp_66b_enabled) {
    fieldResponses.push([{
      fieldName: "6.6 (b) Export under AAS (White Sugar)",
      subFields: [
        { fieldName: "Export Order (if applicable) - No.", inputValue: f.exp_66b_order_no || "" },
        { fieldName: "Export Order (if applicable) - Date", inputValue: f.exp_66b_date || "" },
        { fieldName: "Export Order (if applicable) - Qty released", inputValue: f.exp_66b_qty_released || "" },
        { fieldName: "Qty Received - During the Month (MT)", inputValue: f.exp_66b_qty_received || "" }
      ]
    }]);
  }

  return {
    sectionName: "Export",
    fieldResponses
  };
}

function buildImport(f) {
  const fieldResponses = [
    [{ fieldName: "Is there any import applicable?", inputValue: f.import_applicable || "No" }]
  ];

  if (f.import_applicable === 'Yes') {
    fieldResponses.push(
      [{ fieldName: "6.7 (a) Import under OGL – (i) White/refined Sugar - Qty Received - During the Month (MT)", inputValue: f.import_ogl_white || "" }],
      [{ fieldName: "6.7 (a) Import under OGL – (ii) Raw Sugar - Qty Received - During the Month (MT)", inputValue: f.import_ogl_raw || "" }],
      [{ fieldName: "6.7 (b) Import under AAS - Qty Received - During the Month (MT)", inputValue: f.import_aas || "" }]
    );
  }

  return {
    sectionName: "Import",
    fieldResponses
  };
}

function buildStockOfSugar(f) {
  return {
    sectionName: "Stock of Sugar (In MT)",
    fieldResponses: [
      [{ fieldName: "Factory Premises - White Sugar", subFields: [
        { fieldName: "Opening Stock", inputValue: f.stock_factory_white_open || "" }
      ]}],
      [{ fieldName: "Factory Premises - BISS / Brown Sugar, If any", subFields: [
        { fieldName: "Opening Stock", inputValue: f.stock_factory_biss_open || "" },
        { fieldName: "Closing Stock", inputValue: f.stock_factory_biss_close || "" }
      ]}],
      [{ fieldName: "Factory Premises - Raw Sugar", subFields: [
        { fieldName: "Opening Stock", inputValue: f.stock_factory_raw_open || "" }
      ]}],
      [{ fieldName: "Outside Godown (Duty paid) - White Sugar", subFields: [
        { fieldName: "Opening Stock", inputValue: f.stock_godown_white_open || "" },
        { fieldName: "Closing Stock", inputValue: f.stock_godown_white_close || "" }
      ]}],
      [{ fieldName: "Outside Godown (Duty paid) - BISS / Brown Sugar, If any", subFields: [
        { fieldName: "Opening Stock", inputValue: f.stock_godown_biss_open || "" },
        { fieldName: "Closing Stock", inputValue: f.stock_godown_biss_close || "" }
      ]}],
      [{ fieldName: "Outside Godown (Duty paid) - Raw Sugar", subFields: [
        { fieldName: "Opening Stock", inputValue: f.stock_godown_raw_open || "" },
        { fieldName: "Closing Stock", inputValue: f.stock_godown_raw_close || "" }
      ]}]
    ]
  };
}

function buildPackingDetails(f) {
  return {
    sectionName: "Packing details of Sugar (In MT)",
    fieldResponses: [
      [{ fieldName: "50 Kg Jute Bag - Qty in MT", inputValue: f.pack_jute_50 || "" }],
      [{ fieldName: "100 Kg Jute Bag - Qty in MT", inputValue: f.pack_jute_100 || "" }],
      [{ fieldName: "50 Kg PP/HDPE Bag - Qty in MT", inputValue: f.pack_pp_50 || "" }],
      [{ fieldName: "Other Retail Bags (<= 25 Kg and > 100 Kg)/ Loose Sugar - Qty in MT", inputValue: f.pack_other || "" }]
    ]
  };
}

function buildCaneDuesData(f) {
  // Dynamically compute season labels from the selected sugar season
  const currentLabel = f.sugarSeason || '2024-25';
  const startYear = parseInt(currentLabel.split('-')[0], 10);

  function seasonLabel(year) {
    return year + '-' + String(year + 1).slice(-2);
  }

  const seasons = [
    { key: 'current', label: currentLabel, isCurrent: true },
    { key: 'prev1', label: seasonLabel(startYear - 1), isCurrent: false },
    { key: 'prev2', label: seasonLabel(startYear - 2), isCurrent: false },
    { key: 'prev3', label: seasonLabel(startYear - 3), isCurrent: false },
    { key: 'prev4', label: seasonLabel(startYear - 4), isCurrent: false }
  ];

  const fieldResponses = [];

  for (const season of seasons) {
    const k = season.key;
    if (season.isCurrent) {
      fieldResponses.push([{
        fieldName: `Sugar Season - ${season.label}`,
        subFields: [
          { fieldName: "Cane Price Payable (in Rs Cr) - During the Month", inputValue: f[`cane_${k}_payable`] || "" },
          { fieldName: "Cane Price Paid (in Rs Cr) - During the Month", inputValue: f[`cane_${k}_paid`] || "" },
          { fieldName: "No. of farmers from which cane procured", inputValue: f[`cane_${k}_farmers`] || "" }
        ]
      }]);
    } else {
      fieldResponses.push([{
        fieldName: `Sugar Season - ${season.label}`,
        subFields: [
          { fieldName: "Cane Crushed", inputValue: f[`cane_${k}_crushed`] || "" },
          { fieldName: "Sugar Production (in MT)", inputValue: f[`cane_${k}_production`] || "" },
          { fieldName: "Sugar Recovery", inputValue: f[`cane_${k}_recovery`] || "" },
          { fieldName: "Cane Price Payable (in Rs Cr) - During the Sugar Season", inputValue: f[`cane_${k}_payable`] || "" },
          { fieldName: "Cane Price Paid (in Rs Cr) - During the Month", inputValue: f[`cane_${k}_paid`] || "" },
          { fieldName: "No. of farmers from which cane procured", inputValue: f[`cane_${k}_farmers`] || "" }
        ]
      }]);
    }
  }

  return {
    sectionName: "Cane Dues Data",
    fieldResponses
  };
}

module.exports = { buildP2Json };
