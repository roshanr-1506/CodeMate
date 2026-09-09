import 'dotenv/config';
import { Database } from '../backend/src/db.js';
import { defaults } from '../backend/src/defaults.js';
import { baseQuestions, premiumQuestion } from '../database/seed/questions.js';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
export async function seed(db: Database, password: string, teamCount = 10) {
  const hash = await bcrypt.hash(password, 12);
  await db.tx(async (q) => {
    await q.query(
      'INSERT INTO competition_settings(id,value) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',
      [JSON.stringify({ ...defaults, state: 'RUNNING' })],
    );
    for (let i = 1; i <= teamCount; i++)
      await q.query(
        'INSERT INTO teams(id,name,password_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [
          'TEAM-' + String(i).padStart(3, '0'),
          [
            'Quantum Knights',
            'Syntax Syndicate',
            'Stack Masters',
            'Binary Bishops',
            'Runtime Rebels',
            'Code Crusaders',
            'Logic Legion',
            'Null Pointers',
            'Royal Recursion',
            'The Endgame',
          ][i - 1] ?? 'Demo team ' + i,
          hash,
        ],
      );
    const add = async (id: string, x: any) =>
      q.query(
        'INSERT INTO debugging_questions(id,title,prompt,language,code_snippet,options,correct_answer,difficulty,points,time_limit,category,explanation,hint,premium) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING',
        [
          id,
          x.title,
          x.prompt,
          x.language,
          x.code_snippet,
          JSON.stringify(x.options),
          x.correct_answer,
          x.difficulty,
          x.points,
          x.time_limit,
          x.category,
          x.explanation,
          x.hint,
          x.premium,
        ],
      );
    for (let i = 0; i < baseQuestions.length; i++)
      await add('Q-' + String(i + 1).padStart(3, '0'), baseQuestions[i]);
    for (let i = 0; i < 5; i++) await add('PREMIUM-' + (i + 1), premiumQuestion(5, i));
    for (let s = 0; s < 5; s++) {
      const id = 'SET-' + (s + 1);
      await q.query(
        'INSERT INTO question_sets(id,name,description) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [
          id,
          [
            'The Grandmaster Collection',
            'Runtime Reckoning',
            'The Endgame Protocol',
            'Beyond the Compiler',
            'The Final Gambit',
          ][s],
          '25 advanced tracing challenges. C, C++, Java, Python and JavaScript. 50 points per correct answer.',
        ],
      );
      for (let i = 0; i < 25; i++) {
        const qid = id + '-Q-' + String(i + 1).padStart(2, '0');
        await add(qid, premiumQuestion(s, i));
        await q.query(
          'INSERT INTO question_set_questions(set_id,question_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [id, qid],
        );
      }
    }
    for (const p of [
      ['freeze', 'Freeze Time', 'Freeze the timer for 30 seconds.', 100, 'FREEZE'],
      ['half', '50/50', 'Remove two incorrect options.', 80, 'HALF'],
      ['blast', 'Blast Wrong Option', 'Remove one incorrect option.', 50, 'BLAST'],
      ['extra', 'Extra Time', 'Add 30 seconds to the deadline.', 100, 'EXTRA'],
      ['skip', 'Skip Question', 'Close the current attempt without an answer.', 150, 'SKIP'],
      ['hint', 'Hint', 'Reveal a clue for the current question.', 120, 'HINT'],
    ])
      await q.query(
        'INSERT INTO powerups(id,name,description,cost,effect) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        p,
      );
    await q.query('INSERT INTO audit_logs(id,action,metadata) VALUES($1,$2,$3)', [
      randomUUID(),
      'DEVELOPMENT_SEED',
      JSON.stringify({ demo: true, teams: teamCount }),
    ]);
  });
}
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seeding is disabled in production.');
  const db = new Database();
  await db.migrate();
  const password = process.env.DEMO_PASSWORD || randomBytes(15).toString('base64url');
  await seed(db, password);
  await writeFile(
    'demo-credentials.txt',
    'DEVELOPMENT ONLY\nTeams: TEAM-001 through TEAM-010\nPassword: ' +
      password +
      '\nCreate an administrator with npm run create-admin.\n',
  );
  await db.query('UPDATE competition_settings SET value=$1 WHERE id=1', [
    JSON.stringify({ ...defaults, state: 'RUNNING' }),
  ]);
  await db.close();
  console.log('Demo data seeded. Credentials saved to demo-credentials.txt (excluded from Git).');
}
