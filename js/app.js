(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var utils = window.SiteUtils;

  var state = {
    products: [],
    search: '',
    category: 'all',
    minPrice: '',
    maxPrice: '',
    sort: 'newest'
  };

  var elements = {
    grid: null,
    count: null,
    empty: null,
    status: null,
    searchInput: null,
    categorySelect: null,
    categoryTabs: null,
    minPriceInput: null,
    maxPriceInput: null,
    sortSelect: null,
    resetBtn: null,
    emptyResetBtn: null
  };

  function isValidSlug(slug) {
    return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug);
  }

  function normalizeProduct(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!isValidSlug(raw.slug)) return null;
    var photos = Array.isArray(raw.photos)
      ? raw.photos.filter(function (p) {
          return utils.isSafeRelativePath(p);
        })
      : [];

    return {
      id: raw.id,
      slug: raw.slug,
      title: String(raw.title || 'Без названия'),
      category: String(raw.category || 'Бытовые товары'),
      price: Number(raw.price) || 0,
      condition: String(raw.condition || 'новое'),
      description: String(raw.description || ''),
      photos: photos,
      createdAt: String(raw.createdAt || ''),
      status: String(raw.status || 'в наличии')
    };
  }

  function populateCategories(products) {
    var fromConfig = Array.isArray(cfg.categories) ? cfg.categories.slice() : [];
    products.forEach(function (item) {
      if (fromConfig.indexOf(item.category) === -1) {
        fromConfig.push(item.category);
      }
    });

    if (elements.categorySelect) {
      while (elements.categorySelect.options.length > 1) {
        elements.categorySelect.remove(1);
      }
      fromConfig.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        elements.categorySelect.appendChild(opt);
      });
    }

    if (elements.categoryTabs) {
      elements.categoryTabs.textContent = '';

      var allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'cat-tab';
      allBtn.setAttribute('data-category', 'all');
      allBtn.setAttribute('aria-pressed', state.category === 'all' ? 'true' : 'false');
      allBtn.textContent = 'Все товары';
      elements.categoryTabs.appendChild(allBtn);

      fromConfig.forEach(function (cat) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cat-tab';
        btn.setAttribute('data-category', cat);
        btn.setAttribute('aria-pressed', state.category === cat ? 'true' : 'false');
        btn.textContent = cat;
        elements.categoryTabs.appendChild(btn);
      });
    }
  }

  function updateCategoryTabPressed() {
    if (!elements.categoryTabs) return;
    var buttons = elements.categoryTabs.querySelectorAll('.cat-tab');
    buttons.forEach(function (btn) {
      var cat = btn.getAttribute('data-category');
      btn.setAttribute('aria-pressed', cat === state.category ? 'true' : 'false');
    });
  }

  function filterAndSort() {
    var query = state.search.trim().toLowerCase();
    var minVal = state.minPrice !== '' ? Number(state.minPrice) : null;
    var maxVal = state.maxPrice !== '' ? Number(state.maxPrice) : null;

    var filtered = state.products.filter(function (item) {
      if (state.category !== 'all' && item.category !== state.category) {
        return false;
      }
      if (query && item.title.toLowerCase().indexOf(query) === -1) {
        return false;
      }
      if (minVal !== null && Number.isFinite(minVal) && item.price < minVal) {
        return false;
      }
      if (maxVal !== null && Number.isFinite(maxVal) && item.price > maxVal) {
        return false;
      }
      return true;
    });

    filtered.sort(function (a, b) {
      if (state.sort === 'price-asc') {
        return a.price - b.price;
      }
      if (state.sort === 'price-desc') {
        return b.price - a.price;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    return filtered;
  }

  function createProductCard(item) {
    var isSold = item.status.toLowerCase() === 'продано';
    var pageHref = 'tovar/' + encodeURIComponent(item.slug) + '.html';

    var article = document.createElement('article');
    article.className = 'product-card';

    var mediaLink = document.createElement('a');
    mediaLink.className = isSold ? 'card-media is-sold' : 'card-media';
    mediaLink.setAttribute('href', pageHref);
    mediaLink.setAttribute('aria-label', item.title);

    if (item.photos.length > 0) {
      var img = document.createElement('img');
      img.src = utils.resolvePath(item.photos[0]);
      img.alt = item.title + ' — ' + item.category + ', ' + item.condition;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 800;
      img.height = 600;
      utils.attachImageFallback(img, item.title);
      mediaLink.appendChild(img);
    } else {
      var fallback = document.createElement('div');
      fallback.className = 'img-fallback';
      fallback.textContent = item.title;
      mediaLink.appendChild(fallback);
    }

    var body = document.createElement('div');
    body.className = 'card-body';

    var meta = document.createElement('div');
    meta.className = 'card-meta';

    var catSpan = document.createElement('span');
    catSpan.textContent = item.category;

    var sep = document.createElement('span');
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';

    var condSpan = document.createElement('span');
    condSpan.textContent = item.condition === 'б/у' ? 'Б/у' : 'Новое';

    meta.appendChild(catSpan);
    meta.appendChild(sep);
    meta.appendChild(condSpan);

    var titleHeading = document.createElement('h3');
    titleHeading.className = 'card-title';
    var titleLink = document.createElement('a');
    titleLink.setAttribute('href', pageHref);
    titleLink.textContent = item.title;
    titleHeading.appendChild(titleLink);

    var footer = document.createElement('div');
    footer.className = 'card-footer';

    var priceSpan = document.createElement('span');
    priceSpan.className = 'card-price';
    priceSpan.textContent = utils.formatPrice(item.price);

    var statusSpan = document.createElement('span');
    statusSpan.className = 'status-text ' + (isSold ? 'status-sold' : 'status-available');
    statusSpan.textContent = isSold ? 'Продано' : 'В наличии';

    footer.appendChild(priceSpan);
    footer.appendChild(statusSpan);

    body.appendChild(meta);
    body.appendChild(titleHeading);
    body.appendChild(footer);

    article.appendChild(mediaLink);
    article.appendChild(body);

    return article;
  }

  function render() {
    if (!elements.grid) return;

    var items = filterAndSort();
    elements.grid.textContent = '';

    if (elements.count) {
      elements.count.textContent = 'Найдено товаров: ' + items.length;
    }

    if (items.length === 0) {
      if (elements.empty) elements.empty.hidden = false;
      return;
    }

    if (elements.empty) elements.empty.hidden = true;

    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      fragment.appendChild(createProductCard(item));
    });
    elements.grid.appendChild(fragment);
  }

  function resetFilters() {
    state.search = '';
    state.category = 'all';
    state.minPrice = '';
    state.maxPrice = '';
    state.sort = 'newest';

    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.categorySelect) elements.categorySelect.value = 'all';
    if (elements.minPriceInput) elements.minPriceInput.value = '';
    if (elements.maxPriceInput) elements.maxPriceInput.value = '';
    if (elements.sortSelect) elements.sortSelect.value = 'newest';

    updateCategoryTabPressed();
    render();
  }

  function bindEvents() {
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', function (e) {
        state.search = e.target.value;
        render();
      });
    }

    if (elements.categorySelect) {
      elements.categorySelect.addEventListener('change', function (e) {
        state.category = e.target.value;
        updateCategoryTabPressed();
        render();
      });
    }

    if (elements.categoryTabs) {
      elements.categoryTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.cat-tab');
        if (!btn) return;
        state.category = btn.getAttribute('data-category') || 'all';
        if (elements.categorySelect) {
          elements.categorySelect.value = state.category;
        }
        updateCategoryTabPressed();
        render();
      });
    }

    if (elements.minPriceInput) {
      elements.minPriceInput.addEventListener('input', function (e) {
        state.minPrice = e.target.value;
        render();
      });
    }

    if (elements.maxPriceInput) {
      elements.maxPriceInput.addEventListener('input', function (e) {
        state.maxPrice = e.target.value;
        render();
      });
    }

    if (elements.sortSelect) {
      elements.sortSelect.addEventListener('change', function (e) {
        state.sort = e.target.value;
        render();
      });
    }

    if (elements.resetBtn) {
      elements.resetBtn.addEventListener('click', resetFilters);
    }

    if (elements.emptyResetBtn) {
      elements.emptyResetBtn.addEventListener('click', resetFilters);
    }
  }

  function loadProducts() {
    if (elements.status) {
      elements.status.textContent = 'Загрузка каталога…';
      elements.status.hidden = false;
    }

    fetch('products.json')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) {
          throw new Error('Invalid products format');
        }
        state.products = data.map(normalizeProduct).filter(Boolean);
        populateCategories(state.products);
        if (elements.status) elements.status.hidden = true;
        render();
      })
      .catch(function () {
        if (elements.status) {
          elements.status.textContent =
            'Не удалось загрузить каталог товаров. Если вы открыли файл напрямую с диска, запустите локальный сервер или откройте сайт на GitHub Pages.';
          elements.status.hidden = false;
        }
      });
  }

  function init() {
    elements.grid = document.getElementById('product-grid');
    if (!elements.grid) return;

    elements.count = document.getElementById('catalog-count');
    elements.empty = document.getElementById('catalog-empty');
    elements.status = document.getElementById('catalog-status');
    elements.searchInput = document.getElementById('filter-search');
    elements.categorySelect = document.getElementById('filter-category');
    elements.categoryTabs = document.getElementById('category-tabs');
    elements.minPriceInput = document.getElementById('filter-price-min');
    elements.maxPriceInput = document.getElementById('filter-price-max');
    elements.sortSelect = document.getElementById('filter-sort');
    elements.resetBtn = document.getElementById('filter-reset');
    elements.emptyResetBtn = document.getElementById('empty-reset');

    bindEvents();
    loadProducts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
