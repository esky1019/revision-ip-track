import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, query, onSnapshot, doc, 
  serverTimestamp, deleteDoc, getDocs 
} from 'firebase/firestore';
import { 
  Activity, Link as LinkIcon, ExternalLink, Clock, 
  Shield, ArrowRight, Copy, Trash2, Eye, Lock, AlertTriangle,
  AlertOctagon
} from 'lucide-react';

// ==========================================
// 🔴 請在此處填入你的 FIREBASE 設定 (從備份貼回)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDdtGehq06dUbI6OkkA_GQWMpqU3M1iXfk",
  authDomain: "ip-tracker-2025.firebaseapp.com",
  projectId: "ip-tracker-2025",
  storageBucket: "ip-tracker-2025.firebasestorage.app",
  messagingSenderId: "245484937826",
  appId: "1:245484937826:web:0650342cc4a83a2eaf273b"
};

// 🔴 設定後台登入密碼
const ADMIN_PASSWORD = "admin"; 

// 🔴 網站暫停開關 (改為 true 即開啟維護模式)
const SYSTEM_PAUSED = false; 

// ==========================================
// 初始化 Firebase
const isConfigured = firebaseConfig.apiKey !== "請替換_YOUR_API_KEY";
const app = isConfigured ? initializeApp(firebaseConfig) : null;
const auth = isConfigured ? getAuth(app) : null;
const db = isConfigured ? getFirestore(app) : null;

// 資料庫路徑
const DB_PATH = ['tracker_data', 'main']; 

