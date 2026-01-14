// vite.config.ts
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
    // On peut supprimer le bloc "define" manuel si on utilise le préfixe VITE_
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});