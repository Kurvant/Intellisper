#!/usr/bin/env bash

cp .env.example .env

if [ "$(uname)" = "Darwin" ]; then
  sed -i '' -e 's|IB_API_KEY=.*|IB_API_KEY='"$(openssl rand -hex 64)"'|g' .env
  sed -i '' -e 's|IB_POSTGRES_PASSWORD=.*|IB_POSTGRES_PASSWORD='"$(openssl rand -hex 32)"'|g' .env
  sed -i '' -e 's|IB_JWT_SECRET=.*|IB_JWT_SECRET='"$(openssl rand -hex 32)"'|g' .env
  sed -i '' -e 's|ENCRYPTION_KEY=.*|ENCRYPTION_KEY='"$(openssl rand -hex 16)"'|g' .env
else
  sed -i 's|IB_API_KEY=.*|IB_API_KEY='"$(openssl rand -hex 64)"'|g' .env
  sed -i 's|IB_POSTGRES_PASSWORD=.*|IB_POSTGRES_PASSWORD='"$(openssl rand -hex 32)"'|g' .env
  sed -i 's|IB_JWT_SECRET=.*|IB_JWT_SECRET='"$(openssl rand -hex 32)"'|g' .env
  sed -i 's|ENCRYPTION_KEY=.*|ENCRYPTION_KEY='"$(openssl rand -hex 16)"'|g' .env
fi;

echo "A .env file containing random passwords and secrets has been successfully generated."
