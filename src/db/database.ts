import Dexie, { type EntityTable } from 'dexie';
import { UNIT_MASTER } from '../data/unitMaster';
import type { CurrentPLRecord, LegacyCurrentUnitRecord, PastPLRecord, PastProject } from '../types/models';

export class UnitConnectionHistoryDatabase extends Dexie {
  currentPLs!: EntityTable<CurrentPLRecord, 'id'>;
  pastProjects!: EntityTable<PastProject, 'id'>;
  pastPLRecords!: EntityTable<PastPLRecord, 'id'>;

  constructor(name = 'UnitConnectionHistoryDB') {
    super(name);
    this.version(1).stores({
      currentUnits: '++id, unitNo, pl',
      connections: '++id, connectionNo, unitNoA, unitNoB',
      pastProjects: '++id, projectCode, &projectKey',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    });
    this.version(2).stores({
      currentUnits: '++id, unitNo, pl',
      currentPLs: 'id, pl',
      connections: '++id, connectionNo, unitNoA, unitNoB',
      pastProjects: '++id, projectCode, &projectKey',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    }).upgrade(async transaction => {
      const oldRecords = await transaction.table<LegacyCurrentUnitRecord>('currentUnits').toArray();
      const masterIdByUnitNo = new Map(UNIT_MASTER.map((unit, index) => [unit.unitNo, index + 1]));
      const migrated = oldRecords.flatMap(record => {
        const id = masterIdByUnitNo.get(record.unitNo);
        return id === undefined ? [] : [{ id, pl: record.pl ?? '' }];
      });
      if (migrated.length) await transaction.table<CurrentPLRecord>('currentPLs').bulkPut(migrated);
      await transaction.table('currentUnits').clear();
    });
    this.version(3).stores({
      currentUnits: null,
      currentPLs: 'id, pl',
      connections: '++id, connectionNo, unitNoA, unitNoB',
      pastProjects: '++id, projectCode, &projectKey',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    });
    this.version(4).stores({
      connections: null,
      currentPLs: 'id, pl',
      pastProjects: '++id, projectCode, &projectKey',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    });
    this.version(5).stores({
      currentPLs: 'id, pl',
      pastProjects: '++id, projectCode',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    }).upgrade(async transaction => {
      const projects = await transaction.table('pastProjects').toArray();
      const deduplicated = [...new Map(projects.map(project => [project.projectCode, {
        projectCode: project.projectCode,
        customerName: project.customerName,
      }])).values()];
      await transaction.table('pastProjects').clear();
      await transaction.table('pastProjects').bulkAdd(deduplicated);
    });
    this.version(6).stores({
      currentPLs: 'id, pl',
      pastProjects: '++id, &projectCode',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    });
    this.version(7).stores({
      currentPLs: 'id, pl',
      pastProjects: '++id, &projectCode',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    }).upgrade(async transaction => {
      const unitNames = new Map(UNIT_MASTER.map(unit => [unit.unitNo, unit.unitName]));
      await transaction.table<PastPLRecord>('pastPLRecords').where('unitNo').anyOf('23', '24').modify(record => {
        record.unitName = unitNames.get(record.unitNo) ?? record.unitName;
      });
    });
  }
}

export const db = new UnitConnectionHistoryDatabase();