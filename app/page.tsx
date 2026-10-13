'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

declare global {
  interface Window {
    __INITIAL_RODS__?: unknown[];
    __INITIAL_CUT_LOGS__?: unknown[];
    initVanillaApp?: () => void;
    setVanillaRods?: (rods: unknown[]) => void;
    setVanillaCutLogs?: (logs: unknown[]) => void;
    updateDashboardExternal?: () => void;
  }
}

const APPS_SCRIPT_SNIPPET = `function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rodsSheet = ss.getSheetByName("Rods Inventory");
    var logsSheet = ss.getSheetByName("Cut Logs");
    var rods = [];
    if (rodsSheet && rodsSheet.getLastRow() > 1) {
      var rodsData = rodsSheet.getDataRange().getValues();
      for (var i = 1; i < rodsData.length; i++) {
        var row = rodsData[i];
        if (!row[0] && !row[2]) continue;
        rods.push({
          id: String(row[0] || ''),
          sku: String(row[1] || ''),
          name: String(row[2] || ''),
          diameterMm: Number(row[3]) || 0,
          lengthFt: Number(row[4]) || 0,
          quantity: Number(row[5]) || 0,
          notes: String(row[6] || ''),
          updatedAt: row[7] || ''
        });
      }
    }
    var cutLogs = [];
    if (logsSheet && logsSheet.getLastRow() > 1) {
      var logsData = logsSheet.getDataRange().getValues();
      for (var j = 1; j < logsData.length; j++) {
        var lRow = logsData[j];
        if (!lRow[0] && !lRow[2]) continue;
        cutLogs.push({
          id: String(lRow[0] || ''),
          timestamp: lRow[1] || '',
          rodName: String(lRow[2] || ''),
          diameterMm: Number(lRow[3]) || 0,
          originalLengthFt: Number(lRow[4]) || 0,
          cutLengthFt: Number(lRow[5]) || 0,
          quantity: Number(lRow[6]) || 0,
          remainderFt: Number(lRow[7]) || 0,
          remnantAdded: lRow[8] === 'Yes' || lRow[8] === true,
          reason: String(lRow[9] || '')
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, configured: true, rods: rods, cutLogs: cutLogs })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : '';
    if (!contents) throw new Error("No payload received");
    var postData = JSON.parse(contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (postData.rods && Array.isArray(postData.rods)) {
      var rodsSheet = ss.getSheetByName("Rods Inventory") || ss.insertSheet("Rods Inventory");
      rodsSheet.clear();
      rodsSheet.appendRow(['id', 'sku', 'name', 'diameterMm', 'lengthFt', 'quantity', 'notes', 'updatedAt']);
      if (postData.rods.length > 0) {
        var rows = postData.rods.map(function(r) {
          return [r.id || '', r.sku || '', r.name || '', r.diameterMm || 0, r.lengthFt || 0, r.quantity || 0, r.notes || '', r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString()];
        });
        rodsSheet.getRange(2, 1, rows.length, 8).setValues(rows);
      }
      rodsSheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#e2e8f0");
      rodsSheet.setFrozenRows(1);
    }
    if (postData.cutLogs && Array.isArray(postData.cutLogs)) {
      var logsSheet = ss.getSheetByName("Cut Logs") || ss.insertSheet("Cut Logs");
      logsSheet.clear();
      logsSheet.appendRow(['id', 'timestamp', 'rodName', 'diameterMm', 'originalLengthFt', 'cutLengthFt', 'quantity', 'remainderFt', 'remnantAdded', 'reason']);
      if (postData.cutLogs.length > 0) {
        var logRows = postData.cutLogs.map(function(l) {
          return [l.id || '', l.timestamp ? new Date(l.timestamp).toISOString() : '', l.rodName || '', l.diameterMm || 0, l.originalLengthFt || 0, l.cutLengthFt || 0, l.quantity || 0, l.remainderFt || 0, (l.remnantAdded === true || l.remnantAdded === 'Yes') ? 'Yes' : 'No', l.reason || ''];
        });
        logsSheet.getRange(2, 1, logRows.length, 10).setValues(logRows);
      }
      logsSheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#e2e8f0");
      logsSheet.setFrozenRows(1);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Synced" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export default function Home() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [theme, setTheme] = useState(() => (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') || 'light' : 'light'));
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState<'connected' | 'disconnected' | 'unconfigured' | 'syncing'>('unconfigured');
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [inputScriptUrl, setInputScriptUrl] = useState(() => (typeof window !== 'undefined' ? (localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '') : (process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '')));
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  useEffect(() => {
    // Check initial theme from document element after mount
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const current = document.documentElement.getAttribute('data-theme') || 'light';
          setTheme(current);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed:', err));
    }

    return () => {
      observer.disconnect();
    };
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
    // Force full page navigation to login portal
    window.location.href = '/login';
  };

  const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.setAttribute('data-theme-mode', 'manual');
    localStorage.setItem('rodsync_theme', newTheme);

    // Attempt to target layout meta theme, if it exists
    const metaElems = document.getElementsByName('theme-color');
    if (metaElems.length > 0) metaElems[0].setAttribute('content', newTheme === 'dark' ? '#070a12' : '#f5f7fb');
    setTheme(newTheme);
  };

  const syncInventoryData = async (forceRefresh = false) => {
    let loadedFromBackend = false;
    setSheetsStatus('syncing');

    const hasLocalData = typeof window !== 'undefined' && (() => {
      try {
        const stored = localStorage.getItem('rod_stock_inventory_v1');
        return Boolean(stored && JSON.parse(stored).length > 0);
      } catch {
        return false;
      }
    })();

    if (!hasLocalData && !forceRefresh) {
      setIsInitializing(true);
    }

    const scriptUrl = (typeof window !== 'undefined' ? localStorage.getItem('rodsync_gsheets_script_url') : null) || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';

    // 1. Fetch from Google Sheets (via Apps Script or service account)
    try {
      const headers: Record<string, string> = {};
      if (scriptUrl) headers['x-google-script-url'] = scriptUrl;
      if (forceRefresh) headers['x-refresh'] = 'true';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 40000); // 40s timeout for cold starts
      const url = forceRefresh ? '/api/gsheets-sync?refresh=true' : '/api/gsheets-sync';
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const gsData = await res.json();
        if (gsData.configured) {
          if (gsData.success) {
            setSheetsStatus('connected');
            if (gsData.rods?.length > 0 || gsData.cutLogs?.length > 0) {
              window.__INITIAL_RODS__ = gsData.rods || [];
              window.__INITIAL_CUT_LOGS__ = gsData.cutLogs || [];
              if (typeof window !== 'undefined') {
                if (gsData.rods?.length > 0) {
                  localStorage.setItem('rod_stock_inventory_v1', JSON.stringify(gsData.rods));
                }
                if (gsData.cutLogs?.length > 0) {
                  localStorage.setItem('rod_stock_cut_logs_v1', JSON.stringify(gsData.cutLogs));
                }
              }
              if (window.setVanillaRods) window.setVanillaRods(gsData.rods || []);
              if (window.setVanillaCutLogs) window.setVanillaCutLogs(gsData.cutLogs || []);
              if (window.updateDashboardExternal) window.updateDashboardExternal();
              loadedFromBackend = true;
            }
          } else {
            setSheetsStatus('disconnected');
          }
        } else {
          setSheetsStatus('unconfigured');
        }
      } else {
        setSheetsStatus('disconnected');
      }
    } catch (err: unknown) {
      console.warn('GSheets read failed or not configured', err);
      setSheetsStatus('disconnected');
    }

    // 2. Fallback to Firebase
    try {
      if (!loadedFromBackend && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        const docRef = doc(db, 'inventory', 'main');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          window.__INITIAL_RODS__ = data.rods || [];
          window.__INITIAL_CUT_LOGS__ = data.cutLogs || [];
          if (window.setVanillaRods) window.setVanillaRods(data.rods || []);
          if (window.setVanillaCutLogs) window.setVanillaCutLogs(data.cutLogs || []);
          if (window.updateDashboardExternal) window.updateDashboardExternal();
        }
      }
    } catch (e: unknown) {
      console.warn('Firebase error, fallback to local defaults', e);
    } finally {
      if (window.initVanillaApp) {
        window.initVanillaApp();
      }
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    // Compulsory Async Authentication Check
    const verifyAuth = async () => {
      try {
        if (typeof document !== 'undefined') {
          const hasAuthCookie = document.cookie
            .split(';')
            .some((c) => c.trim().startsWith('auth=true'));

          if (!hasAuthCookie) {
            router.replace('/login');
            return;
          }

          // Asynchronously verify active session via API
          try {
            const res = await fetch('/api/auth/session');
            if (!res.ok) {
              router.replace('/login');
              return;
            }
          } catch {
            // Keep going if network is temporarily unreachable
          }
        }
        setIsCheckingAuth(false);
      } catch (err) {
        console.error('Session verify error:', err);
        setIsCheckingAuth(false);
      }
    };

    verifyAuth();

    const defaultUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
    if (typeof window !== 'undefined' && !localStorage.getItem('rodsync_gsheets_script_url') && defaultUrl) {
      localStorage.setItem('rodsync_gsheets_script_url', defaultUrl);
    }

    syncInventoryData(false);

    const handleSyncRods = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      // 1. Sync to Google Sheets
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify({ rods: customEvent.detail, scriptUrl })
      }).then(res => {
        if (res.ok) setSheetsStatus('connected');
      }).catch(err => {
        console.warn('GSheets sync failed:', err);
      });

      // 2. Sync to Firebase
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { rods: customEvent.detail }, { merge: true });
        } catch (error: unknown) {
          console.error("Firebase Sync Error (Rods):", error);
        }
      }
    };

    const handleSyncLogs = async (e: Event) => {
      const customEvent = e as CustomEvent<unknown[]>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      // 1. Sync to Google Sheets
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify({ cutLogs: customEvent.detail, scriptUrl })
      }).then(res => {
        if (res.ok) setSheetsStatus('connected');
      }).catch(err => {
        console.warn('GSheets sync failed:', err);
      });

      // 2. Sync to Firebase
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          await setDoc(doc(db, 'inventory', 'main'), { cutLogs: customEvent.detail }, { merge: true });
        } catch (error: unknown) {
          console.error("Firebase Sync Error (Cut Logs):", error);
        }
      }
    };

    const handleSyncBoth = async (e: Event) => {
      const customEvent = e as CustomEvent<{ rods?: unknown[]; cutLogs?: unknown[] }>;
      const scriptUrl = localStorage.getItem('rodsync_gsheets_script_url') || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL || '';
      const payload: Record<string, unknown> = { scriptUrl };
      if (customEvent.detail?.rods) payload.rods = customEvent.detail.rods;
      if (customEvent.detail?.cutLogs) payload.cutLogs = customEvent.detail.cutLogs;

      // 1. Sync combined payload to Google Sheets
      fetch('/api/gsheets-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(scriptUrl ? { 'x-google-script-url': scriptUrl } : {})
        },
        body: JSON.stringify(payload)
      }).then(res => {
        if (res.ok) setSheetsStatus('connected');
      }).catch(err => {
        console.warn('GSheets combined sync failed:', err);
      });

      // 2. Sync combined payload to Firebase
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          const updateData: Record<string, unknown> = {};
          if (customEvent.detail?.rods) updateData.rods = customEvent.detail.rods;
          if (customEvent.detail?.cutLogs) updateData.cutLogs = customEvent.detail.cutLogs;
          await setDoc(doc(db, 'inventory', 'main'), updateData, { merge: true });
        } catch (error: unknown) {
          console.error("Firebase Combined Sync Error:", error);
        }
      }
    };

    window.addEventListener('syncRodsToFirebase', handleSyncRods);
    window.addEventListener('syncCutLogsToFirebase', handleSyncLogs);
    window.addEventListener('syncBothToBackend', handleSyncBoth);

    return () => {
      window.removeEventListener('syncRodsToFirebase', handleSyncRods);
      window.removeEventListener('syncCutLogsToFirebase', handleSyncLogs);
      window.removeEventListener('syncBothToBackend', handleSyncBoth);
    };
  }, [router]);

  useEffect(() => {
    if (!isCheckingAuth && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        if (window.initVanillaApp) {
          window.initVanillaApp();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCheckingAuth]);

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
            border: '4px solid rgba(0, 113, 227, 0.15)',
            borderTopColor: '#0071e3',
            borderRadius: '50%',
            animation: 'rodsync-spin 0.8s linear infinite'
          }}></div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 700 }}>Connecting to RodSync</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Syncing rod inventory from Google Sheets...</p>
          </div>
          <style>{`@keyframes rodsync-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/*  Ambient Maple Leaf & White Glass Canvas  */}
      <div className="bg-ambient-canvas" aria-hidden="true">
        <div className="bg-leaf bg-leaf-1"></div>
        <div className="bg-leaf bg-leaf-2"></div>
        <div className="bg-leaf bg-leaf-3"></div>
        <div className="bg-overlay-white"></div>
      </div>

      {/*  Header / Navigation Bar  */}
      <header className="navbar">
        <div className="nav-container">
          <div className="brand-group">
            <div className="brand-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="20" x2="20" y2="4"></line>
                <circle cx="8" cy="8" r="3"></circle>
                <circle cx="16" cy="16" r="3"></circle>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 className="brand-title" style={{ margin: 0 }}>Rod<span className="brand-accent">Sync</span></h1>
                <button
                  type="button"
                  onClick={() => setIsSheetsModalOpen(true)}
                  className="db-status-pill"
                  title="Google Sheets Apps Script Connection & Setup"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle, rgba(0,0,0,0.1))',
                    background: 'var(--bg-surface-elevated, rgba(255,255,255,0.7))',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #475569)',
                    backdropFilter: 'blur(8px)'
                  }}
                >
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: sheetsStatus === 'connected' ? '#10b981' : sheetsStatus === 'unconfigured' ? '#94a3b8' : '#f59e0b',
                    boxShadow: sheetsStatus === 'connected' ? '0 0 6px #10b981' : 'none'
                  }}></span>
                  {sheetsStatus === 'connected' ? 'Google Sheets Live' : sheetsStatus === 'unconfigured' ? 'Google Sheets' : 'Sheets Sync'}
                </button>
              </div>
              <p className="brand-subtitle">Metal Rod Inventory &amp; Smart Cut Optimizer</p>
            </div>
          </div>

          <div className="nav-actions">
            <button onClick={toggleTheme} className="btn btn-secondary btn-sm btn-icon-mobile" title="Toggle Dark/Light Mode" style={{ transition: 'all 0.3s ease' }}>
              <div style={{ position: 'relative', width: '15px', height: '15px', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  transform: theme === 'dark' ? 'translateY(100%)' : 'translateY(0)',
                  transition: 'transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55)', opacity: theme === 'dark' ? 0 : 1
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                </div>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  transform: theme === 'dark' ? 'translateY(0)' : 'translateY(-100%)',
                  transition: 'transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55)', opacity: theme === 'dark' ? 1 : 0
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line>
                  </svg>
                </div>
              </div>
              <span className="btn-text-full">Theme</span>
            </button>
            <button id="btnInstallPwa" className="btn btn-secondary btn-sm btn-install-pwa" title="Install RodSync as a mobile / desktop App">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
              <span className="btn-text-full">Install App</span>
            </button>

            <button id="btnExportCsv" className="btn btn-secondary btn-sm btn-icon-mobile" title="Export inventory to CSV file">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span className="btn-text-full">Export CSV</span>
            </button>

            <button className="btn btn-secondary btn-sm btn-icon-mobile" title="Import inventory from CSV" onClick={() => setIsImportModalOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span className="btn-text-full">Import CSV</span>
            </button>

            <button id="btnOpenCutLogsModal" className="btn btn-secondary btn-sm btn-cut-logs" title="View Cut History &amp; Offcut Logs">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
              </svg>
              <span>Cut Logs</span>
              <span className="badge badge-pill badge-primary" id="cutLogsBadge" style={{ marginLeft: '4px', fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}>0</span>
            </button>

            <button id="btnOpenAddModal" className="btn btn-primary btn-sm btn-add-main">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Rod Stock</span>
            </button>

            <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-medium)', margin: '0 4px' }}></div>

            <button onClick={handleLogout} className="btn btn-secondary btn-sm text-danger" title="Securely Sign Out" style={{ transition: 'all 0.3s ease' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span className="btn-text-full" style={{ marginLeft: '4px' }}>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/*  Main Container  */}
      <main className="main-container">
        {/*  Top KPI Summary Cards  */}
        <section className="kpi-grid" aria-label="Inventory Metrics Summary">
          <div className="kpi-card card-blue">
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

          <div className="kpi-card card-indigo">
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

          <div className="kpi-card card-emerald">
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

          <div className="kpi-card card-amber">
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
        <section className="card smart-search-card" id="smartSearchSection">
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
                <p className="section-desc">Search for an exact diameter and minimum required length. The system automatically surfaces and highlights the most efficient rod with minimal cutting waste.</p>
              </div>
            </div>
          </div>

          <form id="smartSearchForm" className="smart-search-form" autoComplete="off">
            <div className="search-inputs-grid">
              <div className="input-field-group">
                <label htmlFor="searchDiameterInput" className="field-label">
                  <span>Required Diameter</span>
                  <span className="field-unit">(mm)</span>
                </label>
                <div className="input-with-icon">
                  <input type="number" id="searchDiameterInput" className="input-control" placeholder="e.g. 12" step="0.1" min="0.1" required />
                  <span className="input-addon">mm</span>
                </div>
                <div className="field-hint">Exact match required</div>
              </div>

              <div className="input-field-group">
                <label htmlFor="searchLengthInput" className="field-label">
                  <span>Minimum Required Length</span>
                  <span className="field-unit">(ft)</span>
                </label>
                <div className="input-with-icon">
                  <input type="number" id="searchLengthInput" className="input-control" placeholder="e.g. 6.0" step="0.1" min="0.1" required />
                  <span className="input-addon">ft</span>
                </div>
                <div className="field-hint">Length &ge; required value</div>
              </div>

              <div className="search-action-group">
                <button type="submit" className="btn btn-primary btn-search" id="btnRunSmartSearch">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  Find Matching Rods
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
          </form>

          {/*  Smart Search Results Box  */}
          <div id="smartSearchResultsContainer" className="smart-results-container hidden">
            <div className="results-header-bar">
              <div className="results-header-info">
                <h3 className="results-heading" id="smartResultsHeading">Matching Rods</h3>
                <span className="badge badge-pill badge-primary" id="smartResultsCount">0 Found</span>
              </div>
              <div className="results-criteria" id="smartResultsCriteria"></div>
            </div>

            {/*  Smart Search Results Table  */}
            <div className="table-responsive" id="smartResultsTableContainer">
              <table className="data-table" id="smartResultsTable">
                <thead>
                  <tr>
                    <th className="smart-col-fit hide-mobile">Fit Priority</th>
                    <th className="smart-col-rod">
                      <span className="desktop-only">Rod Name / Type</span>
                      <span className="mobile-only">Rod &amp; Fit</span>
                    </th>
                    <th className="smart-col-dia hide-mobile text-right">Diameter (mm)</th>
                    <th className="smart-col-len hide-mobile text-right">Length (ft)</th>
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

        {/*  SECTION: COMPLETE INVENTORY REPOSITORY  */}
        <section className="card inventory-card" id="inventorySection">
          <div className="quick-chips-bar" id="quickChipsBar">
            <span className="chips-title">Quick Sizes:</span>
            <div className="chips-scroll-track" id="quickDiameterChipsTrack">
              {/*  Dynamically populated via script.js  */}
            </div>
          </div>

          <div className="inventory-toolbar">
            <div className="toolbar-left">
              <div>
                <h2 className="section-title">Rod Stock Inventory</h2>
                <p className="section-desc">Manage, edit, monitor and filter your metal rods catalog</p>
              </div>
            </div>

            <div className="toolbar-right">
              <div className="inventory-filters">
                {/*  Text Search Filter  */}
                <div className="search-input-wrapper">
                  <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input type="text" id="filterKeyword" className="input-control filter-search" placeholder="Search by name, SKU, notes..." />
                </div>

                {/*  Row 2: Diameter & Status Dropdowns in ONE LINE on mobile  */}
                <div className="filter-dropdowns-row">
                  <select id="filterDiameter" className="input-control filter-select" aria-label="Filter by diameter">
                    <option value="all">All Diameters</option>
                  </select>


                </div>

                {/*  View Switcher (Row View vs Cards View)  */}
                <div className="view-toggle-group" id="viewToggleGroup" role="group" aria-label="Display View">
                  <button type="button" className="view-toggle-btn active" id="btnViewRow" title="Single-line row view">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    <span>Row</span>
                  </button>
                  <button type="button" className="view-toggle-btn" id="btnViewCards" title="Card grid view">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    <span>Cards</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/*  Inventory Data Table  */}
          <div className="table-responsive" id="inventoryTableContainer">
            <table className="data-table" id="inventoryTable">
              <thead>
                <tr>

                  <th className="col-name sortable" data-sort="name">ROD NAME / MATERIAL</th>
                  <th className="col-diameter hide-mobile sortable text-center" data-sort="diameterMm">DIAMETER (MM)</th>
                  <th className="col-length hide-mobile sortable text-center" data-sort="lengthFt">LENGTH (FT)</th>
                  <th className="col-size mobile-only text-right" data-sort="diameterMm">Size</th>
                  <th className="col-qty sortable text-center" data-sort="quantity">STOCK</th>


                  <th className="col-actions text-center">MANAGE</th>
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
        </section>
      </main>


      {/* IMPORT MODAL */}
      <div className={`modal-overlay ${isImportModalOpen ? '' : 'hidden'}`} style={{ zIndex: 100 }}>
        <div className="modal-card modal-card-sm" style={{ padding: '2rem' }}>
          <div className="modal-header">
            <h3 className="modal-title">Bulk Import Inventory</h3>
            <button type="button" className="modal-close-btn" onClick={() => setIsImportModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>
          <p className="modal-subtitle" style={{ marginBottom: '1.5rem' }}>Download the template to format your data correctly, or upload your completed file.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const csvContent = "data:text/csv;charset=utf-8,Rod Name or Material Type,Diameter (mm),Length (ft),Quantity Available\nExample Steel Rebar,12,6.0,15";
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "rodsync_template.csv");
                document.body.appendChild(link);
                link.click();
                link.remove();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Template
            </button>
            <label className="btn btn-primary" style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Upload Bulk Products (.csv)
              <input type="file" id="csvFileInput" accept=".csv" className="hidden-input" onChange={() => setIsImportModalOpen(false)} />
            </label>
          </div>
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
            <button type="button" className="modal-close-btn" id="btnCloseRodModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="rodForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="rodEditId" value="" />

            <div className="form-row">
              <div className="form-group col-12">
                <label htmlFor="formRodName" className="field-label">Rod Name or Material Type <span className="required">*</span></label>
                <input type="text" id="formRodName" className="input-control" placeholder="e.g. TMT Steel Rebar, Brass Rod, 304 Stainless" required />
                <div className="field-hint">e.g. TMT Rebar Fe500D, Mild Steel Round Bar, Copper Rod</div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="formDiameterMm" className="field-label">Diameter (mm) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="formDiameterMm" className="input-control" placeholder="12" step="0.1" min="0.1" required />
                  <span className="input-addon">mm</span>
                </div>
              </div>

              <div className="form-group col-6">
                <label htmlFor="formLengthFt" className="field-label">Length (ft) <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="formLengthFt" className="input-control" placeholder="6.0" step="0.1" min="0.1" required />
                  <span className="input-addon">ft</span>
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
                <input type="number" id="deductQuantityInput" className="input-control stepper-val" value="1" min="1" required />
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
            <button type="button" className="modal-close-btn" id="btnCloseCutModal" aria-label="Close dialog">&times;</button>
          </div>

          <form id="cutForm" className="modal-form" autoComplete="off">
            <input type="hidden" id="cutRodId" value="" />

            {/*  Selected Rod Info Card  */}
            <div className="cut-source-card">
              <div className="cut-source-title" id="cutRodName">—</div>
              <div className="cut-source-dims">
                Diameter: <strong id="cutRodDiameter">—</strong> mm &bull; Full Length: <strong id="cutRodFullLength">—</strong> ft &bull; In Stock: <strong id="cutRodAvailableQty">—</strong> units
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="cutRequiredLengthInput" className="field-label">Required Cut Length <span className="required">*</span></label>
                <div className="input-with-icon">
                  <input type="number" id="cutRequiredLengthInput" className="input-control" placeholder="5.0" step="0.1" min="0.1" required />
                  <span className="input-addon">ft</span>
                </div>
                <div className="field-hint">Piece length you are cutting out</div>
              </div>

              <div className="form-group col-6">
                <label htmlFor="cutPiecesQtyInput" className="field-label">Number of Rods to Cut <span className="required">*</span></label>
                <div className="stepper-input">
                  <button type="button" className="btn-step" id="btnCutStepDown">-</button>
                  <input type="number" id="cutPiecesQtyInput" className="input-control stepper-val" value="1" min="1" step="1" required />
                  <button type="button" className="btn-step" id="btnCutStepUp">+</button>
                </div>
                <div className="field-hint">Quantity of source rods to consume</div>
              </div>
            </div>

            {/*  Dynamic Live Cut Breakdown Card  */}
            <div className="cut-calculation-card" id="cutCalcCard">
              <div className="cut-calc-row">
                <span>Original Rod Length:</span>
                <strong className="font-mono" id="calcOrigLength">0.0 ft</strong>
              </div>
              <div className="cut-calc-row">
                <span>Cut Length (Deducted):</span>
                <strong className="font-mono text-danger" id="calcCutLength">- 0.0 ft</strong>
              </div>
              <div className="cut-calc-divider"></div>
              <div className="cut-calc-row highlight">
                <span>Remaining Offcut Piece:</span>
                <strong className="font-mono text-success" id="calcRemainLength">0.0 ft</strong>
              </div>
              <div className="cut-calc-note" id="calcRemainNote">
                ✂️ <strong>1 unit</strong> of <strong>12 mm × 1.0 ft</strong> offcut rod will be added back into your inventory!
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" id="cutAutoAddRemnant" checked />
                <span>Automatically add the remaining offcut piece(s) back into stock inventory</span>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="cutReasonInput" className="field-label">Job / Work Order / Project Reference <span className="optional">(Optional)</span></label>
              <input type="text" id="cutReasonInput" className="input-control" placeholder="e.g. Work Order #1042, Site Project A" />
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
        <div className="modal-card" style={{ maxWidth: '920px' }}>
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="cutLogsModalTitle">Rod Cutting &amp; Offcut History</h3>
                <p className="modal-subtitle">Log of all cuts, deducted sizes, and generated offcut remnants</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" id="btnCloseCutLogsModal" aria-label="Close dialog">&times;</button>
          </div>

          <div className="cut-logs-toolbar" style={{ padding: '1rem 1.5rem 0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="search-input-wrapper" style={{ flex: '1', minWidth: '180px' }}>
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="filterCutLogsInput" className="input-control filter-search" placeholder="Search logs by rod name, diameter, job ref..." style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="view-toggle-group btn-group" id="cutLogsViewToggleGroup" style={{ display: 'inline-flex' }}>
                <button type="button" className="btn btn-secondary btn-xs" id="btnCutLogsCards" title="Card View (Optimized for phone)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                  </svg>
                  <span>Cards</span>
                </button>
                <button type="button" className="btn btn-secondary btn-xs" id="btnCutLogsTable" title="Table View">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                  <span>Table</span>
                </button>
              </div>
              <button id="btnExportCutLogsCsv" className="btn btn-secondary btn-sm" title="Export cut history to CSV">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export Logs (CSV)
              </button>
              <button id="btnClearCutLogs" className="btn btn-ghost btn-sm text-danger" title="Clear all recorded cut history">
                Clear Logs
              </button>
            </div>
          </div>

          <div className="cut-logs-content-area" id="cutLogsContentArea" style={{ padding: '0.75rem 1.5rem 1.25rem 1.5rem' }}>
            {/*  Desktop Table View  */}
            <div className="table-responsive cut-logs-table-wrapper" id="cutLogsTableWrapper" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              <table className="data-table" id="cutLogsTable">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Rod / Spec</th>
                    <th className="text-right">Original</th>
                    <th className="text-right">Cut Size</th>
                    <th className="text-right">Qty</th>
                    <th>Remnant Offcut</th>
                    <th>Job / Reference</th>
                  </tr>
                </thead>
                <tbody id="cutLogsTableBody">
                  {/*  Dynamically populated  */}
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

          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <span className="text-muted" style={{ fontSize: '0.8125rem' }} id="cutLogsCountText">0 log entries</span>
            <button type="button" className="btn btn-secondary" id="btnCloseCutLogsBottom">Close</button>
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

      {/*  MODAL: GOOGLE SHEETS APPS SCRIPT SETUP & STATUS  */}
      <div className={`modal-overlay ${isSheetsModalOpen ? '' : 'hidden'}`} role="dialog" aria-modal="true" aria-labelledby="sheetsModalTitle" style={{ zIndex: 110 }}>
        <div className="modal-card modal-card-sm" style={{ maxWidth: '580px' }}>
          <div className="modal-header">
            <div className="modal-title-group">
              <div className="modal-icon-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div>
                <h3 className="modal-title" id="sheetsModalTitle">Google Sheets Script Sync</h3>
                <p className="modal-subtitle">Connect directly via Google Apps Script Web App</p>
              </div>
            </div>
            <button type="button" className="modal-close-btn" onClick={() => setIsSheetsModalOpen(false)} aria-label="Close dialog">&times;</button>
          </div>

          <div style={{ padding: '1.25rem 1.5rem', fontSize: '0.875rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1rem'
            }}>
              <div>
                <span style={{ fontWeight: 600, display: 'block' }}>Connection Status</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {sheetsStatus === 'connected' ? 'Connected & syncing to Google Sheets' : sheetsStatus === 'unconfigured' ? 'Web App URL not set' : 'Connection error or syncing'}
                </span>
              </div>
              <span className={`badge ${sheetsStatus === 'connected' ? 'badge-success' : 'badge-warning'}`} style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                {sheetsStatus === 'connected' ? 'CONNECTED' : sheetsStatus === 'unconfigured' ? 'NOT CONNECTED' : 'PENDING'}
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Google Apps Script Web App URL</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={inputScriptUrl}
                  onChange={(e) => setInputScriptUrl(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    localStorage.setItem('rodsync_gsheets_script_url', inputScriptUrl.trim());
                    syncInventoryData(true);
                    alert('Saved Google Sheets Script URL and refreshed sync!');
                  }}
                >
                  Save URL &amp; Sync
                </button>
              </div>
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => {
                    syncInventoryData(true);
                    setIsSheetsModalOpen(false);
                  }}
                >
                  🔄 Force Refresh Live Data Now
                </button>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>How to connect in 4 quick steps:</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                >
                  {copiedSnippet ? '✓ Copied Script!' : '📋 Copy Apps Script'}
                </button>
              </div>
              <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li>Open your Google Sheet and click <strong>Extensions &gt; Apps Script</strong>.</li>
                <li>Delete any code, click <strong>&quot;Copy Apps Script&quot;</strong> above, paste it in, and save (Ctrl+S).</li>
                <li>Click <strong>Deploy &gt; New deployment &gt; Select type: Web app</strong>.</li>
                <li>Set <em>Execute as:</em> <strong>Me</strong> and <em>Who has access:</em> <strong>Anyone</strong>, then click <strong>Deploy</strong>.</li>
                <li>Copy the Web App URL and paste it into the field above or into <code style={{ padding: '1px 4px', background: 'var(--bg-surface-elevated)', borderRadius: '3px' }}>.env.local</code> as <code style={{ padding: '1px 4px', background: 'var(--bg-surface-elevated)', borderRadius: '3px' }}>GOOGLE_SCRIPT_URL</code>.</li>
              </ol>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const urlToTest = inputScriptUrl.trim() || localStorage.getItem('rodsync_gsheets_script_url') || '';
                try {
                  const res = await fetch('/api/gsheets-sync', {
                    headers: urlToTest ? { 'x-google-script-url': urlToTest } : {}
                  });
                  const data = await res.json();
                  if (data.success) {
                    setSheetsStatus('connected');
                    alert('Google Sheets connection successful! Ready to sync.');
                  } else {
                    setSheetsStatus(data.configured ? 'disconnected' : 'unconfigured');
                    alert(`Google Sheets Status: ${data.message || 'Could not connect'}`);
                  }
                } catch (e: unknown) {
                  alert(`Test Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }}
            >
              Test Connection
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const urlToTest = inputScriptUrl.trim() || localStorage.getItem('rodsync_gsheets_script_url') || '';
                try {
                  const storedRods = JSON.parse(localStorage.getItem('rod_stock_inventory_v1') || '[]');
                  const storedLogs = JSON.parse(localStorage.getItem('rod_stock_cut_logs_v1') || '[]');
                  const res = await fetch('/api/gsheets-sync', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(urlToTest ? { 'x-google-script-url': urlToTest } : {})
                    },
                    body: JSON.stringify({ rods: storedRods, cutLogs: storedLogs, scriptUrl: urlToTest })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setSheetsStatus('connected');
                    alert('Success! Current inventory and cut logs pushed to Google Sheets.');
                  } else {
                    alert(`Sync Error: ${data.message || 'Unknown error'}`);
                  }
                } catch (e: unknown) {
                  alert(`Sync Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
                }
              }}
            >
              Sync Now
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setIsSheetsModalOpen(false)}>Close</button>
          </div>
        </div>
      </div>

      {/*  TOAST CONTAINER  */}
      <div id="toastContainer" className="toast-container" aria-live="polite" aria-atomic="true"></div>

      {/*  MOBILE NATIVE BOTTOM NAVIGATION BAR  */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
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
        src="/script.js?v=6"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.initVanillaApp) {
            window.initVanillaApp();
          }
        }}
      />
    </>
  );
}
