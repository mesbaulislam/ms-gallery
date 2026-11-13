/* viewer.js - full-screen viewer: zoom (1/3 keys), pan, prev/next, slideshow, edit preview. ES5 only. */
var Viewer = (function () {
  var PAN_STEP = 24;

  var list = [];
  var idx = 0;
  var url = null;
  var token = 0;
  var external = false;

  var zoom = 1;           /* continuous zoom factor, 1 = fit, up to 8 */
  var panX = 0, panY = 0;
  var baseW = 0, baseH = 0, natW = 0, natH = 0;

  var slideshow = false;
  var slideTimer = null;
  var slidePaused = false;

  var previewMode = false; /* editor preview: Save/Discard */
  var previewBlob = null;
  var previewMeta = null;
  var previewFromEdit = false; /* preview came from the editor: Back returns to the toolbar */

  function current() {
    return list[idx] || null;
  }

  function isExternal() {
    return external;
  }

  function isPreview() {
    return previewMode;
  }

  function openList(l, i) {
    external = false;
    previewMode = false;
    previewFromEdit = false;
    list = l || [];
    idx = Utils.clamp(i || 0, 0, Math.max(0, list.length - 1));
    show();
  }

  function openExternal(blob, name) {
    external = true;
    previewMode = false;
    previewFromEdit = false;
    list = [{ external: true, blob: blob, name: name || 'image', store: '', size: (blob && blob.size) || 0, date: Date.now() }];
    idx = 0;
    show();
  }

  /* Show an edited blob as preview with Save/Discard. */
  function showPreview(blob, meta, fromEdit) {
    previewMode = true;
    previewBlob = blob;
    previewMeta = meta;
    previewFromEdit = !!fromEdit;
    token++;
    var my = token;
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
      url = null;
    }
    var img = Utils.$('viewer-img');
    try {
      img.removeAttribute('src');
    } catch (e) {}
    img.style.visibility = 'hidden';
    Utils.$('viewer-error').classList.add('hidden');
    zoom = 1;
    panX = 0;
    panY = 0;
    try {
      url = URL.createObjectURL(blob);
    } catch (e) {
      showError();
      return;
    }
    img.onload = function () {
      if (my !== token) return;
      natW = img.naturalWidth || 0;
      natH = img.naturalHeight || 0;
      img.style.visibility = 'visible';
      applyTransform();
    };
    img.onerror = function () {
      if (my !== token) return;
      showError();
    };
    img.src = url;
    updateBar();
    App.updateSoftkeys();
  }

  function discardPreview() {
    previewMode = false;
    previewBlob = null;
    var meta = previewMeta;
    var fromEdit = previewFromEdit;
    previewMeta = null;
    previewFromEdit = false;
    if (fromEdit && meta) {
      /* Back from an edited preview: back to the Edit toolbar, not the viewer */
      Editor.open(meta);
      return;
    }
    loadCurrent();
    App.updateSoftkeys();
  }

  function savePreview() {
    if (!previewBlob || !previewMeta) return;
    var meta = previewMeta;
    previewFromEdit = false;
    UI.toast('Saving...');
    StorageMod.replacePhoto(meta, previewBlob, function (ok) {
      previewMode = false;
      previewBlob = null;
      previewMeta = null;
      if (!ok) {
        UI.toast('Save failed.');
        loadCurrent();
        App.updateSoftkeys();
        return;
      }
      UI.toast('Saved');
      /* rescan, then reopen the edited photo */
      App.refreshGallery(function () {
        var l = Gallery.getList();
        var ni = 0;
        for (var i = 0; i < l.length; i++) {
          if (l[i].store === meta.store && l[i].name === meta.name) {
            ni = i;
            break;
          }
        }
        openList(l, ni);
      });
    });
  }

  function show() {
    stopSlideshow();
    previewMode = false;
    previewFromEdit = false;
    UI.setMode('viewer');
    UI.showScreen('screen-viewer');
    document.body.classList.add('viewing');
    zoom = 1;
    panX = 0;
    panY = 0;
    loadCurrent();
    App.updateSoftkeys();
  }

  function showError() {
    Utils.$('viewer-error').classList.remove('hidden');
    Utils.$('viewer-img').style.visibility = 'hidden';
    updateBar();
  }

  function loadCurrent() {
    token++;
    var my = token;
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
      url = null;
    }
    var img = Utils.$('viewer-img');
    try {
      img.removeAttribute('src');
    } catch (e) {}
    img.style.visibility = 'hidden';
    Utils.$('viewer-error').classList.add('hidden');
    var m = current();
    updateBar();
    if (!m) {
      showError();
      return;
    }
    var ready = function (blob) {
      if (my !== token) return;
      if (!blob) {
        showError();
        return;
      }
      try {
        url = URL.createObjectURL(blob);
      } catch (e) {
        showError();
        return;
      }
      img.onload = function () {
        if (my !== token) return;
        natW = img.naturalWidth || 0;
        natH = img.naturalHeight || 0;
        if (!natW || !natH) {
          showError();
          return;
        }
        img.style.visibility = 'visible';
        applyTransform();
      };
      img.onerror = function () {
        if (my !== token) return;
        showError();
      };
      img.src = url;
    };
    if (m.external) {
      ready(m.blob);
    } else {
      StorageMod.getBlob(m, ready);
    }
  }

  function stageSize() {
    var st = Utils.$('viewer-stage');
    return { w: st.clientWidth || 240, h: st.clientHeight || 270 };
  }

  function zoomed() {
    return zoom > 1;
  }

  function applyTransform() {
    var img = Utils.$('viewer-img');
    if (!natW || !natH) return;
    var st = stageSize();
    var s = Math.min(st.w / natW, st.h / natH);
    baseW = Math.max(1, Math.floor(natW * s));
    baseH = Math.max(1, Math.floor(natH * s));
    var scale = zoom;
    var dw = Math.floor(baseW * scale);
    var dh = Math.floor(baseH * scale);
    var maxX = Math.max(0, (dw - st.w) / 2);
    var maxY = Math.max(0, (dh - st.h) / 2);
    panX = Utils.clamp(panX, -maxX, maxX);
    panY = Utils.clamp(panY, -maxY, maxY);
    img.style.width = dw + 'px';
    img.style.height = dh + 'px';
    img.style.left = ((st.w - dw) / 2 + panX) + 'px';
    img.style.top = ((st.h - dh) / 2 + panY) + 'px';
  }

  function zoomIn() {
    zoom = Math.min(8, zoom * 1.25);
    applyTransform();
    updateBar();
  }

  function zoomOut() {
    zoom = Math.max(1, zoom / 1.25);
    if (zoom < 1.01) {
      zoom = 1;
    }
    if (!zoomed()) {
      panX = 0;
      panY = 0;
    }
    applyTransform();
    updateBar();
  }

  function pan(dx, dy) {
    panX += dx;
    panY += dy;
    applyTransform();
  }

  function go(d) {
    if (!list.length) return;
    idx = (idx + d + list.length) % list.length;
    zoom = 1;
    panX = 0;
    panY = 0;
    loadCurrent();
  }

  function next() {
    go(1);
  }

  function prev() {
    go(-1);
  }

  function updateBar() {
    var t = '';
    if (previewMode) {
      t = 'Preview - Save or Discard';
    } else if (list.length) {
      var m = current();
      t = (idx + 1) + ' / ' + list.length;
      if (m) t += ' - ' + Utils.fileNameOf(m.name);
      if (zoomed()) t += ' - ' + zoom.toFixed(1) + 'x';
    }
    Utils.$('viewer-pos').textContent = t;
  }

  /* ---------- slideshow ---------- */
  function startSlideshow() {
    if (!list.length || slideshow || previewMode) return;
    slideshow = true;
    slidePaused = false;
    restartSlideTimer();
    document.body.classList.add('slideshow');
    App.updateSoftkeys();
  }

  function restartSlideTimer() {
    if (slideTimer) clearInterval(slideTimer);
    var ms = Settings.get('slideshow') * 1000;
    slideTimer = setInterval(function () {
      if (!slidePaused) next();
    }, ms);
  }

  function restartSlide() {
    if (slideshow) restartSlideTimer();
  }

  function togglePause() {
    slidePaused = !slidePaused;
    App.updateSoftkeys();
    UI.toast(slidePaused ? 'Paused' : 'Resumed');
  }

  function stopSlideshow() {
    if (slideTimer) {
      clearInterval(slideTimer);
      slideTimer = null;
    }
    slideshow = false;
    slidePaused = false;
    document.body.classList.remove('slideshow');
  }

  function slideshowActive() {
    return slideshow;
  }

  function removeCurrentAndNext() {
    list.splice(idx, 1);
    if (!list.length) {
      close();
      return;
    }
    if (idx >= list.length) idx = list.length - 1;
    zoom = 1;
    panX = 0;
    panY = 0;
    loadCurrent();
  }

  function close() {
    stopSlideshow();
    previewMode = false;
    previewBlob = null;
    previewMeta = null;
    previewFromEdit = false;
    token++;
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
      url = null;
    }
    list = [];
    var wasExternal = external;
    external = false;
    document.body.classList.remove('viewing');
    if (wasExternal) {
      /* opened from file manager: Back returns to the file manager */
      try {
        window.close();
      } catch (e) {}
      return;
    }
    UI.setMode('gallery');
    UI.showScreen('screen-gallery');
    Gallery.render();
    Gallery.saveLast();
    App.updateSoftkeys();
  }

  function handleKey(key) {
    if (previewMode) {
      switch (key) {
        case 'SoftLeft': savePreview(); return true;
        case 'SoftRight':
        case 'Backspace': discardPreview(); return true;
      }
      return true;
    }
    var m = current();
    if (!m) {
      if (key === 'Backspace') {
        close();
        return true;
      }
      return true;
    }
    switch (key) {
      case 'ArrowLeft':
        if (slideshow) {
          prev();
          restartSlide();
        } else if (zoomed()) {
          pan(PAN_STEP, 0);
        } else {
          prev();
        }
        return true;
      case 'ArrowRight':
        if (slideshow) {
          next();
          restartSlide();
        } else if (zoomed()) {
          pan(-PAN_STEP, 0);
        } else {
          next();
        }
        return true;
      case 'ArrowUp':
        if (slideshow) return true;
        if (zoomed()) pan(0, PAN_STEP);
        else zoomIn();
        return true;
      case 'ArrowDown':
        if (slideshow) return true;
        if (zoomed()) pan(0, -PAN_STEP);
        else zoomOut();
        return true;
      case '1':
        if (!slideshow) zoomOut();
        return true;
      case '3':
        if (!slideshow) zoomIn();
        return true;
      case 'Enter':
        if (slideshow) togglePause();
        return true;
      case 'SoftLeft':
        if (slideshow) togglePause();
        return true;
      case 'SoftRight':
        UI.showOptions();
        return true;
      case 'Backspace':
        if (slideshow) {
          stopSlideshow();
          App.updateSoftkeys();
        } else {
          close();
        }
        return true;
    }
    return false;
  }

  return {
    openList: openList,
    openExternal: openExternal,
    current: current,
    isExternal: isExternal,
    isPreview: isPreview,
    showPreview: showPreview,
    discardPreview: discardPreview,
    savePreview: savePreview,
    next: next,
    prev: prev,
    startSlideshow: startSlideshow,
    stopSlideshow: stopSlideshow,
    slideshowActive: slideshowActive,
    removeCurrentAndNext: removeCurrentAndNext,
    close: close,
    handleKey: handleKey,
    updateBar: updateBar
  };
})();
