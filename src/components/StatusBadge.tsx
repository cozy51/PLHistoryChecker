import type { HistoryStatus } from '../types/models';
export function StatusBadge({ status }: { status: HistoryStatus }) {
  return <span className={`status status-${status === 'あり' ? 'yes' : status === 'なし' ? 'no' : 'na'}`}>{status === 'あり' ? '✔ あり' : status === 'なし' ? '✕ なし' : 'N/A'}</span>;
}