import { NextResponse } from 'next/server';
import { getFirebaseInventory, saveFirebaseInventory } from '@/lib/firebase-service';

/**
 * Legacy route alias forwarding directly to Firebase database storage system.
 */
export async function GET() {
  const data = await getFirebaseInventory();
  return NextResponse.json({
    success: true,
    rods: data.rods,
    railStock: data.railStock,
    cutLogs: data.cutLogs,
    fromFirebase: data.fromFirebase,
    syncedToFirebase: true,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await saveFirebaseInventory({
      rods: body.rods,
      railStock: body.railStock,
      cutLogs: body.cutLogs,
    });
    return NextResponse.json({
      success: true,
      syncedToFirebase: res.syncedToFirebase,
      syncedToGoogleSheets: true, // for backwards compat with any cached callbacks
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
