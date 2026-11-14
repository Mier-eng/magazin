#!/usr/bin/env node
/**
 * Пересоздаёт страницы товаров (tovar/*.html), sitemap.xml и robots.txt
 * из products.json и config.js. Нужен только если вы работаете с файлами на компьютере.
 * Если вы управляете товарами через admin.html, этот скрипт не нужен.
 *
 *   node scripts/generate-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PageGen = require('../js/pagegen.js');

const rootDir = process.cwd();

function loadConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'config.js'), 'utf8'), sandbox);
  return PageGen.normalizeConfig(sandbox.window.SITE_CONFIG);
}

const products = JSON.parse(fs.readFileSync(path.join(rootDir, 'products.json'), 'utf8'));
if (!Array.isArray(products)) throw new Error('products.json должен содержать список товаров.');

const config = loadConfig();
const tovarDir = path.join(rootDir, 'tovar');
fs.mkdirSync(tovarDir, { recursive: true });

const active = new Set();
for (const p of products) {
  if (!p || !/^[a-z0-9-]+$/.test(String(p.slug))) {
    console.warn('Пропущен товар с некорректным slug:', p && p.slug);
    continue;
  }
  active.add(`${p.slug}.html`);
  fs.writeFileSync(path.join(tovarDir, `${p.slug}.html`), PageGen.renderProductPage(p, config), 'utf8');
}
for (const f of fs.readdirSync(tovarDir)) {
  if (f.endsWith('.html') && !active.has(f)) fs.unlinkSync(path.join(tovarDir, f));
}
fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), PageGen.buildSitemap(products, config), 'utf8');
fs.writeFileSync(path.join(rootDir, 'robots.txt'), PageGen.buildRobots(config), 'utf8');
console.log(`Готово. Страниц товаров: ${active.size}. Адрес сайта: ${config.siteUrl}`);
