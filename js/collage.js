/* collage.js - combine 2-4 photos into one image. ES5 only. */
var Collage = (function () {
  var W = 480;
  var H = 640;
  var returnMeta = null; /* photo we came from in the editor, or null */

  function start(meta) {
    if (Gallery.getView().type !== 'all' && Gallery.getView().type !== 'folder' &&
        Gallery.getView().type !== 'favorites') {
      UI.toast('Open All Photos or a folder first');
      return false;
    }
    returnMeta = meta || null;
    Gallery.startSelect({
      title: 'Collage: pick 2-4',
      min: 2,
      max: 4
    });
    Gallery.selectConfig = {
      actions: [],
      createLabel: 'Create Collage',
      onCreate: function (items) {
        if (items.length < 2) {
          UI.toast('Select at least 2 photos');
          return;
        }
        build(items);
      }
    };
    UI.toast('OK: select - Right key: create');
    return true;
  }

  /* Back / Cancel while picking collage photos: back to the Edit toolbar
     (where Collage was opened from) instead of dropping to the gallery.
     Returns true if it handled the key. */
  function handleSelectCancel() {
    if (!returnMeta) return false;
    var meta = returnMeta;
    returnMeta = null;
    Gallery.endSelect(true);
    Gallery.render();
    Editor.open(meta);
    return true;
  }

  function build(photos) {
    returnMeta = null; /* committed to building: no more return to the editor */
    if (!photos || photos.length < 2) {
      UI.toast('Select at least 2 photos');
      return;
    }
    UI.toast('Building collage...');
    loadImages(photos, 0, [], function (imgs) {
      if (!imgs.length) {
        UI.toast('Collage failed');
        return;
      }
      var canvas = null;
      try {
        canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, H);
        layout(ctx, imgs);
      } catch (e) {
        Utils.log('collage failed', e);
        UI.toast('Collage failed');
        return;
      }
      saveCanvas(canvas);
    });
  }

  function loadImages(photos, i, acc, done) {
    if (i >= photos.length) {
      done(acc);
      return;
    }
    StorageMod.getBlob(photos[i], function (blob) {
      if (!blob) {
        loadImages(photos, i + 1, acc, done);
        return;
      }
      var u = null;
      try {
        u = URL.createObjectURL(blob);
      } catch (e) {
        loadImages(photos, i + 1, acc, done);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          URL.revokeObjectURL(u);
        } catch (e2) {}
        if (img.naturalWidth && img.naturalHeight) acc.push(img);
        loadImages(photos, i + 1, acc, done);
      };
      img.onerror = function () {
        try {
          URL.revokeObjectURL(u);
        } catch (e3) {}
        loadImages(photos, i + 1, acc, done);
      };
      img.src = u;
    });
  }

  /* cover-fit draw */
  function drawCover(ctx, img, x, y, w, h) {
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var s = Math.max(w / iw, h / ih);
    var dw = iw * s;
    var dh = ih * s;
    var dx = x + (w - dw) / 2;
    var dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function layout(ctx, imgs) {
    var n = imgs.length;
    if (n === 2) {
      drawCover(ctx, imgs[0], 0, 0, W, H / 2);
      drawCover(ctx, imgs[1], 0, H / 2, W, H / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, H / 2 - 1, W, 2);
    } else if (n === 3) {
      drawCover(ctx, imgs[0], 0, 0, W / 2, H / 2);
      drawCover(ctx, imgs[1], W / 2, 0, W / 2, H / 2);
      drawCover(ctx, imgs[2], 0, H / 2, W, H / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(W / 2 - 1, 0, 2, H / 2);
      ctx.fillRect(0, H / 2 - 1, W, 2);
    } else {
      drawCover(ctx, imgs[0], 0, 0, W / 2, H / 2);
      drawCover(ctx, imgs[1], W / 2, 0, W / 2, H / 2);
      drawCover(ctx, imgs[2], 0, H / 2, W / 2, H / 2);
      drawCover(ctx, imgs[3], W / 2, H / 2, W / 2, H / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(W / 2 - 1, 0, 2, H);
      ctx.fillRect(0, H / 2 - 1, W, 2);
    }
  }

  function saveCanvas(canvas) {
    var done = function (blob) {
      if (!blob) {
        UI.toast('Collage failed');
        return;
      }
      var d = new Date();
      var name = 'Collage_' + d.getFullYear() +
        Utils.pad2(d.getMonth() + 1) + Utils.pad2(d.getDate()) + '_' +
        Utils.pad2(d.getHours()) + Utils.pad2(d.getMinutes()) + Utils.pad2(d.getSeconds()) + '.jpg';
      StorageMod.addBlob('pictures', blob, name, function (ok) {
        if (!ok) {
          UI.toast('Could not save collage');
          return;
        }
        UI.toast('Collage saved');
        App.refreshGallery();
      });
    };
    if (canvas.toBlob) {
      try {
        canvas.toBlob(function (b) {
          done(b);
        }, 'image/jpeg', 0.9);
        return;
      } catch (e) {}
    }
    try {
      var du = canvas.toDataURL('image/jpeg', 0.9);
      var parts = du.split(',');
      var bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      done(new Blob([arr], { type: 'image/jpeg' }));
    } catch (e2) {
      done(null);
    }
  }

  return {
    start: start,
    handleSelectCancel: handleSelectCancel
  };
})();
