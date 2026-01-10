# CortexHR - Docker Local Development

This directory contains Docker configuration for running CortexHR locally with a full Supabase stack.

## Quick Start

### 1. Start Docker Services

```bash
# From project root
docker-compose up -d
```

### 2. Wait for Services to Start

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Configure Frontend

Create `.env.local` in project root:

```env
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
VITE_SUPABASE_PROJECT_ID=local
```

### 4. Start Frontend

```bash
npm install
npm run dev
```

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | Vite dev server |
| **Supabase API** | http://localhost:8000 | Kong API Gateway |
| **Supabase Studio** | http://localhost:3000 | Database GUI |
| **MailHog** | http://localhost:8025 | Email testing UI |
| **PostgreSQL** | localhost:5432 | Direct DB access |

## Default Credentials

### Database
- **User:** postgres
- **Password:** postgres
- **Database:** postgres

### Supabase Keys (Local Development Only)
```
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

Service Role Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

JWT Secret: super-secret-jwt-token-with-at-least-32-characters-long
```

⚠️ **Warning:** These keys are for local development only. Never use them in production!

## Services Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Kong      │  │  MailHog    │  │   Redis     │         │
│  │  :8000      │  │  :8025      │  │  :6379      │         │
│  └──────┬──────┘  └─────────────┘  └─────────────┘         │
│         │                                                   │
│    ┌────┴────┬────────┬────────┬────────┐                  │
│    ▼         ▼        ▼        ▼        ▼                  │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │ Auth │ │ REST │ │Real- │ │Stor- │ │Func- │              │
│ │:9999 │ │:3001 │ │time  │ │age   │ │tions │              │
│ │      │ │      │ │:4000 │ │:5000 │ │:5001 │              │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘              │
│    │         │        │        │                           │
│    └─────────┴────────┴────────┘                           │
│                   │                                         │
│              ┌────┴────┐                                    │
│              │PostgreSQL│                                   │
│              │  :5432  │                                    │
│              └─────────┘                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Common Commands

### Start all services
```bash
docker-compose up -d
```

### Stop all services
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f db
docker-compose logs -f auth
docker-compose logs -f functions
```

### Reset database
```bash
docker-compose down -v
docker-compose up -d
```

### Restart a specific service
```bash
docker-compose restart functions
```

### Access PostgreSQL directly
```bash
docker exec -it cortexhr-db psql -U postgres
```

### Run SQL file
```bash
docker exec -i cortexhr-db psql -U postgres < backend/complete_schema.sql
```

## Edge Functions

Edge functions are mounted from `./supabase/functions` directory. Changes are hot-reloaded.

To test a function:
```bash
curl -X POST http://localhost:8000/functions/v1/parse-resume \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{"resumeText": "John Doe, Software Engineer"}'
```

## Setting Environment Variables for Functions

Create a `.env` file in `supabase/functions/`:

```env
OPENAI_API_KEY=sk-your-key
RESEND_API_KEY=re_your-key
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Troubleshooting

### Services won't start
```bash
# Check for port conflicts
lsof -i :5432
lsof -i :8000

# Check Docker resources
docker system df
docker system prune
```

### Database connection issues
```bash
# Check if DB is healthy
docker-compose ps db

# Check DB logs
docker-compose logs db
```

### Functions not working
```bash
# Check function logs
docker-compose logs functions

# Verify function files are mounted
docker exec cortexhr-functions ls /home/deno/functions
```

### Reset everything
```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v --remove-orphans

# Remove all images (optional)
docker-compose down -v --rmi all

# Start fresh
docker-compose up -d --build
```

## Production Deployment

This Docker setup is for **local development only**. For production:

1. Use Supabase Cloud (https://supabase.com)
2. Or deploy to your own infrastructure with proper:
   - SSL/TLS certificates
   - Secure secrets management
   - Backup strategies
   - Monitoring and logging
   - Rate limiting
   - WAF protection
