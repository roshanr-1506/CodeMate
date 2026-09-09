import { useData } from '../hooks';
export function TeamStats() {
  const { data } = useData('/team/statistics');
  if (!data) return null;
  const s = data.chess,
    d = data.debugging;
  return (
    <div className="columns">
      <section className="panel">
        <h3>Chess record</h3>
        {[
          ['Matches', s.matches],
          ['Wins', s.wins],
          ['Draws', s.draws],
          ['Losses', s.losses],
          ...s.captures.map((c: any) => [
            (
              {
                p: 'Pawns captured',
                n: 'Knights captured',
                b: 'Bishops captured',
                r: 'Rooks captured',
                q: 'Queens captured',
              } as any
            )[c.piece],
            c.count,
          ]),
          ...s.moveQuality.map((c: any) => [c.classification + ' moves', c.count]),
        ].map(([label, n]) => (
          <div className="list-row" key={label}>
            <span>{label}</span>
            <b>{n}</b>
          </div>
        ))}
      </section>
      <section className="panel">
        <h3>Debugging record</h3>
        {[
          ['Attempted', d.attempted],
          ['Correct', d.correct],
          ['Incorrect', d.incorrect],
          ['Expired', d.expired],
          ['Skipped', d.skipped],
          ['Accuracy', d.attempted ? Math.round((d.correct / d.attempted) * 100) + '%' : '—'],
          ['Premium questions owned', data.economy.premiumQuestions],
          ['Premium sets owned', data.economy.premiumSets],
          ...data.economy.inventory.map((p: any) => [p.name + ' owned', p.quantity]),
        ].map(([label, n]) => (
          <div className="list-row" key={label}>
            <span>{label}</span>
            <b>{n}</b>
          </div>
        ))}
      </section>
    </div>
  );
}
