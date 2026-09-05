import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CsvImport } from '../components/CsvImport';
import { GoogleDriveSync } from '../components/GoogleDriveSync';
import { currentProjectRepository, pastPLRepository, pastProjectRepository } from '../repositories/repositories';
import { clearConnectionHistoryCache } from '../services/connectionHistoryService';
import { importPastProjects, importPastProjectsText, importWidePastPL, importWidePastPLText } from '../services/csvImportService';
import { scheduleDriveBackup } from '../services/googleDriveService';
import { analyzePastProjects, type PastProjectAnalysisRow } from '../services/pastProjectAnalysisService';
import type { ImportMode, PastPLRecord } from '../types/models';

type AnalysisSortKey = 'projectKey'|'customerName'|'isUnique'|'similarityToCurrent';

function SortIcon({active,asc}:{active:boolean;asc:boolean}){return <span className={`sort-icon${active?' active':''}`}>{active?(asc?'▲':'▼'):'⇅'}</span>;}

export function HistoryDataPage(){
  const projectCount=useLiveQuery(()=>pastProjectRepository.count(),[])??0, plCount=useLiveQuery(()=>pastPLRepository.count(),[])??0;
  const projects=useLiveQuery(()=>pastProjectRepository.all(),[])??[];
  const [mode,setMode]=useState<ImportMode>('append'),[size,setSize]=useState(100),[page,setPage]=useState(0),[records,setRecords]=useState<PastPLRecord[]>([]),[field,setField]=useState<'projectKey'|'pl'|'unitNo'|'unitName'>('projectKey'),[search,setSearch]=useState('');
  const customerByProjectCode=new Map(projects.map(project=>[project.projectCode,project.customerName]));
  const projectKeyOptions=useLiveQuery(()=>pastPLRepository.distinctProjectKeys(),[plCount])??[];
  useEffect(()=>{let active=true;void pastPLRepository.page(page,size,search?field:undefined,search.trim()).then(x=>{if(active)setRecords(x)});return()=>{active=false}},[page,size,field,search,plCount]);

  const allPastPLRecords=useLiveQuery(()=>pastPLRepository.all(),[plCount])??[];
  const currentUnits=useLiveQuery(()=>currentProjectRepository.all(),[])??[];
  const analysisRows=useMemo(()=>analyzePastProjects(allPastPLRecords,currentUnits,customerByProjectCode),[allPastPLRecords,currentUnits,projects]);
  const [analysisSearch,setAnalysisSearch]=useState(''),[analysisSort,setAnalysisSort]=useState<AnalysisSortKey>('projectKey'),[analysisAsc,setAnalysisAsc]=useState(true);
  const analysisSortBy=(key:AnalysisSortKey)=>{if(analysisSort===key)setAnalysisAsc(!analysisAsc);else{setAnalysisSort(key);setAnalysisAsc(key!=='similarityToCurrent');}};
  const shownAnalysisRows=useMemo(()=>{
    const query=analysisSearch.trim().toLowerCase();
    const filtered=query?analysisRows.filter(x=>x.projectKey.toLowerCase().includes(query)||x.customerName.toLowerCase().includes(query)):analysisRows;
    const compare=(a:PastProjectAnalysisRow,b:PastProjectAnalysisRow)=>{
      if(analysisSort==='similarityToCurrent')return a.similarityToCurrent-b.similarityToCurrent;
      if(analysisSort==='isUnique')return Number(a.isUnique)-Number(b.isUnique);
      return (a[analysisSort]||'').localeCompare(b[analysisSort]||'',undefined,{numeric:true});
    };
    return [...filtered].sort((a,b)=>compare(a,b)*(analysisAsc?1:-1));
  },[analysisRows,analysisSearch,analysisSort,analysisAsc]);

  const remove=async()=>{if(!window.confirm(`実績物件 ${projectCount.toLocaleString()}件、実績PL ${plCount.toLocaleString()}件を削除します。\n\nこの操作は元に戻せません。`))return;await Promise.all([pastProjectRepository.clear(),pastPLRepository.clear()]);clearConnectionHistoryCache();setPage(0);scheduleDriveBackup();};
  const removeProject=async(project:(typeof projects)[number])=>{if(!project.id||!window.confirm(`実績物件一覧から次の物件情報を削除します。\n\n物件コード: ${project.projectCode}\n客先名: ${project.customerName}\n\n関連する実績PLは削除されません。`))return;await pastProjectRepository.deleteById(project.id);scheduleDriveBackup();};
  const removePL=async(record:PastPLRecord)=>{if(!record.id||!window.confirm(`次の実績PLを削除します。\n\n物件キー: ${record.projectKey}\nユニットNo: ${record.unitNo}\nPL: ${record.pl}\n\nこの操作は元に戻せません。`))return;await pastPLRepository.deleteById(record.id);clearConnectionHistoryCache();if(records.length===1&&page>0)setPage(value=>value-1);scheduleDriveBackup();};
  return <div className="page">
    <div className="page-title"><div><h2>実績データ管理</h2><p>過去物件とPL実績をIndexedDBに保存します。</p></div><button className="danger" disabled={!projectCount&&!plCount} onClick={()=>void remove()}>実績データを全削除</button></div>
    <GoogleDriveSync/>
    <div className="summary history-counts"><div><span>実績物件</span><strong>{projectCount.toLocaleString()}件</strong></div><div><span>実績PL</span><strong>{plCount.toLocaleString()}件</strong></div></div>
    <div className="imports-grid">
      <CsvImport title="実績物件読み込み" acceptName="実績物件.csv または Excelコピー（見出しなし可）" columns={['物件コード','客先名']} extra={<label>取込方法 <select value={mode} onChange={e=>setMode(e.target.value as ImportMode)}><option value="append">追加</option><option value="replace">置換</option></select></label>} onImport={file=>importPastProjects(file,mode).then(r=>{scheduleDriveBackup();return r;})} onClipboardImport={text=>importPastProjectsText(text,mode).then(r=>{scheduleDriveBackup();return r;})}/>
      <CsvImport title="実績PL横持ち読み込み" acceptName="実績物件PL.csv または Excelコピー" columns={['ユニットNo','物件キー1','物件キー2 …']} columnNote="2列目以降の見出しが物件キーです。ユニット名はユニットNoをキーに固定マスターから取得します。" extra={<label>取込方法 <select value={mode} onChange={e=>setMode(e.target.value as ImportMode)}><option value="append">追加</option><option value="replace">置換</option></select></label>} onImport={(file,progress)=>importWidePastPL(file,mode,progress).then(r=>{scheduleDriveBackup();return r;})} onClipboardImport={(text,progress)=>importWidePastPLText(text,mode,progress).then(r=>{scheduleDriveBackup();return r;})}/>
    </div>
    <section className="data-section"><h3>実績物件一覧</h3><div className="table-wrap small-table"><table><thead><tr><th>物件コード</th><th>客先名</th><th className="action-column">操作</th></tr></thead><tbody>{projects.slice(0,1000).map(x=><tr key={x.id}><td>{x.projectCode}</td><td>{x.customerName}</td><td className="action-column"><button className="row-delete" onClick={()=>void removeProject(x)}>削除</button></td></tr>)}</tbody></table>{!projects.length&&<div className="empty">実績物件がありません。</div>}</div>{projects.length>1000&&<p className="hint">先頭1,000件を表示しています。</p>}</section>

    <section className="data-section">
      <div className="section-head"><h3>実績物件ユニーク判定</h3><span className="hint">物件キーごとのユニットNo・PL組み合わせを比較し、重複と今回物件との類似度を判定します。</span></div>
      <p className="hint">見出しの「⇅」をクリックすると並び替えできます。「類似度（今回物件）」は1回クリックで高い順（▼）に並びます。</p>
      <div className="toolbar compact"><input placeholder="物件キー・客先名で検索" value={analysisSearch} onChange={e=>setAnalysisSearch(e.target.value)}/><span>{shownAnalysisRows.length.toLocaleString()}件表示</span></div>
      <div className="table-wrap analysis-table"><table><thead><tr>
        <th className="sortable" onClick={()=>analysisSortBy('projectKey')}>物件キー<SortIcon active={analysisSort==='projectKey'} asc={analysisAsc}/></th>
        <th>物件コード</th>
        <th>シリアル</th>
        <th className="sortable" onClick={()=>analysisSortBy('customerName')}>客先名<SortIcon active={analysisSort==='customerName'} asc={analysisAsc}/></th>
        <th className="sortable" onClick={()=>analysisSortBy('isUnique')}>ユニーク判定<SortIcon active={analysisSort==='isUnique'} asc={analysisAsc}/></th>
        <th>重複している物件キー</th>
        <th className="sortable" onClick={()=>analysisSortBy('similarityToCurrent')}>類似度（今回物件）<SortIcon active={analysisSort==='similarityToCurrent'} asc={analysisAsc}/></th>
      </tr></thead><tbody>{shownAnalysisRows.slice(0,1000).map(x=><tr key={x.projectKey}>
        <td>{x.projectKey}</td>
        <td>{x.projectCode}</td>
        <td>{x.serial}</td>
        <td>{x.customerName||'（実績物件未登録）'}</td>
        <td><span className={`status ${x.isUnique?'status-yes':'status-no'}`}>{x.isUnique?'✓ユニーク':'⚠重複あり'}</span></td>
        <td>{x.duplicateProjectKeys.join('、')}</td>
        <td>{x.similarityToCurrent}%</td>
      </tr>)}</tbody></table>{!shownAnalysisRows.length&&<div className="empty">該当データがありません。</div>}</div>
      {shownAnalysisRows.length>1000&&<p className="hint">先頭1,000件を表示しています。</p>}
    </section>

    <section className="data-section"><div className="section-head"><h3>実績PL一覧</h3><div className="toolbar compact">
      <select value={field} onChange={e=>{setField(e.target.value as typeof field);setPage(0)}}><option value="projectKey">物件キー</option><option value="pl">PL</option><option value="unitNo">ユニットNo</option><option value="unitName">ユニット名</option></select>
      <input placeholder="完全一致検索" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/>
      <select aria-label="物件キー・客先名で絞り込み" value={field==='projectKey'?search:''} onChange={e=>{setField('projectKey');setSearch(e.target.value);setPage(0)}}><option value="">物件キー・客先名で絞り込み（すべて）</option>{projectKeyOptions.map(key=><option key={key} value={key}>{key} - {customerByProjectCode.get(key.slice(0,5))??'（実績物件未登録）'}</option>)}</select>
      <select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0)}}>{[100,500,1000].map(n=><option key={n} value={n}>{n}件/ページ</option>)}</select>
    </div></div>
      <div className="table-wrap history-table"><table><thead><tr><th>物件キー</th><th>客先名（先頭5文字一致）</th><th>ユニットNo</th><th>ユニット名</th><th>PL</th><th className="action-column">操作</th></tr></thead><tbody>{records.map(x=><tr key={x.id}><td>{x.projectKey}</td><td>{customerByProjectCode.get(x.projectKey.slice(0,5))??'（実績物件未登録）'}</td><td>{x.unitNo}</td><td>{x.unitName}</td><td>{x.pl}</td><td className="action-column"><button className="row-delete" onClick={()=>void removePL(x)}>削除</button></td></tr>)}</tbody></table>{!records.length&&<div className="empty">該当データがありません。</div>}</div>
      <div className="pagination"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>前へ</button><span>{page+1}ページ</span><button disabled={records.length<size} onClick={()=>setPage(p=>p+1)}>次へ</button></div>
    </section>
  </div>;
}
