#!/bin/bash
# 完整重启 Worker：清 Redis 孤儿锁 + 启动
docker exec pdd-6-redis-1 redis-cli FLUSHALL > /dev/null 2>&1
pnpm --filter @pdd-inspector/worker dev
