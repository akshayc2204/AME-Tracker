import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FolderKanban, Briefcase, Package, ChevronRight, ArrowLeft,
  Search, ChevronUp, ChevronDown, X, CheckCircle, Clock, Tag
} from 'lucide-react';
import type { Part, TrackingStatus } from '../data/mockData';
import { api, resolveTrackEvent } from '../services/api';
import PartDrawer from '../components/PartDrawer';

const STATUS_OPTIONS: { value: '' | TrackingStatus; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SHIPPED', label: 'Shipped' },
];

function StatusBadge({ status }: { status: TrackingStatus }) {
  const cls = status === 'PENDING' ? 'badge-pending'
    : status === 'SHIPPED' ? 'badge-shipped'
    : 'badge-cancelled';
  return <span className={`badge ${cls}`}><span className="badge-dot" />{status}</span>;
}

export default function Projects() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

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
  const [statusFilter, setStatusFilter] = useState<'' | TrackingStatus>('');
  const [fittingFilter, setFittingFilter] = useState('');
  const [sortKey, setSortKey] = useState<'pieceNbr' | 'fitting' | 'status' | 'shippedAt' | 'trackEvent'>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [liveParts, setLiveParts] = useState<Part[]>([]);

  const selectedJobSourceId = selectedJob ? String(selectedJob.sourceJobId || selectedJob.id) : null;

  useEffect(() => {
    if (selectedJob && selectedJobSourceId) {
      api.getProducts({ jobCode: selectedJobSourceId, pageSize: 500 })
        .then((res) => {
          if (res?.items) {
            const mapped: Part[] = res.items.map((item: any) => {
              const trEvents = item.trackingRecords?.[0]?.events || item.trackingEvents || [];
              const latestEvent = item.lastEvent || trEvents[0];
              const eventTs = latestEvent?.timestamp || latestEvent?.createdAt;
              const shippedAtVal = item.shippedAt || eventTs || (item.currentStatus === 'SHIPPED' ? item.updatedAt : null);
              const trackEventVal = resolveTrackEvent(item, latestEvent);

              return {
                id: String(item.id),
                jobId: selectedJob.id,
                pieceNbr: item.pieceNo ?? item.pieceNumber,
                fitting: item.fitting || 'Standard Duct',
                itemId: item.itemId || '—',
                description: item.description || '',
                component: item.component,
                information: item.description || item.location || '',
                sourceFlag: Boolean(item.sourceFlag),
                shippedAt: shippedAtVal || null,
                trackEvent: trackEventVal,
                scanEvent: trackEventVal,
                lastEvent: latestEvent,
                trackingRecords: item.trackingRecords?.length ? item.trackingRecords.map((tr: any) => ({
                  ...tr,
                  shippedAt: tr.shippedAt || shippedAtVal || null,
                  trackEvent: trackEventVal,
                  scanEvent: trackEventVal,
                })) : [
                  {
                    id: `tr-${item.id}`,
                    partId: String(item.id),
                    itemTracking: item.itemTracking || '',
                    qrCode: item.qrCode?.code || item.qrCodeStr || '—',
                    status: (item.currentStatus || item.status || 'PENDING') as TrackingStatus,
                    shippedAt: shippedAtVal || null,
                    trackEvent: trackEventVal,
                    scanEvent: trackEventVal,
                    inContainer: Boolean(item.inContainer),
                    statusSequence: item.statusSequence || 1,
                    events: [],
                  }
                ]
              };
            });
            setLiveParts(mapped);
          }
        })
        .catch(() => {});
    } else {
      setLiveParts([]);
    }
  }, [selectedJob?.id, selectedJobSourceId]);

  const jobParts = liveParts;

  const fittings = useMemo(() => [...new Set(jobParts.map(p => p.fitting))].sort(), [jobParts]);

  const filteredParts = useMemo(() => {
    return jobParts.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.fitting.toLowerCase().includes(q) ||
        p.pieceNbr.toString().includes(q) ||
        (p.metal ?? '').toLowerCase().includes(q) ||
        p.trackingRecords.some(tr =>
          tr.qrCode.toLowerCase().includes(q) ||
          (tr.itemTracking && tr.itemTracking.toLowerCase().includes(q))
        );
      const matchStatus = !statusFilter || p.trackingRecords.some(tr => tr.status === statusFilter);
      const matchFitting = !fittingFilter || p.fitting === fittingFilter;
      return matchSearch && matchStatus && matchFitting;
    }).sort((a, b) => {
      const isShippedA = a.trackingRecords.some(tr => tr.status === 'SHIPPED') || Boolean(a.shippedAt);
      const isShippedB = b.trackingRecords.some(tr => tr.status === 'SHIPPED') || Boolean(b.shippedAt);

      if (sortKey === 'status') {
        if (isShippedA !== isShippedB) {
          return sortDir === 'desc' ? (isShippedA ? -1 : 1) : (isShippedA ? 1 : -1);
        }
        if (isShippedA && isShippedB) {
          const tsA = a.shippedAt ? new Date(a.shippedAt).getTime() : 0;
          const tsB = b.shippedAt ? new Date(b.shippedAt).getTime() : 0;
          if (tsA !== tsB) return tsB - tsA;
        }
        return (Number(a.pieceNbr) || 0) - (Number(b.pieceNbr) || 0);
      }

      if (sortKey === 'shippedAt') {
        const tsA = a.shippedAt ? new Date(a.shippedAt).getTime() : 0;
        const tsB = b.shippedAt ? new Date(b.shippedAt).getTime() : 0;
        if (tsA !== tsB) {
          if (sortDir === 'desc') {
            if (tsA === 0) return 1;
            if (tsB === 0) return -1;
            return tsB - tsA;
          } else {
            if (tsA === 0) return 1;
            if (tsB === 0) return -1;
            return tsA - tsB;
          }
        }
        return (Number(a.pieceNbr) || 0) - (Number(b.pieceNbr) || 0);
      }

      if (sortKey === 'pieceNbr') {
        const nA = Number(a.pieceNbr) || 0;
        const nB = Number(b.pieceNbr) || 0;
        return sortDir === 'asc' ? nA - nB : nB - nA;
      }

      let av = (a[sortKey] ?? '') as number | string;
      let bv = (b[sortKey] ?? '') as number | string;
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return (Number(a.pieceNbr) || 0) - (Number(b.pieceNbr) || 0);
    });
  }, [jobParts, search, statusFilter, fittingFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredParts.length / PAGE_SIZE);
  const paginatedParts = filteredParts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function selectProject(projId: string | null) {
    if (projId) {
      setParams({ project: projId });
    } else {
      setParams({});
    }
    setSearch('');
    setStatusFilter('');
    setFittingFilter('');
    setSortKey('status');
    setSortDir('desc');
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
    setStatusFilter('');
    setFittingFilter('');
    setSortKey('status');
    setSortDir('desc');
    setPage(1);
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'status' || key === 'shippedAt' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  function SortIcon({ k }: { k: typeof sortKey }) {
    if (sortKey !== k) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  // ─── LEVEL 3: JOB PARTS & TRACKING VIEW ──────────────────────────────────────
  if (selectedProject && selectedJob) {
    const allTracking = jobParts.flatMap(p => p.trackingRecords);
    const shipped = allTracking.filter(tr => tr.status === 'SHIPPED').length;
    const pending = allTracking.filter(tr => tr.status === 'PENDING').length;
    const pct = allTracking.length ? Math.round((shipped / allTracking.length) * 100) : 0;

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 18 }}>
            {[
              { icon: <Package size={16} />, label: 'Total Parts', value: allTracking.length, color: 'var(--slate-700)', bg: 'var(--slate-100)' },
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
            <div className="card-title">Parts &amp; Tracking Records</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="topbar-search" style={{ flex: 'none' }}>
                <Search size={13} />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search parts, tracking #…"
                  style={{ width: 180 }}
                />
                {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
              </div>
              <select
                className="form-select"
                style={{ width: 130, padding: '6px 10px', fontSize: 12 }}
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                className="form-select"
                style={{ width: 150, padding: '6px 10px', fontSize: 12 }}
                value={fittingFilter}
                onChange={e => { setFittingFilter(e.target.value); setPage(1); }}
              >
                <option value="">All Fittings</option>
                {fittings.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {filteredParts.length} of {jobParts.length} parts
              </span>
            </div>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('pieceNbr')} style={{ cursor: 'pointer' }}>Piece # <SortIcon k="pieceNbr" /></th>
                  <th onClick={() => toggleSort('fitting')} style={{ cursor: 'pointer' }}>Fitting <SortIcon k="fitting" /></th>
                  <th>Item ID</th>
                  <th>ItemTracking</th>
                  <th>QR Code</th>
                  <th>Boolean Flag</th>
                  <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer' }}>Status <SortIcon k="status" /></th>
                  <th onClick={() => toggleSort('trackEvent')} style={{ cursor: 'pointer' }}>Track Event <SortIcon k="trackEvent" /></th>
                  <th onClick={() => toggleSort('shippedAt')} style={{ cursor: 'pointer' }}>Shipped Timestamp <SortIcon k="shippedAt" /></th>
                </tr>
              </thead>
              <tbody>
                {paginatedParts.map(part => {
                  const dominant: TrackingStatus = part.trackingRecords.every(tr => tr.status === 'SHIPPED') ? 'SHIPPED'
                    : part.trackingRecords.some(tr => tr.status === 'SHIPPED') ? 'SHIPPED'
                    : 'PENDING';
                  const primaryTR = part.trackingRecords[0];
                  const itemTrackingVal = primaryTR?.itemTracking || '—';
                  const qrCodeVal = primaryTR?.qrCode || '—';
                  const trackEventVal = part.trackEvent || primaryTR?.trackEvent;
                  const shippedTimestamp = part.shippedAt || primaryTR?.shippedAt;
                  const shippedFormatted = shippedTimestamp
                    ? new Date(shippedTimestamp).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '—';
                  return (
                    <tr key={part.id} onClick={() => setSelectedPart(part)} style={{ cursor: 'pointer' }}>
                      <td className="td-mono" style={{ fontWeight: 700 }}>#{part.pieceNbr}</td>
                      <td style={{ fontWeight: 500 }}>{part.fitting}</td>
                      <td className="td-mono">{part.itemId}</td>
                      <td>
                        <span className="td-mono" style={{ fontSize: 11, color: 'var(--purple-700)', background: 'var(--purple-50)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', fontWeight: 600 }} title={itemTrackingVal}>
                          {itemTrackingVal}
                        </span>
                      </td>
                      <td>
                        <span className="td-mono" style={{ fontSize: 10.5, color: 'var(--green-700)', background: 'var(--green-50)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={qrCodeVal}>
                          {qrCodeVal}
                        </span>
                      </td>
                      <td>
                        <span className={`chip ${part.sourceFlag ? 'green' : 'slate'}`} style={{ fontSize: 10, padding: '2px 7px' }}>
                          {part.sourceFlag ? 'TRUE' : 'FALSE'}
                        </span>
                      </td>
                      <td><StatusBadge status={dominant} /></td>
                      <td>
                        {trackEventVal === 'Mobile scan' && (
                          <span className="badge badge-active" style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                            Mobile scan
                          </span>
                        )}
                        {trackEventVal === 'Portal scan' && (
                          <span className="badge badge-pending" style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', background: 'var(--blue-50)', color: 'var(--blue-700)', borderColor: 'var(--blue-200)', whiteSpace: 'nowrap' }}>
                            Portal scan
                          </span>
                        )}
                        {!trackEventVal && (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className="td-mono" style={{ fontSize: 11, color: shippedTimestamp ? 'var(--green-700)' : 'var(--text-muted)', fontWeight: shippedTimestamp ? 600 : 400, whiteSpace: 'nowrap' }}>
                          {shippedFormatted}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
      </>
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
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/import')}>
                + Import Job
              </button>
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
          <p>Select a manufacturing project to drill down into its jobs and parts</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/import')}>
          + Import Data
        </button>
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
