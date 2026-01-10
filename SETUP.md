# ListenOS Setup Guide

This guide covers the complete setup for ListenOS with the new hybrid architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ListenOS System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐         ┌─────────────────────────┐   │
│  │   Desktop App       │  HTTP   │   Backend API Server    │   │
│  │   (Tauri + Next.js) │◄───────►│   (Next.js + Postgres)  │   │
│  │                     │         │                         │   │
│  │  • Audio capture    │         │  • AI Processing        │   │
│  │  • System controls  │         │  • User auth (Clerk)    │   │
│  │  • Keyboard/mouse   │         │  • Settings sync        │   │
│  │  • Local actions    │         │  • Usage tracking       │   │
│  └─────────────────────┘         └─────────────────────────┘   │
│                                            │                    │
│                                            ▼                    │
│                                  ┌─────────────────────┐       │
│                                  │   External APIs     │       │
│                                  │  • Groq (STT/LLM)   │       │
│                                  │  • Deepgram         │       │
│                                  └─────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 20+
- Rust (latest stable)
- Docker & Docker Compose (for local server)
- Clerk account (for authentication)
- Groq API key (for AI processing)

---

## Quick Start (Development)

### 1. Clone and Install

```bash
git clone https://github.com/devrajsingh15/ListenOS.git
cd ListenOS

# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your keys:

```env
# Backend API Server
LISTENOS_API_URL=http://localhost:3001

# AI APIs (for server)
GROQ_API_KEY=your_groq_api_key

# Clerk Authentication
CLERK_SECRET_KEY=your_clerk_secret
CLERK_PUBLISHABLE_KEY=your_clerk_publishable
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable

# Database
DATABASE_URL=postgresql://listenos:listenos_dev@localhost:5432/listenos
```

### 3. Start the Backend Server

**Option A: Using Docker (Recommended)**

```bash
# Start PostgreSQL and API server
npm run docker:up

# View logs
npm run docker:logs
```

**Option B: Manual Setup**

```bash
# Start PostgreSQL separately (or use a cloud database)
# Then run the server:
npm run server:dev
```

### 4. Initialize Database

```bash
# Push schema to database
npm run db:push
```

### 5. Start the Desktop App

```bash
# In a new terminal
npm run tauri:dev
```

---

## Server Setup (Production)

### Option 1: Docker Deployment

```bash
cd server

# Build and run with Docker Compose
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
```

### Option 2: Vercel Deployment

1. Connect your GitHub repo to Vercel
2. Set root directory to `server`
3. Add environment variables:
   - `DATABASE_URL`
   - `GROQ_API_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
4. Deploy

### Option 3: Self-Hosted

```bash
cd server

# Build
npm run build

# Start production server
npm run start
```

---

## Database Setup

### Using Docker (Local Development)

The `docker-compose.yml` includes PostgreSQL. Just run:

```bash
npm run docker:up
```

### Using Railway (Production)

1. Go to [Railway](https://railway.app)
2. Create new project → Add PostgreSQL
3. Copy the `DATABASE_URL` from Variables tab
4. Add to your environment

### Push Schema

```bash
npm run db:push
```

### View Database

```bash
npm run db:studio
```

---

## Clerk Authentication Setup

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create a new application
3. Configure sign-in methods (Email, Google, GitHub)
4. Copy API keys to your environment:
   - `CLERK_SECRET_KEY` (starts with `sk_`)
   - `CLERK_PUBLISHABLE_KEY` (starts with `pk_`)

---

## API Endpoints

The backend server exposes these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/voice/transcribe` | POST | Transcribe audio |
| `/api/voice/process` | POST | Process intent |
| `/api/settings` | GET/PUT | User settings |
| `/api/users` | GET/POST | User management |

---

## Development Commands

```bash
# Start everything (server + desktop app)
npm run dev:all

# Start only the server
npm run server:dev

# Start only the desktop app
npm run tauri:dev

# Docker commands
npm run docker:up      # Start containers
npm run docker:down    # Stop containers
npm run docker:logs    # View logs
npm run docker:build   # Rebuild images

# Database commands
npm run db:push        # Push schema changes
npm run db:studio      # Open Drizzle Studio

# Build for production
npm run tauri:build
```

---

## Environment Variables Reference

### Desktop App (`.env.local`)

```env
# API Server URL
LISTENOS_API_URL=http://localhost:3001

# Optional: API key for auth (if not using Clerk)
LISTENOS_API_KEY=your_api_key

# Fallback: Direct API keys (only used if server unavailable)
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
```

### Server (`server/.env`)

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# AI APIs
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key

# Clerk
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...

# Server
PORT=3001
NODE_ENV=production
```

---

## Troubleshooting

### Server not responding

1. Check if server is running: `curl http://localhost:3001/api/health`
2. Check Docker logs: `npm run docker:logs`
3. Verify environment variables are set

### Authentication errors

1. Ensure Clerk keys are correct
2. Check that `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_`
3. Verify Clerk application is configured correctly

### Database connection errors

1. Check `DATABASE_URL` format
2. Ensure PostgreSQL is running
3. Run `npm run db:push` to create tables

### Audio not working

1. Check microphone permissions
2. On macOS: Grant Accessibility permissions in System Preferences
3. Verify audio device is selected in settings

---

## Building for Production

### Desktop App

```bash
npm run tauri:build
```

Installers will be created in:
- Windows: `backend/target/release/bundle/nsis/`
- macOS: `backend/target/release/bundle/dmg/`

### Server Docker Image

```bash
cd server
docker build -t listenos-api .
```

---

## Support

- GitHub Issues: [Report a bug](https://github.com/devrajsingh15/ListenOS/issues)
- Documentation: [README.md](README.md)
