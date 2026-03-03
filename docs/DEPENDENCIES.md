# Project Dependencies

This file lists all npm packages required for the BlueCrow Virtual Agent application.

## Installation Command

To install all dependencies at once, run:
```bash
npm install
```

This will automatically install all packages listed in `package.json`.

## Manual Installation (if needed)

If you need to install packages manually or rebuild the project from scratch:

### Production Dependencies
```bash
npm install @azure/openai@^2.0.0
npm install @azure/search-documents@^12.2.0
npm install @google/genai@^1.29.1
npm install react@^19.2.0
npm install react-dom@^19.2.0
```

### Development Dependencies
```bash
npm install --save-dev @types/node@^22.14.0
npm install --save-dev @vitejs/plugin-react@^5.0.0
npm install --save-dev typescript@~5.8.2
npm install --save-dev vite@^6.2.0
```

### Or Install Everything At Once
```bash
# Production dependencies
npm install @azure/openai@^2.0.0 @azure/search-documents@^12.2.0 @google/genai@^1.29.1 react@^19.2.0 react-dom@^19.2.0

# Development dependencies
npm install --save-dev @types/node@^22.14.0 @vitejs/plugin-react@^5.0.0 typescript@~5.8.2 vite@^6.2.0
```

## Package Purposes

### @azure/openai (v2.0.0)
- **Purpose:** Azure OpenAI Service SDK
- **Used for:** Connecting to Azure OpenAI GPT-4o model
- **File:** `services/aiService.ts`

### @azure/search-documents (v12.2.0)
- **Purpose:** Azure AI Search SDK
- **Used for:** Searching the knowledge base index
- **File:** `services/azureSearchService.ts`

### @google/genai (v1.29.1)
- **Purpose:** Google Gemini API SDK
- **Status:** Legacy - can be removed if not using Gemini
- **File:** `services/geminiService.ts` (deprecated)

### react (v19.2.0)
- **Purpose:** React framework
- **Used for:** Building the UI components
- **Files:** All `.tsx` files

### react-dom (v19.2.0)
- **Purpose:** React DOM rendering
- **Used for:** Rendering React components to the browser
- **File:** `index.tsx`

### @types/node (v22.14.0)
- **Purpose:** TypeScript type definitions for Node.js
- **Used for:** Type checking Node.js APIs

### @vitejs/plugin-react (v5.0.0)
- **Purpose:** Vite plugin for React
- **Used for:** Building and bundling React application
- **File:** `vite.config.ts`

### typescript (v5.8.2)
- **Purpose:** TypeScript compiler
- **Used for:** Type checking and compiling TypeScript code

### vite (v6.2.0)
- **Purpose:** Build tool and development server
- **Used for:** Development server, hot reload, and production builds
- **File:** `vite.config.ts`

## Removing Google Gemini (Optional)

If you want to remove the legacy Gemini dependency:

1. Remove the package:
   ```bash
   npm uninstall @google/genai
   ```

2. Delete the file:
   ```bash
   rm services/geminiService.ts
   ```

3. Update `package.json` to remove the `@google/genai` entry

## Verifying Installation

After installation, verify all packages are installed:
```bash
npm list --depth=0
```

You should see output similar to:
```
blue-crow-capital---virtual-agent@0.0.0
├── @azure/openai@2.0.0
├── @azure/search-documents@12.2.0
├── @google/genai@1.29.1
├── @types/node@22.14.0
├── @vitejs/plugin-react@5.0.0
├── react@19.2.0
├── react-dom@19.2.0
├── typescript@5.8.2
└── vite@6.2.0
```

## Updating Dependencies

To update all dependencies to their latest compatible versions:
```bash
npm update
```

To check for outdated packages:
```bash
npm outdated
```

## Node.js Version Requirement

This project requires:
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher

Check your versions:
```bash
node --version
npm --version
```

If you need to upgrade Node.js, download from: https://nodejs.org/
