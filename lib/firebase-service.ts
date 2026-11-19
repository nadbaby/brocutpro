import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface RodRecord {
  id?: string;
  sku?: string;
  name?: string;
  category?: string; // 'Chrome Rod' | 'HoneTube' | 'Sbrc' | 'Hard Chrome Rod'
  diameterMm?: number | string;
  lengthIn?: number;
  lengthFt?: number;
  quantity?: number;
  notes?: string;
  updatedAt?: number | string;
  createdAt?: number | string;
}

export interface GuidedRailStockRecord {
  id: string;
  brand?: string;
  category?: string;
  modelName: string;
  railWidthMm: number;
  railHeightMm: number;
  pitchMm: number;
  lengthMm: number;
  quantity: number;
  sku?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuidedRailModelRecord {
  id: string;
  modelName: string;
  railWidthMm: number;
  railHeightMm: number;
  pitchMm: number;
  minCuttingLengthMm?: number;
  minEndMarginMm?: number;
  active?: boolean;
  brand?: string;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CutLogRecord {
  id?: string;
  timestamp?: number | string;
  rodName?: string;
  modelName?: string;
  brand?: string;
  isRail?: boolean;
  diameterMm?: number | string;
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

// ── Local Disk Persistence Helpers ───────────────────────────────────────────
const DATA_DIR = join(process.cwd(), '.data');
const RODS_FILE = join(DATA_DIR, 'chrome-rods.json');
const RAILS_FILE = join(DATA_DIR, 'guided-rail-stock.json');
const RAIL_MODELS_FILE = join(DATA_DIR, 'guided-rail-models.json');
const CUT_LOGS_FILE = join(DATA_DIR, 'cut-logs.json');
const CATEGORIES_FILE = join(DATA_DIR, 'categories.json');

export interface CategoryStore {
  rodSubcategories: string[];
  railSubcategories: string[];
}

const DEFAULT_CATEGORIES: CategoryStore = {
  rodSubcategories: ['Chrome Rod', 'HoneTube', 'Hard Chrome Rod'],
  railSubcategories: ['HIWIN', 'PMI', 'FINHY']
};

function ensureDataDir(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('[Storage] Failed to create .data dir', e);
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
      if (parsed && typeof parsed === 'object') return parsed as T;
    }
  } catch (err) {
    console.warn(`[Storage] Failed to read ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile(filePath: string, data: any): void {
  try {
    ensureDataDir();
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[Storage] Failed to write ${filePath}:`, err);
  }
}

// Memory Cache with initial load from local persistent storage
let memoryRods: RodRecord[] = readJsonFile<RodRecord[]>(RODS_FILE, []).filter(r => Number(r.diameterMm) !== 300);
let memoryRails: GuidedRailStockRecord[] = readJsonFile<GuidedRailStockRecord[]>(RAILS_FILE, []).filter(r => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
let memoryRailModels: GuidedRailModelRecord[] = readJsonFile<GuidedRailModelRecord[]>(RAIL_MODELS_FILE, []);
let memoryLogs: CutLogRecord[] = readJsonFile<CutLogRecord[]>(CUT_LOGS_FILE, []).filter(l => Number(l.diameterMm) !== 300);
let memoryCategories: CategoryStore = readJsonFile<CategoryStore>(CATEGORIES_FILE, DEFAULT_CATEGORIES);

export function loadLocalCategories(): CategoryStore {
  if (!memoryCategories || !Array.isArray(memoryCategories.rodSubcategories) || !Array.isArray(memoryCategories.railSubcategories)) {
    memoryCategories = readJsonFile<CategoryStore>(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  }
  // Guarantee clean non-empty string arrays
  memoryCategories.rodSubcategories = Array.from(new Set((memoryCategories.rodSubcategories || []).map(s => String(s).trim()).filter(Boolean)));
  memoryCategories.railSubcategories = Array.from(new Set((memoryCategories.railSubcategories || []).map(s => String(s).trim()).filter(Boolean)));
  if (memoryCategories.rodSubcategories.length === 0) memoryCategories.rodSubcategories = [...DEFAULT_CATEGORIES.rodSubcategories];
  if (memoryCategories.railSubcategories.length === 0) memoryCategories.railSubcategories = [...DEFAULT_CATEGORIES.railSubcategories];
  return memoryCategories;
}

export function saveLocalCategories(cats: CategoryStore): CategoryStore {
  const clean: CategoryStore = {
    rodSubcategories: Array.from(new Set((cats.rodSubcategories || []).map(s => String(s).trim()).filter(Boolean))),
    railSubcategories: Array.from(new Set((cats.railSubcategories || []).map(s => String(s).trim()).filter(Boolean))),
  };
  memoryCategories = clean;
  writeJsonFile(CATEGORIES_FILE, memoryCategories);
  return memoryCategories;
}

export function loadLocalRods(): RodRecord[] {
  if (memoryRods.length === 0) {
    memoryRods = readJsonFile<RodRecord[]>(RODS_FILE, []).filter(r => Number(r.diameterMm) !== 300);
  }
  return memoryRods;
}

export function saveLocalRods(rods: RodRecord[]) {
  memoryRods = rods.filter(r => Number(r.diameterMm) !== 300);
  writeJsonFile(RODS_FILE, memoryRods);
}

export function loadLocalRails(): GuidedRailStockRecord[] {
  if (memoryRails.length === 0) {
    memoryRails = readJsonFile<GuidedRailStockRecord[]>(RAILS_FILE, []).filter(r => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
  }
  return memoryRails;
}

export function saveLocalRails(rails: GuidedRailStockRecord[]) {
  memoryRails = rails.filter(r => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
  writeJsonFile(RAILS_FILE, memoryRails);
}

export function loadLocalRailModels(): GuidedRailModelRecord[] {
  if (memoryRailModels.length === 0) {
    memoryRailModels = readJsonFile<GuidedRailModelRecord[]>(RAIL_MODELS_FILE, []);
  }
  return memoryRailModels;
}

export function saveLocalRailModels(models: GuidedRailModelRecord[]) {
  memoryRailModels = models;
  writeJsonFile(RAIL_MODELS_FILE, memoryRailModels);
}

export function loadLocalLogs(): CutLogRecord[] {
  if (memoryLogs.length === 0) {
    memoryLogs = readJsonFile<CutLogRecord[]>(CUT_LOGS_FILE, []).filter(l => Number(l.diameterMm) !== 300);
  }
  return memoryLogs;
}

export function saveLocalLogs(logs: CutLogRecord[]) {
  memoryLogs = logs.filter(l => Number(l.diameterMm) !== 300);
  writeJsonFile(CUT_LOGS_FILE, memoryLogs);
}

/**
 * Fetch all inventory and logs directly from Firebase Firestore with robust local fallback.
 */
export async function getFirebaseInventory(): Promise<{
  rods: RodRecord[];
  railStock: GuidedRailStockRecord[];
  railModels: GuidedRailModelRecord[];
  cutLogs: CutLogRecord[];
  categories: CategoryStore;
  fromFirebase: boolean;
}> {
  // Always ensure fresh disk-backed data is loaded
  memoryRods = readJsonFile<RodRecord[]>(RODS_FILE, []).filter(r => Number(r.diameterMm) !== 300);
  memoryRails = readJsonFile<GuidedRailStockRecord[]>(RAILS_FILE, []).filter(r => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
  memoryRailModels = readJsonFile<GuidedRailModelRecord[]>(RAIL_MODELS_FILE, []);
  memoryLogs = readJsonFile<CutLogRecord[]>(CUT_LOGS_FILE, []).filter(l => Number(l.diameterMm) !== 300);
  loadLocalCategories();

  let rods: RodRecord[] = memoryRods;
  let railStock: GuidedRailStockRecord[] = memoryRails;
  let railModels: GuidedRailModelRecord[] = memoryRailModels;
  let cutLogs: CutLogRecord[] = memoryLogs;
  let categories: CategoryStore = memoryCategories;
  let fromFirebase = false;

  try {
    const mainDocRef = doc(db, 'inventory', 'main');
    const snap = await getDoc(mainDocRef);

    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.rods) && data.rods.length > 0) {
        rods = data.rods.filter((r: any) => Number(r.diameterMm) !== 300);
        memoryRods = rods;
        writeJsonFile(RODS_FILE, memoryRods);
        fromFirebase = true;
      }
      if (Array.isArray(data.railStock) && data.railStock.length > 0) {
        railStock = data.railStock.filter((r: any) => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
        memoryRails = railStock;
        writeJsonFile(RAILS_FILE, memoryRails);
        fromFirebase = true;
      }
      if (Array.isArray(data.railModels) && data.railModels.length > 0) {
        railModels = data.railModels;
        memoryRailModels = railModels;
        writeJsonFile(RAIL_MODELS_FILE, memoryRailModels);
        fromFirebase = true;
      }
      if (Array.isArray(data.cutLogs)) {
        cutLogs = data.cutLogs.filter((l: any) => Number(l.diameterMm) !== 300);
        memoryLogs = cutLogs;
        writeJsonFile(CUT_LOGS_FILE, memoryLogs);
        fromFirebase = true;
      }
      if (data.categories && (Array.isArray(data.categories.rodSubcategories) || Array.isArray(data.categories.railSubcategories))) {
        categories = saveLocalCategories({
          rodSubcategories: Array.isArray(data.categories.rodSubcategories) ? data.categories.rodSubcategories : memoryCategories.rodSubcategories,
          railSubcategories: Array.isArray(data.categories.railSubcategories) ? data.categories.railSubcategories : memoryCategories.railSubcategories,
        });
        fromFirebase = true;
      } else {
        categories = loadLocalCategories();
        try {
          await setDoc(mainDocRef, { categories }, { merge: true });
        } catch (e) {
          console.warn('[Firebase] Warning writing default categories to Firestore:', e);
        }
      }
    } else {
      console.log('[Firebase] Initializing inventory document in Firebase Firestore with local inventory...');
      await setDoc(mainDocRef, {
        rods: memoryRods,
        railStock: memoryRails,
        railModels: memoryRailModels,
        cutLogs: memoryLogs,
        categories: memoryCategories,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      fromFirebase = true;
    }
  } catch (err) {
    console.warn('[Firebase] Warning reading from Firestore (using local storage fallback):', err);
  }

  // Also synthesize/merge any models present in railStock into railModels
  const existingModelNames = new Set(railModels.map(m => m.modelName.toUpperCase()));
  const synthesizedModels: GuidedRailModelRecord[] = [];
  railStock.forEach(s => {
    const mName = String(s.modelName || '').trim().toUpperCase();
    if (mName && !existingModelNames.has(mName)) {
      existingModelNames.add(mName);
      synthesizedModels.push({
        id: mName,
        modelName: mName,
        railWidthMm: Number(s.railWidthMm) || 0,
        railHeightMm: Number(s.railHeightMm) || 0,
        pitchMm: Number(s.pitchMm) || 60,
        minCuttingLengthMm: Number(s.pitchMm) || 60,
        minEndMarginMm: 10,
        active: true,
        brand: s.brand || s.category || '',
        category: s.category || s.brand || '',
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      });
    }
  });
  if (synthesizedModels.length > 0) {
    railModels = [...railModels, ...synthesizedModels];
    memoryRailModels = railModels;
    writeJsonFile(RAIL_MODELS_FILE, memoryRailModels);
  }

  return { rods, railStock, railModels, cutLogs, categories, fromFirebase };
}

/**
 * Save inventory updates directly to Firebase Firestore with local persistent backup.
 */
export async function saveFirebaseInventory(data: {
  rods?: RodRecord[];
  railStock?: GuidedRailStockRecord[];
  railModels?: GuidedRailModelRecord[];
  cutLogs?: CutLogRecord[];
  categories?: CategoryStore;
}): Promise<{ success: boolean; syncedToFirebase: boolean }> {
  let syncedToFirebase = false;

  if (data.rods && Array.isArray(data.rods)) {
    memoryRods = data.rods.filter(r => Number(r.diameterMm) !== 300).map(r => ({
      ...r,
      category: (r.category || r.name || '').trim(),
      name: (r.name || r.category || '').trim()
    }));
    writeJsonFile(RODS_FILE, memoryRods);
  }
  if (data.railStock && Array.isArray(data.railStock)) {
    memoryRails = data.railStock.filter(r => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
    writeJsonFile(RAILS_FILE, memoryRails);
  }
  if (data.railModels && Array.isArray(data.railModels)) {
    memoryRailModels = data.railModels;
    writeJsonFile(RAIL_MODELS_FILE, memoryRailModels);
  }
  if (data.cutLogs && Array.isArray(data.cutLogs)) {
    memoryLogs = data.cutLogs.filter(l => Number(l.diameterMm) !== 300);
    writeJsonFile(CUT_LOGS_FILE, memoryLogs);
  }
  if (data.categories) {
    saveLocalCategories(data.categories);
  }

  try {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.rods !== undefined) updatePayload.rods = memoryRods;
    if (data.railStock !== undefined) updatePayload.railStock = memoryRails;
    if (data.railModels !== undefined) updatePayload.railModels = memoryRailModels;
    if (data.cutLogs !== undefined) updatePayload.cutLogs = memoryLogs;
    if (data.categories !== undefined) updatePayload.categories = memoryCategories;

    const mainDocRef = doc(db, 'inventory', 'main');
    await setDoc(mainDocRef, updatePayload, { merge: true });
    syncedToFirebase = true;
  } catch (err) {
    console.error('[Firebase] Error writing to Firestore:', err);
  }

  return { success: true, syncedToFirebase };
}

export async function getFirebaseCategories(): Promise<CategoryStore> {
  const inv = await getFirebaseInventory();
  return inv.categories;
}

export async function saveFirebaseCategories(categories: CategoryStore): Promise<{ success: boolean; syncedToFirebase: boolean }> {
  return await saveFirebaseInventory({ categories });
}
