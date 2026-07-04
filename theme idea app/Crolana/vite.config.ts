
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, createLogger } from 'vite';


const logger = createLogger();
const _warn  = logger.warn.bind(logger);
logger.warn  = (msg, opts) => {
  if (msg.includes('Sourcemap'))                      return;
  if (msg.includes('No sources'))                     return;
  if (msg.includes('SOURCEMAP_ERROR'))                return;
  if (msg.includes('points to missing source files')) return;
  _warn(msg, opts);
};

export default defineConfig(({ mode }) => {
  const env  = loadEnv(mode, '.', '');
  const root = process.cwd();
  const stub = path.resolve(root, 'src', 'lib', 'empty-stub.ts');

  return {
    customLogger: logger,

    plugins: [
      react(),
      tailwindcss(),
    ],

    define: {
      global:                 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.BROWSER':  JSON.stringify(true),
    },

    resolve: {
      conditions: ['browser', 'import', 'module', 'default'],
      alias: {
        '@':        root,
        'stream':   stub,
        'http':     stub,
        'https':    stub,
        'url':      stub,
        'zlib':     stub,
        'punycode': stub,
      },
    },

    optimizeDeps: {
      
      
      
      
      
      
      
      
      
      
      
      exclude: [
        '@solana/web3.js',
        '@solana/spl-token',
        '@metaplex-foundation/umi',
        '@metaplex-foundation/umi-bundle-defaults',
        '@metaplex-foundation/mpl-token-metadata',
        '@metaplex-foundation/mpl-candy-machine',
        '@metaplex-foundation/mpl-core',
        'bs58',
        'tweetnacl',
        'buffer',
        'eventemitter3',
      ],
      include: [
        'react', 'react-dom', 'ethers', 'recharts', 'react-router-dom',
        'zustand', 'uuid', 'lucide-react', 'clsx', 'tailwind-merge',
        'papaparse', 'jszip',
      ],
      esbuildOptions: {
        target:    'es2020',
        supported: { 'top-level-await': true },
        define:    { 'process.env.NODE_ENV': JSON.stringify(mode) },
      },
    },

    server: {
      hmr:   process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target:       `http://localhost:${env.PORT || 3000}`,
          changeOrigin: true,
          secure:       false,
        },
      },
    },

    build: {
      outDir:                'dist',
      sourcemap:             false,
      target:                'es2020',
      chunkSizeWarningLimit: 4000,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'SOURCEMAP_ERROR')                          return;
          if (warning.message?.includes('points to missing source files')) return;
          if (warning.message?.includes('No sources are declared'))        return;
          if (warning.code === 'CIRCULAR_DEPENDENCY')                      return;
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE')                   return;
          if (warning.code === 'MISSING_GLOBAL_NAME')                      return;
          warn(warning);
        },
        output: {
          
          
          
          manualChunks: {
            react:  ['react', 'react-dom'],
            router: ['react-router-dom'],
            ethers: ['ethers'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
