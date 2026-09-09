import { useState } from 'react';
import {
  Plus,
  Download,
  Settings,
  Shield,
  Play,
  Pause,
  Square,
  Activity,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { api, refresh } from '../api';
import { useData } from '../hooks';
import { Leaderboard } from './leaderboard';
const sections = [
  ['overview', 'Overview'],
  ['teams', 'Teams'],
  ['sessions', 'Sessions'],
  ['matches', 'Chess matches'],
  ['questions', 'Questions'],
  ['question-sets', 'Question sets'],
  ['powerups', 'Power-ups & shop'],
  ['scoring', 'Scoring'],
  ['settings', 'Competition settings'],
  ['leaderboard', 'Leaderboard'],
  ['transactions', 'Transactions'],
  ['monitoring', 'Monitoring'],
  ['audit', 'Audit log'],
  ['violations', 'Anticheat log'],
];
const fields: any = {
  teams: ['id', 'name', 'enabled', 'password'],
  questions: [
    'id',
    'title',
    'prompt',
    'language',
    'code_snippet',
    'options',
    'correct_answer',
    'difficulty',
    'points',
    'time_limit',
    'category',
    'explanation',
    'hint',
    'premium',
    'active',
  ],
  'question-sets': [
    'id',
    'name',
    'description',
    'price',
    'points_per_question',
    'question_ids',
    'active',
  ],
  powerups: ['id', 'name', 'description', 'cost', 'effect', 'duration', 'usage_limit', 'active'],
};
const defaults: any = {
  teams: { id: '', name: '', enabled: true, password: '' },
  questions: {
    id: '',
    title: '',
    prompt: '',
    language: 'Python',
    code_snippet: '',
    options: ['', '', '', ''],
    correct_answer: 0,
    difficulty: 'Hard',
    points: 30,
    time_limit: 120,
    category: 'Program behavior',
    explanation: '',
    hint: '',
    premium: false,
    active: true,
  },
  'question-sets': {
    id: '',
    name: '',
    description: '',
    price: 500,
    points_per_question: 50,
    question_ids: [],
    active: false,
  },
  powerups: {
    id: '',
    name: '',
    description: '',
    cost: 100,
    effect: 'FREEZE',
    duration: 30,
    usage_limit: 1,
    active: true,
  },
};
const labels = (v: string) =>
  v
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (s) => s.toUpperCase());
const columns: any = {
  matches: ['id', 'white_team', 'black_team', 'status', 'result', 'ply'],
  teams: ['id', 'name', 'enabled', 'balance'],
  sessions: ['team_id', 'role', 'status', 'last_heartbeat'],
  questions: ['id', 'title', 'language', 'difficulty', 'points', 'premium', 'active'],
  'question-sets': ['id', 'name', 'price', 'points_per_question', 'active'],
  powerups: ['name', 'effect', 'cost', 'duration', 'active'],
  transactions: ['team_id', 'type', 'amount', 'balance_after', 'created_at'],
  audit: ['action', 'team_id', 'role', 'created_at'],
  violations: ['team_name', 'team_id', 'session_id', 'violation_type', 'created_at'],
};
async function download(dataset: string, format: string) {
  const r = await fetch(
    (import.meta.env.VITE_BACKEND_URL ?? '') + '/api/admin/export/' + dataset + '?format=' + format,
    { credentials: 'include' },
  );
  if (!r.ok) throw new Error('Export failed.');
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'codemate-' + dataset + '.' + format;
  a.click();
  URL.revokeObjectURL(url);
}
export function Admin({ session }: any) {
  const [section, setSection] = useState('overview'),
    [editor, setEditor] = useState<any>(null),
    [pending, setPending] = useState<any>(null),
    [message, setMessage] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [exportSet, setExportSet] = useState('teams');
  const { data: monitor } = useData('/admin/monitoring'),
    { data: settings } = useData('/admin/settings'),
    { data: rows, error } = useData(columns[section] ? '/admin/' + section : null);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setMessage('Changes saved.');
      setEditor(null);
      setPending(null);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visible = Array.isArray(rows)
    ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPETITION CONTROL</p>
          <h2>Command center</h2>
          <p className="muted">Chandigarh University · C Square Club</p>
        </div>
        <span className="badge">
          <Shield size={14} /> {settings?.state ?? 'LOADING'}
        </span>
      </div>
      <div className="admin-nav">
        {sections.map(([id, label]) => (
          <button
            key={id}
            className={section === id ? 'active' : ''}
            onClick={() => {
              setSection(id);
              setPage(0);
              setSearch('');
              setEditor(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {(message || error) && (
        <div role="status" className="banner">
          {message || error}
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}
      {['overview', 'monitoring'].includes(section) && (
        <>
          <div className="stats">
            {[
              ['Teams', monitor?.teams],
              ['Active participants', monitor?.active_sessions],
              ['Live chess games', monitor?.active_chess_games],
              ['Points earned', monitor?.points_earned],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <div>
                  <span>{label}</span>
                  <Activity size={18} />
                </div>
                <strong>{value ?? '—'}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="section-heading">
              <h3>Round {settings?.roundId} controls</h3>
              <span className="badge">{settings?.state}</span>
            </div>
            <div className="control-buttons">
              {[
                ['START', 'Start', Play],
                ['PAUSE', 'Pause', Pause],
                ['RESUME', 'Resume', Play],
                ['END', 'End', Square],
              ].map(([action, label, Icon]: any) => (
                <button
                  key={action}
                  className={action === 'END' ? 'danger' : 'secondary'}
                  disabled={
                    busy ||
                    !settings ||
                    (action === 'START' && !['WAITING', 'ENDED'].includes(settings.state)) ||
                    (action === 'PAUSE' && settings.state !== 'RUNNING') ||
                    (action === 'RESUME' && settings.state !== 'PAUSED') ||
                    (action === 'END' && settings.state === 'ENDED')
                  }
                  onClick={() =>
                    setPending({
                      title: label + ' competition',
                      action: '/admin/control',
                      body: { action },
                    })
                  }
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
            <p className="muted small">
              Pause preserves question timers. Ending locks scores after all pending chess analysis
              is resolved.
            </p>
          </section>
          <div className="columns">
            <section className="panel">
              <h3>Service health</h3>
              {Object.entries(monitor?.health ?? {}).map(([key, value]) => (
                <div className="list-row" key={key}>
                  <span>{labels(key)}</span>
                  <b className={String(value).includes('unavailable') ? 'negative' : 'positive'}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </b>
                </div>
              ))}
              <button
                className="secondary"
                onClick={() =>
                  setPending({
                    title: 'Retry pending chess analysis',
                    action: '/admin/analysis/retry',
                    body: {},
                  })
                }
              >
                <RotateCcw size={16} /> Retry analysis
              </button>
            </section>
            <section className="panel">
              <h3>Competition activity</h3>
              {Object.entries(monitor ?? {})
                .filter(
                  ([k]) =>
                    ![
                      'health',
                      'teams',
                      'active_sessions',
                      'active_chess_games',
                      'points_earned',
                    ].includes(k),
                )
                .map(([k, v]) => (
                  <div className="list-row" key={k}>
                    <span>{labels(k)}</span>
                    <b>{String(v)}</b>
                  </div>
                ))}
            </section>
          </div>
          <section className="panel">
            <h3>Export competition records</h3>
            <div className="export-controls">
              <select
                aria-label="Export dataset"
                value={exportSet}
                onChange={(e) => setExportSet(e.target.value)}
              >
                {[
                  'teams',
                  'scores',
                  'leaderboard',
                  'chess-matches',
                  'chess-moves',
                  'debugging-attempts',
                  'transactions',
                  'purchases',
                  'powerups',
                  'audit',
                  'questions',
                  'question-sets',
                ].map((v) => (
                  <option key={v} value={v}>
                    {labels(v)}
                  </option>
                ))}
              </select>
              <button
                className="secondary"
                onClick={() => download(exportSet, 'csv').catch((e) => setMessage(e.message))}
              >
                <Download size={16} /> CSV
              </button>
              <button
                className="secondary"
                onClick={() => download(exportSet, 'json').catch((e) => setMessage(e.message))}
              >
                <Download size={16} /> JSON
              </button>
            </div>
          </section>
        </>
      )}
      {section === 'leaderboard' && <Leaderboard session={session} />}
      {['scoring', 'settings'].includes(section) && settings && (
        <Configuration
          key={section}
          kind={section}
          value={section === 'scoring' ? settings.scoring : settings}
          busy={busy}
          save={(value: any, reason: string) =>
            run(() => api('/admin/' + section, { value, reason }, 'PUT'))
          }
        />
      )}
      {columns[section] && (
        <section className="panel table-panel">
          <div className="section-heading">
            <h3>
              {sections.find((s) => s[0] === section)?.[1]}{' '}
              <span className="muted small">({visible.length})</span>
            </h3>
            <div className="toolbar">
              {section === 'teams' && (
                <button
                  className="secondary"
                  onClick={() =>
                    setPending({
                      title: 'Adjust team points',
                      action: '/admin/adjust',
                      body: {},
                      adjust: true,
                    })
                  }
                >
                  Adjust points
                </button>
              )}
              {fields[section] && (
                <button onClick={() => setEditor({ ...defaults[section], isNew: true })}>
                  <Plus size={16} /> Create
                </button>
              )}
            </div>
          </div>
          <input
            className="search-input"
            aria-label="Search records"
            placeholder="Search records…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns[section].map((c: string) => (
                    <th key={c}>{labels(c)}</th>
                  ))}
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(page * 20, page * 20 + 20).map((row: any, i: number) => (
                  <tr key={row.id ?? i}>
                    {columns[section].map((c: string) => (
                      <td key={c}>
                        {typeof row[c] === 'boolean'
                          ? row[c]
                            ? 'Yes'
                            : 'No'
                          : String(row[c] ?? '—')}
                      </td>
                    ))}
                    <td>
                      <div className="table-actions">
                        {fields[section] ? (
                          <>
                            <button className="text-button" onClick={() => setEditor(row)}>
                              Edit
                            </button>
                            <button
                              className="text-button negative"
                              onClick={() =>
                                setPending({
                                  title: 'Archive ' + (row.name ?? row.title ?? row.id),
                                  action: '/admin/' + section + '/' + row.id,
                                  method: 'DELETE',
                                  body: {},
                                })
                              }
                            >
                              Archive
                            </button>
                          </>
                        ) : section === 'sessions' && row.status === 'ACTIVE' ? (
                          <button
                            className="text-button negative"
                            onClick={() =>
                              setPending({
                                title: 'End participant session',
                                action: '/admin/sessions/' + row.id + '/revoke',
                                body: {},
                                reassign: row.role !== 'ADMIN',
                              })
                            }
                          >
                            Revoke / reassign
                          </button>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => setPending({ title: 'Record details', readOnly: row })}
                          >
                            Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(visible.length / 20))}
            </span>
            <button
              className="secondary"
              disabled={(page + 1) * 20 >= visible.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {editor && (
        <ResourceEditor
          section={section}
          initial={editor}
          error={message}
          busy={busy}
          close={() => setEditor(null)}
          save={(value: any, reason: string) =>
            run(() => api('/admin/' + section, { value, reason }))
          }
        />
      )}
      {pending && (
        <div className="modal-backdrop">
          <form
            className="panel modal"
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                body: any = { ...pending.body, reason: f.get('reason') };
              if (pending.reassign && f.get('newRole')) body.newRole = f.get('newRole');
              if (pending.adjust) {
                body.teamId = f.get('teamId');
                body.amount = Number(f.get('amount'));
              }
              run(() => api(pending.action, body, pending.method));
            }}
          >
            <div className="section-heading">
              <h3>{pending.title}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPending(null)}
                aria-label="Close dialog"
              >
                <X />
              </button>
            </div>
            {message && message !== 'Changes saved.' && (
              <div className="error" role="alert">
                {message}
              </div>
            )}
            {pending.readOnly ? (
              <pre>{JSON.stringify(pending.readOnly, null, 2)}</pre>
            ) : (
              <>
                {pending.adjust && (
                  <>
                    <label>
                      Team ID
                      <input name="teamId" required placeholder="TEAM-001" />
                    </label>
                    <label>
                      Point adjustment
                      <input
                        name="amount"
                        type="number"
                        required
                        placeholder="Use negative values to deduct"
                      />
                    </label>
                  </>
                )}
                {pending.reassign && (
                  <label>
                    Role on next login
                    <select name="newRole">
                      <option value="">Keep assigned role</option>
                      <option value="CHESS">Chess</option>
                      <option value="DEBUGGING">Debugging</option>
                    </select>
                  </label>
                )}
                <label>
                  Reason
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    placeholder="Explain the change for the audit log."
                  />
                </label>
                <button disabled={busy}>Confirm change</button>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
function ResourceEditor({ section, initial, error, busy, close, save }: any) {
  const [value, setValue] = useState<any>({ ...defaults[section], ...initial, password: '' }),
    [reason, setReason] = useState('');
  const { data: questions } = useData(section === 'question-sets' ? '/admin/questions' : null);
  const update = (k: string, v: any) => setValue((old: any) => ({ ...old, [k]: v }));
  return (
    <div className="modal-backdrop">
      <form
        className="panel modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit record"
        onSubmit={(e) => {
          e.preventDefault();
          const clean: any = {};
          for (const key of fields[section])
            if (key !== 'password' || value.password) clean[key] = value[key];
          save(clean, reason);
        }}
      >
        <div className="section-heading">
          <h3>
            {initial.isNew ? 'Create' : 'Edit'} {section}
          </h3>
          <button type="button" className="icon-button" onClick={close} aria-label="Close editor">
            <X />
          </button>
        </div>
        {error && error !== 'Changes saved.' && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          {fields[section].map((key: string) => {
            const v = value[key];
            if (key === 'question_ids')
              return (
                <fieldset className="full-field question-checklist" key={key}>
                  <legend>Questions · {v.length}/25 selected</legend>
                  {questions
                    ?.filter((q: any) => q.premium && ['Hard', 'Expert'].includes(q.difficulty))
                    .map((q: any) => (
                      <label key={q.id} className="checkbox">
                        <input
                          type="checkbox"
                          checked={v.includes(q.id)}
                          onChange={(e) =>
                            update(
                              key,
                              e.target.checked
                                ? [...v, q.id]
                                : v.filter((id: string) => id !== q.id),
                            )
                          }
                        />
                        {q.id} · {q.language} · {q.title}
                      </label>
                    ))}
                </fieldset>
              );
            if (key === 'options')
              return (
                <fieldset className="full-field" key={key}>
                  <legend>Answer options</legend>
                  {v.map((s: string, i: number) => (
                    <label key={i}>
                      Option {String.fromCharCode(65 + i)}
                      <input
                        required
                        value={s}
                        onChange={(e) =>
                          update(
                            key,
                            v.map((x: string, j: number) => (j === i ? e.target.value : x)),
                          )
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              );
            if (typeof v === 'boolean')
              return (
                <label className="checkbox" key={key}>
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) => update(key, e.target.checked)}
                  />
                  {labels(key)}
                </label>
              );
            const choices: any = {
              difficulty: ['Easy', 'Medium', 'Hard', 'Expert'],
              effect: ['FREEZE', 'HALF', 'BLAST', 'EXTRA', 'SKIP', 'HINT'],
              correct_answer: [0, 1, 2, 3],
            };
            return (
              <label
                key={key}
                className={
                  ['prompt', 'code_snippet', 'explanation', 'hint', 'description'].includes(key)
                    ? 'full-field'
                    : ''
                }
              >
                {key === 'password' ? 'Password (leave blank to keep existing)' : labels(key)}
                {choices[key] ? (
                  <select
                    value={v}
                    onChange={(e) =>
                      update(
                        key,
                        key === 'correct_answer' ? Number(e.target.value) : e.target.value,
                      )
                    }
                  >
                    {choices[key].map((x: any) => (
                      <option value={x} key={x}>
                        {key === 'correct_answer' ? 'Option ' + String.fromCharCode(65 + x) : x}
                      </option>
                    ))}
                  </select>
                ) : ['prompt', 'code_snippet', 'explanation', 'hint', 'description'].includes(
                    key,
                  ) ? (
                  <textarea required value={v} onChange={(e) => update(key, e.target.value)} />
                ) : (
                  <input
                    disabled={key === 'id' && !initial.isNew}
                    required={key !== 'password' || initial.isNew}
                    type={
                      key === 'password' ? 'password' : typeof v === 'number' ? 'number' : 'text'
                    }
                    minLength={key === 'password' ? 12 : undefined}
                    value={v ?? ''}
                    onChange={(e) =>
                      update(key, typeof v === 'number' ? Number(e.target.value) : e.target.value)
                    }
                  />
                )}
              </label>
            );
          })}
        </div>
        <label>
          Reason for this change
          <textarea
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button disabled={busy}>Save {section}</button>
      </form>
    </div>
  );
}
function Configuration({ kind, value, busy, save }: any) {
  const settingKeys = [
    'shopOpen',
    'freezeFinalSeconds',
    'freezeLimitSeconds',
    'leaderboardDelaySeconds',
    'antiSniping',
    'allowRematch',
    'detailedAnalysis',
    'individualQuestionPrice',
    'sessionRoleSelection',
    'chessTimeControl',
    'chessBaseTimeSeconds',
    'chessIncrementSeconds',
    'endsAt',
    'roundId',
  ];
  const initial =
    kind === 'scoring' ? value : Object.fromEntries(settingKeys.map((k) => [k, value[k]]));
  const [form, setForm] = useState<any>(structuredClone(initial)),
    [reason, setReason] = useState('');
  function field(obj: any, path: string[] = []): any {
    return Object.entries(obj).map(([key, v]: any) => {
      const keys = [...path, key],
        title = keys.join('.');
      if (v !== null && typeof v === 'object')
        return (
          <fieldset key={title} className="config-group">
            <legend>{labels(key)}</legend>
            {field(v, keys)}
          </fieldset>
        );
      const change = (x: any) =>
        setForm((old: any) => {
          const next = structuredClone(old);
          let node = next;
          for (const part of keys.slice(0, -1)) node = node[part];
          node[key] = x;
          return next;
        });
      return (
        <label className={typeof v === 'boolean' ? 'checkbox' : ''} key={title}>
          {typeof v === 'boolean' ? (
            <>
              <input type="checkbox" checked={v} onChange={(e) => change(e.target.checked)} />
              {labels(key)}
            </>
          ) : (
            <>
              {labels(key)}
              <input
                type={typeof v === 'number' ? 'number' : 'text'}
                value={v ?? ''}
                placeholder={key === 'endsAt' ? 'ISO UTC date, or leave empty for no end time' : ''}
                onChange={(e) =>
                  change(typeof v === 'number' ? Number(e.target.value) : e.target.value || null)
                }
              />
            </>
          )}
        </label>
      );
    });
  }
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save(form, reason);
      }}
    >
      <h3>{kind === 'scoring' ? 'Competition scoring rules' : 'Competition settings'}</h3>
      <p className="small muted">
        {kind === 'scoring'
          ? 'Chess rules are captured when a match starts. Existing matches keep their original scoring rules.'
          : 'Use an ISO timestamp such as 2026-09-10T10:00:00Z for the round end, or leave it empty.'}
      </p>
      {kind === 'settings' && (
        <div style={{ marginBottom: '20px' }}>
          <h4>Time Control Presets</h4>
          <div className="admin-nav" style={{ marginTop: '10px' }}>
            <button type="button" onClick={() => setForm({ ...form, chessTimeControl: 'UNTIMED', chessBaseTimeSeconds: 600, chessIncrementSeconds: 10 })}>Untimed</button>
            <button type="button" onClick={() => setForm({ ...form, chessTimeControl: 'TIMED', chessBaseTimeSeconds: 900, chessIncrementSeconds: 10 })}>15 + 10</button>
            <button type="button" onClick={() => setForm({ ...form, chessTimeControl: 'TIMED', chessBaseTimeSeconds: 600, chessIncrementSeconds: 5 })}>10 + 5</button>
            <button type="button" onClick={() => setForm({ ...form, chessTimeControl: 'TIMED', chessBaseTimeSeconds: 300, chessIncrementSeconds: 3 })}>5 + 3</button>
          </div>
        </div>
      )}
      <div className="configuration-grid">{field(form)}</div>
      <label>
        Reason for this change
        <textarea
          required
          minLength={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button disabled={busy}>Save configuration</button>
    </form>
  );
}
