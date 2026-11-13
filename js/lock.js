/* lock.js - 4-digit PIN pad (app lock + private folder). No text input, direct keypad. ES5 only. */
var Lock = (function () {
  var active = false;
  var mode = null;      /* app | private | set | confirm | change */
  var pinKind = 'app';  /* 'app' | 'private': which PIN set/confirm/change writes */
  var entered = '';
  var firstPin = '';
  var cb = null;

  function isPinSet() {
    return !!Settings.get('pin');
  }

  function isPrivatePinSet() {
    return !!Settings.get('privatePin');
  }

  function paint() {
    var dots = Utils.$('lock-dots').children;
    for (var i = 0; i < dots.length; i++) {
      if (i < entered.length) dots[i].classList.add('on');
      else dots[i].classList.remove('on');
    }
  }

  function setMsg(t) {
    Utils.$('lock-msg').textContent = t || '';
  }

  /* mode: 'app' (unlock to enter), 'private' (unlock private folder),
     'set' (create new PIN), 'change' (verify old, then set new).
     kind: 'app' | 'private' — which PIN the set/change flow writes.
     The two locks use different PINs and different titles, so the
     app lock screen and the private folder screen never look the same. */
  function show(m, callback, kind) {
    mode = m;
    if (kind === 'private' || kind === 'app') pinKind = kind;
    else if (m === 'private') pinKind = 'private';
    else if (m === 'app') pinKind = 'app';
    cb = callback || null;
    entered = '';
    firstPin = '';
    active = true;
    paint();
    var title = Utils.$('lock-title');
    if (m === 'set') title.textContent = pinKind === 'private' ? 'Set Private PIN' : 'Set a 4-digit PIN';
    else if (m === 'confirm') title.textContent = 'Confirm PIN';
    else if (m === 'change') title.textContent = pinKind === 'private' ? 'Enter current Private PIN' : 'Enter current PIN';
    else if (m === 'private') title.textContent = 'Enter Private PIN';
    else title.textContent = 'Enter PIN';
    setMsg(m === 'app' ? '' : 'BACK to cancel');
    Utils.$('lock').classList.remove('hidden');
  }

  function hide() {
    active = false;
    mode = null;
    cb = null;
    entered = '';
    Utils.$('lock').classList.add('hidden');
  }

  function isActive() {
    return active;
  }

  function finish(ok) {
    var f = cb;
    hide();
    if (f) f(ok);
  }

  function submit() {
    /* app lock reads/writes 'pin', private folder reads/writes 'privatePin' */
    var key = pinKind === 'private' ? 'privatePin' : 'pin';
    if (mode === 'set') {
      firstPin = entered;
      entered = '';
      paint();
      mode = 'confirm';
      Utils.$('lock-title').textContent = 'Confirm PIN';
      setMsg('');
      return;
    }
    if (mode === 'confirm') {
      if (entered === firstPin) {
        Settings.set(key, entered);
        UI.toast('PIN set');
        finish(true);
      } else {
        setMsg('PINs do not match. Try again.');
        entered = '';
        firstPin = '';
        paint();
        mode = 'set';
        Utils.$('lock-title').textContent = pinKind === 'private' ? 'Set Private PIN' : 'Set a 4-digit PIN';
      }
      return;
    }
    if (mode === 'change') {
      if (entered === Settings.get(key)) {
        entered = '';
        paint();
        mode = 'set';
        Utils.$('lock-title').textContent = pinKind === 'private' ? 'Set new Private PIN' : 'Set new PIN';
        setMsg('');
      } else {
        setMsg('Wrong PIN. Try again.');
        entered = '';
        paint();
      }
      return;
    }
    /* app / private unlock: each checks its own PIN */
    if (entered === Settings.get(key)) {
      finish(true);
    } else {
      setMsg('Wrong PIN. Try again.');
      entered = '';
      paint();
    }
  }

  function handleKey(key) {
    if (!active) return false;
    if (key >= '0' && key <= '9') {
      if (entered.length < 4) {
        entered += key;
        paint();
        setMsg('');
        if (entered.length === 4) {
          var t = this;
          setTimeout(function () {
            submit();
          }, 150);
        }
      }
      return true;
    }
    if (key === 'Backspace') {
      if (entered.length > 0) {
        entered = entered.slice(0, -1);
        paint();
        return true;
      }
      if (mode === 'app') return false; /* let system exit */
      finish(false);
      return true;
    }
    return true; /* swallow other keys while locked */
  }

  /* Settings entry: toggle on/off/change. kind: 'app' (default) or 'private'. */
  function managePin(done, kind) {
    kind = kind === 'private' ? 'private' : 'app';
    var key = kind === 'private' ? 'privatePin' : 'pin';
    if (!Settings.get(key)) {
      show('set', function (ok) {
        if (done) done();
      }, kind);
      return;
    }
    UI.showMenu(kind === 'private' ? 'Private Folder PIN' : 'PIN Lock', [
      { label: 'Change PIN', value: 'change' },
      { label: 'Turn Off', value: 'off' }
    ], function (v) {
      if (v === 'change') {
        show('change', function () {
          if (done) done();
        }, kind);
      } else if (v === 'off') {
        show(kind === 'private' ? 'private' : 'app', function (ok) {
          if (ok) {
            Settings.set(key, null);
            UI.toast('PIN lock off');
          }
          if (done) done();
        }, kind);
      } else {
        if (done) done();
      }
    });
  }

  /* Settings entry for the private folder PIN (separate from the app lock). */
  function managePrivatePin(done) {
    managePin(done, 'private');
  }

  return {
    show: show,
    hide: hide,
    isActive: isActive,
    isPinSet: isPinSet,
    isPrivatePinSet: isPrivatePinSet,
    handleKey: handleKey,
    managePin: managePin,
    managePrivatePin: managePrivatePin
  };
})();
