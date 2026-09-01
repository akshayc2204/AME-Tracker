// Import page is currently disabled. Route/nav/buttons are commented out;
// jobs are ingested from the DataUploads folder sync instead.
import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import {
  Upload, FileText, CheckCircle, X, History, RefreshCw, FolderUp, FolderSync,
} from 'lucide-react';
import { api } from '../services/api';

interface ImportRecord {
  id: number;
  status: string;
  sourceType?: 'SYNC' | 'UPLOAD';
  sourceLabel?: string;
  jobName?: string | null;
  projectName?: string | null;
  jobCodeHint?: string | null;
  t4vjobFilename?: string | null;
  fabshopFilename?: string | null;
  jobReportFilename?: string | null;
  matchedRows?: number;
  totalFabshopRows?: number;
  createdAt?: string;
  completedAt?: string | null;
  createdBy?: { id: number; fullName: string } | null;
}

type FileSlot = 'vjob' | 'fabshop' | 'jobReport';

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
    imported: number;
    skipped: number;
    failed: number;
    incomplete: number;
    finishedAt: string;
  } | null;
  pairs: FolderPair[];
  error?: string;
};

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'COMPLETED' || s === 'SUCCESS') return 'badge-success';
  if (s === 'COMPLETED_WITH_ERRORS') return 'badge-partial';
  if (s === 'FAILED' || s === 'ERROR') return 'badge-failed';
  if (s === 'SYNCING' || s === 'VALIDATING' || s === 'PROCESSING') return 'badge-loaded';
  return 'badge-pending';
}

function folderBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'SYNCED') return 'badge-success';
  if (s === 'SKIPPED') return 'badge-partial';
  if (s === 'FAILED' || s === 'ERROR') return 'badge-failed';
  if (s === 'INCOMPLETE') return 'badge-loaded';
  return 'badge-pending';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function jobKeyFromFilename(name: string): string {
  const match = name.match(/P\d+/i);
  return match ? match[0].toUpperCase() : `file:${name}`;
}

interface JobGroup {
  key: string;
  vjob?: File;
  fabshop?: File;
  jobReport?: File;
}

function groupFilesForJobs(vjobs: File[], fabshops: File[], reports: File[]): JobGroup[] {
  const groups = new Map<string, JobGroup>();

  function add(file: File, slot: FileSlot) {
    let key = jobKeyFromFilename(file.name);
    let existing = groups.get(key);
    if (existing?.[slot]) {
      key = `${key}::${file.name}`;
      existing = groups.get(key);
    }
    const group = existing ?? { key };
    group[slot] = file;
    groups.set(key, group);
  }

  vjobs.forEach((f) => add(f, 'vjob'));
  fabshops.forEach((f) => add(f, 'fabshop'));
  reports.forEach((f) => add(f, 'jobReport'));
  return Array.from(groups.values());
}

