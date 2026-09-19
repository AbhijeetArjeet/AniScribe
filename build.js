const esbuild = require('esbuild');
const path = require('path');

const isDev = process.argv.includes('--watch');

async function build() {
  const commonConfig = {
    bundle: true,
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    external: ['electron', 'better-sqlite3', 'node:sqlite'],
  };

  // Main process
  const mainCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: [path.resolve(__dirname, 'src/main/index.ts')],
    outfile: path.resolve(__dirname, 'dist/main/index.js'),
    format: 'cjs',
  });

  // Preload script
  const preloadCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: [path.resolve(__dirname, 'src/preload/index.ts')],
    outfile: path.resolve(__dirname, 'dist/preload/index.js'),
    format: 'cjs',
  });

  // Sniffer Preload script
  const snifferPreloadCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: [path.resolve(__dirname, 'src/preload/snifferPreload.ts')],
    outfile: path.resolve(__dirname, 'dist/preload/snifferPreload.js'),
    format: 'cjs',
  });

  if (isDev) {
    await mainCtx.watch();
    await preloadCtx.watch();
    await snifferPreloadCtx.watch();
    console.log('[esbuild] Watching main and preload...');
  } else {
    await mainCtx.rebuild();
    await preloadCtx.rebuild();
    await snifferPreloadCtx.rebuild();
    await mainCtx.dispose();
    await preloadCtx.dispose();
    await snifferPreloadCtx.dispose();
    console.log('[esbuild] Main and preload built successfully.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
