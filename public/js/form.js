// ============================================
// P2 Form App - Client-side JavaScript
// ============================================

// ---------- Theme ----------
function toggleTheme() {
  var html = document.documentElement;
  var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  html.style.colorScheme = next === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem('p2-theme', next); } catch (e) { /* private mode */ }
}

(function () {
  var saved = 'light';
  try { saved = localStorage.getItem('p2-theme') || 'light'; } catch (e) { /* noop */ }
  document.documentElement.setAttribute('data-theme', saved);
  document.documentElement.style.colorScheme = saved === 'dark' ? 'dark' : 'light';
})();

document.addEventListener('DOMContentLoaded', function () {
  requestAnimationFrame(function () { document.body.classList.add('theme-ready'); });
});

// ---------- Shared helpers ----------
function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast-notification toast-' + (type || 'success');
  var icon = type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill';
  toast.innerHTML = '<i class="bi ' + icon + ' me-2"></i><span></span>';
  toast.querySelector('span').textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(function () { toast.classList.add('show'); });
  setTimeout(function () {
    toast.classList.remove('show');
    setTimeout(function () { toast.remove(); }, 300);
  }, 3500);
}

function setHidden(el, hidden) {
  if (!el) return;
  if (hidden) {
    el.setAttribute('hidden', '');
  } else {
    el.removeAttribute('hidden');
    el.style.animation = 'slideDown 0.22s ease';
  }
}

// ---------- Global handlers referenced from markup ----------
function toggleImportFields() {
  var sel = document.getElementById('importApplicable');
  var fields = document.getElementById('importFields');
  if (!sel || !fields) return;
  setHidden(fields, sel.value !== 'Yes');
  refreshProgress();
}

function updateCaneDuesSeasons() {
  var sel = document.getElementById('sugarSeasonSelect');
  if (!sel) return;
  var value = sel.value;
  var current = document.getElementById('caneSeason0');

  if (!value) {
    if (current) current.textContent = '\u2014';
    for (var j = 1; j <= 4; j++) {
      var blank = document.getElementById('caneSeason' + j);
      if (blank) blank.textContent = '\u2014';
    }
    return;
  }

  var startYear = parseInt(value.split('-')[0], 10);
  if (current) current.textContent = value;
  for (var i = 1; i <= 4; i++) {
    var y = startYear - i;
    var el = document.getElementById('caneSeason' + i);
    if (el) el.textContent = y + '-' + String(y + 1).slice(-2);
  }
}

