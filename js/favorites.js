/* favorites.js - favorite flags stored locally (no file duplication). ES5 only. */
var Favorites = (function () {
  var KEY = 'gallery.favs.v1';
  var list = [];

  function key(p) {
    return p.store + '::' + p.name;
  }

  function load() {
    list = [];
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.length) list = s;
    } catch (e) {
      list = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function isFav(p) {
    return list.indexOf(key(p)) >= 0;
  }

  /* returns true if now favorited */
  function toggle(p) {
    var k = key(p);
    var i = list.indexOf(k);
    if (i >= 0) {
      list.splice(i, 1);
      save();
      return false;
    }
    list.push(k);
    save();
    return true;
  }

  /* drop entries whose photo no longer exists */
  function prune(existing) {
    var set = {};
    for (var i = 0; i < existing.length; i++) {
      set[key(existing[i])] = 1;
    }
    var kept = [];
    for (var j = 0; j < list.length; j++) {
      if (set[list[j]]) kept.push(list[j]);
    }
    if (kept.length !== list.length) {
      list = kept;
      save();
    }
  }

  function count() {
    return list.length;
  }

  return {
    load: load,
    isFav: isFav,
    toggle: toggle,
    prune: prune,
    count: count
  };
})();
