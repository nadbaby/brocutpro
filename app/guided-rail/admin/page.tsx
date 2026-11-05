'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface GuidedRailModel {
  id?: string;
  modelName: string;
  railWidthMm: number;
  railHeightMm: number;
  pitchMm: number;
  minCuttingLengthMm: number;
  minEndMarginMm?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const emptyForm = (): Omit<GuidedRailModel, 'id' | 'createdAt' | 'updatedAt'> => ({
  modelName: '',
  railWidthMm: 0,
  railHeightMm: 0,
  pitchMm: 0,
  minCuttingLengthMm: 0,
  minEndMarginMm: 10,
  active: true,
});

export default function GuidedRailAdmin() {
  const router = useRouter();
  const [models, setModels] = useState<GuidedRailModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    const hasAuth = document.cookie.split(';').some(c => c.trim().startsWith('auth=true'));
    if (!hasAuth) router.replace('/login');
  }, [router]);

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/guided-rail');
      const data = await res.json();
      if (data.success) setModels(data.models);
      else setError(data.message || 'Failed to load models');
    } catch {
      setError('Network error while fetching models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (m: GuidedRailModel) => {
    setEditingId(m.id ?? null);
    setForm({
      modelName: m.modelName,
      railWidthMm: m.railWidthMm,
      railHeightMm: m.railHeightMm,
      pitchMm: m.pitchMm,
      minCuttingLengthMm: m.minCuttingLengthMm,
      minEndMarginMm: m.minEndMarginMm ?? 10,
      active: m.active,
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.modelName.trim() || !form.pitchMm) {
      setError('Model Name and Pitch are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        minCuttingLengthMm: form.minCuttingLengthMm || form.pitchMm,
        ...(editingId ? { id: editingId } : {}),
      };
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch('/api/guided-rail', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(editingId ? 'Model updated successfully.' : 'Model created successfully.');
        setIsModalOpen(false);
        fetchModels();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Save failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (m: GuidedRailModel) => {
    try {
      const res = await fetch('/api/guided-rail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, active: !m.active }),
      });
      const data = await res.json();
      if (data.success) fetchModels();
    } catch {
      setError('Failed to toggle status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/guided-rail?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSuccess('Model deleted.');
        fetchModels();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Delete failed');
      }
    } catch {
      setError('Network error during delete');
    }
    setConfirmDeleteId(null);
  };

  const pf = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'checkbox'
      ? (e.target as HTMLInputElement).checked
      : e.target.type === 'number'
        ? parseFloat(e.target.value) || 0
        : e.target.value;
    setForm(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', fontFamily: 'Plus Jakarta Sans, -apple-system, sans-serif', color: 'var(--text-main)' }}>
      {/* Nav */}
      <header className="navbar">
        <div className="nav-container">
          <div className="brand-group">
            <div className="brand-logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="20" x2="20" y2="4"></line>
                <circle cx="8" cy="8" r="3"></circle>
                <circle cx="16" cy="16" r="3"></circle>
              </svg>
            </div>
            <div className="brand-text-wrap">
              <h1 className="brand-title" style={{ margin: 0 }}>Rod<span className="brand-accent">Sync</span></h1>
            </div>
          </div>
          <div className="nav-actions">
            <button className="btn btn-secondary btn-sm btn-nav-pill" onClick={() => router.push('/')}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="main-container">
        <section className="card" style={{ padding: '1.75rem 2rem' }}>
          {/* Header */}
          <div className="section-header" style={{ marginBottom: '1.5rem' }}>
            <div className="section-title-wrap">
              <div className="badge-icon badge-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 5h18M3 12h18M3 19h18" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h2 className="section-title">Guided Rail Models — Admin Panel</h2>
                <p className="section-desc">Manage HGR guided rail specifications, cutting validation settings, and active status.</p>
              </div>
            </div>
            <button className="btn btn-primary" onClick={openAdd}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add New Model
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              ✓ {success}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div style={{ width: '36px', height: '36px', border: '3px solid var(--primary-100)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'rodsync-spin 0.8s linear infinite', margin: '0 auto 1rem auto' }}></div>
              Loading rail models…
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="text-center">Width Wr (mm)</th>
                    <th className="text-center">Height Hr (mm)</th>
                    <th className="text-center">Pitch P (mm)</th>
                    <th className="text-center">Min Cut (mm)</th>
                    <th className="text-center">Min Margin (mm)</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Updated</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No models found. Add one above.</td></tr>
                  )}
                  {models.map((m) => (
                    <tr key={m.id} style={{ opacity: m.active ? 1 : 0.55 }}>
                      <td><strong className="font-mono">{m.modelName}</strong></td>
                      <td className="text-center font-mono">{m.railWidthMm}</td>
                      <td className="text-center font-mono">{m.railHeightMm}</td>
                      <td className="text-center font-mono">{m.pitchMm}</td>
                      <td className="text-center font-mono">{m.minCuttingLengthMm}</td>
                      <td className="text-center font-mono">{m.minEndMarginMm ?? 10}</td>
                      <td className="text-center">
                        <button
                          className={`badge ${m.active ? 'badge-success' : 'badge-warning'}`}
                          style={{ cursor: 'pointer', border: 'none', fontWeight: 700, padding: '3px 10px' }}
                          onClick={() => handleToggleActive(m)}
                          title={m.active ? 'Click to deactivate' : 'Click to activate'}
                        >
                          {m.active ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                      </td>
                      <td className="text-center" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="text-center">
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button className="btn btn-secondary btn-xs" onClick={() => openEdit(m)}>✏️ Edit</button>
                          <button className="btn btn-ghost text-danger btn-xs" onClick={() => setConfirmDeleteId(m.id ?? null)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-sm">
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge badge-accent">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 5h18M3 12h18M3 19h18" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="modal-title">{editingId ? 'Edit Guided Rail Model' : 'Add New Guided Rail Model'}</h3>
                  <p className="modal-subtitle">HGR standard specification</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)} aria-label="Close">×</button>
            </div>

            <form onSubmit={handleSave} className="modal-form" autoComplete="off">
              {error && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '0.65rem 0.875rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}

              <div className="form-row">
                <div className="form-group col-12">
                  <label className="field-label">Model Name <span className="required">*</span></label>
                  <input className="input-control font-mono" type="text" value={form.modelName} onChange={pf('modelName')} placeholder="e.g. HGR15" required />
                  <div className="field-hint">Will be uppercased automatically</div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group col-6">
                  <label className="field-label">Rail Width Wr (mm) <span className="required">*</span></label>
                  <div className="input-with-icon">
                    <input className="input-control font-mono" type="number" step="0.1" min="0.1" value={form.railWidthMm || ''} onChange={pf('railWidthMm')} placeholder="15" required />
                    <span className="input-addon">mm</span>
                  </div>
                </div>
                <div className="form-group col-6">
                  <label className="field-label">Rail Height Hr (mm) <span className="required">*</span></label>
                  <div className="input-with-icon">
                    <input className="input-control font-mono" type="number" step="0.1" min="0.1" value={form.railHeightMm || ''} onChange={pf('railHeightMm')} placeholder="15" required />
                    <span className="input-addon">mm</span>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group col-6">
                  <label className="field-label">Pitch / Hole Spacing P (mm) <span className="required">*</span></label>
                  <div className="input-with-icon">
                    <input className="input-control font-mono" type="number" step="0.1" min="0.1" value={form.pitchMm || ''} onChange={pf('pitchMm')} placeholder="60" required />
                    <span className="input-addon">mm</span>
                  </div>
                </div>
                <div className="form-group col-6">
                  <label className="field-label">Min Cutting Length (mm)</label>
                  <div className="input-with-icon">
                    <input className="input-control font-mono" type="number" step="0.1" min="0.1" value={form.minCuttingLengthMm || ''} onChange={pf('minCuttingLengthMm')} placeholder="Same as pitch" />
                    <span className="input-addon">mm</span>
                  </div>
                  <div className="field-hint">Leave blank to default to pitch value</div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group col-12">
                  <label className="field-label">Min End Margin Emin (mm)</label>
                  <div className="input-with-icon">
                    <input className="input-control font-mono" type="number" step="0.1" min="1" value={form.minEndMarginMm || ''} onChange={pf('minEndMarginMm')} placeholder="10" />
                    <span className="input-addon">mm</span>
                  </div>
                  <div className="field-hint">Minimum end distance from hole center to cut edge (default 10mm)</div>
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.active} onChange={pf('active')} />
                  <span>Model is Active (visible in product search)</span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Update Model' : 'Save Model'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {confirmDeleteId && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-xs">
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge badge-danger-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <h3 className="modal-title">Confirm Delete</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setConfirmDeleteId(null)}>×</button>
            </div>
            <div className="confirm-body">
              <p>Are you sure you want to delete this guided rail model? This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDeleteId)}>Delete Model</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes rodsync-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

