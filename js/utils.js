/* utils.js - tiny helpers. ES5 only. */
var DEBUG = false;

var Utils = {
  log: function () {
    if (DEBUG && window.console && console.log) {
      console.log.apply(console, arguments);
    }
  },
  $: function (id) {
    return document.getElementById(id);
  },
  el: function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== null && text !== undefined) e.textContent = text;
    return e;
  },
  clamp: function (v, a, b) {
    return v < a ? a : (v > b ? b : v);
  },
  extOf: function (name) {
    name = name || '';
    var i = name.lastIndexOf('.');
    return i < 0 ? '' : name.substring(i + 1).toLowerCase();
  },
  baseOf: function (name) {
    name = name || '';
    var i = name.lastIndexOf('.');
    return i < 0 ? name : name.substring(0, i);
  },
  fileNameOf: function (path) {
    path = path || '';
    var i = path.lastIndexOf('/');
    return i < 0 ? path : path.substring(i + 1);
  },
  dirOf: function (path) {
    path = path || '';
    var i = path.lastIndexOf('/');
    return i < 0 ? '' : path.substring(0, i);
  },
  folderOf: function (path) {
    /* first path segment, e.g. "DCIM/IMG.jpg" -> "DCIM", "IMG.jpg" -> "" */
    path = path || '';
    var i = path.indexOf('/');
    return i < 0 ? '' : path.substring(0, i);
  },
  IMAGE_EXTS: ['jpg', 'jpeg', 'png', 'gif'],
  isImageName: function (name) {
    return Utils.IMAGE_EXTS.indexOf(Utils.extOf(name)) >= 0;
  },
  INVALID_NAME: /[\\\/:*?"<>|]/,
  formatSize: function (bytes) {
    bytes = bytes || 0;
    if (bytes < 1024) return bytes + ' B';
    var kb = bytes / 1024;
    if (kb < 1024) return (Math.round(kb * 10) / 10) + ' KB';
    var mb = kb / 1024;
    if (mb < 1024) return (Math.round(mb * 10) / 10) + ' MB';
    var gb = mb / 1024;
    return (Math.round(gb * 10) / 10) + ' GB';
  },
  pad2: function (n) {
    return (n < 10 ? '0' : '') + n;
  },
  formatDate: function (d) {
    if (!d) return 'Unknown';
    try {
      return Utils.pad2(d.getDate()) + '/' + Utils.pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
        ' ' + Utils.pad2(d.getHours()) + ':' + Utils.pad2(d.getMinutes());
    } catch (e) {
      return 'Unknown';
    }
  }
};
