// Renders icons/icon.svg to the PNG sizes the manifest needs (uses Playwright).
import { readFile } from 'node:fs/promises';
import { launch } from '../tests/e2e/pw.mjs';

const svg = await readFile(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const browser = await launch();
const page = await browser.newPage();
for (const [size, file, pad] of [[192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [512, 'icon-512-maskable.png', 0.12]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(`<body style="margin:0;background:#0b0f14;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: new URL(`../icons/${file}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log('icons written');
