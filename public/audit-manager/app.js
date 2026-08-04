(function () {
  'use strict';

  const STORAGE_KEY = 'evolution_audit_apikey';
  const ROLE_LABELS = { SOCIO: 'Sócio', GERENTE: 'Gerente', ADMINISTRATIVO: 'Administrativo', OUTRO: 'Outro' };
  const RISK_LABELS = { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto', CRITICAL: 'Crítico' };
  const STATUS_LABELS = { PROCESSING: 'Processando', COMPLETED: 'Concluído', FAILED: 'Falhou' };

  // ---------------------------------------------------------------------
  // apikey / fetch helper
  // ---------------------------------------------------------------------
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function setApiKey(value) {
    localStorage.setItem(STORAGE_KEY, value);
  }

  function setConnectionStatus(state) {
    const dot = document.getElementById('connection-status');
    dot.classList.remove('ok', 'error');
    if (state) dot.classList.add(state);
  }

  function extractErrorMessage(payload) {
    if (!payload) return 'Erro desconhecido';
    const msg = payload.message ?? payload.error;
    if (Array.isArray(msg)) return msg.join('; ');
    if (typeof msg === 'string') return msg;
    return JSON.stringify(payload);
  }

  async function apiFetch(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers, { apikey: getApiKey() });
    if (!options.isFormData) headers['Content-Type'] = 'application/json';

    const response = await fetch(path, Object.assign({}, options, { headers }));

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        /* non-JSON error body */
      }
      setConnectionStatus(response.status === 401 ? 'error' : 'ok');
      throw new Error(extractErrorMessage(payload) || `HTTP ${response.status}`);
    }

    setConnectionStatus('ok');

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();
    return response;
  }

  // ---------------------------------------------------------------------
  // toast
  // ---------------------------------------------------------------------
  let toastTimer = null;
  function toast(message, isError) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.remove('hidden', 'error');
    if (isError) el.classList.add('error');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
  }

  function handleError(err) {
    console.error(err);
    toast(err.message || String(err), true);
  }

  // ---------------------------------------------------------------------
  // tabs
  // ---------------------------------------------------------------------
  function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR');
  }

  function splitList(raw) {
    if (!raw || !raw.trim()) return undefined;
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  // ---------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------
  const Contacts = {
    editingId: null,

    async load() {
      const role = document.getElementById('contact-filter-role').value;
      const instanceId = document.getElementById('contact-filter-instance').value.trim();
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      if (instanceId) params.set('instanceId', instanceId);

      try {
        const list = await apiFetch('/audit/contacts/find?' + params.toString());
        this.render(list);
      } catch (err) {
        handleError(err);
      }
    },

    render(list) {
      const tbody = document.getElementById('contacts-tbody');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum contato cadastrado.</td></tr>';
        return;
      }
      tbody.innerHTML = list
        .map(
          (c) => `
        <tr>
          <td>${escapeHtml(c.name || '—')}</td>
          <td>${escapeHtml(c.phoneNumber)}</td>
          <td>${escapeHtml(ROLE_LABELS[c.role] || c.role)}</td>
          <td>${escapeHtml(c.instanceId || '—')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" data-edit="${c.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-delete="${c.id}">Excluir</button>
          </td>
        </tr>`,
        )
        .join('');

      tbody.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => this.startEdit(list.find((c) => c.id === btn.dataset.edit))),
      );
      tbody.querySelectorAll('[data-delete]').forEach((btn) =>
        btn.addEventListener('click', () => this.remove(btn.dataset.delete)),
      );
    },

    startEdit(contact) {
      if (!contact) return;
      this.editingId = contact.id;
      document.getElementById('contact-id').value = contact.id;
      document.getElementById('contact-phone').value = contact.phoneNumber;
      document.getElementById('contact-name').value = contact.name || '';
      document.getElementById('contact-role').value = contact.role;
      document.getElementById('contact-instance').value = contact.instanceId || '';
      document.getElementById('contacts-form-title').textContent = 'Editar contato';
      document.getElementById('contact-submit').textContent = 'Salvar alterações';
      document.getElementById('contact-cancel').classList.remove('hidden');
    },

    cancelEdit() {
      this.editingId = null;
      document.getElementById('contact-form').reset();
      document.getElementById('contact-id').value = '';
      document.getElementById('contacts-form-title').textContent = 'Novo contato';
      document.getElementById('contact-submit').textContent = 'Adicionar';
      document.getElementById('contact-cancel').classList.add('hidden');
    },

    async submit(event) {
      event.preventDefault();
      const phoneNumber = document.getElementById('contact-phone').value.trim();
      const name = document.getElementById('contact-name').value.trim();
      const role = document.getElementById('contact-role').value;
      const instanceId = document.getElementById('contact-instance').value.trim();

      try {
        if (this.editingId) {
          await apiFetch('/audit/contacts/update/' + this.editingId, {
            method: 'PUT',
            body: JSON.stringify({ name: name || undefined, role, instanceId: instanceId || undefined }),
          });
          toast('Contato atualizado.');
        } else {
          await apiFetch('/audit/contacts/create', {
            method: 'POST',
            body: JSON.stringify({ phoneNumber, name: name || undefined, role, instanceId: instanceId || undefined }),
          });
          toast('Contato criado.');
        }
        this.cancelEdit();
        this.load();
      } catch (err) {
        handleError(err);
      }
    },

    async remove(id) {
      if (!confirm('Excluir este contato?')) return;
      try {
        await apiFetch('/audit/contacts/delete/' + id, { method: 'DELETE' });
        toast('Contato excluído.');
        this.load();
      } catch (err) {
        handleError(err);
      }
    },

    async importCsv(event) {
      event.preventDefault();
      const fileInput = document.getElementById('contact-import-file');
      const file = fileInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const result = await apiFetch('/audit/contacts/import', { method: 'POST', body: formData, isFormData: true });
        const box = document.getElementById('contact-import-result');
        const skippedList = (result.skipped || [])
          .map((s) => `linha ${s.row}: ${escapeHtml(s.reason)}`)
          .join('<br/>');
        box.innerHTML = `
          <p><strong>${result.imported}</strong> importados, <strong>${result.updated}</strong> atualizados, <strong>${result.skipped.length}</strong> ignorados.</p>
          ${skippedList ? `<p class="hint">${skippedList}</p>` : ''}
        `;
        toast('Importação concluída.');
        fileInput.value = '';
        this.load();
      } catch (err) {
        handleError(err);
      }
    },
  };

  // ---------------------------------------------------------------------
  // Audit Configs
  // ---------------------------------------------------------------------
  const Configs = {
    editingId: null,

    toggleCustomDates() {
      const isCustom = document.getElementById('config-periodicity').value === 'CUSTOM';
      document.getElementById('config-custom-dates').classList.toggle('hidden', !isCustom);
    },

    async load() {
      try {
        const list = await apiFetch('/audit/config/find');
        this.render(list);
      } catch (err) {
        handleError(err);
      }
    },

    render(list) {
      const tbody = document.getElementById('configs-tbody');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhuma configuração cadastrada.</td></tr>';
        return;
      }
      tbody.innerHTML = list
        .map(
          (c) => `
        <tr>
          <td>${escapeHtml(c.name || c.id)}</td>
          <td>${escapeHtml(c.periodicity)}</td>
          <td><code>${escapeHtml(c.cronExpression || '—')}</code></td>
          <td>${escapeHtml(c.aiProvider)} / ${escapeHtml(c.aiModel)}</td>
          <td>${c.apiKeyConfigured ? '<span class="badge badge-completed">configurada</span>' : '<span class="badge badge-neutral">ausente</span>'}</td>
          <td>${c.enabled ? '<span class="badge badge-completed">ativo</span>' : '<span class="badge badge-neutral">inativo</span>'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" data-edit="${c.id}">Editar</button>
            <button class="btn btn-primary btn-sm" data-run="${c.id}">Rodar agora</button>
            <button class="btn btn-danger btn-sm" data-delete="${c.id}">Excluir</button>
          </td>
        </tr>`,
        )
        .join('');

      tbody.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => this.startEdit(list.find((c) => c.id === btn.dataset.edit))),
      );
      tbody.querySelectorAll('[data-delete]').forEach((btn) =>
        btn.addEventListener('click', () => this.remove(btn.dataset.delete)),
      );
      tbody.querySelectorAll('[data-run]').forEach((btn) => btn.addEventListener('click', () => this.runNow(btn.dataset.run)));
    },

    startEdit(config) {
      if (!config) return;
      this.editingId = config.id;
      document.getElementById('config-id').value = config.id;
      document.getElementById('config-name').value = config.name || '';
      document.getElementById('config-enabled').checked = Boolean(config.enabled);
      document.getElementById('config-periodicity').value = config.periodicity;
      document.getElementById('config-custom-start').value = config.customStartDate ? config.customStartDate.slice(0, 16) : '';
      document.getElementById('config-custom-end').value = config.customEndDate ? config.customEndDate.slice(0, 16) : '';
      document.getElementById('config-cron').value = config.cronExpression || '';
      document.getElementById('config-instances').value = (config.selectedInstances || []).join(',');
      document.getElementById('config-excluded').value = (config.excludedJids || []).join(',');
      document.getElementById('config-provider').value = config.aiProvider;
      document.getElementById('config-model').value = config.aiModel;
      document.getElementById('config-apikey').value = '';
      document.getElementById('config-apikey-hint').textContent = config.apiKeyConfigured
        ? 'Uma chave já está configurada. Preencha só se quiser substituí-la.'
        : 'Nenhuma chave própria configurada (usará o fallback global, se houver).';
      document.getElementById('config-temperature').value = config.temperature ?? '';
      document.getElementById('config-topp').value = config.topP ?? '';
      document.getElementById('config-maxtokens').value = config.maxTokens ?? '';
      this.toggleCustomDates();
      document.getElementById('configs-form-title').textContent = 'Editar configuração';
      document.getElementById('config-submit').textContent = 'Salvar alterações';
      document.getElementById('config-cancel').classList.remove('hidden');
    },

    cancelEdit() {
      this.editingId = null;
      document.getElementById('config-form').reset();
      document.getElementById('config-id').value = '';
      document.getElementById('config-apikey-hint').textContent = '';
      this.toggleCustomDates();
      document.getElementById('configs-form-title').textContent = 'Nova configuração de auditoria';
      document.getElementById('config-submit').textContent = 'Criar';
      document.getElementById('config-cancel').classList.add('hidden');
    },

    buildPayload() {
      const apiKey = document.getElementById('config-apikey').value;
      const payload = {
        name: document.getElementById('config-name').value.trim() || undefined,
        enabled: document.getElementById('config-enabled').checked,
        periodicity: document.getElementById('config-periodicity').value,
        cronExpression: document.getElementById('config-cron').value.trim() || undefined,
        selectedInstances: splitList(document.getElementById('config-instances').value),
        excludedJids: splitList(document.getElementById('config-excluded').value),
        aiProvider: document.getElementById('config-provider').value,
        aiModel: document.getElementById('config-model').value.trim(),
        temperature: numberOrUndefined('config-temperature'),
        topP: numberOrUndefined('config-topp'),
        maxTokens: numberOrUndefined('config-maxtokens'),
      };
      if (payload.periodicity === 'CUSTOM') {
        const start = document.getElementById('config-custom-start').value;
        const end = document.getElementById('config-custom-end').value;
        payload.customStartDate = start ? new Date(start).toISOString() : undefined;
        payload.customEndDate = end ? new Date(end).toISOString() : undefined;
      }
      if (apiKey) payload.apiKey = apiKey;
      return payload;
    },

    async submit(event) {
      event.preventDefault();
      const payload = this.buildPayload();
      try {
        if (this.editingId) {
          await apiFetch('/audit/config/update/' + this.editingId, { method: 'PUT', body: JSON.stringify(payload) });
          toast('Configuração atualizada.');
        } else {
          await apiFetch('/audit/config/create', { method: 'POST', body: JSON.stringify(payload) });
          toast('Configuração criada.');
        }
        this.cancelEdit();
        this.load();
      } catch (err) {
        handleError(err);
      }
    },

    async remove(id) {
      if (!confirm('Excluir esta configuração de auditoria? O agendamento associado será removido.')) return;
      try {
        await apiFetch('/audit/config/delete/' + id, { method: 'DELETE' });
        toast('Configuração excluída.');
        this.load();
      } catch (err) {
        handleError(err);
      }
    },

    async runNow(id) {
      if (!confirm('Enfileirar uma execução agora para esta configuração?')) return;
      try {
        const result = await apiFetch('/audit/config/run/' + id, { method: 'POST', body: JSON.stringify({}) });
        toast('Execução enfileirada (job ' + result.jobId + '). Acompanhe na aba Relatórios em alguns instantes.');
      } catch (err) {
        handleError(err);
      }
    },
  };

  function numberOrUndefined(id) {
    const raw = document.getElementById(id).value;
    if (raw === '' || raw === null) return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }

  // ---------------------------------------------------------------------
  // Recipients
  // ---------------------------------------------------------------------
  const Recipients = {
    editingId: null,

    async load() {
      try {
        const list = await apiFetch('/audit/recipients/find');
        this.render(list);
      } catch (err) {
        handleError(err);
      }
    },

    render(list) {
      const tbody = document.getElementById('recipients-tbody');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum destinatário cadastrado.</td></tr>';
        return;
      }
      tbody.innerHTML = list
        .map(
          (r) => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.phoneNumber)}</td>
          <td>${escapeHtml(r.role || '—')}</td>
          <td>${r.triggerCondition === 'ALWAYS' ? 'Sempre' : 'Alto/Crítico'}</td>
          <td>${r.active ? '<span class="badge badge-completed">ativo</span>' : '<span class="badge badge-neutral">inativo</span>'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" data-edit="${r.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-delete="${r.id}">Excluir</button>
          </td>
        </tr>`,
        )
        .join('');

      tbody.querySelectorAll('[data-edit]').forEach((btn) =>
        btn.addEventListener('click', () => this.startEdit(list.find((r) => r.id === btn.dataset.edit))),
      );
      tbody.querySelectorAll('[data-delete]').forEach((btn) =>
        btn.addEventListener('click', () => this.remove(btn.dataset.delete)),
      );
    },

    startEdit(recipient) {
      if (!recipient) return;
      this.editingId = recipient.id;
      document.getElementById('recipient-id').value = recipient.id;
      document.getElementById('recipient-name').value = recipient.name;
      document.getElementById('recipient-phone').value = recipient.phoneNumber;
      document.getElementById('recipient-role').value = recipient.role || '';
      document.getElementById('recipient-trigger').value = recipient.triggerCondition;
      document.getElementById('recipient-active').checked = Boolean(recipient.active);
      document.getElementById('recipients-form-title').textContent = 'Editar destinatário';
      document.getElementById('recipient-submit').textContent = 'Salvar alterações';
      document.getElementById('recipient-cancel').classList.remove('hidden');
    },

    cancelEdit() {
      this.editingId = null;
      document.getElementById('recipient-form').reset();
      document.getElementById('recipient-id').value = '';
      document.getElementById('recipients-form-title').textContent = 'Novo destinatário';
      document.getElementById('recipient-submit').textContent = 'Adicionar';
      document.getElementById('recipient-cancel').classList.add('hidden');
    },

    async submit(event) {
      event.preventDefault();
      const payload = {
        name: document.getElementById('recipient-name').value.trim(),
        phoneNumber: document.getElementById('recipient-phone').value.trim(),
        role: document.getElementById('recipient-role').value.trim() || undefined,
        triggerCondition: document.getElementById('recipient-trigger').value,
        active: document.getElementById('recipient-active').checked,
      };
      try {
        if (this.editingId) {
          await apiFetch('/audit/recipients/update/' + this.editingId, { method: 'PUT', body: JSON.stringify(payload) });
          toast('Destinatário atualizado.');
        } else {
          await apiFetch('/audit/recipients/create', { method: 'POST', body: JSON.stringify(payload) });
          toast('Destinatário criado.');
        }
        this.cancelEdit();
        this.load();
      } catch (err) {
        handleError(err);
      }
    },

    async remove(id) {
      if (!confirm('Excluir este destinatário?')) return;
      try {
        await apiFetch('/audit/recipients/delete/' + id, { method: 'DELETE' });
        toast('Destinatário excluído.');
        this.load();
      } catch (err) {
        handleError(err);
      }
    },
  };

  // ---------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------
  const Reports = {
    async load() {
      const status = document.getElementById('report-filter-status').value;
      const risk = document.getElementById('report-filter-risk').value;
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (risk) params.set('overallRiskLevel', risk);

      try {
        const list = await apiFetch('/audit/reports/find?' + params.toString());
        this.render(list);
      } catch (err) {
        handleError(err);
      }
    },

    riskBadge(level) {
      if (!level) return '<span class="badge badge-neutral">—</span>';
      return `<span class="badge badge-${level.toLowerCase()}">${escapeHtml(RISK_LABELS[level] || level)}</span>`;
    },

    statusBadge(status) {
      const cls = { PROCESSING: 'badge-processing', COMPLETED: 'badge-completed', FAILED: 'badge-failed' }[status] || 'badge-neutral';
      return `<span class="badge ${cls}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
    },

    render(list) {
      const tbody = document.getElementById('reports-tbody');
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum relatório encontrado.</td></tr>';
        return;
      }
      tbody.innerHTML = list
        .map(
          (r) => `
        <tr>
          <td>${formatDate(r.executionDate)}</td>
          <td>${formatDate(r.periodStart)} — ${formatDate(r.periodEnd)}</td>
          <td>${escapeHtml((r.instancesAudited || []).join(', ') || 'Todas')}</td>
          <td>${this.riskBadge(r.overallRiskLevel)}</td>
          <td>${this.statusBadge(r.status)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" data-detail="${r.id}">Detalhes</button>
            <a class="btn btn-primary btn-sm" href="/audit/reports/${r.id}/pdf" target="_blank" rel="noopener">PDF</a>
          </td>
        </tr>`,
        )
        .join('');

      tbody.querySelectorAll('[data-detail]').forEach((btn) =>
        btn.addEventListener('click', () => this.showDetail(btn.dataset.detail)),
      );
    },

    async showDetail(id) {
      try {
        const report = await apiFetch('/audit/reports/' + id);
        const summary = report.executiveSummary || {};
        const occurrences = report.occurrencesDetails || [];
        const matrix = report.riskMatrix || {};

        const occurrencesHtml = occurrences.length
          ? occurrences
              .map(
                (o) => `
            <div class="occurrence-card sev-${(o.severity || '').toLowerCase()}">
              <p><strong>${escapeHtml(o.category)}</strong> — ${this.riskBadge(o.severity)}</p>
              <p><strong>Interlocutores:</strong> ${escapeHtml(o.interlocutors)}</p>
              <p><strong>Evidência:</strong> "${escapeHtml(o.evidence_quote)}"</p>
              <p><strong>Parecer jurídico:</strong> ${escapeHtml(o.legal_fundamentation)}</p>
              <p><strong>Recomendação:</strong> ${escapeHtml(o.recommendation)}</p>
            </div>`,
              )
              .join('')
          : '<p class="hint">Nenhuma ocorrência de risco identificada.</p>';

        document.getElementById('report-modal-body').innerHTML = `
          <h2>Relatório — ${formatDate(report.executionDate)}</h2>
          <p class="hint">Período: ${formatDate(report.periodStart)} até ${formatDate(report.periodEnd)}</p>
          <p>${this.statusBadge(report.status)} ${this.riskBadge(report.overallRiskLevel)}</p>
          ${report.errorMessage ? `<p class="hint">Erro: ${escapeHtml(report.errorMessage)}</p>` : ''}

          <div class="summary-grid">
            <div><div class="label">Tom da comunicação</div><div class="value">${escapeHtml(summary.communication_tone || '—')}</div></div>
            <div><div class="label">Alinhamento sócio ↔ gerência</div><div class="value">${escapeHtml(summary.management_alignment_score || '—')}</div></div>
          </div>

          <h3>Matriz de risco</h3>
          <div class="summary-grid">
            <div><div class="label">Baixo</div><div class="value">${matrix.LOW ?? 0}</div></div>
            <div><div class="label">Médio</div><div class="value">${matrix.MEDIUM ?? 0}</div></div>
            <div><div class="label">Alto</div><div class="value">${matrix.HIGH ?? 0}</div></div>
            <div><div class="label">Crítico</div><div class="value">${matrix.CRITICAL ?? 0}</div></div>
          </div>

          <h3>Decisões e gargalos</h3>
          <p><strong>Principais decisões:</strong> ${(summary.key_decisions || []).map(escapeHtml).join('; ') || '—'}</p>
          <p><strong>Gargalos operacionais:</strong> ${(summary.operational_bottlenecks || []).map(escapeHtml).join('; ') || '—'}</p>

          <h3>Ocorrências (${occurrences.length})</h3>
          ${occurrencesHtml}

          <div class="form-actions">
            <a class="btn btn-primary" href="/audit/reports/${report.id}/pdf" target="_blank" rel="noopener">Abrir PDF</a>
          </div>
        `;
        document.getElementById('report-modal').classList.remove('hidden');
      } catch (err) {
        handleError(err);
      }
    },
  };

  // ---------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------
  function init() {
    initTabs();

    document.getElementById('apikey-input').value = getApiKey();
    document.getElementById('apikey-save').addEventListener('click', () => {
      setApiKey(document.getElementById('apikey-input').value.trim());
      toast('apikey salva neste navegador.');
      loadActiveTabData();
    });

    document.getElementById('contact-form').addEventListener('submit', (e) => Contacts.submit(e));
    document.getElementById('contact-cancel').addEventListener('click', () => Contacts.cancelEdit());
    document.getElementById('contact-import-form').addEventListener('submit', (e) => Contacts.importCsv(e));
    document.getElementById('contact-filter-btn').addEventListener('click', () => Contacts.load());

    document.getElementById('config-form').addEventListener('submit', (e) => Configs.submit(e));
    document.getElementById('config-cancel').addEventListener('click', () => Configs.cancelEdit());
    document.getElementById('config-periodicity').addEventListener('change', () => Configs.toggleCustomDates());

    document.getElementById('recipient-form').addEventListener('submit', (e) => Recipients.submit(e));
    document.getElementById('recipient-cancel').addEventListener('click', () => Recipients.cancelEdit());

    document.getElementById('report-filter-btn').addEventListener('click', () => Reports.load());
    document.getElementById('report-refresh-btn').addEventListener('click', () => Reports.load());
    document.getElementById('report-modal-close').addEventListener('click', () => document.getElementById('report-modal').classList.add('hidden'));
    document.getElementById('report-modal').addEventListener('click', (e) => {
      if (e.target.id === 'report-modal') document.getElementById('report-modal').classList.add('hidden');
    });

    document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => loadTabData(btn.dataset.tab)));

    if (!getApiKey()) {
      toast('Cole sua apikey no canto superior direito e clique em Salvar.', true);
    } else {
      loadActiveTabData();
    }
  }

  function loadActiveTabData() {
    const active = document.querySelector('.tab-btn.active');
    if (active) loadTabData(active.dataset.tab);
  }

  function loadTabData(tab) {
    if (!getApiKey()) return;
    if (tab === 'contacts') Contacts.load();
    if (tab === 'configs') Configs.load();
    if (tab === 'recipients') Recipients.load();
    if (tab === 'reports') Reports.load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
