/**
 * Общий генератор страниц товаров, sitemap.xml и robots.txt.
 * Работает и в браузере (admin.html), и в Node (scripts/generate-pages.mjs).
 */
(function (root) {
  'use strict';

  var CSP_POLICY =
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none';";

  var PLACEHOLDER_URL = 'https://example.github.io/catalog';

  // Адрес сайта: siteUrl из config.js, а если он пуст, то из githubRepo ("логин/репозиторий").
  function resolveSiteUrl(cfg) {
    cfg = cfg || {};
    var url = String(cfg.siteUrl || '').trim().replace(/\/+$/, '');
    if (url) return url;
    var m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(String(cfg.githubRepo || '').trim());
    if (m) {
      var owner = m[1];
      var repo = m[2];
      return repo.toLowerCase() === (owner + '.github.io').toLowerCase()
        ? 'https://' + owner + '.github.io'
        : 'https://' + owner + '.github.io/' + repo;
    }
    return PLACEHOLDER_URL;
  }

  function normalizeConfig(cfg) {
    cfg = cfg || {};
    var city = String(cfg.city || 'Сухум');
    return {
      storeName: String(cfg.storeName || 'Дом и Мастерская'),
      city: city,
      cityIn: String(cfg.cityIn || city),
      siteUrl: resolveSiteUrl(cfg)
    };
  }

  var CYR = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};

  function slugify(text) {
    var out = String(text || '').toLowerCase().split('').map(function (ch) {
      return Object.prototype.hasOwnProperty.call(CYR, ch) ? CYR[ch] : ch;
    }).join('');
    out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return out || 'tovar';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeJsonLd(obj) {
    return JSON.stringify(obj, null, 2).replace(/<\//g, '\\u003c/');
  }

  function formatPrice(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 'По договорённости';
    return `${new Intl.NumberFormat('ru-RU').format(Math.round(num))} ₽`;
  }

  function formatDate(isoDate) {
    if (typeof isoDate !== 'string' || !isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function truncateDescription(text, maxLen = 155) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
  }

  function isSafeRelativePhoto(p) {
    return (
      typeof p === 'string' &&
      p.trim().length > 0 &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p) &&
      !p.includes('..') &&
      !p.startsWith('//')
    );
  }

  function renderProductPage(product, config) {
    const title = String(product.title || 'Товар');
    const category = String(product.category || 'Бытовые товары');
    const condition = String(product.condition || 'новое');
    const conditionLabel = condition === 'б/у' ? 'Б/у' : 'Новое';
    const status = String(product.status || 'в наличии');
    const isSold = status.toLowerCase() === 'продано';
    const statusLabel = isSold ? 'Продано' : 'В наличии';
    const priceNumber = Number(product.price) || 0;
    const priceText = formatPrice(priceNumber);
    const description = String(product.description || '');
    const createdAt = String(product.createdAt || '');
    const photos = Array.isArray(product.photos)
      ? product.photos.filter(isSafeRelativePhoto)
      : [];

    const primaryPhoto = photos[0] || '';
    const pageUrl = `${config.siteUrl}/tovar/${product.slug}.html`;
    const ogImage = primaryPhoto ? `${config.siteUrl}/${primaryPhoto.replace(/^\/+/, '')}` : '';

    const pageTitle = `${title} — купить в ${config.cityIn} | ${config.storeName}`;
    const metaDesc = truncateDescription(
      `${title} (${conditionLabel.toLowerCase()}, ${priceText}) в ${config.cityIn}. ${description}`
    );

    const schemaObj = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      category,
      description,
      image: photos.map((p) => `${config.siteUrl}/${p.replace(/^\/+/, '')}`),
      itemCondition:
        condition === 'б/у'
          ? 'https://schema.org/UsedCondition'
          : 'https://schema.org/NewCondition',
      offers: {
        '@type': 'Offer',
        url: pageUrl,
        priceCurrency: 'RUB',
        price: String(priceNumber),
        availability: isSold
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
        itemCondition:
          condition === 'б/у'
            ? 'https://schema.org/UsedCondition'
            : 'https://schema.org/NewCondition',
        seller: {
          '@type': 'Person',
          name: config.storeName
        }
      }
    };

    const thumbsHtml =
      photos.length > 1
        ? `<div class="gallery-thumbs" aria-label="Дополнительные фото товара">
  ${photos
    .map((photo, idx) => {
      const cleanPhoto = escapeHtml(photo.replace(/^\/+/, ''));
      const alt = escapeHtml(`${title} — фото ${idx + 1}`);
      return `            <button type="button" class="thumb-btn" data-src="${cleanPhoto}" data-alt="${alt}" aria-current="${idx === 0 ? 'true' : 'false'}" aria-label="Показать фото ${idx + 1}">
                <img src="../${cleanPhoto}" alt="${alt}" loading="lazy" decoding="async" width="160" height="120" />
              </button>`;
    })
    .join('\n')}
            </div>`
        : '';

    const mainImageHtml = primaryPhoto
      ? `<img id="gallery-main-img" src="../${escapeHtml(primaryPhoto.replace(/^\/+/, ''))}" alt="${escapeHtml(`${title} — ${category}, ${conditionLabel.toLowerCase()}`)}" loading="eager" decoding="async" width="800" height="600" data-fallback="true" />`
      : `<div class="img-fallback">${escapeHtml(title)}</div>`;

    return `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />
      <meta name="referrer" content="strict-origin-when-cross-origin" />
            <title>${escapeHtml(pageTitle)}</title>
      <meta name="description" content="${escapeHtml(metaDesc)}" />
      <link rel="canonical" href="${escapeHtml(pageUrl)}" />
      <meta property="og:type" content="product" />
      <meta property="og:locale" content="ru_RU" />
      <meta property="og:site_name" content="${escapeHtml(config.storeName)}" />
      <meta property="og:title" content="${escapeHtml(pageTitle)}" />
      <meta property="og:description" content="${escapeHtml(metaDesc)}" />
      <meta property="og:url" content="${escapeHtml(pageUrl)}" />
      ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
      <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
      ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : ''}
      <link rel="stylesheet" href="../css/styles.css" />
      <script type="application/ld+json">
  ${safeJsonLd(schemaObj)}
      </script>
    </head>
    <body data-base="../">
      <header class="site-header">
        <div class="container header-inner">
          <a href="../index.html" class="brand-link" data-store-name>${escapeHtml(config.storeName)}</a>

          <nav class="site-nav" aria-label="Основная навигация">
            <a href="../index.html">Каталог</a>
            <a href="../index.html#oplata">Как оплатить</a>
            <a href="../about.html">О магазине</a>
            <a href="../contacts.html">Контакты</a>
          </nav>

          <div class="header-actions">
            <a id="header-wa-btn" href="../contacts.html#setup" class="btn btn-primary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span class="header-wa-label">WhatsApp</span>
            </a>
            <button
              id="menu-toggle"
              type="button"
              class="menu-toggle"
              aria-expanded="false"
              aria-controls="mobile-drawer"
              aria-label="Открыть меню"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div id="mobile-drawer" class="mobile-drawer" hidden>
          <div class="container mobile-drawer-links">
            <a href="../index.html">Каталог</a>
            <a href="../index.html#oplata">Как оплатить</a>
            <a href="../about.html">О магазине</a>
            <a href="../contacts.html">Контакты</a>
          </div>
        </div>
      </header>

      <main>
        <div class="container">
          <nav class="breadcrumbs" aria-label="Хлебные крошки">
            <a href="../index.html">Каталог</a>
            <span aria-hidden="true">/</span>
            <span>${escapeHtml(category)}</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page">${escapeHtml(title)}</span>
          </nav>
        </div>

        <section class="pdp-section">
          <div class="container">
            <div class="pdp-layout">
              <div>
                <div class="gallery-main">
                  ${mainImageHtml}
                </div>
                ${thumbsHtml}

                <div class="pdp-description">
                  <h2>Описание товара</h2>
                  <p>${escapeHtml(description)}</p>
                </div>
              </div>

              <aside class="pdp-panel" aria-label="Информация о товаре и заказ">
                <p class="pdp-meta-line">
                  <span>${escapeHtml(category)}</span>
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(conditionLabel)}</span>
                  <span aria-hidden="true">·</span>
                  <span data-city>${escapeHtml(config.city)}</span>
                </p>

                <h1 class="pdp-title">${escapeHtml(title)}</h1>

                <div class="pdp-price-row">
                  <span class="pdp-price">${escapeHtml(priceText)}</span>
                  <span class="status-text ${isSold ? 'status-sold' : 'status-available'}">${escapeHtml(statusLabel)}</span>
                </div>

                <dl class="pdp-specs">
                  <div class="pdp-spec-row">
                    <dt>Состояние</dt>
                    <dd>${escapeHtml(conditionLabel)}</dd>
                  </div>
                  <div class="pdp-spec-row">
                    <dt>Город</dt>
                    <dd data-city>${escapeHtml(config.city)}</dd>
                  </div>
                  <div class="pdp-spec-row">
                    <dt>Добавлено</dt>
                    <dd>${escapeHtml(formatDate(createdAt))}</dd>
                  </div>
                </dl>

                <div class="pdp-cta-group">
                  <a
                    id="pdp-wa-btn"
                    href="https://wa.me/"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-product-title="${escapeHtml(title)}"
                    class="btn btn-primary"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span>${isSold ? 'Уточнить в WhatsApp' : 'Написать в WhatsApp'}</span>
                  </a>
                  <a href="../index.html" class="btn btn-secondary">Вернуться в каталог</a>
                </div>

                <div id="wa-setup-notice" class="notice-inline" hidden></div>

                <div class="pdp-payment-note">
                  <strong>Как оплатить</strong>
                  Оплата по договорённости: переводом на карту или по СБП. Реквизиты отправляются только в личной переписке после согласования.
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <div class="container footer-inner">
          <div>
            <span data-store-name>${escapeHtml(config.storeName)}</span>
            <span aria-hidden="true"> · </span>
            <span data-city>${escapeHtml(config.city)}</span>
          </div>
          <div class="footer-links">
            <a href="../index.html">Каталог</a>
            <a href="../about.html">О магазине</a>
            <a href="../contacts.html">Контакты</a>
          </div>
        </div>
      </footer>

      <script src="../config.js"></script>
      <script src="../js/site.js"></script>
      <script src="../js/product.js"></script>
    </body>
  </html>
  `;
  }

  function buildSitemap(products, config) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: `${config.siteUrl}/`, lastmod: today, priority: '1.0' },
      { loc: `${config.siteUrl}/about.html`, lastmod: today, priority: '0.6' },
      { loc: `${config.siteUrl}/contacts.html`, lastmod: today, priority: '0.7' }
    ];

    for (const product of products) {
      urls.push({
        loc: `${config.siteUrl}/tovar/${product.slug}.html`,
        lastmod: product.createdAt || today,
        priority: '0.8'
      });
    }

    const entries = urls
      .map(
        (u) => `  <url>
      <loc>${escapeHtml(u.loc)}</loc>
      <lastmod>${escapeHtml(u.lastmod)}</lastmod>
      <priority>${escapeHtml(u.priority)}</priority>
    </url>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries}
  </urlset>
  `;
  }

  function buildRobots(config) {
    return `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
  }


  var api = {
    CSP_POLICY: CSP_POLICY,
    resolveSiteUrl: resolveSiteUrl,
    normalizeConfig: normalizeConfig,
    slugify: slugify,
    escapeHtml: escapeHtml,
    renderProductPage: renderProductPage,
    buildSitemap: buildSitemap,
    buildRobots: buildRobots
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PageGen = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
