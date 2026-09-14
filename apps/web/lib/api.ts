const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type PaymentMethod = 'BANK' | 'PERSONAL' | 'CREDIT';
export type CaptureStatus = 'DRAFT' | 'PENDING_REVIEW' | 'POSTED';
export type ReviewReason = 'NO_RULE' | 'SENSITIVE_ACCOUNT' | 'UNUSUAL_AMOUNT';
export type FsStatement = 'INCOME_STATEMENT' | 'BALANCE_SHEET';
export type CashFlowCategory = 'OPERATING' | 'INVESTING' | 'FINANCING' | 'NONE';
export type PeriodStatus = 'DRAFT' | 'FINAL';
export type VarianceStatus = 'OPEN' | 'EXPLAINED';
export type Role = 'OWNER' | 'STAFF' | 'BOOKKEEPER' | 'ACCOUNTANT' | 'ADMIN';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  sensitive: boolean;
  isCash: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: 'PENDING' | 'COMPLETE' | 'FAILED' | 'UNSUPPORTED';
  extractedVendor?: string | null;
  extractedAmount?: string | null;
  extractedDate?: string | null;
  extractedCurrency?: string | null;
  extractionConfidence?: { vendor: number; amount: number; date: number; currency: number } | null;
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
  reversalOfId?: string | null;
  reversedBy?: { id: string } | null;
  capture?: { id: string; description: string } | null;
  lines: JournalLine[];
}

export interface ClassificationRule {
  id: string;
  category: string;
  paymentMethod: PaymentMethod;
  expenseAccount: Account;
  paymentAccount: Account;
}

