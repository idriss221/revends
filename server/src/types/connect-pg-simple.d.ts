declare module 'connect-pg-simple' {
  import type { Store } from 'express-session';
  import type { Pool } from 'pg';

  /** Options du store de session PostgreSQL (connect-pg-simple v10). */
  export interface PgStoreOptions {
    pool?: Pool;
    tableName?: string;
    createTableIfMissing?: boolean;
    pruneSessionInterval?: number;
    conString?: string;
  }

  type ExpressSessionModule = typeof import('express-session');

  /**
   * Fabrique : reçoit express-session, retourne une classe Store construite
   * avec les options ci-dessus (voir src/app.ts).
   */
  const connectPgSimple: (session: ExpressSessionModule) => new (options?: PgStoreOptions) => Store;
  export = connectPgSimple;
}