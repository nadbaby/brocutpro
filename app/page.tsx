'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getUserRoleProfile, UserRoleProfile } from '@/lib/roles';

declare global {
  interface Window {
    __INITIAL_RODS__?: unknown[];
    __INITIAL_CUT_LOGS__?: unknown[];
    __AVAILABLE_DIAMETERS__?: number[];
    __ROD_SUBCATEGORIES__?: string[];
    __RAIL_SUBCATEGORIES__?: string[];
    initVanillaApp?: () => void;
    setVanillaRods?: (rods: unknown[]) => void;
    setVanillaCutLogs?: (logs: unknown[]) => void;
    updateDashboardExternal?: () => void;
    updateRodNamesDropdown?: (cats?: string[]) => void;
    updateRailBrandsDropdown?: (brands?: string[]) => void;
    initAllCustomDropdowns?: () => void;
    initGuidedRail?: () => void;
    _grLoadAndRender?: () => void;
  }
}

export default function Home() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userProfile, setUserProfile] = useState<UserRoleProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGrImportModalOpen, setIsGrImportModalOpen] = useState(false);
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'syncing' | 'offline'>('connected');
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  const [isRoundLength, setIsRoundLength] = useState(false);
  const [systemMode, setSystemMode] = useState<'chrome-rod' | 'guided-rail'>('chrome-rod');
  const [portalView, setPortalView] = useState<'category' | 'rod' | 'rail' | 'main'>('category');
  const [visitedMain, setVisitedMain] = useState(false);
  const [selectedRodCategory, setSelectedRodCategory] = useState<string>('Chrome Rod');
  const [selectedRailBrand, setSelectedRailBrand] = useState<string>('HIWIN');
  const [availableRodNames, setAvailableRodNames] = useState<string[]>(['Chrome Rod', 'HoneTube', 'Sbrc', 'Hard Chrome Rod']);
  const [availableRailBrands, setAvailableRailBrands] = useState<string[]>(['HIWIN', 'PMI', 'FINHY']);
  const [availableRailModels, setAvailableRailModels] = useState<{ modelName: string; pitchMm: number }[]>([]);

  // Category Management State (Strict 2-Category Model: Rod & Rail)
  const [rodSubcategories, setRodSubcategories] = useState<string[]>(['Chrome Rod', 'HoneTube', 'Sbrc', 'Hard Chrome Rod']);
  const [railSubcategories, setRailSubcategories] = useState<string[]>(['HIWIN', 'PMI', 'FINHY']);
  const [newRodSubcat, setNewRodSubcat] = useState('');
  const [newRailSubcat, setNewRailSubcat] = useState('');
  const [editingSubcat, setEditingSubcat] = useState<{ type: 'rod' | 'rail'; oldName: string; value: string } | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Searchable Diameter Dropdown State (Strictly derived from database inventory)
  const [isDiaDropdownOpen, setIsDiaDropdownOpen] = useState(false);
  const [selectedDiameter, setSelectedDiameter] = useState<string>('');
  const [diaSearchQuery, setDiaSearchQuery] = useState<string>('');
  const [availableRodDiameters, setAvailableRodDiameters] = useState<(number | string)[]>([]);
  const diaDropdownRef = useRef<HTMLDivElement>(null);

  // Admin-Only Inventory Deletion & Management State (dipanshu@pvtchopra.com)
  const [isAdminManageOpen, setIsAdminManageOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<'rod' | 'rail'>('rod');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSelectedCat, setAdminSelectedCat] = useState('all');
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeletingItems, setIsDeletingItems] = useState(false);
  const [itemsToConfirmDelete, setItemsToConfirmDelete] = useState<Array<{
    id: string;
    type: 'rod' | 'rail';
    title: string;
    subtitle: string;
    quantity: number;
  }>>([]);
  const [adminRods, setAdminRods] = useState<any[]>([]);
  const [adminRails, setAdminRails] = useState<any[]>([]);

  const refreshAdminInventory = () => {
    if (typeof window !== 'undefined') {
      const currentRods = (window as any).getVanillaRods ? (window as any).getVanillaRods() : [];
      const currentRails = (window as any).getGuidedRailStock ? (window as any).getGuidedRailStock() : [];
      setAdminRods(Array.isArray(currentRods) ? [...currentRods] : []);
      setAdminRails(Array.isArray(currentRails) ? [...currentRails] : []);
    }
  };

  const toggleSelectDeleteItem = (id: string) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const ids = adminTab === 'rod'
      ? filteredAdminRods.map((r: any) => String(r.id))
      : filteredAdminRails.map((s: any) => String(s.id));
    setSelectedDeleteIds(new Set(ids));
  };

  const deselectAll = () => {
    setSelectedDeleteIds(new Set());
  };

  const initiateSingleDelete = (item: any, type: 'rod' | 'rail') => {
    if (type === 'rod') {
      setItemsToConfirmDelete([{
        id: String(item.id),
        type: 'rod',
        title: `${item.category || item.name || 'Rod'} • ${item.diameterMm} mm`,
        subtitle: `Length: ${item.lengthIn || item.lengthFt || 0} in | SKU: ${item.sku || 'N/A'}`,
        quantity: Number(item.quantity) || 1
      }]);
    } else {
      setItemsToConfirmDelete([{
        id: String(item.id),
        type: 'rail',
        title: `${item.category || item.brand || 'Rail'} • ${item.modelName || 'Model'}`,
        subtitle: `Pitch: ${item.pitchMm || 60} mm | Length: ${item.lengthMm || 0} mm (${((item.lengthMm || 0) / 25.4).toFixed(2)} in)`,
        quantity: Number(item.quantity) || 1
      }]);
    }
    setIsConfirmDeleteOpen(true);
  };

  const initiateBulkDelete = () => {
    if (selectedDeleteIds.size === 0) return;
    const itemsList: Array<{ id: string; type: 'rod' | 'rail'; title: string; subtitle: string; quantity: number }> = [];
    if (adminTab === 'rod') {
      adminRods.forEach((r: any) => {
        if (selectedDeleteIds.has(String(r.id))) {
          itemsList.push({
            id: String(r.id),
            type: 'rod',
            title: `${r.category || r.name || 'Rod'} • ${r.diameterMm} mm`,
            subtitle: `Length: ${r.lengthIn || r.lengthFt || 0} in | SKU: ${r.sku || 'N/A'}`,
            quantity: Number(r.quantity) || 1
          });
        }
      });
    } else {
      adminRails.forEach((s: any) => {
        if (selectedDeleteIds.has(String(s.id))) {
          itemsList.push({
            id: String(s.id),
            type: 'rail',
            title: `${s.category || s.brand || 'Rail'} • ${s.modelName || 'Model'}`,
            subtitle: `Pitch: ${s.pitchMm || 60} mm | Length: ${s.lengthMm || 0} mm`,
            quantity: Number(s.quantity) || 1
          });
        }
      });
    }
    setItemsToConfirmDelete(itemsList);
    setIsConfirmDeleteOpen(true);
  };

  const executeDeleteItems = async () => {
    if (itemsToConfirmDelete.length === 0) return;
    setIsDeletingItems(true);
    try {
      const rodIds = itemsToConfirmDelete.filter(i => i.type === 'rod').map(i => i.id);
      const railIds = itemsToConfirmDelete.filter(i => i.type === 'rail').map(i => i.id);

      const res = await fetch('/api/inventory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rodIds, railIds })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to delete selected items. Please check admin permissions.');
        setIsDeletingItems(false);
        return;
      }

      // Update frontend states
      if (Array.isArray(data.rods)) {
        setAdminRods(data.rods);
        if (typeof window !== 'undefined' && (window as any).setVanillaRods) {
          (window as any).setVanillaRods(data.rods);
        }
      }
      if (Array.isArray(data.railStock)) {
        setAdminRails(data.railStock);
        if (typeof window !== 'undefined' && (window as any).setGuidedRailStock) {
          (window as any).setGuidedRailStock(data.railStock);
        }
      }

      // Broadcast real-time sync across devices
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('syncBothToBackend', {
          detail: { rods: data.rods, railStock: data.railStock }
        }));
        if ((window as any).showToast) {
          (window as any).showToast(data.message || 'Items deleted successfully.', 'success');
        }
      }

      // Clear selection
      setSelectedDeleteIds(new Set());
      setIsConfirmDeleteOpen(false);
      setItemsToConfirmDelete([]);
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('An error occurred while deleting items: ' + err.message);
    } finally {
      setIsDeletingItems(false);
    }
  };

  const handleGoBack = () => {
    if (portalView === 'main') {
      if (systemMode === 'guided-rail') {
        handleSetPortalView('rail');
      } else {
        handleSetPortalView('rod');
      }
    } else if (portalView === 'rod' || portalView === 'rail') {
      handleSetPortalView('category');
    } else if (portalView === 'category') {
      if (visitedMain) {
        handleSetPortalView('main');
      } else if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      }
    }
  };

  const handleSetPortalView = (view: 'category' | 'rod' | 'rail' | 'main') => {
    setPortalView(view);
    if (view === 'main') {
      setVisitedMain(true);
    }
    try {
      localStorage.setItem('rodsync_portal_view', view);
    } catch { }
    if (view === 'main') {
      setTimeout(() => {
        if (systemMode === 'chrome-rod') {
          if (typeof window !== 'undefined' && (window as any).updateDashboardExternal) {
            (window as any).updateDashboardExternal();
          }
        } else if (systemMode === 'guided-rail') {
          if (typeof window !== 'undefined' && (window as any)._grLoadAndRender) {
            (window as any)._grLoadAndRender();
          }
        }
      }, 50);
    }
  };

  const handleSelectRodCategory = (cat: string) => {
    setSelectedRodCategory(cat);
    if (typeof window !== 'undefined') {
      if ((window as any).setRodCategoryFilter) {
        (window as any).setRodCategoryFilter(cat);
      }
      const allRods = (window as any).getVanillaRods ? (window as any).getVanillaRods() : [];
      if (Array.isArray(allRods)) {
        const activeRods = (cat && cat !== 'all' && cat !== 'ALL')
          ? allRods.filter((r: any) => String(r.category || r.name || '').toLowerCase() === cat.toLowerCase())
          : allRods;
        const dias = Array.from(new Set(
          activeRods
            .map((r: any) => r.diameterMm !== undefined && r.diameterMm !== null ? String(r.diameterMm).trim() : '')
            .filter((d: string) => d.length > 0 && d !== '300')
        )).sort((a: string, b: string) => {
          const numA = parseFloat(a) || 0;
          const numB = parseFloat(b) || 0;
          if (numA !== numB) return numA - numB;
          return a.localeCompare(b);
        });
        setAvailableRodDiameters(dias);
        setSelectedDiameter((prev) => {
          let nextDia = '';
          if (dias.length > 0) {
            nextDia = (prev && dias.some((d: any) => String(d).toLowerCase() === String(prev).toLowerCase())) ? prev : String(dias[0]);
          }
          const inp = document.getElementById('searchDiameterInput') as HTMLInputElement | null;
          if (inp && inp.value !== nextDia) {
            inp.value = nextDia;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return nextDia;
        });

        // Immediately update section title and bars badge for this category
        const sectionTitle = document.getElementById('rodInventorySectionTitle');
        if (sectionTitle) {
          sectionTitle.textContent = `${cat} Stock Inventory`;
        }
        const totalBars = activeRods.reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
        const crBadge = document.getElementById('crTotalStockBarsBadge');
        if (crBadge) {
          crBadge.textContent = `${totalBars} bar${totalBars !== 1 ? 's' : ''}`;
        }
      }
    }
  };

  const handleSelectRailBrand = (brand: string) => {
    setSelectedRailBrand(brand);
    if (typeof window !== 'undefined' && (window as any).setRailBrandFilter) {
      (window as any).setRailBrandFilter(brand);
    }
    const title = document.getElementById('railInventorySectionTitle');
    if (title) {
      title.textContent = `${brand} Stock Inventory`;
    }
  };

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('rodsync_system_mode') as 'chrome-rod' | 'guided-rail';
      const initialMode = (savedMode === 'guided-rail' || savedMode === 'chrome-rod') ? savedMode : 'chrome-rod';
      setSystemMode(initialMode);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-system-mode', initialMode);
      }

      const savedView = localStorage.getItem('rodsync_portal_view') as 'category' | 'rod' | 'rail' | 'main';
      if (savedView === 'category' || savedView === 'rod' || savedView === 'rail' || savedView === 'main') {
        setPortalView(savedView);
      }
    } catch { }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && (window as any).initAllCustomDropdowns) {
        (window as any).initAllCustomDropdowns();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [portalView, systemMode]);

  const handleSwitchSystem = (mode: 'chrome-rod' | 'guided-rail') => {
    setSystemMode(mode);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-system-mode', mode);
    }
    try {
      localStorage.setItem('rodsync_system_mode', mode);
    } catch { }
    if (portalView !== 'main') {
      handleSetPortalView(mode === 'chrome-rod' ? 'rod' : 'rail');
    }
    if (mode === 'guided-rail' && typeof window !== 'undefined' && (window as any)._grLoadAndRender) {
      setTimeout(() => {
        try {
          (window as any)._grLoadAndRender();
        } catch { }
      }, 50);
    }
    if (mode === 'chrome-rod' && typeof window !== 'undefined' && (window as any).updateDashboardExternal) {
      setTimeout(() => {
        try {
          (window as any).updateDashboardExternal();
        } catch { }
      }, 50);
    }
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('rodsyncSystemModeChanged', { detail: { mode } }));
        if ((window as any).updateGrKpis) (window as any).updateGrKpis();
        if ((window as any).updateCutLogsBadge) (window as any).updateCutLogsBadge();
        if ((window as any).renderCutLogsTable) (window as any).renderCutLogsTable();
      } catch { }
    }
  };

  const handleDownloadGrTemplate = () => {
    const templateRows = [
      ['Brand', 'Rail Name', 'Rail Diameter (mm)', 'Length (in)', 'Pieces', 'PCC / Hole Pitch (mm)', 'Storage Rack / Notes'],
      ['HIWIN', 'HGR 15', 15, 120.0, 8, 60, 'Rack A-1'],
      ['HIWIN', 'HGR 20', 20, 150.0, 12, 60, 'Rack A-2'],
      ['PMI', 'HGR 25', 25, 98.5, 6, 60, 'Rack B-1'],
      ['FINHY', 'HGR 30', 30, 80.0, 4, 80, 'Rack B-2'],
      ['HIWIN', 'HGR 45', 45, 120.0, 5, 105, 'Rack C-1'],
      ['PMI', 'HGR 55', 53, 160.0, 3, 120, 'Rack C-2'],
      ['HIWIN', 'HGR 65', 63, 160.0, 2, 150, 'Rack D-1'],
    ];

    if (typeof window !== 'undefined' && (window as any).XLSX) {
      try {
        const XLSX = (window as any).XLSX;
        const ws = XLSX.utils.aoa_to_sheet(templateRows);
        ws['!cols'] = [
          { wch: 14 },
          { wch: 16 },
          { wch: 20 },
          { wch: 15 },
          { wch: 12 },
          { wch: 24 },
          { wch: 24 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rail Stock Template');
        XLSX.writeFile(wb, 'Guided_Rail_Inventory_Template.xlsx');
        return;
      } catch (err) {
        console.warn('XLSX template generation fallback to CSV', err);
      }
    }

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(
      templateRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    );
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "Guided_Rail_Inventory_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadRodTemplate = () => {
    const templateRows = [
      ['Rod Name', 'Diameter (mm)', 'Length (in)', 'Quantity (Pieces)', 'Storage Rack / Notes'],
      ['Chrome Rod', 20, 120.0, 5, 'Rack A-1'],
      ['Chrome Rod', 25, 84.5, 10, 'Rack A-2'],
      ['Hard Chrome Rod', 30, 72.0, 3, 'Rack A-3'],
      ['Hard Chrome Rod', 40, 120.0, 4, 'Rack A-4'],
      ['HoneTube', '50x50', 60.0, 4, 'Rack B-1'],
      ['HoneTube', '55x65', 72.0, 2, 'Rack B-2'],
      ['HoneTube', '100x100', 120.0, 6, 'Rack B-3']
    ];

    if (typeof window !== 'undefined' && (window as any).XLSX) {
      try {
        const XLSX = (window as any).XLSX;
        const ws = XLSX.utils.aoa_to_sheet(templateRows);
        ws['!cols'] = [
          { wch: 20 },
          { wch: 18 },
          { wch: 16 },
          { wch: 20 },
          { wch: 24 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rod Stock Template');
        XLSX.writeFile(wb, 'Rod_Inventory_Template.xlsx');
        return;
      } catch (err) {
        console.warn('XLSX template generation fallback to CSV', err);
      }
    }

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(
      templateRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    );
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "Rod_Inventory_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).switchSystemMode = handleSwitchSystem;
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rodsync_round_length') === 'true';
      setIsRoundLength(saved);
      if (typeof window !== 'undefined' && (window as any).setRoundLengthEnabled) {
        (window as any).setRoundLengthEnabled(saved);
      }
    } catch { }
  }, []);

  const handleToggleRoundLength = () => {
    const next = !isRoundLength;
    setIsRoundLength(next);
    try {
      localStorage.setItem('rodsync_round_length', next ? 'true' : 'false');
    } catch { }
    if (typeof window !== 'undefined') {
      if ((window as any).setRoundLengthEnabled) {
        (window as any).setRoundLengthEnabled(next);
      } else if ((window as any).toggleRoundLength) {
        (window as any).toggleRoundLength();
      }
    }
  };

  useEffect(() => {
    // Strictly enforce Light Theme only across all devices
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.setAttribute('data-theme-mode', 'light');
      try { localStorage.setItem('rodsync_theme', 'light'); } catch { }
    }

    // Clear and unregister any stale ServiceWorker caches
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
      if ('caches' in window) {
        caches.keys().then(names => {
          for (const name of names) caches.delete(name);
        });
      }
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        const { getAuth, signOut } = await import('firebase/auth');
        const auth = getAuth();
        await signOut(auth);
      }
    } catch (e: unknown) {
      console.error(e);
    }
    // Delete auth cookies precisely by expiring them
    document.cookie = "auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "rodsync_user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    try {
      localStorage.removeItem('rodsync_user_email');
      if (typeof window !== 'undefined') (window as any).rodsyncCurrentUserEmail = '';
    } catch { }
    // Force full page navigation to login portal
    window.location.href = '/login';
  };



  const syncInventoryData = async (forceRefresh = false) => {
    setFirebaseStatus('syncing');

    let loadedFromFirebase = false;

    // 1. Fetch live directly from Firebase Cloud Database API
    try {
      const res = await fetch('/api/firebase-sync');
      if (res.ok) {
        const fbData = await res.json();
        if (fbData.success) {
          const cleanRods = (fbData.rods || []).filter((r: any) => Number(r.diameterMm) !== 300);
          const cleanLogs = (fbData.cutLogs || []).filter((l: any) => Number(l.diameterMm) !== 300);
          const cleanRails = (fbData.railStock || []).filter((r: any) => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);

          window.__INITIAL_RODS__ = cleanRods;
          window.__INITIAL_CUT_LOGS__ = cleanLogs;

          // Dynamically extract rod names, rail brands, and rail models from Firebase database
          const dbRodNames = Array.from(new Set(cleanRods.map((r: any) => String(r.category || r.name || '').trim()).filter(Boolean))) as string[];
          const dbRailBrands = Array.from(new Set(cleanRails.map((r: any) => String(r.category || r.brand || '').trim().toUpperCase()).filter(Boolean))) as string[];

          if (fbData.categories) {
            const rodCats = Array.isArray(fbData.categories.rodSubcategories) && fbData.categories.rodSubcategories.length > 0
              ? Array.from(new Set([...fbData.categories.rodSubcategories, ...dbRodNames])).filter(Boolean) as string[]
              : (dbRodNames.length > 0 ? dbRodNames : ['Chrome Rod', 'Hard Chrome Rod']);
            const railCats = Array.isArray(fbData.categories.railSubcategories) && fbData.categories.railSubcategories.length > 0
              ? Array.from(new Set([...fbData.categories.railSubcategories, ...dbRailBrands])).filter(Boolean) as string[]
              : (dbRailBrands.length > 0 ? dbRailBrands : ['HIWIN', 'PMI', 'THK']);
            setRodSubcategories(rodCats);
            setRailSubcategories(railCats);
            setAvailableRodNames(rodCats);
            setAvailableRailBrands(railCats);
            if (typeof window !== 'undefined') {
              window.__ROD_SUBCATEGORIES__ = rodCats;
              window.__RAIL_SUBCATEGORIES__ = railCats;
              if (window.updateRodNamesDropdown) window.updateRodNamesDropdown(rodCats);
              if (window.updateRailBrandsDropdown) window.updateRailBrandsDropdown(railCats);
            }
          } else {
            if (dbRodNames.length > 0) {
              setAvailableRodNames(dbRodNames.sort());
              setRodSubcategories(dbRodNames.sort());
            }
            if (dbRailBrands.length > 0) {
              setAvailableRailBrands(dbRailBrands.sort());
              setRailSubcategories(dbRailBrands.sort());
            }
          }

          const activeRodsForDia = (selectedRodCategory && selectedRodCategory !== 'all' && selectedRodCategory !== 'ALL')
            ? cleanRods.filter((r: any) => String(r.category || r.name || '').toLowerCase() === selectedRodCategory.toLowerCase())
            : cleanRods;
          const dbDiameters = (Array.from(new Set(
            activeRodsForDia
              .map((r: any) => r.diameterMm !== undefined && r.diameterMm !== null ? String(r.diameterMm).trim() : '')
              .filter((d: string) => d.length > 0 && d !== '300')
          )) as string[]).sort((a: string, b: string) => {
            const numA = parseFloat(a) || 0;
            const numB = parseFloat(b) || 0;
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
          });
          setAvailableRodDiameters(dbDiameters);

          const dbRailModelsMap = new Map<string, number>();
          if (Array.isArray(fbData.railModels)) {
            fbData.railModels.forEach((m: any) => {
              const mName = String(m.modelName || '').trim().toUpperCase();
              if (mName && !dbRailModelsMap.has(mName)) {
                dbRailModelsMap.set(mName, Number(m.pitchMm) || 60);
              }
            });
          }
          cleanRails.forEach((r: any) => {
            const mName = String(r.modelName || '').trim().toUpperCase();
            if (mName && !dbRailModelsMap.has(mName)) {
              dbRailModelsMap.set(mName, Number(r.pitchMm) || 60);
            }
          });
          if (dbRailModelsMap.size > 0) {
            const modelsList = Array.from(dbRailModelsMap.entries()).map(([modelName, pitchMm]) => ({ modelName, pitchMm }));
            modelsList.sort((a, b) => a.modelName.localeCompare(b.modelName));
            setAvailableRailModels(modelsList);
          }

          // Pure Firebase database mode: purge any legacy local cache keys
          if (typeof window !== 'undefined') {
            localStorage.removeItem('rod_stock_inventory_v1');
            localStorage.removeItem('rod_stock_cut_logs_v1');
            localStorage.removeItem('guided_rail_stock_inventory_v1');
          }
          if (window.setVanillaRods) window.setVanillaRods(cleanRods);
          if (window.setVanillaCutLogs) window.setVanillaCutLogs(cleanLogs);
          if (typeof window !== 'undefined' && (window as any).setGuidedRailStock) {
            (window as any).setGuidedRailStock(cleanRails);
          }
          if (window.updateDashboardExternal) window.updateDashboardExternal();
          loadedFromFirebase = true;
          setFirebaseStatus('connected');
        }
      }
    } catch (err: unknown) {
      console.warn('Firebase API sync failed, checking client SDK', err);
    }

    // 2. Direct Firestore SDK read if API was offline
    if (!loadedFromFirebase && db) {
      try {
        const docRef = doc(db, 'inventory', 'main');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const cleanRods = (data.rods || []).filter((r: any) => Number(r.diameterMm) !== 300);
          const cleanLogs = (data.cutLogs || []).filter((l: any) => Number(l.diameterMm) !== 300);
          const cleanRails = (data.railStock || []).filter((r: any) => (Number(r.quantity) || 0) > 0 && (Number(r.lengthMm) || 0) > 0);
          window.__INITIAL_RODS__ = cleanRods;
          window.__INITIAL_CUT_LOGS__ = cleanLogs;

          const dbRodNames = Array.from(new Set(cleanRods.map((r: any) => String(r.category || r.name || '').trim()).filter(Boolean))) as string[];
          if (dbRodNames.length > 0) setAvailableRodNames(dbRodNames.sort());

          const activeRodsForDia = (selectedRodCategory && selectedRodCategory !== 'all' && selectedRodCategory !== 'ALL')
            ? cleanRods.filter((r: any) => String(r.category || r.name || '').toLowerCase() === selectedRodCategory.toLowerCase())
            : cleanRods;
          const dbDiameters = (Array.from(new Set(
            activeRodsForDia
              .map((r: any) => r.diameterMm !== undefined && r.diameterMm !== null ? String(r.diameterMm).trim() : '')
              .filter((d: string) => d.length > 0 && d !== '300')
          )) as string[]).sort((a: string, b: string) => {
            const numA = parseFloat(a) || 0;
            const numB = parseFloat(b) || 0;
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
          });
          setAvailableRodDiameters(dbDiameters);

          const dbRailBrands = Array.from(new Set(cleanRails.map((r: any) => String(r.category || r.brand || '').trim().toUpperCase()).filter(Boolean))) as string[];
          if (dbRailBrands.length > 0) setAvailableRailBrands(dbRailBrands.sort());

          const dbRailModelsMap = new Map<string, number>();
          if (Array.isArray(data.railModels)) {
            data.railModels.forEach((m: any) => {
              const mName = String(m.modelName || '').trim().toUpperCase();
              if (mName && !dbRailModelsMap.has(mName)) {
                dbRailModelsMap.set(mName, Number(m.pitchMm) || 60);
              }
            });
          }
          cleanRails.forEach((r: any) => {
            const mName = String(r.modelName || '').trim().toUpperCase();
            if (mName && !dbRailModelsMap.has(mName)) {
              dbRailModelsMap.set(mName, Number(r.pitchMm) || 60);
            }
          });
          if (dbRailModelsMap.size > 0) {
            const modelsList = Array.from(dbRailModelsMap.entries()).map(([modelName, pitchMm]) => ({ modelName, pitchMm }));
            modelsList.sort((a, b) => a.modelName.localeCompare(b.modelName));
            setAvailableRailModels(modelsList);
          }

          if (typeof window !== 'undefined') {
            localStorage.removeItem('rod_stock_inventory_v1');
            localStorage.removeItem('rod_stock_cut_logs_v1');
            localStorage.removeItem('guided_rail_stock_inventory_v1');
            if ((window as any).setGuidedRailStock) {
              (window as any).setGuidedRailStock(cleanRails);
            }
          }
          if (window.setVanillaRods) window.setVanillaRods(cleanRods);
          if (window.setVanillaCutLogs) window.setVanillaCutLogs(cleanLogs);
          if (window.updateDashboardExternal) window.updateDashboardExternal();
          setFirebaseStatus('connected');
          loadedFromFirebase = true;
        }
      } catch (e: unknown) {
        console.warn('Firestore client direct read error:', e);
      }
    }

    setFirebaseStatus('connected');
    if (window.initVanillaApp) {
      window.initVanillaApp();
    }
    setIsInitializing(false);
  };

  useEffect(() => {
    // Compulsory Async Authentication Check
    const verifyAuth = async () => {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (!data.authenticated) {
          router.replace('/login');
          return;
        }
        const profile: UserRoleProfile = data.profile || getUserRoleProfile(data.user || '');
        setUserProfile(profile);

        if (data.user && typeof window !== 'undefined') {
          (window as any).rodsyncCurrentUserEmail = data.user;
          (window as any).rodsyncUserProfile = profile;
          (window as any).rodsyncIsAdmin = profile.isAdmin;
          try {
            localStorage.setItem('rodsync_user_email', data.user);
          } catch {}
          // Determine friendly display name
          const formattedName = profile.displayName || 'Operator';
          ['grPlanCreatedByInput', 'cutCreatedByInput', 'planCreatedByInput', 'grCutAssignBy'].forEach(id => {
            const el = document.getElementById(id) as HTMLInputElement;
            if (el) {
              el.value = formattedName;
              el.readOnly = true;
            }
          });
        }
        setIsCheckingAuth(false);
      } catch (err) {
        console.error('Session verify error:', err);
        setIsCheckingAuth(false);
      }
    };

    verifyAuth();

    if (typeof window !== 'undefined') {
      localStorage.removeItem('rod_stock_inventory_v1');
      localStorage.removeItem('guided_rail_stock_inventory_v1');
      localStorage.removeItem('rod_stock_cut_logs_v1');
      localStorage.removeItem('rodsync_gsheets_script_url');
      localStorage.removeItem('rodsync_stock_cleared_v1');
    }

    syncInventoryData(false);

    const handleSyncRods = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const rods = customEvent.detail;
      fetch('/api/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rods })
      }).catch(err => console.warn('Firebase sync failed:', err));

      if (db) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { rods }, { merge: true });
          setFirebaseStatus('connected');
        } catch { }
      }
    };

    const handleSyncLogs = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const cutLogs = customEvent.detail;
      fetch('/api/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutLogs })
      }).catch(err => console.warn('Firebase sync failed:', err));

      if (db) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { cutLogs }, { merge: true });
          setFirebaseStatus('connected');
        } catch { }
      }
    };

    const handleSyncRailStock = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const railStock = customEvent.detail;
      fetch('/api/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ railStock })
      }).catch(err => console.warn('Firebase rail sync failed:', err));

      if (db) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { railStock }, { merge: true });
          setFirebaseStatus('connected');
        } catch { }
      }
    };

    const handleSyncBoth = async (e: Event) => {
      const customEvent = e as CustomEvent<{ rods?: unknown[]; cutLogs?: unknown[]; railStock?: unknown[] }>;
      const payload: Record<string, unknown> = {};
      if (customEvent.detail?.rods) payload.rods = customEvent.detail.rods;
      if (customEvent.detail?.cutLogs) payload.cutLogs = customEvent.detail.cutLogs;
      if (customEvent.detail?.railStock) {
        payload.railStock = customEvent.detail.railStock;
      } else if (typeof window !== 'undefined' && (window as any).getGuidedRailStock) {
        payload.railStock = (window as any).getGuidedRailStock();
      }

      fetch('/api/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.warn('Firebase combined sync failed:', err));

      if (db) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), payload, { merge: true });
          setFirebaseStatus('connected');
        } catch { }
      }
    };

    window.addEventListener('syncRodsToFirebase', handleSyncRods);
    window.addEventListener('syncRodsToBackend', handleSyncRods);
    window.addEventListener('syncCutLogsToFirebase', handleSyncLogs);
    window.addEventListener('syncLogsToBackend', handleSyncLogs);
    window.addEventListener('syncRailStockToBackend', handleSyncRailStock);
    window.addEventListener('syncBothToBackend', handleSyncBoth);

    return () => {
      window.removeEventListener('syncRodsToFirebase', handleSyncRods);
      window.removeEventListener('syncRodsToBackend', handleSyncRods);
      window.removeEventListener('syncCutLogsToFirebase', handleSyncLogs);
      window.removeEventListener('syncLogsToBackend', handleSyncLogs);
      window.removeEventListener('syncRailStockToBackend', handleSyncRailStock);
      window.removeEventListener('syncBothToBackend', handleSyncBoth);
    };
  }, [router]);

  // Real-time Firestore Sync for Categories (Strict 2-Category Model: Rod & Rail)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      if (db) {
        const mainRef = doc(db, 'inventory', 'main');
        unsubscribe = onSnapshot(mainRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.categories) {
              const rodCats: string[] = Array.isArray(data.categories.rodSubcategories) && data.categories.rodSubcategories.length > 0
                ? data.categories.rodSubcategories
                : ['Chrome Rod', 'Hard Chrome Rod'];
              const railCats: string[] = Array.isArray(data.categories.railSubcategories) && data.categories.railSubcategories.length > 0
                ? data.categories.railSubcategories
                : ['HIWIN', 'PMI', 'THK'];
              
              setRodSubcategories(rodCats);
              setRailSubcategories(railCats);
              setAvailableRodNames(rodCats);
              setAvailableRailBrands(railCats);

              if (typeof window !== 'undefined') {
                window.__ROD_SUBCATEGORIES__ = rodCats;
                window.__RAIL_SUBCATEGORIES__ = railCats;
                if (window.updateRodNamesDropdown) window.updateRodNamesDropdown(rodCats);
                if (window.updateRailBrandsDropdown) window.updateRailBrandsDropdown(railCats);
              }
            }

            if (Array.isArray(data.rods)) {
              setAdminRods(data.rods);
              if (typeof window !== 'undefined') {
                const win = window as any;
                win.__INITIAL_RODS__ = data.rods;
                if (typeof win.refreshRodsData === 'function') win.refreshRodsData(data.rods);
              }
            }

            if (Array.isArray(data.railStock)) {
              setAdminRails(data.railStock);
              if (typeof window !== 'undefined') {
                const win = window as any;
                win.__INITIAL_RAIL_STOCK__ = data.railStock;
                if (typeof win.refreshRailStockData === 'function') win.refreshRailStockData(data.railStock);
              }
            }

            if (Array.isArray(data.cutLogs) && typeof window !== 'undefined') {
              const win = window as any;
              win.__INITIAL_CUT_LOGS__ = data.cutLogs;
              if (typeof win.refreshCutLogsData === 'function') win.refreshCutLogsData(data.cutLogs);
            }
          }
        }, (err) => {
          console.warn('[Firestore] Live category listener warning:', err);
        });
      }
    } catch (err) {
      console.warn('[Firestore] Live listener subscription error:', err);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Category Management Handlers
  const handleAddSubcat = async (type: 'rod' | 'rail') => {
    const rawName = type === 'rod' ? newRodSubcat : newRailSubcat;
    const name = rawName.trim();
    if (!name) return;

    // Check duplicate
    const currentList = type === 'rod' ? rodSubcategories : railSubcategories;
    if (currentList.some(s => s.toLowerCase() === name.toLowerCase())) {
      alert(`Subcategory "${name}" already exists in ${type === 'rod' ? 'Rod' : 'Rail'}!`);
      return;
    }

    setIsSavingCategory(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', type, name })
      });
      const data = await res.json();
      if (data.success && data.categories) {
        if (type === 'rod') {
          setRodSubcategories(data.categories.rodSubcategories);
          setAvailableRodNames(data.categories.rodSubcategories);
          setNewRodSubcat('');
          if (typeof window !== 'undefined') {
            window.__ROD_SUBCATEGORIES__ = data.categories.rodSubcategories;
            if (window.updateRodNamesDropdown) window.updateRodNamesDropdown(data.categories.rodSubcategories);
          }
        } else {
          setRailSubcategories(data.categories.railSubcategories);
          setAvailableRailBrands(data.categories.railSubcategories);
          setNewRailSubcat('');
          if (typeof window !== 'undefined') {
            window.__RAIL_SUBCATEGORIES__ = data.categories.railSubcategories;
            if (window.updateRailBrandsDropdown) window.updateRailBrandsDropdown(data.categories.railSubcategories);
          }
        }
        if (typeof window !== 'undefined' && window.initAllCustomDropdowns) {
          window.initAllCustomDropdowns();
        }
      } else {
        alert(data.message || 'Failed to add subcategory');
      }
    } catch (err) {
      console.error('Error adding subcategory:', err);
      alert('Network error while adding subcategory.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleStartEditSubcat = (type: 'rod' | 'rail', oldName: string) => {
    setEditingSubcat({ type, oldName, value: oldName });
  };

  const handleSaveEditSubcat = async () => {
    if (!editingSubcat || !editingSubcat.value.trim()) return;
    const { type, oldName, value } = editingSubcat;
    const newName = value.trim();
    if (newName.toLowerCase() === oldName.toLowerCase()) {
      setEditingSubcat(null);
      return;
    }

    setIsSavingCategory(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', type, oldName, newName })
      });
      const data = await res.json();
      if (data.success && data.categories) {
        if (type === 'rod') {
          setRodSubcategories(data.categories.rodSubcategories);
          setAvailableRodNames(data.categories.rodSubcategories);
          if (typeof window !== 'undefined') {
            window.__ROD_SUBCATEGORIES__ = data.categories.rodSubcategories;
            if (window.updateRodNamesDropdown) window.updateRodNamesDropdown(data.categories.rodSubcategories);
          }
        } else {
          setRailSubcategories(data.categories.railSubcategories);
          setAvailableRailBrands(data.categories.railSubcategories);
          if (typeof window !== 'undefined') {
            window.__RAIL_SUBCATEGORIES__ = data.categories.railSubcategories;
            if (window.updateRailBrandsDropdown) window.updateRailBrandsDropdown(data.categories.railSubcategories);
          }
        }
        if (typeof window !== 'undefined' && window.initAllCustomDropdowns) {
          window.initAllCustomDropdowns();
        }
        setEditingSubcat(null);
      } else {
        alert(data.message || 'Failed to edit subcategory');
      }
    } catch (err) {
      console.error('Error editing subcategory:', err);
      alert('Network error while editing subcategory.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteSubcat = async (type: 'rod' | 'rail', name: string) => {
    if (!confirm(`Are you sure you want to delete subcategory "${name}" from ${type === 'rod' ? 'Rod' : 'Rail'}?`)) {
      return;
    }

    setIsSavingCategory(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', type, name })
      });
      const data = await res.json();
      if (data.success && data.categories) {
        if (type === 'rod') {
          setRodSubcategories(data.categories.rodSubcategories);
          setAvailableRodNames(data.categories.rodSubcategories);
          if (typeof window !== 'undefined') {
            window.__ROD_SUBCATEGORIES__ = data.categories.rodSubcategories;
            if (window.updateRodNamesDropdown) window.updateRodNamesDropdown(data.categories.rodSubcategories);
          }
        } else {
          setRailSubcategories(data.categories.railSubcategories);
          setAvailableRailBrands(data.categories.railSubcategories);
          if (typeof window !== 'undefined') {
            window.__RAIL_SUBCATEGORIES__ = data.categories.railSubcategories;
            if (window.updateRailBrandsDropdown) window.updateRailBrandsDropdown(data.categories.railSubcategories);
          }
        }
        if (typeof window !== 'undefined' && window.initAllCustomDropdowns) {
          window.initAllCustomDropdowns();
        }
      } else {
        alert(data.message || 'Failed to delete subcategory');
      }
    } catch (err) {
      console.error('Error deleting subcategory:', err);
      alert('Network error while deleting subcategory.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Searchable Diameter Dropdown Hooks & Synchronization (strictly derived from database)
  useEffect(() => {
    const onDiametersUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail.diameters)) {
        const dias = e.detail.diameters
          .map((d: any) => String(d).trim())
          .filter((d: string) => d.length > 0 && d !== '300')
          .sort((a: string, b: string) => {
            const numA = parseFloat(a) || 0;
            const numB = parseFloat(b) || 0;
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
          });
        setAvailableRodDiameters(dias);
        setSelectedDiameter((prev) => {
          let nextDia = '';
          if (dias.length > 0) {
            nextDia = (prev && dias.some((d: any) => String(d).toLowerCase() === String(prev).toLowerCase())) ? prev : String(dias[0]);
          }
          const inp = document.getElementById('searchDiameterInput') as HTMLInputElement | null;
          if (inp && inp.value !== nextDia) {
            inp.value = nextDia;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return nextDia;
        });
      }
    };
    window.addEventListener('rodsyncDiametersUpdated', onDiametersUpdated);
    if (typeof window !== 'undefined' && Array.isArray((window as any).__AVAILABLE_DIAMETERS__)) {
      const initDias = (window as any).__AVAILABLE_DIAMETERS__
        .map((d: any) => String(d).trim())
        .filter((d: string) => d.length > 0 && d !== '300')
        .sort((a: string, b: string) => {
          const numA = parseFloat(a) || 0;
          const numB = parseFloat(b) || 0;
          if (numA !== numB) return numA - numB;
          return a.localeCompare(b);
        });
      setAvailableRodDiameters(initDias);
      if (initDias.length > 0 && !selectedDiameter) {
        setSelectedDiameter(String(initDias[0]));
      }
    }

    const onCatSelected = (e: any) => {
      if (e.detail && e.detail.category && e.detail.category !== selectedRodCategory) {
        handleSelectRodCategory(e.detail.category);
      }
    };
    window.addEventListener('rodsyncCategorySelected', onCatSelected);

    return () => {
      window.removeEventListener('rodsyncDiametersUpdated', onDiametersUpdated);
      window.removeEventListener('rodsyncCategorySelected', onCatSelected);
    };
  }, [selectedRodCategory, selectedDiameter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (diaDropdownRef.current && !diaDropdownRef.current.contains(e.target as Node)) {
        setIsDiaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const inp = document.getElementById('searchDiameterInput') as HTMLInputElement | null;
    const resetBtn = document.getElementById('btnResetSmartSearch');

    const onInput = () => {
      if (inp) setSelectedDiameter(inp.value);
    };
    const onReset = () => {
      setSelectedDiameter('');
      setDiaSearchQuery('');
    };

    if (inp) {
      inp.addEventListener('input', onInput);
      inp.addEventListener('change', onInput);
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', onReset);
    }

    const interval = setInterval(() => {
      if (inp && inp.value !== selectedDiameter) {
        setSelectedDiameter(inp.value);
      }
    }, 250);

    return () => {
      clearInterval(interval);
      if (inp) {
        inp.removeEventListener('input', onInput);
        inp.removeEventListener('change', onInput);
      }
      if (resetBtn) {
        resetBtn.removeEventListener('click', onReset);
      }
    };
  }, [selectedDiameter]);

  const handleSelectDiameter = (d: number | string) => {
    setSelectedDiameter(String(d));
    setIsDiaDropdownOpen(false);
    setDiaSearchQuery('');
    const inp = document.getElementById('searchDiameterInput') as HTMLInputElement | null;
    if (inp) {
      inp.value = String(d);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const formatDiameterLabel = (d: string | number) => {
    const s = String(d || '').trim();
    if (!s) return '';
    if (s.includes('x') || s.includes('X')) {
      return `${s.replace(/x/i, ' × ')} mm`;
    }
    return `${s} mm`;
  };

  const filteredDiameters = useMemo(() => {
    // 1. Filter rods by currently selected rod category
    const allRodsList = adminRods.length > 0 
      ? adminRods 
      : (typeof window !== 'undefined' && Array.isArray((window as any).__INITIAL_RODS__) ? (window as any).__INITIAL_RODS__ : []);

    const activeRods = (selectedRodCategory && selectedRodCategory !== 'all' && selectedRodCategory !== 'ALL')
      ? allRodsList.filter((r: any) => String(r.category || r.name || '').trim().toLowerCase() === selectedRodCategory.trim().toLowerCase())
      : allRodsList;

    const rawList = activeRods.length > 0
      ? Array.from(new Set(
          activeRods
            .map((r: any) => r.diameterMm !== undefined && r.diameterMm !== null ? String(r.diameterMm).trim() : '')
            .filter((d: string) => d.length > 0 && d !== '300')
        ))
      : availableRodDiameters.map(d => String(d).trim());

    const sorted = (rawList as string[]).sort((a: string, b: string) => {
      const isDimA = a.includes('x') || a.includes('X');
      const isDimB = b.includes('x') || b.includes('X');
      if (!isDimA && isDimB) return -1;
      if (isDimA && !isDimB) return 1;
      if (isDimA && isDimB) {
        const partsA = a.toLowerCase().split('x').map(p => parseFloat(p) || 0);
        const partsB = b.toLowerCase().split('x').map(p => parseFloat(p) || 0);
        if (partsA[0] !== partsB[0]) return partsA[0] - partsB[0];
        return (partsA[1] || 0) - (partsB[1] || 0);
      }
      const numA = parseFloat(a) || 0;
      const numB = parseFloat(b) || 0;
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });

    if (!diaSearchQuery.trim()) return sorted;
    const q = diaSearchQuery.toLowerCase().trim();
    return sorted.filter((d) => {
      const label = formatDiameterLabel(d).toLowerCase();
      return label.includes(q) || String(d).toLowerCase().includes(q);
    });
  }, [adminRods, availableRodDiameters, selectedRodCategory, diaSearchQuery]);

  // Keep selectedDiameter synchronized with the filtered list
  useEffect(() => {
    if (filteredDiameters.length > 0) {
      if (!selectedDiameter || !filteredDiameters.some((d: any) => String(d).toLowerCase() === String(selectedDiameter).toLowerCase())) {
        const next = String(filteredDiameters[0]);
        setSelectedDiameter(next);
        const inp = document.getElementById('searchDiameterInput') as HTMLInputElement | null;
        if (inp && inp.value !== next) {
          inp.value = next;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } else {
      setSelectedDiameter('');
    }
  }, [filteredDiameters, selectedDiameter]);

  const filteredAdminRods = adminRods.filter((r: any) => {
    if (adminSelectedCat !== 'all') {
      const cat = String(r.category || r.name || '').toLowerCase();
      if (cat !== adminSelectedCat.toLowerCase()) return false;
    }
    if (!adminSearchQuery.trim()) return true;
    const q = adminSearchQuery.toLowerCase();
    return (
      String(r.category || r.name || '').toLowerCase().includes(q) ||
      String(r.sku || '').toLowerCase().includes(q) ||
      String(r.diameterMm || '').includes(q) ||
      String(r.lengthIn || r.lengthFt || '').includes(q) ||
      String(r.notes || '').toLowerCase().includes(q)
    );
  });

  const filteredAdminRails = adminRails.filter((s: any) => {
    if (adminSelectedCat !== 'all') {
      const brand = String(s.category || s.brand || '').toLowerCase();
      if (brand !== adminSelectedCat.toLowerCase()) return false;
    }
    if (!adminSearchQuery.trim()) return true;
    const q = adminSearchQuery.toLowerCase();
    return (
      String(s.category || s.brand || '').toLowerCase().includes(q) ||
      String(s.modelName || '').toLowerCase().includes(q) ||
      String(s.sku || '').toLowerCase().includes(q) ||
      String(s.pitchMm || '').includes(q) ||
      String(s.lengthMm || '').includes(q) ||
      String(s.notes || '').toLowerCase().includes(q)
    );
  });

  if (isCheckingAuth) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, -apple-system, sans-serif',
        background: 'radial-gradient(ellipse at top, #1e293b, #0f172a 80%)',
        color: '#f8fafc',
        gap: '16px'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          border: '3px solid rgba(56, 189, 248, 0.2)',
          borderTopColor: '#38bdf8',
          borderRadius: '50%',
          animation: 'rodsync-spin 0.8s linear infinite'
        }}></div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>Verifying Access</h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>Checking compulsory authentication...</p>
        </div>
        <style>{`@keyframes rodsync-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {isInitializing && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-sans, -apple-system, sans-serif)',
          background: 'rgba(245, 247, 251, 0.96)',
          backdropFilter: 'blur(10px)',
          color: '#1e293b',
          gap: '16px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            border: '4px solid rgba(20, 184, 166, 0.15)',
            borderTopColor: '#14b8a6',
            borderRadius: '50%',
            animation: 'rodsync-spin 0.8s linear infinite'
          }}></div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 700 }}>Connecting to BroCutPro</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Syncing inventory from Firebase Cloud Database...</p>
          </div>
          <style>{`@keyframes rodsync-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Ambient Vibrant Wallpaper & Glass Canvas */}
      <div className="bg-ambient-canvas" aria-hidden="true">
        <div className="bg-overlay-white"></div>
      </div>

      {/* Floating Top-Left Back Button on Category & Portal Screens */}
      {portalView !== 'main' && (
        <div style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60 }}>
          {portalView === 'category' ? (
            visitedMain ? (
              <button
                type="button"
                className="btn-beautiful-back"
                onClick={() => handleSetPortalView('main')}
                title="Return to active inventory workspace"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back to Workspace</span>
              </button>
            ) : null
          ) : (
            <button
              type="button"
              className="btn-beautiful-back"
              onClick={() => handleSetPortalView('category')}
              title="Return to Category selection"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Back to Category</span>
            </button>
          )}
        </div>
      )}

      {/* Floating Logout on Category/Portal Screens */}
      {portalView !== 'main' && (
        <div className="portal-floating-top" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {userProfile && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: 'rgba(20, 184, 166, 0.12)',
                color: '#0d9488',
                border: '1px solid rgba(20, 184, 166, 0.3)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                userSelect: 'none'
              }}
              title={userProfile.isAdmin ? 'Administrator (Full Access)' : 'Authorized Cutting Operator'}
            >
              <span>{userProfile.isAdmin ? '👑' : '👤'}</span>
              <span>{userProfile.displayName}</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '4px',
                  background: '#0d9488',
                  color: '#fff',
                  fontWeight: 700,
                  textTransform: 'uppercase'
                }}
              >
                {userProfile.isAdmin ? 'Admin' : 'Operator'}
              </span>
            </div>
          )}
          {userProfile?.isAdmin && (
            <button
              type="button"
              className="btn-portal-ghost"
              title="Admin Panel: View & Delete Rods and Rails (dipanshu@pvtchopra.com)"
              onClick={() => {
                refreshAdminInventory();
                setAdminTab(systemMode === 'guided-rail' ? 'rail' : 'rod');
                setIsAdminManageOpen(true);
              }}
              style={{
                color: '#0d9488',
                border: '1px solid rgba(20, 184, 166, 0.35)',
                background: 'rgba(20, 184, 166, 0.08)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              <span>Delete Rod/Rail</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="btn-portal-ghost"
            title="Log Out of BroCutPro"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Logout</span>
          </button>
        </div>
      )}

      {/* Header / Navigation Bar (Hidden on Category & Portal Selection Pages) */}
      <header className="navbar" style={{ display: portalView === 'main' ? undefined : 'none' }}>
        <div className="nav-container">
          <div className="brand-group" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            {/* Beautiful Back Button in Main Navbar */}
            <button
              type="button"
              className="btn-beautiful-back btn-navbar-back"
              onClick={handleGoBack}
              title="Return to Category / Subcategory Selection"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>

            <div className="brand-text-wrap">
              <h1 className="brand-title" style={{ margin: 0, fontWeight: 800 }}>BroCut<span className="brand-accent">Pro</span></h1>
            </div>
          </div>

          <div className="nav-actions">
            {/* Category Portal Navigation Button */}
            <button
              type="button"
              className={`btn btn-sm btn-nav-pill ${portalView === 'category' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleSetPortalView('category')}
              title="Return to Category Selection"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.82rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>Categories</span>
            </button>

            {/* System Switcher (Toggle between Chrome Rod and Guided Rail - Hidden from frontend per user request) */}
            <div className="system-switcher-wrap" role="tablist" aria-label="Product Category Switcher" style={{ display: 'none' }}>
              <button
                type="button"
                role="tab"
                aria-selected={systemMode === 'chrome-rod'}
                id="btnToggleModeChromeRod"
                className={`system-switcher-btn ${systemMode === 'chrome-rod' ? 'active system-switcher-chrome' : ''}`}
                onClick={() => handleSwitchSystem('chrome-rod')}
                title="Switch to Chrome Rod Inventory & Cutting Calculator"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="20" x2="20" y2="4"></line>
                  <circle cx="8" cy="8" r="3"></circle>
                  <circle cx="16" cy="16" r="3"></circle>
                </svg>
                <span>Rod</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={systemMode === 'guided-rail'}
                id="btnToggleModeGuidedRail"
                className={`system-switcher-btn ${systemMode === 'guided-rail' ? 'active system-switcher-rail' : ''}`}
                onClick={() => handleSwitchSystem('guided-rail')}
                title="Switch to Guided Rail Model Search & Cut Validator"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
                <span>Guided Rail</span>
              </button>
            </div>



            {/* Firebase Cloud Console Link */}
            <a
              id="btnOpenFirebaseConsole"
              className="btn btn-secondary btn-sm btn-nav-pill"
              href="https://console.firebase.google.com/project/rodsync-cc8d4/firestore"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Firebase Cloud Console (rodsync-cc8d4)"
              style={{ display: 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Console ↗</span>
            </a>

            <button
              id="btnExportCsv"
              className="btn btn-secondary btn-sm btn-nav-pill"
              title="Export inventory to CSV file"
              style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Export</span>
            </button>

            {userProfile?.canBulkImport !== false && (
              <button
                className="btn btn-secondary btn-sm btn-nav-pill"
                title="Import inventory from CSV or Excel"
                onClick={() => setIsImportModalOpen(true)}
                style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span className="btn-nav-text">Import</span>
              </button>
            )}

            <button
              id="btnOpenCutLogsModal"
              className="btn btn-secondary btn-sm btn-cut-logs btn-nav-pill"
              title="View Cut History &amp; Offcut Logs"
              style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
              </svg>
              <span className="btn-nav-text">Cut Logs</span>
              <span className="badge badge-pill badge-primary" id="cutLogsBadge" style={{ marginLeft: '3px', fontSize: '0.65rem', padding: '0.08rem 0.35rem' }}>0</span>
            </button>

            {userProfile?.canAddInventory !== false && (
              <button
                id="btnOpenAddModal"
                className="btn btn-primary btn-sm btn-add-main btn-nav-pill"
                title="Add New Rod Stock to Inventory"
                style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    if ((window as any).openAddRodModal) {
                      (window as any).openAddRodModal();
                    } else if ((window as any).openAddModal) {
                      (window as any).openAddModal();
                    }
                  }
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span className="btn-nav-text">+ Add Rod</span>
              </button>
            )}

            {/* Guided Rail specific header actions */}
            <button
              id="btnGrOpenCutLogsModal"
              className="btn btn-secondary btn-sm btn-cut-logs btn-nav-pill"
              title="View Cut History &amp; Offcut Logs"
              style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
              </svg>
              <span className="btn-nav-text">Cut Logs</span>
              <span className="badge badge-pill badge-primary" id="grCutLogsBadge" style={{ marginLeft: '3px', fontSize: '0.65rem', padding: '0.08rem 0.35rem', background: '#6b8e23' }}>0</span>
            </button>

            <button
              id="btnGrExportCsv"
              className="btn btn-secondary btn-sm btn-nav-pill"
              title="Export Guided Rail inventory to CSV file"
              style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Export</span>
            </button>

            <a
              id="btnGrOpenFirebaseConsole"
              className="btn btn-secondary btn-sm btn-nav-pill"
              href="https://console.firebase.google.com/project/rodsync-cc8d4/firestore"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Firebase Cloud Console (rodsync-cc8d4)"
              style={{ display: 'none' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span className="btn-nav-text">Console ↗</span>
            </a>

            {userProfile?.canBulkImport !== false && (
              <button
                id="btnGrImportCsv"
                className="btn btn-secondary btn-sm btn-nav-pill"
                title="Import Guided Rail inventory from CSV or Excel"
                onClick={() => setIsGrImportModalOpen(true)}
                style={{ display: systemMode === 'guided-rail' ? 'inline-flex' : 'none' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span className="btn-nav-text">Import</span>
              </button>
            )}

            {userProfile?.canAddInventory !== false && (
              <button
                id="btnOpenAddRailModal"
                className="btn btn-primary btn-sm btn-nav-pill"
                title="Add Guided Rail stock to storage inventory"
                style={{
                  display: systemMode === 'guided-rail' ? 'inline-flex' : 'none',
                  background: 'linear-gradient(135deg, #6b8e23, #55731c)',
                  borderColor: '#55731c',
                  color: '#fff'
                }}
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).openAddRailStockModal) {
                    const sel = document.getElementById('grModelSelect') as HTMLSelectElement | null;
                    (window as any).openAddRailStockModal(sel?.value);
                  }
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span className="btn-nav-text">+ Add Rail</span>
              </button>
            )}

            {/* Admin Delete Rod/Rail Action Button (Admin dipanshu@pvtchopra.com only) */}
            {userProfile?.isAdmin && (
              <button
                id="btnOpenAdminDeleteModal"
                className="btn btn-secondary btn-sm btn-nav-pill"
                title="Admin Management Panel: View & Delete Rods and Rails"
                onClick={() => {
                  refreshAdminInventory();
                  setAdminTab(systemMode === 'guided-rail' ? 'rail' : 'rod');
                  setIsAdminManageOpen(true);
                }}
                style={{
                  color: systemMode === 'guided-rail' ? '#6b8e23' : '#0d9488',
                  borderColor: systemMode === 'guided-rail' ? 'rgba(107, 142, 35, 0.35)' : 'rgba(20, 184, 166, 0.35)',
                  background: systemMode === 'guided-rail' ? 'rgba(107, 142, 35, 0.08)' : 'rgba(20, 184, 166, 0.08)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                <span className="btn-nav-text">Delete Rod/Rail</span>
              </button>
            )}

            {/* User Profile Badge (Unified global color scheme for all users including admin) */}
            {userProfile && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: systemMode === 'guided-rail' ? 'rgba(107, 142, 35, 0.12)' : 'rgba(20, 184, 166, 0.12)',
                  color: systemMode === 'guided-rail' ? '#6b8e23' : '#0d9488',
                  border: `1px solid ${systemMode === 'guided-rail' ? 'rgba(107, 142, 35, 0.3)' : 'rgba(20, 184, 166, 0.3)'}`,
                  userSelect: 'none'
                }}
                title={userProfile.isAdmin ? 'Administrator (Full Access)' : 'Authorized Cutting Operator'}
              >
                <span>{userProfile.isAdmin ? '👑' : '👤'}</span>
                <span>{userProfile.displayName}</span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    padding: '0.08rem 0.32rem',
                    borderRadius: '4px',
                    background: systemMode === 'guided-rail' ? '#6b8e23' : '#0d9488',
                    color: '#fff',
                    fontWeight: 700,
                    textTransform: 'uppercase'
                  }}
                >
                  {userProfile.isAdmin ? 'Admin' : 'Operator'}
                </span>
              </div>
            )}

            {/* Log Out Button */}
            <button
              type="button"
              id="btnLogoutHeader"
              className="btn btn-secondary btn-sm btn-nav-pill btn-logout-nav"
              title="Log Out of BroCutPro"
              onClick={handleLogout}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span className="btn-nav-text">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          PORTAL SCREEN 1: CATEGORY SELECTION (Matching User Mockup)
          ════════════════════════════════════════════════════════════════ */}
      {portalView === 'category' && (
        <div className="portal-overlay-container">
          <div className="portal-content-wrap">
            {/* Top Stacked Layers Icon Badge */}
            <div className="portal-category-badge-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>

            {/* Main Heading & Orange Underline Pill */}
            <h2 className="portal-category-title-modern">Select Category</h2>
            <div className="portal-category-pill-underline"></div>

            {/* 2 Main Category Cards: Rod & Rail */}
            <div className="portal-category-cards-grid">
              {/* Rod Card */}
              <button
                type="button"
                className="cat-select-card cat-select-card-rod"
                onClick={() => {
                  handleSwitchSystem('chrome-rod');
                  handleSetPortalView('rod');
                }}
                title="Select Rod Category"
              >
                <div className="cat-card-left">
                  <div className="cat-card-badge-icon cat-badge-rod">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
                      <path d="M4 10l12-6a2 2 0 1 1 2 3.46L6 13.46"></path>
                      <path d="M4 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
                      <path d="M4 16l12-6a2 2 0 1 1 2 3.46L6 19.46"></path>
                      <circle cx="10" cy="12" r="2"></circle>
                    </svg>
                  </div>
                  <span className="cat-card-title-text">Rod</span>
                  <div className="cat-card-arrow-circle cat-arrow-rod">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </div>
                </div>
                <div className="cat-card-right">
                  <img src="/images/rods-3d.png" alt="Chrome Rod" className="cat-card-3d-img cat-card-3d-rod" />
                </div>
              </button>

              {/* Rail Card */}
              <button
                type="button"
                className="cat-select-card cat-select-card-rail"
                onClick={() => {
                  handleSwitchSystem('guided-rail');
                  handleSetPortalView('rail');
                }}
                title="Select Rail Category"
              >
                <div className="cat-card-left">
                  <div className="cat-card-badge-icon cat-badge-rail">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 4h14v3h-4v10h4v3H5v-3h4V7H5V4z"></path>
                    </svg>
                  </div>
                  <span className="cat-card-title-text">Rail</span>
                  <div className="cat-card-arrow-circle cat-arrow-rail">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </div>
                </div>
                <div className="cat-card-right">
                  <img src="/images/rail-3d.png" alt="Guided Rail" className="cat-card-3d-img cat-card-3d-rail" />
                </div>
              </button>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                CATEGORY MANAGEMENT: RAIL & ROD SUBCATEGORIES
                Strictly enforced: Only 2 Main Categories (Rod & Rail)
                ADMIN ONLY: dipanshu@pvtchopra.com (Hidden from regular users)
                ════════════════════════════════════════════════════════════════ */}
            {userProfile?.isAdmin && (
            <div className="cat-mgmt-container">
              <div className="cat-mgmt-header">
                <div className="cat-mgmt-badge-row">
                  <span className="cat-mgmt-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    Two Main Categories: Rod &amp; Rail
                  </span>
                  <span className="cat-mgmt-sync-status">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5"></path>
                    </svg>
                    Firebase Firestore Real-Time Sync
                  </span>
                </div>
                <h3 className="cat-mgmt-title">Category Management</h3>
                <p className="cat-mgmt-desc">
                  Rail and Rod are the only two main categories. Manage subcategories below — any added, edited, or removed subcategory immediately propagates across the entire site in real-time.
                </p>
              </div>

              <div className="cat-mgmt-columns">
                {/* Rod Subcategories Column */}
                <div className="cat-mgmt-card cat-mgmt-card-rod">
                  <div className="cat-card-header">
                    <div className="cat-card-title-group">
                      <div className="cat-card-icon cat-card-icon-rod">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <line x1="4" y1="20" x2="20" y2="4"></line>
                          <circle cx="8" cy="8" r="3"></circle>
                          <circle cx="16" cy="16" r="3"></circle>
                        </svg>
                      </div>
                      <div>
                        <h4 className="cat-card-title">Rod Subcategories</h4>
                      </div>
                    </div>
                    <span className="cat-card-count">{rodSubcategories.length} Subcategories</span>
                  </div>

                  {/* Add Rod Subcategory Input */}
                  {userProfile?.canManageCategories !== false ? (
                    <form
                      className="cat-card-add-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddSubcat('rod');
                      }}
                    >
                      <input
                        type="text"
                        className="cat-card-input"
                        placeholder="e.g. Hard Chrome Rod..."
                        value={newRodSubcat}
                        onChange={(e) => setNewRodSubcat(e.target.value)}
                        disabled={isSavingCategory}
                      />
                      <button
                        type="submit"
                        className="cat-card-btn-add cat-card-btn-add-rod"
                        disabled={isSavingCategory || !newRodSubcat.trim()}
                        title="Add new subcategory under Rod"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>Add to Rod</span>
                      </button>
                    </form>
                  ) : (
                    <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      🔒 Subcategory creation restricted to Admin
                    </div>
                  )}

                  {/* Rod Subcategories List */}
                  <div className="cat-subcat-list">
                    {rodSubcategories.length === 0 ? (
                      <div className="cat-subcat-empty">No subcategories defined for Rod yet.</div>
                    ) : (
                      rodSubcategories.map((subcat) => {
                        const isEditingThis = editingSubcat?.type === 'rod' && editingSubcat?.oldName === subcat;
                        return (
                          <div key={subcat} className="cat-subcat-item">
                            <div className="cat-subcat-name-wrap">
                              <span className="cat-subcat-tag cat-subcat-tag-rod">Rod</span>
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  className="cat-subcat-edit-input"
                                  value={editingSubcat.value}
                                  onChange={(e) => setEditingSubcat({ ...editingSubcat, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEditSubcat();
                                    if (e.key === 'Escape') setEditingSubcat(null);
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span className="cat-subcat-name" title={subcat}>{subcat}</span>
                              )}
                            </div>

                            <div className="cat-subcat-actions">
                              {userProfile?.canManageCategories !== false ? (
                                isEditingThis ? (
                                  <>
                                    <button
                                      type="button"
                                      className="cat-action-btn cat-action-btn-save"
                                      title="Save changes"
                                      onClick={handleSaveEditSubcat}
                                      disabled={isSavingCategory}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      className="cat-action-btn cat-action-btn-cancel"
                                      title="Cancel"
                                      onClick={() => setEditingSubcat(null)}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="cat-action-btn"
                                      title="Edit subcategory name"
                                      onClick={() => handleStartEditSubcat('rod', subcat)}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      className="cat-action-btn cat-action-btn-delete"
                                      title="Delete subcategory"
                                      onClick={() => handleDeleteSubcat('rod', subcat)}
                                      disabled={rodSubcategories.length <= 1}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                      </svg>
                                    </button>
                                  </>
                                )
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Rail Subcategories Column */}
                <div className="cat-mgmt-card cat-mgmt-card-rail">
                  <div className="cat-card-header">
                    <div className="cat-card-title-group">
                      <div className="cat-card-icon cat-card-icon-rail">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M3 5h18M3 12h18M3 19h18" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="cat-card-title">Rail Subcategories</h4>
                      </div>
                    </div>
                    <span className="cat-card-count">{railSubcategories.length} Subcategories</span>
                  </div>

                  {/* Add Rail Subcategory Input */}
                  {userProfile?.canManageCategories !== false ? (
                    <form
                      className="cat-card-add-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddSubcat('rail');
                      }}
                    >
                      <input
                        type="text"
                        className="cat-card-input"
                        placeholder="e.g. HIWIN, PMI, THK..."
                        value={newRailSubcat}
                        onChange={(e) => setNewRailSubcat(e.target.value)}
                        disabled={isSavingCategory}
                      />
                      <button
                        type="submit"
                        className="cat-card-btn-add cat-card-btn-add-rail"
                        disabled={isSavingCategory || !newRailSubcat.trim()}
                        title="Add new subcategory under Rail"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>Add to Rail</span>
                      </button>
                    </form>
                  ) : (
                    <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      🔒 Subcategory creation restricted to Admin
                    </div>
                  )}

                  {/* Rail Subcategories List */}
                  <div className="cat-subcat-list">
                    {railSubcategories.length === 0 ? (
                      <div className="cat-subcat-empty">No subcategories defined for Rail yet.</div>
                    ) : (
                      railSubcategories.map((subcat) => {
                        const isEditingThis = editingSubcat?.type === 'rail' && editingSubcat?.oldName === subcat;
                        return (
                          <div key={subcat} className="cat-subcat-item">
                            <div className="cat-subcat-name-wrap">
                              <span className="cat-subcat-tag cat-subcat-tag-rail">Rail</span>
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  className="cat-subcat-edit-input"
                                  value={editingSubcat.value}
                                  onChange={(e) => setEditingSubcat({ ...editingSubcat, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEditSubcat();
                                    if (e.key === 'Escape') setEditingSubcat(null);
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span className="cat-subcat-name" title={subcat}>{subcat}</span>
                              )}
                            </div>

                            <div className="cat-subcat-actions">
                              {userProfile?.canManageCategories !== false ? (
                                isEditingThis ? (
                                  <>
                                    <button
                                      type="button"
                                      className="cat-action-btn cat-action-btn-save"
                                      title="Save changes"
                                      onClick={handleSaveEditSubcat}
                                      disabled={isSavingCategory}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      className="cat-action-btn cat-action-btn-cancel"
                                      title="Cancel"
                                      onClick={() => setEditingSubcat(null)}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="cat-action-btn"
                                      title="Edit subcategory name"
                                      onClick={() => handleStartEditSubcat('rail', subcat)}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      className="cat-action-btn cat-action-btn-delete"
                                      title="Delete subcategory"
                                      onClick={() => handleDeleteSubcat('rail', subcat)}
                                      disabled={railSubcategories.length <= 1}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                      </svg>
                                    </button>
                                  </>
                                )
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PORTAL SCREEN 2: ROD CATAGORIES (Image 2)
          ════════════════════════════════════════════════════════════════ */}
      {portalView === 'rod' && (
        <div className="portal-overlay-container">
          <div className="portal-content-wrap">
            <div className="portal-nav-back-row">
              <button
                type="button"
                className="btn-beautiful-back btn-portal-back"
                onClick={() => handleSetPortalView('category')}
                title="Return to Category selection"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back to Category</span>
              </button>
            </div>

            <h2 className="portal-rod-title">ROD</h2>
            <p className="portal-category-subtitle">Select rod category to open catalog and cutting optimizer</p>

            <div className="portal-rod-pills-row">
              {(rodSubcategories.length > 0 ? rodSubcategories : availableRodNames).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="portal-rod-pill"
                  onClick={() => {
                    handleSelectRodCategory(name);
                    handleSetPortalView('main');
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PORTAL SCREEN 3: RAIL CATAGORIES (Identical UI/UX to Rod Screen)
          ════════════════════════════════════════════════════════════════ */}
      {portalView === 'rail' && (
        <div className="portal-overlay-container">
          <div className="portal-content-wrap">
            <div className="portal-nav-back-row">
              <button
                type="button"
                className="btn-beautiful-back btn-portal-back"
                onClick={() => handleSetPortalView('category')}
                title="Return to Category selection"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back to Category</span>
              </button>
            </div>

            <h2 className="portal-rod-title">RAIL</h2>
            <p className="portal-category-subtitle">Select guided rail category to open catalog and cut validator</p>

            <div className="portal-rod-pills-row">
              {(railSubcategories.length > 0 ? railSubcategories : availableRailBrands).map((brand) => (
                <button
                  key={brand}
                  type="button"
                  className="portal-rod-pill portal-rail-pill"
                  onClick={() => {
                    handleSelectRailBrand(brand);
                    handleSetPortalView('main');
                  }}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category & Brand Sub-Navigation Bar (Hidden from frontend per user request) */}
      <div className="category-subnav-bar" style={{ display: 'none' }}>
        <div className="category-subnav-container">
          <button
            type="button"
            className="cat-pill-btn btn-nav-back-category"
            onClick={() => handleSetPortalView('category')}
            title="Return to Category selection page"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Categories</span>
          </button>
          <div style={{ width: '1px', height: '18px', background: 'var(--border-subtle)', margin: '0 0.35rem' }} />
          {systemMode === 'chrome-rod' ? (
            <div className="category-pills-group" id="rodCategoryPillsGroup" role="tablist" aria-label="Rod Categories" suppressHydrationWarning></div>
          ) : (
            <div className="category-pills-group" id="railBrandPillsGroup" role="tablist" aria-label="Guided Rail Catagories" suppressHydrationWarning></div>
          )}
        </div>
      </div>

      {/*  Main Container  */}
      <main className="main-container" style={{ display: portalView === 'main' ? undefined : 'none' }}>
        {/*  Top KPI Summary Cards  */}
        <section className="kpi-grid" aria-label="Inventory Metrics Summary" style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}>
          <div className="kpi-card card-blue" data-kpi-filter="all" title="Click to view all catalog rod stock">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Rod Types</span>
              <div className="kpi-value" id="statTotalTypes">0</div>
              <span className="kpi-subtext">Distinct catalog variants</span>
            </div>
          </div>

          <div className="kpi-card card-indigo" data-kpi-filter="stock" title="Click to view total rods in storage">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Stock Quantity</span>
              <div className="kpi-value" id="statTotalQuantity">0</div>
              <span className="kpi-subtext">Bars / rods in storage</span>
            </div>
          </div>

          <div className="kpi-card card-emerald" data-kpi-filter="in_stock" title="Click to filter by available in-stock rods">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Available Rod Types</span>
              <div className="kpi-value" id="statInStockTypes">0</div>
              <span className="kpi-subtext">Items with Qty &gt; 0</span>
            </div>
          </div>

          <div className="kpi-card card-amber" data-kpi-filter="low_stock" title="Click to filter low stock rods (≤ 5 units)">
            <div className="kpi-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Low Stock Items</span>
              <div className="kpi-value" id="statLowStockCount">0</div>
              <span className="kpi-subtext">5 units or below</span>
            </div>
          </div>
        </section>

        {/*  SECTION: SMART ROD SEARCH (HERO TOOL)  */}
        <section className="card smart-search-card" id="smartSearchSection" style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}>
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="badge-icon badge-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <div>
                <h2 className="section-title">Smart Rod Match &amp; Cut Optimizer</h2>
                <p className="section-desc" style={{ display: 'none' }}>Search for an exact diameter and minimum required length. The system automatically surfaces and highlights the most efficient rod with minimal cutting waste.</p>
              </div>
            </div>
          </div>

          <form id="smartSearchForm" className="smart-search-form" autoComplete="off">
            <div className="search-inputs-grid">
              {/* Rod Catagorie Selection */}
              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="searchRodCategorySelect" className="field-label">
                    <span>Rod Catagorie</span>
                  </label>
                </div>
                <div className="input-with-icon">
                  <select
                    id="searchRodCategorySelect"
                    className="input-control font-semibold"
                    suppressHydrationWarning
                    value={selectedRodCategory}
                    onChange={(e) => handleSelectRodCategory(e.target.value)}
                  >
                    {(rodSubcategories.length > 0 ? rodSubcategories : availableRodNames).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Catagorie:</span>
                  <div className="chips-mini-scroll" id="rodQuickCategoryChips" suppressHydrationWarning></div>
                </div>
                <div className="field-hint" style={{ display: 'none' }}>Select rod catagorie</div>
              </div>

              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="searchDiameterInput" className="field-label">
                    <span>Required Diameter</span>
                    <span className="field-unit">(mm)</span>
                  </label>
                </div>
                <div className="custom-dia-select-wrap" ref={diaDropdownRef}>
                  <button
                    type="button"
                    className={`custom-dia-trigger ${isDiaDropdownOpen ? 'active' : ''}`}
                    onClick={() => setIsDiaDropdownOpen(!isDiaDropdownOpen)}
                    aria-haspopup="listbox"
                    aria-expanded={isDiaDropdownOpen}
                    title="Select required diameter (from database inventory)"
                  >
                    <span>{selectedDiameter ? formatDiameterLabel(selectedDiameter) : (filteredDiameters.length > 0 ? 'Select diameter' : 'No stock in DB')}</span>
                    <svg
                      className={`custom-dia-chevron ${isDiaDropdownOpen ? 'open' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>

                  {/* Hidden native input for script.js and form requirements */}
                  <input
                    type="text"
                    id="searchDiameterInput"
                    className="hidden-dia-input"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px', padding: 0, margin: 0, border: 'none' }}
                    value={selectedDiameter}
                    onChange={(e) => setSelectedDiameter(e.target.value)}
                    required
                  />

                  {isDiaDropdownOpen && (
                    <div className="custom-dia-menu" role="listbox">
                      <div className="custom-dia-search-wrap">
                        <svg
                          className="custom-dia-search-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="11" cy="11" r="8"></circle>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                          type="text"
                          className="custom-dia-search-input"
                          placeholder="Search diameter..."
                          value={diaSearchQuery}
                          onChange={(e) => setDiaSearchQuery(e.target.value)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      <div className="custom-dia-options-list">
                        {filteredDiameters.map((d: any) => {
                          const isSelected = String(selectedDiameter) === String(d);
                          return (
                            <div
                              key={d}
                              className={`custom-dia-option ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectDiameter(d)}
                              role="option"
                              aria-selected={isSelected}
                            >
                              <div className="custom-dia-option-left">
                                <span className={`custom-dia-radio-ring ${isSelected ? 'checked' : ''}`}></span>
                                <span className="custom-dia-option-label">{formatDiameterLabel(d)}</span>
                              </div>
                              {isSelected && (
                                <svg
                                  className="custom-dia-check-icon"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#0d9488"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </div>
                          );
                        })}

                        {filteredDiameters.length === 0 && (
                          <div className="custom-dia-no-results" style={{ padding: '0.85rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <span style={{ fontSize: '0.8rem', display: 'block', fontWeight: 600 }}>No diameters in database</span>
                            <span style={{ fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>Only diameters available in stock are shown.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="field-hint" style={{ display: 'none' }}>Exact match required</div>
              </div>

              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="searchLengthInput" className="field-label">
                    <span>Required Length</span>
                    <span className="field-unit" id="searchLengthUnitBadge">(In)</span>
                  </label>
                  <div className="unit-selector-pills" role="radiogroup" aria-label="Length Unit Selector" style={{ display: 'none' }}>
                    <button
                      type="button"
                      className="unit-pill active"
                      id="unitPillIn"
                      data-unit="in"
                      title="Set unit to Inches"
                    >
                      In
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="unitPillFt"
                      data-unit="ft"
                      title="Set unit to Feet"
                    >
                      Ft
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="unitPillM"
                      data-unit="m"
                      title="Set unit to Meters"
                    >
                      M
                    </button>
                  </div>
                </div>
                <div className="input-with-icon input-with-unit-select">
                  <input
                    type="number"
                    id="searchLengthInput"
                    className="input-control"
                    placeholder="e.g. 4.0"
                    step="any"
                    min="0.01"
                    autoComplete="off"
                    required
                  />
                  <select
                    id="searchLengthUnitSelect"
                    className="input-addon-select"
                    aria-label="Select Length Unit"
                  >
                    <option value="in">In</option>
                    <option value="ft">Ft</option>
                    <option value="m">M</option>
                  </select>
                </div>
                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="quickLengthChipsScroll">
                    <button type="button" className="btn-len-preset" data-len="1">1</button>
                    <button type="button" className="btn-len-preset" data-len="2">2</button>
                    <button type="button" className="btn-len-preset" data-len="4">4</button>
                    <button type="button" className="btn-len-preset" data-len="6">6</button>
                    <button type="button" className="btn-len-preset" data-len="8">8</button>
                    <button type="button" className="btn-len-preset" data-len="10">10</button>
                  </div>
                </div>
                <div className="field-hint" id="searchLengthHint" style={{ display: 'none' }}>Cut piece length</div>
              </div>

              <div className="input-field-group input-field-pieces">
                <div className="field-label-row">
                  <label htmlFor="searchPiecesInput" className="field-label">
                    <span>Pieces Required</span>
                    <span className="field-unit">(Qty)</span>
                  </label>
                </div>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnSearchPiecesDec" aria-label="Decrease Pieces">-</button>
                  <input
                    type="number"
                    id="searchPiecesInput"
                    className="input-control font-mono"
                    placeholder="1"
                    defaultValue="1"
                    min="1"
                    step="1"
                    required
                  />
                  <button type="button" className="btn-step-mini" id="btnSearchPiecesInc" aria-label="Increase Pieces">+</button>
                </div>
                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll">
                    <button type="button" className="btn-pcs-preset active" data-pcs="1">1 pc</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="2">2 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="5">5 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="10">10 pcs</button>
                  </div>
                </div>
                <div className="field-hint" id="searchTotalCutHint" style={{ display: 'none' }}>Total cut: 1 pc</div>
              </div>

              <div className="input-field-group input-field-actions">
                <div className="field-label-row field-label-empty" aria-hidden="true">&nbsp;</div>
                <div className="search-action-group">
                  <button type="submit" className="btn btn-primary btn-search" id="btnRunSmartSearch">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    Find Cuts &amp; Plan
                  </button>
                  <button type="button" className="btn btn-outline" id="btnResetSmartSearch">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                      <path d="M3 3v5h5"></path>
                    </svg>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/*  Smart Search Results Box  */}
          <div id="smartSearchResultsContainer" className="smart-results-container hidden">
            <div className="results-header-bar">
              <div className="results-header-info">
                <h3 className="results-heading" id="smartResultsHeading">Matching Rods &amp; Cut Plan</h3>
                <span className="badge badge-pill badge-primary" id="smartResultsCount">0 Found</span>
              </div>
              <div className="results-criteria" id="smartResultsCriteria"></div>
            </div>

            {/*  Interactive Smart Multi-Cut Optimization Plan  */}
            <div id="smartCutPlanSection" className="cut-plan-section hidden">
              <div className="cut-plan-card">
                <div className="cut-plan-header">
                  <div className="cut-plan-header-title">
                    <div className="badge-icon badge-scissors-icon-sm">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="6" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                        <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                        <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                      </svg>
                    </div>
                    <div>
                      <h4 className="cut-plan-title">Optimized Multi-Cut Plan</h4>
                      <p className="cut-plan-subtitle">Calculated for minimum waste across available stock</p>
                    </div>
                  </div>
                  <div className="cut-plan-strategy-pills" role="radiogroup" aria-label="Cutting Strategy">
                    <button type="button" className="strategy-pill active" id="btnStrategyFullLength" data-strategy="full_length_first" title="Cut from full length stock first, remainder from another rod">
                      ⚡ Full Length First
                    </button>
                    <button type="button" className="strategy-pill" id="btnStrategyOffcuts" data-strategy="offcuts_first" title="Consume offcut remnants first to clear scrap stock">
                      ♻️ Use Offcuts First
                    </button>
                  </div>
                </div>

                {/*  Plan KPI Metrics  */}
                <div className="cut-plan-metrics-grid" id="cutPlanMetricsGrid">
                  {/*  Dynamically populated  */}
                </div>

                {/*  Step-by-Step Rod Cutting Visual Breakdown  */}
                <div className="cut-plan-steps" id="cutPlanStepsList">
                  {/*  Dynamically populated  */}
                </div>

                {/*  Plan Action Footer  */}
                <div className="cut-plan-footer">
                  <div className="cut-plan-footer-left">
                    <button type="button" className="btn btn-sm btn-outline" id="btnToggleAllMatchingTable">
                      📋 <span id="toggleMatchingTableText">Show All Matching Rods Table</span>
                    </button>
                  </div>
                  <div className="cut-plan-footer-right">
                    <button type="button" className="btn btn-secondary btn-sm" id="btnPrintPlanSlip">
                      🖨️ Print Cut Slip
                    </button>
                    <button type="button" className="btn btn-primary" id="btnExecuteCutPlan">
                      ✂️ Execute This Cutting Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/*  Smart Search Results Table (Individual Rod Options)  */}
            <div className="table-responsive" id="smartResultsTableContainer">
              <table className="data-table" id="smartResultsTable">
                <thead>
                  <tr>
                    <th className="smart-col-fit hide-mobile">Fit Priority</th>
                    <th className="smart-col-rod">
                      <span className="desktop-only">Rod Catagorie</span>
                      <span className="mobile-only">Catagorie &amp; Fit</span>
                    </th>
                    <th className="smart-col-dia hide-mobile text-right">Diameter (mm)</th>
                    <th className="smart-col-len hide-mobile text-right"><span id="smartThLengthTitle">Length (In)</span></th>
                    <th className="smart-col-size mobile-only text-right">Length &amp; Offcut</th>
                    <th className="smart-col-qty text-right">Available</th>
                    <th className="smart-col-rem hide-mobile">Cut Remainder</th>
                    <th className="smart-col-action text-center">Action</th>
                  </tr>
                </thead>
                <tbody id="smartResultsTableBody">
                  {/*  Dynamically populated  */}
                </tbody>
              </table>
            </div>
          </div>

          {/*  Smart Search Empty State  */}
          <div id="smartSearchEmptyState" className="search-empty-state hidden">
            <div className="empty-icon-box">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h4 className="empty-title">No Matching Rods in Stock</h4>
            <p className="empty-desc" id="smartSearchEmptyDesc">We couldn&apos;t find any rod matching your required diameter with sufficient length and active stock.</p>
            <button className="btn btn-secondary btn-sm" id="btnEmptySuggestAdd">
              + Add This Specification to Stock
            </button>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            TOP KPI SUMMARY CARDS: GUIDED RAIL
            ════════════════════════════════════════════════════════════════ */}
        <section
          className="kpi-grid"
          id="grKpiGrid"
          aria-label="Guided Rail Inventory Metrics Summary"
          style={{ display: systemMode === 'guided-rail' ? undefined : 'none', marginBottom: '1.25rem' }}
        >
          <div className="kpi-card card-blue" data-gr-kpi-filter="all" title="Click to view all guided rail variants">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(107, 142, 35, 0.12)', color: '#6b8e23', borderColor: 'rgba(107, 142, 35, 0.25)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Rail Types</span>
              <div className="kpi-value" id="statGrTotalTypes">0</div>
              <span className="kpi-subtext">Distinct catalog variants</span>
            </div>
          </div>

          <div className="kpi-card card-indigo" data-gr-kpi-filter="stock" title="Click to view total rail bars in storage">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(94, 92, 230, 0.12)', color: '#5e5ce6', borderColor: 'rgba(94, 92, 230, 0.25)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Stock Quantity</span>
              <div className="kpi-value" id="statGrTotalQuantity">0</div>
              <span className="kpi-subtext">Bars / rails in storage</span>
            </div>
          </div>

          <div className="kpi-card card-emerald" data-gr-kpi-filter="in_stock" title="Click to filter by available in-stock rails">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(52, 199, 89, 0.14)', color: '#34c759', borderColor: 'rgba(52, 199, 89, 0.25)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Available Rail Types</span>
              <div className="kpi-value" id="statGrInStockTypes">0</div>
              <span className="kpi-subtext">Items with Qty &gt; 0</span>
            </div>
          </div>

          <div className="kpi-card card-amber" data-gr-kpi-filter="low_stock" title="Click to filter low stock rails (≤ 5 units)">
            <div className="kpi-icon-wrap" style={{ background: 'rgba(255, 149, 0, 0.14)', color: '#ff9500', borderColor: 'rgba(255, 149, 0, 0.25)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Low Stock Items</span>
              <div className="kpi-value" id="statGrLowStockCount">0</div>
              <span className="kpi-subtext">5 units or below</span>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION: GUIDED RAIL — SEARCH & CUTTING VALIDATOR
            ════════════════════════════════════════════════════════════════ */}
        <section className="card guided-rail-card" id="guidedRailSection" style={{ display: systemMode === 'guided-rail' ? undefined : 'none' }}>
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="badge-icon badge-accent" style={{ background: 'rgba(107, 142, 35, 0.12)', color: '#6b8e23', border: '1px solid rgba(107, 142, 35, 0.25)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
              </div>
              <div>
                <h2 className="section-title">Guided Rail — Model Search &amp; Cut Validator</h2>
                <p className="section-desc" style={{ display: 'none' }}>Select an HGR guided rail model, enter required cutting length and piece quantity, and validate hole spacing and end margins.</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                id="btnOpenAddRailFromSection"
                style={{ background: 'linear-gradient(135deg, #6b8e23, #55731c)', borderColor: '#55731c', gap: '0.4rem', borderRadius: '9999px', fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                title="Add new Guided Rail stock to storage inventory"
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).openAddRailStockModal) {
                    const sel = document.getElementById('grModelSelect') as HTMLSelectElement | null;
                    (window as any).openAddRailStockModal(sel?.value);
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                + Add Rail Stock
              </button>
            </div>
          </div>

          <form id="grValidateForm" className="smart-search-form" autoComplete="off">
            <div className="search-inputs-grid">

              {/* 0. Rail Category Selection */}
              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="grBrandSelect" className="field-label">
                    <span>Rail Catagorie</span>
                  </label>
                </div>
                <div className="input-with-icon">
                  <select id="grBrandSelect" className="input-control font-semibold" suppressHydrationWarning>
                    {(railSubcategories.length > 0 ? railSubcategories : availableRailBrands).map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Catagorie:</span>
                  <div className="chips-mini-scroll" id="grQuickBrandChips" suppressHydrationWarning></div>
                </div>
                <div className="field-hint" style={{ display: 'none' }}>Select rail catagorie</div>
              </div>

              {/* 1. Rail Model */}
              <div className="input-field-group">
                <div className="field-label-row">
                  <label htmlFor="grModelSelect" className="field-label">
                    <span>Rail Model</span>
                    <span className="field-unit" id="grModelUnitPill"></span>
                  </label>
                </div>
                <div className="input-with-icon">
                  <select id="grModelSelect" className="input-control font-mono" required suppressHydrationWarning>
                    <option value="">— Select Model —</option>
                  </select>
                </div>

                {/* Selected Model Spec Pill (Hidden per user request) */}
                <div id="grModelSpecCard" className="gr-spec-summary-pill hidden" style={{ display: 'none' }}>
                  <span className="gr-spec-badge-tag" id="grSpecBadgeName"></span>
                  <span className="gr-spec-detail" id="grSpecBadgeDetails"></span>
                </div>

                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grQuickChipsTrack"></div>
                </div>
                <div className="field-hint" id="grModelHint" style={{ display: 'none' }}>Select HGR rail model</div>
              </div>

              {/* Hidden preserved input for background PCC calculation */}
              <input type="hidden" id="grPccInput" />

              {/* 2. Required Cutting Length */}
              <div className="input-field-group input-field-gr-length">
                <div className="field-label-row gr-length-label-row">
                  <label htmlFor="grRequestedLength" className="field-label">
                    <span className="gr-label-full">Required Cutting Length</span>
                    <span className="gr-label-short">Cut Length</span>
                  </label>
                  <div className="unit-selector-pills gr-unit-selector-pills" role="radiogroup" aria-label="Rail Cutting Length Unit Selector" style={{ display: 'none' }}>
                    <button
                      type="button"
                      className="unit-pill active"
                      id="grUnitPillMm"
                      data-unit="mm"
                      title="Set unit to Millimeters"
                    >
                      mm
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="grUnitPillIn"
                      data-unit="in"
                      title="Set unit to Inches"
                    >
                      In
                    </button>
                    <button
                      type="button"
                      className="unit-pill"
                      id="grUnitPillFt"
                      data-unit="ft"
                      title="Set unit to Feet"
                    >
                      Ft
                    </button>
                  </div>
                </div>
                <div className="input-with-icon input-with-unit-select">
                  <input
                    type="number"
                    id="grRequestedLength"
                    className="input-control font-mono"
                    placeholder="e.g. 180"
                    step="any"
                    min="0.01"
                    required
                  />
                  <select
                    id="grLengthUnitSelect"
                    className="input-addon-select"
                    aria-label="Select Rail Cutting Length Unit"
                  >
                    <option value="mm">mm</option>
                    <option value="in">In</option>
                    <option value="ft">Ft</option>
                  </select>
                </div>
                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grQuickLengthChips">
                    <button type="button" className="btn-len-preset" data-grlen="60">60 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="120">120 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="180">180 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="240">240 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="300">300 mm</button>
                    <button type="button" className="btn-len-preset" data-grlen="500">500 mm</button>
                  </div>
                </div>
                <div className="field-hint" id="grLengthHint" style={{ display: 'none' }}>Cut piece length per rail</div>
              </div>

              {/* 3. Required No of Pieces */}
              <div className="input-field-group input-field-pieces">
                <div className="field-label-row">
                  <label htmlFor="grPiecesInput" className="field-label">
                    <span>Required No of Pieces</span>
                    <span className="field-unit">(Qty)</span>
                  </label>
                </div>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnGrPiecesDec" aria-label="Decrease Pieces">-</button>
                  <input
                    type="number"
                    id="grPiecesInput"
                    className="input-control font-mono"
                    placeholder="1"
                    defaultValue="1"
                    min="1"
                    step="1"
                    required
                  />
                  <button type="button" className="btn-step-mini" id="btnGrPiecesInc" aria-label="Increase Pieces">+</button>
                </div>
                <div className="quick-dia-chips-row" style={{ display: 'none' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grPiecesChipsTrack">
                    <button type="button" className="btn-pcs-preset active" data-pcs="1">1 pc</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="2">2 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="5">5 pcs</button>
                    <button type="button" className="btn-pcs-preset" data-pcs="10">10 pcs</button>
                  </div>
                </div>
                <div className="field-hint" id="grTotalPiecesHint" style={{ display: 'none' }}>Total cut: 1 pc</div>
              </div>

              {/* Action Buttons */}
              <div className="input-field-group input-field-actions">
                <div className="field-label-row field-label-empty" aria-hidden="true">&nbsp;</div>
                <div className="search-action-group">
                  <button type="submit" className="btn btn-primary btn-search" id="btnGrValidate" style={{ background: 'linear-gradient(135deg, #6b8e23, #55731c)', borderColor: '#55731c' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Validate Length
                  </button>
                  <button type="button" className="btn btn-outline" id="grResetBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                    </svg>
                    Reset
                  </button>
                </div>
              </div>

            </div>
          </form>

          {/* Valid Length Suggestions Box (when length is invalid: show valid lengths before and after) */}
          <div id="grLengthSuggestionsBox" className="gr-length-suggestions-box" style={{ display: 'none' }} suppressHydrationWarning></div>

          {/* Validation Result Box */}
          <div id="grValidationResult" className="gr-validation-result hidden"></div>

          {/* ════════════════════════════════════════════════════════════════
              GUIDED RAIL STOCK INVENTORY TABLE
              ════════════════════════════════════════════════════════════════ */}
          <div className="gr-stock-card" id="grStockInventoryCard" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 id="railInventorySectionTitle" style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>
                  {selectedRailBrand && selectedRailBrand !== 'all' && selectedRailBrand !== 'ALL'
                    ? `${selectedRailBrand} Stock Inventory`
                    : 'Rail Stock Inventory'}
                </h3>
                <span className="badge badge-pill badge-primary" id="grTotalStockBarsBadge" style={{ background: '#6b8e23', color: '#fff', fontSize: '0.72rem' }}>0 bars</span>
                {userProfile?.isAdmin && (
                  <button
                    type="button"
                    className="btn btn-xs"
                    title="Admin Delete Rails (dipanshu@pvtchopra.com)"
                    onClick={() => {
                      refreshAdminInventory();
                      setAdminTab('rail');
                      setIsAdminManageOpen(true);
                    }}
                    style={{
                      background: 'rgba(107, 142, 35, 0.1)',
                      color: '#6b8e23',
                      border: '1px solid rgba(107, 142, 35, 0.35)',
                      borderRadius: '9999px',
                      padding: '0.15rem 0.5rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete Rails</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  id="grStockSearchInput"
                  className="input-control"
                  placeholder="Search rail stock..."
                  style={{ width: '180px', height: '32px', fontSize: '0.78rem' }}
                />
              </div>
            </div>

            <div className="table-responsive" id="grStockTableContainer">
              <table className="data-table" id="grStockTable">
                <thead>
                  <tr>
                    <th>Rail Model</th>
                    <th className="text-center">Pitch (P)</th>
                    <th className="text-right" style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'flex-end' }}>
                        <span>Stock Bar Length</span>
                        <div
                          id="btnToggleGrStockUnit"
                          role="group"
                          aria-label="Toggle rail length display unit"
                          title="Click In or mm to switch length unit"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            userSelect: 'none',
                            lineHeight: 1,
                          }}
                        >
                          <span
                            id="grStockUnitPillIn"
                            data-unit="in"
                            style={{
                              padding: '2px 7px',
                              borderRadius: '9999px',
                              transition: 'all 0.15s ease',
                              background: 'transparent',
                              color: '#64748b',
                              cursor: 'pointer',
                            }}
                          >
                            In
                          </span>
                          <span
                            id="grStockUnitPillMm"
                            data-unit="mm"
                            style={{
                              padding: '2px 7px',
                              borderRadius: '9999px',
                              transition: 'all 0.15s ease',
                              background: '#6b8e23',
                              color: '#ffffff',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              cursor: 'pointer',
                            }}
                          >
                            mm
                          </span>
                        </div>
                      </div>
                    </th>
                    <th className="text-right">Available Qty</th>
                    <th className="text-center" style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody id="grStockTableBody">
                  {/* Populated dynamically */}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/*  SECTION: COMPLETE INVENTORY REPOSITORY  */}
        <section className="card inventory-card" id="inventorySection" style={{ display: systemMode === 'chrome-rod' ? undefined : 'none' }}>
          <div style={{ padding: '1.25rem 1.5rem 0.75rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 id="rodInventorySectionTitle" style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>
                  {selectedRodCategory && selectedRodCategory !== 'all' && selectedRodCategory !== 'ALL'
                    ? `${selectedRodCategory} Stock Inventory`
                    : 'Rod Stock Inventory'}
                </h3>
                <span className="badge badge-pill badge-primary" id="crTotalStockBarsBadge" style={{ background: '#0284c7', color: '#fff', fontSize: '0.72rem' }}>0 bars</span>
                {userProfile?.isAdmin && (
                  <button
                    type="button"
                    className="btn btn-xs"
                    title="Admin Delete Rods (dipanshu@pvtchopra.com)"
                    onClick={() => {
                      refreshAdminInventory();
                      setAdminTab('rod');
                      setIsAdminManageOpen(true);
                    }}
                    style={{
                      background: 'rgba(20, 184, 166, 0.1)',
                      color: '#0d9488',
                      border: '1px solid rgba(20, 184, 166, 0.35)',
                      borderRadius: '9999px',
                      padding: '0.15rem 0.5rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete Rods</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  id="filterKeyword"
                  className="input-control filter-search"
                  placeholder="Search rod stock..."
                  style={{ width: '180px', height: '32px', fontSize: '0.78rem', borderRadius: '9999px' }}
                />
              </div>
            </div>

            {/* Hidden preserved DOM elements for backward compatibility with filter helpers */}
            <div style={{ display: 'none' }}>
              <select id="filterDiameter" aria-label="Filter by diameter">
                <option value="all">All Diameters</option>
              </select>
              <div id="quickChipsBar">
                <div id="quickDiameterChipsTrack"></div>
              </div>
              <button id="btnToggleRoundLength" type="button"></button>
              <button id="btnViewRow" type="button"></button>
              <button id="btnViewCards" type="button"></button>
            </div>

            {/*  Inventory Data Table  */}
            <div className="table-responsive" id="inventoryTableContainer">
              <table className="data-table" id="inventoryTable">
                <thead>
                  <tr>
                    <th>Rod Model</th>
                    <th className="text-center">Diameter (mm)</th>
                    <th className="text-right">Stock Bar Length (In / mm)</th>
                    <th className="text-right">Available Qty</th>
                    <th className="text-center" style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody id="inventoryTableBody">
                  {/*  Dynamically populated  */}
                </tbody>
              </table>
            </div>

            {/*  Inventory Empty State  */}
            <div id="inventoryEmptyState" className="empty-state hidden">
              <div className="empty-icon-box">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </div>
              <h4 className="empty-title">No Rods Found</h4>
              <p className="empty-desc">No rod records match your current filters. Try resetting filters or adding a new rod.</p>
              <button className="btn btn-secondary btn-sm" id="btnResetInventoryFilters">Reset Filters</button>
            </div>

            {/*  Inventory Footer / Batch Actions  */}
            <div className="inventory-footer">
              <div className="footer-count" id="inventoryCountSummary">
                Showing 0 of 0 records
              </div>
            </div>
          </div>
        </section>
      </main>


      {/* IMPORT MODAL */}
      <div className={`modal-overlay ${isImportModalOpen ? '' : 'hidden'}`} style={{ zIndex: 100 }}>
        <div className="modal-card modal-card-sm" style={{ padding: '2rem' }}>
          <div className="modal-header">
            <h3 className="modal-title">Bulk Import Inventory</h3>
            <button type="button" className="modal-close-btn" onClick={() => setIsImportModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>
          <p className="modal-subtitle" style={{ marginBottom: '1.5rem' }}>Download the template (Format: <strong>Rod Name, Diameter (mm), Length (in), Quantity (Pieces), Storage Rack / Notes</strong>), or upload your completed .xlsx / .csv file.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadRodTemplate}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Rod Template (.xlsx / .csv)
            </button>
            <label className="btn btn-primary" style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Upload Bulk Rods (.csv, .xlsx)
              <input type="file" id="csvFileInput" accept=".csv,.xlsx,.xls" className="hidden-input" onChange={() => setIsImportModalOpen(false)} />
            </label>
          </div>
        </div>
      </div>

      {/* GUIDED RAIL IMPORT MODAL */}
      <div className={`modal-overlay ${isGrImportModalOpen ? '' : 'hidden'}`} style={{ zIndex: 100 }}>
        <div className="modal-card modal-card-sm" style={{ padding: '2rem' }}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div className="modal-icon-badge" style={{ background: 'rgba(107, 142, 35, 0.12)', color: '#6b8e23' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title">Bulk Import Guided Rail Stock</h3>
                <p className="modal-subtitle" style={{ margin: 0 }}>Import linear rail raw stock inventory from CSV or Excel</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => setIsGrImportModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>
          <p className="modal-subtitle" style={{ margin: '1rem 0 1.5rem' }}>
            Download the Excel template (Columns: <strong>Brand, Rail Name, Rail Diameter (mm), Length (in), Pieces, PCC / Hole Pitch (mm), Storage Rack / Notes</strong>), fill in your stock, and upload your completed .xlsx / .csv file.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadGrTemplate}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Guided Rail Template (.xlsx / .csv)
            </button>
            <label className="btn btn-primary" style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #6b8e23, #55731c)', borderColor: '#55731c', fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Upload Bulk Guided Rail (.xlsx, .csv)
              <input type="file" id="grCsvFileInput" accept=".csv,.xlsx,.xls" className="hidden-input" onChange={() => setIsGrImportModalOpen(false)} />
            </label>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          ADMIN MANAGEMENT PANEL: VIEW & DELETE RODS AND RAILS (Admin Only)
          ════════════════════════════════════════════════════════════════ */}
      {userProfile?.isAdmin && (
        <div className={`modal-overlay ${isAdminManageOpen ? '' : 'hidden'}`} style={{ zIndex: 120 }}>
          <div className="modal-card admin-delete-modal">
            {/* Header */}
            <div className="admin-delete-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: adminTab === 'rail' ? 'rgba(107, 142, 35, 0.12)' : 'rgba(20, 184, 166, 0.12)',
                  color: adminTab === 'rail' ? '#6b8e23' : '#0d9488',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}>
                  🛡️
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                      Admin Inventory Management
                    </h3>
                    <span style={{
                      background: adminTab === 'rail' ? 'rgba(107, 142, 35, 0.12)' : 'rgba(20, 184, 166, 0.12)',
                      color: adminTab === 'rail' ? '#6b8e23' : '#0d9488',
                      border: `1px solid ${adminTab === 'rail' ? 'rgba(107, 142, 35, 0.3)' : 'rgba(20, 184, 166, 0.3)'}`,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.45rem',
                      borderRadius: '9999px'
                    }}>
                      👑 Dipanshu (Admin)
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
                    View all active rods &amp; rails, filter, and permanently delete selected inventory records.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="btn-beautiful-back"
                  onClick={() => {
                    setIsAdminManageOpen(false);
                    setSelectedDeleteIds(new Set());
                  }}
                  title="Back to Inventory"
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => {
                    setIsAdminManageOpen(false);
                    setSelectedDeleteIds(new Set());
                  }}
                  aria-label="Close dialog"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="admin-delete-tabs">
              <button
                type="button"
                className={`admin-tab-btn rod ${adminTab === 'rod' ? 'active' : ''}`}
                onClick={() => {
                  setAdminTab('rod');
                  setAdminSelectedCat('all');
                  setSelectedDeleteIds(new Set());
                }}
              >
                <span>🥢</span>
                <span>Rod Stock ({adminRods.length} items • {adminRods.reduce((s, r) => s + (Number(r.quantity) || 0), 0)} bars)</span>
              </button>
              <button
                type="button"
                className={`admin-tab-btn rail ${adminTab === 'rail' ? 'active' : ''}`}
                onClick={() => {
                  setAdminTab('rail');
                  setAdminSelectedCat('all');
                  setSelectedDeleteIds(new Set());
                }}
              >
                <span>🛤️</span>
                <span>Rail Stock ({adminRails.length} items • {adminRails.reduce((s, r) => s + (Number(r.quantity) || 0), 0)} bars)</span>
              </button>
            </div>

            {/* Filter Toolbar */}
            <div className="admin-delete-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '240px' }}>
                <input
                  type="text"
                  className="input-control"
                  style={{ height: '36px', fontSize: '0.82rem', padding: '0 0.75rem', width: '100%', maxWidth: '320px' }}
                  placeholder={`Search ${adminTab === 'rod' ? 'rods by name, SKU, diameter, length...' : 'rails by brand, model, SKU, length...'}`}
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                />
                <select
                  className="input-control"
                  style={{ height: '36px', fontSize: '0.82rem', padding: '0 0.6rem', width: 'auto', minWidth: '150px' }}
                  value={adminSelectedCat}
                  onChange={(e) => setAdminSelectedCat(e.target.value)}
                >
                  <option value="all">All {adminTab === 'rod' ? 'Sub Categories' : 'Brands'}</option>
                  {(adminTab === 'rod' ? rodSubcategories : railSubcategories).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={selectAllFiltered}
                  title="Select all currently filtered items"
                  style={{ height: '34px', fontSize: '0.78rem' }}
                >
                  Select All ({(adminTab === 'rod' ? filteredAdminRods : filteredAdminRails).length})
                </button>
                {selectedDeleteIds.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={deselectAll}
                    style={{ height: '34px', fontSize: '0.78rem' }}
                  >
                    Deselect All
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={selectedDeleteIds.size === 0}
                  onClick={initiateBulkDelete}
                  style={{
                    height: '34px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: selectedDeleteIds.size > 0 ? '#dc2626' : '#f1f5f9',
                    color: selectedDeleteIds.size > 0 ? '#ffffff' : '#94a3b8',
                    border: '1px solid',
                    borderColor: selectedDeleteIds.size > 0 ? '#b91c1c' : '#cbd5e1',
                    borderRadius: '8px',
                    cursor: selectedDeleteIds.size > 0 ? 'pointer' : 'not-allowed',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  <span>Delete Selected ({selectedDeleteIds.size})</span>
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="admin-delete-table-wrap">
              {adminTab === 'rod' ? (
                <table className="admin-delete-table">
                  <thead>
                    <tr>
                      <th style={{ width: '42px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={filteredAdminRods.length > 0 && filteredAdminRods.every((r: any) => selectedDeleteIds.has(String(r.id)))}
                          onChange={(e) => {
                            if (e.target.checked) selectAllFiltered();
                            else deselectAll();
                          }}
                        />
                      </th>
                      <th>Sub Category</th>
                      <th>SKU</th>
                      <th>Diameter</th>
                      <th>Length (in)</th>
                      <th>Quantity</th>
                      <th>Notes</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminRods.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted, #94a3b8)' }}>
                          <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>🔍</div>
                          <div style={{ fontWeight: 600 }}>No rod stock records found</div>
                          <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>No rods match the active filter or search keywords.</div>
                        </td>
                      </tr>
                    ) : (
                      filteredAdminRods.map((rod: any) => {
                        const isSelected = selectedDeleteIds.has(String(rod.id));
                        return (
                          <tr key={rod.id} className={isSelected ? 'selected' : ''}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectDeleteItem(String(rod.id))}
                              />
                            </td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                color: '#0d9488',
                                background: 'rgba(20, 184, 166, 0.1)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem'
                              }}>
                                {rod.category || rod.name || 'Chrome Rod'}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                              {rod.sku || '—'}
                            </td>
                            <td style={{ fontWeight: 700 }}>
                              {rod.diameterMm} mm
                            </td>
                            <td>
                              {rod.lengthIn || rod.lengthFt || 0} in
                            </td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                background: 'rgba(14, 165, 233, 0.1)',
                                color: '#0284c7',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px'
                              }}>
                                {rod.quantity || 1} bars
                              </span>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rod.notes || '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-xs"
                                title="Delete this rod item"
                                onClick={() => initiateSingleDelete(rod, 'rod')}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#dc2626',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '6px',
                                  padding: '0.2rem 0.5rem',
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="admin-delete-table">
                  <thead>
                    <tr>
                      <th style={{ width: '42px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={filteredAdminRails.length > 0 && filteredAdminRails.every((s: any) => selectedDeleteIds.has(String(s.id)))}
                          onChange={(e) => {
                            if (e.target.checked) selectAllFiltered();
                            else deselectAll();
                          }}
                        />
                      </th>
                      <th>Brand / Sub Category</th>
                      <th>Model</th>
                      <th>SKU</th>
                      <th>Pitch (PCC)</th>
                      <th>Length (mm)</th>
                      <th>Quantity</th>
                      <th>Notes</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdminRails.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted, #94a3b8)' }}>
                          <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>🔍</div>
                          <div style={{ fontWeight: 600 }}>No guided rail stock records found</div>
                          <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>No rails match the active filter or search keywords.</div>
                        </td>
                      </tr>
                    ) : (
                      filteredAdminRails.map((rail: any) => {
                        const isSelected = selectedDeleteIds.has(String(rail.id));
                        return (
                          <tr key={rail.id} className={isSelected ? 'selected' : ''}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectDeleteItem(String(rail.id))}
                              />
                            </td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                color: '#6b8e23',
                                background: 'rgba(107, 142, 35, 0.1)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem'
                              }}>
                                {rail.category || rail.brand || 'HIWIN'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700 }}>
                              {rail.modelName || '—'}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                              {rail.sku || '—'}
                            </td>
                            <td>
                              {rail.pitchMm || 60} mm
                            </td>
                            <td>
                              {rail.lengthMm || 0} mm ({((rail.lengthMm || 0) / 25.4).toFixed(1)} in)
                            </td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                background: 'rgba(107, 142, 35, 0.1)',
                                color: '#55731c',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px'
                              }}>
                                {rail.quantity || 1} bars
                              </span>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rail.notes || '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-xs"
                                title="Delete this rail item"
                                onClick={() => initiateSingleDelete(rail, 'rail')}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#dc2626',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '6px',
                                  padding: '0.2rem 0.5rem',
                                  cursor: 'pointer'
                                }}
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Summary */}
            <div className="admin-delete-footer">
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                Showing <strong>{(adminTab === 'rod' ? filteredAdminRods : filteredAdminRails).length}</strong> of{' '}
                <strong>{(adminTab === 'rod' ? adminRods : adminRails).length}</strong> records •{' '}
                <strong style={{ color: selectedDeleteIds.size > 0 ? '#dc2626' : undefined }}>
                  {selectedDeleteIds.size} selected
                </strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIsAdminManageOpen(false)}
                >
                  Close
                </button>
                {selectedDeleteIds.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={initiateBulkDelete}
                    style={{ background: '#dc2626', borderColor: '#b91c1c', color: '#fff', fontWeight: 700 }}
                  >
                    🗑️ Delete Selected ({selectedDeleteIds.size})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          CONFIRMATION POPUP MODAL (Admin Only)
          ════════════════════════════════════════════════════════════════ */}
      {isConfirmDeleteOpen && (
        <div className="modal-overlay" style={{ zIndex: 130 }}>
          <div className="modal-card confirm-delete-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>
                  Confirm Permanent Deletion
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
                  This action is irreversible and will delete records from the database.
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-main, #1e293b)', marginBottom: '0.75rem' }}>
              Are you sure you want to delete the following <strong>{itemsToConfirmDelete.length} item(s)</strong> (total{' '}
              <strong>{itemsToConfirmDelete.reduce((s, i) => s + i.quantity, 0)} bars</strong>) from active inventory?
            </p>

            <div style={{
              background: 'var(--bg-surface-subtle, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: '8px',
              padding: '0.75rem',
              maxHeight: '180px',
              overflowY: 'auto',
              marginBottom: '1.25rem'
            }}>
              {itemsToConfirmDelete.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0',
                    borderBottom: '1px dashed var(--border-subtle, #e2e8f0)',
                    fontSize: '0.8rem'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: item.type === 'rod' ? '#0d9488' : '#6b8e23' }}>
                      {item.title}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>
                      {item.subtitle}
                    </span>
                  </div>
                  <span style={{
                    fontWeight: 700,
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#dc2626',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem'
                  }}>
                    {item.quantity} bar(s)
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isDeletingItems}
                onClick={() => {
                  setIsConfirmDeleteOpen(false);
                  setItemsToConfirmDelete([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeletingItems}
                onClick={executeDeleteItems}
                style={{
                  background: '#dc2626',
                  borderColor: '#b91c1c',
                  color: '#ffffff',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                {isDeletingItems ? (
                  <>
                    <span style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'rodsync-spin 0.8s linear infinite'
                    }} />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <span>🗑️ Yes, Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL: ADD / EDIT GUIDED RAIL STOCK
          ════════════════════════════════════════════════════════════════ */}
      <div className="modal-overlay hidden" id="grStockModalOverlay" role="dialog" aria-modal="true" aria-labelledby="grModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(107, 142, 35, 0.12)', color: '#6b8e23' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18M3 12h18M3 19h18" />
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="grModalTitle">Add Guided Rail Stock</h3>
                <p className="modal-subtitle">Specify rail model, stock bar length, and quantity in storage</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn-beautiful-back"
                id="btnGrStockHeaderBack"
                onClick={() => {
                  const overlay = document.getElementById('grStockModalOverlay');
                  if (overlay) overlay.classList.add('hidden');
                }}
                title="Back to Stock"
                style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
              <button type="button" className="modal-close-btn" id="btnCloseGrStockModal" aria-label="Close dialog">&times;</button>
            </div>
          </div>

          <form id="grStockForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="grStockEditId" value="" />

            {/* Brand & Model & PCC Selection */}
            <div className="form-row">
              <div className="form-group col-4">
                <label htmlFor="formGrBrandSelect" className="field-label">
                  Rail Catagorie <span className="required">*</span>
                </label>
                <select id="formGrBrandSelect" className="input-control font-semibold" required suppressHydrationWarning>
                  <option value="">— Select Catagorie —</option>
                </select>
                <div className="field-hint">Catagorie from DB</div>
              </div>

              <div className="form-group col-4">
                <label htmlFor="formGrModelSelect" className="field-label">
                  Guided Rail Model <span className="required">*</span>
                </label>
                <select id="formGrModelSelect" className="input-control font-mono" required suppressHydrationWarning>
                  <option value="">— Select Model —</option>
                </select>
                <div className="field-hint" id="formGrModelSpecHint">Select rail model</div>
              </div>

              <div className="form-group col-4">
                <label htmlFor="formGrPcc" className="field-label">
                  PCC (Pitch) <span className="field-unit">(mm)</span>
                </label>
                <div className="input-with-icon">
                  <input
                    type="number"
                    id="formGrPcc"
                    className="input-control font-mono font-semibold"
                    placeholder="60"
                    readOnly
                    style={{ backgroundColor: 'var(--bg-card-subtle, rgba(124, 58, 237, 0.05))', cursor: 'default' }}
                  />
                  <span className="input-addon">mm</span>
                </div>
                <div className="field-hint" id="formGrPccHint">Database PCC</div>
              </div>
            </div>

            {/* Length in mm */}
            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="formGrLengthMm" className="field-label">
                  Stock Bar Length (mm / In) <span className="required">*</span>
                </label>
                <div className="input-with-icon">
                  <input
                    type="number"
                    id="formGrLengthMm"
                    className="input-control font-mono"
                    placeholder="e.g. 3000"
                    step="1"
                    min="10"
                    required
                  />
                  <span className="input-addon">mm</span>
                </div>
                <div className="quick-dia-chips-row" style={{ marginTop: '4px' }}>
                  <span className="chips-mini-label">Quick:</span>
                  <div className="chips-mini-scroll" id="grStockQuickLengthChips">
                    <button type="button" className="btn-len-preset" data-stock-len="1000" title="1000 mm (39.37 In)">39.4&quot;</button>
                    <button type="button" className="btn-len-preset" data-stock-len="2000" title="2000 mm (78.74 In)">78.7&quot;</button>
                    <button type="button" className="btn-len-preset" data-stock-len="3000" title="3000 mm (118.11 In)">118.1&quot;</button>
                    <button type="button" className="btn-len-preset" data-stock-len="4000" title="4000 mm (157.48 In)">157.5&quot;</button>
                  </div>
                </div>
                <div className="field-hint" id="formGrLengthHint">Standard rail bar length (mm &amp; In)</div>
              </div>

              {/* Quantity in stock */}
              <div className="form-group col-6">
                <label htmlFor="formGrQuantity" className="field-label">
                  Quantity in Stock <span className="required">*</span>
                </label>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnGrStockQtyDec">-</button>
                  <input
                    type="number"
                    id="formGrQuantity"
                    className="input-control font-mono"
                    placeholder="10"
                    defaultValue="1"
                    min="0"
                    step="1"
                    required
                  />
                  <button type="button" className="btn-step-mini" id="btnGrStockQtyInc">+</button>
                </div>
                <div className="field-hint">Whole bar units in storage</div>
              </div>
            </div>

            {/* Storage Rack Location & Notes */}
            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formGrNotes" className="field-label">
                  Rack Location / Batch Notes <span className="optional">(Optional)</span>
                </label>
                <input
                  type="text"
                  id="formGrNotes"
                  className="input-control"
                  placeholder="e.g. Rack R-3, Heat #5021, Precision Ground"
                />
                <div className="field-hint">Storage location or supplier batch note</div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelGrStockModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnSaveGrStock" style={{ background: 'linear-gradient(135deg, #6b8e23, #55731c)', borderColor: '#55731c' }}>
                <span id="btnSaveGrStockText">Save Rail to Stock</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: GUIDED RAIL CUT & DEDUCT FROM STOCK
          ════════════════════════════════════════════════════════════════ */}
      <div className="modal-overlay hidden" id="grCutModalOverlay" role="dialog" aria-modal="true" aria-labelledby="grCutModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(107, 142, 35, 0.12)', color: '#6b8e23' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="grCutModalTitle">Cut Guided Rail from Stock</h3>
                <p className="modal-subtitle">Deduct cut piece(s) and save remnant offcut bar</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseGrCutModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="grCutForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="grCutStockId" value="" />

            {/* Source Bar Information Card */}
            <div className="cut-source-card" style={{ borderColor: 'rgba(107, 142, 35, 0.25)', background: 'rgba(107, 142, 35, 0.05)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="cut-source-title font-mono" id="grCutSourceModel" style={{ color: '#6b8e23', fontWeight: 700, fontSize: '1.05rem' }}>HGR20</div>
                <span className="badge badge-pill badge-primary" id="grCutSourceQty" style={{ background: '#6b8e23', fontSize: '0.75rem' }}>0 in stock</span>
              </div>
              <div className="cut-source-dims" style={{ marginTop: '5px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                Stock Bar Length: <strong id="grCutSourceLength" className="font-mono" style={{ color: 'var(--text-main)' }}>—</strong> &bull; Hole Pitch: <strong id="grCutSourcePitch" className="font-mono" style={{ color: 'var(--text-main)' }}>—</strong>
              </div>
            </div>

            <div className="form-row">
              {/* Cut Length */}
              <div className="form-group col-6">
                <label htmlFor="grCutPieceLengthInput" className="field-label">Cut Piece Length (mm) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="grCutPieceLengthInput" className="input-control font-mono" step="any" min="1" required />
                  <span className="input-addon">mm</span>
                </div>
                <div className="field-hint" id="grCutPieceLengthHint">Length per cut piece (mm &amp; In)</div>
              </div>

              {/* Pieces Count */}
              <div className="form-group col-6">
                <label htmlFor="grCutPiecesCountInput" className="field-label">Pieces to Cut <span className="required">*</span></label>
                <div className="input-with-icon stepper-input-search">
                  <button type="button" className="btn-step-mini" id="btnGrCutPiecesDec" aria-label="Decrease Pieces">-</button>
                  <input type="number" id="grCutPiecesCountInput" className="input-control font-mono" defaultValue="1" min="1" step="1" required />
                  <button type="button" className="btn-step-mini" id="btnGrCutPiecesInc" aria-label="Increase Pieces">+</button>
                </div>
                <div className="field-hint" id="grCutPiecesHint">Number of pieces to cut</div>
              </div>
            </div>

            {/* Dynamic Offcut Calculation Summary Card */}
            <div className="cut-calculation-card" style={{ borderRadius: 'var(--radius-lg)', padding: '0.85rem 1rem', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span className="text-muted">Total Cut:</span>
                <strong className="font-mono" id="grCalcTotalCut">0 mm (0.00&quot;)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span className="text-muted">Remnant Offcut:</span>
                <strong className="font-mono" id="grCalcRemnant" style={{ color: '#10b981' }}>0 mm (0.00&quot;)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span>Offcut Pitch Spans:</span>
                <span className="font-mono" id="grCalcRemnantPitch">—</span>
              </div>
              <div id="grCutErrorAlert" className="hidden" style={{ color: 'var(--danger-solid)', fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>
                ⚠️ Total cut length exceeds source bar length.
              </div>
            </div>

            {/* Remnant Option Checkbox */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" id="grSaveRemnantCheckbox" defaultChecked style={{ marginTop: '2px' }} />
                <span>Save remaining offcut bar back to Guided Rail stock inventory</span>
              </label>
            </div>

            {/* Customer / Project / Work Order Reference */}
            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="grCutOrderNotes" className="field-label">Order / Project Reference <span className="optional">(Optional)</span></label>
                <input type="text" id="grCutOrderNotes" className="input-control" placeholder="e.g. Job #204, Customer: Precision CNC, X-Axis" />
                <div className="field-hint">Added to cut log and remnant notes</div>
              </div>
            </div>

            {/* Operator & Assignment (Saved to Firebase Cut Logs) */}
            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="grCutAssignBy" className="field-label" id="grCutAssignByLabel">Assigned By <span className="optional">(Locked)</span></label>
                <input
                  type="text"
                  id="grCutAssignBy"
                  className="input-control"
                  placeholder="e.g. Supervisor"
                  readOnly
                  style={{ backgroundColor: 'var(--bg-surface-subtle, #f1f5f9)', cursor: 'not-allowed', fontWeight: 600 }}
                />
              </div>
              <div className="form-group col-6">
                <label htmlFor="grCutAssignTo" className="field-label">Assigned To <span className="optional">(Optional)</span></label>
                <input type="text" id="grCutAssignTo" className="input-control" placeholder="e.g. Machine Operator" />
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" id="btnGrPrintCutModalSlip" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginRight: 'auto' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>Print Cut Slip</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" id="btnCancelGrCutModal">Cancel</button>
                <button type="submit" className="btn btn-primary" id="btnConfirmGrCut" style={{ background: 'linear-gradient(135deg, #6b8e23, #55731c)', borderColor: '#55731c' }}>
                  <span id="btnConfirmGrCutText">✂️ Confirm &amp; Execute Cut</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: CONFIRM & EXECUTE GUIDED RAIL MULTI-CUT PLAN
          ════════════════════════════════════════════════════════════════ */}
      <div className="modal-overlay hidden" id="executeGrPlanModalOverlay" role="dialog" aria-modal="true" aria-labelledby="executeGrPlanModalTitle">
        <div className="modal-card" style={{ maxWidth: '580px', width: '95%', borderRadius: '20px', padding: '1.75rem 2rem', background: 'var(--bg-surface, #ffffff)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
          <div className="modal-header" style={{ marginBottom: '1.25rem', paddingBottom: 0, borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: '#f0f7e6',
                color: '#6b8e23',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <h3 className="modal-title" id="executeGrPlanModalTitle" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                Execute Cutting Plan
              </h3>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseExecuteGrPlanModal" aria-label="Close dialog" style={{ fontSize: '1.35rem', color: '#94a3b8' }}>&times;</button>
          </div>

          <form id="executeGrPlanForm" className="modal-form" autoComplete="off">
            <div id="executeGrPlanSummaryDetails" style={{ marginBottom: '1rem' }}>
              {/* Populated dynamically via JS: Summary Banner & Step Cards */}
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  id="grPlanAutoAddRemnants"
                  defaultChecked
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: '#6b8e23',
                    cursor: 'pointer',
                    borderRadius: '4px'
                  }}
                />
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                  Add offcut to stock
                </span>
              </label>
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label htmlFor="grPlanReasonInput" className="field-label" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '0.4rem', display: 'block' }}>
                Work Order / Reference
              </label>
              <input
                type="text"
                id="grPlanReasonInput"
                className="input-control"
                placeholder="e.g. WO-2026-001"
                style={{
                  height: '42px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  fontSize: '0.88rem',
                  padding: '0 0.85rem',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-main, #0f172a)',
                  width: '100%'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label htmlFor="grPlanCreatedBySelect" className="field-label" id="grPlanCreatedByLabel" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '0.4rem', display: 'block' }}>
                  Created By
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '0.9rem', color: '#64748b' }}>
                    👤
                  </span>
                  <select
                    id="grPlanCreatedBySelect"
                    className="input-control font-semibold"
                    style={{
                      height: '42px',
                      paddingLeft: '34px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      background: 'var(--bg-surface, #ffffff)',
                      color: 'var(--text-main, #0f172a)',
                      width: '100%',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Dipanshu">Dipanshu</option>
                    <option value="Bhawna">Bhawna</option>
                    <option value="Roshini">Roshini</option>
                    <option value="Suman">Suman</option>
                    <option value="Rajwant">Rajwant</option>
                    <option value="Mamta">Mamta</option>
                  </select>
                  <input type="hidden" id="grPlanCreatedByInput" />
                </div>
              </div>

              <div>
                <label htmlFor="grPlanAssignedBySelect" className="field-label" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '0.4rem', display: 'block' }}>
                  Assigned To
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '0.9rem', color: '#64748b' }}>
                    👤
                  </span>
                  <select
                    id="grPlanAssignedBySelect"
                    className="input-control"
                    style={{
                      height: '42px',
                      paddingLeft: '34px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      background: 'var(--bg-surface, #ffffff)',
                      color: 'var(--text-main, #0f172a)',
                      width: '100%',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select user</option>
                    <option value="Dipanshu">Dipanshu</option>
                    <option value="Bhawna">Bhawna</option>
                    <option value="Roshini">Roshini</option>
                    <option value="Suman">Suman</option>
                    <option value="Rajwant">Rajwant</option>
                    <option value="Mamta">Mamta</option>
                  </select>
                  <input type="hidden" id="grPlanAssignedByInput" />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.85rem' }}>
              <button
                type="button"
                className="btn"
                id="btnCancelExecuteGrPlanModal"
                style={{
                  height: '42px',
                  padding: '0 1.5rem',
                  borderRadius: '9999px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-main, #0f172a)',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                id="btnConfirmExecuteGrPlan"
                style={{
                  height: '42px',
                  padding: '0 1.6rem',
                  borderRadius: '9999px',
                  background: '#6b8e23',
                  borderColor: '#55731c',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(107, 142, 35, 0.25)'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span id="btnConfirmExecuteGrPlanText">Apply to Stock</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: ADD / EDIT ROD STOCK  */}
      <div className="modal-overlay hidden" id="rodModalOverlay" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="modalTitle">Add New Rod Stock</h3>
                <p className="modal-subtitle">Specify dimensions and initial quantity</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn-beautiful-back"
                id="btnRodStockHeaderBack"
                onClick={() => {
                  const overlay = document.getElementById('rodModalOverlay');
                  if (overlay) overlay.classList.add('hidden');
                }}
                title="Back to Stock"
                style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
              <button type="button" className="modal-close-btn" id="btnCloseRodModal" aria-label="Close dialog">&times;</button>
            </div>
          </div>

          <form id="rodForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="rodEditId" value="" />

            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formRodName" className="field-label">
                  Rod Catagorie <span className="required">*</span>
                </label>
                <select id="formRodName" className="input-control font-semibold" required suppressHydrationWarning>
                  <option value="Chrome Rod">Chrome Rod</option>
                </select>
                <div className="field-hint">Catagorie from DB</div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="formDiameterMm" className="field-label">Diameter (mm) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="text" id="formDiameterMm" className="input-control" placeholder="e.g. 12 or 100x100" required />
                  <span className="input-addon">mm</span>
                </div>
              </div>

              <div className="form-group col-6">
                <label htmlFor="formLengthFt" className="field-label">Length (In) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="formLengthFt" className="input-control" placeholder="6.0" step="0.1" min="0.1" required />
                  <span className="input-addon">In</span>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formQuantity" className="field-label">Quantity Available <span className="required">*</span></label>
                <input type="number" id="formQuantity" className="input-control" placeholder="10" min="0" step="1" required />
                <div className="field-hint">Whole units in stock</div>
              </div>
            </div>



            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelRodModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnSaveRod">
                <span id="btnSaveRodText">Save Rod to Stock</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: DEDUCT / DISPATCH ROD STOCK  */}
      <div className="modal-overlay hidden" id="deductModalOverlay" role="dialog" aria-modal="true" aria-labelledby="deductModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-warning-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"></path>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="deductModalTitle">Deduct Rod Stock</h3>
                <p className="modal-subtitle">Record rods cut, dispatched, or used</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseDeductModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="deductForm" className="modal-form">
            <input type="hidden" id="deductRodId" value="" />

            {/*  Target Rod Preview Box  */}
            <div className="deduct-rod-summary" id="deductRodSummary">
              <div className="summary-line">
                <span className="summary-label">Rod:</span>
                <span className="summary-value" id="deductRodName">—</span>
              </div>
              <div className="summary-line">
                <span className="summary-label">Dimensions:</span>
                <span className="summary-value" id="deductRodDimensions">—</span>
              </div>
              <div className="summary-line highlight-line">
                <span className="summary-label">Available in Stock:</span>
                <span className="summary-value font-mono" id="deductRodAvailableQty">0</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="deductQuantityInput" className="field-label">Quantity to Deduct <span className="required">*</span></label>
              <div className="stepper-input">
                <button type="button" className="btn-step" id="btnDeductStepDown">-</button>
                <input type="number" id="deductQuantityInput" className="input-control stepper-val" defaultValue="1" min="1" required />
                <button type="button" className="btn-step" id="btnDeductStepUp">+</button>
              </div>
              <div className="field-hint" id="deductRemainingHint">Remaining after deduction: 0</div>
            </div>

            <div className="form-group">
              <label htmlFor="deductReasonInput" className="field-label">Job / Reason <span className="optional">(Optional)</span></label>
              <input type="text" id="deductReasonInput" className="input-control" placeholder="e.g. Work Order #1042, Site Project A" />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelDeductModal">Cancel</button>
              <button type="submit" className="btn btn-danger" id="btnConfirmDeduct">
                Confirm Stock Deduction
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: CUT ROD & DEDUCT LENGTH / REMNANT  */}
      <div className="modal-overlay hidden" id="cutModalOverlay" role="dialog" aria-modal="true" aria-labelledby="cutModalTitle">
        <div className="modal-card">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-scissors-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="cutModalTitle">Cut Rod &amp; Deduct Size</h3>
                <p className="modal-subtitle">Deduct required length and automatically save the remaining offcut piece</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn-beautiful-back"
                id="btnCutModalHeaderBack"
                onClick={() => {
                  const overlay = document.getElementById('cutModalOverlay');
                  if (overlay) overlay.classList.add('hidden');
                }}
                title="Back to Stock"
                style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
              <button type="button" className="modal-close-btn" id="btnCloseCutModal" aria-label="Close dialog">&times;</button>
            </div>
          </div>

          <form id="cutForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="cutRodId" value="" />

            {/*  Selected Rod Info Card  */}
            <div className="cut-source-card">
              <div className="cut-source-title" id="cutRodName">—</div>
              <div className="cut-source-dims">
                Diameter: <strong id="cutRodDiameter">—</strong> mm &bull; Full Length: <strong id="cutRodFullLength">—</strong> In &bull; In Stock: <strong id="cutRodAvailableQty">—</strong> units
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-4">
                <label htmlFor="cutRequiredLengthInput" className="field-label">Cut Piece Length <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="cutRequiredLengthInput" className="input-control font-mono" placeholder="5.0" step="0.1" min="0.1" required />
                  <span className="input-addon">In</span>
                </div>
                <div className="field-hint">Length per individual piece</div>
              </div>

              <div className="form-group col-4">
                <label htmlFor="cutPiecesPerRodInput" className="field-label">Pieces / Cuts Needed <span className="required">*</span></label>
                <div className="stepper-input">
                  <button type="button" className="btn-step" id="btnCutPiecesPerRodDown">-</button>
                  <input type="number" id="cutPiecesPerRodInput" className="input-control stepper-val" defaultValue="1" min="1" step="1" required />
                  <button type="button" className="btn-step" id="btnCutPiecesPerRodUp">+</button>
                </div>
                <div className="field-hint" id="cutPiecesPerRodHint">Total pieces needed</div>
              </div>

              <div className="form-group col-4">
                <label htmlFor="cutPiecesQtyInput" className="field-label">Rods to Cut <span className="required">*</span></label>
                <div className="stepper-input">
                  <button type="button" className="btn-step" id="btnCutStepDown">-</button>
                  <input type="number" id="cutPiecesQtyInput" className="input-control stepper-val" defaultValue="1" min="1" step="1" required />
                  <button type="button" className="btn-step" id="btnCutStepUp">+</button>
                </div>
                <div className="field-hint">Quantity of source rods</div>
              </div>
            </div>

            {/*  Dynamic Live Cut Breakdown Card  */}
            <div className="cut-calculation-card" id="cutCalcCard">
              <div className="cut-calc-row">
                <span>Original Rod Length:</span>
                <strong className="font-mono" id="calcOrigLength">0.0 In</strong>
              </div>
              <div className="cut-calc-row">
                <span>Total Cut (Deducted):</span>
                <strong className="font-mono text-danger" id="calcCutLength">- 0.0 In</strong>
              </div>
              <div className="cut-calc-divider"></div>
              <div className="cut-calc-row highlight">
                <span>Remaining Offcut Piece:</span>
                <strong className="font-mono text-success" id="calcRemainLength">0.0 In</strong>
              </div>
              <div className="cut-visual-bar-wrap" id="cutVisualBarWrap" style={{ display: 'none' }}>
                <div className="cut-visual-bar" id="cutVisualMultiBar">
                  <div className="cut-bar-segment segment-cut" id="barCutSegment">Cut</div>
                  <div className="cut-bar-segment segment-remain" id="barRemainSegment">Offcut</div>
                </div>
              </div>
              <div className="cut-calc-note" id="calcRemainNote">
                ✂️ <strong>1 unit</strong> of <strong>12 mm × 1.0 In</strong> offcut rod will be added back into your inventory!
              </div>
            </div>

            {/* Multi-Rod Cut Suggestion Card (Active when cuts exceed single rod length) */}
            <div className="cut-multi-rod-suggestion-card hidden" id="cutMultiRodSuggestionCard">
              <div className="suggestion-card-header">
                <div className="suggestion-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>Multi-Rod Suggestion</span>
                </div>
                <span className="suggestion-title-text" id="cutSuggestionCapacityText">Max pcs exceeded</span>
              </div>

              <p className="suggestion-desc" id="cutSuggestionDesc">
                This rod cannot fit all requested pieces. System suggests cutting from this rod and cutting the remaining pieces from another rod in stock.
              </p>

              <div id="cutSuggestedRodContainer" className="suggested-rod-container">
                <div className="form-group" style={{ marginBottom: '0.65rem' }}>
                  <label htmlFor="cutSuggestedRodSelect" className="field-label" style={{ fontSize: '0.8rem' }}>
                    Select / Confirm Additional Rod from Stock:
                  </label>
                  <select id="cutSuggestedRodSelect" className="input-control font-mono select-compact"></select>
                </div>

                <div className="suggested-steps-preview" id="cutSuggestedStepsPreview">
                  {/* Populated dynamically with Rod 1 & Rod 2 breakdown and segmented bars */}
                </div>
              </div>

              <div id="cutNoStockWarning" className="suggestion-no-stock hidden">
                <div className="text-warning-bold">⚠️ No additional matching rods found in stock for this diameter!</div>
                <p style={{ fontSize: '0.8rem', margin: '0.35rem 0' }}>
                  To cut the remaining pieces, please add a new rod to stock or reduce the pieces required.
                </p>
                <button type="button" className="btn btn-secondary btn-sm" id="btnCutAddNewRodShortcut">
                  + Add New Rod to Stock
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" id="cutAutoAddRemnant" defaultChecked />
                <span>Automatically add the remaining offcut piece(s) back into stock inventory</span>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="cutReasonInput" className="field-label">Job / Work Order / Project Reference <span className="optional">(Optional)</span></label>
              <input type="text" id="cutReasonInput" className="input-control" placeholder="e.g. Work Order #1042, Site Project A" />
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="cutCreatedByInput" className="field-label" id="cutCreatedByLabel">
                  👤 Job Created By <span className="optional">(Locked)</span>
                </label>
                <input
                  type="text"
                  id="cutCreatedByInput"
                  className="input-control"
                  placeholder="e.g. Ahmed, Supervisor"
                  readOnly
                  style={{ backgroundColor: 'var(--bg-surface-subtle, #f1f5f9)', cursor: 'not-allowed', fontWeight: 600 }}
                />
              </div>
              <div className="form-group col-6">
                <label htmlFor="cutAssignedByInput" className="field-label">
                  🏷️ Job Assigned By <span className="optional">(Optional)</span>
                </label>
                <input type="text" id="cutAssignedByInput" className="input-control" placeholder="e.g. Manager Raza" />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" id="btnCancelCutModal">Cancel</button>
              <button type="submit" className="btn btn-primary" id="btnConfirmCut">
                ✂️ Confirm Cut &amp; Update Inventory
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: CONFIRM & EXECUTE CUTTING PLAN (Exact Match to User Mockup)  */}
      <div className="modal-overlay hidden" id="executePlanModalOverlay" role="dialog" aria-modal="true" aria-labelledby="executePlanModalTitle">
        <div className="modal-card" style={{ maxWidth: '580px', width: '95%', borderRadius: '20px', padding: '1.75rem 2rem', background: 'var(--bg-surface, #ffffff)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
          <div className="modal-header" style={{ marginBottom: '1.25rem', paddingBottom: 0, borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: '#e0f7f6',
                color: '#0d9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <h3 className="modal-title" id="executePlanModalTitle" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main, #0f172a)' }}>
                Execute Cutting Plan
              </h3>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseExecutePlanModal" aria-label="Close dialog" style={{ fontSize: '1.35rem', color: '#94a3b8' }}>&times;</button>
          </div>

          <form id="executePlanForm" className="modal-form" autoComplete="off">
            <div id="executePlanSummaryDetails" style={{ marginBottom: '1rem' }}>
              {/*  Populated dynamically via JS: Summary Banner & Step Cards  */}
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  id="planAutoAddRemnants"
                  defaultChecked
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: '#0d9488',
                    cursor: 'pointer',
                    borderRadius: '4px'
                  }}
                />
                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main, #0f172a)' }}>
                  Add offcut to stock
                </span>
              </label>
            </div>

            <div className="form-group" style={{ marginBottom: '1.1rem' }}>
              <label htmlFor="planReasonInput" className="field-label" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '0.4rem', display: 'block' }}>
                Work Order / Reference
              </label>
              <input
                type="text"
                id="planReasonInput"
                className="input-control"
                placeholder="e.g. WO-2026-001"
                style={{
                  height: '42px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  fontSize: '0.88rem',
                  padding: '0 0.85rem',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-main, #0f172a)',
                  width: '100%'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label htmlFor="planCreatedBySelect" className="field-label" id="planCreatedByLabel" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '0.4rem', display: 'block' }}>
                  Created By
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '0.9rem', color: '#64748b' }}>
                    👤
                  </span>
                  <select
                    id="planCreatedBySelect"
                    className="input-control font-semibold"
                    style={{
                      height: '42px',
                      paddingLeft: '34px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      background: 'var(--bg-surface, #ffffff)',
                      color: 'var(--text-main, #0f172a)',
                      width: '100%',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Dipanshu">Dipanshu</option>
                    <option value="Bhawna">Bhawna</option>
                    <option value="Roshini">Roshini</option>
                    <option value="Suman">Suman</option>
                    <option value="Rajwant">Rajwant</option>
                    <option value="Mamta">Mamta</option>
                  </select>
                  <input type="hidden" id="planCreatedByInput" />
                </div>
              </div>

              <div>
                <label htmlFor="planAssignedBySelect" className="field-label" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main, #0f172a)', marginBottom: '0.4rem', display: 'block' }}>
                  Assigned To
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '0.9rem', color: '#64748b' }}>
                    👤
                  </span>
                  <select
                    id="planAssignedBySelect"
                    className="input-control"
                    style={{
                      height: '42px',
                      paddingLeft: '34px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-subtle, #e2e8f0)',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      background: 'var(--bg-surface, #ffffff)',
                      color: 'var(--text-main, #0f172a)',
                      width: '100%',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select user</option>
                    <option value="Dipanshu">Dipanshu</option>
                    <option value="Bhawna">Bhawna</option>
                    <option value="Roshini">Roshini</option>
                    <option value="Suman">Suman</option>
                    <option value="Rajwant">Rajwant</option>
                    <option value="Mamta">Mamta</option>
                  </select>
                  <input type="hidden" id="planAssignedByInput" />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.85rem' }}>
              <button
                type="button"
                className="btn"
                id="btnCancelExecutePlanModal"
                style={{
                  height: '42px',
                  padding: '0 1.5rem',
                  borderRadius: '9999px',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-main, #0f172a)',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                id="btnConfirmExecutePlan"
                style={{
                  height: '42px',
                  padding: '0 1.6rem',
                  borderRadius: '9999px',
                  background: '#0d9488',
                  borderColor: '#0d9488',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Apply to Stock</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/*  MODAL: DUPLICATE ROD RESOLUTION PROMPT  */}
      <div className="modal-overlay hidden" id="duplicateModalOverlay" role="dialog" aria-modal="true" aria-labelledby="duplicateModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-info-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="duplicateModalTitle">Identical Rod Found</h3>
                <p className="modal-subtitle">A rod with this name, diameter, and length already exists</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseDuplicateModal">&times;</button>
          </div>

          <div className="duplicate-message-content">
            <p>You are attempting to add a rod matching an existing inventory entry:</p>
            <div className="duplicate-details-card" id="duplicateDetailsCard">
              {/*  Filled via JS  */}
            </div>
            <p className="subtext-note">Would you like to increase the stock quantity of the existing rod, or save this as an additional separate record?</p>
          </div>

          <div className="modal-footer duplicate-footer">
            <button type="button" className="btn btn-secondary btn-sm" id="btnDuplicateCancel">Cancel</button>
            <button type="button" className="btn btn-outline btn-sm" id="btnDuplicateKeepSeparate">Save as Separate</button>
            <button type="button" className="btn btn-primary btn-sm" id="btnDuplicateMerge">Add to Existing Stock</button>
          </div>
        </div>
      </div>

      {/*  MODAL: CUT HISTORY AUDIT LOGS  */}
      <div className="modal-overlay hidden" id="cutLogsModalOverlay" role="dialog" aria-modal="true" aria-labelledby="cutLogsModalTitle">
        <div className="modal-card" style={{ maxWidth: '1120px', width: '95vw', borderRadius: '24px', padding: '1.75rem 2rem', background: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
          <div className="modal-header" style={{ marginBottom: '1.25rem', paddingBottom: 0, borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#e0f7f6',
                color: '#0d9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="cutLogsModalTitle" style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Rod Cutting &amp; Offcut History
                </h3>   
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn-beautiful-back"
                id="btnCutLogsHeaderBack"
                onClick={() => {
                  const overlay = document.getElementById('cutLogsModalOverlay');
                  if (overlay) overlay.classList.add('hidden');
                }}
                title="Back to Stock"
                style={{ padding: '0.4rem 0.95rem', fontSize: '0.82rem' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
              <button
                type="button"
                className="modal-close-btn"
                id="btnCloseCutLogsModal"
                aria-label="Close dialog"
                style={{
                  fontSize: '1.25rem',
                  color: '#64748b',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Toolbar Row 1: Search, View Switch, Print Slip, Export (CSV) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.85rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            <div style={{ flex: '1', minWidth: '260px', position: 'relative' }}>
              <svg style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                id="filterCutLogsInput"
                className="input-control"
                placeholder="Search by rod ID, diameter, job reference..."
                style={{
                  width: '100%',
                  height: '42px',
                  paddingLeft: '42px',
                  paddingRight: '14px',
                  borderRadius: '9999px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.88rem',
                  color: '#0f172a'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              {/* View Toggle: List / Cards */}
              <div id="cutLogsViewToggleGroup" style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '9999px', padding: '3px', gap: '2px' }}>
                <button
                  type="button"
                  id="btnCutLogsTable"
                  className="btn btn-xs active"
                  style={{
                    borderRadius: '9999px',
                    border: 'none',
                    padding: '0.45rem 1.15rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer',
                    background: '#0d9488',
                    color: '#ffffff'
                  }}
                  title="List Table View"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                  <span>List</span>
                </button>
                <button
                  type="button"
                  id="btnCutLogsCards"
                  className="btn btn-xs"
                  style={{
                    borderRadius: '9999px',
                    border: 'none',
                    padding: '0.45rem 1.15rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: '#64748b'
                  }}
                  title="Cards View"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  <span>Cards</span>
                </button>
              </div>

              {/* Action: Print Slip */}
              <button
                type="button"
                id="btnPrintCombinedSlip"
                className="btn btn-secondary btn-sm"
                title="Print slip for selected cuts"
                style={{
                  height: '40px',
                  padding: '0 1.15rem',
                  borderRadius: '9999px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>Print Slip</span>
              </button>

              {/* Action: Export (CSV) */}
              <button
                type="button"
                id="btnExportCutLogsCsv"
                className="btn btn-secondary btn-sm"
                title="Export cut history to CSV"
                style={{
                  height: '40px',
                  padding: '0 1.15rem',
                  borderRadius: '9999px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Export (CSV)</span>
              </button>
            </div>
          </div>

          {/* Toolbar Row 2: Date Filters & Date Range Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0f172a', fontWeight: 700, fontSize: '0.88rem' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>Date:</span>
            </div>

            <div className="cut-logs-date-group" id="cutLogsDateQuickFilters" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <button type="button" className="date-pill-btn active" data-date-filter="all" id="btnDateFilterAll">
                All
              </button>
              <button type="button" className="date-pill-btn" data-date-filter="today" id="btnDateFilterToday">
                Today
              </button>
              <button type="button" className="date-pill-btn" data-date-filter="tomorrow" id="btnDateFilterTomorrow">
                Tomorrow
              </button>
              <button type="button" className="date-pill-btn" data-date-filter="yesterday" id="btnDateFilterYesterday">
                Yesterday
              </button>
            </div>

            <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 0.35rem' }} />

            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <input
                type="text"
                id="filterCutLogsDateRange"
                placeholder="dd/mm/yyyy - dd/mm/yyyy"
                readOnly
                style={{
                  height: '36px',
                  padding: '0 34px 0 12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.82rem',
                  color: '#64748b',
                  background: '#ffffff',
                  width: '215px',
                  cursor: 'pointer'
                }}
              />
              <input
                type="date"
                id="filterCutLogsDateInput"
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  opacity: 0,
                  width: '26px',
                  height: '26px',
                  cursor: 'pointer'
                }}
              />
              <svg style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#64748b' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
          </div>

          <div className="cut-logs-content-area" id="cutLogsContentArea" style={{ padding: 0 }}>
            {/* Desktop Table View */}
            <div className="table-responsive cut-logs-table-wrapper" id="cutLogsTableWrapper" style={{ maxHeight: '460px', overflowY: 'auto', overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <table className="data-table" id="cutLogsTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f0fdf9', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ width: '40px', textAlign: 'center', padding: '10px 8px' }}>
                      <input type="checkbox" id="selectAllCutLogs" title="Select / Deselect All Logs for Slip" style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#0d9488' }} />
                    </th>
                    <th style={{ width: '160px', padding: '10px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Date &amp; Time ⇅</th>
                    <th id="thCutLogsItemSpec" style={{ minWidth: '150px', padding: '10px 12px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Rod / Spec</th>
                    <th style={{ width: '90px', padding: '10px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Original</th>
                    <th style={{ width: '90px', padding: '10px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Cut Size</th>
                    <th style={{ width: '60px', padding: '10px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Qty</th>
                    <th style={{ width: '160px', padding: '10px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Remnant / Offcut</th>
                    <th style={{ width: '160px', padding: '10px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Created By</th>
                    <th style={{ width: '100px', textAlign: 'center', padding: '10px 8px', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Action</th>
                  </tr>
                </thead>
                <tbody id="cutLogsTableBody">
                  {/* Dynamically populated */}
                </tbody>
              </table>
            </div>

            {/*  Phone / Mobile Cards View  */}
            <div className="cut-logs-cards-container" id="cutLogsCardsContainer" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              {/*  Dynamically populated cards  */}
            </div>

            <div id="cutLogsEmptyState" className="empty-state hidden" style={{ padding: '2.5rem 1rem' }}>
              <div className="empty-icon-box" style={{ width: '48px', height: '48px', marginBottom: '0.75rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                </svg>
              </div>
              <h4 className="empty-title">No Cut Logs Recorded Yet</h4>
              <p className="empty-desc">When you cut rods to size, every cut and generated offcut will be recorded here.</p>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: 'none', background: '#ffffff', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span id="cutLogsCountText" style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
              Showing 0 of 0 logged cuts
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                id="btnFooterPrintCombinedSlip"
                title="Print slip with selected items"
                style={{
                  height: '42px',
                  padding: '0 1.6rem',
                  borderRadius: '9999px',
                  background: '#0d9488',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>Print Slip (<span id="selectedLogsCountFooter">0</span>)</span>
              </button>
              <button
                type="button"
                id="btnCloseCutLogsBottom"
                style={{
                  height: '42px',
                  padding: '0 1.6rem',
                  borderRadius: '9999px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  color: '#0f172a',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/*  MODAL: DUPLICATE ROD RESOLUTION PROMPT  */}
      <div className="modal-overlay hidden" id="duplicateModalOverlay" role="dialog" aria-modal="true" aria-labelledby="duplicateModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-warning-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="duplicateModalTitle">Identical Rod Found</h3>
                <p className="modal-subtitle">A rod with this name, diameter, and length already exists</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseDuplicateModal" aria-label="Close dialog">&times;</button>
          </div>

          <div className="duplicate-message-content">
            <p>You are attempting to add a rod matching an existing inventory entry. How would you like to handle this duplicate?</p>
            <div className="duplicate-details-card" id="duplicateDetailsCard">
              {/* Dynamically populated */}
            </div>
            <p className="subtext-note">Merging will increase the current stock quantity. Keeping separate will create an additional unique record.</p>
          </div>

          <div className="modal-footer duplicate-footer">
            <button type="button" className="btn btn-secondary btn-sm" id="btnDuplicateCancel">Cancel</button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" id="btnDuplicateKeepSeparate">Keep Separate</button>
              <button type="button" className="btn btn-primary btn-sm" id="btnDuplicateMerge">Merge Quantities</button>
            </div>
          </div>
        </div>
      </div>

      {/*  MODAL: GENERIC CONFIRMATION DIALOG  */}
      <div className="modal-overlay hidden" id="confirmModalOverlay" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <div className="modal-card modal-card-xs">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-danger-icon" id="confirmIconBadge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="confirmDialogTitle">Confirm Action</h3>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseConfirmModal">&times;</button>
          </div>
          <div className="confirm-body">
            <p id="confirmDialogMessage">Are you sure you want to proceed?</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" id="btnConfirmCancel">Cancel</button>
            <button type="button" className="btn btn-danger" id="btnConfirmOk">Confirm</button>
          </div>
        </div>
      </div>

      {/*  MODAL: PWA INSTALLATION GUIDE  */}
      <div className="modal-overlay hidden" id="installModalOverlay" role="dialog" aria-modal="true" aria-labelledby="installModalTitle">
        <div className="modal-card modal-card-sm">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge badge-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="installModalTitle">Install RodSync</h3>
                <p className="modal-subtitle">Use like a native app on iOS or Android</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseInstallModal">&times;</button>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <div id="installPromptDirect" className="hidden">
              <p style={{ marginBottom: '1rem' }}>Install RodSync on your device for instant offline access, fullscreen dashboard, and fast performance without opening a browser tab.</p>
              <button id="btnTriggerInstallPrompt" className="btn btn-primary" style={{ width: '100%' }}>
                📲 Tap to Install Application
              </button>
            </div>
            <div id="installInstructionsManual">
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '0.875rem', marginBottom: '1rem' }}>
                <strong style={{ color: 'var(--primary-800)', display: 'block', marginBottom: '0.25rem' }}>📱 iPhone / iPad (iOS Safari):</strong>
                <ol style={{ marginLeft: '1.25rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                  <li>Tap the <strong>Share</strong> button <svg style={{ verticalAlign: 'middle' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg> at the bottom of Safari.</li>
                  <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top right.</li>
                </ol>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '0.875rem' }}>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.25rem' }}>🤖 Android / Chrome:</strong>
                <ol style={{ marginLeft: '1.25rem', fontSize: '0.85rem', lineHeight: '1.6' }}>
                  <li>Tap the three dots menu <strong>&vellip;</strong> in Chrome.</li>
                  <li>Select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</li>
                </ol>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" id="btnCloseInstallModalBtn">Got it</button>
          </div>
        </div>
      </div>

      {/*  MOBILE ROD QUICK ACTION SHEET (Bottom Sheet for One-Line Rows)  */}
      <div id="mobileActionSheetOverlay" className="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="actionSheetRodName">
        <div className="modal-card modal-card-sm mobile-action-sheet" id="mobileActionSheetCard">
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="actionSheetRodName">Rod Details</h3>

              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseActionSheet" aria-label="Close action sheet">&times;</button>
          </div>
          <div className="action-sheet-body">
            <div className="sheet-spec-grid">
              <div className="sheet-spec-item">
                <span className="sheet-spec-label">Diameter</span>
                <span className="sheet-spec-val" id="actionSheetDiameter">--</span>
              </div>
              <div className="sheet-spec-item">
                <span className="sheet-spec-label">Length</span>
                <span className="sheet-spec-val" id="actionSheetLength">--</span>
              </div>
              <div className="sheet-spec-item">
                <span className="sheet-spec-label">Stock Qty</span>
                <span className="sheet-spec-val" id="actionSheetQty">--</span>
              </div>

            </div>

            <div className="sheet-stepper-wrap">
              <span className="sheet-spec-label">Quick Adjust Stock:</span>
              <div className="sheet-stepper">
                <button type="button" className="sheet-step-btn" id="btnSheetDec" title="Decrease stock by 1">- 1</button>
                <span className="sheet-qty-display" id="sheetQtyDisplay">0</span>
                <button type="button" className="sheet-step-btn" id="btnSheetInc" title="Increase stock by 1">+ 1</button>
              </div>
            </div>
            <div className="sheet-action-buttons">
              <button type="button" className="btn btn-primary btn-block" id="btnSheetCut">
                ✂️ Cut Size &amp; Save Offcut
              </button>
              <button type="button" className="btn btn-secondary btn-block" id="btnSheetDeduct">
                ➖ Deduct Whole Rods
              </button>
              <div className="sheet-btn-row">
                <button type="button" className="btn btn-secondary" id="btnSheetEdit" style={{ flex: '1' }}>
                  ✏️ Edit Details
                </button>
                <button type="button" className="btn btn-ghost text-danger" id="btnSheetDelete" style={{ flex: '1' }}>
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*  MODAL: FIREBASE CLOUD DATABASE STATUS  */}
      <div className={`modal-overlay ${isFirebaseModalOpen ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-labelledby="firebaseModalTitle" style={{ zIndex: 110 }}>
        <div className="modal-card" style={{ maxWidth: '750px', width: '95vw', maxHeight: 'calc(100vh - 2.5rem)', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-header" style={{ flexShrink: 0, padding: '1rem 1.5rem' }}>
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(238, 114, 20, 0.12)', color: '#ea580c', borderColor: 'rgba(238, 114, 20, 0.3)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                  <path d="M12 12v9"></path>
                  <path d="m8 17 4 4 4-4"></path>
                </svg>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <h3 className="modal-title" id="firebaseModalTitle" style={{ margin: 0, fontSize: '1.15rem' }}>Firebase Cloud Database</h3>
                  <span className="badge badge-success" style={{ padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    ● LIVE CLOUD STORAGE
                  </span>
                </div>
                <p className="modal-subtitle" style={{ margin: '2px 0 0 0' }}>Project ID: <strong>rodsync-cc8d4</strong> • Realtime Cloud Firestore</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => setIsFirebaseModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>

          <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', padding: '1.15rem 1.5rem', fontSize: '0.85rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              marginBottom: '1rem',
              gap: '0.75rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: '1 1 280px' }}>
                <span style={{ fontWeight: 700, display: 'block', color: '#065f46', fontSize: '0.875rem' }}>
                  🔥 Firebase Realtime Cloud Database Connected
                </span>
                <span style={{ fontSize: '0.78rem', color: '#047857' }}>
                  All stock additions, cuts, remnants, and edits sync directly with Firestore in real-time.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ gap: '0.35rem', fontSize: '0.78rem', padding: '0.35rem 0.75rem', fontWeight: 600 }}
                  onClick={() => {
                    syncInventoryData(true);
                  }}
                  title="Reload current inventory from Firebase"
                >
                  <span>🔄</span>
                  <span>Refresh Cloud Data</span>
                </button>
                <a
                  href="https://console.firebase.google.com/project/rodsync-cc8d4/firestore"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ gap: '0.35rem', fontSize: '0.78rem', padding: '0.35rem 0.75rem', fontWeight: 600, textDecoration: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#ea580c' }}
                >
                  <span>Open Console ↗</span>
                </a>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#ea580c' }}>
                  ⚙️ Active Firebase Configuration
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '5px', background: 'var(--bg-surface-elevated)', padding: '0.7rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace' }}>
                  <div><strong>Project:</strong> rodsync-cc8d4</div>
                  <div><strong>Auth Domain:</strong> rodsync-cc8d4.firebaseapp.com</div>
                  <div><strong>Storage:</strong> rodsync-cc8d4.firebasestorage.app</div>
                  <div><strong>Database:</strong> Cloud Firestore (default)</div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  ⚡ High-performance document database with automatic offline persistence and real-time multi-device synchronization.
                </div>
              </div>

              <div style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0d9488' }}>
                  📦 Synchronized Cloud Collections
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(20, 184, 166, 0.08)', borderRadius: '6px', border: '1px solid rgba(20, 184, 166, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0d9488' }}>🟢 Chrome Rod Stock</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Realtime Rod Stock</div>
                  </div>
                  <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(107, 142, 35, 0.08)', borderRadius: '6px', border: '1px solid rgba(107, 142, 35, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b8e23' }}>🌿 Guided Rail Stock</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Realtime Rail Stock</div>
                  </div>
                  <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>🔴 Rod Cut Logs</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Offcut Records</div>
                  </div>
                  <div style={{ padding: '0.5rem 0.65rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706' }}>🟠 Rail Cut Logs</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Rail Precision Cuts</div>
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4, padding: '0.5rem 0.65rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  💡 Whenever you cut a rod or rail, the remaining length is updated and the cut log is saved directly to Firebase.
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ flexShrink: 0, padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.95rem', fontWeight: 600 }}
              onClick={async () => {
                try {
                  const res = await fetch('/api/firebase-sync');
                  const data = await res.json();
                  if (data.success) {
                    alert(`✅ Firebase Cloud Database Connected! (Project: ${data.projectId || 'rodsync-cc8d4'}, Rods: ${data.rods?.length || 0}, Rails: ${data.railStock?.length || 0})`);
                  } else {
                    alert('Firebase status check: ' + (data.message || 'Offline fallback'));
                  }
                } catch (e: unknown) {
                  alert(`Test Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }}
            >
              🔄 Test Cloud Connection
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.8rem', padding: '0.45rem 1.15rem', fontWeight: 700, background: 'linear-gradient(135deg, #f97316, #ea580c)', borderColor: '#ea580c' }}
                onClick={async () => {
                  try {
                    const storedRods = (typeof window !== 'undefined' && (window as any).getVanillaRods) ? (window as any).getVanillaRods() : (window.__INITIAL_RODS__ || []);
                    const storedLogs = (typeof window !== 'undefined' && (window as any).getVanillaCutLogs) ? (window as any).getVanillaCutLogs() : (window.__INITIAL_CUT_LOGS__ || []);
                    const railStock = (typeof window !== 'undefined' && (window as any).getGuidedRailStock) ? (window as any).getGuidedRailStock() : [];
                    const res = await fetch('/api/firebase-sync', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rods: storedRods, cutLogs: storedLogs, railStock })
                    });
                    const data = await res.json();
                    if (data.success) {
                      alert('🔥 Success! All current stock and cut logs synchronized directly to Firebase Cloud Firestore!');
                    } else {
                      alert(`Sync Note: ${data.message || 'Saved locally, syncing to cloud.'}`);
                    }
                  } catch (e: unknown) {
                    alert(`Sync Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
                  }
                }}
              >
                ⚡ Push Stock &amp; Logs to Firebase
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: '0.8rem', padding: '0.45rem 0.95rem', fontWeight: 600 }} onClick={() => setIsFirebaseModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      </div>

      {/*  TOAST CONTAINER  */}
      <div id="toastContainer" className="toast-container" aria-live="polite" aria-atomic="true"></div>

      {/*  MOBILE NATIVE BOTTOM NAVIGATION BAR  */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation" style={{ display: portalView === 'main' ? undefined : 'none' }}>
        <button className="mob-nav-item active" id="mobNavSearch" title="Smart Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Search</span>
        </button>
        <button className="mob-nav-item" id="mobNavInventory" title="Inventory">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
          <span>Stock</span>
        </button>
        <button className="mob-nav-item mob-nav-add" id="mobNavAdd" title="Add Rod">
          <div className="mob-add-bubble">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <span>Add</span>
        </button>
        <button className="mob-nav-item" id="mobNavCutLogs" title="Cut Logs">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
            <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
            <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
          </svg>
          <span>Cut Logs</span>
        </button>
        <button className="mob-nav-item" id="mobNavInstall" title="Install App">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
          <span>Install</span>
        </button>
      </nav>

      {/* We load the script with afterInteractive strategy and trigger initialization on load */}
      <Script
        src="/script.js?v=135"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.initVanillaApp) {
            window.initVanillaApp();
          }
        }}
      />
      {/* Guided Rail Module */}
      <Script
        src="/guided-rail.js?v=135"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.initGuidedRail) {
            window.initGuidedRail();
          }
        }}
      />
    </>
  );
}
