import { useEffect, useState } from 'react';
import { X, Package, ChevronRight, Smartphone, Monitor } from 'lucide-react';
import type { Part, TrackingRecord, TrackingStatus } from '../data/mockData';
import { api } from '../services/api';
import { useApp } from '../store/AppContext';
import { isStatusChangeLocked, statusLockMessage } from '../utils/statusLock';

interface Props {
  part: Part;
  onClose: () => void;
  projectName?: string;
  jobName?: string;
  onRefresh?: () => Promise<void>;
}

function StatusBadge({ status }: { status: TrackingStatus }) {
  const cls = status === 'PENDING' ? 'badge-pending'
    : status === 'SHIPPED' ? 'badge-shipped'
    : 'badge-cancelled';
  return <span className={`badge ${cls}`}><span className="badge-dot" />{status}</span>;
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusSelectValue(status: string): 'PENDING' | 'SHIPPED' {
  return String(status || 'PENDING').toUpperCase() === 'SHIPPED' ? 'SHIPPED' : 'PENDING';
}

function parseTrackingUnitId(trId: string): number | null {
  const m = String(trId).match(/^tr-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function rollupPartStatus(records: TrackingRecord[]): TrackingStatus {
  const statuses = records.map((r) => String(r.status || 'PENDING').toUpperCase());
  if (!statuses.length) return 'PENDING';
  const unique = [...new Set(statuses)];
  if (unique.length === 1) return unique[0] as TrackingStatus;
  if (statuses.some((s) => s === 'SHIPPED') && statuses.some((s) => s === 'PENDING')) {
    return 'PARTIAL';
  }
  return unique.includes('SHIPPED') ? 'SHIPPED' : (unique[0] as TrackingStatus);
}

function AdminStatusSelect({
  status,
  disabled,
  locked,
  onSelect,
}: {
  status: string;
  disabled?: boolean;
  locked?: boolean;
  onSelect: (status: string) => void;
}) {
  const isShipped = statusSelectValue(status) === 'SHIPPED';
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
      onChange={(e) => {
        if (e.target.value === 'PENDING') onSelect('PENDING');
      }}
      style={{ fontSize: 11, padding: '2px 6px', minWidth: 88, fontWeight: 700 }}
    >
      <option value="SHIPPED">Shipped</option>
      <option value="PENDING">Active</option>
    </select>
  );
}

export default function PartDrawer({ part, onClose, projectName, jobName, onRefresh }: Props) {
  const { currentUser } = useApp();
  const isAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';
  const [localPart, setLocalPart] = useState(part);
  const [statusUpdatingUnitId, setStatusUpdatingUnitId] = useState<number | null>(null);

  useEffect(() => {
    setLocalPart(part);
  }, [part]);

  async function handleTrackingStatusChange(tr: TrackingRecord, newStatus: string) {
    const unitId = parseTrackingUnitId(tr.id);
    if (!unitId) return;
    setStatusUpdatingUnitId(unitId);
    try {
      await api.updateProductStatus(unitId, {
        status: newStatus,
        source: 'Projects',
        reason: `Status set to ${newStatus} from projects (part drawer)`,
      });
      setLocalPart((prev) => {
        const trackingRecords = prev.trackingRecords.map((record) =>
          record.id === tr.id ? { ...record, status: newStatus as TrackingStatus } : record,
        );
        return {
          ...prev,
          trackingRecords,
          status: rollupPartStatus(trackingRecords),
        };
      });
      await onRefresh?.();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Could not update item status');
    } finally {
      setStatusUpdatingUnitId(null);
    }
  }

  const allEvents = localPart.trackingRecords.flatMap(tr => tr.events || [])
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        {/* Header */}
        <div className="drawer-header">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={18} color="var(--green-600)" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="drawer-title">{String(localPart.schedule?.Item || localPart.fitting)} — #{String(localPart.pieceNbr)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {projectName || 'AME Project'} / {jobName || `Job #${localPart.jobId}`}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="drawer-body">
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span>{projectName || 'AME Project'}</span><ChevronRight size={12} />
            <span>{jobName || `Job #${localPart.jobId}`}</span>
          </div>

          {/* Manufacturing Details */}
          <div className="card">
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <div className="card-title" style={{ fontSize: 12 }}>Item</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(localPart.schedule
                ? [
                    { l: 'Item', v: String(localPart.schedule.Item ?? localPart.fitting) },
                    { l: 'PieceNbr', v: String(localPart.pieceNbr) },
                    { l: 'Metal', v: String(localPart.schedule.Metal ?? '—') },
                    { l: 'Liner and Insulation', v: String(localPart.schedule['Liner and Insulation'] ?? '—') },
                    { l: 'Qty', v: String(localPart.schedule.Qty ?? '—') },
                    { l: 'Information', v: String(localPart.schedule.Information ?? localPart.information ?? '—') },
                    { l: 'Area', v: String(localPart.schedule.Area ?? localPart.area ?? '—') },
                    { l: 'Weight', v: String(localPart.schedule.Weight ?? localPart.weight ?? '—') },
                    { l: 'Alpha number', v: String(localPart.schedule['Alpha number'] ?? localPart.schedule['Alpha #'] ?? '—') },
                    { l: 'Pressure', v: String(localPart.schedule.Pressure ?? '—') },
                    { l: 'Length', v: String(localPart.schedule.Length ?? '—') },
                    { l: 'Instructions', v: String(localPart.schedule.Instructions ?? '—') },
                    { l: 'Joint 1', v: String(localPart.schedule['Joint 1'] ?? '—') },
                    { l: 'Joint 2', v: String(localPart.schedule['Joint 2'] ?? '—') },
                    { l: 'Seam', v: String(localPart.schedule.Seam ?? '—') },
                    { l: 'Holes', v: String(localPart.schedule.Holes ?? '—') },
                  ]
                : [
                    { l: 'Piece #', v: `#${localPart.pieceNbr}` },
                    { l: 'Item ID', v: localPart.itemId || '—' },
                    { l: 'Fitting', v: localPart.fitting },
                    { l: 'Description', v: localPart.description || '—' },
                    { l: 'Dimensions', v: localPart.information || '—' },
                    { l: 'Weight (kg)', v: localPart.weight ? `${localPart.weight} kg` : '—' },
                    { l: 'Track Event', v: localPart.trackEvent || localPart.scanEvent || '—' },
                    { l: 'Shipped Timestamp', v: localPart.shippedAt ? formatTs(localPart.shippedAt) : '—' },
                  ]
              ).map(s => (
                <div key={s.l} style={{ background: 'var(--slate-50)', padding: '8px 12px', borderRadius: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{s.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tracking Records */}
          <div className="card">
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <div className="card-title" style={{ fontSize: 12 }}>Registered Barcodes &amp; Tracking Identifiers</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {localPart.trackingRecords.map(tr => {
                const unitId = parseTrackingUnitId(tr.id);
                return (
                <div key={tr.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="td-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>
                        {tr.qrCode}
                      </span>
                    </div>
                    {isAdmin && unitId ? (
                      <AdminStatusSelect
                        status={tr.status}
                        disabled={statusUpdatingUnitId === unitId}
                        locked={isStatusChangeLocked(tr.shippedAt || tr.trackingDateTime)}
                        onSelect={(newStatus) => handleTrackingStatusChange(tr, newStatus)}
                      />
                    ) : (
                      <StatusBadge status={tr.status} />
                    )}
                  </div>
                  {tr.itemTracking && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      UUID: <span className="td-mono" style={{ fontSize: 10, color: 'var(--purple-700)', overflowWrap: 'anywhere' }}>{tr.itemTracking}</span>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Events */}
          <div className="card">
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <div className="card-title" style={{ fontSize: 12 }}>Scan Event History ({allEvents.length})</div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {allEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                  No scan events recorded yet for this piece.
                </div>
              ) : (
                <div className="timeline">
                  {allEvents.map(ev => (
                    <div key={ev.id} className="timeline-item">
                      <div className="timeline-dot" style={{ background: ev.newStatus === 'SHIPPED' ? 'var(--green-500)' : 'var(--purple-500)' }} />
                      <div className="timeline-content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: 12 }}>
                            {ev.oldStatus ? `${ev.oldStatus} → ` : ''}
                            <span style={{ color: ev.newStatus === 'SHIPPED' ? 'var(--green-700)' : 'var(--purple-700)' }}>
                              {ev.newStatus}
                            </span>
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTs(ev.timestamp)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {ev.eventSource === 'MOBILE_SCAN' ? <Smartphone size={11} /> : <Monitor size={11} />}
                          <span>{ev.userName || 'Operator'} · {ev.eventSource}</span>
                        </div>
                        {ev.vehicleNumber && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Vehicle: <strong>{ev.vehicleNumber}</strong>
                          </div>
                        )}
                        {ev.reason && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                            Note: {ev.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
