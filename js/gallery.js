/* gallery.js - grid, windowed thumbnails, in-place focus, select mode, views. ES5 only. */
var Gallery = (function () {
  var WINDOW = 30;
  var LAST_KEY = 'gallery.last.v2';

  var photos = [];       /* scanned (deduped) metadata, trash/private excluded */
  var trashPhotos = [];
  var privatePhotos = [];
  var list = [];         /* current view */
  var view = { type: 'all', folder: '', query: '' };
  var sel = 0;
  var winStart = 0;
  var winToken = 0;
  var thumbUrls = {};

  /* multi-select mode: null or {title,min,max,actions} */
  var selectMode = null;
  var checked = {};

  /* tab bar: 0=Photos, 1=Albums, 2=Favorites */
  var tabSel = 0;
  var tabActive = false;

  function cols() {
    var s = Settings.get('thumbSize');
    return s === 'small' ? 4 : (s === 'large' ? 2 : 3);
  }

  function samePhoto(a, b) {
    return a && b && a.store === b.store && a.name === b.name;
  }

  function photoKey(p) {
    return p.store + '::' + p.name;
  }

  /* Remove duplicates across stores (same path+size+date). */
  function dedupe(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      var k = p.name + '|' + p.size + '|' + p.date;
      if (!seen[k]) {
        seen[k] = 1;
        out.push(p);
      } else {
        Utils.log('dedupe dropped:', p.store, p.name);
      }
    }
    return out;
  }

  function setPhotos(p) {
    photos = dedupe(p || []);
    Favorites.prune(photos);
    applyView(false);
  }

  function setTrashPhotos(p) {
    trashPhotos = p || [];
    if (view.type === 'trash') {
      applyView(false);
      render();
    }
  }

  function setPrivatePhotos(p) {
    privatePhotos = p || [];
    if (view.type === 'private') {
      applyView(false);
      render();
    }
  }

  function source() {
    if (view.type === 'trash') return trashPhotos;
    if (view.type === 'private') return privatePhotos;
    return photos;
  }

  function applyView(keepSel) {
    var prevKey = null;
    if (keepSel && list[sel]) prevKey = photoKey(list[sel]);
    var q = (view.query || '').toLowerCase();
    var src = source();
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var p = src[i];
      if (view.type === 'folder' && Utils.folderOf(p.name) !== view.folder) continue;
      if (view.type === 'favorites' && !Favorites.isFav(p)) continue;
      if (view.type === 'search' && p.name.toLowerCase().indexOf(q) < 0) continue;
      out.push(p);
    }
    var mode = Settings.get('sort');
    out.sort(function (a, b) {
      var r = 0;
      if (mode === 'name-az') r = a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      else if (mode === 'name-za') r = a.name > b.name ? -1 : (a.name < b.name ? 1 : 0);
      else if (mode === 'oldest') r = a.date - b.date;
      else r = b.date - a.date;
      if (r === 0) r = a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      return r;
    });
    list = out;
    sel = 0;
    if (prevKey) {
      for (var j = 0; j < list.length; j++) {
        if (photoKey(list[j]) === prevKey) {
          sel = j;
          break;
        }
      }
    }
    if (sel >= list.length) sel = Math.max(0, list.length - 1);
  }

  function applyViewAndRender() {
    applyView(true);
    render();
  }

  function folders() {
    var map = {};
    var arr = [];
    for (var i = 0; i < photos.length; i++) {
      var f = Utils.folderOf(photos[i].name);
      if (f && !map[f]) {
        map[f] = 1;
        arr.push(f);
      }
    }
    arr.sort();
    return arr;
  }

  function folderCount(f) {
    var n = 0;
    for (var i = 0; i < photos.length; i++) {
      if (Utils.folderOf(photos[i].name) === f) n++;
    }
    return n;
  }

  function viewTitle() {
    if (selectMode) return selectMode.title;
    if (window.Pick && Pick.active()) return 'Pick a photo';
    if (view.type === 'folder') return view.folder;
    if (view.type === 'favorites') return 'Favorites';
    if (view.type === 'search') return 'Search';
    if (view.type === 'trash') return 'Trash';
    if (view.type === 'private') return 'Private';
    return 'Recent Photos';
  }

  function viewCount() {
    if (selectMode) return Object.keys(checked).length + ' selected';
    if (window.Pick && Pick.active()) {
      return Pick.hasSingle() ? '1 selected' : list.length + ' items';
    }
    return list.length + ' items';
  }

  function revokeThumbs() {
    for (var k in thumbUrls) {
      try {
        URL.revokeObjectURL(thumbUrls[k]);
      } catch (e) {}
    }
    thumbUrls = {};
  }

  function renderTabs() {
    var bar = Utils.$('tabs');
    if (!bar) return;
    if (selectMode) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    var kids = bar.children;
    for (var i = 0; i < kids.length; i++) {
      var c = 'tab';
      if (i === tabSel) c += tabActive ? ' focus' : ' active';
      kids[i].className = c;
    }
  }

  function render() {
    UI.setTitle(viewTitle(), viewCount());
    renderTabs();
    var grid = Utils.$('grid');
    var empty = Utils.$('empty');
    grid.className = 'cols-' + cols();
    winToken++;
    var token = winToken;
    revokeThumbs();
    grid.innerHTML = '';

    if (!list.length) {
      empty.classList.remove('hidden');
      var t = view.type === 'trash' ? 'Trash is empty' :
              view.type === 'private' ? 'No hidden photos' : 'No Photos';
      empty.querySelector('.empty-title').textContent = t;
      App.updateSoftkeys();
      return;
    }
    empty.classList.add('hidden');

    if (sel < winStart || sel >= winStart + WINDOW) {
      winStart = Math.max(0, sel - Math.floor(WINDOW / 2));
    }
    if (winStart + WINDOW > list.length) {
      winStart = Math.max(0, list.length - WINDOW);
    }
    var end = Math.min(list.length, winStart + WINDOW);

    var frag = document.createDocumentFragment();
    for (var i = winStart; i < end; i++) {
      frag.appendChild(makeCell(i, token));
    }
    grid.appendChild(frag);

    focusCell(false);
    App.updateSoftkeys();
  }

  function makeCell(idx, token) {
    var p = list[idx];
    var cell = Utils.el('div', 'thumb' + (idx === sel ? ' focus' : ''));
    cell.setAttribute('data-key', photoKey(p));
    var inner = Utils.el('div', 'thumb-inner');
    var img = document.createElement('img');
    img.alt = '';
    img.onerror = function () {
      img.className = 'broken';
    };
    inner.appendChild(img);
    if (Favorites.isFav(p)) {
      inner.appendChild(Utils.el('span', 'fav', '*'));
    }
    inner.appendChild(Utils.el('div', 'check'));
    if ((selectMode && checked[photoKey(p)]) ||
        (window.Pick && Pick.isSingle(p))) {
      cell.classList.add('checked');
    }
    cell.appendChild(inner);
    loadThumb(idx, img, token);
    return cell;
  }

  function loadThumb(idx, img, token) {
    var p = list[idx];
    if (!p) return;
    StorageMod.getBlob(p, function (blob) {
      if (token !== winToken) return;
      if (!blob) return;
      /* cell may have scrolled out and been removed: don't leak the URL */
      try {
        if (!document.contains(img)) return;
      } catch (e) {}
      var url = null;
      try {
        url = URL.createObjectURL(blob);
      } catch (e) {
        return;
      }
      thumbUrls[idx] = url;
      img.src = url;
    });
  }

  function focusCell(scroll) {
    var grid = Utils.$('grid');
    var kids = grid.children;
    var fc = kids[sel - winStart];
    if (fc && scroll !== false && fc.scrollIntoView) {
      try {
        fc.scrollIntoView(false);
      } catch (e) {}
    }
  }

  /* In-place focus change: no re-render, no thumb reload. */
  function setFocus(ni) {
    var grid = Utils.$('grid');
    var oldc = grid.children[sel - winStart];
    if (oldc) oldc.classList.remove('focus');
    sel = ni;
    var nc = grid.children[sel - winStart];
    if (nc) {
      nc.classList.add('focus');
      try {
        nc.scrollIntoView(false);
      } catch (e) {}
    }
  }

  function dropThumbUrl(idx) {
    if (thumbUrls[idx]) {
      try {
        URL.revokeObjectURL(thumbUrls[idx]);
      } catch (e) {}
      delete thumbUrls[idx];
    }
  }

  /* Slide the rendered window incrementally: only the cells entering the
     window are created, cells leaving are removed. Visible thumbs are kept,
     so scrolling stays smooth with no reload flash. */
  function slideTo(ns) {
    var grid = Utils.$('grid');
    ns = Math.max(0, Math.min(ns, Math.max(0, list.length - WINDOW)));
    if (ns === winStart) return;
    if (Math.abs(ns - winStart) >= WINDOW) {
      winStart = ns;
      render();
      return;
    }
    var token = winToken;
    var i;
    if (ns > winStart) {
      var n = ns - winStart;
      for (i = 0; i < n; i++) {
        if (grid.firstChild) grid.removeChild(grid.firstChild);
        dropThumbUrl(winStart + i);
        grid.appendChild(makeCell(winStart + WINDOW + i, token));
      }
    } else {
      var n2 = winStart - ns;
      for (i = 0; i < n2; i++) {
        if (grid.lastChild) grid.removeChild(grid.lastChild);
        dropThumbUrl(winStart + WINDOW - 1 - i);
        grid.insertBefore(makeCell(ns + i, token), grid.firstChild);
      }
    }
    winStart = ns;
  }

  function move(dRow, dCol) {
    if (!list.length) return;
    if (dRow < 0 && !selectMode && Math.floor(sel / cols()) === 0) {
      activateTabs();
      return;
    }
    var c = cols();
    var r = Math.floor(sel / c);
    var col = sel % c;
    r += dRow;
    col += dCol;
    if (col < 0) {
      col = c - 1;
      r--;
    }
    if (col >= c) {
      col = 0;
      r++;
    }
    var maxR = Math.floor((list.length - 1) / c);
    r = Utils.clamp(r, 0, maxR);
    var rowLen = (r === maxR) ? (list.length - r * c) : c;
    col = Utils.clamp(col, 0, rowLen - 1);
    var ni = r * c + col;
    if (ni === sel) return;
    var grid = Utils.$('grid');
    var oldc = grid.children[sel - winStart];
    if (oldc) oldc.classList.remove('focus');
    var down = ni > sel;
    sel = ni;
    if (ni >= winStart && ni < winStart + WINDOW) {
      setFocus(ni);
    } else {
      /* slide the window so the new item lands at the edge: smooth scroll */
      var ns = down ? ni - WINDOW + c : ni - (ni % c);
      slideTo(Math.max(0, ns));
      var fc = grid.children[sel - winStart];
      if (fc) {
        if (!fc.classList.contains('focus')) fc.classList.add('focus');
        try {
          fc.scrollIntoView(false);
        } catch (e) {}
      }
    }
  }

  function getSelected() {
    return list[sel] || null;
  }

  function setView(type, folder, query) {
    endSelect(true);
    if (window.Pick && Pick.active()) Pick.resetSingle();
    view.type = type;
    view.folder = folder || '';
    view.query = query || '';
    sel = 0;
    tabActive = false;
    if (type === 'all') tabSel = 0;
    else if (type === 'favorites') tabSel = 2;
    else if (type === 'folder') tabSel = 1;
    if (type === 'trash') {
      StorageMod.listTrash(function (items) {
        setTrashPhotos(items);
      });
    } else if (type === 'private') {
      StorageMod.listPrivate(function (items) {
        setPrivatePhotos(items);
      });
    }
    applyView(false);
    render();
    saveLast();
  }

  function getView() {
    return view;
  }

  function removePhoto(p) {
    removePhotoSilent(p);
    if (Favorites.isFav(p)) Favorites.toggle(p);
    applyView(true);
    render();
  }

  function removePhotoSilent(p) {
    for (var i = 0; i < photos.length; i++) {
      if (samePhoto(photos[i], p)) {
        photos.splice(i, 1);
        break;
      }
    }
    if (Favorites.isFav(p)) Favorites.toggle(p);
  }

  function renamePhoto(p, newName) {
    for (var i = 0; i < photos.length; i++) {
      if (samePhoto(photos[i], p)) {
        var wasFav = Favorites.isFav(photos[i]);
        if (wasFav) Favorites.toggle(photos[i]);
        photos[i].name = newName;
        if (wasFav) Favorites.toggle(photos[i]);
        break;
      }
    }
    applyView(true);
    render();
  }

  function saveLast() {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ view: view, sel: sel }));
    } catch (e) {}
  }

  function loadLast() {
    try {
      var o = JSON.parse(localStorage.getItem(LAST_KEY));
      if (o && o.view && o.view.type) {
        if (o.view.type === 'trash' || o.view.type === 'private') o.view.type = 'all';
        view = o.view;
        sel = o.sel || 0;
        tabSel = view.type === 'favorites' ? 2 : (view.type === 'folder' ? 1 : 0);
      }
    } catch (e) {}
  }

  /* ---------- multi-select ---------- */
  function startSelect(opts) {
    selectMode = opts;
    checked = {};
    sel = 0;
    render();
  }

  function endSelect(silent) {
    if (!selectMode) return;
    selectMode = null;
    checked = {};
    if (!silent) render();
  }

  function isSelectMode() {
    return !!selectMode;
  }

  function checkedPhotos() {
    var out = [];
    for (var k in checked) {
      if (checked[k] && checked[k] !== 1) out.push(checked[k]);
    }
    return out;
  }

  function toggleCheck() {
    var p = list[sel];
    if (!p) return;
    var k = photoKey(p);
    var n = Object.keys(checked).length;
    if (checked[k]) {
      delete checked[k];
    } else {
      if (selectMode.max && n >= selectMode.max) {
        UI.toast('Maximum ' + selectMode.max + ' photos');
        return;
      }
      checked[k] = p;
    }
    var grid = Utils.$('grid');
    var cell = grid.children[sel - winStart];
    if (cell) {
      if (checked[k]) cell.classList.add('checked');
      else cell.classList.remove('checked');
    }
    UI.setTitle(selectMode.title, Object.keys(checked).length + ' selected');
  }

  function selectDone() {
    var items = checkedPhotos();
    var cfg = selectMode;
    if (cfg.min && items.length < cfg.min) {
      UI.toast('Select at least ' + cfg.min + ' photos');
      return;
    }
    endSelect(true);
    render();
    cfg.onDone(items);
  }

  function activateTabs() {
    if (selectMode || tabActive) return;
    tabActive = true;
    renderTabs();
  }

  function activateTab() {
    var t = tabSel;
    tabActive = false;
    if (t === 2) {
      setView('favorites');
    } else if (t === 1) {
      renderTabs();
      UI.showAlbums();
    } else {
      setView('all');
    }
  }

  function tabKey(key) {
    if (key === 'ArrowLeft') {
      tabSel = (tabSel + 2) % 3;
      renderTabs();
      return true;
    }
    if (key === 'ArrowRight') {
      tabSel = (tabSel + 1) % 3;
      renderTabs();
      return true;
    }
    if (key === 'ArrowDown') {
      tabActive = false;
      renderTabs();
      return true;
    }
    if (key === 'Enter') {
      activateTab();
      return true;
    }
    if (key === 'Backspace') {
      tabActive = false;
      renderTabs();
      return true;
    }
    return false;
  }

  function handleKey(key) {
    /* Tab shortcuts: 1 = Photos, 2 = Albums, 3 = Favorites (gallery only). */
    if ((key === '1' || key === '2' || key === '3') && !selectMode) {
      tabSel = key === '1' ? 0 : key === '2' ? 1 : 2;
      tabActive = false;
      activateTab();
      return true;
    }
    if (tabActive) {
      return tabKey(key);
    }
    if (selectMode) {
      switch (key) {
        case 'ArrowUp': move(-1, 0); return true;
        case 'ArrowDown': move(1, 0); return true;
        case 'ArrowLeft': move(0, -1); return true;
        case 'ArrowRight': move(0, 1); return true;
        case 'Enter': toggleCheck(); return true;
        case 'SoftLeft':
          if (window.Collage && Collage.handleSelectCancel()) return true;
          if (window.Pick && Pick.active()) { Pick.backToSingle(); return true; }
          endSelect(); render(); App.updateSoftkeys(); return true;
        case 'SoftRight':
          if (window.Pick && Pick.active()) { Pick.rightKey(); return true; }
          UI.showSelectActions(); return true;
        case 'Backspace':
          if (window.Collage && Collage.handleSelectCancel()) return true;
          if (window.Pick && Pick.active()) { Pick.backToSingle(); return true; }
          endSelect(); render(); App.updateSoftkeys(); return true;
      }
      return false;
    }
    if (window.Pick && Pick.active()) {
      /* pick single-select: OK chooses one photo, RSK Done returns it */
      switch (key) {
        case 'ArrowUp': move(-1, 0); return true;
        case 'ArrowDown': move(1, 0); return true;
        case 'ArrowLeft': move(0, -1); return true;
        case 'ArrowRight': move(0, 1); return true;
        case 'Enter': {
          var p = getSelected();
          if (p) Pick.selectSingle(p);
          return true;
        }
        case 'SoftLeft': Pick.cancel(); return true;
        case 'SoftRight':
          if (Pick.hasSingle()) Pick.finish([Pick.getSingle()]);
          else Pick.showOptions();
          return true;
        case 'Backspace': Pick.cancel(); return true;
      }
      return false;
    }
    switch (key) {
      case 'ArrowUp': move(-1, 0); return true;
      case 'ArrowDown': move(1, 0); return true;
      case 'ArrowLeft': move(0, -1); return true;
      case 'ArrowRight': move(0, 1); return true;
      case 'Enter': {
        var p = getSelected();
        if (p) {
          saveLast();
          Viewer.openList(list, sel);
        }
        return true;
      }
      case 'SoftLeft': App.openCamera(); return true;
      case 'SoftRight': UI.showOptions(); return true;
      case 'Backspace':
        if (view.type !== 'all') {
          setView('all');
          return true;
        }
        return false;
    }
    return false;
  }

  return {
    setPhotos: setPhotos,
    setTrashPhotos: setTrashPhotos,
    setPrivatePhotos: setPrivatePhotos,
    render: render,
    applyViewAndRender: applyViewAndRender,
    getSelected: getSelected,
    getList: function () { return list; },
    getIndex: function () { return sel; },
    setView: setView,
    getView: getView,
    folders: folders,
    folderCount: folderCount,
    removePhoto: removePhoto,
    removePhotoSilent: removePhotoSilent,
    renamePhoto: renamePhoto,
    saveLast: saveLast,
    loadLast: loadLast,
    handleKey: handleKey,
    countAll: function () { return photos.length; },
    getPhotos: function () { return photos; },
    startSelect: startSelect,
    endSelect: endSelect,
    isSelectMode: isSelectMode,
    checkedPhotos: checkedPhotos,
    selectDone: selectDone,
    trashCount: function () { return trashPhotos.length; }
  };
})();
