import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
const bundledEngineDirectory = resolve(
  dirname(createRequire(import.meta.url).resolve('stockfish/package.json')),
  'src',
);
import { Chess } from 'chess.js';
export function classifyMove(loss: number, thresholds: number[] = [10, 30, 60, 100, 200]) {
  return ['Excellent', 'Good', 'Accurate', 'Inaccuracy', 'Mistake', 'Blunder'][
    thresholds.findIndex((x) => loss <= x) < 0 ? 5 : thresholds.findIndex((x) => loss <= x)
  ];
}
export function calculateEvaluationLoss(before: number, after: number) {
  return Math.max(0, Math.round(before + after));
}
export function uciScore(kind: string, value: number) {
  return kind === 'mate'
    ? (value >= 0 ? 1 : -1) * (100000 - Math.min(999, Math.abs(value)) * 100)
    : value;
}
export class StockfishEngine {
  private process?: ChildProcessWithoutNullStreams;
  private listener?: {
    match: (line: string) => boolean;
    resolve: (lines: string[]) => void;
    reject: (e: Error) => void;
    lines: string[];
    timer: ReturnType<typeof setTimeout>;
  };
  private buffer = '';
  public ready = false;
  constructor(public path = '') {}
  private request(
    commands: string[],
    match: (line: string) => boolean,
    timeout = 15000,
  ): Promise<string[]> {
    if (!this.process) return Promise.reject(new Error('Stockfish is unavailable.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stop();
        reject(new Error('Stockfish analysis timed out.'));
      }, timeout);
      this.listener = { match, resolve, reject, lines: [], timer };
      for (const command of commands) this.process!.stdin.write(command + '\n');
    });
  }
  private line(line: string) {
    const pending = this.listener;
    if (!pending) return;
    pending.lines.push(line);
    if (pending.match(line)) {
      clearTimeout(pending.timer);
      this.listener = undefined;
      pending.resolve(pending.lines);
    }
  }
  async start() {
    if (this.ready) return;
    const filename =
      this.path ||
      resolve(
        bundledEngineDirectory,
        readdirSync(bundledEngineDirectory).find((f) =>
          /^stockfish-.*-lite-single-.*\.js$/.test(f),
        )!,
      );
    this.process = spawn(this.path ? filename : process.execPath, this.path ? [] : [filename], {
      stdio: 'pipe',
      windowsHide: true,
    });
    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let split;
      while ((split = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, split).trim();
        this.buffer = this.buffer.slice(split + 1);
        this.line(line);
      }
    });
    this.process.stderr.on('data', () => {});
    const fail = () => {
      this.ready = false;
      if (this.listener) {
        clearTimeout(this.listener.timer);
        this.listener.reject(new Error('Stockfish process stopped.'));
        this.listener = undefined;
      }
    };
    this.process.on('error', fail);
    this.process.on('exit', fail);
    await this.request(['uci'], (s) => s === 'uciok');
    await this.request(
      ['setoption name Threads value 1', 'setoption name Hash value 32', 'isready'],
      (s) => s === 'readyok',
    );
    this.ready = true;
  }
  async analyzePosition(fen: string, depth: number, timeMs: number) {
    const game = new Chess(fen);
    if (game.isCheckmate()) return -100000;
    if (game.isDraw()) return 0;
    await this.start();
    const lines = await this.request(
      ['ucinewgame', 'position fen ' + fen, 'go depth ' + depth + ' movetime ' + timeMs],
      (s) => s.startsWith('bestmove'),
      Math.max(15000, timeMs * 4),
    );
    let score: number | undefined;
    for (const line of lines) {
      const m = line.match(/ score (cp|mate) (-?\d+)(?:\s|$)/);
      if (m && !line.includes('lowerbound') && !line.includes('upperbound'))
        score = uciScore(m[1], Number(m[2]));
    }
    if (score === undefined) throw new Error('Stockfish returned no evaluation.');
    return score;
  }
  async evaluateMove(beforeFen: string, afterFen: string, depth: number, timeMs: number) {
    const before = await this.analyzePosition(beforeFen, depth, timeMs),
      after = await this.analyzePosition(afterFen, depth, timeMs);
    return { before, after, loss: calculateEvaluationLoss(before, after) };
  }
  stop() {
    this.ready = false;
    if (this.listener) {
      clearTimeout(this.listener.timer);
      this.listener.reject(new Error('Stockfish stopped.'));
      this.listener = undefined;
    }
    this.process?.kill();
    this.process = undefined;
    this.buffer = '';
  }
}
