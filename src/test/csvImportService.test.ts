import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { currentProjectRepository, pastPLRepository } from '../repositories/repositories';
import { importCurrentUnitsText, importPastProjects, importPastProjectsText, importWidePastPL, importWidePastPLText, parseCurrentUnitsText } from '../services/csvImportService';

describe('今回物件クリップボード取り込み', () => {
  beforeEach(async () => { await db.open(); await db.currentPLs.clear(); });

  it('Excelの2列データを解析し、名称を固定マスターから取得する', () => {
    const result = parseCurrentUnitsText('1\tHH11000010\n2\tHH11103B10');
    expect(result.hasHeader).toBe(false);
    expect(result.items).toEqual([
      { unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)', pl: 'HH11000010' },
      { unitNo: '2', unitName: 'STEERING UNIT(R)', pl: 'HH11103B10' },
    ]);
  });

  it('見出し付きデータは列順が異なっても解析する', () => {
    const result = parseCurrentUnitsText('PL\tユニットNo\nPL-A\t10');
    expect(result.hasHeader).toBe(true);
    expect(result.items).toEqual([{ unitNo: '10', unitName: 'HOIST SENSOR UNIT(350X)', pl: 'PL-A' }]);
  });

  it('重複ユニットNoと空PLを行番号付きで警告する', () => {
    const result = parseCurrentUnitsText('ユニットNo,PL\n1,PL-A\n1,');
    expect(result.warnings).toEqual([
      { row: 3, message: 'ユニットNoが重複しています: 1' },
      { row: 3, message: 'PLが空です' },
    ]);
  });

  it('ユニット名を含む3列データを拒否する', () => {
    expect(() => parseCurrentUnitsText('ユニットNo\tユニット名\tPL\n1\tOTHER NAME\tPL-A')).toThrow('ユニット名は入力不要です');
  });

  it('固定マスター外のユニットNoを警告して除外する', () => {
    const result = parseCurrentUnitsText('999\tPL-X');
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([{ row: 1, message: 'アプリのユニットマスターに存在しないユニットNoです: 999' }]);
  });

  it('PLを置換し、固定24件のユニットNo・名称を維持する', async () => {
    await currentProjectRepository.replace([{ unitNo: '1', pl: 'OLD-PL' }]);
    await importCurrentUnitsText('1\tPL-A\n2\tPL-B');
    const units = await currentProjectRepository.all();
    expect(units).toHaveLength(24);
    expect(units.slice(0, 2).map(({ unitNo, unitName, pl }) => ({ unitNo, unitName, pl }))).toEqual([
      { unitNo: '1', unitName: 'DRIVE GEAR BOX (350X)', pl: 'PL-A' },
      { unitNo: '2', unitName: 'STEERING UNIT(R)', pl: 'PL-B' },
    ]);
    expect(units[2].pl).toBe('');
  });

  it('IndexedDBには固定マスター情報を保存せずIDとPLだけを保存する', async () => {
    await importCurrentUnitsText('1\tPL-A\n2\tPL-B');
    expect(await db.currentPLs.toArray()).toEqual([{ id: 1, pl: 'PL-A' }, { id: 2, pl: 'PL-B' }]);
  });
});