export default function Import() {
  const [vjobFiles, setVjobFiles] = useState<File[]>([]);
  const [fabshopFiles, setFabshopFiles] = useState<File[]>([]);
  const [jobReportFiles, setJobReportFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState<FileSlot | null>(null);
  const [importing, setImporting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [folderStatus, setFolderStatus] = useState<FolderSyncStatus | null>(null);
  const [folderLoading, setFolderLoading] = useState(true);
  const [folderSyncing, setFolderSyncing] = useState(false);
  const vjobRef = useRef<HTMLInputElement>(null);
  const fabshopRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLInputElement>(null);

  const totalFiles = vjobFiles.length + fabshopFiles.length + jobReportFiles.length;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getImports('upload');
      if (Array.isArray(res)) setHistory(res);
    } catch {
      /* keep previous history */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadFolderStatus = useCallback(async () => {
    setFolderLoading(true);
    try {
      const res = await api.getFolderSyncStatus();
      if (res) setFolderStatus(res);
    } catch {
      /* keep previous */
    } finally {
      setFolderLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadFolderStatus();
  }, [loadHistory, loadFolderStatus]);

  const appendFiles = useCallback((slot: FileSlot, incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (!list.length) return;
    const setter = slot === 'vjob' ? setVjobFiles : slot === 'fabshop' ? setFabshopFiles : setJobReportFiles;
    setter((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...list.filter((f) => !names.has(f.name))];
    });
  }, []);

  const removeFile = useCallback((slot: FileSlot, name: string) => {
    const setter = slot === 'vjob' ? setVjobFiles : slot === 'fabshop' ? setFabshopFiles : setJobReportFiles;
    setter((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const handleFileDrop = useCallback((slot: FileSlot, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    appendFiles(slot, e.dataTransfer.files);
  }, [appendFiles]);

  async function handleImport() {
    if (totalFiles === 0) {
      setParseError('Select at least one file (.t4vjob, Fab Shop .xlsx, or Job Report .xlsx).');
      return;
    }

    setImporting(true);
    setParseError(null);
    setSuccessMessage(null);

    const groups = groupFilesForJobs(vjobFiles, fabshopFiles, jobReportFiles);
    const errors: string[] = [];
    let okCount = 0;

    try {
      for (const group of groups) {
        const label = group.vjob?.name || group.jobReport?.name || group.fabshop?.name || group.key;
        try {
          const batch = await api.uploadImport({
            vjob: group.vjob,
            fabshop: group.fabshop,
            jobReport: group.jobReport,
          });
          if (batch?.id) {
            await api.executeImport(batch.id);
          }
          okCount += 1;
        } catch (err: any) {
          errors.push(`${label}: ${err?.message || 'Import failed'}`);
        }
      }

      await loadHistory();
      await loadFolderStatus();
      if (okCount > 0) {
        setSuccessMessage(
          okCount === 1
            ? '1 job imported.'
            : `${okCount} jobs imported.`,
        );
        setVjobFiles([]);
        setFabshopFiles([]);
        setJobReportFiles([]);
      }
      if (errors.length) setParseError(errors.join('\n'));
    } finally {
      setImporting(false);
    }
  }

  async function handleFolderSync() {
    setFolderSyncing(true);
    setParseError(null);
    setSuccessMessage(null);
    try {
      const result = await api.runFolderSync();
      await loadFolderStatus();
      await loadHistory();
      setSuccessMessage(
        `Folder sync finished: ${result.imported} imported, ${result.skipped} already in database, ${result.failed} failed, ${result.incomplete} incomplete pairs.`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Folder sync failed';
      setParseError(message);
    } finally {
      setFolderSyncing(false);
    }
  }

  function FileZone({
    slot,
    title,
    hint,
    accept,
    files,
    inputRef,
  }: {
    slot: FileSlot;
    title: string;
    hint: string;
    accept: string;
    files: File[];
    inputRef: RefObject<HTMLInputElement | null>;
  }) {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
          {title}
        </div>
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {files.map((file) => (
              <div
                key={file.name}
                style={{
                  border: '1px solid var(--green-300)', borderRadius: 10, padding: '10px 12px',
                  background: 'var(--green-50)', display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <FileText size={16} color="var(--green-600)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </div>
                </div>
                <button type="button" onClick={() => removeFile(slot, file.name)} aria-label="Remove file">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          className={'drop-zone' + (dragOver === slot ? ' drag-over' : '')}
          style={{ minHeight: 110, padding: 16 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(slot); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => handleFileDrop(slot, e)}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={22} />
          <h3 style={{ fontSize: 13, margin: '8px 0 4px' }}>{hint}</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Multiple files allowed</p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) appendFiles(slot, e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>Import files</h2>
        <p>Auto-sync paired .t4vjob + item schedule .xlsx from DataUploads, or upload files manually.</p>
      </div>

      {parseError && (
        <div style={{ padding: '12px 16px', background: 'var(--red-50)', border: '1px solid var(--red-200)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--red-700)', whiteSpace: 'pre-wrap' }}>
          {parseError}
        </div>
      )}

      {successMessage && (
        <div style={{ padding: '12px 16px', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--green-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} />
          {successMessage}
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderSync size={18} color="var(--green-600)" />
              Folder auto-sync
            </div>
            <div className="card-subtitle">
              Watches {folderStatus?.folderPath || '/Users/mangeshkharat/DataUploads'} every {folderStatus?.intervalMinutes ?? 5} minutes.
              Pairs <code>.t4vjob</code> + item schedule <code>.xlsx</code> with the same name (e.g. 637) into the item schedule table. Already-imported jobs are skipped.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={loadFolderStatus} disabled={folderLoading || folderSyncing}>
              <RefreshCw size={14} className={folderLoading ? 'animate-spin' : undefined} />
              Refresh
            </button>
            <button
              className="btn btn-primary"
              disabled={folderSyncing || folderStatus?.enabled === false}
              onClick={handleFolderSync}
            >
              <FolderSync size={16} />
              {folderSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Pair</th>
                <th>Job</th>
                <th>Files</th>
                <th>Rows / pieces</th>
                <th>Status</th>
                <th>Last check</th>
              </tr>
            </thead>
            <tbody>
              {folderLoading && !folderStatus ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                    Checking DataUploads…
                  </td>
                </tr>
              ) : (folderStatus?.pairs.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                    {folderStatus?.error
                      ? folderStatus.error
                      : 'No .t4vjob / .xlsx pairs in the watch folder yet.'}
                  </td>
                </tr>
              ) : (
                folderStatus!.pairs.map((pair) => (
                  <tr key={pair.pairKey}>
                    <td style={{ fontWeight: 600 }}>{pair.pairKey}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{pair.jobName || (pair.sourceJobId ? `Job ${pair.sourceJobId}` : '—')}</div>
                      {pair.sourceJobId && pair.jobName && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pair.sourceJobId}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {[pair.t4vjobFile, pair.xlsxFile].filter(Boolean).join(' + ') || '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {pair.itemsImported || pair.unitsImported
                        ? `${pair.itemsImported} / ${pair.unitsImported}`
                        : '—'}
                    </td>
                    <td>
                      <span className={'badge ' + folderBadgeClass(pair.status)}>{pair.status}</span>
                      {pair.message && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, maxWidth: 280 }}>
                          {pair.message}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDateTime(pair.lastSyncedAt || folderStatus?.lastRun?.finishedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Upload files</div>
            <div className="card-subtitle">
              Three types — select several of one type to import multiple jobs. Matching P-codes (e.g. P47184) are grouped.
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={importing || totalFiles === 0}
            onClick={handleImport}
          >
            <Upload size={16} />
            {importing
              ? 'Importing…'
              : totalFiles === 0
                ? 'Import'
                : `Import ${groupFilesForJobs(vjobFiles, fabshopFiles, jobReportFiles).length} job${groupFilesForJobs(vjobFiles, fabshopFiles, jobReportFiles).length === 1 ? '' : 's'}`}
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            <FileZone
              slot="vjob"
              title="Vulcan job (.t4vjob)"
              hint="Drop .t4vjob files"
              accept=".t4vjob"
              files={vjobFiles}
              inputRef={vjobRef}
            />
            <FileZone
              slot="fabshop"
              title="Fab Shop QR (.xlsx)"
              hint="Drop QR / label .xlsx"
              accept=".xlsx,.xls"
              files={fabshopFiles}
              inputRef={fabshopRef}
            />
            <FileZone
              slot="jobReport"
              title="Job report (.xlsx)"
              hint="Drop item schedule .xlsx"
              accept=".xlsx,.xls"
              files={jobReportFiles}
              inputRef={reportRef}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={18} color="var(--green-600)" />
              Upload history
            </div>
            <div className="card-subtitle">File imports only — Trimble syncs are not listed here</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadHistory} disabled={historyLoading}>
            <RefreshCw size={14} className={historyLoading ? 'animate-spin' : undefined} />
            Refresh
          </button>
        </div>
        <div className="table-wrapper import-history-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Job / Project</th>
                <th>Source</th>
                <th>Pieces</th>
                <th>Status</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                    Loading history…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                    No file uploads yet.
                  </td>
                </tr>
              ) : (
                history.map((imp) => {
                  const source = imp.sourceLabel
                    || [imp.t4vjobFilename, imp.fabshopFilename, imp.jobReportFilename].filter(Boolean).join(' + ')
                    || '—';
                  const jobLine = imp.jobName || (imp.jobCodeHint ? `Job ${imp.jobCodeHint}` : '—');
                  const pieces = imp.matchedRows ?? imp.totalFabshopRows ?? 0;

                  return (
                    <tr key={imp.id} style={{ cursor: 'default' }}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDateTime(imp.completedAt || imp.createdAt)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FolderUp size={14} color="var(--green-600)" />
                          {jobLine}
                        </div>
                        {imp.projectName && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{imp.projectName}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {source}
                      </td>
                      <td style={{ fontWeight: 600 }}>{pieces > 0 ? pieces : '—'}</td>
                      <td>
                        <span className={'badge ' + statusBadgeClass(imp.status)}>{formatStatus(imp.status)}</span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {imp.createdBy?.fullName || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
