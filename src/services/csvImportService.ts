import Papa from 'papaparse';
import type { CurrentUnit, ImportMode, ImportProgress, ImportWarning, PastPLRecord, PastProject } from '../types/models';
import { UNIT_MASTER_BY_NO } from '../data/unitMaster';
import { currentProjectRepository, pastPLRepository, pastProjectRepository } from '../repositories/repositories';
import { clearConnectionHistoryCache } from './connectionHistoryService';

export type ImportResult = { imported: number; warnings: ImportWarning[]; elapsedMs: number };
export type CurrentUnitsTextParseResult = { items: CurrentUnit[]; warnings: ImportWarning[]; hasHeader: boolean };
const clean = (v: unknown) => String(v ?? '').replace(/^\uFEFF/, '').trim();
const parse = (file: File) => new Promise<string[][]>((resolve, reject) => Papa.parse<string[]>(file, { skipEmptyLines: true, complete: r => resolve(r.data), error: reject }));
const required = (header: string[], names: string[]) => { const missing = names.filter(n => !header.includes(n)); if (missing.length) throw new Error(`CSVの必須列がありません: ${missing.join('、')}`); };
const rowObject = (header: string[], row: string[]) => Object.fromEntries(header.map((h, i) => [clean(h), clean(row[i])]));

function buildCurrentUnits(rows: string[][], hasHeader: boolean): CurrentUnitsTextParseResult {
  const expectedHeader = ['ユニットNo', 'PL'];
  const header = hasHeader ? rows[0].map(clean) : expectedHeader;
  if (hasHeader) {
    required(header, expectedHeader);
    if (header.length !== expectedHeader.length) throw new Error('今回物件の列は「ユニットNo、PL」の2列だけにしてください。ユニット名は入力不要です');
  }
  const warnings: ImportWarning[] = [], seen = new Set<string>(), items: CurrentUnit[] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((row, index) => {
    const rowNumber = index + (hasHeader ? 2 : 1);
    if (row.length !== expectedHeader.length) {
      warnings.push({ row: rowNumber, message: `列数が不正です（必要: 2、実際: ${row.length}）。ユニットNo、PLだけを取り込んでください` });
      return;
    }
    const x = rowObject(header, row), unitNo = x['ユニットNo'];
    if (!unitNo) { warnings.push({ row: rowNumber, message: 'ユニットNoが空です' }); return; }
    const master = UNIT_MASTER_BY_NO.get(unitNo);
    if (!master) { warnings.push({ row: rowNumber, message: `アプリのユニットマスターに存在しないユニットNoです: ${unitNo}` }); return; }
    if (seen.has(unitNo)) warnings.push({ row: rowNumber, message: `ユニットNoが重複しています: ${unitNo}` });
    seen.add(unitNo);
    if (!x.PL) warnings.push({ row: rowNumber, message: 'PLが空です' });
    items.push({ unitNo, unitName: master.unitName, pl: x.PL });
  });
  return { items, warnings, hasHeader };
}

export function parseCurrentUnitsText(text: string): CurrentUnitsTextParseResult {
  if (!text.trim()) return { items: [], warnings: [], hasHeader: false };
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  if (result.errors.length) {
    const error = result.errors[0];
    throw new Error(`${error.row !== undefined ? `${error.row + 1}行目: ` : ''}${error.message}`);
  }
  const rows = result.data.map(row => row.map(clean));
  const first = rows[0] ?? [];
  const hasHeader = ['ユニットNo', 'PL'].every(name => first.includes(name));
  return buildCurrentUnits(rows, hasHeader);
}

export async function importCurrentUnitsText(text: string): Promise<ImportResult> {
  const started = performance.now();
  const parsed = parseCurrentUnitsText(text);
  if (!parsed.items.length) throw new Error('取り込み可能なデータがありません');
  await currentProjectRepository.replace(parsed.items);
  return { imported: parsed.items.length, warnings: parsed.warnings, elapsedMs: performance.now() - started };
}

export async function importCurrentUnits(file: File): Promise<ImportResult> {
  const started = performance.now(), rows = await parse(file), header = rows[0]?.map(clean) ?? [];
  required(header, ['ユニットNo','PL']);
  const parsed = buildCurrentUnits(rows, true);
  await currentProjectRepository.replace(parsed.items);
  return { imported: parsed.items.length, warnings: parsed.warnings, elapsedMs: performance.now()-started };
}

