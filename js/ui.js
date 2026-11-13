/* ui.js - menus, dialogs (input-row model), info, settings, flows. ES5 only. */
var UI = (function () {
  var mode = 'gallery'; /* gallery | viewer | info */
  var APP_VERSION = '2.4.0';
  var overlay = null;   /* null | menu | dialog | settings */
  var returnMode = 'gallery';

  /* ----- generic menu ----- */
  var menuItems = [];
  var menuSel = 0;
  var menuOnPick = null;

  /* ----- dialog: focusable rows (input row and/or buttons) ----- */
  var dialogItems = []; /* {type:'input'} | {type:'button',label,value} */
  var dialogSel = 0;
  var dialogOnPick = null;

  /* ----- settings ----- */
  var settingDefs = [
    { key: 'thumbSize', label: 'Thumbnail Size', values: ['small', 'medium', 'large'] },
    { key: 'sort', label: 'Sort Order', values: ['newest', 'oldest', 'name-az', 'name-za'],
      fmt: function (v) {
        return v === 'newest' ? 'Newest first' : v === 'oldest' ? 'Oldest first' :
               v === 'name-az' ? 'Name A-Z' : 'Name Z-A';
      } },
    { key: 'slideshow', label: 'Slideshow Interval', values: [3, 5, 10],
      fmt: function (v) { return v + ' seconds'; } },
    { key: 'theme', label: 'Theme', values: ['dark', 'light'],
      fmt: function (v) { return v === 'dark' ? 'Dark' : 'Light'; } },
    { key: 'startup', label: 'Startup', values: ['gallery', 'last'],
      fmt: function (v) { return v === 'gallery' ? 'Gallery' : 'Last Location'; } },
    { key: 'pin', label: 'PIN Lock',
      action: function (done) { Lock.managePin(done); } },
    { key: 'privatePin', label: 'Private Folder PIN',
      action: function (done) { Lock.managePrivatePin(done); } }
  ];
  var setSel = 0;

  /* ================= base ================= */
  function setMode(m) { mode = m; }
  function getMode() { return mode; }
  function overlayActive() { return overlay !== null; }

  function showScreen(id) {
    var ss = document.querySelectorAll('.screen');
    for (var i = 0; i < ss.length; i++) ss[i].classList.add('hidden');
    Utils.$(id).classList.remove('hidden');
  }

  function setTitle(t, c) {
    Utils.$('title').textContent = t;
    Utils.$('count').textContent = c;
  }

  function setSoftkeys(l, c, r) {
    Utils.$('sk-left').textContent = l || '';
    Utils.$('sk-center').textContent = c || '';
    Utils.$('sk-right').textContent = r || '';
  }

  var toastTimer = null;
  function toast(msg) {
    var t = Utils.$('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.add('hidden');
    }, 2200);
  }

  function scrollMenuItem() {
    var ml = Utils.$('menu-list');
    var kids = ml.children;
    var idx = overlay === 'settings' ? setSel : menuSel;
    var node = kids[idx];
    if (node && node.scrollIntoView) {
      try {
        node.scrollIntoView(false);
      } catch (e) {}
    }
  }

  /* ================= menu ================= */
  function showMenu(title, items, onPick, hint) {
    menuItems = [];
    for (var i = 0; i < items.length; i++) {
      if (!items[i].hidden) menuItems.push(items[i]);
    }
    if (!menuItems.length) {
      toast('Nothing to show');
      return;
    }
    menuSel = 0;
    menuOnPick = onPick || null;
    Utils.$('menu-title').textContent = title || 'Options';
    var h = Utils.$('menu-hint');
    if (hint) {
      h.textContent = hint;
      h.classList.remove('hidden');
    } else {
      h.classList.add('hidden');
    }
    renderMenu();
    Utils.$('menu').classList.remove('hidden');
    Utils.$('menu-list').scrollTop = 0;
    scrollMenuItem();
    overlay = 'menu';
    setSoftkeys('', 'Select', '');
  }

  function renderMenu() {
    var ml = Utils.$('menu-list');
    ml.innerHTML = '';
    for (var i = 0; i < menuItems.length; i++) {
      ml.appendChild(Utils.el('div', 'menu-item' + (i === menuSel ? ' focus' : ''), menuItems[i].label));
    }
    scrollMenuItem();
  }

  function closeMenu() {
    Utils.$('menu').classList.add('hidden');
    overlay = null;
    menuOnPick = null;
    App.updateSoftkeys();
  }

  function menuKey(key) {
    if (key === 'ArrowUp') {
      menuSel = (menuSel - 1 + menuItems.length) % menuItems.length;
      renderMenu();
      return true;
    }
    if (key === 'ArrowDown') {
      menuSel = (menuSel + 1) % menuItems.length;
      renderMenu();
      return true;
    }
    if (key === 'Enter') {
      var it = menuItems[menuSel];
      var cb = menuOnPick;
      var val = it ? it.value : null;
      closeMenu();
      if (cb) cb(val, it);
      else if (it && it.action) it.action();
      return true;
    }
    if (key === 'Backspace' || key === 'SoftRight') {
      closeMenu();
      return true;
    }
    return false;
  }

  /* ================= dialog ================= */
  /* opts: {title, msg, input, inputValue, buttons:[{label,value}], defaultBtn, onPick(value, inputValue)} */
  function showDialog(opts) {
    Utils.$('dialog-title').textContent = opts.title || '';
    Utils.$('dialog-msg').textContent = opts.msg || '';
    dialogItems = [];
    if (opts.input) {
      dialogItems.push({ type: 'input' });
      Utils.$('dialog-input').value = opts.inputValue || '';
      Utils.$('dialog-inputval').textContent = opts.inputValue || '';
      Utils.$('dialog-inputrow').classList.remove('hidden');
      Utils.$('dialog-input').classList.add('hidden');
    } else {
      Utils.$('dialog-inputrow').classList.add('hidden');
      Utils.$('dialog-input').classList.add('hidden');
      Utils.$('dialog-input').value = '';
    }
    for (var i = 0; i < opts.buttons.length; i++) {
      dialogItems.push({ type: 'button', label: opts.buttons[i].label, value: opts.buttons[i].value });
    }
    dialogSel = opts.input ? 0 : (opts.defaultBtn || 0);
    dialogOnPick = opts.onPick || null;
    renderDialog();
    Utils.$('dialog').classList.remove('hidden');
    overlay = 'dialog';
    setSoftkeys('', 'OK', '');
    /* NOTE: input is NOT auto-focused. User presses OK on the input row to edit. */
  }

  function renderDialog() {
    var row = Utils.$('dialog-inputrow');
    if (dialogItems.length && dialogItems[0].type === 'input') {
      if (dialogSel === 0) row.classList.add('focus');
      else row.classList.remove('focus');
    }
    var box = Utils.$('dialog-btns');
    box.innerHTML = '';
    for (var i = 0; i < dialogItems.length; i++) {
      if (dialogItems[i].type !== 'button') continue;
      box.appendChild(Utils.el('div',
        'dlg-btn' + (i === dialogSel ? ' focus' : ''),
        dialogItems[i].label));
    }
  }

  function closeDialog() {
    Utils.$('dialog').classList.add('hidden');
    overlay = null;
    dialogOnPick = null;
    dialogItems = [];
    var ae = document.activeElement;
    if (ae && ae.blur) {
      try {
        ae.blur();
      } catch (e) {}
    }
    App.updateSoftkeys();
  }

  /* Move the real input's value back to the display row. */
  function finishInputEdit(navKey) {
    var inp = Utils.$('dialog-input');
    Utils.$('dialog-inputval').textContent = inp.value;
    inp.classList.add('hidden');
    Utils.$('dialog-inputrow').classList.remove('hidden');
    try {
      inp.blur();
    } catch (e) {}
    if (navKey === 'ArrowUp') {
      dialogSel = (dialogSel - 1 + dialogItems.length) % dialogItems.length;
    } else if (navKey === 'ArrowDown') {
      dialogSel = (dialogSel + 1) % dialogItems.length;
    }
    renderDialog();
  }

  function dialogKey(key) {
    if (key === 'ArrowUp') {
      dialogSel = (dialogSel - 1 + dialogItems.length) % dialogItems.length;
      renderDialog();
      return true;
    }
    if (key === 'ArrowDown') {
      dialogSel = (dialogSel + 1) % dialogItems.length;
      renderDialog();
      return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      /* left/right also move between buttons */
      if (dialogItems[dialogSel] && dialogItems[dialogSel].type === 'button') {
        dialogSel = (dialogSel + (key === 'ArrowRight' ? 1 : -1) + dialogItems.length) % dialogItems.length;
        if (dialogItems[dialogSel].type !== 'button') {
          dialogSel = (dialogSel + (key === 'ArrowRight' ? 1 : -1) + dialogItems.length) % dialogItems.length;
        }
        renderDialog();
      }
      return true;
    }
    if (key === 'Enter') {
      var it = dialogItems[dialogSel];
      if (it && it.type === 'input') {
        /* open the system text editor */
        var inp = Utils.$('dialog-input');
        inp.value = Utils.$('dialog-inputval').textContent;
        Utils.$('dialog-inputrow').classList.add('hidden');
        inp.classList.remove('hidden');
        try {
          inp.focus();
        } catch (e) {}
        return true;
      }
      var cb = dialogOnPick;
      var v = it ? it.value : null;
      var iv = Utils.$('dialog-inputval').textContent;
      closeDialog();
      if (cb) cb(v, iv);
      return true;
    }
    if (key === 'Backspace' || key === 'SoftRight') {
      var cb2 = dialogOnPick;
      closeDialog();
      if (cb2) cb2(null, null);
      return true;
    }
    return false;
  }

  function handleOverlayKey(key) {
    if (overlay === 'menu') return menuKey(key);
    if (overlay === 'dialog') return dialogKey(key);
    if (overlay === 'settings') return settingsKey(key);
    return false;
  }

  /* ================= options ================= */
  function exitApp() {
    try {
      window.close();
    } catch (e) {}
  }

  function currentPhoto() {
    return mode === 'viewer' ? Viewer.current() : Gallery.getSelected();
  }

  function inTrashView() {
    return mode !== 'viewer' && Gallery.getView().type === 'trash';
  }

  function inPrivateView() {
    return mode !== 'viewer' && Gallery.getView().type === 'private';
  }

  function isTrashPhoto(p) {
    return !!(p && p.name && p.name.indexOf(StorageMod.TRASH_DIR) === 0);
  }

  function isPrivatePhoto(p) {
    return !!(p && p.name && p.name.indexOf(StorageMod.PRIVATE_DIR) === 0);
  }

  function showOptions() {
    var p = currentPhoto();
    if (Viewer.isPreview && Viewer.isPreview()) {
      toast('Save or Discard first');
      return;
    }
    var trashCtx = inTrashView() || isTrashPhoto(p);
    var privCtx = !trashCtx && (inPrivateView() || isPrivatePhoto(p));
    var items;
    if (trashCtx) {
      items = [
        { label: 'Restore', hidden: !p, action: function () { restoreFlow(p); } },
        { label: 'Delete Forever', hidden: !p, action: function () { deleteForeverFlow(p); } },
        { label: 'Empty Trash', action: function () { emptyTrashFlow(); } },
        { label: 'Image Info', hidden: !p, action: function () { showInfo(p); } },
        { label: 'Exit', action: function () { exitApp(); } }
      ];
    } else if (privCtx) {
      items = [
        { label: 'Open', hidden: !(mode === 'gallery' && p), action: function () {
            Gallery.saveLast();
            Viewer.openList(Gallery.getList(), Gallery.getIndex());
          } },
        { label: 'Unhide', hidden: !p, action: function () { unhideFlow(p); } },
        { label: 'Image Info', hidden: !p, action: function () { showInfo(p); } },
        { label: 'Delete', hidden: !p, action: function () { deleteFlow(p); } },
        { label: 'Exit', action: function () { exitApp(); } }
      ];
    } else {
      var ext = (typeof Viewer.isExternal === 'function' && Viewer.isExternal());
      var favLabel = (p && Favorites.isFav(p)) ? 'Unfavorite' : 'Favorite';
      items = [
        { label: 'Open', hidden: !(mode === 'gallery' && p), action: function () {
            Gallery.saveLast();
            Viewer.openList(Gallery.getList(), Gallery.getIndex());
          } },
        { label: favLabel, hidden: !p || ext, action: function () {
            var now = Favorites.toggle(p);
            toast(now ? 'Added to Favorites' : 'Removed from Favorites');
            Gallery.render();
          } },
        { label: 'Image Info', hidden: !p, action: function () { showInfo(p); } },
        { label: 'Edit', hidden: !p || ext, action: function () { Editor.open(p); } },
        { label: 'Set as', hidden: !p || ext, action: function () { showSetAs(p); } },
        { label: 'Slideshow', hidden: !p, action: function () {
            if (mode !== 'viewer') Viewer.openList(Gallery.getList(), Gallery.getIndex());
            Viewer.startSlideshow();
          } },
        { label: 'Rename', hidden: !p || ext, action: function () { renameFlow(p); } },
        { label: 'Move to Private', hidden: !p || ext, action: function () { privateFlow(p); } },
        { label: 'Delete', hidden: !p || ext, action: function () { deleteFlow(p); } },
        { label: 'Share', hidden: !p || !App.canShare(), action: function () { shareFlow(p); } },
        { label: 'Select Multiple', hidden: mode !== 'gallery', action: function () { startMultiSelect(); } },
        { label: 'Sort', action: function () { showSortMenu(); } },
        { label: 'Trash', action: function () { Gallery.setView('trash', '', ''); } },
        { label: 'Private', action: function () { openPrivate(); } },
        { label: 'Search', action: function () { showSearch(); } },
        { label: 'Settings', action: function () { showSettings(); } },
        { label: 'Refresh', action: function () { App.refreshGallery(); } },
        { label: 'About', action: function () { showAbout(); } },
        { label: 'Help', action: function () { showHelp(); } },
        { label: 'Exit', action: function () { exitApp(); } }
      ];
    }
    showMenu('Options', items);
  }

  /* ================= info ================= */
  function showInfo(p) {
    returnMode = mode;
    var rows = Utils.$('info-rows');
    rows.innerHTML = '';
    rows.scrollTop = 0;
    var resEl = null;
    function add(k, v) {
      var d = Utils.el('div', 'info-row');
      d.appendChild(Utils.el('div', 'k', k));
      var vv = Utils.el('div', 'v', v);
      d.appendChild(vv);
      rows.appendChild(d);
      return vv;
    }
    add('Name', Utils.fileNameOf(p.name));
    add('Type', (Utils.extOf(p.name) || 'unknown').toUpperCase());
    add('Size', p.size ? Utils.formatSize(p.size) : 'Unknown');
    resEl = add('Resolution', 'Loading...');
    var folder = p.store ? p.store : 'shared';
    if (Utils.folderOf(p.name)) folder += '/' + Utils.folderOf(p.name);
    add('Folder', folder);
    add('Date', p.date ? Utils.formatDate(new Date(p.date)) : 'Unknown');
    if (p.orig && p.orig.name) add('Original', p.orig.name);

    var setRes = function (t) {
      if (resEl) resEl.textContent = t;
    };
    var withBlob = function (blob) {
      if (!blob) {
        setRes('Unknown');
        return;
      }
      var u = null;
      try {
        u = URL.createObjectURL(blob);
      } catch (e) {
        setRes('Unknown');
        return;
      }
      var im = new Image();
      im.onload = function () {
        setRes(im.naturalWidth + ' x ' + im.naturalHeight);
        try {
          URL.revokeObjectURL(u);
        } catch (e2) {}
      };
      im.onerror = function () {
        setRes('Unknown');
        try {
          URL.revokeObjectURL(u);
        } catch (e3) {}
      };
      im.src = u;
    };
    if (p.external) withBlob(p.blob);
    else StorageMod.getBlob(p, withBlob);

    setMode('info');
    showScreen('screen-info');
    setSoftkeys('', '', '');
  }

  /* ================= about / help ================= */
  function showTextScreen(id, modeName) {
    returnMode = mode;
    setMode(modeName);
    showScreen(id);
    setSoftkeys('', '', '');
  }

  function showAbout() {
    Utils.$('about-version').textContent = 'Version ' + APP_VERSION;
    Utils.$('about-body').scrollTop = 0;
    showTextScreen('screen-about', 'about');
  }

  function showHelp() {
    Utils.$('help-body').scrollTop = 0;
    showTextScreen('screen-help', 'help');
  }

  function textKey(key) {
    if (key === 'Backspace') {
      setMode(returnMode);
      showScreen(returnMode === 'viewer' ? 'screen-viewer' : 'screen-gallery');
      if (returnMode === 'gallery') Gallery.render();
      else Viewer.updateBar();
      App.updateSoftkeys();
      return true;
    }
    var body = Utils.$(mode === 'about' ? 'about-body' : 'help-body');
    if (key === 'ArrowUp') {
      body.scrollTop -= 48;
      return true;
    }
    if (key === 'ArrowDown') {
      body.scrollTop += 48;
      return true;
    }
    return false;
  }

  function infoKey(key) {
    if (key === 'Backspace') {
      setMode(returnMode);
      showScreen(returnMode === 'viewer' ? 'screen-viewer' : 'screen-gallery');
      if (returnMode === 'gallery') Gallery.render();
      else Viewer.updateBar();
      App.updateSoftkeys();
      return true;
    }
    if (key === 'ArrowUp') {
      Utils.$('info-rows').scrollTop -= 48;
      return true;
    }
    if (key === 'ArrowDown') {
      Utils.$('info-rows').scrollTop += 48;
      return true;
    }
    return false;
  }

  /* ================= delete / trash ================= */
  function deleteFlow(p) {
    if (isTrashPhoto(p)) {
      deleteForeverFlow(p);
      return;
    }
    var name = Utils.fileNameOf(p.name);
    showDialog({
      title: 'Move to Trash?',
      msg: '"' + name + '" will be moved to Trash. You can restore it later.',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Move', value: 'ok' }],
      defaultBtn: 0,
      onPick: function (v) {
        if (v !== 'ok') return;
        StorageMod.trashPhoto(p, function (ok) {
          if (!ok) {
            toast('Unable to move to trash.');
            return;
          }
          afterRemove(p);
          toast('Moved to Trash');
        });
      }
    });
  }

  function deleteForeverFlow(p) {
    var name = Utils.fileNameOf(p.name);
    showDialog({
      title: 'Delete Forever?',
      msg: '"' + name + '" will be permanently deleted.',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete', value: 'ok' }],
      defaultBtn: 0,
      onPick: function (v) {
        if (v !== 'ok') return;
        StorageMod.remove(p, function (ok) {
          if (!ok) {
            toast('Unable to delete image.');
            return;
          }
          if (mode === 'viewer') Viewer.removeCurrentAndNext();
          refreshTrashView();
          toast('Deleted forever');
        });
      }
    });
  }

  function restoreFlow(p) {
    StorageMod.restoreTrash(p, function (ok) {
      if (!ok) {
        toast('Restore failed.');
        return;
      }
      if (mode === 'viewer') Viewer.removeCurrentAndNext();
      refreshTrashView();
      App.refreshGallery();
      toast('Restored');
    });
  }

  function emptyTrashFlow() {
    showDialog({
      title: 'Empty Trash?',
      msg: 'All trashed photos will be permanently deleted.',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Empty', value: 'ok' }],
      defaultBtn: 0,
      onPick: function (v) {
        if (v !== 'ok') return;
        StorageMod.emptyTrash(function () {
          refreshTrashView();
          toast('Trash emptied');
        });
      }
    });
  }

  function refreshTrashView() {
    StorageMod.listTrash(function (items) {
      Gallery.setTrashPhotos(items);
    });
  }

  function refreshPrivateView() {
    StorageMod.listPrivate(function (items) {
      Gallery.setPrivatePhotos(items);
    });
  }

  function afterRemove(p) {
    /* photo moved to trash/private: drop from main list, fix viewer */
    if (mode === 'viewer') Viewer.removeCurrentAndNext();
    Gallery.removePhoto(p);
  }

  /* ================= private folder ================= */
  function openPrivate() {
    if (!Lock.isPrivatePinSet()) {
      showDialog({
        title: 'Private Folder',
        msg: 'Set a 4-digit PIN to use the Private Folder.',
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Set PIN', value: 'ok' }],
        defaultBtn: 1,
        onPick: function (v) {
          if (v !== 'ok') return;
          Lock.show('set', function (ok) {
            if (ok) openPrivate();
          }, 'private');
        }
      });
      return;
    }
    Lock.show('private', function (ok) {
      if (ok) Gallery.setView('private');
    });
  }

  function privateFlow(p) {
    if (!Lock.isPrivatePinSet()) {
      showDialog({
        title: 'Private Folder',
        msg: 'Set a 4-digit PIN first to hide photos.',
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Set PIN', value: 'ok' }],
        defaultBtn: 1,
        onPick: function (v) {
          if (v !== 'ok') return;
          Lock.show('set', function (ok) {
            if (ok) privateFlow(p);
          }, 'private');
        }
      });
      return;
    }
    var name = Utils.fileNameOf(p.name);
    showDialog({
      title: 'Move to Private?',
      msg: '"' + name + '" will be hidden in the Private Folder.',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Hide', value: 'ok' }],
      defaultBtn: 0,
      onPick: function (v) {
        if (v !== 'ok') return;
        StorageMod.privatize(p, function (ok) {
          if (!ok) {
            toast('Unable to hide photo.');
            return;
          }
          afterRemove(p);
          toast('Moved to Private');
        });
      }
    });
  }

  function unhideFlow(p) {
    StorageMod.unhide(p, function (ok) {
      if (!ok) {
        toast('Unhide failed.');
        return;
      }
      if (mode === 'viewer') Viewer.removeCurrentAndNext();
      refreshPrivateView();
      App.refreshGallery();
      toast('Photo is visible again');
    });
  }

  /* ================= multi-select ================= */
  function startMultiSelect() {
    Gallery.startSelect({
      title: 'Select photos',
      onDone: null
    });
    Gallery.selectConfig = {
      actions: [
        { label: 'Share Selected', value: 'share' },
        { label: 'Delete Selected', value: 'del' },
        { label: 'Favorite Selected', value: 'fav' }
      ]
    };
    toast('OK: select - Right key: actions');
  }

  function showSelectActions() {
    var cfg = Gallery.selectConfig || { actions: [] };
    var n = Gallery.checkedPhotos().length;
    var items = [];
    for (var i = 0; i < cfg.actions.length; i++) {
      items.push({ label: cfg.actions[i].label + ' (' + n + ')', value: cfg.actions[i].value });
    }
    if (cfg.createLabel) {
      items.push({ label: cfg.createLabel + ' (' + n + ')', value: '__create' });
    }
    items.push({ label: 'Cancel', value: '__cancel' });
    showMenu('Selected', items, function (v) {
      if (v === 'share') multiShare();
      else if (v === 'del') multiDelete();
      else if (v === 'fav') multiFavorite();
      else if (v === '__create' && cfg.onCreate) {
        var items2 = Gallery.checkedPhotos();
        Gallery.endSelect();
        Gallery.render();
        cfg.onCreate(items2);
      } else {
        Gallery.endSelect();
        Gallery.render();
        App.updateSoftkeys();
      }
    });
  }

  function multiDelete() {
    var items = Gallery.checkedPhotos();
    if (!items.length) {
      Gallery.endSelect();
      Gallery.render();
      return;
    }
    showDialog({
      title: 'Move to Trash?',
      msg: items.length + ' photos will be moved to Trash.',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Move', value: 'ok' }],
      defaultBtn: 0,
      onPick: function (v) {
        Gallery.endSelect();
        if (v !== 'ok') {
          Gallery.render();
          return;
        }
        var i = 0;
        var fails = 0;
        function next() {
          if (i >= items.length) {
            Gallery.render();
            toast(fails ? fails + ' failed' : items.length + ' moved to Trash');
            return;
          }
          var p = items[i++];
          StorageMod.trashPhoto(p, function (ok) {
            if (!ok) fails++;
            else Gallery.removePhotoSilent(p);
            next();
          });
        }
        next();
      }
    });
  }

  function multiFavorite() {
    var items = Gallery.checkedPhotos();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (!Favorites.isFav(items[i])) {
        Favorites.toggle(items[i]);
        n++;
      }
    }
    Gallery.endSelect();
    Gallery.render();
    toast(n + ' added to Favorites');
  }

  /* User pressed Back in a system sheet (share/camera/...): stay silent. */
  function isActivityCancel(act) {
    var name = '';
    try { name = act && act.error ? act.error.name : ''; } catch (e) {}
    return name === 'ActivityCanceled' || name === 'USER_ABORT';
  }

  function multiShare() {
    var items = Gallery.checkedPhotos();
    if (!items.length) {
      Gallery.endSelect();
      Gallery.render();
      return;
    }
    var blobs = [];
    var names = [];
    var paths = [];
    var loadOne = function (idx) {
      if (idx >= items.length) {
        if (!blobs.length) {
          Gallery.endSelect();
          Gallery.render();
          toast('Unable to read images.');
          return;
        }
        try {
          var act = new MozActivity({
            name: 'share',
            /* Gaia Gallery sends the wildcard type, not a specific MIME:
               filter-side 'image/*' handlers only match a wildcard request. */
            data: { type: 'image/*', number: blobs.length, blobs: blobs, filenames: names, filepaths: paths }
          });
          act.onerror = function () {
            if (isActivityCancel(act)) return; /* Back from the share sheet: silent */
            toast('Share not available.');
          };
        } catch (e) {
          toast('Share not available.');
        }
        Gallery.endSelect();
        Gallery.render();
        App.updateSoftkeys();
        return;
      }
      StorageMod.getBlob(items[idx], function (blob) {
        if (blob) {
          blobs.push(blob);
          names.push(Utils.fileNameOf(items[idx].name));
          paths.push(items[idx].name);
        }
        loadOne(idx + 1);
      });
    };
    loadOne(0);
  }

  /* ================= rename ================= */
  function renameFlow(p) {
    var fname = Utils.fileNameOf(p.name);
    var base = Utils.baseOf(fname);
    var ext = Utils.extOf(fname);
    var dir = Utils.dirOf(p.name);
    showDialog({
      title: 'Rename',
      msg: 'OK on the name to edit, then choose Rename.',
      input: true,
      inputValue: base,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Rename', value: 'ok' }],
      onPick: function (v, iv) {
        if (v !== 'ok') return;
        var nn = (iv || '').replace(/^\s+|\s+$/g, '');
        if (!nn) {
          toast('Name cannot be empty.');
          return;
        }
        if (Utils.INVALID_NAME.test(nn)) {
          toast('Invalid characters in name.');
          return;
        }
        var typedExt = Utils.extOf(nn);
        var finalBase = typedExt ? nn : nn + '.' + ext;
        if (typedExt && Utils.IMAGE_EXTS.indexOf(typedExt) < 0) {
          toast('Unsupported extension.');
          return;
        }
        var finalPath = dir ? dir + '/' + Utils.fileNameOf(finalBase) : Utils.fileNameOf(finalBase);
        if (finalPath === p.name) return;
        var all = Gallery.getPhotos();
        for (var i = 0; i < all.length; i++) {
          if (all[i].store === p.store && all[i].name === finalPath) {
            toast('A file with this name already exists.');
            return;
          }
        }
        StorageMod.rename(p, finalPath, function (ok) {
          if (!ok) {
            toast('Rename failed.');
            return;
          }
          Gallery.renamePhoto(p, finalPath);
          toast('Renamed');
        });
      }
    });
  }

  /* ================= share ================= */
  function shareFlow(p) {
    var go = function (blob) {
      if (!blob) {
        toast('Unable to read image.');
        return;
      }
      try {
        var act = new MozActivity({
          name: 'share',
          data: {
            /* Gaia Gallery sends the wildcard type, not a specific MIME:
               filter-side 'image/*' handlers only match a wildcard request. */
            type: 'image/*',
            number: 1,
            blobs: [blob],
            filenames: [Utils.fileNameOf(p.name)],
            filepaths: [p.name]
          }
        });
        act.onerror = function () {
          if (isActivityCancel(act)) return; /* Back from the share sheet: silent */
          toast('Share not available.');
        };
      } catch (e) {
        toast('Share not available.');
      }
    };
    if (p.external) go(p.blob);
    else StorageMod.getBlob(p, go);
  }

  /* ================= set as ================= */
  function showSetAs(p) {
    showMenu('Set as', [
      { label: 'Wallpaper', value: 'wallpaper' },
      { label: 'Existing contact', value: 'contact' }
    ], function (v) {
      if (v === 'wallpaper') setWallpaper(p);
      else if (v === 'contact') setContactPhoto(p);
    });
  }

  function setWallpaper(p) {
    StorageMod.getBlob(p, function (blob) {
      if (!blob) {
        toast('Unable to read image.');
        return;
      }
      trySetWallpaper(blob, 'setwallpaper');
    });
  }

  /* KaiOS 2.5 uses 'setwallpaper', KaiOS 3.0 uses 'set-wallpaper'. */
  function trySetWallpaper(blob, name) {
    if (typeof MozActivity === 'undefined') {
      toast('Wallpaper not available');
      return;
    }
    try {
      var act = new MozActivity({
        name: name,
        data: { blobs: [blob], type: 'image/*', number: 1 }
      });
      act.onsuccess = function () {
        toast('Wallpaper set');
      };
      act.onerror = function () {
        var errName = '';
        try { errName = act.error ? act.error.name : ''; } catch (e) {}
        if (errName === 'ActivityCanceled' || errName === 'USER_ABORT') return;
        if (errName === 'NO_PROVIDER' && name === 'setwallpaper') {
          trySetWallpaper(blob, 'set-wallpaper');
          return;
        }
        toast('Wallpaper not available');
      };
    } catch (e) {
      toast('Wallpaper not available');
    }
  }

  function setContactPhoto(p) {
    if (typeof MozActivity === 'undefined') {
      toast('Contacts not available');
      return;
    }
    StorageMod.getBlob(p, function (blob) {
      if (!blob) {
        toast('Unable to read image.');
        return;
      }
      var act;
      try {
        act = new MozActivity({
          name: 'pick',
          data: { type: ['webcontacts/contact'] }
        });
      } catch (e) {
        toast('Contacts not available');
        return;
      }
      act.onsuccess = function () {
        var contact = act.result;
        if (contact && contact.contact) contact = contact.contact;
        saveContactPhoto(contact, blob);
      };
      act.onerror = function () {
        var errName = '';
        try { errName = act.error ? act.error.name : ''; } catch (e2) {}
        if (errName === 'ActivityCanceled' || errName === 'USER_ABORT') return;
        toast('Contacts not available');
      };
    });
  }

  function saveContactPhoto(contact, blob) {
    if (!contact) {
      toast('No contact selected');
      return;
    }
    if (!navigator.mozContacts) {
      toast('Contacts not available');
      return;
    }
    try {
      contact.photo = [blob];
      var req = navigator.mozContacts.save(contact);
      req.onsuccess = function () {
        toast('Contact photo set');
      };
      req.onerror = function () {
        toast('Could not set contact photo');
      };
    } catch (e) {
      toast('Could not set contact photo');
    }
  }

  /* ================= sort ================= */
  function showSortMenu() {
    var cur = Settings.get('sort');
    var items = [
      { label: (cur === 'newest' ? '* ' : '') + 'Newest first', value: 'newest' },
      { label: (cur === 'oldest' ? '* ' : '') + 'Oldest first', value: 'oldest' },
      { label: (cur === 'name-az' ? '* ' : '') + 'Name A-Z', value: 'name-az' },
      { label: (cur === 'name-za' ? '* ' : '') + 'Name Z-A', value: 'name-za' }
    ];
    showMenu('Sort', items, function (v) {
      if (!v) return;
      Settings.set('sort', v);
      Gallery.applyViewAndRender();
    });
  }

  /* ================= folders ================= */
  function showAlbums() {
    buildAlbumsMenu();
  }

  function buildAlbumsMenu() {
    var items = [];
    var fs = Gallery.folders();
    for (var i = 0; i < fs.length; i++) {
      items.push({ label: fs[i] + ' (' + Gallery.folderCount(fs[i]) + ')', value: { type: 'folder', folder: fs[i] } });
    }
    if (!items.length) {
      items.push({ label: 'No albums yet', value: null });
    }
    showMenu('Albums', items, function (v) {
      if (!v) return;
      Gallery.setView(v.type, v.folder || '', '');
    });
  }

  /* ================= search ================= */
  function showSearch() {
    showDialog({
      title: 'Search',
      msg: 'OK on the field to edit, then choose Search.',
      input: true,
      inputValue: Gallery.getView().type === 'search' ? Gallery.getView().query : '',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Search', value: 'ok' }],
      onPick: function (v, iv) {
        if (v !== 'ok') return;
        var q = (iv || '').replace(/^\s+|\s+$/g, '');
        if (!q) {
          Gallery.setView('all');
          return;
        }
        Gallery.setView('search', '', q);
      }
    });
  }

  /* ================= settings ================= */
  function fmtVal(d, v) {
    if (d.key === 'pin') return v ? 'On' : 'Off';
    if (d.key === 'privatePin') return v ? 'On' : 'Off';
    return d.fmt ? d.fmt(v) : v;
  }

  function showSettings() {
    setSel = 0;
    Utils.$('menu-title').textContent = 'Settings';
    renderSettings();
    Utils.$('menu').classList.remove('hidden');
    Utils.$('menu-list').scrollTop = 0;
    scrollMenuItem();
    overlay = 'settings';
    setSoftkeys('', 'OK', '');
  }

  function renderSettings() {
    var ml = Utils.$('menu-list');
    ml.innerHTML = '';
    for (var i = 0; i < settingDefs.length; i++) {
      var d = settingDefs[i];
      ml.appendChild(Utils.el('div', 'menu-item' + (i === setSel ? ' focus' : ''),
        d.label + ': ' + fmtVal(d, Settings.get(d.key))));
    }
    var h = Utils.$('menu-hint');
    h.textContent = 'Left/Right: change - Back: done';
    h.classList.remove('hidden');
    scrollMenuItem();
  }

  function applySettingsLive(k) {
    if (k === 'theme') App.applyTheme();
    if (k === 'thumbSize' || k === 'sort') Gallery.applyViewAndRender();
  }

  function cycleSetting(d, dir) {
    var vals = d.values;
    var cur = vals.indexOf(Settings.get(d.key));
    if (cur < 0) cur = 0;
    cur = (cur + dir + vals.length) % vals.length;
    Settings.set(d.key, vals[cur]);
    renderSettings();
    applySettingsLive(d.key);
  }

  function closeSettings() {
    Utils.$('menu').classList.add('hidden');
    Utils.$('menu-hint').classList.add('hidden');
    overlay = null;
    App.updateSoftkeys();
  }

  function settingsKey(key) {
    var d = settingDefs[setSel];
    if (key === 'ArrowUp') {
      setSel = (setSel - 1 + settingDefs.length) % settingDefs.length;
      renderSettings();
      return true;
    }
    if (key === 'ArrowDown') {
      setSel = (setSel + 1) % settingDefs.length;
      renderSettings();
      return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter') {
      if (d.action) {
        d.action(function () {
          renderSettings();
          App.updateSoftkeys();
        });
      } else {
        cycleSetting(d, (key === 'ArrowLeft') ? -1 : 1);
      }
      return true;
    }
    if (key === 'Backspace' || key === 'SoftRight') {
      closeSettings();
      return true;
    }
    return false;
  }

  function refreshSettings() {
    if (overlay === 'settings') renderSettings();
  }

  return {
    setMode: setMode,
    getMode: getMode,
    overlayActive: overlayActive,
    handleOverlayKey: handleOverlayKey,
    finishInputEdit: finishInputEdit,
    showScreen: showScreen,
    setTitle: setTitle,
    setSoftkeys: setSoftkeys,
    toast: toast,
    showMenu: showMenu,
    showOptions: showOptions,
    showInfo: showInfo,
    infoKey: infoKey,
    showAbout: showAbout,
    showHelp: showHelp,
    textKey: textKey,
    showAlbums: showAlbums,
    showSearch: showSearch,
    showSortMenu: showSortMenu,
    showSettings: showSettings,
    refreshSettings: refreshSettings,
    showSelectActions: showSelectActions,
    openPrivate: openPrivate
  };
})();