// ============================================================
// Form page behaviour
// ============================================================
(function () {
  var form = document.getElementById('p2Form');
  if (!form) return;

  var AUTOSAVE_KEY = 'p2-form-autosave';
  var AUTOSAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  document.addEventListener('DOMContentLoaded', function () {
    initSectionToggles();
    initRepeaters();
    initNumericInputs();
    initTooltips();
    initSectionNav();
    initAutosave();
    initValidation();
    initResetButton();

    updateCaneDuesSeasons();
    refreshCalcStrips();
    refreshSectionCounts();
    refreshProgress();
  });

  // ---------- Collapsible sub-sections ----------
  function initSectionToggles() {
    form.addEventListener('change', function (e) {
      var cb = e.target.closest('.toggle-section');
      if (!cb) return;
      setHidden(document.getElementById(cb.dataset.target), !cb.checked);
      refreshSectionCounts();
      refreshProgress();
    });
  }

  // ---------- Repeatable rows (dispatch 6.3 / 6.4 / 6.5) ----------
  function initRepeaters() {
    form.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.rp-add');
      if (addBtn) {
        var repeater = addBtn.closest('.repeater');
        var rows = repeater.querySelector('.repeater-rows');
        var max = parseInt(repeater.dataset.max, 10) || 25;
        if (rows.children.length >= max) {
          showToast('Maximum of ' + max + ' rows reached.', 'error');
          return;
        }
        rows.appendChild(buildRepeaterRow(repeater.dataset.prefix, rows.children.length + 1));
        renumberRepeater(repeater);
        return;
      }

      var removeBtn = e.target.closest('.rp-remove');
      if (removeBtn) {
        var rp = removeBtn.closest('.repeater');
        var container = rp.querySelector('.repeater-rows');
        if (container.children.length === 1) {
          container.querySelectorAll('input').forEach(function (i) { i.value = ''; });
        } else {
          removeBtn.closest('.repeater-row').remove();
        }
        renumberRepeater(rp);
        refreshProgress();
      }
    });
  }

  function buildRepeaterRow(prefix, index) {
    var row = document.createElement('div');
    row.className = 'repeater-row';
    row.style.animation = 'slideDown 0.22s ease';
    row.innerHTML =
      '<span class="rp-col-sr serial-badge">' + index + '</span>' +
      '<span class="rp-col-a"><input type="text" name="' + prefix + '_' + index + '_plant_code" class="form-control fld-input" placeholder="Plant code" autocomplete="off"></span>' +
      '<span class="rp-col-b"><input type="text" name="' + prefix + '_' + index + '_qty" class="form-control fld-input js-num" inputmode="decimal" placeholder="0.00" autocomplete="off"></span>' +
      '<span class="rp-col-x"><button type="button" class="rp-remove" title="Remove row"><i class="bi bi-x-lg"></i></button></span>';
    return row;
  }

  // Serial numbers must stay contiguous - the payload builder reads
  // `<prefix>_<n>_plant_code` / `<prefix>_<n>_qty` sequentially.
  function renumberRepeater(repeater) {
    var prefix = repeater.dataset.prefix;
    Array.prototype.forEach.call(repeater.querySelectorAll('.repeater-row'), function (row, idx) {
      var n = idx + 1;
      row.querySelector('.rp-col-sr').textContent = n;
      row.querySelector('.rp-col-a input').name = prefix + '_' + n + '_plant_code';
      row.querySelector('.rp-col-b input').name = prefix + '_' + n + '_qty';
    });
  }

  // ---------- Numeric inputs ----------
  function initNumericInputs() {
    form.addEventListener('input', function (e) {
      var el = e.target;
      if (el.classList.contains('js-num')) {
        var cleaned = el.value.replace(/[^0-9.]/g, '');
        var parts = cleaned.split('.');
        if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
        if (cleaned !== el.value) el.value = cleaned;
      } else if (el.classList.contains('js-int')) {
        var digits = el.value.replace(/[^0-9]/g, '');
        if (digits !== el.value) el.value = digits;
      }
      el.classList.remove('is-invalid');
    });

    form.addEventListener('blur', function (e) {
      var el = e.target;
      if (!el.classList) return;
      if (el.classList.contains('js-num') && el.value.trim() !== '') {
        var n = Number(el.value);
        if (isFinite(n)) el.value = n.toFixed(2);
      }
      refreshCalcStrips();
      refreshProgress();
    }, true);

    form.addEventListener('change', function () {
      refreshCalcStrips();
      refreshProgress();
    });
  }

  function refreshCalcStrips() {
    Array.prototype.forEach.call(document.querySelectorAll('.calc-strip[data-sum]'), function (strip) {
      var total = strip.dataset.sum.split(',').reduce(function (acc, name) {
        var input = form.elements[name.trim()];
        var v = input ? Number(String(input.value).replace(/,/g, '')) : 0;
        return acc + (isFinite(v) ? v : 0);
      }, 0);
      var out = strip.querySelector('strong');
      if (out) out.textContent = total.toFixed(2);
    });
  }

  // ---------- Field tooltips (official NSWS field names) ----------
  function initTooltips() {
    var tip = document.getElementById('fldTooltip');
    if (!tip) return;

    function show(el) {
      tip.textContent = el.dataset.tip;
      tip.classList.add('visible');
      var r = el.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left)) + 'px';
      tip.style.top = (r.bottom + window.scrollY + 6) + 'px';
    }
    function hide() { tip.classList.remove('visible'); }

    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest('.fld-tip');
      if (t) show(t);
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('.fld-tip')) hide();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target.closest('.fld-tip');
      if (t) show(t);
    });
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true });
  }

  // ---------- Section navigator + progress ----------
  function initSectionNav() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.form-nav-item'));
    if (!items.length) return;

    var sections = Array.prototype.slice.call(document.querySelectorAll('.form-section'));
    if (!sections.length) return;

    var lockedUntil = 0;

    function setActive(id) {
      items.forEach(function (i) { i.classList.toggle('active', i.dataset.target === id); });
    }

    function currentSectionId() {
      var probe = window.scrollY + 120;
      // At the very bottom the last sections can never reach the probe line.
      var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) return sections[sections.length - 1].id;

      var active = sections[0].id;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= probe) active = sections[i].id;
      }
      return active;
    }

    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(item.dataset.target);
        if (!target) return;
        // Pin the clicked item while the smooth scroll animates.
        lockedUntil = Date.now() + 900;
        setActive(item.dataset.target);
        window.scrollTo({ top: target.offsetTop - 84, behavior: 'smooth' });
      });
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        if (Date.now() < lockedUntil) return;
        setActive(currentSectionId());
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    setActive(currentSectionId());
  }

  /** A field counts as "visible" only when none of its ancestors are hidden. */
  function isVisible(el) {
    return !!(el.offsetParent || el.offsetWidth || el.offsetHeight);
  }

  function collectVisibleFields() {
    return Array.prototype.filter.call(
      form.querySelectorAll('input:not([type=checkbox]):not([disabled]), select:not([disabled])'),
      isVisible
    );
  }

  function refreshProgress() {
    var fields = collectVisibleFields();
    var filled = fields.filter(function (el) { return String(el.value).trim() !== ''; }).length;
    var total = fields.length;
    var pct = total === 0 ? 0 : Math.round((filled / total) * 100);

    var pctEl = document.getElementById('progressPct');
    var filledEl = document.getElementById('progressFilled');
    var totalEl = document.getElementById('progressTotal');
    var ring = document.getElementById('progressRing');

    if (pctEl) pctEl.textContent = pct + '%';
    if (filledEl) filledEl.textContent = filled;
    if (totalEl) totalEl.textContent = total;
    if (ring) {
      var circumference = 2 * Math.PI * 19;
      ring.style.strokeDasharray = circumference.toFixed(2);
      ring.style.strokeDashoffset = (circumference * (1 - pct / 100)).toFixed(2);
    }

    Array.prototype.forEach.call(document.querySelectorAll('.form-section'), function (section) {
      var sectionFields = Array.prototype.filter.call(
        section.querySelectorAll('input:not([type=checkbox]):not([disabled]), select:not([disabled])'),
        isVisible
      );
      var done = sectionFields.length > 0 && sectionFields.every(function (el) { return String(el.value).trim() !== ''; });
      var navItem = document.querySelector('.form-nav-item[data-target="' + section.id + '"]');
      if (navItem) navItem.classList.toggle('done', done);
    });
  }

  function refreshSectionCounts() {
    Array.prototype.forEach.call(document.querySelectorAll('.sec-count[data-count-for]'), function (badge) {
      var section = document.getElementById(badge.dataset.countFor);
      if (!section) return;
      var boxes = section.querySelectorAll('.toggle-section');
      var checked = section.querySelectorAll('.toggle-section:checked').length;
      badge.textContent = checked + ' / ' + boxes.length + ' selected';
      badge.classList.toggle('empty', checked === 0);
    });
  }

  // ---------- Local autosave ----------
  function initAutosave() {
    var chip = document.getElementById('autosaveChip');
    var restoreBtn = document.getElementById('restoreLocalBtn');
    var saveTimer = null;

    function snapshot() {
      var data = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled) return;
        data[el.name] = el.type === 'checkbox' ? (el.checked ? 'on' : '') : el.value;
      });
      return data;
    }

    function save() {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ t: Date.now(), d: snapshot() }));
        if (chip) {
          chip.classList.add('saved');
          setTimeout(function () { chip.classList.remove('saved'); }, 900);
        }
      } catch (e) { /* quota or private mode - autosave is best effort */ }
    }

    form.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 600);
    });
    form.addEventListener('change', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 300);
    });

    var stored = readAutosave();
    if (stored && restoreBtn) {
      restoreBtn.style.display = '';
      restoreBtn.addEventListener('click', function () {
        restore(stored);
        restoreBtn.style.display = 'none';
        showToast('Restored your last unsaved entries.', 'success');
      });
    }
  }

  function readAutosave() {
    try {
      var parsed = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
      if (!parsed || !parsed.d) return null;
      if (Date.now() - (parsed.t || 0) > AUTOSAVE_MAX_AGE_MS) {
        localStorage.removeItem(AUTOSAVE_KEY);
        return null;
      }
      return parsed.d;
    } catch (e) {
      return null;
    }
  }

  function restore(data) {
    Object.keys(data).forEach(function (name) {
      var el = form.querySelector('[name="' + CSS.escape(name) + '"]');
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = data[name] === 'on';
        setHidden(document.getElementById(el.dataset.target), !el.checked);
      } else {
        el.value = data[name];
      }
    });
    toggleImportFields();
    updateCaneDuesSeasons();
    refreshCalcStrips();
    refreshSectionCounts();
    refreshProgress();
  }

  function initResetButton() {
    var btn = document.getElementById('clearLocalBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!window.confirm('Clear every value on this form? This cannot be undone.')) return;
      form.reset();
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* noop */ }
      Array.prototype.forEach.call(form.querySelectorAll('.toggle-section'), function (cb) {
        setHidden(document.getElementById(cb.dataset.target), !cb.checked);
      });
      toggleImportFields();
      updateCaneDuesSeasons();
      refreshCalcStrips();
      refreshSectionCounts();
      refreshProgress();
      showToast('Form cleared.', 'success');
    });
  }

  // ---------- Validation ----------
  function initValidation() {
    var errorBox = document.getElementById('formErrors');

    form.addEventListener('submit', function (e) {
      var errors = validate();
      if (!errors.length) {
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch (err) { /* noop */ }
        return;
      }

      e.preventDefault();
      if (errorBox) {
        errorBox.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-2"></i><div><strong>Please fix ' +
          errors.length + ' issue' + (errors.length > 1 ? 's' : '') + ':</strong><ul></ul></div>';
        var list = errorBox.querySelector('ul');
        errors.forEach(function (err) {
          var li = document.createElement('li');
          li.textContent = err.message;
          list.appendChild(li);
        });
        errorBox.style.display = 'flex';
      }

      errors[0].el.classList.add('is-invalid');
      var top = errors[0].el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: top, behavior: 'smooth' });
      try { errors[0].el.focus({ preventScroll: true }); } catch (err) { /* noop */ }
      showToast('Some required fields are missing.', 'error');
    });
  }

  function validate() {
    var errors = [];

    function require(name, message) {
      var el = form.elements[name];
      if (!el || !el.tagName) return;
      if (String(el.value).trim() === '') {
        el.classList.add('is-invalid');
        errors.push({ el: el, message: message });
      } else {
        el.classList.remove('is-invalid');
      }
    }

    require('sugarSeason', 'Select the sugar season (section 1).');
    require('month', 'Select the reporting month (section 1).');
    require('caneCrushedMonth', 'Enter the cane crushed during the month (section 2).');

    // A selected release-order sub-section must carry its order date, otherwise
    // the payload silently falls back to today's date. Mirrors DATED_SECTIONS
    // in utils/formFields.js - keep both lists in step.
    [
      { cb: 'disp_611_enabled', date: 'disp_611_date', label: 'dispatch 6.1.1' },
      { cb: 'disp_612_enabled', date: 'disp_612_date', label: 'dispatch 6.1.2' },
      { cb: 'disp_613_enabled', date: 'disp_613_date', label: 'dispatch 6.1.3' },
      { cb: 'disp_614_enabled', date: 'disp_614_date', label: 'dispatch 6.1.4' },
      { cb: 'disp_62_enabled', date: 'disp_62_date', label: 'dispatch 6.2' },
      { cb: 'exp_661_enabled', date: 'exp_661_date', label: 'export 6.6 (a)(i)' },
      { cb: 'exp_662_enabled', date: 'exp_662_date', label: 'export 6.6 (a)(ii)' },
      { cb: 'exp_663_enabled', date: 'exp_663_date', label: 'export 6.6 (a)(iii)' },
      { cb: 'exp_66b_enabled', date: 'exp_66b_date', label: 'export 6.6 (b)' }
    ].forEach(function (rule) {
      var cb = form.elements[rule.cb];
      if (cb && cb.checked) require(rule.date, 'Enter the order date for ' + rule.label + '.');
    });

    return errors;
  }

  // Expose for the handlers wired above.
  window.refreshProgress = refreshProgress;
})();

// Fallback so inline handlers never throw before the form module loads.
if (typeof window.refreshProgress !== 'function') {
  window.refreshProgress = function () {};
}
