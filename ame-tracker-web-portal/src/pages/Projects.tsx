import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FolderKanban, Briefcase, Package, ChevronRight, ArrowLeft,
  Search, ChevronUp, ChevronDown, X, CheckCircle, Clock, Tag, Trash2, Plus, PenLine, Truck
} from 'lucide-react';
import type { Part, TrackingStatus } from '../data/mockData';
import { api } from '../services/api';
import PartDrawer from '../components/PartDrawer';
import { useApp } from '../store/AppContext';
import { getSocket } from '../services/socket';
import { isStatusChangeLocked, statusLockMessage } from '../utils/statusLock';

const ITEM_SCHEDULE_HEADERS = [
  'Item',
  'ItemID',
  'Metal',
  'Liner and Insulation',
  'Qty',
  'Information',
  'Area',
  'Weight',
  'Cost',
  'Hours',
  'Segmented',
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

function scheduleLookup(
  values: Record<string, string | number | boolean | null | undefined> | undefined,
  header: string,
): string | number | boolean | null | undefined {
  if (!values) return undefined;
  if (header === 'ItemID') {
    const id = values.ItemID ?? values.ItemId ?? values.itemId;
    return id != null && String(id).trim() !== '' ? id : null;
  }
  if (header === 'PieceNbr') {
    const piece = values.PieceNbr ?? values['#'];
    const alpha = values['Alpha number'] ?? values['Alpha #'];
    const p = piece != null && String(piece).trim() !== '' ? String(piece).trim() : null;
    const a = alpha != null && String(alpha).trim() !== '' ? String(alpha).trim() : null;
    if (p && a && p === a) return p.replace(/[^\d].*$/, '') || p;
    return p ?? (a ? a.replace(/[^\d].*$/, '') || a : null);
  }
  return values[header];
}

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

function statusCellClass(status: string) {
  const s = (status || 'PENDING').toUpperCase();
  if (s === 'SHIPPED') return 'col-live col-status-shipped';
  if (s === 'LOADED') return 'col-live col-status-loaded';
  if (s === 'CANCELLED') return 'col-live col-status-cancelled';
  return 'col-live col-status-active';
}

function datetimeCellClass(status: string) {
  const s = (status || 'PENDING').toUpperCase();
  if (s === 'SHIPPED') return 'col-live col-datetime-shipped';
  return 'col-live';
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || 'PENDING').toUpperCase();
  const cls = s === 'SHIPPED' ? 'badge-shipped'
    : s === 'LOADED' ? 'badge-loaded'
    : s === 'PARTIAL' ? 'badge-partial'
    : s === 'CANCELLED' ? 'badge-cancelled'
    : s === 'ACTIVE' || s === 'PENDING' ? 'badge-active'
    : 'badge-pending';
  const label = s === 'SHIPPED' ? 'Shipped'
    : s === 'LOADED' ? 'Loaded'
    : s === 'PENDING' || s === 'ACTIVE' ? 'Active'
    : s;
  return <span className={`badge ${cls}`}><span className="badge-dot" />{label}</span>;
}

function ManualBadge({ title }: { title?: string }) {
  return (
    <span
      className="badge-manual"
      title={title || 'Added manually — no QR; ship from portal into a trolley'}
    >
      <PenLine size={8} strokeWidth={2.5} />
      Manual
    </span>
  );
}

function statusSelectValue(status: string): 'PENDING' | 'SHIPPED' {
  return String(status || 'PENDING').toUpperCase() === 'SHIPPED' ? 'SHIPPED' : 'PENDING';
}

