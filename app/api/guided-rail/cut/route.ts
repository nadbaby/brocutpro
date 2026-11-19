import { NextResponse } from 'next/server';
import {
  loadFullStock,
  writeLocalStockFile,
  setMemoryStockCache,
  syncStockToFirebase,
  generateId,
  GuidedRailStockItem,
} from '../stock/route';
import { loadLocalLogs, saveLocalLogs } from '@/lib/firebase-service';

function appendCutLogsSafely(newLogs: any[]): void {
  try {
    if (!Array.isArray(newLogs) || newLogs.length === 0) return;
    const existing = loadLocalLogs();
    saveLocalLogs([...newLogs, ...existing]);
  } catch (e) {
    console.warn('Error saving cut logs locally:', e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const scriptUrl = req.headers.get('x-google-script-url') || body.scriptUrl || '';
    const now = new Date().toISOString();

    let stock = await loadFullStock(false);
    const createdLogs: any[] = [];

    // Multi-cut plan execution
    if (body.cutType === 'plan' || (Array.isArray(body.planSteps) && body.planSteps.length > 0)) {
      const { planSteps, shouldSaveRemnants, reason, createdBy, assignedBy } = body;
      const saveRemnants = shouldSaveRemnants !== false;

      for (const step of planSteps) {
        const barIdx = stock.findIndex(s => s.id === step.barId);
        if (barIdx === -1) continue;
        const bar = stock[barIdx];

        // Deduct 1 bar
        bar.quantity = Number(bar.quantity) - 1;
        bar.updatedAt = now;

        // If quantity is depleted to 0 or less, delete the length completely from stock
        if (bar.quantity <= 0) {
          stock.splice(barIdx, 1);
        }

        // Remnant handling
        const stepRemainderMm = Math.round(Number(step.remainderMm) * 10) / 10;
        if (saveRemnants && stepRemainderMm > 0.1) {
          const existingRemIdx = stock.findIndex(
            s => s.modelName === bar.modelName && Math.abs(Number(s.lengthMm) - stepRemainderMm) < 0.1
          );
          if (existingRemIdx !== -1) {
            stock[existingRemIdx].quantity += 1;
            stock[existingRemIdx].updatedAt = now;
          } else {
            const remnantItem: GuidedRailStockItem = {
              id: generateId(bar.modelName, stepRemainderMm),
              brand: bar.brand || 'HIWIN',
              modelName: bar.modelName,
              railWidthMm: bar.railWidthMm,
              railHeightMm: bar.railHeightMm,
              pitchMm: bar.pitchMm,
              lengthMm: stepRemainderMm,
              quantity: 1,
              sku: `RAIL-${bar.modelName}-${Math.round(stepRemainderMm)}MM-OFFCUT`,
              notes: `Offcut from ${bar.lengthMm}mm (${reason || 'Multi-cut plan'})`,
              createdAt: now,
              updatedAt: now,
            };
            stock.unshift(remnantItem);
          }
        }

        // Record cut log
        const pieceMm = Number(step.pieceLengthMm) || 0;
        const stepPcs = Number(step.piecesToCut) || 1;
        const holesCount = (bar.pitchMm > 0) ? Math.floor(pieceMm / bar.pitchMm) : 0;
        const endMarginMm = (bar.pitchMm > 0) ? Number(((pieceMm - Math.max(0, holesCount - 1) * bar.pitchMm) / 2).toFixed(1)) : 0;

        const logEntry = {
          id: `gr-cut-${Date.now()}-${step.stepNum || 1}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          isRail: true,
          brand: bar.brand || 'HIWIN',
          rodName: `Guided Rail ${bar.brand || 'HIWIN'} ${bar.modelName}`,
          modelName: bar.modelName,
          pitchMm: bar.pitchMm,
          diameterMm: bar.pitchMm,
          cutLengthMm: pieceMm,
          originalLengthMm: bar.lengthMm,
          remainderMm: Math.max(0, stepRemainderMm),
          originalLengthIn: Number((bar.lengthMm / 25.4).toFixed(2)),
          originalLengthFt: Number((bar.lengthMm / 304.8).toFixed(2)),
          cutLengthIn: Number((pieceMm / 25.4).toFixed(2)),
          cutLengthFt: Number((pieceMm / 304.8).toFixed(2)),
          holesCount,
          endMarginMm,
          quantity: stepPcs,
          remainderIn: Number((Math.max(0, stepRemainderMm) / 25.4).toFixed(2)),
          reason: reason ? `Plan: ${reason}` : `Multi-cut plan: ${stepPcs} pc of ${pieceMm} mm`,
          remnantAdded: Boolean(saveRemnants && stepRemainderMm > 0.1),
          assignBy: createdBy || assignedBy || '',
          assignTo: assignedBy || '',
          createdBy: createdBy || '',
          assignedBy: assignedBy || '',
        };
        createdLogs.push(logEntry);
      }
    } else {
      // Single Cut execution
      const {
        stockId,
        cutPieceLengthMm,
        piecesCount = 1,
        shouldSaveRemnant,
        orderNotes = '',
        assignBy = '',
        assignTo = '',
      } = body;

      if (!stockId) {
        return NextResponse.json({ success: false, message: 'stockId is required' }, { status: 400 });
      }

      const barIdx = stock.findIndex(s => s.id === stockId);
      if (barIdx === -1) {
        return NextResponse.json({ success: false, message: 'Source stock bar not found' }, { status: 404 });
      }

      const bar = stock[barIdx];
      const cutMm = Number(cutPieceLengthMm) || 0;
      const pcs = Number(piecesCount) || 1;
      const totalCutMm = cutMm * pcs;
      const remainderMm = Math.round((Number(bar.lengthMm) - totalCutMm) * 10) / 10;

      if (cutMm <= 0 || pcs <= 0) {
        return NextResponse.json({ success: false, message: 'Invalid cut length or piece count' }, { status: 400 });
      }
      if (remainderMm < -0.1) {
        return NextResponse.json({ success: false, message: 'Total cut length exceeds source bar length' }, { status: 400 });
      }

      // Deduct 1 bar from source
      bar.quantity = Number(bar.quantity) - 1;
      bar.updatedAt = now;

      // If quantity becomes 0 or less, completely delete that length from stock
      if (bar.quantity <= 0) {
        stock.splice(barIdx, 1);
      }

      // Add remainder offcut to stock if requested
      const saveRemnant = shouldSaveRemnant !== false && remainderMm > 0.1;
      if (saveRemnant) {
        const existingRemIdx = stock.findIndex(
          s => s.modelName === bar.modelName && Math.abs(Number(s.lengthMm) - remainderMm) < 0.1
        );
        if (existingRemIdx !== -1) {
          stock[existingRemIdx].quantity += 1;
          stock[existingRemIdx].updatedAt = now;
        } else {
          const remnantItem: GuidedRailStockItem = {
            id: generateId(bar.modelName, remainderMm),
            brand: bar.brand || 'HIWIN',
            modelName: bar.modelName,
            railWidthMm: bar.railWidthMm,
            railHeightMm: bar.railHeightMm,
            pitchMm: bar.pitchMm,
            lengthMm: remainderMm,
            quantity: 1,
            sku: `RAIL-${bar.modelName}-${Math.round(remainderMm)}MM-OFFCUT`,
            notes: `Offcut from ${bar.lengthMm}mm (${orderNotes || 'Cut order'})`,
            createdAt: now,
            updatedAt: now,
          };
          stock.unshift(remnantItem);
        }
      }

      // Create rich cut log
      const holesCount = (bar.pitchMm > 0) ? Math.floor(cutMm / bar.pitchMm) : 0;
      const endMarginMm = (bar.pitchMm > 0) ? Number(((cutMm - Math.max(0, holesCount - 1) * bar.pitchMm) / 2).toFixed(1)) : 0;

      const logEntry = {
        id: `gr-cut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        isRail: true,
        brand: bar.brand || 'HIWIN',
        rodName: `Guided Rail ${bar.brand || 'HIWIN'} ${bar.modelName}`,
        modelName: bar.modelName,
        pitchMm: bar.pitchMm,
        diameterMm: bar.pitchMm,
        cutLengthMm: cutMm,
        originalLengthMm: bar.lengthMm,
        remainderMm: Math.max(0, remainderMm),
        originalLengthIn: Number((bar.lengthMm / 25.4).toFixed(2)),
        originalLengthFt: Number((bar.lengthMm / 304.8).toFixed(2)),
        cutLengthIn: Number((cutMm / 25.4).toFixed(2)),
        cutLengthFt: Number((cutMm / 304.8).toFixed(2)),
        holesCount,
        endMarginMm,
        quantity: pcs,
        remainderIn: Number((Math.max(0, remainderMm) / 25.4).toFixed(2)),
        reason: orderNotes ? `Order: ${orderNotes}` : `Guided Rail precision cut (${pcs} pc${pcs > 1 ? 's' : ''} of ${cutMm} mm)`,
        remnantAdded: Boolean(saveRemnant),
        assignBy: assignBy || '',
        assignTo: assignTo || '',
        createdBy: assignBy || '',
        assignedBy: assignBy || '',
      };
      createdLogs.push(logEntry);
    }

    // Filter stock to strictly valid items
    stock = stock.filter(s => (Number(s.quantity) || 0) > 0 && (Number(s.lengthMm) || 0) > 0);

    // Update memory cache with 120s TTL buffer
    setMemoryStockCache(stock, 120000);
    writeLocalStockFile(stock);
    appendCutLogsSafely(createdLogs);

    // Await sync to Firebase Cloud Database
    const synced = await syncStockToFirebase(stock, createdLogs);

    return NextResponse.json({
      success: true,
      stock,
      logs: createdLogs,
      syncedToFirebase: synced,
      message: 'Cut successfully executed! Stock updated in RodSync and synced to Firebase.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

