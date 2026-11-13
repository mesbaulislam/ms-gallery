/* settings.js - persisted user settings (localStorage). ES5 only. */
var Settings = (function () {
  var KEY = 'gallery.settings.v2';
  var defaults = {
    sort: 'newest',       /* newest | oldest | name-az | name-za */
    thumbSize: 'medium',  /* small | medium | large */
    theme: 'dark',        /* dark | light */
    slideshow: 5,         /* seconds: 3 | 5 | 10 */
    startup: 'gallery',   /* gallery | last */
    pin: null,            /* app lock: 4-digit string or null */
    privatePin: null      /* private folder lock: 4-digit string or null (separate from app lock) */
  };
  var data = {};

  function load() {
    data = {};
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {
      saved = null;
    }
    /* migrate v1 settings if present */
    if (!saved) {
      try {
        saved = JSON.parse(localStorage.getItem('gallery.settings.v1'));
      } catch (e2) {
        saved = null;
      }
    }
    for (var k in defaults) {
      if (saved && saved[k] !== undefined && saved[k] !== null) {
        data[k] = saved[k];
      } else {
        data[k] = defaults[k];
      }
    }
    if (['newest', 'oldest', 'name-az', 'name-za'].indexOf(data.sort) < 0) data.sort = 'newest';
    if (['small', 'medium', 'large'].indexOf(data.thumbSize) < 0) data.thumbSize = 'medium';
    if (['dark', 'light'].indexOf(data.theme) < 0) data.theme = 'dark';
    if ([3, 5, 10].indexOf(data.slideshow) < 0) data.slideshow = 5;
    if (['gallery', 'last'].indexOf(data.startup) < 0) data.startup = 'gallery';
    if (data.pin !== null && !/^\d{4}$/.test(data.pin)) data.pin = null;
    if (data.privatePin !== null && !/^\d{4}$/.test(data.privatePin)) data.privatePin = null;
    save();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function get(k) {
    return data[k];
  }

  function set(k, v) {
    data[k] = v;
    save();
  }

  return {
    load: load,
    save: save,
    get: get,
    set: set
  };
})();
