/* storage.js - DeviceStorage access + trash/private helpers. ES5 only. */
var StorageMod = (function () {
  var STORE_NAMES = ['pictures', 'sdcard'];
  var TRASH_DIR = 'trash/';
  var PRIVATE_DIR = 'private/';
  var handles = {};

  function supported() {
    return !!(navigator && navigator.getDeviceStorage);
  }

  function init() {
    handles = {};
    if (!supported()) {
      Utils.log('DeviceStorage not supported');
      return false;
    }
    for (var i = 0; i < STORE_NAMES.length; i++) {
      try {
        handles[STORE_NAMES[i]] = navigator.getDeviceStorage(STORE_NAMES[i]);
        Utils.log('storage ok:', STORE_NAMES[i]);
      } catch (e) {
        Utils.log('storage init failed:', STORE_NAMES[i], e);
      }
    }
    return true;
  }

  function isSpecial(name) {
    return name.indexOf(TRASH_DIR) === 0 || name.indexOf(PRIVATE_DIR) === 0;
  }

  /* ---- map helpers (trash/private original locations) ---- */
  function mapLoad(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) {
      return {};
    }
  }
  function mapSave(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
    } catch (e) {}
  }
  var TRASHMAP_KEY = 'gallery.trashmap.v1';
  var PRIVMAP_KEY = 'gallery.privatemap.v1';

  /* Scan all stores. Skips trash/private dirs. onProgress(count), onDone(array). */
  function scan(onProgress, onDone) {
    var all = [];
    var names = STORE_NAMES.slice();
    function nextStore() {
      if (!names.length) {
        onDone(all);
        return;
      }
      var sname = names.shift();
      var store = handles[sname];
      if (!store) {
        nextStore();
        return;
      }
      var cursor = null;
      try {
        cursor = store.enumerate();
      } catch (e) {
        Utils.log('enumerate() threw for', sname, e);
        nextStore();
        return;
      }
      cursor.onsuccess = function () {
        var f = null;
        try {
          f = cursor.result;
        } catch (e) {
          f = null;
        }
        if (f) {
          if (f.name && !isSpecial(f.name) && Utils.isImageName(f.name)) {
            var d = 0;
            try {
              if (f.lastModifiedDate) d = f.lastModifiedDate.getTime();
            } catch (e2) {
              d = 0;
            }
            all.push({ store: sname, name: f.name, size: f.size || 0, date: d });
          }
          if (onProgress) {
            try {
              onProgress(all.length);
            } catch (e3) {}
          }
          try {
            cursor.continue();
          } catch (e4) {
            nextStore();
          }
        } else {
          nextStore();
        }
      };
      cursor.onerror = function () {
        Utils.log('enumerate error for', sname);
        nextStore();
      };
    }
    nextStore();
  }

  /* List trashed photos (both stores). */
  function listTrash(cb) {
    listSpecial(TRASH_DIR, TRASHMAP_KEY, cb);
  }

  function listPrivate(cb) {
    listSpecial(PRIVATE_DIR, PRIVMAP_KEY, cb);
  }

  /* List via our own localStorage index + direct get() per file.
     Does NOT depend on enumerate(), which on some devices never returns
     files inside app-created folders. Missing files are pruned. */
  function listSpecial(prefix, mapKey, cb) {
    var map = mapLoad(mapKey);
    var names = Object.keys(map);
    var out = [];
    var cleaned = false;
    function next(i) {
      if (i >= names.length) {
        if (cleaned) mapSave(mapKey, map);
        out.sort(function (a, b) {
          return b.date - a.date;
        });
        cb(out);
        return;
      }
      var nm = names[i];
      var info = map[nm] || {};
      var sname = info.store || STORE_NAMES[0];
      var store = handles[sname];
      if (!store) {
        delete map[nm];
        cleaned = true;
        next(i + 1);
        return;
      }
      var req = null;
      try {
        req = store.get(nm);
      } catch (e) {
        req = null;
      }
      if (!req) {
        delete map[nm];
        cleaned = true;
        next(i + 1);
        return;
      }
      req.onsuccess = function () {
        var f = req.result;
        if (f) {
          var d = 0;
          try {
            if (f.lastModifiedDate) d = f.lastModifiedDate.getTime();
          } catch (e2) {}
          out.push({
            store: sname,
            name: nm,
            size: f.size || 0,
            date: d,
            orig: { store: info.store, name: info.name }
          });
        } else {
          delete map[nm];
          cleaned = true;
        }
        next(i + 1);
      };
      req.onerror = function () {
        delete map[nm];
        cleaned = true;
        next(i + 1);
      };
    }
    next(0);
  }

  function getBlob(meta, cb) {
    var store = handles[meta.store];
    if (!store) {
      cb(null);
      return;
    }
    var req = null;
    try {
      req = store.get(meta.name);
    } catch (e) {
      cb(null);
      return;
    }
    req.onsuccess = function () {
      cb(req.result || null);
    };
    req.onerror = function () {
      Utils.log('get failed:', meta.name);
      cb(null);
    };
  }

  function remove(meta, cb) {
    var store = handles[meta.store];
    if (!store) {
      cb(false);
      return;
    }
    var req = null;
    try {
      req = store.delete(meta.name);
    } catch (e) {
      cb(false);
      return;
    }
    req.onsuccess = function () {
      cb(true);
    };
    req.onerror = function () {
      Utils.log('delete failed:', meta.name);
      cb(false);
    };
  }

  function addBlob(storeName, blob, name, cb) {
    var store = handles[storeName];
    if (!store) {
      cb(false);
      return;
    }
    var req = null;
    try {
      req = store.addNamed(blob, name);
    } catch (e) {
      cb(false);
      return;
    }
    req.onsuccess = function () {
      cb(true);
    };
    req.onerror = function () {
      Utils.log('addNamed failed:', name);
      cb(false);
    };
  }

  /* Copy to newName then delete old (move / rename). */
  function movePhoto(meta, newName, cb) {
    getBlob(meta, function (blob) {
      if (!blob) {
        cb(false);
        return;
      }
      addBlob(meta.store, blob, newName, function (ok) {
        if (!ok) {
          cb(false);
          return;
        }
        remove(meta, function (ok2) {
          cb(ok2);
        });
      });
    });
  }

  function rename(meta, newName, cb) {
    movePhoto(meta, newName, cb);
  }

  /* Overwrite same path with new blob (used by editor save). */
  function replacePhoto(meta, blob, cb) {
    remove(meta, function (ok) {
      if (!ok) {
        cb(false);
        return;
      }
      addBlob(meta.store, blob, meta.name, function (ok2) {
        cb(ok2);
      });
    });
  }

  /* ---- trash ---- */
  function trashPhoto(meta, cb) {
    var tname = TRASH_DIR + Date.now() + '_' + Utils.fileNameOf(meta.name);
    movePhoto(meta, tname, function (ok) {
      if (ok) {
        var m = mapLoad(TRASHMAP_KEY);
        m[tname] = { store: meta.store, name: meta.name };
        mapSave(TRASHMAP_KEY, m);
      }
      cb(ok);
    });
  }

  function restoreTrash(tmeta, cb) {
    var m = mapLoad(TRASHMAP_KEY);
    var orig = m[tmeta.name];
    var dest = (orig && orig.name) ? orig.name : Utils.fileNameOf(tmeta.name).replace(/^\d+_/, '');
    movePhoto(tmeta, dest, function (ok) {
      if (ok) {
        delete m[tmeta.name];
        mapSave(TRASHMAP_KEY, m);
      }
      cb(ok);
    });
  }

  function emptyTrash(cb) {
    listTrash(function (items) {
      var i = 0;
      var map = mapLoad(TRASHMAP_KEY);
      function next() {
        if (i >= items.length) {
          mapSave(TRASHMAP_KEY, {});
          cb(true);
          return;
        }
        var it = items[i++];
        remove(it, function () {
          delete map[it.name];
          next();
        });
      }
      next();
    });
  }

  /* ---- private ---- */
  function privatize(meta, cb) {
    var pname = PRIVATE_DIR + Date.now() + '_' + Utils.fileNameOf(meta.name);
    movePhoto(meta, pname, function (ok) {
      if (ok) {
        var m = mapLoad(PRIVMAP_KEY);
        m[pname] = { store: meta.store, name: meta.name };
        mapSave(PRIVMAP_KEY, m);
      }
      cb(ok);
    });
  }

  function unhide(pmeta, cb) {
    var m = mapLoad(PRIVMAP_KEY);
    var orig = m[pmeta.name];
    var dest = (orig && orig.name) ? orig.name : Utils.fileNameOf(pmeta.name).replace(/^\d+_/, '');
    movePhoto(pmeta, dest, function (ok) {
      if (ok) {
        delete m[pmeta.name];
        mapSave(PRIVMAP_KEY, m);
      }
      cb(ok);
    });
  }

  return {
    supported: supported,
    init: init,
    scan: scan,
    listTrash: listTrash,
    listPrivate: listPrivate,
    getBlob: getBlob,
    remove: remove,
    addBlob: addBlob,
    movePhoto: movePhoto,
    rename: rename,
    replacePhoto: replacePhoto,
    trashPhoto: trashPhoto,
    restoreTrash: restoreTrash,
    emptyTrash: emptyTrash,
    privatize: privatize,
    unhide: unhide,
    STORE_NAMES: STORE_NAMES,
    TRASH_DIR: TRASH_DIR,
    PRIVATE_DIR: PRIVATE_DIR
  };
})();
