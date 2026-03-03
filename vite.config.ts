import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Azure OpenAI
        'process.env.AZURE_OPENAI_ENDPOINT': JSON.stringify(env.AZURE_OPENAI_ENDPOINT),
        'process.env.AZURE_OPENAI_API_KEY': JSON.stringify(env.AZURE_OPENAI_API_KEY),
        'process.env.AZURE_OPENAI_DEPLOYMENT_NAME': JSON.stringify(env.AZURE_OPENAI_DEPLOYMENT_NAME),
        'process.env.AZURE_OPENAI_API_VERSION': JSON.stringify(env.AZURE_OPENAI_API_VERSION),
        // Azure Search
        'process.env.AZURE_SEARCH_ENDPOINT': JSON.stringify(env.AZURE_SEARCH_ENDPOINT),
        'process.env.AZURE_SEARCH_API_KEY': JSON.stringify(env.AZURE_SEARCH_API_KEY),
        'process.env.AZURE_SEARCH_INDEX_NAME': JSON.stringify(env.AZURE_SEARCH_INDEX_NAME),
        // Feature Flags
        'process.env.VITE_QNA_ENABLED': JSON.stringify(env.VITE_QNA_ENABLED),
        'process.env.VITE_BUG_REPORT_ENABLED': JSON.stringify(env.VITE_BUG_REPORT_ENABLED),
        // Content API flag — must be in define so import.meta.env is baked at build time
        'import.meta.env.VITE_USE_CONTENT_API': JSON.stringify(env.VITE_USE_CONTENT_API)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: ['@azure/ai-voicelive', '@azure/core-auth'],
        esbuildOptions: {
          define: {
            global: 'globalThis'
          }
        }
      },
      build: {
        commonjsOptions: {
          transformMixedEsModules: true
        }
      }
    };
});
