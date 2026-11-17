// Copies the files the app needs into www/, the folder Capacitor packs into the Android app.
// The web version needs no build: the repository root is served as is.
import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = root + 'www/';
const items = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'samples'];

await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const it of items) await cp(root + it, out + it, { recursive: true });
console.log('www/ ready:', items.join(', '));
