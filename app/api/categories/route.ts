import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseInventory, saveFirebaseInventory, CategoryStore, loadLocalCategories } from '@/lib/firebase-service';
import { getUserRoleProfile } from '@/lib/roles';

export async function GET() {
  try {
    const inventory = await getFirebaseInventory();
    const categories = inventory.categories || loadLocalCategories();
    return NextResponse.json({
      success: true,
      categories,
      mainCategories: ['Rod', 'Rail'],
      timestamp: Date.now()
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get('rodsync_user')?.value;
    const email = userCookie ? decodeURIComponent(userCookie) : '';
    const profile = getUserRoleProfile(email);

    if (!profile.isAdmin) {
      return NextResponse.json({
        success: false,
        message: 'Permission denied: Only administrators have rights to manage categories.'
      }, { status: 403 });
    }

    const body = await req.json();
    const inventory = await getFirebaseInventory();
    let currentCats: CategoryStore = {
      rodSubcategories: [...(inventory.categories?.rodSubcategories || ['Chrome Rod', 'Hard Chrome Rod'])],
      railSubcategories: [...(inventory.categories?.railSubcategories || ['HIWIN', 'PMI', 'THK'])]
    };

    let updatedRods = inventory.rods;
    let updatedRails = inventory.railStock;

    if (body.categories && Array.isArray(body.categories.rodSubcategories) && Array.isArray(body.categories.railSubcategories)) {
      currentCats = {
        rodSubcategories: Array.from(new Set(body.categories.rodSubcategories.map((s: string) => String(s).trim()).filter(Boolean))),
        railSubcategories: Array.from(new Set(body.categories.railSubcategories.map((s: string) => String(s).trim()).filter(Boolean))),
      };
    } else {
      const { action, type, name, oldName, newName } = body;
      
      // Strict constraint: only 'rod' and 'rail' are allowed main categories
      if (type !== 'rod' && type !== 'rail') {
        return NextResponse.json({
          success: false,
          message: "Invalid main category. Only 'Rod' and 'Rail' are allowed."
        }, { status: 400 });
      }

      if (action === 'add') {
        const cleanName = String(name || '').trim();
        if (!cleanName) {
          return NextResponse.json({ success: false, message: 'Subcategory name cannot be empty.' }, { status: 400 });
        }

        if (type === 'rod') {
          if (!currentCats.rodSubcategories.some(s => s.toLowerCase() === cleanName.toLowerCase())) {
            currentCats.rodSubcategories.push(cleanName);
          }
        } else if (type === 'rail') {
          if (!currentCats.railSubcategories.some(s => s.toLowerCase() === cleanName.toLowerCase())) {
            currentCats.railSubcategories.push(cleanName);
          }
        }
      } else if (action === 'edit') {
        const cleanOld = String(oldName || '').trim();
        const cleanNew = String(newName || '').trim();
        if (!cleanOld || !cleanNew) {
          return NextResponse.json({ success: false, message: 'Both old and new subcategory names are required.' }, { status: 400 });
        }

        if (type === 'rod') {
          currentCats.rodSubcategories = currentCats.rodSubcategories.map(s => s.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : s);
          // Also update existing rod items using the old category name
          updatedRods = updatedRods.map(r => {
            if ((r.category || r.name || '').toLowerCase() === cleanOld.toLowerCase()) {
              return { ...r, category: cleanNew, name: cleanNew };
            }
            return r;
          });
        } else if (type === 'rail') {
          currentCats.railSubcategories = currentCats.railSubcategories.map(s => s.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : s);
          // Also update existing rail stock items using the old category name
          updatedRails = updatedRails.map(r => {
            if ((r.brand || r.category || '').toLowerCase() === cleanOld.toLowerCase()) {
              return { ...r, brand: cleanNew, category: cleanNew };
            }
            return r;
          });
        }
      } else if (action === 'delete') {
        const cleanName = String(name || '').trim();
        if (!cleanName) {
          return NextResponse.json({ success: false, message: 'Subcategory name is required to delete.' }, { status: 400 });
        }

        if (type === 'rod') {
          currentCats.rodSubcategories = currentCats.rodSubcategories.filter(s => s.toLowerCase() !== cleanName.toLowerCase());
          if (currentCats.rodSubcategories.length === 0) {
            currentCats.rodSubcategories = ['Chrome Rod']; // keep minimum one fallback
          }
        } else if (type === 'rail') {
          currentCats.railSubcategories = currentCats.railSubcategories.filter(s => s.toLowerCase() !== cleanName.toLowerCase());
          if (currentCats.railSubcategories.length === 0) {
            currentCats.railSubcategories = ['HIWIN']; // keep minimum one fallback
          }
        }
      }
    }

    // Deduplicate and save
    currentCats.rodSubcategories = Array.from(new Set(currentCats.rodSubcategories));
    currentCats.railSubcategories = Array.from(new Set(currentCats.railSubcategories));

    const saveResult = await saveFirebaseInventory({
      categories: currentCats,
      rods: updatedRods,
      railStock: updatedRails
    });

    return NextResponse.json({
      success: true,
      categories: currentCats,
      syncedToFirebase: saveResult.syncedToFirebase,
      timestamp: Date.now()
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
