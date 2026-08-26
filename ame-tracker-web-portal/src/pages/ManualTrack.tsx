import { useState } from 'react';
import { Search, CheckCircle, Monitor, Barcode, Package, Clock, Copy, Check } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api, resolveTrackEvent, markItemAsPortalScanned } from '../services/api';
import type { TrackingStatus } from '../data/mockData';

export default function ManualTrack() {
  const { currentUser } = useApp();
  const [query, setQuery] = useState('');
  const [foundPart, setFoundPart] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function copyToClipboard(text: string, field: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function handleSearch(customQuery?: string) {
    const q = (customQuery ?? query).trim().replace(/^#/, '');
    if (!q) return;
    setNotFound(false);
    setFoundPart(null);
    setSuccessMessage(null);
    setErrorMessage(null);
    setLoading(true);

    try {
      const res: any = await api.getProducts({ search: q, pageSize: 10 });
      if (res?.items && res.items.length > 0) {
        // Prioritize exact match on itemTracking or qrCode
        const exact: any = res.items.find((it: any) => 
          (it.itemTracking && String(it.itemTracking).toLowerCase() === q.toLowerCase()) ||
          (it.qrCodeStr && String(it.qrCodeStr).toLowerCase() === q.toLowerCase()) ||
          (it.qrCode?.code && String(it.qrCode.code).toLowerCase() === q.toLowerCase()) ||
          (String(it.pieceNo) === q)
        ) || res.items[0];

        const trEvents = exact.trackingRecords?.[0]?.events || exact.trackingEvents || [];
        const latestEvent = exact.lastEvent || trEvents[0];
        const eventTs = latestEvent?.timestamp || latestEvent?.createdAt;
        const shippedAtVal = exact.shippedAt || eventTs || (exact.currentStatus === 'SHIPPED' ? exact.updatedAt : null);
        const trackEventVal = resolveTrackEvent(exact, latestEvent);

        const partObj = {
          id: String(exact.id),
          pieceNbr: exact.pieceNo ?? exact.pieceNumber,
          fitting: exact.fitting || 'Standard Duct',
          itemId: exact.itemId || '—',
          itemTracking: exact.itemTracking || '—',
          qrCode: exact.qrCode?.code || exact.qrCodeStr || '—',
          description: exact.description || 'Standard Specification',
          information: exact.description || exact.location || '—',
          sourceFlag: Boolean(exact.sourceFlag),
          status: (exact.currentStatus || exact.status || 'PENDING') as TrackingStatus,
          shippedAt: shippedAtVal || null,
          trackEvent: trackEventVal,
          jobName: exact.job?.name || (exact.job?.code ? `Job #${exact.job.code}` : 'General Job'),
          jobCode: exact.job?.code || '—',
          projectName: exact.job?.project?.name || exact.job?.project?.projectName || exact.job?.project?.code || 'AME Project',
        };

        setFoundPart(partObj);
        return;
      }
      setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAsShipped() {
    if (!foundPart) return;
    setSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      markItemAsPortalScanned(foundPart.id);
      markItemAsPortalScanned(foundPart.pieceNbr);
      markItemAsPortalScanned(foundPart.itemTracking);
      markItemAsPortalScanned(foundPart.qrCode);

      const updated = await api.updateProductStatus(foundPart.id, {
        status: 'SHIPPED',
        qrCode: foundPart.qrCode,
        vehicleNumber: vehicleNumber.trim() || 'Portal Direct',
        reason: notes.trim() || 'Marked as shipped from manual tracking portal',
      });

      const shippedTimestamp = updated?.shippedAt || new Date().toISOString();
      const updatedPart = {
        ...foundPart,
        status: 'SHIPPED' as TrackingStatus,
        shippedAt: shippedTimestamp,
        trackEvent: 'Portal scan' as const,
      };

      setFoundPart(updatedPart);
      setSuccessMessage(`Part #${foundPart.pieceNbr} successfully marked as SHIPPED!`);
      setVehicleNumber('');
      setNotes('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update part status. Please ensure server is running.');
    } finally {
      setSubmitting(false);
    }
  }

  const isShipped = foundPart?.status === 'SHIPPED';
  const shippedFormatted = foundPart?.shippedAt
    ? new Date(foundPart.shippedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <>
      <div className="page-header">
        <h2>Manual Tracking</h2>
        <p>Search parts by ItemTracking Number or QR Code to verify status and record shipments</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 24 }}>
        {/* Left Column: Search & Tracking Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Search Card */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Barcode size={18} color="var(--green-600)" /> Search by ItemTracking or QR Code
              </div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">
                  ItemTracking / QR Code / Piece #<span>*</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Enter ItemTracking (e.g. 3ebb03f7-...) or QR Code..."
                    autoFocus
                  />
                  <button className="btn btn-primary" onClick={() => handleSearch()} disabled={loading || !query.trim()}>
                    <Search size={14} /> {loading ? 'Locating…' : 'Locate'}
                  </button>
                </div>
                <div className="form-hint" style={{ marginTop: 6, fontSize: 11 }}>
                  Accepts Vulcan ItemTracking UUIDs, FabShop QR Codes, or Piece Numbers.
                </div>
              </div>

              {notFound && (
                <div style={{ padding: '12px 16px', background: 'var(--red-50)', borderRadius: 8, border: '1px solid var(--red-200)', marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red-700)' }}>
                    ⚠️ Part Not Found
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--red-600)', marginTop: 3 }}>
                    "{query}" did not match any registered ItemTracking or QR Code in the database.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tracking Action Card */}
          {foundPart && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title">Tracking Status &amp; Action</div>
                <span className={`badge ${isShipped ? 'badge-shipped' : 'badge-pending'}`} style={{ fontSize: 12, padding: '4px 10px' }}>
                  {foundPart.status}
                </span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {successMessage && (
                  <div style={{ padding: '12px 16px', background: 'var(--green-50)', borderRadius: 8, border: '1px solid var(--green-200)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle size={20} color="var(--green-600)" style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-800)' }}>
                      {successMessage}
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div style={{ padding: '12px 16px', background: 'var(--red-50)', borderRadius: 8, border: '1px solid var(--red-200)', color: 'var(--red-700)', fontSize: 13, fontWeight: 600 }}>
                    ⚠️ {errorMessage}
                  </div>
                )}

                {isShipped ? (
                  <div style={{ background: 'var(--green-50)', borderRadius: 10, padding: '20px', border: '1px solid var(--green-200)', textAlign: 'center' }}>
                    <CheckCircle size={40} color="var(--green-600)" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-800)' }}>
                      Part is Shipped
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--green-700)', marginTop: 4 }}>
                      This piece is already recorded as shipped in the system.
                    </div>
                    {shippedFormatted && (
                      <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '6px 14px', borderRadius: 20, border: '1px solid var(--green-300)', fontSize: 12, fontWeight: 600, color: 'var(--green-800)' }}>
                        <Clock size={13} /> Shipped on: {shippedFormatted}
                      </div>
                    )}
                    {foundPart.trackEvent && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green-700)' }}>
                        Track Event: <strong>{foundPart.trackEvent}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ padding: '12px 16px', background: 'var(--amber-50)', borderRadius: 8, border: '1px solid var(--amber-200)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Clock size={18} color="var(--amber-600)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-800)' }}>
                          Status: Pending Shipment
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--amber-700)', marginTop: 2 }}>
                          This part is ready for shipping. Click below to mark it as Shipped.
                        </div>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Vehicle Number / Carrier (Optional)</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="form-input"
                          value={vehicleNumber}
                          onChange={e => setVehicleNumber(e.target.value)}
                          placeholder="e.g. Portal Direct, TRK-1001"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Notes / Reason (Optional)</label>
                      <textarea
                        className="form-textarea"
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Optional tracking comments or audit notes..."
                      />
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 8, border: '1px solid var(--border)' }}>
                      <Monitor size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Action will be recorded as <strong>Portal scan</strong> by <strong>{currentUser.name}</strong>.
                      </span>
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{ padding: '12px 20px', fontSize: 14, fontWeight: 700, justifyContent: 'center', gap: 8 }}
                      onClick={handleMarkAsShipped}
                      disabled={submitting}
                    >
                      <CheckCircle size={16} />
                      {submitting ? 'Updating Status…' : 'Mark as Shipped'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Full Detail of Part */}
        <div>
          {foundPart ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Package size={18} color="var(--green-600)" /> Part Full Details
                  </div>
                  <span className="badge badge-active" style={{ fontSize: 11 }}>
                    #{foundPart.pieceNbr}
                  </span>
                </div>
                <div className="card-body">
                  {/* Primary Identifiers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
                    {/* ItemTracking */}
                    <div style={{ background: 'var(--purple-50)', border: '1px solid var(--purple-200)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple-800)', textTransform: 'uppercase' }}>
                          ItemTracking Number (Vulcan)
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--purple-700)' }}
                          onClick={() => copyToClipboard(foundPart.itemTracking, 'itemTracking')}
                          title="Copy ItemTracking"
                        >
                          {copiedField === 'itemTracking' ? <Check size={12} color="var(--green-600)" /> : <Copy size={12} />}
                          {copiedField === 'itemTracking' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple-900)', wordBreak: 'break-all' }}>
                        {foundPart.itemTracking}
                      </code>
                    </div>

                    {/* QR Code */}
                    <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-800)', textTransform: 'uppercase' }}>
                          QR Code (Fab Shop)
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--green-700)' }}
                          onClick={() => copyToClipboard(foundPart.qrCode, 'qrCode')}
                          title="Copy QR Code"
                        >
                          {copiedField === 'qrCode' ? <Check size={12} color="var(--green-600)" /> : <Copy size={12} />}
                          {copiedField === 'qrCode' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-900)', wordBreak: 'break-all' }}>
                        {foundPart.qrCode}
                      </code>
                    </div>
                  </div>

                  {/* Specification Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Piece #</div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>#{foundPart.pieceNbr}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Item ID</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }} className="td-mono">{foundPart.itemId}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Fitting Type</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{foundPart.fitting}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Boolean Flag</div>
                      <span className={`chip ${foundPart.sourceFlag ? 'green' : 'slate'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                        {foundPart.sourceFlag ? 'TRUE' : 'FALSE'}
                      </span>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Project</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{foundPart.projectName}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Job</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{foundPart.jobName}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)', gridColumn: 'span 2' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Description / Dimensions</div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{foundPart.description}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Track Event</div>
                      <div>
                        {foundPart.trackEvent === 'Mobile scan' && (
                          <span className="badge badge-active" style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>
                            Mobile scan
                          </span>
                        )}
                        {foundPart.trackEvent === 'Portal scan' && (
                          <span className="badge badge-pending" style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', background: 'var(--blue-50)', color: 'var(--blue-700)', borderColor: 'var(--blue-200)' }}>
                            Portal scan
                          </span>
                        )}
                        {!foundPart.trackEvent && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'var(--slate-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Shipped Timestamp</div>
                      <div className="td-mono" style={{ fontSize: 12, fontWeight: 600, color: foundPart.shippedAt ? 'var(--green-700)' : 'var(--text-muted)' }}>
                        {shippedFormatted || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Barcode size={48} style={{ margin: '0 auto 16px', opacity: 0.25 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>Ready to Track</div>
              <div style={{ fontSize: 13, marginTop: 6, maxWidth: 360, margin: '6px auto 0' }}>
                Enter an <strong>ItemTracking number</strong> or <strong>QR code</strong> on the left to view full part specifications and manage shipment status.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
