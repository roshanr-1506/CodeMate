import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Shield,
  Code2,
  Swords,
  Wallet,
  Trophy,
  Users,
  ArrowDownLeft,
} from 'lucide-react';
import { api, setCsrf } from '../api';
import { useData } from '../hooks';
import { TeamStats } from '../components/TeamStats';
export function Landing() {
  return (
    <main className="landing">
      <header>
        <b>
          <span className="cu-mark">CU</span> CHANDIGARH UNIVERSITY
        </b>
        <span>C SQUARE CLUB</span>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">LOGIC MEETS STRATEGY</p>
          <h1>
            CODE<span>MATE</span>
            <em>2.0</em>
          </h1>
          <h2>
            Same board.
            <br />
            Different game.
          </h2>
          <p className="muted">Two minds. One team. Every move matters.</p>
          <div className="hero-terminal">
            <div><span className="prompt">&gt;</span> <span className="fn">think()</span></div>
            <div><span className="prompt">&gt;</span> <span className="fn">plan()</span></div>
            <div><span className="prompt">&gt;</span> <span className="fn">solve()</span></div>
            <div><span className="prompt">&gt;</span> <span className="fn">improve()</span></div>
            <div><span className="prompt">&gt;</span> <span className="fn">repeat()</span></div>
          </div>
          <Link className="button" to="/login">
            Enter competition <ArrowUpRight size={18} />
          </Link>
          <Link className="hero-rules-link" to="/rules">
            Explore the rules <ArrowRight size={16} />
          </Link>
          <div className="hero-bottom">
            <span>01 / CHESS</span>
            <span>02 / DEBUGGING</span>
            <span>03 / STRATEGY</span>
          </div>
        </div>
        <img
          src="/poster.jpeg"
          alt="CodeMate 2.0 poster: gold-lit chess pieces and programming screens"
        />
      </section>
      <footer>
        LOGIC MEETS STRATEGY <span>CHANDIGARH UNIVERSITY · C SQUARE CLUB</span>
      </footer>
    </main>
  );
}
export function Login({ onLogin }: { onLogin: (s: any) => void }) {
  const [role, setRole] = useState('CHESS'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  async function submit(e: any) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const r = await api('/auth/login', {
        identifier: form.get('identifier'),
        password: form.get('password'),
        role,
      });
      setCsrf(r.csrf);
      onLogin(r.session);
      navigate(role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <Link className="brand" to="/">
        CODEMATE <em>2.0</em>
      </Link>
      <div className="login-grid">
        <div className="login-art">
          <p className="eyebrow">CODE. STRATEGIZE. CONQUER.</p>
          <h2>
            Different moves.
            <br />
            Same mindset.
          </h2>
          <img src="/poster.jpeg" alt="CodeMate competition poster" />
        </div>
        <form onSubmit={submit} className="panel login-form">
          <p className="eyebrow">THE ARENA IS YOURS</p>
          <h2>Take your position.</h2>
          <p className="muted">Your team credentials. Your role. One shared score.</p>
          <div className="role-select">
            {[
              ['CHESS', Swords],
              ['DEBUGGING', Code2],
              ['ADMIN', Shield],
            ].map(([r, Icon]: any) => (
              <button
                key={r}
                type="button"
                className={role === r ? 'selected' : ''}
                onClick={() => setRole(r)}
              >
                <Icon size={21} />
                {r}
              </button>
            ))}
          </div>
          <label>
            {role === 'ADMIN' ? 'Admin username' : 'Team ID'}
            <input
              name="identifier"
              autoComplete="username"
              required
              placeholder={role === 'ADMIN' ? 'Your username' : 'TEAM-001'}
            />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <button className="wide" disabled={busy}>
            {busy ? 'Checking credentials…' : 'Enter ' + role.toLowerCase() + ' arena'}{' '}
            <ArrowUpRight size={18} />
          </button>
          <p className="muted small">
            <Shield size={14} /> Two participants per team. Roles stay locked for the round.
          </p>
        </form>
      </div>
    </main>
  );
}
export function ScoreCards({ team }: any) {
  return (
    <div className="stats">
      {[
        [Swords, 'Chess points', team.chess_earned],
        [Code2, 'Debugging points', team.debugging_earned],
        [Wallet, 'Available balance', team.balance],
        [Trophy, 'Total earned', team.total_earned],
      ].map(([Icon, label, value]: any) => (
        <div className="stat" key={label}>
          <div>
            <span>{label}</span>
            <Icon size={19} />
          </div>
          <strong key={value}>{Number(value).toLocaleString()}</strong>
          <small>
            {label === 'Available balance'
              ? 'POINTS TO SPEND'
              : label === 'Total earned'
                ? 'NET SCORE · BEFORE PURCHASES'
                : 'COMPETITION POINTS'}
          </small>
        </div>
      ))}
    </div>
  );
}
export function Dashboard({ session, team }: any) {
  const { data: activity } = useData('/team/activity');
  const { data: standings } = useData('/leaderboard');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR COMPETITION HQ</p>
          <h2>Make your next move.</h2>
          <p className="muted">
            {team.name} · {team.id}
          </p>
        </div>
        <span className="badge">
          <span className="dot" />
          {team.settings.state} · RANK{' '}
          {standings?.rows.find((r: any) => r.id === team.id)?.rank ?? '—'}
          {standings?.delaySeconds ? ' (DELAYED)' : ''}
        </span>
      </div>
      <ScoreCards team={team} />
      <div className="arena-grid">
        <Link to="/chess" className="arena-card chess-card">
          <Swords size={35} />
          <span className="eyebrow">01 / THE BOARD</span>
          <h3>Chess Arena</h3>
          <p>
            Outthink your opponent.
            <br />
            Make every capture count.
          </p>
          <span className="card-action">
            {session.role === 'CHESS' ? 'Enter the arena' : 'View your team’s games'}{' '}
            <ArrowUpRight />
          </span>
        </Link>
        <Link to="/debugging" className="arena-card code-card">
          <Code2 size={35} />
          <span className="eyebrow">02 / THE CODE</span>
          <h3>Debugging Arena</h3>
          <p>
            Find the flaw.
            <br />
            Turn logic into points.
          </p>
          <span className="card-action">
            {session.role === 'DEBUGGING' ? 'Start a challenge' : 'View your team’s progress'}{' '}
            <ArrowUpRight />
          </span>
        </Link>
      </div>
      <div className="columns">
        <section className="panel">
          <div className="section-heading">
            <h3>Team pulse</h3>
            <Users size={18} />
          </div>
          {['CHESS', 'DEBUGGING'].map((role) => (
            <div className="list-row" key={role}>
              <span>
                {role === 'CHESS' ? <Swords /> : <Code2 />} {role}
              </span>
              <span
                className={team.sessions.some((s: any) => s.role === role) ? 'positive' : 'muted'}
              >
                {team.sessions.some((s: any) => s.role === role) ? '● Active' : '○ Offline'}
              </span>
            </div>
          ))}
          <p className="small muted">Your points and inventory are shared by both teammates.</p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>Recent activity</h3>
            <ArrowDownLeft size={18} />
          </div>
          <Activity rows={activity?.slice(0, 5)} />
        </section>
      </div>
    </>
  );
}
export function Activity({ rows }: any) {
  return rows?.length ? (
    <div className="activity">
      {rows.map((r: any) => (
        <div className="list-row" key={r.id}>
          <div>
            <b>{r.description}</b>
            <small className="muted">
              {new Date(r.created_at).toLocaleTimeString()} · {r.type.replaceAll('_', ' ')}
            </small>
          </div>
          <strong className={r.amount >= 0 ? 'positive' : 'negative'}>
            {r.amount > 0 ? '+' : ''}
            {r.amount}
          </strong>
        </div>
      ))}
    </div>
  ) : (
    <p className="empty">Your next move starts the story. Activity will appear here.</p>
  );
}
export function Team({ team }: any) {
  const { data } = useData('/team/activity');
  return (
    <>
      <p className="eyebrow">TWO MINDS. ONE TEAM.</p>
      <h2>{team.name}</h2>
      <p className="muted">{team.id}</p>
      <ScoreCards team={team} />
      <TeamStats />
      <section className="panel">
        <h3>Point transaction history</h3>
        <p className="muted">
          Earned {team.total_earned} · Spent {team.spent} · Available {team.balance}
        </p>
        <Activity rows={data} />
      </section>
    </>
  );
}
export function Rules({ session }: { session?: any }) {
  const { data } = useData('/settings');
  const s = data?.scoring;
  const isLoggedIn = !!session;
  // When logged in, we're inside the Shell (sidebar is visible), so use a simpler layout
  if (isLoggedIn) {
    return (
      <>
        <p className="eyebrow">KNOW THE GAME</p>
        <h2>Code. Strategize. Conquer.</h2>
        <div className="columns">
          <section className="panel">
            <h3>One team. Two roles.</h3>
            <p>
              Use your Team ID and password. One participant plays Chess, the other solves debugging
              challenges. A third active login is rejected. Ask an administrator to change a locked
              role.
            </p>
            <h3>Chess</h3>
            <p>
              Play legal 1v1 chess inside CodeMate. Captures, move quality and match results
              contribute independently. Engine analysis is private and may
              arrive after your move.
            </p>
            <p>
              Opening bonuses are restricted by the farming guard. Early resignations reverse the
              game's points. Strategic resignations (after sufficient moves) earn bonus points. Ask an administrator about the round's settings.
            </p>
          </section>
          <section className="panel">
            <h3>Debugging & rewards</h3>
            <p>
              Select one answer before the server timer ends. Each question allows one attempt per
              round. Buy power-ups with the shared available balance, then activate them on a running
              question.
            </p>
            <p>
              Premium sets contain 25 Hard/Expert questions across mixed languages. Owning a set
              unlocks every included question.
            </p>
            <h3>Scoring</h3>
            <p>
              Total earned is your net competition score. Available balance subtracts purchases.
              Purchases do not reduce your leaderboard score. During shop windows, Debugging sees a
              delayed leaderboard.
            </p>
            {s && (
              <p>
                Captures: Pawn {s.capture.p}, Knight {s.capture.n}, Bishop {s.capture.b}, Rook{' '}
                {s.capture.r}, Queen {s.capture.q}. Checkmate bonus {s.capture.k}. Win {s.result.win},
                Draw {s.result.draw}, Loss {s.result.loss}. Strategic resign bonus {s.strategicResignPoints ?? 50}.
              </p>
            )}
          </section>
        </div>
        <Link className="button" to="/dashboard">
          Go to Dashboard <ArrowUpRight size={18} />
        </Link>
      </>
    );
  }
  return (
    <main className="rules-page">
      <Link className="brand" to="/">
        CODEMATE <em>2.0</em>
      </Link>
      <p className="eyebrow">KNOW THE GAME</p>
      <h2>Code. Strategize. Conquer.</h2>
      <div className="columns">
        <section className="panel">
          <h3>One team. Two roles.</h3>
          <p>
            Use your Team ID and password. One participant plays Chess, the other solves debugging
            challenges. A third active login is rejected. Ask an administrator to change a locked
            role.
          </p>
          <h3>Chess</h3>
          <p>
            Play legal 1v1 chess inside CodeMate. Captures, move quality and match results
            contribute independently. Engine analysis is private and may
            arrive after your move.
          </p>
          <p>
            Opening bonuses are restricted by the farming guard. Early resignations reverse the
            game's points. Strategic resignations (after sufficient moves) earn bonus points. Ask an administrator about the round's settings.
          </p>
        </section>
        <section className="panel">
          <h3>Debugging & rewards</h3>
          <p>
            Select one answer before the server timer ends. Each question allows one attempt per
            round. Buy power-ups with the shared available balance, then activate them on a running
            question.
          </p>
          <p>
            Premium sets contain 25 Hard/Expert questions across mixed languages. Owning a set
            unlocks every included question.
          </p>
          <h3>Scoring</h3>
          <p>
            Total earned is your net competition score. Available balance subtracts purchases.
            Purchases do not reduce your leaderboard score. During shop windows, Debugging sees a
            delayed leaderboard.
          </p>
          {s && (
            <p>
              Captures: Pawn {s.capture.p}, Knight {s.capture.n}, Bishop {s.capture.b}, Rook{' '}
              {s.capture.r}, Queen {s.capture.q}. Checkmate bonus {s.capture.k}. Win {s.result.win},
              Draw {s.result.draw}, Loss {s.result.loss}. Strategic resign bonus {s.strategicResignPoints ?? 50}.
            </p>
          )}
        </section>
      </div>
      <Link className="button" to="/login">
        Enter competition <ArrowUpRight size={18} />
      </Link>
    </main>
  );
}
