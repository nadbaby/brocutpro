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
  lengthMm: number;           // Stock bar length in mm (e.g. 1000, 2000, 3000, 4000)
  quantity: number;           // Quantity in stock
  sku?: string;               // e.g. "RAIL-HGR20-3000MM"
  notes?: string;             // Storage rack / batch / notes
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = join(process.cwd(), '.data');
const STOCK_FILE = join(DATA_DIR, 'guided-rail-stock.json');

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readStock(): GuidedRailStockItem[] {
  ensureDir();
  if (!existsSync(STOCK_FILE)) return [];
  try {
    return JSON.parse(readFileSync(STOCK_FILE, 'utf8')) as GuidedRailStockItem[];
  } catch {
    return [];
  }
}

function writeStock(stock: GuidedRailStockItem[]): void {
  ensureDir();
  writeFileSync(STOCK_FILE, JSON.stringify(stock, null, 2), 'utf8');
}

function generateId(): string {
  return 'grs-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const DEFAULT_STOCK: Omit<GuidedRailStockItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { modelName: 'HGR15', railWidthMm: 15, railHeightMm: 15,   pitchMm: 60,  lengthMm: 2000, quantity: 10, sku: 'RAIL-HGR15-2000MM', notes: 'Rack R-1 • Standard Industrial' },
  { modelName: 'HGR20', railWidthMm: 20, railHeightMm: 17.5, pitchMm: 60,  lengthMm: 3000, quantity: 15, sku: 'RAIL-HGR20-3000MM', notes: 'Rack R-2 • Heavy Duty Assembly' },
  { modelName: 'HGR25', railWidthMm: 23, railHeightMm: 22,   pitchMm: 60,  lengthMm: 3000, quantity: 8,  sku: 'RAIL-HGR25-3000MM', notes: 'Rack R-3 • Precision Guide' },
  { modelName: 'HGR30', railWidthMm: 28, railHeightMm: 26,   pitchMm: 80,  lengthMm: 4000, quantity: 5,  sku: 'RAIL-HGR30-4000MM', notes: 'Rack R-4 • High Rigidity' },
];

function seedIfEmpty(): GuidedRailStockItem[] {
  let stock = readStock();
  if (stock.length === 0) {
    const now = new Date().toISOString();
    stock = DEFAULT_STOCK.map(s => ({
      ...s,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }));
    writeStock(stock);
  }
  return stock;
}

// ─── GET: List all guided rail stock ──────────────────────────────────────────
export async function GET() {
  try {
    const stock = seedIfEmpty();
    const sorted = [...stock].sort((a, b) => {
      const cmp = a.modelName.localeCompare(b.modelName);
      return cmp !== 0 ? cmp : b.lengthMm - a.lengthMm;
    });
    return NextResponse.json({ success: true, stock: sorted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── POST: Add new guided rail stock entry (or bulk import) ───────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Bulk import items
    if (Array.isArray(body.items)) {
      const stock = readStock();
      const now = new Date().toISOString();
      let importedCount = 0;

      for (const item of body.items) {
        const cleanModel = String(item.modelName || '').trim().toUpperCase();
        const len = Number(item.lengthMm);
        const qty = Number(item.quantity) || 1;
        if (!cleanModel || isNaN(len) || len <= 0 || qty < 0) continue;

        const existingIdx = stock.findIndex(
          s => s.modelName === cleanModel && Number(s.lengthMm) === len
        );

        if (existingIdx !== -1) {
          stock[existingIdx].quantity += qty;
          stock[existingIdx].updatedAt = now;
          if (item.notes) stock[existingIdx].notes = item.notes;
        } else {
          const autoSku = item.sku || `RAIL-${cleanModel}-${Math.round(len)}MM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          stock.push({
            id: generateId(),
            modelName: cleanModel,
            railWidthMm: Number(item.railWidthMm) || 0,
            railHeightMm: Number(item.railHeightMm) || 0,
            pitchMm: Number(item.pitchMm) || 60,
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

      writeStock(stock);
      return NextResponse.json({ success: true, count: importedCount, stock });
    }

    // 2. Single item creation
    const { modelName, railWidthMm, railHeightMm, pitchMm, lengthMm, quantity, notes, sku } = body;

    if (!modelName || !lengthMm || quantity === undefined) {
      return NextResponse.json({ success: false, message: 'modelName, lengthMm, and quantity are required' }, { status: 400 });
    }

    const cleanModel = String(modelName).trim().toUpperCase();
    const len = Number(lengthMm);
    const qty = Number(quantity);

    if (len <= 0 || qty < 0) {
      return NextResponse.json({ success: false, message: 'Length must be > 0 and quantity cannot be negative' }, { status: 400 });
    }

    const stock = readStock();
    const now = new Date().toISOString();

    // Check if an existing entry matches exact model and length
    const existingIdx = stock.findIndex(
      s => s.modelName === cleanModel && Number(s.lengthMm) === len
    );

    if (existingIdx !== -1) {
      // Merge by incrementing quantity
      stock[existingIdx].quantity += qty;
      stock[existingIdx].updatedAt = now;
      if (notes) stock[existingIdx].notes = notes;
      writeStock(stock);
      return NextResponse.json({ success: true, merged: true, item: stock[existingIdx] });
    }

    const autoSku = sku || `RAIL-${cleanModel}-${Math.round(len)}MM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const newItem: GuidedRailStockItem = {
      id: generateId(),
      modelName: cleanModel,
      railWidthMm: Number(railWidthMm) || 0,
      railHeightMm: Number(railHeightMm) || 0,
      pitchMm: Number(pitchMm) || 60,
      lengthMm: len,
      quantity: qty,
      sku: autoSku,
      notes: notes || '',
      createdAt: now,
      updatedAt: now,
    };

    stock.push(newItem);
    writeStock(stock);
    return NextResponse.json({ success: true, item: newItem });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── PUT: Update existing rail stock item ─────────────────────────────────────
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }

    const stock = readStock();
    const idx = stock.findIndex(s => s.id === id);

    if (idx === -1) {
      return NextResponse.json({ success: false, message: 'Stock item not found' }, { status: 404 });
    }

    const existing = stock[idx];
    const updated: GuidedRailStockItem = {
      ...existing,
      modelName:    body.modelName    !== undefined ? String(body.modelName).trim().toUpperCase() : existing.modelName,
      railWidthMm:  body.railWidthMm  !== undefined ? Number(body.railWidthMm)  : existing.railWidthMm,
      railHeightMm: body.railHeightMm !== undefined ? Number(body.railHeightMm) : existing.railHeightMm,
      pitchMm:      body.pitchMm      !== undefined ? Number(body.pitchMm)      : existing.pitchMm,
      lengthMm:     body.lengthMm     !== undefined ? Number(body.lengthMm)     : existing.lengthMm,
      quantity:     body.quantity     !== undefined ? Math.max(0, Number(body.quantity)) : existing.quantity,
      notes:        body.notes        !== undefined ? String(body.notes)        : existing.notes,
      sku:          body.sku          !== undefined ? String(body.sku)          : existing.sku,
      updatedAt:    new Date().toISOString(),
    };

    stock[idx] = updated;
    writeStock(stock);
    return NextResponse.json({ success: true, item: updated });
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

    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }

    const stock = readStock();
    const filtered = stock.filter(s => s.id !== id);

    if (filtered.length === stock.length) {
      return NextResponse.json({ success: false, message: 'Stock item not found' }, { status: 404 });
    }

    writeStock(filtered);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

