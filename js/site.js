(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};

  function getBasePath() {
    if (!document.body) return '';
    return document.body.getAttribute('data-base') || '';
  }

  function isSafeRelativePath(path) {
    if (typeof path !== 'string' || !path.trim()) return false;
    var trimmed = path.trim();
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
    if (trimmed.indexOf('//') === 0) return false;
    if (trimmed.indexOf('..') !== -1) return false;
    return true;
  }

  function resolvePath(relativePath) {
    if (!isSafeRelativePath(relativePath)) return '';
    return getBasePath() + relativePath.replace(/^\/+/, '');
  }

  function getWhatsAppDigits() {
    var raw = String(cfg.whatsappNumber || '');
    return raw.replace(/\D/g, '');
  }

  function buildWhatsAppUrl(message) {
    var digits = getWhatsAppDigits();
    if (digits.length < 10) {
      return null;
    }
    // Без заготовленного текста: покупатель сам пишет первое сообщение.
    return 'https://wa.me/' + digits;
  }

  function showNotice(targetId, text) {
    var notice = document.getElementById(targetId);
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
  }

  function wireWhatsAppButton(buttonEl, message, noticeId) {
    if (!buttonEl) return;
    var url = buildWhatsAppUrl(message);
    if (url) {
      buttonEl.setAttribute('href', url);
      buttonEl.setAttribute('target', '_blank');
      buttonEl.setAttribute('rel', 'noopener noreferrer');
      return;
    }
    buttonEl.setAttribute('href', getBasePath() + 'contacts.html#setup');
    buttonEl.removeAttribute('target');
    buttonEl.addEventListener('click', function (event) {
      if (noticeId && document.getElementById(noticeId)) {
        event.preventDefault();
        showNotice(
          noticeId,
          'Номер WhatsApp ещё не указан. Впишите его в файле config.js (поле whatsappNumber).'
        );
      }
    });
  }

  function formatPrice(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 'По договорённости';
    return new Intl.NumberFormat('ru-RU').format(Math.round(num)) + ' ₽';
  }

  function formatDate(isoDate) {
    if (typeof isoDate !== 'string' || !isoDate) return '';
    var parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }

  function attachImageFallback(imgEl, fallbackLabel) {
    if (!imgEl) return;
    imgEl.addEventListener('error', function () {
      var parent = imgEl.parentNode;
      if (!parent) return;
      var box = document.createElement('div');
      box.className = 'img-fallback';
      box.textContent = fallbackLabel || 'Фото временно недоступно';
      parent.replaceChild(box, imgEl);
    });
  }

  function initCommonUI() {
    var storeName = cfg.storeName || 'Дом и Мастерская';
    var city = cfg.city || 'Сухум';
    var cityIn = cfg.cityIn || city;
    var hours = cfg.hours || 'Ежедневно с 09:00 до 20:00';
    var digits = getWhatsAppDigits();

    document.querySelectorAll('[data-store-name]').forEach(function (el) {
      el.textContent = storeName;
    });

    document.querySelectorAll('[data-city]').forEach(function (el) {
      el.textContent = city;
    });

    document.querySelectorAll('[data-city-in]').forEach(function (el) {
      el.textContent = cityIn;
    });

    document.querySelectorAll('[data-hours]').forEach(function (el) {
      el.textContent = hours;
    });

    document.querySelectorAll('[data-whatsapp-display]').forEach(function (el) {
      el.textContent = digits.length >= 10 ? '+' + digits : 'пока не указан';
    });

    var headerWa = document.getElementById('header-wa-btn');
    if (headerWa) {
      wireWhatsAppButton(
        headerWa,
        'Здравствуйте! Подскажите, пожалуйста, по наличию товаров в каталоге.',
        'wa-setup-notice'
      );
    }

    var generalWa = document.querySelectorAll('[data-wa-general]');
    generalWa.forEach(function (el) {
      wireWhatsAppButton(
        el,
        'Здравствуйте! Пишу с сайта «' + storeName + '» по поводу товара.',
        'wa-setup-notice'
      );
    });

    var menuToggle = document.getElementById('menu-toggle');
    var mobileDrawer = document.getElementById('mobile-drawer');
    if (menuToggle && mobileDrawer) {
      menuToggle.addEventListener('click', function () {
        var expanded = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        mobileDrawer.hidden = expanded;
      });
    }

    document.querySelectorAll('img[data-fallback]').forEach(function (imgEl) {
      attachImageFallback(imgEl, imgEl.getAttribute('alt'));
    });
  }

  window.SiteUtils = {
    getBasePath: getBasePath,
    isSafeRelativePath: isSafeRelativePath,
    resolvePath: resolvePath,
    buildWhatsAppUrl: buildWhatsAppUrl,
    wireWhatsAppButton: wireWhatsAppButton,
    formatPrice: formatPrice,
    formatDate: formatDate,
    attachImageFallback: attachImageFallback
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommonUI);
  } else {
    initCommonUI();
  }
})();
