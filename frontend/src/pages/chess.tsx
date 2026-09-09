import { useState, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Swords, Flag, Clock, ArrowRight, Shield, RotateCcw, ChevronLeft, ChevronRight, FastForward, Rewind } from 'lucide-react';
import { api, refresh } from '../api';
import { useData } from '../hooks';
import { io } from 'socket.io-client';

function ChessTimer({ initialMs, lastMoveAt, isRunning }: { initialMs: number, lastMoveAt: string | null, isRunning: boolean }) {
  const [ms, setMs] = useState(initialMs);

  useEffect(() => {
    setMs(initialMs);
    if (!isRunning || !lastMoveAt) return;
    const start = new Date(lastMoveAt).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      setMs(Math.max(0, initialMs - (now - start)));
    }, 100);
    return () => clearInterval(interval);
  }, [initialMs, lastMoveAt, isRunning]);

  if (ms == null) return null;

  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <span className={`chess-clock ${ms < 10000 ? 'low-time' : ''}`}>{m}:{s.toString().padStart(2, '0')}</span>;
}

export function ChessArena({ session, team }: any) {
  const { data: matches } = useData('/chess/matches');
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [waiting, setWaiting] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [source, setSource] = useState(''),
    [promotion, setPromotion] = useState<any>(null),
    [resigning, setResigning] = useState(false),
    [legalMoves, setLegalMoves] = useState<string[]>([]),
    [reviewPly, setReviewPly] = useState<number | null>(null),
    [popups, setPopups] = useState<{ id: string, text: string, type: 'positive' | 'negative' }[]>([]);

  const popupId = useRef(0);

  const active = matches?.find((m: any) => m.status === 'ACTIVE');
  const id = selectedId ?? active?.id ?? matches?.[0]?.id;
  const { data: match, reload } = useData(id ? '/chess/matches/' + id : null);

  useEffect(() => {
    if (active) {
      setWaiting(false);
      setSelectedId(active.id);
    }
  }, [active?.id]);

  useEffect(() => {
    api('/chess/matchmaking')
      .then((r) => setWaiting(r.waiting))
      .catch(() => { });
  }, []);

  // Socket for score popups
  useEffect(() => {
    const socket = io(import.meta.env.VITE_BACKEND_URL || undefined, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('chess:piece_captured', (data: any) => {
      if (data.matchId === id && data.teamId === session.team_id && data.points > 0) {
        addPopup('+' + data.points + ' Capture!', 'positive');
      }
    });
    return () => { socket.disconnect(); };
  }, [id, session.team_id]);

  const addPopup = (text: string, type: 'positive' | 'negative') => {
    const pid = String(++popupId.current);
    setPopups(p => [...p, { id: pid, text, type }]);
    setTimeout(() => {
      setPopups(p => p.filter(x => x.id !== pid));
    }, 2000);
  };

  // Switch to review mode if completed, exit review if active
  useEffect(() => {
    if (match?.status === 'ACTIVE') setReviewPly(null);
    else if (match?.status === 'COMPLETED' && reviewPly === null) {
      setReviewPly(match.moves.length);
    }
  }, [match?.status, match?.moves?.length]);

  const canPlay =
    session.role === 'CHESS' &&
    team.settings.state === 'RUNNING' &&
    match?.status === 'ACTIVE' &&
    match.fen.split(' ')[1] === match.color &&
    reviewPly === null;

  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setMessage('');
    try {
      return await fn();
    } catch (e: any) {
      setMessage(e.message);
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const r = await act(() => api('/chess/matchmaking/join', {}));
    if (r) {
      setWaiting(r.status === 'WAITING');
      if (r.matchId) setSelectedId(r.matchId);
    }
  }

  function requestMove(from: string, to: string, piece = 'q') {
    if (!canPlay || busy) return;
    const p = new Chess(match.fen).get(from as any);
    if (p?.type === 'p' && (to[1] === '1' || to[1] === '8') && !promotion) {
      setPromotion({ from, to });
      return;
    }
    setPromotion(null);
    setSource('');
    setLegalMoves([]);
    act(() =>
      api('/chess/matches/' + id + '/move', { from, to, promotion: piece, expectedPly: match.ply }),
    );
  }

  function onSquareClick(square: string) {
    if (!canPlay) return;
    if (source && source !== square) {
      requestMove(source, square);
    } else {
      setSource(square);
      const game = new Chess(match.fen);
      const moves = game.moves({ square: square as any, verbose: true });
      if (moves.length === 0) {
        setSource('');
        setLegalMoves([]);
      } else {
        setLegalMoves(moves.map(m => m.to));
      }
    }
  }

  // Calculate the board to show based on review mode
  let displayFen = match?.fen;
  let lastMovePlayed: any = null;
  if (match && reviewPly !== null) {
    if (reviewPly === 0) displayFen = match.initial_fen;
    else if (reviewPly <= match.moves.length) {
      const reviewMove = match.moves[reviewPly - 1];
      displayFen = reviewMove.fen_after;
      lastMovePlayed = reviewMove;
    }
  } else if (match && match.moves.length > 0) {
    lastMovePlayed = match.moves[match.moves.length - 1];
  }

  // Custom square styles for highlights
  const customSquareStyles: any = {};
  if (source) customSquareStyles[source] = { backgroundColor: 'rgba(211, 164, 82, 0.7)' }; // Highlight selected piece
  legalMoves.forEach(sq => {
    const isCapture = !!new Chess(match.fen).get(sq as any);
    customSquareStyles[sq] = {
      background: isCapture
        ? 'radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.4) 65%, rgba(0,0,0,0.4) 100%)'
        : 'radial-gradient(circle, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.4) 20%, rgba(0,0,0,0) 25%)',
      borderRadius: '50%'
    };
  });
  if (lastMovePlayed && !source) {
    customSquareStyles[lastMovePlayed.from_square] = { backgroundColor: 'rgba(155, 199, 0, 0.41)' };
    customSquareStyles[lastMovePlayed.to_square] = { backgroundColor: 'rgba(155, 199, 0, 0.41)' };
  }

  const scores = match?.scores.filter((s: any) => s.team_id === session.team_id) ?? [];
  const score = (type: string) =>
    scores.filter((s: any) => s.type === type).reduce((sum: number, s: any) => sum + s.points, 0);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">01 / THE BOARD</p>
          <h2>Chess Arena</h2>
          <p className="muted">Different moves. Same mindset.</p>
        </div>
        <span className="badge">
          <Clock size={13} /> {match?.time_control === 'TIMED' ? 'TIMED MATCH' : 'UNLIMITED TIME'}
        </span>
      </div>
      {message && (
        <div className="error" role="alert">
          {message}
        </div>
      )}
      {!match || waiting ? (
        <section className="panel matchmaking">
          <Swords size={48} />
          <h3>{waiting ? 'Waiting for your opponent…' : 'Your next opponent awaits.'}</h3>
          <p>
            Join the queue to play another team.
            <br />
            Capture pieces. Find strong moves. Build your team’s score.
          </p>
          {waiting ? (
            <button
              className="secondary"
              onClick={() =>
                act(() => api('/chess/matchmaking/cancel', {})).then(() => setWaiting(false))
              }
            >
              Leave queue
            </button>
          ) : (
            <button
              disabled={busy || session.role !== 'CHESS' || team.settings.state !== 'RUNNING'}
              onClick={join}
            >
              Find opponent <ArrowRight size={18} />
            </button>
          )}
        </section>
      ) : (
        <div className="chess-layout">
          <section className="board-panel" style={{ position: 'relative' }}>
            <div className="player-strip">
              <Swords size={21} />
              <b>{match.color === 'w' ? match.black_team : match.white_team}</b>
              <span>OPPONENT · {match.color === 'w' ? 'BLACK' : 'WHITE'}</span>
              {match.time_control === 'TIMED' && (
                <ChessTimer
                  initialMs={match.color === 'w' ? match.black_time_ms : match.white_time_ms}
                  lastMoveAt={match.last_move_at}
                  isRunning={match.status === 'ACTIVE' && match.fen.split(' ')[1] !== match.color && reviewPly === null}
                />
              )}
            </div>
            <div className="board-wrap" style={{ position: 'relative' }}>
              {popups.map(p => (
                <div key={p.id} className={`score-popup popup-${p.type}`}>{p.text}</div>
              ))}
              <Chessboard
                options={{
                  id: 'codemate-board',
                  position: displayFen,
                  boardOrientation: match.color === 'w' ? 'white' : 'black',
                  allowDragging: canPlay && !busy,
                  darkSquareStyle: { backgroundColor: '#7c5c3c' },
                  lightSquareStyle: { backgroundColor: '#e6ceb0' },
                  boardStyle: { borderRadius: '5px' },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (targetSquare) requestMove(sourceSquare, targetSquare);
                    return false;
                  },
                  onSquareClick: ({ square }) => onSquareClick(square),
                  squareStyles: customSquareStyles,
                  onPieceDrag: ({ piece, square }) => {
                     if (!canPlay || !square) return;
                     const game = new Chess(match.fen);
                     // only highlight if it's their piece
                     if (String(piece).startsWith(match.color)) {
                       setSource(square as string);
                       const moves = game.moves({ square: square as any, verbose: true });
                       setLegalMoves(moves.map(m => m.to));
                     }
                  }
                }}
              />
            </div>
            <div className="player-strip">
              <Shield size={21} />
              <b>{session.team_id}</b>
              <span>YOU · {match.color === 'w' ? 'WHITE' : 'BLACK'}</span>
              {match.time_control === 'TIMED' && (
                <ChessTimer
                  initialMs={match.color === 'w' ? match.white_time_ms : match.black_time_ms}
                  lastMoveAt={match.last_move_at}
                  isRunning={match.status === 'ACTIVE' && match.fen.split(' ')[1] === match.color && reviewPly === null}
                />
              )}
            </div>
            {match.status === 'COMPLETED' && (
              <div className="match-review-controls">
                <button onClick={() => setReviewPly(0)} disabled={reviewPly === 0} title="Start of game"><Rewind size={16} /></button>
                <button onClick={() => setReviewPly(Math.max(0, (reviewPly ?? 0) - 1))} disabled={reviewPly === 0} title="Previous move"><ChevronLeft size={16} /></button>
                <span className="review-label">Move {reviewPly} / {match.moves.length}</span>
                <button onClick={() => setReviewPly(Math.min(match.moves.length, (reviewPly ?? 0) + 1))} disabled={reviewPly === match.moves.length} title="Next move"><ChevronRight size={16} /></button>
                <button onClick={() => setReviewPly(match.moves.length)} disabled={reviewPly === match.moves.length} title="End of game"><FastForward size={16} /></button>
              </div>
            )}
            {match.status === 'ACTIVE' && (
              <form
                className="move-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  requestMove(String(f.get('from')), String(f.get('to')));
                }}
              >
                <label>
                  From
                  <input
                    name="from"
                    aria-label="Move from"
                    placeholder="e2"
                    pattern="[a-h][1-8]"
                    maxLength={2}
                    required
                  />
                </label>
                <label>
                  To
                  <input
                    name="to"
                    aria-label="Move to"
                    placeholder="e4"
                    pattern="[a-h][1-8]"
                    maxLength={2}
                    required
                  />
                </label>
                <button disabled={!canPlay || busy}>Move</button>
              </form>
            )}
          </section>
          <aside>
            <section className="panel">
              <span className="eyebrow">MATCH STATUS</span>
              <h3 className="turn-label">
                {match.status === 'COMPLETED'
                  ? 'Game complete · ' + match.result
                  : canPlay
                    ? 'Your move.'
                    : 'Opponent’s move.'}
              </h3>
              {match.status === 'COMPLETED' && (
                <p className="muted">
                  {match.termination.replaceAll('_', ' ')}
                  {match.score_void ? ' · Early resignation: game points reversed.' : ''}
                </p>
              )}
              <div className="chess-score">
                <strong>{scores.reduce((n: number, s: any) => n + s.points, 0)}</strong>
                <span>THIS MATCH · YOUR POINTS</span>
              </div>
              {[
                ['Capture points', score('CHESS_CAPTURE')],
                ['Move quality', score('CHESS_MOVE_QUALITY')],
                ['Checkmate bonus', score('CHESS_CHECKMATE')],
                ['Result bonus', score('CHESS_RESULT')],
                ['Strategic resign bonus', score('CHESS_STRATEGIC_RESIGN')],
              ].map(([label, value]) => (
                <div className="list-row" key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
              {match.moves.some((m: any) =>
                ['PENDING_ANALYSIS', 'PROCESSING'].includes(m.analysis_status),
              ) && (
                  <p className="small muted">
                    Analysis pending. Your move-quality scoring will sync when the engine finishes.
                  </p>
                )}
              {match.status === 'ACTIVE' &&
                session.role === 'CHESS' &&
                (resigning ? (
                  <div className="confirm-inline">
                    <p>Resign this match? Early resignation may reverse all game points.</p>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() =>
                        act(() => api('/chess/matches/' + id + '/resign', {})).then(() =>
                          setResigning(false),
                        )
                      }
                    >
                      Confirm resignation
                    </button>
                    <button className="secondary" onClick={() => setResigning(false)}>
                      Keep playing
                    </button>
                  </div>
                ) : (
                  <button
                    className="secondary wide"
                    onClick={() => setResigning(true)}
                    disabled={busy || team.settings.state !== 'RUNNING'}
                  >
                    <Flag size={16} /> Resign match
                  </button>
                ))}
              {match.status === 'COMPLETED' && session.role === 'CHESS' && (
                <button
                  className="wide"
                  onClick={join}
                  disabled={busy || team.settings.state !== 'RUNNING'}
                >
                  Find next opponent <RotateCcw size={16} />
                </button>
              )}
            </section>
            <section className="panel move-history">
              <h3>Move history</h3>
              <div className="moves">
                {match.moves.map((m: any) => (
                  <div
                    className={`move-row ${(reviewPly ?? 0) === m.ply ? 'active-move' : ''}`}
                    key={m.id}
                    onClick={() => {
                      if (match.status === 'COMPLETED') setReviewPly(m.ply);
                    }}
                    style={match.status === 'COMPLETED' ? { cursor: 'pointer' } : {}}
                  >
                    <span>{m.ply}.</span>
                    <b>{m.san}</b>
                    <small className={m.points < 0 ? 'negative' : 'positive'}>
                      {m.classification ?? 'Pending'}{' '}
                      {m.analysis_status === 'COMPLETE' ? (m.points > 0 ? '+' : '') + m.points : ''}
                    </small>
                  </div>
                ))}
              </div>
              {!match.moves.length && <p className="empty">The board is set. White moves first.</p>}
            </section>
          </aside>
        </div>
      )}
      {matches?.length > 0 && (
        <section className="panel history-panel">
          <h3>Your matches</h3>
          {matches.map((m: any) => (
            <button
              className="match-history-button"
              key={m.id}
              onClick={() => {
                setSelectedId(m.id);
                setWaiting(false);
              }}
            >
              <span>
                {m.white_team} vs {m.black_team}
              </span>
              <span>
                {m.status === 'ACTIVE' ? 'In progress' : m.result} · {m.ply} plies
              </span>
            </button>
          ))}
        </section>
      )}
      {promotion && (
        <div className="modal-backdrop">
          <section
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose promotion"
          >
            <h3>Promote your pawn</h3>
            <div className="role-select">
              {[
                ['q', 'Queen'],
                ['r', 'Rook'],
                ['b', 'Bishop'],
                ['n', 'Knight'],
              ].map(([p, label]) => (
                <button key={p} onClick={() => requestMove(promotion.from, promotion.to, p)}>
                  {label}
                </button>
              ))}
            </div>
            <button className="secondary" onClick={() => setPromotion(null)}>
              Cancel
            </button>
          </section>
        </div>
      )}
    </>
  );
}
