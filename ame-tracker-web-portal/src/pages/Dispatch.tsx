import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Truck, Package,
  RefreshCw, X, ZoomIn, Search,
  ChevronRight, FolderKanban, Settings,
  CheckCircle2, ArrowLeft, List, Layers,
} from 'lucide-react';
import { api, resolveVehiclePhotoUrl } from '../services/api';

/* ─── Types ─── */
interface PartItem {
  id: number | string;
  pieceNumber: number | string;
  fitting: string | null;
  itemId: string;
  itemTracking: string;
  status: string;
  loadedAt?: string;
}

interface JobItem {
  jobCode: string;
  jobName: string;
  partCount: number;
  parts: PartItem[];
}

interface ProjectItem {
  projectName: string;
  partCount: number;
  jobs: JobItem[];
}

interface VehicleDispatch {
  id: number | string;
  vehicleNumber: string;
  transitNumber: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  truckPhotoUrl?: string | null;
  startedAt: string;
  completedAt?: string | null;
  operatorName?: string;
  totalParts: number;
  projects: ProjectItem[];
}

type NavView =
  | { type: 'list' }
  | { type: 'vehicle'; vehicle: VehicleDispatch; tab: 'all' | 'project' | 'job' }
  | { type: 'project'; vehicle: VehicleDispatch; project: ProjectItem }
  | { type: 'job'; vehicle: VehicleDispatch; project: ProjectItem; job: JobItem };

/* ─── Helpers ─── */
function timeAgo(iso: string) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function flattenParts(vehicle: VehicleDispatch): Array<PartItem & { projectName: string; jobCode: string; jobName: string }> {
  const result: Array<PartItem & { projectName: string; jobCode: string; jobName: string }> = [];
  for (const project of vehicle.projects ?? []) {
    for (const job of project.jobs ?? []) {
      for (const part of job.parts ?? []) {
        result.push({ ...part, projectName: project.projectName, jobCode: job.jobCode, jobName: job.jobName });
      }
    }
  }
  return result.sort((a, b) => Number(a.pieceNumber) - Number(b.pieceNumber));
}

/* ─── Sub-components ─── */

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800,
      backgroundColor: isActive ? '#ECFDF5' : '#F3F4F6',
      color: isActive ? '#047857' : '#4B5563',
      border: `1px solid ${isActive ? '#A7F3D0' : '#E5E7EB'}`,
    }}>
      {isActive ? '● ACTIVE' : '✓ COMPLETED'}
    </span>
  );
}

function PartStatusChip({ status }: { status: string }) {
  const shipped = status === 'SHIPPED';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: shipped ? '#FFF7ED' : '#ECFDF5',
      color: shipped ? '#FB923C' : '#047857',
      border: `1px solid ${shipped ? '#FED7AA' : '#A7F3D0'}`,
      padding: '1px 7px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
    }}>
      <CheckCircle2 size={10} />
      {shipped ? 'Shipped' : status === 'LOADED' ? 'Loaded' : 'Active'}
    </span>
  );
}

