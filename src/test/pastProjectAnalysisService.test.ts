import { describe, expect, it } from 'vitest';
import { analyzePastProjects } from '../services/pastProjectAnalysisService';

const customerByProjectCode = new Map([
  ['57061', 'NANYA TECHNOLOGY CORP.'],
  ['57312', 'Micron Technology, Inc.'],
  ['57966', 'KX-Pro 四日市'],
]);

describe('analyzePastProjects', () => {
  it('ユニットNo→PLの組み合わせが完全一致する物件キー同士を重複と判定する', () => {
    const records = [
      { projectKey: '57061_001', unitNo: '1', pl: 'HH11000010' },
      { projectKey: '57061_001', unitNo: '2', pl: 'HH11103B10' },
      { projectKey: '57312_001', unitNo: '1', pl: 'HH11000010' },
      { projectKey: '57312_001', unitNo: '2', pl: 'HH11103B10' },
    ];
    const rows = analyzePastProjects(records, [], customerByProjectCode);
    expect(rows.map(r => r.projectKey)).toEqual(['57061_001', '57312_001']);
    expect(rows[0].isUnique).toBe(false);
    expect(rows[0].duplicateProjectKeys).toEqual(['57312_001']);
    expect(rows[1].duplicateProjectKeys).toEqual(['57061_001']);
  });

  it('ユニット構成が一部でも異なれば重複とみなさない', () => {
    const records = [
      { projectKey: '57966_005', unitNo: '1', pl: 'HH11000010' },
      { projectKey: '57966_010', unitNo: '1', pl: 'HH11000010' },
      { projectKey: '57966_010', unitNo: '2', pl: 'HH11103B10' },
    ];
    const rows = analyzePastProjects(records, [], customerByProjectCode);
    expect(rows.every(r => r.isUnique)).toBe(true);
    expect(rows.every(r => r.duplicateProjectKeys.length === 0)).toBe(true);
  });

  it('3件が同一組み合わせなら、それぞれ残り2件を重複先として示す', () => {
    const records = ['57061_001', '57312_001', '58230_001'].flatMap(projectKey => [
      { projectKey, unitNo: '1', pl: 'HH11000010' },
    ]);
    const rows = analyzePastProjects(records, [], customerByProjectCode);
    for (const row of rows) {
      expect(row.isUnique).toBe(false);
      expect(row.duplicateProjectKeys).toHaveLength(2);
      expect(row.duplicateProjectKeys).not.toContain(row.projectKey);
    }
  });

  it('今回物件のPL入力済みユニットのうち、何割が一致するかで類似度を算出する', () => {
    const records = [
      { projectKey: '57061_001', unitNo: '1', pl: 'HH11000010' },
      { projectKey: '57061_001', unitNo: '2', pl: 'HH11103B10' },
    ];
    const currentUnits = [
      { unitNo: '1', pl: 'HH11000010' },
      { unitNo: '2', pl: '違うPL' },
      { unitNo: '3', pl: '' },
    ];
    const rows = analyzePastProjects(records, currentUnits, customerByProjectCode);
    expect(rows[0].similarityToCurrent).toBe(50);
  });

  it('今回物件にPLが1件も入力されていない場合は類似度0とする', () => {
    const records = [{ projectKey: '57061_001', unitNo: '1', pl: 'HH11000010' }];
    const rows = analyzePastProjects(records, [{ unitNo: '1', pl: '' }], customerByProjectCode);
    expect(rows[0].similarityToCurrent).toBe(0);
  });

  it('物件コードが実績物件一覧に無い場合は客先名を空文字にする', () => {
    const rows = analyzePastProjects([{ projectKey: '99999_001', unitNo: '1', pl: 'X' }], [], customerByProjectCode);
    expect(rows[0].customerName).toBe('');
    expect(rows[0].projectCode).toBe('99999');
    expect(rows[0].serial).toBe('001');
  });

  it('物件キーの昇順で返す', () => {
    const records = [
      { projectKey: '58230_001', unitNo: '1', pl: 'A' },
      { projectKey: '57061_001', unitNo: '1', pl: 'B' },
    ];
    const rows = analyzePastProjects(records, [], customerByProjectCode);
    expect(rows.map(r => r.projectKey)).toEqual(['57061_001', '58230_001']);
  });
});
