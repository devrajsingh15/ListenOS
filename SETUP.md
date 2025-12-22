# ListenOS Setup Guide

This guide will help you set up the complete backend infrastructure for ListenOS.

## Prerequisites

- Node.js 20+
- Railway account (for Postgres database)
- WorkOS account (for authentication)
- GitHub repository with secrets configured

---

## 1. Database Setup (Railway Postgres)

### Create a Database

1. Go to [Railway](https://railway.app) and create a new project
2. Click "Add New" → "Database" → "PostgreSQL"
3. Once created, click on the database and go to "Variables"
4. Copy the `DATABASE_URL` value

### Push Schema to Database

Add the DATABASE_URL to your `.env.local` file:

```env
DATABASE_URL=postgresql://postgres:password@host:5432/railway
```

Then run:

```bash
npm run db:push
```

This will create all the tables (users, subscriptions, user_settings, command_history).

---

## 2. WorkOS Authentication Setup

### Create WorkOS Application

1. Go to [WorkOS Dashboard](https://dashboard.workos.com)
2. Create a new organization/project
3. Go to "API Keys" and copy:
   - **Client ID** (starts with `client_`)
   - **API Key** (starts with `sk_`)

### Configure Redirect URI

In WorkOS Dashboard → Configuration → Redirect URIs, add:
- `https://your-api-domain.vercel.app/api/auth/callback`

### Add Environment Variables

Add to your `.env.local`:

```env
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
NEXT_PUBLIC_WORKOS_CLIENT_ID=client_...
NEXT_PUBLIC_API_URL=https://your-api-domain.vercel.app
```

---

## 3. Deploy API to Vercel

The API routes need to be deployed to a server. Since this is a Next.js app, deploy to Vercel:

1. Connect your GitHub repo to Vercel
2. Add environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `WORKOS_API_KEY`
   - `WORKOS_CLIENT_ID`
   - `NEXT_PUBLIC_WORKOS_CLIENT_ID`
3. Deploy

The API will be available at `https://your-project.vercel.app/api/...`

---

## 4. GitHub Release Setup (for Updates)

### Generate Signing Keys

Run this command to generate a new key pair:

```bash
npx @tauri-apps/cli@latest signer generate -w ~/.tauri/myapp.key
```

This will output:
- A private key (save this securely)
- A public key (already in `backend/tauri.conf.json`)

### Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions, and add:

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | The private key (base64 encoded content) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set during generation |

### Create a Release

To trigger a release build:

```bash
# Update version in backend/tauri.conf.json first
git tag v0.1.1
git push origin v0.1.1
```

This will:
1. Trigger the GitHub Actions workflow
2. Build the MSI installer
3. Create a draft release with the installer attached

Go to GitHub Releases, edit the draft, and publish it.

---

## 5. Environment Variables Summary

### `.env.local` (local development)

```env
# Database
DATABASE_URL=postgresql://...

# WorkOS
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
NEXT_PUBLIC_WORKOS_CLIENT_ID=client_...

# API URL (your deployed Vercel app)
NEXT_PUBLIC_API_URL=https://your-app.vercel.app

# AI Keys (for voice processing)
GROQ_API_KEY=gsk_...
DEEPGRAM_API_KEY=...
```

### Vercel Environment Variables

Same as above, but set in Vercel dashboard.

### GitHub Secrets

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

---

## 6. Local Development

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Run development server
npm run tauri:dev
```

---

## 7. Building for Production

```bash
# Build the desktop app
npm run tauri:build

# The installer will be at:
# backend/target/release/bundle/msi/ListenOS_X.X.X_x64_en-US.msi
```

---

## Troubleshooting

### Auth not working

1. Ensure `NEXT_PUBLIC_API_URL` points to your deployed Vercel app
2. Check that the redirect URI in WorkOS matches your API URL
3. Verify the deep link `listenos://` is registered (check `tauri.conf.json`)

### Updates not working

1. Ensure you've published a GitHub release (not draft)
2. Check that `latest.json` is in the release assets
3. Verify the public key in `tauri.conf.json` matches your private key

### Database errors

1. Check that `DATABASE_URL` is correct
2. Run `npm run db:push` to create/update tables
3. Use `npm run db:studio` to inspect the database
