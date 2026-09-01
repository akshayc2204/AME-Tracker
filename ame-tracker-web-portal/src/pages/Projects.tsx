import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FolderKanban, Briefcase, Package, ChevronRight, ArrowLeft,
  Search, ChevronUp, ChevronDown, X, CheckCircle, Clock, Tag
} from 'lucide-react';
import type { Part, TrackingStatus } from '../data/mockData';
import { api } from '../services/api';
import PartDrawer from '../components/PartDrawer';

const ITEM_SCHEDULE_HEADERS = [
  'Item',
  '#',
  'Metal',
  'Liner and Insulation',
  'Qty',
  'Information',
  'Area',
  'Weight',
  'Cost',
  'Hours',
  'Segmented',
  'Alpha #',
  'Drawing',
  'Floor',
  'System',
  'Pressure',
  'Change Order',
  'User 1',
  'User 2',
  'Modified',
  'Bad',
  'Raw Weight',
  'Raw Area',
  'Instructions',
  'Field Verify',
  'Length',
  'Joint 1',
  'Joint 2',
  'Joint 3',
  'Joint 4',
  'Seam',
  'Throat Seam',
  'Gore Seam',
  'Holes',
] as const;

const TRACKING_EXPORT_HEADERS = [
  'ItemTracking',
  'IDJob',
  'ItemID',
  'Fitting',
  'PieceNbr',
  'Description',
  'SCANDATE',
  'TrackingStatus',
  'Component',
  'Location',
  'Storage',
  'InContainer',
  'ContainerName',
  'StatusSequence',
  'BackOrdered',
] as const;

const DATETIME_HEADER = 'Tracking Date/Time';
const LIVE_STATUS_HEADERS = ['Status', DATETIME_HEADER] as const;
const SCHEDULE_TABLE_HEADERS = [...LIVE_STATUS_HEADERS, ...ITEM_SCHEDULE_HEADERS] as const;
const TRACKING_TABLE_HEADERS = [...LIVE_STATUS_HEADERS, ...TRACKING_EXPORT_HEADERS] as const;

type ScheduleSortKey = (typeof SCHEDULE_TABLE_HEADERS)[number];
type TrackingSortKey = (typeof TRACKING_TABLE_HEADERS)[number];
type TableView = 'schedule' | 'tracking';

const TRACKING_NONE_HEADERS = new Set<string>(['Description', 'TrackingStatus', 'BackOrdered']);
const TRACKING_BOOL_HEADERS = new Set<string>(['Component', 'InContainer']);

function scheduleCell(value: string | number | boolean | null | undefined): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(4)));
  }
  return String(value);
}

function trackingCell(
  header: TrackingSortKey,
  value: string | number | boolean | null | undefined,
): string {
  if (header === DATETIME_HEADER) return formatTimestamp(value);
  if (TRACKING_BOOL_HEADERS.has(header)) {
    return value === true || value === 1 || value === 'True' || value === 'true' ? 'True' : 'False';
  }
  if (value === null || value === undefined || value === '') {
    return TRACKING_NONE_HEADERS.has(header) ? 'None' : '—';
  }
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function formatTimestamp(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || 'PENDING').toUpperCase();
  const cls = s === 'SHIPPED' ? 'badge-shipped'
    : s === 'LOADED' ? 'badge-loaded'
    : s === 'PARTIAL' ? 'badge-partial'
    : s === 'CANCELLED' ? 'badge-cancelled'
    : 'badge-pending';
  return <span className={`badge ${cls}`}><span className="badge-dot" />{s}</span>;
}

function compareSchedule(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
  dir: 'asc' | 'desc',
): number {
  const av = a ?? '';
  const bv = b ?? '';
  const an = typeof av === 'number' ? av : Number(String(av).replace(/[^\d.-]/g, ''));
  const bn = typeof bv === 'number' ? bv : Number(String(bv).replace(/[^\d.-]/g, ''));
  if (Number.isFinite(an) && Number.isFinite(bn) && String(av).match(/^-?\d/) && String(bv).match(/^-?\d/)) {
    if (an !== bn) return dir === 'asc' ? an - bn : bn - an;
    return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  }
  const as = String(av).toLowerCase();
  const bs = String(bv).toLowerCase();
  if (as < bs) return dir === 'asc' ? -1 : 1;
  if (as > bs) return dir === 'asc' ? 1 : -1;
  return 0;
}

