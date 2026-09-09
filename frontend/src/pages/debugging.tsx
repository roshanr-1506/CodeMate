import { useState, useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Lock, Code2, CheckCircle, ArrowRight, Zap } from 'lucide-react';
import { api } from '../api';
import { useData } from '../hooks';
const CodeView = lazy(() => import('../components/CodeView'));
export function Debugging({ session, team }: any) {
  const { data: questions, error } = useData('/debug/questions'),
    { data: current } = useData('/debug/current'),
    { data: history } = useData('/debug/history'),
    { data: inventory } = useData('/team/powerups');
  const [result, setResult] = useState<any>(null),
    [selected, setSelected] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [language, setLanguage] = useState('All languages'),
    [tick, setTick] = useState(0);
  const attempt = current ?? result;
  const [anchor, setAnchor] = useState(performance.now());
  useEffect(() => {
    if (current) {
      setResult(null);
      setAnchor(performance.now());
    }
  }, [current]);
  useEffect(() => {
    const t = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setSelected(null), [attempt?.id]);
  const frozen = attempt
    ? Math.max(
        0,
        Date.parse(attempt.frozenUntil ?? '1970-01-01') -
          attempt.serverNow -
          (performance.now() - anchor),
      )
    : 0;
  const remaining = attempt
    ? Math.max(
        0,
        attempt.remainingMs -
          Math.max(
            0,
            performance.now() -
              anchor -
              Math.max(0, Date.parse(attempt.frozenUntil ?? '1970-01-01') - attempt.serverNow),
          ),
      )
    : 0;
  const canPlay = session.role === 'DEBUGGING' && team.settings.state === 'RUNNING';
  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setMessage('');
    try {
      const r = await fn();
      setResult(r);
      setAnchor(performance.now());
      if (r.status && r.status !== 'ACTIVE')
        setMessage(
          r.status === 'CORRECT'
            ? 'Correct answer! +' + r.question.points
            : r.status === 'INCORRECT'
              ? 'Not this time. Review the explanation below.'
              : (r.message ?? 'Question ' + r.status.toLowerCase() + '.'),
        );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">02 / THE CODE</p>
          <h2>Debugging Arena</h2>
          <p className="muted">Read carefully. Think clearly. Find the flaw.</p>
        </div>
        <span className="badge">{history?.length ?? 0} ATTEMPTED</span>
      </div>
      {session.role !== 'DEBUGGING' && (
        <div className="banner">
          Your teammate controls the Debugging role. You can follow their progress here.
        </div>
      )}
      {(message || error) && (
        <div className="banner" role="status">
          {message || error}
        </div>
      )}
      {attempt ? (
        <div className="challenge-layout">
          <section className="panel question-panel">
            <div className="question-meta">
              <span className="badge">{attempt.question.language}</span>
              <span>{attempt.question.difficulty}</span>
              <b className="gold">+{attempt.question.points} POINTS</b>
            </div>
            <h3>{attempt.question.title}</h3>
            <p>{attempt.question.prompt}</p>
            <div className="code-toolbar">
              <Code2 size={16} /> READ-ONLY CODE <span>{attempt.question.language}</span>
            </div>
            <Suspense fallback={<pre>{attempt.question.code_snippet}</pre>}>
              <CodeView code={attempt.question.code_snippet} language={attempt.question.language} />
            </Suspense>
            {attempt.hint && <div className="banner">Hint: {attempt.hint}</div>}
            {attempt.status !== 'ACTIVE' && (
              <div className="result-box">
                <h3>
                  {attempt.status === 'CORRECT'
                    ? 'Well spotted.'
                    : attempt.status === 'EXPIRED'
                      ? 'Time’s up.'
                      : 'Review your reasoning.'}
                </h3>
                <p>{attempt.explanation}</p>
                <p>Correct answer: {attempt.question.options[attempt.correctAnswer]}</p>
                <button
                  onClick={() => {
                    setResult(null);
                    setMessage('');
                  }}
                >
                  Choose next question <ArrowRight size={17} />
                </button>
              </div>
            )}
          </section>
          <aside className="panel answer-panel">
            <div className={'timer ' + (remaining < 15000 ? 'negative' : '')}>
              <Clock size={20} />
              <strong>
                {attempt.status === 'ACTIVE'
                  ? team.settings.state === 'PAUSED'
                    ? 'Paused'
                    : Math.ceil(remaining / 1000) + 's'
                  : attempt.status}
              </strong>
              <span>{frozen > 0 ? 'TIME FROZEN' : 'SERVER TIMER'}</span>
            </div>
            <p className="small muted">Select the correct output</p>
            <div className="answer-options">
              {attempt.question.options.map((option: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  disabled={
                    !canPlay || attempt.status !== 'ACTIVE' || attempt.removedOptions.includes(i)
                  }
                  className={selected === i ? 'selected' : ''}
                >
                  <span>{String.fromCharCode(65 + i)}</span>
                  {attempt.removedOptions.includes(i) ? 'Option removed' : option}
                  {selected === i && <CheckCircle size={18} />}
                </button>
              ))}
            </div>
            <button
              className="wide"
              disabled={
                !canPlay ||
                busy ||
                selected === null ||
                attempt.status !== 'ACTIVE' ||
                remaining === 0
              }
              onClick={() =>
                act(() =>
                  api('/debug/questions/' + attempt.questionId + '/submit', { answer: selected }),
                )
              }
            >
              {busy ? 'Checking…' : 'Lock in answer'} <ArrowRight size={17} />
            </button>
            <div className="powerup-bar">
              <h3>
                <Zap size={18} /> Your power-ups
              </h3>
              {inventory
                ?.filter((p: any) => p.owned > 0)
                .map((p: any) => (
                  <button
                    key={p.id}
                    className="secondary"
                    disabled={!canPlay || busy || attempt.status !== 'ACTIVE'}
                    onClick={() =>
                      act(() => api('/powerups/' + p.id + '/use', { attemptId: attempt.id }))
                    }
                  >
                    {p.name} <span>×{p.owned}</span>
                  </button>
                ))}
              {!inventory?.some((p: any) => p.owned > 0) && (
                <p className="small muted">No power-ups in your inventory.</p>
              )}
              <Link to="/shop" className="text-link">
                Visit the reward shop ↗
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h3>Choose your challenge</h3>
            <select
              aria-label="Filter language"
              className="compact-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {[
                'All languages',
                ...new Set<string>((questions ?? []).map((q: any) => q.language)),
              ].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="question-list">
            {questions
              ?.filter(
                (q: any) =>
                  (!q.premium || q.owned) &&
                  !q.attempt_status &&
                  (language === 'All languages' || q.language === language),
              )
              .map((q: any) => (
                <button
                  className="question-item"
                  key={q.id}
                  disabled={!canPlay || busy}
                  onClick={() => act(() => api('/debug/questions/' + q.id + '/start', {}))}
                >
                  <span className="language-box">{q.language}</span>
                  <div>
                    <b>{q.title}</b>
                    <small>
                      {q.difficulty} · {q.time_limit}s {q.premium ? '· Premium' : ''}
                    </small>
                  </div>
                  <strong>+{q.points}</strong>
                  <ArrowRight size={18} />
                </button>
              ))}
          </div>
          <Link to="/shop" className="text-link">
            <Lock size={15} /> Unlock advanced questions in the shop
          </Link>
        </section>
      )}
      {history?.length > 0 && (
        <section className="panel history-panel">
          <h3>Attempt history</h3>
          {history.slice(0, 10).map((a: any) => (
            <div className="list-row" key={a.id}>
              <span>{a.question.title}</span>
              <b className={a.status === 'CORRECT' ? 'positive' : 'muted'}>{a.status}</b>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
