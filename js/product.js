(function () {
  'use strict';

  var utils = window.SiteUtils;

  function initGallery() {
    var mainImg = document.getElementById('gallery-main-img');
    var thumbButtons = document.querySelectorAll('.thumb-btn');
    if (!mainImg || thumbButtons.length === 0) return;

    thumbButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var src = btn.getAttribute('data-src');
        var alt = btn.getAttribute('data-alt');
        if (!src || !utils.isSafeRelativePath(src)) return;

        mainImg.src = utils.resolvePath(src);
        if (alt) {
          mainImg.alt = alt;
        }

        thumbButtons.forEach(function (b) {
          b.setAttribute('aria-current', b === btn ? 'true' : 'false');
        });
      });
    });
  }

  function initProductWhatsApp() {
    var btn = document.getElementById('pdp-wa-btn');
    if (!btn) return;

    var title = btn.getAttribute('data-product-title') || document.title;
    var pageUrl = window.location.href;
    var message =
      'Здравствуйте! Меня интересует товар: ' + title + ' (' + pageUrl + ')';

    utils.wireWhatsAppButton(btn, message, 'wa-setup-notice');
  }

  function init() {
    initGallery();
    initProductWhatsApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
