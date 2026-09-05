import { useRef, useState } from 'react';
import type { ImportProgress, ImportWarning } from '../types/models';

interface Props {
  title: string;
  acceptName: string;
  columns?: string[];
  columnNote?: string;
  onImport: (file: File, progress: (value: ImportProgress) => void) => Promise<{ imported: number; warnings: ImportWarning[]; elapsedMs: number }>;
  onClipboardImport?: (text: string, progress: (value: ImportProgress) => void) => Promise<{ imported: number; warnings: ImportWarning[]; elapsedMs: number }>;
  extra?: React.ReactNode;
}

export function CsvImport({ title, acceptName, columns, columnNote, onImport, onClipboardImport, extra }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>();
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);

  const run = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setMessage(''); setWarnings([]);
    try {
      const result = await onImport(file, setProgress);
      setMessage(`${result.imported.toLocaleString()}件を登録しました（${(result.elapsedMs / 1000).toFixed(1)}秒）`);
      setWarnings(result.warnings);
    } catch (error) { setMessage(`エラー: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const runClipboard = async () => {
    if (!onClipboardImport || busy) return;
    setBusy(true); setMessage(''); setWarnings([]); setProgress(undefined);
    try {
      if (!navigator.clipboard?.readText) throw new Error('このブラウザではクリップボード読み取りを利用できません');
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('クリップボードにテキストデータがありません');
      const result = await onClipboardImport(text, setProgress);
      setMessage(`${result.imported.toLocaleString()}件を登録しました（${(result.elapsedMs / 1000).toFixed(1)}秒）`);
      setWarnings(result.warnings);
    } catch (error) { setMessage(`エラー: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  return <section className="import-card">
    <div className="import-head"><div><strong>{title}</strong><small>{acceptName}</small></div>{extra}</div>
    {!!columns?.length && <div className="required-columns csv-columns" aria-label="CSVの取り込み列">
      {columns.map((column, index) => <span key={column}>{index + 1}. {column}</span>)}
      {columnNote && <small>{columnNote}</small>}
    </div>}
    <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void run(e.dataTransfer.files[0]); }}>
      <span>CSVをドロップ、または</span><button className="secondary" disabled={busy} onClick={() => input.current?.click()}>ファイルを選択</button>
      {onClipboardImport && <><span>または</span><button className="primary" disabled={busy} onClick={() => void runClipboard()}>{busy ? '取り込み中...' : 'クリップボードから取り込む'}</button></>}
      <input ref={input} hidden type="file" accept=".csv,text/csv" onChange={e => void run(e.target.files?.[0])}/>
    </div>
    {progress && <div className="progress"><div><span>{progress.phase}</span><span>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()}件　{progress.percent}%</span></div><progress max="100" value={progress.percent}/></div>}
    {message && <p className={message.startsWith('エラー') ? 'error-message' : 'success-message'}>{message}</p>}
    {!!warnings.length && <details className="warnings"><summary>警告 {warnings.length.toLocaleString()}件（最大200件表示）</summary><ul>{warnings.slice(0, 200).map((w, i) => <li key={i}>{w.row ? `${w.row}行目: ` : ''}{w.message}</li>)}</ul></details>}
  </section>;
}