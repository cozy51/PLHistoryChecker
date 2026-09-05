import type { Table } from 'dexie';
import { db, type UnitConnectionHistoryDatabase } from '../db/database';
import { UNIT_MASTER } from '../data/unitMaster';
import type { CurrentPLRecord, CurrentUnit, ImportMode, PastPLRecord, PastProject } from '../types/models';

export interface PastPLRepository {
  findProjectKeysByPL(pl: string): Promise<string[]>;
  importRecords(records: PastPLRecord[]): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
  deleteById(id: number): Promise<void>;
}

class BaseRepository<T extends { id?: number }> {
  constructor(protected table: Table<T, number | undefined, any>) {}
  all() { return this.table.toArray(); }
  count() { return this.table.count(); }
  clear() { return this.table.clear(); }
  async deleteById(id: number) { await this.table.delete(id); }
}

export class IndexedDbCurrentProjectRepository {
  constructor(private database: UnitConnectionHistoryDatabase = db) {}
  async all(): Promise<CurrentUnit[]> {
    const records = await this.database.currentPLs.toArray();
    const recordsById = new Map(records.map(record => [record.id, record]));
    return UNIT_MASTER.map((master, index) => ({ ...master, id: index + 1, pl: recordsById.get(index + 1)?.pl ?? '' }));
  }
  async replace(items: Pick<CurrentUnit, 'unitNo'|'pl'>[]) {
    const idByUnitNo = new Map(UNIT_MASTER.map((unit, index) => [unit.unitNo, index + 1]));
    const records: CurrentPLRecord[] = items.flatMap(item => {
      const id = idByUnitNo.get(item.unitNo);
      return id === undefined ? [] : [{ id, pl: item.pl }];
    });
    await this.database.transaction('rw', this.database.currentPLs, async () => { await this.database.currentPLs.clear(); await this.database.currentPLs.bulkPut(records); });
  }
  async updatePL(unitNo: string, pl: string) {
    const id = UNIT_MASTER.findIndex(unit => unit.unitNo === unitNo) + 1;
    if (id > 0) await this.database.currentPLs.put({ id, pl });
  }
  async clearPL(unitNo: string) { await this.updatePL(unitNo, ''); }
}

export class IndexedDbPastProjectRepository extends BaseRepository<PastProject> {
  constructor(database: UnitConnectionHistoryDatabase = db) { super(database.pastProjects); }
  async import(items: PastProject[], mode: ImportMode) {
    const deduplicated = [...new Map(items.map(item => [item.projectCode, item])).values()];
    await this.table.db.transaction('rw', this.table, async () => {
      if (mode === 'replace') await this.table.clear();
      const existing = mode === 'append' && deduplicated.length
        ? await this.table.where('projectCode').anyOf(deduplicated.map(item => item.projectCode)).toArray()
        : [];
      const ids = new Map(existing.map(item => [item.projectCode, item.id]));
      await this.table.bulkPut(deduplicated.map(item => ({ ...item, id: ids.get(item.projectCode) })));
    });
  }
  async findByKeys(keys: string[]) {
    const projectCodes = [...new Set(keys.map(key => key.slice(0, 5)).filter(Boolean))];
    return projectCodes.length ? this.table.where('projectCode').anyOf(projectCodes).toArray() : [];
  }
}

export class IndexedDbPastPLRepository extends BaseRepository<PastPLRecord> implements PastPLRepository {
  constructor(private database: UnitConnectionHistoryDatabase = db) { super(database.pastPLRecords); }
  async findProjectKeysByPL(pl: string): Promise<string[]> {
    const records = await this.table.where('pl').equals(pl).toArray();
    return [...new Set(records.map(({ projectKey }) => projectKey))];
  }
  async importRecords(records: PastPLRecord[]) {
    if (!records.length) return;
    const deduplicated = [...new Map(records.map(record => [record.uniqueKey, record])).values()];
    await this.database.transaction('rw', this.database.pastPLRecords, async () => {
      const existing = await this.database.pastPLRecords.where('uniqueKey').anyOf(deduplicated.map(record => record.uniqueKey)).toArray();
      const ids = new Map(existing.map(record => [record.uniqueKey, record.id]));
      await this.database.pastPLRecords.bulkPut(deduplicated.map(record => ({ ...record, id: ids.get(record.uniqueKey) })));
    });
  }
  async page(page: number, size: number, field?: 'projectKey'|'pl'|'unitNo'|'unitName', exact?: string) {
    if (field && exact) return this.table.where(field).equals(exact).offset(page * size).limit(size).toArray();
    return this.table.orderBy('projectKey').offset(page * size).limit(size).toArray();
  }
  distinctProjectKeys(): Promise<string[]> {
    return this.database.pastPLRecords.orderBy('projectKey').uniqueKeys() as Promise<string[]>;
  }
}

export const currentProjectRepository = new IndexedDbCurrentProjectRepository();
export const pastProjectRepository = new IndexedDbPastProjectRepository();
export const pastPLRepository = new IndexedDbPastPLRepository();