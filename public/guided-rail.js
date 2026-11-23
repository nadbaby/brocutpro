/**
 * RodSync — Guided Rail Module
 * Intelligent HGR guided rail search, model selection, cutting length validation,
 * and Guided Rail Storage Inventory Management.
 * Follows existing RodSync vanilla-JS conventions and CSS design system.
 */

(function () {
  'use strict';

  // ── Predefined Standard Size Master Fallbacks ────────────────────────────────
  const DEFAULT_MODELS = [
    { id: 'HGR15', modelName: 'HGR15', railWidthMm: 15,   railHeightMm: 15,   pitchMm: 60,  minCuttingLengthMm: 60,  minEndMarginMm: 10, active: true },
    { id: 'HGR20', modelName: 'HGR20', railWidthMm: 20,   railHeightMm: 17.5, pitchMm: 60,  minCuttingLengthMm: 60,  minEndMarginMm: 10, active: true },
    { id: 'HGR25', modelName: 'HGR25', railWidthMm: 23,   railHeightMm: 22,   pitchMm: 60,  minCuttingLengthMm: 60,  minEndMarginMm: 10, active: true },
    { id: 'HGR30', modelName: 'HGR30', railWidthMm: 28,   railHeightMm: 26,   pitchMm: 80,  minCuttingLengthMm: 80,  minEndMarginMm: 12, active: true },
    { id: 'HGR35', modelName: 'HGR35', railWidthMm: 34,   railHeightMm: 29,   pitchMm: 80,  minCuttingLengthMm: 80,  minEndMarginMm: 12, active: true },
    { id: 'HGR45', modelName: 'HGR45', railWidthMm: 45,   railHeightMm: 38,   pitchMm: 105, minCuttingLengthMm: 105, minEndMarginMm: 16, active: true },
    { id: 'HGR55', modelName: 'HGR55', railWidthMm: 53,   railHeightMm: 44,   pitchMm: 120, minCuttingLengthMm: 120, minEndMarginMm: 18, active: true },
    { id: 'HGR65', modelName: 'HGR65', railWidthMm: 63,   railHeightMm: 53,   pitchMm: 150, minCuttingLengthMm: 150, minEndMarginMm: 20, active: true },
  ];

  // ── State ────────────────────────────────────────────────────────────────────
  let _railModels = [];                   // Available rail models purely from database
  let _dbSavedModels = [];                // Models fetched from database /api/guided-rail
  let _railStock = [];                    // Storage inventory of guided rails
  let _selectedModel = null;              // currently selected GuidedRailModel
  let _grLengthUnit = 'mm';               // active length unit: 'mm' | 'in' | 'ft'
  let _eventsBound = false;
  let _lastValidResult = null;            // cached last valid layout for cut slip printing
  let _grKpiFilter = 'all';               // active KPI stock filter: 'all' | 'stock' | 'in_stock' | 'low_stock'
  let _activeGrCutPlan = null;            // cached active Guided Rail multi-cut plan
  let _activeGrStrategy = 'full_length_first'; // active cutting strategy
  let _isGrMatchingTableVisible = false;  // toggle state for matching rails table
  let _grBrandFilter = 'all';             // active category filter: 'all' or category from DB
  let _selectedBrand = 'ALL';             // currently selected category in validator: 'ALL' or category from DB

  // ── Active Session User Profile ──────────────────────────────────────────────
  function _getCurrentSessionUser() {
    if (typeof window !== 'undefined' && typeof window.getRodsyncCurrentSessionUser === 'function') {
      const u = window.getRodsyncCurrentSessionUser();
      if (u && u.name) return u;
    }
    let email = '';
    try {
      if (typeof window !== 'undefined' && window.rodsyncCurrentUserEmail) email = window.rodsyncCurrentUserEmail;
      if (!email && typeof localStorage !== 'undefined') email = localStorage.getItem('rodsync_user_email') || '';
      if (!email && typeof document !== 'undefined') {
        const match = document.cookie.match(/(?:^|;\s*)rodsync_user=([^;]+)/);
        if (match && match[1]) email = decodeURIComponent(match[1]);
      }
    } catch {}

    const clean = String(email || '').toLowerCase().trim();
    if (clean.includes('roshni') || clean.includes('roshini')) return { email: clean, name: 'Roshini', isLocked: true };
    if (clean.includes('suman')) return { email: clean, name: 'Suman', isLocked: true };
    if (clean.includes('bhawna')) return { email: clean, name: 'Bhawna', isLocked: true };
    if (clean.includes('admin')) return { email: clean, name: 'Admin', isLocked: true };
    if (clean) {
      const prefix = clean.split('@')[0].replace(/[._\d]/g, ' ').trim();
      const formatted = prefix ? prefix.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'User';
      return { email: clean, name: formatted, isLocked: true };
    }
    return { email: '', name: 'Operator', isLocked: true };
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  function initGuidedRail() {
    _bindDelegatedEvents();
    _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
    _renderQuickLengthChips();
    _updatePiecesUI();
    if (typeof window.updateCutLogsBadge === 'function') {
      window.updateCutLogsBadge();
    }

    _loadModels();
    _loadRailStock();
  }

  // ── API Calls: Rail Models ───────────────────────────────────────────────────
  async function _loadModels() {
    try {
      const res = await fetch('/api/guided-rail');
      const data = await res.json();
      if (data.success && Array.isArray(data.models)) {
        _dbSavedModels = data.models.filter(m => m.active !== false);
      }
    } catch (e) {
      console.warn('[GuidedRail] Error loading models from database', e);
    }
    _updateModelsFromDatabase();
    return _railModels;
  }

  // ── Harvest & Update Rail Models from Database Stock ──────────────────────────
  function _updateModelsFromDatabase() {
    const activeBrand = (_selectedBrand || 'ALL').toUpperCase();
    let sourceStock = _railStock;
    if (activeBrand !== 'ALL' && activeBrand !== 'all') {
      sourceStock = _railStock.filter(s => String(s.category || s.brand || '').toUpperCase() === activeBrand);
    }

    const stockModelsMap = new Map();
    sourceStock.forEach(s => {
      const mName = String(s.modelName || '').trim().toUpperCase();
      if (mName && !stockModelsMap.has(mName)) {
        stockModelsMap.set(mName, {
          id: mName,
          modelName: mName,
          railWidthMm: Number(s.railWidthMm) || 0,
          railHeightMm: Number(s.railHeightMm) || 0,
          pitchMm: Number(s.pitchMm) || 60,
          minCuttingLengthMm: Number(s.pitchMm) || 60,
          minEndMarginMm: 10,
          active: true,
          brand: s.category || s.brand || '',
          category: s.category || s.brand || ''
        });
      }
    });

    if (Array.isArray(_dbSavedModels) && _dbSavedModels.length > 0) {
      _dbSavedModels.forEach(m => {
        const mName = String(m.modelName || '').trim().toUpperCase();
        const mBrand = String(m.category || m.brand || '').trim().toUpperCase();
        if (activeBrand === 'ALL' || activeBrand === 'all' || mBrand === activeBrand) {
          if (mName && !stockModelsMap.has(mName)) {
            stockModelsMap.set(mName, {
              id: m.id || mName,
              modelName: mName,
              railWidthMm: Number(m.railWidthMm) || 0,
              railHeightMm: Number(m.railHeightMm) || 0,
              pitchMm: Number(m.pitchMm) || 60,
              minCuttingLengthMm: Number(m.minCuttingLengthMm || m.pitchMm || 60),
              minEndMarginMm: Number(m.minEndMarginMm || 10),
              active: m.active !== false,
              brand: m.category || m.brand || '',
              category: m.category || m.brand || ''
            });
          }
        }
      });
    }

    if (stockModelsMap.size > 0) {
      _railModels = Array.from(stockModelsMap.values()).sort((a, b) => a.modelName.localeCompare(b.modelName));
    } else {
      _railModels = [];
    }

    _populateModelDropdown();
    _renderSpecTable();
  }

  async function _validateLength(modelId, requestedLengthMm) {
    const res = await fetch('/api/guided-rail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate', modelId, requestedLengthMm: Number(requestedLengthMm) }),
    });
    return res.json();
  }

  // ── Length Unit Management (mm, in, ft) ──────────────────────────────────────
  function setGrLengthUnit(newUnit, shouldConvert = true) {
    if (!['mm', 'in', 'ft'].includes(newUnit)) return;
    const oldUnit = _grLengthUnit;
    _grLengthUnit = newUnit;

    const pillMm = document.getElementById('grUnitPillMm');
    const pillIn = document.getElementById('grUnitPillIn');
    const pillFt = document.getElementById('grUnitPillFt');
    const unitSelect = document.getElementById('grLengthUnitSelect');
    const lengthInput = document.getElementById('grRequestedLength');

    if (pillMm) pillMm.classList.toggle('active', newUnit === 'mm');
    if (pillIn) pillIn.classList.toggle('active', newUnit === 'in');
    if (pillFt) pillFt.classList.toggle('active', newUnit === 'ft');
    if (unitSelect) unitSelect.value = newUnit;

    if (lengthInput) {
      if (newUnit === 'in') {
        lengthInput.placeholder = 'e.g. 7.09';
        lengthInput.step = '0.01';
      } else if (newUnit === 'ft') {
        lengthInput.placeholder = 'e.g. 1.0';
        lengthInput.step = '0.01';
      } else {
        lengthInput.placeholder = 'e.g. 180';
        lengthInput.step = '1';
      }

      if (shouldConvert && lengthInput.value && oldUnit !== newUnit) {
        const oldVal = parseFloat(lengthInput.value);
        if (!isNaN(oldVal) && oldVal > 0) {
          let mmVal = oldVal;
          if (oldUnit === 'in') mmVal = oldVal * 25.4;
          else if (oldUnit === 'ft') mmVal = oldVal * 304.8;

          if (newUnit === 'in') {
            lengthInput.value = Number((mmVal / 25.4).toFixed(2));
          } else if (newUnit === 'ft') {
            lengthInput.value = Number((mmVal / 304.8).toFixed(2));
          } else {
            lengthInput.value = Math.round(mmVal);
          }
        }
      }
    }

    _renderQuickLengthChips();
    _updatePiecesUI();
  }

  function _renderQuickLengthChips() {
    const track = document.getElementById('grQuickLengthChips');
    if (!track) return;
    track.innerHTML = '';

    const inputVal = parseFloat(document.getElementById('grRequestedLength')?.value) || 0;

    let presets = [];
    if (_grLengthUnit === 'in') {
      presets = [
        { val: 2.36, label: '2.36" (60mm)' },
        { val: 4.72, label: '4.72" (120mm)' },
        { val: 7.09, label: '7.09" (180mm)' },
        { val: 12,   label: '12" (1 ft)' },
        { val: 24,   label: '24" (2 ft)' },
        { val: 36,   label: '36" (3 ft)' },
      ];
    } else if (_grLengthUnit === 'ft') {
      presets = [
        { val: 0.5, label: '0.5 ft (6")' },
        { val: 1,   label: '1 ft (12")' },
        { val: 2,   label: '2 ft (24")' },
        { val: 3,   label: '3 ft (36")' },
        { val: 4,   label: '4 ft (48")' },
        { val: 5,   label: '5 ft (60")' },
      ];
    } else {
      presets = [
        { val: 60,  label: '60 mm' },
        { val: 120, label: '120 mm' },
        { val: 180, label: '180 mm' },
        { val: 240, label: '240 mm' },
        { val: 300, label: '300 mm' },
        { val: 500, label: '500 mm' },
      ];
    }

    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-len-preset';
      btn.dataset.grlen = String(p.val);
      btn.textContent = p.label;
      if (Math.abs(inputVal - p.val) < 0.01) {
        btn.classList.add('active');
      }
      track.appendChild(btn);
    });
  }

  function _getRequestedLengthMm() {
    const el = document.getElementById('grRequestedLength');
    if (!el || !el.value) return 0;
    const rawVal = parseFloat(el.value);
    if (isNaN(rawVal) || rawVal <= 0) return 0;
    let mm = rawVal;
    if (_grLengthUnit === 'in') {
      mm = rawVal * 25.4;
    } else if (_grLengthUnit === 'ft') {
      mm = rawVal * 304.8;
    }

    // Snap to exact pitch multiple if within 2.0mm rounding error of imperial conversion
    if (_selectedModel && _selectedModel.pitchMm > 0) {
      const p = _selectedModel.pitchMm;
      const k = Math.round(mm / p);
      if (k > 0 && Math.abs(mm - k * p) <= 2.0) {
        return k * p;
      }
    }
    return Number(mm.toFixed(2));
  }

  // ── API Calls: Rail Stock Inventory ──────────────────────────────────────────
  async function _loadRailStock(forceRefresh) {
    try {
      // Always fetch fresh stock live directly from Firebase database
      const url = forceRefresh ? '/api/guided-rail/stock?refresh=true' : '/api/guided-rail/stock';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.stock)) {
        _railStock = data.stock.filter(s => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);
      }
    } catch (e) {
      console.warn('[GuidedRail] Error loading rail stock from Firebase', e);
    }
    _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
      }
    } catch (_) {}
    return _railStock;
  }
  const loadRailStock = _loadRailStock;

  // ── Populate Category Dropdown & Quick Chips & Subnav from Database ────────────
  function _populateBrandDropdownAndChips() {
    const dbBrands = Array.from(new Set(
      _railStock
        .map(s => String(s.category || s.brand || '').trim().toUpperCase())
        .filter(Boolean)
    )).sort();

    const explicitBrands = Array.isArray(window.__RAIL_SUBCATEGORIES__) && window.__RAIL_SUBCATEGORIES__.length > 0 
      ? window.__RAIL_SUBCATEGORIES__.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)
      : ['HIWIN', 'PMI', 'THK'];

    const brandsToUse = Array.from(new Set([...explicitBrands, ...dbBrands])).filter(Boolean).sort();

    // Update #grBrandSelect
    const brandSel = document.getElementById('grBrandSelect');
    if (brandSel) {
      const curVal = brandSel.value;
      brandSel.innerHTML = '';
      brandsToUse.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        brandSel.appendChild(opt);
      });
      if (curVal && curVal !== 'ALL' && curVal !== 'all' && brandSel.querySelector(`option[value="${curVal}"]`)) {
        brandSel.value = curVal;
      } else if (_selectedBrand && _selectedBrand !== 'all' && _selectedBrand !== 'ALL' && brandSel.querySelector(`option[value="${_selectedBrand}"]`)) {
        brandSel.value = _selectedBrand;
      } else if (brandsToUse.length > 0) {
        brandSel.value = brandsToUse[0];
        _selectedBrand = brandsToUse[0];
      }
    }

    // Update #grQuickBrandChips
    const quickBrandTrack = document.getElementById('grQuickBrandChips');
    if (quickBrandTrack) {
      quickBrandTrack.innerHTML = '';
      const allActive = (_selectedBrand === 'ALL' || _selectedBrand === 'all');
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'btn-dia-preset' + (allActive ? ' active' : '');
      allBtn.dataset.grBrand = 'ALL';
      allBtn.textContent = 'All';
      quickBrandTrack.appendChild(allBtn);

      brandsToUse.forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = (_selectedBrand || '').toUpperCase() === b.toUpperCase();
        btn.className = 'btn-dia-preset' + (isActive ? ' active' : '');
        btn.dataset.grBrand = b;
        btn.textContent = b;
        quickBrandTrack.appendChild(btn);
      });
    }

    // Update #railBrandPillsGroup (subnav filter)
    const railPillsCont = document.getElementById('railBrandPillsGroup');
    if (railPillsCont) {
      const allActive = (_grBrandFilter === 'all' || _grBrandFilter === 'ALL');
      railPillsCont.innerHTML = `
        <span class="category-subnav-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18" />
            <path d="M3 12h18" />
          </svg>
          Rail Catagorie:
        </span>
        <button type="button" class="cat-pill-btn ${allActive ? 'active' : ''}" data-rail-brand="all" title="Show all guided rail catagories">
          All Catagories
        </button>
      `;
      brandsToUse.forEach(b => {
        const count = _railStock.filter(s => String(s.category || s.brand || '').toUpperCase() === b.toUpperCase()).length;
        const isActive = (_grBrandFilter || '').toUpperCase() === b.toUpperCase();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cat-pill-btn' + (isActive ? ' active' : '');
        btn.dataset.railBrand = b;
        btn.title = `Filter by ${b} guided rails`;
        btn.innerHTML = `${b}${count > 0 ? ` (${count})` : ''}`;
        railPillsCont.appendChild(btn);
      });
    }

    // Update #formGrBrandSelect (modal)
    const modalBrandSel = document.getElementById('formGrBrandSelect');
    if (modalBrandSel) {
      const curVal = modalBrandSel.value;
      modalBrandSel.innerHTML = '';
      if (brandsToUse.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— No Catagories in Database —';
        opt.disabled = true;
        modalBrandSel.appendChild(opt);
      } else {
        brandsToUse.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b;
          modalBrandSel.appendChild(opt);
        });
        if (curVal && modalBrandSel.querySelector(`option[value="${curVal}"]`)) {
          modalBrandSel.value = curVal;
        } else if (brandsToUse.length > 0) {
          modalBrandSel.value = brandsToUse[0];
        }
      }
    }
    if (typeof window !== 'undefined' && typeof window.initAllCustomDropdowns === 'function') {
      window.initAllCustomDropdowns();
    }
  }

  // ── Populate dropdown & quick chips & spec table ─────────────────────────────
  function _populateModelDropdown() {
    const sel = document.getElementById('grModelSelect');
    const modalSel = document.getElementById('formGrModelSelect');
    const track = document.getElementById('grQuickChipsTrack');
    if (!sel) return;

    const currentVal = sel.value;

    // Clear existing options except placeholder
    while (sel.options.length > 1) sel.remove(1);
    if (modalSel) {
      while (modalSel.options.length > 1) modalSel.remove(1);
    }
    if (track) track.innerHTML = '';

    if (!Array.isArray(_railModels) || _railModels.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— No Models in Database —';
      opt.disabled = true;
      sel.appendChild(opt);

      if (modalSel) {
        const mOpt = document.createElement('option');
        mOpt.value = '';
        mOpt.textContent = '— No Models in Database —';
        mOpt.disabled = true;
        modalSel.appendChild(mOpt);
      }
      _onModelChange();
      return;
    }

    _railModels.forEach(m => {
      // 1. Cut validator dropdown option - strictly from database
      const opt = document.createElement('option');
      opt.value = m.modelName;
      opt.textContent = `${m.modelName} (PCC: ${m.pitchMm}mm)`;
      opt.dataset.modelName    = m.modelName;
      opt.dataset.dbId         = m.id || '';
      opt.dataset.width        = m.railWidthMm;
      opt.dataset.height       = m.railHeightMm;
      opt.dataset.pitch        = m.pitchMm;
      opt.dataset.minCut       = m.minCuttingLengthMm || m.pitchMm;
      sel.appendChild(opt);

      // 2. Add Stock Modal dropdown option
      if (modalSel) {
        const mOpt = document.createElement('option');
        mOpt.value = m.modelName;
        mOpt.textContent = `${m.modelName} (PCC: ${m.pitchMm}mm)`;
        mOpt.dataset.width = m.railWidthMm;
        mOpt.dataset.height = m.railHeightMm;
        mOpt.dataset.pitch = m.pitchMm;
        modalSel.appendChild(mOpt);
      }

      // 3. Quick chip button
      if (track) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-dia-preset';
        btn.dataset.modelId = m.modelName;
        btn.dataset.modelName = m.modelName;
        btn.dataset.pitch = m.pitchMm;
        btn.textContent = m.modelName;
        btn.title = `${m.modelName} — Database PCC: ${m.pitchMm}mm`;
        track.appendChild(btn);
      }
    });

    if (currentVal && _railModels.some(m => m.modelName === currentVal)) {
      sel.value = currentVal;
    } else if (_railModels.length > 0) {
      sel.value = _railModels[0].modelName;
    }
    _onModelChange();
    if (typeof window !== 'undefined' && typeof window.initAllCustomDropdowns === 'function') {
      window.initAllCustomDropdowns();
    }
  }

  // ── Render Drawer Spec Table ──────────────────────────────────────────────────
  function _renderSpecTable() {
    const tbody = document.getElementById('grSpecTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!Array.isArray(_railModels) || _railModels.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" class="text-center" style="padding: 1rem; color: #94a3b8;">No models found in database</td>';
      tbody.appendChild(tr);
      return;
    }

    _railModels.forEach(m => {
      const tr = document.createElement('tr');
      tr.dataset.modelName = m.modelName;
      tr.style.cursor = 'pointer';
      tr.title = `Click to select ${m.modelName}`;
      tr.innerHTML = `
        <td><strong class="font-mono" style="color: #6b8e23;">${m.modelName}</strong></td>
        <td class="text-center font-mono">${m.minCuttingLengthMm || m.pitchMm} mm</td>
        <td class="text-center">
          <button type="button" class="btn btn-xs btn-primary" data-select-model="${m.modelName}" style="padding: 0.2rem 0.6rem; border-radius: 9999px;">Select</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Guided Rail Inventory KPIs ──────────────────────────────────────────────
  function _updateGrKpis() {
    const statGrTotalTypes = document.getElementById('statGrTotalTypes');
    const statGrTotalQuantity = document.getElementById('statGrTotalQuantity');
    const statGrInStockTypes = document.getElementById('statGrInStockTypes');
    const statGrLowStockCount = document.getElementById('statGrLowStockCount');

    if (!statGrTotalTypes && !statGrTotalQuantity) return;

    const totalTypes = _railStock.length;
    const totalQuantity = _railStock.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const inStockTypes = _railStock.filter(item => (Number(item.quantity) || 0) > 0).length;
    const lowStockCount = _railStock.filter(item => (Number(item.quantity) || 0) <= 5).length;

    if (statGrTotalTypes) statGrTotalTypes.textContent = totalTypes.toLocaleString();
    if (statGrTotalQuantity) statGrTotalQuantity.textContent = totalQuantity.toLocaleString();
    if (statGrInStockTypes) statGrInStockTypes.textContent = inStockTypes.toLocaleString();
    if (statGrLowStockCount) statGrLowStockCount.textContent = lowStockCount.toLocaleString();

    document.querySelectorAll('[data-gr-kpi-filter]').forEach(el => {
      const f = el.dataset.grKpiFilter;
      el.classList.toggle('active', f === _grKpiFilter && f !== 'all');
    });
  }

  // ── Render Guided Rail Stock Inventory Table ──────────────────────────────────
  function _renderStockTable() {
    _updateGrKpis();

    const tbody = document.getElementById('grStockTableBody');
    const badge = document.getElementById('grTotalStockBarsBadge');
    if (!tbody) return;

    const q = (document.getElementById('grStockSearchInput')?.value || '').toLowerCase().trim();
    const filtered = _railStock.filter(item => {
      const qty = Number(item.quantity) || 0;
      if (_grKpiFilter === 'in_stock' && qty <= 0) return false;
      if (_grKpiFilter === 'low_stock' && qty > 5) return false;

      // Filter by Category
      if (_grBrandFilter && _grBrandFilter !== 'all' && _grBrandFilter !== 'ALL') {
        const itemBrand = String(item.category || item.brand || '').toUpperCase();
        if (itemBrand !== _grBrandFilter.toUpperCase()) return false;
      }

      if (!q) return true;
      return (
        item.modelName.toLowerCase().includes(q) ||
        (item.brand && item.brand.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        String(item.lengthMm).includes(q)
      );
    });

    const activeBrandName = (_grBrandFilter && _grBrandFilter !== 'all' && _grBrandFilter !== 'ALL') ? _grBrandFilter : 'Rail';
    const sectionTitle = document.getElementById('railInventorySectionTitle');
    if (sectionTitle) {
      sectionTitle.textContent = `${activeBrandName} Stock Inventory`;
    }

    const totalBars = filtered.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    if (badge) badge.textContent = `${totalBars} bar${totalBars !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📦</div>
            <div style="font-weight: 600; margin-bottom: 0.25rem;">No guided rail stock found</div>
            <p style="font-size: 0.8rem; margin: 0 0 1rem;">No storage stock matches your search filter. Add a stock bar to get started.</p>
            <button type="button" class="btn btn-sm btn-primary" id="btnStockEmptyAdd" style="background: linear-gradient(135deg, #6b8e23, #55731c); border-color: #55731c; border-radius: 9999px;">
              + Add Guided Rail Stock
            </button>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      return `
        <tr data-stock-id="${item.id}">
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="gr-brand-badge-tag">${item.brand || 'FINHY'}</span>
              <span class="gr-spec-badge-tag">${item.modelName}</span>
            </div>
          </td>
          <td class="text-center font-mono" style="color: var(--text-secondary);">${item.pitchMm || 60} mm</td>
          <td class="text-right font-mono" style="font-weight: 700; color: #6b8e23;">${item.lengthMm} mm</td>
          <td class="text-right">
            <span class="font-mono" style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${item.quantity}</span>
          </td>
          <td class="text-center">
            <div style="display: inline-flex; align-items: center; gap: 0.35rem; justify-content: center;">
              <button type="button" class="btn btn-xs btn-primary" data-cut-stock-id="${item.id}" data-model="${item.modelName}" data-length="${item.lengthMm}" title="Load this model into Cut Validator" style="background: #6b8e23; border-color: #6b8e23; font-size: 0.72rem; padding: 0.25rem 0.65rem; border-radius: 9999px;">
                ✂️ Cut
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Stock Modal Management ───────────────────────────────────────────────────
  function openAddRailStockModal(prefillModel) {
    if (window.rodsyncIsAdmin === false) {
      _toast('Permission denied: Only administrators can add rail inventory.', 'warning');
      return;
    }
    try { _populateModelDropdown(); } catch (_) {}
    const modal = document.getElementById('grStockModalOverlay');
    const form = document.getElementById('grStockForm');
    const title = document.getElementById('grModalTitle');
    const btnText = document.getElementById('btnSaveGrStockText');
    const editId = document.getElementById('grStockEditId');
    const brandSel = document.getElementById('formGrBrandSelect');
    const modelSel = document.getElementById('formGrModelSelect');
    const lenInput = document.getElementById('formGrLengthMm');
    const qtyInput = document.getElementById('formGrQuantity');
    const notesInput = document.getElementById('formGrNotes');

    if (!modal) return;
    if (form) form.reset();
    if (editId) editId.value = '';
    if (title) title.textContent = 'Add Guided Rail Stock';
    if (btnText) btnText.textContent = 'Save Rail to Stock';

    if (brandSel) {
      const defaultVal = (_grBrandFilter !== 'all' ? _grBrandFilter : (_selectedBrand !== 'ALL' ? _selectedBrand : (brandSel.options[0]?.value || '')));
      if (defaultVal) brandSel.value = defaultVal;
    }
    if (prefillModel && modelSel) {
      modelSel.value = prefillModel;
    }
    if (qtyInput) qtyInput.value = '1';
    _onStockModelChange();

    modal.classList.remove('hidden');
    setTimeout(() => { (modelSel || lenInput)?.focus(); }, 50);
  }

  function openEditRailStockModal(id) {
    if (window.rodsyncIsAdmin === false) {
      _toast('Permission denied: Only administrators can edit rail inventory.', 'warning');
      return;
    }
    const item = _railStock.find(s => s.id === id);
    if (!item) return;

    const modal = document.getElementById('grStockModalOverlay');
    const title = document.getElementById('grModalTitle');
    const btnText = document.getElementById('btnSaveGrStockText');
    const editId = document.getElementById('grStockEditId');
    const brandSel = document.getElementById('formGrBrandSelect');
    const modelSel = document.getElementById('formGrModelSelect');
    const lenInput = document.getElementById('formGrLengthMm');
    const qtyInput = document.getElementById('formGrQuantity');
    const notesInput = document.getElementById('formGrNotes');

    if (!modal) return;
    if (editId) editId.value = item.id;
    if (title) title.textContent = `Edit Stock — ${item.category || item.brand || ''} ${item.modelName}`.trim();
    if (btnText) btnText.textContent = 'Update Rail Stock';

    if (brandSel) brandSel.value = item.category || item.brand || '';
    if (modelSel) modelSel.value = item.modelName;
    if (lenInput) lenInput.value = item.lengthMm;
    if (qtyInput) qtyInput.value = item.quantity;
    if (notesInput) notesInput.value = item.notes || '';
    _onStockModelChange();

    modal.classList.remove('hidden');
  }

  function closeRailStockModal() {
    const modal = document.getElementById('grStockModalOverlay');
    if (modal) modal.classList.add('hidden');
  }

  async function handleSaveRailStock(e) {
    if (e) e.preventDefault();
    const editId = document.getElementById('grStockEditId')?.value;
    const modelSel = document.getElementById('formGrModelSelect');
    const modelName = modelSel?.value;
    const opt = modelSel && modelSel.selectedIndex >= 0 ? modelSel.options[modelSel.selectedIndex] : null;
    const len = parseFloat(document.getElementById('formGrLengthMm')?.value);
    const qty = parseInt(document.getElementById('formGrQuantity')?.value, 10);
    const notes = document.getElementById('formGrNotes')?.value.trim();

    if (!modelName) {
      _toast('Please select a Guided Rail model.', 'warning');
      return;
    }
    if (isNaN(len) || len <= 0) {
      _toast('Please enter a valid stock length in millimeters.', 'warning');
      return;
    }
    if (isNaN(qty) || qty < 0) {
      _toast('Please enter a valid positive quantity.', 'warning');
      return;
    }

    const matchedModel = _railModels.find(m => m.modelName === modelName);
    const railWidthMm = matchedModel ? matchedModel.railWidthMm : (parseFloat(opt?.dataset.width) || 0);
    const railHeightMm = matchedModel ? matchedModel.railHeightMm : (parseFloat(opt?.dataset.height) || 0);
    const formPccVal = parseFloat(document.getElementById('formGrPcc')?.value);
    const pitchMm = (!isNaN(formPccVal) && formPccVal > 0) ? formPccVal : (matchedModel ? matchedModel.pitchMm : (parseFloat(opt?.dataset.pitch) || 60));

    const brandSel = document.getElementById('formGrBrandSelect');
    const brand = (brandSel ? brandSel.value : '') || '';
    const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || '';

    const payload = {
      brand,
      category: brand,
      modelName,
      railWidthMm,
      railHeightMm,
      pitchMm,
      lengthMm: len,
      quantity: qty,
      notes: notes || '',
      scriptUrl,
      ...(editId ? { id: editId } : {}),
    };

    const method = editId ? 'PUT' : 'POST';
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;

      const res = await fetch('/api/guided-rail/stock', {
        method,
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        closeRailStockModal();
        if (Array.isArray(data.stock)) {
          _railStock = data.stock;
        } else if (data.item) {
          const idx = _railStock.findIndex(s => s.id === data.item.id);
          if (idx !== -1) _railStock[idx] = data.item;
          else _railStock.unshift(data.item);
        }
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();

        // Dispatch sync event so app/page.tsx syncs to Firebase live
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
          }
        } catch (_) {}

        _toast(`✅ Guided Rail ${modelName} (${len} mm) saved & synced to Firebase!`, 'success');
      } else {
        _toast(data.message || 'Error saving rail stock', 'danger');
      }
    } catch (err) {
      console.error(err);
      _toast('Network error while saving guided rail stock.', 'danger');
    }
  }

  async function deleteRailStock(id) {
    if (!confirm('Are you sure you want to remove this guided rail stock item from storage?')) return;
    const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || '';
    try {
      const headers = {};
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;
      const res = await fetch(`/api/guided-rail/stock?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.stock)) {
          _railStock = data.stock;
        } else {
          _railStock = _railStock.filter(s => s.id !== id);
        }
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
        try {
          window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
        } catch (_) {}
        _toast('Rail stock item removed and synced.', 'info');
      } else {
        _toast(data.message || 'Error deleting rail stock', 'danger');
      }
    } catch {
      _toast('Network error while deleting rail stock.', 'danger');
    }
  }

  async function quickAdjustStockQty(id, delta) {
    const item = _railStock.find(s => s.id === id);
    if (!item) return;
    const newQty = Math.max(0, (Number(item.quantity) || 0) + delta);
    const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || '';
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;
      const res = await fetch('/api/guided-rail/stock', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id, quantity: newQty, scriptUrl }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.deleted || newQty <= 0) {
          _railStock = _railStock.filter(s => s.id !== id);
          _toast(`Length ${item.lengthMm} mm deleted from stock in RodSync and Firebase.`, 'info');
        } else {
          item.quantity = newQty;
        }
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
        try {
          window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Quick adjust stock failed', e);
    }
  }

  // ── Guided Rail Cut Execution & Modal ─────────────────────────────────────────
  let _activeCutStockItem = null;

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const escapeHtml = _escapeHtml;

  function openGrCutModal(stockId, cutLenMm, pieces) {
    const modal = document.getElementById('grCutModalOverlay');
    if (!modal) return;

    const item = _railStock.find(s => s.id === stockId);
    if (!item) {
      _toast('Source rail stock item not found in storage.', 'warning');
      return;
    }
    _activeCutStockItem = item;

    const hiddenId = document.getElementById('grCutStockId');
    const modelEl = document.getElementById('grCutSourceModel');
    const qtyEl = document.getElementById('grCutSourceQty');
    const lenEl = document.getElementById('grCutSourceLength');
    const pitchEl = document.getElementById('grCutSourcePitch');
    const cutInput = document.getElementById('grCutPieceLengthInput');
    const piecesInput = document.getElementById('grCutPiecesCountInput');
    const orderNotes = document.getElementById('grCutOrderNotes');
    const saveRemnantCb = document.getElementById('grSaveRemnantCheckbox');

    if (hiddenId) hiddenId.value = item.id;
    if (modelEl) modelEl.textContent = item.modelName;
    if (qtyEl) qtyEl.textContent = `${item.quantity} bar${item.quantity !== 1 ? 's' : ''} in stock`;
    if (lenEl) {
      const lengthIn = (item.lengthMm / 25.4).toFixed(2);
      lenEl.textContent = `${lengthIn}" (${item.lengthMm} mm)`;
    }
    if (pitchEl) pitchEl.textContent = `${item.pitchMm} mm`;

    const initialCut = cutLenMm && cutLenMm > 0 ? cutLenMm : (_getRequestedLengthMm() || Math.round(item.pitchMm * 2));
    const initialPcs = pieces && pieces > 0 ? pieces : (parseInt(document.getElementById('grPiecesInput')?.value, 10) || 1);

    if (cutInput) cutInput.value = initialCut;
    if (piecesInput) piecesInput.value = initialPcs;
    if (orderNotes) orderNotes.value = '';
    if (saveRemnantCb) saveRemnantCb.checked = true;

    // Auto-fill logged-in user name and permanently lock it
    const sessionUser = _getCurrentSessionUser();
    const currentUserName = sessionUser.name || 'Operator';
    const assignByInput = document.getElementById('grCutAssignBy');
    if (assignByInput) {
      assignByInput.value = currentUserName;
      assignByInput.readOnly = true;
      assignByInput.tabIndex = -1;
      assignByInput.setAttribute('readonly', 'readonly');
      assignByInput.style.backgroundColor = 'var(--bg-surface-subtle, #f1f5f9)';
      assignByInput.style.cursor = 'not-allowed';
      assignByInput.style.fontWeight = '700';
      assignByInput.style.color = 'var(--text-primary, #1e293b)';
      assignByInput.title = `Assigned By is automatically set to your logged-in account (${currentUserName}) and is locked.`;
    }
    const grCutAssignByLabel = document.getElementById('grCutAssignByLabel');
    if (grCutAssignByLabel) {
      grCutAssignByLabel.innerHTML = `Assigned By <span style="font-size: 0.7rem; color: #6b8e23; font-weight: 700; margin-left: 4px;">(🔒 Locked)</span>`;
    }
    const assignToInput = document.getElementById('grCutAssignTo');
    if (assignToInput) assignToInput.value = '';

    _recalcGrCutModal();
    modal.classList.remove('hidden');

    // Smooth focus after modal scale entrance finishes to prevent scroll jumps
    const isTouch = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    if (!isTouch && cutInput) {
      setTimeout(() => {
        try {
          cutInput.focus({ preventScroll: true });
        } catch {
          cutInput.focus();
        }
      }, 260);
    }
  }

  function closeGrCutModal() {
    const modal = document.getElementById('grCutModalOverlay');
    if (modal) modal.classList.add('hidden');
    _activeCutStockItem = null;
  }

  function _recalcGrCutModal() {
    if (!_activeCutStockItem) return;
    const cutInput = document.getElementById('grCutPieceLengthInput');
    const piecesInput = document.getElementById('grCutPiecesCountInput');
    const totalCutEl = document.getElementById('grCalcTotalCut');
    const remEl = document.getElementById('grCalcRemnant');
    const spansEl = document.getElementById('grCalcRemnantPitch');
    const errEl = document.getElementById('grCutErrorAlert');
    const confirmBtn = document.getElementById('btnConfirmGrCut');

    const cutMm = parseFloat(cutInput?.value) || 0;
    const pcs = parseInt(piecesInput?.value, 10) || 1;
    const stockMm = _activeCutStockItem.lengthMm;
    const pitchMm = _activeCutStockItem.pitchMm || 60;

    const totalCutMm = cutMm * pcs;
    const totalCutIn = (totalCutMm / 25.4).toFixed(2);
    const remnantMm = stockMm - totalCutMm;
    const remnantIn = (remnantMm / 25.4).toFixed(2);

    if (totalCutEl) totalCutEl.textContent = `${totalCutMm} mm (${totalCutIn}")`;
    if (remEl) {
      remEl.textContent = `${remnantMm} mm (${remnantIn}")`;
      remEl.style.color = remnantMm >= 0 ? '#10b981' : '#ef4444';
    }

    if (spansEl) {
      if (remnantMm >= 0) {
        const spans = (remnantMm / pitchMm).toFixed(1);
        spansEl.textContent = `${spans} pitch spans (${pitchMm} mm pitch)`;
      } else {
        spansEl.textContent = 'Invalid: exceeds stock bar length';
      }
    }

    const isExceeded = remnantMm < 0 || totalCutMm <= 0;
    if (errEl) errEl.classList.toggle('hidden', !isExceeded);
    if (confirmBtn) confirmBtn.disabled = isExceeded;
  }

  async function handleConfirmGrCut(e) {
    if (e) e.preventDefault();
    if (!_activeCutStockItem) return;

    const cutInput = document.getElementById('grCutPieceLengthInput');
    const piecesInput = document.getElementById('grCutPiecesCountInput');
    const orderNotes = document.getElementById('grCutOrderNotes')?.value?.trim() || '';
    const saveRemnantCb = document.getElementById('grSaveRemnantCheckbox');
    const confirmBtn = document.getElementById('btnConfirmGrCut');
    const confirmText = document.getElementById('btnConfirmGrCutText');

    const cutMm = parseFloat(cutInput?.value) || 0;
    const pcs = parseInt(piecesInput?.value, 10) || 1;
    const bar = _activeCutStockItem;
    const totalCutMm = cutMm * pcs;
    const remnantMm = bar.lengthMm - totalCutMm;

    if (cutMm <= 0 || pcs <= 0) {
      _toast('Please specify valid cutting length and pieces', 'warning');
      return;
    }
    if (remnantMm < 0) {
      _toast('Total cut length exceeds the source bar length', 'warning');
      return;
    }

    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmText) confirmText.textContent = 'Recording Cut…';

    try {
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;

      const shouldSaveRemnant = Boolean(saveRemnantCb?.checked && remnantMm > 0);
      const assignBy = (document.getElementById('grCutAssignBy')?.value || '').trim() || _getCurrentSessionUser().name || 'Operator';
      const assignTo = (document.getElementById('grCutAssignTo')?.value || '').trim();

      // Atomic cut call: decrements source bar (or deletes it if qty hits 0), adds remnant to stock, logs cut, and syncs both to Excel
      const res = await fetch('/api/guided-rail/cut', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cutType: 'single',
          stockId: bar.id,
          cutPieceLengthMm: cutMm,
          piecesCount: pcs,
          shouldSaveRemnant,
          orderNotes,
          assignBy,
          assignTo,
          scriptUrl,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to record cut');
      }

      // Update in-memory stock immediately from authoritative backend response
      if (Array.isArray(data.stock)) {
        _railStock = data.stock;
        window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
      }

      // Append returned log(s) to cut logs state and sync to Firebase
      if (Array.isArray(data.logs)) {
        data.logs.forEach(l => {
          if (typeof window.addCutLog === 'function') {
            window.addCutLog(l);
          } else {
            window.dispatchEvent(new CustomEvent('syncCutLogsToFirebase', { detail: [l] }));
          }
        });
      }

      if (typeof window.updateCutLogsBadge === 'function') {
        window.updateCutLogsBadge();
      }

      _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
      closeGrCutModal();

      const remMsg = (shouldSaveRemnant && remnantMm > 0.1) ? ` Remnant ${remnantMm} mm added to stock in Firebase.` : '';
      const delMsg = (Number(bar.quantity) <= 1) ? ` Length ${bar.lengthMm} mm deleted from stock in Firebase.` : '';
      _toast(`✂️ Cut recorded successfully!${delMsg}${remMsg} Saved to Guided Rail Cut Logs in Firebase.`, 'success');

      // Re-run validation to update matching bars list
      _onValidate(new Event('submit'));
    } catch (err) {
      console.error('Error executing rail cut:', err);
      _toast('Failed to record cut: ' + (err.message || 'Unknown error'), 'danger');
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
      if (confirmText) confirmText.textContent = '✂️ Confirm & Execute Cut';
    }
  }

  async function _onCutActionClick(e) {
    if (e) e.preventDefault();
    if (!_selectedModel) {
      _showValidationResult('warning', 'Please select a Guided Rail model first.');
      return;
    }
    const requestedMm = _getRequestedLengthMm();
    if (!requestedMm || requestedMm <= 0) {
      _showValidationResult('warning', `Please enter a valid required cutting length in ${_grLengthUnit.toUpperCase()}.`);
      document.getElementById('grRequestedLength')?.focus();
      return;
    }

    const targetModel = _selectedModel.modelName;
    const pieces = parseInt(document.getElementById('grPiecesInput')?.value, 10) || 1;
    const matchingBars = _railStock.filter(s => s.modelName === targetModel && s.lengthMm >= requestedMm && s.quantity > 0);

    // If matching bars already exist in stock, open cut modal directly without flashing the spinner
    if (matchingBars.length > 0) {
      const bestBar = [...matchingBars].sort((a, b) => a.lengthMm - b.lengthMm)[0];
      openGrCutModal(bestBar.id, requestedMm, pieces);
      return;
    }

    // Otherwise run validation first to show layout and alert user
    await _onValidate(e);
    _toast(`No stock bars of ${targetModel} in stock are long enough for ${requestedMm} mm. Click "+ Add Rail Stock" below.`, 'warning');
  }

  function _onStockModelChange() {
    const sel = document.getElementById('formGrModelSelect');
    const opt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    const hint = document.getElementById('formGrModelSpecHint');
    const lenHint = document.getElementById('formGrLengthHint');
    const lenInput = document.getElementById('formGrLengthMm');

    if (!opt || !opt.value) {
      if (hint) hint.textContent = 'Select a standard rail model';
      return;
    }

    const modelName = opt.value;
    const m = _railModels.find(x => x.modelName === modelName) || {
      pitchMm: parseFloat(opt.dataset.pitch) || 60,
    };

    // Auto-populate database PCC in modal
    const modalPcc = document.getElementById('formGrPcc');
    const modalPccHint = document.getElementById('formGrPccHint');
    if (modalPcc) modalPcc.value = m.pitchMm;
    if (modalPccHint) modalPccHint.textContent = `Database PCC: ${m.pitchMm} mm`;

    if (hint) {
      hint.textContent = `Selected Model: ${modelName} (PCC: ${m.pitchMm} mm)`;
    }

    if (lenInput && lenHint && lenInput.value) {
      const len = parseFloat(lenInput.value);
      if (len > 0) {
        const isMulti = (len % m.pitchMm) === 0;
        if (isMulti) {
          lenHint.textContent = `✓ ${len} mm is a valid standard length.`;
          lenHint.style.color = '#10b981';
        } else {
          const next = Math.ceil(len / m.pitchMm) * m.pitchMm;
          lenHint.textContent = `Note: ${len} mm is not standard (recommended: ${next} mm).`;
          lenHint.style.color = '#f59e0b';
        }
      }
    }
    if (typeof window !== 'undefined' && typeof window.initAllCustomDropdowns === 'function') {
      window.initAllCustomDropdowns();
    }
  }

  // ── Select Model Helper ───────────────────────────────────────────────────────
  function selectGrModel(nameOrId) {
    if (!nameOrId) return;
    const target = String(nameOrId).trim().toUpperCase();
    const sel = document.getElementById('grModelSelect');
    if (!sel) return;

    let matchedOption = null;
    for (let i = 0; i < sel.options.length; i++) {
      const opt = sel.options[i];
      if (
        opt.value.toUpperCase() === target ||
        (opt.dataset.modelName && opt.dataset.modelName.toUpperCase() === target) ||
        opt.textContent.toUpperCase().startsWith(target)
      ) {
        matchedOption = opt;
        break;
      }
    }

    if (matchedOption) {
      sel.value = matchedOption.value;
      _onModelChange();
    }
  }

  // ── Populate spec fields on model selection ───────────────────────────────────
  function _onModelChange() {
    const sel = document.getElementById('grModelSelect');
    const opt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;

    const specCard = document.getElementById('grModelSpecCard');
    const badgeName = document.getElementById('grSpecBadgeName');
    const badgeDetails = document.getElementById('grSpecBadgeDetails');
    const hintEl = document.getElementById('grModelHint');

    if (!opt || !opt.value) {
      _selectedModel = null;
      document.querySelectorAll('#grQuickChipsTrack .btn-dia-preset').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('#grSpecTableBody tr').forEach(row => row.classList.remove('selected-row'));
      if (specCard) specCard.classList.add('hidden');
      if (hintEl) hintEl.textContent = 'Select HGR rail model to auto-populate specifications';
      _clearValidationResult();
      return;
    }

    const val = opt.value;
    const name = opt.dataset.modelName || val;

    _selectedModel = _railModels.find(m => 
      m.id === val || 
      m.modelName === val || 
      m.modelName === name ||
      (m.id && val && m.id.toUpperCase() === val.toUpperCase())
    ) || null;

    // Fallback if not found in list: build directly from option attributes
    if (!_selectedModel && val) {
      _selectedModel = {
        id: val,
        modelName: name,
        railWidthMm: parseFloat(opt.dataset.width) || 0,
        railHeightMm: parseFloat(opt.dataset.height) || 0,
        pitchMm: parseFloat(opt.dataset.pitch) || 0,
        minCuttingLengthMm: parseFloat(opt.dataset.minCut) || parseFloat(opt.dataset.pitch) || 0,
        active: true
      };
    }

    // Highlight matching quick chip
    document.querySelectorAll('#grQuickChipsTrack .btn-dia-preset').forEach(btn => {
      const match = (btn.dataset.modelId === val) || 
                    (btn.dataset.modelName === name) || 
                    (btn.textContent.trim() === name);
      btn.classList.toggle('active', Boolean(match));
    });

    // Highlight matching row in drawer table
    document.querySelectorAll('#grSpecTableBody tr').forEach(row => {
      row.classList.toggle('selected-row', row.dataset.modelName === name);
    });

    // Populate PCC input and hint directly from database
    const pccInput = document.getElementById('grPccInput');
    const pccHint = document.getElementById('grPccHint');
    if (pccInput) {
      pccInput.value = _selectedModel ? _selectedModel.pitchMm : '';
    }
    if (pccHint) {
      pccHint.textContent = _selectedModel
        ? `Database PCC: ${_selectedModel.pitchMm} mm`
        : 'Database hole pitch (PCC)';
    }

    // Keep specification badge pill hidden per user request
    if (specCard) {
      specCard.classList.add('hidden');
    }

    if (hintEl && _selectedModel) {
      hintEl.textContent = `${_selectedModel.modelName}`;
    }

    _clearValidationResult();
  }

  // ── Validate button click ─────────────────────────────────────────────────────
  async function _onValidate(e) {
    if (e) e.preventDefault();
    if (!_selectedModel) {
      _showValidationResult('warning', 'Please select a Guided Rail model first.');
      return;
    }
    const requestedMm = _getRequestedLengthMm();
    if (!requestedMm || requestedMm <= 0) {
      _showValidationResult('warning', `Please enter a valid required cutting length in ${_grLengthUnit.toUpperCase()}.`);
      return;
    }

    const piecesInput = document.getElementById('grPiecesInput');
    const pieces = parseInt(piecesInput ? piecesInput.value : '1', 10) || 1;

    // Show spinner
    _showValidationResult('loading', 'Validating cutting layout…');

    try {
      const modelIdentifier = _selectedModel.modelName || _selectedModel.id;
      const data = await _validateLength(modelIdentifier, requestedMm);
      if (!data.success) {
        _showValidationResult('warning', data.message || 'Validation error');
        return;
      }
      const v = data.validation;
      _showValidationResult(v.status, v.message, {
        requestedMm: v.requestedLengthMm,
        pitchMm: v.pitchMm,
        minMm: v.recommendedMinMm,
        holesCount: v.holesCount || 0,
        pitchSpans: v.pitchSpans || 0,
        endMarginMm: v.endMarginMm || 0,
        recommendedLengthMm: v.recommendedLengthMm,
        pieces: pieces,
        model: data.model,
      });
    } catch {
      _showValidationResult('warning', 'Network error — could not reach validation API.');
    }
  }

  // ── Render validation result ──────────────────────────────────────────────────
  function _clearValidationResult() {
    const box = document.getElementById('grValidationResult');
    if (box) {
      box.className = 'gr-validation-result hidden';
      box.innerHTML = '';
      box.style.display = 'none';
      box.style.background = '';
      box.style.border = '';
      box.style.padding = '';
    }
    const sugBox = document.getElementById('grLengthSuggestionsBox');
    if (sugBox) {
      sugBox.style.display = 'none';
      sugBox.innerHTML = '';
    }
    _lastValidResult = null;
  }

  function _generateRailSvg(L, P, E, holesCount, pieces = 1) {
    if (!holesCount || holesCount <= 0 || !L || L <= 0) return '';
    const svgWidth = 460;
    const padX = 20;
    const railW = svgWidth - padX * 2; // 420
    const railY = 28;
    const railH = 26;

    let holesSvg = '';
    for (let i = 0; i < holesCount; i++) {
      const distFromStart = E + i * P;
      const x = padX + (distFromStart / L) * railW;
      holesSvg += `
        <g class="gr-svg-hole" transform="translate(${x.toFixed(1)}, ${railY + railH / 2})">
          <circle r="7" fill="rgba(0,0,0,0.15)" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
          <circle r="4" fill="var(--bg-app, #fff)" stroke="currentColor" stroke-width="1.5" />
          <text y="-14" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.8" font-family="monospace">#${i + 1}</text>
        </g>`;
    }

    const firstHoleX = padX + (E / L) * railW;
    const lastHoleX = padX + ((E + (holesCount - 1) * P) / L) * railW;

    return `
      <div class="gr-schematic-wrap" style="margin-top: 0.85rem; padding: 0.75rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-md);">
        <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 0.4rem; display: flex; justify-content: space-between;">
          <span>Individual Rail Layout (${L} mm)</span>
          <span>${pieces > 1 ? `${pieces} pcs required (Total ${(pieces * L).toFixed(0)} mm)` : `Total: ${L} mm`}</span>
        </div>
        <svg viewBox="0 0 ${svgWidth} 75" style="width: 100%; height: auto; display: block; overflow: visible;">
          <rect x="${padX}" y="${railY}" width="${railW}" height="${railH}" rx="3" fill="rgba(124, 58, 237, 0.08)" stroke="currentColor" stroke-width="1.6" />
          <line x1="${padX}" y1="${railY + railH / 2}" x2="${padX + railW}" y2="${railY + railH / 2}" stroke="currentColor" stroke-width="0.8" stroke-dasharray="3,3" opacity="0.4" />
          ${holesSvg}
          <g font-size="8.5" fill="currentColor" opacity="0.85" font-family="monospace">
            <text x="${(padX + firstHoleX) / 2}" y="${railY + railH + 14}" text-anchor="middle">E1: ${E}mm</text>
            <text x="${(lastHoleX + padX + railW) / 2}" y="${railY + railH + 14}" text-anchor="middle">E2: ${E}mm</text>
          </g>
        </svg>
      </div>`;
  }

  // ── Display Format Helpers for Guided Rail Lengths ────────────────────────────
  function _fmtGrLen(mm) {
    if (!mm || mm <= 0) return '0 mm';
    if (_grLengthUnit === 'in') {
      const inches = (mm / 25.4).toFixed(1);
      return `${inches} In (${mm.toFixed(0)} mm)`;
    }
    if (_grLengthUnit === 'ft') {
      const ft = (mm / 304.8).toFixed(2);
      return `${ft} Ft (${mm.toFixed(0)} mm)`;
    }
    return `${mm.toFixed(0)} mm (${(mm / 25.4).toFixed(1)} In)`;
  }

  function _fmtGrLenShort(mm) {
    if (!mm || mm <= 0) return '0 mm';
    if (_grLengthUnit === 'in') return `${(mm / 25.4).toFixed(1)} In`;
    if (_grLengthUnit === 'ft') return `${(mm / 304.8).toFixed(2)} Ft`;
    return `${mm.toFixed(0)} mm`;
  }

  // ── Multi-Cut Stock Optimizer Engine for Guided Rail ──────────────────────────
  function _calculateGrCutPlan(modelName, pieceLenMm, piecesNeeded, strategy = 'full_length_first') {
    const eligibleBars = _railStock
      .filter(bar => {
        if (bar.modelName !== modelName) return false;
        if (Number(bar.lengthMm) < pieceLenMm) return false;
        if (Number(bar.quantity) <= 0) return false;
        if (_selectedBrand && _selectedBrand !== 'ALL') {
          const itemBrand = (bar.brand || 'FINHY').toUpperCase();
          if (itemBrand !== _selectedBrand.toUpperCase()) return false;
        }
        return true;
      })
      .map(b => ({ ...b, availableUnits: Number(b.quantity) || 0 }));

    if (strategy === 'full_length_first') {
      // Longest stock rails first: preserve offcut remnants
      eligibleBars.sort((a, b) => Number(b.lengthMm) - Number(a.lengthMm));
    } else {
      // Offcut remnants first: consume smaller/scrap stock rails first
      eligibleBars.sort((a, b) => {
        const isOffcutA = (a.notes && a.notes.toLowerCase().includes('offcut')) || (a.sku && a.sku.includes('OFFCUT')) || Number(a.lengthMm) < 3000;
        const isOffcutB = (b.notes && b.notes.toLowerCase().includes('offcut')) || (b.sku && b.sku.includes('OFFCUT')) || Number(b.lengthMm) < 3000;
        if (isOffcutA && !isOffcutB) return -1;
        if (!isOffcutA && isOffcutB) return 1;
        return Number(a.lengthMm) - Number(b.lengthMm);
      });
    }

    let remainingPieces = piecesNeeded;
    const steps = [];
    let totalCutLengthMm = 0;
    let totalOffcutSavedMm = 0;
    let totalRailsUsed = 0;

    for (const bar of eligibleBars) {
      if (remainingPieces <= 0) break;
      const barLen = Number(bar.lengthMm);
      const maxPiecesPerBar = Math.floor(barLen / pieceLenMm);
      if (maxPiecesPerBar <= 0) continue;

      const unitsToUse = bar.availableUnits;
      for (let u = 0; u < unitsToUse; u++) {
        if (remainingPieces <= 0) break;
        const piecesFromThisBar = Math.min(remainingPieces, maxPiecesPerBar);
        const totalCutFromBar = Number((piecesFromThisBar * pieceLenMm).toFixed(1));
        const remainder = Number((barLen - totalCutFromBar).toFixed(1));

        steps.push({
          stepNum: steps.length + 1,
          barId: bar.id,
          brand: bar.brand || 'FINHY',
          modelName: bar.modelName,
          sku: bar.sku || '',
          pitchMm: bar.pitchMm,
          railWidthMm: bar.railWidthMm,
          railHeightMm: bar.railHeightMm,
          barFullLengthMm: barLen,
          piecesToCut: piecesFromThisBar,
          pieceLengthMm: pieceLenMm,
          totalCutMm: totalCutFromBar,
          remainderMm: remainder,
          isRemnantSource: (bar.notes && bar.notes.toLowerCase().includes('offcut')) || (bar.sku && bar.sku.includes('OFFCUT')) || barLen < 3000
        });

        totalRailsUsed += 1;
        totalCutLengthMm += totalCutFromBar;
        totalOffcutSavedMm += remainder;
        remainingPieces -= piecesFromThisBar;
      }
    }

    const isFullyFulfilled = remainingPieces === 0;
    const fulfilledPieces = piecesNeeded - remainingPieces;

    return {
      modelName,
      pieceLengthMm: pieceLenMm,
      piecesNeeded,
      fulfilledPieces,
      shortagePieces: remainingPieces,
      isFullyFulfilled,
      totalRailsUsed,
      totalCutLengthMm,
      totalOffcutSavedMm,
      strategy,
      steps,
      eligibleBars
    };
  }

  // ── Build HTML for Guided Rail Matching Rails & Multi-Cut Plan Card ──────────
  function _buildGrCutPlanHtml(plan, model, pieces, requestedMm) {
    const targetLengthLabel = _fmtGrLen(requestedMm);
    const targetLengthShort = _fmtGrLenShort(requestedMm);
    const totalOrderLengthLabel = _fmtGrLen(requestedMm * pieces);
    const totalCutShort = _fmtGrLenShort(requestedMm * pieces);
    const totalOffcutShort = _fmtGrLenShort(plan.totalOffcutSavedMm);

    // Build step cards HTML
    const stepsHtml = plan.steps.map((step, idx) => {
      const sourceLenLabel = _fmtGrLen(step.barFullLengthMm);
      const isFinalStep = idx === plan.steps.length - 1 && plan.steps.length > 1;
      const stepBadgeText = isFinalStep
        ? `Step #${step.stepNum} (Remaining Part from Another Rail)`
        : (step.isRemnantSource ? `Step #${step.stepNum} (Remnant Stock)` : `Step #${step.stepNum} (Full Length Stock)`);

      const piecePct = (step.pieceLengthMm / step.barFullLengthMm) * 100;
      let segmentsHtml = '';
      for (let p = 0; p < step.piecesToCut; p++) {
        const pieceDisplay = targetLengthShort;
        segmentsHtml += `
          <div class="cut-plan-segment segment-piece" style="width: ${piecePct.toFixed(2)}%; background: linear-gradient(135deg, #6b8e23 0%, #55731c 100%);" title="Piece #${p + 1}: ${pieceDisplay}">
            ${piecePct >= 14 ? `Cut #${p + 1} (${pieceDisplay})` : pieceDisplay}
          </div>
        `;
      }

      const remPct = Math.max(0, 100 - (step.piecesToCut * piecePct));
      if (step.remainderMm <= 0.1) {
        segmentsHtml += `
          <div class="cut-plan-segment segment-offcut-exact" style="width: ${remPct.toFixed(2)}%;" title="Exact Fit: 0 Scrap">
            Exact Fit (0 Scrap)
          </div>
        `;
      } else {
        const remDisplay = _fmtGrLenShort(step.remainderMm);
        segmentsHtml += `
          <div class="cut-plan-segment segment-offcut-saved" style="width: ${remPct.toFixed(2)}%;" title="Reusable Offcut: ${_fmtGrLen(step.remainderMm)} (Saved to Stock)">
            ${remPct >= 14 ? `Offcut: ${remDisplay} (Stock)` : remDisplay}
          </div>
        `;
      }

      return `
        <div class="cut-plan-step-card" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 1rem 1.15rem; margin-bottom: 0.75rem;">
          <div class="step-card-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.65rem;">
            <div class="step-card-left" style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
              <span class="step-badge" style="background: linear-gradient(135deg, #6b8e23, #55731c); color: #fff; font-size: 0.72rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: var(--radius-full);">${stepBadgeText}</span>
              <span class="gr-brand-badge-tag">${step.brand || 'FINHY'}</span>
              <span class="step-rod-title" style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">Guided Rail ${step.modelName}</span>
            </div>
            <div class="step-rod-dims" style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">
              Source Length: <strong>${sourceLenLabel}</strong> &bull; Model: <strong>${step.modelName}</strong> &bull; Pitch: <strong>${step.pitchMm} mm</strong>
            </div>
          </div>

          <div class="step-cuts-summary" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; font-size: 0.85rem; margin-bottom: 0.65rem;">
            <div class="step-cut-action" style="font-weight: 700; color: #6b8e23;">
              ✂️ Cut <strong>${step.piecesToCut} piece${step.piecesToCut > 1 ? 's' : ''}</strong> of <strong>${targetLengthShort}</strong> (Total: <strong>${_fmtGrLenShort(step.totalCutMm)}</strong> deducted)
            </div>
            <div>
              ${step.remainderMm <= 0.1
                ? '<span class="step-offcut-badge" style="background: rgba(100, 116, 139, 0.12); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.25); font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--radius-full);">🎯 Exact Fit (0 Scrap)</span>'
                : `<span class="step-offcut-badge" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #059669; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--radius-full);">✂️ <strong>+${_fmtGrLen(step.remainderMm)}</strong> offcut remnant will be saved to inventory</span>`
              }
            </div>
          </div>

          <div class="cut-plan-visual-bar" style="display: flex; height: 28px; width: 100%; border-radius: var(--radius-full); overflow: hidden; box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.15); border: 1px solid rgba(0, 0, 0, 0.08); background: rgba(0, 0, 0, 0.05); position: relative;">
            ${segmentsHtml}
          </div>
        </div>
      `;
    }).join('');

    // Build matching individual table rows HTML
    const matchingBarsRowsHtml = plan.eligibleBars.map((bar, idx) => {
      const fullLen = _fmtGrLen(bar.lengthMm);
      const remAfterCut = bar.lengthMm - (requestedMm * pieces);
      const remAfterSingle = bar.lengthMm - requestedMm;
      const fitPriority = idx === 0 ? '🥇 #1 Best Fit' : (idx === 1 ? '🥈 #2 Eligible' : `#${idx + 1} Eligible`);

      return `
        <tr>
          <td><span class="badge" style="background: ${idx === 0 ? 'rgba(107, 142, 35, 0.15)' : 'rgba(100, 116, 139, 0.1)'}; color: ${idx === 0 ? '#6b8e23' : 'var(--text-muted)'}; font-weight: 700; font-size: 0.75rem; padding: 0.25rem 0.55rem; border-radius: var(--radius-full);">${fitPriority}</span></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <span class="gr-brand-badge-tag">${bar.brand || 'FINHY'}</span>
              <span style="font-weight: 700; color: var(--text-main); font-family: var(--font-mono);">Guided Rail ${bar.modelName}</span>
            </div>
          </td>
          <td class="text-right font-mono" style="font-weight: 600;">${bar.pitchMm} mm</td>
          <td class="text-right font-mono" style="font-weight: 700;">${fullLen}</td>
          <td class="text-right font-mono">
            <span class="badge badge-pill badge-primary" style="background: #6b8e23; font-size: 0.75rem;">${bar.quantity} in stock</span>
          </td>
          <td class="text-right font-mono" style="font-size: 0.8rem;">
            ${remAfterCut >= 0 ? `
              <span style="color: #10b981; font-weight: 700;">+${_fmtGrLenShort(remAfterCut)}</span> <span style="font-size: 0.72rem; color: var(--text-muted);">(Full Order)</span>
            ` : `
              <span style="color: #6366f1; font-weight: 600;">+${_fmtGrLenShort(remAfterSingle)}</span> <span style="font-size: 0.72rem; color: var(--text-muted);">(1 pc)</span>
            `}
          </td>
          <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline btn-gr-open-cut-modal" data-open-gr-cut="${bar.id}" data-cut-len="${requestedMm}" data-pieces="${pieces}" style="font-size: 0.75rem; padding: 0.25rem 0.65rem; font-weight: 700; border-radius: var(--radius-full);">
              Cut This Bar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!-- Compact Multi-Cut Plan Header -->
      <div class="cut-plan-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; margin-bottom: 0.65rem; padding-bottom: 0.45rem; border-bottom: 1px solid var(--border-subtle);">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-main);">Cut Plan: ${pieces} pcs &times; ${targetLengthShort}</h4>
          <span class="badge" style="background: rgba(107, 142, 35, 0.15); color: #6b8e23; font-weight: 700; font-size: 0.72rem; padding: 2px 7px; border-radius: var(--radius-full);">${plan.eligibleBars.length} Matching Rails</span>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; font-size: 0.72rem; padding: 2px 7px; border-radius: var(--radius-full);">Remnant +${totalOffcutShort}</span>
          <span class="badge" style="background: ${plan.isFullyFulfilled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${plan.isFullyFulfilled ? '#10b981' : '#f59e0b'}; font-weight: 700; font-size: 0.72rem; padding: 2px 7px; border-radius: var(--radius-full);">${plan.isFullyFulfilled ? '100% In Stock' : `Shortage: ${plan.shortagePieces} pcs`}</span>
        </div>

        <div class="cut-plan-strategy-pills" role="radiogroup" aria-label="Cutting Strategy" style="display: flex; background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); padding: 2px; border-radius: var(--radius-full); gap: 3px;">
          <button type="button" class="strategy-pill ${plan.strategy === 'full_length_first' ? 'active' : ''}" id="btnGrStrategyFullLength" data-gr-strategy="full_length_first" style="font-size: 0.72rem; padding: 2px 8px;">
            ⚡ Full Length First
          </button>
          <button type="button" class="strategy-pill ${plan.strategy === 'offcuts_first' ? 'active' : ''}" id="btnGrStrategyOffcuts" data-gr-strategy="offcuts_first" style="font-size: 0.72rem; padding: 2px 8px;">
            ♻️ Offcuts First
          </button>
        </div>
      </div>

      <!-- Main Plan Card (Compact) -->
      <div class="cut-plan-card" id="grCutPlanCard" style="border-top: 2px solid #6b8e23; background: var(--bg-surface); border-radius: var(--radius-lg); border-left: 1px solid var(--border-subtle); border-right: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); padding: 0.85rem 1rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); margin-bottom: 0.75rem;">
        <!-- Step-by-Step Breakdown -->
        ${plan.steps.length > 0 ? `
        <div class="cut-plan-steps" style="display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 0.75rem;">
          ${stepsHtml}
        </div>
        ` : `
        <div style="padding: 1rem; text-align: center; background: var(--bg-surface-subtle); border-radius: var(--radius-md); margin-bottom: 0.75rem; border: 1px dashed var(--border-medium);">
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">No Matching Stock Rails Available</div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.5rem 0;">No rails of model ${model.modelName} &ge; ${_fmtGrLen(requestedMm)} in active inventory.</p>
          <button type="button" class="btn btn-sm btn-primary" id="btnGrCutPlanAddStock" style="background: linear-gradient(135deg, #6b8e23, #55731c); border-color: #55731c; border-radius: var(--radius-full); padding: 0.35rem 0.85rem; font-size: 0.8rem;">
            + Add Rail Stock (${model.modelName})
          </button>
        </div>
        `}

        <!-- Plan Footer Actions -->
        <div class="cut-plan-footer" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle);">
          <div class="cut-plan-footer-left">
            <button type="button" class="btn btn-sm btn-outline" id="btnToggleGrMatchingTable" style="display: inline-flex; align-items: center; gap: 0.45rem; border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 700;">
              📋 <span id="toggleGrMatchingTableText">${_isGrMatchingTableVisible ? 'Hide Matching Rails Table' : 'Show Matching Rails Table'}</span>
            </button>
          </div>
          <div class="cut-plan-footer-right" style="display: flex; align-items: center; gap: 0.5rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="btnGrPrintPlanSlip" style="display: inline-flex; align-items: center; gap: 0.45rem; border-radius: var(--radius-md); font-weight: 700; padding: 0.45rem 1rem;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Print Cut Slip</span>
            </button>
            <button type="button" class="btn btn-primary" id="btnExecuteGrCutPlan" onclick="if(window.openExecuteGrPlanModal)window.openExecuteGrPlanModal();" ${plan.steps.length === 0 ? 'disabled' : ''} style="display: inline-flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #6b8e23, #55731c); border-color: #55731c; border-radius: var(--radius-md); font-weight: 700; padding: 0.55rem 1.25rem; box-shadow: 0 4px 14px rgba(107, 142, 35, 0.35); cursor: pointer;">
              <span>✂️ Execute This Cutting Plan</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Collapsible Matching Rails Table -->
      <div id="grMatchingTableContainer" class="${_isGrMatchingTableVisible ? '' : 'hidden'}" style="margin-top: 1rem; animation: fadeIn 200ms ease;">
        <div style="margin-bottom: 0.5rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);">
          Storage Rails Matching Order (${plan.eligibleBars.length} Bars):
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fit Priority</th>
                <th>Model</th>
                <th class="text-right">Pitch</th>
                <th class="text-right">Available Length</th>
                <th class="text-right">In Stock</th>
                <th class="text-right">Remainder After Cut</th>
                <th class="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              ${matchingBarsRowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">No stock rails available</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── Refresh Plan View upon Strategy Toggle ──────────────────────────────────
  function _refreshGrPlanView() {
    if (!_lastValidResult) return;
    const model = _lastValidResult.model;
    const requestedMm = _lastValidResult.requestedMm;
    const pieces = _lastValidResult.pieces || 1;
    _activeGrCutPlan = _calculateGrCutPlan(_lastValidResult.modelName, requestedMm, pieces, _activeGrStrategy);

    const planArea = document.getElementById('grCutPlanWrapper');
    if (planArea) {
      planArea.innerHTML = _buildGrCutPlanHtml(_activeGrCutPlan, model, pieces, requestedMm);
    }
  }

  // ── Modal & Execution Handlers for Guided Rail Cut Plan ───────────────────────
  function openExecuteGrPlanModal() {
    console.log('[GuidedRail] openExecuteGrPlanModal invoked', { _activeGrCutPlan, _lastValidResult });
    if (!_activeGrCutPlan || !_activeGrCutPlan.steps || _activeGrCutPlan.steps.length === 0) {
      if (_lastValidResult && _lastValidResult.requestedMm) {
        _activeGrCutPlan = _calculateGrCutPlan(
          _lastValidResult.modelName,
          _lastValidResult.requestedMm,
          _lastValidResult.pieces || 1,
          _activeGrStrategy || 'full_length_first'
        );
      }
    }
    if (!_activeGrCutPlan || !_activeGrCutPlan.steps || _activeGrCutPlan.steps.length === 0) {
      _toast('No active cutting plan available to execute. Please validate a length first.', 'warning');
      return;
    }
    const modal = document.getElementById('executeGrPlanModalOverlay');
    const container = document.getElementById('executeGrPlanSummaryDetails');
    if (!modal || !container) {
      console.error('[GuidedRail] Modal element #executeGrPlanModalOverlay or #executeGrPlanSummaryDetails not found in DOM!');
      _toast('Cut plan modal not found in DOM', 'danger');
      return;
    }

    try {
      const pieceMm = Number(_activeGrCutPlan.pieceLengthMm) || 0;
      const pieceInches = (pieceMm / 25.4).toFixed(1);

      let detailsHtml = `
        <div style="background: #f0f7e6; border-radius: 12px; padding: 0.85rem 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 0.85rem; display: flex; align-items: center; gap: 1.5rem; font-size: 0.92rem;">
          <div>Pieces: ${_activeGrCutPlan.fulfilledPieces}</div>
          <div style="color: #cbd5e1; font-weight: 400;">|</div>
          <div>Length: ${pieceInches} In (${Math.round(pieceMm)} mm)</div>
        </div>
      `;

      _activeGrCutPlan.steps.forEach(step => {
        const fullLenInches = (step.barFullLengthMm / 25.4).toFixed(1);
        const cutLenInches = (step.pieceLengthMm / 25.4).toFixed(1);
        const remLenInches = (step.remainderMm / 25.4).toFixed(1);

        detailsHtml += `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.85rem 1rem; margin-bottom: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
              <div style="display: flex; align-items: center; gap: 0.65rem;">
                <span style="background: #f0f7e6; color: #6b8e23; font-weight: 700; font-size: 0.78rem; padding: 0.2rem 0.55rem; border-radius: 6px;">Step: #${step.stepNum}</span>
                <strong style="font-size: 0.95rem; color: #0f172a;">${_escapeHtml(step.modelName)} (${fullLenInches} In / ${_fmtGrLenShort(step.barFullLengthMm)})</strong>
              </div>
              ${step.remainderMm > 0.1
                ? `<span style="background: #d1fae5; color: #059669; font-weight: 700; font-size: 0.78rem; padding: 0.25rem 0.75rem; border-radius: 9999px;">+${remLenInches} In (Offcut)</span>`
                : `<span style="background: #f1f5f9; color: #64748b; font-weight: 700; font-size: 0.78rem; padding: 0.25rem 0.75rem; border-radius: 9999px;">Exact (0 Scrap)</span>`
              }
            </div>
            <div style="font-size: 0.82rem; color: #64748b; margin-left: 2px;">
              Cut: ${step.piecesToCut} piece${step.piecesToCut > 1 ? 's' : ''} (${cutLenInches} In / ${_fmtGrLenShort(step.pieceLengthMm)})
            </div>
          </div>
        `;
      });

      container.innerHTML = detailsHtml;
      const reasonInput = document.getElementById('grPlanReasonInput');
      const createdBySelect = document.getElementById('grPlanCreatedBySelect');
      const createdByInput = document.getElementById('grPlanCreatedByInput');
      const assignedBySelect = document.getElementById('grPlanAssignedBySelect');
      const assignedByInput = document.getElementById('grPlanAssignedByInput');
      if (reasonInput) reasonInput.value = '';

      // Auto-fill logged-in user name
      const sessionUser = _getCurrentSessionUser();
      const currentUserName = sessionUser.name || 'Operator';
      if (createdBySelect && createdBySelect.options) {
        let matched = false;
        for (let i = 0; i < createdBySelect.options.length; i++) {
          const optVal = createdBySelect.options[i].value || '';
          if (optVal.toLowerCase() === currentUserName.toLowerCase()) {
            createdBySelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched && currentUserName) {
          const opt = document.createElement('option');
          opt.value = currentUserName;
          opt.textContent = currentUserName;
          opt.selected = true;
          createdBySelect.appendChild(opt);
        }
      }
      if (createdByInput) createdByInput.value = currentUserName;

      if (assignedBySelect) assignedBySelect.value = '';
      if (assignedByInput) assignedByInput.value = '';

      const autoAddRemnants = document.getElementById('grPlanAutoAddRemnants');
      if (autoAddRemnants) autoAddRemnants.checked = true;
    } catch (err) {
      console.error('[GuidedRail] Error populating cut plan modal:', err);
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.zIndex = '99999';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
  }

  function closeExecuteGrPlanModal() {
    const modal = document.getElementById('executeGrPlanModalOverlay');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  }

  async function handleConfirmExecuteGrPlan(e) {
    if (e) e.preventDefault();
    if (!_activeGrCutPlan || !_activeGrCutPlan.steps || _activeGrCutPlan.steps.length === 0) return;

    const btn = document.getElementById('btnConfirmExecuteGrPlan');
    const btnText = document.getElementById('btnConfirmExecuteGrPlanText');
    const shouldSaveRemnants = document.getElementById('grPlanAutoAddRemnants')?.checked ?? true;
    const reason = document.getElementById('grPlanReasonInput')?.value?.trim() || '';
    const createdBySelect = document.getElementById('grPlanCreatedBySelect');
    const createdByInput = document.getElementById('grPlanCreatedByInput');
    const assignedBySelect = document.getElementById('grPlanAssignedBySelect');
    const assignedByInput = document.getElementById('grPlanAssignedByInput');
    const createdBy = (createdBySelect && createdBySelect.value) ? createdBySelect.value.trim() : (createdByInput?.value?.trim() || _getCurrentSessionUser().name || 'Operator');
    const assignedBy = (assignedBySelect && assignedBySelect.value) ? assignedBySelect.value.trim() : (assignedByInput?.value?.trim() || '');

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Applying Plan Cuts…';

    try {
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;

      // Atomic cut call for multi-cut plan: decrements bars (deletes depleted ones), adds remnants, logs all cuts, and syncs both to Excel
      const res = await fetch('/api/guided-rail/cut', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cutType: 'plan',
          planSteps: _activeGrCutPlan.steps,
          shouldSaveRemnants,
          reason,
          createdBy,
          assignedBy,
          scriptUrl,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to execute cut plan');
      }

      if (Array.isArray(data.stock)) {
        _railStock = data.stock;
        window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
      }

      if (Array.isArray(data.logs)) {
        data.logs.forEach(l => {
          if (typeof window.addCutLog === 'function') {
            window.addCutLog(l);
          } else {
            window.dispatchEvent(new CustomEvent('syncCutLogsToFirebase', { detail: [l] }));
          }
        });
      }

      if (typeof window.updateCutLogsBadge === 'function') {
        window.updateCutLogsBadge();
      }

      _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
      closeExecuteGrPlanModal();
      _toast(`✅ Guided Rail Cutting Plan executed successfully! ${_activeGrCutPlan.steps.length} rail(s) cut. Firebase stock updated and logged.`, 'success');

      // Re-run validation so the view immediately shows updated remaining stock!
      _onValidate();
    } catch (err) {
      console.error('[GuidedRail] Error executing cut plan', err);
      _toast('Failed to execute cut plan: ' + err.message, 'danger');
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = '⚡ Confirm & Apply Cuts to Stock';
    }
  }

  function handlePrintGrPlanSlip() {
    if (!_activeGrCutPlan || !_activeGrCutPlan.steps || _activeGrCutPlan.steps.length === 0) {
      if (_lastValidResult) {
        printGuidedRailCutSlip(_lastValidResult);
      } else {
        _toast('No valid cut plan to print', 'warning');
      }
      return;
    }
    const slipItems = _activeGrCutPlan.steps.map(step => {
      const holes = (step.pitchMm > 0) ? Math.floor(step.pieceLengthMm / step.pitchMm) : 0;
      return {
        id: 'Cut-GR-Plan-' + step.stepNum,
        timestamp: Date.now(),
        isRail: true,
        rodName: 'Guided Rail ' + step.modelName,
        modelName: step.modelName,
        pitchMm: step.pitchMm,
        cutLengthMm: step.pieceLengthMm,
        originalLengthMm: step.barFullLengthMm,
        remainderMm: step.remainderMm,
        quantity: step.piecesToCut,
        holesCount: holes,
        reason: `Step #${step.stepNum} of Multi-Cut Plan (${_activeGrCutPlan.strategy === 'full_length_first' ? 'Full Length First' : 'Offcuts First'})`,
      };
    });
    printGuidedRailCutSlip(slipItems);
  }

  function _showValidationResult(status, message, extras) {
    const box = document.getElementById('grValidationResult');
    if (!box) return;

    const statusClass = {
      valid: 'gr-valid',
      invalid: 'gr-invalid',
      warning: 'gr-warning',
      loading: 'gr-loading',
    }[status] || 'gr-warning';

    const icon = {
      valid:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      invalid: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      loading: '<svg width="22" height="22" class="gr-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>',
    }[status] || '';

    let detailsHtml = '';
    let actionBtnHtml = '';
    let schematicHtml = '';

    if (extras && status !== 'loading') {
      const model = extras.model || _selectedModel;
      const pieces = extras.pieces || 1;

      if (status === 'invalid') {
        let recValInUnit = extras.minMm;
        let recLabel = `${extras.minMm} mm`;
        if (_grLengthUnit === 'in') {
          recValInUnit = Number((extras.minMm / 25.4).toFixed(2));
          recLabel = `${recValInUnit}" (${extras.minMm} mm)`;
        } else if (_grLengthUnit === 'ft') {
          recValInUnit = Number((extras.minMm / 304.8).toFixed(2));
          recLabel = `${recValInUnit} ft (${extras.minMm} mm)`;
        }

        actionBtnHtml = `
          <div style="margin-top: 0.85rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-sm btn-gr-apply-rec" id="btnApplyRecommendedLen" data-min-unit-val="${recValInUnit}" data-min-mm="${extras.minMm}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Apply Recommended Valid Length (${recLabel})</span>
            </button>
          </div>`;
      } else if (status === 'valid') {
        const targetModel = model?.modelName;

        _lastValidResult = {
          model,
          modelName: targetModel,
          requestedMm: extras.requestedMm,
          pitchMm: extras.pitchMm,
          minMm: extras.minMm,
          holesCount: extras.holesCount || 0,
          pitchSpans: extras.pitchSpans || 0,
          endMarginMm: extras.endMarginMm || 0,
          pieces,
        };

        _activeGrCutPlan = _calculateGrCutPlan(targetModel, extras.requestedMm, pieces, _activeGrStrategy);

        actionBtnHtml = `
          <div id="grCutPlanWrapper">
            ${_buildGrCutPlanHtml(_activeGrCutPlan, model, pieces, extras.requestedMm)}
          </div>
        `;
      }

      // Validation details list removed per user request
      detailsHtml = '';

      if (extras.holesCount > 0) {
        schematicHtml = _generateRailSvg(extras.requestedMm, extras.pitchMm, extras.endMarginMm, extras.holesCount, pieces);
      }
    }

    // Hide and remove the red invalid card completely when status is invalid
    if (status === 'invalid') {
      box.className = 'gr-validation-result hidden';
      box.innerHTML = '';
      box.style.display = 'none';
      box.style.background = '';
      box.style.border = '';
      box.style.padding = '';
    } else if (status === 'valid') {
      // Remove the "Valid Cutting Length" banner and green card container per user request
      box.style.display = '';
      box.className = 'gr-validation-result';
      box.style.background = 'transparent';
      box.style.border = 'none';
      box.style.padding = '0';
      box.innerHTML = `
        ${schematicHtml}
        ${actionBtnHtml}`;
    } else {
      box.style.display = '';
      box.className = `gr-validation-result ${statusClass}`;
      box.style.background = '';
      box.style.border = '';
      box.style.padding = '';
      box.innerHTML = `
        <div class="gr-result-header">
          <div class="gr-result-icon">${icon}</div>
          <div class="gr-result-message">
            <div style="font-weight: 700; margin-bottom: 2px;">${status === 'warning' ? 'Engineering Confirmation Required' : 'Validating'}</div>
            <div>${message}</div>
          </div>
        </div>
        ${detailsHtml}
        ${schematicHtml}
        ${actionBtnHtml}`;
    }

    // ── Valid Length Suggestions (Show valid length before & after when length is invalid) ──
    const sugBox = document.getElementById('grLengthSuggestionsBox');
    if (sugBox) {
      if (status === 'invalid' && extras && extras.pitchMm > 0 && extras.requestedMm > 0) {
        const reqMm = Number(extras.requestedMm);
        const pitch = Number(extras.pitchMm);
        const kFloor = Math.floor(reqMm / pitch);
        const prevMm = kFloor * pitch;
        const kCeil = Math.ceil(reqMm / pitch);
        const nextMm = (kCeil === kFloor ? kFloor + 1 : kCeil) * pitch;

        const unitStr = _grLengthUnit || 'mm';
        const rawInputVal = document.getElementById('grRequestedLength')?.value?.trim();
        let curVal = rawInputVal || reqMm;
        let prevVal = prevMm;
        let nextVal = nextMm;

        if (_grLengthUnit === 'in') {
          prevVal = Number((prevMm / 25.4).toFixed(2));
          nextVal = Number((nextMm / 25.4).toFixed(2));
          if (!rawInputVal) curVal = Number((reqMm / 25.4).toFixed(2));
        } else if (_grLengthUnit === 'ft') {
          prevVal = Number((prevMm / 304.8).toFixed(2));
          nextVal = Number((nextMm / 304.8).toFixed(2));
          if (!rawInputVal) curVal = Number((reqMm / 304.8).toFixed(2));
        } else {
          prevVal = Math.round(prevMm);
          nextVal = Math.round(nextMm);
          if (!rawInputVal) curVal = Math.round(reqMm);
        }

        let pillsHtml = '';

        // 1. Valid length before (Green Pill Button)
        if (prevMm >= pitch) {
          pillsHtml += `
            <button type="button" class="btn-gr-sug-pill btn-gr-sug-valid btn-gr-sug-prev" data-apply-gr-len="${prevVal}" data-apply-gr-mm="${prevMm}" title="Click to apply valid length ${prevVal} ${unitStr}">
              <span class="gr-sug-pill-val">${prevVal}</span>
              <span class="gr-sug-pill-unit">${unitStr}</span>
            </button>
          `;
        }

        // 2. Current entered invalid length (Red Badge)
        pillsHtml += `
          <div class="btn-gr-sug-pill btn-gr-sug-invalid" title="Current entered length ${curVal} ${unitStr} is not valid">
            <span class="gr-sug-pill-val">${curVal}</span>
            <span class="gr-sug-pill-unit">${unitStr}</span>
          </div>
        `;

        // 3. Valid length after (Green Pill Button)
        pillsHtml += `
          <button type="button" class="btn-gr-sug-pill btn-gr-sug-valid btn-gr-sug-next" data-apply-gr-len="${nextVal}" data-apply-gr-mm="${nextMm}" title="Click to apply valid length ${nextVal} ${unitStr}">
            <span class="gr-sug-pill-val">${nextVal}</span>
            <span class="gr-sug-pill-unit">${unitStr}</span>
          </button>
        `;

        // If prev was < pitch, add extra next option
        if (prevMm < pitch) {
          const extraNextMm = nextMm + pitch;
          let extraNextVal = extraNextMm;
          if (_grLengthUnit === 'in') extraNextVal = Number((extraNextMm / 25.4).toFixed(2));
          else if (_grLengthUnit === 'ft') extraNextVal = Number((extraNextMm / 304.8).toFixed(2));
          else extraNextVal = Math.round(extraNextMm);

          pillsHtml += `
            <button type="button" class="btn-gr-sug-pill btn-gr-sug-valid btn-gr-sug-next" data-apply-gr-len="${extraNextVal}" data-apply-gr-mm="${extraNextMm}" title="Click to apply valid length ${extraNextVal} ${unitStr}">
              <span class="gr-sug-pill-val">${extraNextVal}</span>
              <span class="gr-sug-pill-unit">${unitStr}</span>
            </button>
          `;
        }

        sugBox.innerHTML = `
          <div class="gr-suggestions-card">
            <div class="gr-suggestions-title-row">
              <span class="gr-suggestions-label">Select the Valid Length</span>
            </div>
            <div class="gr-suggestions-pills-row">
              ${pillsHtml}
            </div>
          </div>
        `;
        sugBox.style.display = 'block';
      } else {
        sugBox.style.display = 'none';
        sugBox.innerHTML = '';
      }
    }
    if (typeof window !== 'undefined' && typeof window.initAllCustomDropdowns === 'function') {
      window.initAllCustomDropdowns();
    }
  }

  // ── Update Pieces & Length Summary UI ─────────────────────────────────────────
  function _updatePiecesUI() {
    const piecesInput = document.getElementById('grPiecesInput');
    const val = parseInt(piecesInput ? piecesInput.value : '1', 10) || 1;
    const len = parseFloat(document.getElementById('grRequestedLength')?.value) || 0;
    const hint = document.getElementById('grTotalPiecesHint');
    if (hint) {
      if (len > 0) {
        hint.textContent = `Total cut: ${val} pc${val !== 1 ? 's' : ''} × ${len} mm = ${(val * len).toFixed(0)} mm`;
      } else {
        hint.textContent = `Total cut: ${val} pc${val !== 1 ? 's' : ''}`;
      }
    }
    document.querySelectorAll('#grPiecesChipsTrack .btn-pcs-preset').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.pcs, 10) === val);
    });
  }

  // ── Reset form ────────────────────────────────────────────────────────────────
  function _onReset() {
    const sel = document.getElementById('grModelSelect');
    const len = document.getElementById('grRequestedLength');
    const pcs = document.getElementById('grPiecesInput');
    if (sel) sel.value = '';
    if (len) len.value = '';
    if (pcs) pcs.value = '1';
    _onModelChange();
    _updatePiecesUI();
  }

  // ── Delegated Event Listeners (Resilient across React re-renders) ─────────────
  function _bindDelegatedEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    // Delegated click on document
    document.addEventListener('click', (e) => {
      // 0a. Quick Brand Chip Selection (Validator)
      const grBrandChip = e.target.closest('#grQuickBrandChips [data-gr-brand]');
      if (grBrandChip) {
        e.preventDefault();
        const brand = grBrandChip.dataset.grBrand || 'ALL';
        _selectedBrand = brand;
        _grBrandFilter = brand === 'ALL' ? 'all' : brand;
        const brandSel = document.getElementById('grBrandSelect');
        if (brandSel) brandSel.value = brand;
        document.querySelectorAll('#grQuickBrandChips [data-gr-brand]').forEach(b => {
          b.classList.toggle('active', b === grBrandChip);
        });
        document.querySelectorAll('#railBrandPillsGroup .cat-pill-btn').forEach(b => {
          b.classList.toggle('active', (b.dataset.railBrand || '').toUpperCase() === brand.toUpperCase());
        });
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
        if (_selectedModel) {
          _onValidate();
        }
        return;
      }

      // 0. Guided Rail KPI Filter Card Click
      const grKpi = e.target.closest('[data-gr-kpi-filter]');
      if (grKpi) {
        e.preventDefault();
        const filter = grKpi.dataset.grKpiFilter || 'all';
        _grKpiFilter = (_grKpiFilter === filter && filter !== 'all') ? 'all' : filter;
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
        const tableCard = document.getElementById('grStockTableCard');
        if (tableCard) {
          tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      // 1. Open Add Rail Stock Modal
      if (
        e.target.closest('#btnOpenAddRailModal') ||
        e.target.closest('#btnOpenAddRailFromSection') ||
        e.target.closest('#btnOpenAddRailFromTable') ||
        e.target.closest('#btnStockEmptyAdd')
      ) {
        e.preventDefault();
        const activeModel = document.getElementById('grModelSelect')?.value;
        openAddRailStockModal(activeModel);
        return;
      }

      // 1b. Direct submit for Save Rail Stock button
      if (e.target.closest('#btnSaveGrStock')) {
        e.preventDefault();
        const form = document.getElementById('grStockForm');
        if (form) {
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else handleSaveRailStock(e);
        }
        return;
      }

      // 2. Close Add Rail Stock Modal
      if (e.target.closest('#btnCloseGrStockModal') || e.target.closest('#btnCancelGrStockModal') || e.target.closest('#btnGrStockHeaderBack')) {
        e.preventDefault();
        closeRailStockModal();
        return;
      }

      // 2b. Close Cut Guided Rail Modal
      if (e.target.closest('#btnCloseGrCutModal') || e.target.closest('#btnCancelGrCutModal')) {
        e.preventDefault();
        closeGrCutModal();
        return;
      }
      if (e.target && e.target.id === 'grCutModalOverlay') {
        closeGrCutModal();
        return;
      }

      // 2c. Stepper buttons in Cut Modal
      if (e.target.closest('#btnGrCutPiecesDec')) {
        e.preventDefault();
        const pInput = document.getElementById('grCutPiecesCountInput');
        if (pInput) {
          pInput.value = Math.max(1, (parseInt(pInput.value, 10) || 1) - 1);
          _recalcGrCutModal();
        }
        return;
      }
      if (e.target.closest('#btnGrCutPiecesInc')) {
        e.preventDefault();
        const pInput = document.getElementById('grCutPiecesCountInput');
        if (pInput) {
          pInput.value = (parseInt(pInput.value, 10) || 1) + 1;
          _recalcGrCutModal();
        }
        return;
      }

      // 2d. Cut rail button from Search Validator form action group
      if (e.target.closest('#btnGrCutAction')) {
        e.preventDefault();
        _onCutActionClick(e);
        return;
      }

      // 2e. Open Cut Modal from matching bar list
      const openCutBtn = e.target.closest('.btn-gr-open-cut-modal');
      if (openCutBtn) {
        e.preventDefault();
        const stockId = openCutBtn.dataset.openGrCut || openCutBtn.dataset.stockId;
        const cutLen = parseFloat(openCutBtn.dataset.cutLen) || 0;
        const pcs = parseInt(openCutBtn.dataset.pieces, 10) || 1;
        openGrCutModal(stockId, cutLen, pcs);
        return;
      }

      // 2f. Guided Rail Multi-Cut Strategy selector pill
      const stratBtn = e.target.closest('[data-gr-strategy]');
      if (stratBtn) {
        e.preventDefault();
        _activeGrStrategy = stratBtn.dataset.grStrategy || 'full_length_first';
        _refreshGrPlanView();
        return;
      }

      // 2g. Toggle matching rails table visibility
      if (e.target.closest('#btnToggleGrMatchingTable')) {
        e.preventDefault();
        _isGrMatchingTableVisible = !_isGrMatchingTableVisible;
        const container = document.getElementById('grMatchingTableContainer');
        const txt = document.getElementById('toggleGrMatchingTableText');
        if (container) container.classList.toggle('hidden', !_isGrMatchingTableVisible);
        if (txt) txt.textContent = _isGrMatchingTableVisible ? 'Hide Matching Rails Table' : 'Show Matching Rails Table';
        return;
      }

      // 2h. Print cut slip for active Guided Rail multi-cut plan
      if (e.target.closest('#btnGrPrintPlanSlip')) {
        e.preventDefault();
        handlePrintGrPlanSlip();
        return;
      }

      // 2i. Open Execute Guided Rail Multi-Cut Plan Modal
      if (e.target.closest('#btnExecuteGrCutPlan')) {
        e.preventDefault();
        openExecuteGrPlanModal();
        return;
      }

      // 2i-2. Direct Click on Confirm Execute Plan button inside modal
      if (e.target.closest('#btnConfirmExecuteGrPlan')) {
        e.preventDefault();
        const planForm = document.getElementById('executeGrPlanForm');
        if (planForm && typeof planForm.requestSubmit === 'function') {
          planForm.requestSubmit();
        } else {
          handleConfirmExecuteGrPlan(e);
        }
        return;
      }

      // 2j. Close Execute Guided Rail Plan Modal
      if (e.target.closest('#btnCloseExecuteGrPlanModal') || e.target.closest('#btnCancelExecuteGrPlanModal')) {
        e.preventDefault();
        closeExecuteGrPlanModal();
        return;
      }
      if (e.target && e.target.id === 'executeGrPlanModalOverlay') {
        closeExecuteGrPlanModal();
        return;
      }

      // 2k. Add stock shortcut from empty plan
      if (e.target.closest('#btnGrCutPlanAddStock')) {
        e.preventDefault();
        const activeModel = _lastValidResult?.modelName || document.getElementById('grModelSelect')?.value;
        openAddRailStockModal(activeModel);
        return;
      }

      // 3. Edit Rail Stock Item
      const editBtn = e.target.closest('[data-edit-stock-id]');
      if (editBtn) {
        e.preventDefault();
        openEditRailStockModal(editBtn.dataset.editStockId);
        return;
      }

      // 4. Delete Rail Stock Item
      const delBtn = e.target.closest('[data-delete-stock-id]');
      if (delBtn) {
        e.preventDefault();
        deleteRailStock(delBtn.dataset.deleteStockId);
        return;
      }

      // 5. Quick Stock Qty Adjust (- / +)
      const qtyBtn = e.target.closest('[data-stock-qty-delta]');
      if (qtyBtn) {
        e.preventDefault();
        const id = qtyBtn.dataset.stockId;
        const delta = parseInt(qtyBtn.dataset.stockQtyDelta, 10) || 0;
        if (id && delta) quickAdjustStockQty(id, delta);
        return;
      }

      // 6. Cut / Load into validator or open cut modal from stock table
      const cutStockBtn = e.target.closest('[data-cut-stock-id]');
      if (cutStockBtn) {
        e.preventDefault();
        const stockId = cutStockBtn.dataset.cutStockId;
        const model = cutStockBtn.dataset.model;
        selectGrModel(model);

        const currentReqMm = _getRequestedLengthMm();
        const pieces = parseInt(document.getElementById('grPiecesInput')?.value, 10) || 1;

        if (currentReqMm && currentReqMm > 0) {
          openGrCutModal(stockId, currentReqMm, pieces);
        } else {
          const reqInput = document.getElementById('grRequestedLength');
          const matched = _railModels.find(m => m.modelName === model);
          const defaultCutMm = matched ? matched.pitchMm * 2 : 120;
          if (reqInput) {
            reqInput.value = defaultCutMm;
            _updatePiecesUI();
          }
          openGrCutModal(stockId, defaultCutMm, pieces);
        }
        return;
      }

      // 7. Toggle Available Models Drawer
      const toggleBtn = e.target.closest('#btnToggleGrAvailableModels');
      if (toggleBtn) {
        e.preventDefault();
        const drawer = document.getElementById('grAvailableModelsDrawer');
        if (drawer) {
          const isHidden = drawer.classList.contains('hidden');
          drawer.classList.toggle('hidden');
          toggleBtn.textContent = isHidden ? '✕ Hide Available Models' : '📋 View Available Models';
        }
        return;
      }

      // 8. Quick model preset chip
      const chipBtn = e.target.closest('#grQuickChipsTrack .btn-dia-preset');
      if (chipBtn) {
        e.preventDefault();
        const modelName = chipBtn.dataset.modelId || chipBtn.dataset.modelName || chipBtn.textContent.trim();
        selectGrModel(modelName);
        return;
      }

      // 9. Drawer table row or select button click
      const selectBtn = e.target.closest('[data-select-model]');
      if (selectBtn) {
        e.preventDefault();
        selectGrModel(selectBtn.dataset.selectModel);
        return;
      }
      const tableRow = e.target.closest('#grSpecTableBody tr');
      if (tableRow && tableRow.dataset.modelName) {
        selectGrModel(tableRow.dataset.modelName);
        return;
      }

      // 10. Stepper decrease (Cut validator pieces)
      if (e.target.closest('#btnGrPiecesDec')) {
        e.preventDefault();
        const el = document.getElementById('grPiecesInput');
        if (el) {
          const cur = parseInt(el.value, 10) || 1;
          if (cur > 1) {
            el.value = cur - 1;
            _updatePiecesUI();
          }
        }
        return;
      }

      // 11. Stepper increase (Cut validator pieces)
      if (e.target.closest('#btnGrPiecesInc')) {
        e.preventDefault();
        const el = document.getElementById('grPiecesInput');
        if (el) {
          const cur = parseInt(el.value, 10) || 1;
          el.value = cur + 1;
          _updatePiecesUI();
        }
        return;
      }

      // 12. Modal Stepper decrease (Stock qty)
      if (e.target.closest('#btnGrStockQtyDec')) {
        e.preventDefault();
        const el = document.getElementById('formGrQuantity');
        if (el) {
          const cur = parseInt(el.value, 10) || 0;
          if (cur > 0) el.value = cur - 1;
        }
        return;
      }

      // 13. Modal Stepper increase (Stock qty)
      if (e.target.closest('#btnGrStockQtyInc')) {
        e.preventDefault();
        const el = document.getElementById('formGrQuantity');
        if (el) {
          const cur = parseInt(el.value, 10) || 0;
          el.value = cur + 1;
        }
        return;
      }

      // 14. Stock modal quick length chips
      const stockLenChip = e.target.closest('#grStockQuickLengthChips .btn-len-preset');
      if (stockLenChip) {
        e.preventDefault();
        const el = document.getElementById('formGrLengthMm');
        if (el && stockLenChip.dataset.stockLen) {
          el.value = stockLenChip.dataset.stockLen;
          _onStockModelChange();
        }
        return;
      }

      // 15. Pieces preset chip (validator)
      const pcsChip = e.target.closest('#grPiecesChipsTrack .btn-pcs-preset');
      if (pcsChip) {
        e.preventDefault();
        const el = document.getElementById('grPiecesInput');
        if (el && pcsChip.dataset.pcs) {
          el.value = pcsChip.dataset.pcs;
          _updatePiecesUI();
        }
        return;
      }

      // 16. Length preset chip (validator)
      const lenChip = e.target.closest('#grQuickLengthChips .btn-len-preset');
      if (lenChip) {
        e.preventDefault();
        const el = document.getElementById('grRequestedLength');
        if (el && lenChip.dataset.grlen) {
          el.value = lenChip.dataset.grlen;
          _updatePiecesUI();
        }
        return;
      }

      // Unit selector pills for cutting length (mm, in, ft)
      if (e.target.closest('#grUnitPillMm')) {
        e.preventDefault();
        setGrLengthUnit('mm');
        return;
      }
      if (e.target.closest('#grUnitPillIn')) {
        e.preventDefault();
        setGrLengthUnit('in');
        return;
      }
      if (e.target.closest('#grUnitPillFt')) {
        e.preventDefault();
        setGrLengthUnit('ft');
        return;
      }

      // 17. Reset button
      if (e.target.closest('#grResetBtn')) {
        e.preventDefault();
        _onReset();
        return;
      }

      // 17b. Select / Apply Suggested Valid Length Pill (before/after)
      const sugPillBtn = e.target.closest('[data-apply-gr-len]');
      if (sugPillBtn) {
        e.preventDefault();
        const targetVal = sugPillBtn.dataset.applyGrLen;
        const targetMm = parseFloat(sugPillBtn.dataset.applyGrMm);
        const input = document.getElementById('grRequestedLength');
        if (input && targetVal) {
          input.value = targetVal;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          _updatePiecesUI();
          sugPillBtn.disabled = true;
          sugPillBtn.style.opacity = '0.7';
          _onValidate(new Event('submit')).finally(() => {
            _toast(`✓ Selected valid length: ${targetVal} ${_grLengthUnit.toUpperCase()}`, 'success');
          });
        }
        return;
      }

      // 18. Apply recommended length button
      const applyBtn = e.target.closest('#btnApplyRecommendedLen');
      if (applyBtn) {
        e.preventDefault();
        const unitVal = applyBtn.dataset.minUnitVal || applyBtn.dataset.minMm;
        const exactMm = parseFloat(applyBtn.dataset.minMm);
        const input = document.getElementById('grRequestedLength');
        if (input && unitVal) {
          input.value = unitVal;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          _updatePiecesUI();
          applyBtn.disabled = true;
          applyBtn.innerHTML = '<span>Applying…</span>';
          _onValidate(new Event('submit')).finally(() => {
            _toast(`✓ Applied recommended valid length: ${unitVal} ${_grLengthUnit.toUpperCase()} (${exactMm} mm)`, 'success');
          });
        }
        return;
      }

      // 18b. Print Guided Rail Cut Slip (from search action buttons, validation card, or cut modal)
      if (e.target.closest('#btnGrPrintActionSlip, #btnGrPrintValidSlip, #btnGrPrintCutModalSlip, .btn-gr-print-slip')) {
        e.preventDefault();
        printGuidedRailCutSlip();
        return;
      }

      // 19. Export Guided Rail CSV
      if (e.target.closest('#btnGrExportCsv')) {
        e.preventDefault();
        exportGuidedRailCsv();
        return;
      }

      // 20. Open Cut Logs Modal from Guided Rail header
      if (e.target.closest('#btnGrOpenCutLogsModal')) {
        e.preventDefault();
        if (typeof window.openCutLogsModal === 'function') {
          window.openCutLogsModal();
        } else {
          document.getElementById('cutLogsModalOverlay')?.classList.remove('hidden');
        }
        return;
      }
    });

    // Delegated change on document
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'grBrandSelect') {
        const brand = e.target.value || 'ALL';
        _selectedBrand = brand;
        _grBrandFilter = brand === 'ALL' ? 'all' : brand;
        document.querySelectorAll('#grQuickBrandChips [data-gr-brand]').forEach(b => {
          b.classList.toggle('active', (b.dataset.grBrand || '').toUpperCase() === brand.toUpperCase());
        });
        document.querySelectorAll('#railBrandPillsGroup .cat-pill-btn').forEach(b => {
          b.classList.toggle('active', (b.dataset.railBrand || '').toUpperCase() === brand.toUpperCase());
        });
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
        if (_selectedModel) {
          _onValidate();
        }
      } else if (e.target && e.target.id === 'grModelSelect') {
        _onModelChange();
      } else if (e.target && e.target.id === 'grLengthUnitSelect') {
        setGrLengthUnit(e.target.value);
      } else if (e.target && e.target.id === 'formGrModelSelect') {
        _onStockModelChange();
      } else if (e.target && e.target.id === 'grCsvFileInput') {
        handleGuidedRailCsvImport(e);
      }
    });

    // Delegated input on document
    document.addEventListener('input', (e) => {
      if (e.target && (e.target.id === 'grRequestedLength' || e.target.id === 'grPiecesInput')) {
        _updatePiecesUI();
      } else if (e.target && e.target.id === 'grStockSearchInput') {
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
      } else if (e.target && e.target.id === 'formGrLengthMm') {
        _onStockModelChange();
      } else if (e.target && (e.target.id === 'grCutPieceLengthInput' || e.target.id === 'grCutPiecesCountInput')) {
        _recalcGrCutModal();
      }
    });

    // Delegated submit on document
    document.addEventListener('submit', (e) => {
      if (e.target && e.target.id === 'grValidateForm') {
        _onValidate(e);
      } else if (e.target && e.target.id === 'grStockForm') {
        handleSaveRailStock(e);
      } else if (e.target && e.target.id === 'grCutForm') {
        handleConfirmGrCut(e);
      } else if (e.target && e.target.id === 'executeGrPlanForm') {
        handleConfirmExecuteGrPlan(e);
      }
    });

    // Listen to system mode toggle
    window.addEventListener('rodsyncSystemModeChanged', (e) => {
      if (e.detail && e.detail.mode === 'guided-rail') {
        _updateGrKpis();
        _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
      }
    });
  }

  // ── Toast Notification Helper ────────────────────────────────────────────────
  function _toast(message, type = 'info') {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    const container = document.getElementById('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-message">${message}</span><button class="toast-close" aria-label="Close">&times;</button>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
    toast.querySelector('.toast-close')?.addEventListener('click', () => toast.remove());
  }

  // ── CSV Export Functionality ──────────────────────────────────────────────────
  function exportGuidedRailCsv() {
    if (!_railStock || _railStock.length === 0) {
      _toast('Guided Rail inventory is empty. Nothing to export.', 'warning');
      return;
    }

    const headers = ['Rail catagorie', 'Model Name', 'Pitch / PCC (mm)', 'Length (mm)', 'Quantity'];
    const rows = _railStock.map(item => {
      const brand = item.category || item.brand || '';
      const pitch = item.pitchMm || 60;
      return [
        _escapeCsv(brand),
        _escapeCsv(item.modelName || ''),
        pitch,
        item.lengthMm,
        item.quantity !== undefined && item.quantity !== null ? item.quantity : 0
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Guided_Rail_Inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    _toast(`Exported ${_railStock.length} guided rail stock records to CSV successfully`, 'success');
  }

  function _escapeCsv(str) {
    const stringVal = String(str);
    if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }
    return stringVal;
  }

  // ── CSV Import Functionality ──────────────────────────────────────────────────
  async function handleGuidedRailCsvImport(e) {
    if (window.rodsyncIsAdmin === false) {
      _toast('Permission denied: Only administrators can import rail inventory.', 'warning');
      if (e.target) e.target.value = '';
      return;
    }
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    async function processRailText(text) {
      try {
        const items = parseGuidedRailCsv(text);
        if (items.length === 0) {
          _toast('No valid guided rail records found in file. Please check format against the template.', 'warning');
          return;
        }

        const res = await fetch('/api/guided-rail/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        const data = await res.json();
        if (data.success) {
          await _loadRailStock(true);
          const detail = [];
          if (data.count > 0) detail.push(`${data.count} new rail bar(s)`);
          if (data.mergedCount > 0) detail.push(`${data.mergedCount} existing rail bar(s) updated`);
          _toast(`Successfully imported & organized: ${detail.join(', ') || (items.length + ' rail items')}!`, 'success');
        } else {
          _toast(data.message || 'Error saving imported rail stock', 'danger');
        }
      } catch (err) {
        _toast('Error importing file: ' + err.message, 'danger');
      } finally {
        if (e.target) e.target.value = '';
      }
    }

    const fileName = (file.name || '').toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel && window.XLSX) {
      const reader = new FileReader();
      reader.onload = async function (evt) {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = window.XLSX.utils.sheet_to_csv(worksheet);
          await processRailText(csvText);
        } catch (err) {
          _toast('Error reading Excel spreadsheet: ' + err.message, 'danger');
          if (e.target) e.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = async function (evt) {
        await processRailText(evt.target.result);
      };
      reader.onerror = function (err) {
        _toast('Error reading file: ' + err.message, 'danger');
        if (e.target) e.target.value = '';
      };
      reader.readAsText(file);
    }
  }

  function parseGuidedRailCsv(csvText) {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Find header row (skipping banner/title rows like "Rail")
    let headerRowIndex = -1;
    let catIdx = -1, modelIdx = -1, diaIdx = -1, lengthIdx = -1, qtyIdx = -1, pitchIdx = -1, notesIdx = -1, skuIdx = -1;
    let isLengthInches = false;

    for (let r = 0; r < Math.min(5, lines.length); r++) {
      const headerParts = _parseCsvRow(lines[r]).map(h => (h || '').trim().toLowerCase());
      let cI = -1, mI = -1, dI = -1, lI = -1, qI = -1, pI = -1, nI = -1, sI = -1;
      let lInches = false;

      headerParts.forEach((col, idx) => {
        const lower = col.toLowerCase().trim();
        const clean = lower.replace(/[^a-z0-9]/g, '');
        if (clean.includes('pcc') || clean.includes('pitch') || clean.includes('hole')) {
          pI = idx;
        } else if (clean.includes('piece') || clean.includes('pcs') || clean.includes('qty') || clean.includes('quant') || clean.includes('count')) {
          qI = idx;
        } else if (clean.includes('dia') || clean.includes('diameter') || clean.includes('width') || clean.includes('thickness')) {
          dI = idx;
        } else if (clean.includes('model') || clean.includes('railname') || clean.includes('name') || clean.includes('profile') || clean.includes('spec') || clean.includes('series')) {
          mI = idx;
        } else if (clean.includes('len') || clean.includes('length')) {
          lI = idx;
          if (lower.includes('(in)') || lower.includes('inch') || clean.endsWith('in')) {
            lInches = true;
          }
        } else if (clean.includes('subcat') || clean.includes('sub') || clean.includes('cat') || clean.includes('brand') || clean.includes('rail') || clean.includes('make')) {
          cI = idx;
        } else if (clean.includes('note') || clean.includes('rack') || clean.includes('loc') || clean.includes('storage') || clean.includes('remark')) {
          nI = idx;
        } else if (clean.includes('sku') || clean.includes('code')) {
          sI = idx;
        }
      });

      if ((mI !== -1 || dI !== -1) && (lI !== -1 || qI !== -1 || pI !== -1)) {
        headerRowIndex = r;
        catIdx = cI; modelIdx = mI; diaIdx = dI; lengthIdx = lI; qtyIdx = qI; pitchIdx = pI; notesIdx = nI; skuIdx = sI;
        isLengthInches = lInches;
        break;
      }
    }

    // Fallback if header keywords not found
    if (headerRowIndex === -1) {
      headerRowIndex = lines[0].includes(',') || lines[0].includes('\t') || lines[0].includes(';') ? 0 : 1;
      catIdx = 0; modelIdx = 1; lengthIdx = 2; qtyIdx = 3; pitchIdx = 4;
    } else {
      if (catIdx === -1 && modelIdx !== 0 && diaIdx !== 0) catIdx = 0;
      if (qtyIdx === -1) {
        const rowCols = _parseCsvRow(lines[headerRowIndex]);
        if (rowCols.length >= 4 && lengthIdx !== 3 && modelIdx !== 3 && catIdx !== 3) qtyIdx = 3;
      }
    }

    const items = [];
    const newBrandsFound = new Set();

    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const parts = _parseCsvRow(lines[i]);
      if (parts.length < 2) continue;

      const rawCat = (catIdx >= 0 && parts[catIdx] ? parts[catIdx].trim() : '').toUpperCase();
      let rawModel = (modelIdx >= 0 && parts[modelIdx] ? parts[modelIdx] : '').trim().toUpperCase().replace(/\s+/g, '');
      const rawDia = (diaIdx >= 0 && parts[diaIdx] ? parts[diaIdx] : '').trim().replace(/[^0-9.]/g, '');
      const parsedDia = parseFloat(rawDia);

      // Smart Model Name resolution
      if (!rawModel && !isNaN(parsedDia) && parsedDia > 0) {
        rawModel = 'HGR' + Math.round(parsedDia);
      } else if (rawModel && !isNaN(parsedDia) && parsedDia > 0 && !/\d/.test(rawModel)) {
        rawModel = rawModel + Math.round(parsedDia);
      } else if (/^\d+$/.test(rawModel)) {
        rawModel = 'HGR' + rawModel;
      } else if (!rawModel && diaIdx === -1 && modelIdx !== -1) {
        continue;
      }

      const rawPitch = pitchIdx >= 0 ? parseFloat(parts[pitchIdx]) : NaN;
      let rawLength = lengthIdx >= 0 ? parseFloat(parts[lengthIdx]) : NaN;
      const qty = qtyIdx >= 0 ? parseInt(parts[qtyIdx], 10) : 1;
      const notes = notesIdx >= 0 && parts[notesIdx] ? parts[notesIdx].trim() : '';
      const sku = skuIdx >= 0 && parts[skuIdx] ? parts[skuIdx].trim() : '';

      if (!rawModel || isNaN(rawLength) || rawLength <= 0) continue;

      if (isLengthInches) {
        if (rawLength <= 250) {
          rawLength = Math.round(rawLength * 25.4);
        } else {
          rawLength = Math.round(rawLength);
        }
      }

      const matched = _railModels.find(m => m.modelName.toUpperCase() === rawModel);
      const pitchMm = !isNaN(rawPitch) && rawPitch > 0 ? rawPitch : (matched ? matched.pitchMm : 60);
      let railWidthMm = matched ? matched.railWidthMm : (!isNaN(parsedDia) && parsedDia > 0 ? parsedDia : 0);
      let railHeightMm = matched ? matched.railHeightMm : 0;
      if (railWidthMm === 0) {
        const numMatch = rawModel.match(/\d+/);
        if (numMatch) {
          railWidthMm = parseInt(numMatch[0], 10);
          railHeightMm = Math.round(railWidthMm * 0.85);
        }
      }

      const finalBrand = rawCat || 'HIWIN';
      newBrandsFound.add(finalBrand);

      items.push({
        brand: finalBrand,
        category: finalBrand,
        modelName: rawModel,
        lengthMm: rawLength,
        quantity: isNaN(qty) || qty <= 0 ? 1 : qty,
        pitchMm,
        railWidthMm,
        railHeightMm,
        notes,
        sku: sku || `RAIL-${rawModel}-${Math.round(rawLength)}MM`
      });
    }

    // Auto-register any new brands in local memory
    if (newBrandsFound.size > 0 && typeof window !== 'undefined') {
      const currentBrands = Array.isArray(window.__RAIL_SUBCATEGORIES__) && window.__RAIL_SUBCATEGORIES__.length > 0
        ? [...window.__RAIL_SUBCATEGORIES__]
        : ['HIWIN', 'PMI', 'THK'];
      let changed = false;
      newBrandsFound.forEach(b => {
        if (!currentBrands.some(c => c.toUpperCase() === b)) {
          currentBrands.push(b);
          changed = true;
        }
      });
      if (changed) {
        window.__RAIL_SUBCATEGORIES__ = currentBrands;
        if (window.updateRailBrandsDropdown) window.updateRailBrandsDropdown(currentBrands);
      }
    }

    return items;
  }

  function _parseCsvRow(rowText) {
    if (rowText.includes('\t')) {
      return rowText.split('\t').map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    }
    const delimiter = (rowText.includes(';') && !rowText.includes(',')) ? ';' : ',';
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < rowText.length; i++) {
      const char = rowText[i];
      if (char === '"' && (i === 0 || rowText[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    return result;
  }


  // ── Print Precision Cut Slip for Guided Rail (Totally Identical Format to Chrome Rod Slip) ──
  function printGuidedRailCutSlip(input) {
    let items = [];

    // 1. Try parsing array or object input
    if (Array.isArray(input)) {
      items = input.filter(Boolean);
    } else if (input && typeof input === 'object') {
      items = [input];
    } else {
      // 2. Check if Cut modal is currently open and has an active item
      const cutModal = document.getElementById('grCutModalOverlay');
      const isCutModalOpen = cutModal && !cutModal.classList.contains('hidden');
      if (isCutModalOpen && _activeCutStockItem) {
        const cutInput = document.getElementById('grCutPieceLengthInput');
        const piecesInput = document.getElementById('grCutPiecesCountInput');
        const notesInput = document.getElementById('grCutOrderNotes');
        const cutMm = parseFloat(cutInput ? cutInput.value : '0') || 0;
        const pcs = parseInt(piecesInput ? piecesInput.value : '1', 10) || 1;
        const bar = _activeCutStockItem;
        const totalMm = cutMm * pcs;
        const remMm = Math.max(0, bar.lengthMm - totalMm);
        const holes = bar.pitchMm > 0 ? Math.floor(cutMm / bar.pitchMm) : 0;

        items = [{
          id: 'Cut-GR-' + Date.now().toString().slice(-6),
          timestamp: Date.now(),
          isRail: true,
          rodName: 'Guided Rail ' + bar.modelName,
          modelName: bar.modelName,
          pitchMm: bar.pitchMm,
          cutLengthMm: cutMm,
          originalLengthMm: bar.lengthMm,
          remainderMm: remMm,
          quantity: pcs,
          holesCount: holes,
          reason: (notesInput && notesInput.value.trim()) ? notesInput.value.trim() : ('Cut from ' + bar.modelName + ' ' + bar.lengthMm + ' mm stock bar'),
        }];
      } else if (_lastValidResult && _lastValidResult.requestedMm > 0) {
        // 3. Use _lastValidResult
        const r = _lastValidResult;
        const m = r.model || _selectedModel || {};
        items = [{
          id: 'Cut-GR-' + Date.now().toString().slice(-6),
          timestamp: Date.now(),
          isRail: true,
          rodName: 'Guided Rail ' + r.modelName,
          modelName: r.modelName,
          pitchMm: r.pitchMm || m.pitchMm || 0,
          cutLengthMm: r.requestedMm,
          originalLengthMm: (r.matchingBars && r.matchingBars[0]) ? r.matchingBars[0].lengthMm : 0,
          remainderMm: (r.matchingBars && r.matchingBars[0]) ? Math.max(0, r.matchingBars[0].lengthMm - (r.requestedMm * (r.pieces || 1))) : 0,
          quantity: r.pieces || 1,
          holesCount: r.holesCount || 0,
          reason: 'Cut for ' + r.modelName,
        }];
      } else {
        // 4. Try from the validator inputs
        if (!_selectedModel) {
          _toast('Please select a Guided Rail model first', 'warning');
          return;
        }
        const requestedMm = _getRequestedLengthMm();
        if (!requestedMm || requestedMm <= 0) {
          _toast('Please enter a required cutting length first', 'warning');
          return;
        }
        const piecesInput = document.getElementById('grPiecesInput');
        const pieces = parseInt(piecesInput ? piecesInput.value : '1', 10) || 1;
        const p = _selectedModel.pitchMm || 60;
        const holes = p > 0 ? Math.floor(requestedMm / p) : 0;

        items = [{
          id: 'Cut-GR-' + Date.now().toString().slice(-6),
          timestamp: Date.now(),
          isRail: true,
          rodName: 'Guided Rail ' + _selectedModel.modelName,
          modelName: _selectedModel.modelName,
          pitchMm: p,
          cutLengthMm: requestedMm,
          quantity: pieces,
          holesCount: holes,
          reason: 'Cut for ' + _selectedModel.modelName,
        }];
      }
    }

    if (!items || items.length === 0) {
      _toast('No cut details available to generate slip', 'warning');
      return;
    }

    const isMulti = items.length > 1;
    let cleanRef = '';
    if (!isMulti) {
      const it = items[0];
      cleanRef = String(it.id || ('Cut-GR-' + Date.now().toString().slice(-6)))
        .replace(/^gr-cut-/i, 'Cut-GR-')
        .replace(/^cut[-_]?/i, 'Cut-');
      if (!cleanRef.startsWith('Cut-GR-')) cleanRef = 'Cut-GR-' + cleanRef.replace(/^Cut-?/, '');
    } else {
      const firstPart = String(items[0].id || Date.now()).replace(/\D/g, '').slice(-4) || 'GR';
      cleanRef = 'CutBatch-GR-' + firstPart + '-' + items.length + 'Items';
    }

    // Default assignees
    const sessionUser = (typeof window !== 'undefined' && typeof window.getRodsyncCurrentSessionUser === 'function')
      ? window.getRodsyncCurrentSessionUser()
      : (function() {
          let email = '';
          try {
            if (typeof window !== 'undefined' && window.rodsyncCurrentUserEmail) email = window.rodsyncCurrentUserEmail;
            if (!email && typeof localStorage !== 'undefined') email = localStorage.getItem('rodsync_user_email') || '';
            if (!email && typeof document !== 'undefined') {
              const match = document.cookie.match(/(?:^|;\s*)rodsync_user=([^;]+)/);
              if (match && match[1]) email = decodeURIComponent(match[1]);
            }
          } catch {}
          const clean = String(email || '').toLowerCase().trim();
          if (clean.includes('roshni') || clean.includes('roshini')) return { email: clean, name: 'Roshini', isLocked: true };
          if (clean.includes('suman')) return { email: clean, name: 'Suman', isLocked: true };
          if (clean.includes('bhawna')) return { email: clean, name: 'Bhawna', isLocked: true };
          if (clean) {
            const prefix = clean.split('@')[0].replace(/[._\d]/g, ' ').trim();
            const formatted = prefix ? (prefix.charAt(0).toUpperCase() + prefix.slice(1)) : 'User';
            return { email: clean, name: formatted, isLocked: true };
          }
          return { email: '', name: '', isLocked: false };
        })();

    let defaultAssignBy = '';
    let defaultAssignTo = '';
    for (const it of items) {
      if (!defaultAssignBy && it.assignBy) defaultAssignBy = it.assignBy;
      if (!defaultAssignTo && it.assignTo) defaultAssignTo = it.assignTo;
    }

    let isAssignByLocked = false;
    if (sessionUser && sessionUser.name) {
      defaultAssignBy = sessionUser.name;
      isAssignByLocked = Boolean(sessionUser.isLocked);
    }

    // Totals
    let totalPieces = 0;
    items.forEach(it => {
      totalPieces += (parseInt(it.quantity, 10) || 1);
    });

    // Date & Time formatted exactly like Chrome Rod: Oct 10, 2026, 12:04 PM
    const latestTs = Math.max(...items.map(it => it.timestamp || 0)) || Date.now();
    const dateObj = new Date(latestTs);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ', ' + dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Content for Single Item vs Multiple Items (No schematic, No end margins)
    let slipContentHtml = '';
    if (!isMulti) {
      const it = items[0];
      const model = it.modelName || (String(it.rodName || '').replace(/guided rail/i, '').trim()) || 'HGR Rail';
      const pitch = Number(it.pitchMm || it.diameterMm || 0);
      const cutMm = Number(it.cutLengthMm || (it.cutLengthIn ? it.cutLengthIn * 25.4 : 0));
      const cutIn = (cutMm / 25.4).toFixed(2);
      const cutFt = (cutMm / 304.8).toFixed(2);
      const qty = parseInt(it.quantity, 10) || 1;
      const qtyFormatted = qty + ' pc' + (qty > 1 ? 's' : '');
      const origMm = Number(it.originalLengthMm || (it.originalLengthIn ? it.originalLengthIn * 25.4 : 0));
      const origIn = (origMm / 25.4).toFixed(1);
      const origFt = (origMm / 304.8).toFixed(2);
      const remMm = Number(it.remainderMm || (it.remainderIn ? it.remainderIn * 25.4 : 0));
      const remIn = (remMm / 25.4).toFixed(1);
      const holes = it.holesCount || (pitch > 0 ? Math.floor(cutMm / pitch) : 0);

      let cutLenFormatted = cutMm + ' mm (' + cutIn + ' in)';
      if (_grLengthUnit === 'in') {
        cutLenFormatted = cutIn + ' in (' + cutMm + ' mm)';
      } else if (_grLengthUnit === 'ft') {
        cutLenFormatted = cutFt + ' ft (' + cutMm + ' mm)';
      }

      slipContentHtml = `
        <div class="slip-rod-title">${_escapeHtml(it.rodName || ('Guided Rail ' + model))}</div>
        ${origMm > 0 ? `
        <div class="slip-rod-source-length">Source Rail Length: ${origMm} mm (${origIn} in / ${origFt} ft)</div>
        ` : ''}

        <div class="slip-data-row">
          <span class="slip-data-label">Assign By :</span>
          <span class="slip-data-value" id="displayAssignBy">${_escapeHtml(defaultAssignBy || '—')}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">Assign To :</span>
          <span class="slip-data-value" id="displayAssignTo">${_escapeHtml(defaultAssignTo || '—')}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">Rail Model :</span>
          <span class="slip-data-value">${_escapeHtml(model)}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">PCC :</span>
          <span class="slip-data-value">${pitch} mm (${(pitch / 25.4).toFixed(2)} in)</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">Cut Piece Length :</span>
          <span class="slip-data-value">${_escapeHtml(cutLenFormatted)}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">QTY :</span>
          <span class="slip-data-value">${_escapeHtml(qtyFormatted)}</span>
        </div>

        ${qty > 1 ? `
        <div class="slip-data-row">
          <span class="slip-data-label">Total Cut Length :</span>
          <span class="slip-data-value">${(cutMm * qty).toFixed(0)} mm (${((cutMm * qty) / 25.4).toFixed(1)} in)</span>
        </div>
        ` : ''}

        ${holes > 0 ? `
        <div class="slip-data-row">
          <span class="slip-data-label">Mounting Holes :</span>
          <span class="slip-data-value">${holes} holes per rail ${qty > 1 ? `(${holes * qty} total)` : ''}</span>
        </div>
        ` : ''}

        ${remMm > 0 ? `
        <div class="slip-data-row">
          <span class="slip-data-label">Offcut Remnant :</span>
          <span class="slip-data-value">+${remMm} mm (${remIn} in) ${it.remnantAdded ? '(In Stock)' : ''}</span>
        </div>
        ` : ''}

        ${it.reason ? `
        <div class="slip-data-row">
          <span class="slip-data-label">Job Ref :</span>
          <span class="slip-data-value">${_escapeHtml(it.reason)}</span>
        </div>
        ` : ''}
      `;
    } else {
      slipContentHtml = `
        <div class="slip-data-row" style="margin-bottom: 4px;">
          <span class="slip-data-label">Assign By :</span>
          <span class="slip-data-value" id="displayAssignBy">${_escapeHtml(defaultAssignBy || '—')}</span>
        </div>

        <div class="slip-data-row" style="margin-bottom: 8px;">
          <span class="slip-data-label">Assign To :</span>
          <span class="slip-data-value" id="displayAssignTo">${_escapeHtml(defaultAssignTo || '—')}</span>
        </div>

        <table class="slip-items-table">
          <thead>
            <tr>
              <th style="width: 14px; text-align: left;">#</th>
              <th style="text-align: left;">Rail</th>
              <th style="text-align: center; width: 44px;">Pitch</th>
              <th style="text-align: right; min-width: 44px; white-space: nowrap;">Cut</th>
              <th style="text-align: right; width: 30px;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it, idx) => {
              const model = it.modelName || (String(it.rodName || '').replace(/guided rail/i, '').trim()) || 'HGR';
              const pitch = Number(it.pitchMm || it.diameterMm || 0);
              const cutMm = Number(it.cutLengthMm || (it.cutLengthIn ? it.cutLengthIn * 25.4 : 0));
              const qty = parseInt(it.quantity, 10) || 1;
              const origMm = Number(it.originalLengthMm || (it.originalLengthIn ? it.originalLengthIn * 25.4 : 0));
              const remMm = Number(it.remainderMm || (it.remainderIn ? it.remainderIn * 25.4 : 0));
              return `
              <tr>
                <td style="font-weight: 700; vertical-align: top; padding: 4px 2px;">${idx + 1}.</td>
                <td style="padding: 4px 2px;">
                  <div style="font-weight: 800; font-size: 0.72rem; line-height: 1.2;">${_escapeHtml(it.rodName || ('Guided Rail ' + model))}</div>
                  ${origMm > 0 ? `<div style="font-size: 0.63rem; font-weight: normal; color: #334155; margin-top: 1px;">Source: ${origMm} mm (${(origMm / 25.4).toFixed(1)} in)</div>` : ''}
                  ${remMm > 0 ? `<div style="font-size: 0.61rem; font-weight: normal; color: #475569; margin-top: 1px;">Offcut: +${remMm} mm</div>` : ''}
                </td>
                <td style="text-align: center; font-weight: 800; font-size: 0.72rem; vertical-align: top; padding: 4px 2px; white-space: nowrap;">${pitch} mm</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.72rem; vertical-align: top; padding: 4px 2px; white-space: nowrap;">${cutMm} mm</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.72rem; vertical-align: top; padding: 4px 2px;">${qty}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 800; padding: 5px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 6px 0 8px 0;">
          <span>TOTAL: ${items.length} Cut Items</span>
          <span>${totalPieces} Total Pieces</span>
        </div>
      `;
    }

    const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BroCutPro Slip — [${cleanRef}]</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100vh;
      padding: 16px 14px 28px;
      -webkit-font-smoothing: antialiased;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* ---- TOP CONTROLS (PREVIEW BOX) ---- */
    .preview-card {
      width: 100%;
      max-width: 310px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .preview-left {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .preview-icon {
      font-size: 1.15rem;
      line-height: 1;
    }
    .preview-title-col {
      display: flex;
      flex-direction: column;
      line-height: 1.08;
    }
    .preview-title-col span {
      font-size: 0.8rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
    }
    .preview-badge {
      background: #e0f2fe;
      color: #0284c7;
      font-size: 0.6rem;
      font-weight: 800;
      letter-spacing: 0.6px;
      padding: 2px 5px;
      border-radius: 4px;
      margin-left: 2px;
    }
    .preview-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-print-slip {
      background: #1d4ed8;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 5px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      box-shadow: 0 2px 6px rgba(29, 78, 216, 0.28);
      transition: background 0.15s, transform 0.1s;
    }
    .btn-print-slip:hover {
      background: #1e40af;
    }
    .btn-print-slip:active {
      transform: scale(0.97);
    }
    .btn-print-slip-text {
      text-align: left;
      line-height: 1.12;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .btn-close-slip {
      background: #f1f5f9;
      color: #64748b;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 700;
      transition: background 0.15s;
    }
    .btn-close-slip:hover {
      background: #e2e8f0;
      color: #334155;
    }
    .preview-hint {
      font-size: 0.67rem;
      color: #64748b;
      margin-top: 8px;
      margin-bottom: 7px;
      line-height: 1.3;
    }
    .preview-field {
      margin-bottom: 6px;
    }
    .preview-field:last-child {
      margin-bottom: 2px;
    }
    .preview-label {
      display: block;
      font-size: 0.68rem;
      font-weight: 600;
      color: #475569;
      margin-bottom: 3px;
    }
    .preview-input {
      width: 100%;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      padding: 5px 9px;
      font-size: 0.78rem;
      font-family: inherit;
      color: #0f172a;
      font-weight: 500;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .preview-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
    }

    /* ---- THE SLIP RECEIPT (FIT FOR 80MM THERMAL PRINTER ROLL) ---- */
    .slip-container {
      width: 100%;
      max-width: 275px; /* Exactly fits the 72mm active printable area on 80mm thermal paper */
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
      padding: 12px 10px 14px;
      color: #000000;
      box-sizing: border-box;
    }
    .slip-company-name {
      text-align: center;
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.2px;
      color: #000000;
      text-transform: uppercase;
      line-height: 1.25;
    }
    .slip-disclaimer {
      text-align: center;
      font-size: 0.58rem;
      color: #334155;
      line-height: 1.3;
      margin-top: 3px;
      padding: 0 2px;
    }
    .slip-divider {
      border: none;
      border-top: 1px dashed #000000;
      margin: 8px 0;
    }
    .slip-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 7px;
    }
    .slip-ref-no {
      font-size: 0.68rem;
      font-weight: 400;
      color: #000000;
    }
    .slip-brand-logo {
      font-size: 0.74rem;
      font-weight: 900;
      letter-spacing: 0.4px;
      color: #000000;
    }
    .slip-rod-title {
      font-size: 0.8rem;
      font-weight: 900;
      color: #000000;
      margin-bottom: 2px;
      line-height: 1.25;
    }
    .slip-rod-source-length {
      font-size: 0.7rem;
      font-weight: normal;
      color: #334155;
      margin-bottom: 7px;
      line-height: 1.3;
    }
    .slip-data-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 0.71rem;
    }
    .slip-data-label {
      font-weight: 700;
      color: #000000;
      white-space: nowrap;
    }
    .slip-data-value {
      font-weight: 700;
      color: #000000;
      text-align: right;
      word-break: break-word;
      padding-left: 8px;
    }
    .slip-items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 0.7rem;
    }
    .slip-items-table th {
      font-weight: 800;
      border-bottom: 1.5px solid #000000;
      padding: 4px 2px;
      color: #000000;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .slip-items-table td {
      border-bottom: 1px dotted #94a3b8;
    }
    .slip-items-table tr:last-child td {
      border-bottom: none;
    }
    .slip-signs-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 13px;
      margin-bottom: 10px;
      font-size: 0.7rem;
      font-weight: 700;
      color: #000000;
    }
    .slip-date-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      font-size: 0.68rem;
      margin-bottom: 10px;
    }
    .slip-date-label {
      font-weight: 700;
      color: #000000;
    }
    .slip-date-value {
      font-weight: 500;
      color: #000000;
      text-align: right;
    }
    .slip-barcode-area {
      text-align: center;
      margin-top: 3px;
    }
    .slip-barcode-title {
      font-size: 0.62rem;
      color: #334155;
      font-weight: 600;
      margin-bottom: 3px;
    }
    .slip-barcode-svg {
      display: block;
      margin: 0 auto;
      max-width: 130px;
      height: 25px;
    }

    /* ---- PRINT MEDIA (80mm Continuous Thermal Receipt Roll) ---- */
    @media print {
      @page {
        size: 80mm auto;
        margin: 0mm !important;
      }
      html, body {
        width: 80mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        min-height: unset !important;
        display: block !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .preview-card {
        display: none !important;
      }
      .slip-container {
        width: 72mm !important;
        max-width: 72mm !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        padding: 3mm 1mm 4mm !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .slip-divider {
        border-top: 1px dashed #000000 !important;
      }
      .slip-items-table th {
        border-bottom: 1.5px solid #000000 !important;
        color: #000000 !important;
      }
      .slip-items-table td {
        border-bottom: 1px dotted #000000 !important;
        color: #000000 !important;
      }
      * {
        color: #000000 !important;
      }
    }
  </style>
</head>
<body>
  <!-- PREVIEW / CONTROLS CARD -->
  <div class="preview-card">
    <div class="preview-header">
      <div class="preview-left">
        <span class="preview-icon">✂️</span>
        <div class="preview-title-col">
          <span>${isMulti ? ('Cut Slip (' + items.length + ' Items)') : 'Cut Slip'}</span>
          <span>${isMulti ? (totalPieces + ' Total Pcs') : 'Preview'}</span>
        </div>
        <span class="preview-badge">${isMulti ? 'MULTI-ITEM' : 'PREVIEW'}</span>
      </div>
      <div class="preview-right">
        <button class="btn-print-slip" onclick="window.print()" title="Print Slip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          <div class="btn-print-slip-text">
            <div>Print</div>
            <div>Slip</div>
          </div>
        </button>
      </div>
    </div>
  </div>

  <!-- THE RECEIPT SLIP -->
  <div class="slip-container">
    <div class="slip-company-name">FINE BEARINGS &amp; OIL SEAL STORE</div>
    <div class="slip-disclaimer">Note: This is not an official invoice. It is a computer-generated slip for store use only.</div>

    <hr class="slip-divider" />

    <div class="slip-meta-row">
      <span class="slip-ref-no">Ref: ${_escapeHtml(cleanRef)}</span>
      <span class="slip-brand-logo">BROCUTPRO</span>
    </div>

    ${slipContentHtml}

    <div class="slip-signs-row">
      <span>Sign : ________</span>
      <span>Sign : ________</span>
    </div>

    <div class="slip-date-row">
      <span class="slip-date-label">Date &amp; Time :</span>
      <span class="slip-date-value">${_escapeHtml(dateStr)}</span>
    </div>

    <div class="slip-barcode-area">
      <div class="slip-barcode-title">Barcode</div>
      <svg class="slip-barcode-svg" viewBox="0 0 132 26" preserveAspectRatio="none">
        <rect x="2" y="0" width="3" height="26" fill="#000" />
        <rect x="7" y="0" width="1.5" height="26" fill="#000" />
        <rect x="10" y="0" width="1.5" height="26" fill="#000" />
        <rect x="13" y="0" width="3" height="26" fill="#000" />
        <rect x="18" y="0" width="4.5" height="26" fill="#000" />
        <rect x="24" y="0" width="1.5" height="26" fill="#000" />
        <rect x="27" y="0" width="3" height="26" fill="#000" />
        <rect x="32" y="0" width="1.5" height="26" fill="#000" />
        <rect x="35" y="0" width="4.5" height="26" fill="#000" />
        <rect x="42" y="0" width="1.5" height="26" fill="#000" />
        <rect x="45" y="0" width="3" height="26" fill="#000" />
        <rect x="50" y="0" width="1.5" height="26" fill="#000" />
        <rect x="53" y="0" width="4.5" height="26" fill="#000" />
        <rect x="60" y="0" width="1.5" height="26" fill="#000" />
        <rect x="63" y="0" width="3" height="26" fill="#000" />
        <rect x="68" y="0" width="4.5" height="26" fill="#000" />
        <rect x="74" y="0" width="1.5" height="26" fill="#000" />
        <rect x="78" y="0" width="3" height="26" fill="#000" />
        <rect x="83" y="0" width="1.5" height="26" fill="#000" />
        <rect x="86" y="0" width="4.5" height="26" fill="#000" />
        <rect x="93" y="0" width="3" height="26" fill="#000" />
        <rect x="98" y="0" width="1.5" height="26" fill="#000" />
        <rect x="101" y="0" width="4.5" height="26" fill="#000" />
        <rect x="107" y="0" width="1.5" height="26" fill="#000" />
        <rect x="111" y="0" width="3" height="26" fill="#000" />
        <rect x="116" y="0" width="1.5" height="26" fill="#000" />
        <rect x="119" y="0" width="4.5" height="26" fill="#000" />
        <rect x="126" y="0" width="3" height="26" fill="#000" />
      </svg>
    </div>
  </div>

  <script>
    (function() {
      const inBy = document.getElementById('inputAssignBy');
      const inTo = document.getElementById('inputAssignTo');
      const dispBy = document.getElementById('displayAssignBy');
      const dispTo = document.getElementById('displayAssignTo');

      function sync() {
        const byVal = ${isAssignByLocked ? JSON.stringify(defaultAssignBy) : "(inBy ? inBy.value.trim() : '')"};
        const toVal = inTo ? inTo.value.trim() : '';
        if (dispBy) dispBy.textContent = byVal || '—';
        if (dispTo) dispTo.textContent = toVal || '—';
      }

      if (inBy) inBy.addEventListener('input', sync);
      if (inTo) inTo.addEventListener('input', sync);

      window.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
          e.preventDefault();
          window.print();
        }
      });
    })();
  </script>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=380,height=740,toolbar=0,menubar=0,scrollbars=1');
    if (!printWin) {
      _toast('Popup was blocked by your browser. Please allow popups to print cut slips.', 'warning');
      return;
    }
    printWin.document.open();
    printWin.document.write(popupHtml);
    printWin.document.close();
  }


  // ── Expose public functions on window ─────────────────────────────────────────
  window.updateRailBrandsDropdown = function(brands) {
    if (Array.isArray(brands)) {
      window.__RAIL_SUBCATEGORIES__ = brands;
    }
    _populateBrandDropdownAndChips();
    if (typeof window.initAllCustomDropdowns === 'function') {
      window.initAllCustomDropdowns();
    }
  };

  window.setRailBrandFilter = function(brand) {
    _grBrandFilter = brand || 'all';
    _selectedBrand = brand === 'all' ? 'ALL' : brand;
    const sel = document.getElementById('grBrandSelect');
    if (sel) sel.value = _selectedBrand;
    document.querySelectorAll('#grQuickBrandChips [data-gr-brand]').forEach(b => {
      b.classList.toggle('active', (b.dataset.grBrand || '').toUpperCase() === _selectedBrand.toUpperCase());
    });
    document.querySelectorAll('#railBrandPillsGroup .cat-pill-btn').forEach(b => {
      b.classList.toggle('active', (b.dataset.railBrand || '').toUpperCase() === (_grBrandFilter || 'all').toUpperCase());
    });
    _updateModelsFromDatabase();
    _renderStockTable();
    _populateBrandDropdownAndChips();
    if (_selectedModel) {
      _onValidate();
    }
  };
  window.setRailCategoryFilter = window.setRailBrandFilter;
  window.initGuidedRail = initGuidedRail;
  window._grLoadAndRender = initGuidedRail;
  window.updateGrKpis = _updateGrKpis;
  window.selectGrModel = selectGrModel;
  window.onGrModelChange = _onModelChange;
  window.onGrValidate = _onValidate;
  window.updateGrPiecesUI = _updatePiecesUI;
  window.setGrLengthUnit = setGrLengthUnit;
  window.onGrReset = _onReset;
  window.openAddRailStockModal = openAddRailStockModal;
  window.openEditRailStockModal = openEditRailStockModal;
  window.closeRailStockModal = closeRailStockModal;
  window.openGrCutModal = openGrCutModal;
  window.closeGrCutModal = closeGrCutModal;
  window.openExecuteGrPlanModal = openExecuteGrPlanModal;
  window.closeExecuteGrPlanModal = closeExecuteGrPlanModal;
  window.handleConfirmExecuteGrPlan = handleConfirmExecuteGrPlan;
  window.exportGuidedRailCsv = exportGuidedRailCsv;
  window.handleGuidedRailCsvImport = handleGuidedRailCsvImport;
  window.printGuidedRailCutSlip = printGuidedRailCutSlip;
  window.getGuidedRailStock = function() {
    return _railStock || [];
  };
  window.setGuidedRailStock = function(stock) {
    if (Array.isArray(stock)) {
      _railStock = stock.filter(s => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);
      _updateModelsFromDatabase();
      _renderStockTable();
      _populateBrandDropdownAndChips();
    }
  };
  window.loadRailStock = _loadRailStock;
  window._loadRailStock = _loadRailStock;
  window.refreshRailStockData = window.setGuidedRailStock;

  // Auto-init on script evaluation
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initGuidedRail);
    } else {
      setTimeout(initGuidedRail, 10);
    }
  }

})();
