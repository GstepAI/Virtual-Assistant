# Deployment Guide - BlueCrow Demo

## Overview
Your application is now secured with serverless functions. API keys are stored on the server, not in the browser.

## What Was Done

### 1. Created Serverless Functions
- **[api/azure-openai.ts](api/azure-openai.ts)** - Proxies Azure OpenAI requests
- **[api/azure-search.ts](api/azure-search.ts)** - Proxies Azure AI Search requests

### 2. Updated Frontend Services
- **[services/aiService.ts](services/aiService.ts)** - Now calls `/api/azure-openai`
- **[services/azureSearchService.ts](services/azureSearchService.ts)** - Now calls `/api/azure-search`

### 3. Created Vercel Configuration
- **[vercel.json](vercel.json)** - Configures deployment, CORS, and environment variables

### 4. Security Improvements
- API keys remain on server (never sent to browser)
- `.env.local` is excluded from Git (protected by `.gitignore`)
- Frontend calls your backend, backend calls Azure
- Secure proxy layer = industry best practice ✓

## Deploy to Vercel

### Step 1: Install Vercel CLI (Optional)
```bash
npm install -g vercel
```

### Step 2: Deploy via Vercel Dashboard (Recommended)

1. **Go to**: https://vercel.com/new
2. **Import your GitHub repository**: `<your-github-username>/<your-repo-name>`
3. **Configure Project**:
   - Framework Preset: Vite
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. **Add Environment Variables** (Critical!):
   Go to Project Settings → Environment Variables and add:

   ```
   AZURE_OPENAI_ENDPOINT=https://<your-openai-resource>.openai.azure.com/
   AZURE_OPENAI_API_KEY=<your-key-from-.env.local>
   AZURE_OPENAI_DEPLOYMENT_NAME=<your-deployment-name>
   AZURE_OPENAI_API_VERSION=2024-08-01-preview
   AZURE_SEARCH_ENDPOINT=https://<your-search-resource>.search.windows.net
   AZURE_SEARCH_API_KEY=<your-key-from-.env.local>
   AZURE_SEARCH_INDEX_NAME=<your-index-name>
   ```

   ⚠️ **IMPORTANT**: Copy the API keys from your `.env.local` file

5. **Deploy**: Click "Deploy"

### Step 3: Deploy via CLI (Alternative)

```bash
# Login to Vercel
vercel login

# Deploy (first time)
vercel

# Follow prompts to link to your project

# Add environment variables
vercel env add AZURE_OPENAI_ENDPOINT
vercel env add AZURE_OPENAI_API_KEY
vercel env add AZURE_OPENAI_DEPLOYMENT_NAME
vercel env add AZURE_OPENAI_API_VERSION
vercel env add AZURE_SEARCH_ENDPOINT
vercel env add AZURE_SEARCH_API_KEY
vercel env add AZURE_SEARCH_INDEX_NAME

# Deploy to production
vercel --prod
```

## File Structure
```
bluecrow-demo/
├── api/
│   ├── azure-openai.ts    # OpenAI serverless function
│   └── azure-search.ts    # Search serverless function
├── services/
│   ├── aiService.ts        # Updated to call /api/azure-openai
│   └── azureSearchService.ts # Updated to call /api/azure-search
├── .env.local             # Local secrets (NOT in Git)
├── .gitignore             # Protects .env.local
├── vercel.json            # Vercel configuration
└── package.json
```

## Environment Variables Needed

**On Vercel (Production):**
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT_NAME`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_SEARCH_ENDPOINT`
- `AZURE_SEARCH_API_KEY`
- `AZURE_SEARCH_INDEX_NAME`

**Local Development:**
- Uses `.env.local` file (already configured)

## Testing Locally

```bash
# Install Vercel CLI
npm install -g vercel

# Run development server with serverless functions
vercel dev
```

This will:
- Start Vite dev server
- Run serverless functions locally
- Simulate Vercel environment

## Troubleshooting

### Issue: "Server configuration error"
**Solution**: Check that all environment variables are set in Vercel dashboard

### Issue: API calls fail in production
**Solution**:
1. Check Vercel function logs: https://vercel.com/dashboard (navigate to your project → Logs)
2. Verify environment variables are set correctly
3. Ensure API keys are valid

### Issue: CORS errors
**Solution**: The `vercel.json` already configures CORS headers. If issues persist, check browser console for specific errors.

## Next Steps

1. ✅ Deploy to Vercel
2. Test the application in production
3. (Optional) Set up custom domain
4. (Optional) Enable Vercel Analytics
5. (Optional) Set up monitoring/alerts

## Security Checklist

- ✅ API keys stored on server only
- ✅ `.env.local` excluded from Git
- ✅ Serverless functions validate requests
- ✅ CORS configured properly
- ✅ Error messages don't expose secrets

## Questions?

- Vercel Docs: https://vercel.com/docs
- Vercel Functions: https://vercel.com/docs/functions
- Environment Variables: https://vercel.com/docs/environment-variables
