import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getFirebaseInventory, saveFirebaseInventory, GuidedRailStockRecord } from '@/lib/firebase-service';
import { getUserRoleProfile } from '@/lib/roles';

export interface GuidedRailStockItem {
  id: string;
  brand?: string;             // Rail brand / category e.g. "HIWIN", "FINHY", "PMI"
  category?: string;          // Rail category / catagorie
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

const DATA_DIR = join(process.cwd(), '.data');
const STOCK_FILE = join(DATA_DIR, 'guided-rail-stock.json');

export const MODEL_SPECS: Record<string, { railWidthMm: number; railHeightMm: number; pitchMm: number }> = {
  'HGR15': { railWidthMm: 15, railHeightMm: 15,   pitchMm: 60 },
  'HGR20': { railWidthMm: 20, railHeightMm: 17.5, pitchMm: 60 },
  'HGR25': { railWidthMm: 23, railHeightMm: 22,   pitchMm: 60 },
  'HGR30': { railWidthMm: 28, railHeightMm: 26,   pitchMm: 80 },
  'HGR35': { railWidthMm: 34, railHeightMm: 29,   pitchMm: 80 },
  'HGR45': { railWidthMm: 45, railHeightMm: 38,   pitchMm: 105 },
  'HGR55': { railWidthMm: 53, railHeightMm: 44,   pitchMm: 120 },
  'HGR65': { railWidthMm: 63, railHeightMm: 53,   pitchMm: 150 },
};

const DEFAULT_STOCK: Omit<GuidedRailStockItem, 'id' | 'createdAt' | 'updatedAt'>[] = [];

let memoryStockCache: GuidedRailStockItem[] | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 20 * 1000; // 20 seconds TTL

export function setMemoryStockCache(stock: GuidedRailStockItem[], ttlOffsetMs = 60000): void {
  memoryStockCache = stock.filter(s => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);
  lastFetchTimestamp = Date.now() + ttlOffsetMs;
}

export function readLocalStockFile(): GuidedRailStockItem[] {
  if (memoryStockCache && memoryStockCache.length > 0) return memoryStockCache;
  try {
    if (existsSync(STOCK_FILE)) {
      const raw = readFileSync(STOCK_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryStockCache = parsed.filter((s: any) => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);
        return memoryStockCache;
      }
    }
  } catch (e) {
    console.warn('Error reading local rail stock file', e);
  }
  return [];
}

export function writeLocalStockFile(stock: GuidedRailStockItem[]): void {
  const validStock = stock.filter(s => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);
  memoryStockCache = validStock;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STOCK_FILE, JSON.stringify(validStock, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error writing local rail stock file', e);
  }
}

export function generateId(model: string, lengthMm: number, idx?: number): string {
  const clean = model ? model.toLowerCase() : 'rail';
  const len = Math.round(lengthMm);
  const rand = Math.random().toString(36).slice(2, 6);
  return `grs-${clean}-${len}-${idx !== undefined ? idx : rand}`;
}

// ─── Sync Rail Stock to Firebase ─────────────────────────────────────────────
export async function syncStockToFirebase(
  stock: GuidedRailStockItem[],
  cutLogs?: unknown[]
): Promise<boolean> {
  try {
    const validStock = stock.filter(s => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);
    const result = await saveFirebaseInventory({
      railStock: validStock,
      cutLogs: cutLogs as any,
    });
    return result.syncedToFirebase;
  } catch (err) {
    console.warn('[GuidedRail] Firebase sync failed:', err);
    return false;
  }
}

// Backward compatibility alias
export const syncStockToGoogleSheets = async (
  stock: GuidedRailStockItem[],
  _scriptUrl?: string,
  cutLogs?: unknown[]
) => {
  return syncStockToFirebase(stock, cutLogs);
};

// ─── Load comprehensive stock directly from Firebase Firestore ──────────────
export async function loadFullStock(forceRefresh = false): Promise<GuidedRailStockItem[]> {
  const now = Date.now();
  if (!forceRefresh && memoryStockCache && (now - lastFetchTimestamp < CACHE_TTL_MS)) {
    return memoryStockCache;
  }

  // Always fetch live directly from Firebase Firestore
  try {
    const fb = await getFirebaseInventory();
    if (Array.isArray(fb.railStock)) {
      memoryStockCache = fb.railStock;
      lastFetchTimestamp = now;
      return fb.railStock;
    }
  } catch (e) {
    console.warn('[GuidedRail] Firebase read error:', e);
  }

  return memoryStockCache || [];
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
      source: 'firebase',
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
    const cookieStore = await cookies();
    const userCookie = cookieStore.get('rodsync_user')?.value;
    const email = userCookie ? decodeURIComponent(userCookie) : '';
    const profile = getUserRoleProfile(email);

    if (!profile.canAddInventory) {
      return NextResponse.json({
        success: false,
        message: 'Permission denied: Only administrators can add or import stock inventory.'
      }, { status: 403 });
    }

    const body = await req.json();

    let stock = await loadFullStock(false);
    const now = new Date().toISOString();

    // 1. Bulk import items
    if (Array.isArray(body.items)) {
      let importedCount = 0;
      let mergedCount = 0;

      for (const item of body.items) {
        let cleanModel = String(item.modelName || '').trim().toUpperCase().replace(/\s+/g, '');
        if (/^\d+$/.test(cleanModel)) {
          cleanModel = 'HGR' + cleanModel;
        }
        const cleanBrand = String(item.brand || item.category || 'HIWIN').trim().toUpperCase();
        const len = Number(item.lengthMm);
        const qty = Number(item.quantity) || 1;
        if (!cleanModel || isNaN(len) || len <= 0 || qty < 0) continue;

        const spec = MODEL_SPECS[cleanModel] || { railWidthMm: 0, railHeightMm: 0, pitchMm: 60 };
        const numMatch = cleanModel.match(/\d+/);
        const defaultWidth = numMatch ? parseInt(numMatch[0], 10) : 20;
        const railWidthMm = Number(item.railWidthMm) || spec.railWidthMm || defaultWidth;
        const railHeightMm = Number(item.railHeightMm) || spec.railHeightMm || Math.round(railWidthMm * 0.85);
        const pitchMm = Number(item.pitchMm) || spec.pitchMm || 60;

        const existingIdx = stock.findIndex(
          s => String(s.modelName || '').toUpperCase() === cleanModel &&
               Math.abs(Number(s.lengthMm) - len) < 1.0 &&
               String(s.brand || s.category || '').toUpperCase() === cleanBrand
        );

        if (existingIdx !== -1) {
          stock[existingIdx].quantity += qty;
          stock[existingIdx].updatedAt = now;
          if (item.notes) stock[existingIdx].notes = item.notes;
          mergedCount++;
        } else {
          const autoSku = item.sku || `RAIL-${cleanModel}-${Math.round(len)}MM`;
          stock.push({
            id: item.id || generateId(cleanModel, len),
            brand: cleanBrand,
            category: cleanBrand,
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
          importedCount++;
        }
      }

      // Auto-arrange: Sort stock database by Brand, then Model, then Length ascending
      stock.sort((a, b) => {
        const brandA = String(a.brand || a.category || '').toUpperCase();
        const brandB = String(b.brand || b.category || '').toUpperCase();
        if (brandA !== brandB) return brandA.localeCompare(brandB);
        const modelA = String(a.modelName || '').toUpperCase();
        const modelB = String(b.modelName || '').toUpperCase();
        if (modelA !== modelB) return modelA.localeCompare(modelB);
        return Number(a.lengthMm || 0) - Number(b.lengthMm || 0);
      });

      // Auto-register any newly imported brands into Firebase Categories
      try {
        const inventory = await getFirebaseInventory();
        const existingCats = Array.isArray(inventory.categories?.railSubcategories) && inventory.categories.railSubcategories.length > 0
          ? [...inventory.categories.railSubcategories]
          : ['HIWIN', 'PMI', 'THK'];

        let catsUpdated = false;
        const newBrands: string[] = Array.from(new Set<string>(body.items.map((i: any) => String(i.brand || i.category || '').trim().toUpperCase()))).filter(Boolean);
        newBrands.forEach((b: string) => {
          if (!existingCats.some(c => c.toUpperCase() === b)) {
            existingCats.push(b);
            catsUpdated = true;
          }
        });

        inventory.railStock = stock;
        if (catsUpdated) {
          inventory.categories = {
            rodSubcategories: inventory.categories?.rodSubcategories || ['Chrome Rod', 'Hard Chrome Rod'],
            railSubcategories: existingCats
          };
        }
        await saveFirebaseInventory(inventory);
      } catch (catErr) {
        console.warn('Auto rail category sync error:', catErr);
      }

      writeLocalStockFile(stock);
      syncStockToFirebase(stock).catch(() => {});
      return NextResponse.json({ success: true, count: importedCount, mergedCount, stock, syncedToFirebase: true });
    }

    // 2. Single item creation
    const { modelName, lengthMm, quantity, notes, sku, brand, category } = body;
    const cleanBrand = String(category || brand || 'FINHY').trim().toUpperCase();

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

    // Check if an existing entry matches exact model, length, and brand
    const existingIdx = stock.findIndex(
      s => s.modelName === cleanModel &&
           Math.abs(Number(s.lengthMm) - len) < 0.1 &&
           (s.brand || 'FINHY').toUpperCase() === cleanBrand
    );

    let savedItem: GuidedRailStockItem;

    if (existingIdx !== -1) {
      stock[existingIdx].quantity += qty;
      stock[existingIdx].updatedAt = now;
      if (notes) stock[existingIdx].notes = notes;
      savedItem = stock[existingIdx];
    } else {
      const autoSku = sku || `RAIL-${cleanModel}-${Math.round(len)}MM`;
      savedItem = {
        id: body.id || generateId(cleanModel, len),
        brand: cleanBrand,
        category: cleanBrand,
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
      stock.unshift(savedItem);
    }

    setMemoryStockCache(stock, 60000);
    writeLocalStockFile(stock);
    await syncStockToFirebase(stock);

    return NextResponse.json({ success: true, item: savedItem, stock, syncedToFirebase: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── PUT: Update existing rail stock item ─────────────────────────────────────
export async function PUT(req: Request) {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get('rodsync_user')?.value;
    const email = userCookie ? decodeURIComponent(userCookie) : '';
    const profile = getUserRoleProfile(email);

    if (!profile.canEditInventory) {
      return NextResponse.json({
        success: false,
        message: 'Permission denied: Only administrators can edit stock inventory.'
      }, { status: 403 });
    }

    const body = await req.json();
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
    const newQty = body.quantity !== undefined ? Number(body.quantity) : existing.quantity;

    // If quantity is reduced to 0 or below, remove/delete the length from stock entirely
    if (newQty <= 0) {
      const removed = stock.splice(idx, 1)[0];
      setMemoryStockCache(stock, 60000);
      writeLocalStockFile(stock);
      await syncStockToFirebase(stock);
      return NextResponse.json({ success: true, deleted: true, item: removed, stock, syncedToFirebase: true });
    }

    const updatedModel = body.modelName !== undefined ? String(body.modelName).trim().toUpperCase() : existing.modelName;
    const spec = MODEL_SPECS[updatedModel] || { railWidthMm: existing.railWidthMm, railHeightMm: existing.railHeightMm, pitchMm: existing.pitchMm };

    const updated: GuidedRailStockItem = {
      ...existing,
      brand:        body.brand        !== undefined ? String(body.brand).trim().toUpperCase() : (existing.brand || 'FINHY'),
      modelName:    updatedModel,
      railWidthMm:  body.railWidthMm  !== undefined ? Number(body.railWidthMm)  : (existing.railWidthMm || spec.railWidthMm),
      railHeightMm: body.railHeightMm !== undefined ? Number(body.railHeightMm) : (existing.railHeightMm || spec.railHeightMm),
      pitchMm:      body.pitchMm      !== undefined ? Number(body.pitchMm)      : (existing.pitchMm || spec.pitchMm),
      lengthMm:     body.lengthMm     !== undefined ? Number(body.lengthMm)     : existing.lengthMm,
      quantity:     newQty,
      notes:        body.notes        !== undefined ? String(body.notes)        : existing.notes,
      sku:          body.sku          !== undefined ? String(body.sku)          : existing.sku,
      updatedAt:    new Date().toISOString(),
    };

    stock[idx] = updated;
    setMemoryStockCache(stock, 60000);
    writeLocalStockFile(stock);
    await syncStockToFirebase(stock);
    return NextResponse.json({ success: true, item: updated, stock, syncedToFirebase: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── DELETE: Remove a rail stock item ─────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get('rodsync_user')?.value;
    const email = userCookie ? decodeURIComponent(userCookie) : '';
    const profile = getUserRoleProfile(email);

    if (!profile.canDeleteInventory) {
      return NextResponse.json({
        success: false,
        message: 'Permission denied: Only administrators can delete stock inventory.'
      }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }

    const stock = await loadFullStock(false);
    const filtered = stock.filter(s => s.id !== id);

    if (filtered.length === stock.length) {
      return NextResponse.json({ success: false, message: 'Stock item not found' }, { status: 404 });
    }

    setMemoryStockCache(filtered, 60000);
    writeLocalStockFile(filtered);
    await syncStockToFirebase(filtered);
    return NextResponse.json({ success: true, stock: filtered, syncedToFirebase: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