function Breadcrumbs({ view, onNavigate }: { view: NavView; onNavigate: (v: NavView) => void }) {
  const crumbs: { label: string; view: NavView }[] = [{ label: 'Dispatches', view: { type: 'list' } }];
  if (view.type === 'vehicle') crumbs.push({ label: view.vehicle.vehicleNumber, view });
  if (view.type === 'project') {
    crumbs.push({ label: view.vehicle.vehicleNumber, view: { type: 'vehicle', vehicle: view.vehicle, tab: 'project' } });
    crumbs.push({ label: view.project.projectName, view });
  }
  if (view.type === 'job') {
    crumbs.push({ label: view.vehicle.vehicleNumber, view: { type: 'vehicle', vehicle: view.vehicle, tab: 'project' } });
    crumbs.push({ label: view.project.projectName, view: { type: 'project', vehicle: view.vehicle, project: view.project } });
    crumbs.push({ label: view.job.jobName, view });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#6B7280', marginBottom: 18 }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <ChevronRight size={13} color="#D1D5DB" />}
          {i < crumbs.length - 1 ? (
            <button
              onClick={() => onNavigate(c.view)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#047857', fontWeight: 600, fontSize: '0.8rem', padding: 0 }}
            >
              {c.label}
            </button>
          ) : (
            <span style={{ fontWeight: 700, color: '#111827' }}>{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function PartsTable({ parts }: { parts: Array<PartItem & { projectName?: string; jobCode?: string; jobName?: string }> }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #E5E7EB' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>PIECE #</th>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>FITTING TYPE</th>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>ITEM ID</th>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>TRACKING</th>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {parts.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No pieces recorded</td></tr>
          ) : (
            parts.map((p, i) => (
              <tr key={p.id ?? i} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '8px 12px', fontWeight: 800, color: '#047857' }}>#{p.pieceNumber}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1E293B' }}>{p.fitting || 'Standard Duct'}</td>
                <td style={{ padding: '8px 12px', color: '#64748B' }}>{p.itemId || '—'}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{p.itemTracking || '—'}</td>
                <td style={{ padding: '8px 12px' }}><PartStatusChip status={p.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type DateFilter = 'all' | 'today' | 'yesterday' | 'custom';

function isSameDay(iso: string, date: Date) {
  const d = new Date(iso);
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
}

/* ─── VIEW: Dispatch List ─── */
function DispatchList({
  vehicles, loading, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
  onSelectVehicle,
}: {
  vehicles: VehicleDispatch[]; loading: boolean; searchQuery: string;
  setSearchQuery: (q: string) => void; statusFilter: 'ALL' | 'ACTIVE' | 'COMPLETED';
  setStatusFilter: (f: 'ALL' | 'ACTIVE' | 'COMPLETED') => void;
  onSelectVehicle: (v: VehicleDispatch) => void;
}) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customDate, setCustomDate] = useState<string>('');

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const yesterday = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() - 1); return d; }, [today]);

  const filtered = useMemo(() => vehicles.filter(v => {
    if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
    if (dateFilter === 'today' && !isSameDay(v.startedAt, today)) return false;
    if (dateFilter === 'yesterday' && !isSameDay(v.startedAt, yesterday)) return false;
    if (dateFilter === 'custom' && customDate) {
      const picked = new Date(customDate); picked.setHours(0,0,0,0);
      if (!isSameDay(v.startedAt, picked)) return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return v.vehicleNumber.toLowerCase().includes(q) ||
      String(v.id).includes(q) ||
      v.projects?.some(p => p.projectName.toLowerCase().includes(q) ||
        p.jobs?.some(j => j.jobName.toLowerCase().includes(q) || j.jobCode.toLowerCase().includes(q)));
  }), [vehicles, searchQuery, statusFilter, dateFilter, customDate, today, yesterday]);

  return (
    <>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>Dispatch</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
          Click a vehicle to view its manifest
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ background: '#FFFFFF', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 380 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              type="text" placeholder="Search vehicle, project, job…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: '0.8125rem', backgroundColor: '#F9FAFB', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', background: '#F3F4F6', padding: 2, borderRadius: 6 }}>
            {(['ALL', 'ACTIVE', 'COMPLETED'] as const).map(tab => (
              <button key={tab} onClick={() => setStatusFilter(tab)} style={{
                padding: '4px 10px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                backgroundColor: statusFilter === tab ? '#FFFFFF' : 'transparent',
                color: statusFilter === tab ? '#047857' : '#6B7280',
                boxShadow: statusFilter === tab ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>{tab}</button>
            ))}
          </div>
          <span style={{ fontSize: '0.78rem', color: '#9CA3AF', marginLeft: 'auto' }}>
            {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Date Filter Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', marginRight: 2 }}>Date:</span>
          {([
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'custom', label: 'Pick Date' },
          ] as { key: DateFilter; label: string }[]).map(opt => (
            <button key={opt.key} onClick={() => setDateFilter(opt.key)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer',
              backgroundColor: dateFilter === opt.key ? '#047857' : '#F3F4F6',
              color: dateFilter === opt.key ? '#FFFFFF' : '#374151',
              transition: 'all 0.15s',
            }}>{opt.label}</button>
          ))}
          {dateFilter === 'custom' && (
            <input
              type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
              style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: '0.8125rem', outline: 'none', color: '#111827', backgroundColor: '#F9FAFB' }}
            />
          )}
          {dateFilter !== 'all' && (
            <span style={{ fontSize: '0.72rem', color: '#9CA3AF', fontStyle: 'italic' }}>
              {dateFilter === 'today' ? `Today — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` :
               dateFilter === 'yesterday' ? `Yesterday — ${new Date(Date.now()-86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` :
               customDate ? new Date(customDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
            </span>
          )}
        </div>
      </div>

      {/* Vehicle Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
          Loading dispatches…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Truck size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, fontSize: 15, color: '#374151' }}>
            {dateFilter === 'today' ? 'No dispatches recorded today' : 'No dispatches match your filter'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {dateFilter === 'today' ? 'View the overall history below.' : 'Try changing your search or date filter.'}
          </div>
          {dateFilter !== 'all' && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setDateFilter('all')}
              style={{ marginTop: 16, borderColor: '#047857', color: '#047857', fontWeight: 700 }}
            >
              View All Dispatches ({vehicles.length})
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(vehicle => {
            const isActive = vehicle.status === 'ACTIVE';
            const photoUrl = resolveVehiclePhotoUrl(vehicle.truckPhotoUrl);
            return (
              <div
                key={vehicle.id}
                onClick={() => onSelectVehicle(vehicle)}
                style={{
                  background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB',
                  padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
                  cursor: 'pointer', transition: 'all 0.18s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#047857'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(4,120,87,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
              >
                {/* Truck Icon */}
                <div style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: isActive ? '#DCFCE7' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Truck size={24} color={isActive ? '#047857' : '#6B7280'} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#047857', border: '1.5px solid #047857', padding: '2px 8px', borderRadius: 6, backgroundColor: '#FFFFFF', letterSpacing: '0.5px' }}>
                      {vehicle.vehicleNumber}
                    </span>
                    <span style={{ fontWeight: 700, color: '#374151', fontSize: '0.9rem' }}>
                      Dispatch #{String(vehicle.id).padStart(4, '0')}
                    </span>
                    <StatusBadge status={vehicle.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: '0.8rem', color: '#6B7280', flexWrap: 'wrap' }}>
                    <span><strong>{vehicle.totalParts || 0}</strong> parts loaded</span>
                    <span>·</span>
                    <span><strong>{vehicle.projects?.length || 0}</strong> projects</span>
                    <span>·</span>
                    <span>Started <strong>{timeAgo(vehicle.startedAt)}</strong></span>
                    {vehicle.operatorName && <><span>·</span><span>By <strong>{vehicle.operatorName}</strong></span></>}
                  </div>
                </div>

                {/* Photo thumbnail */}
                {photoUrl && (
                  <div style={{ width: 52, height: 40, borderRadius: 7, overflow: 'hidden', border: '1px solid #86EFAC', flexShrink: 0, position: 'relative' }}>
                    <img src={photoUrl} alt="Truck" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ZoomIn size={12} color="#fff" />
                    </div>
                  </div>
                )}

                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ChevronRight size={18} color="#6B7280" />
                </div>
              </div>
            );
          })}

          {/* View All Dispatches link at end of today/date-filtered list */}
          {dateFilter !== 'all' && (
            <div style={{ textAlign: 'center', marginTop: 8, padding: '16px 20px', background: '#FFFFFF', borderRadius: 14, border: '1.5px dashed #D1D5DB' }}>
              <div style={{ fontSize: '0.84rem', color: '#6B7280', marginBottom: 10 }}>
                Showing {filtered.length} dispatch{filtered.length !== 1 ? 'es' : ''} for {dateFilter === 'today' ? 'Today' : dateFilter === 'yesterday' ? 'Yesterday' : customDate || 'selected date'}.
              </div>
              <button
                className="btn btn-outline"
                onClick={() => setDateFilter('all')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.83rem', fontWeight: 700, borderColor: '#047857', color: '#047857', padding: '8px 18px', borderRadius: 8 }}
              >
                View All Overall Dispatches ({vehicles.length}) <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ─── VIEW: Vehicle Detail ─── */
function VehicleDetail({
  vehicle, tab, setTab, onBack, onSelectProject, onSelectJob,
  onPreviewPhoto,
}: {
  vehicle: VehicleDispatch; tab: 'all' | 'project' | 'job';
  setTab: (t: 'all' | 'project' | 'job') => void;
  onBack: () => void; onSelectProject: (p: ProjectItem) => void;
  onSelectJob: (p: ProjectItem, j: JobItem) => void;
  onPreviewPhoto: (url: string) => void;
}) {
  const photoUrl = resolveVehiclePhotoUrl(vehicle.truckPhotoUrl);
  const isActive = vehicle.status === 'ACTIVE';
  const allParts = useMemo(() => flattenParts(vehicle), [vehicle]);
  const [partSearch, setPartSearch] = useState('');

  const filteredParts = useMemo(() => {
    if (!partSearch.trim()) return allParts;
    const q = partSearch.toLowerCase();
    return allParts.filter(p =>
      String(p.pieceNumber).includes(q) ||
      (p.fitting && p.fitting.toLowerCase().includes(q)) ||
      (p.itemTracking && p.itemTracking.toLowerCase().includes(q)) ||
      p.projectName.toLowerCase().includes(q) ||
      p.jobName.toLowerCase().includes(q)
    );
  }, [allParts, partSearch]);

  return (
    <>
      {/* Back + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#374151' }}>
          <ArrowLeft size={15} /> Back
        </button>
      </div>

      {/* Vehicle Hero Card */}
      <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E5E7EB', padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: isActive ? '#DCFCE7' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Truck size={28} color={isActive ? '#047857' : '#6B7280'} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#047857', border: '2px solid #047857', padding: '3px 12px', borderRadius: 8, letterSpacing: '1px' }}>
              {vehicle.vehicleNumber}
            </span>
            <span style={{ color: '#374151', fontWeight: 700, fontSize: '1rem' }}>Dispatch #{String(vehicle.id).padStart(4, '0')}</span>
            <StatusBadge status={vehicle.status} />
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Parts', value: vehicle.totalParts || 0, color: '#047857' },
              { label: 'Projects', value: vehicle.projects?.length || 0, color: '#1D4ED8' },
              { label: 'Jobs', value: vehicle.projects?.reduce((s, p) => s + (p.jobs?.length || 0), 0) || 0, color: '#7C3AED' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '8px 16px', background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#6B7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Started: <strong>{formatDate(vehicle.startedAt)}</strong></span>
            {vehicle.operatorName && <><span>·</span><span>Operator: <strong>{vehicle.operatorName}</strong></span></>}
            {vehicle.completedAt && <><span>·</span><span>Completed: <strong>{formatDate(vehicle.completedAt)}</strong></span></>}
          </div>
        </div>

        {photoUrl && (
          <div onClick={() => onPreviewPhoto(photoUrl)} style={{ width: 80, height: 60, borderRadius: 10, overflow: 'hidden', border: '2px solid #86EFAC', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
            <img src={photoUrl} alt="Truck" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ZoomIn size={14} color="#fff" />
            </div>
          </div>
        )}
      </div>

      {/* Tab Strip */}
      <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 4, gap: 2, marginBottom: 18, width: 'fit-content' }}>
        {([
          { key: 'all', label: 'All Parts', icon: <List size={14} /> },
          { key: 'project', label: 'By Project', icon: <FolderKanban size={14} /> },
          { key: 'job', label: 'By Job', icon: <Layers size={14} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 700, transition: 'all 0.15s',
            background: tab === t.key ? '#FFFFFF' : 'transparent',
            color: tab === t.key ? '#047857' : '#6B7280',
            boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
          }}>
            {t.icon} {t.label}
            <span style={{ marginLeft: 2, fontSize: '0.72rem', background: tab === t.key ? '#DCFCE7' : '#E5E7EB', color: tab === t.key ? '#047857' : '#6B7280', padding: '1px 6px', borderRadius: 8, fontWeight: 800 }}>
              {t.key === 'all' ? allParts.length : t.key === 'project' ? vehicle.projects?.length || 0 : vehicle.projects?.reduce((s, p) => s + (p.jobs?.length || 0), 0) || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'all' && (
        <div>
          <div style={{ marginBottom: 14, position: 'relative', maxWidth: 380 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              type="text" placeholder="Search parts, piece #, fitting, project…" value={partSearch}
              onChange={e => setPartSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.8125rem', backgroundColor: '#F9FAFB', outline: 'none' }}
            />
          </div>
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.83rem', color: '#374151' }}>All Parts — {filteredParts.length} of {allParts.length}</span>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Sorted by piece number</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {['PIECE #', 'FITTING TYPE', 'PROJECT', 'JOB', 'TRACKING', 'STATUS'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#64748B', fontSize: '0.72rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9CA3AF' }}>No parts found</td></tr>
                  ) : filteredParts.map((p, i) => (
                    <tr key={p.id ?? i} style={{ borderBottom: '1px solid #F1F5F9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '8px 12px', fontWeight: 800, color: '#047857' }}>#{p.pieceNumber}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1E293B' }}>{p.fitting || 'Standard Duct'}</td>
                      <td style={{ padding: '8px 12px', color: '#1D4ED8', fontWeight: 600, fontSize: '0.78rem' }}>{p.projectName}</td>
                      <td style={{ padding: '8px 12px', color: '#6B7280', fontSize: '0.78rem' }}>{p.jobName}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{p.itemTracking || '—'}</td>
                      <td style={{ padding: '8px 12px' }}><PartStatusChip status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'project' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(!vehicle.projects || vehicle.projects.length === 0) ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>
              <Package size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div>No projects loaded yet</div>
            </div>
          ) : vehicle.projects.map(project => (
            <div key={project.projectName}
              onClick={() => onSelectProject(project)}
              style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#1D4ED8'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(29,78,216,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderKanban size={22} color="#1D4ED8" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#1E3A8A', fontSize: '1rem' }}>{project.projectName}</div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 3 }}>
                  {project.partCount} {project.partCount === 1 ? 'part' : 'parts'} · {project.jobs?.length || 0} jobs
                </div>
              </div>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 20, padding: '4px 12px', fontWeight: 800, fontSize: '0.82rem', color: '#1D4ED8' }}>
                {project.partCount} parts
              </div>
              <ChevronRight size={20} color="#9CA3AF" />
            </div>
          ))}
        </div>
      )}

      {tab === 'job' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vehicle.projects?.flatMap(project =>
            project.jobs?.map(job => (
              <div key={job.jobCode}
                onClick={() => onSelectJob(project, job)}
                style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Settings size={18} color="#7C3AED" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#1E293B' }}>{job.jobName}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 2 }}>
                    #{job.jobCode} · <span style={{ color: '#1D4ED8' }}>{project.projectName}</span>
                  </div>
                </div>
                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '3px 10px', fontWeight: 800, fontSize: '0.8rem', color: '#7C3AED' }}>
                  {job.partCount} parts
                </div>
                <ChevronRight size={20} color="#9CA3AF" />
              </div>
            )) ?? []
          )}
        </div>
      )}
    </>
  );
}

/* ─── VIEW: Project Detail ─── */
function ProjectDetail({ vehicle, project, onBack, onSelectJob }: {
  vehicle: VehicleDispatch; project: ProjectItem;
  onBack: () => void; onSelectJob: (j: JobItem) => void;
}) {
  return (
    <>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 4 }}>
        <ArrowLeft size={15} /> Back
      </button>

      {/* Hero */}
      <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #BFDBFE', padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FolderKanban size={26} color="#1D4ED8" />
        </div>
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1E3A8A' }}>{project.projectName}</div>
          <div style={{ fontSize: '0.83rem', color: '#6B7280', marginTop: 4 }}>
            {project.partCount} parts · {project.jobs?.length || 0} jobs · Vehicle: <strong style={{ color: '#047857' }}>{vehicle.vehicleNumber}</strong>
          </div>
        </div>
      </div>

      <div style={{ fontWeight: 800, color: '#374151', fontSize: '0.9rem', marginBottom: 10 }}>Jobs in this project</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(!project.jobs || project.jobs.length === 0) ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>No jobs recorded</div>
        ) : project.jobs.map(job => (
          <div key={job.jobCode}
            onClick={() => onSelectJob(job)}
            style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,58,237,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Settings size={18} color="#7C3AED" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: '#1E293B' }}>{job.jobName}</div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 2 }}>Job Code: #{job.jobCode}</div>
            </div>
            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '3px 10px', fontWeight: 800, fontSize: '0.8rem', color: '#7C3AED' }}>
              {job.partCount} parts
            </div>
            <ChevronRight size={20} color="#9CA3AF" />
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── VIEW: Job Detail ─── */
function JobDetail({ vehicle, project, job, onBack }: {
  vehicle: VehicleDispatch; project: ProjectItem; job: JobItem; onBack: () => void;
}) {
  return (
    <>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#374151', marginBottom: 4 }}>
        <ArrowLeft size={15} /> Back
      </button>

      {/* Hero */}
      <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #DDD6FE', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={26} color="#7C3AED" />
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1E293B' }}>{job.jobName}</div>
            <div style={{ fontSize: '0.83rem', color: '#6B7280', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>Code: <strong>#{job.jobCode}</strong></span>
              <span>·</span>
              <span>Project: <strong style={{ color: '#1D4ED8' }}>{project.projectName}</strong></span>
              <span>·</span>
              <span>Vehicle: <strong style={{ color: '#047857' }}>{vehicle.vehicleNumber}</strong></span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '6px 16px', fontWeight: 900, fontSize: '1rem', color: '#7C3AED' }}>
            {job.partCount} parts
          </div>
        </div>
      </div>

      <div style={{ fontWeight: 800, color: '#374151', fontSize: '0.9rem', marginBottom: 10 }}>
        Parts Manifest — {job.parts?.length || 0} pieces
      </div>
      <PartsTable parts={job.parts || []} />
    </>
  );
}

/* ─── MAIN COMPONENT ─── */
export default function Dispatch() {
  const [vehicles, setVehicles] = useState<VehicleDispatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [view, setView] = useState<NavView>({ type: 'list' });
  const [vehicleTab, setVehicleTab] = useState<'all' | 'project' | 'job'>('all');
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; vehicleNumber: string } | null>(null);

  const loadDispatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDispatchesGrouped();
      if (Array.isArray(data)) {
        setVehicles(data);
        // If we're on a vehicle view, refresh the vehicle data
        if (view.type === 'vehicle') {
          const fresh = data.find((v: VehicleDispatch) => String(v.id) === String(view.vehicle.id));
          if (fresh) setView({ type: 'vehicle', vehicle: fresh, tab: vehicleTab });
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [view, vehicleTab]);

  useEffect(() => { void loadDispatches(); }, []);

  function selectVehicle(vehicle: VehicleDispatch) {
    setVehicleTab('all');
    setView({ type: 'vehicle', vehicle, tab: 'all' });
  }

  function selectProject(vehicle: VehicleDispatch, project: ProjectItem) {
    setView({ type: 'project', vehicle, project });
  }

  function selectJob(vehicle: VehicleDispatch, project: ProjectItem, job: JobItem) {
    setView({ type: 'job', vehicle, project, job });
  }

  return (
    <>
      {view.type !== 'list' && (
        <div className="page-header" style={{ paddingBottom: 4 }}>
          <Breadcrumbs view={view} onNavigate={v => {
            if (v.type === 'vehicle') setVehicleTab((v as any).tab ?? 'all');
            setView(v);
          }} />
        </div>
      )}

      {view.type === 'list' && (
        <DispatchList
          vehicles={vehicles} loading={loading} searchQuery={searchQuery}
          setSearchQuery={setSearchQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          onSelectVehicle={selectVehicle}
        />
      )}

      {view.type === 'vehicle' && (
        <VehicleDetail
          vehicle={view.vehicle} tab={vehicleTab} setTab={t => { setVehicleTab(t); setView({ ...view, tab: t }); }}
          onBack={() => setView({ type: 'list' })}
          onSelectProject={p => selectProject(view.vehicle, p)}
          onSelectJob={(p, j) => selectJob(view.vehicle, p, j)}
          onPreviewPhoto={url => setPreviewPhoto({ url, vehicleNumber: view.vehicle.vehicleNumber })}
        />
      )}

      {view.type === 'project' && (
        <ProjectDetail
          vehicle={view.vehicle} project={view.project}
          onBack={() => setView({ type: 'vehicle', vehicle: view.vehicle, tab: 'project' })}
          onSelectJob={j => selectJob(view.vehicle, view.project, j)}
        />
      )}

      {view.type === 'job' && (
        <JobDetail
          vehicle={view.vehicle} project={view.project} job={view.job}
          onBack={() => setView({ type: 'project', vehicle: view.vehicle, project: view.project })}
        />
      )}

      {/* Photo Lightbox */}
      {previewPhoto && (
        <div onClick={() => setPreviewPhoto(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: 16, maxWidth: 700, width: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
              <span style={{ fontWeight: 800, color: '#111827' }}>Vehicle Photo — {previewPhoto.vehicleNumber}</span>
              <button onClick={() => setPreviewPhoto(null)} style={{ background: '#E5E7EB', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={14} color="#374151" />
              </button>
            </div>
            <div style={{ padding: 16, background: '#0F172A', textAlign: 'center' }}>
              <img src={previewPhoto.url} alt="Vehicle" style={{ maxHeight: '65vh', maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
