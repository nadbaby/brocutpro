import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserRoleProfile } from '@/lib/roles';
import { getFirebaseInventory, saveFirebaseInventory, RodRecord, GuidedRailStockRecord } from '@/lib/firebase-service';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth')?.value;
    const userCookie = cookieStore.get('rodsync_user')?.value;

    const email = userCookie ? decodeURIComponent(userCookie) : '';
    const profile = getUserRoleProfile(email);

    // Enforce admin permissions: only dipanshu@pvtchopra.com (or admin@pvtchopra.com)
    if (authCookie !== 'true' || !profile.isAdmin) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized. Only admin (dipanshu@pvtchopra.com) is permitted to delete inventory.'
      }, { status: 403 });
    }

    const body = await req.json();
    const { rodIds = [], railIds = [] } = body;

    const rodIdSet = new Set((Array.isArray(rodIds) ? rodIds : []).map(String));
    const railIdSet = new Set((Array.isArray(railIds) ? railIds : []).map(String));

    if (rodIdSet.size === 0 && railIdSet.size === 0) {
      return NextResponse.json({
        success: false,
        message: 'No items selected for deletion.'
      }, { status: 400 });
    }

    const inventory = await getFirebaseInventory();

    let updatedRods: RodRecord[] = inventory.rods;
    let deletedRodsCount = 0;
    if (rodIdSet.size > 0) {
      const initialCount = updatedRods.length;
      updatedRods = updatedRods.filter(r => !rodIdSet.has(String(r.id)));
      deletedRodsCount = initialCount - updatedRods.length;
    }

    let updatedRails: GuidedRailStockRecord[] = inventory.railStock;
    let deletedRailsCount = 0;
    if (railIdSet.size > 0) {
      const initialCount = updatedRails.length;
      updatedRails = updatedRails.filter(s => !railIdSet.has(String(s.id)));
      deletedRailsCount = initialCount - updatedRails.length;
    }

    const saveResult = await saveFirebaseInventory({
      rods: updatedRods,
      railStock: updatedRails
    });

    return NextResponse.json({
      success: true,
      deletedRodsCount,
      deletedRailsCount,
      remainingRodsCount: updatedRods.length,
      remainingRailsCount: updatedRails.length,
      rods: updatedRods,
      railStock: updatedRails,
      syncedToFirebase: saveResult.syncedToFirebase,
      message: `Successfully deleted ${deletedRodsCount + deletedRailsCount} item(s).`
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

