import { api } from '../services/api';

export interface LocalFolderPair {
  pairKey: string;
  t4vjobFile: File | null;
  xlsxFile: File | null;
  sourceJobId: string | null;
  jobName: string | null;
  status: 'PENDING' | 'SYNCED' | 'SKIPPED' | 'FAILED' | 'INCOMPLETE';
  itemsImported: number;
  unitsImported: number;
  message: string | null;
  lastSyncedAt: string | null;
}

export interface FolderUploadProgress {
  currentIndex: number;
  total: number;
  percent: number;
  currentPairKey: string;
  phase: 'scanning' | 'checking' | 'uploading' | 'done' | 'error';
  folderName: string;
  pairs: LocalFolderPair[];
  imported: number;
  skipped: number;
  failed: number;
  incomplete: number;
  message?: string;
}

export interface FolderUploadResult {
  folderName: string;
  totalPairs: number;
  imported: number;
  skipped: number;
  failed: number;
  incomplete: number;
  pairs: LocalFolderPair[];
}

/**
 * Lightweight Job ID / Job Name peek from .t4vjob header (before Start Items).
 */
export function peekSourceJobId(text: string): string | null {
  const header = text.split(/Start Items/i)[0] || '';
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const re = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*([^,\\r\\n]+)`, 'im');
      const m = header.match(re);
      if (m && m[1] && m[1].trim() && m[1].trim() !== 'None') {
        return m[1].trim();
      }
    }
    return '';
  };
  const jobId = pick('Job ID', 'JobID', 'IDJob', 'IdJob');
  const jobName = pick('Job Name', 'JobName', 'Job');
  if (jobId) return jobId;
  const code = /^(P\d+)/i.exec(jobName.trim());
  return code ? code[1].toUpperCase() : jobName || null;
}

/**
 * Computes SHA-256 hash using the browser's native Web Crypto API.
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Groups raw files into .t4vjob + .xlsx pairs by matching base names.
 */
export function groupFilesIntoPairs(files: File[]): LocalFolderPair[] {
  const map = new Map<string, { t4vjob: File | null; xlsx: File | null }>();

  for (const file of files) {
    const name = file.name;
    const lower = name.toLowerCase();

    // Skip temp/hidden files
    if (name.startsWith('~$') || name.startsWith('.')) continue;

    if (lower.endsWith('.t4vjob')) {
      const key = name.slice(0, -7).trim();
      const existing = map.get(key) || { t4vjob: null, xlsx: null };
      existing.t4vjob = file;
      map.set(key, existing);
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const ext = lower.endsWith('.xlsx') ? 5 : 4;
      const key = name.slice(0, -ext).trim();
      const existing = map.get(key) || { t4vjob: null, xlsx: null };
      existing.xlsx = file;
      map.set(key, existing);
    }
  }

  const pairs: LocalFolderPair[] = [];
  for (const [pairKey, filesObj] of map.entries()) {
    const isComplete = Boolean(filesObj.t4vjob && filesObj.xlsx);
    pairs.push({
      pairKey,
      t4vjobFile: filesObj.t4vjob,
      xlsxFile: filesObj.xlsx,
      sourceJobId: null,
      jobName: null,
      status: isComplete ? 'PENDING' : 'INCOMPLETE',
      itemsImported: 0,
      unitsImported: 0,
      message: isComplete
        ? 'Ready to upload'
        : `Missing ${!filesObj.t4vjob ? '.t4vjob' : '.xlsx'} file`,
      lastSyncedAt: null,
    });
  }

  // Natural alphabetical sort
  pairs.sort((a, b) => a.pairKey.localeCompare(b.pairKey, undefined, { numeric: true }));

  return pairs;
}

/**
 * Recursively scans directory handle to collect all files.
 */
async function scanDirHandle(dirHandle: any): Promise<File[]> {
  const files: File[] = [];
  async function scan(handle: any, depth = 0) {
    if (depth > 6) return;
    try {
      for await (const entry of handle.values()) {
        if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue;
        if (entry.kind === 'file') {
          try {
            const f = await entry.getFile();
            files.push(f);
          } catch {}
        } else if (entry.kind === 'directory') {
          await scan(entry, depth + 1);
        }
      }
    } catch {}
  }
  await scan(dirHandle);
  return files;
}

/**
 * Prompts user to select a folder from their local computer.
 * Uses window.showDirectoryPicker when available, falling back to <input webkitdirectory>.
 */
export async function pickFolderFromDisk(): Promise<{ folderName: string; files: File[] }> {
  // Method 1: Modern File System Access API
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      const files = await scanDirHandle(dirHandle);
      return {
        folderName: dirHandle.name || 'Selected Folder',
        files,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('USER_CANCELLED');
      }
      // Fall through to fallback input
    }
  }

  // Method 2: HTML5 webkitdirectory input fallback
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';

    const cleanUp = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    };

    let selected = false;

    input.onchange = () => {
      selected = true;
      const fileList = Array.from(input.files || []);
      cleanUp();

      if (fileList.length === 0) {
        reject(new Error('USER_CANCELLED'));
        return;
      }

      const folderName =
        fileList[0].webkitRelativePath?.split('/')[0] || 'Selected Folder';
      resolve({ folderName, files: fileList });
    };

    input.oncancel = () => {
      cleanUp();
      reject(new Error('USER_CANCELLED'));
    };

    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!selected) cleanUp();
        }, 1200);
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Checks each pair against the server and uploads new/modified pairs.
 */
export async function processAndUploadFolder(
  folderName: string,
  files: File[],
  onProgress: (progress: FolderUploadProgress) => void,
): Promise<FolderUploadResult> {
  const pairs = groupFilesIntoPairs(files);
  const total = pairs.length;

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let incomplete = 0;

  onProgress({
    currentIndex: 0,
    total,
    percent: 0,
    currentPairKey: '',
    phase: 'scanning',
    folderName,
    pairs: [...pairs],
    imported: 0,
    skipped: 0,
    failed: 0,
    incomplete: 0,
    message: `Discovered ${total} job pair${total === 1 ? '' : 's'} in ${folderName}`,
  });

  for (let i = 0; i < total; i++) {
    const pair = pairs[i];
    const currentIndex = i + 1;
    const percent = Math.round((currentIndex / total) * 100);

    // Incomplete pairs (.t4vjob or .xlsx missing)
    if (!pair.t4vjobFile || !pair.xlsxFile) {
      incomplete++;
      pair.status = 'INCOMPLETE';
      pair.message = `Missing ${!pair.t4vjobFile ? '.t4vjob' : '.xlsx'} pair file`;
      pair.lastSyncedAt = new Date().toISOString();

      onProgress({
        currentIndex,
        total,
        percent,
        currentPairKey: pair.pairKey,
        phase: 'checking',
        folderName,
        pairs: [...pairs],
        imported,
        skipped,
        failed,
        incomplete,
        message: `Missing pair file for ${pair.pairKey}`,
      });
      continue;
    }

    try {
      // 1. Peek Job ID / Name from .t4vjob header
      const headerText = await pair.t4vjobFile.slice(0, 4096).text();
      const sourceJobId = peekSourceJobId(headerText);
      pair.sourceJobId = sourceJobId;
      pair.jobName = sourceJobId || pair.pairKey;

      onProgress({
        currentIndex,
        total,
        percent,
        currentPairKey: pair.pairKey,
        phase: 'checking',
        folderName,
        pairs: [...pairs],
        imported,
        skipped,
        failed,
        incomplete,
        message: `Checking server database for ${pair.pairKey}${sourceJobId ? ` (${sourceJobId})` : ''}…`,
      });

      // 2. Compute SHA-256 hashes
      const [t4vjobHash, xlsxHash] = await Promise.all([
        computeFileHash(pair.t4vjobFile),
        computeFileHash(pair.xlsxFile),
      ]);

      // 3. Ask server if data already exists in database
      let check = null;
      try {
        check = await api.checkImportPair({
          pairKey: pair.pairKey,
          t4vjobHash,
          xlsxHash,
          sourceJobId,
        });
      } catch {
        check = null;
      }

      if (check?.shouldSkip) {
        skipped++;
        pair.status = 'SKIPPED';
        pair.message = check.message || 'Already in database — upload skipped';
        pair.lastSyncedAt = new Date().toISOString();

        onProgress({
          currentIndex,
          total,
          percent,
          currentPairKey: pair.pairKey,
          phase: 'checking',
          folderName,
          pairs: [...pairs],
          imported,
          skipped,
          failed,
          incomplete,
          message: `${pair.pairKey} is already in database — skipping`,
        });
        continue;
      }

      // 4. Upload files to server
      onProgress({
        currentIndex,
        total,
        percent,
        currentPairKey: pair.pairKey,
        phase: 'uploading',
        folderName,
        pairs: [...pairs],
        imported,
        skipped,
        failed,
        incomplete,
        message: `Uploading ${pair.pairKey}…`,
      });

      const result = await api.uploadImportPair(pair.t4vjobFile, pair.xlsxFile);

      if (result.status === 'SYNCED' || result.status === 'SUCCESS') {
        imported++;
        pair.status = 'SYNCED';
        pair.itemsImported = result.itemsImported ?? 0;
        pair.unitsImported = result.unitsImported ?? 0;
        pair.message = result.message || 'Imported successfully';
        pair.lastSyncedAt = new Date().toISOString();
      } else if (result.status === 'SKIPPED') {
        skipped++;
        pair.status = 'SKIPPED';
        pair.message = result.message || 'Already in database';
        pair.lastSyncedAt = new Date().toISOString();
      } else {
        failed++;
        pair.status = 'FAILED';
        pair.message = result.message || 'Import failed on server';
        pair.lastSyncedAt = new Date().toISOString();
      }
    } catch (err: any) {
      failed++;
      pair.status = 'FAILED';
      pair.message = err?.message || 'Failed to upload pair';
      pair.lastSyncedAt = new Date().toISOString();
    }

    onProgress({
      currentIndex,
      total,
      percent,
      currentPairKey: pair.pairKey,
      phase: currentIndex === total ? 'done' : 'uploading',
      folderName,
      pairs: [...pairs],
      imported,
      skipped,
      failed,
      incomplete,
      message: `Processed ${pair.pairKey}: ${pair.status}`,
    });
  }

  const finalProgress: FolderUploadProgress = {
    currentIndex: total,
    total,
    percent: 100,
    currentPairKey: '',
    phase: 'done',
    folderName,
    pairs: [...pairs],
    imported,
    skipped,
    failed,
    incomplete,
    message: `Completed: ${imported} imported, ${skipped} already in DB, ${incomplete} incomplete, ${failed} failed`,
  };
  onProgress(finalProgress);

  return {
    folderName,
    totalPairs: total,
    imported,
    skipped,
    failed,
    incomplete,
    pairs,
  };
}
