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
  let _railModels = [...DEFAULT_MODELS];  // Available rail models from database
  let _railStock = [];                   // Storage inventory of guided rails
  let _selectedModel = null;              // currently selected GuidedRailModel
  let _grLengthUnit = 'mm';               // active length unit: 'mm' | 'in' | 'ft'
  let _eventsBound = false;
  let _lastValidResult = null;            // cached last valid layout for cut slip printing

  // ── Boot ─────────────────────────────────────────────────────────────────────
  function initGuidedRail() {
    _bindDelegatedEvents();
    _populateModelDropdown();
    _renderStockTable();
    _renderQuickLengthChips();
    _updatePiecesUI();
    if (typeof window.updateCutLogsBadge === 'function') {
      window.updateCutLogsBadge();
    }

    _loadModels().then(() => {
      _populateModelDropdown();
    });

    _loadRailStock();
  }

  // ── API Calls: Rail Models ───────────────────────────────────────────────────
  async function _loadModels() {
    try {
      const res = await fetch('/api/guided-rail');
      const data = await res.json();
      if (data.success && Array.isArray(data.models) && data.models.length > 0) {
        _railModels = data.models.filter(m => m.active);
      }
    } catch (e) {
      console.warn('[GuidedRail] Using standard default models', e);
    }
    return _railModels;
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
  async function _loadRailStock() {
    try {
      const res = await fetch('/api/guided-rail/stock');
      const data = await res.json();
      if (data.success && Array.isArray(data.stock)) {
        _railStock = data.stock;
      }
    } catch (e) {
      console.warn('[GuidedRail] Error loading rail stock', e);
    }
    _renderStockTable();
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('syncRailStockToBackend', { detail: _railStock }));
      }
    } catch (_) {}
    return _railStock;
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

    _railModels.forEach(m => {
      // 1. Cut validator dropdown option
      const opt = document.createElement('option');
      opt.value = m.modelName;
      opt.textContent = m.modelName;
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
        mOpt.textContent = m.modelName;
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
        btn.textContent = m.modelName;
        btn.title = m.modelName;
        track.appendChild(btn);
      }
    });

    if (currentVal) {
      sel.value = currentVal;
    }
    _onModelChange();
  }

  // ── Render Drawer Spec Table ──────────────────────────────────────────────────
  function _renderSpecTable() {
    const tbody = document.getElementById('grSpecTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    _railModels.forEach(m => {
      const tr = document.createElement('tr');
      tr.dataset.modelName = m.modelName;
      tr.style.cursor = 'pointer';
      tr.title = `Click to select ${m.modelName}`;
      tr.innerHTML = `
        <td><strong class="font-mono" style="color: #7c3aed;">${m.modelName}</strong></td>
        <td class="text-center font-mono">${m.minCuttingLengthMm || m.pitchMm} mm</td>
        <td class="text-center">
          <button type="button" class="btn btn-xs btn-primary" data-select-model="${m.modelName}" style="padding: 0.2rem 0.6rem; border-radius: 9999px;">Select</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Render Guided Rail Stock Inventory Table ──────────────────────────────────
  function _renderStockTable() {
    const tbody = document.getElementById('grStockTableBody');
    const badge = document.getElementById('grTotalStockBarsBadge');
    if (!tbody) return;

    const q = (document.getElementById('grStockSearchInput')?.value || '').toLowerCase().trim();
    const filtered = _railStock.filter(item => {
      if (!q) return true;
      return (
        item.modelName.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        String(item.lengthMm).includes(q)
      );
    });

    const totalBars = _railStock.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    if (badge) badge.textContent = `${totalBars} bar${totalBars !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📦</div>
            <div style="font-weight: 600; margin-bottom: 0.25rem;">No guided rail stock found</div>
            <p style="font-size: 0.8rem; margin: 0 0 1rem;">No storage stock matches your search filter. Add a stock bar to get started.</p>
            <button type="button" class="btn btn-sm btn-primary" id="btnStockEmptyAdd" style="background: linear-gradient(135deg, #7c3aed, #6d28d9); border-color: #6d28d9; border-radius: 9999px;">
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
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="gr-spec-badge-tag">${item.modelName}</span>
              ${item.sku ? `<span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${item.sku}</span>` : ''}
            </div>
          </td>
          <td class="text-right font-mono" style="font-weight: 700; color: #7c3aed;">${item.lengthMm} mm</td>
          <td class="text-right">
            <div style="display: inline-flex; align-items: center; gap: 0.35rem; justify-content: flex-end;">
              <button type="button" class="btn btn-xs btn-outline" data-stock-qty-delta="-1" data-stock-id="${item.id}" style="padding: 0 6px; height: 22px; font-weight: 700;" title="Decrease quantity">-</button>
              <span class="font-mono" style="font-weight: 700; min-width: 24px; text-align: center;">${item.quantity}</span>
              <button type="button" class="btn btn-xs btn-outline" data-stock-qty-delta="1" data-stock-id="${item.id}" style="padding: 0 6px; height: 22px; font-weight: 700;" title="Increase quantity">+</button>
            </div>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-secondary);">${item.notes || '—'}</td>
          <td class="text-center">
            <div style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <button type="button" class="btn btn-xs btn-primary" data-cut-stock-id="${item.id}" data-model="${item.modelName}" data-length="${item.lengthMm}" title="Load this model into Cut Validator" style="background: #7c3aed; border-color: #7c3aed; font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 9999px;">
                ✂️ Cut
              </button>
              <button type="button" class="btn btn-xs btn-outline" data-edit-stock-id="${item.id}" title="Edit stock" style="font-size: 0.72rem; padding: 0.2rem 0.45rem; border-radius: 9999px;">
                ✏️
              </button>
              <button type="button" class="btn btn-xs btn-outline" data-delete-stock-id="${item.id}" title="Delete stock" style="font-size: 0.72rem; padding: 0.2rem 0.45rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3); border-radius: 9999px;">
                🗑️
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Stock Modal Management ───────────────────────────────────────────────────
  function openAddRailStockModal(prefillModel) {
    try { _populateModelDropdown(); } catch (_) {}
    const modal = document.getElementById('grStockModalOverlay');
    const form = document.getElementById('grStockForm');
    const title = document.getElementById('grModalTitle');
    const btnText = document.getElementById('btnSaveGrStockText');
    const editId = document.getElementById('grStockEditId');
    const modelSel = document.getElementById('formGrModelSelect');
    const lenInput = document.getElementById('formGrLengthMm');
    const qtyInput = document.getElementById('formGrQuantity');
    const notesInput = document.getElementById('formGrNotes');

    if (!modal) return;
    if (form) form.reset();
    if (editId) editId.value = '';
    if (title) title.textContent = 'Add Guided Rail Stock';
    if (btnText) btnText.textContent = 'Save Rail to Stock';

    if (prefillModel && modelSel) {
      modelSel.value = prefillModel;
    }
    if (qtyInput) qtyInput.value = '1';
    _onStockModelChange();

    modal.classList.remove('hidden');
    setTimeout(() => { (modelSel || lenInput)?.focus(); }, 50);
  }

  function openEditRailStockModal(id) {
    const item = _railStock.find(s => s.id === id);
    if (!item) return;

    const modal = document.getElementById('grStockModalOverlay');
    const title = document.getElementById('grModalTitle');
    const btnText = document.getElementById('btnSaveGrStockText');
    const editId = document.getElementById('grStockEditId');
    const modelSel = document.getElementById('formGrModelSelect');
    const lenInput = document.getElementById('formGrLengthMm');
    const qtyInput = document.getElementById('formGrQuantity');
    const notesInput = document.getElementById('formGrNotes');

    if (!modal) return;
    if (editId) editId.value = item.id;
    if (title) title.textContent = `Edit Stock — ${item.modelName}`;
    if (btnText) btnText.textContent = 'Update Rail Stock';

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
      alert('Please select a Guided Rail model.');
      return;
    }
    if (isNaN(len) || len <= 0) {
      alert('Please enter a valid stock length in millimeters.');
      return;
    }
    if (isNaN(qty) || qty < 0) {
      alert('Please enter a valid positive quantity.');
      return;
    }

    const matchedModel = _railModels.find(m => m.modelName === modelName);
    const railWidthMm = matchedModel ? matchedModel.railWidthMm : (parseFloat(opt?.dataset.width) || 0);
    const railHeightMm = matchedModel ? matchedModel.railHeightMm : (parseFloat(opt?.dataset.height) || 0);
    const pitchMm = matchedModel ? matchedModel.pitchMm : (parseFloat(opt?.dataset.pitch) || 60);

    const payload = {
      modelName,
      railWidthMm,
      railHeightMm,
      pitchMm,
      lengthMm: len,
      quantity: qty,
      notes: notes || '',
      ...(editId ? { id: editId } : {}),
    };

    const method = editId ? 'PUT' : 'POST';
    try {
      const res = await fetch('/api/guided-rail/stock', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        closeRailStockModal();
        await _loadRailStock();
      } else {
        alert(data.message || 'Error saving rail stock');
      }
    } catch {
      alert('Network error while saving guided rail stock.');
    }
  }

  async function deleteRailStock(id) {
    if (!confirm('Are you sure you want to remove this guided rail stock item from storage?')) return;
    try {
      const res = await fetch(`/api/guided-rail/stock?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await _loadRailStock();
      } else {
        alert(data.message || 'Error deleting rail stock');
      }
    } catch {
      alert('Network error while deleting rail stock.');
    }
  }

  async function quickAdjustStockQty(id, delta) {
    const item = _railStock.find(s => s.id === id);
    if (!item) return;
    const newQty = Math.max(0, (Number(item.quantity) || 0) + delta);
    try {
      const res = await fetch('/api/guided-rail/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantity: newQty }),
      });
      const data = await res.json();
      if (data.success) {
        item.quantity = newQty;
        _renderStockTable();
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
      // 1. Deduct 1 whole bar from source stock
      const newSourceQty = Math.max(0, Number(bar.quantity) - 1);
      const deductRes = await fetch('/api/guided-rail/stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bar.id, quantity: newSourceQty }),
      });
      const deductData = await deductRes.json();
      if (!deductData.success) {
        throw new Error(deductData.message || 'Failed to update stock quantity');
      }

      // 2. If save remnant is checked and remnant > 0, insert remnant offcut bar
      const shouldSaveRemnant = saveRemnantCb?.checked && remnantMm > 0;
      if (shouldSaveRemnant) {
        const offcutRes = await fetch('/api/guided-rail/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelName: bar.modelName,
            railWidthMm: bar.railWidthMm,
            railHeightMm: bar.railHeightMm,
            pitchMm: bar.pitchMm,
            lengthMm: remnantMm,
            quantity: 1,
            notes: `Offcut from ${bar.lengthMm}mm (${orderNotes || 'Cut order'})`,
            sku: `RAIL-${bar.modelName}-${Math.round(remnantMm)}MM-OFFCUT`,
          }),
        });
        await offcutRes.json();
      }

      // 3. Save into unified Cut Logs with rich Guided Rail properties
      const holesPerRail = (bar.pitchMm > 0) ? Math.floor(cutMm / bar.pitchMm) : 0;
      const endMargin = (bar.pitchMm > 0) ? Number(((cutMm - Math.max(0, holesPerRail - 1) * bar.pitchMm) / 2).toFixed(1)) : 0;

      const logEntry = {
        id: 'gr-cut-' + Date.now(),
        timestamp: Date.now(),
        isRail: true,
        rodName: `Guided Rail ${bar.modelName}`,
        modelName: bar.modelName,
        pitchMm: bar.pitchMm,
        diameterMm: bar.pitchMm,
        cutLengthMm: cutMm,
        originalLengthMm: bar.lengthMm,
        remainderMm: Math.max(0, remnantMm),
        originalLengthIn: Number((bar.lengthMm / 25.4).toFixed(2)),
        originalLengthFt: Number((bar.lengthMm / 304.8).toFixed(2)),
        cutLengthIn: Number((cutMm / 25.4).toFixed(2)),
        cutLengthFt: Number((cutMm / 304.8).toFixed(2)),
        holesCount: holesPerRail,
        endMarginMm: endMargin,
        quantity: pcs,
        remainderIn: Number((Math.max(0, remnantMm) / 25.4).toFixed(2)),
        reason: orderNotes ? `Order: ${orderNotes}` : `Guided Rail precision cut (${pcs} pc${pcs > 1 ? 's' : ''} of ${cutMm} mm)`,
        remnantAdded: shouldSaveRemnant,
      };

      if (typeof window.addCutLog === 'function') {
        window.addCutLog(logEntry);
      } else {
        try {
          const logs = JSON.parse(localStorage.getItem('rod_stock_cut_logs_v1') || '[]');
          logs.unshift(logEntry);
          localStorage.setItem('rod_stock_cut_logs_v1', JSON.stringify(logs));
        } catch {}
      }

      if (typeof window.updateCutLogsBadge === 'function') {
        window.updateCutLogsBadge();
      }

      // 4. Reload stock & refresh UI
      await _loadRailStock();
      closeGrCutModal();

      const remMsg = shouldSaveRemnant ? ` Remnant ${remnantMm} mm (${(remnantMm / 25.4).toFixed(2)}") saved to stock.` : '';
      _toast(`✂️ Cut recorded successfully! ${pcs} pc${pcs > 1 ? 's' : ''} of ${bar.modelName} cut.${remMsg}`, 'success');

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

    if (hint) {
      hint.textContent = `Selected Model: ${modelName}`;
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

    // Display visible specification badge pill with stock availability
    if (specCard && _selectedModel) {
      specCard.classList.remove('hidden');
      if (badgeName) badgeName.textContent = _selectedModel.modelName;

      // Calculate available stock for this model
      const inStockBars = _railStock
        .filter(s => s.modelName === _selectedModel.modelName)
        .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

      const stockNote = inStockBars > 0 
        ? ` • <strong style="color: #10b981;">In Stock: ${inStockBars} bars</strong>` 
        : ` • <span style="color: var(--text-muted);">0 stock in storage</span>`;

      if (badgeDetails) {
        badgeDetails.innerHTML = `Min Cut: ${_selectedModel.minCuttingLengthMm || _selectedModel.pitchMm} mm${stockNote}`;
      }
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
        const matchingBars = _railStock.filter(s => s.modelName === targetModel && s.lengthMm >= extras.requestedMm && s.quantity > 0);

        _lastValidResult = {
          model,
          modelName: targetModel,
          requestedMm: extras.requestedMm,
          pitchMm: extras.pitchMm,
          minMm: extras.minMm,
          holesCount: extras.holesCount || 0,
          endMarginMm: extras.endMarginMm || 0,
          pieces,
          matchingBars,
        };

        const totalReqMm = extras.requestedMm * pieces;

        actionBtnHtml = `
          <div class="gr-valid-actions-section" style="margin-top: 1.15rem; border-top: 1px dashed var(--border-medium); padding-top: 1rem; display: flex; flex-direction: column; gap: 0.85rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.65rem;">
              <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-primary btn-gr-print-slip" id="btnGrPrintValidSlip" title="Print 80mm thermal cut slip for this valid rail cut" style="display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700; padding: 0.55rem 1.25rem; border-radius: var(--radius-md); background: linear-gradient(135deg, #7c3aed, #6d28d9); border: 1px solid #6d28d9; color: #ffffff; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35); cursor: pointer; transition: all 0.16s ease;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                  <span>Print Cut Slip</span>
                </button>

                ${matchingBars.length > 0 ? `
                <button type="button" class="btn btn-secondary btn-gr-open-cut-modal" data-open-gr-cut="${matchingBars[0].id}" data-cut-len="${extras.requestedMm}" data-pieces="${pieces}" style="display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 700; padding: 0.55rem 1.15rem; border-radius: var(--radius-md); cursor: pointer;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="6" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                    <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                    <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                  </svg>
                  <span>Cut Rail from Stock (${matchingBars.length} available)</span>
                </button>
                ` : `
                <span class="badge" style="background: rgba(100, 116, 139, 0.12); color: var(--text-muted); padding: 0.45rem 0.85rem; border-radius: var(--radius-md); font-size: 0.8rem; font-weight: 600;">
                  0 ${model?.modelName || ''} matching bars in storage
                </span>
                `}
              </div>
            </div>

            ${matchingBars.length > 0 ? `
            <div class="gr-matching-bars-list" style="margin-top: 0.25rem; display: flex; flex-direction: column; gap: 0.45rem;">
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;">Storage Bars Ready for Cutting:</div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.5rem;">
                ${matchingBars.slice(0, 4).map(bar => {
                  const rem = bar.lengthMm - totalReqMm;
                  const remIn = (rem / 25.4).toFixed(1);
                  return `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); font-size: 0.82rem;">
                      <div>
                        <span style="font-weight: 700; color: var(--text-main); font-family: monospace;">${bar.lengthMm} mm</span>
                        <span style="color: var(--text-muted); font-size: 0.75rem;"> (${(bar.lengthMm / 25.4).toFixed(1)}")</span>
                        <div style="font-size: 0.72rem; color: ${rem >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
                          Remnant: +${rem.toFixed(0)} mm (${remIn}")
                        </div>
                      </div>
                      <button type="button" class="btn btn-sm btn-outline btn-gr-open-cut-modal" data-open-gr-cut="${bar.id}" data-cut-len="${extras.requestedMm}" data-pieces="${pieces}" style="font-size: 0.75rem; padding: 0.25rem 0.65rem; font-weight: 700;">
                        Cut This Bar
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            ` : ''}
          </div>
        `;
      }

      detailsHtml = `
        <div class="gr-validation-details">
          <div class="gr-detail-row">
            <span class="gr-detail-label">Rail Model</span>
            <span class="gr-detail-val font-mono">${model?.modelName || '—'}</span>
          </div>
          <div class="gr-detail-row">
            <span class="gr-detail-label">Required Cutting Length</span>
            <span class="gr-detail-val font-mono">${extras.requestedMm} mm</span>
          </div>
          <div class="gr-detail-row">
            <span class="gr-detail-label">Required No of Pieces</span>
            <span class="gr-detail-val font-mono">${pieces} pc${pieces !== 1 ? 's' : ''}</span>
          </div>
          ${pieces > 1 ? `
          <div class="gr-detail-row">
            <span class="gr-detail-label">Total Cut Length (All Pieces)</span>
            <span class="gr-detail-val font-mono">${(pieces * extras.requestedMm).toFixed(0)} mm</span>
          </div>` : ''}
          <div class="gr-detail-row">
            <span class="gr-detail-label">Min Recommended Length</span>
            <span class="gr-detail-val font-mono">${extras.minMm} mm</span>
          </div>
          ${extras.holesCount > 0 ? `
          <div class="gr-detail-row">
            <span class="gr-detail-label">Mounting Holes per Rail</span>
            <span class="gr-detail-val font-mono">${extras.holesCount} holes</span>
          </div>
          ${pieces > 1 ? `
          <div class="gr-detail-row">
            <span class="gr-detail-label">Total Mounting Holes</span>
            <span class="gr-detail-val font-mono">${pieces * extras.holesCount} holes</span>
          </div>` : ''}
          <div class="gr-detail-row">
            <span class="gr-detail-label">Symmetrical End Margins</span>
            <span class="gr-detail-val font-mono">E1 = E2 = ${extras.endMarginMm} mm</span>
          </div>` : ''}
        </div>`;

      if (extras.holesCount > 0) {
        schematicHtml = _generateRailSvg(extras.requestedMm, extras.pitchMm, extras.endMarginMm, extras.holesCount, pieces);
      }
    }

    box.className = `gr-validation-result ${statusClass}`;
    box.innerHTML = `
      <div class="gr-result-header">
        <div class="gr-result-icon">${icon}</div>
        <div class="gr-result-message">
          <div style="font-weight: 700; margin-bottom: 2px;">${status === 'valid' ? 'Valid Cutting Length' : status === 'invalid' ? 'Invalid Cutting Length' : status === 'warning' ? 'Engineering Confirmation Required' : 'Validating'}</div>
          <div>${message}</div>
        </div>
      </div>
      ${detailsHtml}
      ${schematicHtml}
      ${actionBtnHtml}`;
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
      if (e.target.closest('#btnCloseGrStockModal') || e.target.closest('#btnCancelGrStockModal')) {
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
        const stockId = openCutBtn.dataset.stockId;
        const cutLen = parseFloat(openCutBtn.dataset.cutLen) || 0;
        const pcs = parseInt(openCutBtn.dataset.pieces, 10) || 1;
        openGrCutModal(stockId, cutLen, pcs);
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
      if (e.target && e.target.id === 'grModelSelect') {
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
        _renderStockTable();
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

    const headers = ['SKU', 'Model', 'Length (mm)', 'Length (In)', 'Pitch (mm)', 'Quantity', 'Notes'];
    const rows = _railStock.map(item => {
      const lengthIn = (item.lengthMm / 25.4).toFixed(2);
      return [
        _escapeCsv(item.sku || ''),
        _escapeCsv(item.modelName || ''),
        item.lengthMm,
        lengthIn,
        item.pitchMm || '',
        item.quantity,
        _escapeCsv(item.notes || '')
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
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (evt) {
      try {
        const text = evt.target.result;
        const items = parseGuidedRailCsv(text);
        if (items.length === 0) {
          _toast('No valid guided rail records found in CSV file. Please check format against the template.', 'warning');
          return;
        }

        const res = await fetch('/api/guided-rail/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        const data = await res.json();
        if (data.success) {
          await loadRailStock();
          _toast(`Successfully imported ${data.count || items.length} guided rail stock records from CSV!`, 'success');
        } else {
          _toast(data.message || 'Error saving imported rail stock', 'danger');
        }
      } catch (err) {
        _toast('Error importing CSV: ' + err.message, 'danger');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function parseGuidedRailCsv(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headerParts = _parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());

    let modelIdx = headerParts.findIndex(h => h.includes('model'));
    let lengthIdx = headerParts.findIndex(h => h.includes('length') || h.includes('len'));
    let qtyIdx = headerParts.findIndex(h => h.includes('qty') || h.includes('quant'));
    let notesIdx = headerParts.findIndex(h => h.includes('note') || h.includes('rack') || h.includes('location'));
    let skuIdx = headerParts.findIndex(h => h.includes('sku') || h.includes('code'));

    const isLengthInches = lengthIdx !== -1 && (headerParts[lengthIdx].includes('(in)') || headerParts[lengthIdx].includes('inch'));

    if (modelIdx === -1) modelIdx = 0;
    if (lengthIdx === -1) lengthIdx = 1;
    if (qtyIdx === -1) qtyIdx = 2;
    if (notesIdx === -1) notesIdx = 3;
    if (skuIdx === -1) skuIdx = 4;

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = _parseCsvRow(lines[i]);
      if (parts.length < 2) continue;

      const rawModel = (parts[modelIdx] || '').trim().toUpperCase();
      let rawLength = parseFloat(parts[lengthIdx]);
      const qty = parseInt(parts[qtyIdx], 10);
      const notes = parts[notesIdx] ? parts[notesIdx].trim() : '';
      const sku = parts[skuIdx] ? parts[skuIdx].trim() : '';

      if (!rawModel || isNaN(rawLength) || rawLength <= 0) continue;

      if (isLengthInches) {
        rawLength = Math.round(rawLength * 25.4);
      }

      const matched = _railModels.find(m => m.modelName.toUpperCase() === rawModel);
      const pitchMm = matched ? matched.pitchMm : 60;
      const railWidthMm = matched ? matched.railWidthMm : 0;
      const railHeightMm = matched ? matched.railHeightMm : 0;

      items.push({
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

    return items;
  }

  function _parseCsvRow(rowText) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < rowText.length; i++) {
      const char = rowText[i];
      if (char === '"') {
        if (inQuotes && rowText[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
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
  <title>RodSync Slip — [${cleanRef}]</title>
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
        <button class="btn-close-slip" onclick="window.close()" title="Close Preview">✕</button>
      </div>
    </div>

    <div class="preview-hint">${isAssignByLocked ? 'You can edit Assign To before printing:' : 'You can edit Assign By and Assign To before printing:'}</div>

    <div class="preview-field">
      <label class="preview-label" for="inputAssignBy">Assign By : ${isAssignByLocked ? '<span style="font-size: 0.62rem; color: #64748b; font-weight: 700; margin-left: 4px;">(🔒 Locked)</span>' : ''}</label>
      <input type="text" id="inputAssignBy" class="preview-input" value="${_escapeHtml(defaultAssignBy)}" placeholder="e.g. Roshni, Suman, Bhawna" ${isAssignByLocked ? 'readonly tabindex="-1" style="background: #f1f5f9; cursor: not-allowed; color: #334155; font-weight: 700; border-color: #cbd5e1;" title="Assign By is automatically set to your login account and cannot be modified."' : ''} />
    </div>

    <div class="preview-field">
      <label class="preview-label" for="inputAssignTo">Assign To :</label>
      <input type="text" id="inputAssignTo" class="preview-input" value="${_escapeHtml(defaultAssignTo)}" placeholder="e.g. Jai Parkash, Bhushan" />
    </div>
  </div>

  <!-- THE RECEIPT SLIP -->
  <div class="slip-container">
    <div class="slip-company-name">FINE BEARINGS &amp; OIL SEAL STORE</div>
    <div class="slip-disclaimer">Note: This is not an official invoice. It is a computer-generated slip for store use only.</div>

    <hr class="slip-divider" />

    <div class="slip-meta-row">
      <span class="slip-ref-no">Ref: ${_escapeHtml(cleanRef)}</span>
      <span class="slip-brand-logo">RODSYNC</span>
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
  window.initGuidedRail = initGuidedRail;
  window._grLoadAndRender = initGuidedRail;
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
  window.exportGuidedRailCsv = exportGuidedRailCsv;
  window.handleGuidedRailCsvImport = handleGuidedRailCsvImport;
  window.printGuidedRailCutSlip = printGuidedRailCutSlip;
  window.getGuidedRailStock = function() {
    return _railStock || [];
  };
  window.setGuidedRailStock = function(stock) {
    if (Array.isArray(stock)) {
      _railStock = stock;
      _renderStockTable();
    }
  };

  // Auto-init on script evaluation
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initGuidedRail);
    } else {
      setTimeout(initGuidedRail, 10);
    }
  }

})();
