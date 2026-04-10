// ============================================
// P2 Form App — Client-side JavaScript
// ============================================

// ---------- Theme Toggle ----------
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('p2-theme', next);
}

// Apply saved theme immediately
(function() {
  const saved = localStorage.getItem('p2-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

// ---------- Section Toggle (checkbox → show/hide fields) ----------
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.toggle-section').forEach(function (cb) {
    cb.addEventListener('change', function () {
      const target = document.getElementById(this.dataset.target);
      if (!target) return;
      if (this.checked) {
        target.style.display = '';
        target.style.animation = 'slideDown 0.25s ease';
      } else {
        target.style.display = 'none';
      }
    });
  });

  // ---------- Add Serial Row ----------
  document.querySelectorAll('.add-serial-row').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const prefix = this.dataset.prefix;
      const container = this.previousElementSibling;
      const rows = container.querySelectorAll('.serial-row');
      const nextNum = rows.length + 1;

      const newRow = document.createElement('div');
      newRow.className = 'row serial-row mb-1';
      newRow.style.animation = 'slideDown 0.25s ease';
      newRow.innerHTML = `
        <div class="col-1"><span class="serial-badge">${nextNum}</span></div>
        <div class="col-5">
          <input type="text" name="${prefix}_${nextNum}_plant_code" class="form-control form-control-sm" placeholder="Plant Code">
        </div>
        <div class="col-5">
          <input type="text" name="${prefix}_${nextNum}_qty" class="form-control form-control-sm" placeholder="Qty (MT)">
        </div>
      `;
      container.appendChild(newRow);
    });
  });
});

// ---------- Toggle Import Fields ----------
function toggleImportFields() {
  const sel = document.getElementById('importApplicable');
  const fields = document.getElementById('importFields');
  if (sel.value === 'Yes') {
    fields.style.display = '';
    fields.style.animation = 'slideDown 0.25s ease';
  } else {
    fields.style.display = 'none';
  }
}

// ---------- Dynamic Cane Dues Season Labels ----------
function updateCaneDuesSeasons() {
  const sel = document.getElementById('sugarSeasonSelect');
  if (!sel) return; // Element only exists on the home/form page
  const val = sel.value; // e.g. "2024-25"
  if (!val) {
    for (let i = 0; i <= 4; i++) {
      const el = document.getElementById('caneSeason' + i);
      if (el) el.textContent = '—';
    }
    return;
  }

  // Parse start year from "2024-25" → 2024
  const startYear = parseInt(val.split('-')[0], 10);

  // Current season label
  document.getElementById('caneSeason0').textContent = val;

  // Previous 4 seasons
  for (let i = 1; i <= 4; i++) {
    const y = startYear - i;
    const label = y + '-' + String(y + 1).slice(-2);
    const el = document.getElementById('caneSeason' + i);
    if (el) el.textContent = label;
  }
}

// Run on page load if season already selected
document.addEventListener('DOMContentLoaded', function() {
  updateCaneDuesSeasons();
});