export interface Capture {
  id: string;
  description: string;
  amount: string;
  currency: string;
  exchangeRate: string;
  date: string;
  paymentMethod: PaymentMethod;
  category: string;
  notes?: string | null;
  shareholderName?: string | null;
  status: CaptureStatus;
  reviewReason?: ReviewReason | null;
  createdAt: string;
  attachments: Attachment[];
  appliedRule?: ClassificationRule | null;
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

export interface FiscalPeriod {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  finalizedBy?: string | null;
  finalizedAt?: string | null;
}

export interface AccountFsMapping {
  id: string;
  account: Account;
  statement: FsStatement;
  section: string;
  noteLabel: string;
  cashFlowCategory: CashFlowCategory;
  sortOrder: number;
}

export interface StatementRow {
  accountId: string;
  code: string;
  name: string;
  section: string;
  noteLabel: string;
  amount: number;
}

export interface StatementSection {
  section: string;
  rows: StatementRow[];
  total: number;
}

export interface IncomeStatementSide {
  rows: StatementRow[];
  bySection: StatementSection[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  unmapped: { accountId: string; code: string; name: string }[];
}

export interface BalanceSheetSide {
  rows: StatementRow[];
  bySection: StatementSection[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarnings: number;
  balances: boolean;
  unmapped: { accountId: string; code: string; name: string }[];
}

export interface VarianceFlag {
  id: string;
  periodId: string;
  type: 'UNMAPPED_ACCOUNT' | 'CAPITAL_SHORTFALL' | 'CUSTOM';
  description: string;
  amount?: number | null;
  status: VarianceStatus;
  explanation?: string | null;
}

export interface CapitalCommitment {
  id: string;
  shareholderName: string;
  committedAmount: string;
  currency: string;
}

export interface OrgSettings {
  baseCurrency: string;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export { ApiError };

// NestJS error responses are JSON: { message: string | string[], error, statusCode }.
// Surface that message to the user instead of the raw JSON blob.
function extractErrorMessage(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed.message)) return parsed.message.join('; ');
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    return body;
  }
  return null;
}

async function apiFetch<T>(token: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, extractErrorMessage(body) ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createApiClient(token: string | null) {
  const f = <T>(path: string, init?: RequestInit) => apiFetch<T>(token, path, init);

  return {
    // Captures
    listCaptures: (status?: CaptureStatus) => f<Capture[]>(`/captures${status ? `?status=${status}` : ''}`),
    getCapture: (id: string) => f<Capture>(`/captures/${id}`),
    createCapture: (data: {
      description: string;
      amount: number;
      date: string;
      paymentMethod: PaymentMethod;
      category: string;
      notes?: string;
      currency?: string;
      exchangeRate?: number;
      shareholderName?: string;
      attachmentIds?: string[];
    }) => f<Capture>('/captures', { method: 'POST', body: JSON.stringify(data) }),
    classifyCapture: (
      id: string,
      data: { expenseAccountId: string; paymentAccountId: string; saveAsRule?: boolean },
    ) => f<Capture>(`/captures/${id}/classify`, { method: 'POST', body: JSON.stringify(data) }),
    updateCapture: (
      id: string,
      data: Partial<{
        description: string;
        amount: number;
        date: string;
        paymentMethod: PaymentMethod;
        category: string;
        notes: string;
        currency: string;
        exchangeRate: number;
        shareholderName: string;
      }>,
    ) => f<Capture>(`/captures/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    // Attachments (standalone upload + OCR)
    uploadAttachment: async (file: File): Promise<Attachment> => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/attachments`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!res.ok) throw new ApiError(res.status, await res.text());
      return res.json();
    },
    attachmentFileUrl: (id: string) => `${API_URL}/attachments/${id}/file`,

    // Accounts
    listAccounts: () => f<Account[]>('/accounts'),

    // Classification rules
    listRules: () => f<ClassificationRule[]>('/classification-rules'),

    // Journal / trial balance
    listJournalEntries: () => f<JournalEntry[]>('/journal-entries'),
    reverseJournalEntry: (id: string) => f<JournalEntry>(`/journal-entries/${id}/reverse`, { method: 'POST' }),
    getTrialBalance: () => f<TrialBalance>('/trial-balance'),

    // Fiscal periods
    listPeriods: () => f<FiscalPeriod[]>('/fiscal-periods'),
    getPeriod: (id: string) => f<FiscalPeriod>(`/fiscal-periods/${id}`),
    createPeriod: (data: { label: string; startDate: string; endDate: string }) =>
      f<FiscalPeriod>('/fiscal-periods', { method: 'POST', body: JSON.stringify(data) }),

    // FS mappings
    listFsMappings: () => f<AccountFsMapping[]>('/fs-mappings'),
    upsertFsMapping: (data: {
      accountId: string;
      statement: FsStatement;
      section: string;
      noteLabel: string;
      cashFlowCategory?: CashFlowCategory;
      sortOrder?: number;
    }) => f<AccountFsMapping>('/fs-mappings', { method: 'POST', body: JSON.stringify(data) }),

    // Financial statements
    getIncomeStatement: (periodId: string, comparativePeriodId?: string) =>
      f<{ period: FiscalPeriod; current: IncomeStatementSide; comparative?: IncomeStatementSide }>(
        `/financial-statements/${periodId}/income-statement${comparativePeriodId ? `?comparativePeriodId=${comparativePeriodId}` : ''}`,
      ),
    getBalanceSheet: (periodId: string) =>
      f<{ period: FiscalPeriod; asOf: BalanceSheetSide }>(`/financial-statements/${periodId}/balance-sheet`),
    getChangesInEquity: (periodId: string) =>
      f<{
        period: FiscalPeriod;
        openingEquity: number;
        movements: { accountId: string; code: string; name: string; amount: number }[];
        netIncomeForPeriod: number;
        closingEquity: number;
      }>(`/financial-statements/${periodId}/changes-in-equity`),
    getCashFlow: (periodId: string) =>
      f<{
        period: FiscalPeriod;
        openingCash: number;
        closingCash: number;
        operating: number;
        investing: number;
        financing: number;
        netChange: number;
        reconciles: boolean;
        note?: string;
      }>(`/financial-statements/${periodId}/cash-flow`),
    finalizePeriod: (periodId: string) =>
      f<FiscalPeriod>(`/financial-statements/${periodId}/finalize`, { method: 'POST' }),
    exportUrl: (periodId: string, format: 'xlsx' | 'pdf') =>
      `${API_URL}/financial-statements/${periodId}/export.${format}`,

    // Reconciliation
    listVarianceFlags: (periodId: string) => f<VarianceFlag[]>(`/reconciliation/flags?periodId=${periodId}`),
    scanPeriod: (periodId: string) => f<VarianceFlag[]>(`/reconciliation/scan?periodId=${periodId}`, { method: 'POST' }),
    explainFlag: (id: string, explanation: string) =>
      f<VarianceFlag>(`/reconciliation/flags/${id}/explain`, { method: 'POST', body: JSON.stringify({ explanation }) }),
    listCapitalCommitments: () => f<CapitalCommitment[]>('/reconciliation/capital-commitments'),
    createCapitalCommitment: (data: { shareholderName: string; committedAmount: number; currency?: string }) =>
      f<CapitalCommitment>('/reconciliation/capital-commitments', { method: 'POST', body: JSON.stringify(data) }),

    // Dashboard
    getCashflowDashboard: (months?: number) =>
      f<{ months: { month: string; netChange: number }[]; note?: string }>(
        `/dashboard/cashflow${months ? `?months=${months}` : ''}`,
      ),
    getCapitalDashboard: () =>
      f<{ shareholderName: string; committed: number; paidIn: number; shortfall: number }[]>('/dashboard/capital'),
    getRelatedParty: () => f<{ shareholderName: string; owed: number }[]>('/dashboard/related-party'),
    getBudgetVsActual: (month: string) =>
      f<{ accountId: string; accountName: string; budgeted: number; actual: number; variance: number }[]>(
        `/dashboard/budget?month=${month}`,
      ),
    setBudget: (data: { accountId: string; month: string; amount: number }) =>
      f('/dashboard/budget', { method: 'POST', body: JSON.stringify(data) }),
    getBurnRate: () =>
      f<{ burnRate: number | null; currentCashBalance: number; runwayMonths: number | null; note?: string }>(
        '/dashboard/burn-rate',
      ),

    // Users (admin) & self-service account
    listUsers: () => f<AppUser[]>('/users'),
    createUser: (data: { email: string; name: string; role: Role }) =>
      f<{ user: AppUser; temporaryPassword: string }>('/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id: string, data: { role?: Role; isActive?: boolean }) =>
      f<AppUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    resetUserPassword: (id: string) =>
      f<{ temporaryPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' }),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      f<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),

    // Org-wide settings
    getSettings: () => f<OrgSettings>('/settings'),
    updateSettings: (data: { baseCurrency: string }) =>
      f<OrgSettings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
