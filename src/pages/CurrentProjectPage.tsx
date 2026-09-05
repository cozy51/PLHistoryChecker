import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CsvImport } from '../components/CsvImport';
import { ClipboardCurrentUnitsImport } from '../components/ClipboardCurrentUnitsImport';
import { Highlight } from '../components/Highlight';
import { currentProjectRepository } from '../repositories/repositories';
import { importCurrentUnits } from '../services/csvImportService';
import type { CurrentUnit } from '../types/models';

type SortKey = 'unitNo'|'unitName'|'pl';
export function CurrentProjectPage() {
  const units = useLiveQuery(() => currentProjectRepository.all(), []) ?? [];
  const [query,setQuery]=useState(''),[emptyOnly,setEmptyOnly]=useState(false),[sort,setSort]=useState<SortKey>('unitNo'),[asc,setAsc]=useState(true);
  const shown=useMemo(()=>units.filter(x=>(!query||`${x.unitNo} ${x.unitName} ${x.pl}`.toLowerCase().includes(query.toLowerCase()))&&(!emptyOnly||!x.pl)).sort((a,b)=>(a[sort]||'').localeCompare(b[sort]||'',undefined,{numeric:true})*(asc?1:-1)),[units,query,emptyOnly,sort,asc]);
  const sortBy=(key:SortKey)=>{if(sort===key)setAsc(!asc);else{setSort(key);setAsc(true);}};
  const editPL=async(unit:CurrentUnit,value:string)=>{await currentProjectRepository.updatePL(unit.unitNo,value.trim());};
  const clearPL=async(unit:CurrentUnit)=>{if(!unit.pl||!window.confirm(`次のユニットのPLをクリアします。\n\nユニットNo: ${unit.unitNo}\nユニット名: ${unit.unitName}\nPL: ${unit.pl}`))return;await currentProjectRepository.clearPL(unit.unitNo);};
  return <div className="page">
    <div className="page-title"><div><h2>今回物件</h2><p>ユニットNo・ユニット名はアプリ内の固定マスターです。今回使用するPLを管理します。</p></div><span className="count-chip">{units.length.toLocaleString()}件</span></div>
    <ClipboardCurrentUnitsImport />
    <details className="csv-alternative"><summary>CSVファイルから取り込む</summary><CsvImport title="今回物件CSV読み込み" acceptName="今回物件.csv" columns={['ユニットNo','PL']} columnNote="ユニット名は固定ユニットマスターから取得します。" onImport={file=>importCurrentUnits(file)}/></details>
    <div className="toolbar"><input className="search" placeholder="ユニットNo・名称・PLを検索" value={query} onChange={e=>setQuery(e.target.value)}/><label><input type="checkbox" checked={emptyOnly} onChange={e=>setEmptyOnly(e.target.checked)}/> PL空欄のみ</label><span>{shown.length.toLocaleString()}件表示</span></div>
    <div className="table-wrap current-project-table"><table><thead><tr><th onClick={()=>sortBy('unitNo')}>ユニットNo（固定）</th><th onClick={()=>sortBy('unitName')}>ユニット名（固定）</th><th onClick={()=>sortBy('pl')}>PL（編集可）</th><th className="action-column">操作</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td><Highlight text={x.unitNo} query={query}/></td><td><Highlight text={x.unitName} query={query}/></td><td><input key={`${x.id}-${x.pl}`} className={!x.pl?'cell-input invalid':'cell-input'} defaultValue={x.pl} onBlur={e=>void editPL(x,e.target.value)}/></td><td className="action-column"><button className="row-delete" disabled={!x.pl} onClick={()=>void clearPL(x)}>PLクリア</button></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">検索条件に一致するユニットがありません。</div>}</div>
  </div>;
}