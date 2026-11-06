import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface GuidedRailModel {
  id: string;
  modelName: string;        // e.g. "HGR15"
  railWidthMm: number;      // Wr in mm
  railHeightMm: number;     // Hr in mm
  pitchMm: number;          // Hole spacing P in mm
  minCuttingLengthMm: number; // defaults to pitchMm if not overridden
  minEndMarginMm?: number;  // minimum recommended end margin in mm (default 10)
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── FILE-BASED STORAGE ───────────────────────────────────────────────────────
// Stored in .data/guided-rail-models.json (gitignored-safe, survives dev restarts)

const DATA_DIR  = join(process.cwd(), '.data');
const DATA_FILE = join(DATA_DIR, 'guided-rail-models.json');

function ensureDir(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Read-only filesystem on serverless/Vercel
  }
}

function readModels(): GuidedRailModel[] {
  ensureDir();
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as GuidedRailModel[];
  } catch {
    return [];
  }
}

function writeModels(models: GuidedRailModel[]): void {
  try {
    ensureDir();
    writeFileSync(DATA_FILE, JSON.stringify(models, null, 2), 'utf8');
  } catch (e) {
    console.warn('[GuidedRail] Disk write skipped for models (safe on serverless/read-only):', e);
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── DEFAULT MASTER DATA ───────────────────────────────────────────────────────

const DEFAULT_RAIL_MODELS: Omit<GuidedRailModel, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { modelName: 'HGR15', railWidthMm: 15,   railHeightMm: 15,   pitchMm: 60,  minCuttingLengthMm: 60,  minEndMarginMm: 10, active: true },
  { modelName: 'HGR20', railWidthMm: 20,   railHeightMm: 17.5, pitchMm: 60,  minCuttingLengthMm: 60,  minEndMarginMm: 10, active: true },
  { modelName: 'HGR25', railWidthMm: 23,   railHeightMm: 22,   pitchMm: 60,  minCuttingLengthMm: 60,  minEndMarginMm: 10, active: true },
  { modelName: 'HGR30', railWidthMm: 28,   railHeightMm: 26,   pitchMm: 80,  minCuttingLengthMm: 80,  minEndMarginMm: 12, active: true },
  { modelName: 'HGR35', railWidthMm: 34,   railHeightMm: 29,   pitchMm: 80,  minCuttingLengthMm: 80,  minEndMarginMm: 12, active: true },
  { modelName: 'HGR45', railWidthMm: 45,   railHeightMm: 38,   pitchMm: 105, minCuttingLengthMm: 105, minEndMarginMm: 16, active: true },
  { modelName: 'HGR55', railWidthMm: 53,   railHeightMm: 44,   pitchMm: 120, minCuttingLengthMm: 120, minEndMarginMm: 18, active: true },
  { modelName: 'HGR65', railWidthMm: 63,   railHeightMm: 53,   pitchMm: 150, minCuttingLengthMm: 150, minEndMarginMm: 20, active: true },
];

function seedIfEmpty(): GuidedRailModel[] {
  let models = readModels();
  if (models.length === 0) {
    const now = new Date().toISOString();
    models = DEFAULT_RAIL_MODELS.map(m => ({
      ...m,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }));
    writeModels(models);
  }
  return models;
}

// ─── CUTTING VALIDATION LOGIC (server-side) ───────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  status: 'valid' | 'invalid' | 'warning';
  message: string;
  recommendedMinMm: number;
  recommendedLengthMm: number;
  requestedLengthMm: number;
  pitchMm: number;
  holesCount: number;
  pitchSpans: number;
  endMarginMm: number;
  minEndMarginMm: number;
}

function validateCuttingLength(model: GuidedRailModel, requestedLengthMm: number): ValidationResult {
  const pitch = model.pitchMm;
  const minLength = model.minCuttingLengthMm ?? pitch;
  const minEndMargin = model.minEndMarginMm ?? Math.round(pitch / 6);

  // 1. If requested length is smaller than minimum cutting length (pitch)
  if (requestedLengthMm < minLength - 2.0) {
    const recommended = Math.max(minLength, pitch);
    return {
      valid: false,
      status: 'invalid',
      message: `${requestedLengthMm} mm is smaller than the minimum cutting length of ${minLength} mm for ${model.modelName}. Cutting is only possible in multiples of its ${pitch} mm hole spacing. The minimum recommended cutting length is ${recommended} mm.`,
      recommendedMinMm: recommended,
      recommendedLengthMm: recommended,
      requestedLengthMm,
      pitchMm: pitch,
      holesCount: 0,
      pitchSpans: 0,
      endMarginMm: 0,
      minEndMarginMm: minEndMargin,
    };
  }

  // 2. Linear guided rails must be cut in multiples of pitch (hole spacing)
  // Check if requestedLength is within 2.0mm tolerance of an exact multiple of pitch
  // (2.0mm tolerance accommodates imperial unit roundings from inches and feet)
  const kClosest = Math.round(requestedLengthMm / pitch);
  const closestMultiple = Math.max(pitch, kClosest * pitch);
  const diffFromMultiple = Math.abs(requestedLengthMm - closestMultiple);
  const isMultiple = diffFromMultiple <= 2.0;

  if (!isMultiple) {
    const nextMultiple = Math.ceil(requestedLengthMm / pitch) * pitch;
    return {
      valid: false,
      status: 'invalid',
      message: `${requestedLengthMm} mm is not a valid cutting length for ${model.modelName}. Cutting is only possible in multiples of its ${pitch} mm hole spacing. The next recommended valid cutting length is ${nextMultiple} mm.`,
      recommendedMinMm: nextMultiple,
      recommendedLengthMm: nextMultiple,
      requestedLengthMm,
      pitchMm: pitch,
      holesCount: 0,
      pitchSpans: 0,
      endMarginMm: 0,
      minEndMarginMm: minEndMargin,
    };
  }

  // 3. Exact multiple of pitch: L = k * P
  const effectiveLengthMm = closestMultiple;
  const k = kClosest;
  const holesCount = k; // k mounting holes
  const endMargin = pitch / 2; // standard symmetrical end margins: E1 = E2 = P/2

  return {
    valid: true,
    status: 'valid',
    message: `${effectiveLengthMm} mm is a valid cutting length for ${model.modelName} (${k} × ${pitch} mm). Calculated layout: ${holesCount} mounting holes at ${pitch} mm pitch with standard symmetrical end margins of ${endMargin} mm (E1 = E2 = ${endMargin} mm).`,
    recommendedMinMm: effectiveLengthMm,
    recommendedLengthMm: effectiveLengthMm,
    requestedLengthMm: effectiveLengthMm,
    pitchMm: pitch,
    holesCount,
    pitchSpans: Math.max(0, k - 1),
    endMarginMm: endMargin,
    minEndMarginMm: minEndMargin,
  };
}

