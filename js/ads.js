/* MS Gallery — KaiAds V5 fullscreen integration.
 * This app includes the official KaiAds V5 loader (kaiads.v5.min.js) at project root.
 * Keep TEST_MODE = 1 while validating on the target KaiOS device; set to 0 for production.
 * Fullscreen placements are only requested at app startup/unlock, with five completed
 * app sessions between successfully displayed ads, per KaiAds publisher guidance.
 */
(function () {
  'use strict';

  var PUBLISHER_ID = 'e5fb8556-5d9a-4fbb-9a54-a8ad00691cd8';
  var APP_NAME = 'MS Gallery';
  var SLOT_NAME = 'msgallery-launch-fullscreen';
  var TEST_MODE = 0;
  var SESSION_KEY = 'msGalleryKaiAdsSessionCount';
  var NEXT_ALLOWED_KEY = 'msGalleryKaiAdsNextAllowedSession';
  var requestedThisSession = false;

  function log(message, detail) {
    if (window.console && typeof window.console.log === 'function') {
      window.console.log('[MS Gallery KaiAds] ' + message, detail || '');
    }
  }

  function readNumber(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      if (value === null) return fallback;
      var number = parseInt(value, 10);
      return isFinite(number) ? number : null;
    } catch (e) {
      return null;
    }
  }

  function writeNumber(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
      return window.localStorage.getItem(key) === String(value);
    } catch (e) {
      return false;
    }
  }

  function beginSession() {
    var previous = readNumber(SESSION_KEY, 0);
    if (previous === null) return null;
    var current = previous + 1;
    if (!writeNumber(SESSION_KEY, current)) return null;
    return current;
  }

  function requestFullscreen() {
    if (requestedThisSession) return;
    requestedThisSession = true;

    if (typeof window.getKaiAd !== 'function') {
      log('KaiAds loader unavailable; Gallery will continue without an ad.');
      return;
    }

    var sessionCount = beginSession();
    if (sessionCount === null) {
      log('Persistent session storage unavailable; skipping ad to avoid repeated fullscreen ads.');
      return;
    }

    var nextAllowedSession = readNumber(NEXT_ALLOWED_KEY, 1);
    if (nextAllowedSession === null) {
      log('Unable to read frequency cap; skipping ad.');
      return;
    }
    if (sessionCount < nextAllowedSession) {
      log('Fullscreen frequency cap active for session ' + sessionCount + '.');
      return;
    }

    window.getKaiAd({
      publisher: PUBLISHER_ID,
      app: APP_NAME,
      slot: SLOT_NAME,
      test: TEST_MODE,
      timeout: 8000,
      onerror: function (err) {
        // No ad returned: keep the Gallery usable and do not count an impression.
        log('Fullscreen ad unavailable; Gallery continues normally.', err);
      },
      onready: function (ad) {
        if (!ad || typeof ad.call !== 'function') {
          log('SDK returned an invalid ad object.');
          return;
        }

        var hasDisplayEvent = false;
        if (typeof ad.on === 'function') {
          try {
            ad.on('display', function () {
              hasDisplayEvent = true;
              // If this ad is displayed in session N, sessions N+1 through N+5
              // are the five completed sessions before the next eligible request.
              writeNumber(NEXT_ALLOWED_KEY, sessionCount + 6);
              log('Fullscreen ad displayed in session ' + sessionCount + '.');
            });
            ad.on('close', function () {
              log('Fullscreen ad closed.');
            });
          } catch (eventError) {
            log('Could not register ad events.', eventError);
          }
        }

        // Conservative fallback for SDK implementations without event hooks.
        if (typeof ad.on !== 'function') {
          writeNumber(NEXT_ALLOWED_KEY, sessionCount + 6);
        }

        try {
          ad.call('display');
        } catch (e) {
          // Display failed synchronously, so allow a retry on the next app session.
          if (!hasDisplayEvent) writeNumber(NEXT_ALLOWED_KEY, sessionCount + 1);
          log('Could not display fullscreen ad.', e);
        }
      }
    });
  }

  // Called by app.js only after its startup flow finishes and any PIN lock is passed.
  window.MSGalleryAds = {
    onAppReady: requestFullscreen
  };
}());
