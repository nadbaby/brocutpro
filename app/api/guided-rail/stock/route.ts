import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface GuidedRailStockItem {
  id: string;
  modelName: string;          // e.g. "HGR15", "HGR20"
  modelId?: string;           // reference to GuidedRailModel id
  railWidthMm: number;        // Wr in mm
  railHeightMm: number;       // Hr in mm
  pitchMm: number;            // Hole spacing P in mm
  lengthMm: number;           // Stock bar length in mm
  quantity: number;           // Quantity in stock
  sku?: string;               // e.g. "RAIL-HGR20-3000MM"
  notes?: string;             // Storage rack / batch / notes
  createdAt?: string;
  updatedAt?: string;
}

const TARGET_SPREADSHEET_ID = "1_rDLZvfHCD4Tzmzk7XHBqK2qHtxOjSP32wOLUOABkMQ";
const DATA_DIR = join(process.cwd(), '.data');
const STOCK_FILE = join(DATA_DIR, 'guided-rail-stock.json');

const MODEL_SPECS: Record<string, { railWidthMm: number; railHeightMm: number; pitchMm: number }> = {
  'HGR15': { railWidthMm: 15, railHeightMm: 15,   pitchMm: 60 },
  'HGR20': { railWidthMm: 20, railHeightMm: 17.5, pitchMm: 60 },
  'HGR25': { railWidthMm: 23, railHeightMm: 22,   pitchMm: 60 },
  'HGR30': { railWidthMm: 28, railHeightMm: 26,   pitchMm: 80 },
  'HGR35': { railWidthMm: 34, railHeightMm: 29,   pitchMm: 80 },
  'HGR45': { railWidthMm: 45, railHeightMm: 38,   pitchMm: 105 },
  'HGR55': { railWidthMm: 53, railHeightMm: 44,   pitchMm: 120 },
  'HGR65': { railWidthMm: 63, railHeightMm: 53,   pitchMm: 150 },
};

const DEFAULT_STOCK: Omit<GuidedRailStockItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { modelName: 'HGR15', railWidthMm: 15, railHeightMm: 15,   pitchMm: 60,  lengthMm: 2000, quantity: 10, sku: 'RAIL-HGR15-2000MM', notes: 'Rack R-1 • Standard Industrial' },
  { modelName: 'HGR20', railWidthMm: 20, railHeightMm: 17.5, pitchMm: 60,  lengthMm: 3000, quantity: 15, sku: 'RAIL-HGR20-3000MM', notes: 'Rack R-2 • Heavy Duty Assembly' },
  { modelName: 'HGR25', railWidthMm: 23, railHeightMm: 22,   pitchMm: 60,  lengthMm: 3000, quantity: 8,  sku: 'RAIL-HGR25-3000MM', notes: 'Rack R-3 • Precision Guide' },
  { modelName: 'HGR30', railWidthMm: 28, railHeightMm: 26,   pitchMm: 80,  lengthMm: 4000, quantity: 5,  sku: 'RAIL-HGR30-4000MM', notes: 'Rack R-4 • High Rigidity' },
];

let memoryStockCache: GuidedRailStockItem[] | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 20 * 1000; // 20 seconds TTL

function ensureDir(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Read-only filesystem on Vercel/lambda - safe ignore
  }
}

