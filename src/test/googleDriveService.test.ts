import { describe, expect, it } from 'vitest';
import { buildBackupPayload, isDriveConfigured, parseBackupPayload } from '../services/googleDriveService';

describe('Google Driveバックアップのペイロード', () => {
  it('実績物件・実績PLから保存用IDフィールドを除いたJSON構造を作る', () => {
    const payload = buildBackupPayload(
      [{ id: 1, projectCode: '95742', customerName: 'Sample Customer' }],
      [{ id: 9, uniqueKey: '95742_001|1|HH11002010', projectKey: '95742_001', unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)', pl: 'HH11002010' }],
    );
    expect(payload.version).toBe(1);
    expect(typeof payload.exportedAt).toBe('string');
    expect(payload.pastProjects).toEqual([{ projectCode: '95742', customerName: 'Sample Customer' }]);
    expect(payload.pastPLRecords).toEqual([{ uniqueKey: '95742_001|1|HH11002010', projectKey: '95742_001', unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)', pl: 'HH11002010' }]);
  });

  it('往復（build→JSON文字列化→parse）で内容が保持される', () => {
    const payload = buildBackupPayload(
      [{ projectCode: '61090', customerName: 'HuaiAn Imaging Device Manufacturer Corpo' }],
      [{ uniqueKey: 'k1', projectKey: '61090_001', unitNo: '2', unitName: 'STEERING UNIT(R)', pl: 'HH11104B10' }],
    );
    const restored = parseBackupPayload(JSON.stringify(payload));
    expect(restored).toEqual(payload);
  });

  it('不正なJSONは例外を投げる', () => {
    expect(() => parseBackupPayload('{not json')).toThrow('JSON');
  });

  it('pastProjects/pastPLRecordsを含まない構造は例外を投げる', () => {
    expect(() => parseBackupPayload(JSON.stringify({ version: 1 }))).toThrow('形式が不正');
  });

  it('VITE_GOOGLE_CLIENT_ID未設定時はisDriveConfiguredがfalseを返す', () => {
    expect(isDriveConfigured()).toBe(false);
  });
});
