# BlueCrow Virtual Agent - Setup Guide

This guide will help you set up the BlueCrow Virtual Agent application on a new machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional, for version control)

To check if Node.js and npm are installed:
```bash
node --version
npm --version
```

## Quick Setup

### 1. Clone or Copy the Project

If using Git:
```bash
git clone <repository-url>
cd webapp_2
```

If copying files manually, copy all project files to your desired location.

### 2. Install Dependencies

Run this command in the project root directory:
```bash
npm install
```

This will install all required packages listed in `package.json`:
- `@azure/openai` - Azure OpenAI SDK
- `@azure/search-documents` - Azure AI Search SDK
- `@google/genai` - Google Gemini SDK (legacy, can be removed if not used)
- `react` & `react-dom` - React framework
- `vite` - Build tool and dev server
- `typescript` - TypeScript support

### 3. Configure Environment Variables

Create a `.env.local` file in the project root with the following content:

```env
# Azure OpenAI Configuration (AI Foundry)
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE_NAME.openai.azure.com/
AZURE_OPENAI_API_KEY=YOUR_AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# Azure AI Search Configuration
AZURE_SEARCH_ENDPOINT=https://<your-search-resource>.search.windows.net
AZURE_SEARCH_API_KEY=YOUR_AZURE_SEARCH_API_KEY
AZURE_SEARCH_INDEX_NAME=<your-index-name>
```

**Important:** Replace the placeholder values with your actual Azure credentials:

#### Getting Azure OpenAI Credentials:
1. Go to [Azure AI Foundry](https://ai.azure.com/)
2. Select your project
3. Navigate to your GPT-4o deployment
4. Copy:
   - **Endpoint** (under Keys and Endpoint)
   - **API Key** (under Keys and Endpoint)
   - **Deployment Name** (the name of your deployment)

#### Getting Azure Search Credentials:
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to your Azure AI Search service
3. Click on "Keys" in the left sidebar
4. Copy:
   - **Endpoint** (URL at the top of the Overview page)
   - **Admin Key** (Primary or Secondary admin key)
   - **Index Name** (found under "Indexes")

### 4. Start the Development Server

```bash
npm run dev
```

The application will be available at:
- **Local:** `http://localhost:3000`
- **Network:** `http://YOUR_IP_ADDRESS:3000`

The network URL allows access from other devices on the same network.

### 5. Build for Production (Optional)

To create a production build:
```bash
npm run build
```

To preview the production build:
```bash
npm run preview
```

## Project Structure

```
webapp_2/
├── components/          # React components
│   ├── Avatar.tsx
│   ├── ChatPanel.tsx
│   ├── Lobby.tsx
│   ├── ModeSelector.tsx
│   ├── ParticipantsPanel.tsx
│   ├── ParticipantView.tsx
│   ├── SlideViewer.tsx
│   └── icons.tsx
├── services/           # API integration services
│   ├── aiService.ts          # Azure OpenAI (GPT-4o) integration
│   ├── azureSearchService.ts # Azure AI Search integration
│   ├── geminiService.ts      # Legacy Google Gemini (deprecated)
│   └── ttsService.ts         # Text-to-Speech service
├── App.tsx             # Main application component
├── constants.ts        # Application constants and slide data
├── types.ts            # TypeScript type definitions
├── index.tsx           # Application entry point
├── vite.config.ts      # Vite configuration
├── package.json        # npm dependencies and scripts
├── .env.local          # Environment variables (create this)
└── .gitignore          # Git ignore rules

```

## Dependencies Overview

### Production Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@azure/openai` | ^2.0.0 | Azure OpenAI API client (GPT-4o) |
| `@azure/search-documents` | ^12.2.0 | Azure AI Search client |
| `@google/genai` | ^1.29.1 | Google Gemini API (legacy) |
| `react` | ^19.2.0 | React framework |
| `react-dom` | ^19.2.0 | React DOM rendering |

### Development Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@types/node` | ^22.14.0 | Node.js type definitions |
| `@vitejs/plugin-react` | ^5.0.0 | Vite React plugin |
| `typescript` | ~5.8.2 | TypeScript compiler |
| `vite` | ^6.2.0 | Build tool and dev server |

## Troubleshooting

### Port 3000 Already in Use

If port 3000 is already in use, you can change it in `vite.config.ts`:
```typescript
server: {
  port: 3001, // Change to any available port
  host: '0.0.0.0',
}
```

### Network Access Not Working

If you can't access the app from other devices:
1. Check your firewall settings
2. Ensure both devices are on the same network
3. On Windows, you may need to allow the port through Windows Firewall:
   ```powershell
   New-NetFirewallRule -DisplayName "Vite Dev Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

### Environment Variables Not Loading

If environment variables are not working:
1. Ensure `.env.local` is in the project root directory
2. Restart the dev server (`Ctrl+C` then `npm run dev`)
3. Check that variable names match exactly in `.env.local` and `vite.config.ts`

### Azure API Errors

If you get Azure API errors:
1. Verify your API keys are correct
2. Check that your Azure resources are in the same region
3. Ensure your Azure OpenAI deployment name matches exactly
4. Verify you have sufficient quota/credits in your Azure subscription

## Security Notes

### For Internal/Workplace Use
This application is configured for internal workplace use with the following considerations:
- API keys are exposed to the client (acceptable for internal networks only)
- Ensure the application is not exposed to the public internet
- Use VPN for remote access if needed
- Set up billing alerts in Azure to monitor usage

### For Production/Public Use
If deploying publicly, you MUST:
1. Create a backend API to proxy requests
2. Move all API keys to server-side code
3. Implement user authentication
4. Add rate limiting
5. Use environment variables on your hosting platform (not `.env` files)

## Additional Resources

- [Azure OpenAI Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Azure AI Search Documentation](https://learn.microsoft.com/en-us/azure/search/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

## Support

For issues or questions, contact your system administrator or the development team.
