'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

declare global {
  interface Window {
    __INITIAL_RODS__?: unknown[];
    __INITIAL_CUT_LOGS__?: unknown[];
    initVanillaApp?: () => void;
    setVanillaRods?: (rods: unknown[]) => void;
    setVanillaCutLogs?: (logs: unknown[]) => void;
    updateDashboardExternal?: () => void;
    initGuidedRail?: () => void;
    _grLoadAndRender?: () => void;
  }
}

const APPS_SCRIPT_SNIPPET = `/* eslint-disable */
/**
 * RodSync - Google Sheets & Excel Multi-Sheet Sync
 * Connected Sheet: https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit
 *
 * WORKBOOK STRUCTURE:
 * - Sheet 1: Master Raw Catalog (PRESERVED - Never modified or cleared)
 * - Sheet 2: Sheet 2 - Chrome Rod Stock (Rods Inventory)
 * - Sheet 3: Sheet 3 - Guided Rail Stock (Linear Rail Inventory)
 * - Sheet 4: Sheet 4 - Chrome Rod Cut Logs
 * - Sheet 5: Sheet 5 - Guided Rail Cut Logs
 *
 * HOW TO CONNECT THIS SPREADSHEET:
 * 1. Open this spreadsheet: https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit
 * 2. In the top menu, click: Extensions > Apps Script.
 * 3. Delete any code in the editor and paste THIS entire script.
 * 4. Click the "Save" icon (or Ctrl+S).
 * 5. In the top right, click: Deploy > New deployment.
 * 6. Click the gear icon (Select type) > Choose "Web app".
 * 7. Set:
 *    - Description: "RodSync Multi-Sheet Sync"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 8. Click "Deploy" (grant permissions when prompted).
 * 9. Copy the "Web app URL" (starts with https://script.google.com/macros/s/...)
 * 10. Paste it into RodSync under .env (GOOGLE_SCRIPT_URL="...")
 *     or in the RodSync Google Sheets settings dialog.
 */

var TARGET_SPREADSHEET_ID = "1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ";

function getSpreadsheet(e, postData) {
  var id = (postData && postData.spreadsheetId) || (e && e.parameter && e.parameter.spreadsheetId) || TARGET_SPREADSHEET_ID;
  if (id) {
    try {
      var byId = SpreadsheetApp.openById(id);
      if (byId) return byId;
    } catch (err) {
      console.warn("Could not open by id " + id + ", falling back to active spreadsheet: " + err);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateTargetSheet(ss, preferredName, aliases) {
  // 1. Try to find by preferred name
  var s = ss.getSheetByName(preferredName);
  if (s) return s;

  // 2. Try by aliases
  if (aliases && aliases.length > 0) {
    for (var i = 0; i < aliases.length; i++) {
      var byAlias = ss.getSheetByName(aliases[i]);
      if (byAlias) {
        try { byAlias.setName(preferredName); } catch (e) {}
        return byAlias;
      }
    }
  }

  // 3. Insert fresh sheet with preferredName
  return ss.insertSheet(preferredName);
}

function doGet(e) {
  try {
    var ss = getSpreadsheet(e, null);

    // Sheet 2: Chrome Rod Stock
    var sheet2 = getOrCreateTargetSheet(ss, "Chrome rod inventory", ["Sheet 2 - Chrome Rod Stock", "Sheet 2", "Sheet2", "Chrome Rod Stock", "Chrome rod inventory", "Rods Inventory"]);
    // Sheet 3: Guided Rail Stock
    var sheet3 = getOrCreateTargetSheet(ss, "Guided rail inventory", ["Sheet 3 - Guided Rail Stock", "Sheet 3", "Sheet3", "Guided Rail Stock", "Guided rail inventory", "Rail Stock"]);
    // Sheet 4: Cut Log of Chrome Rod
    var sheet4 = getOrCreateTargetSheet(ss, "Chrome rod cutting logs", ["Sheet 4 - Chrome Rod Cut Logs", "Sheet 4", "Sheet4", "Chrome rod cutting logs", "Chrome Rod Cut Logs", "Cut Logs"]);
    // Sheet 5: Cut Log of Guided Rail
    var sheet5 = getOrCreateTargetSheet(ss, "Guided rail cutting logs", ["Sheet 5 - Guided Rail Cut Logs", "Sheet 5", "Sheet5", "Guided rail cutting logs", "Guided Rail Cut Logs", "Rail Cut Logs"]);

    // 1. Read Chrome Rod Stock (Chrome rod inventory)
    var rods = [];
    if (sheet2 && sheet2.getLastRow() > 1) {
      var data2 = sheet2.getDataRange().getValues();
      var header2 = data2[0] || [];
      var is4Col = header2.length <= 5 || String(header2[1] || '').toLowerCase().indexOf('dia') !== -1;
      for (var i = 1; i < data2.length; i++) {
        var r = data2[i];
        if (is4Col) {
          var name = String(r[0] || 'Chrome Rod').trim();
          var dia = Number(r[1]) || 0;
          var len = Number(r[2]) || 0;
          var qty = Number(r[3]) || 0;
          if (dia > 0 && len > 0 && qty > 0) {
            rods.push({
              id: 'rod-' + Math.round(dia) + '-' + len + '-' + i,
              sku: 'ROD-' + Math.round(dia) + 'MM-' + len + 'IN-STOCK',
              name: name,
              diameterMm: dia,
              lengthIn: len,
              lengthFt: len,
              quantity: qty,
              notes: '',
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          var rName = String(r[2] || 'Chrome Rod').trim();
          var rDia = Number(r[3]) || 0;
          var rLen = Number(r[4]) || 0;
          var rQty = Number(r[5]) || 0;
          if (rDia > 0 && rLen > 0 && rQty > 0) {
            rods.push({
              id: String(r[0] || ('rod-' + Math.round(rDia) + '-' + rLen + '-' + i)),
              sku: String(r[1] || ('ROD-' + Math.round(rDia) + 'MM-' + rLen + 'IN-STOCK')),
              name: rName,
              diameterMm: rDia,
              lengthIn: rLen,
              lengthFt: rLen,
              quantity: rQty,
              notes: String(r[6] || ''),
              updatedAt: r[7] || new Date().toISOString()
            });
          }
        }
      }
    }

    // Fallback: If Sheet 2 is empty, check if Sheet 1 has original stock
    if (rods.length === 0) {
      var sheet1 = ss.getSheetByName("Sheet1") || ss.getSheetByName("Sheet 1") || ss.getSheets()[0];
      if (sheet1 && sheet1.getLastRow() > 1) {
        var data1 = sheet1.getDataRange().getValues();
        for (var si = 1; si < data1.length; si++) {
          var sRow = data1[si];
          var sName = String(sRow[0] || 'Chrome Rod').trim();
          var sDia = Number(sRow[1]) || 0;
          var sLen = Number(sRow[2]) || 0;
          var sQty = Number(sRow[3]) || 0;
          if (sDia > 0 && sLen > 0 && sQty > 0) {
            rods.push({
              id: 'rod-' + Math.round(sDia) + '-' + sLen + '-' + si,
              sku: 'ROD-' + Math.round(sDia) + 'MM-' + sLen + 'IN-STOCK',
              name: sName,
              diameterMm: sDia,
              lengthIn: sLen,
              lengthFt: sLen,
              quantity: sQty,
              notes: '',
              updatedAt: new Date().toISOString()
            });
          }
        }
      }
    }

    // 2. Read Guided Rail Stock (Sheet 3)
    var railStock = [];
    if (sheet3 && sheet3.getLastRow() > 1) {
      var data3 = sheet3.getDataRange().getValues();
      for (var j = 1; j < data3.length; j++) {
        var g = data3[j];
        if (!g[0] && !g[1]) continue;
        railStock.push({
          id: String(g[0] || ''),
          modelName: String(g[1] || ''),
          sku: String(g[2] || ''),
          railWidthMm: Number(g[3]) || 0,
          railHeightMm: Number(g[4]) || 0,
          pitchMm: Number(g[5]) || 0,
          lengthMm: Number(g[6]) || 0,
          quantity: Number(g[7]) || 0,
          notes: String(g[8] || ''),
          updatedAt: g[9] || ''
        });
      }
    }

    // 3. Read Chrome Rod Cut Logs (Sheet 4)
    var rodCutLogs = [];
    if (sheet4 && sheet4.getLastRow() > 1) {
      var data4 = sheet4.getDataRange().getValues();
      for (var k = 1; k < data4.length; k++) {
        var l = data4[k];
        if (!l[0] && !l[2]) continue;
        rodCutLogs.push({
          id: String(l[0] || ''),
          timestamp: l[1] || '',
          isRail: false,
          rodName: String(l[2] || ''),
          diameterMm: Number(l[3]) || 0,
          originalLengthIn: Number(l[4]) || 0,
          originalLengthFt: Number(l[4]) || 0,
          cutLengthIn: Number(l[5]) || 0,
          cutLengthFt: Number(l[5]) || 0,
          quantity: Number(l[6]) || 0,
          remainderIn: Number(l[7]) || 0,
          remainderFt: Number(l[7]) || 0,
          remnantAdded: l[8] === 'Yes' || l[8] === true,
          reason: String(l[9] || ''),
          assignBy: String(l[10] || ''),
          assignTo: String(l[11] || '')
        });
      }
    }

    // 4. Read Guided Rail Cut Logs (Sheet 5)
    var railCutLogs = [];
    if (sheet5 && sheet5.getLastRow() > 1) {
      var data5 = sheet5.getDataRange().getValues();
      for (var m = 1; m < data5.length; m++) {
        var q = data5[m];
        if (!q[0] && !q[2]) continue;
        railCutLogs.push({
          id: String(q[0] || ''),
          timestamp: q[1] || '',
          isRail: true,
          modelName: String(q[2] || ''),
          rodName: String(q[2] ? ('Guided Rail ' + q[2]) : ''),
          pitchMm: Number(q[3]) || 0,
          diameterMm: Number(q[3]) || 0,
          originalLengthMm: Number(q[4]) || 0,
          originalLengthIn: Number((Number(q[4] || 0) / 25.4).toFixed(2)),
          cutLengthMm: Number(q[5]) || 0,
          cutLengthIn: Number((Number(q[5] || 0) / 25.4).toFixed(2)),
          quantity: Number(q[6]) || 0,
          remainderMm: Number(q[7]) || 0,
          remainderIn: Number((Number(q[7] || 0) / 25.4).toFixed(2)),
          holesCount: Number(q[8]) || 0,
          endMarginMm: Number(q[9]) || 0,
          remnantAdded: q[10] === 'Yes' || q[10] === true,
          reason: String(q[11] || ''),
          assignBy: String(q[12] || ''),
          assignTo: String(q[13] || '')
        });
      }
    }

    var cutLogs = [].concat(rodCutLogs, railCutLogs);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      configured: true,
      spreadsheetId: ss.getId(),
      rods: rods,
      railStock: railStock,
      rodCutLogs: rodCutLogs,
      railCutLogs: railCutLogs,
      cutLogs: cutLogs
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : '';
    if (!contents) throw new Error("No payload data received");
    var postData = JSON.parse(contents);
    var ss = getSpreadsheet(e, postData);

    // Sheet 1 is preserved untouched!

    // Sheet 2: Chrome Rod Stock
    var sheet2 = getOrCreateTargetSheet(ss, "Chrome rod inventory", ["Sheet 2 - Chrome Rod Stock", "Sheet 2", "Sheet2", "Chrome Rod Stock", "Chrome rod inventory", "Rods Inventory"]);
    // Sheet 3: Guided Rail Stock
    var sheet3 = getOrCreateTargetSheet(ss, "Guided rail inventory", ["Sheet 3 - Guided Rail Stock", "Sheet 3", "Sheet3", "Guided Rail Stock", "Guided rail inventory", "Rail Stock"]);
    // Sheet 4: Cut Log of Chrome Rod
    var sheet4 = getOrCreateTargetSheet(ss, "Chrome rod cutting logs", ["Sheet 4 - Chrome Rod Cut Logs", "Sheet 4", "Sheet4", "Chrome rod cutting logs", "Chrome Rod Cut Logs", "Cut Logs"]);
    // Sheet 5: Cut Log of Guided Rail
    var sheet5 = getOrCreateTargetSheet(ss, "Guided rail cutting logs", ["Sheet 5 - Guided Rail Cut Logs", "Sheet 5", "Sheet5", "Guided rail cutting logs", "Guided Rail Cut Logs", "Rail Cut Logs"]);

    function formatHeader(sheet, numCols, color) {
      sheet.getRange(1, 1, 1, numCols).setFontWeight("bold").setBackground(color || "#e2e8f0").setFontColor("#0f172a");
      sheet.setFrozenRows(1);
    }

    // 1. Sync Chrome Rod Stock (Chrome rod inventory: 4 columns matching user spreadsheet format)
    var rodsList = postData.rods;
    if (rodsList && Array.isArray(rodsList) && rodsList.length > 0) {
      rodsList = rodsList.filter(function(r) { return Number(r.diameterMm) !== 300; });
      sheet2.clear();
      sheet2.appendRow(['Rod Name', 'Dia (mm)', 'Length (in)', 'Quantity']);
      var rows2 = rodsList.map(function(r) {
        var len = (r.lengthIn !== undefined && r.lengthIn !== null) ? r.lengthIn : (r.lengthFt || 0);
        return [
          r.name || 'Chrome Rod',
          r.diameterMm || 0,
          len,
          r.quantity || 0
        ];
      });
      sheet2.getRange(2, 1, rows2.length, 4).setValues(rows2);
      formatHeader(sheet2, 4, "#dbeafe");
    }

    // 2. Sync Guided Rail Stock (Guided rail inventory)
    var railList = postData.railStock;
    if (railList && Array.isArray(railList) && railList.length > 0) {
      sheet3.clear();
      sheet3.appendRow(['ID', 'Model Name', 'SKU', 'Rail Width (mm)', 'Rail Height (mm)', 'Pitch / PCC (mm)', 'Length (mm)', 'Quantity', 'Storage Rack / Notes', 'Last Updated']);
      var rows3 = railList.map(function(g) {
        return [
          g.id || '',
          g.modelName || '',
          g.sku || '',
          g.railWidthMm || 0,
          g.railHeightMm || 0,
          g.pitchMm || 0,
          g.lengthMm || 0,
          g.quantity || 0,
          g.notes || '',
          g.updatedAt ? new Date(g.updatedAt).toISOString() : new Date().toISOString()
        ];
      });
      sheet3.getRange(2, 1, rows3.length, 10).setValues(rows3);
      formatHeader(sheet3, 10, "#ede9fe");
    }

    // Extract rod cuts vs rail cuts
    var allLogs = postData.cutLogs || [];
    var rodCuts = postData.rodCutLogs || [];
    var railCuts = postData.railCutLogs || [];

    if (allLogs.length > 0 && rodCuts.length === 0 && railCuts.length === 0) {
      for (var n = 0; n < allLogs.length; n++) {
        var item = allLogs[n];
        var isRail = (item.isRail === true) || Boolean(item.modelName) || (String(item.id || '').indexOf('gr-cut-') === 0) || (String(item.rodName || '').toLowerCase().indexOf('guided rail') !== -1);
        if (isRail) {
          railCuts.push(item);
        } else {
          rodCuts.push(item);
        }
      }
    }

    // 3. Sync Chrome Rod Cut Logs (Chrome rod cutting logs)
    if (rodCuts && Array.isArray(rodCuts) && rodCuts.length > 0) {
      rodCuts = rodCuts.filter(function(l) { return Number(l.diameterMm) !== 300; });
      sheet4.clear();
      sheet4.appendRow(['ID', 'Date & Time', 'Rod Name', 'Diameter (mm)', 'Original Length (In)', 'Cut Length (In)', 'Quantity', 'Remnant Offcut (In)', 'Remnant Added', 'Job / Reason', 'Assign By', 'Assign To']);
      var rows4 = rodCuts.map(function(l) {
        var origLen = (l.originalLengthIn !== undefined && l.originalLengthIn !== null) ? l.originalLengthIn : (l.originalLengthFt || 0);
        var cutLen = (l.cutLengthIn !== undefined && l.cutLengthIn !== null) ? l.cutLengthIn : (l.cutLengthFt || 0);
        var remLen = (l.remainderIn !== undefined && l.remainderIn !== null) ? l.remainderIn : (l.remainderFt || 0);
        return [
          l.id || '',
          l.timestamp ? new Date(l.timestamp).toLocaleString() : '',
          l.rodName || 'Chrome Rod',
          l.diameterMm || 0,
          origLen,
          cutLen,
          l.quantity || 0,
          remLen,
          (l.remnantAdded === true || l.remnantAdded === 'Yes') ? 'Yes' : 'No',
          l.reason || '',
          l.assignBy || l.createdBy || '',
          l.assignTo || l.assignedBy || ''
        ];
      });
      sheet4.getRange(2, 1, rows4.length, 12).setValues(rows4);
      formatHeader(sheet4, 12, "#fee2e2");
    }

    // 4. Sync Guided Rail Cut Logs (Guided rail cutting logs)
    if (railCuts && Array.isArray(railCuts) && railCuts.length > 0) {
      sheet5.clear();
      sheet5.appendRow(['ID', 'Date & Time', 'Rail Model', 'Pitch / PCC (mm)', 'Original Length (mm)', 'Cut Length (mm)', 'Quantity', 'Remnant Offcut (mm)', 'Holes Count', 'End Margin (mm)', 'Remnant Added', 'Order / Job Notes', 'Assign By', 'Assign To']);
      var rows5 = railCuts.map(function(q) {
        var origMm = q.originalLengthMm || (q.originalLengthIn ? Math.round(q.originalLengthIn * 25.4) : 0);
        var cutMm = q.cutLengthMm || (q.cutLengthIn ? Math.round(q.cutLengthIn * 25.4) : 0);
        var remMm = q.remainderMm !== undefined ? q.remainderMm : (q.remainderIn ? Math.round(q.remainderIn * 25.4) : 0);
        return [
          q.id || '',
          q.timestamp ? new Date(q.timestamp).toLocaleString() : '',
          q.modelName || q.rodName || '',
          q.pitchMm || q.diameterMm || 0,
          origMm,
          cutMm,
          q.quantity || 0,
          remMm,
          q.holesCount || 0,
          q.endMarginMm || 0,
          (q.remnantAdded === true || q.remnantAdded === 'Yes') ? 'Yes' : 'No',
          q.reason || '',
          q.assignBy || q.createdBy || '',
          q.assignTo || q.assignedBy || ''
        ];
      });
      sheet5.getRange(2, 1, rows5.length, 14).setValues(rows5);
      formatHeader(sheet5, 14, "#fef3c7");
    }
          q.id || '',
          q.timestamp ? new Date(q.timestamp).toISOString() : '',
          q.modelName || q.rodName || '',
          q.pitchMm || q.diameterMm || 0,
          origMm,
          cutMm,
          q.quantity || 0,
          remMm,
          q.holesCount || 0,
          q.endMarginMm || 0,
          (q.remnantAdded === true || q.remnantAdded === 'Yes') ? 'Yes' : 'No',
          q.reason || '',
          q.assignBy || q.createdBy || '',
          q.assignTo || q.assignedBy || ''
        ];
      });
      sheet5.getRange(2, 1, rows5.length, 14).setValues(rows5);
      formatHeader(sheet5, 14, "#fef3c7");
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      spreadsheetId: ss.getId(),
      message: "Successfully updated Sheet 2 (Chrome Rods), Sheet 3 (Guided Rails), Sheet 4 (Rod Cut Logs), Sheet 5 (Rail Cut Logs)"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;

export default function Home() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [theme, setTheme] = useState(() => (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') || 'light' : 'light'));
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGrImportModalOpen, setIsGrImportModalOpen] = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState<'connected' | 'disconnected' | 'unconfigured' | 'syncing'>('unconfigured');
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [inputScriptUrl, setInputScriptUrl] = useState(() => (typeof window !== 'undefined' ? (localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '') : (process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '')));
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isRoundLength, setIsRoundLength] = useState(false);
  const [systemMode, setSystemMode] = useState<'chrome-rod' | 'guided-rail'>('chrome-rod');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rodsync_system_mode') as 'chrome-rod' | 'guided-rail';
      const initialMode = (saved === 'guided-rail' || saved === 'chrome-rod') ? saved : 'chrome-rod';
      setSystemMode(initialMode);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-system-mode', initialMode);
      }
    } catch {}
  }, []);

  const handleSwitchSystem = (mode: 'chrome-rod' | 'guided-rail') => {
    setSystemMode(mode);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-system-mode', mode);
    }
    try {
      localStorage.setItem('rodsync_system_mode', mode);
    } catch {}
    if (mode === 'guided-rail' && typeof window !== 'undefined' && (window as any)._grLoadAndRender) {
      setTimeout(() => {
        try {
          (window as any)._grLoadAndRender();
        } catch {}
      }, 50);
    }
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('rodsyncSystemModeChanged', { detail: { mode } }));
        if ((window as any).updateCutLogsBadge) (window as any).updateCutLogsBadge();
        if ((window as any).renderCutLogsTable) (window as any).renderCutLogsTable();
      } catch {}
    }
  };

  const handleDownloadGrTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Model,Length (mm),Quantity,Notes,SKU\nHGR15,2000,5,Rack A-1 • Standard,RAIL-HGR15-2000MM\nHGR20,3000,10,Rack A-2 • Heavy Duty,RAIL-HGR20-3000MM\nHGR25,3000,8,Rack B-1 • Precision,RAIL-HGR25-3000MM\nHGR30,4000,6,Rack B-2 • High Rigidity,RAIL-HGR30-4000MM";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Guided_Rail_Import_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).switchSystemMode = handleSwitchSystem;
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rodsync_round_length') === 'true';
      setIsRoundLength(saved);
      if (typeof window !== 'undefined' && (window as any).setRoundLengthEnabled) {
        (window as any).setRoundLengthEnabled(saved);
      }
    } catch {}
  }, []);

  const handleToggleRoundLength = () => {
    const next = !isRoundLength;
    setIsRoundLength(next);
    try {
      localStorage.setItem('rodsync_round_length', next ? 'true' : 'false');
    } catch {}
    if (typeof window !== 'undefined') {
      if ((window as any).setRoundLengthEnabled) {
        (window as any).setRoundLengthEnabled(next);
      } else if ((window as any).toggleRoundLength) {
        (window as any).toggleRoundLength();
      }
    }
  };

  useEffect(() => {
    // Check initial theme from document element after mount
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const current = document.documentElement.getAttribute('data-theme') || 'light';
          setTheme(current);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        const { getAuth, signOut } = await import('firebase/auth');
        const auth = getAuth();
        await signOut(auth);
      }
    } catch (e: unknown) {
      console.error(e);
    }
    // Delete auth cookies precisely by expiring them
    document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "rodsync_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    try {
      localStorage.removeItem('rodsync_user_email');
      if (typeof window !== 'undefined') (window as any).rodsyncCurrentUserEmail = '';
    } catch {}
    // Force full page navigation to login portal
    window.location.href = '/login';
  };

  const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.setAttribute('data-theme-mode', 'manual');
    localStorage.setItem('rodsync_theme', newTheme);

    // Attempt to target layout meta theme, if it exists
    const metaElems = document.getElementsByName('theme-color');
    if (metaElems.length > 0) metaElems[0].setAttribute('content', newTheme === 'dark' ? '#070a12' : '#f5f7fb');
    setTheme(newTheme);
  };

  const syncInventoryData = async (forceRefresh = false) => {
    let loadedFromBackend = false;
    setSheetsStatus('syncing');

    const hasLocalData = typeof window !== 'undefined' && (() => {
      try {
        const stored = localStorage.getItem('rod_stock_inventory_v1');
        return Boolean(stored && JSON.parse(stored).length > 0);
      } catch {
        return false;
      }
    })();

    if (!hasLocalData && !forceRefresh) {
      setIsInitializing(true);
    }

    const scriptUrl = (typeof window !== 'undefined' ? localStorage.getItem('rodsync_gsheets_script_url') : null) || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';

    // 1. Fetch from Google Sheets (via Apps Script or service account)
    try {
      const headers: Record<string, string> = {};
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;
      if (forceRefresh) headers['x-refresh'] = 'true';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 40000); // 40s timeout for cold starts
      const url = forceRefresh ? '/api/gsheets-sync?refresh=true' : '/api/gsheets-sync';
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const gsData = await res.json();
        if (gsData.success) {
          if (gsData.mode === 'apps-script' || (scriptUrl && gsData.configured)) {
            setSheetsStatus('connected');
          } else {
            setSheetsStatus('unconfigured');
          }
            const cleanRods = (gsData.rods || []).filter((r: any) => Number(r.diameterMm) !== 300);
            const cleanLogs = (gsData.cutLogs || []).filter((l: any) => Number(l.diameterMm) !== 300);
            if (cleanRods.length > 0 || cleanLogs.length > 0) {
              window.__INITIAL_RODS__ = cleanRods;
              window.__INITIAL_CUT_LOGS__ = cleanLogs;
              if (typeof window !== 'undefined') {
                if (cleanRods.length > 0) {
                  localStorage.setItem('rod_stock_inventory_v1', JSON.stringify(cleanRods));
                }
                localStorage.setItem('rod_stock_cut_logs_v1', JSON.stringify(cleanLogs));
              }
              if (window.setVanillaRods) window.setVanillaRods(cleanRods);
              if (window.setVanillaCutLogs) window.setVanillaCutLogs(cleanLogs);
              if (gsData.railStock && Array.isArray(gsData.railStock) && typeof window !== 'undefined' && (window as any).setGuidedRailStock) {
                (window as any).setGuidedRailStock(gsData.railStock);
              }
              if (window.updateDashboardExternal) window.updateDashboardExternal();
              loadedFromBackend = true;
            }
          } else {
            setSheetsStatus('disconnected');
          }
      } else {
        setSheetsStatus('disconnected');
      }
    } catch (err: unknown) {
      console.warn('GSheets read failed or not configured', err);
      setSheetsStatus('disconnected');
    }

    // 2. Fallback to Firebase
    try {
      if (!loadedFromBackend && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        const docRef = doc(db, 'inventory', 'main');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          window.__INITIAL_RODS__ = data.rods || [];
          window.__INITIAL_CUT_LOGS__ = data.cutLogs || [];
          if (window.setVanillaRods) window.setVanillaRods(data.rods || []);
          if (window.setVanillaCutLogs) window.setVanillaCutLogs(data.cutLogs || []);
          if (window.updateDashboardExternal) window.updateDashboardExternal();
        }
      }
    } catch (e: unknown) {
      console.warn('Firebase error, fallback to local defaults', e);
    } finally {
      if (window.initVanillaApp) {
        window.initVanillaApp();
      }
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    // Compulsory Async Authentication Check
    const verifyAuth = async () => {
      try {
        if (typeof document !== 'undefined') {
          const hasAuthCookie = document.cookie
            .split(';')
            .some((c) => c.trim().startsWith('auth=true'));

          if (!hasAuthCookie) {
            router.replace('/login');
            return;
          }

          // Cache current user from cookie immediately
          const userCookieMatch = document.cookie.match(/(?:^|;\s*)rodsync_user=([^;]+)/);
          if (userCookieMatch && userCookieMatch[1]) {
            try {
              const decoded = decodeURIComponent(userCookieMatch[1]);
              localStorage.setItem('rodsync_user_email', decoded);
              (window as any).rodsyncCurrentUserEmail = decoded;
            } catch {}
          }

          // Asynchronously verify active session via API
          try {
            const res = await fetch('/api/auth/session');
            if (!res.ok) {
              router.replace('/login');
              return;
            }
            const data = await res.json();
            if (data?.user) {
              try {
                localStorage.setItem('rodsync_user_email', data.user);
                (window as any).rodsyncCurrentUserEmail = data.user;
              } catch {}
            }
          } catch {
            // Keep going if network is temporarily unreachable
          }
        }
        setIsCheckingAuth(false);
      } catch (err) {
        console.error('Session verify error:', err);
        setIsCheckingAuth(false);
      }
    };

    verifyAuth();

    if (typeof window !== 'undefined') {
      const savedScriptUrl = localStorage.getItem('rodsync_gsheets_script_url');
      if (savedScriptUrl && savedScriptUrl.includes('AKfycbzrJc_1Ohm4BC61Bo3ElhXjxqWPfv1Je0CM_nh2-7AgvClHiVkJ4IXxIOPyHpJU06v8')) {
        localStorage.removeItem('rodsync_gsheets_script_url');
      }
    }
    const defaultUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
    if (typeof window !== 'undefined' && !localStorage.getItem('rodsync_gsheets_script_url') && defaultUrl) {
      localStorage.setItem('rodsync_gsheets_script_url', defaultUrl);
    }

    syncInventoryData(false);

    const handleSyncRods = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      // 1. Sync to Google Sheets
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify({ rods: customEvent.detail, scriptUrl })
      }).then(async res => {
        if (res.ok) {
          const data = await res.json();
          if (data.syncedToGoogleSheets) {
            setSheetsStatus('connected');
          } else {
            setSheetsStatus(scriptUrl ? 'connected' : 'unconfigured');
          }
        }
      }).catch(err => {
        console.warn('GSheets sync failed:', err);
      });

      // 2. Sync to Firebase
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { rods: customEvent.detail }, { merge: true });
        } catch (error: unknown) {
          console.error("Firebase Sync Error (Rods):", error);
        }
      }
    };

    const handleSyncLogs = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      // 1. Sync to Google Sheets
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify({ cutLogs: customEvent.detail, scriptUrl })
      }).then(res => {
        if (res.ok) setSheetsStatus('connected');
      }).catch(err => {
        console.warn('GSheets sync failed:', err);
      });

      // 2. Sync to Firebase
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { cutLogs: customEvent.detail }, { merge: true });
        } catch (error: unknown) {
          console.error("Firebase Sync Error (Cut Logs):", error);
        }
      }
    };

    const handleSyncRailStock = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify({ railStock: customEvent.detail, scriptUrl })
      }).then(res => {
        if (res.ok) setSheetsStatus('connected');
      }).catch(err => {
        console.warn('GSheets rail sync failed:', err);
      });
    };

    const handleSyncBoth = async (e: Event) => {
      const customEvent = e as CustomEvent<{ rods?: unknown[]; cutLogs?: unknown[]; railStock?: unknown[] }>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      const payload: Record<string, unknown> = { scriptUrl };
      if (customEvent.detail?.rods) payload.rods = customEvent.detail.rods;
      if (customEvent.detail?.cutLogs) payload.cutLogs = customEvent.detail.cutLogs;
      if (customEvent.detail?.railStock) {
        payload.railStock = customEvent.detail.railStock;
      } else if (typeof window !== 'undefined' && (window as any).getGuidedRailStock) {
        payload.railStock = (window as any).getGuidedRailStock();
      }

      // 1. Sync combined payload to Google Sheets
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify(payload)
      }).then(res => {
        if (res.ok) setSheetsStatus('connected');
      }).catch(err => {
        console.warn('GSheets combined sync failed:', err);
      });

      // 2. Sync combined payload to Firebase
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          const updateData: Record<string, unknown> = {};
          if (customEvent.detail?.rods) updateData.rods = customEvent.detail.rods;
          if (customEvent.detail?.cutLogs) updateData.cutLogs = customEvent.detail.cutLogs;
          await setDoc(doc(db, 'inventory', 'main'), updateData, { merge: true });
        } catch (error: unknown) {
          console.error("Firebase Combined Sync Error:", error);
        }
      }
    };

    window.addEventListener('syncRodsToFirebase', handleSyncRods);
    window.addEventListener('syncCutLogsToFirebase', handleSyncLogs);
    window.addEventListener('syncRailStockToBackend', handleSyncRailStock);
    window.addEventListener('syncBothToBackend', handleSyncBoth);

    return () => {
      window.removeEventListener('syncRodsToFirebase', handleSyncRods);
      window.removeEventListener('syncCutLogsToFirebase', handleSyncLogs);
      window.removeEventListener('syncRailStockToBackend', handleSyncRailStock);
      window.removeEventListener('syncBothToBackend', handleSyncBoth);
    };
  }, [router]);

  useEffect(() => {
    if (!isCheckingAuth && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        if (window.initVanillaApp) {
          window.initVanillaApp();
        }
        if (window.initGuidedRail) {
          window.initGuidedRail();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCheckingAuth]);

  if (isCheckingAuth) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, -apple-system, sans-serif',
        background: 'radial-gradient(ellipse at top, #1e293b, #0f172a 80%)',
        color: '#f8fafc',
        gap: '16px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          border: '3px solid rgba(56, 189, 248, 0.2)',
          borderTopColor: '#38bdf8',
          borderRadius: '50%',
          animation: 'rodsync-spin 0.8s linear infinite'
        }}></div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>Verifying Access</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Checking compulsory authentication...</p>
        </div>
        <style>{`@keyframes rodsync-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {isInitializing && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
          background: 'rgba(245, 247, 251, 0.96)',
          backdropFilter: 'blur(10px)',
          color: '#1e293b',
          gap: '16px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            border: '4px solid rgba(0, 113, 227, 0.15)',
            borderTopColor: '#0071e3',
            borderRadius: '50%',
            animation: 'rodsync-spin 0.8s linear infinite'
          }}></div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 700 }}>Connecting to RodSync</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Syncing rod inventory from Google Sheets...</p>
          </div>
          <style>{`@keyframes rodsync-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/*  Ambient Vibrant Wallpaper & Glass Canvas  */}
      <div className="bg-ambient-canvas" aria-hidden="true">
        <div className="bg-overlay-white"></div>
      </div>

      {/*  Header / Navigation Bar  */}
      <header className="navbar">
        <div className="nav-container">
          <div className="brand-group">
            <div className="brand-logo" title="RodSync">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="20" x2="20" y2="4"></line>
                <circle cx="8" cy="8" r="3"></circle>
                <circle cx="16" cy="16" r="3"></circle>
              </svg>
            </div>
            <div className="brand-text-wrap">
              <h1 className="brand-title" style={{ margin: 0 }}>Rod<span className="brand-accent">Sync</span></h1>
            </div>
          </div>

          <div className="nav-actions">
            {/* System Switcher (Toggle between Chrome Rod and Guided Rail) */}
            <div className="system-switcher-wrap" role="tablist" aria-label="Product Category Switcher">
              <button
                type="button"
                role="tab"
                aria-selected={systemMode === 'chrome-rod'}
                id="btnToggleModeChromeRod"
                className={`system-switcher-btn ${systemMode === 'chrome-rod' ? 'active system-switcher-chrome' : ''}`}
                onClick={() => handleSwitchSystem('chrome-rod')}
                title="Switch to Chrome Rod Inventory & Cutting Calculator"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="20" x2="20" y2="4"></line>
                  <circle cx="8" cy="8" r="3"></circle>
                  <circle cx="16" cy="16" r="3"></circle>
                </svg>
                <span>Chrome Rod</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={systemMode === 'guided-rail'}
                id="btnToggleModeGuidedRail"
                className={`system-switcher-btn ${systemMode === 'guided-rail' ? 'active system-switcher-rail' : ''}`}
                onClick={() => handleSwitchSystem('guided-rail')}
                title="Switch to Guided Rail Model Search & Cut Validator"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
                <span>Guided Rail</span>
              </button>
            </div>

            <button onClick={toggleTheme} className="btn btn-secondary btn-sm btn-nav-pill" title="Toggle Dark/Light Mode" style={{ transition: 'all 0.3s ease' }}>
              <div style={{ position: 'relative', width: '15px', height: '15px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  transform: theme === 'dark' ? 'translateY(100%)' : 'translateY(0)',
                  transition: 'transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55)', opacity: theme === 'dark' ? 0 : 1
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                </div>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  transform: theme === 'dark' ? 'translateY(0)' : 'translateY(-100%)',
                  transition: 'transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55)', opacity: theme === 'dark' ? 1 : 0
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line>
                  </svg>
                </div>
              </div>
              <span className="btn-nav-text">Theme</span>
            </button>

            {/* Google Sheets Live Sync Button & Status Indicator */}
            <button
              type="button"
              className={`btn btn-sm btn-nav-pill ${sheetsStatus === 'connected' ? 'btn-success-subtle' : 'btn-warning-subtle'}`}
              onClick={() => setIsSheetsModalOpen(true)}
              title={sheetsStatus === 'connected' ? 'Google Sheets Live Write Connected' : 'Google Sheets (Read-Only) - Click to connect live writing'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                border: sheetsStatus === 'connected' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                background: sheetsStatus === 'connected' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                color: sheetsStatus === 'connected' ? '#059669' : '#b45309',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: sheetsStatus === 'connected' ? '#10b981' : '#f59e0b',
                boxShadow: sheetsStatus === 'connected' ? '0 0 5px #10b981' : '0 0 5px #f59e0b',
                display: 'inline-block'
              }}></span>
              <span className="btn-nav-text">
                {sheetsStatus === 'connected' ? 'Live Sync' : 'Read Only'}
              </span>
            </button>

            {/* Chrome Rod specific header actions */}
            <a
              id="btnOpenGoogleSheets"
              className="btn btn-secondary btn-sm btn-nav-pill"
              href="https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Connected Google Sheet (1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ)"
              style={{ display: systemMode === 'chrome-rod' ? 'inline-flex' : 'none', textDecoration: 'none', alignItems: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Sheet ↗</span>
            </a>

            <button
              id="btnExportCsv"
              className="btn btn-secondary btn-sm btn-nav-pill"
              title="Export inventory to CSV file"
              style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Export</span>
            </button>

            <button
              className="btn btn-secondary btn-sm btn-nav-pill"
              title="Import inventory from CSV"
              onClick={() => setIsImportModalOpen(true)}
              style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span className="btn-nav-text">Import</span>
            </button>

            <button
              id="btnOpenCutLogsModal"
              className="btn btn-secondary btn-sm btn-cut-logs btn-nav-pill"
              title="View Cut History &amp; Offcut Logs"
              style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
              </svg>
              <span className="btn-nav-text">Cut Logs</span>
              <span className="badge badge-pill badge-primary" id="cutLogsBadge" style={{ marginLeft: '3px', fontSize: '0.65rem', padding: '0.08rem 0.35rem' }}>0</span>
            </button>

            <button
              id="btnOpenAddModal"
              className="btn btn-primary btn-sm btn-add-main btn-nav-pill"
              title="Add New Rod Stock to Inventory"
              style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  if ((window as any).openAddRodModal) {
                    (window as any).openAddRodModal();
                  } else if ((window as any).openAddModal) {
                    (window as any).openAddModal();
                  }
                }
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span className="btn-nav-text">+ Add Rod</span>
            </button>

            {/* Guided Rail specific header actions */}
            <button
              id="btnGrOpenCutLogsModal"
              className="btn btn-secondary btn-sm btn-cut-logs btn-nav-pill"
              title="View Cut History &amp; Offcut Logs"
              style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
              </svg>
              <span className="btn-nav-text">Cut Logs</span>
              <span className="badge badge-pill badge-primary" id="grCutLogsBadge" style={{ marginLeft: '3px', fontSize: '0.65rem', padding: '0.08rem 0.35rem', background: '#7c3aed' }}>0</span>
            </button>

            <button
              id="btnGrExportCsv"
              className="btn btn-secondary btn-sm btn-nav-pill"
              title="Export Guided Rail inventory to CSV file"
              style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Export</span>
            </button>

            <a
              id="btnGrOpenGoogleSheets"
              className="btn btn-secondary btn-sm btn-nav-pill"
              href="https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Connected Google Sheet (1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ)"
              style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none', textDecoration: 'none', alignItems: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Sheet ↗</span>
            </a>

            <button
              id="btnGrImportCsv"
              className="btn btn-secondary btn-sm btn-nav-pill"
              title="Import Guided Rail inventory from CSV"
              onClick={() => setIsGrImportModalOpen(true)}
              style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span className="btn-nav-text">Import</span>
            </button>

            <button
              id="btnOpenAddRailModal"
              className="btn btn-primary btn-sm btn-nav-pill"
              title="Add Guided Rail stock to storage inventory"
              style={{
                display: systemMode === 'guided-rail' ? 'inline-flex' : 'none',
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                borderColor: '#6d28d9',
                color: '#fff'
              }}
              onClick={() => {
                if (typeof window !== 'undefined' && (window as any).openAddRailStockModal) {
                  const sel = document.getElementById('grModelSelect') as HTMLSelectElement | null;
                  (window as any).openAddRailStockModal(sel?.value);
                }
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span className="btn-nav-text">+ Add Rail</span>
            </button>

            {/* Log Out Button */}
            <button
              type="button"
              id="btnLogoutHeader"
              className="btn btn-secondary btn-sm btn-nav-pill btn-logout-nav"
              title="Log Out of RodSync"
              onClick={handleLogout}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span className="btn-nav-text">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/*  Main Container  */}
      <main className="main-container">
        {/*  Top KPI Summary Cards  */}
        <section className="kpi-grid" aria-label="Inventory Metrics Summary" style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}>
          <div className="kpi-card card-blue" data-kpi-filter="all" title="Click to view all catalog rod stock">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Rod Types</span>
              <div className="kpi-value" id="statTotalTypes">0</div>
              <span className="kpi-subtext">Distinct catalog variants</span>
            </div>
          </div>

          <div className="kpi-card card-indigo" data-kpi-filter="stock" title="Click to view total rods in storage">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Stock Quantity</span>
              <div className="kpi-value" id="statTotalQuantity">0</div>
              <span className="kpi-subtext">Bars / rods in storage</span>
            </div>
          </div>

          <div className="kpi-card card-emerald" data-kpi-filter="in_stock" title="Click to filter by available in-stock rods">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Available Rod Types</span>
              <div className="kpi-value" id="statInStockTypes">0</div>
              <span className="kpi-subtext">Items with Qty &gt; 0</span>
            </div>
          </div>

          <div className="kpi-card card-amber" data-kpi-filter="low_stock" title="Click to filter low stock rods (≤ 5 units)">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Low Stock Items</span>
              <div className="kpi-value" id="statLowStockCount">0</div>
              <span className="kpi-subtext">5 units or below</span>
            </div>
          </div>
        </section>

        {/*  SECTION: SMART ROD SEARCH (HERO TOOL)  */}
        <section className="card smart-search-card" id="smartSearchSection" style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}>
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="badge-icon badge-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <div>
                <h2 className="section-title">Smart Rod Match &amp; Cut Optimizer</h2>
                <p className="section-desc">Search for an exact diameter and minimum required length. The system automatically surfaces and highlights the most efficient rod with minimal cutting waste.</p>
              </div>
            </div>
          </div>

          <form id="smartSearchForm" className="smart-search-form" autoComplete="off">
            <div className="search-inputs-grid">
              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="searchDiameterInput" className="field-label">
                    <span>Required Diameter</span>
                    <span className="field-unit">(mm)</span>
                  </label>
                </div>
                <div className="input-with-icon">
                  <input type="number" id="searchDiameterInput" className="input-control" placeholder="e.g. 12" step="0.1" min="0.1" required />
                  <span className="input-addon">mm</span>
                </div>
                <div className="quick-dia-chips-row">
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll">
                    <button type="button" className="btn-dia-preset" data-dia="8">8mm</button>
                    <button type="button" className="btn-dia-preset" data-dia="10">10mm</button>
                    <button type="button" className="btn-dia-preset" data-dia="12">12mm</button>
                    <button type="button" className="btn-dia-preset" data-dia="16">16mm</button>
                    <button type="button" className="btn-dia-preset" data-dia="20">20mm</button>
                    <button type="button" className="btn-dia-preset" data-dia="25">25mm</button>
                  </div>
                </div>
                <div className="field-hint">Exact match required</div>
              </div>

              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="searchLengthInput" className="field-label">
                    <span>Required Length</span>
                    <span className="field-unit" id="searchLengthUnitBadge">(In)</span>
                  </label>
                  <div className="unit-selector-pills" role="radiogroup" aria-label="Length Unit Selector">
                    <button
                      type="button"
                      className="unit-pill active"
                      id="unitPillIn"
                      data-unit="in"
                      title="Set unit to Inches"
                    >
                      In
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="unitPillFt"
                      data-unit="ft"
                      title="Set unit to Feet"
                    >
                      Ft
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="unitPillM"
                      data-unit="m"
                      title="Set unit to Meters"
                    >
                      M
                    </button>
                  </div>
                </div>
                <div className="input-with-icon input-with-unit-select">
                  <input
                    type="number"
                    id="searchLengthInput"
                    className="input-control"
                    placeholder="e.g. 4.0"
                    step="any"
                    min="0.01"
                    required
                  />
                  <select
                    id="searchLengthUnitSelect"
                    className="input-addon-select"
                    aria-label="Select Length Unit"
                  >
                    <option value="in">In</option>
                    <option value="ft">Ft</option>
                    <option value="m">M</option>
                  </select>
                </div>
                <div className="quick-dia-chips-row">
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="quickLengthChipsScroll">
                    <button type="button" className="btn-len-preset" data-len="1">1</button>
                    <button type="button" className="btn-len-preset" data-len="2">2</button>
                    <button type="button" className="btn-len-preset" data-len="4">4</button>
                    <button type="button" className="btn-len-preset" data-len="6">6</button>
                    <button type="button" className="btn-len-preset" data-len="8">8</button>
                    <button type="button" className="btn-len-preset" data-len="10">10</button>
                  </div>
                </div>
                <div className="field-hint" id="searchLengthHint">Cut piece length</div>
              </div>

              <div className="input-field-group input-field-pieces">
                <div className="field-label-row">
                  <label htmlFor="searchPiecesInput" className="field-label">
                    <span>Pieces Required</span>
                    <span className="field-unit">(Qty)</span>
                  </label>
                </div>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnSearchPiecesDec" aria-label="Decrease Pieces">-</button>
                  <input
                    type="number"
                    id="searchPiecesInput"
                    className="input-control font-mono"
                    placeholder="1"
                    defaultValue="1"
                    min="1"
                    step="1"
                    required
                  />
                  <button type="button" className="btn-step-mini" id="btnSearchPiecesInc" aria-label="Increase Pieces">+</button>
                </div>
                <div className="quick-dia-chips-row">
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll">
                    <button type="button" className="btn-pcs-preset active" data-pcs="1">1 pc</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="2">2 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="5">5 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="10">10 pcs</button>
                  </div>
                </div>
                <div className="field-hint" id="searchTotalCutHint">Total cut: 1 pc</div>
              </div>

              <div className="input-field-group input-field-actions">
                <div className="field-label-row field-label-empty" aria-hidden="true">&nbsp;</div>
                <div className="search-action-group">
                  <button type="submit" className="btn btn-primary btn-search" id="btnRunSmartSearch">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    Find Cuts &amp; Plan
                  </button>
                  <button type="button" className="btn btn-outline" id="btnResetSmartSearch">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                      <path d="M3 3v5h5"></path>
                    </svg>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/*  Smart Search Results Box  */}
          <div id="smartSearchResultsContainer" className="smart-results-container hidden">
            <div className="results-header-bar">
              <div className="results-header-info">
                <h3 className="results-heading" id="smartResultsHeading">Matching Rods &amp; Cut Plan</h3>
                <span className="badge badge-pill badge-primary" id="smartResultsCount">0 Found</span>
              </div>
              <div className="results-criteria" id="smartResultsCriteria"></div>
            </div>

            {/*  Interactive Smart Multi-Cut Optimization Plan  */}
            <div id="smartCutPlanSection" className="cut-plan-section hidden">
              <div className="cut-plan-card">
                <div className="cut-plan-header">
                  <div className="cut-plan-header-title">
                    <div className="badge-icon badge-scissors-icon-sm">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="6" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                        <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                        <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                      </svg>
                    </div>
                    <div>
                      <h4 className="cut-plan-title">Optimized Multi-Cut Plan</h4>
                      <p className="cut-plan-subtitle">Calculated for minimum waste across available stock</p>
                    </div>
                  </div>
                  <div className="cut-plan-strategy-pills" role="radiogroup" aria-label="Cutting Strategy">
                    <button type="button" className="strategy-pill active" id="btnStrategyFullLength" data-strategy="full_length_first" title="Cut from full length stock first, remainder from another rod">
                      ⚡ Full Length First
                    </button>
                    <button type="button" className="strategy-pill" id="btnStrategyOffcuts" data-strategy="offcuts_first" title="Consume offcut remnants first to clear scrap stock">
                      ♻️ Use Offcuts First
                    </button>
                  </div>
                </div>

                {/*  Plan KPI Metrics  */}
                <div className="cut-plan-metrics-grid" id="cutPlanMetricsGrid">
                  {/*  Dynamically populated  */}
                </div>

                {/*  Step-by-Step Rod Cutting Visual Breakdown  */}
                <div className="cut-plan-steps" id="cutPlanStepsList">
                  {/*  Dynamically populated  */}
                </div>

                {/*  Plan Action Footer  */}
                <div className="cut-plan-footer">
                  <div className="cut-plan-footer-left">
                    <button type="button" className="btn btn-sm btn-outline" id="btnToggleAllMatchingTable">
                      📋 <span id="toggleMatchingTableText">Show All Matching Rods Table</span>
                    </button>
                  </div>
                  <div className="cut-plan-footer-right">
                    <button type="button" className="btn btn-secondary btn-sm" id="btnPrintPlanSlip">
                      🖨️ Print Cut Slip
                    </button>
                    <button type="button" className="btn btn-primary" id="btnExecuteCutPlan">
                      ✂️ Execute This Cutting Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/*  Smart Search Results Table (Individual Rod Options)  */}
            <div className="table-responsive" id="smartResultsTableContainer">
              <table className="data-table" id="smartResultsTable">
                <thead>
                  <tr>
                    <th className="smart-col-fit hide-mobile">Fit Priority</th>
                    <th className="smart-col-rod">
                      <span className="desktop-only">Rod Name / Type</span>
                      <span className="mobile-only">Rod &amp; Fit</span>
                    </th>
                    <th className="smart-col-dia hide-mobile text-right">Diameter (mm)</th>
                    <th className="smart-col-len hide-mobile text-right"><span id="smartThLengthTitle">Length (In)</span></th>
                    <th className="smart-col-size mobile-only text-right">Length &amp; Offcut</th>
                    <th className="smart-col-qty text-right">Available</th>
                    <th className="smart-col-rem hide-mobile">Cut Remainder</th>
                    <th className="smart-col-action text-center">Action</th>
                  </tr>
                </thead>
                <tbody id="smartResultsTableBody">
                  {/*  Dynamically populated  */}
                </tbody>
              </table>
            </div>
          </div>

          {/*  Smart Search Empty State  */}
          <div id="smartSearchEmptyState" className="search-empty-state hidden">
            <div className="empty-icon-box">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h4 className="empty-title">No Matching Rods in Stock</h4>
            <p className="empty-desc" id="smartSearchEmptyDesc">We couldn&apos;t find any rod matching your required diameter with sufficient length and active stock.</p>
            <button className="btn btn-secondary btn-sm" id="btnEmptySuggestAdd">
              + Add This Specification to Stock
            </button>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION: GUIDED RAIL — SEARCH & CUTTING VALIDATOR
            ════════════════════════════════════════════════════════════════ */}
        <section className="card guided-rail-card" id="guidedRailSection" style={{ display: systemMode === 'guided-rail' ? undefined : 'none' }}>
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="badge-icon badge-accent" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.2)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
              </div>
              <div>
                <h2 className="section-title">Guided Rail — Model Search &amp; Cut Validator</h2>
                <p className="section-desc">Select an HGR guided rail model, enter required cutting length and piece quantity, and validate hole spacing and end margins.</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                id="btnOpenAddRailFromSection"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9', gap: '0.4rem', borderRadius: '9999px', fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                title="Add new Guided Rail stock to storage inventory"
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).openAddRailStockModal) {
                    const sel = document.getElementById('grModelSelect') as HTMLSelectElement | null;
                    (window as any).openAddRailStockModal(sel?.value);
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                + Add Rail Stock
              </button>
              <a href="/guided-rail/admin" className="gr-admin-link" title="Manage Guided Rail Models & Standard Sizes">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83-2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Standard Size Master &amp; Admin
              </a>
            </div>
          </div>

          <form id="grValidateForm" className="smart-search-form" autoComplete="off">
            <div className="search-inputs-grid">

              {/* 1. Rail Model */}
              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="grModelSelect" className="field-label">
                    <span>Rail Model</span>
                    <span className="field-unit">(HGR)</span>
                  </label>
                </div>
                <div className="input-with-icon">
                  <select id="grModelSelect" className="input-control font-mono" required>
                    <option value="">— Select Model —</option>
                    <option value="HGR15" data-model-name="HGR15" data-pitch="60">HGR15</option>
                    <option value="HGR20" data-model-name="HGR20" data-pitch="60">HGR20</option>
                    <option value="HGR25" data-model-name="HGR25" data-pitch="60">HGR25</option>
                    <option value="HGR30" data-model-name="HGR30" data-pitch="80">HGR30</option>
                    <option value="HGR35" data-model-name="HGR35" data-pitch="80">HGR35</option>
                    <option value="HGR45" data-model-name="HGR45" data-pitch="105">HGR45</option>
                    <option value="HGR55" data-model-name="HGR55" data-pitch="120">HGR55</option>
                    <option value="HGR65" data-model-name="HGR65" data-pitch="150">HGR65</option>
                  </select>
                </div>

                {/* Selected Model Spec Pill */}
                <div id="grModelSpecCard" className="gr-spec-summary-pill hidden">
                  <span className="gr-spec-badge-tag" id="grSpecBadgeName">HGR</span>
                  <span className="gr-spec-detail" id="grSpecBadgeDetails"></span>
                </div>

                <div className="quick-dia-chips-row">
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grQuickChipsTrack">
                    <button type="button" className="btn-dia-preset" data-model-id="HGR15" data-model-name="HGR15">HGR15</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR20" data-model-name="HGR20">HGR20</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR25" data-model-name="HGR25">HGR25</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR30" data-model-name="HGR30">HGR30</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR35" data-model-name="HGR35">HGR35</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR45" data-model-name="HGR45">HGR45</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR55" data-model-name="HGR55">HGR55</button>
                    <button type="button" className="btn-dia-preset" data-model-id="HGR65" data-model-name="HGR65">HGR65</button>
                  </div>
                </div>
                <div className="field-hint" id="grModelHint">Select HGR rail model</div>
              </div>

              {/* 2. Required Cutting Length */}
              <div className="input-field-group input-field-gr-length">
                <div className="field-label-row gr-length-label-row">
                  <label htmlFor="grRequestedLength" className="field-label">
                    <span className="gr-label-full">Required Cutting Length</span>
                    <span className="gr-label-short">Cut Length</span>
                  </label>
                  <div className="unit-selector-pills gr-unit-selector-pills" role="radiogroup" aria-label="Rail Cutting Length Unit Selector">
                    <button
                      type="button"
                      className="unit-pill active"
                      id="grUnitPillMm"
                      data-unit="mm"
                      title="Set unit to Millimeters"
                    >
                      mm
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="grUnitPillIn"
                      data-unit="in"
                      title="Set unit to Inches"
                    >
                      In
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="grUnitPillFt"
                      data-unit="ft"
                      title="Set unit to Feet"
                    >
                      Ft
                    </button>
                  </div>
                </div>
                <div className="input-with-icon input-with-unit-select">
                  <input
                    type="number"
                    id="grRequestedLength"
                    className="input-control font-mono"
                    placeholder="e.g. 180"
                    step="any"
                    min="0.01"
                    required
                  />
                  <select
                    id="grLengthUnitSelect"
                    className="input-addon-select"
                    aria-label="Select Rail Cutting Length Unit"
                  >
                    <option value="mm">mm</option>
                    <option value="in">In</option>
                    <option value="ft">Ft</option>
                  </select>
                </div>
                <div className="quick-dia-chips-row">
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grQuickLengthChips">
                    <button type="button" className="btn-len-preset" data-grlen="60">60 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="120">120 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="180">180 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="240">240 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="300">300 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="500">500 mm</button>
                  </div>
                </div>
                <div className="field-hint" id="grLengthHint">Cut piece length per rail</div>
              </div>

              {/* 3. Required No of Pieces */}
              <div className="input-field-group input-field-pieces">
                <div className="field-label-row">
                  <label htmlFor="grPiecesInput" className="field-label">
                    <span>Required No of Pieces</span>
                    <span className="field-unit">(Qty)</span>
                  </label>
                </div>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnGrPiecesDec" aria-label="Decrease Pieces">-</button>
                  <input
                    type="number"
                    id="grPiecesInput"
                    className="input-control font-mono"
                    placeholder="1"
                    defaultValue="1"
                    min="1"
                    step="1"
                    required
                  />
                  <button type="button" className="btn-step-mini" id="btnGrPiecesInc" aria-label="Increase Pieces">+</button>
                </div>
                <div className="quick-dia-chips-row">
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grPiecesChipsTrack">
                    <button type="button" className="btn-pcs-preset active" data-pcs="1">1 pc</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="2">2 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="5">5 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="10">10 pcs</button>
                  </div>
                </div>
                <div className="field-hint" id="grTotalPiecesHint">Total cut: 1 pc</div>
              </div>

              {/* Action Buttons */}
              <div className="input-field-group input-field-actions">
                <div className="field-label-row field-label-empty" aria-hidden="true">&nbsp;</div>
                <div className="search-action-group">
                  <button type="submit" className="btn btn-primary btn-search" id="btnGrValidate" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Validate Length
                  </button>
                  <button type="button" className="btn btn-primary btn-search" id="btnGrCutAction" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9' }} title="Cut rail piece(s) from matching storage stock">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="3"></circle>
                      <circle cx="6" cy="18" r="3"></circle>
                      <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                      <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                      <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                    </svg>
                    <span>Cut Rail</span>
                  </button>
                  <button type="button" className="btn btn-outline" id="grResetBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                    </svg>
                    Reset
                  </button>
                </div>
              </div>

            </div>
          </form>

          {/* Validation Result Box */}
          <div id="grValidationResult" className="gr-validation-result hidden"></div>

          {/* ════════════════════════════════════════════════════════════════
              GUIDED RAIL STOCK INVENTORY TABLE
              ════════════════════════════════════════════════════════════════ */}
          <div className="gr-stock-card" id="grStockInventoryCard" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Guided Rail Stock Inventory</h3>
                  <span className="badge badge-pill badge-primary" id="grTotalStockBarsBadge" style={{ background: '#7c3aed', color: '#fff', fontSize: '0.75rem' }}>0 bars</span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Storage inventory of linear guided rail raw stock bars ready for cutting</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  id="grStockSearchInput"
                  className="input-control"
                  placeholder="Search rail stock (HGR, rack...)"
                  style={{ width: '200px', height: '36px', fontSize: '0.82rem' }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  id="btnOpenAddRailFromTable"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9', fontSize: '0.8rem', padding: '0.35rem 0.85rem', borderRadius: '9999px' }}
                  onClick={() => {
                    if (typeof window !== 'undefined' && (window as any).openAddRailStockModal) {
                      const sel = document.getElementById('grModelSelect') as HTMLSelectElement | null;
                      (window as any).openAddRailStockModal(sel?.value);
                    }
                  }}
                >
                  + Add Rail Stock
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table" id="grStockTable">
                <thead>
                  <tr>
                    <th>Rail Model</th>
                    <th className="text-center">Pitch (P)</th>
                    <th className="text-right">Stock Bar Length (In / mm)</th>
                    <th className="text-right">Available Qty</th>
                    <th>Storage Rack / Notes</th>
                    <th className="text-center" style={{ width: '170px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody id="grStockTableBody">
                  {/* Populated dynamically */}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/*  SECTION: COMPLETE INVENTORY REPOSITORY  */}
        <section className="card inventory-card" id="inventorySection" style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}>
          {/* Connected Google Sheet Sync Banner */}
          <div style={{
            margin: '12px 1.5rem 6px 1.5rem',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.835rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46' }}>
              <span style={{ fontSize: '1.15rem' }}>📄</span>
              <span>
                <strong>Connected Google Sheet:</strong> 177 Chrome Rods loaded directly from your spreadsheet (<code style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '2px 5px', borderRadius: '4px' }}>Chrome rod inventory</code>).
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href="https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'linear-gradient(135deg, #10b981, #059669)', borderColor: '#059669', color: '#fff', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <span>Open Google Sheet ↗</span>
              </a>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                onClick={() => syncInventoryData(true)}
              >
                🔄 Refresh From Sheet
              </button>
            </div>
          </div>

          <div className="quick-chips-bar" id="quickChipsBar">
            <span className="chips-title">Quick Sizes:</span>
            <div className="chips-scroll-track" id="quickDiameterChipsTrack">
              {/*  Dynamically populated via script.js  */}
            </div>
          </div>

          <div className="inventory-toolbar">
            <div className="toolbar-left">
              <div>
                <h2 className="section-title">Rod Stock Inventory</h2>
                <p className="section-desc">Manage, edit, monitor and filter your metal rods catalog</p>
              </div>
            </div>

            <div className="toolbar-right">
              <div className="inventory-filters">
                {/*  Text Search Filter  */}
                <div className="search-input-wrapper">
                  <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input type="text" id="filterKeyword" className="input-control filter-search" placeholder="Search by name, SKU, notes..." />
                  <button type="button" id="btnClearFilterKeyword" className="search-clear-btn hidden" aria-label="Clear search" title="Clear search">✕</button>
                </div>

                {/*  Row 2: Diameter & Status Dropdowns in ONE LINE on mobile  */}
                <div className="filter-dropdowns-row">
                  <select id="filterDiameter" className="input-control filter-select" aria-label="Filter by diameter">
                    <option value="all">All Diameters</option>
                  </select>


                </div>

                {/*  Display Options: Length Round Off Toggle & View Switcher  */}
                <div className="filter-actions-row">
                  <button
                    type="button"
                    className={`btn-length-toggle ${isRoundLength ? 'active' : ''}`}
                    id="btnToggleRoundLength"
                    role="switch"
                    aria-checked={isRoundLength ? 'true' : 'false'}
                    title={isRoundLength ? 'Lengths shown in Round Off (≈). Click for Decimal (.0).' : 'Lengths shown in Decimal (.0). Click for Round Off (≈).'}
                    onClick={handleToggleRoundLength}
                  >
                    <span className="length-toggle-switch">
                      <span className="length-toggle-knob"></span>
                    </span>
                    <span>Round</span>
                  </button>

                  {/*  View Switcher (Row View vs Cards View)  */}
                  <div className="view-toggle-group" id="viewToggleGroup" role="group" aria-label="Display View">
                    <button type="button" className="view-toggle-btn active" id="btnViewRow" title="Single-line row view">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                      <span>Row</span>
                    </button>
                    <button type="button" className="view-toggle-btn" id="btnViewCards" title="Card grid view">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                      <span>Cards</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/*  Inventory Data Table  */}
          <div className="table-responsive" id="inventoryTableContainer">
            <table className="data-table" id="inventoryTable">
              <thead>
                <tr>

                  <th className="col-name sortable" data-sort="name">ROD NAME / MATERIAL</th>
                  <th className="col-diameter hide-mobile sortable text-center" data-sort="diameterMm">DIAMETER (MM)</th>
                  <th className="col-length hide-mobile sortable text-center" data-sort="lengthIn"><span id="thLengthTitle">LENGTH (IN)</span></th>
                  <th className="col-size mobile-only text-right" data-sort="diameterMm">Size</th>
                  <th className="col-qty sortable text-center" data-sort="quantity">STOCK</th>


                  <th className="col-actions text-center">MANAGE</th>
                </tr>
              </thead>
              <tbody id="inventoryTableBody">
                {/*  Dynamically populated  */}
              </tbody>
            </table>
          </div>

          {/*  Inventory Empty State  */}
          <div id="inventoryEmptyState" className="empty-state hidden">
            <div className="empty-icon-box">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            </div>
            <h4 className="empty-title">No Rods Found</h4>
            <p className="empty-desc">No rod records match your current filters. Try resetting filters or adding a new rod.</p>
            <button className="btn btn-secondary btn-sm" id="btnResetInventoryFilters">Reset Filters</button>
          </div>

          {/*  Inventory Footer / Batch Actions  */}
          <div className="inventory-footer">
            <div className="footer-count" id="inventoryCountSummary">
              Showing 0 of 0 records
            </div>
          </div>
        </section>
      </main>


      {/* IMPORT MODAL */}
      <div className={`modal-overlay ${isImportModalOpen ? '' : 'hidden'}`} style={{ zIndex: 100 }}>
        <div className="modal-card modal-card-sm" style={{ padding: '2rem' }}>
          <div className="modal-header">
            <h3 className="modal-title">Bulk Import Inventory</h3>
            <button type="button" className="modal-close-btn" onClick={() => setIsImportModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>
          <p className="modal-subtitle" style={{ marginBottom: '1.5rem' }}>Download the template to format your data correctly, or upload your completed file.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const csvContent = "data:text/csv;charset=utf-8,Rod Name or Material Type,Diameter (mm),Length (In),Quantity Available\nExample Steel Rebar,12,6.0,15";
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "rodsync_template.csv");
                document.body.appendChild(link);
                link.click();
                link.remove();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Template
            </button>
            <label className="btn btn-primary" style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Upload Bulk Products (.csv)
              <input type="file" id="csvFileInput" accept=".csv" className="hidden-input" onChange={() => setIsImportModalOpen(false)} />
            </label>
          </div>
        </div>
      </div>

      {/* GUIDED RAIL IMPORT MODAL */}
      <div className={`modal-overlay ${isGrImportModalOpen ? '' : 'hidden'}`} style={{ zIndex: 100 }}>
        <div className="modal-card modal-card-sm" style={{ padding: '2rem' }}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div className="modal-icon-badge" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title">Bulk Import Guided Rail Stock</h3>
                <p className="modal-subtitle" style={{ margin: 0 }}>Import linear rail raw stock inventory from CSV</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => setIsGrImportModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>
          <p className="modal-subtitle" style={{ margin: '1rem 0 1.5rem' }}>Download the template to format your guided rail data correctly, or upload your completed .csv file.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadGrTemplate}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Guided Rail Template (.csv)
            </button>
            <label className="btn btn-primary" style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Upload Bulk Guided Rail (.csv)
              <input type="file" id="grCsvFileInput" accept=".csv" className="hidden-input" onChange={() => setIsGrImportModalOpen(false)} />
            </label>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: ADD / EDIT GUIDED RAIL STOCK
          ════════════════════════════════════════════════════════════════ */}
      <div className="modal-overlay hidden" id="grStockModalOverlay" role="dialog" aria-modal="true" aria-labelledby="grModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="grModalTitle">Add Guided Rail Stock</h3>
                <p className="modal-subtitle">Specify rail model, stock bar length, and quantity in storage</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseGrStockModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="grStockForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="grStockEditId" value="" />

            {/* Model Selection */}
            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formGrModelSelect" className="field-label">
                  Guided Rail Model <span className="required">*</span>
                </label>
                <select id="formGrModelSelect" className="input-control font-mono" required>
                  <option value="">— Select Model —</option>
                  <option value="HGR15" data-pitch="60">HGR15</option>
                  <option value="HGR20" data-pitch="60">HGR20</option>
                  <option value="HGR25" data-pitch="60">HGR25</option>
                  <option value="HGR30" data-pitch="80">HGR30</option>
                  <option value="HGR35" data-pitch="80">HGR35</option>
                  <option value="HGR45" data-pitch="105">HGR45</option>
                  <option value="HGR55" data-pitch="120">HGR55</option>
                  <option value="HGR65" data-pitch="150">HGR65</option>
                </select>
                <div className="field-hint" id="formGrModelSpecHint">Select rail model to configure stock</div>
              </div>
            </div>

            {/* Length in mm */}
            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="formGrLengthMm" className="field-label">
                  Stock Bar Length (mm / In) <span className="required">*</span>
                </label>
                <div className="input-with-icon">
                  <input
                    type="number"
                    id="formGrLengthMm"
                    className="input-control font-mono"
                    placeholder="e.g. 3000"
                    step="1"
                    min="10"
                    required
                  />
                  <span className="input-addon">mm</span>
                </div>
                <div className="quick-dia-chips-row" style={{ marginTop: '4px' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grStockQuickLengthChips">
                    <button type="button" className="btn-len-preset" data-stock-len="1000" title="1000 mm (39.37 In)">39.4&quot;</button>
                    <button type="button" className="btn-len-preset" data-stock-len="2000" title="2000 mm (78.74 In)">78.7&quot;</button>
                    <button type="button" className="btn-len-preset" data-stock-len="3000" title="3000 mm (118.11 In)">118.1&quot;</button>
                    <button type="button" className="btn-len-preset" data-stock-len="4000" title="4000 mm (157.48 In)">157.5&quot;</button>
                  </div>
                </div>
                <div className="field-hint" id="formGrLengthHint">Standard rail bar length (mm &amp; In)</div>
              </div>

              {/* Quantity in stock */}
              <div className="form-group col-6">
                <label htmlFor="formGrQuantity" className="field-label">
                  Quantity in Stock <span className="required">*</span>
                </label>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnGrStockQtyDec">-</button>
                  <input
                    type="number"
                    id="formGrQuantity"
                    className="input-control font-mono"
                    placeholder="10"
                    defaultValue="1"
                    min="0"
                    step="1"
                    required
                  />
                  <button type="button" className="btn-step-mini" id="btnGrStockQtyInc">+</button>
                </div>
                <div className="field-hint">Whole bar units in storage</div>
              </div>
            </div>

            {/* Storage Rack Location & Notes */}
            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formGrNotes" className="field-label">
                  Rack Location / Batch Notes <span className="optional">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="formGrNotes"
                  className="input-control"
                  placeholder="e.g. Rack R-3, Heat #5021, Precision Ground"
                />
                <div className="field-hint">Storage location or supplier batch note</div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelGrStockModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnSaveGrStock" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9' }}>
                <span id="btnSaveGrStockText">Save Rail to Stock</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: GUIDED RAIL CUT & DEDUCT FROM STOCK
          ════════════════════════════════════════════════════════════════ */}
      <div className="modal-overlay hidden" id="grCutModalOverlay" role="dialog" aria-modal="true" aria-labelledby="grCutModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="grCutModalTitle">Cut Guided Rail from Stock</h3>
                <p className="modal-subtitle">Deduct cut piece(s) and save remnant offcut bar</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseGrCutModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="grCutForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="grCutStockId" value="" />

            {/* Source Bar Information Card */}
            <div className="cut-source-card" style={{ borderColor: 'rgba(124, 58, 237, 0.25)', background: 'rgba(124, 58, 237, 0.05)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="cut-source-title font-mono" id="grCutSourceModel" style={{ color: '#7c3aed', fontWeight: 700, fontSize: '1.05rem' }}>HGR20</div>
                <span className="badge badge-pill badge-primary" id="grCutSourceQty" style={{ background: '#7c3aed', fontSize: '0.75rem' }}>0 in stock</span>
              </div>
              <div className="cut-source-dims" style={{ marginTop: '5px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Stock Bar Length: <strong id="grCutSourceLength" className="font-mono" style={{ color: 'var(--text-main)' }}>—</strong> &bull; Hole Pitch: <strong id="grCutSourcePitch" className="font-mono" style={{ color: 'var(--text-main)' }}>—</strong>
              </div>
            </div>

            <div className="form-row">
              {/* Cut Length */}
              <div className="form-group col-6">
                <label htmlFor="grCutPieceLengthInput" className="field-label">Cut Piece Length (mm) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="grCutPieceLengthInput" className="input-control font-mono" step="any" min="1" required />
                  <span className="input-addon">mm</span>
                </div>
                <div className="field-hint" id="grCutPieceLengthHint">Length per cut piece (mm &amp; In)</div>
              </div>

              {/* Pieces Count */}
              <div className="form-group col-6">
                <label htmlFor="grCutPiecesCountInput" className="field-label">Pieces to Cut <span className="required">*</span></label>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnGrCutPiecesDec" aria-label="Decrease Pieces">-</button>
                  <input type="number" id="grCutPiecesCountInput" className="input-control font-mono" defaultValue="1" min="1" step="1" required />
                  <button type="button" className="btn-step-mini" id="btnGrCutPiecesInc" aria-label="Increase Pieces">+</button>
                </div>
                <div className="field-hint" id="grCutPiecesHint">Number of pieces to cut</div>
              </div>
            </div>

            {/* Dynamic Offcut Calculation Summary Card */}
            <div className="cut-calculation-card" style={{ borderRadius: 'var(--radius-lg)', padding: '0.85rem 1rem', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span className="text-muted">Total Cut:</span>
                <strong className="font-mono" id="grCalcTotalCut">0 mm (0.00&quot;)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span className="text-muted">Remnant Offcut:</span>
                <strong className="font-mono" id="grCalcRemnant" style={{ color: '#10b981' }}>0 mm (0.00&quot;)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span>Offcut Pitch Spans:</span>
                <span className="font-mono" id="grCalcRemnantPitch">—</span>
              </div>
              <div id="grCutErrorAlert" className="hidden" style={{ color: 'var(--danger-solid)', fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>
                ⚠️ Total cut length exceeds source bar length.
              </div>
            </div>

            {/* Remnant Option Checkbox */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" id="grSaveRemnantCheckbox" defaultChecked style={{ marginTop: '2px' }} />
                <span>Save remaining offcut bar back to Guided Rail stock inventory</span>
              </label>
            </div>

            {/* Customer / Project / Work Order Reference */}
            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="grCutOrderNotes" className="field-label">Order / Project Reference <span className="optional">(Optional)</span></label>
                <input type="text" id="grCutOrderNotes" className="input-control" placeholder="e.g. Job #204, Customer: Precision CNC, X-Axis" />
                <div className="field-hint">Added to cut log and remnant notes</div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" id="btnGrPrintCutModalSlip" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginRight: 'auto' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>Print Cut Slip</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" id="btnCancelGrCutModal">Cancel</button>
                <button type="submit" className="btn btn-primary" id="btnConfirmGrCut" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: '#6d28d9' }}>
                  <span id="btnConfirmGrCutText">✂️ Confirm &amp; Execute Cut</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: ADD / EDIT ROD STOCK  */}
      <div className="modal-overlay hidden" id="rodModalOverlay" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="modalTitle">Add New Rod Stock</h3>
                <p className="modal-subtitle">Specify dimensions and initial quantity</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseRodModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="rodForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="rodEditId" value="" />

            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formRodName" className="field-label">Rod Name or Material Type <span className="required">*</span></label>
                <input type="text" id="formRodName" className="input-control" placeholder="e.g. TMT Steel Rebar, Brass Rod, 304 Stainless" required />
                <div className="field-hint">e.g. TMT Rebar Fe500D, Mild Steel Round Bar, Copper Rod</div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="formDiameterMm" className="field-label">Diameter (mm) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="formDiameterMm" className="input-control" placeholder="12" step="0.1" min="0.1" required />
                  <span className="input-addon">mm</span>
                </div>
              </div>

              <div className="form-group col-6">
                <label htmlFor="formLengthFt" className="field-label">Length (In) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="formLengthFt" className="input-control" placeholder="6.0" step="0.1" min="0.1" required />
                  <span className="input-addon">In</span>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formQuantity" className="field-label">Quantity Available <span className="required">*</span></label>
                <input type="number" id="formQuantity" className="input-control" placeholder="10" min="0" step="1" required />
                <div className="field-hint">Whole units in stock</div>
              </div>
            </div>



            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelRodModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnSaveRod">
                <span id="btnSaveRodText">Save Rod to Stock</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: DEDUCT / DISPATCH ROD STOCK  */}
      <div className="modal-overlay hidden" id="deductModalOverlay" role="dialog" aria-modal="true" aria-labelledby="deductModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-warning-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"></path>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="deductModalTitle">Deduct Rod Stock</h3>
                <p className="modal-subtitle">Record rods cut, dispatched, or used</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseDeductModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="deductForm" className="modal-form">
            <input type="hidden" id="deductRodId" value="" />

            {/*  Target Rod Preview Box  */}
            <div className="deduct-rod-summary" id="deductRodSummary">
              <div className="summary-line">
                <span className="summary-label">Rod:</span>
                <span className="summary-value" id="deductRodName">—</span>
              </div>
              <div className="summary-line">
                <span className="summary-label">Dimensions:</span>
                <span className="summary-value" id="deductRodDimensions">—</span>
              </div>
              <div className="summary-line highlight-line">
                <span className="summary-label">Available in Stock:</span>
                <span className="summary-value font-mono" id="deductRodAvailableQty">0</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="deductQuantityInput" className="field-label">Quantity to Deduct <span className="required">*</span></label>
              <div className="stepper-input">
                <button type="button" className="btn-step" id="btnDeductStepDown">-</button>
                <input type="number" id="deductQuantityInput" className="input-control stepper-val" defaultValue="1" min="1" required />
                <button type="button" className="btn-step" id="btnDeductStepUp">+</button>
              </div>
              <div className="field-hint" id="deductRemainingHint">Remaining after deduction: 0</div>
            </div>

            <div className="form-group">
              <label htmlFor="deductReasonInput" className="field-label">Job / Reason <span className="optional">(Optional)</span></label>
              <input type="text" id="deductReasonInput" className="input-control" placeholder="e.g. Work Order #1042, Site Project A" />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelDeductModal">Cancel</button>
              <button type="submit" className="btn btn-danger" id="btnConfirmDeduct">
                Confirm Stock Deduction
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: CUT ROD & DEDUCT LENGTH / REMNANT  */}
      <div className="modal-overlay hidden" id="cutModalOverlay" role="dialog" aria-modal="true" aria-labelledby="cutModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-scissors-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="cutModalTitle">Cut Rod &amp; Deduct Size</h3>
                <p className="modal-subtitle">Deduct required length and automatically save the remaining offcut piece</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseCutModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="cutForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="cutRodId" value="" />

            {/*  Selected Rod Info Card  */}
            <div className="cut-source-card">
              <div className="cut-source-title" id="cutRodName">—</div>
              <div className="cut-source-dims">
                Diameter: <strong id="cutRodDiameter">—</strong> mm &bull; Full Length: <strong id="cutRodFullLength">—</strong> In &bull; In Stock: <strong id="cutRodAvailableQty">—</strong> units
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-4">
                <label htmlFor="cutRequiredLengthInput" className="field-label">Cut Piece Length <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="cutRequiredLengthInput" className="input-control font-mono" placeholder="5.0" step="0.1" min="0.1" required />
                  <span className="input-addon">In</span>
                </div>
                <div className="field-hint">Length per individual piece</div>
              </div>

              <div className="form-group col-4">
                <label htmlFor="cutPiecesPerRodInput" className="field-label">Pieces / Cuts Needed <span className="required">*</span></label>
                <div className="stepper-input">
                  <button type="button" className="btn-step" id="btnCutPiecesPerRodDown">-</button>
                  <input type="number" id="cutPiecesPerRodInput" className="input-control stepper-val" defaultValue="1" min="1" step="1" required />
                  <button type="button" className="btn-step" id="btnCutPiecesPerRodUp">+</button>
                </div>
                <div className="field-hint" id="cutPiecesPerRodHint">Total pieces needed</div>
              </div>

              <div className="form-group col-4">
                <label htmlFor="cutPiecesQtyInput" className="field-label">Rods to Cut <span className="required">*</span></label>
                <div className="stepper-input">
                  <button type="button" className="btn-step" id="btnCutStepDown">-</button>
                  <input type="number" id="cutPiecesQtyInput" className="input-control stepper-val" defaultValue="1" min="1" step="1" required />
                  <button type="button" className="btn-step" id="btnCutStepUp">+</button>
                </div>
                <div className="field-hint">Quantity of source rods</div>
              </div>
            </div>

            {/*  Dynamic Live Cut Breakdown Card  */}
            <div className="cut-calculation-card" id="cutCalcCard">
              <div className="cut-calc-row">
                <span>Original Rod Length:</span>
                <strong className="font-mono" id="calcOrigLength">0.0 In</strong>
              </div>
              <div className="cut-calc-row">
                <span>Total Cut (Deducted):</span>
                <strong className="font-mono text-danger" id="calcCutLength">- 0.0 In</strong>
              </div>
              <div className="cut-calc-divider"></div>
              <div className="cut-calc-row highlight">
                <span>Remaining Offcut Piece:</span>
                <strong className="font-mono text-success" id="calcRemainLength">0.0 In</strong>
              </div>
              <div className="cut-visual-bar-wrap" id="cutVisualBarWrap" style={{ display: 'none' }}>
                <div className="cut-visual-bar" id="cutVisualMultiBar">
                  <div className="cut-bar-segment segment-cut" id="barCutSegment">Cut</div>
                  <div className="cut-bar-segment segment-remain" id="barRemainSegment">Offcut</div>
                </div>
              </div>
              <div className="cut-calc-note" id="calcRemainNote">
                ✂️ <strong>1 unit</strong> of <strong>12 mm × 1.0 In</strong> offcut rod will be added back into your inventory!
              </div>
            </div>

            {/* Multi-Rod Cut Suggestion Card (Active when cuts exceed single rod length) */}
            <div className="cut-multi-rod-suggestion-card hidden" id="cutMultiRodSuggestionCard">
              <div className="suggestion-card-header">
                <div className="suggestion-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>Multi-Rod Suggestion</span>
                </div>
                <span className="suggestion-title-text" id="cutSuggestionCapacityText">Max pcs exceeded</span>
              </div>

              <p className="suggestion-desc" id="cutSuggestionDesc">
                This rod cannot fit all requested pieces. System suggests cutting from this rod and cutting the remaining pieces from another rod in stock.
              </p>

              <div id="cutSuggestedRodContainer" className="suggested-rod-container">
                <div className="form-group" style={{ marginBottom: '0.65rem' }}>
                  <label htmlFor="cutSuggestedRodSelect" className="field-label" style={{ fontSize: '0.8rem' }}>
                    Select / Confirm Additional Rod from Stock:
                  </label>
                  <select id="cutSuggestedRodSelect" className="input-control font-mono select-compact"></select>
                </div>

                <div className="suggested-steps-preview" id="cutSuggestedStepsPreview">
                  {/* Populated dynamically with Rod 1 & Rod 2 breakdown and segmented bars */}
                </div>
              </div>

              <div id="cutNoStockWarning" className="suggestion-no-stock hidden">
                <div className="text-warning-bold">⚠️ No additional matching rods found in stock for this diameter!</div>
                <p style={{ fontSize: '0.8rem', margin: '0.35rem 0' }}>
                  To cut the remaining pieces, please add a new rod to stock or reduce the pieces required.
                </p>
                <button type="button" className="btn btn-secondary btn-sm" id="btnCutAddNewRodShortcut">
                  + Add New Rod to Stock
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" id="cutAutoAddRemnant" defaultChecked />
                <span>Automatically add the remaining offcut piece(s) back into stock inventory</span>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="cutReasonInput" className="field-label">Job / Work Order / Project Reference <span className="optional">(Optional)</span></label>
              <input type="text" id="cutReasonInput" className="input-control" placeholder="e.g. Work Order #1042, Site Project A" />
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="cutCreatedByInput" className="field-label">
                  👤 Job Created By <span className="optional">(Optional)</span>
                </label>
                <input type="text" id="cutCreatedByInput" className="input-control" placeholder="e.g. Ahmed, Supervisor" />
              </div>
              <div className="form-group col-6">
                <label htmlFor="cutAssignedByInput" className="field-label">
                  🏷️ Job Assigned By <span className="optional">(Optional)</span>
                </label>
                <input type="text" id="cutAssignedByInput" className="input-control" placeholder="e.g. Manager Raza" />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelCutModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnConfirmCut">
                ✂️ Confirm Cut &amp; Update Inventory
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: CONFIRM & EXECUTE MULTI-CUT OPTIMIZATION PLAN  */}
      <div className="modal-overlay hidden" id="executePlanModalOverlay" role="dialog" aria-modal="true" aria-labelledby="executePlanModalTitle">
        <div className="modal-card modal-card-lg">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-scissors-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="executePlanModalTitle">Execute Multi-Rod Cutting Plan</h3>
                <p className="modal-subtitle">Review inventory deductions and offcut remnant additions before applying</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseExecutePlanModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="executePlanForm" className="modal-form" autoComplete="off">
            <div className="plan-confirm-card" id="executePlanSummaryDetails">
              {/*  Populated dynamically via JS  */}
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" id="planAutoAddRemnants" defaultChecked />
                <span>Automatically add all generated offcut remnant pieces back into stock inventory</span>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="planReasonInput" className="field-label">Job / Work Order / Project Reference <span className="optional">(Optional)</span></label>
              <input type="text" id="planReasonInput" className="input-control" placeholder="e.g. Work Order #2041, Frame Assembly Job" />
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="planCreatedByInput" className="field-label">
                  👤 Job Created By <span className="optional">(Optional)</span>
                </label>
                <input type="text" id="planCreatedByInput" className="input-control" placeholder="e.g. Ahmed, Supervisor" />
              </div>
              <div className="form-group col-6">
                <label htmlFor="planAssignedByInput" className="field-label">
                  🏷️ Job Assigned By <span className="optional">(Optional)</span>
                </label>
                <input type="text" id="planAssignedByInput" className="input-control" placeholder="e.g. Manager Raza" />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelExecutePlanModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnConfirmExecutePlan">
                ⚡ Confirm &amp; Apply Cuts to Stock
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: DUPLICATE ROD RESOLUTION PROMPT  */}
      <div className="modal-overlay hidden" id="duplicateModalOverlay" role="dialog" aria-modal="true" aria-labelledby="duplicateModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-info-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="duplicateModalTitle">Identical Rod Found</h3>
                <p className="modal-subtitle">A rod with this name, diameter, and length already exists</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseDuplicateModal">&times;</button>
          </div>

          <div className="duplicate-message-content">
            <p>You are attempting to add a rod matching an existing inventory entry:</p>
            <div className="duplicate-details-card" id="duplicateDetailsCard">
              {/*  Filled via JS  */}
            </div>
            <p className="subtext-note">Would you like to increase the stock quantity of the existing rod, or save this as an additional separate record?</p>
          </div>

          <div className="modal-footer duplicate-footer">
            <button type="button" className="btn btn-secondary btn-sm" id="btnDuplicateCancel">Cancel</button>
            <button type="button" className="btn btn-outline btn-sm" id="btnDuplicateKeepSeparate">Save as Separate</button>
            <button type="button" className="btn btn-primary btn-sm" id="btnDuplicateMerge">Add to Existing Stock</button>
          </div>
        </div>
      </div>

      {/*  MODAL: CUT HISTORY AUDIT LOGS  */}
      <div className="modal-overlay hidden" id="cutLogsModalOverlay" role="dialog" aria-modal="true" aria-labelledby="cutLogsModalTitle">
        <div className="modal-card" style={{ maxWidth: '920px' }}>
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="cutLogsModalTitle">Rod Cutting &amp; Offcut History</h3>
                <p className="modal-subtitle">Log of all cuts, deducted sizes, and generated offcut remnants</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseCutLogsModal" aria-label="Close dialog">&times;</button>
          </div>

          <div className="cut-logs-toolbar" style={{ padding: '1rem 1.5rem 0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="search-input-wrapper" style={{ flex: '1', minWidth: '180px' }}>
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="filterCutLogsInput" className="input-control filter-search" placeholder="Search logs by rod name, diameter, job ref..." style={{ width: '100%' }} />
            </div>
            <div className="cut-logs-actions-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="view-toggle-group btn-group" id="cutLogsViewToggleGroup" style={{ display: 'inline-flex' }}>
                <button type="button" className="btn btn-secondary btn-xs" id="btnCutLogsCards" title="Card View (Optimized for phone)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                  </svg>
                  <span>Cards</span>
                </button>
                <button type="button" className="btn btn-secondary btn-xs" id="btnCutLogsTable" title="Table View">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                  <span>Table</span>
                </button>
              </div>
              <button id="btnPrintCombinedSlip" className="btn btn-primary btn-sm" title="Print a single slip containing 1 or many selected cutting logs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>Print Slip (<span id="selectedLogsCount">0</span>)</span>
              </button>
              <a
                id="btnOpenCutLogsSheet"
                href="https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                title="Open Chrome rod cutting logs tab in Google Sheet"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                Open Google Sheet
              </a>
              <button id="btnExportCutLogsCsv" className="btn btn-secondary btn-sm" title="Export cut history to CSV">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export Logs (CSV)
              </button>
              <button id="btnClearCutLogs" className="btn btn-ghost btn-sm text-danger" title="Clear all recorded cut history">
                Clear Logs
              </button>
            </div>
          </div>

          {/* Cut Logs Date Filter Bar */}
          <div className="cut-logs-date-bar" id="cutLogsDateBar">
            <div className="cut-logs-date-bar-left">
              <span className="cut-logs-date-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Date:
              </span>
              <div className="cut-logs-date-group" id="cutLogsDateQuickFilters">
                <button type="button" className="date-pill-btn active" data-date-filter="all" id="btnDateFilterAll" title="Show all dates">
                  All
                </button>
                <button type="button" className="date-pill-btn" data-date-filter="today" id="btnDateFilterToday" title="Filter cuts made today">
                  Today
                </button>
                <button type="button" className="date-pill-btn" data-date-filter="tomorrow" id="btnDateFilterTomorrow" title="Filter cuts for tomorrow">
                  Tomorrow
                </button>
                <button type="button" className="date-pill-btn" data-date-filter="yesterday" id="btnDateFilterYesterday" title="Filter cuts from yesterday">
                  Yesterday
                </button>
              </div>
              <div className="cut-logs-custom-date-box">
                <input
                  type="date"
                  id="filterCutLogsDateInput"
                  className="input-control cut-logs-date-picker"
                  title="Pick a specific date to filter logs"
                />
                <button
                  type="button"
                  id="btnClearDateFilter"
                  className="btn btn-ghost btn-xs text-muted"
                  title="Reset date filter to All"
                  style={{ display: 'none', padding: '2px 6px', fontSize: '0.72rem' }}
                >
                  ✕ Clear
                </button>
              </div>
            </div>
            <div className="cut-logs-date-bar-right">
              <span id="cutLogsDateFilterInfo" className="cut-logs-date-info">
                All dates
              </span>
            </div>
          </div>

          <div className="cut-logs-content-area" id="cutLogsContentArea" style={{ padding: '0.75rem 1.5rem 1.25rem 1.5rem' }}>
            {/*  Desktop Table View  */}
            <div className="table-responsive cut-logs-table-wrapper" id="cutLogsTableWrapper" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              <table className="data-table" id="cutLogsTable">
                <thead>
                  <tr>
                    <th style={{ width: '42px', textAlign: 'center' }}>
                      <input type="checkbox" id="selectAllCutLogs" title="Select / Deselect All Logs for Slip" style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                    </th>
                    <th>Date &amp; Time</th>
                    <th id="thCutLogsItemSpec">Rod / Spec</th>
                    <th className="text-right">Original</th>
                    <th className="text-right">Cut Size</th>
                    <th className="text-right">Qty</th>
                    <th>Remnant Offcut</th>
                    <th>Job / Reference</th>
                    <th className="text-center">Created / Assigned</th>
                    <th className="text-center">Slip</th>
                  </tr>
                </thead>
                <tbody id="cutLogsTableBody">
                  {/*  Dynamically populated  */}
                </tbody>
              </table>
            </div>

            {/*  Phone / Mobile Cards View  */}
            <div className="cut-logs-cards-container" id="cutLogsCardsContainer" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              {/*  Dynamically populated cards  */}
            </div>

            <div id="cutLogsEmptyState" className="empty-state hidden" style={{ padding: '2.5rem 1rem' }}>
              <div className="empty-icon-box" style={{ width: '48px', height: '48px', marginBottom: '0.75rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                </svg>
              </div>
              <h4 className="empty-title">No Cut Logs Recorded Yet</h4>
              <p className="empty-desc">When you cut rods to size, every cut and generated offcut will be recorded here.</p>
            </div>
          </div>

          <div className="modal-footer cut-logs-modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className="text-muted cut-logs-count-summary" style={{ fontSize: '0.8125rem' }} id="cutLogsCountText">0 log entries</span>
            <div className="cut-logs-footer-buttons" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary btn-sm" id="btnFooterPrintCombinedSlip" title="Print a single slip with selected items">
                🧾 Print Slip (<span id="selectedLogsCountFooter">0</span>)
              </button>
              <button type="button" className="btn btn-secondary" id="btnCloseCutLogsBottom">Close</button>
            </div>
          </div>
        </div>
      </div>

      {/*  MODAL: DUPLICATE ROD RESOLUTION PROMPT  */}
      <div className="modal-overlay hidden" id="duplicateModalOverlay" role="dialog" aria-modal="true" aria-labelledby="duplicateModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-warning-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="duplicateModalTitle">Identical Rod Found</h3>
                <p className="modal-subtitle">A rod with this name, diameter, and length already exists</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseDuplicateModal" aria-label="Close dialog">&times;</button>
          </div>

          <div className="duplicate-message-content">
            <p>You are attempting to add a rod matching an existing inventory entry. How would you like to handle this duplicate?</p>
            <div className="duplicate-details-card" id="duplicateDetailsCard">
              {/* Dynamically populated */}
            </div>
            <p className="subtext-note">Merging will increase the current stock quantity. Keeping separate will create an additional unique record.</p>
          </div>

          <div className="modal-footer duplicate-footer">
            <button type="button" className="btn btn-secondary btn-sm" id="btnDuplicateCancel">Cancel</button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" id="btnDuplicateKeepSeparate">Keep Separate</button>
              <button type="button" className="btn btn-primary btn-sm" id="btnDuplicateMerge">Merge Quantities</button>
            </div>
          </div>
        </div>
      </div>

      {/*  MODAL: GENERIC CONFIRMATION DIALOG  */}
      <div className="modal-overlay hidden" id="confirmModalOverlay" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <div className="modal-card modal-card-xs">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-danger-icon" id="confirmIconBadge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="confirmDialogTitle">Confirm Action</h3>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseConfirmModal">&times;</button>
          </div>
          <div className="confirm-body">
            <p id="confirmDialogMessage">Are you sure you want to proceed?</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" id="btnConfirmCancel">Cancel</button>
            <button type="button" className="btn btn-danger" id="btnConfirmOk">Confirm</button>
          </div>
        </div>
      </div>

      {/*  MODAL: PWA INSTALLATION GUIDE  */}
      <div className="modal-overlay hidden" id="installModalOverlay" role="dialog" aria-modal="true" aria-labelledby="installModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="installModalTitle">Install RodSync</h3>
                <p className="modal-subtitle">Use like a native app on iOS or Android</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseInstallModal">&times;</button>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <div id="installPromptDirect" className="hidden">
              <p style={{ marginBottom: '1rem' }}>Install RodSync on your device for instant offline access, fullscreen dashboard, and fast performance without opening a browser tab.</p>
              <button id="btnTriggerInstallPrompt" className="btn btn-primary" style={{ width: '100%' }}>
                📲 Tap to Install Application
              </button>
            </div>
            <div id="installInstructionsManual">
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '0.875rem', marginBottom: '1rem' }}>
                <strong style={{ color: 'var(--primary-800)', display: 'block', marginBottom: '0.25rem' }}>📱 iPhone / iPad (iOS Safari):</strong>
                <ol style={{ marginLeft: '1.25rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                  <li>Tap the <strong>Share</strong> button <svg style={{ verticalAlign: 'middle' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg> at the bottom of Safari.</li>
                  <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top right.</li>
                </ol>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '0.875rem' }}>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.25rem' }}>🤖 Android / Chrome:</strong>
                <ol style={{ marginLeft: '1.25rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                  <li>Tap the three dots menu <strong>&vellip;</strong> in Chrome.</li>
                  <li>Select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</li>
                </ol>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" id="btnCloseInstallModalBtn">Got it</button>
          </div>
        </div>
      </div>

      {/*  MOBILE ROD QUICK ACTION SHEET (Bottom Sheet for One-Line Rows)  */}
      <div id="mobileActionSheetOverlay" className="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="actionSheetRodName">
        <div className="modal-card modal-card-sm mobile-action-sheet" id="mobileActionSheetCard">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="actionSheetRodName">Rod Details</h3>

              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseActionSheet" aria-label="Close action sheet">&times;</button>
          </div>
          <div className="action-sheet-body">
            <div className="sheet-spec-grid">
              <div className="sheet-spec-item">
                <span className="sheet-spec-label">Diameter</span>
                <span className="sheet-spec-val" id="actionSheetDiameter">--</span>
              </div>
              <div className="sheet-spec-item">
                <span className="sheet-spec-label">Length</span>
                <span className="sheet-spec-val" id="actionSheetLength">--</span>
              </div>
              <div className="sheet-spec-item">
                <span className="sheet-spec-label">Stock Qty</span>
                <span className="sheet-spec-val" id="actionSheetQty">--</span>
              </div>

            </div>

            <div className="sheet-stepper-wrap">
              <span className="sheet-spec-label">Quick Adjust Stock:</span>
              <div className="sheet-stepper">
                <button type="button" className="sheet-step-btn" id="btnSheetDec" title="Decrease stock by 1">- 1</button>
                <span className="sheet-qty-display" id="sheetQtyDisplay">0</span>
                <button type="button" className="sheet-step-btn" id="btnSheetInc" title="Increase stock by 1">+ 1</button>
              </div>
            </div>
            <div className="sheet-action-buttons">
              <button type="button" className="btn btn-primary btn-block" id="btnSheetCut">
                ✂️ Cut Size &amp; Save Offcut
              </button>
              <button type="button" className="btn btn-secondary btn-block" id="btnSheetDeduct">
                ➖ Deduct Whole Rods
              </button>
              <div className="sheet-btn-row">
                <button type="button" className="btn btn-secondary" id="btnSheetEdit" style={{ flex: '1' }}>
                  ✏️ Edit Details
                </button>
                <button type="button" className="btn btn-ghost text-danger" id="btnSheetDelete" style={{ flex: '1' }}>
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*  MODAL: GOOGLE SHEETS APPS SCRIPT SETUP & STATUS  */}
      <div className={`modal-overlay ${isSheetsModalOpen ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-labelledby="sheetsModalTitle" style={{ zIndex: 110 }}>
        <div className="modal-card modal-card-sm" style={{ maxWidth: '580px' }}>
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="sheetsModalTitle">Google Sheets &amp; Cloud Sync</h3>
                <p className="modal-subtitle">Connected to Google Sheet: 1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => setIsSheetsModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>

          <div style={{ padding: '1.25rem 1.5rem', fontSize: '0.875rem' }}>
            {/* Status Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: sheetsStatus === 'connected' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              border: sheetsStatus === 'connected' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.3)',
              marginBottom: '1rem'
            }}>
              <div>
                <span style={{ fontWeight: 600, display: 'block', color: sheetsStatus === 'connected' ? '#065f46' : '#92400e' }}>
                  {sheetsStatus === 'connected' ? 'Live Cloud Sync Active' : 'Connected in Direct Read Mode'}
                </span>
                <span style={{ fontSize: '0.8rem', color: sheetsStatus === 'connected' ? '#047857' : '#b45309' }}>
                  {sheetsStatus === 'connected'
                    ? 'All stock updates, additions, and cut logs save directly into your Google Sheet!'
                    : 'Reading 177 rods from sheet. To save new rods & cut logs back into Google Sheets, enter your Web App URL below.'}
                </span>
              </div>
              <span className={`badge ${sheetsStatus === 'connected' ? 'badge-success' : 'badge-warning'}`} style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                {sheetsStatus === 'connected' ? 'LIVE WRITE' : 'READ ONLY'}
              </span>
            </div>

            <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <div>
                <span style={{ fontWeight: 600, color: '#2563eb', display: 'block' }}>Connected Spreadsheet:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ</span>
              </div>
              <a
                href="https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '4px 8px' }}
              >
                Open in Google Sheets ↗
              </a>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '12px 14px', fontWeight: 600, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                onClick={() => {
                  syncInventoryData(true);
                  setIsSheetsModalOpen(false);
                }}
              >
                <span style={{ fontSize: '1rem' }}>⚡</span>
                <span>Reload 177 Rods From Sheet</span>
              </button>

              <a
                href="https://docs.google.com/spreadsheets/d/1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ padding: '12px 14px', fontWeight: 600, background: 'linear-gradient(135deg, #10b981, #059669)', borderColor: '#059669', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: '#fff' }}
              >
                <span style={{ fontSize: '1rem' }}>↗</span>
                <span>Open in Google Sheets</span>
              </a>
            </div>

            {/* Project Tabs Guide */}
            <div style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ marginBottom: '8px', padding: '6px 10px', background: 'rgba(79, 70, 229, 0.08)', borderRadius: '6px', border: '1px solid rgba(79, 70, 229, 0.2)', fontSize: '0.8rem' }}>
                <strong style={{ color: '#4f46e5' }}>Project Tabs in Connected Google Sheet:</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px', fontSize: '0.75rem' }}>
                  <span>🔵 <strong>Chrome rod inventory:</strong> 177 Rods Stock</span>
                  <span>🔴 <strong>Chrome rod cutting logs:</strong> Rod Cut Records</span>
                  <span>🟣 <strong>Guided rail inventory:</strong> Rail Stock</span>
                  <span>🟠 <strong>Guided rail cutting logs:</strong> Rail Cut Records</span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                All rod inventory and cutting logs in this project strictly correspond to the tabs above in your connected spreadsheet.
              </p>
            </div>

            {/* Live Cloud Writing Connection Section */}
            <div style={{
              background: 'var(--bg-surface-subtle)',
              border: sheetsStatus === 'connected' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: sheetsStatus === 'connected' ? '#059669' : '#d97706' }}>
                  {sheetsStatus === 'connected' ? '✅ Live Cloud Writing Connected' : '⚡ Connect Live Writing to Google Sheets'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                >
                  {copiedSnippet ? '✓ Copied Script!' : '📋 Copy Apps Script'}
                </button>
              </div>

              <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                To save added rods, edited stock, and cut logs directly to your online Google Sheet, paste your Web App URL below:
              </p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={inputScriptUrl}
                  onChange={(e) => setInputScriptUrl(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '0.825rem'
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ padding: '8px 16px', fontWeight: 600 }}
                  onClick={() => {
                    if (!inputScriptUrl.trim()) {
                      alert('Please paste your Google Apps Script Web App URL first.');
                      return;
                    }
                    localStorage.setItem('rodsync_gsheets_script_url', inputScriptUrl.trim());
                    syncInventoryData(true);
                    alert('Saved Google Sheets Web App URL! Testing connection...');
                  }}
                >
                  Connect URL
                </button>
              </div>

              <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                <strong>30-second setup in Google Sheets:</strong><br />
                1. Click <strong>Extensions &gt; Apps Script</strong> in your sheet.<br />
                2. Click <strong>📋 Copy Apps Script</strong> above, paste it in the editor, and click Save.<br />
                3. Click <strong>Deploy &gt; New deployment</strong> &rarr; Select <strong>Web app</strong> &rarr; Access: <strong>Anyone</strong> &rarr; Deploy.<br />
                4. Copy the Web app URL and paste it into the box above.
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const urlToTest = inputScriptUrl.trim() || localStorage.getItem('rodsync_gsheets_script_url') || '';
                try {
                  const res = await fetch('/api/gsheets-sync', {
                    headers: urlToTest ? { 'x-google-script-url': urlToTest } : {}
                  });
                  const data = await res.json();
                  if (data.success && (data.mode === 'apps-script' || data.configured)) {
                    setSheetsStatus('connected');
                    alert('Google Sheets live write connection successful! Ready to sync.');
                  } else {
                    setSheetsStatus(data.configured ? 'connected' : 'unconfigured');
                    alert(`Google Sheets Status: ${data.message || 'Connected in Read-Only mode. Paste Web App URL to enable live writing.'}`);
                  }
                } catch (e: unknown) {
                  alert(`Test Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }}
            >
              Test Connection
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const urlToTest = inputScriptUrl.trim() || localStorage.getItem('rodsync_gsheets_script_url') || '';
                try {
                  const storedRods = JSON.parse(localStorage.getItem('rod_stock_inventory_v1') || '[]');
                  const storedLogs = JSON.parse(localStorage.getItem('rod_stock_cut_logs_v1') || '[]');
                  const railStock = (typeof window !== 'undefined' && (window as any).getGuidedRailStock) ? (window as any).getGuidedRailStock() : [];
                  const res = await fetch('/api/gsheets-sync', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(urlToTest ? { 'x-google-script-url': urlToTest } : {})
                    },
                    body: JSON.stringify({ rods: storedRods, cutLogs: storedLogs, railStock, scriptUrl: urlToTest })
                  });
                  const data = await res.json();
                  if (data.syncedToGoogleSheets) {
                    setSheetsStatus('connected');
                    alert('Success! All current stock and cut logs synchronized directly to your Google Sheet tabs (Chrome rod inventory, Chrome rod cutting logs)!');
                  } else {
                    alert(`Sync Note: ${data.message || 'Saved locally, waiting for Web App URL connection.'}`);
                  }
                } catch (e: unknown) {
                  alert(`Sync Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }}
            >
              Push All Stock &amp; Logs to Sheet Now
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setIsSheetsModalOpen(false)}>Close</button>
          </div>
        </div>
      </div>

      {/*  TOAST CONTAINER  */}
      <div id="toastContainer" className="toast-container" aria-live="polite" aria-atomic="true"></div>

      {/*  MOBILE NATIVE BOTTOM NAVIGATION BAR  */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button className="mob-nav-item active" id="mobNavSearch" title="Smart Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Search</span>
        </button>
        <button className="mob-nav-item" id="mobNavInventory" title="Inventory">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
          <span>Stock</span>
        </button>
        <button className="mob-nav-item mob-nav-add" id="mobNavAdd" title="Add Rod">
          <div className="mob-add-bubble">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <span>Add</span>
        </button>
        <button className="mob-nav-item" id="mobNavCutLogs" title="Cut Logs">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
            <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
            <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
          </svg>
          <span>Cut Logs</span>
        </button>
        <button className="mob-nav-item" id="mobNavInstall" title="Install App">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
          <span>Install</span>
        </button>
      </nav>

      {/* We load the script with afterInteractive strategy and trigger initialization on load */}
      <Script
        src="/script.js?v=16"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.initVanillaApp) {
            window.initVanillaApp();
          }
        }}
      />
      {/* Guided Rail Module */}
      <Script
        src="/guided-rail.js?v=5"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.initGuidedRail) {
            window.initGuidedRail();
          }
        }}
      />
    </>
  );
}
