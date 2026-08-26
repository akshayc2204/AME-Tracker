import { X, Package, ChevronRight, Smartphone, Monitor } from 'lucide-react';
import type { Part, TrackingStatus } from '../data/mockData';

interface Props {
  part: Part;
  onClose: () => void;
  projectName?: string;
  jobName?: string;
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

export default function PartDrawer({ part, onClose, projectName, jobName }: Props) {
  const allEvents = part.trackingRecords.flatMap(tr => tr.events || [])
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
            <div className="drawer-title">Piece #{part.pieceNbr} — {part.fitting}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {projectName || 'AME Project'} / {jobName || `Job #${part.jobId}`}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="drawer-body">
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span>{projectName || 'AME Project'}</span><ChevronRight size={12} />
            <span>{jobName || `Job #${part.jobId}`}</span>
          </div>

          {/* Manufacturing Details */}
          <div className="card">
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <div className="card-title" style={{ fontSize: 12 }}>Manufacturing Data</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { l: 'Piece #', v: `#${part.pieceNbr}` },
                { l: 'Item ID', v: part.itemId || '—' },
                { l: 'Fitting', v: part.fitting },
                { l: 'Description', v: part.description || '—' },
                { l: 'Dimensions', v: part.information || '—' },
                { l: 'Weight (kg)', v: part.weight ? `${part.weight} kg` : '—' },
                { l: 'Track Event', v: part.trackEvent || part.scanEvent || '—' },
                { l: 'Shipped Timestamp', v: part.shippedAt ? formatTs(part.shippedAt) : '—' },
              ].map(s => (
                <div key={s.l} style={{ background: 'var(--slate-50)', padding: '8px 12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{s.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.v}</div>
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
              {part.trackingRecords.map(tr => (
                <div key={tr.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="td-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>
                        {tr.qrCode}
                      </span>
                    </div>
                    <StatusBadge status={tr.status} />
                  </div>
                  {tr.itemTracking && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      UUID: <span className="td-mono" style={{ fontSize: 10, color: 'var(--purple-700)' }}>{tr.itemTracking}</span>
                    </div>
                  )}
                </div>
              ))}
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
