import 'dotenv/config';
import { z } from 'zod';
const parsed = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).default(3001),
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.string().default(''),
    DATABASE_SSL: z.string().default('false'),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    SESSION_SECRET: z.string().min(32),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    SESSION_IDLE_SECONDS: z.coerce.number().min(30).default(120),
    STOCKFISH_PATH: z.string().default(''),
    ENGINE_WORKERS: z.coerce.number().int().min(1).max(8).default(2),
    ENGINE_QUEUE_SIZE: z.coerce.number().int().min(1).default(1000),
  })
  .parse(process.env);
if (
  parsed.NODE_ENV === 'production' &&
  (!parsed.DATABASE_URL || !parsed.FRONTEND_URL.startsWith('https://'))
)
  throw new Error('Production requires DATABASE_URL and an HTTPS FRONTEND_URL.');
export const config = parsed;
