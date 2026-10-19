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

  // --- DOM ELEMENT REFERENCES (DYNAMICALLY RESOLVED) ---
  let statTotalTypes, statTotalQuantity, statInStockTypes, statLowStockCount;
  let smartSearchForm, searchDiameterInput, searchLengthInput, btnResetSmartSearch;
  let smartSearchResultsContainer, smartResultsTableBody, smartResultsCount, smartResultsCriteria;
  let smartSearchEmptyState, smartSearchEmptyDesc, btnEmptySuggestAdd;
  let inventoryTableBody, inventoryEmptyState, inventoryCountSummary;
  let filterKeyword, filterDiameter, filterStockStatus, btnResetInventoryFilters, quickDiameterChipsTrack;
  let rodModalOverlay, btnOpenAddModal, btnCloseRodModal, btnCancelRodModal, rodForm, modalTitle, btnSaveRodText;
  let rodEditId, formRodName, formDiameterMm, formLengthFt, formQuantity, formSku, formNotes;
  let deductModalOverlay, btnCloseDeductModal, btnCancelDeductModal, deductForm, deductRodId;
  let deductRodName, deductRodDimensions, deductRodAvailableQty, deductQuantityInput, deductRemainingHint;
  let btnDeductStepDown, btnDeductStepUp;
  let cutModalOverlay, btnCloseCutModal, btnCancelCutModal, cutForm, cutRodId, cutRodName, cutRodDiameter;
  let cutRodFullLength, cutRodAvailableQty, cutRequiredLengthInput, cutPiecesQtyInput;
  let btnCutStepDown, btnCutStepUp, calcOrigLength, calcCutLength, calcRemainLength, calcRemainNote;
  let cutAutoAddRemnant, cutReasonInput, btnConfirmCut;
  let cutLogsModalOverlay, btnOpenCutLogsModal, btnCloseCutLogsModal, btnCloseCutLogsBottom, cutLogsBadge;
  let cutLogsTableBody, cutLogsEmptyState, filterCutLogsInput, btnExportCutLogsCsv, btnClearCutLogs;
  let cutLogsCountText, cutLogsContentArea, cutLogsTableWrapper, cutLogsCardsContainer;
  let btnCutLogsCards, btnCutLogsTable;
  let cutLogsViewMode = window.innerWidth <= 768 ? 'cards' : 'table';
  let btnInstallPwa, mobNavInstall, installModalOverlay, btnCloseInstallModal, btnCloseInstallModalBtn;
  let installPromptDirect, btnTriggerInstallPrompt, mobNavSearch, mobNavInventory, mobNavAdd, mobNavCutLogs;
  let duplicateModalOverlay, duplicateDetailsCard, btnDuplicateCancel, btnDuplicateKeepSeparate, btnDuplicateMerge, btnCloseDuplicateModal;
  let confirmModalOverlay, confirmDialogTitle, confirmDialogMessage, btnConfirmOk, btnConfirmCancel, btnCloseConfirmModal;
  let pendingConfirmCallback = null;
  let btnExportCsv, csvFileInput, toastContainer;
  let mobileActionSheetOverlay, btnCloseActionSheet, actionSheetRodName, actionSheetRodSku, actionSheetDiameter;
  let actionSheetLength, actionSheetQty, actionSheetStatus, actionSheetNotesBox, actionSheetNotesText;
  let sheetQtyDisplay, btnSheetDec, btnSheetInc, btnSheetCut, btnSheetDeduct, btnSheetEdit, btnSheetDelete;

  function refreshDomElements() {
    statTotalTypes = document.getElementById('statTotalTypes');
    statTotalQuantity = document.getElementById('statTotalQuantity');
    statInStockTypes = document.getElementById('statInStockTypes');
    statLowStockCount = document.getElementById('statLowStockCount');

    smartSearchForm = document.getElementById('smartSearchForm');
    searchDiameterInput = document.getElementById('searchDiameterInput');
    searchLengthInput = document.getElementById('searchLengthInput');
    btnResetSmartSearch = document.getElementById('btnResetSmartSearch');
    smartSearchResultsContainer = document.getElementById('smartSearchResultsContainer');
    smartResultsTableBody = document.getElementById('smartResultsTableBody');
    smartResultsCount = document.getElementById('smartResultsCount');
    smartResultsCriteria = document.getElementById('smartResultsCriteria');
    smartSearchEmptyState = document.getElementById('smartSearchEmptyState');
    smartSearchEmptyDesc = document.getElementById('smartSearchEmptyDesc');
    btnEmptySuggestAdd = document.getElementById('btnEmptySuggestAdd');

    inventoryTableBody = document.getElementById('inventoryTableBody');
    inventoryEmptyState = document.getElementById('inventoryEmptyState');
    inventoryCountSummary = document.getElementById('inventoryCountSummary');
    filterKeyword = document.getElementById('filterKeyword');
    filterDiameter = document.getElementById('filterDiameter');
    filterStockStatus = document.getElementById('filterStockStatus');
    btnResetInventoryFilters = document.getElementById('btnResetInventoryFilters');
    quickDiameterChipsTrack = document.getElementById('quickDiameterChipsTrack');

    rodModalOverlay = document.getElementById('rodModalOverlay');
    btnOpenAddModal = document.getElementById('btnOpenAddModal');
    btnCloseRodModal = document.getElementById('btnCloseRodModal');
    btnCancelRodModal = document.getElementById('btnCancelRodModal');
    rodForm = document.getElementById('rodForm');
    modalTitle = document.getElementById('modalTitle');
    btnSaveRodText = document.getElementById('btnSaveRodText');
    rodEditId = document.getElementById('rodEditId');
    formRodName = document.getElementById('formRodName');
    formDiameterMm = document.getElementById('formDiameterMm');
    formLengthFt = document.getElementById('formLengthFt');
    formQuantity = document.getElementById('formQuantity');
    formSku = document.getElementById('formSku');
    formNotes = document.getElementById('formNotes');

    deductModalOverlay = document.getElementById('deductModalOverlay');
    btnCloseDeductModal = document.getElementById('btnCloseDeductModal');
    btnCancelDeductModal = document.getElementById('btnCancelDeductModal');
    deductForm = document.getElementById('deductForm');
    deductRodId = document.getElementById('deductRodId');
    deductRodName = document.getElementById('deductRodName');
    deductRodDimensions = document.getElementById('deductRodDimensions');
    deductRodAvailableQty = document.getElementById('deductRodAvailableQty');
    deductQuantityInput = document.getElementById('deductQuantityInput');
    deductRemainingHint = document.getElementById('deductRemainingHint');
    btnDeductStepDown = document.getElementById('btnDeductStepDown');
    btnDeductStepUp = document.getElementById('btnDeductStepUp');

    cutModalOverlay = document.getElementById('cutModalOverlay');
    btnCloseCutModal = document.getElementById('btnCloseCutModal');
    btnCancelCutModal = document.getElementById('btnCancelCutModal');
    cutForm = document.getElementById('cutForm');
    cutRodId = document.getElementById('cutRodId');
    cutRodName = document.getElementById('cutRodName');
    cutRodDiameter = document.getElementById('cutRodDiameter');
    cutRodFullLength = document.getElementById('cutRodFullLength');
    cutRodAvailableQty = document.getElementById('cutRodAvailableQty');
    cutRequiredLengthInput = document.getElementById('cutRequiredLengthInput');
    cutPiecesQtyInput = document.getElementById('cutPiecesQtyInput');
    btnCutStepDown = document.getElementById('btnCutStepDown');
    btnCutStepUp = document.getElementById('btnCutStepUp');
    calcOrigLength = document.getElementById('calcOrigLength');
    calcCutLength = document.getElementById('calcCutLength');
    calcRemainLength = document.getElementById('calcRemainLength');
    calcRemainNote = document.getElementById('calcRemainNote');
    cutAutoAddRemnant = document.getElementById('cutAutoAddRemnant');
    cutReasonInput = document.getElementById('cutReasonInput');
    btnConfirmCut = document.getElementById('btnConfirmCut');

    cutLogsModalOverlay = document.getElementById('cutLogsModalOverlay');
    btnOpenCutLogsModal = document.getElementById('btnOpenCutLogsModal');
    btnCloseCutLogsModal = document.getElementById('btnCloseCutLogsModal');
    btnCloseCutLogsBottom = document.getElementById('btnCloseCutLogsBottom');
    cutLogsBadge = document.getElementById('cutLogsBadge');
    cutLogsTableBody = document.getElementById('cutLogsTableBody');
    cutLogsEmptyState = document.getElementById('cutLogsEmptyState');
    filterCutLogsInput = document.getElementById('filterCutLogsInput');
    btnExportCutLogsCsv = document.getElementById('btnExportCutLogsCsv');
    btnClearCutLogs = document.getElementById('btnClearCutLogs');
    cutLogsCountText = document.getElementById('cutLogsCountText');
    cutLogsContentArea = document.getElementById('cutLogsContentArea');
    cutLogsTableWrapper = document.getElementById('cutLogsTableWrapper');
    cutLogsCardsContainer = document.getElementById('cutLogsCardsContainer');
    btnCutLogsCards = document.getElementById('btnCutLogsCards');
    btnCutLogsTable = document.getElementById('btnCutLogsTable');

    btnInstallPwa = document.getElementById('btnInstallPwa');
    mobNavInstall = document.getElementById('mobNavInstall');
    installModalOverlay = document.getElementById('installModalOverlay');
    btnCloseInstallModal = document.getElementById('btnCloseInstallModal');
    btnCloseInstallModalBtn = document.getElementById('btnCloseInstallModalBtn');
    installPromptDirect = document.getElementById('installPromptDirect');
    btnTriggerInstallPrompt = document.getElementById('btnTriggerInstallPrompt');
    mobNavSearch = document.getElementById('mobNavSearch');
    mobNavInventory = document.getElementById('mobNavInventory');
    mobNavAdd = document.getElementById('mobNavAdd');
    mobNavCutLogs = document.getElementById('mobNavCutLogs');

    duplicateModalOverlay = document.getElementById('duplicateModalOverlay');
    duplicateDetailsCard = document.getElementById('duplicateDetailsCard');
    btnDuplicateCancel = document.getElementById('btnDuplicateCancel');
    btnDuplicateKeepSeparate = document.getElementById('btnDuplicateKeepSeparate');
    btnDuplicateMerge = document.getElementById('btnDuplicateMerge');
    btnCloseDuplicateModal = document.getElementById('btnCloseDuplicateModal');

    confirmModalOverlay = document.getElementById('confirmModalOverlay');
    confirmDialogTitle = document.getElementById('confirmDialogTitle');
    confirmDialogMessage = document.getElementById('confirmDialogMessage');
    btnConfirmOk = document.getElementById('btnConfirmOk');
    btnConfirmCancel = document.getElementById('btnConfirmCancel');
    btnCloseConfirmModal = document.getElementById('btnCloseConfirmModal');

    btnExportCsv = document.getElementById('btnExportCsv');
    csvFileInput = document.getElementById('csvFileInput');
    toastContainer = document.getElementById('toastContainer');

    mobileActionSheetOverlay = document.getElementById('mobileActionSheetOverlay');
    btnCloseActionSheet = document.getElementById('btnCloseActionSheet');
    actionSheetRodName = document.getElementById('actionSheetRodName');
    actionSheetRodSku = document.getElementById('actionSheetRodSku');
    actionSheetDiameter = document.getElementById('actionSheetDiameter');
    actionSheetLength = document.getElementById('actionSheetLength');
    actionSheetQty = document.getElementById('actionSheetQty');
    actionSheetStatus = document.getElementById('actionSheetStatus');
    actionSheetNotesBox = document.getElementById('actionSheetNotesBox');
    actionSheetNotesText = document.getElementById('actionSheetNotesText');
    sheetQtyDisplay = document.getElementById('sheetQtyDisplay');
    btnSheetDec = document.getElementById('btnSheetDec');
    btnSheetInc = document.getElementById('btnSheetInc');
    btnSheetCut = document.getElementById('btnSheetCut');
    btnSheetDeduct = document.getElementById('btnSheetDeduct');
    btnSheetEdit = document.getElementById('btnSheetEdit');
    btnSheetDelete = document.getElementById('btnSheetDelete');
  }

  // --- INITIALIZATION ---
  let isAppInitialized = false;
  function initApp() {
    refreshDomElements();
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
      if (window.__INITIAL_RODS__ && Array.isArray(window.__INITIAL_RODS__) && window.__INITIAL_RODS__.length > 0) {
        rods = JSON.parse(JSON.stringify(window.__INITIAL_RODS__));
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              rods = parsed;
            } else if (window.__INITIAL_RODS__ && Array.isArray(window.__INITIAL_RODS__)) {
              rods = JSON.parse(JSON.stringify(window.__INITIAL_RODS__));
            } else {
              rods = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_RODS));
            }
          } catch {
            rods = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_RODS));
          }
        } else if (window.__INITIAL_RODS__ && Array.isArray(window.__INITIAL_RODS__)) {
          rods = JSON.parse(JSON.stringify(window.__INITIAL_RODS__));
        } else {
          rods = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_RODS));
        }
      }
      rods.forEach(r => {
        if (r.location !== undefined) delete r.location;
      });
      // Optionally sync to local as backup if we have valid rods
      if (rods.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
      }
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
      if (window.__INITIAL_CUT_LOGS__ && Array.isArray(window.__INITIAL_CUT_LOGS__) && window.__INITIAL_CUT_LOGS__.length > 0) {
        cutLogs = JSON.parse(JSON.stringify(window.__INITIAL_CUT_LOGS__));
      } else {
        const stored = localStorage.getItem(CUT_LOGS_STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              cutLogs = parsed;
            } else {
              cutLogs = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_CUT_LOGS));
            }
          } catch {
            cutLogs = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_CUT_LOGS));
          }
        } else {
          cutLogs = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_CUT_LOGS));
        }
      }
      if (cutLogs.length > 0) {
        localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
      }
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
    refreshDomElements();

    // 1. Calculate KPI Metrics
    const totalTypes = rods.length;
    const totalQuantity = rods.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
    const inStockTypes = rods.filter(r => (Number(r.quantity) || 0) > 0).length;
    const lowStockCount = rods.filter(r => {
      const q = Number(r.quantity) || 0;
      return q > 0 && q <= LOW_STOCK_THRESHOLD;
    }).length;

    // KPI numbers
    if (statTotalTypes) statTotalTypes.textContent = totalTypes.toLocaleString();
    if (statTotalQuantity) statTotalQuantity.textContent = totalQuantity.toLocaleString();
    if (statInStockTypes) statInStockTypes.textContent = inStockTypes.toLocaleString();
    if (statLowStockCount) statLowStockCount.textContent = lowStockCount.toLocaleString();

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
    if (!filterDiameter) return;
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
    if (!quickDiameterChipsTrack || !filterDiameter) return;
    const currentDia = filterDiameter.value;
    const diameters = [...new Set(rods.map(r => Number(r.diameterMm)))].sort((a, b) => a - b);

    quickDiameterChipsTrack.innerHTML = '';

    // "All" Chip
    const allBtn = document.createElement('button');
    allBtn.className = `chip-btn ${currentDia === 'all' ? 'active' : ''}`;
    allBtn.textContent = 'All Sizes';
    allBtn.onclick = () => {
      if (filterDiameter) filterDiameter.value = 'all';
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
        if (filterDiameter) filterDiameter.value = d;
        renderQuickDiameterChips();
        renderInventoryTable();
      };
      quickDiameterChipsTrack.appendChild(chip);
    });
  }

  // --- INVENTORY TABLE RENDERING ---
  function renderInventoryTable() {
    if (!inventoryTableBody) refreshDomElements();
    if (!inventoryTableBody) return;

    const keyword = filterKeyword ? filterKeyword.value.trim().toLowerCase() : '';
    const diaFilter = filterDiameter ? filterDiameter.value : 'all';


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
      if (inventoryTableBody && inventoryTableBody.parentElement) inventoryTableBody.parentElement.classList.add('hidden');
      if (inventoryEmptyState) inventoryEmptyState.classList.remove('hidden');
      if (inventoryCountSummary) inventoryCountSummary.textContent = `Showing 0 of ${rods.length} records`;
      return;
    }

    if (inventoryTableBody && inventoryTableBody.parentElement) inventoryTableBody.parentElement.classList.remove('hidden');
    if (inventoryEmptyState) inventoryEmptyState.classList.add('hidden');
    if (inventoryCountSummary) inventoryCountSummary.textContent = `Showing ${filtered.length} of ${rods.length} records`;

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
      `✂️ <strong>Cut Successful!</strong> Processed cut of ${cutLen}ft from ${origLength}ft rod.${remnantMsg} Click 🖨️ in Cut Logs to reprint the slip.`,
      'success',
      5500
    );

    // 5. Auto-print invoice slip
    printCutSlip(logEntry);
  }

  // --- CUT SLIP INVOICE PRINTER ---
  function printCutSlip(log) {
    const dateStr = new Date(log.timestamp).toLocaleString([], {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const refNo = log.id.toUpperCase().replace('LOG-', 'CUT-');
    const remnantLine = log.remainderFt > 0
      ? `<span class="slip-tag slip-tag-rem">✂️ ${log.remainderFt} ft offcut ${log.remnantAdded ? '(Added to Stock)' : '(Not Added)'}</span>`
      : `<span class="slip-tag slip-tag-exact">🎯 Exact Cut — 0 ft scrap</span>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cut Invoice — ${refNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f0f4f8;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 16px;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .slip {
      width: 340px; background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.13);
      overflow: hidden;
      page-break-inside: avoid;
    }
    /* ---- Header ---- */
    .slip-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
      padding: 20px 22px 16px;
      display: flex; align-items: center; gap: 12px;
    }
    .slip-logo {
      width: 38px; height: 38px;
      background: rgba(255,255,255,0.12);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .slip-brand { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.3px; }
    .slip-brand span { color: #38bdf8; }
    .slip-tagline { font-size: 0.7rem; color: rgba(255,255,255,0.55); margin-top: 1px; }
    /* ---- Title bar ---- */
    .slip-title-bar {
      background: #0ea5e9;
      color: #fff;
      text-align: center;
      padding: 8px 12px;
      font-size: 0.72rem; font-weight: 700;
      letter-spacing: 1.5px; text-transform: uppercase;
    }
    /* ---- Body ---- */
    .slip-body { padding: 18px 22px; }
    .slip-ref {
      font-size: 0.68rem; color: #64748b; font-weight: 600;
      letter-spacing: 0.8px; text-transform: uppercase;
      margin-bottom: 4px;
    }
    .slip-rod-name {
      font-size: 1.05rem; font-weight: 800; color: #0f172a;
      line-height: 1.25; margin-bottom: 14px;
      border-bottom: 2px dashed #e2e8f0; padding-bottom: 12px;
    }
    .slip-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 10px; margin-bottom: 14px;
    }
    .slip-field { display: flex; flex-direction: column; gap: 2px; }
    .slip-field-label {
      font-size: 0.62rem; color: #94a3b8;
      font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase;
    }
    .slip-field-value {
      font-size: 0.95rem; font-weight: 700; color: #1e293b;
      font-variant-numeric: tabular-nums;
    }
    .slip-field-value.large { font-size: 1.1rem; color: #0071e3; }
    .slip-field-value.danger { color: #dc2626; }
    .slip-divider { border: none; border-top: 1px dashed #cbd5e1; margin: 12px 0; }
    .slip-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .slip-row-label { font-size: 0.72rem; color: #64748b; font-weight: 500; }
    .slip-row-val { font-size: 0.8rem; font-weight: 600; color: #1e293b; text-align: right; max-width: 58%; }
    /* ---- Tags ---- */
    .slip-tag {
      display: inline-block; border-radius: 6px;
      font-size: 0.7rem; font-weight: 700; padding: 3px 8px;
      margin-top: 4px;
    }
    .slip-tag-rem { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .slip-tag-exact { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    /* ---- Footer ---- */
    .slip-footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 12px 22px;
      text-align: center;
    }
    .slip-footer-date { font-size: 0.68rem; color: #94a3b8; margin-bottom: 6px; }
    .slip-barcode {
      display: flex; justify-content: center; gap: 1.5px;
      margin: 6px auto 4px; width: 120px; height: 22px;
    }
    .slip-barcode-bar {
      background: #475569;
      border-radius: 1px;
    }
    .slip-verified {
      font-size: 0.62rem; color: #94a3b8;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    /* ---- Print controls (hidden in print) ---- */
    .slip-actions {
      padding: 14px 22px 20px;
      display: flex; gap: 8px; justify-content: center;
    }
    .btn-slip {
      border: none; border-radius: 10px; cursor: pointer;
      font-family: inherit; font-weight: 600; font-size: 0.85rem;
      padding: 9px 20px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .btn-slip:active { transform: scale(0.97); }
    .btn-slip-print {
      background: #0071e3; color: #fff;
      box-shadow: 0 2px 10px rgba(0,113,227,0.35);
    }
    .btn-slip-close { background: #e2e8f0; color: #475569; }
    @media print {
      body { background: #fff; min-height: unset; padding: 0; }
      .slip {
        box-shadow: none; border-radius: 0;
        width: 100%; page-break-inside: avoid;
      }
      .slip-actions { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="slip">
    <div class="slip-header">
      <div class="slip-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="20" x2="20" y2="4"/>
          <circle cx="8" cy="8" r="3"/>
          <circle cx="16" cy="16" r="3"/>
        </svg>
      </div>
      <div>
        <div class="slip-brand">Rod<span>Sync</span></div>
        <div class="slip-tagline">Metal Rod Inventory &amp; Cut Optimizer</div>
      </div>
    </div>

    <div class="slip-title-bar">✂ Cut Invoice / Dispatch Slip</div>

    <div class="slip-body">
      <div class="slip-ref">🔢 Ref: ${refNo}</div>
      <div class="slip-rod-name">${escapeForHtml(log.rodName)}</div>

      <div class="slip-grid">
        <div class="slip-field">
          <span class="slip-field-label">📏 Diameter</span>
          <span class="slip-field-value">${log.diameterMm} mm</span>
        </div>
        <div class="slip-field">
          <span class="slip-field-label">📦 Qty Cut</span>
          <span class="slip-field-value">${log.quantity} pc${log.quantity > 1 ? 's' : ''}</span>
        </div>
        <div class="slip-field">
          <span class="slip-field-label">📐 Cut Length</span>
          <span class="slip-field-value large danger">${log.cutLengthFt} ft</span>
        </div>
        <div class="slip-field">
          <span class="slip-field-label">📏 Original Length</span>
          <span class="slip-field-value">${log.originalLengthFt} ft</span>
        </div>
      </div>

      <div class="slip-field" style="margin-bottom: 12px;">
        <span class="slip-field-label">📏 Remaining Offcut</span>
        <span class="slip-field-value" style="font-size:0.9rem; margin-top:3px;">${remnantLine}</span>
      </div>

      <hr class="slip-divider" />

      <div class="slip-row">
        <span class="slip-row-label">👤 Operator / Job Ref</span>
        <span class="slip-row-val">${escapeForHtml(log.reason || 'Not specified')}</span>
      </div>
      <div class="slip-row">
        <span class="slip-row-label">📅 Date &amp; Time</span>
        <span class="slip-row-val">${dateStr}</span>
      </div>
    </div>

    <div class="slip-footer">
      <div class="slip-footer-date">Printed: ${new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <div class="slip-barcode">
        ${Array.from({ length: 28 }, (_, i) =>
      `<div class="slip-barcode-bar" style="width:${[2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 3, 2, 1, 3, 1, 2, 1, 3, 2, 1, 1, 3, 2, 1, 2, 1][i] || 1}px; opacity:${0.5 + Math.random() * 0.5};"></div>`
    ).join('')}
      </div>
      <div class="slip-verified">RodSync Verified Cut Record</div>
    </div>

    <div class="slip-actions">
      <button class="btn-slip btn-slip-print" onclick="window.print()">🖨️ Print Slip</button>
      <button class="btn-slip btn-slip-close" onclick="window.close()">✕ Close</button>
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,menubar=0,scrollbars=1');
    if (!win) {
      showToast('⚠️ Pop-up blocked! Please allow pop-ups to print the cut slip.', 'warning', 6000);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // Simple HTML escape helper for use inside printCutSlip strings
  function escapeForHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-xs btn-print-slip" data-log-id="${log.id}" title="Print cut invoice slip"
            style="padding:3px 8px; font-size:0.72rem; white-space:nowrap;">
            🖨️ Slip
          </button>
        </td>
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

          <div style="margin-top: 10px; border-top: 1px dashed var(--border-subtle); padding-top: 10px;">
            <button class="btn btn-secondary btn-sm btn-print-slip" data-log-id="${log.id}"
              style="width:100%; font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:6px;">
              🖨️ Print Cut Invoice Slip
            </button>
          </div>
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
    refreshDomElements();
    if (!rodModalOverlay) return;

    if (rodForm) rodForm.reset();
    if (rodEditId) rodEditId.value = '';
    if (modalTitle) modalTitle.textContent = 'Add New Rod Stock';
    if (btnSaveRodText) btnSaveRodText.textContent = 'Save Rod to Stock';

    if (prefillData) {
      if (prefillData.diameter && formDiameterMm) formDiameterMm.value = prefillData.diameter;
      if (prefillData.length && formLengthFt) formLengthFt.value = prefillData.length;
    }

    rodModalOverlay.classList.remove('hidden');
    if (formRodName) setTimeout(() => formRodName.focus(), 50);
  }

  function openEditRodModal(id) {
    refreshDomElements();
    const rod = rods.find(r => r.id === id);
    if (!rod) {
      showToast('Rod not found', 'warning');
      return;
    }

    if (rodEditId) rodEditId.value = rod.id;
    if (formRodName) formRodName.value = rod.name || '';
    if (formDiameterMm) formDiameterMm.value = rod.diameterMm ?? '';
    if (formLengthFt) formLengthFt.value = rod.lengthFt ?? '';
    if (formQuantity) formQuantity.value = rod.quantity ?? 0;
    if (formSku) formSku.value = rod.sku || '';
    if (formNotes) formNotes.value = rod.notes || '';

    if (modalTitle) modalTitle.textContent = 'Edit Rod Details';
    if (btnSaveRodText) btnSaveRodText.textContent = 'Update Rod Stock';

    if (rodModalOverlay) {
      rodModalOverlay.classList.remove('hidden');
    }
    if (formRodName) setTimeout(() => formRodName.focus(), 50);
  }

  function closeRodModal() {
    refreshDomElements();
    if (rodModalOverlay) rodModalOverlay.classList.add('hidden');
    if (rodForm) rodForm.reset();
  }

  function handleSaveRodSubmit(e) {
    e.preventDefault();
    refreshDomElements();

    const name = formRodName ? formRodName.value.trim() : '';
    const diameterMm = formDiameterMm ? parseFloat(formDiameterMm.value) : NaN;
    const lengthFt = formLengthFt ? parseFloat(formLengthFt.value) : NaN;
    const quantity = formQuantity ? parseInt(formQuantity.value, 10) : NaN;
    const customSku = formSku ? formSku.value.trim() : '';
    const notes = formNotes ? formNotes.value.trim() : '';
    const editId = rodEditId ? rodEditId.value : '';

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
    // Delegated click handling on document
    document.addEventListener('click', (e) => {
      // 1. Add Rod Stock / Add Product button triggers
      const addBtn = e.target.closest('#btnOpenAddModal, .btn-add-main, #mobNavAdd, #btnEmptySuggestAdd');
      if (addBtn) {
        e.preventDefault();
        if (addBtn.id === 'btnEmptySuggestAdd') {
          refreshDomElements();
          openAddRodModal({
            diameter: searchDiameterInput ? searchDiameterInput.value : '',
            length: searchLengthInput ? searchLengthInput.value : ''
          });
        } else {
          openAddRodModal();
        }
        return;
      }

      // 2. Rod Modal Close / Cancel buttons
      const closeRodBtn = e.target.closest('#btnCloseRodModal, #btnCancelRodModal');
      if (closeRodBtn) {
        e.preventDefault();
        closeRodModal();
        return;
      }

      // 3. Cut Rod Modal Close / Cancel
      const closeCutBtn = e.target.closest('#btnCloseCutModal, #btnCancelCutModal');
      if (closeCutBtn) {
        e.preventDefault();
        closeCutModal();
        return;
      }

      // 4. Deduct Modal Close / Cancel
      const closeDeductBtn = e.target.closest('#btnCloseDeductModal, #btnCancelDeductModal');
      if (closeDeductBtn) {
        e.preventDefault();
        closeDeductModal();
        return;
      }

      // 5. Cut Logs Modal Close
      const closeCutLogsBtn = e.target.closest('#btnCloseCutLogsModal, #btnCloseCutLogsBottom');
      if (closeCutLogsBtn) {
        e.preventDefault();
        closeCutLogsModal();
        return;
      }

      // 6. Direct overlay backdrop clicks
      if (e.target.id === 'rodModalOverlay') { closeRodModal(); return; }
      if (e.target.id === 'deductModalOverlay') { closeDeductModal(); return; }
      if (e.target.id === 'cutModalOverlay') { closeCutModal(); return; }
      if (e.target.id === 'cutLogsModalOverlay') { closeCutLogsModal(); return; }
      if (e.target.id === 'mobileActionSheetOverlay') { closeMobileActionSheet(); return; }
      if (e.target.id === 'installModalOverlay') { closeInstallModal(); return; }
      if (e.target.id === 'duplicateModalOverlay') { resolveDuplicateCancel(); return; }
      if (e.target.id === 'confirmModalOverlay') { closeConfirmModal(); return; }

      // 7. Table sorting click
      const th = e.target.closest('#inventoryTable th.sortable');
      if (th) {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderInventoryTable();
        return;
      }

      // 8. General button clicks
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
      } else if (target.classList.contains('btn-print-slip')) {
        const logId = target.dataset.logId;
        const logEntry = cutLogs.find(l => l.id === logId);
        if (logEntry) printCutSlip(logEntry);
      } else if (target.id === 'btnOpenCutLogsModal') {
        openCutLogsModal();
      } else if (target.id === 'btnExportCutLogsCsv') {
        exportCutLogsCsv();
      } else if (target.id === 'btnClearCutLogs') {
        clearCutLogs();
      } else if (target.id === 'btnCutLogsCards') {
        setCutLogsViewMode('cards');
      } else if (target.id === 'btnCutLogsTable') {
        setCutLogsViewMode('table');
      } else if (target.id === 'btnResetInventoryFilters') {
        refreshDomElements();
        if (filterKeyword) filterKeyword.value = '';
        if (filterDiameter) filterDiameter.value = 'all';
        if (filterStockStatus) filterStockStatus.value = 'all';
        renderQuickDiameterChips();
        renderInventoryTable();
      } else if (target.id === 'btnResetSmartSearch') {
        resetSmartSearch();
      } else if (target.id === 'btnInstallPwa' || target.id === 'mobNavInstall' || target.id === 'btnTriggerInstallPrompt') {
        openInstallModal();
      } else if (target.id === 'btnCloseInstallModal' || target.id === 'btnCloseInstallModalBtn') {
        closeInstallModal();
      } else if (target.id === 'btnDuplicateMerge') {
        resolveDuplicateMerge();
      } else if (target.id === 'btnDuplicateKeepSeparate') {
        resolveDuplicateKeepSeparate();
      } else if (target.id === 'btnDuplicateCancel' || target.id === 'btnCloseDuplicateModal') {
        resolveDuplicateCancel();
      } else if (target.id === 'btnConfirmOk') {
        if (pendingConfirmCallback) pendingConfirmCallback();
        closeConfirmModal();
      } else if (target.id === 'btnConfirmCancel' || target.id === 'btnCloseConfirmModal') {
        closeConfirmModal();
      } else if (target.id === 'btnExportCsv') {
        exportInventoryCsv();
      } else if (target.id === 'btnCutStepDown') {
        refreshDomElements();
        const current = parseInt(cutPiecesQtyInput ? cutPiecesQtyInput.value : '1', 10) || 1;
        if (current > 1 && cutPiecesQtyInput) {
          cutPiecesQtyInput.value = current - 1;
          updateCutCalculations();
        }
      } else if (target.id === 'btnCutStepUp') {
        refreshDomElements();
        const current = parseInt(cutPiecesQtyInput ? cutPiecesQtyInput.value : '0', 10) || 0;
        const rod = rods.find(r => r.id === (cutRodId ? cutRodId.value : ''));
        if (rod && current < rod.quantity && cutPiecesQtyInput) {
          cutPiecesQtyInput.value = current + 1;
          updateCutCalculations();
        }
      } else if (target.id === 'btnDeductStepDown') {
        refreshDomElements();
        const current = parseInt(deductQuantityInput ? deductQuantityInput.value : '1', 10) || 1;
        if (current > 1 && deductQuantityInput) {
          deductQuantityInput.value = current - 1;
          const rod = rods.find(r => r.id === (deductRodId ? deductRodId.value : ''));
          if (rod) updateDeductRemainingHint(rod.quantity, current - 1);
        }
      } else if (target.id === 'btnDeductStepUp') {
        refreshDomElements();
        const current = parseInt(deductQuantityInput ? deductQuantityInput.value : '0', 10) || 0;
        const rod = rods.find(r => r.id === (deductRodId ? deductRodId.value : ''));
        if (rod && current < rod.quantity && deductQuantityInput) {
          deductQuantityInput.value = current + 1;
          updateDeductRemainingHint(rod.quantity, current + 1);
        }
      } else if (target.id === 'btnCloseActionSheet') {
        closeMobileActionSheet();
      } else if (target.id === 'btnSheetDec') {
        if (activeActionSheetRodId) {
          quickAdjustQuantity(activeActionSheetRodId, -1);
          const rod = rods.find(r => r.id === activeActionSheetRodId);
          if (rod) {
            refreshDomElements();
            if (sheetQtyDisplay) sheetQtyDisplay.textContent = rod.quantity;
            if (actionSheetQty) actionSheetQty.textContent = `${rod.quantity} pcs`;
          }
        }
      } else if (target.id === 'btnSheetInc') {
        if (activeActionSheetRodId) {
          quickAdjustQuantity(activeActionSheetRodId, 1);
          const rod = rods.find(r => r.id === activeActionSheetRodId);
          if (rod) {
            refreshDomElements();
            if (sheetQtyDisplay) sheetQtyDisplay.textContent = rod.quantity;
            if (actionSheetQty) actionSheetQty.textContent = `${rod.quantity} pcs`;
          }
        }
      } else if (target.id === 'btnSheetCut') {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) openCutModal(id);
      } else if (target.id === 'btnSheetDeduct') {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) openDeductModal(id);
      } else if (target.id === 'btnSheetEdit') {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) openEditRodModal(id);
      } else if (target.id === 'btnSheetDelete') {
        const id = activeActionSheetRodId;
        closeMobileActionSheet();
        if (id) deleteRod(id);
      } else if (target.id === 'btnViewRow') {
        refreshDomElements();
        const container = document.getElementById('inventoryTableContainer');
        const btnRow = document.getElementById('btnViewRow');
        const btnCards = document.getElementById('btnViewCards');
        if (container) container.classList.remove('inventory-card-view');
        if (btnRow) btnRow.classList.add('active');
        if (btnCards) btnCards.classList.remove('active');
      } else if (target.id === 'btnViewCards') {
        refreshDomElements();
        const container = document.getElementById('inventoryTableContainer');
        const btnRow = document.getElementById('btnViewRow');
        const btnCards = document.getElementById('btnViewCards');
        if (container) container.classList.add('inventory-card-view');
        if (btnCards) btnCards.classList.add('active');
        if (btnRow) btnRow.classList.remove('active');
      }
    });

    // Delegated submit on document
    document.addEventListener('submit', (e) => {
      if (!e.target) return;
      if (e.target.id === 'rodForm') {
        handleSaveRodSubmit(e);
      } else if (e.target.id === 'cutForm') {
        handleCutSubmit(e);
      } else if (e.target.id === 'deductForm') {
        handleDeductSubmit(e);
      } else if (e.target.id === 'smartSearchForm') {
        e.preventDefault();
        refreshDomElements();
        executeSmartSearch(searchDiameterInput ? searchDiameterInput.value : '', searchLengthInput ? searchLengthInput.value : '', true);
      }
    });

    // Delegated input / change on document
    document.addEventListener('input', (e) => {
      if (!e.target) return;
      if (e.target.id === 'filterKeyword') {
        renderInventoryTable();
      } else if (e.target.id === 'filterCutLogsInput') {
        renderCutLogsTable();
      } else if (e.target.id === 'cutRequiredLengthInput' || e.target.id === 'cutPiecesQtyInput') {
        updateCutCalculations();
      } else if (e.target.id === 'deductQuantityInput') {
        refreshDomElements();
        const rod = rods.find(r => r.id === (deductRodId ? deductRodId.value : ''));
        const val = parseInt(e.target.value, 10) || 0;
        if (rod) updateDeductRemainingHint(rod.quantity, val);
      }
    });

    document.addEventListener('change', (e) => {
      if (!e.target) return;
      if (e.target.id === 'filterDiameter') {
        renderQuickDiameterChips();
        renderInventoryTable();
      } else if (e.target.id === 'filterStockStatus') {
        renderInventoryTable();
      } else if (e.target.id === 'csvFileInput') {
        handleCsvImport(e);
      }
    });

    // Escape Key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        refreshDomElements();
        if (mobileActionSheetOverlay && !mobileActionSheetOverlay.classList.contains('hidden')) closeMobileActionSheet();
        if (installModalOverlay && !installModalOverlay.classList.contains('hidden')) closeInstallModal();
        if (cutLogsModalOverlay && !cutLogsModalOverlay.classList.contains('hidden')) closeCutLogsModal();
        if (cutModalOverlay && !cutModalOverlay.classList.contains('hidden')) closeCutModal();
        if (rodModalOverlay && !rodModalOverlay.classList.contains('hidden')) closeRodModal();
        if (deductModalOverlay && !deductModalOverlay.classList.contains('hidden')) closeDeductModal();
        if (duplicateModalOverlay && !duplicateModalOverlay.classList.contains('hidden')) resolveDuplicateCancel();
        if (confirmModalOverlay && !confirmModalOverlay.classList.contains('hidden')) closeConfirmModal();
      }
    });
  }

  // --- MOBILE ACTION SHEET FOR COMPACT ROWS ---
  let activeActionSheetRodId = null;

  function openMobileActionSheet(id) {
    refreshDomElements();
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
    refreshDomElements();
    if (mobileActionSheetOverlay) {
      mobileActionSheetOverlay.classList.add('hidden');
    }
    activeActionSheetRodId = null;
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
  window.setVanillaRods = (newRods) => {
    if (Array.isArray(newRods)) {
      rods = newRods;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
      } catch (e) {
        console.warn('Failed to cache rods in localStorage:', e);
      }
      updateDashboard();
    }
  };
  window.setVanillaCutLogs = (newLogs) => {
    if (Array.isArray(newLogs)) {
      cutLogs = newLogs;
      try {
        localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
      } catch (e) {
        console.warn('Failed to cache cutLogs in localStorage:', e);
      }
      updateCutLogsBadge();
    }
  };

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(initApp, 50);
    } else {
      document.addEventListener('DOMContentLoaded', initApp);
    }
  }
})();
