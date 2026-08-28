#!/usr/bin/env bash
# Project-local, disposable MongoDB instance for developing cuemaster-api —
# separate from any system-wide `mongod` you might have running for other
# projects. Runs as a single-node replica set (`rs0`) because Prisma's Mongo
# connector needs a replica set for transactions/upserts (standalone mongod
# doesn't support them) — this is also what any real deployment (MongoDB
# Atlas) already gives you by default.
#
# Usage: ./scripts/dev-mongo.sh {start|stop|status}
#
# Requires `mongod`/`mongosh` on PATH (e.g. `brew install mongodb-community@6.0 mongosh`).

set -euo pipefail
cd "$(dirname "$0")/.."

DATA_DIR="$(pwd)/.mongo-data"
PORT=27018

case "${1:-}" in
  start)
    mkdir -p "$DATA_DIR"
    if mongosh --port "$PORT" --quiet --eval "db.version()" >/dev/null 2>&1; then
      echo "Already running on port $PORT."
    else
      mongod --dbpath "$DATA_DIR" --port "$PORT" --replSet rs0 --bind_ip 127.0.0.1 \
        --logpath "$DATA_DIR/mongod.log" --fork
      sleep 1
      # rs.initiate() only needs to run once ever for this data dir; ignore
      # "already initialized" on subsequent starts.
      mongosh --port "$PORT" --quiet --eval "try { rs.status() } catch (e) { rs.initiate() }" >/dev/null
    fi
    echo "MongoDB ready at mongodb://127.0.0.1:$PORT/cuemaster?replicaSet=rs0"
    ;;
  stop)
    mongosh --port "$PORT" --quiet --eval "db.adminCommand({ shutdown: 1 })" || true
    echo "Stopped."
    ;;
  status)
    mongosh --port "$PORT" --quiet --eval "rs.status().ok === 1 ? print('running') : print('not running')" 2>/dev/null || echo "not running"
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