function parseTrackingUnitId(trId: string): number | null {
  const m = String(trId).match(/^tr-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function AdminStatusSelect({
  status,
  disabled,
  locked,
  isManual,
  onSelect,
}: {
  status: string;
  disabled?: boolean;
  locked?: boolean;
  /** Manual (no-QR) items may be set Active↔Shipped from portal. */
  isManual?: boolean;
  onSelect: (status: string) => void;
}) {
  const current = statusSelectValue(status);
  const isShipped = current === 'SHIPPED';

  if (isManual) {
    if (locked && isShipped) {
      return (
        <span title={statusLockMessage()}>
          <StatusBadge status="SHIPPED" />
        </span>
      );
    }
    return (
      <select
        className="form-select manual-status-select"
        value={current}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          const next = e.target.value;
          if (next === 'PENDING' || next === 'SHIPPED') onSelect(next);
        }}
      >
        <option value="PENDING">Active</option>
        <option value="SHIPPED">Shipped</option>
      </select>
    );
  }

  if (!isShipped) {
    return (
      <span title="Scan on mobile to mark as shipped">
        <StatusBadge status={status} />
      </span>
    );
  }
  if (locked) {
    return (
      <span title={statusLockMessage()}>
        <StatusBadge status="SHIPPED" />
      </span>
    );
  }
  return (
    <select
      className="form-select"
      value="SHIPPED"
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        if (e.target.value === 'PENDING') onSelect('PENDING');
      }}
      style={{ fontSize: 11, padding: '2px 6px', minWidth: 88, fontWeight: 700 }}
    >
      <option value="SHIPPED">Shipped</option>
      <option value="PENDING">Active</option>
    </select>
  );
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
  const { currentUser } = useApp();
  const isAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';
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
      sourceJobId: String(j.sourceJobId || j.code || j.id),
      downloadId: Number(j.t4vjobDownloadId) || 68,
      jobName: j.name || j.jobName,
      projectName: j.project?.name || j.project?.projectName || 'Project',
      importVersion: Number(j.importVersion ?? 1),
      status: (totalParts > 0 && pendingParts === 0 ? 'SHIPPED' : 'ACTIVE') as 'SHIPPED' | 'ACTIVE',
      importedAt: j.createdAt || new Date().toISOString(),
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
    return (selectedProject && jobId)
      ? allJobs.find(j => j.id === jobId && j.projectId === selectedProject.id) || null
      : null;
  }, [selectedProject, jobId, allJobs]);

  // Level 3 (Parts) state
  const [search, setSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [tableView, setTableView] = useState<TableView>('schedule');
  const [sortKey, setSortKey] = useState<ScheduleSortKey>('ItemID');
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
    isManual?: boolean;
    values: Record<string, string | number | boolean | null>;
  }>>([]);

  const [archivingJobId, setArchivingJobId] = useState<string | null>(null);
  const [statusUpdatingKey, setStatusUpdatingKey] = useState<string | null>(null);
  const [deletingManualItemId, setDeletingManualItemId] = useState<string | null>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [trolleyShip, setTrolleyShip] = useState<{
    unitIds: number[];
    label: string;
  } | null>(null);
  const [activeTrolleys, setActiveTrolleys] = useState<Array<{
    id: number;
    transitNumber: string;
    status: string;
    startedAt: string;
    _count?: { transitProducts: number };
  }>>([]);
  const [trolleysLoading, setTrolleysLoading] = useState(false);
  const [selectedTrolleyId, setSelectedTrolleyId] = useState<number | null>(null);
  const [shippingToTrolley, setShippingToTrolley] = useState(false);
  const [trolleyError, setTrolleyError] = useState<string | null>(null);
  const [newTrolleyName, setNewTrolleyName] = useState('');
  const [creatingTrolley, setCreatingTrolley] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);
  const [addItemForm, setAddItemForm] = useState({
    pieceNumber: '',
    fitting: '',
    quantity: '1',
    itemId: '',
    itemTrackingNo: '',
    metal: '',
    gauge: '',
    liner: '',
    dimensions: '',
    weight: '',
    area: '',
    drawing: '',
    floor: '',
    systemName: '',
    pressure: '',
    length: '',
  });

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return allProjects;
    return allProjects.filter((proj) => {
      const name = String(proj.name || '').toLowerCase();
      const code = String(proj.code || '').toLowerCase();
      const status = String(proj.status || '').toLowerCase();
      return name.includes(q) || code.includes(q) || status.includes(q);
    });
  }, [allProjects, projectSearch]);

  const selectedJobSourceId = selectedJob ? String(selectedJob.sourceJobId || selectedJob.id) : null;

  async function loadJobPartData(): Promise<Part[]> {
    if (!selectedJob || !selectedJobSourceId) {
      setLiveParts([]);
      setLiveTracking([]);
      return [];
    }
    let mapped: Part[] = [];
    try {
      const res = await api.getItemSchedule(selectedJobSourceId);
      if (res?.items) {
        mapped = res.items.map((item) => {
          const values = item.values || {};
          const pieceRaw = scheduleLookup(values, 'PieceNbr');
          return {
            id: String(item.id),
            jobId: selectedJob.id,
            pieceNbr: typeof pieceRaw === 'string' || typeof pieceRaw === 'number' ? pieceRaw : item.sourceItemId,
            fitting: String(values.Item || '—'),
            itemId: item.sourceItemId,
            description: String(values.Information || ''),
            metal: values.Metal != null ? String(values.Metal) : '',
            information: values.Information != null ? String(values.Information) : '',
            area: typeof values.Area === 'number' ? values.Area : undefined,
            weight: typeof values.Weight === 'number' ? values.Weight : undefined,
            status: (item.status || 'PENDING') as TrackingStatus,
            trackingDateTime: item.trackingDateTime || null,
            isManual: Boolean(item.isManual),
            schedule: { ...values, ItemID: item.sourceItemId },
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
    } catch {
      /* keep previous */
    }
    try {
      const trackingRes = await api.getTrackingExport(selectedJobSourceId);
      if (trackingRes?.items) {
        setLiveTracking(trackingRes.items.map((row) => ({
          id: String(row.id),
          status: row.status || 'PENDING',
          trackingDateTime: row.trackingDateTime || null,
          isManual: Boolean(row.isManual),
          values: row.values || {},
        })));
      }
    } catch {
      setLiveTracking([]);
    }
    return mapped;
  }

  async function refreshJobParts() {
    const mapped = await loadJobPartData();
    loadData();
    if (selectedPart) {
      const updated = mapped.find((p) => p.id === selectedPart.id);
      if (updated) setSelectedPart(updated);
    }
  }

  async function loadActiveTrolleys() {
    setTrolleysLoading(true);
    setTrolleyError(null);
    try {
      const res = await api.getDispatches('OPEN');
      const items = Array.isArray(res?.items) ? res.items : [];
      setActiveTrolleys(items);
      setSelectedTrolleyId(items[0]?.id ?? null);
    } catch (err: unknown) {
      setActiveTrolleys([]);
      setSelectedTrolleyId(null);
      setTrolleyError(err instanceof Error ? err.message : 'Could not load active trolleys');
    } finally {
      setTrolleysLoading(false);
    }
  }

  function openManualShipPicker(unitIds: number[], label: string) {
    if (!unitIds.length) return;
    setTrolleyShip({ unitIds, label });
    setNewTrolleyName('');
    setTrolleyError(null);
    loadActiveTrolleys();
  }

  async function handleCreateTrolley() {
    if (creatingTrolley) return;
    setCreatingTrolley(true);
    setTrolleyError(null);
    try {
      const created = await api.createDispatch(newTrolleyName.trim() || undefined);
      const id = Number(created?.id);
      await loadActiveTrolleys();
      if (Number.isFinite(id) && id > 0) setSelectedTrolleyId(id);
      setNewTrolleyName('');
    } catch (err: unknown) {
      setTrolleyError(err instanceof Error ? err.message : 'Could not create trolley');
    } finally {
      setCreatingTrolley(false);
    }
  }

  async function confirmShipToTrolley() {
    if (!trolleyShip || !selectedTrolleyId || shippingToTrolley) return;
    setShippingToTrolley(true);
    setTrolleyError(null);
    setStatusUpdatingKey(
      trolleyShip.unitIds.length === 1
        ? `unit-${trolleyShip.unitIds[0]}`
        : `item-ship`,
    );
    try {
      await Promise.all(
        trolleyShip.unitIds.map((unitId) =>
          api.updateProductStatus(unitId, {
            status: 'SHIPPED',
            source: 'Projects',
            dispatchId: selectedTrolleyId,
            reason: `Shipped to trolley #${selectedTrolleyId} from projects`,
          }),
        ),
      );
      setTrolleyShip(null);
      await refreshJobParts();
    } catch (err: unknown) {
      setTrolleyError(err instanceof Error ? err.message : 'Could not ship to trolley');
    } finally {
      setShippingToTrolley(false);
      setStatusUpdatingKey(null);
    }
  }

  async function handleUnitStatusChange(unitId: number, newStatus: string, isManual?: boolean) {
    if (!unitId) return;
    if (newStatus === 'SHIPPED' && isManual) {
      openManualShipPicker([unitId], `Unit #${unitId}`);
      return;
    }
    setStatusUpdatingKey(`unit-${unitId}`);
    try {
      await api.updateProductStatus(unitId, {
        status: newStatus,
        source: 'Projects',
        reason: `Status set to ${newStatus} from projects`,
      });
      await refreshJobParts();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not update item status');
    } finally {
      setStatusUpdatingKey(null);
    }
  }

  async function handleScheduleItemStatusChange(part: Part, newStatus: string) {
    const unitIds = part.trackingRecords
      .map((tr) => parseTrackingUnitId(tr.id))
      .filter((id): id is number => id != null);
    if (!unitIds.length) return;
    if (newStatus === 'SHIPPED' && part.isManual) {
      const label = String(part.schedule?.Item || part.fitting || part.pieceNbr || part.id);
      openManualShipPicker(unitIds, label);
      return;
    }
    setStatusUpdatingKey(`item-${part.id}`);
    try {
      await Promise.all(
        unitIds.map((unitId) =>
          api.updateProductStatus(unitId, {
            status: newStatus,
            source: 'Projects',
            reason: `Status set to ${newStatus} from projects (schedule item)`,
          }),
        ),
      );
      await refreshJobParts();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not update item status');
    } finally {
      setStatusUpdatingKey(null);
    }
  }

  async function handleDeleteManualItem(part: Part) {
    if (!selectedJob || !part.isManual || deletingManualItemId) return;
    const label = String(part.schedule?.Item || part.fitting || part.pieceNbr || part.id);
    if (!window.confirm(`Delete manual item “${label}”? This cannot be undone.`)) return;
    setDeletingManualItemId(part.id);
    try {
      await api.deleteManualJobItem(selectedJob.id, part.id);
      if (selectedPart?.id === part.id) setSelectedPart(null);
      await refreshJobParts();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not delete item');
    } finally {
      setDeletingManualItemId(null);
    }
  }

  async function handleCreateManualItem() {
    if (!selectedJob || addingItem) return;
    const pieceNumber = addItemForm.pieceNumber.trim();
    const fitting = addItemForm.fitting.trim();
    if (!pieceNumber) {
      setAddItemError('Piece number is required');
      return;
    }
    if (!fitting) {
      setAddItemError('Fitting / Item is required for reports');
      return;
    }
    const quantity = Math.min(100, Math.max(1, Number(addItemForm.quantity) || 1));
    const gaugeNum = addItemForm.gauge.trim() ? Number(addItemForm.gauge) : undefined;
    const weightNum = addItemForm.weight.trim() ? Number(addItemForm.weight) : undefined;
    const areaNum = addItemForm.area.trim() ? Number(addItemForm.area) : undefined;
    const itemIdRaw = addItemForm.itemId.trim();
    const itemId = itemIdRaw ? Number(itemIdRaw) : undefined;
    if (itemIdRaw && !Number.isFinite(itemId)) {
      setAddItemError('Item ID must be a number');
      return;
    }
    const trackingRaw = addItemForm.itemTrackingNo.trim();
    const itemTrackingNo = trackingRaw ? Number(trackingRaw) : undefined;
    if (trackingRaw && (!Number.isFinite(itemTrackingNo) || (itemTrackingNo as number) < 1)) {
      setAddItemError('Item Tracking No. must be a positive number');
      return;
    }
    setAddingItem(true);
    setAddItemError(null);
    try {
      await api.createManualJobItem(selectedJob.id, {
        pieceNumber,
        fitting,
        quantity,
        itemId: Number.isFinite(itemId as number) ? itemId : undefined,
        itemTrackingNo: Number.isFinite(itemTrackingNo as number) ? itemTrackingNo : undefined,
        metal: addItemForm.metal.trim() || undefined,
        gauge: Number.isFinite(gaugeNum as number) ? gaugeNum : undefined,
        liner: addItemForm.liner.trim() || undefined,
        dimensions: addItemForm.dimensions.trim().replace(/(\d)\s*[xX*]\s*(?=\d)/g, '$1 × ') || undefined,
        weight: Number.isFinite(weightNum as number) ? weightNum : undefined,
        area: Number.isFinite(areaNum as number) ? areaNum : undefined,
        drawing: addItemForm.drawing.trim() || undefined,
        floor: addItemForm.floor.trim() || undefined,
        systemName: addItemForm.systemName.trim() || undefined,
        pressure: addItemForm.pressure.trim() || undefined,
        length: addItemForm.length.trim() || undefined,
      });
      setShowAddItemModal(false);
      setAddItemForm({
        pieceNumber: '',
        fitting: '',
        quantity: '1',
        itemId: '',
        itemTrackingNo: '',
        metal: '',
        gauge: '',
        liner: '',
        dimensions: '',
        weight: '',
        area: '',
        drawing: '',
        floor: '',
        systemName: '',
        pressure: '',
        length: '',
      });
      await refreshJobParts();
    } catch (err: unknown) {
      setAddItemError(err instanceof Error ? err.message : 'Could not add item');
    } finally {
      setAddingItem(false);
    }
  }

  useEffect(() => {
    loadJobPartData();
  }, [selectedJob?.id, selectedJobSourceId]);

  useEffect(() => {
    const sock = getSocket();
    const onLiveUpdate = () => {
      loadData();
      loadJobPartData().then((mapped) => {
        if (selectedPart) {
          const updated = mapped.find((p) => p.id === selectedPart.id);
          if (updated) setSelectedPart(updated);
        }
      });
    };
    sock.on('dashboard:scan', onLiveUpdate);
    sock.on('dashboard:kpi', onLiveUpdate);
    sock.on('dashboard:dispatch_complete', onLiveUpdate);
    return () => {
      sock.off('dashboard:scan', onLiveUpdate);
      sock.off('dashboard:kpi', onLiveUpdate);
      sock.off('dashboard:dispatch_complete', onLiveUpdate);
    };
  }, [selectedPart?.id, selectedJob?.id, selectedJobSourceId]);

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
          scheduleCell(scheduleLookup(values, header)).toLowerCase().includes(q),
        );
      const matchItem = !itemFilter || String(values.Item || p.fitting) === itemFilter;
      return matchSearch && matchItem;
    }).sort((a, b) => {
      if (sortKey === 'Status') return compareSchedule(a.status, b.status, sortDir);
      if (sortKey === DATETIME_HEADER) return compareSchedule(a.trackingDateTime, b.trackingDateTime, sortDir);
      return compareSchedule(scheduleLookup(a.schedule, sortKey), scheduleLookup(b.schedule, sortKey), sortDir);
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
    setSortKey('ItemID');
    setTrackingSortKey('ItemTracking');
    setSortDir('asc');
    setTableView('schedule');
    setPage(1);
  }

  async function handleArchiveJob(jobId: string, jobName: string) {
    const ok = window.confirm(
      `Delete "${jobName}"?\n\nAll parts for this job will be removed. A summary is kept on Admin → Archived jobs. Re-importing the same job will show v2 on the Dashboard.`,
    );
    if (!ok) return;
    setArchivingJobId(jobId);
    try {
      await api.archiveJob(jobId);
      if (params.get('job') === jobId) {
        selectJob(null);
      }
      loadData();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not delete job');
    } finally {
      setArchivingJobId(null);
    }
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
    setSortKey('ItemID');
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
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>{selectedProject.name}</span>
                <span>·</span>
                <span className="chip" style={{ fontSize: 11 }}>Job ID: {selectedJob.sourceJobId}</span>
                <span className="chip" style={{ fontSize: 11 }}>Upload v{selectedJob.importVersion}</span>
                <span className="chip" style={{ fontSize: 11 }}>Download ID: {selectedJob.downloadId}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAdmin && (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setAddItemError(null);
                    setShowAddItemModal(true);
                  }}
                  style={{
                    background: 'var(--green-600)',
                    color: '#fff',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 1px 2px rgba(7,135,16,0.25)',
                  }}
                >
                  <Plus size={14} /> Add manual item
                </button>
              )}
              <span className={`badge badge-${selectedJob.status.toLowerCase()}`} style={{ fontSize: 12, padding: '5px 12px' }}>
                {selectedJob.status === 'SHIPPED' ? 'Shipped' : 'Active'}
              </span>
            </div>
          </div>

          {/* KPI row */}
          <div className="kpi-grid kpi-grid-4" style={{ marginTop: 18 }}>
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
                  ? 'Item columns'
                  : 'Item Unit columns (one row per physical piece)'}
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
                  Item ({jobParts.length})
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
                  Item Unit ({liveTracking.length})
                </button>
              </div>
              <div className="topbar-search" style={{ flex: 'none' }}>
                <Search size={13} />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder={tableView === 'schedule' ? 'Search items…' : 'Search item units…'}
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
                    <tr
                      key={part.id}
                      onClick={() => setSelectedPart(part)}
                      className={part.isManual ? 'row-manual' : undefined}
                      style={{ cursor: 'pointer' }}
                    >
                      {SCHEDULE_TABLE_HEADERS.map((header) => (
                        <td
                          key={header}
                          className={[
                            header === 'ItemID' ? 'td-mono' : '',
                            header === DATETIME_HEADER ? datetimeCellClass(part.status || 'PENDING') : '',
                            header === 'Status' ? statusCellClass(part.status || 'PENDING') : '',
                          ].filter(Boolean).join(' ') || undefined}
                          title={header === 'Status' ? part.status || 'PENDING' : header === DATETIME_HEADER ? formatTimestamp(part.trackingDateTime) : scheduleCell(scheduleLookup(part.schedule, header))}
                        >
                          {header === 'Item'
                            ? (
                              <div className="manual-item-cell">
                                <span>{scheduleCell(scheduleLookup(part.schedule, header))}</span>
                                {part.isManual && <ManualBadge />}
                              </div>
                            )
                            : header === 'Status'
                            ? (
                              <div className="manual-status-actions">
                                {isAdmin && part.trackingRecords.length > 0
                                  ? (
                                    <AdminStatusSelect
                                      status={part.status || 'PENDING'}
                                      disabled={statusUpdatingKey === `item-${part.id}`}
                                      locked={isStatusChangeLocked(part.trackingDateTime)}
                                      isManual={Boolean(part.isManual)}
                                      onSelect={(newStatus) => handleScheduleItemStatusChange(part, newStatus)}
                                    />
                                  )
                                  : <StatusBadge status={part.status || 'PENDING'} />}
                                {isAdmin && part.isManual && (
                                  <button
                                    type="button"
                                    className="manual-delete-btn"
                                    title="Delete manual item"
                                    disabled={deletingManualItemId === part.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteManualItem(part);
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            )
                            : header === DATETIME_HEADER
                              ? formatTimestamp(part.trackingDateTime)
                              : scheduleCell(scheduleLookup(part.schedule, header))}
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
                    <tr key={row.id} className={row.isManual ? 'row-manual' : undefined}>
                      {TRACKING_TABLE_HEADERS.map((header) => (
                        <td
                          key={header}
                          className={[
                            header === 'ItemTracking' || header === 'PieceNbr' || header === 'ItemID' || header === DATETIME_HEADER ? 'td-mono' : '',
                            header === DATETIME_HEADER ? datetimeCellClass(row.status) : '',
                            header === 'Status' ? statusCellClass(row.status) : '',
                          ].filter(Boolean).join(' ') || undefined}
                          title={header === 'Status' ? row.status : header === DATETIME_HEADER ? formatTimestamp(row.trackingDateTime) : trackingCell(header, row.values[header])}
                        >
                          {header === 'Fitting'
                            ? (
                              <div className="manual-item-cell">
                                <span>{trackingCell(header, row.values[header])}</span>
                                {row.isManual && <ManualBadge />}
                              </div>
                            )
                            : header === 'Status'
                            ? (
                              <div className="manual-status-actions">
                                {isAdmin
                                  ? (
                                    <AdminStatusSelect
                                      status={row.status}
                                      disabled={statusUpdatingKey === `unit-${row.id}`}
                                      locked={isStatusChangeLocked(row.trackingDateTime)}
                                      isManual={Boolean(row.isManual)}
                                      onSelect={(newStatus) => handleUnitStatusChange(Number(row.id), newStatus, Boolean(row.isManual))}
                                    />
                                  )
                                  : <StatusBadge status={row.status} />}
                              </div>
                            )
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
            onRefresh={refreshJobParts}
            onManualShip={
              isAdmin && selectedPart.isManual
                ? (unitIds) => {
                    const label = String(
                      selectedPart.schedule?.Item || selectedPart.fitting || selectedPart.pieceNbr || selectedPart.id,
                    );
                    openManualShipPicker(unitIds, label);
                  }
                : undefined
            }
            onDeleteManual={
              isAdmin && selectedPart.isManual
                ? async () => {
                    await handleDeleteManualItem(selectedPart);
                  }
                : undefined
            }
            deletingManual={deletingManualItemId === selectedPart.id}
          />
        )}

        {trolleyShip && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !shippingToTrolley && !creatingTrolley) {
                setTrolleyShip(null);
              }
            }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10001,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
          >
            <div
              style={{
                background: '#FFFFFF', borderRadius: 16,
                boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
                width: '100%', maxWidth: 460,
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="manual-modal-header-icon">
                    <Truck size={16} color="#fff" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Ship to trolley</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <strong>{trolleyShip.label}</strong> — choose an active dispatch
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !shippingToTrolley && !creatingTrolley && setTrolleyShip(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 6 }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {trolleyError && (
                  <div style={{
                    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
                    padding: '8px 12px', fontSize: 12, color: '#B91C1C',
                  }}>
                    {trolleyError}
                  </div>
                )}
                {trolleysLoading ? (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading active trolleys…</div>
                ) : activeTrolleys.length === 0 ? (
                  <div style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: 10,
                    padding: '14px 12px',
                    textAlign: 'center',
                  }}>
                    No active trolleys. Create one below, then ship.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                    {activeTrolleys.map((t) => (
                      <label
                        key={t.id}
                        className={`trolley-option${selectedTrolleyId === t.id ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="trolley"
                          checked={selectedTrolleyId === t.id}
                          onChange={() => setSelectedTrolleyId(t.id)}
                          disabled={shippingToTrolley}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.transitNumber}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {t._count?.transitProducts ?? 0} parts · started{' '}
                            {t.startedAt ? new Date(t.startedAt).toLocaleString() : '—'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input
                    className="form-input"
                    value={newTrolleyName}
                    onChange={(e) => setNewTrolleyName(e.target.value)}
                    placeholder="New trolley / vehicle #"
                    disabled={creatingTrolley || shippingToTrolley}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={creatingTrolley || shippingToTrolley}
                    onClick={handleCreateTrolley}
                    style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    {creatingTrolley ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
              <div style={{
                padding: '12px 20px 18px',
                display: 'flex', justifyContent: 'flex-end', gap: 8,
                borderTop: '1px solid #F3F4F6',
              }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={shippingToTrolley || creatingTrolley}
                  onClick={() => setTrolleyShip(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!selectedTrolleyId || shippingToTrolley || creatingTrolley}
                  onClick={confirmShipToTrolley}
                  style={{ background: 'var(--green-600)', color: '#fff', fontWeight: 700 }}
                >
                  {shippingToTrolley ? 'Shipping…' : 'Ship to trolley'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddItemModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !addingItem) {
                setShowAddItemModal(false);
              }
            }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
          >
            <div
              style={{
                background: '#FFFFFF', borderRadius: 16,
                boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
                width: '100%', maxWidth: 520,
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="manual-modal-header-icon">
                    <PenLine size={16} color="#fff" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Add manual item</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      No QR sticker — fill report fields, then ship into a trolley
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !addingItem && setShowAddItemModal(false)}
                  style={{ background: 'none', border: 'none', cursor: addingItem ? 'not-allowed' : 'pointer', color: '#9CA3AF', padding: 6 }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
                {addItemError && (
                  <div style={{
                    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
                    padding: '8px 12px', fontSize: 12, color: '#B91C1C',
                  }}>
                    {addItemError}
                  </div>
                )}

                <div className="manual-form-section">
                  <p className="manual-form-section-title">Identity</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label className="manual-field">
                      Piece #<span className="req">*</span>
                      <input
                        className="form-input"
                        value={addItemForm.pieceNumber}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, pieceNumber: e.target.value }))}
                        placeholder="e.g. M-101"
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Qty<span className="req">*</span>
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={100}
                        value={addItemForm.quantity}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, quantity: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                  </div>
                  <label className="manual-field">
                    Fitting / Item<span className="req">*</span>
                    <input
                      className="form-input"
                      value={addItemForm.fitting}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, fitting: e.target.value }))}
                      placeholder="e.g. Elbow, Straight"
                      disabled={addingItem}
                    />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label className="manual-field">
                      Item ID
                      <input
                        className="form-input"
                        type="number"
                        value={addItemForm.itemId}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, itemId: e.target.value }))}
                        placeholder="e.g. 12045"
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Item Tracking No.
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        value={addItemForm.itemTrackingNo}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, itemTrackingNo: e.target.value }))}
                        placeholder="e.g. 4592865"
                        disabled={addingItem}
                      />
                    </label>
                  </div>
                </div>

                <div className="manual-form-section">
                  <p className="manual-form-section-title">Specs</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label className="manual-field">
                      Metal
                      <input
                        className="form-input"
                        value={addItemForm.metal}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, metal: e.target.value }))}
                        placeholder="Thickness / type"
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Gauge
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={100}
                        value={addItemForm.gauge}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, gauge: e.target.value }))}
                        placeholder="e.g. 24"
                        disabled={addingItem}
                      />
                    </label>
                  </div>
                  <label className="manual-field">
                    Liner and Insulation
                    <input
                      className="form-input"
                      value={addItemForm.liner}
                      onChange={(e) => setAddItemForm((f) => ({ ...f, liner: e.target.value }))}
                      placeholder="Optional"
                      disabled={addingItem}
                    />
                  </label>
                  <label className="manual-field">
                    Dimensions / Information
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="form-input"
                        value={addItemForm.dimensions}
                        onChange={(e) => {
                          const next = e.target.value.replace(/(\d)\s*[xX*]\s*(?=\d)/g, '$1 × ');
                          setAddItemForm((f) => ({ ...f, dimensions: next }));
                        }}
                        placeholder="e.g. 600 × 400 × 500"
                        disabled={addingItem}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Insert ×"
                        disabled={addingItem}
                        onClick={() => {
                          setAddItemForm((f) => ({
                            ...f,
                            dimensions: f.dimensions.trim()
                              ? `${f.dimensions.trim()} × `
                              : '',
                          }));
                        }}
                        style={{
                          flexShrink: 0,
                          minWidth: 40,
                          fontWeight: 800,
                          fontSize: 16,
                          lineHeight: 1,
                          padding: '6px 10px',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <label className="manual-field">
                      Weight (kg)
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={addItemForm.weight}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, weight: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Area
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={addItemForm.area}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, area: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Length
                      <input
                        className="form-input"
                        value={addItemForm.length}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, length: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                  </div>
                </div>

                <div className="manual-form-section">
                  <p className="manual-form-section-title">Location / system</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label className="manual-field">
                      Drawing
                      <input
                        className="form-input"
                        value={addItemForm.drawing}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, drawing: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Floor
                      <input
                        className="form-input"
                        value={addItemForm.floor}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, floor: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      System
                      <input
                        className="form-input"
                        value={addItemForm.systemName}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, systemName: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                    <label className="manual-field">
                      Pressure
                      <input
                        className="form-input"
                        value={addItemForm.pressure}
                        onChange={(e) => setAddItemForm((f) => ({ ...f, pressure: e.target.value }))}
                        disabled={addingItem}
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div style={{
                padding: '12px 20px 18px',
                display: 'flex', justifyContent: 'flex-end', gap: 8,
                borderTop: '1px solid #F3F4F6',
              }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={addingItem}
                  onClick={() => setShowAddItemModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={addingItem}
                  onClick={handleCreateManualItem}
                  style={{ background: 'var(--green-600)', color: '#fff', fontWeight: 700 }}
                >
                  {addingItem ? 'Adding…' : 'Add item'}
                </button>
              </div>
            </div>
          </div>
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
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span className="chip" style={{ fontSize: 10 }}>Job ID: {job.sourceJobId}</span>
                          <span className="chip" style={{ fontSize: 10 }}>Upload v{job.importVersion}</span>
                          <span className="chip" style={{ fontSize: 10 }}>Download: {job.downloadId}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                        <span className={`badge badge-${job.status.toLowerCase()}`}>
                          {job.status === 'SHIPPED' ? 'Shipped' : 'Active'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Delete job"
                          style={{ color: 'var(--red-600)', padding: '4px 8px' }}
                          disabled={archivingJobId === job.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveJob(job.id, job.jobName);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
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
        <div className="topbar-search" style={{ flex: 'none' }}>
          <Search size={13} />
          <input
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            placeholder="Search projects…"
            style={{ width: 220 }}
          />
          {projectSearch ? (
            <button type="button" onClick={() => setProjectSearch('')} aria-label="Clear project search">
              <X size={13} />
            </button>
          ) : null}
        </div>
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
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--text-muted)' }}>
                    {projectSearch.trim()
                      ? `No projects match “${projectSearch.trim()}”`
                      : 'No projects found'}
                  </td>
                </tr>
              ) : null}
              {filteredProjects.map(proj => {
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