function readLocalStockFile(): GuidedRailStockItem[] {
  try {
    ensureDir();
    if (!existsSync(STOCK_FILE)) return [];
    const raw = readFileSync(STOCK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalStockFile(stock: GuidedRailStockItem[]): void {
  memoryStockCache = stock;
  try {
    ensureDir();
    writeFileSync(STOCK_FILE, JSON.stringify(stock, null, 2), 'utf8');
  } catch (e) {
    console.warn('[GuidedRail] Disk write skipped (safe in serverless/read-only environment):', e);
  }
}

function generateId(model: string, lengthMm: number, idx?: number): string {
  const clean = model ? model.toLowerCase() : 'rail';
  const len = Math.round(lengthMm);
  const rand = Math.random().toString(36).slice(2, 6);
  return `grs-${clean}-${len}-${idx !== undefined ? idx : rand}`;
}

// ─── Direct Google Sheet Fetcher (Sheet: Guided rail inventory) ───────────────
async function fetchDirectSheetRailStock(): Promise<GuidedRailStockItem[]> {
  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Guided%20rail%20inventory`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(gvizUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const raw = await res.text();
    const match = raw.match(/setResponse\(([\s\S]*)\);/);
    if (!match || !match[1]) return [];

    const json = JSON.parse(match[1]);
    const rows = json.table?.rows || [];
    if (!rows || rows.length === 0) return [];

    const rails: GuidedRailStockItem[] = [];
    rows.forEach((row: any, i: number) => {
      const cells = row.c || [];
      const getVal = (idx: number, def: any = null) => {
        if (idx >= 0 && idx < cells.length && cells[idx] && cells[idx].v !== null && cells[idx].v !== undefined) {
          return cells[idx].v;
        }
        return def;
      };

      const rawModel = String(getVal(1, '')).trim();
      const modelName = rawModel.toUpperCase();
      const lengthMm = parseFloat(getVal(6, 0)) || 0;
      const quantity = parseInt(getVal(7, 0), 10) || 0;

      // Skip invalid empty lines
      if (!modelName && lengthMm <= 0) return;

      const spec = MODEL_SPECS[modelName] || { railWidthMm: 0, railHeightMm: 0, pitchMm: 60 };
      const railWidthMm = parseFloat(getVal(3, 0)) || spec.railWidthMm;
      const railHeightMm = parseFloat(getVal(4, 0)) || spec.railHeightMm;
      const pitchMm = parseFloat(getVal(5, 0)) || spec.pitchMm;
      const sku = String(getVal(2, '')).trim() || `RAIL-${modelName}-${Math.round(lengthMm)}MM`;
      const id = (getVal(0) ? String(getVal(0)).trim() : '') || generateId(modelName, lengthMm, i + 1);
      const notes = String(getVal(8, '')).trim();
      const updatedAt = getVal(9) ? String(getVal(9)) : new Date().toISOString();

      rails.push({
        id,
        modelName: modelName || `Rail-${railWidthMm}`,
        sku,
        railWidthMm,
        railHeightMm,
        pitchMm,
        lengthMm,
        quantity,
        notes,
        createdAt: updatedAt,
        updatedAt,
      });
    });

    return rails;
  } catch (err) {
    console.warn('[GuidedRail] Direct sheet fetch error:', err);
    return [];
  }
}

// ─── Sync Rail Stock to Google Apps Script Web App ────────────────────────────
async function syncStockToGoogleSheets(stock: GuidedRailStockItem[], scriptUrl?: string): Promise<boolean> {
  const targetUrl = scriptUrl || process.env.GOOGLE_SCRIPT_URL || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
  if (!targetUrl || !targetUrl.trim()) return false;

  try {
    const urlObj = new URL(targetUrl.trim());
    urlObj.searchParams.set('spreadsheetId', TARGET_SPREADSHEET_ID);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(urlObj.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: TARGET_SPREADSHEET_ID,
        railStock: stock,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return response.ok;
  } catch (err) {
    console.warn('[GuidedRail] Apps Script sync failed:', err);
    return false;
  }
}

// ─── Load comprehensive stock with fallback chain ─────────────────────────────
async function loadFullStock(forceRefresh = false): Promise<GuidedRailStockItem[]> {
  const now = Date.now();
  if (!forceRefresh && memoryStockCache && (now - lastFetchTimestamp < CACHE_TTL_MS)) {
    return memoryStockCache;
  }

  // 1. Fetch live from Google Sheets
  const sheetStock = await fetchDirectSheetRailStock();
  if (sheetStock.length > 0) {
    memoryStockCache = sheetStock;
    lastFetchTimestamp = now;
    writeLocalStockFile(sheetStock);
    return sheetStock;
  }

  // 2. Read local fallback file
  const localStock = readLocalStockFile();
  if (localStock.length > 0) {
    memoryStockCache = localStock;
    lastFetchTimestamp = now;
    return localStock;
  }

  // 3. Fallback to default stock seed
  const defaultItems = DEFAULT_STOCK.map((s, idx) => ({
    ...s,
    id: generateId(s.modelName, s.lengthMm, idx + 1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  memoryStockCache = defaultItems;
  lastFetchTimestamp = now;
  writeLocalStockFile(defaultItems);
  return defaultItems;
}

// ─── GET: List all guided rail stock ──────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const stock = await loadFullStock(forceRefresh);

    const sorted = [...stock].sort((a, b) => {
      const cmp = a.modelName.localeCompare(b.modelName);
      return cmp !== 0 ? cmp : b.lengthMm - a.lengthMm;
    });

    return NextResponse.json({
      success: true,
      count: sorted.length,
      source: memoryStockCache ? 'live-sheets/cache' : 'default',
      stock: sorted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── POST: Add new guided rail stock entry (or bulk import) ───────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const scriptUrl = req.headers.get('x-google-script-url') || body.scriptUrl || '';

    let stock = await loadFullStock(false);
    const now = new Date().toISOString();

    // 1. Bulk import items
    if (Array.isArray(body.items)) {
      let importedCount = 0;

      for (const item of body.items) {
        const cleanModel = String(item.modelName || '').trim().toUpperCase();
        const len = Number(item.lengthMm);
        const qty = Number(item.quantity) || 1;
        if (!cleanModel || isNaN(len) || len <= 0 || qty < 0) continue;

        const spec = MODEL_SPECS[cleanModel] || { railWidthMm: 0, railHeightMm: 0, pitchMm: 60 };
        const railWidthMm = Number(item.railWidthMm) || spec.railWidthMm;
        const railHeightMm = Number(item.railHeightMm) || spec.railHeightMm;
        const pitchMm = Number(item.pitchMm) || spec.pitchMm;

        const existingIdx = stock.findIndex(
          s => s.modelName === cleanModel && Math.abs(Number(s.lengthMm) - len) < 0.1
        );

        if (existingIdx !== -1) {
          stock[existingIdx].quantity += qty;
          stock[existingIdx].updatedAt = now;
          if (item.notes) stock[existingIdx].notes = item.notes;
        } else {
          const autoSku = item.sku || `RAIL-${cleanModel}-${Math.round(len)}MM`;
          stock.push({
            id: item.id || generateId(cleanModel, len),
            modelName: cleanModel,
            railWidthMm,
            railHeightMm,
            pitchMm,
            lengthMm: len,
            quantity: qty,
            sku: autoSku,
            notes: item.notes || '',
            createdAt: now,
            updatedAt: now,
          });
        }
        importedCount++;
      }

      writeLocalStockFile(stock);
      syncStockToGoogleSheets(stock, scriptUrl).catch(() => {});
      return NextResponse.json({ success: true, count: importedCount, stock });
    }

    // 2. Single item creation
    const { modelName, lengthMm, quantity, notes, sku } = body;

    if (!modelName || lengthMm === undefined || quantity === undefined) {
      return NextResponse.json({ success: false, message: 'modelName, lengthMm, and quantity are required' }, { status: 400 });
    }

    const cleanModel = String(modelName).trim().toUpperCase();
    const len = Number(lengthMm);
    const qty = Number(quantity);

    if (len <= 0 || qty < 0) {
      return NextResponse.json({ success: false, message: 'Length must be > 0 and quantity cannot be negative' }, { status: 400 });
    }

    const spec = MODEL_SPECS[cleanModel] || { railWidthMm: 0, railHeightMm: 0, pitchMm: 60 };
    const railWidthMm = Number(body.railWidthMm) || spec.railWidthMm;
    const railHeightMm = Number(body.railHeightMm) || spec.railHeightMm;
    const pitchMm = Number(body.pitchMm) || spec.pitchMm;

    // Check if an existing entry matches exact model and length
    const existingIdx = stock.findIndex(
      s => s.modelName === cleanModel && Math.abs(Number(s.lengthMm) - len) < 0.1
    );

    if (existingIdx !== -1) {
      // Merge by incrementing quantity
      stock[existingIdx].quantity += qty;
      stock[existingIdx].updatedAt = now;
      if (notes) stock[existingIdx].notes = notes;
      writeLocalStockFile(stock);
      syncStockToGoogleSheets(stock, scriptUrl).catch(() => {});
      return NextResponse.json({ success: true, merged: true, item: stock[existingIdx], stock });
    }

    const autoSku = sku || `RAIL-${cleanModel}-${Math.round(len)}MM`;

    const newItem: GuidedRailStockItem = {
      id: generateId(cleanModel, len),
      modelName: cleanModel,
      railWidthMm,
      railHeightMm,
      pitchMm,
      lengthMm: len,
      quantity: qty,
      sku: autoSku,
      notes: notes || '',
      createdAt: now,
      updatedAt: now,
    };

    stock.unshift(newItem);
    writeLocalStockFile(stock);
    syncStockToGoogleSheets(stock, scriptUrl).catch(() => {});
    return NextResponse.json({ success: true, item: newItem, stock });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── PUT: Update existing rail stock item ─────────────────────────────────────
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const scriptUrl = req.headers.get('x-google-script-url') || body.scriptUrl || '';
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }

    const stock = await loadFullStock(false);
    const idx = stock.findIndex(s => s.id === id);

    if (idx === -1) {
      return NextResponse.json({ success: false, message: 'Stock item not found' }, { status: 404 });
    }

    const existing = stock[idx];
    const updatedModel = body.modelName !== undefined ? String(body.modelName).trim().toUpperCase() : existing.modelName;
    const spec = MODEL_SPECS[updatedModel] || { railWidthMm: existing.railWidthMm, railHeightMm: existing.railHeightMm, pitchMm: existing.pitchMm };

    const updated: GuidedRailStockItem = {
      ...existing,
      modelName:    updatedModel,
      railWidthMm:  body.railWidthMm  !== undefined ? Number(body.railWidthMm)  : (existing.railWidthMm || spec.railWidthMm),
      railHeightMm: body.railHeightMm !== undefined ? Number(body.railHeightMm) : (existing.railHeightMm || spec.railHeightMm),
      pitchMm:      body.pitchMm      !== undefined ? Number(body.pitchMm)      : (existing.pitchMm || spec.pitchMm),
      lengthMm:     body.lengthMm     !== undefined ? Number(body.lengthMm)     : existing.lengthMm,
      quantity:     body.quantity     !== undefined ? Math.max(0, Number(body.quantity)) : existing.quantity,
      notes:        body.notes        !== undefined ? String(body.notes)        : existing.notes,
      sku:          body.sku          !== undefined ? String(body.sku)          : existing.sku,
      updatedAt:    new Date().toISOString(),
    };

    stock[idx] = updated;
    writeLocalStockFile(stock);
    syncStockToGoogleSheets(stock, scriptUrl).catch(() => {});
    return NextResponse.json({ success: true, item: updated, stock });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── DELETE: Remove a rail stock item ─────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const scriptUrl = req.headers.get('x-google-script-url') || '';

    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }

    const stock = await loadFullStock(false);
    const filtered = stock.filter(s => s.id !== id);

    if (filtered.length === stock.length) {
      return NextResponse.json({ success: false, message: 'Stock item not found' }, { status: 404 });
    }

    writeLocalStockFile(filtered);
    syncStockToGoogleSheets(filtered, scriptUrl).catch(() => {});
    return NextResponse.json({ success: true, stock: filtered });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
