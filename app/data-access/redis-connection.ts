

  import { createClient } from 'redis';

const url = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = createClient({ url });

redis.on('error', (err: unknown) => {
  console.error('Redis client connection error', err);
});

redis.connect();

export { redis };
