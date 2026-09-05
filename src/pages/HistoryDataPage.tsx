import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CsvImport } from '../components/CsvImport';
import { pastPLRepository, pastProjectRepository } from '../repositories/repositories';
import { clearConnectionHistoryCache } from '../services/connectionHistoryService';
import { importPastProjects, importPastProjectsText, importWidePastPL, importWidePastPLText } from '../services/csvImportService';
import type { ImportMode, PastPLRecord } from '../types/models';

export function HistoryDataPage(){
  const projectCount=useLiveQuery(()=>pastProjectRepository.count(),[])??0, plCount=useLiveQuery(()=>pastPLRepository.count(),[])??0;
  const projects=useLiveQuery(()=>pastProjectRepository.all(),[])??[];
  const [mode,setMode]=useState<ImportMode>('append'),[size,setSize]=useState(100),[page,setPage]=useState(0),[records,setRecords]=useState<PastPLRecord[]>([]),[field,setField]=useState<'projectKey'|'pl'|'unitNo'|'unitName'>('projectKey'),[search,setSearch]=useState('');
  const customerByProjectCode=new Map(projects.map(project=>[project.projectCode,project.customerName]));
  useEffect(()=>{let active=true;void pastPLRepository.page(page,size,search?field:undefined,search.trim()).then(x=>{if(active)setRecords(x)});return()=>{active=false}},[page,size,field,search,plCount]);
  const remove=async()=>{if(!window.confirm(`実績物件 ${projectCount.toLocaleString()}件、実績PL ${plCount.toLocaleString()}件を削除します。\n\nこの操作は元に戻せません。`))return;await Promise.all([pastProjectRepository.clear(),pastPLRepository.clear()]);clearConnectionHistoryCache();setPage(0);};
  const removeProject=async(project:(typeof projects)[number])=>{if(!project.id||!window.confirm(`実績物件一覧から次の物件情報を削除します。\n\n物件コード: ${project.projectCode}\n客先名: ${project.customerName}\n\n関連する実績PLは削除されません。`))return;await pastProjectRepository.deleteById(project.id);};
  const removePL=async(record:PastPLRecord)=>{if(!record.id||!window.confirm(`次の実績PLを削除します。\n\n物件キー: ${record.projectKey}\nユニットNo: ${record.unitNo}\nPL: ${record.pl}\n\nこの操作は元に戻せません。`))return;await pastPLRepository.deleteById(record.id);clearConnectionHistoryCache();if(records.length===1&&page>0)setPage(value=>value-1);};
  return <div className="page">
    <div className="page-title"><div><h2>実績データ管理</h2><p>過去物件とPL実績をIndexedDBに保存します。</p></div><button className="danger" disabled={!projectCount&&!plCount} onClick={()=>void remove()}>実績データを全削除</button></div>
    <div className="summary history-counts"><div><span>実績物件</span><strong>{projectCount.toLocaleString()}件</strong></div><div><span>実績PL</span><strong>{plCount.toLocaleString()}件</strong></div></div>
    <div className="imports-grid">
      <CsvImport title="実績物件読み込み" acceptName="実績物件.csv または Excelコピー（見出しなし可）" columns={['物件コード','客先名']} extra={<label>取込方法 <select value={mode} onChange={e=>setMode(e.target.value as ImportMode)}><option value="append">追加</option><option value="replace">置換</option></select></label>} onImport={file=>importPastProjects(file,mode)} onClipboardImport={text=>importPastProjectsText(text,mode)}/>
      <CsvImport title="実績PL横持ち読み込み" acceptName="実績物件PL.csv または Excelコピー" columns={['ユニットNo','物件キー1','物件キー2 …']} columnNote="2列目以降の見出しが物件キーです。ユニット名はユニットNoをキーに固定マスターから取得します。" extra={<label>取込方法 <select value={mode} onChange={e=>setMode(e.target.value as ImportMode)}><option value="append">追加</option><option value="replace">置換</option></select></label>} onImport={(file,progress)=>importWidePastPL(file,mode,progress)} onClipboardImport={(text,progress)=>importWidePastPLText(text,mode,progress)}/>
    </div>
    <section className="data-section"><h3>実績物件一覧</h3><div className="table-wrap small-table"><table><thead><tr><th>物件コード</th><th>客先名</th><th className="action-column">操作</th></tr></thead><tbody>{projects.slice(0,1000).map(x=><tr key={x.id}><td>{x.projectCode}</td><td>{x.customerName}</td><td className="action-column"><button className="row-delete" onClick={()=>void removeProject(x)}>削除</button></td></tr>)}</tbody></table>{!projects.length&&<div className="empty">実績物件がありません。</div>}</div>{projects.length>1000&&<p className="hint">先頭1,000件を表示しています。</p>}</section>
    <section className="data-section"><div className="section-head"><h3>実績PL一覧</h3><div className="toolbar compact"><select value={field} onChange={e=>{setField(e.target.value as typeof field);setPage(0)}}><option value="projectKey">物件キー</option><option value="pl">PL</option><option value="unitNo">ユニットNo</option><option value="unitName">ユニット名</option></select><input placeholder="完全一致検索" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/><select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0)}}>{[100,500,1000].map(n=><option key={n} value={n}>{n}件/ページ</option>)}</select></div></div>
      <div className="table-wrap history-table"><table><thead><tr><th>物件キー</th><th>客先名（先頭5文字一致）</th><th>ユニットNo</th><th>ユニット名</th><th>PL</th><th className="action-column">操作</th></tr></thead><tbody>{records.map(x=><tr key={x.id}><td>{x.projectKey}</td><td>{customerByProjectCode.get(x.projectKey.slice(0,5))??'（実績物件未登録）'}</td><td>{x.unitNo}</td><td>{x.unitName}</td><td>{x.pl}</td><td className="action-column"><button className="row-delete" onClick={()=>void removePL(x)}>削除</button></td></tr>)}</tbody></table>{!records.length&&<div className="empty">該当データがありません。</div>}</div>
      <div className="pagination"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>前へ</button><span>{page+1}ページ</span><button disabled={records.length<size} onClick={()=>setPage(p=>p+1)}>次へ</button></div>
    </section>
  </div>;
}