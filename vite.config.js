import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // server: {
  //   headers: {
  //     'Cross-Origin-Embedder-Policy': 'credentialless', 
  //     'Cross-Origin-Opener-Policy': 'same-origin',
  //   },
  // },
});
