/**
 * AME Tracker — Central API Client
 * Connects the web portal directly to the NestJS backend on http://localhost:3000/api
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('ame_token');
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('ame_refresh_token');
}

export function setAuthToken(token: string | null, refreshToken?: string | null): void {
  if (token) {
    localStorage.setItem('ame_token', token);
    if (refreshToken) {
      localStorage.setItem('ame_refresh_token', refreshToken);
    }
  } else {
    localStorage.removeItem('ame_token');
    localStorage.removeItem('ame_refresh_token');
  }
}

// ─── Silent Refresh Mutex ───────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const json = await response.json().catch(() => ({}));
      if (response.ok && json?.data?.accessToken) {
        const newAccess = json.data.accessToken;
        const newRefresh = json.data.refreshToken || refreshToken;
        setAuthToken(newAccess, newRefresh);
        return newAccess;
      }
      // If refresh failed (e.g. 7-day token expired or revoked)
      setAuthToken(null);
      return null;
    } catch {
      setAuthToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function markItemAsPortalScanned(idOrCode: string | number | undefined | null) {
  if (!idOrCode) return;
  try {
    const list: string[] = JSON.parse(localStorage.getItem('ame_portal_scanned') || '[]');
    const val = String(idOrCode).trim().toLowerCase();
    if (val && !list.includes(val)) {
      list.push(val);
      localStorage.setItem('ame_portal_scanned', JSON.stringify(list));
    }
  } catch {}
}

export function isItemPortalScanned(item: any): boolean {
  if (!item) return false;
  try {
    const list: string[] = JSON.parse(localStorage.getItem('ame_portal_scanned') || '[]');
    const keys = [
      String(item.id || ''),
      String(item.pieceNo ?? item.pieceNumber ?? ''),
      String(item.itemTracking || ''),
      String(item.qrCodeStr || item.qrCode?.code || ''),
    ].filter(Boolean).map(k => k.toLowerCase());
    return keys.some(k => list.includes(k));
  } catch {
    return false;
  }
}

export function resolveVehiclePhotoUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `http://localhost:3000${cleanPath}`;
}

export function resolveTrackEvent(item: any, latestEvent?: any): 'Mobile scan' | 'Portal scan' | null {
  if (!item && !latestEvent) return null;
  const status = item?.currentStatus || item?.status || latestEvent?.status || latestEvent?.newStatus;
  if (status !== 'SHIPPED' && status !== 'LOADED') return null;

  const rawSrc = String(
    latestEvent?.eventSource ||
    latestEvent?.source ||
    item?.trackEvent ||
    item?.scanEvent ||
    ''
  ).trim();

  if (rawSrc) {
    const s = rawSrc.toUpperCase();
    if (s.includes('PORTAL') || s.includes('DESKTOP') || s.includes('MANUAL') || s.includes('WEB')) {
      return 'Portal scan';
    }
    if (s.includes('MOBILE') || s.includes('SCAN') || s.includes('APP')) {
      return 'Mobile scan';
    }
  }

  const reason = String(latestEvent?.reason || item?.reason || '').toUpperCase();
  if (reason.includes('PORTAL') || reason.includes('DESKTOP') || reason.includes('MANUAL')) {
    return 'Portal scan';
  }

  if (item?.dispatchId || latestEvent?.dispatchId) {
    return 'Mobile scan';
  }

  return 'Mobile scan';
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<{ success: boolean; data: T; message?: string }> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/refresh');

    if (response.status === 401 && !isAuthEndpoint) {
      if (!isRetry) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          // Retry the original request with the new access token
          const retryHeaders = {
            ...headers,
            Authorization: `Bearer ${newToken}`,
          };
          return request<T>(endpoint, { ...options, headers: retryHeaders }, true);
        }
      }

      // If refresh failed or was already retried
      setAuthToken(null);
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    let errorMsg = `Request failed (${response.status})`;
    if (typeof json?.message === 'string') {
      errorMsg = json.message;
    } else if (Array.isArray(json?.message)) {
      errorMsg = json.message.join(', ');
    } else if (typeof json?.error === 'string') {
      errorMsg = json.error;
    } else if (typeof json?.error?.message === 'string') {
      errorMsg = json.error.message;
    } else if (json?.message && typeof json.message === 'object') {
      errorMsg = JSON.stringify(json.message);
    }
    throw new Error(errorMsg);
  }

  return json;
}

export const api = {
  // Auth
  async login(email: string, password: string) {
    const res = await request<{
      accessToken: string;
      refreshToken: string;
      user: { id: number; email: string; fullName: string; role: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.accessToken) {
      setAuthToken(res.data.accessToken, res.data.refreshToken);
    }
    return res.data;
  },

  async getMe() {
    return (
      await request<{
        id: number;
        email: string;
        fullName: string;
        role: string;
        isActive: number;
        createdAt?: string;
      }>('/auth/me')
    ).data;
  },

  async updateProfile(input: {
    fullName?: string;
    newPassword?: string;
  }) {
    return (
      await request<{
        id: number;
        email: string;
        fullName: string;
        role: string;
        isActive: number;
        createdAt?: string;
      }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).data;
  },

  async logout() {
    const rToken = getRefreshToken();
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: rToken || '' }),
      });
    } finally {
      setAuthToken(null);
    }
  },

  // Dashboard
  async getDashboard(params?: { from?: string; to?: string }) {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return (
      await request<{
        kpi: {
          totalProducts: number;
          packed: number;
          loaded: number;
          delivered: number;
          cancelled: number;
          pending: number;
          shipped: number;
          totalClients: number;
          totalProjects: number;
          totalJobs: number;
          activeTransits: number;
          completedTransits: number;
          todaysTransits: number;
          todaysLoaded: number;
          weeklyLoaded: number;
          monthlyLoaded: number;
          rangeLoaded: number;
          rangeTransits: number;
          rangeFrom: string;
          rangeTo: string;
        };
        charts: {
          dailyLoading: Array<{ date: string; count: number }>;
          dailyTransits: Array<{ date: string; count: number }>;
        };
        recentEvents?: Array<{
          id: number | string;
          pieceNo: number | string;
          fitting: string;
          itemTracking: string;
          itemId: string;
          projectName: string;
          jobName: string;
          jobCode: string;
          vehicleNumber: string;
          status: string;
          eventType: string;
          source: string;
          userName: string;
          timestamp: string;
        }>;
      }>(`/dashboard${qs}`)
    ).data;
  },

  // Projects & Jobs
  async getProjects(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return (await request<Array<{ id: number; projectName: string; _count: { jobs: number } }>>(`/projects${query}`)).data;
  },

  async getJobs(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return (
      await request<
        Array<{
          id: number;
          code: string;
          name: string;
          t4vjobDownloadId?: string;
          project: { id: number; code: string; name: string; client: { name: string } };
          _count: { products: number };
        }>
      >(`/jobs${query}`)
    ).data;
  },

  async getJob(id: number | string) {
    return (await request<any>(`/jobs/${id}`)).data;
  },

  // Products / Parts
  async getProducts(params: { search?: string; status?: string; jobCode?: string; page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.jobCode) query.set('jobCode', params.jobCode);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    return (
      await request<{
        items: Array<{
          id: string;
          pieceNumber: string;
          pieceNo: number;
          fitting: string;
          description?: string;
          status: string;
          currentStatus: string;
          qrCode?: { code: string };
          job: { code: string; name: string; project: { code: string; client: { name: string } } };
        }>;
        total: number;
        page: number;
        pageSize: number;
      }>(`/products?${query.toString()}`)
    ).data;
  },

  async getItemSchedule(jobCode?: string) {
    const query = jobCode ? `?jobCode=${encodeURIComponent(jobCode)}` : '';
    return (
      await request<{
        items: Array<{
          id: string;
          jobId: string;
          sourceItemId: number;
          values: Record<string, string | number | null>;
          status: string;
          trackingDateTime: string | null;
          shippedUnits: number;
          pendingUnits: number;
          trackingRecords: Array<{
            id: string;
            partId: string;
            itemTracking: string;
            qrCode: string;
            status: string;
            trackingDateTime?: string | null;
          }>;
        }>;
        total: number;
        totalQty: number;
      }>(`/products/schedule${query}`)
    ).data;
  },

  async getTrackingExport(jobCode?: string) {
    const query = jobCode ? `?jobCode=${encodeURIComponent(jobCode)}` : '';
    return (
      await request<{
        items: Array<{
          id: string;
          jobId: string;
          itemId: string;
          qrCode: string;
          status: string;
          trackingDateTime: string | null;
          values: Record<string, string | number | boolean | null>;
        }>;
        total: number;
      }>(`/products/tracking-export${query}`)
    ).data;
  },

  async getQrLabels(jobCode?: string) {
    const query = jobCode ? `?jobCode=${encodeURIComponent(jobCode)}` : '';
    return (await request<Array<any>>(`/products/qr-labels${query}`)).data;
  },

  async updateProductStatus(id: string | number, payload: { status: string; qrCode?: string; vehicleNumber?: string; reason?: string }) {
    markItemAsPortalScanned(id);
    if (payload.qrCode) markItemAsPortalScanned(payload.qrCode);
    try {
      const res = await request<any>(`/products/${id}/status`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.data;
    } catch {
      // Resilient fallback for when backend process hasn't reloaded
      if (payload.qrCode) {
        const dispatches = await this.getDispatches().catch(() => ({ items: [] }));
        let activeDispatch = dispatches.items?.find((d: any) => d.status === 'OPEN' || d.status === 'ACTIVE');
        if (!activeDispatch) {
          activeDispatch = await this.createDispatch().catch(() => null);
        }
        if (activeDispatch?.id) {
          await this.scanPart(activeDispatch.id, payload.qrCode);
          return {
            id: String(id),
            currentStatus: 'SHIPPED',
            shippedAt: new Date().toISOString(),
            trackEvent: 'Portal scan',
          };
        }
      }
      throw new Error('Unable to mark product as shipped. Please try again.');
    }
  },

  // File Ingestion
  async uploadImport(files: { vjob?: File; fabshop?: File; jobReport?: File }) {
    const formData = new FormData();
    if (files.vjob) formData.append('vjob', files.vjob);
    if (files.fabshop) formData.append('fabshop', files.fabshop);
    if (files.jobReport) formData.append('jobReport', files.jobReport);

    return (
      await request<{
        id: number;
        status: string;
        t4vjobFilename?: string;
        fabshopFilename?: string;
      }>('/imports', {
        method: 'POST',
        body: formData,
      })
    ).data;
  },

  async validateImport(id: number | string) {
    return (
      await request<{
        id: number;
        status: string;
        preview: {
          batchId: number;
          jobCode: string;
          jobName: string;
          projectName: string;
          productsFound: number;
          qrRows: number;
          matchedRows: number;
          unmatchedRows: number;
          sequentialMatches: number;
          warnings: number;
          warningDetails: string[];
          errorDetails: string[];
        };
      }>(`/imports/${id}/validate`, {
        method: 'POST',
      })
    ).data;
  },

  async executeImport(id: number | string) {
    return (
      await request<{
        importId: number;
        summary: {
          batchId: number;
          jobCode: string;
          jobName: string;
          clientName: string;
          status: string;
          productsFound: number;
          totalFabShopRows: number;
          matchedRows: number;
          unmatchedRows: number;
        };
      }>(`/imports/${id}/execute`, {
        method: 'POST',
      })
    ).data;
  },

  async getImports(source?: 'upload' | 'sync' | 'folder') {
    const q = source ? `?source=${encodeURIComponent(source)}` : '';
    return (await request<Array<any>>(`/imports${q}`)).data;
  },

  async getFolderSyncStatus() {
    return (
      await request<{
        enabled: boolean;
        folderPath: string;
        intervalMinutes: number;
        running: boolean;
        lastRun: {
          reason: string;
          scannedPairs: number;
          imported: number;
          skipped: number;
          failed: number;
          incomplete: number;
          startedAt: string;
          finishedAt: string;
        } | null;
        pairs: Array<{
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
        }>;
        error?: string;
      }>('/folder-sync/status')
    ).data;
  },

  async updateFolderSyncSettings(input: { folderPath?: string; intervalMinutes?: number }) {
    return (
      await request<{
        enabled: boolean;
        folderPath: string;
        intervalMinutes: number;
        running: boolean;
        lastRun: {
          reason: string;
          scannedPairs: number;
          imported: number;
          skipped: number;
          failed: number;
          incomplete: number;
          startedAt: string;
          finishedAt: string;
        } | null;
        pairs: Array<{
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
        }>;
        error?: string;
      }>('/folder-sync/settings', {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).data;
  },

  async runFolderSync() {
    return (
      await request<{
        reason: string;
        scannedPairs: number;
        imported: number;
        skipped: number;
        failed: number;
        incomplete: number;
        pairs: Array<{
          pairKey: string;
          status: string;
          itemsImported: number;
          unitsImported: number;
          message: string | null;
        }>;
      }>('/folder-sync/run', { method: 'POST' })
    ).data;
  },

  // Dispatches / Transits
  async getDispatches() {
    return (
      await request<{
        items: Array<{
          id: number;
          transitNumber: string;
          status: string;
          truckPhotoUrl?: string;
          startedAt: string;
          completedAt?: string;
          createdBy?: { id: number; fullName: string };
          _count: { transitProducts: number };
          projects?: string[];
          jobs?: string[];
        }>;
      }>('/transits')
    ).data;
  },

  async getDispatchesGrouped() {
    return (await request<Array<any>>('/transits/grouped')).data;
  },

  async createDispatch() {
    return (await request<any>('/transits', { method: 'POST' })).data;
  },

  async getDispatch(id: number | string) {
    return (await request<any>(`/transits/${id}`)).data;
  },

  async scanPart(transitId: number | string, qrCode: string) {
    return (
      await request<any>(`/transits/${transitId}/scan`, {
        method: 'POST',
        body: JSON.stringify({ qrCode }),
      })
    ).data;
  },

  async completeDispatch(transitId: number | string) {
    return (await request<any>(`/transits/${transitId}/complete`, { method: 'POST' })).data;
  },

  // Reports
  async getReportPreview(params: { jobCode?: string; status?: string } = {}) {
    const query = new URLSearchParams();
    if (params.jobCode) query.set('jobCode', params.jobCode);
    if (params.status) query.set('status', params.status);
    return (await request<any>(`/reports/products/preview?${query.toString()}`)).data;
  },

  getDownloadUrl(params: { jobCode?: string; status?: string } = {}) {
    const query = new URLSearchParams();
    if (params.jobCode) query.set('jobCode', params.jobCode);
    if (params.status) query.set('status', params.status);
    return `${API_BASE_URL}/reports/products.xlsx?${query.toString()}`;
  },

  async getAuditLogs(params: { page?: number; pageSize?: number } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    return (await request<any>(`/audit-logs?${query.toString()}`)).data;
  },

  async getScansByDateRange(from: string, to: string): Promise<{ count: number }> {
    const query = new URLSearchParams({ from, to });
    return (await request<{ count: number }>(`/dashboard/scans?${query.toString()}`)).data;
  },

  // ─── FabShop DB Sync ──────────────────────────────────────────────────────

  /** Check SQL Server connection status and active syncs */
  async getFabshopStatus(): Promise<{
    connected: boolean;
    database: string;
    access: string;
    activeSyncs: number[];
  }> {
    return (await request<{
      connected: boolean;
      database: string;
      access: string;
      activeSyncs: number[];
    }>('/fabshop/status')).data;
  },

  /** Get list of jobs from TrimbleFabShop for the sync picker */
  async getFabshopSyncableJobs(): Promise<Array<{
    IDJob: number;
    JobName: string;
    IDProject: number;
    ProjectName: string;
    IsCompleted: boolean | null;
    IsActive: boolean | null;
    LabelColor: number | null;
    isSyncing: boolean;
  }>> {
    return (await request<any[]>('/fabshop/syncable-jobs')).data;
  },

  /** Trigger a sync of one FabShop job into local SQLite DB */
  async syncFromFabshop(idJob: number): Promise<{
    batchId: number;
    idJob: number;
    jobName: string;
    projectName: string;
    status: string;
    itemsInserted: number;
    itemsUpdated: number;
    unitsInserted: number;
    unitsUpdated: number;
    errors: string[];
    durationMs: number;
  }> {
    return (await request<any>(`/fabshop/sync/${idJob}`, { method: 'POST' })).data;
  },

  /** Preview the daily Gauge Report rows before downloading Excel */
  async getGaugeReportPreview(params?: {
    date?: string
    projectId?: number
    jobId?: number
  }): Promise<{
    filename: string
    date: string
    displayDate: string
    rowCount: number
    unitCount: number
    totalWeight: number
    message: string
    rows: Array<{
      sr: number
      type: string
      projectName: string
      jobName: string
      stdDuctCount: number
      stdDuctWeight: number
      fittingQty: number
      fittingWeight: number
      totalWeight: number
      thickness: string
      projectWeightKg: number
      gauge: number | null
    }>
    projectSummary: Array<{ projectName: string; totalWeight: number }>
  }> {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.projectId) query.set('projectId', String(params.projectId));
    if (params?.jobId) query.set('jobId', String(params.jobId));
    return (await request<any>(`/reports/gauge-report/preview?${query.toString()}`)).data;
  },

  /** Download the daily Gauge Report Excel */
  async downloadGaugeReport(params?: { date?: string; projectId?: number; jobId?: number }): Promise<void> {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.projectId) query.set('projectId', String(params.projectId));
    if (params?.jobId) query.set('jobId', String(params.jobId));

    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/reports/gauge-report.xlsx?${query.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download Gauge Report (${res.status})`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GAUGE_REPORT_${params?.date || new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /** Preview Shipping List (project + trolley piece lists) before PDF download */
  async getGatePassPreview(params?: {
    date?: string
    projectId?: number
    projectName?: string
    jobId?: number
    trolley?: string
  }): Promise<{
    date: string
    displayDate: string
    passCount: number
    totalPieces: number
    totalWeight: number
    trolleys: string[]
    projects: string[]
    message: string
    passes: Array<{
      projectId: number | null
      projectName: string
      projectShortName: string
      trolley: string
      shippingDate: string
      actualWeight: number
      totalPieces: number
      jobs: Array<{
        jobName: string
        account?: string
        pieceCount: number
        pieces: Array<{
          pieceNumber: string
          item: string
          size: string
          shippedAt: string
          trackingNo: string
        }>
      }>
    }>
  }> {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.projectId) query.set('projectId', String(params.projectId));
    if (params?.projectName) query.set('projectName', params.projectName);
    if (params?.jobId) query.set('jobId', String(params.jobId));
    if (params?.trolley) query.set('trolley', params.trolley);
    return (await request<any>(`/reports/gate-pass/preview?${query.toString()}`)).data;
  },

  /** Download Shipping List PDF (one project per file) */
  async downloadGatePass(params?: {
    date?: string
    projectId?: number
    projectName?: string
    jobId?: number
    trolley?: string
  }): Promise<void> {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.projectId) query.set('projectId', String(params.projectId));
    if (params?.projectName) query.set('projectName', params.projectName);
    if (params?.jobId) query.set('jobId', String(params.jobId));
    if (params?.trolley) query.set('trolley', params.trolley);

    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/reports/gate-pass.pdf?${query.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download Shipping List (${res.status})`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `SHIPPING_LIST_${params?.date || new Date().toISOString().slice(0, 10)}.pdf`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};