describe('実績PL横持ちCSVインポート', () => {
  beforeEach(async () => { await db.open(); await db.pastPLRecords.clear(); });

  it('縦持ちへ変換し、空PLを除外して進捗を返す', async () => {
    const csv='ユニットNo,95742_001,95175_001\n1,PL-A,PL-B\n2,PL-C,';
    const progress: number[]=[];
    const result=await importWidePastPL(new File([csv],'実績物件PL.csv',{type:'text/csv'}),'replace',p=>progress.push(p.percent));
    expect(result.imported).toBe(3);
    expect(result.warnings).toHaveLength(1);
    expect(await pastPLRepository.count()).toBe(3);
    expect(await pastPLRepository.findProjectKeysByPL('PL-A')).toEqual(['95742_001']);
    expect((await pastPLRepository.page(0, 10)).find(record => record.pl === 'PL-A')?.unitName).toBe('DRIVE GEAR BOX (350X)');
    expect(progress.at(-1)).toBe(100);
  });

  it('固定マスター外のユニットNoを警告して登録しない', async () => {
    const csv='ユニットNo,95742_001\n999,PL-X\n1,PL-A';
    const result=await importWidePastPL(new File([csv],'unknown.csv'),'replace',()=>{});
    expect(result.imported).toBe(1);
    expect(result.warnings).toEqual([{ row: 2, message: 'アプリのユニットマスターに存在しないユニットNoです: 999' }]);
    expect(await pastPLRepository.findProjectKeysByPL('PL-X')).toEqual([]);
  });

  it('ユニット名列を含む旧形式は明確なエラーにする', async () => {
    const csv='ユニットNo,ユニット名,95742_001\n1,OTHER NAME,PL-A';
    await expect(importWidePastPL(new File([csv],'old.csv'),'replace',()=>{})).rejects.toThrow('ユニット名は不要です');
  });

  it('置換インポートで古いデータを削除する', async () => {
    const old='ユニットNo,OLD_001\n1,OLD-PL';
    const next='ユニットNo,NEW_001\n1,NEW-PL';
    await importWidePastPL(new File([old],'old.csv'),'replace',()=>{});
    await importWidePastPL(new File([next],'new.csv'),'replace',()=>{});
    expect(await pastPLRepository.findProjectKeysByPL('OLD-PL')).toEqual([]);
    expect(await pastPLRepository.findProjectKeysByPL('NEW-PL')).toEqual(['NEW_001']);
  });

  it('Excelからコピーしたタブ区切りの横持ち実績PLを取り込む', async () => {
    const result=await importWidePastPLText('ユニットNo\t95742_001\n1\tPL-CLIP','append',()=>{});
    expect(result.imported).toBe(1);
    expect(await pastPLRepository.findProjectKeysByPL('PL-CLIP')).toEqual(['95742_001']);
  });
});

describe('実績物件CSVインポート', () => {
  beforeEach(async () => { await db.open(); await db.pastProjects.clear(); });

  it('物件コード・客先名の2列を取り込む', async () => {
    const csv='物件コード,客先名\n95742,Sample Customer';
    const result=await importPastProjects(new File([csv],'実績物件.csv'),'replace');
    expect(result.imported).toBe(1);
    expect(await db.pastProjects.toArray()).toEqual([expect.objectContaining({ projectCode:'95742',customerName:'Sample Customer' })]);
  });

  it('必須列が不足している場合は列名を含むエラーにする', async () => {
    const csv='物件コード\n95742';
    await expect(importPastProjects(new File([csv],'invalid.csv'),'replace')).rejects.toThrow('客先名');
  });

  it('Excelからコピーした2列を追加モードで取り込む', async () => {
    await importPastProjectsText('物件コード\t客先名\n95742\tOld Customer','append');
    await importPastProjectsText('物件コード\t客先名\n95742\tNew Customer\n95175\tOther Customer','append');
    expect(await db.pastProjects.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({projectCode:'95742',customerName:'New Customer'}),
      expect.objectContaining({projectCode:'95175',customerName:'Other Customer'}),
    ]));
    expect(await db.pastProjects.count()).toBe(2);
  });

  it('見出しを含めずExcelからコピーした2列を取り込む', async () => {
    const result=await importPastProjectsText('57061\tNANYA TECHNOLOGY CORP.\n57312\tMicron Technology, Inc. (Boise)','append');
    expect(result.imported).toBe(2);
    expect(await db.pastProjects.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({projectCode:'57061',customerName:'NANYA TECHNOLOGY CORP.'}),
      expect.objectContaining({projectCode:'57312',customerName:'Micron Technology, Inc. (Boise)'}),
    ]));
  });
});