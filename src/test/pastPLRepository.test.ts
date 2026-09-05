import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { UnitConnectionHistoryDatabase } from '../db/database';
import { IndexedDbCurrentProjectRepository, IndexedDbPastPLRepository, IndexedDbPastProjectRepository } from '../repositories/repositories';
import { CONNECTION_MASTER } from '../data/connectionMaster';
import { UNIT_MASTER_BY_NO } from '../data/unitMaster';
import type { PastPLRecord } from '../types/models';

const databases: UnitConnectionHistoryDatabase[] = [];
const record = (projectKey: string, unitNo: string, pl: string): PastPLRecord => ({ projectKey, unitNo, unitName: `Unit ${unitNo}`, pl, uniqueKey: `${projectKey}|${unitNo}|${pl}` });
function createDb(name = `test-${crypto.randomUUID()}`) { const database = new UnitConnectionHistoryDatabase(name); databases.push(database); return database; }

afterEach(async () => { for (const database of databases.splice(0)) { database.close(); await database.delete(); } });

describe('IndexedDbPastPLRepository', () => {
  it('PLインデックスで物件キーを検索し重複を除く', async () => {
    const repo = new IndexedDbPastPLRepository(createDb());
    await repo.importRecords([record('P1','1','A'), record('P1','2','A'), record('P2','1','A'), record('P3','1','B')]);
    expect((await repo.findProjectKeysByPL('A')).sort()).toEqual(['P1','P2']);
  });

  it('同じuniqueKeyの再投入で重複せず更新する', async () => {
    const repo = new IndexedDbPastPLRepository(createDb());
    await repo.importRecords([record('P1','1','A')]);
    await repo.importRecords([{ ...record('P1','1','A'), unitName: 'Updated' }]);
    expect(await repo.count()).toBe(1);
    expect((await repo.page(0, 10))[0].unitName).toBe('Updated');
  });

  it('DBを閉じて再オープンしても実績を保持する', async () => {
    const name = `persist-${crypto.randomUUID()}`;
    const first = createDb(name); const firstRepo = new IndexedDbPastPLRepository(first);
    await firstRepo.importRecords([record('P1','1','A')]); first.close();
    const reopened = createDb(name); const reopenedRepo = new IndexedDbPastPLRepository(reopened);
    expect(await reopenedRepo.findProjectKeysByPL('A')).toEqual(['P1']);
  });

  it('clear後に古いデータが残らない', async () => {
    const repo = new IndexedDbPastPLRepository(createDb());
    await repo.importRecords([record('OLD','1','OLD')]); await repo.clear(); await repo.importRecords([record('NEW','1','NEW')]);
    expect(await repo.findProjectKeysByPL('OLD')).toEqual([]);
    expect(await repo.findProjectKeysByPL('NEW')).toEqual(['NEW']);
  });

  it('ID指定で実績PLを1件だけ削除する', async () => {
    const repo = new IndexedDbPastPLRepository(createDb());
    await repo.importRecords([record('P1','1','A'), record('P2','2','B')]);
    const target = (await repo.page(0, 10)).find(item => item.pl === 'A');
    await repo.deleteById(target!.id!);
    expect(await repo.findProjectKeysByPL('A')).toEqual([]);
    expect(await repo.findProjectKeysByPL('B')).toEqual(['P2']);
  });
});

