const { buildP2Json } = require('../utils/jsonBuilder');

describe('utils/jsonBuilder.js', () => {
  const dummyUser = {
    approvalId: "12345",
    swsId: "SWS-987",
    projectNumber: "PROJ-XY",
    undertakingName: "Test Mill Group",
    plantName: "Test Plant A",
    plantCode: "P-101",
    state: "Uttar Pradesh",
    capacity: "5000"
  };

  const dummyFormData = {
    sugarSeason: "2024-25",
    month: "October",
    caneCrushedMonth: "1000",
    
    // Checkboxes
    prod_white_enabled: true,
    prod_raw_enabled: false,
    prod_procured_enabled: false,
    prod_diversion_enabled: false,
    prod_ethanol_enabled: false,
    
    // 2(I) White / Refined Sugar fields
    white_from_cane: "400",
    white_from_reprocessing: "0",
    white_from_raw_procured: "0",
    white_from_transferred: "0",
    white_from_own_raw: "0",
    white_from_own_raw_produced: "0",

    // Dispatches (enable 6.1.1)
    disp_611_enabled: true,
    disp_611_date: "2024-10-15",
    disp_611_qty_released: "500",
    disp_611_qty_dispatched: "450",
    disp_611_remarks: "Dispatched successfully",

    // Exports & Imports
    exp_661_enabled: false,
    import_applicable: "No",

    // Cane Dues
    cane_current_payable: "500000",
    cane_current_paid: "200000",
    cane_current_farmers: "150"
  };

  test('buildP2Json generates standard JSON payload successfully', () => {
    const payload = buildP2Json(dummyUser, dummyFormData);
    
    // Outer Shell Verification
    expect(payload).toBeInstanceOf(Array);
    expect(payload[0]).toHaveProperty('approvalId', '12345');
    expect(payload[0]).toHaveProperty('swsId', 'SWS-987');
    expect(payload[0].forms[0].name).toBe("P2 Form (Directorate of Sugar)");
    
    const sections = payload[0].forms[0].sections;
    
    // 1. Form applied for
    const formApplied = sections.find(s => s.sectionName === "Form applied for -");
    expect(formApplied.fieldResponses[0].inputValue).toBe("2024-25");
    expect(formApplied.fieldResponses[1].inputValue).toBe("October");

    // 2. Sugar Mill Details (from explicitly mocked db User)
    const millDetails = sections.find(s => s.sectionName === "Sugar Mill Details");
    expect(millDetails.fieldResponses.find(f => f.fieldName === "Name of the Undertaking/Group").inputValue).toBe("Test Mill Group");
    expect(millDetails.fieldResponses.find(f => f.fieldName === "Plant Code").inputValue).toBe("P-101");

    // 4. Production (Testing logic branches)
    const production = sections.find(s => s.sectionName === "Production of white / refined / Raw Sugar from Domestic sources");
    // Should contain "Select" array mapping
    const selectParam = production.fieldResponses[0][0].inputValue;
    expect(selectParam).toContain('2(I) White / Refined Sugar');
    expect(selectParam).not.toContain('2(II) Raw Sugar'); // Since we explicitly mocked it as false
    
    // Validate White Sugar child properties injected
    const whiteSugarData = production.fieldResponses[1][0];
    expect(whiteSugarData.fieldName).toBe("2(I) White / Refined Sugar");
    expect(whiteSugarData.subFields[0].inputValue).toBe("400");
  });

  test('buildP2Json correctly injects empty data fields if undefined', () => {
    // If user forgot non-required inputs, they should strictly fallback to empty strings, not 'undefined' types that break the NSWS payload.
    const emptyFormData = { sugarSeason: "2024-25", month: "November" };
    const payload = buildP2Json(dummyUser, emptyFormData);
    const sections = payload[0].forms[0].sections;
    
    const caneCrushed = sections.find(s => s.sectionName === "Cane Crushed");
    const caneCrushedMonthData = caneCrushed.fieldResponses.find(fGroup => fGroup[0].fieldName.includes("Cane Crushed - During the Month"));
    
    // Verify it evaluates seamlessly to empty string ("")
    expect(caneCrushedMonthData[0].inputValue).toBe("");
  });
});
