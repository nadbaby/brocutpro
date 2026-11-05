import { NextResponse } from 'next/server';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface RodRecord {
    id?: string;
    sku?: string;
    name?: string;
    diameterMm?: number;
    lengthIn?: number;
    lengthFt?: number;
    quantity?: number;
    notes?: string;
    updatedAt?: number | string;
    createdAt?: number | string;
}

interface GuidedRailStockRecord {
    id?: string;
    modelName?: string;
    sku?: string;
    railWidthMm?: number;
    railHeightMm?: number;
    pitchMm?: number;
    lengthMm?: number;
    quantity?: number;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}

interface CutLogRecord {
    id?: string;
    timestamp?: number | string;
    rodName?: string;
    modelName?: string;
    isRail?: boolean;
    diameterMm?: number;
    pitchMm?: number;
    originalLengthIn?: number;
    originalLengthFt?: number;
    originalLengthMm?: number;
    cutLengthIn?: number;
    cutLengthFt?: number;
    cutLengthMm?: number;
    quantity?: number;
    remainderIn?: number;
    remainderFt?: number;
    remainderMm?: number;
    holesCount?: number;
    endMarginMm?: number;
    remnantAdded?: boolean | string;
    reason?: string;
    assignBy?: string;
    assignTo?: string;
    createdBy?: string;
    assignedBy?: string;
}

interface CacheEntry {
    rods: RodRecord[];
    railStock: GuidedRailStockRecord[];
    cutLogs: CutLogRecord[];
    rodCutLogs: CutLogRecord[];
    railCutLogs: CutLogRecord[];
    timestamp: number;
}

const TARGET_SPREADSHEET_ID = "1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ";
const OLD_OBSOLETE_SCRIPT_HASH = "AKfycbzrJc_1Ohm4BC61Bo3ElhXjxqWPfv1Je0CM_nh2-7AgvClHiVkJ4IXxIOPyHpJU06v8";
const DATA_DIR = join(process.cwd(), '.data');
const STOCK_FILE = join(DATA_DIR, 'guided-rail-stock.json');
const RODS_FILE = join(DATA_DIR, 'chrome-rods.json');
const CUT_LOGS_FILE = join(DATA_DIR, 'cut-logs.json');

