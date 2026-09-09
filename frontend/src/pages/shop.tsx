import { useState } from 'react';
import {
  Snowflake,
  Split,
  Target,
  Clock,
  SkipForward,
  Lightbulb,
  Lock,
  Check,
  Layers,
  Code2,
  Wallet,
} from 'lucide-react';
import { api } from '../api';
import { useData } from '../hooks';
const icons: any = {
  FREEZE: Snowflake,
  HALF: Split,
  BLAST: Target,
  EXTRA: Clock,
  SKIP: SkipForward,
  HINT: Lightbulb,
};
export function Shop({ session, team }: any) {
  const { data, error } = useData('/shop');
  const [tab, setTab] = useState('POWERUP'),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState('');
  async function buy(kind: string, item: any) {
    setBusy(item.id);
    setMessage('');
    try {
      const r = await api('/shop/purchase', { kind, itemId: item.id });
      setMessage(
        (item.name ?? item.title) +
          ' is yours.' +
          (r.unlocked
            ? ' ' + r.unlocked + ' question' + (r.unlocked > 1 ? 's' : '') + ' unlocked.'
            : ''),
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy('');
    }
  }
  const items =
    tab === 'POWERUP' ? data?.powerups : tab === 'QUESTION' ? data?.questions : data?.sets;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">03 / YOUR ADVANTAGE</p>
          <h2>Reward Shop</h2>
          <p className="muted">Spend strategically. Give your next answer an edge.</p>
        </div>
        <div className="balance-pill">
          <Wallet size={20} />
          <strong>{team.balance}</strong>
          <span>AVAILABLE</span>
        </div>
      </div>
      {(message || error) && (
        <div role="status" className="banner">
          {message || error}
        </div>
      )}
      <div className="tabs">
        {[
          ['POWERUP', 'Power-ups'],
          ['QUESTION', 'Premium questions'],
          ['SET', 'Question sets'],
        ].map(([value, label]) => (
          <button
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="product-grid">
        {items?.map((item: any) => {
          const Icon =
            tab === 'POWERUP' ? (icons[item.effect] ?? Lightbulb) : tab === 'SET' ? Layers : Code2;
          const price =
            tab === 'QUESTION' ? data.individualPrice : tab === 'SET' ? item.price : item.cost;
          const owned = tab !== 'POWERUP' && item.owned;
          return (
            <article className="panel product-card" key={item.id}>
              <div className="product-top">
                <span className="product-icon">
                  <Icon size={27} />
                </span>
                {item.owned > 0 && (
                  <span className="badge">
                    {tab === 'POWERUP' ? item.owned + ' OWNED' : 'UNLOCKED'}
                  </span>
                )}
              </div>
              <h3>{item.name ?? item.title}</h3>
              <p className="muted">
                {item.description ??
                  item.language +
                    ' · ' +
                    item.difficulty +
                    ' · ' +
                    item.points +
                    ' points for a correct answer.'}
              </p>
              {tab === 'SET' && (
                <div className="set-meta">
                  <span>{item.question_count} QUESTIONS</span>
                  <span>{item.points_per_question} PTS EACH</span>
                  <span>MIXED LANGUAGES</span>
                </div>
              )}
              <div className="product-bottom">
                <div>
                  <strong>{price}</strong>
                  <small>POINTS</small>
                </div>
                <button
                  disabled={
                    !!busy ||
                    owned ||
                    session.role !== 'DEBUGGING' ||
                    team.settings.state !== 'RUNNING' ||
                    !team.settings.shopOpen ||
                    team.balance < price
                  }
                  onClick={() => buy(tab, item)}
                >
                  {owned ? (
                    <>
                      <Check size={16} /> Owned
                    </>
                  ) : busy === item.id ? (
                    'Purchasing…'
                  ) : team.balance < price ? (
                    'Need ' + (price - team.balance) + ' more'
                  ) : (
                    <>
                      <Lock size={15} />
                      {tab === 'POWERUP' ? 'Purchase' : 'Unlock'}
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {session.role !== 'DEBUGGING' && (
        <p className="muted">Purchases are made by your Debugging teammate.</p>
      )}
      <p className="shop-note">
        Purchases use your shared team balance. Your earned leaderboard score stays intact.
      </p>
    </>
  );
}
