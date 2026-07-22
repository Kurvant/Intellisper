#!/bin/sh

# Env prefix is IB_ (Intelblocks). The AP_ names are the pre-rebrand legacy prefix; they are read
# here ONLY as a fallback so an old deployment still setting AP_* keeps booting. The Node process
# has its own AP_ -> IB_ compat shim (packages/server/utils/src/env-normalize.ts); this shell block
# mirrors that at the entrypoint layer, which runs before Node starts.
IB_CONTAINER_TYPE="${IB_CONTAINER_TYPE:-${AP_CONTAINER_TYPE:-WORKER_AND_APP}}"
IB_PORT="${IB_PORT:-${AP_PORT:-80}}"
IB_PM2_INSTANCES="${IB_PM2_INSTANCES:-${AP_PM2_INSTANCES:-1}}"
IB_JWT_SECRET="${IB_JWT_SECRET:-$AP_JWT_SECRET}"
IB_WORKER_TOKEN="${IB_WORKER_TOKEN:-$AP_WORKER_TOKEN}"
export IB_CONTAINER_TYPE IB_PORT IB_PM2_INSTANCES IB_JWT_SECRET IB_WORKER_TOKEN

echo "IB_CONTAINER_TYPE: $IB_CONTAINER_TYPE"
echo "IB_PORT: $IB_PORT"
echo "IB_PM2_INSTANCES: $IB_PM2_INSTANCES"

# Auto-generate the worker token if not set and the JWT secret is available.
#
# The `issuer` MUST be 'intellisper' — that is exactly what the API's JWT verifier requires
# (jwt-utils.ts `const ISSUER = 'intellisper'`). Signing with the old 'activepieces' issuer produced
# a token the API rejects, so an auto-generated worker token could not authenticate and flows would
# silently never run.
if [ -z "$IB_WORKER_TOKEN" ] && [ -n "$IB_JWT_SECRET" ]; then
    echo "Auto-generating IB_WORKER_TOKEN..."
    export IB_WORKER_TOKEN=$(node -e "
        const jwt = require('jsonwebtoken');
        const crypto = require('crypto');
        const token = jwt.sign(
            { id: crypto.randomUUID(), type: 'WORKER' },
            process.env.IB_JWT_SECRET,
            { expiresIn: '100y', keyid: '1', algorithm: 'HS256', issuer: 'intellisper' }
        );
        process.stdout.write(token);
    ")
fi

# Build PM2 ecosystem config
APPS=""

if [ "$IB_CONTAINER_TYPE" = "APP" ] || [ "$IB_CONTAINER_TYPE" = "WORKER_AND_APP" ]; then
    if [ "$IB_PM2_INSTANCES" -gt 1 ] 2>/dev/null; then
        APP_INSTANCES=$IB_PM2_INSTANCES
        APP_EXEC_MODE="cluster"
    else
        APP_INSTANCES=1
        APP_EXEC_MODE="fork"
    fi
    APPS="${APPS}
    {
        name: 'intellisper-app',
        script: 'packages/server/api/dist/src/bootstrap.js',
        node_args: '--enable-source-maps',
        instances: ${APP_INSTANCES},
        exec_mode: '${APP_EXEC_MODE}',
        env: { IB_CONTAINER_TYPE: 'APP' }
    },"
fi

if [ "$IB_CONTAINER_TYPE" = "WORKER" ] || [ "$IB_CONTAINER_TYPE" = "WORKER_AND_APP" ]; then
    # The worker only starts its own health server when it is a STANDALONE worker
    # (worker/src/lib/main.ts: `withHealthServer: containerType === 'WORKER'`), and that server
    # binds IB_PORT -- the very port the API binds. In WORKER_AND_APP both processes share one
    # container, so declaring the worker as 'WORKER' makes them race for IB_PORT and whichever
    # loses dies with EADDRINUSE. Propagate the real container type instead: standalone workers
    # still get their health endpoint, combined containers leave the port to the API.
    APPS="${APPS}
    {
        name: 'intellisper-worker',
        script: 'packages/server/worker/dist/src/bootstrap.js',
        node_args: '--enable-source-maps',
        instances: 1,
        exec_mode: 'fork',
        env: { IB_CONTAINER_TYPE: '${IB_CONTAINER_TYPE}' }
    },"
fi

cat > /tmp/ecosystem.config.js << ENDOFFILE
module.exports = {
    apps: [${APPS}
    ]
};
ENDOFFILE

echo "Starting Intellisper with PM2 (${IB_CONTAINER_TYPE} mode)"
pm2-runtime start /tmp/ecosystem.config.js
