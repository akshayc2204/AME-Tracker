import { useState, useMemo, useEffect } from 'react';
import {
  Search, Download, RotateCcw,
  Calendar, Camera, X, ExternalLink,
} from 'lucide-react';
import { api, resolveTrackEvent, resolveVehiclePhotoUrl } from '../services/api';
import { getSocket, type DashboardScanEvent } from '../services/socket';

/** Trimble piece numbers can be "1", "1-", "12A" — never coerce with Number() (that yields NaN). */
function displayPieceNo(value: unknown, fallback: unknown = '—'): string {
  const raw = value ?? fallback;
  if (raw === null || raw === undefined || raw === '') return String(fallback ?? '—');
  const text = String(raw).trim();
  if (!text || text === 'NaN') return String(fallback ?? '—');
  return text;
}

function comparePieceNo(a: unknown, b: unknown): number {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  const na = parseInt(sa, 10);
  const nb = parseInt(sb, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return sa.localeCompare(sb, undefined, { numeric: true });
}

function formatDispatchDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function localIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convert table filter dates (dd/mm/yyyy) to ISO (yyyy-mm-dd) for APIs and date inputs. */
function toIsoDate(value?: string | null): string {
  if (!value || value === 'ALL') return localIsoDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return localIsoDate();
}

function isShippedStatus(status: unknown): boolean {
  const s = String(status || '').toUpperCase();
  return s === 'SHIPPED' || s === 'LOADED';
}

function isPendingPart(part: { status?: unknown }): boolean {
  const s = String(part.status || '').toUpperCase();
  return s === 'PENDING' || s === 'PACKED' || s === '';
}

export default function Reports() {
  // Filter States
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('ALL');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [selectedJob, setSelectedJob] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('SHIPPED');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Photo Lightbox Modal
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    vehicleNumber: string;
    projectName?: string;
    jobName?: string;
  } | null>(null);

  // Live Data
  const [liveProjects, setLiveProjects] = useState<any[]>([]);
  const [liveJobs, setLiveJobs] = useState<any[]>([]);
  const [liveParts, setLiveParts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  async function loadData() {
    setLoading(true);
    try {
      const [p, j, res, dispatchesGroupedRes, dispatchesRes] = await Promise.all([
        api.getProjects().catch(() => []),
        api.getJobs().catch(() => []),
        api.getProducts({ pageSize: 5000 }).catch(() => ({ items: [] })),
        api.getDispatchesGrouped().catch(() => []),
        api.getDispatches().catch(() => ({ items: [] })),
      ]);

      if (Array.isArray(p)) setLiveProjects(p);
      if (Array.isArray(j)) setLiveJobs(j);

      // Build Vehicle Photo Map from dispatches
      const photoMap = new Map<string, string>();
      if (dispatchesRes?.items && Array.isArray(dispatchesRes.items)) {
        dispatchesRes.items.forEach((d: any) => {
          if (d.truckPhotoUrl) {
            if (d.vehicleNumber) photoMap.set(d.vehicleNumber, d.truckPhotoUrl);
            if (d.transitNumber) photoMap.set(d.transitNumber, d.truckPhotoUrl);
            photoMap.set(String(d.id), d.truckPhotoUrl);
          }
        });
      }

      if (Array.isArray(dispatchesGroupedRes)) {
        dispatchesGroupedRes.forEach((d: any) => {
          if (d.truckPhotoUrl) {
            if (d.vehicleNumber) photoMap.set(d.vehicleNumber, d.truckPhotoUrl);
            if (d.transitNumber) photoMap.set(d.transitNumber, d.truckPhotoUrl);
            photoMap.set(String(d.id), d.truckPhotoUrl);
          }
        });
      }

      // Map parts from dispatchesGrouped for 100% complete dispatch tracking
      const partsMap = new Map<string, any>();

      // 1. Ingest all parts from dispatchesGrouped
      if (Array.isArray(dispatchesGroupedRes)) {
        dispatchesGroupedRes.forEach((v: any) => {
          const vNum = v.vehicleNumber || `18/${String(v.id).padStart(5, '0')}`;
          const vPhoto = photoMap.get(vNum) || v.truckPhotoUrl || null;
          const vStarted = v.startedAt || null;

          (v.projects ?? []).forEach((proj: any) => {
            const pName = proj.projectName || 'AME Project';
            (proj.jobs ?? []).forEach((job: any) => {
              const jCode = job.jobCode || '—';
              const jName = job.jobName || `Job #${jCode}`;

              (job.parts ?? []).forEach((pt: any) => {
                const partKey = String(pt.id || `${pName}_${jCode}_${pt.pieceNumber}`);
                const shippedAtVal = pt.loadedAt || vStarted || new Date().toISOString();

                let dateDisplay = '—';
                let formattedTimestamp = '—';
                if (shippedAtVal) {
                  const d = new Date(shippedAtVal);
                  if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    dateDisplay = `${day}/${month}/${year}`;
                    formattedTimestamp = d.toLocaleString('en-GB', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
                    });
                  }
                }

                partsMap.set(partKey, {
                  id: String(pt.id || partKey),
                  pieceNbr: displayPieceNo(pt.pieceNumber, pt.itemId ?? 0),
                  fitting: pt.fitting || 'Standard Duct',
                  itemId: pt.itemId || '—',
                  itemTracking: pt.itemTracking || '—',
                  status: 'SHIPPED',
                  shippedAt: shippedAtVal,
                  shippedTimestampFormatted: formattedTimestamp,
                  dispatchDate: dateDisplay,
                  vehicleNumber: vNum,
                  vehiclePhotoUrl: vPhoto,
                  trackEvent: 'Mobile scan',
                  jobName: jName,
                  jobCode: jCode,
                  projectName: pName,
                });
              });
            });
          });
        });
      }

      // 2. Ingest all parts from products API
      if (res?.items && Array.isArray(res.items)) {
        res.items.forEach((item: any) => {
          const partKey = String(item.id);
          const trEvents = item.trackingRecords?.[0]?.events || item.trackingEvents || [];
          const latestEvent = item.lastEvent || trEvents[0];
          const eventTs = latestEvent?.timestamp || latestEvent?.createdAt;
          const shippedAtVal = item.shippedAt || eventTs || (item.currentStatus === 'SHIPPED' ? (item.updatedAt || item.createdAt) : null);
          const trackEventVal = resolveTrackEvent(item, latestEvent);

          let dateDisplay = '—';
          let formattedTimestamp = '—';
          if (shippedAtVal) {
            const d = new Date(shippedAtVal);
            if (!isNaN(d.getTime())) {
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              dateDisplay = `${day}/${month}/${year}`;
              formattedTimestamp = d.toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
              });
            }
          }

          const existing = partsMap.get(partKey);
          const vehicleNo = item.vehicleNumber || latestEvent?.vehicleNumber || existing?.vehicleNumber || (item.currentStatus === 'SHIPPED' ? '18/54405' : 'Pending Loading');
          const photoUrl = photoMap.get(vehicleNo) || existing?.vehiclePhotoUrl || (item.dispatchId ? photoMap.get(String(item.dispatchId)) : null) || null;
          const projName = item.job?.project?.name || item.job?.project?.projectName || item.job?.project?.code || existing?.projectName || 'AME Project';
          const jobName = item.job?.name || (item.job?.code ? `Job #${item.job.code}` : existing?.jobName || 'General Job');
          const jobCode = item.job?.code || existing?.jobCode || '—';

          partsMap.set(partKey, {
            id: String(item.id),
            pieceNbr: displayPieceNo(
              item.pieceNo ?? item.pieceNumber,
              existing?.pieceNbr ?? item.itemId ?? 0,
            ),
            fitting: item.fitting || existing?.fitting || 'Standard Duct',
            itemId: item.itemId || existing?.itemId || '—',
            itemTracking: item.itemTracking || existing?.itemTracking || '—',
            status: item.currentStatus || item.status || existing?.status || 'PENDING',
            shippedAt: shippedAtVal || existing?.shippedAt || null,
            shippedTimestampFormatted: formattedTimestamp !== '—' ? formattedTimestamp : (existing?.shippedTimestampFormatted || '—'),
            dispatchDate: dateDisplay !== '—' ? dateDisplay : (existing?.dispatchDate || '—'),
            vehicleNumber: vehicleNo,
            vehiclePhotoUrl: photoUrl,
            trackEvent: trackEventVal || existing?.trackEvent || (item.currentStatus === 'SHIPPED' ? 'Mobile scan' : null),
            jobName,
            jobCode,
            projectName: projName,
          });
        });
      }

      const allMappedParts = Array.from(partsMap.values());
      setLiveParts(allMappedParts);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    // Wire up real-time Socket.IO events for live scanning in Reports
    const sock = getSocket();

    const onScan = (ev: DashboardScanEvent) => {
      const isPortal = String(ev.source || '').toUpperCase().includes('PORTAL');
      const trackEvent = isPortal ? 'Portal scan' : 'Mobile scan';
      const scanDate = ev.timestamp ? new Date(ev.timestamp) : new Date();
      const day = String(scanDate.getDate()).padStart(2, '0');
      const month = String(scanDate.getMonth() + 1).padStart(2, '0');
      const year = scanDate.getFullYear();
      const dateDisplay = `${day}/${month}/${year}`;
      const formattedTimestamp = scanDate.toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      });

      const partKey = String(ev.partId);

      setLiveParts((prev) => {
        const existingIdx = prev.findIndex((p) => String(p.id) === partKey);
        const updatedRow = {
          id: partKey,
          pieceNbr: displayPieceNo(
            ev.pieceNo,
            existingIdx >= 0 ? prev[existingIdx].pieceNbr : '—',
          ),
          fitting: ev.fitting || (existingIdx >= 0 ? prev[existingIdx].fitting : 'Standard Duct'),
          itemId: ev.itemId || (existingIdx >= 0 ? prev[existingIdx].itemId : '—'),
          itemTracking: ev.itemTracking || (existingIdx >= 0 ? prev[existingIdx].itemTracking : '—'),
          status: 'SHIPPED',
          shippedAt: ev.timestamp,
          shippedTimestampFormatted: formattedTimestamp,
          dispatchDate: dateDisplay,
          vehicleNumber: ev.vehicleNumber || (existingIdx >= 0 ? prev[existingIdx].vehicleNumber : '18/97591'),
          vehiclePhotoUrl: existingIdx >= 0 ? prev[existingIdx].vehiclePhotoUrl : null,
          trackEvent,
          jobName: ev.jobName || (existingIdx >= 0 ? prev[existingIdx].jobName : `Job #${ev.jobCode}`),
          jobCode: ev.jobCode || (existingIdx >= 0 ? prev[existingIdx].jobCode : '—'),
          projectName: ev.projectName || (existingIdx >= 0 ? prev[existingIdx].projectName : 'AME Project'),
        };

        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = updatedRow;
          return next;
        } else {
          return [updatedRow, ...prev];
        }
      });
    };

    const onDispatchComplete = () => {
      loadData();
    };

    sock.on('dashboard:scan', onScan);
    sock.on('dashboard:dispatch_complete', onDispatchComplete);

    return () => {
      sock.off('dashboard:scan', onScan);
      sock.off('dashboard:dispatch_complete', onDispatchComplete);
    };
  }, []);

  // Available unique projects
  const availableProjects = useMemo(() => {
    const pSet = new Set<string>();
    liveProjects.forEach(p => {
      const name = p.name || p.projectName || p.sourceProjectName;
      if (name) pSet.add(name);
    });
    liveParts.forEach(p => {
      if (p.projectName && p.projectName !== 'AME Project') pSet.add(p.projectName);
    });
    return Array.from(pSet).sort();
  }, [liveProjects, liveParts]);

  // Available unique dates — always include today so pending-till-today can be viewed
  const availableDates = useMemo(() => {
    const dates = new Set<string>([formatDispatchDate(new Date())]);
    liveParts.forEach(p => {
      if (p.dispatchDate && p.dispatchDate !== '—') {
        dates.add(p.dispatchDate);
      }
    });
    return Array.from(dates).sort((a, b) => {
      const [ad, am, ay] = a.split('/').map(Number);
      const [bd, bm, by] = b.split('/').map(Number);
      return new Date(by, (bm || 1) - 1, bd || 1).getTime() - new Date(ay, (am || 1) - 1, ad || 1).getTime();
    });
  }, [liveParts]);

  // Available vehicles
  const availableVehicles = useMemo(() => {
    const vehicles = new Set<string>();
    liveParts.forEach(p => {
      if (selectedDate === 'ALL' || p.dispatchDate === selectedDate) {
        if (p.vehicleNumber && p.vehicleNumber !== 'Pending Loading') {
          vehicles.add(p.vehicleNumber);
        }
      }
    });
    return Array.from(vehicles).sort();
  }, [liveParts, selectedDate]);

  // Available jobs
  const availableJobs = useMemo(() => {
    if (selectedProject === 'ALL') return liveJobs;
    const normSel = selectedProject.toLowerCase().trim();
    return liveJobs.filter((j: any) => {
      const pName = (j.project?.name || j.project?.projectName || j.project?.sourceProjectName || String(j.projectId)).toLowerCase().trim();
      return pName === normSel || pName.includes(normSel) || normSel.includes(pName);
    });
  }, [liveJobs, selectedProject]);

  // Filtered rows for the report
  const filteredRows = useMemo(() => {
    return liveParts
      .filter(part => {
        const pending = isPendingPart(part);

        // Status filter
        if (selectedStatus === 'SHIPPED') {
          if (!isShippedStatus(part.status)) return false;
        } else if (selectedStatus === 'PENDING') {
          if (!pending) return false;
        } else if (selectedStatus !== 'ALL' && part.status !== selectedStatus) {
          return false;
        }

        // Date filter: shipped on the selected date, plus pending-till-today
        // (pending parts have no dispatch date, so they must not be dropped).
        if (selectedDate && selectedDate !== 'ALL') {
          const shippedOnDate = isShippedStatus(part.status) && part.dispatchDate === selectedDate;
          if (selectedStatus === 'SHIPPED') {
            if (!shippedOnDate) return false;
          } else if (selectedStatus === 'PENDING') {
            if (!pending) return false;
          } else if (!shippedOnDate && !pending) {
            return false;
          }
        }

        // Secondary Filters
        if (selectedVehicle !== 'ALL' && part.vehicleNumber !== selectedVehicle) return false;

        if (selectedProject !== 'ALL') {
          const normSel = selectedProject.toLowerCase().trim();
          const normProj = (part.projectName || '').toLowerCase().trim();
          if (normProj !== normSel && !normProj.includes(normSel) && !normSel.includes(normProj)) {
            return false;
          }
        }

        if (selectedJob !== 'ALL') {
          const normSel = selectedJob.toLowerCase().trim();
          const normJobCode = (part.jobCode || '').toLowerCase().trim();
          const normJobName = (part.jobName || '').toLowerCase().trim();
          if (normJobCode !== normSel && normJobName !== normSel && !normJobName.includes(normSel)) {
            return false;
          }
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matches =
            String(part.pieceNbr).includes(q) ||
            (part.projectName || '').toLowerCase().includes(q) ||
            (part.jobName || '').toLowerCase().includes(q) ||
            (part.jobCode || '').toLowerCase().includes(q) ||
            (part.vehicleNumber || '').toLowerCase().includes(q) ||
            (part.fitting || '').toLowerCase().includes(q) ||
            (part.itemId || '').toLowerCase().includes(q) ||
            (part.itemTracking || '').toLowerCase().includes(q) ||
            (part.trackEvent || '').toLowerCase().includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => comparePieceNo(a.pieceNbr, b.pieceNbr));
  }, [liveParts, selectedStatus, selectedDate, selectedVehicle, selectedProject, selectedJob, searchQuery]);

  // Export CSV
  function handleExportCsv() {
    if (filteredRows.length === 0) return;

    const dateTitle = selectedDate && selectedDate !== 'ALL' ? selectedDate : 'ALL_DATES';
    const filename = `DISPATCH_REPORT_${dateTitle.replace(/\//g, '_')}`;

    const headers = [
      'SR#',
      'PROJECT NAME',
      'JOB NAME',
      'VEHICLE NO',
      'PIECE NO.',
      'FITTING',
      'ITEM ID',
      'ITEMTRACKING',
      'SHIPPED TIMESTAMP',
      'TRACK EVENT'
    ];

    const rows = filteredRows.map((r, i) => [
      i + 1,
      r.projectName,
      r.jobName,
      r.vehicleNumber,
      r.pieceNbr,
      r.fitting,
      r.itemId,
      r.itemTracking,
      r.shippedTimestampFormatted,
      isPendingPart(r) ? 'Pending' : (r.trackEvent === 'Portal scan' ? 'Portal scan' : 'scanned'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row
          .map(val => {
            let str = String(val ?? '').replace(/"/g, '""');
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
              str = `"${str}"`;
            }
            return str;
          })
          .join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Gauge Report preview + download
  const [gaugePreviewOpen, setGaugePreviewOpen] = useState(false);
  const [gaugePreviewLoading, setGaugePreviewLoading] = useState(false);
  const [gaugeDownloading, setGaugeDownloading] = useState(false);
  const [gaugePreviewDate, setGaugePreviewDate] = useState(() => localIsoDate());
  const [gaugePreview, setGaugePreview] = useState<{
    filename: string;
    date: string;
    displayDate: string;
    rowCount: number;
    unitCount: number;
    totalWeight: number;
    message: string;
    rows: Array<{
      sr: number;
      type: string;
      projectName: string;
      jobName: string;
      stdDuctCount: number;
      stdDuctWeight: number;
      fittingQty: number;
      fittingWeight: number;
      totalWeight: number;
      thickness: string;
      projectWeightKg: number;
      gauge: number | null;
    }>;
    projectSummary: Array<{ projectName: string; totalWeight: number }>;
  } | null>(null);

  // Shipping List preview + download
  const [gatePassOpen, setGatePassOpen] = useState(false);
  const [gatePassLoading, setGatePassLoading] = useState(false);
  const [gatePassDownloading, setGatePassDownloading] = useState(false);
  const [gatePassDate, setGatePassDate] = useState(() => localIsoDate());
  const [gatePassTrolley, setGatePassTrolley] = useState('ALL');
  const [gatePassProject, setGatePassProject] = useState('ALL');
  const [gatePassPreview, setGatePassPreview] = useState<{
    date: string;
    displayDate: string;
    passCount: number;
    totalPieces: number;
    totalWeight: number;
    trolleys: string[];
    projects: string[];
    message: string;
    passes: Array<{
      projectId: number | null;
      projectName: string;
      projectShortName: string;
      trolley: string;
      shippingDate: string;
      actualWeight: number;
      totalPieces: number;
      jobs: Array<{
        jobName: string;
        account?: string;
        pieceCount: number;
        pieces: Array<{
          pieceNumber: string;
          item: string;
          size: string;
          shippedAt: string;
          trackingNo: string;
        }>;
      }>;
    }>;
  } | null>(null);

  const gatePassProjectOptions = useMemo(() => {
    const names = new Set<string>(availableProjects);
    gatePassPreview?.projects?.forEach((p) => names.add(p));
    return Array.from(names).sort();
  }, [availableProjects, gatePassPreview?.projects]);

  async function openGaugePreview(dateOverride?: string) {
    const date = toIsoDate(dateOverride || (selectedDate !== 'ALL' ? selectedDate : undefined));
    setGaugePreviewDate(date);
    setGaugePreviewOpen(true);
    setGaugePreviewLoading(true);
    setGaugePreview(null);
    try {
      const data = await api.getGaugeReportPreview({ date });
      setGaugePreview(data);
    } catch (err: any) {
      alert(err?.message || 'Failed to load Gauge Report preview');
      setGaugePreviewOpen(false);
    } finally {
      setGaugePreviewLoading(false);
    }
  }

  async function handleDownloadGaugeReport() {
    setGaugeDownloading(true);
    try {
      await api.downloadGaugeReport({ date: gaugePreviewDate });
    } catch (err: any) {
      alert(err?.message || 'Failed to download Gauge Report');
    } finally {
      setGaugeDownloading(false);
    }
  }

  function resolveProjectId(projectName: string): number | undefined {
    if (!projectName || projectName === 'ALL') return undefined;
    const found = liveProjects.find((p: any) => {
      const name = p.projectName || p.name || p.sourceProjectName;
      return name === projectName;
    });
    return found?.id;
  }

  async function openGatePassPreview(
    dateOverride?: string,
    trolleyOverride?: string,
    projectOverride?: string,
  ) {
    const date = toIsoDate(
      dateOverride || (selectedDate !== 'ALL' ? selectedDate : gatePassDate),
    );
    const trolley = trolleyOverride ?? gatePassTrolley;
    const project = projectOverride ?? gatePassProject;
    setGatePassDate(date);
    setGatePassTrolley(trolley);
    setGatePassProject(project);
    setGatePassOpen(true);
    setGatePassLoading(true);
    setGatePassPreview(null);
    try {
      const projectId = resolveProjectId(project);
      const data = await api.getGatePassPreview({
        date,
        trolley: trolley !== 'ALL' ? trolley : undefined,
        projectId,
        projectName: !projectId && project !== 'ALL' ? project : undefined,
      });
      setGatePassPreview(data);
    } catch (err: any) {
      alert(err?.message || 'Failed to load Shipping List preview');
      setGatePassOpen(false);
    } finally {
      setGatePassLoading(false);
    }
  }

  async function handleDownloadGatePass(
    projectIdOverride?: number,
    trolleyOverride?: string,
    projectNameOverride?: string,
  ) {
    const projectId = projectIdOverride ?? resolveProjectId(gatePassProject);
    const projectName =
      projectNameOverride ??
      (!projectId && gatePassProject !== 'ALL' ? gatePassProject : undefined);
    if (!projectId && !projectName) {
      alert('Select a project to download its Shipping List PDF.');
      return;
    }

    setGatePassDownloading(true);
    try {
      await api.downloadGatePass({
        date: gatePassDate,
        projectId,
        projectName,
        trolley:
          trolleyOverride ??
          (gatePassTrolley !== 'ALL' ? gatePassTrolley : undefined),
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to download Shipping List');
    } finally {
      setGatePassDownloading(false);
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ─── Header Row ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Dispatch &amp; Shipment Report
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '2px 0 0 0' }}>
            Shipment logs by project, job, vehicle, and piece
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => openGaugePreview()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              color: '#FFFFFF',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 6px rgba(79, 70, 229, 0.3)',
            }}
          >
            <Download size={14} />
            <span>Gauge Report</span>
          </button>

          <button
            onClick={() => openGatePassPreview(
              undefined,
              selectedVehicle !== 'ALL' ? selectedVehicle : 'ALL',
              selectedProject !== 'ALL' ? selectedProject : 'ALL',
            )}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
              color: '#FFFFFF',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 6px rgba(13, 148, 136, 0.3)',
            }}
          >
            <Download size={14} />
            <span>Shipping List</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: filteredRows.length > 0 ? '#078710' : '#9CA3AF',
              color: '#FFFFFF',
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontWeight: 700,
              border: 'none',
              cursor: filteredRows.length > 0 ? 'pointer' : 'not-allowed',
              boxShadow: filteredRows.length > 0 ? '0 1px 6px rgba(7, 135, 16, 0.25)' : 'none',
            }}
          >
            <Download size={14} />
            <span>Download CSV ({filteredRows.length})</span>
          </button>
        </div>
      </div>

      {/* ─── Single-Line Compact Filter Bar ─── */}
      <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Date Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0FDF4', padding: '3px 8px', borderRadius: 6, border: '1px solid #BBF7D0' }}>
            <Calendar size={14} color="#078710" />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>Date:</span>
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                padding: '3px 6px',
                borderRadius: 4,
                border: '1px solid #A7F3D0',
                fontSize: '0.8125rem',
                color: '#047857',
                backgroundColor: '#FFFFFF',
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Dates</option>
              {availableDates.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid #E5E7EB',
              fontSize: '0.8125rem',
              color: '#374151',
              backgroundColor: '#F9FAFB',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="SHIPPED">Shipped &amp; Loaded</option>
            <option value="ALL">All</option>
            <option value="PENDING">Pending Only</option>
          </select>

          {/* Vehicle Selector */}
          <select
            value={selectedVehicle}
            onChange={e => setSelectedVehicle(e.target.value)}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid #E5E7EB',
              fontSize: '0.8125rem',
              color: '#374151',
              backgroundColor: '#F9FAFB',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Vehicles ({availableVehicles.length})</option>
            {availableVehicles.map(v => (
              <option key={v} value={v}>Vehicle: {v}</option>
            ))}
          </select>

          {/* Project Filter */}
          <select
            value={selectedProject}
            onChange={e => {
              setSelectedProject(e.target.value);
              setSelectedJob('ALL');
            }}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid #E5E7EB',
              fontSize: '0.8125rem',
              color: '#374151',
              backgroundColor: '#F9FAFB',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Projects ({availableProjects.length})</option>
            {availableProjects.map(pName => (
              <option key={pName} value={pName}>{pName}</option>
            ))}
          </select>

          {/* Job Filter */}
          <select
            value={selectedJob}
            onChange={e => setSelectedJob(e.target.value)}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid #E5E7EB',
              fontSize: '0.8125rem',
              color: '#374151',
              backgroundColor: '#F9FAFB',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Jobs ({availableJobs.length})</option>
            {availableJobs.map(j => {
              const label = j.name || (j.code ? `Job #${j.code}` : `Job ${j.id}`);
              const val = j.code || String(j.id);
              return <option key={val} value={val}>{label}</option>;
            })}
          </select>

          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: 160, flex: 1 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              type="text"
              placeholder="Search piece, tracking, job, vehicle…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 8px 5px 26px',
                borderRadius: 6,
                border: '1px solid #E5E7EB',
                fontSize: '0.8125rem',
                color: '#111827',
                outline: 'none',
                backgroundColor: '#F9FAFB',
              }}
            />
          </div>

          {/* Reset */}
          {(selectedDate !== 'ALL' || selectedStatus !== 'SHIPPED' || selectedVehicle !== 'ALL' || selectedProject !== 'ALL' || selectedJob !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedDate('ALL');
                setSelectedStatus('SHIPPED');
                setSelectedVehicle('ALL');
                setSelectedProject('ALL');
                setSelectedJob('ALL');
                setSearchQuery('');
              }}
              style={{
                padding: '5px 8px',
                borderRadius: 6,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6B7280',
                background: '#F3F4F6',
                border: '1px solid #E5E7EB',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Compact Summary Indicator ─── */}
      <div
        style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 6,
          padding: '6px 12px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          fontSize: '0.78rem',
        }}
      >
        <span style={{ color: '#078710', fontWeight: 800 }}>
          {selectedDate === 'ALL' ? 'DISPATCH REPORT: ALL DATES' : `DISPATCH REPORT ON: ${selectedDate}`}
        </span>
        <span style={{ color: '#9CA3AF' }}>·</span>
        <span style={{ color: '#4B5563' }}>
          Total Tracked: <strong style={{ color: '#111827' }}>{filteredRows.length} parts</strong>
        </span>
        {selectedStatus === 'ALL' && (
          <>
            <span style={{ color: '#9CA3AF' }}>·</span>
            <span style={{ color: '#047857', fontWeight: 700 }}>
              Shipped: {filteredRows.filter((p) => isShippedStatus(p.status)).length}
            </span>
            <span style={{ color: '#9CA3AF' }}>·</span>
            <span style={{ color: '#B45309', fontWeight: 700 }}>
              Pending: {filteredRows.filter((p) => isPendingPart(p)).length}
            </span>
          </>
        )}
        {selectedProject !== 'ALL' && (
          <>
            <span style={{ color: '#9CA3AF' }}>·</span>
            <span style={{ color: '#1D4ED8', fontWeight: 700 }}>
              Project: {selectedProject}
            </span>
          </>
        )}
        {selectedJob !== 'ALL' && (
          <>
            <span style={{ color: '#9CA3AF' }}>·</span>
            <span style={{ color: '#7C3AED', fontWeight: 700 }}>
              Job: {selectedJob}
            </span>
          </>
        )}
      </div>

      {/* ─── Clean Data Table With Requested Columns ─── */}
      <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', width: 35 }}>SR#</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>PROJECT NAME</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>JOB NAME</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>VEHICLE NO</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>PIECE NO.</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>FITTING</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>ITEM ID</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>ITEMTRACKING</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>SHIPPED TIMESTAMP</th>
                <th style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase' }}>TRACK EVENT</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', color: '#6B7280' }}>
                    {loading ? 'Loading report data…' : `No shipment records found for ${selectedDate}.`}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #F3F4F6' }} className="hover:bg-slate-50">
                    {/* SR# */}
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#6B7280' }}>
                      {index + 1}
                    </td>

                    {/* Project Name */}
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#111827' }}>
                      {row.projectName}
                    </td>

                    {/* Job Name */}
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: '#374151' }}>
                      {row.jobName}
                    </td>

                    {/* Vehicle No & Photo Preview Button */}
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#047857', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem' }}>
                          {row.vehicleNumber}
                        </span>
                        {row.vehiclePhotoUrl && (
                          <button
                            onClick={() => setPreviewPhoto({
                              url: resolveVehiclePhotoUrl(row.vehiclePhotoUrl)!,
                              vehicleNumber: row.vehicleNumber,
                              projectName: row.projectName,
                              jobName: row.jobName,
                            })}
                            title="View vehicle photo captured by mobile app"
                            style={{
                              background: '#F0FDF4',
                              border: '1px solid #86EFAC',
                              borderRadius: 4,
                              padding: '2px 5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              cursor: 'pointer',
                              color: '#078710',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            <Camera size={11} />
                            <span>Photo</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Piece No. */}
                    <td style={{ padding: '7px 10px', fontWeight: 800, color: '#111827' }}>
                      #{row.pieceNbr}
                    </td>

                    {/* Fitting */}
                    <td style={{ padding: '7px 10px', color: '#111827', fontWeight: 500 }}>
                      {row.fitting}
                    </td>

                    {/* Item ID */}
                    <td style={{ padding: '7px 10px', color: '#6B7280' }}>
                      {row.itemId}
                    </td>

                    {/* ItemTracking */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#1E293B' }}>
                      {row.itemTracking}
                    </td>

                    {/* Shipped Timestamp */}
                    <td style={{ padding: '7px 10px', color: '#4B5563', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                      {row.shippedTimestampFormatted}
                    </td>

                    {/* Track Event */}
                    <td style={{ padding: '7px 10px' }}>
                      {isPendingPart(row) ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            backgroundColor: '#FFFBEB',
                            color: '#B45309',
                            border: '1px solid #FDE68A',
                          }}
                        >
                          Pending
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            backgroundColor: row.trackEvent === 'Portal scan' ? '#EFF6FF' : '#ECFDF5',
                            color: row.trackEvent === 'Portal scan' ? '#1D4ED8' : '#047857',
                            border: row.trackEvent === 'Portal scan' ? '1px solid #BFDBFE' : '1px solid #A7F3D0',
                          }}
                        >
                          {row.trackEvent === 'Portal scan' ? (
                            <>
                              <span style={{ fontSize: '0.65rem' }}>💻</span>
                              Portal scan
                            </>
                          ) : (
                            'scanned'
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Vehicle Photo Modal ─── */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              maxWidth: 680,
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#F9FAFB',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    color: '#047857',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: '0.8125rem',
                  }}
                >
                  {previewPhoto.vehicleNumber}
                </span>
                <span style={{ fontWeight: 800, color: '#111827', fontSize: '1.05rem' }}>
                  Mobile Vehicle Photo Verification
                </span>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                style={{
                  background: '#E5E7EB',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} color="#374151" />
              </button>
            </div>

            <div style={{ padding: 20, textAlign: 'center', backgroundColor: '#0F172A' }}>
              <img
                src={previewPhoto.url}
                alt="Vehicle Full Capture"
                style={{
                  maxHeight: '65vh',
                  maxWidth: '100%',
                  borderRadius: 8,
                  objectFit: 'contain',
                }}
              />
            </div>

            <div
              style={{
                padding: '12px 20px',
                background: '#F9FAFB',
                borderTop: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
                color: '#6B7280',
              }}
            >
              <div>
                Project: <strong style={{ color: '#111827' }}>{previewPhoto.projectName || '—'}</strong> · Job:{' '}
                <strong style={{ color: '#111827' }}>{previewPhoto.jobName || '—'}</strong>
              </div>
              <a
                href={previewPhoto.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  color: '#078710',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                <span>Open full image</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ─── Gauge Report Preview Modal ─── */}
      {gaugePreviewOpen && (
        <div
          onClick={() => setGaugePreviewOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1400,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #E5E7EB',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                  Gauge Report Preview
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 2 }}>
                  {gaugePreview
                    ? `DISPATCH SUMMARY ON — ${gaugePreview.displayDate}`
                    : 'Loading daily dispatch summary…'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#374151',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    padding: '4px 8px',
                  }}
                >
                  <Calendar size={13} color="#4F46E5" />
                  Date
                  <input
                    type="date"
                    value={gaugePreviewDate}
                    onChange={(e) => openGaugePreview(e.target.value)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontWeight: 700,
                      color: '#111827',
                      outline: 'none',
                    }}
                  />
                </label>

                <button
                  onClick={handleDownloadGaugeReport}
                  disabled={gaugeDownloading || gaugePreviewLoading || !gaugePreview || gaugePreview.rowCount === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background:
                      gaugePreview && gaugePreview.rowCount > 0 ? '#4F46E5' : '#9CA3AF',
                    color: '#FFFFFF',
                    padding: '7px 14px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor:
                      gaugePreview && gaugePreview.rowCount > 0 && !gaugeDownloading
                        ? 'pointer'
                        : 'not-allowed',
                  }}
                >
                  <Download size={14} />
                  {gaugeDownloading ? 'Downloading…' : 'Download Excel'}
                </button>

                <button
                  onClick={() => setGaugePreviewOpen(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: '1px solid #E5E7EB',
                    background: '#FFFFFF',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} color="#374151" />
                </button>
              </div>
            </div>

            {gaugePreviewLoading && (
              <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontWeight: 600 }}>
                Building preview…
              </div>
            )}

            {!gaugePreviewLoading && gaugePreview && (
              <>
                <div
                  style={{
                    padding: '10px 18px',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E5E7EB',
                    display: 'flex',
                    gap: 18,
                    flexWrap: 'wrap',
                    fontSize: '0.8rem',
                    color: '#475569',
                  }}
                >
                  <span>
                    Pieces:{' '}
                    <strong style={{ color: '#0F172A' }}>{gaugePreview.unitCount}</strong>
                  </span>
                  <span>
                    Rows:{' '}
                    <strong style={{ color: '#0F172A' }}>{gaugePreview.rowCount}</strong>
                  </span>
                  <span>
                    Total weight:{' '}
                    <strong style={{ color: '#0F172A' }}>
                      {gaugePreview.totalWeight.toLocaleString()} kg
                    </strong>
                  </span>
                  <span style={{ color: '#64748B' }}>{gaugePreview.message}</span>
                </div>

                <div
                  className="gauge-report-preview"
                  style={{
                    display: 'flex',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                  }}
                >
                  {gaugePreview.rows.length === 0 ? (
                    <div
                      style={{
                        flex: 1,
                        padding: 40,
                        textAlign: 'center',
                        color: '#6B7280',
                      }}
                    >
                      No pieces were scanned as shipped on this date.
                    </div>
                  ) : (
                    <>
                      {/* Main dispatch table (columns A–L) */}
                      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.75rem',
                          }}
                        >
                          <thead>
                            <tr>
                              {[
                                'SR#',
                                'TYPE',
                                'PROJECT',
                                'JOBNAME',
                                'STD DUCT',
                                'SYSTEM STD DUCT WEIGHT(KG)',
                                'FITTING QTY',
                                'SYSTEM FITTING WEIGHT(KG)',
                                'TOTAL SYSTEM WEIGHT (KG)',
                                'THICKNESS',
                                'WEIGHT IN KG',
                                'G',
                              ].map((h) => (
                                <th
                                  key={h}
                                  style={{
                                    padding: '9px 10px',
                                    textAlign: 'left',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 2,
                                    backgroundColor: '#1F4E78',
                                    color: '#FFFFFF',
                                    borderBottom: '2px solid #163656',
                                    fontSize: '0.7rem',
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {gaugePreview.rows.map((row, idx) => (
                              <tr
                                key={`${row.sr}-${row.projectName}-${row.jobName}-${row.thickness}`}
                                style={{
                                  borderBottom: '1px solid #E5E7EB',
                                  backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F9FBFD',
                                }}
                              >
                                <td style={{ padding: '7px 10px', textAlign: 'center', color: '#111827' }}>
                                  {row.sr}
                                </td>
                                <td style={{ padding: '7px 10px', color: '#374151' }}>
                                  {row.type || '—'}
                                </td>
                                <td style={{ padding: '7px 10px', fontWeight: 600, color: '#111827' }}>
                                  {row.projectName}
                                </td>
                                <td style={{ padding: '7px 10px', color: '#374151' }}>{row.jobName}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#111827' }}>
                                  {row.stdDuctCount || '—'}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#111827' }}>
                                  {row.stdDuctWeight || '—'}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#111827' }}>
                                  {row.fittingQty || '—'}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#111827' }}>
                                  {row.fittingWeight || '—'}
                                </td>
                                <td
                                  style={{
                                    padding: '7px 10px',
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: '#111827',
                                  }}
                                >
                                  {row.totalWeight}
                                </td>
                                <td style={{ padding: '7px 10px', color: '#374151' }}>{row.thickness}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: '#111827' }}>
                                  {row.projectWeightKg}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', color: '#111827' }}>
                                  {row.gauge ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Side summary (columns M–N), matching Excel layout */}
                      {gaugePreview.projectSummary.length > 0 && (
                        <div
                          style={{
                            width: 300,
                            flexShrink: 0,
                            borderLeft: '2px solid #CBD5E1',
                            overflow: 'auto',
                            background: '#FFFFFF',
                          }}
                        >
                          <table
                            style={{
                              width: '100%',
                              borderCollapse: 'collapse',
                              fontSize: '0.75rem',
                            }}
                          >
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    padding: '9px 10px',
                                    textAlign: 'left',
                                    fontWeight: 700,
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 2,
                                    backgroundColor: '#2F5597',
                                    color: '#FFFFFF',
                                    borderBottom: '2px solid #1e3a6e',
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  PROJECT
                                </th>
                                <th
                                  style={{
                                    padding: '9px 10px',
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 2,
                                    backgroundColor: '#2F5597',
                                    color: '#FFFFFF',
                                    borderBottom: '2px solid #1e3a6e',
                                    fontSize: '0.7rem',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  TOTAL WEIGHT (KG)
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {gaugePreview.projectSummary.map((p, idx) => (
                                <tr
                                  key={p.projectName}
                                  style={{
                                    backgroundColor: '#E2EFDA',
                                    borderBottom: '1px solid #C6E0B4',
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: '8px 10px',
                                      fontWeight: 600,
                                      color: '#1F2937',
                                      verticalAlign: 'middle',
                                    }}
                                  >
                                    {p.projectName}
                                  </td>
                                  <td
                                    style={{
                                      padding: '8px 10px',
                                      textAlign: 'right',
                                      fontWeight: 700,
                                      color: '#111827',
                                      verticalAlign: 'middle',
                                    }}
                                  >
                                    {p.totalWeight.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ backgroundColor: '#FFFFFF' }}>
                                <td
                                  style={{
                                    padding: '10px 10px',
                                    fontWeight: 800,
                                    color: '#1F4E78',
                                    borderTop: '2px solid #1F4E78',
                                  }}
                                >
                                  TOTAL WEIGHT
                                </td>
                                <td
                                  style={{
                                    padding: '10px 10px',
                                    textAlign: 'right',
                                    fontWeight: 800,
                                    color: '#1F4E78',
                                    borderTop: '2px solid #1F4E78',
                                    fontSize: '0.85rem',
                                  }}
                                >
                                  {gaugePreview.totalWeight.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Shipping List Preview Modal ─── */}
      {gatePassOpen && (
        <div
          onClick={() => setGatePassOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1100,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid #E5E7EB',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}>
                  Shipping List Preview
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 2 }}>
                  AL MULLA AIR DUCT — SHIPPING LIST
                  {gatePassPreview ? ` · ${gatePassPreview.displayDate}` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                  Date
                  <input
                    type="date"
                    value={gatePassDate}
                    onChange={(e) => openGatePassPreview(e.target.value, gatePassTrolley, gatePassProject)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 6,
                      border: '1px solid #E5E7EB',
                      fontSize: '0.8125rem',
                    }}
                  />
                </label>

                <select
                  value={gatePassProject}
                  onChange={(e) => openGatePassPreview(gatePassDate, gatePassTrolley, e.target.value)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#374151',
                    maxWidth: 220,
                  }}
                  title="Select a project to download its Shipping List PDF"
                >
                  <option value="ALL">All Projects (preview)</option>
                  {gatePassProjectOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  value={gatePassTrolley}
                  onChange={(e) => openGatePassPreview(gatePassDate, e.target.value, gatePassProject)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  <option value="ALL">All Trolleys</option>
                  {(gatePassPreview?.trolleys?.length
                    ? gatePassPreview.trolleys
                    : availableVehicles
                  ).map((v) => (
                    <option key={v} value={v}>
                      Trolly# {v}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleDownloadGatePass()}
                  disabled={
                    gatePassDownloading ||
                    gatePassLoading ||
                    !gatePassPreview ||
                    gatePassPreview.totalPieces === 0 ||
                    gatePassProject === 'ALL' ||
                    (!resolveProjectId(gatePassProject) && gatePassProject === 'ALL')
                  }
                  title={
                    gatePassProject === 'ALL'
                      ? 'Select a project to download PDF'
                      : 'Download Shipping List PDF for selected project'
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    cursor:
                      gatePassPreview &&
                      gatePassPreview.totalPieces > 0 &&
                      !gatePassDownloading &&
                      gatePassProject !== 'ALL'
                        ? 'pointer'
                        : 'not-allowed',
                    background:
                      gatePassPreview &&
                      gatePassPreview.totalPieces > 0 &&
                      gatePassProject !== 'ALL'
                        ? '#0D9488'
                        : '#9CA3AF',
                  }}
                >
                  <Download size={14} />
                  {gatePassDownloading ? 'Downloading…' : 'Download Project PDF'}
                </button>

                <button
                  onClick={() => setGatePassOpen(false)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB',
                    background: '#FFFFFF',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: 16, overflow: 'auto', flex: 1, background: '#F8FAFC' }}>
              {gatePassLoading && (
                <div style={{ textAlign: 'center', color: '#64748B', padding: 40 }}>
                  Loading Shipping List…
                </div>
              )}

              {!gatePassLoading && gatePassPreview && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      flexWrap: 'wrap',
                      marginBottom: 14,
                      fontSize: '0.8rem',
                      color: '#475569',
                    }}
                  >
                    <span>
                      Lists:{' '}
                      <strong style={{ color: '#0F172A' }}>{gatePassPreview.passCount}</strong>
                    </span>
                    <span>
                      Pieces:{' '}
                      <strong style={{ color: '#0F172A' }}>{gatePassPreview.totalPieces}</strong>
                    </span>
                    <span>
                      Weight:{' '}
                      <strong style={{ color: '#0F172A' }}>
                        {gatePassPreview.totalWeight.toLocaleString()} kg
                      </strong>
                    </span>
                    <span style={{ color: '#64748B' }}>{gatePassPreview.message}</span>
                    {gatePassProject === 'ALL' && gatePassPreview.passCount > 1 && (
                      <span style={{ color: '#B45309', fontWeight: 600 }}>
                        Select a project above to download — one PDF per project.
                      </span>
                    )}
                  </div>

                  {gatePassPreview.passes.length === 0 ? (
                    <div
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E5E7EB',
                        borderRadius: 8,
                        padding: 28,
                        textAlign: 'center',
                        color: '#64748B',
                      }}
                    >
                      No shipped pieces for this date / trolley.
                    </div>
                  ) : (
                    gatePassPreview.passes.map((pass) => (
                      <div
                        key={`${pass.projectName}::${pass.trolley}`}
                        className="shipping-list-preview"
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: 8,
                          marginBottom: 16,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid #E2E8F0',
                            background: '#F1F5F9',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 240 }}>
                            <div
                              style={{
                                textAlign: 'center',
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                color: '#0F172A',
                                marginBottom: 10,
                              }}
                            >
                              AL MULLA AIR DUCT - SHIPPING LIST
                            </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, 1fr)',
                              gap: 8,
                              fontSize: '0.75rem',
                            }}
                          >
                            <div>
                              <div style={{ color: '#64748B', fontWeight: 600 }}>PROJECT #</div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{pass.projectName}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748B', fontWeight: 600 }}>Trolly#</div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{pass.trolley}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748B', fontWeight: 600 }}>SHIPPING DATE</div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{pass.shippingDate}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748B', fontWeight: 600 }}>ACTUAL WEIGHT DISPATCHED</div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>
                                {pass.actualWeight.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            </div>
                            <div>
                              <div style={{ color: '#64748B', fontWeight: 600 }}>Short name</div>
                              <div style={{ fontWeight: 600, color: '#334155' }}>{pass.projectShortName}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748B', fontWeight: 600 }}>Total pieces</div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{pass.totalPieces}</div>
                            </div>
                          </div>
                          </div>

                          {(pass.projectId || pass.projectName) && (
                            <button
                              onClick={() =>
                                handleDownloadGatePass(
                                  pass.projectId ?? undefined,
                                  pass.trolley !== '—' ? pass.trolley : undefined,
                                  pass.projectName,
                                )
                              }
                              disabled={gatePassDownloading}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: 'none',
                                background: '#0D9488',
                                color: '#FFFFFF',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: gatePassDownloading ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Download size={13} />
                              Download PDF
                            </button>
                          )}
                        </div>

                        {pass.jobs.map((job) => (
                          <div key={job.jobName} style={{ padding: '10px 12px 14px' }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                color: '#0F172A',
                                textAlign: 'center',
                                marginBottom: 8,
                              }}
                            >
                              {pass.projectShortName}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: 24,
                                flexWrap: 'wrap',
                                fontWeight: 600,
                                fontSize: '0.82rem',
                                color: '#0F172A',
                                marginBottom: 8,
                              }}
                            >
                              <span>JOB NAME {job.jobName}</span>
                              <span>ACCOUNT {job.account || '—'}</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  fontSize: '0.75rem',
                                }}
                              >
                                <thead>
                                  <tr>
                                    {['P. No.', 'TRACKING NO.', 'ITEM', 'SIZE', 'Shipped Date/Time'].map(
                                      (h) => (
                                        <th key={h}>{h}</th>
                                      ),
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {job.pieces.map((row, idx) => (
                                    <tr
                                      key={`${row.trackingNo}-${idx}`}
                                      style={{
                                        background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                        borderBottom: '1px solid #E5E7EB',
                                      }}
                                    >
                                      <td style={{ fontWeight: 600 }}>{row.pieceNumber}</td>
                                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                        {row.trackingNo || '—'}
                                      </td>
                                      <td>{row.item}</td>
                                      <td>{row.size || '—'}</td>
                                      <td style={{ whiteSpace: 'nowrap' }}>{row.shippedAt}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div
                              style={{
                                marginTop: 8,
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                color: '#0F172A',
                                textAlign: 'right',
                              }}
                            >
                              No. of Piece {job.pieceCount}
                            </div>
                          </div>
                        ))}

                        <div
                          style={{
                            padding: '10px 14px',
                            borderTop: '1px solid #E2E8F0',
                            textAlign: 'right',
                            fontWeight: 800,
                            color: '#1F4E78',
                            fontSize: '0.85rem',
                          }}
                        >
                          {pass.totalPieces} Total no. of Piece
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