async function importPastProjectsSource(source: File, mode: ImportMode, allowHeaderless=false): Promise<ImportResult> {
  const started=performance.now(),rows=await parse(source);
  const firstRow=rows[0]?.map(clean)??[],hasHeader=['物件コード','客先名'].every(name=>firstRow.includes(name));
  if(!hasHeader&&!allowHeaderless)required(firstRow,['物件コード','客先名']);
  const header=hasHeader?firstRow:['物件コード','客先名'];
  if(header.length!==2)throw new Error('実績物件の列は「物件コード、客先名」の2列だけにしてください');
  const warnings:ImportWarning[]=[],items:PastProject[]=[],seen=new Set<string>();
  rows.slice(hasHeader?1:0).forEach((row,i)=>{const rowNumber=i+(hasHeader?2:1),x=rowObject(header,row),code=x['物件コード'];if(!code){warnings.push({row:rowNumber,message:'物件コードが空です'});return;}if(row.length!==2){warnings.push({row:rowNumber,message:`列数が不正です（必要: 2、実際: ${row.length}）`});return;}if(seen.has(code))warnings.push({row:rowNumber,message:`物件コードが重複しています（後の行を採用）: ${code}`});seen.add(code);items.push({projectCode:code,customerName:x['客先名']});});
  if(!items.length)throw new Error('取り込み可能な実績物件データがありません');
  const imported=new Set(items.map(item=>item.projectCode)).size;await pastProjectRepository.import(items,mode);return{imported,warnings,elapsedMs:performance.now()-started};
}

export const importPastProjects = (file: File, mode: ImportMode='append') => importPastProjectsSource(file, mode);
export const importPastProjectsText = (text: string, mode: ImportMode='append') => importPastProjectsSource(new File([text], 'クリップボード.csv', { type: 'text/csv' }), mode, true);

export async function importWidePastPL(file: File, mode: ImportMode, onProgress: (p:ImportProgress)=>void): Promise<ImportResult> {
  const started=performance.now(), warnings:ImportWarning[]=[];
  let header:string[]|undefined,projectKeys:string[]=[],processed=0,imported=0,rowNumber=0,batch:PastPLRecord[]=[],replaced=false;
  await new Promise<void>((resolve,reject)=>{
    let failed=false;
    const fail=(error:unknown,parser?:Papa.Parser)=>{if(failed)return;failed=true;parser?.abort();reject(error)};
    Papa.parse<string[]>(file,{
      skipEmptyLines:true,
      step:(result,parser)=>{
        parser.pause();
        void (async()=>{
          rowNumber++;
          const row=result.data.map(clean);
          if(!header){
            header=row;
            if(header[0]!=='ユニットNo')throw new Error('先頭列は「ユニットNo」である必要があります');
            if(header.includes('ユニット名'))throw new Error('実績PL CSVにユニット名は不要です。ユニットNoと物件キー列だけにしてください');
            projectKeys=header.slice(1);
            if(!projectKeys.length||projectKeys.some(k=>!k))throw new Error('物件キー列が空、または存在しません');
            if(new Set(projectKeys).size!==projectKeys.length)throw new Error('物件キー列が重複しています');
            if(mode==='replace'){await pastPLRepository.clear();replaced=true;}
            parser.resume();return;
          }
          const unitNo=row[0],master=UNIT_MASTER_BY_NO.get(unitNo);
          if(row.length!==header.length&&warnings.length<200)warnings.push({row:rowNumber,message:`列数が不正です（期待: ${header.length}、実際: ${row.length}）`});
          if(!unitNo){if(warnings.length<200)warnings.push({row:rowNumber,message:'ユニットNoが空です'});processed+=projectKeys.length;parser.resume();return;}
          if(!master){if(warnings.length<200)warnings.push({row:rowNumber,message:`アプリのユニットマスターに存在しないユニットNoです: ${unitNo}`});processed+=projectKeys.length;parser.resume();return;}
          for(let i=0;i<projectKeys.length;i++){
            const projectKey=projectKeys[i],pl=clean(row[i+1]);processed++;
            if(!pl){if(warnings.length<200)warnings.push({row:rowNumber,message:`実績PLが空です (${projectKey})`});continue;}
            batch.push({uniqueKey:`${projectKey}|${unitNo}|${pl}`,projectKey,unitNo,unitName:master.unitName,pl});
            if(batch.length>=1000){const writing=batch;batch=[];await pastPLRepository.importRecords(writing);imported+=new Set(writing.map(x=>x.uniqueKey)).size;const percent=Math.min(99,Math.round((result.meta.cursor/Math.max(file.size,1))*100));const estimatedTotal=percent?Math.max(processed,Math.round(processed*100/percent)):processed;onProgress({phase:'実績PLを読み込み中...',processed,total:estimatedTotal,percent,elapsedMs:performance.now()-started});await new Promise(r=>setTimeout(r,0));}
          }
          parser.resume();
        })().catch(error=>fail(error,parser));
      },
      complete:()=>{if(!failed)resolve()},
      error:error=>fail(error),
    });
  });
  if(!header)throw new Error('CSVにデータがありません');
  if(mode==='replace'&&!replaced)await pastPLRepository.clear();
  if(batch.length){await pastPLRepository.importRecords(batch);imported+=new Set(batch.map(x=>x.uniqueKey)).size;}
  clearConnectionHistoryCache();
  onProgress({phase:'完了',processed,total:processed,percent:100,elapsedMs:performance.now()-started});
  return{imported,warnings,elapsedMs:performance.now()-started};
}

export const importWidePastPLText = (text: string, mode: ImportMode, onProgress: (p:ImportProgress)=>void) => importWidePastPL(new File([text], 'クリップボード.csv', { type: 'text/csv' }), mode, onProgress);