describe('各一覧Repositoryの行削除', () => {
  it('ユニット23・24に最新の固定名称を使用する', () => {
    expect(UNIT_MASTER_BY_NO.get('23')?.unitName).toBe('CLEANING NOZZLE UNIT');
    expect(UNIT_MASTER_BY_NO.get('24')?.unitName).toBe('CLEANER UNIT');
  });

  it('今回物件のPLをクリアしても固定マスター行を維持する', async () => {
    const repo = new IndexedDbCurrentProjectRepository(createDb());
    await repo.replace([{ unitNo: '1', pl: 'A' }, { unitNo: '2', pl: 'B' }]);
    await repo.clearPL('1');
    const units = await repo.all();
    expect(units).toHaveLength(24);
    expect(units[0]).toMatchObject({ unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)', pl: '' });
    expect(units[1]).toMatchObject({ unitNo: '2', unitName: 'STEERING UNIT(R)', pl: 'B' });
  });

  it('実績物件をID指定で1件だけ削除する', async () => {
    const repo = new IndexedDbPastProjectRepository(createDb());
    await repo.import([{ projectCode: '00001', customerName: 'A' }, { projectCode: '00002', customerName: 'B' }], 'replace');
    const target = (await repo.all()).find(item => item.projectCode === '00001');
    await repo.deleteById(target!.id!);
    expect((await repo.all()).map(item => item.projectCode)).toEqual(['00002']);
  });

  it('物件キーの先頭5文字に一致する実績物件を検索する', async () => {
    const repo = new IndexedDbPastProjectRepository(createDb());
    await repo.import([{ projectCode: '95742', customerName: 'Customer A' }], 'replace');
    expect(await repo.findByKeys(['95742_001'])).toEqual([expect.objectContaining({ customerName: 'Customer A' })]);
  });
});

describe('今回物件データベース移行', () => {
  it('旧currentUnitsからPLを移行し、ユニットNo・名称をDBに残さない', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      currentUnits: '++id, unitNo, pl',
      connections: '++id, connectionNo, unitNoA, unitNoB',
      pastProjects: '++id, projectCode, &projectKey',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, [pl+projectKey]',
    });
    await legacy.table('currentUnits').bulkAdd([
      { unitNo: '1', unitName: 'OLD NAME', pl: 'PL-1' },
      { unitNo: '2', unitName: 'OLD NAME 2', pl: 'PL-2' },
    ]);
    legacy.close();

    const upgraded = createDb(name);
    await upgraded.open();
    expect(await upgraded.currentPLs.toArray()).toEqual([{ id: 1, pl: 'PL-1' }, { id: 2, pl: 'PL-2' }]);
    expect(upgraded.tables.map(table => table.name)).not.toContain('currentUnits');
    const units = await new IndexedDbCurrentProjectRepository(upgraded).all();
    expect(units[0]).toMatchObject({ unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)', pl: 'PL-1' });
  });

  it('旧実績物件を物件コード単位に統合して物件キーを削除する', async () => {
    const name = `past-project-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({currentUnits:'++id, unitNo, pl',connections:'++id, connectionNo, unitNoA, unitNoB',pastProjects:'++id, projectCode, &projectKey',pastPLRecords:'++id, &uniqueKey, projectKey, pl, unitNo, [pl+projectKey]'});
    await legacy.table('pastProjects').bulkAdd([
      {projectCode:'95742',customerName:'Old Customer',projectKey:'95742_001'},
      {projectCode:'95742',customerName:'New Customer',projectKey:'95742_002'},
    ]);
    legacy.close();
    const upgraded=createDb(name);await upgraded.open();
    const projects=await upgraded.pastProjects.toArray();
    expect(projects).toEqual([expect.objectContaining({projectCode:'95742',customerName:'New Customer'})]);
    expect(projects[0]).not.toHaveProperty('projectKey');
  });

  it('既存実績PLのユニット23・24を最新の固定名称へ更新する', async () => {
    const name = `unit-name-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(6).stores({
      currentPLs: 'id, pl',
      pastProjects: '++id, &projectCode',
      pastPLRecords: '++id, &uniqueKey, projectKey, pl, unitNo, unitName, [pl+projectKey]',
    });
    await legacy.table('pastPLRecords').bulkAdd([
      { uniqueKey: 'P1|23|PL-23', projectKey: 'P1', unitNo: '23', unitName: 'HAZARD LABEL', pl: 'PL-23' },
      { uniqueKey: 'P1|24|PL-24', projectKey: 'P1', unitNo: '24', unitName: 'CARRY WAGON(SRC350)', pl: 'PL-24' },
      { uniqueKey: 'P1|22|PL-22', projectKey: 'P1', unitNo: '22', unitName: 'COVER', pl: 'PL-22' },
    ]);
    legacy.close();

    const upgraded = createDb(name);
    await upgraded.open();
    const records = await upgraded.pastPLRecords.orderBy('unitNo').toArray();
    expect(records.map(({ unitNo, unitName }) => ({ unitNo, unitName }))).toEqual([
      { unitNo: '22', unitName: 'COVER' },
      { unitNo: '23', unitName: 'CLEANING NOZZLE UNIT' },
      { unitNo: '24', unitName: 'CLEANER UNIT' },
    ]);
  });
});

describe('固定接続マスター', () => {
  it('現在の36件をアプリ内に保持する', () => {
    expect(CONNECTION_MASTER).toHaveLength(36);
    expect(CONNECTION_MASTER[0]).toEqual({ id: 1, connectionNo: '1', unitNoA: '1', unitNoB: '2' });
    expect(CONNECTION_MASTER[28]).toEqual({ id: 29, connectionNo: '29', unitNoA: '21', unitNoB: '22' });
    expect(CONNECTION_MASTER[35]).toEqual({ id: 36, connectionNo: '36', unitNoA: '24', unitNoB: '22' });
  });

  it('最新DBにはconnectionsテーブルが存在しない', async () => {
    const database = createDb();
    await database.open();
    expect(database.tables.map(table => table.name)).not.toContain('connections');
  });
});