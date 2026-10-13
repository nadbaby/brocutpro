import { NextResponse } from 'next/server';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

interface RodRecord {
    id?: string;
    sku?: string;
    name?: string;
    diameterMm?: number;
    lengthFt?: number;
    quantity?: number;
    notes?: string;
    updatedAt?: number | string;
}

interface CutLogRecord {
    id?: string;
    timestamp?: number | string;
    rodName?: string;
    diameterMm?: number;
    originalLengthFt?: number;
    cutLengthFt?: number;
    quantity?: number;
    remainderFt?: number;
    remnantAdded?: boolean | string;
    reason?: string;
}

interface CacheEntry {
    rods: RodRecord[];
    cutLogs: CutLogRecord[];
    timestamp: number;
}

// In-memory cache across requests to make multi-device / network access instantaneous
let memoryCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

const getScriptUrl = (req?: Request): string => {
    const envUrl = process.env.GOOGLE_SCRIPT_URL || process.env.GOOGLE_SHEETS_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
    if (envUrl.trim()) return envUrl.trim();
    if (req) {
        const headerUrl = req.headers.get('x-google-script-url');
        if (headerUrl && headerUrl.trim()) return headerUrl.trim();
    }
    return '';
};

const formatPrivateKey = (key: string | undefined) => {
    if (!key) return '';
    return key.replace(/\\n/g, '\n');
};

