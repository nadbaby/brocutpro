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

  // --- UNIT HELPERS (INCHES / IN) ---
  function getRodLength(rod) {
    if (!rod) return 0;
    if (rod.lengthIn !== undefined && rod.lengthIn !== null && !isNaN(Number(rod.lengthIn))) {
      return Number(rod.lengthIn);
    }
    if (rod.lengthFt !== undefined && rod.lengthFt !== null && !isNaN(Number(rod.lengthFt))) {
      return Number(rod.lengthFt);
    }
    return 0;
  }

  function getLogOrigLength(log) {
    if (!log) return 0;
    return Number(log.originalLengthIn ?? log.originalLengthFt ?? 0);
  }

  function getLogCutLength(log) {
    if (!log) return 0;
    return Number(log.cutLengthIn ?? log.cutLengthFt ?? 0);
  }

  function getLogRemainder(log) {
    if (!log) return 0;
    return Number(log.remainderIn ?? log.remainderFt ?? 0);
  }

  // --- ROUND OFF VS DECIMAL LENGTH TOGGLE STATE ---
  let isRoundLengthEnabled = false;
  try {
    isRoundLengthEnabled = localStorage.getItem('rodsync_round_length') === 'true';
  } catch (e) {
    isRoundLengthEnabled = false;
  }

  function formatDisplayLength(val) {
    if (val === null || val === undefined || val === '') return '';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (isRoundLengthEnabled) {
      const sign = num < 0 ? -1 : 1;
      const abs = Math.abs(num);
      const integerPart = Math.floor(abs);
      const frac = abs - integerPart;
      // Round .5 down to round figure (e.g. 5.5 -> 5; 5.6 -> 6)
      const rounded = (frac <= 0.50001) ? integerPart : (integerPart + 1);
      return (sign * rounded).toString();
    } else {
      // Decimal mode: always show decimal representation (e.g. 6.0, 5.5, 11.25)
      if (Number.isInteger(num)) {
        return num.toFixed(1);
      }
      return parseFloat(num.toFixed(2)).toString();
    }
  }

  function updateLengthToggleUI() {
    const btn = document.getElementById('btnToggleRoundLength');
    const thTitle = document.getElementById('thLengthTitle');
    const smartThTitle = document.getElementById('smartThLengthTitle');
    if (btn) {
      btn.setAttribute('aria-checked', isRoundLengthEnabled ? 'true' : 'false');
      btn.classList.toggle('active', isRoundLengthEnabled);
      btn.title = isRoundLengthEnabled
        ? 'Lengths shown in Round Off (≈). Click for Decimal (.0).'
        : 'Lengths shown in Decimal (.0). Click for Round Off (≈).';
    }
    if (thTitle) {
      thTitle.textContent = isRoundLengthEnabled ? 'LENGTH (IN) ≈' : 'LENGTH (IN) .0';
    }
    if (smartThTitle) {
      smartThTitle.textContent = isRoundLengthEnabled ? 'Length (In) ≈' : 'Length (In) .0';
    }
  }

  let lastToggleTime = 0;
  function setRoundLengthEnabled(enabled) {
    isRoundLengthEnabled = Boolean(enabled);
    try {
      localStorage.setItem('rodsync_round_length', isRoundLengthEnabled ? 'true' : 'false');
    } catch (e) {}
    updateLengthToggleUI();
    renderInventoryTable();
    if (lastSmartSearchQuery && typeof executeSmartSearch === 'function') {
      executeSmartSearch(lastSmartSearchQuery.diameter, lastSmartSearchQuery.length, false, lastSmartSearchQuery.unit);
    }
    if (typeof renderCutLogsTable === 'function' && cutLogsModalOverlay && !cutLogsModalOverlay.classList.contains('hidden')) {
      renderCutLogsTable();
    }
    showToast(isRoundLengthEnabled ? '📏 Length display: Round Off (≈)' : '📏 Length display: Decimal (.0)', 'info', 2000);
  }

  function toggleRoundLength() {
    const now = Date.now();
    if (now - lastToggleTime < 200) return;
    lastToggleTime = now;
    setRoundLengthEnabled(!isRoundLengthEnabled);
  }

  // --- DOM ELEMENT REFERENCES (DYNAMICALLY RESOLVED) ---
  let statTotalTypes, statTotalQuantity, statInStockTypes, statLowStockCount;
  let smartSearchForm, searchDiameterInput, searchLengthInput, btnResetSmartSearch;
  let searchLengthUnit = 'in';
  let unitPillIn, unitPillFt, unitPillM, searchLengthUnitSelect, searchLengthUnitBadge, searchLengthHint, smartThLengthTitle, quickLengthChipsScroll;
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
  let cutPiecesPerRodInput, btnCutPiecesPerRodDown, btnCutPiecesPerRodUp, cutPiecesPerRodHint, cutVisualMultiBar;
  let cutMultiRodSuggestionCard, cutSuggestionCapacityText, cutSuggestionDesc, cutSuggestedRodContainer;
  let cutSuggestedRodSelect, cutSuggestedStepsPreview, cutNoStockWarning, btnCutAddNewRodShortcut;
  let activeModalMultiPlan = null;
  let btnCutStepDown, btnCutStepUp, calcOrigLength, calcCutLength, calcRemainLength, calcRemainNote;
  let cutAutoAddRemnant, cutReasonInput, cutCreatedByInput, cutAssignedByInput, btnConfirmCut;
  let searchPiecesInput, searchTotalCutHint, btnSearchPiecesDec, btnSearchPiecesInc;
  let smartCutPlanSection, cutPlanMetricsGrid, cutPlanStepsList, btnStrategyFullLength, btnStrategyOffcuts;
  let btnExecuteCutPlan, btnPrintPlanSlip, btnToggleAllMatchingTable, toggleMatchingTableText, smartResultsTableContainer;
  let executePlanModalOverlay, btnCloseExecutePlanModal, btnCancelExecutePlanModal, executePlanForm;
  let executePlanSummaryDetails, planAutoAddRemnants, planReasonInput, planCreatedByInput, planAssignedByInput, btnConfirmExecutePlan;
  let activeCutPlan = null;
  let activeCutStrategy = 'full_length_first';
  let isMatchingTableVisible = false;
  let cutLogsModalOverlay, btnOpenCutLogsModal, btnCloseCutLogsModal, btnCloseCutLogsBottom, cutLogsBadge;
  let cutLogsTableBody, cutLogsEmptyState, filterCutLogsInput, btnExportCutLogsCsv, btnClearCutLogs;
  let cutLogsCountText, cutLogsContentArea, cutLogsTableWrapper, cutLogsCardsContainer;
  let btnCutLogsCards, btnCutLogsTable;
  let selectedCutLogIds = new Set();
  let btnPrintCombinedSlip, btnFooterPrintCombinedSlip, selectAllCutLogs, selectedLogsCount, selectedLogsCountFooter;
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
    searchPiecesInput = document.getElementById('searchPiecesInput');
    searchTotalCutHint = document.getElementById('searchTotalCutHint');
    btnSearchPiecesDec = document.getElementById('btnSearchPiecesDec');
    btnSearchPiecesInc = document.getElementById('btnSearchPiecesInc');
    btnResetSmartSearch = document.getElementById('btnResetSmartSearch');
    unitPillIn = document.getElementById('unitPillIn');
    unitPillFt = document.getElementById('unitPillFt');
    unitPillM = document.getElementById('unitPillM');
    searchLengthUnitSelect = document.getElementById('searchLengthUnitSelect');
    searchLengthUnitBadge = document.getElementById('searchLengthUnitBadge');
    searchLengthHint = document.getElementById('searchLengthHint');
    smartThLengthTitle = document.getElementById('smartThLengthTitle');
    quickLengthChipsScroll = document.getElementById('quickLengthChipsScroll');
    smartSearchResultsContainer = document.getElementById('smartSearchResultsContainer');
    smartResultsTableBody = document.getElementById('smartResultsTableBody');
    smartResultsCount = document.getElementById('smartResultsCount');
    smartResultsCriteria = document.getElementById('smartResultsCriteria');
    smartSearchEmptyState = document.getElementById('smartSearchEmptyState');
    smartSearchEmptyDesc = document.getElementById('smartSearchEmptyDesc');
    btnEmptySuggestAdd = document.getElementById('btnEmptySuggestAdd');

    smartCutPlanSection = document.getElementById('smartCutPlanSection');
    cutPlanMetricsGrid = document.getElementById('cutPlanMetricsGrid');
    cutPlanStepsList = document.getElementById('cutPlanStepsList');
    btnStrategyFullLength = document.getElementById('btnStrategyFullLength');
    btnStrategyOffcuts = document.getElementById('btnStrategyOffcuts');
    btnExecuteCutPlan = document.getElementById('btnExecuteCutPlan');
    btnPrintPlanSlip = document.getElementById('btnPrintPlanSlip');
    btnToggleAllMatchingTable = document.getElementById('btnToggleAllMatchingTable');
    toggleMatchingTableText = document.getElementById('toggleMatchingTableText');
    smartResultsTableContainer = document.getElementById('smartResultsTableContainer');

    executePlanModalOverlay = document.getElementById('executePlanModalOverlay');
    btnCloseExecutePlanModal = document.getElementById('btnCloseExecutePlanModal');
    btnCancelExecutePlanModal = document.getElementById('btnCancelExecutePlanModal');
    executePlanForm = document.getElementById('executePlanForm');
    executePlanSummaryDetails = document.getElementById('executePlanSummaryDetails');
    planAutoAddRemnants = document.getElementById('planAutoAddRemnants');
    planReasonInput = document.getElementById('planReasonInput');
    planCreatedByInput = document.getElementById('planCreatedByInput');
    planAssignedByInput = document.getElementById('planAssignedByInput');
    btnConfirmExecutePlan = document.getElementById('btnConfirmExecutePlan');

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
    cutPiecesPerRodInput = document.getElementById('cutPiecesPerRodInput');
    btnCutPiecesPerRodDown = document.getElementById('btnCutPiecesPerRodDown');
    btnCutPiecesPerRodUp = document.getElementById('btnCutPiecesPerRodUp');
    cutPiecesPerRodHint = document.getElementById('cutPiecesPerRodHint');
    cutVisualMultiBar = document.getElementById('cutVisualMultiBar');
    btnCutStepDown = document.getElementById('btnCutStepDown');
    btnCutStepUp = document.getElementById('btnCutStepUp');
    calcOrigLength = document.getElementById('calcOrigLength');
    calcCutLength = document.getElementById('calcCutLength');
    calcRemainLength = document.getElementById('calcRemainLength');
    calcRemainNote = document.getElementById('calcRemainNote');
    cutAutoAddRemnant = document.getElementById('cutAutoAddRemnant');
    cutReasonInput = document.getElementById('cutReasonInput');
    cutCreatedByInput = document.getElementById('cutCreatedByInput');
    cutAssignedByInput = document.getElementById('cutAssignedByInput');
    btnConfirmCut = document.getElementById('btnConfirmCut');
    cutMultiRodSuggestionCard = document.getElementById('cutMultiRodSuggestionCard');
    cutSuggestionCapacityText = document.getElementById('cutSuggestionCapacityText');
    cutSuggestionDesc = document.getElementById('cutSuggestionDesc');
    cutSuggestedRodContainer = document.getElementById('cutSuggestedRodContainer');
    cutSuggestedRodSelect = document.getElementById('cutSuggestedRodSelect');
    cutSuggestedStepsPreview = document.getElementById('cutSuggestedStepsPreview');
    cutNoStockWarning = document.getElementById('cutNoStockWarning');
    btnCutAddNewRodShortcut = document.getElementById('btnCutAddNewRodShortcut');

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
    btnPrintCombinedSlip = document.getElementById('btnPrintCombinedSlip');
    btnFooterPrintCombinedSlip = document.getElementById('btnFooterPrintCombinedSlip');
    selectAllCutLogs = document.getElementById('selectAllCutLogs');
    selectedLogsCount = document.getElementById('selectedLogsCount');
    selectedLogsCountFooter = document.getElementById('selectedLogsCountFooter');

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

    const toggleRoundBtn = document.getElementById('btnToggleRoundLength');
    if (toggleRoundBtn && !toggleRoundBtn._hasBoundClick) {
      toggleRoundBtn._hasBoundClick = true;
      toggleRoundBtn.onclick = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        toggleRoundLength();
      };
    }
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
    updateLengthToggleUI();
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
    updateLengthToggleUI();

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
      executeSmartSearch(lastSmartSearchQuery.diameter, lastSmartSearchQuery.length, false, lastSmartSearchQuery.unit);
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
    const statusFilter = filterStockStatus ? filterStockStatus.value : 'all';

    let filtered = rods.filter(rod => {
      // Keyword match across name, sku, notes
      if (keyword) {
        const matchName = rod.name ? rod.name.toLowerCase().includes(keyword) : false;
        const matchSku = rod.sku ? rod.sku.toLowerCase().includes(keyword) : false;
        const matchNotes = rod.notes ? rod.notes.toLowerCase().includes(keyword) : false;
        if (!matchName && !matchSku && !matchNotes) return false;
      }

      // Diameter filter
      if (diaFilter !== 'all' && Number(rod.diameterMm) !== Number(diaFilter)) {
        return false;
      }

      // Stock status filter
      if (statusFilter && statusFilter !== 'all') {
        const qty = Number(rod.quantity) || 0;
        if (statusFilter === 'in_stock' && qty <= 0) return false;
        if (statusFilter === 'out_of_stock' && qty > 0) return false;
        if (statusFilter === 'low_stock' && (qty <= 0 || qty > LOW_STOCK_THRESHOLD)) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (['diameterMm', 'lengthFt', 'lengthIn', 'quantity'].includes(sortColumn)) {
        if (sortColumn === 'lengthFt' || sortColumn === 'lengthIn') {
          valA = getRodLength(a);
          valB = getRodLength(b);
        } else {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        }
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
        <td class="col-length hide-mobile text-right font-mono"><strong>${formatDisplayLength(getRodLength(rod))}</strong> <span class="text-muted">In</span></td>
        <td class="col-size mobile-only text-center font-mono">
          <span class="size-badge-pill"><strong>${rod.diameterMm}</strong>mm × <strong>${formatDisplayLength(getRodLength(rod))}</strong>In</span>
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
  function setSmartSearchUnit(newUnit, shouldConvertValue = true) {
    if (!['in', 'ft', 'm'].includes(newUnit)) return;
    refreshDomElements();
    const prevUnit = searchLengthUnit;
    searchLengthUnit = newUnit;

    if (unitPillIn) unitPillIn.classList.toggle('active', newUnit === 'in');
    if (unitPillFt) unitPillFt.classList.toggle('active', newUnit === 'ft');
    if (unitPillM) unitPillM.classList.toggle('active', newUnit === 'm');
    if (searchLengthUnitSelect) searchLengthUnitSelect.value = newUnit;
    if (searchLengthUnitBadge) {
      searchLengthUnitBadge.textContent = newUnit === 'm' ? '(M)' : (newUnit === 'ft' ? '(Ft)' : '(In)');
    }
    if (smartThLengthTitle) {
      smartThLengthTitle.textContent = newUnit === 'm' ? 'Length (M / In)' : (newUnit === 'ft' ? 'Length (Ft / In)' : 'Length (In)');
    }

    if (searchLengthInput) {
      searchLengthInput.placeholder = newUnit === 'm' ? 'e.g. 1.0' : (newUnit === 'ft' ? 'e.g. 2.0' : 'e.g. 6.0');
      const rawVal = parseFloat(searchLengthInput.value);
      if (shouldConvertValue && !isNaN(rawVal) && rawVal > 0) {
        // Convert from prevUnit to inches first
        let inchesVal = rawVal;
        if (prevUnit === 'ft') inchesVal = rawVal * 12;
        else if (prevUnit === 'm') inchesVal = rawVal * 39.3701;

        // Convert inches to newUnit
        if (newUnit === 'ft') {
          searchLengthInput.value = Number((inchesVal / 12).toFixed(3));
        } else if (newUnit === 'm') {
          searchLengthInput.value = Number((inchesVal / 39.3701).toFixed(3));
        } else {
          searchLengthInput.value = Number(inchesVal.toFixed(2));
        }
      }
    }

    // Dynamic quick presets depending on unit
    if (quickLengthChipsScroll) {
      if (newUnit === 'm') {
        quickLengthChipsScroll.innerHTML = `
          <button type="button" class="btn-len-preset" data-len="0.5">0.5m</button>
          <button type="button" class="btn-len-preset" data-len="1">1m</button>
          <button type="button" class="btn-len-preset" data-len="1.5">1.5m</button>
          <button type="button" class="btn-len-preset" data-len="2">2m</button>
          <button type="button" class="btn-len-preset" data-len="3">3m</button>
          <button type="button" class="btn-len-preset" data-len="5">5m</button>
        `;
      } else if (newUnit === 'ft') {
        quickLengthChipsScroll.innerHTML = `
          <button type="button" class="btn-len-preset" data-len="1">1ft</button>
          <button type="button" class="btn-len-preset" data-len="2">2ft</button>
          <button type="button" class="btn-len-preset" data-len="4">4ft</button>
          <button type="button" class="btn-len-preset" data-len="5">5ft</button>
          <button type="button" class="btn-len-preset" data-len="10">10ft</button>
          <button type="button" class="btn-len-preset" data-len="20">20ft</button>
        `;
      } else {
        quickLengthChipsScroll.innerHTML = `
          <button type="button" class="btn-len-preset" data-len="1">1in</button>
          <button type="button" class="btn-len-preset" data-len="2">2in</button>
          <button type="button" class="btn-len-preset" data-len="4">4in</button>
          <button type="button" class="btn-len-preset" data-len="6">6in</button>
          <button type="button" class="btn-len-preset" data-len="8">8in</button>
          <button type="button" class="btn-len-preset" data-len="10">10in</button>
        `;
      }
    }

    updateSearchLengthHint();

    // If diameter is entered and length is entered, immediately refresh search results
    if (
      searchDiameterInput &&
      parseFloat(searchDiameterInput.value) > 0 &&
      searchLengthInput &&
      parseFloat(searchLengthInput.value) > 0
    ) {
      executeSmartSearch(searchDiameterInput.value, searchLengthInput.value, false, newUnit);
    }
  }

  function updateSearchLengthHint() {
    refreshDomElements();
    const rawVal = searchLengthInput ? parseFloat(searchLengthInput.value) : NaN;
    const pieces = searchPiecesInput ? (parseInt(searchPiecesInput.value, 10) || 1) : 1;

    if (!isNaN(rawVal) && rawVal > 0) {
      if (searchLengthUnit === 'm') {
        const inEquiv = Number((rawVal * 39.3701).toFixed(2));
        const ftEquiv = Number((inEquiv / 12).toFixed(2));
        if (searchLengthHint) {
          searchLengthHint.innerHTML = `📐 <strong>${rawVal} M</strong> = <strong>${inEquiv} In</strong> (${ftEquiv} Ft) per piece`;
        }
        const totalM = Number((rawVal * pieces).toFixed(2));
        const totalIn = Number((inEquiv * pieces).toFixed(2));
        if (searchTotalCutHint) {
          searchTotalCutHint.innerHTML = `🎯 Total: <strong>${pieces} pcs</strong> × ${rawVal} M = <strong>${totalM} M</strong> (${totalIn} In)`;
        }
      } else if (searchLengthUnit === 'ft') {
        const inEquiv = Number((rawVal * 12).toFixed(2));
        if (searchLengthHint) {
          searchLengthHint.innerHTML = `📐 <strong>${rawVal} Ft</strong> = <strong>${inEquiv} In</strong> per piece`;
        }
        const totalFt = Number((rawVal * pieces).toFixed(2));
        const totalIn = Number((inEquiv * pieces).toFixed(2));
        if (searchTotalCutHint) {
          searchTotalCutHint.innerHTML = `🎯 Total: <strong>${pieces} pcs</strong> × ${rawVal} Ft = <strong>${totalFt} Ft</strong> (${totalIn} In)`;
        }
      } else {
        const ftEquiv = Number((rawVal / 12).toFixed(2));
        const mEquiv = Number((rawVal / 39.3701).toFixed(2));
        if (searchLengthHint) {
          searchLengthHint.innerHTML = `📐 <strong>${rawVal} In</strong> = <strong>${ftEquiv} Ft</strong> (${mEquiv} M) per piece`;
        }
        const totalIn = Number((rawVal * pieces).toFixed(2));
        const totalFt = Number((totalIn / 12).toFixed(2));
        if (searchTotalCutHint) {
          searchTotalCutHint.innerHTML = `🎯 Total: <strong>${pieces} pcs</strong> × ${rawVal} In = <strong>${totalIn} In</strong> (${totalFt} Ft)`;
        }
      }
    } else {
      if (searchLengthHint) {
        searchLengthHint.textContent = searchLengthUnit === 'm'
          ? '1 M = 39.37 In (3.28 Ft) • Cut piece length'
          : (searchLengthUnit === 'ft' ? '1 Ft = 12 In • Cut piece length' : 'Cut piece length in inches');
      }
      if (searchTotalCutHint) {
        searchTotalCutHint.textContent = `Total pieces: ${pieces}`;
      }
    }
  }

  // --- MULTI-CUT STOCK OPTIMIZER ENGINE (LINEAR CUTTING STOCK PACKING) ---
  function calculateMultiCutPlan(diameter, pieceLenInches, piecesNeeded, unit, strategy = 'full_length_first', inputLength = null) {
    const searchDiameter = Number(diameter);
    const eligibleRods = rods
      .filter(rod =>
        Number(rod.diameterMm) === searchDiameter &&
        getRodLength(rod) >= pieceLenInches &&
        Number(rod.quantity) > 0
      )
      .map(r => ({ ...r, availableUnits: Number(r.quantity) || 0 }));

    if (strategy === 'full_length_first') {
      // Longest rods first: cut from full length stock first, remainder from another rod
      eligibleRods.sort((a, b) => getRodLength(b) - getRodLength(a));
    } else {
      // Offcut remnants first: consume smaller/scrap rods first
      eligibleRods.sort((a, b) => {
        const isRemA = (a.sku && a.sku.includes('CUT')) || (a.notes && a.notes.includes('Cut')) || getRodLength(a) < 120;
        const isRemB = (b.sku && b.sku.includes('CUT')) || (b.notes && b.notes.includes('Cut')) || getRodLength(b) < 120;
        if (isRemA && !isRemB) return -1;
        if (!isRemA && isRemB) return 1;
        return getRodLength(a) - getRodLength(b);
      });
    }

    let remainingPieces = piecesNeeded;
    const steps = [];
    let totalCutLengthInches = 0;
    let totalOffcutSavedInches = 0;
    let totalRodsUsed = 0;

    for (const rod of eligibleRods) {
      if (remainingPieces <= 0) break;
      const rodLen = getRodLength(rod);
      const maxPiecesPerRod = Math.floor(rodLen / pieceLenInches);
      if (maxPiecesPerRod <= 0) continue;

      const unitsToUse = rod.availableUnits;
      for (let u = 0; u < unitsToUse; u++) {
        if (remainingPieces <= 0) break;
        const piecesFromThisRod = Math.min(remainingPieces, maxPiecesPerRod);
        const totalCutFromRod = Number((piecesFromThisRod * pieceLenInches).toFixed(2));
        const remainder = Number((rodLen - totalCutFromRod).toFixed(2));

        steps.push({
          stepNum: steps.length + 1,
          rodId: rod.id,
          rodName: rod.name,
          rodSku: rod.sku || '',
          diameterMm: Number(rod.diameterMm),
          rodFullLengthInches: rodLen,
          piecesToCut: piecesFromThisRod,
          pieceLengthInches: pieceLenInches,
          pieceLengthInput: inputLength,
          unit: unit,
          totalCutInches: totalCutFromRod,
          remainderInches: remainder,
          isRemnantSource: (rod.sku && rod.sku.includes('CUT')) || (rod.notes && rod.notes.includes('Cut'))
        });

        totalRodsUsed += 1;
        totalCutLengthInches += totalCutFromRod;
        totalOffcutSavedInches += remainder;
        remainingPieces -= piecesFromThisRod;
      }
    }

    const isFullyFulfilled = remainingPieces === 0;
    const fulfilledPieces = piecesNeeded - remainingPieces;

    return {
      diameterMm: searchDiameter,
      pieceLengthInches: pieceLenInches,
      inputLength: inputLength,
      piecesNeeded: piecesNeeded,
      fulfilledPieces: fulfilledPieces,
      shortagePieces: remainingPieces,
      isFullyFulfilled: isFullyFulfilled,
      totalRodsUsed: totalRodsUsed,
      totalCutLengthInches: totalCutLengthInches,
      totalOffcutSavedInches: totalOffcutSavedInches,
      unit: unit,
      strategy: strategy,
      steps: steps
    };
  }

  function renderMultiCutPlan(plan, unit, inputLength) {
    if (!smartCutPlanSection || !cutPlanMetricsGrid || !cutPlanStepsList) return;

    activeCutPlan = plan;
    if (activeCutPlan) {
      activeCutPlan.unit = unit;
      activeCutPlan.inputLength = inputLength;
    }

    if (!plan || plan.steps.length === 0) {
      smartCutPlanSection.classList.add('hidden');
      return;
    }

    smartCutPlanSection.classList.remove('hidden');

    // 1. Update Strategy Pills
    if (btnStrategyFullLength && btnStrategyOffcuts) {
      btnStrategyFullLength.classList.toggle('active', plan.strategy === 'full_length_first');
      btnStrategyOffcuts.classList.toggle('active', plan.strategy === 'offcuts_first');
    }

    // 2. Render Plan KPI Metrics
    const targetLengthLabel = unit === 'm'
      ? `${formatDisplayLength(inputLength)} M (${formatDisplayLength(plan.pieceLengthInches)} In)`
      : (unit === 'ft' ? `${formatDisplayLength(inputLength)} Ft (${formatDisplayLength(plan.pieceLengthInches)} In)` : `${formatDisplayLength(inputLength)} In`);
    const totalCutLengthLabel = unit === 'm'
      ? `${formatDisplayLength(plan.totalCutLengthInches / 39.3701)} M (${formatDisplayLength(plan.totalCutLengthInches)} In)`
      : (unit === 'ft' ? `${formatDisplayLength(plan.totalCutLengthInches / 12)} Ft` : `${formatDisplayLength(plan.totalCutLengthInches)} In`);
    const totalOffcutLabel = unit === 'm'
      ? `${formatDisplayLength(plan.totalOffcutSavedInches / 39.3701)} M (${formatDisplayLength(plan.totalOffcutSavedInches)} In)`
      : (unit === 'ft' ? `${formatDisplayLength(plan.totalOffcutSavedInches / 12)} Ft (${formatDisplayLength(plan.totalOffcutSavedInches)} In)` : `${formatDisplayLength(plan.totalOffcutSavedInches)} In`);

    cutPlanMetricsGrid.innerHTML = `
      <div class="cut-plan-metric-card">
        <span class="cut-plan-metric-label">Target Order</span>
        <div class="cut-plan-metric-val text-primary">${plan.piecesNeeded} pcs × ${targetLengthLabel}</div>
      </div>
      <div class="cut-plan-metric-card">
        <span class="cut-plan-metric-label">Total Material Cut</span>
        <div class="cut-plan-metric-val">${totalCutLengthLabel}</div>
      </div>
      <div class="cut-plan-metric-card">
        <span class="cut-plan-metric-label">Rods Consumed</span>
        <div class="cut-plan-metric-val">${plan.totalRodsUsed} ${plan.totalRodsUsed === 1 ? 'Rod' : 'Rods'}</div>
      </div>
      <div class="cut-plan-metric-card">
        <span class="cut-plan-metric-label">Offcuts Saved to Stock</span>
        <div class="cut-plan-metric-val text-success">+${totalOffcutLabel}</div>
      </div>
      <div class="cut-plan-metric-card">
        <span class="cut-plan-metric-label">Stock Feasibility</span>
        <div class="cut-plan-metric-val ${plan.isFullyFulfilled ? 'text-success' : 'text-warning'}">
          ${plan.isFullyFulfilled ? '✅ 100% In Stock' : `⚠️ Shortage: ${plan.shortagePieces} pcs`}
        </div>
      </div>
    `;

    // 3. Render Step-by-Step Rod Cutting Breakdown
    cutPlanStepsList.innerHTML = '';
    plan.steps.forEach((step, idx) => {
      const stepCard = document.createElement('div');
      stepCard.className = 'cut-plan-step-card';

      const fullLenLabel = unit === 'm'
        ? `${formatDisplayLength(step.rodFullLengthInches / 39.3701)} M (${formatDisplayLength(step.rodFullLengthInches)} In)`
        : (unit === 'ft' ? `${formatDisplayLength(step.rodFullLengthInches / 12)} Ft (${formatDisplayLength(step.rodFullLengthInches)} In)` : `${formatDisplayLength(step.rodFullLengthInches)} In (${formatDisplayLength(step.rodFullLengthInches / 12)} Ft)`);
      const totalCutLabel = unit === 'm'
        ? `${formatDisplayLength(step.totalCutInches / 39.3701)} M`
        : (unit === 'ft' ? `${formatDisplayLength(step.totalCutInches / 12)} Ft` : `${formatDisplayLength(step.totalCutInches)} In`);
      const remainderLabel = unit === 'm'
        ? `${formatDisplayLength(step.remainderInches / 39.3701)} M (${formatDisplayLength(step.remainderInches)} In)`
        : (unit === 'ft' ? `${formatDisplayLength(step.remainderInches / 12)} Ft (${formatDisplayLength(step.remainderInches)} In)` : `${formatDisplayLength(step.remainderInches)} In (${formatDisplayLength(step.remainderInches / 12)} Ft)`);

      const isFinalStep = idx === plan.steps.length - 1 && plan.steps.length > 1;
      const stepBadgeText = isFinalStep
        ? `Step #${step.stepNum} (Remaining Part from Another Rod)`
        : (step.isRemnantSource ? `Step #${step.stepNum} (Remnant Stock)` : `Step #${step.stepNum} (Full Length Stock)`);

      // Generate multi-segment visual progress bar
      let segmentsHtml = '';
      const piecePct = (step.pieceLengthInches / step.rodFullLengthInches) * 100;
      for (let p = 0; p < step.piecesToCut; p++) {
        const pieceDisplay = unit === 'm' ? `${formatDisplayLength(inputLength)} M` : (unit === 'ft' ? `${formatDisplayLength(inputLength)} Ft` : `${formatDisplayLength(inputLength)} In`);
        segmentsHtml += `
          <div class="cut-plan-segment segment-piece" style="width: ${piecePct.toFixed(2)}%;" title="Piece #${p + 1}: ${pieceDisplay}">
            ${piecePct >= 14 ? `Cut #${p + 1} (${pieceDisplay})` : `${pieceDisplay}`}
          </div>
        `;
      }

      const remPct = Math.max(0, 100 - (step.piecesToCut * piecePct));
      if (step.remainderInches === 0) {
        segmentsHtml += `
          <div class="cut-plan-segment segment-offcut-exact" style="width: ${remPct.toFixed(2)}%;" title="Exact Fit: 0 Scrap">
            Exact Fit (0 Scrap)
          </div>
        `;
      } else {
        const remDisplay = unit === 'm' ? `${formatDisplayLength(step.remainderInches / 39.3701)} M` : (unit === 'ft' ? `${formatDisplayLength(step.remainderInches / 12)} Ft` : `${formatDisplayLength(step.remainderInches)} In`);
        segmentsHtml += `
          <div class="cut-plan-segment segment-offcut-saved" style="width: ${remPct.toFixed(2)}%;" title="Reusable Offcut: ${remainderLabel} (Saved to Stock)">
            ${remPct >= 14 ? `Offcut: ${remDisplay} (Stock)` : remDisplay}
          </div>
        `;
      }

      stepCard.innerHTML = `
        <div class="step-card-header">
          <div class="step-card-left">
            <span class="step-badge">${stepBadgeText}</span>
            <span class="step-rod-title">${escapeHtml(step.rodName)}</span>
          </div>
          <div class="step-rod-dims">
            Source Length: <strong>${fullLenLabel}</strong> • Diameter: <strong>${step.diameterMm} mm</strong>
          </div>
        </div>

        <div class="step-cuts-summary">
          <div class="step-cut-action">
            ✂️ Cut <strong>${step.piecesToCut} piece${step.piecesToCut > 1 ? 's' : ''}</strong> of <strong>${targetLengthLabel}</strong> (Total: <strong>${totalCutLabel}</strong> deducted)
          </div>
          <div>
            ${step.remainderInches === 0
              ? '<span class="step-offcut-badge" style="background: rgba(100, 116, 139, 0.12); color: #64748b; border-color: rgba(100, 116, 139, 0.25);">🎯 Exact Fit (0 Scrap)</span>'
              : `<span class="step-offcut-badge">✂️ <strong>+${remainderLabel}</strong> offcut remnant will be saved to inventory</span>`
            }
          </div>
        </div>

        <div class="cut-plan-visual-bar">
          ${segmentsHtml}
        </div>
      `;

      cutPlanStepsList.appendChild(stepCard);
    });

    // Update table visibility button text
    if (toggleMatchingTableText) {
      toggleMatchingTableText.textContent = isMatchingTableVisible
        ? 'Hide Individual Rods Table'
        : 'Show Individual Rods Table';
    }
    if (smartResultsTableContainer) {
      if (isMatchingTableVisible || plan.piecesNeeded === 1) {
        smartResultsTableContainer.classList.remove('hidden');
      } else {
        smartResultsTableContainer.classList.add('hidden');
      }
    }
  }

  function openExecutePlanModal() {
    if (!activeCutPlan || !activeCutPlan.steps || activeCutPlan.steps.length === 0) {
      showToast('No cutting plan is currently active to execute', 'warning');
      return;
    }

    refreshDomElements();
    if (!executePlanModalOverlay || !executePlanSummaryDetails) return;

    let detailsHtml = `
      <div style="margin-bottom: 0.75rem; font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
        Cutting Summary: ${activeCutPlan.fulfilledPieces} pieces of ${formatDisplayLength(activeCutPlan.unit === 'ft' ? (activeCutPlan.pieceLengthInches / 12) : activeCutPlan.pieceLengthInches)} ${activeCutPlan.unit === 'ft' ? 'Ft' : 'In'} (${activeCutPlan.diameterMm} mm)
      </div>
    `;

    activeCutPlan.steps.forEach(step => {
      const fullLen = activeCutPlan.unit === 'ft'
        ? `${formatDisplayLength(step.rodFullLengthInches / 12)} Ft`
        : `${formatDisplayLength(step.rodFullLengthInches)} In`;
      const cutLen = activeCutPlan.unit === 'ft'
        ? `${formatDisplayLength(step.totalCutInches / 12)} Ft`
        : `${formatDisplayLength(step.totalCutInches)} In`;
      const remLen = activeCutPlan.unit === 'ft'
        ? `${formatDisplayLength(step.remainderInches / 12)} Ft`
        : `${formatDisplayLength(step.remainderInches)} In`;

      detailsHtml += `
        <div class="plan-confirm-row">
          <div>
            <strong>Step #${step.stepNum}: ${escapeHtml(step.rodName)}</strong> (${fullLen})<br>
            <span class="text-primary">Cut: ${step.piecesToCut} pcs (${cutLen} total)</span>
          </div>
          <div style="text-align: right;">
            ${step.remainderInches > 0
              ? `<span class="step-offcut-badge">+${remLen} Offcut (Stock)</span>`
              : `<span class="badge-cut-exact">Exact (0 Scrap)</span>`
            }
          </div>
        </div>
      `;
    });

    executePlanSummaryDetails.innerHTML = detailsHtml;
    if (planReasonInput) planReasonInput.value = '';
    if (planCreatedByInput) planCreatedByInput.value = '';
    if (planAssignedByInput) planAssignedByInput.value = '';
    if (planAutoAddRemnants) planAutoAddRemnants.checked = true;

    executePlanModalOverlay.classList.remove('hidden');
  }

  function closeExecutePlanModal() {
    if (executePlanModalOverlay) {
      executePlanModalOverlay.classList.add('hidden');
    }
  }

  function handleExecutePlanSubmit(e) {
    e.preventDefault();
    if (!activeCutPlan || !activeCutPlan.steps || activeCutPlan.steps.length === 0) return;

    const shouldAddRemnants = planAutoAddRemnants ? planAutoAddRemnants.checked : true;
    const reason = planReasonInput ? planReasonInput.value.trim() : '';
    const createdBy = planCreatedByInput ? planCreatedByInput.value.trim() : '';
    const assignedBy = planAssignedByInput ? planAssignedByInput.value.trim() : '';

    const newLogIds = [];

    // Process each step in the plan
    activeCutPlan.steps.forEach((step, idx) => {
      const rod = rods.find(r => r.id === step.rodId);
      if (!rod) return;

      const origLength = step.rodFullLengthInches;
      const remainder = step.remainderInches;
      const cutLen = step.pieceLengthInches;
      const piecesCut = step.piecesToCut;

      // 1. Deduct 1 source unit of this rod from stock
      if (rod.quantity <= 1) {
        if (remainder > 0 && shouldAddRemnants) {
          // Check if an existing remnant matches exactly
          const existingRem = rods.find(r =>
            r.id !== rod.id &&
            r.name.toLowerCase() === rod.name.toLowerCase() &&
            Number(r.diameterMm) === Number(rod.diameterMm) &&
            Math.abs(getRodLength(r) - remainder) < 0.05
          );
          if (existingRem) {
            existingRem.quantity += 1;
            existingRem.updatedAt = Date.now();
            rods = rods.filter(r => r.id !== rod.id);
          } else {
            rod.lengthIn = remainder;
            rod.lengthFt = remainder;
            rod.quantity = 1;
            rod.updatedAt = Date.now();
            if (reason) rod.notes = rod.notes ? `${rod.notes} | Cut: ${reason}` : `Cut: ${reason}`;
          }
        } else {
          rod.quantity = 0;
          rod.updatedAt = Date.now();
        }
      } else {
        rod.quantity -= 1;
        rod.updatedAt = Date.now();

        if (remainder > 0 && shouldAddRemnants) {
          const existingRem = rods.find(r =>
            r.name.toLowerCase() === rod.name.toLowerCase() &&
            Number(r.diameterMm) === Number(rod.diameterMm) &&
            Math.abs(getRodLength(r) - remainder) < 0.05
          );
          if (existingRem) {
            existingRem.quantity += 1;
            existingRem.updatedAt = Date.now();
          } else {
            rods.push({
              id: 'rod-cut-' + Date.now() + '-' + idx,
              sku: rod.sku ? `${rod.sku}-CUT` : `ROD-${Math.round(rod.diameterMm)}MM-${Math.round(remainder)}IN`,
              name: rod.name,
              diameterMm: Number(rod.diameterMm),
              lengthIn: remainder,
              lengthFt: remainder,
              quantity: 1,
              notes: `Cut from ${origLength} In (${piecesCut} pcs of ${cutLen} In)${reason ? ' (' + reason + ')' : ''}`,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }
        }
      }

      const planUnit = activeCutPlan ? (activeCutPlan.unit || searchLengthUnit) : searchLengthUnit;
      const isMeter = planUnit === 'm';
      const inputLen = (activeCutPlan && activeCutPlan.inputLength !== undefined && activeCutPlan.inputLength !== null)
        ? activeCutPlan.inputLength
        : (lastSmartSearchQuery && lastSmartSearchQuery.unit === 'm' ? lastSmartSearchQuery.length : null);

      // 2. Add Cut Log entry
      const logEntry = {
        id: 'log-' + Date.now() + '-' + idx,
        timestamp: Date.now(),
        rodName: rod.name,
        diameterMm: Number(rod.diameterMm),
        originalLengthIn: origLength,
        originalLengthFt: origLength,
        cutLengthIn: cutLen,
        cutLengthFt: cutLen,
        cutUnit: isMeter ? 'm' : (planUnit || 'in'),
        cutLengthM: isMeter ? (inputLen || Number((cutLen / 39.3701).toFixed(3))) : null,
        quantity: piecesCut,
        remainderIn: remainder,
        remainderFt: remainder,
        remnantAdded: remainder > 0 && shouldAddRemnants,
        reason: reason ? `${reason} (Multi-Cut Plan)` : 'Multi-Cut Optimization Plan',
        createdBy: createdBy || '',
        assignedBy: assignedBy || '',
        assignBy: createdBy || '',
        assignTo: assignedBy || ''
      };
      cutLogs.unshift(logEntry);
      newLogIds.push(logEntry.id);
    });

    // 3. Save to localStorage & update UI
    saveRodsToStorage();
    saveCutLogsToStorage();
    updateCutLogsBadge();
    updateDashboard();
    closeExecutePlanModal();

    // 4. Atomic Unified Sync to Backend
    window.dispatchEvent(new CustomEvent('syncBothToBackend', {
      detail: { rods: rods, cutLogs: cutLogs }
    }));

    // Auto-select logs for combined slip printing
    selectedCutLogIds = new Set(newLogIds);
    showToast(`✅ Successfully executed cutting plan! Cut ${activeCutPlan.fulfilledPieces} pieces from ${activeCutPlan.totalRodsUsed} rods. Offcuts saved to stock.`, 'success');

    // Refresh smart search to reflect updated stock
    if (lastSmartSearchQuery) {
      executeSmartSearch(
        lastSmartSearchQuery.diameter,
        lastSmartSearchQuery.length,
        false,
        lastSmartSearchQuery.unit,
        lastSmartSearchQuery.pieces
      );
    }
  }

  function handlePrintPlanSlip() {
    if (!activeCutPlan || !activeCutPlan.steps || activeCutPlan.steps.length === 0) {
      showToast('No cutting plan is currently active', 'warning');
      return;
    }
    const planUnit = activeCutPlan.unit || searchLengthUnit;
    const isMeter = planUnit === 'm';
    const inputLen = (activeCutPlan.inputLength !== undefined && activeCutPlan.inputLength !== null)
      ? activeCutPlan.inputLength
      : (lastSmartSearchQuery && lastSmartSearchQuery.unit === 'm' ? lastSmartSearchQuery.length : null);

    const virtualLogs = activeCutPlan.steps.map((step, idx) => ({
      id: 'plan-' + Date.now() + '-' + idx,
      timestamp: Date.now(),
      rodName: step.rodName,
      diameterMm: step.diameterMm,
      originalLengthIn: step.rodFullLengthInches,
      cutLengthIn: step.pieceLengthInches,
      cutUnit: isMeter ? 'm' : (step.unit || planUnit || 'in'),
      cutLengthM: isMeter ? (step.pieceLengthInput || inputLen || Number((step.pieceLengthInches / 39.3701).toFixed(3))) : null,
      quantity: step.piecesToCut,
      remainderIn: step.remainderInches,
      remnantAdded: step.remainderInches > 0,
      reason: 'Multi-Cut Optimization Plan',
      assignBy: '',
      assignTo: ''
    }));
    printCutSlip(virtualLogs);
  }

  function executeSmartSearch(diameter, minLength, showNotification = true, unitOverride = null, piecesOverride = null) {
    refreshDomElements();
    const unit = unitOverride || searchLengthUnit;
    const searchDiameter = Number(diameter);
    const inputLength = Number(minLength);
    const piecesCount = piecesOverride !== null
      ? Number(piecesOverride)
      : (searchPiecesInput ? (parseInt(searchPiecesInput.value, 10) || 1) : 1);

    if (isNaN(searchDiameter) || searchDiameter <= 0 || isNaN(inputLength) || inputLength <= 0) {
      showToast('Please enter valid positive numbers for diameter and length', 'warning');
      return;
    }

    // Convert piece length to inches for matching inventory (rods are stored in inches)
    const requiredLengthInches = unit === 'ft'
      ? Number((inputLength * 12).toFixed(3))
      : (unit === 'm' ? Number((inputLength * 39.3701).toFixed(3)) : inputLength);

    lastSmartSearchQuery = {
      diameter: searchDiameter,
      length: inputLength,
      unit: unit,
      lengthInches: requiredLengthInches,
      pieces: piecesCount
    };

    updateSearchLengthHint();

    // 1. Calculate Multi-Cut Stock Optimizer Plan
    const plan = calculateMultiCutPlan(searchDiameter, requiredLengthInches, piecesCount, unit, activeCutStrategy, inputLength);

    // 2. Individual Matching Rods Query
    const results = rods
      .filter(rod =>
        Number(rod.diameterMm) === searchDiameter &&
        getRodLength(rod) >= requiredLengthInches &&
        Number(rod.quantity) > 0
      )
      .sort((a, b) => getRodLength(a) - getRodLength(b));

    const ftEquiv = Number((requiredLengthInches / 12).toFixed(2));
    const mEquiv = Number((requiredLengthInches / 39.3701).toFixed(2));
    const totalCutFt = Number(((requiredLengthInches * piecesCount) / 12).toFixed(2));
    const totalCutM = Number(((requiredLengthInches * piecesCount) / 39.3701).toFixed(2));
    const totalCutIn = Number((requiredLengthInches * piecesCount).toFixed(2));

    if (unit === 'm') {
      smartResultsCriteria.textContent = `Order: ${searchDiameter} mm dia × ${piecesCount} pcs of ${inputLength} M (${requiredLengthInches} In) — Total: ${totalCutM} M`;
    } else if (unit === 'ft') {
      smartResultsCriteria.textContent = `Order: ${searchDiameter} mm dia × ${piecesCount} pcs of ${inputLength} Ft (${requiredLengthInches} In) — Total: ${totalCutFt} Ft`;
    } else {
      smartResultsCriteria.textContent = `Order: ${searchDiameter} mm dia × ${piecesCount} pcs of ${inputLength} In (${ftEquiv} Ft) — Total: ${totalCutIn} In`;
    }

    if (results.length === 0) {
      smartSearchResultsContainer.classList.add('hidden');
      smartSearchEmptyState.classList.remove('hidden');
      if (smartCutPlanSection) smartCutPlanSection.classList.add('hidden');
      const lengthDesc = unit === 'm'
        ? `${inputLength} M (${requiredLengthInches} In)`
        : (unit === 'ft' ? `${inputLength} Ft (${requiredLengthInches} In)` : `${inputLength} In (${ftEquiv} Ft)`);
      smartSearchEmptyDesc.textContent = `No active rods found with exactly ${searchDiameter} mm diameter and at least ${lengthDesc} available in stock.`;
      if (showNotification) {
        showToast(`No available rods found for ${searchDiameter} mm (≥ ${lengthDesc})`, 'warning');
      }
      return;
    }

    smartSearchEmptyState.classList.add('hidden');
    smartSearchResultsContainer.classList.remove('hidden');
    smartResultsCount.textContent = `${results.length} Matching Stock ${results.length === 1 ? 'Size' : 'Sizes'}`;
    smartResultsTableBody.innerHTML = '';

    // Render Multi-Cut Plan
    renderMultiCutPlan(plan, unit, inputLength);

    results.forEach((rod, index) => {
      const tr = document.createElement('tr');
      const isBestFit = index === 0;
      const rodLenInches = getRodLength(rod);
      const rodLenFeet = Number((rodLenInches / 12).toFixed(2));
      const rodLenM = Number((rodLenInches / 39.3701).toFixed(2));
      const extraLengthInches = Number((rodLenInches - requiredLengthInches).toFixed(2));
      const extraLengthFeet = Number((extraLengthInches / 12).toFixed(2));
      const extraLengthM = Number((extraLengthInches / 39.3701).toFixed(2));
      const cutsPossibleInThisRod = Math.floor(rodLenInches / requiredLengthInches);

      let fitBadge = '';
      if (isBestFit) {
        tr.classList.add('row-best-fit');
        fitBadge = `
          <span class="badge-fit-primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            Optimal Single Fit
          </span>
        `;
      } else {
        fitBadge = `<span class="badge-fit-secondary">Option #${index + 1}</span>`;
      }

      // Cut Remainder badge
      let remnantBadge = '';
      if (extraLengthInches === 0) {
        remnantBadge = `<span class="badge-cut-exact">Exact 1-pc fit (0 scrap)</span>`;
      } else if (cutsPossibleInThisRod > 1) {
        remnantBadge = `<span class="badge-cut-rem" style="background: rgba(99, 102, 241, 0.12); color: #6366f1; border-color: rgba(99, 102, 241, 0.3);">⚡ Yields <strong>${cutsPossibleInThisRod} pcs</strong></span>`;
      } else if (unit === 'm') {
        remnantBadge = `<span class="badge-cut-rem">✂️ <strong>${extraLengthM} M</strong> (${extraLengthInches} In) offcut</span>`;
      } else if (unit === 'ft') {
        remnantBadge = `<span class="badge-cut-rem">✂️ <strong>${extraLengthFeet} Ft</strong> (${extraLengthInches} In) offcut</span>`;
      } else {
        remnantBadge = `<span class="badge-cut-rem">✂️ <strong>${extraLengthInches} In</strong> offcut</span>`;
      }

      // Length display formatting (desktop and mobile)
      let lengthDisplayDesktop = '';
      let lengthDisplayMobile = '';
      if (unit === 'm') {
        lengthDisplayDesktop = `
          <div style="font-weight: 700; font-size: 0.95rem;">${formatDisplayLength(rodLenM)} <span style="font-size: 0.75rem; color: var(--primary-600); font-weight: 600;">M</span></div>
          <div class="text-muted font-mono" style="font-size: 0.75rem;">${formatDisplayLength(rodLenInches)} In (${rodLenFeet} Ft)</div>
        `;
        lengthDisplayMobile = `
          <div style="font-weight: 700; font-size: 0.85rem;">${formatDisplayLength(rodLenM)} M <span style="font-size: 0.725rem; font-weight: normal; color: var(--text-muted);">(${formatDisplayLength(rodLenInches)} In)</span></div>
          <div style="font-size: 0.7rem; margin-top: 0.15rem;">${remnantBadge}</div>
        `;
      } else if (unit === 'ft') {
        lengthDisplayDesktop = `
          <div style="font-weight: 700; font-size: 0.95rem;">${formatDisplayLength(rodLenFeet)} <span style="font-size: 0.75rem; color: var(--primary-600); font-weight: 600;">Ft</span></div>
          <div class="text-muted font-mono" style="font-size: 0.75rem;">${formatDisplayLength(rodLenInches)} In</div>
        `;
        lengthDisplayMobile = `
          <div style="font-weight: 700; font-size: 0.85rem;">${formatDisplayLength(rodLenFeet)} Ft <span style="font-size: 0.725rem; font-weight: normal; color: var(--text-muted);">(${formatDisplayLength(rodLenInches)} In)</span></div>
          <div style="font-size: 0.7rem; margin-top: 0.15rem;">${remnantBadge}</div>
        `;
      } else {
        lengthDisplayDesktop = `<strong>${formatDisplayLength(rodLenInches)}</strong> In <span class="text-muted" style="font-size: 0.75rem;">(${rodLenFeet} Ft)</span>`;
        lengthDisplayMobile = `
          <div style="font-weight: 700; font-size: 0.85rem;">${formatDisplayLength(rodLenInches)} In</div>
          <div style="font-size: 0.7rem; margin-top: 0.15rem;">${remnantBadge}</div>
        `;
      }

      tr.innerHTML = `
        <td class="smart-col-fit hide-mobile">${fitBadge}</td>
        <td class="smart-col-rod">
          <div class="mobile-only" style="margin-bottom: 0.25rem;">${fitBadge}</div>
          <div style="font-weight: 600; line-height: 1.25;">${escapeHtml(rod.name)}</div>
          <div class="font-mono text-muted" style="font-size: 0.725rem;">${escapeHtml(rod.sku || 'No SKU')}</div>
        </td>
        <td class="smart-col-dia hide-mobile text-right font-mono"><strong>${rod.diameterMm}</strong> mm</td>
        <td class="smart-col-len hide-mobile text-right font-mono">${lengthDisplayDesktop}</td>
        <td class="smart-col-size mobile-only text-right font-mono">${lengthDisplayMobile}</td>
        <td class="smart-col-qty text-right font-mono"><strong style="color: var(--primary-700); font-size: 1rem;">${rod.quantity}</strong></td>
        <td class="smart-col-rem hide-mobile">${remnantBadge}</td>
        <td class="smart-col-action text-center">
          <div class="table-actions">
            <button class="btn btn-primary btn-xs btn-open-cut" data-id="${rod.id}" data-cut-len="${requiredLengthInches}" data-pcs-per-rod="${Math.min(piecesCount, cutsPossibleInThisRod)}" title="Cut from this rod and keep offcut">
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
      const unitLabel = unit === 'ft' ? `${inputLength} Ft` : `${inputLength} In`;
      showToast(`Generated cutting plan for ${piecesCount} pcs of ${unitLabel} (${searchDiameter} mm)!`, 'success');
    }
  }

  function resetSmartSearch() {
    refreshDomElements();
    if (searchDiameterInput) searchDiameterInput.value = '';
    if (searchLengthInput) searchLengthInput.value = '';
    if (searchPiecesInput) searchPiecesInput.value = '1';
    setSmartSearchUnit('in', false);
    lastSmartSearchQuery = null;
    activeCutPlan = null;
    if (smartSearchResultsContainer) smartSearchResultsContainer.classList.add('hidden');
    if (smartSearchEmptyState) smartSearchEmptyState.classList.add('hidden');
    if (smartCutPlanSection) smartCutPlanSection.classList.add('hidden');
    updateSearchLengthHint();
  }

  // --- CUT ROD MODAL ACTIONS (SIZE DEDUCTION & OFFCUT REMNANT) ---
  function openCutModal(id, defaultCutLength = null, defaultPiecesPerRod = 1) {
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    if (rod.quantity <= 0) {
      showToast('This rod has 0 available stock to cut', 'warning');
      return;
    }

    cutRodId.value = rod.id;
    cutRodName.textContent = rod.name + (rod.sku ? ` (${rod.sku})` : '');
    cutRodDiameter.textContent = rod.diameterMm;
    const rodLen = getRodLength(rod);
    cutRodFullLength.textContent = `${rodLen.toFixed(1)} In (${(rodLen / 12).toFixed(2)} Ft)`;
    cutRodAvailableQty.textContent = rod.quantity;

    calcOrigLength.textContent = `${rodLen.toFixed(1)} In (${(rodLen / 12).toFixed(2)} Ft)`;

    // Prefill cut length if passed from smart search
    const initialCutLen = defaultCutLength ? parseFloat(defaultCutLength) : rodLen;
    cutRequiredLengthInput.value = initialCutLen;
    cutRequiredLengthInput.max = rodLen;
    if (cutPiecesPerRodInput) {
      cutPiecesPerRodInput.value = defaultPiecesPerRod || 1;
    }
    cutPiecesQtyInput.value = '1';
    cutPiecesQtyInput.max = rod.quantity;
    cutReasonInput.value = '';
    if (cutCreatedByInput) cutCreatedByInput.value = '';
    if (cutAssignedByInput) cutAssignedByInput.value = '';
    cutAutoAddRemnant.checked = true;

    updateCutCalculations();

    cutModalOverlay.classList.remove('hidden');
    cutRequiredLengthInput.focus();
  }

  function closeCutModal() {
    cutModalOverlay.classList.add('hidden');
    if (cutMultiRodSuggestionCard) cutMultiRodSuggestionCard.classList.add('hidden');
    activeModalMultiPlan = null;
    cutForm.reset();
  }

  function generateMiniBarHtml(rodLen, pieceLen, piecesCount, remainder) {
    let html = '';
    const pcPct = (pieceLen / rodLen) * 100;
    for (let i = 0; i < piecesCount; i++) {
      html += `<div class="cut-plan-segment segment-piece" style="width: ${pcPct.toFixed(2)}%; font-size: 0.7rem; padding: 0 4px;" title="Piece #${i + 1}: ${pieceLen} In">${pieceLen}In</div>`;
    }
    const remPct = Math.max(0, 100 - (piecesCount * pcPct));
    if (remPct > 0) {
      const isExact = remainder === 0;
      html += `<div class="cut-plan-segment ${isExact ? 'segment-offcut-exact' : 'segment-offcut-saved'}" style="width: ${remPct.toFixed(2)}%; font-size: 0.7rem; padding: 0 4px;" title="Remaining Offcut: ${remainder} In">${isExact ? '0' : remainder + 'In'}</div>`;
    }
    return html;
  }

  function updateCutCalculations() {
    const rod = rods.find(r => r.id === cutRodId.value);
    if (!rod) return;

    const fullLen = getRodLength(rod);
    const cutPieceLen = parseFloat(cutRequiredLengthInput.value);
    const piecesNeeded = cutPiecesPerRodInput ? (parseInt(cutPiecesPerRodInput.value, 10) || 1) : 1;
    const rodsQty = parseInt(cutPiecesQtyInput.value, 10) || 1;

    calcOrigLength.textContent = `${fullLen.toFixed(1)} In (${(fullLen / 12).toFixed(2)} Ft)`;

    if (isNaN(cutPieceLen) || cutPieceLen <= 0) {
      calcCutLength.textContent = '- 0.0 In';
      calcRemainLength.textContent = '—';
      calcRemainNote.className = 'cut-calc-note warning';
      calcRemainNote.textContent = 'Please enter a valid positive cut piece length in inches.';
      if (cutMultiRodSuggestionCard) cutMultiRodSuggestionCard.classList.add('hidden');
      activeModalMultiPlan = null;
      btnConfirmCut.disabled = true;
      return;
    }

    if (cutPieceLen > fullLen) {
      calcCutLength.textContent = '- 0.0 In';
      calcRemainLength.textContent = 'Invalid!';
      calcRemainNote.className = 'cut-calc-note error';
      calcRemainNote.innerHTML = `⚠️ <strong>Piece Too Long!</strong> Cut piece (${cutPieceLen} In) exceeds rod full length (${fullLen} In).`;
      if (cutMultiRodSuggestionCard) cutMultiRodSuggestionCard.classList.add('hidden');
      activeModalMultiPlan = null;
      btnConfirmCut.disabled = true;
      return;
    }

    const maxPiecesFromThisRod = Math.floor(fullLen / cutPieceLen);
    const maxPiecesTotalFromThisStock = maxPiecesFromThisRod * rodsQty;

    if (cutPiecesPerRodHint) {
      if (maxPiecesFromThisRod > 0) {
        cutPiecesPerRodHint.textContent = piecesNeeded > maxPiecesTotalFromThisStock
          ? `Fits ${maxPiecesTotalFromThisStock} pcs (Needs +${piecesNeeded - maxPiecesTotalFromThisStock} from another rod)`
          : `Max ${maxPiecesFromThisRod} pcs fit in 1 rod (${maxPiecesTotalFromThisStock} in ${rodsQty} rods)`;
      } else {
        cutPiecesPerRodHint.textContent = 'Cannot fit 1 piece';
      }
    }

    // CASE 1: All requested pieces fit in the present rod(s)
    if (piecesNeeded <= maxPiecesTotalFromThisStock) {
      if (cutMultiRodSuggestionCard) cutMultiRodSuggestionCard.classList.add('hidden');
      activeModalMultiPlan = null;

      const totalCutPerRod = Number((piecesNeeded * cutPieceLen).toFixed(2));
      const totalCutPerRodFt = Number((totalCutPerRod / 12).toFixed(2));
      calcCutLength.textContent = `- ${totalCutPerRod.toFixed(1)} In (${piecesNeeded} pcs × ${cutPieceLen.toFixed(1)} In / ${totalCutPerRodFt} Ft)`;

      btnConfirmCut.disabled = false;
      btnConfirmCut.textContent = '✂️ Confirm Cut & Update Inventory';

      const remainder = Number((fullLen - totalCutPerRod).toFixed(2));
      const remainderFt = Number((remainder / 12).toFixed(2));
      calcRemainLength.textContent = `${remainder} In (${remainderFt} Ft)`;

      // Interactive Cut Single-Rod Proportion Bar
      const barWrap = document.getElementById('cutVisualBarWrap');
      const multiBar = document.getElementById('cutVisualMultiBar');
      if (barWrap && multiBar) {
        barWrap.style.display = 'block';
        multiBar.innerHTML = '';

        const pcPct = (cutPieceLen / fullLen) * 100;
        for (let i = 0; i < piecesNeeded; i++) {
          const seg = document.createElement('div');
          seg.className = 'cut-plan-segment segment-piece';
          seg.style.width = `${pcPct.toFixed(2)}%`;
          seg.textContent = pcPct >= 14 ? `Cut #${i + 1} (${cutPieceLen.toFixed(1)}In)` : `${cutPieceLen}In`;
          seg.title = `Piece #${i + 1}: ${cutPieceLen.toFixed(1)} In`;
          multiBar.appendChild(seg);
        }

        const remPct = Math.max(0, 100 - (piecesNeeded * pcPct));
        if (remPct > 0) {
          const remSeg = document.createElement('div');
          remSeg.className = remainder === 0 ? 'cut-plan-segment segment-offcut-exact' : 'cut-plan-segment segment-offcut-saved';
          remSeg.style.width = `${remPct.toFixed(2)}%`;
          remSeg.textContent = remPct >= 14
            ? (remainder === 0 ? 'Exact Fit (0 Scrap)' : `Offcut (${remainder.toFixed(1)}In)`)
            : `${remainder}In`;
          remSeg.title = `Remaining Offcut: ${remainder.toFixed(1)} In (${remainderFt} Ft)`;
          multiBar.appendChild(remSeg);
        }
      }

      const totalPiecesProduced = piecesNeeded * rodsQty;
      if (remainder === 0) {
        calcRemainNote.className = 'cut-calc-note';
        calcRemainNote.innerHTML = `🎯 <strong>Exact Fit!</strong> Rod fully consumed with <strong>0 scrap</strong>. Deducting <strong>${rodsQty}</strong> whole rod(s) to produce <strong>${totalPiecesProduced} piece(s)</strong> of ${cutPieceLen} In!`;
      } else {
        calcRemainNote.className = 'cut-calc-note';
        calcRemainNote.innerHTML = `✂️ Produces <strong>${totalPiecesProduced} piece(s)</strong> of ${cutPieceLen} In (${piecesNeeded} pcs/rod). <strong>${rodsQty} unit(s)</strong> of <strong>${rod.diameterMm} mm × ${remainder} In (${remainderFt} Ft)</strong> offcut remnant will be added to your inventory!`;
      }
      return;
    }

    // CASE 2: Requested cuts EXCEED present rod capacity!
    // Trigger Multi-Rod Cut Suggestion Engine!
    if (cutMultiRodSuggestionCard) cutMultiRodSuggestionCard.classList.remove('hidden');

    const piecesFromThisRod = maxPiecesTotalFromThisStock;
    const remainingPieces = piecesNeeded - piecesFromThisRod;
    const totalCutThisRod = Number((piecesFromThisRod * cutPieceLen).toFixed(2));
    const remainderThisRod = Number((fullLen - totalCutThisRod).toFixed(2));

    calcCutLength.textContent = `- ${totalCutThisRod.toFixed(1)} In (${piecesFromThisRod} pcs from this rod)`;
    calcRemainLength.textContent = `${remainderThisRod} In (${(remainderThisRod / 12).toFixed(2)} Ft)`;
    calcRemainNote.className = 'cut-calc-note warning';
    calcRemainNote.innerHTML = `⚠️ <strong>Present Rod Limit:</strong> Max <strong>${piecesFromThisRod} pcs</strong> fit in this rod. The remaining <strong>${remainingPieces} pc(s)</strong> (${(remainingPieces * cutPieceLen).toFixed(1)} In) will be cut from the suggested rod below.`;

    // Render Rod 1 Bar
    const barWrap = document.getElementById('cutVisualBarWrap');
    const multiBar = document.getElementById('cutVisualMultiBar');
    if (barWrap && multiBar) {
      barWrap.style.display = 'block';
      multiBar.innerHTML = '';
      const pcPct = (cutPieceLen / fullLen) * 100;
      for (let i = 0; i < piecesFromThisRod; i++) {
        const seg = document.createElement('div');
        seg.className = 'cut-plan-segment segment-piece';
        seg.style.width = `${pcPct.toFixed(2)}%`;
        seg.textContent = pcPct >= 14 ? `Cut #${i + 1} (${cutPieceLen.toFixed(1)}In)` : `${cutPieceLen}In`;
        seg.title = `Piece #${i + 1}: ${cutPieceLen.toFixed(1)} In`;
        multiBar.appendChild(seg);
      }
      const remPct = Math.max(0, 100 - (piecesFromThisRod * pcPct));
      if (remPct > 0) {
        const remSeg = document.createElement('div');
        remSeg.className = remainderThisRod === 0 ? 'cut-plan-segment segment-offcut-exact' : 'cut-plan-segment segment-offcut-saved';
        remSeg.style.width = `${remPct.toFixed(2)}%`;
        remSeg.textContent = remPct >= 14
          ? (remainderThisRod === 0 ? 'Exact Fit (0 Scrap)' : `Offcut (${remainderThisRod.toFixed(1)}In)`)
          : `${remainderThisRod}In`;
        remSeg.title = `Remaining Offcut: ${remainderThisRod.toFixed(1)} In`;
        multiBar.appendChild(remSeg);
      }
    }

    // Find candidate additional rods with SAME diameter in stock
    const candidateRods = rods.filter(r => {
      if (Number(r.diameterMm) !== Number(rod.diameterMm)) return false;
      if (getRodLength(r) < cutPieceLen) return false;
      const availUnits = r.id === rod.id ? (r.quantity - rodsQty) : r.quantity;
      return availUnits > 0;
    }).sort((a, b) => {
      const lenA = getRodLength(a);
      const lenB = getRodLength(b);
      const neededLen = remainingPieces * cutPieceLen;
      const aFits = lenA >= neededLen;
      const bFits = lenB >= neededLen;
      if (aFits && !bFits) return -1;
      if (!aFits && bFits) return 1;
      return lenB - lenA;
    });

    if (cutSuggestionCapacityText) {
      cutSuggestionCapacityText.textContent = `Present rod capacity: ${piecesFromThisRod} pcs`;
    }
    if (cutSuggestionDesc) {
      cutSuggestionDesc.innerHTML = `You requested <strong>${piecesNeeded} pcs</strong> (${(piecesNeeded * cutPieceLen).toFixed(1)} In), but this rod only fits <strong>${piecesFromThisRod} pcs</strong>. System suggests cutting <strong>${piecesFromThisRod} pcs</strong> from this rod, then cutting the remaining <strong>${remainingPieces} pc(s)</strong> from another rod in stock:`;
    }

    if (candidateRods.length === 0) {
      // No more stock of this diameter
      if (cutSuggestedRodContainer) cutSuggestedRodContainer.classList.add('hidden');
      if (cutNoStockWarning) cutNoStockWarning.classList.remove('hidden');
      btnConfirmCut.disabled = true;
      btnConfirmCut.textContent = '⚠️ Stock Shortage for Remaining Cuts';
      activeModalMultiPlan = null;
      return;
    }

    // Additional stock exists!
    if (cutSuggestedRodContainer) cutSuggestedRodContainer.classList.remove('hidden');
    if (cutNoStockWarning) cutNoStockWarning.classList.add('hidden');

    if (cutSuggestedRodSelect) {
      const currentSelectedVal = cutSuggestedRodSelect.value;
      cutSuggestedRodSelect.innerHTML = '';
      candidateRods.forEach(cRod => {
        const opt = document.createElement('option');
        opt.value = cRod.id;
        const cLen = getRodLength(cRod);
        const availUnits = cRod.id === rod.id ? (cRod.quantity - rodsQty) : cRod.quantity;
        const isSame = cRod.id === rod.id;
        opt.textContent = isSame
          ? `Unit #${rodsQty + 1} of this same rod — Length: ${cLen} In (${availUnits} more in stock)`
          : `${cRod.name} — Length: ${cLen} In (${(cLen / 12).toFixed(2)} Ft) • ${availUnits} in stock`;
        cutSuggestedRodSelect.appendChild(opt);
      });
      if (currentSelectedVal && candidateRods.some(r => r.id === currentSelectedVal)) {
        cutSuggestedRodSelect.value = currentSelectedVal;
      }
    }

    const selectedSecondRodId = cutSuggestedRodSelect ? cutSuggestedRodSelect.value : candidateRods[0].id;
    const secondRod = candidateRods.find(r => r.id === selectedSecondRodId) || candidateRods[0];
    const secondRodLen = getRodLength(secondRod);
    const maxPiecesFromSecondRod = Math.floor(secondRodLen / cutPieceLen);

    const piecesFromSecondRod = Math.min(remainingPieces, maxPiecesFromSecondRod);
    const cutFromSecondRod = Number((piecesFromSecondRod * cutPieceLen).toFixed(2));
    const remainderFromSecondRod = Number((secondRodLen - cutFromSecondRod).toFixed(2));

    const steps = [
      {
        stepNum: 1,
        rodId: rod.id,
        rodName: rod.name,
        diameterMm: Number(rod.diameterMm),
        sourceLength: fullLen,
        piecesToCut: piecesFromThisRod,
        totalCut: totalCutThisRod,
        remainder: remainderThisRod,
        isPresentRod: true
      },
      {
        stepNum: 2,
        rodId: secondRod.id,
        rodName: secondRod.id === rod.id ? `${rod.name} (Unit #${rodsQty + 1})` : secondRod.name,
        diameterMm: Number(secondRod.diameterMm),
        sourceLength: secondRodLen,
        piecesToCut: piecesFromSecondRod,
        totalCut: cutFromSecondRod,
        remainder: remainderFromSecondRod,
        isPresentRod: false
      }
    ];

    const unfulfilledPieces = remainingPieces - piecesFromSecondRod;

    activeModalMultiPlan = {
      diameterMm: Number(rod.diameterMm),
      cutPieceLen: cutPieceLen,
      piecesNeeded: piecesNeeded,
      steps: steps,
      unfulfilledPieces: unfulfilledPieces
    };

    if (cutSuggestedStepsPreview) {
      cutSuggestedStepsPreview.innerHTML = `
        <div class="suggested-step-mini-card">
          <div class="suggested-step-header">
            <span class="suggested-step-title">Step #1: ${escapeHtml(rod.name)} (Present Rod)</span>
            <span class="suggested-step-badge">Cut ${piecesFromThisRod} pcs (${totalCutThisRod} In)</span>
          </div>
          <div class="suggested-step-details">
            Full Length: <strong>${fullLen} In</strong> &bull; Cut: <strong>${piecesFromThisRod} pcs × ${cutPieceLen} In</strong> &bull;
            Offcut: <strong>+${remainderThisRod} In</strong> ${(remainderThisRod > 0 ? '(Saved to Stock)' : '(0 Scrap)')}
          </div>
          <div class="cut-plan-visual-bar" style="height: 18px;">
            ${generateMiniBarHtml(fullLen, cutPieceLen, piecesFromThisRod, remainderThisRod)}
          </div>
        </div>

        <div class="suggested-step-mini-card">
          <div class="suggested-step-header">
            <span class="suggested-step-title">Step #2: ${escapeHtml(secondRod.id === rod.id ? `${rod.name} (Next Unit in Stock)` : secondRod.name)}</span>
            <span class="suggested-step-badge" style="background: var(--success-bg); color: var(--success-text);">
              Cut ${piecesFromSecondRod} pcs (${cutFromSecondRod} In)
            </span>
          </div>
          <div class="suggested-step-details">
            Source Length: <strong>${secondRodLen} In</strong> &bull; Cut: <strong>${piecesFromSecondRod} pcs × ${cutPieceLen} In</strong> &bull;
            Offcut: <strong>+${remainderFromSecondRod} In</strong> ${(remainderFromSecondRod > 0 ? '(Saved to Stock)' : '(0 Scrap)')}
          </div>
          <div class="cut-plan-visual-bar" style="height: 18px;">
            ${generateMiniBarHtml(secondRodLen, cutPieceLen, piecesFromSecondRod, remainderFromSecondRod)}
          </div>
        </div>
      `;
    }

    if (unfulfilledPieces > 0) {
      btnConfirmCut.disabled = true;
      btnConfirmCut.textContent = `⚠️ Stock Shortage: Need ${unfulfilledPieces} more piece(s)`;
    } else {
      btnConfirmCut.disabled = false;
      btnConfirmCut.textContent = `✂️ Cut Both Rods (${piecesNeeded} pcs Total) & Update Stock`;
    }
  }

  function handleCutSubmit(e) {
    e.preventDefault();

    // A. MULTI-ROD CUT EXECUTION (WHEN SUGGESTION IS ACTIVE)
    if (activeModalMultiPlan && activeModalMultiPlan.steps && activeModalMultiPlan.steps.length > 1) {
      const plan = activeModalMultiPlan;
      const shouldAddRemnant = cutAutoAddRemnant.checked;
      const reason = cutReasonInput.value.trim();
      const createdBy = cutCreatedByInput ? cutCreatedByInput.value.trim() : '';
      const assignedBy = cutAssignedByInput ? cutAssignedByInput.value.trim() : '';

      for (const step of plan.steps) {
        const targetRod = rods.find(r => r.id === step.rodId);
        if (!targetRod) continue;

        // Deduct 1 unit
        targetRod.quantity -= 1;
        targetRod.updatedAt = Date.now();

        // Handle offcut remnant
        if (step.remainder > 0 && shouldAddRemnant) {
          const existingRemnant = rods.find(r =>
            r.id !== targetRod.id &&
            r.name.toLowerCase() === targetRod.name.toLowerCase() &&
            Number(r.diameterMm) === Number(targetRod.diameterMm) &&
            Math.abs(getRodLength(r) - step.remainder) < 0.05
          );

          if (existingRemnant) {
            existingRemnant.quantity += 1;
            existingRemnant.updatedAt = Date.now();
          } else {
            rods.push({
              id: 'rod-cut-' + Date.now() + '-' + step.stepNum,
              sku: targetRod.sku ? `${targetRod.sku}-CUT` : `ROD-${Math.round(targetRod.diameterMm)}MM-${Math.round(step.remainder)}IN`,
              name: targetRod.name,
              diameterMm: Number(targetRod.diameterMm),
              lengthIn: step.remainder,
              lengthFt: step.remainder,
              quantity: 1,
              notes: `Offcut from ${step.sourceLength} In (${step.piecesToCut} pcs of ${plan.cutPieceLen} In)${reason ? ' (' + reason + ')' : ''}`,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }
        }

        // Add Cut Log
        cutLogs.unshift({
          id: 'log-' + Date.now() + '-' + step.stepNum,
          timestamp: Date.now(),
          rodName: targetRod.name,
          diameterMm: Number(targetRod.diameterMm),
          originalLengthIn: step.sourceLength,
          originalLengthFt: step.sourceLength,
          cutLengthIn: plan.cutPieceLen,
          cutLengthFt: plan.cutPieceLen,
          quantity: step.piecesToCut,
          remainderIn: step.remainder,
          remainderFt: step.remainder,
          remnantAdded: step.remainder > 0 && shouldAddRemnant,
          reason: reason || `Multi-Rod Cut (${step.stepNum}/${plan.steps.length})`,
          createdBy: createdBy || '',
          assignedBy: assignedBy || '',
          assignBy: createdBy || '',
          assignTo: assignedBy || ''
        });
      }

      // Clean up rods with quantity <= 0
      rods = rods.filter(r => r.quantity > 0);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(rods));
      localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
      updateCutLogsBadge();
      updateDashboard();
      closeCutModal();

      // Backend sync
      window.dispatchEvent(new CustomEvent('syncBothToBackend', {
        detail: {
          rods: rods,
          cutLogs: cutLogs,
          summary: `Multi-Rod Cut: ${plan.piecesNeeded} pcs of ${plan.cutPieceLen}In (${plan.diameterMm}mm)`
        }
      }));

      showToast(`✂️ Successfully cut ${plan.piecesNeeded} pieces across ${plan.steps.length} rods! Offcuts saved.`, 'success');
      return;
    }

    // B. STANDARD SINGLE-ROD EXECUTION
    const id = cutRodId.value;
    const rod = rods.find(r => r.id === id);
    if (!rod) return;

    const cutPieceLen = parseFloat(cutRequiredLengthInput.value);
    const piecesPerRod = cutPiecesPerRodInput ? (parseInt(cutPiecesPerRodInput.value, 10) || 1) : 1;
    const rodsQty = parseInt(cutPiecesQtyInput.value, 10);
    const shouldAddRemnant = cutAutoAddRemnant.checked;
    const reason = cutReasonInput.value.trim();
    const createdBy = cutCreatedByInput ? cutCreatedByInput.value.trim() : '';
    const assignedBy = cutAssignedByInput ? cutAssignedByInput.value.trim() : '';

    if (isNaN(cutPieceLen) || cutPieceLen <= 0) {
      showToast('Please enter a valid cut piece length in inches', 'warning');
      return;
    }

    const sourceLen = getRodLength(rod);
    const totalCutPerRod = Number((piecesPerRod * cutPieceLen).toFixed(2));
    if (totalCutPerRod > sourceLen) {
      showToast(`Total cuts per rod (${piecesPerRod} pcs × ${cutPieceLen} In = ${totalCutPerRod} In) exceeds rod length (${sourceLen} In)`, 'danger');
      return;
    }

    if (isNaN(rodsQty) || rodsQty <= 0) {
      showToast('Please specify at least 1 rod to cut', 'warning');
      return;
    }

    if (rodsQty > rod.quantity) {
      showToast(`Cannot cut ${rodsQty} rods. Only ${rod.quantity} available in stock!`, 'danger');
      return;
    }

    const origLength = sourceLen;
    const remainder = Number((origLength - totalCutPerRod).toFixed(2));
    const totalPiecesProduced = piecesPerRod * rodsQty;
    let remnantMsg = '';

    // 1. MODIFY PREVIOUS ROD DATA:
    if (rodsQty === rod.quantity) {
      // All units of this rod entry were cut
      if (remainder > 0 && shouldAddRemnant) {
        // Look for an existing rod with the same name, diameter, and remainder length (excluding this rod)
        const existingRemnant = rods.find(r =>
          r.id !== rod.id &&
          r.name.toLowerCase() === rod.name.toLowerCase() &&
          Number(r.diameterMm) === Number(rod.diameterMm) &&
          Math.abs(getRodLength(r) - remainder) < 0.05
        );

        if (existingRemnant) {
          // Merge into the existing rod of that length
          existingRemnant.quantity += rodsQty;
          existingRemnant.updatedAt = Date.now();
          rods = rods.filter(r => r.id !== rod.id);
          remnantMsg = ` Merged into existing ${rod.diameterMm}mm × ${remainder}In stock (Total: <strong>${existingRemnant.quantity} units</strong>)!`;
        } else {
          // DIRECTLY MODIFY PREVIOUS ENTRY!
          rod.lengthIn = remainder;
          rod.lengthFt = remainder;
          rod.updatedAt = Date.now();
          if (reason) {
            rod.notes = rod.notes ? `${rod.notes} | Cut: ${reason}` : `Cut: ${reason}`;
          }
          remnantMsg = ` Modified entry length to <strong>${remainder} In</strong> (${rod.quantity} units in stock)!`;
        }
      } else {
        // Remainder is 0 or remnant offcut not kept
        rod.quantity = 0;
        rod.updatedAt = Date.now();
        remnantMsg = ` Stock fully consumed!`;
      }
    } else {
      // Some units of this rod entry were cut
      rod.quantity -= rodsQty;
      rod.updatedAt = Date.now();

      if (remainder > 0 && shouldAddRemnant) {
        const existingRemnant = rods.find(r =>
          r.name.toLowerCase() === rod.name.toLowerCase() &&
          Number(r.diameterMm) === Number(rod.diameterMm) &&
          Math.abs(getRodLength(r) - remainder) < 0.05
        );

        if (existingRemnant) {
          existingRemnant.quantity += rodsQty;
          existingRemnant.updatedAt = Date.now();
          remnantMsg = ` Added to existing ${rod.diameterMm}mm × ${remainder}In stock (Total: <strong>${existingRemnant.quantity} units</strong>)!`;
        } else {
          const newOffcutRod = {
            id: 'rod-cut-' + Date.now(),
            sku: rod.sku ? `${rod.sku}-CUT` : `ROD-${Math.round(rod.diameterMm)}MM-${Math.round(remainder)}IN`,
            name: rod.name,
            diameterMm: Number(rod.diameterMm),
            lengthIn: remainder,
            lengthFt: remainder,
            quantity: rodsQty,
            notes: `Cut from ${origLength} In (${piecesPerRod} pcs of ${cutPieceLen} In)${reason ? ' (' + reason + ')' : ''}`,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          rods.push(newOffcutRod);
          remnantMsg = ` Created entry for <strong>${rodsQty} unit(s)</strong> of ${rod.diameterMm}mm × ${remainder}In offcut!`;
        }
      }
    }

    // 2. Add to Cut Logs
    const logEntry = {
      id: 'log-' + Date.now(),
      timestamp: Date.now(),
      rodName: rod.name,
      diameterMm: Number(rod.diameterMm),
      originalLengthIn: origLength,
      originalLengthFt: origLength,
      cutLengthIn: cutPieceLen,
      cutLengthFt: cutPieceLen,
      quantity: totalPiecesProduced,
      remainderIn: remainder,
      remainderFt: remainder,
      remnantAdded: remainder > 0 && shouldAddRemnant,
      reason: reason || (piecesPerRod > 1 ? `Multi-Cut (${piecesPerRod} pcs/rod)` : 'Job Cut'),
      createdBy: createdBy || '',
      assignedBy: assignedBy || '',
      assignBy: createdBy || '',
      assignTo: assignedBy || ''
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
      `Cut <strong>${totalPiecesProduced} piece(s)</strong> of <strong>${cutPieceLen} In</strong> from ${rod.name} (${rod.diameterMm}mm)!${remnantMsg}`,
      'success'
    );

    // 5. Auto-print invoice slip
    printCutSlip(logEntry);
  }

  // --- HELPER TO UPDATE CUT LOG ASSIGNEES FROM SLIP PREVIEW (1 OR MANY) ---
  window.updateCutLogAssignees = function(logIds, assignBy, assignTo) {
    const ids = Array.isArray(logIds) ? logIds : String(logIds || '').split(',').map(s => s.trim()).filter(Boolean);
    let updated = false;
    ids.forEach(id => {
      const entry = cutLogs.find(l => l.id === id);
      if (entry) {
        entry.assignBy = assignBy;
        entry.assignTo = assignTo;
        if (assignTo) entry.assignedBy = assignTo;
        if (assignBy) entry.createdBy = assignBy;
        updated = true;
      }
    });
    if (updated) {
      try {
        localStorage.setItem(CUT_LOGS_STORAGE_KEY, JSON.stringify(cutLogs));
        renderCutLogsTable();
      } catch (err) {}
    }
  };

  // --- CUT SLIP INVOICE PRINTER (SUPPORTS 1 OR MANY CUTTING LOGS IN ONE SLIP) ---
  function printCutSlip(input) {
    let logs = [];
    if (Array.isArray(input)) {
      logs = input.filter(Boolean);
    } else if (input && typeof input === 'object') {
      logs = [input];
    } else {
      if (selectedCutLogIds && selectedCutLogIds.size > 0) {
        logs = cutLogs.filter(l => selectedCutLogIds.has(l.id));
      }
    }

    if (!logs || logs.length === 0) {
      showToast('Please select 1 or more cut logs using checkboxes to print a combined slip', 'warning');
      return;
    }

    const isMulti = logs.length > 1;

    // Format clean Ref number like Cut14070316 or CutBatch-8821-3Items
    let cleanRef = '';
    if (!isMulti) {
      cleanRef = String(logs[0].id || ('Cut' + Date.now()))
        .replace(/^log[-_]?/i, 'Cut')
        .replace(/^cut[-_]?/i, 'Cut');
      if (!cleanRef.startsWith('Cut')) cleanRef = 'Cut' + cleanRef;
    } else {
      const firstPart = String(logs[0].id || Date.now()).replace(/\D/g, '').slice(-4) || 'M';
      cleanRef = `CutBatch-${firstPart}-${logs.length}Items`;
    }

    // Resolve initial Assign By and Assign To
    let defaultAssignBy = '';
    let defaultAssignTo = '';
    for (const log of logs) {
      if (!defaultAssignBy) {
        defaultAssignBy = log.assignBy || log.createdBy || log.assignedBy || '';
      }
      if (!defaultAssignTo) {
        defaultAssignTo = log.assignTo || (log.assignedBy && log.assignedBy !== defaultAssignBy ? log.assignedBy : '');
      }
      if (defaultAssignBy && defaultAssignTo) break;
    }

    // Totals
    let totalPieces = 0;
    logs.forEach(l => {
      totalPieces += (parseInt(l.quantity, 10) || 1);
    });

    // Date & Time formatted as: Oct 10, 2026, 12:04 PM
    const latestTimestamp = Math.max(...logs.map(l => l.timestamp || 0)) || Date.now();
    const dateObj = new Date(latestTimestamp);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ', ' + dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Content for Single Item vs Multiple Items
    let slipContentHtml = '';
    if (!isMulti) {
      const log = logs[0];
      const origLen = getLogOrigLength(log);
      const origLenFt = origLen / 12;
      const cutLenNum = getLogCutLength(log);

      const isMeterLog = log.cutUnit === 'm' || log.unit === 'm' || (log.cutLengthM !== undefined && log.cutLengthM !== null) || (String(log.id || '').startsWith('plan-') && (searchLengthUnit === 'm' || (activeCutPlan && activeCutPlan.unit === 'm')));

      let cutLenFormatted = '';
      if (isMeterLog) {
        const mVal = (log.cutLengthM !== undefined && log.cutLengthM !== null && !isNaN(log.cutLengthM))
          ? Number(log.cutLengthM)
          : (activeCutPlan && activeCutPlan.unit === 'm' && activeCutPlan.inputLength !== undefined && activeCutPlan.inputLength !== null
              ? Number(activeCutPlan.inputLength)
              : (lastSmartSearchQuery && lastSmartSearchQuery.unit === 'm' && lastSmartSearchQuery.length
                  ? Number(lastSmartSearchQuery.length)
                  : Number((cutLenNum / 39.3701).toFixed(3))));
        const formattedM = Number.isInteger(mVal) ? mVal : parseFloat(mVal.toFixed(3));
        cutLenFormatted = `${formattedM} meter`;
      } else {
        cutLenFormatted = (Number.isInteger(cutLenNum) ? cutLenNum : parseFloat(cutLenNum.toFixed(2))) + 'in';
      }

      const diaFormatted = String(log.diameterMm || '').toLowerCase().endsWith('mm')
        ? String(log.diameterMm)
        : (log.diameterMm + 'mm');
      const qty = parseInt(log.quantity, 10) || 1;
      const qtyFormatted = `${qty} pc${qty > 1 ? 's' : ''}`;
      const remLen = getLogRemainder(log);

      slipContentHtml = `
        <div class="slip-rod-title">${escapeForHtml(log.rodName)}</div>
        ${origLen > 0 ? `
        <div class="slip-rod-source-length">Source Rod Length: ${formatDisplayLength(origLen)} in (${formatDisplayLength(origLenFt)} ft)</div>
        ` : ''}

        <div class="slip-data-row">
          <span class="slip-data-label">Assign By :</span>
          <span class="slip-data-value" id="displayAssignBy">${escapeForHtml(defaultAssignBy || '—')}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">Assign To :</span>
          <span class="slip-data-value" id="displayAssignTo">${escapeForHtml(defaultAssignTo || '—')}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">Diameter :</span>
          <span class="slip-data-value">${escapeForHtml(diaFormatted)}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">Cut Piece Length :</span>
          <span class="slip-data-value">${escapeForHtml(cutLenFormatted)}</span>
        </div>

        <div class="slip-data-row">
          <span class="slip-data-label">QTY :</span>
          <span class="slip-data-value">${escapeForHtml(qtyFormatted)}</span>
        </div>

        ${remLen > 0 ? `
        <div class="slip-data-row">
          <span class="slip-data-label">Offcut Remnant :</span>
          <span class="slip-data-value">+${escapeForHtml(formatDisplayLength(remLen))} in ${log.remnantAdded ? '(In Stock)' : ''}</span>
        </div>
        ` : ''}

        ${log.reason ? `
        <div class="slip-data-row">
          <span class="slip-data-label">Job Ref :</span>
          <span class="slip-data-value">${escapeForHtml(log.reason)}</span>
        </div>
        ` : ''}
      `;
    } else {
      slipContentHtml = `
        <div class="slip-data-row" style="margin-bottom: 4px;">
          <span class="slip-data-label">Assign By :</span>
          <span class="slip-data-value" id="displayAssignBy">${escapeForHtml(defaultAssignBy || '—')}</span>
        </div>

        <div class="slip-data-row" style="margin-bottom: 8px;">
          <span class="slip-data-label">Assign To :</span>
          <span class="slip-data-value" id="displayAssignTo">${escapeForHtml(defaultAssignTo || '—')}</span>
        </div>

        <table class="slip-items-table">
          <thead>
            <tr>
              <th style="width: 14px; text-align: left;">#</th>
              <th style="text-align: left;">Rod</th>
              <th style="text-align: center; width: 44px;">Size</th>
              <th style="text-align: right; min-width: 44px; white-space: nowrap;">Cut</th>
              <th style="text-align: right; width: 30px;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map((log, idx) => {
              const origLenN = getLogOrigLength(log);
              const cutLenN = getLogCutLength(log);
              const isMeterItem = log.cutUnit === 'm' || log.unit === 'm' || (log.cutLengthM !== undefined && log.cutLengthM !== null) || (String(log.id || '').startsWith('plan-') && (searchLengthUnit === 'm' || (activeCutPlan && activeCutPlan.unit === 'm')));
              let cutFmt = '';
              if (isMeterItem) {
                const mVal = (log.cutLengthM !== undefined && log.cutLengthM !== null && !isNaN(log.cutLengthM))
                  ? Number(log.cutLengthM)
                  : (activeCutPlan && activeCutPlan.unit === 'm' && activeCutPlan.inputLength !== undefined && activeCutPlan.inputLength !== null
                      ? Number(activeCutPlan.inputLength)
                      : (lastSmartSearchQuery && lastSmartSearchQuery.unit === 'm' && lastSmartSearchQuery.length
                          ? Number(lastSmartSearchQuery.length)
                          : Number((cutLenN / 39.3701).toFixed(3))));
                const formattedM = Number.isInteger(mVal) ? mVal : parseFloat(mVal.toFixed(3));
                cutFmt = `${formattedM} meter`;
              } else {
                cutFmt = (Number.isInteger(cutLenN) ? cutLenN : parseFloat(cutLenN.toFixed(2))) + 'in';
              }
              const diaFmt = String(log.diameterMm || '').toLowerCase().endsWith('mm') ? String(log.diameterMm) : (log.diameterMm + 'mm');
              const q = parseInt(log.quantity, 10) || 1;
              const rem = getLogRemainder(log);
              return `
              <tr>
                <td style="font-weight: 700; vertical-align: top; padding: 4px 2px;">${idx + 1}.</td>
                <td style="padding: 4px 2px;">
                  <div style="font-weight: 800; font-size: 0.72rem; line-height: 1.2;">${escapeForHtml(log.rodName)}</div>
                  ${origLenN > 0 ? `<div style="font-size: 0.63rem; font-weight: normal; color: #334155; margin-top: 1px;">Source: ${formatDisplayLength(origLenN)}in (${formatDisplayLength(origLenN / 12)}ft)</div>` : ''}
                  ${rem > 0 ? `<div style="font-size: 0.61rem; font-weight: normal; color: #475569; margin-top: 1px;">Offcut: +${formatDisplayLength(rem)}in</div>` : ''}
                </td>
                <td style="text-align: center; font-weight: 800; font-size: 0.72rem; vertical-align: top; padding: 4px 2px; white-space: nowrap;">${escapeForHtml(diaFmt)}</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.72rem; vertical-align: top; padding: 4px 2px; white-space: nowrap;">${escapeForHtml(cutFmt)}</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.72rem; vertical-align: top; padding: 4px 2px;">${q}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 800; padding: 5px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 6px 0 8px 0;">
          <span>TOTAL: ${logs.length} Cut Items</span>
          <span>${totalPieces} Total Pieces</span>
        </div>
      `;
    }

    const logIdsJson = JSON.stringify(logs.map(l => l.id));

    const html = `<!DOCTYPE html>
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
          <span>${isMulti ? `Cut Slip (${logs.length} Items)` : 'Cut Slip'}</span>
          <span>${isMulti ? `${totalPieces} Total Pcs` : 'Preview'}</span>
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

    <div class="preview-hint">You can edit Assign By and Assign To before printing:</div>

    <div class="preview-field">
      <label class="preview-label" for="inputAssignBy">Assign By :</label>
      <input type="text" id="inputAssignBy" class="preview-input" value="${escapeForHtml(defaultAssignBy)}" placeholder="e.g. Roshni, Suman, Bhawna" />
    </div>

    <div class="preview-field">
      <label class="preview-label" for="inputAssignTo">Assign To :</label>
      <input type="text" id="inputAssignTo" class="preview-input" value="${escapeForHtml(defaultAssignTo)}" placeholder="e.g. Jai Parkash, Bhushan" />
    </div>
  </div>

  <!-- THE RECEIPT SLIP -->
  <div class="slip-container">
    <div class="slip-company-name">FINE BEARINGS &amp; OIL SEAL STORE</div>
    <div class="slip-disclaimer">Note: This is not an official invoice. It is a computer-generated slip for store use only.</div>

    <hr class="slip-divider" />

    <div class="slip-meta-row">
      <span class="slip-ref-no">Ref: ${escapeForHtml(cleanRef)}</span>
      <span class="slip-brand-logo">RODSYNC</span>
    </div>

    ${slipContentHtml}

    <div class="slip-signs-row">
      <span>Sign : ________</span>
      <span>Sign : ________</span>
    </div>

    <div class="slip-date-row">
      <span class="slip-date-label">Date &amp; Time :</span>
      <span class="slip-date-value">${escapeForHtml(dateStr)}</span>
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
      const logIds = ${logIdsJson};
      const inBy = document.getElementById('inputAssignBy');
      const inTo = document.getElementById('inputAssignTo');
      const dispBy = document.getElementById('displayAssignBy');
      const dispTo = document.getElementById('displayAssignTo');

      function sync() {
        const byVal = inBy ? inBy.value.trim() : '';
        const toVal = inTo ? inTo.value.trim() : '';
        if (dispBy) dispBy.textContent = byVal || '—';
        if (dispTo) dispTo.textContent = toVal || '—';
        try {
          if (window.opener && typeof window.opener.updateCutLogAssignees === 'function') {
            window.opener.updateCutLogAssignees(logIds, byVal, toVal);
          }
        } catch (e) {}
      }

      if (inBy) inBy.addEventListener('input', sync);
      if (inTo) inTo.addEventListener('input', sync);
    })();
  </script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=380,height=720,toolbar=0,menubar=0,scrollbars=1');
    if (!win) {
      showToast('⚠️ Pop-up blocked! Please allow pop-ups to view and print the cut slip.', 'warning', 6000);
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

  function updateSelectedCutLogsUI() {
    refreshDomElements();
    const count = selectedCutLogIds.size;
    if (selectedLogsCount) selectedLogsCount.textContent = count;
    if (selectedLogsCountFooter) selectedLogsCountFooter.textContent = count;

    // Synchronize individual checkboxes
    document.querySelectorAll('.cut-log-checkbox').forEach(cb => {
      const id = cb.dataset.logId;
      const checked = selectedCutLogIds.has(id);
      cb.checked = checked;
      const row = cb.closest('tr');
      if (row) row.classList.toggle('selected-cut-log-row', checked);
      const card = cb.closest('.cut-log-card');
      if (card) card.classList.toggle('selected-card', checked);
    });

    // Synchronize selectAll header checkbox
    if (selectAllCutLogs) {
      const visibleCheckboxes = Array.from(document.querySelectorAll('#cutLogsTableBody .cut-log-checkbox'));
      if (visibleCheckboxes.length > 0) {
        const allChecked = visibleCheckboxes.every(cb => cb.checked);
        const someChecked = visibleCheckboxes.some(cb => cb.checked);
        selectAllCutLogs.checked = allChecked;
        selectAllCutLogs.indeterminate = !allChecked && someChecked;
      } else {
        selectAllCutLogs.checked = false;
        selectAllCutLogs.indeterminate = false;
      }
    }

    // Visual emphasis on combined print buttons
    if (btnPrintCombinedSlip) {
      if (count > 0) {
        btnPrintCombinedSlip.classList.remove('btn-secondary');
        btnPrintCombinedSlip.classList.add('btn-primary');
      } else {
        btnPrintCombinedSlip.classList.remove('btn-primary');
        btnPrintCombinedSlip.classList.add('btn-secondary');
      }
    }
  }

  function handlePrintSelectedSlip() {
    if (selectedCutLogIds.size === 0) {
      const keyword = filterCutLogsInput ? filterCutLogsInput.value.trim().toLowerCase() : '';
      const filteredLogs = cutLogs.filter(log => {
        if (!keyword) return true;
        const matchName = (log.rodName || '').toLowerCase().includes(keyword);
        const matchReason = (log.reason || '').toLowerCase().includes(keyword);
        const matchDia = (log.diameterMm + 'mm').includes(keyword);
        return matchName || matchReason || matchDia;
      });

      if (filteredLogs.length === 1) {
        printCutSlip(filteredLogs[0]);
        return;
      }

      showToast('Please select 1 or more cut logs using the checkboxes to print a combined slip', 'warning');
      return;
    }

    const logsToPrint = cutLogs.filter(log => selectedCutLogIds.has(log.id));
    if (logsToPrint.length === 0) {
      showToast('No matching cut logs found for selection', 'warning');
      return;
    }

    printCutSlip(logsToPrint);
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
      updateSelectedCutLogsUI();
      return;
    }

    if (cutLogsTableWrapper) cutLogsTableWrapper.classList.remove('hidden');
    if (cutLogsCardsContainer) cutLogsCardsContainer.classList.remove('hidden');
    cutLogsEmptyState.classList.add('hidden');

    filteredLogs.forEach(log => {
      const isSelected = selectedCutLogIds.has(log.id);
      const dateStr = new Date(log.timestamp).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const origLen = getLogOrigLength(log);
      const cutLen = getLogCutLength(log);
      const remLen = getLogRemainder(log);

      let remnantDisplay = '';
      let remnantCardBadge = '';
      if (remLen > 0) {
        remnantDisplay = `<span class="badge-cut-rem">✂️ +${formatDisplayLength(remLen)} In</span> ${log.remnantAdded ? '<span style="font-size: 0.725rem; color: var(--success-solid); font-weight: 600;">(Added to stock)</span>' : ''}`;
        remnantCardBadge = `<span class="badge-cut-rem">✂️ Offcut +${formatDisplayLength(remLen)} In</span> ${log.remnantAdded ? '<span style="font-size: 0.725rem; color: var(--success-solid); font-weight: 600;">(In Stock)</span>' : ''}`;
      } else {
        remnantDisplay = `<span class="badge-cut-exact">Exact Cut (0 scrap)</span>`;
        remnantCardBadge = `<span class="badge-cut-exact">Exact Cut (0 scrap)</span>`;
      }

      // 1. Table Row (for Desktop view)
      const tr = document.createElement('tr');
      if (isSelected) tr.classList.add('selected-cut-log-row');
      tr.innerHTML = `
        <td style="text-align: center; vertical-align: middle;">
          <input type="checkbox" class="cut-log-checkbox" data-log-id="${log.id}" ${isSelected ? 'checked' : ''} title="Select this cut for slip" style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--primary-600);" />
        </td>
        <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(log.rodName)}</div>
          <div class="font-mono text-muted" style="font-size: 0.75rem;">${log.diameterMm} mm diameter</div>
        </td>
        <td class="text-right font-mono">${formatDisplayLength(origLen)} In</td>
        <td class="text-right font-mono" style="color: var(--danger-solid); font-weight: 700;">-${formatDisplayLength(cutLen)} In</td>
        <td class="text-right font-mono"><strong>${log.quantity}</strong></td>
        <td>${remnantDisplay}</td>
        <td><span style="font-size: 0.825rem; color: var(--text-secondary);">${escapeHtml(log.reason || '—')}</span></td>
        <td style="text-align:center;">
          <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.5;">
            ${log.createdBy ? `<div><span style="font-weight:500;">👤 Created:</span> ${escapeHtml(log.createdBy)}</div>` : ''}
            ${log.assignedBy ? `<div><span style="font-weight:500;">🏷️ Assigned:</span> ${escapeHtml(log.assignedBy)}</div>` : (!log.createdBy ? '—' : '')}
          </div>
        </td>
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
        card.className = `cut-log-card ${isSelected ? 'selected-card' : ''}`;
        card.innerHTML = `
          <div class="cut-log-card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div class="cut-log-card-title-group" style="flex:1;">
              <span class="cut-log-rod-name">${escapeHtml(log.rodName)}</span>
              <span class="cut-log-spec-pill">⌀ ${log.diameterMm} mm</span>
            </div>
            <label class="cut-log-select-pill" style="display:inline-flex; align-items:center; gap:5px; font-size:0.75rem; font-weight:700; cursor:pointer; background:var(--bg-surface-elevated, #f1f5f9); border:1px solid var(--border-medium, #cbd5e1); border-radius:9999px; padding:3px 9px; user-select:none; flex-shrink:0;">
              <input type="checkbox" class="cut-log-checkbox" data-log-id="${log.id}" ${isSelected ? 'checked' : ''} style="cursor:pointer; width:15px; height:15px; accent-color: var(--primary-600);" />
              <span>Select</span>
            </label>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">${dateStr}</div>

          <div class="cut-log-card-metrics">
            <div class="cut-log-metric-item">
              <span class="cut-log-metric-label">Original</span>
              <span class="cut-log-metric-value font-mono">${formatDisplayLength(origLen)} In</span>
            </div>
            <div class="cut-log-metric-item">
              <span class="cut-log-metric-label">Cut Size</span>
              <span class="cut-log-metric-value cut-length font-mono">-${formatDisplayLength(cutLen)} In</span>
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

          ${(log.createdBy || log.assignedBy) ? `
          <div class="cut-log-card-reason" style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">
            ${log.createdBy ? `<div style="font-size:0.78rem; color:var(--text-secondary);"><strong>👤 Created by:</strong> ${escapeHtml(log.createdBy)}</div>` : ''}
            ${log.assignedBy ? `<div style="font-size:0.78rem; color:var(--text-secondary);"><strong>🏷️ Assigned by:</strong> ${escapeHtml(log.assignedBy)}</div>` : ''}
          </div>
          ` : ''}

          <div style="margin-top: 10px; border-top: 1px dashed var(--border-subtle); padding-top: 10px;">
            <button class="btn btn-secondary btn-sm btn-print-slip" data-log-id="${log.id}"
              style="width:100%; font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:6px;">
              🖨️ Print Single Slip
            </button>
          </div>
        `;
        cutLogsCardsContainer.appendChild(card);
      }
    });

    updateSelectedCutLogsUI();
  }

  function exportCutLogsCsv() {
    if (cutLogs.length === 0) {
      showToast('No cut logs to export', 'warning');
      return;
    }

    const headers = ['Timestamp', 'Rod Name', 'Diameter (mm)', 'Original Length (In)', 'Cut Length (In)', 'Quantity', 'Remainder Offcut (In)', 'Remnant Added', 'Job Reason'];
    const rows = cutLogs.map(log => [
      escapeCsvField(new Date(log.timestamp).toISOString()),
      escapeCsvField(log.rodName || ''),
      log.diameterMm,
      getLogOrigLength(log),
      getLogCutLength(log),
      log.quantity,
      getLogRemainder(log),
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
        selectedCutLogIds.clear();
        saveCutLogsToStorage();
        updateCutLogsBadge();
        renderCutLogsTable();
        updateSelectedCutLogsUI();
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
    if (formLengthFt) formLengthFt.value = getRodLength(rod) || '';
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
    const lengthVal = formLengthFt ? parseFloat(formLengthFt.value) : NaN;
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
    if (isNaN(lengthVal) || lengthVal <= 0) {
      showToast('Please specify a positive length in inches', 'warning');
      return;
    }
    if (isNaN(quantity) || quantity < 0) {
      showToast('Quantity cannot be negative', 'warning');
      return;
    }

    const autoSku = customSku || `ROD-${Math.round(diameterMm)}MM-${Math.round(lengthVal)}IN-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Editing Existing Rod
    if (editId) {
      const index = rods.findIndex(r => r.id === editId);
      if (index !== -1) {
        rods[index] = {
          ...rods[index],
          name,
          diameterMm,
          lengthIn: lengthVal,
          lengthFt: lengthVal,
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
      getRodLength(r) === lengthVal
    );

    if (duplicateMatch) {
      pendingDuplicateResolution = {
        existingRod: duplicateMatch,
        newRodData: {
          id: 'rod-' + Date.now(),
          sku: autoSku,
          name,
          diameterMm,
          lengthIn: lengthVal,
          lengthFt: lengthVal,
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
      lengthIn: lengthVal,
      lengthFt: lengthVal,
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
      <div><strong>Existing Entry:</strong> ${escapeHtml(existingRod.name)} (${existingRod.diameterMm} mm × ${formatDisplayLength(getRodLength(existingRod))} In)</div>
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
    const rLen = getRodLength(rod);
    deductRodDimensions.textContent = `${rod.diameterMm} mm diameter × ${rLen} In length (${rod.sku || 'No SKU'})`;
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

    const currentLen = getRodLength(rod);
    rod.quantity -= deductAmount;
    rod.updatedAt = Date.now();

    const logEntry = {
      id: 'log-' + Date.now(),
      timestamp: Date.now(),
      rodName: rod.name,
      diameterMm: rod.diameterMm,
      originalLengthIn: currentLen,
      originalLengthFt: currentLen,
      cutLengthIn: currentLen,
      cutLengthFt: currentLen,
      quantity: deductAmount,
      remainderIn: 0,
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
    showToast(`Deducted ${deductAmount} units of ${rod.name} (${rod.diameterMm}mm × ${currentLen}In)${reasonMsg}. Remaining: ${rod.quantity}`, 'success');
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
      `Are you sure you want to permanently delete "${rod.name}" (${rod.diameterMm}mm × ${formatDisplayLength(getRodLength(rod))}In)? This action cannot be undone.`,
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

    const headers = ['SKU', 'Rod Name', 'Diameter (mm)', 'Length (In)', 'Quantity', 'Notes'];
    const rows = rods.map(r => [
      escapeCsvField(r.sku || ''),
      escapeCsvField(r.name || ''),
      r.diameterMm,
      getRodLength(r),
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
      const lengthVal = parseFloat(parts[3]);
      const quantity = parseInt(parts[4], 10);
      const notes = (parts.length >= 7 ? parts[6] : parts[5] || '').trim();

      if (!name || isNaN(diameterMm) || diameterMm <= 0 || isNaN(lengthVal) || lengthVal <= 0 || isNaN(quantity) || quantity < 0) {
        continue;
      }

      rods.push({
        id: 'rod-csv-' + Date.now() + '-' + i,
        sku: sku || `ROD-${Math.round(diameterMm)}MM-${Math.round(lengthVal)}IN`,
        name,
        diameterMm,
        lengthIn: lengthVal,
        lengthFt: lengthVal,
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
    let touchStartY = 0;
    let touchStartX = 0;
    let isTouchScrolling = false;

    // Detect actual scrolling gestures on mobile to prevent accidental synthetic clicks
    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isTouchScrolling = false;
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const dy = Math.abs(e.touches[0].clientY - touchStartY);
        const dx = Math.abs(e.touches[0].clientX - touchStartX);
        if (dy > 8 || dx > 8) {
          isTouchScrolling = true;
        }
      }
    }, { passive: true });

    // Delegated click handling on document
    document.addEventListener('click', (e) => {
      // If user was swiping or scrolling, ignore synthetic click
      if (isTouchScrolling) {
        return;
      }

      // 1. Add Rod Stock / Add Product button triggers
      const addBtn = e.target.closest('#btnOpenAddModal, .btn-add-main, #mobNavAdd, #btnEmptySuggestAdd');
      if (addBtn) {
        e.preventDefault();
        if (addBtn.id === 'btnEmptySuggestAdd') {
          refreshDomElements();
          const rawLen = searchLengthInput ? parseFloat(searchLengthInput.value) : NaN;
          const lenInches = (!isNaN(rawLen) && searchLengthUnit === 'ft')
            ? Number((rawLen * 12).toFixed(2))
            : rawLen;
          openAddRodModal({
            diameter: searchDiameterInput ? searchDiameterInput.value : '',
            length: !isNaN(lenInches) ? lenInches : ''
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

      // 6.5 KPI card interactive filter click - purely in-place filtering without jumping/scrolling
      const kpiCard = e.target.closest('.kpi-card');
      if (kpiCard && kpiCard.dataset.kpiFilter) {
        if (isTouchScrolling) return;
        const filterType = kpiCard.dataset.kpiFilter;
        refreshDomElements();
        if (filterType === 'all' || filterType === 'stock') {
          if (filterStockStatus) filterStockStatus.value = 'all';
          if (filterDiameter) filterDiameter.value = 'all';
          if (filterKeyword) filterKeyword.value = '';
        } else if (filterType === 'in_stock') {
          if (filterStockStatus) filterStockStatus.value = 'in_stock';
        } else if (filterType === 'low_stock') {
          if (filterStockStatus) filterStockStatus.value = 'low_stock';
        }
        renderQuickDiameterChips();
        renderInventoryTable();
        return;
      }

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

      if (target.classList.contains('btn-dia-preset')) {
        const dia = target.dataset.dia;
        refreshDomElements();
        if (searchDiameterInput) {
          searchDiameterInput.value = dia;
          searchDiameterInput.focus();
        }
        document.querySelectorAll('.btn-dia-preset').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        if (searchLengthInput && parseFloat(searchLengthInput.value) > 0) {
          executeSmartSearch(dia, searchLengthInput.value, false, searchLengthUnit);
        }
        return;
      }

      if (target.classList.contains('btn-len-preset')) {
        const len = target.dataset.len;
        refreshDomElements();
        if (searchLengthInput) {
          searchLengthInput.value = len;
          searchLengthInput.focus();
        }
        document.querySelectorAll('.btn-len-preset').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        updateSearchLengthHint();
        if (searchDiameterInput && parseFloat(searchDiameterInput.value) > 0) {
          executeSmartSearch(searchDiameterInput.value, len, false, searchLengthUnit, searchPiecesInput ? searchPiecesInput.value : 1);
        }
        return;
      }

      if (target.classList.contains('btn-pcs-preset')) {
        const pcs = target.dataset.pcs;
        refreshDomElements();
        if (searchPiecesInput) {
          searchPiecesInput.value = pcs;
        }
        document.querySelectorAll('.btn-pcs-preset').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        updateSearchLengthHint();
        if (searchDiameterInput && parseFloat(searchDiameterInput.value) > 0 && searchLengthInput && parseFloat(searchLengthInput.value) > 0) {
          executeSmartSearch(searchDiameterInput.value, searchLengthInput.value, false, searchLengthUnit, pcs);
        }
        return;
      }

      if (target.classList.contains('btn-quick-inc')) {
        const id = target.dataset.id;
        quickAdjustQuantity(id, 1);
      } else if (target.classList.contains('btn-quick-dec')) {
        const id = target.dataset.id;
        quickAdjustQuantity(id, -1);
      } else if (target.classList.contains('btn-open-cut')) {
        const id = target.dataset.id;
        const defaultCutLen = target.dataset.cutLen;
        const defaultPcsPerRod = target.dataset.pcsPerRod ? parseInt(target.dataset.pcsPerRod, 10) : 1;
        openCutModal(id, defaultCutLen, defaultPcsPerRod);
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
      } else if (target.id === 'btnPrintCombinedSlip' || target.closest('#btnPrintCombinedSlip') || target.id === 'btnFooterPrintCombinedSlip' || target.closest('#btnFooterPrintCombinedSlip')) {
        handlePrintSelectedSlip();
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
        const clearBtn = document.getElementById('btnClearFilterKeyword');
        if (clearBtn) clearBtn.classList.add('hidden');
        renderQuickDiameterChips();
        renderInventoryTable();
      } else if (target.id === 'btnClearFilterKeyword' || target.closest('#btnClearFilterKeyword')) {
        refreshDomElements();
        if (filterKeyword) {
          filterKeyword.value = '';
          filterKeyword.focus();
        }
        const clearBtn = document.getElementById('btnClearFilterKeyword');
        if (clearBtn) clearBtn.classList.add('hidden');
        renderInventoryTable();
      } else if (target.id === 'btnToggleRoundLength' || target.closest('#btnToggleRoundLength')) {
        toggleRoundLength();
      } else if (target.id === 'btnResetSmartSearch') {
        resetSmartSearch();
      } else if (target.id === 'unitPillIn' || target.closest('#unitPillIn')) {
        setSmartSearchUnit('in');
      } else if (target.id === 'unitPillFt' || target.closest('#unitPillFt')) {
        setSmartSearchUnit('ft');
      } else if (target.id === 'unitPillM' || target.closest('#unitPillM')) {
        setSmartSearchUnit('m');
      } else if (target.id === 'btnSearchPiecesDec') {
        refreshDomElements();
        const current = parseInt(searchPiecesInput ? searchPiecesInput.value : '1', 10) || 1;
        if (current > 1 && searchPiecesInput) {
          searchPiecesInput.value = current - 1;
          updateSearchLengthHint();
          if (searchDiameterInput && parseFloat(searchDiameterInput.value) > 0 && searchLengthInput && parseFloat(searchLengthInput.value) > 0) {
            executeSmartSearch(searchDiameterInput.value, searchLengthInput.value, false, searchLengthUnit, current - 1);
          }
        }
      } else if (target.id === 'btnSearchPiecesInc') {
        refreshDomElements();
        const current = parseInt(searchPiecesInput ? searchPiecesInput.value : '1', 10) || 1;
        if (searchPiecesInput) {
          searchPiecesInput.value = current + 1;
          updateSearchLengthHint();
          if (searchDiameterInput && parseFloat(searchDiameterInput.value) > 0 && searchLengthInput && parseFloat(searchLengthInput.value) > 0) {
            executeSmartSearch(searchDiameterInput.value, searchLengthInput.value, false, searchLengthUnit, current + 1);
          }
        }
      } else if (target.id === 'btnStrategyFullLength' || target.closest('#btnStrategyFullLength')) {
        activeCutStrategy = 'full_length_first';
        if (lastSmartSearchQuery) {
          executeSmartSearch(lastSmartSearchQuery.diameter, lastSmartSearchQuery.length, false, lastSmartSearchQuery.unit, lastSmartSearchQuery.pieces);
        }
      } else if (target.id === 'btnStrategyOffcuts' || target.closest('#btnStrategyOffcuts')) {
        activeCutStrategy = 'offcuts_first';
        if (lastSmartSearchQuery) {
          executeSmartSearch(lastSmartSearchQuery.diameter, lastSmartSearchQuery.length, false, lastSmartSearchQuery.unit, lastSmartSearchQuery.pieces);
        }
      } else if (target.id === 'btnExecuteCutPlan' || target.closest('#btnExecuteCutPlan')) {
        openExecutePlanModal();
      } else if (target.id === 'btnPrintPlanSlip' || target.closest('#btnPrintPlanSlip')) {
        handlePrintPlanSlip();
      } else if (target.id === 'btnToggleAllMatchingTable' || target.closest('#btnToggleAllMatchingTable')) {
        isMatchingTableVisible = !isMatchingTableVisible;
        if (smartResultsTableContainer) {
          smartResultsTableContainer.classList.toggle('hidden', !isMatchingTableVisible);
        }
        if (toggleMatchingTableText) {
          toggleMatchingTableText.textContent = isMatchingTableVisible ? 'Hide Individual Rods Table' : 'Show Individual Rods Table';
        }
      } else if (target.id === 'btnCloseExecutePlanModal' || target.id === 'btnCancelExecutePlanModal') {
        closeExecutePlanModal();
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
      } else if (target.id === 'btnCutPiecesPerRodDown') {
        refreshDomElements();
        const current = parseInt(cutPiecesPerRodInput ? cutPiecesPerRodInput.value : '1', 10) || 1;
        if (current > 1 && cutPiecesPerRodInput) {
          cutPiecesPerRodInput.value = current - 1;
          updateCutCalculations();
        }
      } else if (target.id === 'btnCutPiecesPerRodUp') {
        refreshDomElements();
        const current = parseInt(cutPiecesPerRodInput ? cutPiecesPerRodInput.value : '1', 10) || 1;
        if (cutPiecesPerRodInput) {
          cutPiecesPerRodInput.value = current + 1;
          updateCutCalculations();
        }
      } else if (target.id === 'btnCutAddNewRodShortcut') {
        const dia = cutRodDiameter ? cutRodDiameter.textContent.trim() : '';
        closeCutModal();
        openAddModal();
        if (formDiameterMm && dia) {
          formDiameterMm.value = dia;
        }
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
      } else if (e.target.id === 'executePlanForm') {
        handleExecutePlanSubmit(e);
      } else if (e.target.id === 'smartSearchForm') {
        e.preventDefault();
        refreshDomElements();
        executeSmartSearch(
          searchDiameterInput ? searchDiameterInput.value : '',
          searchLengthInput ? searchLengthInput.value : '',
          true,
          searchLengthUnit,
          searchPiecesInput ? searchPiecesInput.value : 1
        );
      }
    });

    let smartSearchDebounceTimer = null;

    // Delegated input / change on document
    document.addEventListener('input', (e) => {
      if (!e.target) return;
      if (e.target.id === 'searchLengthInput' || e.target.id === 'searchDiameterInput' || e.target.id === 'searchPiecesInput') {
        updateSearchLengthHint();
        const dia = searchDiameterInput ? parseFloat(searchDiameterInput.value) : NaN;
        const len = searchLengthInput ? parseFloat(searchLengthInput.value) : NaN;
        const pcs = searchPiecesInput ? parseInt(searchPiecesInput.value, 10) : 1;
        if (!isNaN(dia) && dia > 0 && !isNaN(len) && len > 0) {
          if (smartSearchDebounceTimer) clearTimeout(smartSearchDebounceTimer);
          smartSearchDebounceTimer = setTimeout(() => {
            executeSmartSearch(dia, len, false, searchLengthUnit, pcs);
          }, 250);
        }
      } else if (e.target.id === 'filterKeyword') {
        const clearBtn = document.getElementById('btnClearFilterKeyword');
        if (clearBtn) {
          if (e.target.value.trim().length > 0) {
            clearBtn.classList.remove('hidden');
          } else {
            clearBtn.classList.add('hidden');
          }
        }
        renderInventoryTable();
      } else if (e.target.id === 'filterCutLogsInput') {
        renderCutLogsTable();
      } else if (e.target.id === 'cutRequiredLengthInput' || e.target.id === 'cutPiecesQtyInput' || e.target.id === 'cutPiecesPerRodInput') {
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
      if (e.target.id === 'searchLengthUnitSelect') {
        setSmartSearchUnit(e.target.value);
      } else if (e.target.id === 'filterDiameter') {
        renderQuickDiameterChips();
        renderInventoryTable();
      } else if (e.target.id === 'filterStockStatus') {
        renderInventoryTable();
      } else if (e.target.id === 'selectAllCutLogs') {
        const isChecked = e.target.checked;
        const visibleCheckboxes = document.querySelectorAll('#cutLogsTableBody .cut-log-checkbox, #cutLogsCardsContainer .cut-log-checkbox');
        visibleCheckboxes.forEach(cb => {
          const id = cb.dataset.logId;
          if (id) {
            if (isChecked) {
              selectedCutLogIds.add(id);
            } else {
              selectedCutLogIds.delete(id);
            }
          }
        });
        updateSelectedCutLogsUI();
      } else if (e.target.classList.contains('cut-log-checkbox')) {
        const id = e.target.dataset.logId;
        if (id) {
          if (e.target.checked) {
            selectedCutLogIds.add(id);
          } else {
            selectedCutLogIds.delete(id);
          }
        }
        updateSelectedCutLogsUI();
      } else if (e.target.id === 'csvFileInput') {
        handleCsvImport(e);
      } else if (e.target.id === 'cutSuggestedRodSelect') {
        updateCutCalculations();
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
    if (actionSheetLength) actionSheetLength.textContent = `${formatDisplayLength(getRodLength(rod))} In`;
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
  window.toggleRoundLength = toggleRoundLength;
  window.setRoundLengthEnabled = setRoundLengthEnabled;
  window.isRoundLengthEnabled = () => isRoundLengthEnabled;
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
