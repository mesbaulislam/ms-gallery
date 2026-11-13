/* pick.js - 'pick' activity: let another app choose photo(s) from our gallery.
   Another app (Browser, Messages, Contacts, ...) fires a 'pick' activity;
   we open the full gallery, the user picks photo(s), RSK Done returns them.
   Single pick: OK on a photo selects it, RSK Done returns it.
   Multi pick: RSK Options -> 'Select Multiple', OK toggles checks, RSK Done
   returns them. Cancel / Back in single-pick cancels the whole pick.
   ES5 only. */
var Pick = (function () {
  var activity = null;   /* pending MozActivity, or null when not picking */
  var single = null;     /* single-pick choice (photo meta) or null */

  function active() {
    return !!activity;
  }

  function isSingle(p) {
    return !!single && !!p && single.store === p.store && single.name === p.name;
  }

  function hasSingle() {
    return !!single;
  }

  function getSingle() {
    return single;
  }

  /* Incoming pick activity: open the full gallery in pick mode. */
  function start(act) {
    if (activity) return; /* already picking: ignore a second request */
    activity = act;
    single = null;
    UI.setMode('gallery');
    UI.showScreen('screen-gallery');
    Gallery.setView('all');
    UI.toast('Pick a photo - OK: select');
    App.updateSoftkeys();
  }

  /* View changed (tab switch): drop the single choice so Done never
     returns a photo the user can no longer see selected. */
  function resetSingle() {
    single = null;
  }

  /* Single-pick: OK on a photo chooses it (replaces any earlier choice). */
  function selectSingle(p) {
    if (!p) return;
    single = p;
    Gallery.render();
    App.updateSoftkeys();
  }

  /* RSK Options in pick mode: multi-select, or cancel the pick. */
  function showOptions() {
    var items = [];
    if (!Gallery.isSelectMode()) {
      items.push({ label: 'Select Multiple', value: 'multi' });
    }
    items.push({ label: 'Cancel', value: 'cancel' });
    UI.showMenu('Pick options', items, function (v) {
      if (v === 'multi') startMulti();
      else if (v === 'cancel') cancel();
    });
  }

  /* Multi-pick: the normal multi-select grid; RSK Done returns the photos. */
  function startMulti() {
    single = null;
    Gallery.startSelect({ title: 'Pick photos' });
    Gallery.render();
    UI.toast('OK: select - Right key: Done');
    App.updateSoftkeys();
  }

  /* RSK in multi-pick: Done when photos are checked, Options when none are. */
  function rightKey() {
    var items = Gallery.checkedPhotos();
    if (items.length) finish(items);
    else showOptions();
  }

  /* Back / LSK in multi-pick: back to single-pick (checks cleared). */
  function backToSingle() {
    Gallery.endSelect(true);
    single = null;
    Gallery.render();
    App.updateSoftkeys();
  }

  /* Return the chosen photo(s) to the calling app, then close. */
  function finish(items) {
    if (!activity || !items || !items.length) return;
    var act = activity;
    activity = null;
    single = null;
    Gallery.endSelect(true);
    UI.toast('Sending...');
    var blobs = [];
    var loadOne = function (idx) {
      if (idx >= items.length) {
        if (!blobs.length) {
          UI.toast('Unable to read images.');
          return;
        }
        try {
          /* Gaia pick convention: a single photo comes back as {blob}.
             Several photos also carry the first one as 'blob', so a caller
             that only reads .blob still gets a photo. */
          if (blobs.length === 1) act.postResult({ blob: blobs[0] });
          else act.postResult({ blob: blobs[0], blobs: blobs });
        } catch (e) {}
        closeApp();
        return;
      }
      StorageMod.getBlob(items[idx], function (blob) {
        if (blob) blobs.push(blob);
        loadOne(idx + 1);
      });
    };
    loadOne(0);
  }

  /* Cancel the pick: the calling app gets an error and resumes. */
  function cancel() {
    if (!activity) return;
    var act = activity;
    activity = null;
    single = null;
    try { act.postError('pick cancelled'); } catch (e) {}
    closeApp();
  }

  function closeApp() {
    try { window.close(); } catch (e) {}
  }

  return {
    start: start,
    active: active,
    isSingle: isSingle,
    hasSingle: hasSingle,
    getSingle: getSingle,
    resetSingle: resetSingle,
    selectSingle: selectSingle,
    showOptions: showOptions,
    rightKey: rightKey,
    backToSingle: backToSingle,
    finish: finish,
    cancel: cancel
  };
})();
