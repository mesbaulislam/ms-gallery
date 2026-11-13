/* editor.js - photo edits via canvas: adjustments, filters, crop, rotate, flip. ES5 only. */
var Editor = (function () {
  var PREVIEW_MAX = 480;

  var editReturn = 'viewer';

  /* ---- adjust state ---- */
  var adjKind = null;
  var adjVal = 0;
  var adjImg = null;
  var adjMeta = null;
  var adjBase = null;
  var adjCanvas = null;

  /* ---- crop state ---- */
  var cropMeta = null;
  var cropUrl = null;
  var cropBox = null; /* {x,y,w,h} in stage coords */
  var cropMode = 'move'; /* move | resize */
  var cropAspect = 0;
  var ASPECTS = [
    { label: 'Free', w: 0, h: 0 },
    { label: '1:1', w: 1, h: 1 },
    { label: '4:3', w: 4, h: 3 },
    { label: '16:9', w: 16, h: 9 }
  ];

  var FILTERS = [
    { label: 'Sepia', value: 'sepia' },
    { label: 'Vivid', value: 'vivid' },
    { label: 'Cool', value: 'cool' },
    { label: 'Warm', value: 'warm' },
    { label: 'Vintage', value: 'vintage' }
  ];

  var ADJ_NAMES = {
    brightness: 'Brightness',
    contrast: 'Contrast',
    temperature: 'Temperature',
    exposure: 'Exposure'
  };

  /* ================= entry: toolbar screen (built-in style) ================= */
  var TOOLS = [
    { label: 'Crop', id: 'crop', icon: '\u2702' },
    { label: 'Rot L', id: 'rotl', icon: '\u21BA' },
    { label: 'Rot R', id: 'rotr', icon: '\u21BB' },
    { label: 'Flip', id: 'flip', icon: '\u2194' },
    { label: 'Bright', id: 'brightness', icon: '\u2600' },
    { label: 'Contra', id: 'contrast', icon: '\u25D0' },
    { label: 'Temp', id: 'temperature', icon: '\u2668' },
    { label: 'Expos', id: 'exposure', icon: '\u25D4' },
    { label: 'FX', id: 'filter', icon: '\u2605' },
    { label: 'B&W', id: 'bw', icon: '\u25D1' },
    { label: 'Collage', id: 'collage', icon: '\u25A6' }
  ];
  var toolSel = 0;
  var toolsMeta = null;
  var toolsUrl = null;

  function open(meta) {
    if (!meta || meta.external) {
      UI.toast('Cannot edit this image');
      return;
    }
    if (Utils.extOf(meta.name) === 'gif') {
      UI.toast('Cannot edit GIF images');
      return;
    }
    editReturn = UI.getMode();
    openTools(meta);
  }

  function openTools(meta) {
    UI.toast('Loading...');
    StorageMod.getBlob(meta, function (blob) {
      if (!blob) {
        UI.toast('Unable to read image');
        return;
      }
      try {
        toolsUrl = URL.createObjectURL(blob);
      } catch (e) {
        UI.toast('Unable to read image');
        return;
      }
      toolsMeta = meta;
      toolSel = 0;
      var el = Utils.$('edit-img');
      el.onload = function () {
        UI.setMode('edittools');
        UI.showScreen('screen-edit');
        renderTools();
        App.updateSoftkeys();
        UI.toast('Left/Right: choose - OK: select');
      };
      el.onerror = function () {
        cleanupTools();
        UI.toast('Unable to read image');
      };
      el.src = toolsUrl;
    });
  }

  function renderTools() {
    var bar = Utils.$('edit-tools');
    bar.innerHTML = '';
    for (var i = 0; i < TOOLS.length; i++) {
      var cell = Utils.el('div', 'etool' + (i === toolSel ? ' focus' : ''));
      cell.appendChild(Utils.el('span', 'eicon', TOOLS[i].icon || TOOLS[i].label));
      cell.appendChild(Utils.el('span', 'elabel', TOOLS[i].label));
      bar.appendChild(cell);
    }
    var sl = toolSel * 60 - 90;
    bar.scrollLeft = sl < 0 ? 0 : sl;
  }

  function cleanupTools() {
    if (toolsUrl) {
      try {
        URL.revokeObjectURL(toolsUrl);
      } catch (e) {}
      toolsUrl = null;
    }
    toolsMeta = null;
    try {
      Utils.$('edit-img').removeAttribute('src');
    } catch (e2) {}
  }

  function toolsKey(key) {
    if (key === 'ArrowLeft') {
      toolSel = (toolSel - 1 + TOOLS.length) % TOOLS.length;
      renderTools();
      return true;
    }
    if (key === 'ArrowRight') {
      toolSel = (toolSel + 1) % TOOLS.length;
      renderTools();
      return true;
    }
    if (key === 'Enter') {
      activateTool();
      return true;
    }
    if (key === 'Backspace' || key === 'SoftLeft' || key === 'SoftRight') {
      cancelEdit();
      return true;
    }
    return false;
  }

  function activateTool() {
    var t = TOOLS[toolSel];
    var meta = toolsMeta;
    if (!t || !meta) return;
    var id = t.id;
    if (id === 'collage') {
      openCollage();
      return;
    }
    if (id === 'filter') {
      openFilterMenu(meta);
      return;
    }
    if (id === 'crop') {
      openCrop(meta);
      return;
    }
    if (ADJ_NAMES[id]) {
      openAdjust(meta, id);
      return;
    }
    applyOp(meta, id);
  }

  function openCollage() {
    var ret = editReturn;
    var meta = toolsMeta;
    cleanupTools();
    if (ret === 'viewer') {
      UI.setMode('viewer');
      UI.showScreen('screen-viewer');
    } else {
      UI.setMode('gallery');
      UI.showScreen('screen-gallery');
    }
    App.updateSoftkeys();
    if (!Collage.start(meta)) {
      /* could not start picking (wrong view): back to the Edit toolbar */
      open(meta);
    }
  }

  /* ================= shared helpers ================= */
  function loadImage(meta, cb) {
    StorageMod.getBlob(meta, function (blob) {
      if (!blob) {
        cb(null);
        return;
      }
      var u = null;
      try {
        u = URL.createObjectURL(blob);
      } catch (e) {
        cb(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          URL.revokeObjectURL(u);
        } catch (e2) {}
        if (img.naturalWidth && img.naturalHeight) cb(img);
        else cb(null);
      };
      img.onerror = function () {
        try {
          URL.revokeObjectURL(u);
        } catch (e3) {}
        cb(null);
      };
      img.src = u;
    });
  }

  function canvasToBlob(canvas, cb) {
    if (canvas.toBlob) {
      try {
        canvas.toBlob(function (b) {
          cb(b);
        }, 'image/jpeg', 0.92);
        return;
      } catch (e) {}
    }
    try {
      cb(dataURLtoBlob(canvas.toDataURL('image/jpeg', 0.92)));
    } catch (e2) {
      cb(null);
    }
  }

  function dataURLtoBlob(du) {
    var parts = du.split(',');
    var mime = 'image/jpeg';
    var m = parts[0].match(/data:(.*?);/);
    if (m) mime = m[1];
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }

  /* edited blob -> viewer preview (Save/Discard) */
  function finishToPreview(out, meta) {
    cleanupTools();
    if (!out) {
      UI.toast('Edit failed');
      return;
    }
    if (UI.getMode() !== 'viewer') {
      Viewer.openList(Gallery.getList(), Gallery.getIndex());
    } else {
      UI.setMode('viewer');
      UI.showScreen('screen-viewer');
    }
    document.body.classList.add('viewing');
    Viewer.showPreview(out, meta, true); /* from the editor: Back returns to the toolbar */
  }

  /* Back from an adjust/crop screen returns to the toolbar (not out of the editor). */
  function backToTools() {
    adjImg = null;
    adjBase = null;
    adjCanvas = null;
    if (cropUrl) {
      try { URL.revokeObjectURL(cropUrl); } catch (e) {}
      cropUrl = null;
    }
    cropBox = null;
    try { Utils.$('crop-img').removeAttribute('src'); } catch (e2) {}
    try { Utils.$('crop-box').classList.add('hidden'); } catch (e3) {}
    UI.setMode('edittools');
    UI.showScreen('screen-edit');
    renderTools();
    App.updateSoftkeys();
  }

  function cancelEdit() {
    cleanupTools();
    adjImg = null;
    adjBase = null;
    adjCanvas = null;
    if (cropUrl) {
      try {
        URL.revokeObjectURL(cropUrl);
      } catch (e) {}
      cropUrl = null;
    }
    cropBox = null;
    try {
      Utils.$('crop-img').removeAttribute('src');
    } catch (e2) {}
    Utils.$('crop-box').classList.add('hidden');
    if (editReturn === 'gallery') {
      UI.setMode('gallery');
      UI.showScreen('screen-gallery');
    } else {
      UI.setMode('viewer');
      UI.showScreen('screen-viewer');
    }
    App.updateSoftkeys();
  }

  /* ================= rotate / flip / bw (instant) ================= */
  function applyOp(meta, op) {
    UI.toast('Processing...');
    loadImage(meta, function (img) {
      if (!img) {
        UI.toast('Unable to read image');
        return;
      }
      var canvas = null;
      try {
        canvas = document.createElement('canvas');
        processImage(canvas, img, op);
      } catch (e) {
        Utils.log('edit failed', e);
        UI.toast('Image too large to edit');
        return;
      }
      canvasToBlob(canvas, function (out) {
        finishToPreview(out, meta);
      });
    });
  }

  function processImage(canvas, img, op) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) throw new Error('bad image');
    if (op === 'rotl' || op === 'rotr') {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    ctx.save();
    if (op === 'rotl') {
      ctx.translate(0, h);
      ctx.rotate(-Math.PI / 2);
    } else if (op === 'rotr') {
      ctx.translate(w, 0);
      ctx.rotate(Math.PI / 2);
    } else if (op === 'flip') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    if (op === 'bw') {
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var px = d.data;
      for (var i = 0; i < px.length; i += 4) {
        var g = Math.round((px[i] + px[i + 1] + px[i + 2]) / 3);
        px[i] = g;
        px[i + 1] = g;
        px[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
    }
  }

  /* ================= adjustments (slider UI) ================= */
  function openAdjust(meta, kind) {
    adjKind = kind;
    adjMeta = meta;
    adjVal = 0;
    UI.toast('Loading...');
    loadImage(meta, function (img) {
      if (!img) {
        UI.toast('Unable to read image');
        return;
      }
      adjImg = img;
      var sc = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      adjCanvas = document.createElement('canvas');
      adjCanvas.width = Math.max(1, Math.round(img.naturalWidth * sc));
      adjCanvas.height = Math.max(1, Math.round(img.naturalHeight * sc));
      var ctx = adjCanvas.getContext('2d');
      if (!ctx) {
        UI.toast('Edit failed');
        return;
      }
      ctx.drawImage(img, 0, 0, adjCanvas.width, adjCanvas.height);
      try {
        adjBase = ctx.getImageData(0, 0, adjCanvas.width, adjCanvas.height);
      } catch (e) {
        UI.toast('Edit failed');
        return;
      }
      UI.setMode('adjust');
      UI.showScreen('screen-adjust');
      updateAdjustUI();
      App.updateSoftkeys();
      UI.toast('Left/Right: adjust');
    });
  }

  function updateAdjustUI() {
    Utils.$('adjust-title').textContent = ADJ_NAMES[adjKind] || 'Adjust';
    Utils.$('adjust-val').textContent = (adjVal > 0 ? '+' : '') + adjVal;
    renderAdjustPreview();
  }

  function renderAdjustPreview() {
    var ctx = adjCanvas.getContext('2d');
    var d = ctx.createImageData(adjCanvas.width, adjCanvas.height);
    var src = adjBase.data;
    var dst = d.data;
    for (var i = 0; i < src.length; i++) dst[i] = src[i];
    applyAdjust(d, adjKind, adjVal);
    ctx.putImageData(d, 0, 0);
    try {
      Utils.$('adjust-img').src = adjCanvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {}
  }

  function applyAdjust(d, kind, val) {
    var px = d.data;
    var i;
    var off, c, f, t, m;
    if (kind === 'brightness') {
      off = val * 2.55;
      for (i = 0; i < px.length; i += 4) {
        px[i] += off;
        px[i + 1] += off;
        px[i + 2] += off;
      }
    } else if (kind === 'contrast') {
      c = val * 2.55;
      f = (259 * (c + 255)) / (255 * (259 - c));
      for (i = 0; i < px.length; i += 4) {
        px[i] = f * (px[i] - 128) + 128;
        px[i + 1] = f * (px[i + 1] - 128) + 128;
        px[i + 2] = f * (px[i + 2] - 128) + 128;
      }
    } else if (kind === 'temperature') {
      t = val * 1.2;
      for (i = 0; i < px.length; i += 4) {
        px[i] += t;
        px[i + 2] -= t;
      }
    } else if (kind === 'exposure') {
      m = 1 + val / 100;
      for (i = 0; i < px.length; i += 4) {
        px[i] *= m;
        px[i + 1] *= m;
        px[i + 2] *= m;
      }
    }
  }

  function adjustKey(key) {
    if (key === 'ArrowLeft') {
      adjVal = Utils.clamp(adjVal - 5, -100, 100);
      updateAdjustUI();
      return true;
    }
    if (key === 'ArrowRight') {
      adjVal = Utils.clamp(adjVal + 5, -100, 100);
      updateAdjustUI();
      return true;
    }
    if (key === 'Enter' || key === 'SoftLeft') {
      applyAdjustFinal();
      return true;
    }
    if (key === 'Backspace' || key === 'SoftRight') {
      backToTools();
      return true;
    }
    return false;
  }

  function applyAdjustFinal() {
    var kind = adjKind;
    var val = adjVal;
    var img = adjImg;
    var meta = adjMeta;
    UI.toast('Processing...');
    setTimeout(function () {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.drawImage(img, 0, 0);
        var d = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyAdjust(d, kind, val);
        ctx.putImageData(d, 0, 0);
        canvasToBlob(canvas, function (out) {
          finishToPreview(out, meta);
        });
      } catch (e) {
        Utils.log('adjust failed', e);
        UI.toast('Image too large to edit');
        cancelEdit();
      }
    }, 60);
  }

  /* ================= color filters ================= */
  function openFilterMenu(meta) {
    var items = [];
    for (var i = 0; i < FILTERS.length; i++) {
      items.push({ label: FILTERS[i].label, value: FILTERS[i].value });
    }
    UI.showMenu('Color Filter', items, function (v) {
      if (v) applyFilter(meta, v);
    }, 'OK: select');
  }

  function applyFilter(meta, name) {
    UI.toast('Processing...');
    loadImage(meta, function (img) {
      if (!img) {
        UI.toast('Unable to read image');
        return;
      }
      setTimeout(function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no ctx');
          ctx.drawImage(img, 0, 0);
          var d = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyFilterPx(d.data, name);
          ctx.putImageData(d, 0, 0);
          canvasToBlob(canvas, function (out) {
            finishToPreview(out, meta);
          });
        } catch (e) {
          Utils.log('filter failed', e);
          UI.toast('Image too large to edit');
        }
      }, 60);
    });
  }

  function applyFilterPx(px, name) {
    var i, r, g, b, avg;
    if (name === 'sepia') {
      for (i = 0; i < px.length; i += 4) {
        r = px[i];
        g = px[i + 1];
        b = px[i + 2];
        px[i] = r * 0.393 + g * 0.769 + b * 0.189;
        px[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
        px[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
      }
    } else if (name === 'vivid') {
      for (i = 0; i < px.length; i += 4) {
        r = px[i];
        g = px[i + 1];
        b = px[i + 2];
        avg = (r + g + b) / 3;
        px[i] = avg + (r - avg) * 1.5;
        px[i + 1] = avg + (g - avg) * 1.5;
        px[i + 2] = avg + (b - avg) * 1.5;
      }
    } else if (name === 'cool') {
      for (i = 0; i < px.length; i += 4) {
        px[i] *= 0.9;
        px[i + 2] *= 1.15;
      }
    } else if (name === 'warm') {
      for (i = 0; i < px.length; i += 4) {
        px[i] *= 1.15;
        px[i + 2] *= 0.9;
      }
    } else if (name === 'vintage') {
      for (i = 0; i < px.length; i += 4) {
        r = px[i];
        g = px[i + 1];
        b = px[i + 2];
        px[i] = r * 0.9 + 30;
        px[i + 1] = g * 0.85 + 20;
        px[i + 2] = b * 0.7;
      }
    }
  }

  /* ================= crop (keypad crop box) ================= */
  var CROP_STEP = 10;

  function openCrop(meta) {
    UI.toast('Loading...');
    StorageMod.getBlob(meta, function (blob) {
      if (!blob) {
        UI.toast('Unable to read image');
        return;
      }
      try {
        cropUrl = URL.createObjectURL(blob);
      } catch (e) {
        UI.toast('Unable to read image');
        return;
      }
      cropMeta = meta;
      cropMode = 'move';
      cropAspect = 0;
      var el = Utils.$('crop-img');
      el.onload = function () {
        initCropBox();
      };
      el.onerror = function () {
        UI.toast('Unable to read image');
        cancelEdit();
      };
      UI.setMode('crop');
      UI.showScreen('screen-crop');
      updateCropTitle();
      App.updateSoftkeys();
      el.src = cropUrl;
      UI.toast('Arrows: move - OK: resize');
    });
  }

  function cropStageSize() {
    var st = Utils.$('crop-stage');
    return { w: st.clientWidth || 240, h: st.clientHeight || 240 };
  }

  /* image rect as rendered inside the stage (object-fit: contain) */
  function displayedRect() {
    var el = Utils.$('crop-img');
    var nw = el.naturalWidth || 0;
    var nh = el.naturalHeight || 0;
    var st = cropStageSize();
    if (!nw || !nh) return null;
    var s = Math.min(st.w / nw, st.h / nh);
    var dw = nw * s;
    var dh = nh * s;
    return { x: (st.w - dw) / 2, y: (st.h - dh) / 2, w: dw, h: dh, nw: nw, nh: nh };
  }

  function initCropBox() {
    var r = displayedRect();
    if (!r) return;
    var w = r.w * 0.8;
    var h = r.h * 0.8;
    cropBox = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w: w, h: h };
    Utils.$('crop-box').classList.remove('hidden');
    drawCropBox();
  }

  function drawCropBox() {
    var b = Utils.$('crop-box');
    b.style.left = cropBox.x + 'px';
    b.style.top = cropBox.y + 'px';
    b.style.width = cropBox.w + 'px';
    b.style.height = cropBox.h + 'px';
  }

  function updateCropTitle() {
    Utils.$('crop-title').textContent =
      'Crop - ' + (cropMode === 'move' ? 'Move' : 'Resize') + ' - ' + ASPECTS[cropAspect].label;
  }

  function cropModeLabel() {
    return cropMode === 'move' ? 'Resize' : 'Move';
  }

  function fitAspect() {
    var r = displayedRect();
    if (!r || !cropBox) return;
    var a = ASPECTS[cropAspect];
    var cx = cropBox.x + cropBox.w / 2;
    var cy = cropBox.y + cropBox.h / 2;
    var w, h;
    if (!a.w) {
      w = r.w * 0.8;
      h = r.h * 0.8;
    } else {
      var s = Math.min(r.w / a.w, r.h / a.h) * 0.8;
      w = a.w * s;
      h = a.h * s;
    }
    cropBox = {
      x: Utils.clamp(cx - w / 2, r.x, r.x + r.w - w),
      y: Utils.clamp(cy - h / 2, r.y, r.y + r.h - h),
      w: w,
      h: h
    };
    drawCropBox();
  }

  function cropKey(key) {
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      if (!cropBox) return true;
      var r = displayedRect();
      if (!r) return true;
      var dx = key === 'ArrowLeft' ? -CROP_STEP : (key === 'ArrowRight' ? CROP_STEP : 0);
      var dy = key === 'ArrowUp' ? -CROP_STEP : (key === 'ArrowDown' ? CROP_STEP : 0);
      if (cropMode === 'move') {
        cropBox.x = Utils.clamp(cropBox.x + dx, r.x, r.x + r.w - cropBox.w);
        cropBox.y = Utils.clamp(cropBox.y + dy, r.y, r.y + r.h - cropBox.h);
      } else {
        var a = ASPECTS[cropAspect];
        if (a.w) {
          if (dx !== 0) {
            cropBox.w += dx * 2;
            cropBox.h = cropBox.w * a.h / a.w;
          } else {
            cropBox.h += dy * 2;
            cropBox.w = cropBox.h * a.w / a.h;
          }
        } else {
          cropBox.w += dx * 2;
          cropBox.h += dy * 2;
        }
        cropBox.w = Utils.clamp(cropBox.w, 20, r.w);
        cropBox.h = Utils.clamp(cropBox.h, 20, r.h);
        cropBox.x = Utils.clamp(cropBox.x, r.x, r.x + r.w - cropBox.w);
        cropBox.y = Utils.clamp(cropBox.y, r.y, r.y + r.h - cropBox.h);
      }
      drawCropBox();
      return true;
    }
    if (key === 'Enter') {
      cropMode = cropMode === 'move' ? 'resize' : 'move';
      updateCropTitle();
      App.updateSoftkeys();
      return true;
    }
    if (key === '1' || key === '3') {
      cropAspect = (cropAspect + (key === '3' ? 1 : ASPECTS.length - 1)) % ASPECTS.length;
      fitAspect();
      updateCropTitle();
      return true;
    }
    if (key === 'SoftLeft') {
      applyCrop();
      return true;
    }
    if (key === 'Backspace' || key === 'SoftRight') {
      backToTools();
      return true;
    }
    return false;
  }

  function applyCrop() {
    var r = displayedRect();
    var meta = cropMeta;
    if (!r || !cropBox || !meta) {
      cancelEdit();
      return;
    }
    var sx = (cropBox.x - r.x) / r.w;
    var sy = (cropBox.y - r.y) / r.h;
    var sw = cropBox.w / r.w;
    var sh = cropBox.h / r.h;
    UI.toast('Processing...');
    loadImage(meta, function (img) {
      if (!img) {
        UI.toast('Unable to read image');
        cancelEdit();
        return;
      }
      setTimeout(function () {
        try {
          var canvas = document.createElement('canvas');
          var cw = Math.max(1, Math.round(r.nw * sw));
          var ch = Math.max(1, Math.round(r.nh * sh));
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no ctx');
          ctx.drawImage(img, r.nw * sx, r.nh * sy, r.nw * sw, r.nh * sh, 0, 0, cw, ch);
          canvasToBlob(canvas, function (out) {
            cancelEdit();
            finishToPreview(out, meta);
          });
        } catch (e) {
          Utils.log('crop failed', e);
          UI.toast('Crop failed');
          cancelEdit();
        }
      }, 60);
    });
  }

  /* ================= key routing ================= */
  function handleKey(key) {
    var m = UI.getMode();
    if (m === 'adjust') return adjustKey(key);
    if (m === 'crop') return cropKey(key);
    if (m === 'edittools') return toolsKey(key);
    return false;
  }

  return {
    open: open,
    handleKey: handleKey,
    cropModeLabel: cropModeLabel
  };
})();
