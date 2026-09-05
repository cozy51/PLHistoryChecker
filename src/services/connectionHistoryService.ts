import type { Connection, ConnectionHistoryResult, CurrentUnit } from '../types/models';
import type { PastPLRepository } from '../repositories/repositories';
import { pastPLRepository } from '../repositories/repositories';

const cache = new Map<string, Promise<ConnectionHistoryResult>>();
const normalize = (value: string) => value.trim();
const cacheKey = (a: string, b: string) => [a, b].sort().join('|');

export function clearConnectionHistoryCache() { cache.clear(); }

export function resolveConnectionUnits(connection: Connection, units: CurrentUnit[]) {
  const unitsByNo = new Map(units.map(unit => [unit.unitNo, unit]));
  const unitA = unitsByNo.get(connection.unitNoA);
  const unitB = unitsByNo.get(connection.unitNoB);
  return {
    unitNameA: unitA?.unitName ?? '',
    plA: unitA?.pl ?? '',
    unitNameB: unitB?.unitName ?? '',
    plB: unitB?.pl ?? '',
  };
}

export function checkConnectionHistory(plA: string, plB: string, repository: PastPLRepository = pastPLRepository): Promise<ConnectionHistoryResult> {
  const a = normalize(plA); const b = normalize(plB);
  if (!a || !b) return Promise.resolve({ status: 'N/A', count: 0, projectKeys: [] });
  const key = cacheKey(a, b);
  const existing = cache.get(key); if (existing) return existing;
  const request: Promise<ConnectionHistoryResult> = (async () => {
    const keysA = await repository.findProjectKeysByPL(a);
    const projectKeys = a === b ? keysA : (() => {
      return repository.findProjectKeysByPL(b).then(keysB => {
        const setB = new Set(keysB);
        return keysA.filter(k => setB.has(k));
      });
    })();
    const keys = await projectKeys;
    keys.sort((x, y) => x.localeCompare(y));
    return { status: keys.length ? 'あり' : 'なし', count: keys.length, projectKeys: keys };
  })();
  const guardedRequest = request.catch(error => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, guardedRequest);
  return guardedRequest;
}