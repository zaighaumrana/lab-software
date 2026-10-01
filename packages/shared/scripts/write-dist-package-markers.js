// Both builds emit plain `.js` files (tsc always mirrors the source
// extension), so Node needs a way to tell them apart: the nearest
// package.json's "type" field governs how Node parses a `.js` file.
// Rather than rename every output file to `.cjs`/`.mjs` (which would also
// mean rewriting every relative import specifier to match), we drop a
// minimal package.json into each output directory that overrides "type"
// for just that subtree. This is the standard, documented pattern for a
// dual CommonJS/ESM TypeScript build.
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

fs.mkdirSync(path.join(distDir, 'cjs'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'esm'), { recursive: true });

fs.writeFileSync(
  path.join(distDir, 'cjs', 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);
fs.writeFileSync(
  path.join(distDir, 'esm', 'package.json'),
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
);
