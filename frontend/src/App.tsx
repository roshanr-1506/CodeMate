import { ChessArena } from './pages/chess';
import { io } from 'socket.io-client';
import { Debugging } from './pages/debugging';
import { Shop } from './pages/shop';
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Swords,
  Code2,
  ShoppingBag,
  Trophy,
  Users,
  BookOpen,
  LogOut,
  Bell,
  Shield,
} from 'lucide-react';
import { api, setCsrf, refresh } from './api';
import { useData } from './hooks';
import { Landing, Login, Dashboard, Team, Rules } from './pages/base';
import { AntiCheat } from './components/AntiCheat';
function Shell({ session, onLogout }: any) {
  const { data: team, error } = useData(session.role === 'ADMIN' ? null : '/team');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const t = setInterval(
      () => api('/auth/heartbeat', {}).catch((e) => setNotice(e.message)),
      25000,
    );
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const socket = io(import.meta.env.VITE_BACKEND_URL || undefined, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    let timer: any;
    socket.on('connect', () => {
      setNotice('');
      refresh();
    });
    socket.on('disconnect', () => setNotice('Connection lost. Reconnecting...'));
    socket.on('session:revoked', onLogout);
    socket.on('notification:new', (n) => setNotice(n.message));
    socket.on('debugging:question_expired', () => setNotice("Time's up!"));
    socket.onAny(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 100);
    });
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [session.id]);
  const nav =
    session.role === 'ADMIN'
      ? []
      : [
        ['/dashboard', 'Dashboard', LayoutDashboard],
        ['/chess', 'Chess Arena', Swords],
        ['/debugging', 'Debugging Arena', Code2],
        ['/shop', 'Reward Shop', ShoppingBag],
        ['/leaderboard', 'Leaderboard', Trophy],
        ['/team', 'Team', Users],
        ['/rules', 'Rules', BookOpen],
      ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          CODEMATE <em>2.0</em>
        </Link>
        <p className="sidebar-tag">SAME BOARD. DIFFERENT GAME.</p>
        <nav>
          {nav.map(([path, label, Icon]: any) => (
            <NavLink key={path} to={path}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
          {session.role === 'ADMIN' && (
            <NavLink to="/admin">
              <Shield size={19} />
              Admin control
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <p>C SQUARE CLUB</p>
          <small>Chandigarh University</small>
          <span className="red-line" />
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="muted">
            COMPETITION / <b>{session.role}</b>
          </span>
          <div>
            <button
              className="icon-button"
              title="Notifications"
              onClick={() =>
                api('/notifications').then((n) =>
                  setNotice(
                    n
                      .slice(0, 4)
                      .map((x: any) => x.message)
                      .join(' · ') || 'No notifications yet.',
                  ),
                )
              }
            >
              <Bell size={19} />
            </button>
            <span className="team-chip">{session.team_id ?? 'ADMIN'}</span>
            <button
              className="icon-button"
              title="Log out"
              onClick={() => api('/auth/logout', {}).then(onLogout)}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="content">
          {notice && (
            <div className="banner" role="status">
              {notice}
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {team?.settings.state === 'PAUSED' && (
            <div className="banner">Competition Paused · Your progress is saved.</div>
          )}
          {session.role === 'ADMIN' ? (
            <Admin session={session} />
          ) : team ? (
            <Routes>
              <Route path="/dashboard" element={<Dashboard session={session} team={team} />} />
              <Route path="/leaderboard" element={<Leaderboard session={session} />} />
              <Route path="/chess" element={<ChessArena session={session} team={team} />} />
              <Route path="/debugging" element={<Debugging session={session} team={team} />} />
              <Route path="/shop" element={<Shop session={session} team={team} />} />
              <Route path="/team" element={<Team team={team} />} />
              <Route path="/rules" element={<Rules session={session} />} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          ) : (
            <div className="loading-spinner"><span>LOADING COMPETITION...</span></div>
          )}
        </main>
      </div>
      {/* AntiCheat overlay — only enforced for CHESS/DEBUGGING */}
      <AntiCheat role={session.role} />
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<any>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/auth/session')
      .then((r) => {
        setCsrf(r.csrf);
        setSession(r.session);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
    const expired = () => setSession(null);
    window.addEventListener('codemate:expired', expired);
    return () => window.removeEventListener('codemate:expired', expired);
  }, []);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/rules" element={
          loading ? (
            <div className="loading-spinner"><span>LOADING...</span></div>
          ) : session ? (
            <Shell
              session={session}
              onLogout={() => {
                setSession(null);
                refresh();
              }}
            />
          ) : (
            <Rules />
          )
        } />
        <Route path="/login" element={<Login onLogin={setSession} />} />
        <Route
          path="*"
          element={
            loading ? (
              <div className="loading-spinner"><span>RESTORING SESSION...</span></div>
            ) : session ? (
              <Shell
                session={session}
                onLogout={() => {
                  setSession(null);
                  refresh();
                }}
              />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

import { Leaderboard } from './pages/leaderboard';
import { Admin } from './pages/admin';
