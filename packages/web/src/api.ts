/** API client for PDD Inspector backend */

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body != null;
  const res = await fetch(`${BASE}${url}`, {
    headers: hasBody ? { 'Content-Type': 'application/json', ...options?.headers } : { ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Stores
  getStores: () => request<any[]>('/stores'),
  getStore: (id: number) => request<any>(`/stores/${id}`),
  createStore: (data: any) => request<any>('/stores', { method: 'POST', body: JSON.stringify(data) }),
  updateStore: (id: number, data: any) => request<any>(`/stores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStore: (id: number) => request<any>(`/stores/${id}`, { method: 'DELETE' }),

  // Inspections
  getInspections: (params?: { storeId?: number; date?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.storeId) qs.set('storeId', String(params.storeId));
    if (params?.date) qs.set('date', params.date);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<any[]>(`/inspections${q ? '?' + q : ''}`);
  },
  getInspection: (id: number) => request<any>(`/inspections/${id}`),
  triggerInspect: (storeId: number) => request<any>(`/stores/${storeId}/inspect`, { method: 'POST' }),
  triggerInspectAll: () => request<any>('/inspect-all', { method: 'POST' }),
  getQueueStatus: () => request<any>('/queue/status'),
  getRiskStatus: () => request<any>('/risk/status'),

  // Action candidates
  getActionCandidates: (params?: { status?: string; storeId?: number; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.storeId) qs.set('storeId', String(params.storeId));
    if (params?.type) qs.set('type', params.type);
    const q = qs.toString();
    return request<any[]>(`/action-candidates${q ? '?' + q : ''}`);
  },
  approveActionCandidate: (kind: string, id: number, operatorId = 'operator') => request<any>(
    `/action-candidates/${kind}/${id}/approve`,
    { method: 'POST', body: JSON.stringify({ operatorId }) },
  ),
  skipActionCandidate: (kind: string, id: number, operatorId = 'operator') => request<any>(
    `/action-candidates/${kind}/${id}/skip`,
    { method: 'POST', body: JSON.stringify({ operatorId }) },
  ),

  // Reports
  getDailyReport: (date?: string) => request<any>(`/reports/daily${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  getWeeklyReport: () => request<any>('/reports/weekly'),
  getMonthlyReport: () => request<any>('/reports/monthly'),

  // Templates
  getReplyTemplates: (params?: { storeId?: number; global?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.storeId) qs.set('storeId', String(params.storeId));
    if (params?.global) qs.set('global', 'true');
    const q = qs.toString();
    return request<any[]>(`/reply-templates${q ? '?' + q : ''}`);
  },
  createReplyTemplate: (data: any) => request<any>('/reply-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateReplyTemplate: (id: number, data: any) => request<any>(`/reply-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReplyTemplate: (id: number) => request<any>(`/reply-templates/${id}`, { method: 'DELETE' }),

  getReportTemplates: (params?: { storeId?: number; global?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.storeId) qs.set('storeId', String(params.storeId));
    if (params?.global) qs.set('global', 'true');
    const q = qs.toString();
    return request<any[]>(`/report-templates${q ? '?' + q : ''}`);
  },
  createReportTemplate: (data: any) => request<any>('/report-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateReportTemplate: (id: number, data: any) => request<any>(`/report-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReportTemplate: (id: number) => request<any>(`/report-templates/${id}`, { method: 'DELETE' }),

  // Health
  health: () => request<any>('/health'),
};
