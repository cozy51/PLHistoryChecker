import { db } from '../db/database';
import { pastPLRepository, pastProjectRepository } from '../repositories/repositories';
import type { DriveBackupPayload, PastPLRecord, PastProject } from '../types/models';
import { clearConnectionHistoryCache } from './connectionHistoryService';

/** WebAppsData フォルダ（固定・変更しない）。この配下にのみ保存する。 */
export const DRIVE_PARENT_FOLDER_ID = '1SWmOnYn98EN5nZs7Jsi3vBLkuJa4B_O6';
const APP_FOLDER_NAME = 'PLHistoryChecker';
const BACKUP_FILE_NAME = 'plhistorychecker-backup.json';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const WAS_SIGNED_IN_KEY = 'plhc.driveWasSignedIn';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

interface GisTokenResponse { access_token?: string; expires_in?: number; error?: string }
interface GisTokenClient { requestAccessToken: (opts?: { prompt?: string }) => void }
interface GisErrorLike { message?: string; type?: string }
interface GoogleGis {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: GisTokenResponse) => void;
        error_callback?: (error: GisErrorLike) => void;
      }) => GisTokenClient;
      revoke: (token: string, callback: () => void) => void;
    };
  };
}
declare global { interface Window { google?: GoogleGis } }

export interface DriveStatus {
  configured: boolean;
  signedIn: boolean;
  syncing: boolean;
  lastSyncedAt?: string;
  lastError?: string;
}

export function isDriveConfigured(): boolean { return !!CLIENT_ID; }

export function buildBackupPayload(pastProjects: PastProject[], pastPLRecords: PastPLRecord[]): DriveBackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    pastProjects: pastProjects.map(({ projectCode, customerName }) => ({ projectCode, customerName })),
    pastPLRecords: pastPLRecords.map(({ uniqueKey, projectKey, unitNo, unitName, pl }) => ({ uniqueKey, projectKey, unitNo, unitName, pl })),
  };
}

export function parseBackupPayload(text: string): DriveBackupPayload {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('バックアップファイルがJSONとして読み込めません'); }
  if (!data || typeof data !== 'object' || !Array.isArray((data as DriveBackupPayload).pastProjects) || !Array.isArray((data as DriveBackupPayload).pastPLRecords)) {
    throw new Error('バックアップファイルの形式が不正です');
  }
  return data as DriveBackupPayload;
}

let status: DriveStatus = { configured: isDriveConfigured(), signedIn: false, syncing: false };
const listeners = new Set<(value: DriveStatus) => void>();
function setStatus(patch: Partial<DriveStatus>) {
  status = { ...status, ...patch };
  listeners.forEach(listener => listener(status));
}
export function getDriveStatus(): DriveStatus { return status; }
export function subscribeDriveStatus(listener: (value: DriveStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

let gisLoading: Promise<void> | undefined;
function loadGis(): Promise<void> {
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const existing = document.getElementById('google-identity-script');
    if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('Google Identity Servicesの読み込みに失敗しました'))); return; }
    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Servicesの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
  return gisLoading;
}

let accessToken: string | undefined;
let tokenExpiresAt = 0;

function requestAccessToken(interactive: boolean): Promise<string> {
  return loadGis().then(() => new Promise<string>((resolve, reject) => {
    if (!CLIENT_ID) { reject(new Error('VITE_GOOGLE_CLIENT_IDが設定されていません')); return; }
    const google = window.google;
    if (!google) { reject(new Error('Google Identity Servicesを利用できません')); return; }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: response => {
        if (!response.access_token) { reject(new Error(response.error || 'Google認証に失敗しました')); return; }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 60_000;
        resolve(accessToken);
      },
      error_callback: error => reject(new Error(error.message || 'Google認証がキャンセルされました')),
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  }));
}

async function getAccessToken(interactive: boolean): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  const token = await requestAccessToken(interactive);
  setStatus({ signedIn: true, lastError: undefined });
  return token;
}

export async function signIn(): Promise<void> {
  await getAccessToken(true);
  localStorage.setItem(WAS_SIGNED_IN_KEY, '1');
}

export function signOut(): void {
  const google = window.google;
  if (accessToken) google?.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = undefined;
  tokenExpiresAt = 0;
  localStorage.removeItem(WAS_SIGNED_IN_KEY);
  setStatus({ signedIn: false });
}

/** 前回サインイン済みなら、ポップアップを出さずに静かに再認証を試みる。失敗しても何もしない。 */
export async function trySilentSignIn(): Promise<void> {
  if (!isDriveConfigured() || localStorage.getItem(WAS_SIGNED_IN_KEY) !== '1') return;
  try { await getAccessToken(false); } catch { /* サインインボタンから再試行してもらう */ }
}

async function getDriveConfig() {
  const row = await db.driveSettings.get('app');
  return { appFolderId: row?.appFolderId, backupFileId: row?.backupFileId };
}
async function saveDriveConfig(patch: Partial<{ appFolderId: string; backupFileId: string; lastSyncedAt: string }>) {
  const existing = await db.driveSettings.get('app');
  await db.driveSettings.put({ key: 'app', ...existing, ...patch });
}

function authHeader(token: string) { return { Authorization: `Bearer ${token}` }; }

