'use strict';

/**
 * Shared client helpers for the mock frontend. Plain browser script (no build,
 * no modules) — exposes a single global `App`. Each page does its own wiring in
 * a small inline <script> that calls into these.
 */
(function () {
  var SESSION_KEY = 'floqast.session';

  // --- session (sessionStorage: per-tab, gone on close) ---------------------

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setSession(token, user) {
    var prev = getSession() || {};
    var next = { token: token || prev.token, user: user || prev.user };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch (_) {
      /* private mode — the page still works for the current navigation */
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  /** Return the session, or redirect to the login page and return null. */
  function requireSession() {
    var session = getSession();
    if (!session || !session.token) {
      window.location.assign('./login.html');
      return null;
    }
    return session;
  }

  // --- HTTP ---------------------------------------------------------------

  /**
   * Call the mock API. Attaches the bearer token when there is one. On a
   * non-2xx response, throws an Error carrying `.code`, `.status`, `.details`
   * from the error envelope.
   */
  async function api(method, path, body) {
    var session = getSession();
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token;

    var res = await fetch(path, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    var text = await res.text();
    var data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      var envelope = (data && data.error) || {};
      var err = new Error(envelope.message || 'Request failed (' + res.status + ')');
      err.code = envelope.code;
      err.status = res.status;
      err.details = envelope.details;
      throw err;
    }
    return data;
  }

  // --- DOM helpers -------------------------------------------------------

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function setText(selector, text) {
    var el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setBusy(form, busy) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = !!busy;
  }

  function bannerEl(testId) {
    return document.querySelector('[data-testid="' + testId + '"]');
  }

  /** Show a plain message in the error banner. */
  function showMessage(text) {
    var el = bannerEl('form-error');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  /** Show an error from `api()` — prefers the most specific field detail. */
  function showError(err) {
    var text = 'Something went wrong';
    if (err && Array.isArray(err.details) && err.details.length) {
      var detail = String(err.details[0]);
      var parts = detail.match(/^([A-Za-z][\w.]*):\s*(.+)$/);
      text = parts ? capitalize(parts[1]) + ' ' + parts[2] : detail;
    } else if (err && err.message) {
      text = err.message;
    }
    showMessage(text);
  }

  function clearError() {
    var el = bannerEl('form-error');
    if (el) {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function showSuccess(text) {
    var el = bannerEl('form-success');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  function clearSuccess() {
    var el = bannerEl('form-success');
    if (el) {
      el.textContent = '';
      el.hidden = true;
    }
  }

  // --- formatting / rendering ------------------------------------------

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
      }).format(amount);
    } catch (_) {
      return (currency || 'USD') + ' ' + Number(amount).toFixed(2);
    }
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function renderHistory(container, txns, selfId) {
    if (!txns || !txns.length) {
      container.innerHTML =
        '<p class="empty" data-testid="history-empty">No transactions yet</p>';
      return;
    }

    var body = txns
      .map(function (t) {
        var outgoing = t.userId === selfId;
        var label =
          t.type === 'transfer' ? (outgoing ? 'Sent' : 'Received') : capitalize(t.type);
        var negative = t.status === 'completed' && (outgoing || t.type === 'withdrawal');
        return (
          '<tr data-testid="history-row">' +
          '<td>' + label + '</td>' +
          '<td>' + (negative ? '−' : '+') + money(t.amount, t.currency) + '</td>' +
          '<td><span class="tag ' + t.status + '">' + t.status + '</span></td>' +
          '<td class="muted">' + new Date(t.createdAt).toLocaleString() + '</td>' +
          '</tr>'
        );
      })
      .join('');

    container.innerHTML =
      '<table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>';
  }

  window.App = {
    onReady: onReady,
    api: api,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    requireSession: requireSession,
    setText: setText,
    setBusy: setBusy,
    showMessage: showMessage,
    showError: showError,
    clearError: clearError,
    showSuccess: showSuccess,
    clearSuccess: clearSuccess,
    money: money,
    renderHistory: renderHistory,
  };
})();
