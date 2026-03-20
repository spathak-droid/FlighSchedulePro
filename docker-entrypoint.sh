#!/bin/sh
set -e

echo "==> Starting FlighSchedulePro (production)"

# Start the NestJS API (port 3001)
node dist/api/main.js &
API_PID=$!
echo "  API started (PID $API_PID, port ${PORT:-3001})"

# Start the BullMQ worker (no HTTP server)
node dist/worker/main.js &
WORKER_PID=$!
echo "  Worker started (PID $WORKER_PID)"

# Start Next.js standalone server (port 3000)
cd web-standalone
PORT=3000 HOSTNAME=0.0.0.0 node web/server.js &
WEB_PID=$!
cd ..
echo "  Web started (PID $WEB_PID, port 3000)"

echo "==> All services running"

# Wait for any process to exit, then shut down all
wait -n $API_PID $WORKER_PID $WEB_PID
EXIT_CODE=$?

echo "==> Service exited ($EXIT_CODE), shutting down..."
kill $API_PID $WORKER_PID $WEB_PID 2>/dev/null || true
wait
exit $EXIT_CODE
