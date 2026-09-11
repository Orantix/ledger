const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type PaymentMethod = 'BANK' | 'PERSONAL' | 'CREDIT';
export type CaptureStatus = 'DRAFT' | 'PENDING_REVIEW' | 'POSTED';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface JournalLine {
  id: string;
  debit: string;
  credit: string;
  account: Account;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  status: 'POSTED' | 'REVERSED';
  lines: JournalLine[];
}

export interface Capture {
  id: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  paymentMethod: PaymentMethod;
  category: string;
  notes?: string | null;
  status: CaptureStatus;
  createdAt: string;
  attachments: Attachment[];
  journalEntry?: JournalEntry | null;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listCaptures: (status?: CaptureStatus) =>
    apiFetch<Capture[]>(`/captures${status ? `?status=${status}` : ''}`),
  getCapture: (id: string) => apiFetch<Capture>(`/captures/${id}`),
  createCapture: (data: {
    description: string;
    amount: number;
    date: string;
    paymentMethod: PaymentMethod;
    category: string;
    notes?: string;
  }) => apiFetch<Capture>('/captures', { method: 'POST', body: JSON.stringify(data) }),
  classifyCapture: (
    id: string,
    data: { expenseAccountId: string; paymentAccountId: string; saveAsRule?: boolean },
  ) => apiFetch<Capture>(`/captures/${id}/classify`, { method: 'POST', body: JSON.stringify(data) }),
  listAccounts: () => apiFetch<Account[]>('/accounts'),
  getTrialBalance: () => apiFetch<TrialBalance>('/trial-balance'),
};

export function apiUploadUrl(captureId: string) {
  return `${API_URL}/captures/${captureId}/attachments`;
}