export default function LinkTrackerProduction() {
  const [user, setUser] = useState(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [links, setLinks] = useState([]);
  const [selectedLink, setSelectedLink] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // view 狀態
  const [view, setView] = useState('login'); 
  const [loading, setLoading] = useState(false);
  const [redirectMsg, setRedirectMsg] = useState('正在建立安全連線...');
  const [redirectTarget, setRedirectTarget] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // 1. 初始化
  useEffect(() => {
    if (!isConfigured) {
      setView('setup_error');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('track');

    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error("Auth Error", e); }
    };
    initAuth();

    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (trackId) {
        if (SYSTEM_PAUSED) {
          setView('maintenance');
          return;
        }
        setView('redirecting');
        handleRedirectLogic(trackId);
      } else {
        setView('login');
      }
    });
  }, []);

  // 2. 執行追蹤與跳轉
  const handleRedirectLogic = async (trackId) => {
    try {
      setRedirectMsg('正在解析目標位置...');
      let userIp = 'Unknown';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        userIp = ipData.ip;
      } catch (e) { console.warn("IP fetch failed", e); }

      const linksRef = collection(db, ...DB_PATH, 'links');
      const q = query(linksRef);
      const querySnapshot = await getDocs(q);
      
      let targetLinkData = null;
      querySnapshot.forEach((doc) => {
        if (doc.id === trackId) targetLinkData = doc.data();
      });

      if (targetLinkData) {
        setRedirectMsg('紀錄數據中...');
        setRedirectTarget(targetLinkData.targetUrl);
        
        const logsRef = collection(db, ...DB_PATH, 'logs');
        await addDoc(logsRef, {
          linkId: trackId,
          targetUrl: targetLinkData.targetUrl,
          ip: userIp,
          userAgent: navigator.userAgent,
          timestamp: serverTimestamp(),
          referrer: document.referrer || 'Direct',
          screenSize: `${window.screen.width}x${window.screen.height}`
        });

        setRedirectMsg('即將跳轉...');
        setTimeout(() => {
          window.location.href = targetLinkData.targetUrl;
        }, 800);
      } else {
        setRedirectMsg('連結已失效或不存在。');
      }
    } catch (error) {
      console.error("Tracking Error:", error);
      setRedirectMsg('發生錯誤，請稍後再試。');
    }
  };

  // 3. 後台數據監聽
  useEffect(() => {
    if (!user || !isAdmin || ['redirecting','login','maintenance'].includes(view)) return;
    const linksRef = collection(db, ...DB_PATH, 'links');
    const unsubscribeLinks = onSnapshot(linksRef, (snapshot) => {
      const linksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      linksData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLinks(linksData);
    });
    return () => unsubscribeLinks();
  }, [user, isAdmin, view]);

  useEffect(() => {
    if (!user || !isAdmin || !selectedLink || view !== 'details') return;
    const logsRef = collection(db, ...DB_PATH, 'logs');
    const unsubscribeLogs = onSnapshot(logsRef, (snapshot) => {
      const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filteredLogs = allLogs
        .filter(log => log.linkId === selectedLink.id)
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setLogs(filteredLogs);
    });
    return () => unsubscribeLogs();
  }, [user, isAdmin, selectedLink, view]);

  // 操作功能
  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) { setIsAdmin(true); setView('dashboard'); } 
    else { alert("密碼錯誤"); }
  };

  const createLink = async () => {
    if (!targetUrl || !user) return;
    setLoading(true);
    try {
      let formattedUrl = targetUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = 'https://' + formattedUrl;
      const linksRef = collection(db, ...DB_PATH, 'links');
      await addDoc(linksRef, {
        targetUrl: formattedUrl,
        createdAt: serverTimestamp(),
        creatorId: user.uid,
      });
      setTargetUrl('');
    } catch (error) { console.error(error); alert("建立失敗: " + error.message); }
    finally { setLoading(false); }
  };

  const handleDeleteLink = async (id, e) => {
    e.stopPropagation();
    if(!confirm("確定刪除此追蹤連結？")) return;
    try {
      await deleteDoc(doc(db, ...DB_PATH, 'links', id));
      if (selectedLink?.id === id) { setView('dashboard'); setSelectedLink(null); }
    } catch (err) { console.error(err); }
  }

  const copyToClipboard = (id) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('track', id); 
      const fullUrl = url.toString();
      navigator.clipboard.writeText(fullUrl).then(() => { alert("✅ 連結已複製！"); })
      .catch(() => { prompt("請手動複製連結：", fullUrl); });
    } catch (e) { console.error(e); }
  };

  // --- 視圖 ---

  if (view === 'maintenance') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-300 flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 max-w-md w-full">
          <AlertOctagon className="w-16 h-16 text-amber-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2">系統維護中</h1>
          <p className="text-slate-400 mb-6">本服務目前暫停使用，我們正在進行系統升級。<br />請稍後再試。</p>
          <div className="text-xs font-mono text-slate-600 bg-black/20 p-2 rounded">Status: 503 Service Unavailable</div>
        </div>
      </div>
    );
  }

  if (view === 'setup_error') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold">尚未設定 Firebase</h1>
          <p className="text-slate-400">請填入您的 Firebase 設定。</p>
        </div>
      </div>
    );
  }

  if (view === 'redirecting') {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center"><Activity className="w-16 h-16 animate-pulse text-green-400" /></div>
          <div className="space-y-4">
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 animate-progress"></div>
            </div>
            <p className="text-center text-sm opacity-80">{redirectMsg}</p>
            {redirectTarget && (
              <div className="text-center opacity-0 animate-fade-in" style={{animationDelay: '1s', animationFillMode: 'forwards'}}>
                <a href={redirectTarget} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-green-900/50 hover:bg-green-800 text-green-300 px-4 py-2 rounded border border-green-700 text-sm">
                  <ExternalLink size={14} /> 若未自動跳轉，請點此前往
                </a>
              </div>
            )}
          </div>
        </div>
        <style jsx>{` @keyframes progress { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 100%; } } .animate-progress { animation: progress 1.5s ease-in-out infinite; } .animate-fade-in { animation: fadeIn 1s ease-in; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } `}</style>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div className="min-h-screen w-full bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-700 backdrop-blur-sm">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-cyan-900/20 rounded-full border border-cyan-500/30 ring-4 ring-cyan-900/10"><Lock className="w-8 h-8 text-cyan-400" /></div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2 text-white">CyberTrack</h2>
          <p className="text-slate-400 text-center mb-8 text-sm">請輸入管理員密碼以存取後台</p>
          <input type="password" placeholder="請輸入後台密碼" className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-cyan-500 text-center transition-all" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
          <button type="submit" className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg active:scale-[0.98]">進入系統</button>
        </form>
        <div className="mt-8 text-slate-600 text-xs">Secure System v2.0</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <header className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <Activity className="text-cyan-400 w-6 h-6" />
            <h1 className="text-xl font-bold text-white">CyberTrack <span className="text-xs text-slate-500">PRO</span></h1>
          </div>
          <div className="flex gap-4">
            {view === 'details' && <button onClick={() => setView('dashboard')} className="text-sm text-slate-400 hover:text-white">返回列表</button>}
            <button onClick={() => { setIsAdmin(false); setView('login'); }} className="text-sm text-red-400 hover:text-red-300">登出</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 md:p-8">
        {view === 'dashboard' ? (
          <>
            <section className="mb-10 bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-cyan-100"><LinkIcon size={20} /> 建立新的追蹤連結</h2>
              <div className="flex flex-col md:flex-row gap-3">
                <input type="text" placeholder="輸入目標網址 (例如: https://yahoo.com)" className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 focus:border-cyan-500 outline-none" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
                <button onClick={createLink} disabled={loading || !targetUrl} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2">{loading ? '...' : '生成'} <ArrowRight size={18} /></button>
              </div>
            </section>
            <div className="space-y-4">
              <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">連結列表</h3>
              {links.length === 0 ? <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-xl text-slate-600">尚無連結</div> : (
                <div className="grid gap-4">
                  {links.map(link => (
                    <div key={link.id} onClick={() => { setSelectedLink(link); setView('details'); }} className="group bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-cyan-500/50 rounded-xl p-4 cursor-pointer relative">
                      <div className="flex justify-between items-start gap-4">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock size={12} /> {link.createdAt ? new Date(link.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
                          <h3 className="text-slate-200 font-medium truncate pr-4">{link.targetUrl}</h3>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(link.id); }} className="p-2 hover:bg-cyan-900/30 text-slate-400 hover:text-cyan-400 rounded-lg"><Copy size={18} /></button>
                          <button onClick={(e) => handleDeleteLink(link.id, e)} className="p-2 hover:bg-red-900/30 text-slate-400 hover:text-red-400 rounded-lg"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div><h2 className="text-2xl font-bold text-white">連結分析</h2><div className="text-slate-400 text-sm font-mono truncate max-w-md">{selectedLink?.targetUrl}</div></div>
              <button onClick={() => copyToClipboard(selectedLink.id)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm border border-slate-600">複製連結</button>
            </div>
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-700 bg-slate-800/50"><h3 className="font-semibold text-slate-200">訪問紀錄 ({logs.length})</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-400">
                  <thead className="bg-slate-900/50 text-slate-200 uppercase text-xs"><tr><th className="px-6 py-3">時間</th><th className="px-6 py-3">IP</th><th className="px-6 py-3">裝置</th><th className="px-6 py-3">來源</th></tr></thead>
                  <tbody className="divide-y divide-slate-700">
                    {logs.map((log, idx) => (<tr key={idx} className="hover:bg-slate-700/30"><td className="px-6 py-4 font-mono">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : '-'}</td><td className="px-6 py-4 font-mono text-cyan-400">{log.ip}</td><td className="px-6 py-4 max-w-xs truncate">{log.userAgent}</td><td className="px-6 py-4 max-w-xs truncate">{log.referrer}</td></tr>))}
                    {logs.length === 0 && <tr><td colSpan="4" className="px-6 py-12 text-center">尚無數據</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}