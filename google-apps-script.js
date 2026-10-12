/* eslint-disable */
/**
 * RodSync - Google Sheets Apps Script Integration
 *
 * HOW TO USE:
 * 1. Open your Google Sheet (https://sheets.google.com).
 * 2. In the top menu, click: Extensions > Apps Script.
 * 3. Delete any code in the editor and paste THIS entire script.
 * 4. Click the "Save" icon (or Ctrl+S).
 * 5. In the top right, click: Deploy > New deployment.
 * 6. Click the gear icon (Select type) > Choose "Web app".
 * 7. Set:
 *    - Description: "RodSync Web App Sync"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 8. Click "Deploy" (grant permissions if prompted).
 * 9. Copy the "Web app URL" (starts with https://script.google.com/macros/s/...)
 * 10. Paste it into RodSync under .env.local (GOOGLE_SCRIPT_URL="...")
 *     or in the RodSync Google Sheets settings dialog.
 */

function doGet(e) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var rodsSheet = ss.getSheetByName("Rods Inventory");
        var logsSheet = ss.getSheetByName("Cut Logs");

        var rods = [];
        if (rodsSheet && rodsSheet.getLastRow() > 1) {
            var rodsData = rodsSheet.getDataRange().getValues();
            for (var i = 1; i < rodsData.length; i++) {
                var row = rodsData[i];
                if (!row[0] && !row[2]) continue;
                rods.push({
                    id: String(row[0] || ''),
                    sku: String(row[1] || ''),
                    name: String(row[2] || ''),
                    diameterMm: Number(row[3]) || 0,
                    lengthFt: Number(row[4]) || 0,
                    quantity: Number(row[5]) || 0,
                    notes: String(row[6] || ''),
                    updatedAt: row[7] || ''
                });
            }
        }

        var cutLogs = [];
        if (logsSheet && logsSheet.getLastRow() > 1) {
            var logsData = logsSheet.getDataRange().getValues();
            for (var j = 1; j < logsData.length; j++) {
                var lRow = logsData[j];
                if (!lRow[0] && !lRow[2]) continue;
                cutLogs.push({
                    id: String(lRow[0] || ''),
                    timestamp: lRow[1] || '',
                    rodName: String(lRow[2] || ''),
                    diameterMm: Number(lRow[3]) || 0,
                    originalLengthFt: Number(lRow[4]) || 0,
                    cutLengthFt: Number(lRow[5]) || 0,
                    quantity: Number(lRow[6]) || 0,
                    remainderFt: Number(lRow[7]) || 0,
                    remnantAdded: lRow[8] === 'Yes' || lRow[8] === true,
                    reason: String(lRow[9] || '')
                });
            }
        }

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            configured: true,
            rods: rods,
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
        if (!contents) {
            throw new Error("No payload data received");
        }
        var postData = JSON.parse(contents);
        var ss = SpreadsheetApp.getActiveSpreadsheet();

        // 1. Sync Rods Inventory
        if (postData.rods && Array.isArray(postData.rods)) {
            var rodsSheet = ss.getSheetByName("Rods Inventory");
            if (!rodsSheet) {
                rodsSheet = ss.insertSheet("Rods Inventory");
            }
            rodsSheet.clear();
            rodsSheet.appendRow(['id', 'sku', 'name', 'diameterMm', 'lengthFt', 'quantity', 'notes', 'updatedAt']);
            if (postData.rods.length > 0) {
                var rows = postData.rods.map(function (r) {
                    return [
                        r.id || '',
                        r.sku || '',
                        r.name || '',
                        r.diameterMm || 0,
                        r.lengthFt || 0,
                        r.quantity || 0,
                        r.notes || '',
                        r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString()
                    ];
                });
                rodsSheet.getRange(2, 1, rows.length, 8).setValues(rows);
            }
            rodsSheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e2e8f0");
            rodsSheet.setFrozenRows(1);
        }

        // 2. Sync Cut Logs
        if (postData.cutLogs && Array.isArray(postData.cutLogs)) {
            var logsSheet = ss.getSheetByName("Cut Logs");
            if (!logsSheet) {
                logsSheet = ss.insertSheet("Cut Logs");
            }
            logsSheet.clear();
            logsSheet.appendRow(['id', 'timestamp', 'rodName', 'diameterMm', 'originalLengthFt', 'cutLengthFt', 'quantity', 'remainderFt', 'remnantAdded', 'reason']);
            if (postData.cutLogs.length > 0) {
                var logRows = postData.cutLogs.map(function (l) {
                    return [
                        l.id || '',
                        l.timestamp ? new Date(l.timestamp).toISOString() : '',
                        l.rodName || '',
                        l.diameterMm || 0,
                        l.originalLengthFt || 0,
                        l.cutLengthFt || 0,
                        l.quantity || 0,
                        l.remainderFt || 0,
                        (l.remnantAdded === true || l.remnantAdded === 'Yes') ? 'Yes' : 'No',
                        l.reason || ''
                    ];
                });
                logsSheet.getRange(2, 1, logRows.length, 10).setValues(logRows);
            }
            logsSheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#e2e8f0");
            logsSheet.setFrozenRows(1);
        }

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            message: "Google Sheets sync successful"
        })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            message: err.toString()
        })).setMimeType(ContentService.MimeType.JSON);
    }
}
