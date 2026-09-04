import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, CheckCircle, Clock, Activity,
  ChevronRight, ArrowUpRight, RefreshCw,
  Truck, Smartphone, Monitor, Search,
  FolderKanban, Settings, Layers, Briefcase,
  Calendar, ChevronDown, X, FolderSync,
} from 'lucide-react';
import { api } from '../services/api';
import { useApp } from '../store/AppContext';
import { getSocket, type DashboardScanEvent, type DashboardKpiEvent, type DashboardDispatchCompleteEvent } from '../services/socket';
import { isStatusChangeLocked, statusLockMessage } from '../utils/statusLock';

// ─── Date helpers ────────────────────────────────────────────────────────────
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function subtractDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

function subtractMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() - n);
  return r;
}

function formatDateLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Preset definitions ───────────────────────────────────────────────────────
type PresetId = 'today' | 'yesterday' | '1m' | '3m' | '6m' | '1y' | 'custom' | 'specific';

interface Preset {
  id: PresetId;
  label: string;
}

const PRESETS: Preset[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '1m', label: 'Last 1 Month' },
  { id: '3m', label: 'Last 3 Months' },
  { id: '6m', label: 'Last 6 Months' },
  { id: '1y', label: 'Last 1 Year' },
  { id: 'custom', label: 'Custom Range' },
  { id: 'specific', label: 'Specific Date' },
];

function parseLocalDateInput(value: string): Date {
  // YYYY-MM-DD from <input type="date"> must be local calendar day, not UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

function computeRange(preset: PresetId, customFrom: string, customTo: string, specificDate: string): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) };
    case 'yesterday': {
      const y = subtractDays(today, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case '1m':
      return { from: startOfDay(subtractMonths(now, 1)), to: endOfDay(now) };
    case '3m':
      return { from: startOfDay(subtractMonths(now, 3)), to: endOfDay(now) };
    case '6m':
      return { from: startOfDay(subtractMonths(now, 6)), to: endOfDay(now) };
    case '1y':
      return { from: startOfDay(subtractMonths(now, 12)), to: endOfDay(now) };
    case 'custom': {
      const f = customFrom ? parseLocalDateInput(customFrom) : subtractDays(today, 30);
      const t = customTo ? parseLocalDateInput(customTo) : now;
      return { from: startOfDay(f), to: endOfDay(t) };
    }
    case 'specific': {
      const d = specificDate ? parseLocalDateInput(specificDate) : today;
      return { from: startOfDay(d), to: endOfDay(d) };
    }
  }
}

