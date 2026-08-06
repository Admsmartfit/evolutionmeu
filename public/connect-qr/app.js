(function () {
  'use strict';

  const STORAGE_INSTANCE = 'connect_qr_instance';
  const STORAGE_TOKEN = 'connect_qr_token';
  const POLL_INTERVAL_MS = 3000;

  let instanceName = '';
  let token = '';
  let pollTimer = null;

  const els = {
    instanceLabel: document.getElementById('instance-label'),
    setupForm: document.getElementById('setup-form'),
    setupInstance: document.getElementById('setup-instance'),
    setupToken: document.getElementById('setup-token'),
    statusArea: document.getElementById('status-area'),
    connected: document.getElementById('state-connected'),
    waiting: document.getElementById('state-waiting'),
    loading: document.getElementById('state-loading'),
    error: document.getElementById('state-error'),
    errorText: document.getElementById('error-text'),
    qrImage: document.getElementById('qr-image'),
    qrRefreshHint: document.getElementById('qr-refresh-hint'),
    retryBtn: document.getElementById('retry-btn'),
  };

  function showOnly(elId) {
    ['connected', 'waiting', 'loading', 'error'].forEach((key) => {
      els[key].classList.toggle('hidden', key !== elId);
    });
    els.statusArea.classList.remove('hidden');
    els.setupForm.classList.add('hidden');
  }

  async function apiFetch(path) {
    const response = await fetch(path, { headers: { apikey: token } });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const message = (body && (body.message || body.error)) || `HTTP ${response.status}`;
      throw new Error(Array.isArray(message) ? message.join('; ') : message);
    }

    return body;
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showError(message) {
    stopPolling();
    els.errorText.textContent = message;
    showOnly('error');
  }

  async function fetchQr() {
    const result = await apiFetch('/instance/connect/' + encodeURIComponent(instanceName));

    if (result && result.error) {
      throw new Error(result.message || 'Não foi possível gerar o QR Code.');
    }

    if (result && result.base64) {
      els.qrImage.src = result.base64;
      els.qrRefreshHint.textContent = 'O código expira em alguns minutos — a página gera um novo automaticamente.';
      showOnly('waiting');
      return true;
    }

    // No base64 and no error usually means the instance is already open;
    // let the connectionState poll below confirm and switch the view.
    return false;
  }

  async function checkState() {
    const result = await apiFetch('/instance/connectionState/' + encodeURIComponent(instanceName));
    return result && result.instance ? result.instance.state : undefined;
  }

  async function runCycle() {
    try {
      const state = await checkState();

      if (state === 'open') {
        stopPolling();
        showOnly('connected');
        return;
      }

      if (state === 'close' || state === 'refused' || state === undefined) {
        await fetchQr();
        return;
      }

      // 'connecting' — QR already issued and still valid, nothing to do this tick.
      if (els.waiting.classList.contains('hidden')) {
        await fetchQr();
      }
    } catch (err) {
      showError(err.message || String(err));
    }
  }

  async function start() {
    showOnly('loading');

    try {
      await runCycle();
    } catch (err) {
      showError(err.message || String(err));
      return;
    }

    stopPolling();
    pollTimer = setInterval(runCycle, POLL_INTERVAL_MS);
  }

  function loadCredentials() {
    const params = new URLSearchParams(window.location.search);
    const paramInstance = params.get('instance');
    const paramToken = params.get('token');

    if (paramInstance && paramToken) {
      localStorage.setItem(STORAGE_INSTANCE, paramInstance);
      localStorage.setItem(STORAGE_TOKEN, paramToken);
      // Scrub credentials out of the visible URL/history once saved.
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    instanceName = localStorage.getItem(STORAGE_INSTANCE) || '';
    token = localStorage.getItem(STORAGE_TOKEN) || '';
  }

  function init() {
    loadCredentials();

    if (!instanceName || !token) {
      els.setupForm.classList.remove('hidden');
      els.statusArea.classList.add('hidden');
      els.setupForm.addEventListener('submit', (event) => {
        event.preventDefault();
        instanceName = els.setupInstance.value.trim();
        token = els.setupToken.value.trim();
        if (!instanceName || !token) return;
        localStorage.setItem(STORAGE_INSTANCE, instanceName);
        localStorage.setItem(STORAGE_TOKEN, token);
        els.instanceLabel.textContent = instanceName;
        start();
      });
      return;
    }

    els.instanceLabel.textContent = instanceName;
    start();
  }

  els.retryBtn.addEventListener('click', start);

  document.addEventListener('DOMContentLoaded', init);
})();
