/**
 * Whether a path is absolute on Windows or Unix-like systems.
 * Browser-safe — mirrors Node's path.isAbsolute() rules without importing path.
 */
export function isAbsoluteFolderPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true;
  if (trimmed.startsWith('\\\\')) return true;
  return false;
}

export const FOLDER_PATH_HINT =
  'Server path only (e.g. G:\\Data\\ImportData).';

export const FOLDER_PATH_PLACEHOLDER = 'G:\\Data\\ImportData (on the application server)';
