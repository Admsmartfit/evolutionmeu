(function () {
  'use strict';

  const STORAGE_KEY = 'evolution_audit_apikey'; // shared with /audit-manager/ and /connect-qr-admin/
  const WHISPER_BASE_URL = 'http://evolution_whisper:8000';
  const CREDS_PREFIX = 'whisper-auto';

  const STATUS_LABELS = { open: 'Conectado', connecting: 'Conectando', close: 'Desconectado' };

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function setApiKey(value) {
    localStorage.setItem(STORAGE_KEY, value);
  }

  let toastTimer = null;
  function toast(message, isError) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.remove('hidden', 'error');
    if (isError) el.classList.add('error');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusBadge(status) {
    const cls = { open: 'badge-open', connecting: 'badge-connecting', close: 'badge-close' }[status] || 'badge-close';
    return `<span class="badge ${cls}">${escapeHtml(STATUS_LABELS[status] || status || 'Desconhecido')}</span>`;
  }

  async function api(path, options) {
    const apiKey = getApiKey();
    const response = await fetch(path, {
      ...options,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
        ...(options && options.headers),
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message = (body && (body.response?.message || body.message || body.error)) || `HTTP ${response.status}`;
      throw new Error(Array.isArray(message) ? message.join('; ') : message);
    }

    return body;
  }

  async function fetchTranscriptionStatus(instanceName) {
    try {
      const settings = await api(`/openai/fetchSettings/${encodeURIComponent(instanceName)}`);
      return Boolean(settings && settings.speechToText && settings.openaiCredsId);
    } catch {
      return false;
    }
  }

  async function findOrCreateWhisperCreds(instanceName) {
    const existing = await api(`/openai/creds/${encodeURIComponent(instanceName)}`);
    const found = (existing || []).find((c) => (c.name || '').startsWith(CREDS_PREFIX) && c.baseUrl === WHISPER_BASE_URL);
    if (found) return found.id;

    const suffix = `${instanceName.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
    const created = await api(`/openai/creds/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({
        name: `${CREDS_PREFIX}-${suffix}`,
        apiKey: `${CREDS_PREFIX}-${suffix}`,
        baseUrl: WHISPER_BASE_URL,
      }),
    });

    return created.id;
  }

  async function enableTranscription(instanceName, button) {
    button.disabled = true;
    button.textContent = 'Ativando...';

    try {
      const credsId = await findOrCreateWhisperCreds(instanceName);

      await api(`/openai/settings/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        body: JSON.stringify({
          openaiCredsId: credsId,
          speechToText: true,
          expire: 0,
          keywordFinish: '#sair',
          delayMessage: 1000,
          unknownMessage: 'Mensagem não reconhecida',
          listeningFromMe: false,
          stopBotFromMe: false,
          keepOpen: false,
          debounceTime: 0,
          ignoreJids: [],
        }),
      });

      toast(`Transcrição ativada para "${instanceName}"!`);
      await loadInstances();
    } catch (err) {
      toast(err.message || String(err), true);
      button.disabled = false;
      button.textContent = 'Ativar transcrição';
    }
  }

  async function render(instances) {
    const tbody = document.getElementById('instances-tbody');

    if (!instances || instances.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhuma instância encontrada.</td></tr>';
      return;
    }

    tbody.innerHTML = instances
      .map(
        (instance, index) => `
      <tr>
        <td>${escapeHtml(instance.name)}</td>
        <td>${statusBadge(instance.connectionStatus)}</td>
        <td>${escapeHtml(instance.number || instance.ownerJid || '—')}</td>
        <td data-transcription-status="${index}">verificando...</td>
        <td><button class="btn btn-primary" data-enable="${index}" disabled>Ativar transcrição</button></td>
      </tr>`,
      )
      .join('');

    instances.forEach(async (instance, index) => {
      const statusCell = tbody.querySelector(`[data-transcription-status="${index}"]`);
      const button = tbody.querySelector(`[data-enable="${index}"]`);

      const active = await fetchTranscriptionStatus(instance.name);

      if (active) {
        statusCell.innerHTML = '<span class="badge badge-open">Ativa</span>';
        button.textContent = 'Já ativa';
      } else {
        statusCell.innerHTML = '<span class="badge badge-close">Inativa</span>';
        button.disabled = false;
        button.addEventListener('click', () => enableTranscription(instance.name, button));
      }
    });
  }

  async function loadInstances() {
    const apiKey = document.getElementById('apikey-input').value.trim();
    if (!apiKey) {
      toast('Informe a apikey global.', true);
      return;
    }

    setApiKey(apiKey);

    try {
      const instances = await api('/instance/fetchInstances');
      await render(instances);
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }

  function init() {
    document.getElementById('apikey-input').value = getApiKey();
    document.getElementById('apikey-save').addEventListener('click', loadInstances);

    if (getApiKey()) loadInstances();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
