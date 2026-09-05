import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StatusBadge } from '../components/StatusBadge';
import { CONNECTION_MASTER } from '../data/connectionMaster';
import { currentProjectRepository, pastProjectRepository } from '../repositories/repositories';
import { checkConnectionHistory, resolveConnectionUnits } from '../services/connectionHistoryService';
import type { ConnectionHistoryResult, HistoryStatus, PastProject } from '../types/models';

type Row = { id:number; connectionNo:string; unitNoA:string;unitNameA:string;plA:string;unitNoB:string;unitNameB:string;plB:string;result:ConnectionHistoryResult };
export function ConnectionCheckPage(){
  const units=useLiveQuery(()=>currentProjectRepository.all(),[])??[], connections=CONNECTION_MASTER;
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(false),[filter,setFilter]=useState<'全件'|HistoryStatus>('全件'),[detail,setDetail]=useState<{row:Row;projects:PastProject[]}|null>(null);
  useEffect(()=>{let active=true;(async()=>{setLoading(true);const next=await Promise.all(connections.map(async(c,i)=>{const resolved=resolveConnectionUnits(c,units);return{id:c.id??i,connectionNo:c.connectionNo,unitNoA:c.unitNoA,unitNameA:resolved.unitNameA,plA:resolved.plA,unitNoB:c.unitNoB,unitNameB:resolved.unitNameB,plB:resolved.plB,result:await checkConnectionHistory(resolved.plA,resolved.plB)}}));if(active){setRows(next);setLoading(false);}})();return()=>{active=false};},[units,connections]);
  const counts=useMemo(()=>({yes:rows.filter(x=>x.result.status==='あり').length,no:rows.filter(x=>x.result.status==='なし').length,na:rows.filter(x=>x.result.status==='N/A').length}),[rows]);
  const shown=filter==='全件'?rows:rows.filter(x=>x.result.status===filter);
  const open=async(row:Row)=>setDetail({row,projects:await pastProjectRepository.findByKeys(row.result.projectKeys)});
  return <div className="page">
    <div className="page-title"><div><h2>接続判定</h2><p className="notice">実績あり＝同一過去物件内で両PLの使用実績あり（直接接続されていたことを保証するものではありません）</p></div>{loading&&<span className="loading">判定中...</span>}</div>
    <div className="fixed-master-notice"><strong>接続組み合わせはアプリ内固定</strong><span>接続No・ユニットNo_A・ユニットNo_Bはアプリ側で管理しています。取り込み操作は不要です。</span></div>
    <div className="summary"><div><span>接続数</span><strong>{rows.length}</strong></div><div className="yes"><span>✔ 実績あり</span><strong>{counts.yes}</strong></div><div className="no"><span>✕ 実績なし</span><strong>{counts.no}</strong></div><div><span>N/A</span><strong>{counts.na}</strong></div></div>
    <div className="filter-tabs">{(['全件','あり','なし','N/A'] as const).map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x==='あり'?'実績あり':x==='なし'?'実績なし':x}</button>)}</div>
    <div className="table-wrap connection-table"><table><thead><tr><th>接続No（固定）</th><th className="unit-a group-start">ユニットNo_A（固定）</th><th className="unit-a">ユニット名_A</th><th className="unit-a group-end">PL_A</th><th className="unit-b group-start">ユニットNo_B（固定）</th><th className="unit-b">ユニット名_B</th><th className="unit-b group-end">PL_B</th><th>実績判定</th><th>実績件数</th></tr></thead><tbody>{shown.map(row=><tr key={row.id}><td>{row.connectionNo}</td><td className="unit-a group-start">{row.unitNoA}</td><td className="unit-a">{row.unitNameA||<em>未登録</em>}</td><td className="unit-a group-end">{row.plA||<em>空欄</em>}</td><td className="unit-b group-start">{row.unitNoB}</td><td className="unit-b">{row.unitNameB||<em>未登録</em>}</td><td className="unit-b group-end">{row.plB||<em>空欄</em>}</td><td>{row.result.status==='あり'?<button className="link-button" onClick={()=>void open(row)}><StatusBadge status={row.result.status}/></button>:<StatusBadge status={row.result.status}/>}</td><td>{row.result.count?<button className="count-link" onClick={()=>void open(row)}>{row.result.count}件</button>:'0件'}</td></tr>)}</tbody></table>{!shown.length&&<div className="empty">該当する接続がありません。</div>}</div>
    {detail&&<><div className="panel-backdrop" onClick={()=>setDetail(null)}/><aside className="detail-panel"><button className="close" onClick={()=>setDetail(null)}>×</button><h3>過去実績詳細</h3><dl><dt>PL-A</dt><dd>{detail.row.plA}</dd><dt>PL-B</dt><dd>{detail.row.plB}</dd><dt>実績件数</dt><dd><strong>{detail.row.result.count}件</strong></dd></dl><h4>実績物件</h4><table><thead><tr><th>物件キー</th><th>物件コード</th><th>客先名</th></tr></thead><tbody>{detail.row.result.projectKeys.map(key=>{const code=key.slice(0,5),p=detail.projects.find(x=>x.projectCode===code);return<tr key={key}><td>{key}</td><td>{code}</td><td>{p?.customerName??'（物件情報未登録）'}</td></tr>})}</tbody></table></aside></>}
  </div>;
}