export default function Projects() {
  const [params, setParams] = useSearchParams();
  // Import page disabled — jobs come from DataUploads folder sync
  // const navigate = useNavigate();

  const [liveProjects, setLiveProjects] = useState<any[]>([]);
  const [liveJobs, setLiveJobs] = useState<any[]>([]);

  function loadData() {
    api.getProjects().then((p) => { if (Array.isArray(p)) setLiveProjects(p); }).catch(() => {});
    api.getJobs().then((j) => { if (Array.isArray(j)) setLiveJobs(j); }).catch(() => {});
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const allProjects = useMemo(() => liveProjects.map(p => {
    const totalParts = Number(p.totalParts ?? p._count?.parts ?? 0);
    const shippedParts = Number(p.shippedParts ?? p._count?.shipped ?? 0);
    const pendingParts = Number(p.pendingParts ?? p._count?.pending ?? (totalParts - shippedParts));

    return {
      id: String(p.id),
      name: p.projectName || p.name,
      code: (p.sourceProjectName || p.projectName || p.name || '').slice(0, 8),
      status: 'ACTIVE' as const,
      totalJobs: p.totalJobs ?? p._count?.jobs ?? 1,
      activeJobs: p.activeJobs ?? p._count?.jobs ?? 1,
      totalParts,
      shippedParts,
      pendingParts,
    };
  }), [liveProjects]);

  const allJobs = useMemo(() => liveJobs.map(j => {
    const totalParts = Number(j.totalParts ?? j._count?.products ?? j._count?.parts ?? 0);
    const shippedParts = Number(j.shippedParts ?? j._count?.shipped ?? 0);
    const pendingParts = Number(j.pendingParts ?? j._count?.pending ?? (totalParts - shippedParts));

    return {
      id: String(j.id),
      projectId: String(j.project?.id || 'p1'),
      sourceJobId: Number(j.code || j.sourceJobId) || 70037,
      downloadId: Number(j.t4vjobDownloadId) || 68,
      jobName: j.name || j.jobName,
      projectName: j.project?.name || j.project?.projectName || 'Project',
      status: 'ACTIVE' as const,
      importedAt: new Date().toISOString(),
      importedBy: 'Admin',
      totalParts,
      shippedParts,
      pendingParts,
    };
  }), [liveJobs]);

  const projectId = params.get('project');
  const jobId = params.get('job');

  const selectedProject = useMemo(() => {
    return projectId ? allProjects.find(p => p.id === projectId) || null : null;
  }, [projectId, allProjects]);

  const selectedJob = useMemo(() => {
    return (selectedProject && jobId) ? allJobs.find(j => j.id === jobId && j.projectId === selectedProject.id) || null : null;
  }, [selectedProject, jobId, allJobs]);

  // Level 3 (Parts) state
  const [search, setSearch] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [tableView, setTableView] = useState<TableView>('schedule');
  const [sortKey, setSortKey] = useState<ScheduleSortKey>('#');
  const [trackingSortKey, setTrackingSortKey] = useState<TrackingSortKey>('ItemTracking');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [liveParts, setLiveParts] = useState<Part[]>([]);
  const [liveTracking, setLiveTracking] = useState<Array<{
    id: string;
    status: string;
    trackingDateTime: string | null;
    values: Record<string, string | number | boolean | null>;
  }>>([]);

  const selectedJobSourceId = selectedJob ? String(selectedJob.sourceJobId || selectedJob.id) : null;

  useEffect(() => {
    if (selectedJob && selectedJobSourceId) {
      api.getItemSchedule(selectedJobSourceId)
        .then((res) => {
          if (res?.items) {
            const mapped: Part[] = res.items.map((item) => {
              const values = item.values || {};
              return {
                id: String(item.id),
                jobId: selectedJob.id,
                pieceNbr: values['#'] ?? values['Alpha #'] ?? item.sourceItemId,
                fitting: String(values.Item || '—'),
                itemId: item.sourceItemId,
                description: String(values.Information || ''),
                metal: values.Metal != null ? String(values.Metal) : '',
                information: values.Information != null ? String(values.Information) : '',
                area: typeof values.Area === 'number' ? values.Area : undefined,
                weight: typeof values.Weight === 'number' ? values.Weight : undefined,
                status: (item.status || 'PENDING') as TrackingStatus,
                trackingDateTime: item.trackingDateTime || null,
                schedule: values,
                trackingRecords: (item.trackingRecords || []).map((tr) => ({
                  id: tr.id,
                  partId: tr.partId,
                  itemTracking: tr.itemTracking,
                  qrCode: tr.qrCode,
                  status: tr.status as TrackingStatus,
                  trackingDateTime: tr.trackingDateTime || null,
                })),
              };
            });
            setLiveParts(mapped);
          }
        })
        .catch(() => {});
      api.getTrackingExport(selectedJobSourceId)
        .then((res) => {
          if (res?.items) {
            setLiveTracking(res.items.map((row) => ({
              id: String(row.id),
              status: row.status || 'PENDING',
              trackingDateTime: row.trackingDateTime || null,
              values: row.values || {},
            })));
          }
        })
        .catch(() => setLiveTracking([]));
    } else {
      setLiveParts([]);
      setLiveTracking([]);
    }
  }, [selectedJob?.id, selectedJobSourceId]);

  const jobParts = liveParts;

  const itemNames = useMemo(
    () => [...new Set(jobParts.map((p) => String(p.schedule?.Item || p.fitting)))].sort(),
    [jobParts],
  );

  const filteredParts = useMemo(() => {
    return jobParts.filter((p) => {
      const q = search.toLowerCase();
      const values = p.schedule || {};
      const matchSearch = !q
        || (p.status || '').toLowerCase().includes(q)
        || formatTimestamp(p.trackingDateTime).toLowerCase().includes(q)
        || ITEM_SCHEDULE_HEADERS.some((header) =>
          scheduleCell(values[header]).toLowerCase().includes(q),
        );
      const matchItem = !itemFilter || String(values.Item || p.fitting) === itemFilter;
      return matchSearch && matchItem;
    }).sort((a, b) => {
      if (sortKey === 'Status') return compareSchedule(a.status, b.status, sortDir);
      if (sortKey === DATETIME_HEADER) return compareSchedule(a.trackingDateTime, b.trackingDateTime, sortDir);
      return compareSchedule(a.schedule?.[sortKey], b.schedule?.[sortKey], sortDir);
    });
  }, [jobParts, search, itemFilter, sortKey, sortDir]);

  const fittingNames = useMemo(
    () => [...new Set(liveTracking.map((row) => String(row.values.Fitting || '')).filter(Boolean))].sort(),
    [liveTracking],
  );

  const filteredTracking = useMemo(() => {
    return liveTracking.filter((row) => {
      const q = search.toLowerCase();
      const matchSearch = !q
        || (row.status || '').toLowerCase().includes(q)
        || formatTimestamp(row.trackingDateTime).toLowerCase().includes(q)
        || TRACKING_EXPORT_HEADERS.some((header) =>
          trackingCell(header, row.values[header]).toLowerCase().includes(q),
        );
      const matchItem = !itemFilter || String(row.values.Fitting || '') === itemFilter;
      return matchSearch && matchItem;
    }).sort((a, b) => {
      if (trackingSortKey === 'Status') return compareSchedule(a.status, b.status, sortDir);
      if (trackingSortKey === DATETIME_HEADER) return compareSchedule(a.trackingDateTime, b.trackingDateTime, sortDir);
      return compareSchedule(a.values[trackingSortKey], b.values[trackingSortKey], sortDir);
    });
  }, [liveTracking, search, itemFilter, trackingSortKey, sortDir]);

  const activeRows = tableView === 'schedule' ? filteredParts : filteredTracking;
  const totalPages = Math.ceil(activeRows.length / PAGE_SIZE);
  const paginatedParts = filteredParts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paginatedTracking = filteredTracking.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function selectProject(projId: string | null) {
    if (projId) {
      setParams({ project: projId });
    } else {
      setParams({});
    }
    setSearch('');
    setItemFilter('');
    setSortKey('#');
    setTrackingSortKey('ItemTracking');
    setSortDir('asc');
    setTableView('schedule');
    setPage(1);
  }

  function selectJob(jId: string | null) {
    if (selectedProject && jId) {
      setParams({ project: selectedProject.id, job: jId });
    } else if (selectedProject) {
      setParams({ project: selectedProject.id });
    } else {
      setParams({});
    }
    setSearch('');
    setItemFilter('');
    setSortKey('#');
    setTrackingSortKey('ItemTracking');
    setSortDir('asc');
    setTableView('schedule');
    setPage(1);
  }

  function toggleSort(key: ScheduleSortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  function toggleTrackingSort(key: TrackingSortKey) {
    if (trackingSortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setTrackingSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  function switchTableView(view: TableView) {
    setTableView(view);
    setSearch('');
    setItemFilter('');
    setSortDir('asc');
    setPage(1);
  }

  function SortIcon({ k }: { k: ScheduleSortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  function TrackingSortIcon({ k }: { k: TrackingSortKey }) {
    if (trackingSortKey !== k) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  // ─── LEVEL 3: JOB PARTS & TRACKING VIEW ──────────────────────────────────────
  if (selectedProject && selectedJob) {
    const allTracking = jobParts.flatMap(p => p.trackingRecords);
    const shipped = allTracking.filter(tr => tr.status === 'SHIPPED').length;
    const pending = allTracking.filter(tr => tr.status === 'PENDING').length;
    const totalQty = jobParts.reduce((sum, p) => sum + Number(p.schedule?.Qty ?? 0), 0);
    const pct = allTracking.length ? Math.round((shipped / allTracking.length) * 100) : 0;

    return (
      <div className="job-detail-page">
        {/* Breadcrumbs Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 8px', color: 'var(--green-700)', fontWeight: 600 }}
            onClick={() => selectProject(null)}
          >
            <FolderKanban size={13} style={{ marginRight: 4 }} /> Projects
          </button>
          <ChevronRight size={14} color="var(--slate-400)" />
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 8px', color: 'var(--green-700)', fontWeight: 600 }}
            onClick={() => selectJob(null)}
          >
            <Briefcase size={13} style={{ marginRight: 4 }} /> {selectedProject.name}
          </button>
          <ChevronRight size={14} color="var(--slate-400)" />
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Package size={13} color="var(--amber-600)" /> {selectedJob.jobName}
          </span>
        </div>

        {/* Header Banner */}
        <div style={{ marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => selectJob(null)} style={{ marginBottom: 12 }}>
            <ArrowLeft size={13} /> Back to {selectedProject.name} Jobs
          </button>

          <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800 }}>{selectedJob.jobName}</h2>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>{selectedProject.name}</span>
                <span>·</span>
                <span className="chip" style={{ fontSize: 11 }}>Job ID: {selectedJob.sourceJobId}</span>
                <span className="chip" style={{ fontSize: 11 }}>Download ID: {selectedJob.downloadId}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`badge badge-${selectedJob.status.toLowerCase()}`} style={{ fontSize: 12, padding: '5px 12px' }}>
                {selectedJob.status}
              </span>
            </div>
          </div>

          {/* KPI row */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 18, width: '100%', maxWidth: '100%' }}>
            {[
              { icon: <Package size={16} />, label: 'Total Parts', value: totalQty, color: 'var(--slate-700)', bg: 'var(--slate-100)' },
              { icon: <CheckCircle size={16} />, label: 'Shipped', value: shipped, color: 'var(--green-600)', bg: 'var(--green-50)' },
              { icon: <Clock size={16} />, label: 'Pending', value: pending, color: 'var(--amber-600)', bg: 'var(--amber-50)' },
              { icon: <Tag size={16} />, label: 'Progress', value: `${pct}%`, color: 'var(--green-700)', bg: 'var(--green-100)' },
            ].map(c => (
              <div key={c.label} className="kpi-card" style={{ flexDirection: 'row', gap: 10 }}>
                <div className="kpi-icon" style={{ background: c.bg, flexShrink: 0 }}>
                  <span style={{ color: c.color }}>{c.icon}</span>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="progress-bar" style={{ height: 8 }}>
              <div className="progress-bar-fill green" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Parts Table Card */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Parts &amp; Tracking Records</div>
              <div className="card-subtitle">
                {tableView === 'schedule'
                  ? 'Item Schedule columns'
                  : 'Tracking Export columns (one row per physical piece)'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{
                display: 'flex',
                background: 'var(--slate-100)',
                borderRadius: 8,
                padding: 2,
              }}>
                <button
                  className="btn btn-sm"
                  onClick={() => switchTableView('schedule')}
                  style={{
                    background: tableView === 'schedule' ? '#fff' : 'transparent',
                    boxShadow: tableView === 'schedule' ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                    color: tableView === 'schedule' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Item Schedule ({jobParts.length})
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => switchTableView('tracking')}
                  style={{
                    background: tableView === 'tracking' ? '#fff' : 'transparent',
                    boxShadow: tableView === 'tracking' ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                    color: tableView === 'tracking' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Tracking Export ({liveTracking.length})
                </button>
              </div>
              <div className="topbar-search" style={{ flex: 'none' }}>
                <Search size={13} />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder={tableView === 'schedule' ? 'Search item schedule…' : 'Search tracking export…'}
                  style={{ width: 180 }}
                />
                {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
              </div>
              <select
                className="form-select"
                style={{ width: 170, padding: '6px 10px', fontSize: 12 }}
                value={itemFilter}
                onChange={e => { setItemFilter(e.target.value); setPage(1); }}
              >
                <option value="">{tableView === 'schedule' ? 'All Items' : 'All Fittings'}</option>
                {(tableView === 'schedule' ? itemNames : fittingNames).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {tableView === 'schedule'
                  ? `${filteredParts.length} of ${jobParts.length} rows`
                  : `${filteredTracking.length} of ${liveTracking.length} rows`}
              </span>
            </div>
          </div>

          <div className="table-wrapper">
            {tableView === 'schedule' ? (
              <table className="item-schedule-table">
                <thead>
                  <tr>
                    {SCHEDULE_TABLE_HEADERS.map((header) => (
                      <th
                        key={header}
                        onClick={() => toggleSort(header)}
                        className={header === 'Status' || header === DATETIME_HEADER ? 'col-live' : undefined}
                        style={{ cursor: 'pointer' }}
                      >
                        {header} <SortIcon k={header} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedParts.map(part => (
                    <tr key={part.id} onClick={() => setSelectedPart(part)} style={{ cursor: 'pointer' }}>
                      {SCHEDULE_TABLE_HEADERS.map((header) => (
                        <td
                          key={header}
                          className={[
                            header === '#' || header === 'Alpha #' ? 'td-mono' : '',
                            header === 'Status' || header === DATETIME_HEADER ? 'col-live' : '',
                          ].filter(Boolean).join(' ') || undefined}
                          title={header === 'Status' ? part.status || 'PENDING' : header === DATETIME_HEADER ? formatTimestamp(part.trackingDateTime) : scheduleCell(part.schedule?.[header])}
                        >
                          {header === 'Status'
                            ? <StatusBadge status={part.status || 'PENDING'} />
                            : header === DATETIME_HEADER
                              ? formatTimestamp(part.trackingDateTime)
                              : scheduleCell(part.schedule?.[header])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="item-schedule-table tracking-export-table">
                <thead>
                  <tr>
                    {TRACKING_TABLE_HEADERS.map((header) => (
                      <th
                        key={header}
                        onClick={() => toggleTrackingSort(header)}
                        className={header === 'Status' || header === DATETIME_HEADER ? 'col-live' : undefined}
                        style={{ cursor: 'pointer' }}
                      >
                        {header} <TrackingSortIcon k={header} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedTracking.map(row => (
                    <tr key={row.id}>
                      {TRACKING_TABLE_HEADERS.map((header) => (
                        <td
                          key={header}
                          className={[
                            header === 'ItemTracking' || header === 'PieceNbr' || header === 'ItemID' || header === DATETIME_HEADER ? 'td-mono' : '',
                            header === 'Status' || header === DATETIME_HEADER ? 'col-live' : '',
                          ].filter(Boolean).join(' ') || undefined}
                          title={header === 'Status' ? row.status : header === DATETIME_HEADER ? formatTimestamp(row.trackingDateTime) : trackingCell(header, row.values[header])}
                        >
                          {header === 'Status'
                            ? <StatusBadge status={row.status} />
                            : header === DATETIME_HEADER
                              ? formatTimestamp(row.trackingDateTime)
                              : trackingCell(header, row.values[header])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
            </div>
          )}
        </div>

        {selectedPart && (
          <PartDrawer
            part={selectedPart}
            onClose={() => setSelectedPart(null)}
            projectName={selectedProject?.name}
            jobName={selectedJob?.jobName}
          />
        )}
      </div>
    );
  }

  // ─── LEVEL 2: PROJECT JOBS VIEW ──────────────────────────────────────────────
  if (selectedProject) {
    const projectJobs = allJobs.filter(j => j.projectId === selectedProject.id);
    const shipped = projectJobs.reduce((s: number, j: any) => s + (j.shippedParts || 0), 0);
    const total = projectJobs.reduce((s: number, j: any) => s + (j.totalParts || 0), 0);
    const pct = total ? Math.round((shipped / total) * 100) : 0;

    return (
      <>
        {/* Breadcrumbs Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 8px', color: 'var(--green-700)', fontWeight: 600 }}
            onClick={() => selectProject(null)}
          >
            <FolderKanban size={13} style={{ marginRight: 4 }} /> Projects
          </button>
          <ChevronRight size={14} color="var(--slate-400)" />
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Briefcase size={13} color="var(--purple-600)" /> {selectedProject.name}
          </span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => selectProject(null)} style={{ marginBottom: 12 }}>
            <ArrowLeft size={13} /> Back to Projects
          </button>

          <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800 }}>{selectedProject.name}</h2>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="chip">{selectedProject.code}</span>
                <span>·</span>
                <span>{projectJobs.length} Jobs</span>
                <span>·</span>
                <span>{total} Total Parts</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Import page disabled — jobs come from DataUploads folder sync
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/import')}>
                + Import Job
              </button>
              */}
              <span className={`badge badge-${selectedProject.status.toLowerCase()}`} style={{ fontSize: 12, padding: '5px 12px' }}>
                {selectedProject.status}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="progress-bar" style={{ flex: 1, height: 8 }}>
              <div className="progress-bar-fill green" style={{ width: `${pct}%` }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-700)' }}>{pct}% Shipped</span>
          </div>
        </div>

        {/* Jobs List */}
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Project Jobs ({projectJobs.length})</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projectJobs.map(job => {
            const jobPct = job.totalParts ? Math.round((job.shippedParts / job.totalParts) * 100) : 0;
            return (
              <div
                key={job.id}
                className="card"
                style={{ cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
                onClick={() => selectJob(job.id)}
              >
                <div style={{ padding: '18px 22px', display: 'flex', gap: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'var(--amber-50)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Briefcase size={20} color="var(--amber-600)" />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{job.jobName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8 }}>
                          <span className="chip" style={{ fontSize: 10 }}>Job ID: {job.sourceJobId}</span>
                          <span className="chip" style={{ fontSize: 10 }}>Download: {job.downloadId}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                        <span className={`badge badge-${job.status.toLowerCase()}`}>{job.status}</span>
                        <div className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: 12 }}>
                          View Parts <ChevronRight size={13} />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                      {[
                        { l: 'Total Parts', v: job.totalParts, bold: true },
                        { l: 'Shipped', v: job.shippedParts, color: 'var(--green-600)' },
                        { l: 'Pending', v: job.pendingParts, color: 'var(--amber-600)' },
                      ].map(s => (
                        <div key={s.l} style={{ minWidth: 70 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: s.color ?? 'var(--text-primary)' }}>{s.v}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-bar-fill green" style={{ width: `${jobPct}%` }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-700)', minWidth: 36 }}>{jobPct}%</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Imported {new Date(job.importedAt).toLocaleDateString()} · {job.importedBy.split(' ')[0]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ─── LEVEL 1: ALL PROJECTS LIST VIEW ─────────────────────────────────────────
  return (
    <>
      <div className="page-header page-header-row">
        <div>
          <h2>Projects</h2>
          <p>Open a project to view jobs and parts</p>
        </div>
        {/* Import page disabled — jobs come from DataUploads folder sync
        <button className="btn btn-primary" onClick={() => navigate('/import')}>
          + Import Data
        </button>
        */}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Code</th>
                <th>Total Jobs</th>
                <th>Active Jobs</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allProjects.map(proj => {
                const jobs = allJobs.filter(j => j.projectId === proj.id);
                const shipped = jobs.reduce((s: number, j: any) => s + (j.shippedParts || 0), 0);
                const total = jobs.reduce((s: number, j: any) => s + (j.totalParts || 0), 0);
                const pct = total ? Math.round((shipped / total) * 100) : 0;
                return (
                  <tr key={proj.id} onClick={() => selectProject(proj.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          background: 'var(--purple-100)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FolderKanban size={15} color="var(--purple-600)" />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{proj.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{jobs.length} jobs available</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="chip">{proj.code}</span></td>
                    <td>{proj.totalJobs}</td>
                    <td>
                      <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>{proj.activeJobs}</span>
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1 }}>
                          <div className="progress-bar-fill green" style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-700)', minWidth: 28 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${proj.status === 'ACTIVE' ? 'active' : proj.status === 'COMPLETED' ? 'completed' : 'cancelled'}`}>
                        {proj.status}
                      </span>
                    </td>
                    <td>
                      <div className="btn btn-ghost btn-sm" style={{ color: 'var(--green-700)', fontWeight: 600 }}>
                        View Jobs <ChevronRight size={13} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
