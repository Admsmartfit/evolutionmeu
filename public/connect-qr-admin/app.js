(function () {
  'use strict';

  const STORAGE_KEY = 'evolution_audit_apikey'; // shared with /audit-manager/ — same secret (global apikey)

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
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
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

  function buildLink(instance) {
    return (
      window.location.origin +
      '/connect-qr/?instance=' +
      encodeURIComponent(instance.name) +
      '&token=' +
      encodeURIComponent(instance.token || '')
    );
  }

  async function copyLink(instance, button) {
    const link = buildLink(instance);

    if (!instance.token) {
      toast(`A instância "${instance.name}" não tem token cadastrado.`, true);
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast(`Link de "${instance.name}" copiado!`);
    } catch (err) {
      // Fallback for browsers/contexts without Clipboard API access.
      const temp = document.createElement('textarea');
      temp.value = link;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand('copy');
        toast(`Link de "${instance.name}" copiado!`);
      } catch {
        toast('Não foi possível copiar automaticamente. Link: ' + link, true);
      }
      document.body.removeChild(temp);
    }

    button.textContent = 'Copiado!';
    setTimeout(() => {
      button.textContent = 'Copiar link';
    }, 1500);
  }

  function render(instances) {
    const tbody = document.getElementById('instances-tbody');

    if (!instances || instances.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhuma instância encontrada.</td></tr>';
      return;
    }

    tbody.innerHTML = instances
      .map(
        (instance, index) => `
      <tr>
        <td>${escapeHtml(instance.name)}</td>
        <td>${statusBadge(instance.connectionStatus)}</td>
        <td>${escapeHtml(instance.number || instance.ownerJid || '—')}</td>
        <td><button class="btn btn-primary" data-copy="${index}">Copiar link</button></td>
      </tr>`,
      )
      .join('');

    tbody.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => copyLink(instances[Number(btn.dataset.copy)], btn));
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
      const response = await fetch('/instance/fetchInstances', { headers: { apikey: apiKey } });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = (body && (body.message || body.error)) || `HTTP ${response.status}`;
        throw new Error(Array.isArray(message) ? message.join('; ') : message);
      }

      const instances = await response.json();
      render(instances);
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
