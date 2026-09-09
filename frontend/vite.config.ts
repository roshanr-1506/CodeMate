import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),envDir:fileURLToPath(new URL('..',import.meta.url)),plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:3001','/health':'http://127.0.0.1:3001','/socket.io':{target:'http://127.0.0.1:3001',ws:true}}},build:{outDir:'../dist/frontend',emptyOutDir:true}});