function ensureDataDir(): void {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadLocalRods(): RodRecord[] {
    try {
        if (existsSync(RODS_FILE)) {
            const raw = readFileSync(RODS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.warn('Error reading local rods file', e);
    }
    return [];
}

function saveLocalRods(rods: RodRecord[]): void {
    try {
        ensureDataDir();
        writeFileSync(RODS_FILE, JSON.stringify(rods, null, 2), 'utf8');
    } catch (e) {
        console.warn('Error saving local rods file', e);
    }
}

function loadLocalCutLogs(): CutLogRecord[] {
    try {
        if (existsSync(CUT_LOGS_FILE)) {
            const raw = readFileSync(CUT_LOGS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.warn('Error reading local cut logs file', e);
    }
    return [];
}

function saveLocalCutLogs(logs: CutLogRecord[]): void {
    try {
        ensureDataDir();
        writeFileSync(CUT_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
    } catch (e) {
        console.warn('Error saving local cut logs file', e);
    }
}

function loadLocalRailStock(): GuidedRailStockRecord[] {
    try {
        if (existsSync(STOCK_FILE)) {
            const raw = readFileSync(STOCK_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.warn('Error reading local rail stock file', e);
    }
    return [];
}


function isRailLog(log: CutLogRecord): boolean {
    if (!log) return false;
    if (log.isRail === true) return true;
    if (log.modelName) return true;
    const idStr = String(log.id || '');
    if (idStr.startsWith('gr-cut-')) return true;
    const name = String(log.rodName || '').toLowerCase();
    if (name.includes('guided rail') || name.startsWith('hgr') || name.startsWith('rail')) return true;
    if (log.holesCount !== undefined || log.pitchMm !== undefined || log.endMarginMm !== undefined) return true;
    return false;
}

// Fetch Guided Rail Stock directly from Google Sheet tab "Guided rail inventory"
async function fetchDirectSheetRailStock(sheetId: string): Promise<GuidedRailStockRecord[]> {
    try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Guided%20rail%20inventory`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(gvizUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) return [];
        const raw = await res.text();
        const match = raw.match(/setResponse\(([\s\S]*)\);/);
        if (!match || !match[1]) return [];

        const json = JSON.parse(match[1]);
        const rows = json.table?.rows || [];
        if (!rows || rows.length === 0) return [];

        const rails: GuidedRailStockRecord[] = [];
        rows.forEach((row: any, i: number) => {
            const cells = row.c || [];
            const getVal = (idx: number, def: any = null) => {
                if (idx >= 0 && idx < cells.length && cells[idx] && cells[idx].v !== null && cells[idx].v !== undefined) {
                    return cells[idx].v;
                }
                return def;
            };

            const id = String(getVal(0, `grs-${i + 1}`));
            const modelName = String(getVal(1, '')).trim();
            const sku = String(getVal(2, '')).trim();
            const railWidthMm = parseFloat(getVal(3, 0)) || 0;
            const railHeightMm = parseFloat(getVal(4, 0)) || 0;
            const pitchMm = parseFloat(getVal(5, 0)) || 0;
            const lengthMm = parseFloat(getVal(6, 0)) || 0;
            const quantity = parseInt(getVal(7, 0), 10) || 0;
            const notes = String(getVal(8, '')).trim();

            if (modelName || (railWidthMm > 0 && lengthMm > 0)) {
                rails.push({
                    id,
                    modelName: modelName || `Rail-${railWidthMm}`,
                    sku: sku || `RAIL-${modelName || railWidthMm}-${lengthMm}MM`,
                    railWidthMm,
                    railHeightMm,
                    pitchMm,
                    lengthMm,
                    quantity,
                    notes,
                    updatedAt: new Date().toISOString()
                });
            }
        });
        return rails;
    } catch {
        return [];
    }
}

// Fetch Chrome Rod Cut Logs directly from Google Sheet tab "Chrome rod cutting logs"
async function fetchDirectSheetRodCutLogs(sheetId: string): Promise<CutLogRecord[]> {
    try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Chrome%20rod%20cutting%20logs`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(gvizUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) return [];
        const raw = await res.text();
        const match = raw.match(/setResponse\(([\s\S]*)\);/);
        if (!match || !match[1]) return [];

        const json = JSON.parse(match[1]);
        const rows = json.table?.rows || [];
        if (!rows || rows.length === 0) return [];

        const logs: CutLogRecord[] = [];
        rows.forEach((row: any, i: number) => {
            const cells = row.c || [];
            const getVal = (idx: number, def: any = '') => {
                if (idx >= 0 && idx < cells.length && cells[idx] && cells[idx].v !== null && cells[idx].v !== undefined) {
                    return cells[idx].v;
                }
                return def;
            };

            const id = String(getVal(0, `log-cr-${i + 1}`));
            const timestamp = getVal(1, '');
            const rodName = String(getVal(2, 'Chrome Rod')).trim();
            const dia = parseFloat(getVal(3, 0)) || 0;
            const origLen = parseFloat(getVal(4, 0)) || 0;
            const cutLen = parseFloat(getVal(5, 0)) || 0;
            const qty = parseInt(getVal(6, 1), 10) || 1;
            const rem = parseFloat(getVal(7, 0)) || 0;
            const remnantAdded = String(getVal(8, '')).toLowerCase() === 'yes';
            const reason = String(getVal(9, '')).trim();
            const assignBy = String(getVal(10, '')).trim();
            const assignTo = String(getVal(11, '')).trim();

            if (dia > 0 || cutLen > 0) {
                logs.push({
                    id,
                    timestamp,
                    isRail: false,
                    rodName,
                    diameterMm: dia,
                    originalLengthIn: origLen,
                    originalLengthFt: origLen,
                    cutLengthIn: cutLen,
                    cutLengthFt: cutLen,
                    quantity: qty,
                    remainderIn: rem,
                    remainderFt: rem,
                    remnantAdded,
                    reason,
                    assignBy,
                    assignTo
                });
            }
        });
        return logs;
    } catch {
        return [];
    }
}

// Fetch Guided Rail Cut Logs directly from Google Sheet tab "Guided rail cutting logs"
async function fetchDirectSheetRailCutLogs(sheetId: string): Promise<CutLogRecord[]> {
    try {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Guided%20rail%20cutting%20logs`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(gvizUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) return [];
        const raw = await res.text();
        const match = raw.match(/setResponse\(([\s\S]*)\);/);
        if (!match || !match[1]) return [];

        const json = JSON.parse(match[1]);
        const rows = json.table?.rows || [];
        if (!rows || rows.length === 0) return [];

        const logs: CutLogRecord[] = [];
        rows.forEach((row: any, i: number) => {
            const cells = row.c || [];
            const getVal = (idx: number, def: any = '') => {
                if (idx >= 0 && idx < cells.length && cells[idx] && cells[idx].v !== null && cells[idx].v !== undefined) {
                    return cells[idx].v;
                }
                return def;
            };

            const id = String(getVal(0, `log-gr-${i + 1}`));
            const timestamp = getVal(1, '');
            const modelName = String(getVal(2, '')).trim();
            const pitchMm = parseFloat(getVal(3, 0)) || 0;
            const origMm = parseFloat(getVal(4, 0)) || 0;
            const cutMm = parseFloat(getVal(5, 0)) || 0;
            const qty = parseInt(getVal(6, 1), 10) || 1;
            const remMm = parseFloat(getVal(7, 0)) || 0;
            const holesCount = parseInt(getVal(8, 0), 10) || 0;
            const endMarginMm = parseFloat(getVal(9, 0)) || 0;
            const remnantAdded = String(getVal(10, '')).toLowerCase() === 'yes';
            const reason = String(getVal(11, '')).trim();
            const assignBy = String(getVal(12, '')).trim();
            const assignTo = String(getVal(13, '')).trim();

            if (modelName || cutMm > 0) {
                logs.push({
                    id,
                    timestamp,
                    isRail: true,
                    modelName,
                    rodName: modelName ? `Guided Rail ${modelName}` : 'Guided Rail',
                    pitchMm,
                    diameterMm: pitchMm,
                    originalLengthMm: origMm,
                    originalLengthIn: Number((origMm / 25.4).toFixed(2)),
                    cutLengthMm: cutMm,
                    cutLengthIn: Number((cutMm / 25.4).toFixed(2)),
                    quantity: qty,
                    remainderMm: remMm,
                    remainderIn: Number((remMm / 25.4).toFixed(2)),
                    holesCount,
                    endMarginMm,
                    remnantAdded,
                    reason,
                    assignBy,
                    assignTo
                });
            }
        });
        return logs;
    } catch {
        return [];
    }
}

// In-memory cache across requests to make multi-device / network access instantaneous
let memoryCache: CacheEntry | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds TTL

const getScriptUrl = (req?: Request): string => {
    let url = '';
    if (req) {
        const headerUrl = req.headers.get('x-google-script-url');
        if (headerUrl && headerUrl.trim()) url = headerUrl.trim();
    }
    if (!url) {
        const envUrl = process.env.GOOGLE_SCRIPT_URL || process.env.GOOGLE_SHEETS_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
        url = envUrl.trim();
    }
    // Ignore the old obsolete script URL pointing to the old demo sheet
    if (url.includes(OLD_OBSOLETE_SCRIPT_HASH)) {
        return '';
    }
    return url;
};

// Direct Live Fetch from Google Sheet via Visualization API (GVIZ)
async function fetchDirectSheetRods(sheetId: string): Promise<RodRecord[]> {
    try {
        const fetchTab = async (tabName: string): Promise<RodRecord[]> => {
            const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(gvizUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) return [];
            const raw = await res.text();
            const match = raw.match(/setResponse\(([\s\S]*)\);/);
            if (!match || !match[1]) return [];

            const json = JSON.parse(match[1]);
            const rows = json.table?.rows || [];
            if (!rows || rows.length === 0) return [];

            const rods: RodRecord[] = [];
            rows.forEach((row: any, i: number) => {
                const cells = row.c || [];
                const getVal = (idx: number, def: any = null) => {
                    if (idx >= 0 && idx < cells.length && cells[idx] && cells[idx].v !== null && cells[idx].v !== undefined) {
                        return cells[idx].v;
                    }
                    return def;
                };

                // Pattern A: Standard 4 columns [Name, Dia, Length, Qty] (e.g. ['Chrome Rod', 10, 5.5, 1])
                const v0 = getVal(0);
                const v1 = parseFloat(getVal(1));
                const v2 = parseFloat(getVal(2));
                const v3 = parseInt(getVal(3), 10);
                if (!isNaN(v1) && v1 > 0 && !isNaN(v2) && v2 > 0 && !isNaN(v3) && v3 > 0) {
                    rods.push({
                        id: `rod-${Math.round(v1)}-${v2}-${i + 1}`,
                        sku: `ROD-${Math.round(v1)}MM-${v2}IN-STOCK`,
                        name: String(v0 || 'Chrome Rod').trim() || 'Chrome Rod',
                        diameterMm: v1,
                        lengthIn: v2,
                        lengthFt: v2,
                        quantity: v3,
                        notes: String(getVal(6, '')).trim(),
                        updatedAt: new Date().toISOString()
                    });
                    return;
                }

                // Pattern B: Shifted 8 columns [ID, SKU, Name, Dia, Length, Qty]
                const d3 = parseFloat(getVal(3));
                const l4 = parseFloat(getVal(4));
                const q5 = parseInt(getVal(5), 10);
                if (!isNaN(d3) && d3 > 0 && !isNaN(l4) && l4 > 0) {
                    rods.push({
                        id: String(v0 || `rod-${Math.round(d3)}-${l4}-${i + 1}`),
                        sku: String(getVal(1) || `ROD-${Math.round(d3)}MM-${l4}IN-STOCK`),
                        name: String(getVal(2) || 'Chrome Rod').trim() || 'Chrome Rod',
                        diameterMm: d3,
                        lengthIn: l4,
                        lengthFt: l4,
                        quantity: !isNaN(q5) && q5 > 0 ? q5 : 1,
                        notes: String(getVal(6, '')).trim(),
                        updatedAt: new Date().toISOString()
                    });
                }
            });

            return rods;
        };

        let rods = await fetchTab('Chrome rod inventory');
        if (rods.length === 0) {
            rods = await fetchTab('Sheet1');
        }
        return rods;
    } catch (e) {
        console.warn('fetchDirectSheetRods error:', e);
        return [];
    }
}

const formatPrivateKey = (key: string | undefined) => {
    if (!key) return '';
    return key.split('\\n').join('\n');
};

const getSheetsDoc = async () => {
    const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || TARGET_SPREADSHEET_ID;
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
            configured: Boolean(scriptUrl),
            mode: 'cached',
            cached: true,
            rods: memoryCache.rods,
            railStock: memoryCache.railStock,
            cutLogs: memoryCache.cutLogs,
            rodCutLogs: memoryCache.rodCutLogs,
            railCutLogs: memoryCache.railCutLogs
        });
    }

    // 1. Google Apps Script Web App Mode (if valid custom URL provided)
    if (scriptUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            const scriptUrlObj = new URL(scriptUrl);
            scriptUrlObj.searchParams.set('spreadsheetId', TARGET_SPREADSHEET_ID);

            const response = await fetch(scriptUrlObj.toString(), {
                method: 'GET',
                redirect: 'follow',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const rods: RodRecord[] = Array.isArray(data.rods) ? data.rods : [];
                let railStock: GuidedRailStockRecord[] = Array.isArray(data.railStock) ? data.railStock : [];
                let cutLogs: CutLogRecord[] = Array.isArray(data.cutLogs) ? data.cutLogs : [];
                let rodCutLogs: CutLogRecord[] = Array.isArray(data.rodCutLogs) ? data.rodCutLogs : [];
                let railCutLogs: CutLogRecord[] = Array.isArray(data.railCutLogs) ? data.railCutLogs : [];

                if (cutLogs.length > 0 && rodCutLogs.length === 0 && railCutLogs.length === 0) {
                    rodCutLogs = cutLogs.filter(l => !isRailLog(l));
                    railCutLogs = cutLogs.filter(l => isRailLog(l));
                } else if (cutLogs.length === 0 && (rodCutLogs.length > 0 || railCutLogs.length > 0)) {
                    cutLogs = [...rodCutLogs, ...railCutLogs];
                }

                if (railStock.length > 0) {
                    try {
                        ensureDataDir();
                        writeFileSync(STOCK_FILE, JSON.stringify(railStock, null, 2), 'utf8');
                    } catch {}
                } else {
                    railStock = loadLocalRailStock();
                }

                if (rods.length > 0) {
                    saveLocalRods(rods);
                    if (cutLogs.length > 0) saveLocalCutLogs(cutLogs);
                    memoryCache = { rods, railStock, cutLogs, rodCutLogs, railCutLogs, timestamp: Date.now() };
                    return NextResponse.json({
                        success: true,
                        configured: true,
                        mode: 'apps-script',
                        spreadsheetId: TARGET_SPREADSHEET_ID,
                        rods,
                        railStock,
                        cutLogs,
                        rodCutLogs,
                        railCutLogs
                    });
                }
            }
        } catch (error: unknown) {
            console.warn('Apps Script failed or returned empty, falling back to direct sheet fetch:', error);
        }
    }

    // 2. Direct Live Fetch from Connected Google Sheet (1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ)
    const directRodsRaw = await fetchDirectSheetRods(TARGET_SPREADSHEET_ID);
    const directRods = directRodsRaw.filter(r => (r.diameterMm || 0) !== 300);
    const directRails = await fetchDirectSheetRailStock(TARGET_SPREADSHEET_ID);
    const directRodLogs = await fetchDirectSheetRodCutLogs(TARGET_SPREADSHEET_ID);
    const directRailLogs = await fetchDirectSheetRailCutLogs(TARGET_SPREADSHEET_ID);

    // Direct Google Sheet is the master source of truth.
    // If Google Sheet has rods, strictly use ONLY the rods from Google Sheet.
    let mergedRods: RodRecord[] = [];
    if (directRods.length > 0) {
        mergedRods = directRods;
        saveLocalRods(mergedRods);
    } else {
        mergedRods = loadLocalRods().filter(r => (r.diameterMm || 0) !== 300);
    }

    let railStock: GuidedRailStockRecord[] = [];
    if (directRails.length > 0) {
        railStock = directRails;
        try {
            ensureDataDir();
            writeFileSync(STOCK_FILE, JSON.stringify(railStock, null, 2), 'utf8');
        } catch {}
    } else {
        railStock = loadLocalRailStock();
    }

    const savedLogs = loadLocalCutLogs().filter(l => (l.diameterMm || 0) !== 300);
    const directLogs = [...directRodLogs, ...directRailLogs];
    const prevLogs = directLogs.length > 0 ? directLogs : (savedLogs.length > 0 ? savedLogs : (memoryCache ? memoryCache.cutLogs.filter(l => (l.diameterMm || 0) !== 300) : []));
    if (directLogs.length > 0) saveLocalCutLogs(directLogs);

    if (mergedRods.length > 0) {
        const rodCutLogs = prevLogs.filter(l => !isRailLog(l));
        const railCutLogs = prevLogs.filter(l => isRailLog(l));

        memoryCache = {
            rods: mergedRods,
            railStock,
            cutLogs: prevLogs,
            rodCutLogs,
            railCutLogs,
            timestamp: Date.now()
        };

        return NextResponse.json({
            success: true,
            configured: Boolean(scriptUrl),
            mode: 'direct-google-sheet',
            spreadsheetId: TARGET_SPREADSHEET_ID,
            message: `Loaded ${mergedRods.length} Chrome Rods directly from Google Sheet`,
            rods: mergedRods,
            railStock,
            cutLogs: prevLogs,
            rodCutLogs,
            railCutLogs
        });
    }

    // 3. Fallback to cached data if available
    if (memoryCache && memoryCache.rods.length > 0) {
        return NextResponse.json({
            success: true,
            configured: Boolean(scriptUrl),
            mode: 'fallback-cache',
            cached: true,
            spreadsheetId: TARGET_SPREADSHEET_ID,
            rods: memoryCache.rods,
            railStock: memoryCache.railStock,
            cutLogs: memoryCache.cutLogs,
            rodCutLogs: memoryCache.rodCutLogs,
            railCutLogs: memoryCache.railCutLogs
        });
    }

    // 4. Fallback to Service Account if configured
    if ((process.env.GOOGLE_SPREADSHEET_ID || TARGET_SPREADSHEET_ID) && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        try {
            const doc = await getSheetsDoc();
            let rods: RodRecord[] = [];
            const sheet1 = doc.sheetsByIndex[0];
            if (sheet1) {
                const rows = await sheet1.getRows();
                rods = rows.map((r, i) => {
                    const dia = Number(r.get('Dia (mm)') || r.get('diameterMm') || r.get('Diameter (mm)')) || 0;
                    const len = Number(r.get('Length (in)') || r.get('lengthIn') || r.get('Length (In)') || r.get('lengthFt')) || 0;
                    const qty = Number(r.get('Quantity') || r.get('quantity') || r.get('Qty')) || 0;
                    const name = r.get('Rod Name') || r.get('name') || 'Chrome Rod';
                    return {
                        id: r.get('id') || `rod-${Math.round(dia)}-${len}-${i + 1}`,
                        sku: r.get('sku') || `ROD-${Math.round(dia)}MM-${len}IN-STOCK`,
                        name,
                        diameterMm: dia,
                        lengthIn: len,
                        lengthFt: len,
                        quantity: qty,
                        notes: r.get('notes') || '',
                        updatedAt: r.get('updatedAt') || new Date().toISOString()
                    };
                }).filter(r => r.diameterMm > 0 && r.quantity > 0);
            }
            if (rods.length > 0) {
                const railStock = loadLocalRailStock();
                return NextResponse.json({
                    success: true,
                    configured: true,
                    mode: 'service-account',
                    spreadsheetId: TARGET_SPREADSHEET_ID,
                    rods,
                    railStock,
                    cutLogs: [],
                    rodCutLogs: [],
                    railCutLogs: []
                });
            }
        } catch (e) {
            console.warn('Service account fallback error:', e);
        }
    }

    return NextResponse.json({
        success: false,
        configured: Boolean(scriptUrl),
        spreadsheetId: TARGET_SPREADSHEET_ID,
        message: 'Could not load data from Google Sheet. Please check your sheet sharing settings.'
    });
}

export async function POST(req: Request) {
    const scriptUrl = getScriptUrl(req);
    let payload: {
        rods?: RodRecord[];
        railStock?: GuidedRailStockRecord[];
        cutLogs?: CutLogRecord[];
        rodCutLogs?: CutLogRecord[];
        railCutLogs?: CutLogRecord[];
        scriptUrl?: string;
        spreadsheetId?: string;
    };

    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid JSON payload' }, { status: 400 });
    }

    payload.spreadsheetId = TARGET_SPREADSHEET_ID;

    // Split cut logs if combined
    if (payload.cutLogs && (!payload.rodCutLogs || !payload.railCutLogs)) {
        payload.rodCutLogs = payload.cutLogs.filter(l => !isRailLog(l));
        payload.railCutLogs = payload.cutLogs.filter(l => isRailLog(l));
    }

    // Persist chrome rods to disk (excluding test 300mm rods)
    if (payload.rods && payload.rods.length > 0) {
        payload.rods = payload.rods.filter(r => (r.diameterMm || 0) !== 300);
        saveLocalRods(payload.rods);
    }

    // Persist guided rail stock to disk
    if (!payload.railStock || payload.railStock.length === 0) {
        payload.railStock = loadLocalRailStock();
    } else {
        try {
            ensureDataDir();
            writeFileSync(STOCK_FILE, JSON.stringify(payload.railStock, null, 2), 'utf8');
        } catch {}
    }

    // Persist cut logs to disk (excluding test 300mm cut logs)
    if (payload.cutLogs && payload.cutLogs.length > 0) {
        payload.cutLogs = payload.cutLogs.filter(l => (l.diameterMm || 0) !== 300);
        saveLocalCutLogs(payload.cutLogs);
    }

    // Update in-memory cache immediately
    if (payload.rods && payload.rods.length > 0) {
        memoryCache = {
            rods: payload.rods,
            railStock: payload.railStock || [],
            cutLogs: (payload.cutLogs || []).filter(l => (l.diameterMm || 0) !== 300),
            rodCutLogs: (payload.rodCutLogs || []).filter(l => (l.diameterMm || 0) !== 300),
            railCutLogs: payload.railCutLogs || [],
            timestamp: Date.now()
        };
    }

    // 1. Google Apps Script Web App Mode (Preferred if URL provided)
    const targetScriptUrl = payload.scriptUrl || scriptUrl;
    if (targetScriptUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);

            const scriptUrlObj = new URL(targetScriptUrl);
            scriptUrlObj.searchParams.set('spreadsheetId', TARGET_SPREADSHEET_ID);

            const response = await fetch(scriptUrlObj.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                redirect: 'follow',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                return NextResponse.json({
                    success: true,
                    mode: 'apps-script',
                    syncedToGoogleSheets: true,
                    spreadsheetId: TARGET_SPREADSHEET_ID,
                    message: 'Stock successfully synced to Google Sheet (Sheet 2 Chrome Rods, Sheet 3 Rail Stock, Sheet 4 Cut Logs, Sheet 5 Rail Logs)!',
                    data
                });
            }
        } catch (error: unknown) {
            console.error('Apps Script Sync Error:', error);
        }
    }

    return NextResponse.json({
        success: true,
        mode: 'local-saved',
        syncedToGoogleSheets: false,
        spreadsheetId: TARGET_SPREADSHEET_ID,
        message: 'Saved to local workspace. To write directly to your online Google Sheet, deploy google-apps-script.js and enter the Web App URL.' 
    });
}
