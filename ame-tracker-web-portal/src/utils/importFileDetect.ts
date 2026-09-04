import * as XLSX from 'xlsx';

export type FileKind = 'vjob' | 'fabshop' | 'jobReport' | 'weightList' | 'unknown' | 'unsupported';

export interface StagedFile {
  id: string;
  file: File;
  kind: FileKind;
  kindOverride?: Exclude<FileKind, 'unsupported'>;
  relativePath?: string;
}

export interface JobGroup {
  key: string;
  vjob?: StagedFile;
  fabshop?: StagedFile;
  jobReport?: StagedFile;
}

export type JobGroupStatus = 'ready' | 'partial' | 'unclassified' | 'empty';

/** Standard manual upload: Vulcan .t4vjob + item schedule .xlsx */
export function isStandardJobPair(group: JobGroup): boolean {
  return Boolean(group.vjob && group.jobReport);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function norm(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function effectiveKind(staged: StagedFile): FileKind {
  return staged.kindOverride ?? staged.kind;
}

export function jobKeyFromStaged(staged: StagedFile): string {
  const nameMatch = staged.file.name.match(/P\d+/i);
  if (nameMatch) return nameMatch[0].toUpperCase();

  if (staged.relativePath) {
    const parts = staged.relativePath.split(/[/\\]/).filter(Boolean);
    for (const part of parts) {
      const folderMatch = part.match(/^P\d+$/i);
      if (folderMatch) return folderMatch[0].toUpperCase();
    }
  }

  return `file:${staged.file.name}`;
}

function kindFromFilename(name: string): FileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.t4vjob')) return 'vjob';
  if (!/\.(xlsx|xls)$/i.test(lower)) return 'unsupported';

  if (/fab|qr|label|sticker|guid|qtyitem/i.test(lower)) return 'fabshop';
  if (/weight\s*list|fitting\s*weight/i.test(lower)) return 'weightList';
  if (/report|schedule|item|peace|piece|catalog/i.test(lower)) return 'jobReport';
  // Trimble default: P-code .xlsx exports are item schedules
  if (/^p\d+\.xlsx?$/i.test(lower)) return 'jobReport';

  return null;
}

function scoreWeightList(cells: string[]): number {
  const joined = cells.join(' ');
  let score = 0;
  if (joined.includes('fitting weight list')) score += 4;
  if (joined.includes('download #') || joined.includes('download:')) score += 2;
  if (cells.some((h) => h === 'piece #' || h.includes('piece #'))) score += 2;
  if (joined.includes('job name:') || joined.includes('project:')) score += 1;
  return score;
}

function scoreJobReportHeaders(cells: string[]): number {
  const joined = cells.join(' ');
  let score = 0;
  if (cells.some((h) => h.includes('fitting') || h.includes('iteam'))) score += 2;
  if (cells.some((h) => h.includes('metal'))) score += 2;
  if (cells.some((h) => h === '#' || h.includes('peace') || h.includes('piece'))) score += 2;
  if (cells.some((h) => h.includes('qty') || h.includes('quantity'))) score += 1;
  if (cells.some((h) => h.includes('weight') || h.includes('wight'))) score += 1;
  if (cells.some((h) => h.includes('liner') || h.includes('insulation'))) score += 1;
  if (joined.includes('instruction')) score += 1;
  return score;
}

function scoreFabshopRow(cells: string[]): number {
  let score = 0;
  const joined = cells.join(' ');
  if (UUID_RE.test(String(cells[3] ?? '').trim())) score += 3;
  if (joined.includes('download')) score += 2;
  if (joined.includes('qr') || joined.includes('guid')) score += 2;
  if (joined.includes('job id') || joined.includes('iditem') || joined.includes('piece no')) score += 1;
  const col1 = String(cells[0] ?? '').trim();
  const col2 = String(cells[1] ?? '').trim();
  if (/^\d+$/.test(col1) && /^\d+$/.test(col2)) score += 1;
  return score;
}

async function sniffExcelKind(file: File): Promise<FileKind> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', sheetRows: 6 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return 'unknown';

  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  });
  if (!rows.length) return 'unknown';

  const normalizedRows = rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => norm(cell)),
  );

  let jobReportScore = 0;
  let fabshopScore = 0;
  let weightListScore = 0;

  for (const cells of normalizedRows.slice(0, 6)) {
    weightListScore = Math.max(weightListScore, scoreWeightList(cells));
    jobReportScore = Math.max(jobReportScore, scoreJobReportHeaders(cells));
    fabshopScore = Math.max(fabshopScore, scoreFabshopRow(cells));
  }

  if (weightListScore >= 3 && weightListScore >= jobReportScore && weightListScore >= fabshopScore) {
    return 'weightList';
  }
  if (jobReportScore >= 3 && jobReportScore > fabshopScore) return 'jobReport';
  if (fabshopScore >= 2 && fabshopScore > jobReportScore) return 'fabshop';
  if (jobReportScore >= 2) return 'jobReport';
  if (fabshopScore >= 2) return 'fabshop';
  return 'unknown';
}

