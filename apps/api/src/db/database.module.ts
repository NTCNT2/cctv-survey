import {
  Global,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresDialect } from 'kysely';
import pg from 'pg';
import { Database } from './database.js';

@Global()
@Module({
  providers: [
    {
      provide: Database,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.get<string>('DATABASE_URL');
        if (!connectionString) {
          throw new Error('DATABASE_URL is not set (see .env.example)');
        }
        const pool = new pg.Pool({ connectionString, max: 10 });
        // An idle connection that drops (DB restart, network) makes pg-pool emit
        // 'error'. Without a listener Node treats it as unhandled and exits.
        // pg-pool already discards the broken client; the next query reconnects.
        const logger = new Logger('Database');
        pool.on('error', (err) => {
          logger.warn(`idle connection lost: ${err.message}`);
        });
        return new Database({ dialect: new PostgresDialect({ pool }) });
      },
    },
  ],
  exports: [Database],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
