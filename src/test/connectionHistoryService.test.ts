import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PastPLRepository } from '../repositories/repositories';
import { checkConnectionHistory, clearConnectionHistoryCache, resolveConnectionUnits } from '../services/connectionHistoryService';

function repository(data: Record<string, string[]>): PastPLRepository {
  return {
    findProjectKeysByPL: vi.fn(async pl => data[pl] ?? []),
    importRecords: vi.fn(), count: vi.fn(), clear: vi.fn(), deleteById: vi.fn(),
  };
}

describe('checkConnectionHistory', () => {
  beforeEach(clearConnectionHistoryCache);

  it('同一物件に両PLがあれば「あり」を返す', async () => {
    const result = await checkConnectionHistory('A', 'B', repository({ A: ['P1'], B: ['P1'] }));
    expect(result).toEqual({ status: 'あり', count: 1, projectKeys: ['P1'] });
  });

  it('両PLが別物件にしかなければ「なし」を返す', async () => {
    expect(await checkConnectionHistory('A', 'B', repository({ A: ['P1'], B: ['P2'] }))).toEqual({ status: 'なし', count: 0, projectKeys: [] });
  });

  it.each([['', 'B'], ['A', '']])('片方のPLが空ならN/Aを返す', async (a, b) => {
    const repo = repository({});
    expect(await checkConnectionHistory(a, b, repo)).toEqual({ status: 'N/A', count: 0, projectKeys: [] });
    expect(repo.findProjectKeysByPL).not.toHaveBeenCalled();
  });

  it('同じPL同士は1回だけ検索して、そのPLがある全物件を返す', async () => {
    const repo = repository({ A: ['P2', 'P1'] });
    expect(await checkConnectionHistory('A', 'A', repo)).toEqual({ status: 'あり', count: 2, projectKeys: ['P1', 'P2'] });
    expect(repo.findProjectKeysByPL).toHaveBeenCalledTimes(1);
  });

  it('複数の共通物件をすべて返す', async () => {
    const result = await checkConnectionHistory('A', 'B', repository({ A: ['P1', 'P2', 'P3'], B: ['P3', 'P1'] }));
    expect(result).toEqual({ status: 'あり', count: 2, projectKeys: ['P1', 'P3'] });
  });

  it('PLの順序を逆にしても同じキャッシュ結果を返す', async () => {
    const repo = repository({ A: ['P1'], B: ['P1'] });
    const forward = await checkConnectionHistory('A', 'B', repo);
    const reverse = await checkConnectionHistory('B', 'A', repo);
    expect(reverse).toEqual(forward);
    expect(repo.findProjectKeysByPL).toHaveBeenCalledTimes(2);
  });

  it('大量データの判定でもRepositoryのPL検索だけを呼ぶ', async () => {
    const many = Array.from({ length: 100_001 }, (_, i) => `P${i}`);
    const repo = repository({ A: many, B: ['P100000'] });
    expect(await checkConnectionHistory('A', 'B', repo)).toEqual({ status: 'あり', count: 1, projectKeys: ['P100000'] });
    expect(repo.findProjectKeysByPL).toHaveBeenNthCalledWith(1, 'A');
    expect(repo.findProjectKeysByPL).toHaveBeenNthCalledWith(2, 'B');
  });
});

describe('resolveConnectionUnits', () => {
  it('今回物件のユニットNoをキーにA/Bの名称とPLを取得する', () => {
    const resolved = resolveConnectionUnits(
      { connectionNo: '接続1', unitNoA: '20', unitNoB: '10' },
      [
        { unitNo: '10', unitName: 'UNIT TEN', pl: 'PL-10' },
        { unitNo: '20', unitName: 'UNIT TWENTY', pl: 'PL-20' },
      ],
    );
    expect(resolved).toEqual({ unitNameA: 'UNIT TWENTY', plA: 'PL-20', unitNameB: 'UNIT TEN', plB: 'PL-10' });
  });

  it('今回物件に存在しないユニットNoは空欄として返す', () => {
    expect(resolveConnectionUnits({ connectionNo: '接続1', unitNoA: '1', unitNoB: '99' }, [
      { unitNo: '1', unitName: 'UNIT A', pl: 'PL-A' },
    ])).toEqual({ unitNameA: 'UNIT A', plA: 'PL-A', unitNameB: '', plB: '' });
  });
});