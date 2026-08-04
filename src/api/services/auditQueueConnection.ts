import { CacheConf, CacheConfRedis, configService } from '@config/env.config';
import IORedis from 'ioredis';

let connection: IORedis | null = null;

/**
 * BullMQ needs its own ioredis connection (the app's shared cache client uses the
 * `redis` v4 package, not `ioredis`), but reuses the same CACHE_REDIS_URI so there's
 * only one Redis endpoint to configure.
 */
export function getAuditQueueConnection(): IORedis {
  if (connection) return connection;

  const redisConf = configService.get<CacheConf>('CACHE').REDIS as CacheConfRedis;

  if (!redisConf?.ENABLED || !redisConf?.URI) {
    throw new Error(
      'CACHE_REDIS_ENABLED and CACHE_REDIS_URI must be configured to use the audit execution queue (BullMQ).',
    );
  }

  // Required by BullMQ: https://docs.bullmq.io/guide/connections
  connection = new IORedis(redisConf.URI, { maxRetriesPerRequest: null });

  return connection;
}
