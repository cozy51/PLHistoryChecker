import { useState } from 'react';
import { CurrentProjectPage } from './pages/CurrentProjectPage';
import { ConnectionCheckPage } from './pages/ConnectionCheckPage';
import { HistoryDataPage } from './pages/HistoryDataPage';
import './styles.css';

type Page='current'|'connections'|'history';
export default function App(){const[page,setPage]=useState<Page>('current');return <div className="app"><header className="app-header"><img className="brand-mark" src="/favicon.svg" alt="" width={46} height={46}/><div><h1>ユニット接続実績チェッカー</h1><p>Unit Connection History Checker</p></div></header><nav>{([['current','今回物件'],['connections','接続判定'],['history','実績データ管理']] as const).map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>setPage(key)}>{label}</button>)}</nav><main>{page==='current'?<CurrentProjectPage/>:page==='connections'?<ConnectionCheckPage/>:<HistoryDataPage/>}</main><footer>ユニットNo・名称はアプリ内固定マスター、PLと実績データはこのブラウザの IndexedDB に保存されます。</footer></div>}