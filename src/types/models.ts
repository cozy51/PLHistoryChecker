export interface CurrentUnit { id?: number; unitNo: string; unitName: string; pl: string }
export interface CurrentPLRecord { id: number; pl: string }
export interface LegacyCurrentUnitRecord { id?: number; unitNo: string; unitName?: string; pl: string }
export interface Connection { id?: number; connectionNo: string; unitNoA: string; unitNoB: string }
export interface PastProject { id?: number; projectCode: string; customerName: string }
export interface PastPLRecord { id?: number; uniqueKey: string; projectKey: string; unitNo: string; unitName: string; pl: string }
export type HistoryStatus = 'あり' | 'なし' | 'N/A';
export interface ConnectionHistoryResult { status: HistoryStatus; count: number; projectKeys: string[] }
export interface ImportWarning { row?: number; message: string }
export interface ImportProgress { phase: string; processed: number; total: number; percent: number; elapsedMs: number }
export type ImportMode = 'replace' | 'append';