import { Trophy, Clock } from 'lucide-react';
import { useData } from '../hooks';
export function Leaderboard({ session }: any) {
  const { data, error } = useData('/leaderboard');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE RACE TO THE TOP</p>
          <h2>Leaderboard</h2>
          <p className="muted">Logic meets strategy. The standings tell the story.</p>
        </div>
        <span className="badge">
          <Clock size={13} />{' '}
          {data?.delaySeconds ? data.delaySeconds + 's DELAY' : 'LIVE STANDINGS'}
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      {data?.delaySeconds > 0 && (
        <div className="banner">
          Fair-play view: standings are delayed during the shop window. Your team’s own balance
          stays live.
        </div>
      )}
      {data?.warming ? (
        <div className="panel empty">
          The delayed standings are preparing. They will appear once the first snapshot reaches the
          configured delay.
        </div>
      ) : (
        <>
          <div className="podium">
            {data?.rows.slice(0, 3).map((t: any, i: number) => (
              <div key={t.id} className={'panel podium-place podium-' + i}>
                <span className="eyebrow">RANK 0{i + 1}</span>
                <Trophy size={i === 0 ? 35 : 28} />
                <h3>{t.name}</h3>
                <span className="muted small">{t.id}</span>
                <strong>{t.total.toLocaleString()}</strong>
                <small>POINTS EARNED</small>
              </div>
            ))}
          </div>
          <section className="panel table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>TEAM</th>
                    <th>CHESS</th>
                    <th>DEBUGGING</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((t: any) => (
                    <tr className={t.id === session.team_id ? 'your-team' : ''} key={t.id}>
                      <td>
                        <b className="rank-number">#{t.rank}</b>
                      </td>
                      <td>
                        <b>{t.name}</b>
                        {t.id === session.team_id && <span className="you-label">YOU</span>}
                        <small>{t.id}</small>
                      </td>
                      <td>{t.chess_earned}</td>
                      <td>{t.debugging_earned}</td>
                      <td className="gold">
                        <b>{t.total}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              Ranked by net earned points before purchases. Ties are ordered by Team ID.
              {data?.asOf ? ' Updated ' + new Date(data.asOf).toLocaleTimeString() + '.' : ''}
            </p>
          </section>
        </>
      )}
    </>
  );
}
