/**
 * Админ-панель каталога. Работает прямо в браузере и сохраняет изменения
 * в репозиторий GitHub (коммитами) через API с вашим личным токеном.
 * Токен никуда, кроме api.github.com, не отправляется.
 */
(function (root) {
  'use strict';

  var PG = root.PageGen || require('./pagegen.js');
  var MAX_PHOTOS = 8;

  /* ---------- вспомогательные функции ---------- */

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function encodePath(p) {
    return p.split('/').map(encodeURIComponent).join('/');
  }

  /* ---------- клиент GitHub ---------- */

  function GitHub(token, repo, fetchFn) {
    this.token = token;
    this.repo = repo;
    this.fetch = fetchFn || root.fetch.bind(root);
    this.branch = null;
  }

  GitHub.prototype.request = function (method, path, body) {
    var self = this;
    var opts = {
      method: method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + self.token,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return self.fetch('https://api.github.com/repos/' + self.repo + path, opts).then(function (res) {
      if (res.status === 404 && method === 'GET') return null;
      if (!res.ok) {
        var err = new Error('GitHub: HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  };

  GitHub.prototype.getRepo = function () {
    return this.request('GET', '');
  };

  GitHub.prototype.getFile = function (path) {
    return this.request('GET', '/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(this.branch));
  };

  GitHub.prototype.putFile = function (path, b64, message, sha) {
    var body = { message: message, content: b64, branch: this.branch };
    if (sha) body.sha = sha;
    return this.request('PUT', '/contents/' + encodePath(path), body);
  };

  GitHub.prototype.deleteFile = function (path, message, sha) {
    return this.request('DELETE', '/contents/' + encodePath(path), {
      message: message,
      sha: sha,
      branch: this.branch
    });
  };

  /* ---------- операции с магазином ---------- */

  function Shop(gh, rawConfig, log) {
    this.gh = gh;
    this.config = PG.normalizeConfig(rawConfig);
    this.categories = (rawConfig && rawConfig.categories) || [];
    this.log = log || function () {};
    this.products = [];
    this.productsSha = null;
  }

  Shop.prototype.init = function () {
    var self = this;
    return self.gh.getRepo().then(function (repo) {
      if (!repo) {
        var e = new Error('repo not found');
        e.status = 404;
        throw e;
      }
      if (repo.permissions && !repo.permissions.push) {
        var e2 = new Error('no push');
        e2.status = 403;
        throw e2;
      }
      self.gh.branch = repo.default_branch;
      return self.reload();
    });
  };

  Shop.prototype.reload = function () {
    var self = this;
    return self.gh.getFile('products.json').then(function (file) {
      if (!file) {
        self.products = [];
        self.productsSha = null;
        return;
      }
      var data = JSON.parse(b64ToUtf8(file.content));
      if (!Array.isArray(data)) throw new Error('products.json должен быть списком');
      self.products = data;
      self.productsSha = file.sha;
    });
  };

  // Записывает текстовый файл; если содержимое не изменилось, ничего не делает.
  Shop.prototype.upsertText = function (path, text, message) {
    var gh = this.gh;
    var b64 = utf8ToB64(text);
    return gh.getFile(path).then(function (existing) {
      if (existing && existing.content && String(existing.content).replace(/\s/g, '') === b64) return false;
      return gh.putFile(path, b64, message, existing && existing.sha).then(function () {
        return true;
      });
    });
  };

  Shop.prototype.saveProductsJson = function (message) {
    var self = this;
    var text = JSON.stringify(self.products, null, 2) + '\n';
    return self.gh.putFile('products.json', utf8ToB64(text), message, self.productsSha).then(function (res) {
      self.productsSha = res && res.content ? res.content.sha : self.productsSha;
    });
  };

  Shop.prototype.removeFileIfExists = function (path, message) {
    var gh = this.gh;
    return gh.getFile(path).then(function (existing) {
      if (!existing) return false;
      return gh.deleteFile(path, message, existing.sha).then(function () {
        return true;
      });
    });
  };

  Shop.prototype.isPhotoUsedElsewhere = function (photo, exceptSlug) {
    return this.products.some(function (p) {
      return p.slug !== exceptSlug && Array.isArray(p.photos) && p.photos.indexOf(photo) !== -1;
    });
  };

  Shop.prototype.uniqueSlug = function (title) {
    var base = PG.slugify(title);
    var taken = {};
    this.products.forEach(function (p) {
      taken[p.slug] = true;
    });
    var slug = base;
    var n = 2;
    while (taken[slug]) slug = base + '-' + n++;
    return slug;
  };

  Shop.prototype.validate = function (p) {
    if (!p.title || !p.title.trim()) return 'Введите название товара.';
    if (this.categories.length && this.categories.indexOf(p.category) === -1) return 'Выберите категорию.';
    if (!Number.isFinite(p.price) || p.price < 0) return 'Цена должна быть числом от 0.';
    if (p.condition !== 'новое' && p.condition !== 'б/у') return 'Выберите состояние.';
    if (p.status !== 'в наличии' && p.status !== 'продано') return 'Выберите статус.';
    if ((p.photos || []).length > MAX_PHOTOS) return 'Не больше ' + MAX_PHOTOS + ' фото.';
    return '';
  };

  /**
   * data: {title, category, price, condition, status, description}
   * keepPhotos: пути уже загруженных фото, которые остаются
   * newPhotos: [{b64}] новые фото в формате JPEG (base64 без префикса)
   * slug: если редактируем существующий товар
   */
  Shop.prototype.saveProduct = function (data, keepPhotos, newPhotos, slug) {
    var self = this;
    var existing = slug
      ? self.products.filter(function (p) {
          return p.slug === slug;
        })[0]
      : null;
    if (slug && !existing) return Promise.reject(new Error('Товар не найден, обновите страницу.'));

    var product = {
      id: existing ? existing.id : self.products.reduce(function (m, p) { return Math.max(m, Number(p.id) || 0); }, 0) + 1,
      slug: existing ? existing.slug : self.uniqueSlug(data.title),
      title: data.title.trim(),
      category: data.category,
      price: Math.round(data.price),
      condition: data.condition,
      description: String(data.description || '').trim(),
      photos: keepPhotos.slice(),
      createdAt: existing ? existing.createdAt : todayIso(),
      status: data.status
    };

    var err = self.validate({ title: product.title, category: product.category, price: product.price, condition: product.condition, status: product.status, photos: product.photos.concat(newPhotos.map(function () { return 'x'; })) });
    if (err) return Promise.reject(new Error(err));

    var removed = existing
      ? (existing.photos || []).filter(function (ph) {
          return product.photos.indexOf(ph) === -1;
        })
      : [];

    var chain = Promise.resolve();
    newPhotos.forEach(function (photo, i) {
      var name = 'images/' + product.slug + '-' + Date.now().toString(36) + i + '.jpg';
      chain = chain.then(function () {
        self.log('Загружаю фото ' + (i + 1) + ' из ' + newPhotos.length + '…');
        return self.gh.putFile(name, photo.b64, 'Фото: ' + product.title).then(function () {
          product.photos.push(name);
        });
      });
    });

    return chain
      .then(function () {
        var idx = self.products.indexOf(existing);
        if (idx >= 0) self.products[idx] = product;
        else self.products.push(product);
        self.log('Сохраняю список товаров…');
        return self.saveProductsJson((existing ? 'Изменён товар: ' : 'Добавлен товар: ') + product.title);
      })
      .then(function () {
        self.log('Создаю страницу товара…');
        return self.upsertText('tovar/' + product.slug + '.html', PG.renderProductPage(product, self.config), 'Страница товара: ' + product.title);
      })
      .then(function () {
        return self.upsertText('sitemap.xml', PG.buildSitemap(self.products, self.config), 'Обновлена карта сайта');
      })
      .then(function () {
        var rm = Promise.resolve();
        removed.forEach(function (ph) {
          if (self.isPhotoUsedElsewhere(ph, product.slug)) return;
          rm = rm.then(function () {
            return self.removeFileIfExists(ph, 'Удалено фото');
          });
        });
        return rm;
      })
      .then(function () {
        return product;
      });
  };

  Shop.prototype.setStatus = function (slug, status) {
    var self = this;
    var p = self.products.filter(function (x) {
      return x.slug === slug;
    })[0];
    if (!p) return Promise.reject(new Error('Товар не найден, обновите страницу.'));
    p.status = status;
    return self
      .saveProductsJson('Статус товара «' + p.title + '»: ' + status)
      .then(function () {
        return self.upsertText('tovar/' + p.slug + '.html', PG.renderProductPage(p, self.config), 'Страница товара: ' + p.title);
      });
  };

  Shop.prototype.deleteProduct = function (slug) {
    var self = this;
    var p = self.products.filter(function (x) {
      return x.slug === slug;
    })[0];
    if (!p) return Promise.reject(new Error('Товар не найден, обновите страницу.'));
    self.products = self.products.filter(function (x) {
      return x !== p;
    });
    return self
      .saveProductsJson('Удалён товар: ' + p.title)
      .then(function () {
        return self.removeFileIfExists('tovar/' + p.slug + '.html', 'Удалена страница товара');
      })
      .then(function () {
        var rm = Promise.resolve();
        (p.photos || []).forEach(function (ph) {
          if (self.isPhotoUsedElsewhere(ph, p.slug)) return;
          rm = rm.then(function () {
            return self.removeFileIfExists(ph, 'Удалено фото');
          });
        });
        return rm;
      })
      .then(function () {
        return self.upsertText('sitemap.xml', PG.buildSitemap(self.products, self.config), 'Обновлена карта сайта');
      });
  };

  // Пересоздаёт страницы всех товаров, sitemap.xml и robots.txt (после смены адреса/города в config.js).
  Shop.prototype.rebuildAll = function () {
    var self = this;
    var chain = Promise.resolve(0);
    self.products.forEach(function (p) {
      chain = chain.then(function (changed) {
        self.log('Страница: ' + p.title);
        return self.upsertText('tovar/' + p.slug + '.html', PG.renderProductPage(p, self.config), 'Обновлена страница: ' + p.title).then(function (c) {
          return changed + (c ? 1 : 0);
        });
      });
    });
    return chain
      .then(function (changed) {
        return self.upsertText('sitemap.xml', PG.buildSitemap(self.products, self.config), 'Обновлена карта сайта').then(function (c) {
          return changed + (c ? 1 : 0);
        });
      })
      .then(function (changed) {
        return self.upsertText('robots.txt', PG.buildRobots(self.config), 'Обновлён robots.txt').then(function (c) {
          return changed + (c ? 1 : 0);
        });
      });
  };

  var api = { GitHub: GitHub, Shop: Shop, utf8ToB64: utf8ToB64, b64ToUtf8: b64ToUtf8 };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }
  root.ShopAdmin = api;

  /* ====================== интерфейс (только в браузере) ====================== */

  var cfg = root.SITE_CONFIG || {};
  var $ = function (id) {
    return document.getElementById(id);
  };
  var shop = null;
  var busy = false;
  var editing = null; // {slug|null, keep:[paths], files:[File]}

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function log(msg, isError) {
    var box = $('log');
    box.textContent = msg;
    box.hidden = !msg;
    box.classList.toggle('adm-error', !!isError);
  }

  function explain(e) {
    if (e && e.status === 401) return 'Токен неверный или просрочен. Создайте новый токен.';
    if (e && (e.status === 403 || e.status === 404)) return 'Нет доступа к репозиторию. Проверьте название репозитория и что у токена есть право «Contents: Read and write» именно для него.';
    if (e && (e.status === 409 || e.status === 422)) return 'Файлы на GitHub изменились. Обновите страницу и повторите.';
    return (e && e.message) || 'Неизвестная ошибка.';
  }

  function setBusy(v) {
    busy = v;
    document.querySelectorAll('button').forEach(function (b) {
      if (v) b.setAttribute('disabled', 'disabled');
      else b.removeAttribute('disabled');
    });
  }

  function run(label, fn) {
    if (busy) return Promise.resolve();
    setBusy(true);
    log(label);
    return Promise.resolve()
      .then(fn)
      .then(
        function (msg) {
          setBusy(false);
          log(msg || 'Готово. Сайт обновится в течение 1–2 минут.');
        },
        function (e) {
          setBusy(false);
          log(explain(e), true);
        }
      );
  }

  function money(n) {
    return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
  }

  function renderList() {
    var list = $('product-list');
    list.textContent = '';
    var items = shop.products.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    $('list-empty').hidden = items.length > 0;
    items.forEach(function (p) {
      var row = el('div', 'adm-item');
      var sold = p.status === 'продано';
      if (p.photos && p.photos[0] && /^[A-Za-z0-9._\-/]+$/.test(p.photos[0])) {
        var img = el('img', 'adm-thumb');
        img.src = p.photos[0];
        img.alt = '';
        img.addEventListener('error', function () {
          img.hidden = true;
        });
        row.appendChild(img);
      }
      var info = el('div', 'adm-info');
      info.appendChild(el('strong', null, p.title));
      info.appendChild(el('span', 'adm-muted', p.category + ' · ' + p.condition + ' · ' + money(p.price) + ' · ' + (sold ? 'продано' : 'в наличии')));
      row.appendChild(info);

      var actions = el('div', 'adm-actions');
      var edit = el('button', 'btn btn-secondary btn-sm', 'Изменить');
      edit.type = 'button';
      edit.addEventListener('click', function () {
        openEditor(p);
      });
      var toggle = el('button', 'btn btn-secondary btn-sm', sold ? 'Вернуть в наличие' : 'Отметить проданным');
      toggle.type = 'button';
      toggle.addEventListener('click', function () {
        run('Меняю статус…', function () {
          return shop.setStatus(p.slug, sold ? 'в наличии' : 'продано').then(renderList);
        });
      });
      var del = el('button', 'btn btn-secondary btn-sm adm-danger', 'Удалить');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!root.confirm('Удалить товар «' + p.title + '» навсегда?')) return;
        run('Удаляю товар…', function () {
          return shop.deleteProduct(p.slug).then(renderList);
        });
      });
      actions.appendChild(edit);
      actions.appendChild(toggle);
      actions.appendChild(del);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function renderPhotos() {
    var grid = $('photo-grid');
    grid.textContent = '';
    editing.keep.forEach(function (path, i) {
      var cell = el('div', 'adm-photo');
      var img = el('img');
      img.src = path;
      img.alt = '';
      cell.appendChild(img);
      var rm = el('button', 'adm-photo-x', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Убрать фото');
      rm.addEventListener('click', function () {
        editing.keep.splice(i, 1);
        renderPhotos();
      });
      cell.appendChild(rm);
      grid.appendChild(cell);
    });
    editing.files.forEach(function (file, i) {
      var cell = el('div', 'adm-photo');
      var img = el('img');
      var url = URL.createObjectURL(file);
      img.src = url;
      img.alt = '';
      img.addEventListener('load', function () {
        URL.revokeObjectURL(url);
      });
      cell.appendChild(img);
      var rm = el('button', 'adm-photo-x', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Убрать фото');
      rm.addEventListener('click', function () {
        editing.files.splice(i, 1);
        renderPhotos();
      });
      cell.appendChild(rm);
      grid.appendChild(cell);
    });
  }

  function openEditor(p) {
    editing = { slug: p ? p.slug : null, keep: p ? (p.photos || []).slice() : [], files: [] };
    $('editor-title').textContent = p ? 'Изменить товар' : 'Новый товар';
    $('f-title').value = p ? p.title : '';
    $('f-price').value = p ? p.price : '';
    $('f-condition').value = p ? p.condition : 'новое';
    $('f-status').value = p ? p.status : 'в наличии';
    $('f-desc').value = p ? p.description : '';
    var sel = $('f-category');
    sel.textContent = '';
    var cats = shop.categories.slice();
    if (p && cats.indexOf(p.category) === -1) cats.push(p.category);
    cats.forEach(function (c) {
      var o = el('option', null, c);
      o.value = c;
      sel.appendChild(o);
    });
    if (p) sel.value = p.category;
    $('f-files').value = '';
    renderPhotos();
    $('panel').hidden = true;
    $('editor').hidden = false;
    log('');
    $('f-title').focus();
  }

  function closeEditor() {
    editing = null;
    $('editor').hidden = true;
    $('panel').hidden = false;
  }

  // Уменьшает фото до 1600 px и сохраняет как JPEG (≈150–300 КБ вместо нескольких МБ).
  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          function (blob) {
            if (!blob) return reject(new Error('Не удалось обработать фото.'));
            var reader = new FileReader();
            reader.onload = function () {
              resolve({ b64: String(reader.result).split(',')[1] });
            };
            reader.onerror = function () {
              reject(new Error('Не удалось прочитать фото.'));
            };
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Файл «' + file.name + '» не похож на картинку.'));
      };
      img.src = url;
    });
  }

  function save() {
    var data = {
      title: $('f-title').value,
      category: $('f-category').value,
      price: Number($('f-price').value),
      condition: $('f-condition').value,
      status: $('f-status').value,
      description: $('f-desc').value
    };
    if ($('f-price').value === '') data.price = NaN;
    var slug = editing.slug;
    var keep = editing.keep.slice();
    var files = editing.files.slice();
    var problem = shop.validate({ title: data.title, category: data.category, price: data.price, condition: data.condition, status: data.status, photos: keep.concat(files) });
    if (problem) return log(problem, true);

    run('Подготавливаю фото…', function () {
      return Promise.all(files.map(prepareImage))
        .then(function (prepared) {
          return shop.saveProduct(data, keep, prepared, slug);
        })
        .then(function () {
          closeEditor();
          renderList();
        });
    });
  }

  function login() {
    var repo = $('repo-input').value.trim();
    var token = $('token-input').value.trim();
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) return log('Репозиторий пишется так: логин/название', true);
    if (!token) return log('Вставьте токен доступа.', true);
    var gh = new GitHub(token, repo);
    shop = new Shop(gh, cfg, function (m) {
      log(m);
    });
    run('Проверяю доступ…', function () {
      return shop.init().then(function () {
        try {
          root.sessionStorage.setItem('shopAdminToken', token);
          root.localStorage.setItem('shopAdminRepo', repo);
        } catch (e) {
          /* хранилище недоступно: просто не запоминаем */
        }
        $('token-input').value = '';
        $('login').hidden = true;
        $('panel').hidden = false;
        $('logout-btn').hidden = false;
        $('repo-info').textContent = repo + ' · ветка ' + gh.branch;
        renderList();
        return '';
      });
    });
  }

  function logout() {
    try {
      root.sessionStorage.removeItem('shopAdminToken');
    } catch (e) {
      /* ignore */
    }
    shop = null;
    editing = null;
    $('panel').hidden = true;
    $('editor').hidden = true;
    $('login').hidden = false;
    $('logout-btn').hidden = true;
    log('');
  }

  function init() {
    var savedRepo = '';
    var savedToken = '';
    try {
      savedRepo = root.localStorage.getItem('shopAdminRepo') || '';
      savedToken = root.sessionStorage.getItem('shopAdminToken') || '';
    } catch (e) {
      /* ignore */
    }
    $('repo-input').value = cfg.githubRepo || savedRepo;
    $('token-input').value = savedToken;

    $('login-btn').addEventListener('click', login);
    $('logout-btn').addEventListener('click', logout);
    $('add-btn').addEventListener('click', function () {
      openEditor(null);
    });
    $('cancel-btn').addEventListener('click', closeEditor);
    $('save-btn').addEventListener('click', save);
    $('rebuild-btn').addEventListener('click', function () {
      run('Обновляю страницы сайта…', function () {
        return shop.rebuildAll().then(function (n) {
          return 'Готово. Изменено файлов: ' + n + '. Сайт обновится в течение 1–2 минут.';
        });
      });
    });
    $('f-files').addEventListener('change', function (e) {
      var added = Array.prototype.slice.call(e.target.files || []);
      added.forEach(function (f) {
        if (editing.keep.length + editing.files.length < MAX_PHOTOS) editing.files.push(f);
      });
      e.target.value = '';
      renderPhotos();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