export async function classifyFile(file: File, relativePath?: string): Promise<StagedFile> {
  const fromName = kindFromFilename(file.name);
  let kind: FileKind = fromName ?? 'unknown';

  if (kind === 'unknown' && /\.(xlsx|xls)$/i.test(file.name)) {
    kind = await sniffExcelKind(file);
  }

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${relativePath ?? ''}`,
    file,
    kind,
    relativePath,
  };
}

export async function classifyFiles(files: FileList | File[]): Promise<StagedFile[]> {
  const list = Array.from(files);
  return Promise.all(
    list.map((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      return classifyFile(file, relativePath || undefined);
    }),
  );
}

export function groupStagedFiles(staged: StagedFile[]): JobGroup[] {
  const groups = new Map<string, JobGroup>();

  for (const item of staged) {
    const kind = effectiveKind(item);
    if (kind === 'unsupported' || kind === 'unknown' || kind === 'weightList') continue;

    const slot = kind as 'vjob' | 'fabshop' | 'jobReport';
    let key = jobKeyFromStaged(item);
    let group = groups.get(key);

    if (group?.[slot]) {
      key = `${key}::${item.file.name}`;
      group = groups.get(key);
    }

    const next = group ?? { key };
    next[slot] = item;
    groups.set(key, next);
  }

  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function getJobGroupStatus(group: JobGroup, staged: StagedFile[]): JobGroupStatus {
  const hasUnknown = staged.some((item) => {
    const key = jobKeyFromStaged(item);
    const baseKey = group.key.split('::')[0];
    const itemBase = key.split('::')[0];
    const matches =
      key === group.key ||
      key.startsWith(`${group.key}::`) ||
      group.key.startsWith(`${key}::`) ||
      itemBase === baseKey;
    return matches && effectiveKind(item) === 'unknown';
  });
  if (hasUnknown) return 'unclassified';

  const hasVjob = Boolean(group.vjob);
  const hasReport = Boolean(group.jobReport);
  const hasFabshop = Boolean(group.fabshop);

  if (!hasVjob && !hasReport && !hasFabshop) return 'empty';
  // Trimble manual bundle: tracking file + item schedule is complete
  if (hasVjob && hasReport) return 'ready';
  return 'partial';
}

export function countStagedByKind(staged: StagedFile[]): Record<FileKind, number> {
  const counts: Record<FileKind, number> = {
    vjob: 0,
    fabshop: 0,
    jobReport: 0,
    weightList: 0,
    unknown: 0,
    unsupported: 0,
  };
  for (const item of staged) {
    counts[effectiveKind(item)] += 1;
  }
  return counts;
}

export function mergeStagedFiles(existing: StagedFile[], incoming: StagedFile[]): StagedFile[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export function toImportPayload(group: JobGroup) {
  return {
    vjob: group.vjob?.file,
    fabshop: group.fabshop?.file,
    jobReport: group.jobReport?.file,
  };
}