const getSheetsDoc = async () => {
    const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
    const GOOGLE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const GOOGLE_KEY = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY);

    if (!SPREADSHEET_ID || !GOOGLE_EMAIL || !GOOGLE_KEY) {
        throw new Error('Missing Google Sheets service account credentials.');
    }

    const serviceAccountAuth = new JWT({
        email: GOOGLE_EMAIL,
        key: GOOGLE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    return doc;
};

export async function GET(req: Request) {
    const scriptUrl = getScriptUrl(req);
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true' || req.headers.get('x-refresh') === 'true';

    // 0. Serve from fast in-memory cache if fresh
    if (!forceRefresh && memoryCache && (Date.now() - memoryCache.timestamp < CACHE_TTL_MS)) {
        return NextResponse.json({
            success: true,
            configured: true,
            mode: 'cached',
            cached: true,
            rods: memoryCache.rods,
            cutLogs: memoryCache.cutLogs
        });
    }

    // 1. Google Apps Script Web App Mode (Preferred)
    if (scriptUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            const response = await fetch(scriptUrl, {
                method: 'GET',
                redirect: 'follow',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Apps Script responded with status: ${response.status}`);
            }

            const data = await response.json();
            const rods = data.rods || [];
            const cutLogs = data.cutLogs || [];

            if (data.success || rods.length > 0) {
                memoryCache = {
                    rods,
                    cutLogs,
                    timestamp: Date.now()
                };
            }

            return NextResponse.json({
                success: Boolean(data.success),
                configured: true,
                mode: 'apps-script',
                rods,
                cutLogs
            });
        } catch (error: unknown) {
            console.error('Google Apps Script Read Error:', error);
            // If we have any cached data from earlier, return it as fallback!
            if (memoryCache && memoryCache.rods.length > 0) {
                return NextResponse.json({
                    success: true,
                    configured: true,
                    mode: 'fallback-cache',
                    cached: true,
                    rods: memoryCache.rods,
                    cutLogs: memoryCache.cutLogs
                });
            }
            const message = error instanceof Error ? error.message : 'Failed to reach Apps Script';
            return NextResponse.json({ success: false, configured: true, message }, { status: 500 });
        }
    }

    // 2. Google Service Account Mode Fallback
    if (process.env.GOOGLE_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        try {
            const doc = await getSheetsDoc();
            let rods: RodRecord[] = [];
            let cutLogs: CutLogRecord[] = [];

            const rodsSheet = doc.sheetsByTitle['Rods Inventory'];
            if (rodsSheet) {
                const rows = await rodsSheet.getRows();
                rods = rows.map((r) => ({
                    id: r.get('id') || '',
                    sku: r.get('sku') || '',
                    name: r.get('name') || '',
                    diameterMm: Number(r.get('diameterMm')) || 0,
                    lengthFt: Number(r.get('lengthFt')) || 0,
                    quantity: Number(r.get('quantity')) || 0,
                    notes: r.get('notes') || '',
                    updatedAt: r.get('updatedAt') || ''
                }));
            }

            const logsSheet = doc.sheetsByTitle['Cut Logs'];
            if (logsSheet) {
                const rows = await logsSheet.getRows();
                cutLogs = rows.map((r) => ({
                    id: r.get('id') || '',
                    timestamp: r.get('timestamp') || '',
                    rodName: r.get('rodName') || '',
                    diameterMm: Number(r.get('diameterMm')) || 0,
                    originalLengthFt: Number(r.get('originalLengthFt')) || 0,
                    cutLengthFt: Number(r.get('cutLengthFt')) || 0,
                    quantity: Number(r.get('quantity')) || 0,
                    remainderFt: Number(r.get('remainderFt')) || 0,
                    remnantAdded: r.get('remnantAdded') === 'Yes',
                    reason: r.get('reason') || ''
                }));
            }

            return NextResponse.json({ success: true, configured: true, mode: 'service-account', rods, cutLogs });
        } catch (error: unknown) {
            console.error('GSheets Service Account Error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ success: false, configured: true, message }, { status: 500 });
        }
    }

    // 3. Not Configured
    return NextResponse.json({
        success: false,
        configured: false,
        message: 'Google Sheets Script URL is not configured. Add GOOGLE_SCRIPT_URL to .env.local.'
    });
}

export async function POST(req: Request) {
    const scriptUrl = getScriptUrl(req);
    let payload: { rods?: RodRecord[]; cutLogs?: CutLogRecord[]; scriptUrl?: string };

    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid JSON request payload' }, { status: 400 });
    }

    const effectiveScriptUrl = scriptUrl || (payload.scriptUrl ? payload.scriptUrl.trim() : '');

    // 1. Google Apps Script Web App Mode (Preferred)
    if (effectiveScriptUrl) {
        try {
            const payloadToSend: Record<string, unknown> = {};
            if (payload.rods !== undefined && Array.isArray(payload.rods)) {
                payloadToSend.rods = payload.rods;
            }
            if (payload.cutLogs !== undefined && Array.isArray(payload.cutLogs)) {
                payloadToSend.cutLogs = payload.cutLogs;
            }

            const response = await fetch(effectiveScriptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(payloadToSend),
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error(`Apps Script responded with status: ${response.status}`);
            }

            const text = await response.text();
            let resData: { success?: boolean; message?: string } = {};
            try {
                resData = JSON.parse(text);
            } catch {
                resData = { success: true, message: 'Synchronized with Google Sheets' };
            }

            if (resData.success !== false) {
                memoryCache = {
                    rods: payload.rods || memoryCache?.rods || [],
                    cutLogs: payload.cutLogs || memoryCache?.cutLogs || [],
                    timestamp: Date.now()
                };
            }

            return NextResponse.json({
                success: resData.success !== false,
                message: resData.message || 'Google Sheets Apps Script sync successful'
            });
        } catch (error: unknown) {
            console.error('Apps Script Sync Error:', error);
            const message = error instanceof Error ? error.message : 'Failed to sync with Google Apps Script';
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    // 2. Google Service Account Fallback
    if (process.env.GOOGLE_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        try {
            const doc = await getSheetsDoc();

            if (payload.rods && Array.isArray(payload.rods)) {
                let rodsSheet = doc.sheetsByTitle['Rods Inventory'];
                if (!rodsSheet) {
                    rodsSheet = await doc.addSheet({
                        title: 'Rods Inventory',
                        headerValues: ['id', 'sku', 'name', 'diameterMm', 'lengthFt', 'quantity', 'notes', 'updatedAt']
                    });
                }
                await rodsSheet.clearRows();

                const rowsToInsert = payload.rods.map((r: RodRecord) => ({
                    id: r.id || '',
                    sku: r.sku || '',
                    name: r.name || '',
                    diameterMm: r.diameterMm || 0,
                    lengthFt: r.lengthFt || 0,
                    quantity: r.quantity || 0,
                    notes: r.notes || '',
                    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString()
                }));

                if (rowsToInsert.length > 0) {
                    await rodsSheet.addRows(rowsToInsert);
                }
            }

            if (payload.cutLogs && Array.isArray(payload.cutLogs)) {
                let cutLogsSheet = doc.sheetsByTitle['Cut Logs'];
                if (!cutLogsSheet) {
                    cutLogsSheet = await doc.addSheet({
                        title: 'Cut Logs',
                        headerValues: ['id', 'timestamp', 'rodName', 'diameterMm', 'originalLengthFt', 'cutLengthFt', 'quantity', 'remainderFt', 'remnantAdded', 'reason']
                    });
                }
                await cutLogsSheet.clearRows();

                const logsToInsert = payload.cutLogs.map((l: CutLogRecord) => ({
                    id: l.id || '',
                    timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : '',
                    rodName: l.rodName || '',
                    diameterMm: l.diameterMm || 0,
                    originalLengthFt: l.originalLengthFt || 0,
                    cutLengthFt: l.cutLengthFt || 0,
                    quantity: l.quantity || 0,
                    remainderFt: l.remainderFt || 0,
                    remnantAdded: l.remnantAdded === true || l.remnantAdded === 'Yes' ? 'Yes' : 'No',
                    reason: l.reason || ''
                }));

                if (logsToInsert.length > 0) {
                    await cutLogsSheet.addRows(logsToInsert);
                }
            }

            return NextResponse.json({ success: true, message: 'Google Sheets sync successful' });
        } catch (error: unknown) {
            console.error('GSheets Service Account Sync Error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    return NextResponse.json({
        success: false,
        message: 'Google Sheets Script URL is not configured. Add GOOGLE_SCRIPT_URL to .env.local.'
    }, { status: 400 });
}
