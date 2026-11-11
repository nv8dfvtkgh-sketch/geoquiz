// Compile le navigateur (public/app.js) et le serveur avec esbuild.
//   node scripts/build.mjs           build Node.js : public/app.js + dist/server.js
//   node scripts/build.mjs --cf      build Cloudflare : public/app.js + copie des données dans public/data
//   node scripts/build.mjs --watch   recompile le navigateur à chaque modification
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const watch = process.argv.includes('--watch');
const cf = process.argv.includes('--cf');
const version = Date.now().toString(36);

const client = {
  entryPoints: ['src/client/main.tsx'],
  bundle: true,
  outfile: 'public/app.js',
  format: 'esm',
  target: ['es2020', 'safari15'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  jsx: 'automatic',
  loader: { '.json': 'json' },
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  logLevel: 'info',
};

// Le numéro de version force le navigateur à recharger app.js / app.css après un déploiement.
const html = fs.readFileSync('public/index.html', 'utf8').replace(/(app\.(?:js|css))(\?v=[\w]+)?/g, `$1?v=${version}`);
fs.writeFileSync('public/index.html', html);

if (watch) {
  const ctx = await esbuild.context(client);
  await ctx.watch();
} else if (cf) {
  await esbuild.build(client);
  // Cloudflare : les données sont servies comme fichiers statiques, lues par le Worker
  // (le Worker bloque l'accès public à /data/*).
  if (!fs.existsSync('data/build/world.json')) {
    console.error('data/build est vide : lancez « npm run data » avant.');
    process.exit(1);
  }
  fs.rmSync('public/data', { recursive: true, force: true });
  fs.cpSync('data/build', 'public/data', { recursive: true });
  console.log('• Données copiées dans public/data');
} else {
  fs.rmSync('public/data', { recursive: true, force: true });
  await esbuild.build(client);
  await esbuild.build({
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/server.js',
    packages: 'external',
    logLevel: 'info',
  });
}