/** WebAppsData配下のPLHistoryCheckerフォルダIDを取得する。一度作成/発見した後は必ずIDベースで再利用し、名前検索はしない。 */
async function ensureAppFolder(token: string): Promise<string> {
  const config = await getDriveConfig();
  if (config.appFolderId) return config.appFolderId;
  const query = encodeURIComponent(`'${DRIVE_PARENT_FOLDER_ID}' in parents and name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const listRes = await fetch(`${DRIVE_API}/files?q=${query}&fields=files(id)`, { headers: authHeader(token) });
  if (!listRes.ok) throw new Error(`Google Driveフォルダの検索に失敗しました (${listRes.status})`);
  const listData: { files?: { id: string }[] } = await listRes.json();
  let folderId = listData.files?.[0]?.id;
  if (!folderId) {
    const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_PARENT_FOLDER_ID] }),
    });
    if (!createRes.ok) throw new Error(`Google Driveフォルダの作成に失敗しました (${createRes.status})`);
    const created: { id: string } = await createRes.json();
    folderId = created.id;
  }
  await saveDriveConfig({ appFolderId: folderId });
  return folderId;
}

async function findBackupFileId(token: string, folderId: string): Promise<string | undefined> {
  const query = encodeURIComponent(`'${folderId}' in parents and name='${BACKUP_FILE_NAME}' and trashed=false`);
  const listRes = await fetch(`${DRIVE_API}/files?q=${query}&fields=files(id)`, { headers: authHeader(token) });
  if (!listRes.ok) throw new Error(`Google Driveファイルの検索に失敗しました (${listRes.status})`);
  const listData: { files?: { id: string }[] } = await listRes.json();
  return listData.files?.[0]?.id;
}

async function createBackupFile(token: string, folderId: string, body: string): Promise<string> {
  const metadata = { name: BACKUP_FILE_NAME, parents: [folderId], mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([body], { type: 'application/json' }));
  const createRes = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: authHeader(token), body: form });
  if (!createRes.ok) throw new Error(`Google Driveへの保存に失敗しました (${createRes.status})`);
  const created: { id: string } = await createRes.json();
  return created.id;
}

/** バックアップ内容を、キャッシュ済みのファイルIDに対して上書き保存する。ID未取得時のみ検索・作成を行い、以後は同一ファイルを使い続ける。 */
async function uploadBackupFile(token: string, folderId: string, body: string): Promise<void> {
  const config = await getDriveConfig();
  if (config.backupFileId) {
    const res = await fetch(`${DRIVE_UPLOAD_API}/files/${config.backupFileId}?uploadType=media`, { method: 'PATCH', headers: { ...authHeader(token), 'Content-Type': 'application/json' }, body });
    if (res.ok) return;
    if (res.status !== 404) throw new Error(`Google Driveへの保存に失敗しました (${res.status})`);
  }
  const existingId = await findBackupFileId(token, folderId);
  if (existingId) {
    const res = await fetch(`${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=media`, { method: 'PATCH', headers: { ...authHeader(token), 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error(`Google Driveへの保存に失敗しました (${res.status})`);
    await saveDriveConfig({ backupFileId: existingId });
    return;
  }
  const createdId = await createBackupFile(token, folderId, body);
  await saveDriveConfig({ backupFileId: createdId });
}

async function runBackup(interactive: boolean): Promise<void> {
  if (!isDriveConfigured()) return;
  setStatus({ syncing: true, lastError: undefined });
  try {
    const token = await getAccessToken(interactive);
    const folderId = await ensureAppFolder(token);
    const [pastProjects, pastPLRecords] = await Promise.all([pastProjectRepository.all(), pastPLRepository.all()]);
    const payload = buildBackupPayload(pastProjects, pastPLRecords);
    await uploadBackupFile(token, folderId, JSON.stringify(payload));
    const lastSyncedAt = new Date().toISOString();
    await saveDriveConfig({ lastSyncedAt });
    setStatus({ signedIn: true, syncing: false, lastSyncedAt });
  } catch (error) {
    setStatus({ syncing: false, lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** ユーザー操作（サインインボタン）から呼び出す即時バックアップ。認証ポップアップを許可する。 */
export function backupNow(): Promise<void> { return runBackup(true); }

let backupTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * 実績データ変更後に呼び出す。前回サインイン済みの場合のみ、一定時間後に自動保存する。
 * ポップアップは出さない（サイレント認証に失敗した場合は何もせずエラー状態にする）。
 */
export function scheduleDriveBackup(delayMs = 2000): void {
  if (!isDriveConfigured() || localStorage.getItem(WAS_SIGNED_IN_KEY) !== '1') return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => { void runBackup(false); }, delayMs);
}

export async function restoreFromDrive(): Promise<{ pastProjects: number; pastPLRecords: number }> {
  if (!isDriveConfigured()) throw new Error('Google Drive連携が設定されていません');
  setStatus({ syncing: true, lastError: undefined });
  try {
    const token = await getAccessToken(true);
    const folderId = await ensureAppFolder(token);
    let fileId = (await getDriveConfig()).backupFileId ?? await findBackupFileId(token, folderId);
    if (!fileId) throw new Error('Google Driveにバックアップファイルが見つかりません');
    await saveDriveConfig({ backupFileId: fileId });
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: authHeader(token) });
    if (!res.ok) throw new Error(`Google Driveからの取得に失敗しました (${res.status})`);
    const payload = parseBackupPayload(await res.text());
    await pastProjectRepository.import(payload.pastProjects, 'replace');
    await pastPLRepository.clear();
    for (let i = 0; i < payload.pastPLRecords.length; i += 1000) {
      await pastPLRepository.importRecords(payload.pastPLRecords.slice(i, i + 1000));
    }
    clearConnectionHistoryCache();
    setStatus({ signedIn: true, syncing: false });
    return { pastProjects: payload.pastProjects.length, pastPLRecords: payload.pastPLRecords.length };
  } catch (error) {
    setStatus({ syncing: false, lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
