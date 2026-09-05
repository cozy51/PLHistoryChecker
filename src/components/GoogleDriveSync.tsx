import { useEffect, useState } from 'react';
import { backupNow, getDriveStatus, restoreFromDrive, signIn, signOut, subscribeDriveStatus, trySilentSignIn } from '../services/googleDriveService';

export function GoogleDriveSync() {
  const [status, setStatus] = useState(getDriveStatus());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => subscribeDriveStatus(setStatus), []);
  useEffect(() => { void trySilentSignIn(); }, []);

  if (!status.configured) {
    return <section className="import-card"><div className="import-head"><div><strong>Google Drive連携</strong><small>実績データの自動バックアップ</small></div></div><p className="hint">未設定です。環境変数 VITE_GOOGLE_CLIENT_ID を設定すると利用できます。</p></section>;
  }

  const runSignIn = async () => {
    setBusy(true); setMessage('');
    try { await signIn(); await backupNow(); setMessage('サインインし、現在のデータをGoogle Driveに保存しました'); }
    catch (error) { setMessage(`エラー: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  const runRestore = async () => {
    if (!window.confirm('Google Driveに保存されている実績データで、このブラウザの実績物件・実績PLを上書きします。\n\nこの操作は元に戻せません。復元を実行しますか？')) return;
    setBusy(true); setMessage('');
    try { const result = await restoreFromDrive(); setMessage(`実績物件 ${result.pastProjects.toLocaleString()}件、実績PL ${result.pastPLRecords.toLocaleString()}件を復元しました`); }
    catch (error) { setMessage(`エラー: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  return <section className="import-card">
    <div className="import-head">
      <div><strong>Google Drive連携</strong><small>実績データの変更を自動でGoogle Driveに保存します</small></div>
      {status.signedIn
        ? <button className="secondary" disabled={busy} onClick={() => signOut()}>サインアウト</button>
        : <button className="primary" disabled={busy} onClick={() => void runSignIn()}>Googleでサインイン</button>}
    </div>
    <p className="hint">
      {status.signedIn ? '連携中：データ変更後、自動的にGoogle Driveへ保存されます。' : '未サインインです。サインインすると自動保存が有効になります。'}
      {status.syncing && '（保存中...）'}
      {!status.syncing && status.lastSyncedAt && `　最終保存: ${new Date(status.lastSyncedAt).toLocaleString('ja-JP')}`}
    </p>
    {status.signedIn && <button className="secondary" disabled={busy} onClick={() => void runRestore()}>Google Driveから復元</button>}
    {(message || status.lastError) && <p className={status.lastError ? 'error-message' : 'success-message'}>{message || `エラー: ${status.lastError}`}</p>}
  </section>;
}
