import { useState } from 'react';
import { importCurrentUnitsText } from '../services/csvImportService';
import type { ImportWarning } from '../types/models';

export function ClipboardCurrentUnitsImport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);

  const importClipboard = async () => {
    if (busy) return;
    setBusy(true); setMessage(''); setWarnings([]);
    try {
      if (!navigator.clipboard?.readText) throw new Error('このブラウザではクリップボード読み取りを利用できません');
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('クリップボードにテキストデータがありません');
      const result = await importCurrentUnitsText(text);
      setWarnings(result.warnings);
      setMessage(`${result.imported.toLocaleString()}件を今回物件として登録しました`);
    } catch (error) { setMessage(`エラー: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  return <section className="import-card clipboard-import">
    <div className="import-head">
      <div><strong>クリップボードから取り込み</strong><small>Excelから次の2列だけをコピーしてください。ユニット名はアプリから自動表示します。</small></div>
      <button className="primary" disabled={busy} onClick={() => void importClipboard()}>{busy ? '取り込み中...' : 'クリップボードから取り込む（置換）'}</button>
    </div>
    <div className="required-columns" aria-label="取り込む列"><span>1. ユニットNo</span><span>2. PL</span><small>ユニット名はアプリ内の固定ユニットマスターから取得します。</small></div>
    {message && <p className={message.startsWith('エラー') ? 'error-message' : 'success-message'}>{message}</p>}
    {!!warnings.length && <details className="warnings"><summary>警告 {warnings.length.toLocaleString()}件</summary><ul>{warnings.slice(0, 200).map((warning, index) => <li key={index}>{warning.row ? `${warning.row}行目: ` : ''}{warning.message}</li>)}</ul></details>}
  </section>;
}