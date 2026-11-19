import { NextResponse } from 'next/server';
import { getFirebaseInventory, saveFirebaseInventory, RodRecord, GuidedRailStockRecord, GuidedRailModelRecord, CutLogRecord } from '@/lib/firebase-service';

export async function GET() {
  try {
    const data = await getFirebaseInventory();
    return NextResponse.json({
      success: true,
      rods: data.rods,
      railStock: data.railStock,
      railModels: data.railModels,
      cutLogs: data.cutLogs,
      categories: data.categories,
      fromFirebase: data.fromFirebase,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "cutvutpro",
      timestamp: Date.now()
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await saveFirebaseInventory({
      rods: body.rods,
      railStock: body.railStock,
      railModels: body.railModels,
      cutLogs: body.cutLogs,
      categories: body.categories
    });

    return NextResponse.json({
      success: true,
      syncedToFirebase: result.syncedToFirebase,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "cutvutpro",
      timestamp: Date.now()
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
