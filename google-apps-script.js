
/* eslint-disable */
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

var MODEL_SPECS = {
  'HGR15': { railWidthMm: 15, railHeightMm: 15, pitchMm: 60 },
  'HGR20': { railWidthMm: 20, railHeightMm: 17.5, pitchMm: 60 },
  'HGR25': { railWidthMm: 23, railHeightMm: 22, pitchMm: 60 },
  'HGR30': { railWidthMm: 28, railHeightMm: 26, pitchMm: 80 },
  'HGR35': { railWidthMm: 34, railHeightMm: 29, pitchMm: 80 },
  'HGR45': { railWidthMm: 45, railHeightMm: 38, pitchMm: 105 },
  'HGR55': { railWidthMm: 53, railHeightMm: 44, pitchMm: 120 },
  'HGR65': { railWidthMm: 63, railHeightMm: 53, pitchMm: 150 }
};

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
        try { byAlias.setName(preferredName); } catch (e) { }
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
          var cleanName = 'Chrome Rod';
          if (/honed/i.test(name)) cleanName = 'Honed Tube';
          else if (/sbrc/i.test(name)) cleanName = 'SBRC';
          if (dia > 0 && len > 0 && qty > 0) {
            rods.push({
              id: 'rod-' + Math.round(dia) + '-' + len + '-' + i,
              sku: 'ROD-' + Math.round(dia) + 'MM-' + len + 'IN-STOCK',
              name: cleanName,
              category: cleanName,
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
          var rClean = 'Chrome Rod';
          if (/honed/i.test(rName)) rClean = 'Honed Tube';
          else if (/sbrc/i.test(rName)) rClean = 'SBRC';
          if (rDia > 0 && rLen > 0 && rQty > 0) {
            rods.push({
              id: String(r[0] || ('rod-' + Math.round(rDia) + '-' + rLen + '-' + i)),
              sku: String(r[1] || ('ROD-' + Math.round(rDia) + 'MM-' + rLen + 'IN-STOCK')),
              name: rClean,
              category: rClean,
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
        var rModel = String(g[1] || '').trim().toUpperCase();
        var rLen = Number(g[6]) || 0;
        var rQty = Number(g[7]) || 0;
        if ((!rModel && rLen <= 0) || rQty <= 0 || rLen <= 0) continue;

        var spec = MODEL_SPECS[rModel] || { railWidthMm: 0, railHeightMm: 0, pitchMm: 60 };
        var rWidth = Number(g[3]) || spec.railWidthMm;
        var rHeight = Number(g[4]) || spec.railHeightMm;
        var rPitch = Number(g[5]) || spec.pitchMm;
        var rSku = String(g[2] || '').trim() || ('RAIL-' + rModel + '-' + Math.round(rLen) + 'MM');
        var rId = String(g[0] || '').trim() || ('grs-' + rModel.toLowerCase() + '-' + Math.round(rLen) + '-' + j);

        var notesRaw = String(g[8] || '');
        var brand = 'FINHY';
        var mBrand = notesRaw.match(/\[(HIWIN|FINHY|PMI)\]/i);
        if (mBrand) {
          brand = mBrand[1].toUpperCase();
        } else if (/\b(FINHY|PMI|HIWIN)\b/i.test(notesRaw)) {
          var found = notesRaw.match(/\b(FINHY|PMI|HIWIN)\b/i);
          if (found) brand = found[1].toUpperCase();
        }

        railStock.push({
          id: rId,
          modelName: rModel,
          brand: brand,
          sku: rSku,
          railWidthMm: rWidth,
          railHeightMm: rHeight,
          pitchMm: rPitch,
          lengthMm: rLen,
          quantity: rQty,
          notes: notesRaw,
          updatedAt: g[9] || new Date().toISOString()
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

    // 1. Sync Chrome Rod Stock (Chrome rod inventory: 4 columns matching user format)
    var rodsList = postData.rods;
    if (rodsList && Array.isArray(rodsList) && rodsList.length > 0) {
      rodsList = rodsList.filter(function (r) { return Number(r.diameterMm) !== 300; });
      sheet2.clear();
      sheet2.appendRow(['Rod Name', 'Dia (mm)', 'Length (in)', 'Quantity']);
      var rows2 = rodsList.map(function (r) {
        var len = (r.lengthIn !== undefined && r.lengthIn !== null) ? r.lengthIn : (r.lengthFt || 0);
        var rName = String(r.name || r.category || 'Chrome Rod').trim();
        var cleanName = 'Chrome Rod';
        if (/honed/i.test(rName)) cleanName = 'Honed Tube';
        else if (/sbrc/i.test(rName)) cleanName = 'SBRC';
        return [
          cleanName,
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
    if (railList && Array.isArray(railList)) {
      var validRails = railList.filter(function (g) {
        return (Number(g.quantity) || 0) > 0 && (Number(g.lengthMm) || 0) > 0;
      });
      sheet3.clear();
      sheet3.appendRow(['ID', 'Model Name', 'SKU', 'Rail Width (mm)', 'Rail Height (mm)', 'Pitch / PCC (mm)', 'Length (mm)', 'Quantity', 'Storage Rack / Notes', 'Last Updated']);
      if (validRails.length > 0) {
        var rows3 = validRails.map(function (g) {
          var brandVal = (g.brand || 'FINHY').toUpperCase();
          var rawNotes = String(g.notes || '');
          var fullNotes = rawNotes;
          if (fullNotes.indexOf('[' + brandVal + ']') === -1 && !new RegExp('\\b' + brandVal + '\\b', 'i').test(fullNotes)) {
            fullNotes = ('[' + brandVal + '] ' + fullNotes).trim();
          }
          return [
            g.id || '',
            g.modelName || '',
            g.sku || '',
            g.railWidthMm || 0,
            g.railHeightMm || 0,
            g.pitchMm || 0,
            g.lengthMm || 0,
            g.quantity || 0,
            fullNotes,
            g.updatedAt ? new Date(g.updatedAt).toISOString() : new Date().toISOString()
          ];
        });
        sheet3.getRange(2, 1, rows3.length, 10).setValues(rows3);
        formatHeader(sheet3, 10, "#ede9fe");
      }
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
      rodCuts = rodCuts.filter(function (l) { return Number(l.diameterMm) !== 300; });
      sheet4.clear();
      sheet4.appendRow(['ID', 'Date & Time', 'Rod Name', 'Diameter (mm)', 'Original Length (In)', 'Cut Length (In)', 'Quantity', 'Remnant Offcut (In)', 'Remnant Added', 'Job / Reason', 'Assign By', 'Assign To']);
      var rows4 = rodCuts.map(function (l) {
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
      var rows5 = railCuts.map(function (q) {
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

      if (postData.appendLogs === true && sheet5.getLastRow() > 1) {
        sheet5.getRange(sheet5.getLastRow() + 1, 1, rows5.length, 14).setValues(rows5);
      } else {
        sheet5.clear();
        sheet5.appendRow(['ID', 'Date & Time', 'Rail Model', 'Pitch / PCC (mm)', 'Original Length (mm)', 'Cut Length (mm)', 'Quantity', 'Remnant Offcut (mm)', 'Holes Count', 'End Margin (mm)', 'Remnant Added', 'Order / Job Notes', 'Assign By', 'Assign To']);
        sheet5.getRange(2, 1, rows5.length, 14).setValues(rows5);
        formatHeader(sheet5, 14, "#fef3c7");
      }
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
