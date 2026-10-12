/**
 * RodStock Pro — Modern Rod Stock Management & Cut Optimizer
 * Vanilla JavaScript ES6+ with PWA & Mobile UX Integration
 */

(function () {
  'use strict';

  // --- STORAGE CONFIGURATION & CONSTANTS ---
  const STORAGE_KEY = 'rod_stock_inventory_v1';
  const CUT_LOGS_STORAGE_KEY = 'rod_stock_cut_logs_v1';
  const LOW_STOCK_THRESHOLD = 5;

  // --- INITIAL SAMPLE DATA ---
  const DEFAULT_SAMPLE_RODS = [];

  // Sample initial cut logs for demonstration
  const DEFAULT_SAMPLE_CUT_LOGS = [];

  // --- STATE ---
  let rods = [];
  let cutLogs = [];
  let sortColumn = 'name';
  let sortDirection = 'asc'; // 'asc' | 'desc'
  let pendingDuplicateResolution = null;
  let lastSmartSearchQuery = null;
  let deferredInstallPrompt = null;

  // --- DOM ELEMENT REFERENCES ---
  const statTotalTypes = document.getElementById('statTotalTypes');
  const statTotalQuantity = document.getElementById('statTotalQuantity');
  const statInStockTypes = document.getElementById('statInStockTypes');
  const statLowStockCount = document.getElementById('statLowStockCount');

  // Smart Search DOM
  const smartSearchForm = document.getElementById('smartSearchForm');
  const searchDiameterInput = document.getElementById('searchDiameterInput');
  const searchLengthInput = document.getElementById('searchLengthInput');
  const btnResetSmartSearch = document.getElementById('btnResetSmartSearch');
  const smartSearchResultsContainer = document.getElementById('smartSearchResultsContainer');
  const smartResultsTableBody = document.getElementById('smartResultsTableBody');
  const smartResultsCount = document.getElementById('smartResultsCount');
  const smartResultsCriteria = document.getElementById('smartResultsCriteria');
  const smartSearchEmptyState = document.getElementById('smartSearchEmptyState');
  const smartSearchEmptyDesc = document.getElementById('smartSearchEmptyDesc');
  const btnEmptySuggestAdd = document.getElementById('btnEmptySuggestAdd');

  // Inventory Table DOM
  const inventoryTableBody = document.getElementById('inventoryTableBody');
  const inventoryEmptyState = document.getElementById('inventoryEmptyState');
  const inventoryCountSummary = document.getElementById('inventoryCountSummary');
  const filterKeyword = document.getElementById('filterKeyword');
  const filterDiameter = document.getElementById('filterDiameter');
  let filterStockStatus = document.getElementById('filterStockStatus');

  const btnResetInventoryFilters = document.getElementById('btnResetInventoryFilters');
  const btnResetSampleData = document.getElementById('btnResetSampleData');
  const btnClearAllData = document.getElementById('btnClearAllData');
  const quickDiameterChipsTrack = document.getElementById('quickDiameterChipsTrack');

  // Add/Edit Rod Modal DOM
  const rodModalOverlay = document.getElementById('rodModalOverlay');
  const btnOpenAddModal = document.getElementById('btnOpenAddModal');
  const btnCloseRodModal = document.getElementById('btnCloseRodModal');
  const btnCancelRodModal = document.getElementById('btnCancelRodModal');
  const rodForm = document.getElementById('rodForm');
  const modalTitle = document.getElementById('modalTitle');
  const btnSaveRodText = document.getElementById('btnSaveRodText');
  const rodEditId = document.getElementById('rodEditId');
  const formRodName = document.getElementById('formRodName');
  const formDiameterMm = document.getElementById('formDiameterMm');
  const formLengthFt = document.getElementById('formLengthFt');
  const formQuantity = document.getElementById('formQuantity');
  const formSku = document.getElementById('formSku');
  const formNotes = document.getElementById('formNotes');

  // Deduct Stock Modal DOM (Whole Units)
  const deductModalOverlay = document.getElementById('deductModalOverlay');
  const btnCloseDeductModal = document.getElementById('btnCloseDeductModal');
  const btnCancelDeductModal = document.getElementById('btnCancelDeductModal');
  const deductForm = document.getElementById('deductForm');
  const deductRodId = document.getElementById('deductRodId');
  const deductRodName = document.getElementById('deductRodName');
  const deductRodDimensions = document.getElementById('deductRodDimensions');
  const deductRodAvailableQty = document.getElementById('deductRodAvailableQty');
  const deductQuantityInput = document.getElementById('deductQuantityInput');
  const deductRemainingHint = document.getElementById('deductRemainingHint');
  const btnDeductStepDown = document.getElementById('btnDeductStepDown');
  const btnDeductStepUp = document.getElementById('btnDeductStepUp');

  // Cut Rod Modal DOM (Size Deduction + Remnant Offcut)
  const cutModalOverlay = document.getElementById('cutModalOverlay');
  const btnCloseCutModal = document.getElementById('btnCloseCutModal');
  const btnCancelCutModal = document.getElementById('btnCancelCutModal');
  const cutForm = document.getElementById('cutForm');
  const cutRodId = document.getElementById('cutRodId');
  const cutRodName = document.getElementById('cutRodName');
  const cutRodDiameter = document.getElementById('cutRodDiameter');
  const cutRodFullLength = document.getElementById('cutRodFullLength');
  const cutRodAvailableQty = document.getElementById('cutRodAvailableQty');
  const cutRequiredLengthInput = document.getElementById('cutRequiredLengthInput');
  const cutPiecesQtyInput = document.getElementById('cutPiecesQtyInput');
  const btnCutStepDown = document.getElementById('btnCutStepDown');
  const btnCutStepUp = document.getElementById('btnCutStepUp');
  const calcOrigLength = document.getElementById('calcOrigLength');
  const calcCutLength = document.getElementById('calcCutLength');
  const calcRemainLength = document.getElementById('calcRemainLength');
  const calcRemainNote = document.getElementById('calcRemainNote');
  const cutAutoAddRemnant = document.getElementById('cutAutoAddRemnant');
  const cutReasonInput = document.getElementById('cutReasonInput');
  const btnConfirmCut = document.getElementById('btnConfirmCut');

  // Cut Logs Modal DOM
  const cutLogsModalOverlay = document.getElementById('cutLogsModalOverlay');
  const btnOpenCutLogsModal = document.getElementById('btnOpenCutLogsModal');
  const btnCloseCutLogsModal = document.getElementById('btnCloseCutLogsModal');
  const btnCloseCutLogsBottom = document.getElementById('btnCloseCutLogsBottom');
  const cutLogsBadge = document.getElementById('cutLogsBadge');
  const cutLogsTableBody = document.getElementById('cutLogsTableBody');
  const cutLogsEmptyState = document.getElementById('cutLogsEmptyState');
  const filterCutLogsInput = document.getElementById('filterCutLogsInput');
  const btnExportCutLogsCsv = document.getElementById('btnExportCutLogsCsv');
  const btnClearCutLogs = document.getElementById('btnClearCutLogs');
  const cutLogsCountText = document.getElementById('cutLogsCountText');
  const cutLogsContentArea = document.getElementById('cutLogsContentArea');
  const cutLogsTableWrapper = document.getElementById('cutLogsTableWrapper');
  const cutLogsCardsContainer = document.getElementById('cutLogsCardsContainer');
  const btnCutLogsCards = document.getElementById('btnCutLogsCards');
  const btnCutLogsTable = document.getElementById('btnCutLogsTable');
  let cutLogsViewMode = window.innerWidth <= 768 ? 'cards' : 'table';

  // PWA & Mobile Navigation DOM
  const btnInstallPwa = document.getElementById('btnInstallPwa');
  const mobNavInstall = document.getElementById('mobNavInstall');
  const installModalOverlay = document.getElementById('installModalOverlay');
  const btnCloseInstallModal = document.getElementById('btnCloseInstallModal');
  const btnCloseInstallModalBtn = document.getElementById('btnCloseInstallModalBtn');
  const installPromptDirect = document.getElementById('installPromptDirect');
  const btnTriggerInstallPrompt = document.getElementById('btnTriggerInstallPrompt');
  const mobNavSearch = document.getElementById('mobNavSearch');
  const mobNavInventory = document.getElementById('mobNavInventory');
  const mobNavAdd = document.getElementById('mobNavAdd');
  const mobNavCutLogs = document.getElementById('mobNavCutLogs');

  // Duplicate Resolution Modal DOM
  const duplicateModalOverlay = document.getElementById('duplicateModalOverlay');
  const duplicateDetailsCard = document.getElementById('duplicateDetailsCard');
  const btnDuplicateCancel = document.getElementById('btnDuplicateCancel');
  const btnDuplicateKeepSeparate = document.getElementById('btnDuplicateKeepSeparate');
  const btnDuplicateMerge = document.getElementById('btnDuplicateMerge');
  const btnCloseDuplicateModal = document.getElementById('btnCloseDuplicateModal');

  // Confirmation Dialog Modal DOM
  const confirmModalOverlay = document.getElementById('confirmModalOverlay');
  const confirmDialogTitle = document.getElementById('confirmDialogTitle');
  const confirmDialogMessage = document.getElementById('confirmDialogMessage');
  const btnConfirmOk = document.getElementById('btnConfirmOk');
  const btnConfirmCancel = document.getElementById('btnConfirmCancel');
  const btnCloseConfirmModal = document.getElementById('btnCloseConfirmModal');
  let pendingConfirmCallback = null;

  // Import / Export DOM
  const btnExportCsv = document.getElementById('btnExportCsv');
  const csvFileInput = document.getElementById('csvFileInput');
  const toastContainer = document.getElementById('toastContainer');

  // --- INITIALIZATION ---
  let isAppInitialized = false;
  function initApp() {
    initTheme();
    loadRodsFromStorage();
    loadCutLogsFromStorage();
    if (!isAppInitialized) {
      setupEventListeners();
      initPwaFeatures();
      initMobileNavigation();
      isAppInitialized = true;
    }
    updateDashboard();
    updateCutLogsBadge();
  }

  // --- THEME SYSTEM (AUTOMATIC SYSTEM SYNC) ---
  const metaThemeColor = document.getElementById('metaThemeColor');

  function initTheme() {
    // Check localStorage for manually saved theme, else fallback to system theme
    const savedTheme = localStorage.getItem('rodsync_theme');
    if (savedTheme) {
      applyTheme(savedTheme, false);
    } else {
      applySystemTheme(false);
    }



    // Clean up outdated service worker caches
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => {
          if (k !== 'rodsync-pwa-v6') caches.delete(k);
        });
      }).catch(() => { });
    }

    // Listen to OS system theme changes in real-time, ONLY if not manually overridden
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const sysThemeListener = () => {
      if (!localStorage.getItem('rodsync_theme')) {
        applySystemTheme(false);
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', sysThemeListener);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(sysThemeListener);
    }
  }

  function applySystemTheme(save = true) {
    const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(isSystemDark ? 'dark' : 'light', save);
  }

  function applyTheme(theme, save = true) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-mode', save ? 'manual' : 'system');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#070a12' : '#f5f7fb');
    }
    if (save) {
      localStorage.setItem('rodsync_theme', theme);
    }
  }

  // --- PWA SERVICE WORKER & APP INSTALLATION ---
  function initPwaFeatures() {
    // 1. Service Worker Registration for offline capabilities
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('RodSync PWA ServiceWorker registered with scope:', reg.scope);
            reg.update();
          })
          .catch(err => {
            console.log('ServiceWorker registration skipped or failed:', err);
          });
      });
    }

    // 2. Capture 'beforeinstallprompt' for Android / Chrome / Edge
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (installPromptDirect) {
        installPromptDirect.classList.remove('hidden');
      }
      if (btnInstallPwa) {
        btnInstallPwa.classList.add('btn-primary');
        btnInstallPwa.classList.remove('btn-secondary');
      }
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (installModalOverlay) installModalOverlay.classList.add('hidden');
      showToast('🎉 RodSync has been added to your Home Screen!', 'success');
    });
  }

  function openInstallModal() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          showToast('Installing RodSync...', 'info');
        }
        deferredInstallPrompt = null;
      });
    } else {
      installModalOverlay.classList.remove('hidden');
    }
  }

  function closeInstallModal() {
    installModalOverlay.classList.add('hidden');
  }

  // --- MOBILE BOTTOM NAVIGATION ---
  function initMobileNavigation() {
    if (mobNavSearch) {
      mobNavSearch.addEventListener('click', () => {
        setActiveMobNav('mobNavSearch');
        const sec = document.getElementById('smartSearchSection');
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => searchDiameterInput.focus(), 300);
      });
    }

    if (mobNavInventory) {
      mobNavInventory.addEventListener('click', () => {
        setActiveMobNav('mobNavInventory');
        const sec = document.getElementById('inventorySection');
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      });
    }

    if (mobNavAdd) {
      mobNavAdd.addEventListener('click', () => {
        openAddRodModal();
      });
    }

    if (mobNavCutLogs) {
      mobNavCutLogs.addEventListener('click', () => {
        setActiveMobNav('mobNavCutLogs');
        openCutLogsModal();
      });
    }

    if (mobNavInstall) {
      mobNavInstall.addEventListener('click', openInstallModal);
    }
  }

  function setActiveMobNav(id) {
    document.querySelectorAll('.mob-nav-item').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
  }

  // --- DATA STORAGE & PERSISTENCE ---
  function loadRodsFromStorage() {
    try {
      if (window.__INITIAL_RODS__) {
        rods = JSON.parse(JSON.stringify(window.__INITIAL_RODS__));
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          rods = JSON.parse(stored);
        } else {
          rods = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_RODS));
        }
      }
      rods.forEach(r => {
        if (r.location !== undefined) delete r.location;
      });
      // Optionally sync to local as backup
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
    } catch (e) {
      console.error('Error loading inventory from storage, fallback to defaults', e);
      rods = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_RODS));
    }
  }

  function saveRodsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
      window.dispatchEvent(new CustomEvent('syncRodsToFirebase', { detail: rods }));
    } catch (e) {
      showToast('Error saving data to browser storage: ' + e.message, 'danger');
    }
  }

  function loadCutLogsFromStorage() {
    try {
      if (window.__INITIAL_CUT_LOGS__) {
        cutLogs = JSON.parse(JSON.stringify(window.__INITIAL_CUT_LOGS__));
      } else {
        const stored = localStorage.getItem(CUT_LOGS_STORAGE_KEY);
        if (stored) {
          cutLogs = JSON.parse(stored);
        } else {
          cutLogs = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_CUT_LOGS));
        }
      }
      localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
    } catch (e) {
      console.error('Error loading cut logs from storage', e);
      cutLogs = [];
    }
  }

  function saveCutLogsToStorage() {
    try {
      localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
      window.dispatchEvent(new CustomEvent('syncCutLogsToFirebase', { detail: cutLogs }));
    } catch (e) {
      console.error('Error saving cut logs to storage', e);
    }
  }

  function updateCutLogsBadge() {
    if (cutLogsBadge) {
      cutLogsBadge.textContent = cutLogs.length;
    }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.innerHTML = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.onclick = () => removeToast(toast);

    toast.appendChild(msgSpan);
    toast.appendChild(closeBtn);
    toastContainer.appendChild(toast);

    const autoTimer = setTimeout(() => {
      removeToast(toast);
    }, duration);

    function removeToast(el) {
      clearTimeout(autoTimer);
      el.style.opacity = '0';
      el.style.transform = 'translateX(50px)';
      el.style.transition = 'all 200ms ease';
      setTimeout(() => el.remove(), 200);
    }
  }

  // --- CONFIRMATION DIALOG ---
  function showConfirm(title, message, onConfirm, isDanger = true) {
    confirmDialogTitle.textContent = title;
    confirmDialogMessage.textContent = message;
    btnConfirmOk.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
    pendingConfirmCallback = onConfirm;
    confirmModalOverlay.classList.remove('hidden');
  }

  function closeConfirmModal() {
    confirmModalOverlay.classList.add('hidden');
    pendingConfirmCallback = null;
  }

  // --- DASHBOARD REFRESH & STATS ---
  function updateDashboard() {
    // 1. Calculate KPI Metrics
    const totalTypes = rods.length;
    const totalQuantity = rods.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
    const inStockTypes = rods.filter(r => (Number(r.quantity) || 0) > 0).length;
    const lowStockCount = rods.filter(r => {
      const q = Number(r.quantity) || 0;
      return q > 0 && q <= LOW_STOCK_THRESHOLD;
    }).length;

    // KPI numbers
    statTotalTypes.textContent = totalTypes.toLocaleString();
    statTotalQuantity.textContent = totalQuantity.toLocaleString();
    statInStockTypes.textContent = inStockTypes.toLocaleString();
    statLowStockCount.textContent = lowStockCount.toLocaleString();

    // 2. Refresh Filters (Diameter dropdown & Quick Chips)
    populateDiameterFilterOptions();
    renderQuickDiameterChips();

    // 3. Render Main Inventory Table
    renderInventoryTable();

    // 4. If a Smart Search is active, refresh its results live
    if (lastSmartSearchQuery) {
      executeSmartSearch(lastSmartSearchQuery.diameter, lastSmartSearchQuery.length, false);
    }
  }

  // --- DIAMETER FILTER DROPDOWN & QUICK CHIPS POPULATION ---
  function populateDiameterFilterOptions() {
    const currentVal = filterDiameter.value;
    const diameters = [...new Set(rods.map(r => Number(r.diameterMm)))].sort((a, b) => a - b);

    filterDiameter.innerHTML = '<option value="all">All Diameters</option>';
    diameters.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `${d} mm`;
      filterDiameter.appendChild(opt);
    });

    if (currentVal && (currentVal === 'all' || diameters.includes(Number(currentVal)))) {
      filterDiameter.value = currentVal;
    } else {
      filterDiameter.value = 'all';
    }
  }

  function renderQuickDiameterChips() {
    if (!quickDiameterChipsTrack) return;
    const currentDia = filterDiameter.value;
    const diameters = [...new Set(rods.map(r => Number(r.diameterMm)))].sort((a, b) => a - b);

    quickDiameterChipsTrack.innerHTML = '';

    // "All" Chip
    const allBtn = document.createElement('button');
    allBtn.className = `chip-btn ${currentDia === 'all' ? 'active' : ''}`;
    allBtn.textContent = 'All Sizes';
    allBtn.onclick = () => {
      filterDiameter.value = 'all';
      renderQuickDiameterChips();
      renderInventoryTable();
    };
    quickDiameterChipsTrack.appendChild(allBtn);

    // Individual diameter chips
    diameters.forEach(d => {
      const chip = document.createElement('button');
      chip.className = `chip-btn ${currentDia === String(d) ? 'active' : ''}`;
      chip.textContent = `${d} mm`;
      chip.onclick = () => {
        filterDiameter.value = d;
        renderQuickDiameterChips();
        renderInventoryTable();
      };
      quickDiameterChipsTrack.appendChild(chip);
    });
  }

  // --- INVENTORY TABLE RENDERING ---
  function renderInventoryTable() {
    const keyword = filterKeyword.value.trim().toLowerCase();
    const diaFilter = filterDiameter.value;


    let filtered = rods.filter(rod => {
      // Keyword match across name, sku, notes
      if (keyword) {
        const matchName = rod.name.toLowerCase().includes(keyword);
        const matchSku = false;
        const matchNotes = false;
        if (!matchName && !matchSku && !matchNotes) return false;
      }

      // Diameter filter
      if (diaFilter !== 'all' && Number(rod.diameterMm) !== Number(diaFilter)) {
        return false;
      }

      // Stock status filter

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (['diameterMm', 'lengthFt', 'quantity'].includes(sortColumn)) {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    inventoryTableBody.innerHTML = '';

    if (filtered.length === 0) {
      inventoryTableBody.parentElement.classList.add('hidden');
      inventoryEmptyState.classList.remove('hidden');
      inventoryCountSummary.textContent = `Showing 0 of ${rods.length} records`;
      return;
    }

    inventoryTableBody.parentElement.classList.remove('hidden');
    inventoryEmptyState.classList.add('hidden');
    inventoryCountSummary.textContent = `Showing ${filtered.length} of ${rods.length} records`;

    filtered.forEach(rod => {
      const tr = document.createElement('tr');
      const qty = Number(rod.quantity) || 0;

      // Status Badge determination
      let statusBadge = '';
      if (qty <= 0) {
        statusBadge = '<span class="badge badge-danger">Out of Stock</span>';
      } else if (qty <= LOW_STOCK_THRESHOLD) {
        statusBadge = `<span class="badge badge-warning">Low Stock (${qty})</span>`;
      } else {
        statusBadge = '<span class="badge badge-success">In Stock</span>';
      }

      tr.innerHTML = `
        
        <td class="col-name">
          <div class="rod-title">${escapeHtml(rod.name)}</div>
          <div class="mobile-only rod-meta-mobile">
            
            ${statusBadge}
          </div>
        </td>
        <td class="col-diameter hide-mobile text-right font-mono"><strong>${rod.diameterMm}</strong> <span class="text-muted">mm</span></td>
        <td class="col-length hide-mobile text-right font-mono"><strong>${rod.lengthFt}</strong> <span class="text-muted">ft</span></td>
        <td class="col-size mobile-only text-center font-mono">
          <span class="size-badge-pill"><strong>${rod.diameterMm}</strong>mm × <strong>${rod.lengthFt}</strong>ft</span>
        </td>
        <td class="col-qty text-right font-mono">
          <span class="qty-pill ${qty === 0 ? 'qty-zero' : ''}">${qty}</span>
        </td>
        
        
        <td class="col-actions text-center">
          <div class="table-actions">
            <div class="desktop-only stepper-mini" title="Quick adjust quantity">
              <button class="stepper-mini-btn btn-quick-dec" data-id="${rod.id}" title="Decrease quantity by 1" ${qty <= 0 ? 'disabled' : ''}>-</button>
              <button class="stepper-mini-btn btn-quick-inc" data-id="${rod.id}" title="Increase quantity by 1">+</button>
            </div>
            <button class="btn btn-primary btn-xs btn-open-cut" data-id="${rod.id}" title="Cut custom size from this rod and save offcut remnant" ${qty <= 0 ? 'disabled' : ''}>
              ✂️ Cut
            </button>
            <button class="desktop-only btn btn-secondary btn-xs btn-open-deduct" data-id="${rod.id}" title="Deduct whole rods from stock" ${qty <= 0 ? 'disabled' : ''}>
              Deduct
            </button>
            <button class="desktop-only btn btn-secondary btn-xs btn-open-edit" data-id="${rod.id}" title="Edit rod details">
              Edit
            </button>
            <button class="desktop-only btn btn-ghost btn-xs text-danger btn-delete-rod" data-id="${rod.id}" title="Delete this rod">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button class="mobile-only btn btn-secondary btn-xs btn-rod-more" data-id="${rod.id}" title="More options for this rod">
              ···
            </button>
          </div>
        </td>
      `;
      inventoryTableBody.appendChild(tr);
    });
  }

  // --- SMART ROD SEARCH LOGIC ---
  function executeSmartSearch(diameter, minLength, showNotification = true) {
    const searchDiameter = Number(diameter);
    const requiredLength = Number(minLength);

    if (isNaN(searchDiameter) || searchDiameter <= 0 || isNaN(requiredLength) || requiredLength <= 0) {
      showToast('Please enter valid positive numbers for diameter and length', 'warning');
      return;
    }

    lastSmartSearchQuery = { diameter: searchDiameter, length: requiredLength };

    // Core Business Rule:
    // 1. Exact diameter match
    // 2. Length >= requiredLength
    // 3. Stock quantity > 0
    // 4. Sorted ascending by length (closest length first)
    const results = rods
      .filter(rod =>
        Number(rod.diameterMm) === searchDiameter &&
        Number(rod.lengthFt) >= requiredLength &&
        Number(rod.quantity) > 0
      )
      .sort((a, b) => Number(a.lengthFt) - Number(b.lengthFt));

    smartResultsCriteria.textContent = `Criteria: ${searchDiameter} mm diameter × ≥ ${requiredLength} ft length`;

    if (results.length === 0) {
      smartSearchResultsContainer.classList.add('hidden');
      smartSearchEmptyState.classList.remove('hidden');
      smartSearchEmptyDesc.textContent = `No active rods found with exactly ${searchDiameter} mm diameter and at least ${requiredLength} ft available in stock.`;
      if (showNotification) {
        showToast(`No available rods found for ${searchDiameter} mm (≥ ${requiredLength} ft)`, 'warning');
      }
      return;
    }

    smartSearchEmptyState.classList.add('hidden');
    smartSearchResultsContainer.classList.remove('hidden');
    smartResultsCount.textContent = `${results.length} Suitable ${results.length === 1 ? 'Option' : 'Options'}`;
    smartResultsTableBody.innerHTML = '';

    results.forEach((rod, index) => {
      const tr = document.createElement('tr');
      const isBestFit = index === 0;
      const extraLength = Number((rod.lengthFt - requiredLength).toFixed(2));

      let fitBadge = '';
      if (isBestFit) {
        tr.classList.add('row-best-fit');
        fitBadge = `
          <span class="badge-fit-primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            Optimal Fit
          </span>
        `;
      } else {
        fitBadge = `<span class="badge-fit-secondary">Option #${index + 1}</span>`;
      }

      // Cut Remainder badge
      let remnantBadge = '';
      if (extraLength === 0) {
        remnantBadge = `<span class="badge-cut-exact">Exact fit (0 scrap)</span>`;
      } else {
        remnantBadge = `<span class="badge-cut-rem">✂️ <strong>${extraLength} ft</strong> offcut</span>`;
      }

      tr.innerHTML = `
        <td class="smart-col-fit hide-mobile">${fitBadge}</td>
        <td class="smart-col-rod">
          <div class="mobile-only" style="margin-bottom: 0.25rem;">${fitBadge}</div>
          <div style="font-weight: 600; line-height: 1.25;">${escapeHtml(rod.name)}</div>
          <div class="font-mono text-muted" style="font-size: 0.725rem;">${escapeHtml(rod.sku || 'No SKU')}</div>
        </td>
        <td class="smart-col-dia hide-mobile text-right font-mono"><strong>${rod.diameterMm}</strong> mm</td>
        <td class="smart-col-len hide-mobile text-right font-mono"><strong>${rod.lengthFt}</strong> ft</td>
        <td class="smart-col-size mobile-only text-right font-mono">
          <div style="font-weight: 700; font-size: 0.85rem;">${rod.lengthFt} ft</div>
          <div style="font-size: 0.7rem; margin-top: 0.15rem;">${remnantBadge}</div>
        </td>
        <td class="smart-col-qty text-right font-mono"><strong style="color: var(--primary-700); font-size: 1rem;">${rod.quantity}</strong></td>
        <td class="smart-col-rem hide-mobile">${remnantBadge}</td>
        <td class="smart-col-action text-center">
          <div class="table-actions">
            <button class="btn btn-primary btn-xs btn-open-cut" data-id="${rod.id}" data-cut-len="${requiredLength}" title="Cut ${requiredLength} ft and keep the ${extraLength} ft offcut">
              ✂️ Cut
            </button>
            <button class="desktop-only btn btn-secondary btn-xs btn-open-deduct" data-id="${rod.id}" title="Deduct whole rods">
              Deduct
            </button>
          </div>
        </td>
      `;
      smartResultsTableBody.appendChild(tr);
    });

    if (showNotification) {
      showToast(`Found ${results.length} suitable rod length(s) for ${searchDiameter} mm!`, 'success');
    }
  }

  function resetSmartSearch() {
    searchDiameterInput.value = '';
    searchLengthInput.value = '';
    lastSmartSearchQuery = null;
    smartSearchResultsContainer.classList.add('hidden');
    smartSearchEmptyState.classList.add('hidden');
  }

  // --- CUT ROD MODAL ACTIONS (SIZE DEDUCTION & OFFCUT REMNANT) ---
  function openCutModal(id, defaultCutLength = null) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    if (rod.quantity <= 0) {
      showToast('This rod has 0 available stock to cut', 'warning');
      return;
    }

    cutRodId.value = rod.id;
    cutRodName.textContent = rod.name + (rod.sku ? ` (${rod.sku})` : '');
    cutRodDiameter.textContent = rod.diameterMm;
    cutRodFullLength.textContent = Number(rod.lengthFt).toFixed(1);
    cutRodAvailableQty.textContent = rod.quantity;

    calcOrigLength.textContent = `${Number(rod.lengthFt).toFixed(1)} ft`;

    // Prefill cut length if passed from smart search
    const initialCutLen = defaultCutLength ? parseFloat(defaultCutLength) : Number(rod.lengthFt);
    cutRequiredLengthInput.value = initialCutLen;
    cutRequiredLengthInput.max = rod.lengthFt;
    cutPiecesQtyInput.value = '1';
    cutPiecesQtyInput.max = rod.quantity;
    cutReasonInput.value = '';
    cutAutoAddRemnant.checked = true;

    updateCutCalculations();

    cutModalOverlay.classList.remove('hidden');
    cutRequiredLengthInput.focus();
  }

  function closeCutModal() {
    cutModalOverlay.classList.add('hidden');
    cutForm.reset();
  }

  function updateCutCalculations() {
    const rod = rods.find(r => r.id === cutRodId.value);
    if (!rod) return;

    const fullLen = Number(rod.lengthFt);
    const cutLen = parseFloat(cutRequiredLengthInput.value);
    const qty = parseInt(cutPiecesQtyInput.value, 10) || 1;

    calcOrigLength.textContent = `${fullLen.toFixed(1)} ft`;

    if (isNaN(cutLen) || cutLen <= 0) {
      calcCutLength.textContent = '- 0.0 ft';
      calcRemainLength.textContent = '—';
      calcRemainNote.className = 'cut-calc-note warning';
      calcRemainNote.textContent = 'Please enter a valid positive cut length in feet.';
      btnConfirmCut.disabled = true;
      return;
    }

    calcCutLength.textContent = `- ${cutLen.toFixed(1)} ft`;

    if (cutLen > fullLen) {
      calcRemainLength.textContent = 'Invalid!';
      calcRemainNote.className = 'cut-calc-note error';
      calcRemainNote.innerHTML = `⚠️ <strong>Cannot Cut!</strong> Required cut (${cutLen} ft) exceeds full rod length (${fullLen} ft).`;
      btnConfirmCut.disabled = true;
      return;
    }

    btnConfirmCut.disabled = false;
    const remainder = Number((fullLen - cutLen).toFixed(2));
    calcRemainLength.textContent = `${remainder} ft`;

    if (remainder === 0) {
      calcRemainNote.className = 'cut-calc-note';
      calcRemainNote.innerHTML = `🎯 <strong>Exact Fit!</strong> Full rod length consumed with <strong>0 scrap</strong>. Deducting <strong>${qty}</strong> whole rod(s).`;
    } else {
      calcRemainNote.className = 'cut-calc-note';
      calcRemainNote.innerHTML = `✂️ <strong>${qty} unit(s)</strong> of <strong>${rod.diameterMm} mm × ${remainder} ft</strong> offcut remnant rod will be added to your inventory!`;
    }
  }

  function handleCutSubmit(e) {
    e.preventDefault();

    const id = cutRodId.value;
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    const cutLen = parseFloat(cutRequiredLengthInput.value);
    const piecesQty = parseInt(cutPiecesQtyInput.value, 10);
    const shouldAddRemnant = cutAutoAddRemnant.checked;
    const reason = cutReasonInput.value.trim();

    if (isNaN(cutLen) || cutLen <= 0) {
      showToast('Please enter a valid cut length in feet', 'warning');
      return;
    }

    if (cutLen > rod.lengthFt) {
      showToast(`Cut length (${cutLen} ft) cannot exceed available rod length (${rod.lengthFt} ft)`, 'danger');
      return;
    }

    if (isNaN(piecesQty) || piecesQty <= 0) {
      showToast('Please specify at least 1 rod to cut', 'warning');
      return;
    }

    if (piecesQty > rod.quantity) {
      showToast(`Cannot cut ${piecesQty} rods. Only ${rod.quantity} available in stock!`, 'danger');
      return;
    }

    const origLength = Number(rod.lengthFt);
    const remainder = Number((origLength - cutLen).toFixed(2));
    let remnantMsg = '';

    // 1. MODIFY PREVIOUS ROD DATA:
    if (piecesQty === rod.quantity) {
      // All units of this rod entry were cut
      if (remainder > 0 && shouldAddRemnant) {
        // Look for an existing rod with the same name, diameter, and remainder length (excluding this rod)
        const existingRemnant = rods.find(r =>
          r.id !== rod.id &&
          r.name.toLowerCase() === rod.name.toLowerCase() &&
          Number(r.diameterMm) === Number(rod.diameterMm) &&
          Number(r.lengthFt) === remainder
        );

        if (existingRemnant) {
          // Merge into the existing rod of that length
          existingRemnant.quantity += piecesQty;
          existingRemnant.updatedAt = Date.now();
          rods = rods.filter(r => r.id !== rod.id);
          remnantMsg = ` Merged into existing ${rod.diameterMm}mm × ${remainder}ft stock (Total: <strong>${existingRemnant.quantity} units</strong>)!`;
        } else {
          // DIRECTLY MODIFY PREVIOUS ENTRY!
          rod.lengthFt = remainder;
          rod.updatedAt = Date.now();
          if (reason) {
            rod.notes = rod.notes ? `${rod.notes} | Cut: ${reason}` : `Cut: ${reason}`;
          }
          remnantMsg = ` Modified entry length to <strong>${remainder} ft</strong> (${rod.quantity} units in stock)!`;
        }
      } else {
        // Remainder is 0 or remnant offcut not kept
        rod.quantity = 0;
        rod.updatedAt = Date.now();
        remnantMsg = ` Stock fully consumed!`;
      }
    } else {
      // Some units of this rod entry were cut (piecesQty < rod.quantity)
      rod.quantity -= piecesQty;
      rod.updatedAt = Date.now();

      if (remainder > 0 && shouldAddRemnant) {
        const existingRemnant = rods.find(r =>
          r.name.toLowerCase() === rod.name.toLowerCase() &&
          Number(r.diameterMm) === Number(rod.diameterMm) &&
          Number(r.lengthFt) === remainder
        );

        if (existingRemnant) {
          existingRemnant.quantity += piecesQty;
          existingRemnant.updatedAt = Date.now();
          remnantMsg = ` Added to existing ${rod.diameterMm}mm × ${remainder}ft stock (Total: <strong>${existingRemnant.quantity} units</strong>)!`;
        } else {
          const newOffcutRod = {
            id: 'rod-cut-' + Date.now(),
            sku: rod.sku ? `${rod.sku}-CUT` : `ROD-${Math.round(rod.diameterMm)}MM-${Math.round(remainder)}FT`,
            name: rod.name,
            diameterMm: Number(rod.diameterMm),
            lengthFt: remainder,
            quantity: piecesQty,
            notes: `Cut from ${origLength}ft${reason ? ' (' + reason + ')' : ''}`,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          rods.push(newOffcutRod);
          remnantMsg = ` Created entry for <strong>${piecesQty} unit(s)</strong> of ${rod.diameterMm}mm × ${remainder}ft offcut!`;
        }
      }
    }

    // 2. Add to Cut Logs
    const logEntry = {
      id: 'log-' + Date.now(),
      timestamp: Date.now(),
      rodName: rod.name,
      diameterMm: Number(rod.diameterMm),
      originalLengthFt: origLength,
      cutLengthFt: cutLen,
      quantity: piecesQty,
      remainderFt: remainder,
      remnantAdded: remainder > 0 && shouldAddRemnant,
      reason: reason || 'Job Cut'
    };
    cutLogs.unshift(logEntry);

    // 3. Save to local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
    localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
    updateCutLogsBadge();
    updateDashboard();
    closeCutModal();

    // 4. Atomic Unified Sync to Backend (Google Sheets & Firebase)
    window.dispatchEvent(new CustomEvent('syncBothToBackend', {
      detail: { rods: rods, cutLogs: cutLogs }
    }));

    showToast(
      `✂️ <strong>Cut Successful!</strong> Processed cut of ${cutLen}ft from ${origLength}ft rod.${remnantMsg}`,
      'success',
      5500
    );
  }

  // --- CUT LOGS MODAL & AUDIT HISTORY ---
  function setCutLogsViewMode(mode) {
    cutLogsViewMode = mode;
    if (btnCutLogsCards && btnCutLogsTable) {
      btnCutLogsCards.classList.toggle('active', mode === 'cards');
      btnCutLogsTable.classList.toggle('active', mode === 'table');
    }
    if (cutLogsContentArea) {
      cutLogsContentArea.classList.toggle('force-cards-view', mode === 'cards');
      cutLogsContentArea.classList.toggle('force-table-view', mode === 'table');
    }
  }

  function openCutLogsModal() {
    filterCutLogsInput.value = '';
    // Automatically default to card view on phone screens (<= 768px)
    if (window.innerWidth <= 768) {
      setCutLogsViewMode('cards');
    } else {
      setCutLogsViewMode(cutLogsViewMode || 'table');
    }
    renderCutLogsTable();
    cutLogsModalOverlay.classList.remove('hidden');
    filterCutLogsInput.focus();
  }

  function closeCutLogsModal() {
    cutLogsModalOverlay.classList.add('hidden');
  }

  function renderCutLogsTable() {
    const keyword = filterCutLogsInput.value.trim().toLowerCase();

    const filteredLogs = cutLogs.filter(log => {
      if (!keyword) return true;
      const matchName = (log.rodName || '').toLowerCase().includes(keyword);
      const matchReason = (log.reason || '').toLowerCase().includes(keyword);
      const matchDia = (log.diameterMm + 'mm').includes(keyword);
      return matchName || matchReason || matchDia;
    });

    cutLogsCountText.textContent = `Showing ${filteredLogs.length} of ${cutLogs.length} logged cut(s)`;
    cutLogsTableBody.innerHTML = '';
    if (cutLogsCardsContainer) cutLogsCardsContainer.innerHTML = '';

    if (filteredLogs.length === 0) {
      if (cutLogsTableWrapper) cutLogsTableWrapper.classList.add('hidden');
      if (cutLogsCardsContainer) cutLogsCardsContainer.classList.add('hidden');
      cutLogsEmptyState.classList.remove('hidden');
      return;
    }

    if (cutLogsTableWrapper) cutLogsTableWrapper.classList.remove('hidden');
    if (cutLogsCardsContainer) cutLogsCardsContainer.classList.remove('hidden');
    cutLogsEmptyState.classList.add('hidden');

    filteredLogs.forEach(log => {
      const dateStr = new Date(log.timestamp).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      let remnantDisplay = '';
      let remnantCardBadge = '';
      if (log.remainderFt > 0) {
        remnantDisplay = `<span class="badge-cut-rem">✂️ +${log.remainderFt} ft</span> ${log.remnantAdded ? '<span style="font-size: 0.725rem; color: var(--success-solid); font-weight: 600;">(Added to stock)</span>' : ''}`;
        remnantCardBadge = `<span class="badge-cut-rem">✂️ Offcut +${log.remainderFt} ft</span> ${log.remnantAdded ? '<span style="font-size: 0.725rem; color: var(--success-solid); font-weight: 600;">(In Stock)</span>' : ''}`;
      } else {
        remnantDisplay = `<span class="badge-cut-exact">Exact Cut (0 scrap)</span>`;
        remnantCardBadge = `<span class="badge-cut-exact">Exact Cut (0 scrap)</span>`;
      }

      // 1. Table Row (for Desktop view)
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(log.rodName)}</div>
          <div class="font-mono text-muted" style="font-size: 0.75rem;">${log.diameterMm} mm diameter</div>
        </td>
        <td class="text-right font-mono">${log.originalLengthFt} ft</td>
        <td class="text-right font-mono" style="color: var(--danger-solid); font-weight: 700;">-${log.cutLengthFt} ft</td>
        <td class="text-right font-mono"><strong>${log.quantity}</strong></td>
        <td>${remnantDisplay}</td>
        <td><span style="font-size: 0.825rem; color: var(--text-secondary);">${escapeHtml(log.reason || '—')}</span></td>
      `;
      cutLogsTableBody.appendChild(tr);

      // 2. Card Element (for Mobile Phone view)
      if (cutLogsCardsContainer) {
        const card = document.createElement('div');
        card.className = 'cut-log-card';
        card.innerHTML = `
          <div class="cut-log-card-header">
            <div class="cut-log-card-title-group">
              <span class="cut-log-rod-name">${escapeHtml(log.rodName)}</span>
              <span class="cut-log-spec-pill">⌀ ${log.diameterMm} mm</span>
            </div>
            <span class="cut-log-date">${dateStr}</span>
          </div>

          <div class="cut-log-card-metrics">
            <div class="cut-log-metric-item">
              <span class="cut-log-metric-label">Original</span>
              <span class="cut-log-metric-value font-mono">${log.originalLengthFt} ft</span>
            </div>
            <div class="cut-log-metric-item">
              <span class="cut-log-metric-label">Cut Size</span>
              <span class="cut-log-metric-value cut-length font-mono">-${log.cutLengthFt} ft</span>
            </div>
            <div class="cut-log-metric-item">
              <span class="cut-log-metric-label">Quantity</span>
              <span class="cut-log-metric-value font-mono">${log.quantity} pc${log.quantity > 1 ? 's' : ''}</span>
            </div>
          </div>

          <div class="cut-log-card-remnant">
            <span class="cut-log-remnant-label">Remnant:</span>
            ${remnantCardBadge}
          </div>

          ${log.reason ? `
          <div class="cut-log-card-reason">
            <span class="cut-log-reason-icon">📌</span>
            <span class="cut-log-reason-text">${escapeHtml(log.reason)}</span>
          </div>
          ` : ''}
        `;
        cutLogsCardsContainer.appendChild(card);
      }
    });
  }

  function exportCutLogsCsv() {
    if (cutLogs.length === 0) {
      showToast('No cut logs to export', 'warning');
      return;
    }

    const headers = ['Timestamp', 'Rod Name', 'Diameter (mm)', 'Original Length (ft)', 'Cut Length (ft)', 'Quantity', 'Remainder Offcut (ft)', 'Remnant Added', 'Job Reason'];
    const rows = cutLogs.map(log => [
      escapeCsvField(new Date(log.timestamp).toISOString()),
      escapeCsvField(log.rodName || ''),
      log.diameterMm,
      log.originalLengthFt,
      log.cutLengthFt,
      log.quantity,
      log.remainderFt,
      log.remnantAdded ? 'Yes' : 'No',
      escapeCsvField(log.reason || '')
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Rod_Cut_History_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Cut logs exported to CSV successfully', 'success');
  }

  function clearCutLogs() {
    showConfirm(
      'Clear Cut History Logs?',
      'This will delete all recorded cutting log entries from storage. This will not change current stock quantities.',
      () => {
        cutLogs = [];
        saveCutLogsToStorage();
        updateCutLogsBadge();
        renderCutLogsTable();
        showToast('All cut history logs cleared', 'info');
      },
      true
    );
  }

  // --- ADD / EDIT ROD MODAL ACTIONS ---
  function openAddRodModal(prefillData = null) {
    rodForm.reset();
    rodEditId.value = '';
    modalTitle.textContent = 'Add New Rod Stock';
    btnSaveRodText.textContent = 'Save Rod to Stock';

    if (prefillData) {
      if (prefillData.diameter) formDiameterMm.value = prefillData.diameter;
      if (prefillData.length) formLengthFt.value = prefillData.length;
    }

    rodModalOverlay.classList.remove('hidden');
    formRodName.focus();
  }

  function openEditRodModal(id) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    rodEditId.value = rod.id;
    formRodName.value = rod.name;
    formDiameterMm.value = rod.diameterMm;
    formLengthFt.value = rod.lengthFt;
    formQuantity.value = rod.quantity;
    formSku.value = rod.sku || '';
    formNotes.value = rod.notes || '';

    modalTitle.textContent = 'Edit Rod Details';
    btnSaveRodText.textContent = 'Update Rod Stock';

    rodModalOverlay.classList.remove('hidden');
    formRodName.focus();
  }

  function closeRodModal() {
    rodModalOverlay.classList.add('hidden');
    rodForm.reset();
  }

  function handleSaveRodSubmit(e) {
    e.preventDefault();

    const name = formRodName.value.trim();
    const diameterMm = parseFloat(formDiameterMm.value);
    const lengthFt = parseFloat(formLengthFt.value);
    const quantity = parseInt(formQuantity.value, 10);
    const customSku = formSku.value.trim();
    const notes = formNotes.value.trim();
    const editId = rodEditId.value;

    if (!name) {
      showToast('Please enter a valid rod name or material type', 'warning');
      return;
    }
    if (isNaN(diameterMm) || diameterMm <= 0) {
      showToast('Please specify a positive diameter in millimeters', 'warning');
      return;
    }
    if (isNaN(lengthFt) || lengthFt <= 0) {
      showToast('Please specify a positive length in feet', 'warning');
      return;
    }
    if (isNaN(quantity) || quantity < 0) {
      showToast('Quantity cannot be negative', 'warning');
      return;
    }

    const autoSku = customSku || `ROD-${Math.round(diameterMm)}MM-${Math.round(lengthFt)}FT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Editing Existing Rod
    if (editId) {
      const index = rods.findIndex(r => r.id === editId);
      if (index !== -1) {
        rods[index] = {
          ...rods[index],
          name,
          diameterMm,
          lengthFt,
          quantity,
          sku: customSku || rods[index].sku,
          notes,
          updatedAt: Date.now()
        };
        saveRodsToStorage();
        updateDashboard();
        closeRodModal();
        showToast(`Updated "${name}" successfully`, 'success');
      }
      return;
    }

    // Adding New Rod: Duplicate Detection Check
    const duplicateMatch = rods.find(r =>
      r.name.toLowerCase() === name.toLowerCase() &&
      Number(r.diameterMm) === diameterMm &&
      Number(r.lengthFt) === lengthFt
    );

    if (duplicateMatch) {
      pendingDuplicateResolution = {
        existingRod: duplicateMatch,
        newRodData: {
          id: 'rod-' + Date.now(),
          sku: autoSku,
          name,
          diameterMm,
          lengthFt,
          quantity,
          notes,
          createdAt: Date.now()
        }
      };

      showDuplicatePrompt(duplicateMatch, quantity);
      return;
    }

    const newRod = {
      id: 'rod-' + Date.now(),
      sku: autoSku,
      name,
      diameterMm,
      lengthFt,
      quantity,
      notes,
      createdAt: Date.now()
    };

    rods.push(newRod);
    saveRodsToStorage();
    updateDashboard();
    closeRodModal();
    showToast(`Added ${quantity} units of "${name}" to stock`, 'success');
  }

  // --- DUPLICATE RESOLUTION DIALOG ---
  function showDuplicatePrompt(existingRod, addQuantity) {
    duplicateDetailsCard.innerHTML = `
      <div><strong>Existing Entry:</strong> ${escapeHtml(existingRod.name)} (${existingRod.diameterMm} mm × ${existingRod.lengthFt} ft)</div>
      <div style="margin-top: 4px;"><strong>Current Quantity:</strong> <span class="font-mono">${existingRod.quantity}</span> units</div>
      <div style="margin-top: 4px;"><strong>New Quantity to Add:</strong> <span class="font-mono">+${addQuantity}</span> units (New total: ${existingRod.quantity + addQuantity})</div>
    `;
    duplicateModalOverlay.classList.remove('hidden');
  }

  function resolveDuplicateMerge() {
    if (!pendingDuplicateResolution) return;
    const { existingRod, newRodData } = pendingDuplicateResolution;

    existingRod.quantity += newRodData.quantity;
    existingRod.updatedAt = Date.now();

    saveRodsToStorage();
    updateDashboard();
    duplicateModalOverlay.classList.add('hidden');
    closeRodModal();
    showToast(`Merged stock! "${existingRod.name}" quantity updated to ${existingRod.quantity}`, 'success');
    pendingDuplicateResolution = null;
  }

  function resolveDuplicateKeepSeparate() {
    if (!pendingDuplicateResolution) return;
    const { newRodData } = pendingDuplicateResolution;

    rods.push(newRodData);
    saveRodsToStorage();
    updateDashboard();
    duplicateModalOverlay.classList.add('hidden');
    closeRodModal();
    showToast(`Saved as new separate record "${newRodData.sku}"`, 'success');
    pendingDuplicateResolution = null;
  }

  function resolveDuplicateCancel() {
    duplicateModalOverlay.classList.add('hidden');
    pendingDuplicateResolution = null;
  }

  // --- DEDUCT WHOLE STOCK MODAL ACTIONS ---
  function openDeductModal(id) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    if (rod.quantity <= 0) {
      showToast('This rod has 0 available stock to deduct', 'warning');
      return;
    }

    deductRodId.value = rod.id;
    deductRodName.textContent = rod.name;
    deductRodDimensions.textContent = `${rod.diameterMm} mm diameter × ${rod.lengthFt} ft length (${rod.sku || 'No SKU'})`;
    deductRodAvailableQty.textContent = `${rod.quantity} units`;

    deductQuantityInput.max = rod.quantity;
    deductQuantityInput.value = '1';
    updateDeductRemainingHint(rod.quantity, 1);

    deductModalOverlay.classList.remove('hidden');
    deductQuantityInput.focus();
  }

  function updateDeductRemainingHint(currentQty, deductQty) {
    const remaining = currentQty - deductQty;
    if (remaining < 0) {
      deductRemainingHint.innerHTML = `<span style="color: var(--danger-solid); font-weight: 600;">Exceeds stock! Cannot deduct more than ${currentQty} units.</span>`;
    } else {
      deductRemainingHint.innerHTML = `Remaining after deduction: <strong>${remaining} units</strong>`;
    }
  }

  function closeDeductModal() {
    deductModalOverlay.classList.add('hidden');
    deductForm.reset();
  }

  function handleDeductSubmit(e) {
    e.preventDefault();

    const id = deductRodId.value;
    const deductAmount = parseInt(deductQuantityInput.value, 10);
    const reason = document.getElementById('deductReasonInput').value.trim();

    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    if (isNaN(deductAmount) || deductAmount <= 0) {
      showToast('Please enter a valid deduction quantity greater than zero', 'warning');
      return;
    }

    if (deductAmount > rod.quantity) {
      showToast(`Cannot deduct ${deductAmount} units. Only ${rod.quantity} available!`, 'danger');
      return;
    }

    rod.quantity -= deductAmount;
    rod.updatedAt = Date.now();

    const logEntry = {
      id: 'log-' + Date.now(),
      timestamp: Date.now(),
      rodName: rod.name,
      diameterMm: rod.diameterMm,
      originalLengthFt: rod.lengthFt,
      cutLengthFt: rod.lengthFt,
      quantity: deductAmount,
      remainderFt: 0,
      remnantAdded: false,
      reason: reason || 'Whole Rod Deduction'
    };
    cutLogs.unshift(logEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
    localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
    updateCutLogsBadge();
    updateDashboard();
    closeDeductModal();

    window.dispatchEvent(new CustomEvent('syncBothToBackend', {
      detail: { rods: rods, cutLogs: cutLogs }
    }));

    const reasonMsg = reason ? ` for "${reason}"` : '';
    showToast(`Deducted ${deductAmount} units of ${rod.name} (${rod.diameterMm}mm × ${rod.lengthFt}ft)${reasonMsg}. Remaining: ${rod.quantity}`, 'success');
  }

  // --- QUICK QUANTITY ADJUSTMENTS ---
  function quickAdjustQuantity(id, delta) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    const newQty = (Number(rod.quantity) || 0) + delta;
    if (newQty < 0) {
      showToast('Stock quantity cannot be less than zero', 'warning');
      return;
    }

    rod.quantity = newQty;
    rod.updatedAt = Date.now();
    saveRodsToStorage();
    updateDashboard();
    showToast(`Stock updated: ${rod.name} is now ${newQty}`, 'info', 2000);
  }

  // --- DELETE ROD ---
  function deleteRod(id) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    showConfirm(
      'Delete Rod from Stock?',
      `Are you sure you want to permanently delete "${rod.name}" (${rod.diameterMm}mm × ${rod.lengthFt}ft)? This action cannot be undone.`,
      () => {
        rods = rods.filter(r => r.id !== id);
        saveRodsToStorage();
        updateDashboard();
        showToast(`Deleted "${rod.name}" from inventory`, 'info');
      },
      true
    );
  }

  // --- CSV EXPORT & IMPORT ---
  function exportInventoryCsv() {
    if (rods.length === 0) {
      showToast('Inventory is empty. Nothing to export.', 'warning');
      return;
    }

    const headers = ['SKU', 'Rod Name', 'Diameter (mm)', 'Length (ft)', 'Quantity', 'Notes'];
    const rows = rods.map(r => [
      escapeCsvField(r.sku || ''),
      escapeCsvField(r.name || ''),
      r.diameterMm,
      r.lengthFt,
      r.quantity,
      escapeCsvField(r.notes || '')
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Rod_Inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Exported inventory to CSV successfully', 'success');
  }

  function escapeCsvField(str) {
    const stringVal = String(str);
    if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }
    return stringVal;
  }

  function handleCsvImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const text = evt.target.result;
        const importedCount = parseAndImportCsv(text);
        if (importedCount > 0) {
          saveRodsToStorage();
          updateDashboard();
          showToast(`Successfully imported ${importedCount} rod records from CSV!`, 'success');
        } else {
          showToast('No valid rod records found in CSV file', 'warning');
        }
      } catch (err) {
        showToast('Error importing CSV: ' + err.message, 'danger');
      } finally {
        csvFileInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  function parseAndImportCsv(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return 0;

    let addedCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCsvRow(lines[i]);
      if (parts.length < 5) continue;

      const sku = (parts[0] || '').trim();
      const name = (parts[1] || '').trim();
      const diameterMm = parseFloat(parts[2]);
      const lengthFt = parseFloat(parts[3]);
      const quantity = parseInt(parts[4], 10);
      const notes = (parts.length >= 7 ? parts[6] : parts[5] || '').trim();

      if (!name || isNaN(diameterMm) || diameterMm <= 0 || isNaN(lengthFt) || lengthFt <= 0 || isNaN(quantity) || quantity < 0) {
        continue;
      }

      rods.push({
        id: 'rod-csv-' + Date.now() + '-' + i,
        sku: sku || `ROD-${Math.round(diameterMm)}MM-${Math.round(lengthFt)}FT`,
        name,
        diameterMm,
        lengthFt,
        quantity,
        notes,
        createdAt: Date.now()
      });
      addedCount++;
    }
    return addedCount;
  }

  function parseCsvRow(rowText) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < rowText.length; i++) {
      const char = rowText[i];
      if (char === '"' && (i === 0 || rowText[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"'));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.replace(/^"|"$/g, '').replace(/""/g, '"'));
    return result;
  }

  // --- RESET & CLEAR DATA ---
  function resetToSampleData() {
    showConfirm(
      'Restore Sample Inventory?',
      'This will replace your current inventory with the default sample catalog. Are you sure?',
      () => {
        rods = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_RODS));
        saveRodsToStorage();
        updateDashboard();
        resetSmartSearch();
        showToast('Sample inventory restored successfully', 'success');
      },
      false
    );
  }

  function clearAllData() {
    showConfirm(
      'Clear All Inventory Data?',
      'This will delete ALL rods and quantities from local storage. This action cannot be reversed.',
      () => {
        rods = [];
        saveRodsToStorage();
        updateDashboard();
        resetSmartSearch();
        showToast('All inventory data cleared', 'warning');
      },
      true
    );
  }

  // --- EVENT LISTENERS SETUP ---
  function setupEventListeners() {
    const safeOn = (elem, evt, handler) => {
      if (elem && typeof elem.addEventListener === 'function') {
        elem.addEventListener(evt, handler);
      }
    };

    // Smart Search Form Submit
    safeOn(smartSearchForm, 'submit', (e) => {
      e.preventDefault();
      executeSmartSearch(searchDiameterInput ? searchDiameterInput.value : '', searchLengthInput ? searchLengthInput.value : '', true);
    });

    safeOn(btnResetSmartSearch, 'click', resetSmartSearch);

    // Empty state "suggest add"
    safeOn(btnEmptySuggestAdd, 'click', () => {
      openAddRodModal({
        diameter: searchDiameterInput ? searchDiameterInput.value : '',
        length: searchLengthInput ? searchLengthInput.value : ''
      });
    });

    // Add Rod Modal Open/Close
    safeOn(btnOpenAddModal, 'click', () => openAddRodModal());
    safeOn(btnCloseRodModal, 'click', closeRodModal);
    safeOn(btnCancelRodModal, 'click', closeRodModal);
    safeOn(rodForm, 'submit', handleSaveRodSubmit);

    // Deduct Modal (Whole Units)
    safeOn(btnCloseDeductModal, 'click', closeDeductModal);
    safeOn(btnCancelDeductModal, 'click', closeDeductModal);
    safeOn(deductForm, 'submit', handleDeductSubmit);

    safeOn(deductQuantityInput, 'input', () => {
      const rod = rods.find(r => r.id === (deductRodId ? deductRodId.value : ''));
      const val = parseInt(deductQuantityInput.value, 10) || 0;
      if (rod) {
        updateDeductRemainingHint(rod.quantity, val);
      }
    });

    safeOn(btnDeductStepDown, 'click', () => {
      const current = parseInt(deductQuantityInput.value, 10) || 1;
      if (current > 1) {
        deductQuantityInput.value = current - 1;
        deductQuantityInput.dispatchEvent(new Event('input'));
      }
    });

    safeOn(btnDeductStepUp, 'click', () => {
      const current = parseInt(deductQuantityInput.value, 10) || 0;
      const rod = rods.find(r => r.id === (deductRodId ? deductRodId.value : ''));
      if (rod && current < rod.quantity) {
        deductQuantityInput.value = current + 1;
        deductQuantityInput.dispatchEvent(new Event('input'));
      }
    });

    // Cut Rod Modal (Size Deduction with Remnant Offcut)
    safeOn(btnCloseCutModal, 'click', closeCutModal);
    safeOn(btnCancelCutModal, 'click', closeCutModal);
    safeOn(cutForm, 'submit', handleCutSubmit);

    safeOn(cutRequiredLengthInput, 'input', updateCutCalculations);
    safeOn(cutPiecesQtyInput, 'input', updateCutCalculations);

    safeOn(btnCutStepDown, 'click', () => {
      const current = parseInt(cutPiecesQtyInput.value, 10) || 1;
      if (current > 1) {
        cutPiecesQtyInput.value = current - 1;
        updateCutCalculations();
      }
    });

    safeOn(btnCutStepUp, 'click', () => {
      const current = parseInt(cutPiecesQtyInput.value, 10) || 0;
      const rod = rods.find(r => r.id === (cutRodId ? cutRodId.value : ''));
      if (rod && current < rod.quantity) {
        cutPiecesQtyInput.value = current + 1;
        updateCutCalculations();
      }
    });

    // Cut Logs Modal Listeners
    safeOn(btnOpenCutLogsModal, 'click', openCutLogsModal);
    safeOn(btnCloseCutLogsModal, 'click', closeCutLogsModal);
    safeOn(btnCloseCutLogsBottom, 'click', closeCutLogsModal);
    safeOn(filterCutLogsInput, 'input', renderCutLogsTable);
    safeOn(btnExportCutLogsCsv, 'click', exportCutLogsCsv);
    safeOn(btnClearCutLogs, 'click', clearCutLogs);
    safeOn(btnCutLogsCards, 'click', () => setCutLogsViewMode('cards'));
    safeOn(btnCutLogsTable, 'click', () => setCutLogsViewMode('table'));

    // PWA Install Listeners
    safeOn(btnInstallPwa, 'click', openInstallModal);
    safeOn(btnCloseInstallModal, 'click', closeInstallModal);
    safeOn(btnCloseInstallModalBtn, 'click', closeInstallModal);
    safeOn(btnTriggerInstallPrompt, 'click', openInstallModal);

    // Duplicate Dialog Buttons
    safeOn(btnDuplicateMerge, 'click', resolveDuplicateMerge);
    safeOn(btnDuplicateKeepSeparate, 'click', resolveDuplicateKeepSeparate);
    safeOn(btnDuplicateCancel, 'click', resolveDuplicateCancel);
    safeOn(btnCloseDuplicateModal, 'click', resolveDuplicateCancel);

    // Confirmation Modal
    safeOn(btnConfirmOk, 'click', () => {
      if (pendingConfirmCallback) {
        pendingConfirmCallback();
      }
      closeConfirmModal();
    });
    safeOn(btnConfirmCancel, 'click', closeConfirmModal);
    safeOn(btnCloseConfirmModal, 'click', closeConfirmModal);

    // Filters in Inventory
    safeOn(filterKeyword, 'input', renderInventoryTable);
    safeOn(filterDiameter, 'change', () => {
      renderQuickDiameterChips();
      renderInventoryTable();
    });
    safeOn(filterStockStatus, 'change', renderInventoryTable);
    safeOn(btnResetInventoryFilters, 'click', () => {
      if (filterKeyword) filterKeyword.value = '';
      if (filterDiameter) filterDiameter.value = 'all';
      if (filterStockStatus) filterStockStatus.value = 'all';
      renderQuickDiameterChips();
      renderInventoryTable();
    });

    // Table Column Sorting
    document.querySelectorAll('#inventoryTable th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderInventoryTable();
      });
    });

    // Delegated actions on tables
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      if (target.classList.contains('btn-quick-inc')) {
        const id = target.dataset.id;
        quickAdjustQuantity(id, 1);
      } else if (target.classList.contains('btn-quick-dec')) {
        const id = target.dataset.id;
        quickAdjustQuantity(id, -1);
      } else if (target.classList.contains('btn-open-cut')) {
        const id = target.dataset.id;
        const defaultCutLen = target.dataset.cutLen;
        openCutModal(id, defaultCutLen);
      } else if (target.classList.contains('btn-open-deduct')) {
        const id = target.dataset.id;
        openDeductModal(id);
      } else if (target.classList.contains('btn-open-edit')) {
        const id = target.dataset.id;
        openEditRodModal(id);
      } else if (target.classList.contains('btn-delete-rod')) {
        const id = target.dataset.id;
        deleteRod(id);
      } else if (target.classList.contains('btn-rod-more')) {
        const id = target.dataset.id;
        openMobileActionSheet(id);
      }
    });

    // View Switcher (Single-Line Row View vs Cards View)
    const btnViewRow = document.getElementById('btnViewRow');
    const btnViewCards = document.getElementById('btnViewCards');
    const inventoryTableContainer = document.getElementById('inventoryTableContainer');

    if (btnViewRow && btnViewCards && inventoryTableContainer) {
      btnViewRow.addEventListener('click', () => {
        inventoryTableContainer.classList.remove('inventory-card-view');
        btnViewRow.classList.add('active');
        btnViewCards.classList.remove('active');
      });
      btnViewCards.addEventListener('click', () => {
        inventoryTableContainer.classList.add('inventory-card-view');
        btnViewCards.classList.add('active');
        btnViewRow.classList.remove('active');
      });
    }

    // Mobile Action Sheet Modal Listeners
    setupMobileActionSheetListeners();

    // CSV Export & Import
    btnExportCsv.addEventListener('click', exportInventoryCsv);
    csvFileInput.addEventListener('change', handleCsvImport);

    // Reset & Clear data buttons
    btnResetSampleData.addEventListener('click', resetToSampleData);
    btnClearAllData.addEventListener('click', clearAllData);

    // Escape Key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (mobileActionSheetOverlay && !mobileActionSheetOverlay.classList.contains('hidden')) closeMobileActionSheet();
        if (!installModalOverlay.classList.contains('hidden')) closeInstallModal();
        if (!cutLogsModalOverlay.classList.contains('hidden')) closeCutLogsModal();
        if (!cutModalOverlay.classList.contains('hidden')) closeCutModal();
        if (!rodModalOverlay.classList.contains('hidden')) closeRodModal();
        if (!deductModalOverlay.classList.contains('hidden')) closeDeductModal();
        if (!duplicateModalOverlay.classList.contains('hidden')) resolveDuplicateCancel();
        if (!confirmModalOverlay.classList.contains('hidden')) closeConfirmModal();
      }
    });
  }

  // --- MOBILE ACTION SHEET FOR COMPACT ROWS ---
  let activeActionSheetRodId = null;
  const mobileActionSheetOverlay = document.getElementById('mobileActionSheetOverlay');
  const btnCloseActionSheet = document.getElementById('btnCloseActionSheet');
  const actionSheetRodName = document.getElementById('actionSheetRodName');
  const actionSheetRodSku = document.getElementById('actionSheetRodSku');
  const actionSheetDiameter = document.getElementById('actionSheetDiameter');
  const actionSheetLength = document.getElementById('actionSheetLength');
  const actionSheetQty = document.getElementById('actionSheetQty');
  const actionSheetStatus = document.getElementById('actionSheetStatus');
  const actionSheetNotesBox = document.getElementById('actionSheetNotesBox');
  const actionSheetNotesText = document.getElementById('actionSheetNotesText');
  const sheetQtyDisplay = document.getElementById('sheetQtyDisplay');
  const btnSheetDec = document.getElementById('btnSheetDec');
  const btnSheetInc = document.getElementById('btnSheetInc');
  const btnSheetCut = document.getElementById('btnSheetCut');
  const btnSheetDeduct = document.getElementById('btnSheetDeduct');
  const btnSheetEdit = document.getElementById('btnSheetEdit');
  const btnSheetDelete = document.getElementById('btnSheetDelete');

  function openMobileActionSheet(id) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;
    activeActionSheetRodId = id;

    if (actionSheetRodName) actionSheetRodName.textContent = rod.name;
    if (actionSheetRodSku) actionSheetRodSku.textContent = rod.sku || 'No SKU';
    if (actionSheetDiameter) actionSheetDiameter.textContent = `${rod.diameterMm} mm`;
    if (actionSheetLength) actionSheetLength.textContent = `${rod.lengthFt} ft`;
    if (actionSheetQty) actionSheetQty.textContent = `${rod.quantity} pcs`;
    if (sheetQtyDisplay) sheetQtyDisplay.textContent = rod.quantity;

    if (actionSheetStatus) {
      if (rod.quantity <= 0) {
        actionSheetStatus.innerHTML = '<span class="badge badge-danger">Out of Stock</span>';
      } else if (rod.quantity <= LOW_STOCK_THRESHOLD) {
        actionSheetStatus.innerHTML = `<span class="badge badge-warning">Low Stock (${rod.quantity})</span>`;
      } else {
        actionSheetStatus.innerHTML = '<span class="badge badge-success">In Stock</span>';
      }
    }

    if (rod.notes && rod.notes.trim()) {
      if (actionSheetNotesBox) actionSheetNotesBox.classList.remove('hidden');
      if (actionSheetNotesText) actionSheetNotesText.textContent = rod.notes;
    } else {
      if (actionSheetNotesBox) actionSheetNotesBox.classList.add('hidden');
    }

    if (mobileActionSheetOverlay) mobileActionSheetOverlay.classList.remove('hidden');
  }

  function closeMobileActionSheet() {
    if (mobileActionSheetOverlay) {
      mobileActionSheetOverlay.classList.add('hidden');
    }
    activeActionSheetRodId = null;
  }

  function setupMobileActionSheetListeners() {
    if (btnCloseActionSheet) {
      btnCloseActionSheet.addEventListener('click', closeMobileActionSheet);
    }
    if (mobileActionSheetOverlay) {
      mobileActionSheetOverlay.addEventListener('click', (e) => {
        if (e.target === mobileActionSheetOverlay) closeMobileActionSheet();
      });
    }

    if (btnSheetDec) {
      btnSheetDec.addEventListener('click', () => {
        if (!activeActionSheetRodId) return;
        quickAdjustQuantity(activeActionSheetRodId, -1);
        const rod = rods.find(r => r.id === activeActionSheetRodId);
        if (rod) {
          if (sheetQtyDisplay) sheetQtyDisplay.textContent = rod.quantity;
          if (actionSheetQty) actionSheetQty.textContent = `${rod.quantity} pcs`;
        }
      });
    }

    if (btnSheetInc) {
      btnSheetInc.addEventListener('click', () => {
        if (!activeActionSheetRodId) return;
        quickAdjustQuantity(activeActionSheetRodId, 1);
        const rod = rods.find(r => r.id === activeActionSheetRodId);
        if (rod) {
          if (sheetQtyDisplay) sheetQtyDisplay.textContent = rod.quantity;
          if (actionSheetQty) actionSheetQty.textContent = `${rod.quantity} pcs`;
        }
      });
    }

    if (btnSheetCut) {
      btnSheetCut.addEventListener('click', () => {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) openCutModal(id);
      });
    }

    if (btnSheetDeduct) {
      btnSheetDeduct.addEventListener('click', () => {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) openDeductModal(id);
      });
    }

    if (btnSheetEdit) {
      btnSheetEdit.addEventListener('click', () => {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) openEditRodModal(id);
      });
    }

    if (btnSheetDelete) {
      btnSheetDelete.addEventListener('click', () => {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) deleteRod(id);
      });
    }
  }

  // --- UTILITY: HTML ESCAPING ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose to window for Next.js to call after fetching Google Sheets data
  window.initVanillaApp = initApp;
  window.updateDashboardExternal = updateDashboard;
  window.setVanillaRods = (newRods) => { rods = newRods; };
  window.setVanillaCutLogs = (newLogs) => { cutLogs = newLogs; };

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(initApp, 50);
    } else {
      document.addEventListener('DOMContentLoaded', initApp);
    }
  }
})();