// ─── GET — list all rail models ───────────────────────────────────────────────

export async function GET() {
  try {
    const models = seedIfEmpty();
    const sorted = [...models].sort((a, b) => a.modelName.localeCompare(b.modelName));
    return NextResponse.json({ success: true, models: sorted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── POST — create model OR validate cutting length ───────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate cutting length endpoint
    if (body.action === 'validate') {
      const { modelId, requestedLengthMm } = body;
      if (!modelId || requestedLengthMm === undefined || requestedLengthMm === null) {
        return NextResponse.json({ success: false, message: 'modelId and requestedLengthMm are required' }, { status: 400 });
      }
      const models = readModels();
      const targetId = String(modelId).trim().toUpperCase();
      const model = models.find(m => m.id === modelId || m.modelName === modelId || m.modelName.toUpperCase() === targetId);
      if (!model) {
        return NextResponse.json({ success: false, message: `Model '${modelId}' not found` }, { status: 404 });
      }
      const result = validateCuttingLength(model, Number(requestedLengthMm));
      return NextResponse.json({ success: true, validation: result, model });
    }

    // Create new model
    const { modelName, railWidthMm, railHeightMm, pitchMm, minCuttingLengthMm, minEndMarginMm, active } = body;
    if (!modelName || !railWidthMm || !railHeightMm || !pitchMm) {
      return NextResponse.json({ success: false, message: 'modelName, railWidthMm, railHeightMm, pitchMm are required' }, { status: 400 });
    }
    const models = readModels();
    const now = new Date().toISOString();
    const newModel: GuidedRailModel = {
      id: generateId(),
      modelName: String(modelName).trim().toUpperCase(),
      railWidthMm: Number(railWidthMm),
      railHeightMm: Number(railHeightMm),
      pitchMm: Number(pitchMm),
      minCuttingLengthMm: Number(minCuttingLengthMm || pitchMm),
      minEndMarginMm: Number(minEndMarginMm || 10),
      active: active !== false,
      createdAt: now,
      updatedAt: now,
    };
    models.push(newModel);
    writeModels(models);
    return NextResponse.json({ success: true, id: newModel.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── PUT — update an existing model ──────────────────────────────────────────

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }
    const models = readModels();
    const idx = models.findIndex(m => m.id === id);
    if (idx === -1) {
      return NextResponse.json({ success: false, message: 'Model not found' }, { status: 404 });
    }

    const existing = models[idx];
    const updated: GuidedRailModel = {
      ...existing,
      modelName:          body.modelName         !== undefined ? String(body.modelName).trim().toUpperCase() : existing.modelName,
      railWidthMm:        body.railWidthMm        !== undefined ? Number(body.railWidthMm)        : existing.railWidthMm,
      railHeightMm:       body.railHeightMm       !== undefined ? Number(body.railHeightMm)       : existing.railHeightMm,
      pitchMm:            body.pitchMm            !== undefined ? Number(body.pitchMm)            : existing.pitchMm,
      minCuttingLengthMm: body.minCuttingLengthMm !== undefined ? Number(body.minCuttingLengthMm) : existing.minCuttingLengthMm,
      minEndMarginMm:     body.minEndMarginMm     !== undefined ? Number(body.minEndMarginMm)     : existing.minEndMarginMm,
      active:             body.active             !== undefined ? Boolean(body.active)            : existing.active,
      updatedAt: new Date().toISOString(),
    };
    models[idx] = updated;
    writeModels(models);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

// ─── DELETE — remove a model ──────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, message: 'id query param is required' }, { status: 400 });
    }
    const models = readModels();
    const filtered = models.filter(m => m.id !== id);
    if (filtered.length === models.length) {
      return NextResponse.json({ success: false, message: 'Model not found' }, { status: 404 });
    }
    writeModels(filtered);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
