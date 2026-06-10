import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Vite config for building the mobile Lexical editor bundle.
 * Produces a standalone bundle for WKWebView with the full Lexical plugin set
 * (minus desktop-only plugins like DiffPlugin, SpeechToText, DraggableBlock).
 *
 * Usage: npx vite build --config vite.config.editor.ts
 * Output: dist-editor/editor.html + assets/
 */
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
      include: [
        '**/*.tsx',
        '**/*.ts',
        '**/*.jsx',
        '**/*.js',
        '../runtime/**/*.{tsx,ts,jsx,js}',
      ],
    }),
    // Fix script tags for file:// loading in WKWebView:
    // - Strip crossorigin (CORS rejects file:// origin null)
    // - Replace type="module" with defer (modules enforce CORS; defer preserves execution order)
    {
      name: 'wkwebview-compat',
      transformIndexHtml(html) {
        return html
          .replace(/ crossorigin/g, '')
          .replace(/ type="module"/g, ' defer');
      },
    },
  ],
  resolve: {
    alias: {
      '@nimbalyst/runtime': fileURLToPath(new URL('../runtime/src', import.meta.url)),
    },
  },
  base: './',
  build: {
    outDir: 'dist-editor',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'editor.html'),
      },
      // Prevent rollup from failing on Node.js built-in imports (node:crypto etc.)
      // that get pulled in transitively through @anthropic-ai/sdk when rollup
      // parses extension-sdk dist files. The editor never calls these APIs in
      // WKWebView — they land as dead code and tree-shaking removes them.
      external: (id) => id.startsWith('node:') || id.startsWith('@anthropic-ai/'),
      output: {
        // IIFE format for WKWebView file:// compatibility (no ES module CORS issues)
        format: 'iife',
        globals: (id) => {
          // Dead-code external: provide any valid identifier so rollup generates
          // compilable IIFE wrapper. Tree-shaking eliminates all references
          // before the bundle ships.
          if (id.startsWith('node:') || id.startsWith('@anthropic-ai/')) {
            return '__nimbalyst_unused_' + id.replace(/[^a-zA-Z0-9]/g, '_');
          }
        },
      },
    },
  },
});