function eventInRange(timestamp: string | Date | undefined, from: Date, to: Date): boolean {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function rangeLabel(preset: PresetId, from: Date, to: Date) {
  if (preset === 'today') return 'Today';
  if (preset === 'yesterday') return 'Yesterday';
  if (preset === 'specific') return formatDateLabel(from);
  return `${formatDateLabel(from)} – ${formatDateLabel(to)}`;
}

type FolderPair = {
  pairKey: string;
  t4vjobFile: string | null;
  xlsxFile: string | null;
  sourceJobId: string | null;
  jobName: string | null;
  status: 'PENDING' | 'SYNCED' | 'SKIPPED' | 'FAILED' | 'INCOMPLETE';
  itemsImported: number;
  unitsImported: number;
  message: string | null;
  lastSyncedAt: string | null;
};

type FolderSyncStatus = {
  enabled: boolean;
  folderPath: string;
  intervalMinutes: number;
  running: boolean;
  lastRun: {
    reason?: string;
    scannedPairs?: number;
    imported: number;
    skipped: number;
    failed: number;
    incomplete: number;
    startedAt?: string;
    finishedAt: string;
  } | null;
  pairs: FolderPair[];
  error?: string;
};

function folderPairTone(status: FolderPair['status']) {
  if (status === 'SYNCED') return { bg: '#F0FDF4', border: '#86EFAC', color: '#15803D' };
  if (status === 'SKIPPED') return { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' };
  if (status === 'FAILED') return { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C' };
  if (status === 'INCOMPLETE') return { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' };
  return { bg: '#F5F3FF', border: '#DDD6FE', color: '#5B21B6' };
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  if (!iso) return 'Just now';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatFullDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

interface TrackingFeedItem {
  id: number | string;
  unitId?: number;
  pieceNo: number | string;
  fitting: string;
  itemTracking: string;
  itemId: string;
  projectName: string;
  jobName: string;
  jobCode: string;
  vehicleNumber: string;
  status: string;
  eventType: string;
  source: string;
  userName: string;
  timestamp: string;
  statusLocked?: boolean;
}

function isLiveTrackingStatus(status: string) {
  const s = String(status || '').toUpperCase();
  return s === 'SHIPPED' || s === 'LOADED';
}

function isActualScan(ev: Pick<TrackingFeedItem, 'eventType' | 'source' | 'status'>) {
  const type = String(ev.eventType || '').toUpperCase();
  const source = String(ev.source || '').toLowerCase();
  // Mobile load/complete writes eventType SHIP; portal writes SCAN/SHIP.
  if (type === 'SCAN' || type === 'SHIP' || type === 'UPDATE') return true;
  return (
    source.includes('portal') ||
    source.includes('mobile') ||
    source === 'dashboard' ||
    source === 'projects'
  );
}

function jobLiveStatus(job: {
  totalParts?: number;
  shippedParts?: number;
  pendingParts?: number;
  status?: string;
  _count?: { products?: number; shipped?: number; pending?: number };
}) {
  const total = Number(job.totalParts ?? job._count?.products ?? 0);
  const shipped = Number(job.shippedParts ?? job._count?.shipped ?? 0);
  const pending = Number(job.pendingParts ?? job._count?.pending ?? Math.max(0, total - shipped));
  const allShipped = total > 0 && pending === 0 && shipped >= total;
  if (allShipped) {
    return { label: 'Shipped', className: 'badge-shipped', color: '#FB923C', bg: '#FFF7ED' };
  }
  return { label: 'Active', className: 'badge-active', color: '#047857', bg: '#ECFDF5' };
}

function trackingStatusTone(status: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'SHIPPED') {
    return { label: 'Shipped', className: 'badge-shipped', color: '#FB923C', bg: '#FFF7ED', border: '#FED7AA' };
  }
  if (s === 'LOADED') {
    return { label: 'Loaded', className: 'badge-loaded', color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' };
  }
  return {
    label: s === 'PENDING' || s === 'ACTIVE' || !s ? 'Active' : s,
    className: 'badge-active',
    color: '#047857',
    bg: '#ECFDF5',
    border: '#A7F3D0',
  };
}

function isSameScan(a: TrackingFeedItem, b: TrackingFeedItem) {
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  const aTs = new Date(a.timestamp).getTime();
  const bTs = new Date(b.timestamp).getTime();
  const closeInTime = Number.isFinite(aTs) && Number.isFinite(bTs) && Math.abs(aTs - bTs) < 5000;
  return (
    String(a.pieceNo) === String(b.pieceNo) &&
    String(a.itemTracking) === String(b.itemTracking) &&
    String(a.vehicleNumber) === String(b.vehicleNumber) &&
    closeInTime
  );
}

// ─── Date Filter Bar ──────────────────────────────────────────────────────────
interface DateFilterBarProps {
  activePreset: PresetId;
  customFrom: string;
  customTo: string;
  specificDate: string;
  rangeDisplayLabel: string;
  onPresetChange: (p: PresetId) => void;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  onSpecificDateChange: (v: string) => void;
}

function DateFilterBar({
  activePreset,
  customFrom, customTo, specificDate,
  rangeDisplayLabel,
  onPresetChange, onCustomFromChange, onCustomToChange, onSpecificDateChange,
}: DateFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const quickPresets: PresetId[] = ['today', 'yesterday', '1m', '3m', '6m', '1y'];
  const activeLabel = PRESETS.find(p => p.id === activePreset)?.label || (activePreset === 'specific' ? specificDate : rangeDisplayLabel) || 'Today';

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
      overflow: 'visible',
      transition: 'all 0.2s ease',
    }}>
      {/* ─── Compact Header Toggle (Visible by default) ─── */}
      <div
        onClick={() => setIsExpanded(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            backgroundColor: '#EFF6FF', color: '#1D4ED8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Calendar size={16} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1F2937' }}>
              Filter by Date
            </span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#1D4ED8',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              padding: '2px 9px',
              borderRadius: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              ● {activeLabel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6B7280' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
            {isExpanded ? 'Hide filters' : 'Change date'}
          </span>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}>
            <ChevronDown size={15} color="#374151" />
          </div>
        </div>
      </div>

      {/* ─── Expandable Preset Buttons Section ─── */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '12px 16px',
          borderTop: '1px solid #F1F5F9',
          background: '#F8FAFC',
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
        }}>
          {/* Quick presets */}
          {quickPresets.map(pid => {
            const active = activePreset === pid;
            return (
              <button
                key={pid}
                onClick={(e) => {
                  e.stopPropagation();
                  onPresetChange(pid);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: active ? '1.5px solid #1D4ED8' : '1px solid #E5E7EB',
                  background: active ? '#1D4ED8' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#374151',
                  fontSize: '0.75rem',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {PRESETS.find(p => p.id === pid)?.label}
              </button>
            );
          })}

          {/* Divider */}
          <div style={{ width: 1, height: 22, background: '#E5E7EB' }} />

          {/* Custom Range dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen(prev => !prev);
                if (activePreset !== 'custom' && activePreset !== 'specific') {
                  onPresetChange('custom');
                }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20,
                border: (activePreset === 'custom' || activePreset === 'specific') ? '1.5px solid #7C3AED' : '1px solid #E5E7EB',
                background: (activePreset === 'custom' || activePreset === 'specific') ? '#7C3AED' : '#FFFFFF',
                color: (activePreset === 'custom' || activePreset === 'specific') ? '#FFFFFF' : '#374151',
                fontSize: '0.75rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
              }}
            >
              <Calendar size={12} />
              {activePreset === 'specific' ? 'Specific Date' : 'Custom Range'}
              <ChevronDown size={12} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: '#FFFFFF', border: '1px solid #E5E7EB',
                borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                padding: 16, zIndex: 100, minWidth: 280,
              }}>
                {/* Specific Date / Custom Range toggle */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['custom', 'specific'] as PresetId[]).map(pid => (
                    <button
                      key={pid}
                      onClick={() => onPresetChange(pid)}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 8,
                        border: activePreset === pid ? '1.5px solid #7C3AED' : '1px solid #E5E7EB',
                        background: activePreset === pid ? '#F5F3FF' : '#F9FAFB',
                        color: activePreset === pid ? '#6D28D9' : '#6B7280',
                        fontSize: '0.75rem', fontWeight: activePreset === pid ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {pid === 'custom' ? 'Date Range' : 'Specific Date'}
                    </button>
                  ))}
                </div>

                {activePreset === 'specific' ? (
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={specificDate}
                      max={toISODate(new Date())}
                      onChange={e => onSpecificDateChange(e.target.value)}
                      style={{
                        display: 'block', width: '100%', marginTop: 6,
                        padding: '8px 10px', borderRadius: 8,
                        border: '1.5px solid #DDD6FE', fontSize: '0.82rem',
                        color: '#111827', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        From
                      </label>
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo || toISODate(new Date())}
                        onChange={e => onCustomFromChange(e.target.value)}
                        style={{
                          display: 'block', width: '100%', marginTop: 6,
                          padding: '8px 10px', borderRadius: 8,
                          border: '1.5px solid #DDD6FE', fontSize: '0.82rem',
                          color: '#111827', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        To
                      </label>
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom}
                        max={toISODate(new Date())}
                        onChange={e => onCustomToChange(e.target.value)}
                        style={{
                          display: 'block', width: '100%', marginTop: 6,
                          padding: '8px 10px', borderRadius: 8,
                          border: '1.5px solid #DDD6FE', fontSize: '0.82rem',
                          color: '#111827', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    width: '100%', marginTop: 12, padding: '8px 0',
                    borderRadius: 8, border: 'none', background: '#7C3AED',
                    color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const isAdmin = String(currentUser.role || '').toUpperCase() === 'ADMIN';

  // Date filter state
  const [activePreset, setActivePreset] = useState<PresetId>('today');
  const [customFrom, setCustomFrom] = useState(toISODate(subtractDays(new Date(), 30)));
  const [customTo, setCustomTo] = useState(toISODate(new Date()));
  const [specificDate, setSpecificDate] = useState(toISODate(new Date()));

  // Compute current from/to
  const { from: filterFrom, to: filterTo } = useMemo(
    () => computeRange(activePreset, customFrom, customTo, specificDate),
    [activePreset, customFrom, customTo, specificDate],
  );

  const rangeDisplayLabel = useMemo(
    () => rangeLabel(activePreset, filterFrom, filterTo),
    [activePreset, filterFrom, filterTo],
  );

  // Dashboard data state
  const [liveKpi, setLiveKpi] = useState<any>(null);
  const [liveJobs, setLiveJobs] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<TrackingFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventSourceFilter, setEventSourceFilter] = useState<'ALL' | 'MOBILE' | 'PORTAL'>('ALL');
  const [eventSearch, setEventSearch] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [socketToast, setSocketToast] = useState<{ message: string; type: 'scan' | 'complete' } | null>(null);
  const [newScanIds, setNewScanIds] = useState<Set<string | number>>(new Set());
  const [statusUpdatingUnitId, setStatusUpdatingUnitId] = useState<number | null>(null);

  // ── Folder sync (DataUploads .t4vjob + .xlsx pairs) ─────────────────────
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderStatus, setFolderStatus] = useState<FolderSyncStatus | null>(null);
  const [folderSyncing, setFolderSyncing] = useState(false);
  const [folderSyncError, setFolderSyncError] = useState<string | null>(null);

  async function loadFolderStatus() {
    try {
      const res = await api.getFolderSyncStatus();
      if (res) setFolderStatus(res as FolderSyncStatus);
    } catch {
      /* keep previous */
    }
  }

  async function runFolderSyncNow() {
    if (folderSyncing) return;
    setFolderModalOpen(true);
    setFolderSyncError(null);
    setFolderSyncing(true);
    try {
      await loadFolderStatus();
      await api.runFolderSync();
      await loadFolderStatus();
      loadDashboard(filterFrom, filterTo);
    } catch (e: any) {
      setFolderSyncError(e?.message || 'Folder sync failed. Check that the DataUploads folder is reachable.');
      await loadFolderStatus();
    } finally {
      setFolderSyncing(false);
    }
  }

  async function handleItemStatusChange(unitId: number, newStatus: string) {
    if (!unitId) return;
    const priorEvent = liveEvents.find((ev) => ev.unitId === unitId);
    const wasShipped = isLiveTrackingStatus(priorEvent?.status || '');
    const willShip = newStatus === 'SHIPPED';
    setStatusUpdatingUnitId(unitId);
    try {
      await api.updateProductStatus(unitId, {
        status: newStatus,
        source: 'Dashboard',
        reason: `Status set to ${newStatus} from dashboard`,
      });

      if (!willShip) {
        setLiveEvents((prev) => prev.filter((ev) => ev.unitId !== unitId));
      } else if (priorEvent) {
        setLiveEvents((prev) => {
          const idx = prev.findIndex((ev) => ev.unitId === unitId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], status: newStatus };
          return next;
        });
      }

      if (wasShipped !== willShip) {
        setLiveKpi((prev: Record<string, unknown> | null) => {
          if (!prev) return prev;
          const shipped = Number(prev.shipped ?? prev.loaded ?? 0);
          const pending = Number(prev.pending ?? prev.packed ?? 0);
          const rangeLoaded = Number(prev.rangeLoaded ?? prev.todaysLoaded ?? 0);
          if (willShip) {
            return {
              ...prev,
              shipped: shipped + 1,
              loaded: shipped + 1,
              pending: Math.max(0, pending - 1),
              rangeLoaded: rangeLoaded + 1,
              todaysLoaded: rangeLoaded + 1,
            };
          }
          return {
            ...prev,
            shipped: Math.max(0, shipped - 1),
            loaded: Math.max(0, shipped - 1),
            pending: pending + 1,
            rangeLoaded: Math.max(0, rangeLoaded - 1),
            todaysLoaded: Math.max(0, rangeLoaded - 1),
          };
        });
      }

      await loadDashboard(filterRef.current.from, filterRef.current.to);
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not update item status');
    } finally {
      setStatusUpdatingUnitId(null);
    }
  }

  function closeFolderModal() {
    if (folderSyncing) return;
    setFolderModalOpen(false);
    setFolderSyncError(null);
  }

  async function loadDashboard(from: Date, to: Date) {
    setLoading(true);
    try {
      const [dashData, jobsData] = await Promise.all([
        api.getDashboard({ from: toISODate(from), to: toISODate(to) }).catch(() => null),
        api.getJobs().catch(() => null),
      ]);

      // Ignore stale responses if the user already changed the date filter.
      const latest = filterRef.current;
      if (toISODate(from) !== toISODate(latest.from) || toISODate(to) !== toISODate(latest.to)) {
        return;
      }

      if (dashData?.kpi) setLiveKpi(dashData.kpi);
      if (jobsData && Array.isArray(jobsData)) setLiveJobs(jobsData);

      if (dashData?.recentEvents && Array.isArray(dashData.recentEvents)) {
        setLiveEvents(
          dashData.recentEvents
            .filter(isActualScan)
            .filter((ev) => isLiveTrackingStatus(ev.status))
            .filter((ev) => eventInRange(ev.timestamp, from, to))
            .map((ev: TrackingFeedItem & { unitId?: number }) => ({
              ...ev,
              unitId: ev.unitId != null ? Number(ev.unitId) : undefined,
            })),
        );
      } else {
        setLiveEvents([]);
      }
    } catch {
      // Backend offline — handled gracefully
    } finally {
      setLoading(false);
    }
  }

  // Keep a stable ref to the latest from/to so the interval picks them up
  const filterRef = useRef({ from: filterFrom, to: filterTo });
  filterRef.current = { from: filterFrom, to: filterTo };
  const loadDashboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleDashboardRefresh() {
    if (loadDashboardTimerRef.current) {
      clearTimeout(loadDashboardTimerRef.current);
    }
    loadDashboardTimerRef.current = setTimeout(() => {
      loadDashboard(filterRef.current.from, filterRef.current.to);
    }, 150);
  }

  // ── Socket.IO: connect once, wire live events ────────────────────────────
  useEffect(() => {
    const sock = getSocket();

    const onConnect = () => setIsLive(true);
    const onDisconnect = () => setIsLive(false);

    const onScan = (ev: DashboardScanEvent) => {
      const feedItem: TrackingFeedItem = {
        id: `ws-${ev.partId}-${ev.timestamp}`,
        unitId: ev.partId,
        pieceNo: ev.pieceNo,
        fitting: ev.fitting,
        itemTracking: ev.itemTracking || '',
        itemId: ev.itemId || '',
        projectName: ev.projectName,
        jobName: ev.jobName,
        jobCode: ev.jobCode,
        vehicleNumber: ev.vehicleNumber,
        status: ev.status,
        eventType: ev.status === 'SHIPPED' ? 'SCAN' : 'UPDATE',
        source: ev.source,
        userName: ev.userName,
        timestamp: ev.timestamp,
      };
      const { from, to } = filterRef.current;
      const inSelectedRange = eventInRange(ev.timestamp, from, to);

      setLiveEvents(prev => {
        if (!isLiveTrackingStatus(ev.status)) {
          return prev.filter((existing) => existing.unitId !== ev.partId);
        }
        // Live socket rows only belong in the table when they match the date filter.
        if (!inSelectedRange) {
          return prev.filter((existing) => existing.unitId !== ev.partId);
        }
        const byUnit = prev.findIndex((existing) => existing.unitId === ev.partId);
        if (byUnit >= 0) {
          const next = [...prev];
          next[byUnit] = { ...next[byUnit], ...feedItem, id: next[byUnit].id };
          return next;
        }
        const alreadyListed = prev.some(existing => isSameScan(existing, feedItem));
        if (alreadyListed) return prev;
        return [feedItem, ...prev].slice(0, 200);
      });
      if (inSelectedRange) {
        setNewScanIds(prev => new Set([...prev, feedItem.id]));
        setTimeout(() => setNewScanIds(prev => { const s = new Set(prev); s.delete(feedItem.id); return s; }), 3000);
      }
      const isPortalStatus =
        String(ev.source || '').toLowerCase() === 'dashboard' ||
        String(ev.source || '').toLowerCase() === 'projects' ||
        String(ev.source || '').toLowerCase().includes('portal');
      setSocketToast({
        message: isPortalStatus
          ? `Piece #${ev.pieceNo} — ${ev.status}`
          : `Piece #${ev.pieceNo} scanned — ${ev.vehicleNumber}`,
        type: 'scan',
      });
      setTimeout(() => setSocketToast(null), 4000);
      scheduleDashboardRefresh();
    };

    const onKpi = (ev: DashboardKpiEvent) => {
      if (ev.shipped != null || ev.pending != null || ev.totalProducts != null) {
        setLiveKpi((prev: Record<string, unknown> | null) => (prev ? { ...prev, ...ev } : ev));
      }
      scheduleDashboardRefresh();
    };

    const onDispatchComplete = (ev: DashboardDispatchCompleteEvent) => {
      setSocketToast({ message: `✓ Dispatch ${ev.vehicleNumber} completed — ${ev.productsLoaded} parts loaded`, type: 'complete' });
      setTimeout(() => setSocketToast(null), 5000);
      scheduleDashboardRefresh();
    };

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('dashboard:scan', onScan);
    sock.on('dashboard:kpi', onKpi);
    sock.on('dashboard:dispatch_complete', onDispatchComplete);

    // Reflect current connection state immediately
    if (sock.connected) setIsLive(true);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('dashboard:scan', onScan);
      sock.off('dashboard:kpi', onKpi);
      sock.off('dashboard:dispatch_complete', onDispatchComplete);
    };
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Clear stale rows immediately so the table matches the new date while loading.
    setLiveEvents([]);
    loadDashboard(filterFrom, filterTo);
    // Fallback HTTP poll — 30 s when live socket is connected, 6 s when offline
    const interval = setInterval(() => {
      loadDashboard(filterRef.current.from, filterRef.current.to);
    }, isLive ? 30000 : 6000);
    return () => clearInterval(interval);
  }, [filterFrom, filterTo, isLive]); // re-subscribe when range or connection state changes

  // KPI derivations
  const total = liveKpi?.totalProducts || liveKpi?.totalParts || 0;
  const shipped = liveKpi?.shipped ?? liveKpi?.loaded ?? liveKpi?.shippedParts ?? 0;
  const pending = liveKpi?.pending ?? liveKpi?.packed ?? liveKpi?.pendingParts ?? 0;
  const rangeLoaded = liveKpi?.rangeLoaded ?? liveKpi?.todaysLoaded ?? 0;
  const activeJobsCount = liveKpi?.totalJobs ?? liveJobs.length;
  const totalProjects = liveKpi?.totalProjects ?? liveKpi?.totalClients ?? 0;
  const totalJobs = liveKpi?.totalJobs ?? activeJobsCount;
  const shippedPct = total > 0 ? Math.round((shipped / total) * 100) : 0;

  const periodSub = `${rangeDisplayLabel}`;

  const primaryKPIs = [
    {
      label: 'Active Projects',
      value: totalProjects,
      sub: '',
      icon: <Layers size={20} />,
      color: '#1D4ED8',
      bg: '#EFF6FF',
      border: '#BFDBFE',
    },
    {
      label: 'Active Jobs',
      value: totalJobs,
      sub: '',
      icon: <Briefcase size={20} />,
      color: '#6D28D9',
      bg: '#F5F3FF',
      border: '#DDD6FE',
    },
    {
      label: 'Total Parts',
      value: total,
      sub: '',
      icon: <Package size={20} />,
      color: 'var(--slate-700)',
      bg: 'var(--slate-100)',
      border: 'var(--slate-200)',
    },
    {
      label: 'Shipped Parts',
      value: shipped,
      sub: `${shippedPct}% shipped`,
      icon: <CheckCircle size={20} />,
      color: 'var(--green-700)',
      bg: 'var(--green-50)',
      border: 'rgba(34, 197, 94, 0.25)',
    },
    {
      label: 'Pending Parts',
      value: pending,
      sub: '',
      icon: <Clock size={20} />,
      color: 'var(--amber-700)',
      bg: 'var(--amber-50)',
      border: 'rgba(245, 158, 11, 0.25)',
    },
    {
      label: 'Scans in Period',
      value: rangeLoaded,
      sub: periodSub,
      icon: <Activity size={20} />,
      color: '#047857',
      bg: '#ECFDF5',
      border: '#A7F3D0',
    },
  ];

  // Filtered live events — always scoped to the selected dashboard date range
  const filteredEvents = useMemo(() => {
    return liveEvents.filter(ev => {
      if (!isLiveTrackingStatus(ev.status)) return false;
      if (!eventInRange(ev.timestamp, filterFrom, filterTo)) return false;

      const src = (ev.source ?? '').toLowerCase();
      if (eventSourceFilter === 'MOBILE' && !src.includes('mobile')) return false;
      if (eventSourceFilter === 'PORTAL' && !src.includes('portal')) return false;

      if (eventSearch.trim()) {
        const q = eventSearch.toLowerCase().trim();
        const matches =
          String(ev.pieceNo ?? '').includes(q) ||
          (ev.fitting ?? '').toLowerCase().includes(q) ||
          (ev.itemTracking ?? '').toLowerCase().includes(q) ||
          (ev.projectName ?? '').toLowerCase().includes(q) ||
          (ev.jobName ?? '').toLowerCase().includes(q) ||
          (ev.vehicleNumber ?? '').toLowerCase().includes(q) ||
          (ev.userName ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [liveEvents, eventSourceFilter, eventSearch, filterFrom, filterTo]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Page Header ─── */}
      <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Operations Overview
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Projects, jobs, shipments, and tracking
          </p>
        </div>
        {/* ─── Sync from DataUploads folder ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            id="btn-sync-folder"
            onClick={runFolderSyncNow}
            disabled={folderSyncing}
            title="Check DataUploads for new .t4vjob / .xlsx pairs"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10,
              border: '1.5px solid #7C3AED',
              background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
              color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700,
              cursor: folderSyncing ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
              transition: 'all 0.2s ease',
              opacity: folderSyncing ? 0.85 : 1,
            }}
            onMouseEnter={e => { if (!folderSyncing) e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.4)'; }}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.25)')}
          >
            <FolderSync size={13} style={folderSyncing ? { animation: 'spin 1s linear infinite' } : undefined} />
            {folderSyncing ? 'Checking folder…' : 'Sync from folder'}
          </button>
        </div>
      </div>

      {/* ─── Socket.IO Toast Notification ─── */}
      {socketToast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: socketToast.type === 'complete' ? '#064E3B' : '#1E3A5F',
          color: '#FFFFFF',
          borderRadius: 12, padding: '12px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: '0.85rem', fontWeight: 600,
          animation: 'slideInRight 0.3s ease',
          maxWidth: 360,
        }}>
          {socketToast.type === 'complete'
            ? <CheckCircle size={16} color="#6EE7B7" />
            : <Activity size={16} color="#93C5FD" />
          }
          <span>{socketToast.message}</span>
          <button
            onClick={() => setSocketToast(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ─── Date Filter Bar ─── */}
      <DateFilterBar
        activePreset={activePreset}
        customFrom={customFrom}
        customTo={customTo}
        specificDate={specificDate}
        rangeDisplayLabel={rangeDisplayLabel}
        onPresetChange={setActivePreset}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onSpecificDateChange={setSpecificDate}
      />

      {/* ─── 6 Primary KPI Cards ─── */}
      <div className="kpi-grid">
        {primaryKPIs.map(c => (
          <div key={c.label} className="kpi-card" style={{ borderColor: c.border }}>
            <div className="kpi-header">
              <span className="kpi-label">{c.label}</span>
              <div className="kpi-icon" style={{ background: c.bg, color: c.color }}>
                {c.icon}
              </div>
            </div>
            <div className="kpi-value" style={{ color: c.color }}>
              {c.value.toLocaleString()}
            </div>
            {c.sub ? (
              <div className="kpi-sub">
                {c.sub}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* ─── STRUCTURED LIVE TRACKING STREAM ─── */}
      <div className="card" style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857' }}>
              <Activity size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                Tracking
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#047857',
                  backgroundColor: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  padding: '2px 8px',
                  borderRadius: 999,
                  letterSpacing: '0.02em',
                }}>
                  {filteredEvents.length}
                </span>
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#6B7280' }}>
                Recent scans · <span style={{ color: '#1D4ED8', fontWeight: 600 }}>{rangeDisplayLabel}</span>
                {' · '}
                {filteredEvents.length} {filteredEvents.length === 1 ? 'scan' : 'scans'}
              </p>
            </div>
          </div>

          {/* Filter Controls & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type="text"
                placeholder="Filter tracking events…"
                value={eventSearch}
                onChange={e => setEventSearch(e.target.value)}
                style={{
                  width: '100%', padding: '5px 8px 5px 28px',
                  borderRadius: 6, border: '1px solid #E5E7EB',
                  fontSize: '0.78rem', backgroundColor: '#F9FAFB', outline: 'none',
                }}
              />
            </div>

            {/* Source segmented control */}
            <div style={{ display: 'flex', backgroundColor: '#F3F4F6', padding: 2, borderRadius: 6 }}>
              <button
                onClick={() => setEventSourceFilter('ALL')}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  backgroundColor: eventSourceFilter === 'ALL' ? '#FFFFFF' : 'transparent',
                  color: eventSourceFilter === 'ALL' ? '#111827' : '#6B7280',
                  boxShadow: eventSourceFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                All Sources
              </button>
              <button
                onClick={() => setEventSourceFilter('MOBILE')}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  backgroundColor: eventSourceFilter === 'MOBILE' ? '#FFFFFF' : 'transparent',
                  color: eventSourceFilter === 'MOBILE' ? '#047857' : '#6B7280',
                  boxShadow: eventSourceFilter === 'MOBILE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}
              >
                <Smartphone size={11} /> Mobile Scans
              </button>
              <button
                onClick={() => setEventSourceFilter('PORTAL')}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  backgroundColor: eventSourceFilter === 'PORTAL' ? '#FFFFFF' : 'transparent',
                  color: eventSourceFilter === 'PORTAL' ? '#1D4ED8' : '#6B7280',
                  boxShadow: eventSourceFilter === 'PORTAL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}
              >
                <Monitor size={11} /> Portal Scans
              </button>
            </div>
          </div>
        </div>

        {/* Events Table */}
        <div style={{ overflowX: 'auto', maxHeight: 420 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '9px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 44, textAlign: 'center' }}>#</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 140 }}>PIECE &amp; FITTING</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>PROJECT &amp; JOB</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 120 }}>VEHICLE NO</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 130 }}>TRACKING / ID</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 110 }}>STATUS</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 120 }}>SCAN METHOD</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 110 }}>OPERATOR</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 110, textAlign: 'right' }}>TIMESTAMP</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: '#6B7280' }}>
                    <Activity size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>No tracking events in this period</div>
                    <div style={{ fontSize: 12, marginTop: 3 }}>Try a different date range or scan parts from the mobile app.</div>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev, index) => {
                  const isMobile = (ev.source ?? '').toLowerCase().includes('mobile');
                  const evStatus = trackingStatusTone(ev.status);
                  return (
                    <tr
                      key={ev.id}
                      style={{ borderBottom: '1px solid #F3F4F6', transition: 'background-color 0.15s ease' }}
                      className={`hover:bg-slate-50${newScanIds.has(ev.id) ? ' scan-row-new' : ''}`}
                    >
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#6B7280', fontWeight: 700, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                        {index + 1}
                      </td>
                      {/* Piece & Fitting */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 30, height: 30, borderRadius: 6,
                              backgroundColor: evStatus.bg, border: `1.5px solid ${evStatus.color}`,
                              color: evStatus.color, fontWeight: 800, fontSize: '0.75rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}
                          >
                            #{ev.pieceNo}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.8125rem' }}>{ev.fitting}</div>
                            {!isAdmin && (
                              <span className={`badge ${evStatus.className}`} style={{ fontSize: '0.68rem', padding: '1px 8px', marginTop: 2 }}>
                                {evStatus.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Project & Job */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1E3A8A', fontWeight: 700, fontSize: '0.78rem' }}>
                            <FolderKanban size={12} color="#2563EB" />
                            <span>{ev.projectName}</span>
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#4B5563', fontSize: '0.72rem' }}>
                            <Settings size={11} color="#6B7280" />
                            <span>{ev.jobName}</span>
                          </div>
                        </div>
                      </td>

                      {/* Vehicle Number */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0',
                          color: '#047857', padding: '2px 8px', borderRadius: 6,
                          fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap',
                        }}>
                          <Truck size={12} />
                          <span>{ev.vehicleNumber}</span>
                        </span>
                      </td>

                      {/* Tracking / ID */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A', fontSize: '0.78rem' }}>{ev.itemTracking}</div>
                        {ev.itemId && ev.itemId !== '—' && (
                          <div style={{ fontSize: '0.68rem', color: '#6B7280' }}>ID: {ev.itemId}</div>
                        )}
                      </td>

                      {/* Status (admin can edit) */}
                      <td style={{ padding: '10px 14px' }}>
                        {isAdmin && ev.unitId ? (
                          isLiveTrackingStatus(ev.status) ? (
                            ev.statusLocked || isStatusChangeLocked(ev.timestamp) ? (
                              <span
                                className={`badge ${evStatus.className}`}
                                style={{ fontSize: '0.68rem' }}
                                title={statusLockMessage()}
                              >
                                {evStatus.label}
                              </span>
                            ) : (
                              <select
                                className="form-select"
                                value="SHIPPED"
                                disabled={statusUpdatingUnitId === ev.unitId}
                                onChange={(e) => {
                                  if (e.target.value === 'PENDING') {
                                    handleItemStatusChange(ev.unitId!, 'PENDING');
                                  }
                                }}
                                style={{ fontSize: '0.72rem', padding: '4px 8px', minWidth: 96, fontWeight: 700 }}
                              >
                                <option value="SHIPPED">Shipped</option>
                                <option value="PENDING">Active</option>
                              </select>
                            )
                          ) : (
                            <span
                              className={`badge ${trackingStatusTone(ev.status).className}`}
                              style={{ fontSize: '0.68rem' }}
                              title="Scan on mobile to mark as shipped"
                            >
                              {trackingStatusTone(ev.status).label}
                            </span>
                          )
                        ) : (
                          <span className={`badge ${evStatus.className}`} style={{ fontSize: '0.68rem' }}>
                            {evStatus.label}
                          </span>
                        )}
                      </td>

                      {/* Scan Method */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700,
                          backgroundColor: isMobile ? '#F0FDF4' : '#EFF6FF',
                          color: isMobile ? '#047857' : '#1D4ED8',
                          border: isMobile ? '1px solid #BBF7D0' : '1px solid #BFDBFE',
                        }}>
                          {isMobile ? <Smartphone size={11} /> : <Monitor size={11} />}
                          <span>{ev.source}</span>
                        </span>
                      </td>

                      {/* Operator */}
                      <td style={{ padding: '10px 14px', color: '#374151', fontWeight: 600, fontSize: '0.78rem' }}>
                        {ev.userName}
                      </td>

                      {/* Timestamp */}
                      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.78rem' }}>{timeAgo(ev.timestamp)}</div>
                        <div style={{ fontSize: '0.68rem', color: '#9CA3AF' }} title={formatFullDate(ev.timestamp)}>
                          {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Active Fabrication Jobs Section ─── */}
      <div className="card" style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>Jobs</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            View All Projects <ChevronRight size={14} />
          </button>
        </div>
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>JOB NAME</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>PROJECT</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>TOTAL PIECES</th>
                <th style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>STATUS</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {liveJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No jobs yet. Sync from the DataUploads folder above.
                  </td>
                </tr>
              ) : (
                liveJobs.map((job) => {
                  const jobStatus = jobLiveStatus(job);
                  return (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/projects?project=${job.project?.id || 1}&job=${job.id}`)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
                    className="hover:bg-slate-50"
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13.5 }}>
                        {job.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span className="chip" style={{ fontSize: 10 }}>Job #{job.code}</span>
                        <span className="chip" style={{ fontSize: 10 }}>Upload v{job.importVersion ?? 1}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {job.project?.name || 'General Project'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{job._count?.products || 0} pieces</span>
                    </td>
                    <td style={{ padding: '10px 14px', background: jobStatus.bg }}>
                      <span className={`badge ${jobStatus.className}`}>
                        {jobStatus.label === 'Shipped' && <Truck size={12} />}
                        {jobStatus.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 16 }}>
                      <span style={{ color: 'var(--green-600)', display: 'inline-flex', alignItems: 'center' }}>
                        <ArrowUpRight size={16} />
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Folder Sync Modal ─── */}
      {folderModalOpen && (() => {
        const pairs = folderStatus?.pairs ?? [];
        const lastRun = folderStatus?.lastRun;
        const interval = folderStatus?.intervalMinutes ?? 5;
        const folderPath = folderStatus?.folderPath || '/Users/mangeshkharat/DataUploads';
        const imported = lastRun?.imported ?? 0;
        const skipped = lastRun?.skipped ?? 0;
        const failed = lastRun?.failed ?? 0;
        const incomplete = lastRun?.incomplete ?? 0;
        const done = !folderSyncing && Boolean(lastRun || folderSyncError);

        return (
          <div
            id="folder-sync-modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget && !folderSyncing) closeFolderModal(); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
          >
            <div style={{
              background: '#FFFFFF', borderRadius: 20,
              boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
              width: '100%', maxWidth: 560,
              maxHeight: '92vh',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: folderSyncing
                      ? 'linear-gradient(135deg, #D97706, #B45309)'
                      : folderSyncError
                        ? 'linear-gradient(135deg, #DC2626, #B91C1C)'
                        : 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FolderSync size={16} color="#FFFFFF" style={folderSyncing ? { animation: 'spin 1s linear infinite' } : {}} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>
                      {folderSyncing ? 'Checking folder…' : folderSyncError ? 'Folder sync failed' : 'Folder sync'}
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#6B7280' }}>
                      Watches {folderPath} every {interval} minutes for new .t4vjob + .xlsx pairs
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeFolderModal}
                  disabled={folderSyncing}
                  style={{
                    background: 'none', border: 'none', cursor: folderSyncing ? 'not-allowed' : 'pointer',
                    color: '#9CA3AF', padding: 6, borderRadius: 8,
                    opacity: folderSyncing ? 0.3 : 1, flexShrink: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {folderSyncing && (
                <div style={{ padding: '28px 24px', textAlign: 'center', color: '#6B7280' }}>
                  <RefreshCw size={22} color="#7C3AED" style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827' }}>Looking for new files</div>
                  <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
                    Already-imported jobs are skipped. New matching pairs are imported into the item schedule.
                  </div>
                </div>
              )}

              {!folderSyncing && (
                <>
                  {folderSyncError && (
                    <div style={{
                      margin: '14px 24px 0',
                      background: '#FEF2F2', border: '1.5px solid #FECACA',
                      borderRadius: 10, padding: '10px 14px',
                      fontSize: '0.8rem', color: '#B91C1C', fontWeight: 500,
                    }}>
                      {folderSyncError}
                    </div>
                  )}

                  {folderStatus?.error && !folderSyncError && (
                    <div style={{
                      margin: '14px 24px 0',
                      background: '#FEF2F2', border: '1.5px solid #FECACA',
                      borderRadius: 10, padding: '10px 14px',
                      fontSize: '0.8rem', color: '#B91C1C', fontWeight: 500,
                    }}>
                      {folderStatus.error}
                    </div>
                  )}

                  {done && lastRun && (
                    <div style={{
                      margin: '14px 24px 0', padding: '10px 12px', borderRadius: 10,
                      background: '#F5F3FF', border: '1px solid #DDD6FE',
                      display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.76rem', fontWeight: 700,
                    }}>
                      <span style={{ color: '#15803D' }}>{imported} imported</span>
                      <span style={{ color: '#B45309' }}>{skipped} already in DB</span>
                      <span style={{ color: '#B91C1C' }}>{failed} failed</span>
                      <span style={{ color: '#1D4ED8' }}>{incomplete} incomplete</span>
                    </div>
                  )}

                  <div style={{ overflowY: 'auto', flex: 1, padding: '12px 24px', minHeight: 120 }}>
                    {pairs.length === 0 ? (
                      <div style={{ padding: '28px 0', textAlign: 'center', color: '#9CA3AF', fontSize: '0.82rem' }}>
                        No .t4vjob / .xlsx pairs found in the watch folder yet.
                      </div>
                    ) : (
                      pairs.map((pair) => {
                        const tone = folderPairTone(pair.status);
                        return (
                          <div key={pair.pairKey} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 11,
                            padding: '9px 12px', marginBottom: 6,
                            borderRadius: 10,
                            background: tone.bg,
                            border: `1px solid ${tone.border}`,
                          }}>
                            <div style={{ flexShrink: 0, marginTop: 1 }}>
                              {pair.status === 'SYNCED' && <CheckCircle size={14} color="#16A34A" />}
                              {pair.status === 'SKIPPED' && <Clock size={14} color="#D97706" />}
                              {pair.status === 'FAILED' && <span style={{ fontSize: '0.8rem' }}>✗</span>}
                              {pair.status === 'INCOMPLETE' && <span style={{ fontSize: '0.8rem', color: '#2563EB' }}>○</span>}
                              {pair.status === 'PENDING' && <RefreshCw size={14} color="#7C3AED" />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontWeight: 700, fontSize: '0.82rem', color: tone.color,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {pair.jobName || pair.pairKey}
                              </div>
                              <div style={{ fontSize: '0.71rem', color: '#9CA3AF' }}>
                                {[pair.t4vjobFile, pair.xlsxFile].filter(Boolean).join(' + ') || pair.pairKey}
                                {pair.sourceJobId ? ` · ${pair.sourceJobId}` : ''}
                              </div>
                              {pair.message && (
                                <div style={{ fontSize: '0.7rem', color: '#374151', marginTop: 3 }}>
                                  {pair.message}
                                  {pair.itemsImported > 0 && ` · ${pair.itemsImported} rows / ${pair.unitsImported} pieces`}
                                </div>
                              )}
                            </div>
                            <span style={{
                              flexShrink: 0, fontSize: '0.65rem', fontWeight: 800,
                              padding: '2px 7px', borderRadius: 99, color: tone.color,
                              background: '#FFFFFF', border: `1px solid ${tone.border}`,
                            }}>
                              {pair.status}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{
                    padding: '14px 24px', borderTop: '1px solid #F3F4F6',
                    display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
                  }}>
                    <button
                      onClick={runFolderSyncNow}
                      disabled={folderSyncing}
                      style={{
                        padding: '9px 18px', borderRadius: 9, border: '1.5px solid #E5E7EB',
                        background: '#FFFFFF', color: '#374151', fontSize: '0.82rem',
                        fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <RefreshCw size={13} /> Sync again
                    </button>
                    <button
                      onClick={closeFolderModal}
                      style={{
                        padding: '9px 22px', borderRadius: 9, border: 'none',
                        background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                        color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <CheckCircle size={13} /> Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
