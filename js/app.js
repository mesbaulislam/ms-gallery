/* app.js - boot (PIN lock), cached scan + background refresh, key routing. ES5 only. */
var App = (function () {
  var CACHE_KEY = 'gallery.cache.v2';

  function init() {
    Settings.load();
    Favorites.load();
    applyTheme();
    StorageMod.init();

    document.addEventListener('keydown', onKey, false);
    document.addEventListener('visibilitychange', onVis, false);

    if (Settings.get('pin')) {
      Lock.show('app', function (ok) {
        if (ok) bootMain();
        /* if cancelled at app lock, Back already exits via default */
      });
    } else {
      bootMain();
    }
  }

  function bootMain() {
    UI.setMode('gallery');
    UI.showScreen('screen-gallery');
    setupActivity();

    /* Show a launch fullscreen ad only after the startup/PIN flow is complete. */
    if (window.MSGalleryAds && typeof window.MSGalleryAds.onAppReady === 'function') {
      window.MSGalleryAds.onAppReady();
    }

    if (Settings.get('startup') === 'last') {
      Gallery.loadLast();
    }

    var cached = loadCache();
    if (cached && cached.length) {
      /* instant open from cache, then silent background refresh */
      Gallery.setPhotos(cached);
      Gallery.render();
      updateSoftkeys();
      backgroundScan();
    } else {
      scanPhotos(function () {
        updateSoftkeys();
      });
    }
    updateSoftkeys();
  }

  /* ---------- scan cache ---------- */
  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      return (c && c.length) ? c : null;
    } catch (e) {
      return null;
    }
  }

  function saveCache(arr) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function signature(arr) {
    var parts = [];
    for (var i = 0; i < arr.length; i++) {
      parts.push(arr[i].store + '|' + arr[i].name + '|' + arr[i].size + '|' + arr[i].date);
    }
    parts.sort();
    return parts.join(';');
  }

  function backgroundScan() {
    if (!StorageMod.supported()) return;
    var before = signature(Gallery.getPhotos());
    StorageMod.scan(null, function (all) {
      saveCache(all);
      if (signature(all) !== before) {
        var keepSel = true;
        Gallery.setPhotos(all);
        Gallery.render();
        updateSoftkeys();
        UI.toast('Gallery updated');
      }
    });
  }

  /* ---------- storage scan (full, with UI) ---------- */
  function scanPhotos(done) {
    if (!StorageMod.supported()) {
      Utils.$('scan').classList.add('hidden');
      var empty = Utils.$('empty');
      empty.classList.remove('hidden');
      empty.querySelector('.empty-title').textContent = 'Storage unavailable';
      empty.querySelector('.empty-text').textContent = 'Device storage is not accessible on this phone.';
      UI.setTitle('Recent Photos', '0 items');
      if (done) done();
      return;
    }
    var scanEl = Utils.$('scan');
    Utils.$('empty').classList.add('hidden');
    scanEl.classList.remove('hidden');
    Utils.$('scan-count').textContent = '';
    StorageMod.scan(
      function (n) {
        Utils.$('scan-count').textContent = n + ' found';
      },
      function (all) {
        scanEl.classList.add('hidden');
        saveCache(all);
        Gallery.setPhotos(all);
        Gallery.render();
        if (done) done();
      }
    );
  }

  function refreshGallery(done) {
    scanPhotos(function () {
      UI.toast('Gallery refreshed');
      if (done) done();
    });
  }

  /* ---------- softkeys ---------- */
  function updateSoftkeys() {
    if (UI.overlayActive()) return;
    if (Lock.isActive()) {
      UI.setSoftkeys('', '', '');
      return;
    }
    if (Gallery.isSelectMode()) {
      if (window.Pick && Pick.active()) {
        /* pick multi-select: Done once photos are checked, Options before */
        var n = Gallery.checkedPhotos().length;
        UI.setSoftkeys('Cancel', '', n > 0 ? 'Done' : 'Options');
      } else {
        UI.setSoftkeys('Cancel', '', 'Actions');
      }
      return;
    }
    var m = UI.getMode();
    if (m === 'gallery') {
      if (window.Pick && Pick.active()) {
        /* pick single-select: Options before choosing, Done after */
        UI.setSoftkeys('Cancel', 'Select', Pick.hasSingle() ? 'Done' : 'Options');
      } else if (Gallery.countAll() === 0) {
        UI.setSoftkeys('Camera', '', 'Options');
      } else {
        UI.setSoftkeys('Camera', 'Open', 'Options');
      }
    } else if (m === 'viewer') {
      if (Viewer.isPreview && Viewer.isPreview()) {
        UI.setSoftkeys('Save', '', 'Discard');
      } else if (Viewer.slideshowActive()) {
        UI.setSoftkeys('', '', '');
      } else {
        UI.setSoftkeys('', '', 'Options');
      }
    } else if (m === 'info') {
      UI.setSoftkeys('', '', '');
    } else if (m === 'about' || m === 'help') {
      UI.setSoftkeys('', '', '');
    } else if (m === 'adjust') {
      UI.setSoftkeys('Apply', '', '');
    } else if (m === 'crop') {
      UI.setSoftkeys('Apply', Editor.cropModeLabel(), '');
    } else if (m === 'edittools') {
      UI.setSoftkeys('Cancel', 'Select', '');
    }
  }

  /* ---------- camera (left softkey) ---------- */
  function openCamera() {
    if (typeof MozActivity === 'undefined') {
      UI.toast('Camera not available');
      return;
    }
    try {
      var act = new MozActivity({ name: 'record', data: { type: 'photos' } });
      act.onsuccess = function () {
        UI.toast('Photo saved');
        setTimeout(function () {
          scanPhotos();
        }, 800);
      };
      act.onerror = function () {
        var name = '';
        try { name = act.error ? act.error.name : ''; } catch (e) {}
        /* User pressed Back in the camera without taking a photo: stay silent. */
        if (name === 'ActivityCanceled' || name === 'USER_ABORT') return;
        UI.toast('Camera not available');
      };
    } catch (e) {
      UI.toast('Camera not available');
    }
  }

  function canShare() {
    return typeof MozActivity !== 'undefined';
  }

  function applyTheme() {
    document.body.className = Settings.get('theme') === 'light' ? 'light' : '';
    if (Viewer.slideshowActive && Viewer.slideshowActive()) {
      document.body.classList.add('slideshow');
    }
  }

  /* ---------- open from file manager ---------- */
  function setupActivity() {
    if (navigator.mozSetMessageHandler) {
      try {
        navigator.mozSetMessageHandler('activity', function (activity) {
          var src = activity.source;
          var data = src && src.data;
          Utils.log('activity:', src && src.name);
          if (src && src.name === 'pick') {
            /* another app wants the user to choose photo(s) from us */
            if (window.Pick && Pick.start) Pick.start(activity);
            return;
          }
          if (data && data.blob) {
            var name = data.filename || data.name || 'image';
            Viewer.openExternal(data.blob, name);
          }
        });
      } catch (e) {
        Utils.log('activity handler failed', e);
      }
    }
  }

  function onVis() {
    if (document.hidden) {
      Viewer.stopSlideshow();
      Gallery.saveLast();
    }
  }

  /* ---------- central key router ---------- */
  function onKey(e) {
    var key = e.key;

    if (Lock.isActive()) {
      if (Lock.handleKey(key)) e.preventDefault();
      return;
    }

    var ae = document.activeElement;
    var inInput = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');

    if (inInput) {
      /* editing a dialog field: Enter/Up/Down finish editing, Left/Right/Backspace edit text */
      if (key === 'Enter') {
        e.preventDefault();
        UI.finishInputEdit();
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        e.preventDefault();
        UI.finishInputEdit(key);
      }
      return;
    }

    if (UI.overlayActive()) {
      if (UI.handleOverlayKey(key)) e.preventDefault();
      return;
    }

    var m = UI.getMode();
    var handled = false;
    if (m === 'viewer') {
      handled = Viewer.handleKey(key);
    } else if (m === 'info') {
      handled = UI.infoKey(key);
    } else if (m === 'about' || m === 'help') {
      handled = UI.textKey(key);
    } else if (m === 'adjust' || m === 'crop' || m === 'edittools') {
      handled = Editor.handleKey(key);
    } else {
      handled = Gallery.handleKey(key);
    }
    if (handled) {
      e.preventDefault();
    }
    /* Backspace at gallery root is NOT prevented: lets the system exit the app */
  }

  return {
    init: init,
    scanPhotos: scanPhotos,
    refreshGallery: refreshGallery,
    updateSoftkeys: updateSoftkeys,
    openCamera: openCamera,
    canShare: canShare,
    applyTheme: applyTheme
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  App.init();
}, false);
