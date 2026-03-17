const defaultSettings = {
  apiBase: '/api',
  allowTableChange: true,
  defaultTable: null,
  pageSize: 25,
  visibleTables: null,
  heroTitle: null,
  heroSubtitle: null
};

/* ── Toast notification system ─────────────────────────────────────────── */
function initToastContainer() {
  if (document.getElementById('toast-container')) { return; }
  const el = document.createElement('div');
  el.id = 'toast-container';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'false');
  document.body.appendChild(el);
}

function showToast(message, type = 'info', durationMs = 3800) {
  initToastContainer();
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${icons[type] ?? 'ℹ'}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(toast);
  const remove = () => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  const timer = setTimeout(remove, durationMs);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

/* ── Custom confirm dialog ─────────────────────────────────────────────── */
function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="confirm-box__icon" aria-hidden="true">🗑️</div>
      <p class="confirm-box__title" id="confirm-title">¿Confirmar acción?</p>
      <p class="confirm-box__msg">${message}</p>
      <div class="confirm-box__actions">
        <button class="btn-ghost" id="confirm-cancel">Cancelar</button>
        <button class="btn-accent" id="confirm-ok" style="background:linear-gradient(135deg,#f87171,#dc2626);color:#fff">Eliminar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cancel = overlay.querySelector('#confirm-cancel');
  const ok = overlay.querySelector('#confirm-ok');
  ok.focus();
  cancel.addEventListener('click', () => overlay.remove());
  ok.addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); } });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { overlay.remove(); } });
}

/* ── Mobile nav toggle ─────────────────────────────────────────────────── */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.top-nav');
  if (!toggle || !nav) { return; }
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '✕' : '☰';
  });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('nav-open') && !nav.contains(e.target)) {
      nav.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    }
  });
}

document.addEventListener('DOMContentLoaded', initMobileNav);

export function initCrudPage(userSettings = {}) {
  const settings = { ...defaultSettings, ...userSettings };
  const state = {
    meta: {},
    currentTable: settings.defaultTable,
    page: 1,
    pageSize: settings.pageSize,
    search: '',
    records: [],
    total: 0,
    optionsCache: {}
  };

  const refs = {
    tableSelect: document.getElementById('tableSelect'),
    search: document.getElementById('searchInput'),
    page: document.getElementById('pageInput'),
    pageSize: document.getElementById('pageSizeInput'),
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),
    gridStats: document.getElementById('gridStats'),
    status: document.getElementById('status'),
    formFields: document.getElementById('formFields'),
    formMode: document.getElementById('formMode'),
    recordForm: document.getElementById('recordForm'),
    deleteBtn: document.getElementById('deleteBtn'),
    reloadBtn: document.getElementById('reloadBtn'),
    newBtn: document.getElementById('newBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    heroTitle: document.querySelector('[data-hero-title]'),
    heroSubtitle: document.querySelector('[data-hero-subtitle]'),
    tableLabel: document.querySelector('[data-table-label]')
  };

  if (!refs.recordForm) {
    throw new Error('initCrudPage: HTML inválido, faltan elementos base.');
  }

  /* Apply ARIA live region to status element */
  if (refs.status) {
    refs.status.setAttribute('role', 'status');
    refs.status.setAttribute('aria-live', 'polite');
    refs.status.setAttribute('aria-atomic', 'true');
  }

  const applyHeroText = () => {
    if (settings.heroTitle && refs.heroTitle) {
      refs.heroTitle.textContent = settings.heroTitle;
    }
    if (settings.heroSubtitle && refs.heroSubtitle) {
      refs.heroSubtitle.textContent = settings.heroSubtitle;
    }
  };

  applyHeroText();

  const fetchJSON = async (url, options) => {
    const res = await fetch(url, options ? {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    } : undefined);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'Error al consultar la API');
    }
    return res.json();
  };

  const setStatus = (message, type = 'idle') => {
    if (!refs.status) { return; }
    refs.status.textContent = message || '';
    refs.status.className = 'status';
    if (type === 'error') { refs.status.classList.add('status--error'); }
    else if (type === 'success') { refs.status.classList.add('status--success'); }
    else if (type === 'loading') { refs.status.classList.add('status--loading'); }
  };

  const filterMeta = (meta) => {
    if (!settings.visibleTables?.length) {
      return meta;
    }
    return Object.fromEntries(Object.entries(meta).filter(([key]) => settings.visibleTables.includes(key)));
  };

  const loadMeta = async () => {
    try {
      const meta = await fetchJSON(`${settings.apiBase}/meta`);
      state.meta = filterMeta(meta);
      const tableKeys = Object.keys(state.meta);
      if (!tableKeys.length) {
        throw new Error('No hay tablas disponibles para renderizar.');
      }
      if (refs.tableSelect) {
        const fragment = document.createDocumentFragment();
        tableKeys.forEach((key) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = state.meta[key].label || key;
          fragment.appendChild(option);
        });
        refs.tableSelect.innerHTML = '';
        refs.tableSelect.appendChild(fragment);
      }
      let defaultKey = settings.defaultTable && state.meta[settings.defaultTable]
        ? settings.defaultTable
        : tableKeys[0];
      state.currentTable = defaultKey;
      if (refs.tableSelect) {
        refs.tableSelect.value = defaultKey;
        refs.tableSelect.disabled = !settings.allowTableChange;
        if (!settings.allowTableChange) {
          refs.tableSelect.closest('label')?.classList.add('table-select-locked');
        } else {
          refs.tableSelect.closest('label')?.classList.remove('table-select-locked');
        }
      }
      refs.page.value = state.page;
      refs.pageSize.value = state.pageSize;
      renderForm();
      await loadTable();
    } catch (error) {
      setStatus(error.message, 'error');
      showToast(error.message, 'error');
    }
  };

  const buildColumns = (def) => {
    const fkDefaults = def.foreignKeyDefaults || {};
    return [
      ...def.primaryKey.map((pk) => ({
        ...pk,
        isPrimary: true,
        foreignKey: pk.foreignKey || fkDefaults[pk.column]
      })),
      ...(def.columns || []).map((col) => ({
        ...col,
        isPrimary: false
      }))
    ];
  };

  const loadTable = async () => {
    if (!state.currentTable) { return; }
    try {
      setStatus('Cargando datos…', 'loading');
      const params = new URLSearchParams({
        page: state.page,
        pageSize: state.pageSize,
        search: state.search || ''
      });
      const payload = await fetchJSON(`${settings.apiBase}/${state.currentTable}?${params}`);
      state.records = payload.data || [];
      state.total = payload.total || state.records.length;
      if (refs.page) { refs.page.value = state.page; }
      if (refs.pageSize) { refs.pageSize.value = state.pageSize; }
      if (refs.search) { refs.search.value = state.search; }
      await ensureForeignOptions();
      renderTable();
      setStatus(`${state.total} registros encontrados.`, 'idle');
    } catch (error) {
      setStatus(error.message, 'error');
      showToast(error.message, 'error');
    }
  };

  const ensureForeignOptions = async () => {
    if (state.optionsCache[state.currentTable]) { return; }
    try {
      const data = await fetchJSON(`${settings.apiBase}/${state.currentTable}/options`);
      state.optionsCache[state.currentTable] = data;
      populateForeignSelects();
    } catch (error) {
      console.warn('No se pudieron cargar opciones', error.message);
    }
  };

  const renderTable = () => {
    const def = state.meta[state.currentTable];
    if (!def || !refs.tableHead || !refs.tableBody) { return; }
    const columns = buildColumns(def);
    refs.tableHead.innerHTML = '<tr>' + columns.map((col) => `<th>${col.label || col.column}</th>`).join('') + '<th class="col-actions">Acciones</th></tr>';
    refs.tableBody.innerHTML = '';
    if (!state.records.length) {
      const colCount = columns.length + 1;
      refs.tableBody.innerHTML = `<tr><td colspan="${colCount}">
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">📋</span>
          <span class="empty-state__title">Sin registros</span>
          <span class="empty-state__sub">No se encontraron datos para esta búsqueda.</span>
        </div>
      </td></tr>`;
    } else {
      state.records.forEach((record) => {
        const row = document.createElement('tr');
        row.dataset.pk = JSON.stringify(extractPk(def, record));
        row.innerHTML = columns.map((col) => `<td>${formatCell(col, record[col.column], record)}</td>`).join('');

        const actionsCell = document.createElement('td');
        actionsCell.className = 'row-actions';
        actionsCell.innerHTML = `
          <button class="btn-row btn-row-edit" title="Editar registro" aria-label="Editar registro">✏️</button>
          <button class="btn-row btn-row-delete" title="Eliminar registro" aria-label="Eliminar registro">🗑️</button>
        `;
        row.appendChild(actionsCell);

        actionsCell.querySelector('.btn-row-edit').addEventListener('click', (e) => {
          e.stopPropagation();
          Array.from(refs.tableBody.children).forEach((tr) => tr.classList.remove('active'));
          row.classList.add('active');
          fillForm(record);
          modalLastFocus = actionsCell.querySelector('.btn-row-edit');
          openRecordModal('edit');
        });

        actionsCell.querySelector('.btn-row-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          showConfirm('Esta acción no se puede deshacer. ¿Deseas eliminar este registro?', async () => {
            try {
              setStatus('Eliminando…', 'loading');
              const pk = JSON.parse(row.dataset.pk);
              await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'DELETE', body: pk });
              await loadTable();
              setStatus('Registro eliminado.', 'success');
              showToast('Registro eliminado correctamente.', 'success');
            } catch (error) {
              setStatus(error.message, 'error');
              showToast(error.message, 'error');
            }
          });
        });

        row.addEventListener('click', (e) => {
          if (e.target.closest('.row-actions')) { return; }
          Array.from(refs.tableBody.children).forEach((tr) => tr.classList.remove('active'));
          row.classList.add('active');
          fillForm(record);
          modalLastFocus = row;
          openRecordModal('edit');
        });

        refs.tableBody.appendChild(row);
      });
    }
    const start = state.records.length ? ((state.page - 1) * state.pageSize) + 1 : 0;
    const end = start + state.records.length - 1;
    if (refs.gridStats) {
      refs.gridStats.textContent = state.records.length ? `${start} – ${end} de ${state.total}` : 'Sin datos';
    }
  };

  const formatValue = (descriptor, value) => {
    if (value === null || value === undefined || value === '') { return '—'; }
    if (descriptor.type === 'boolean') { return value ? 'Sí' : 'No'; }
    if (descriptor.type === 'date') { return value?.split('T')[0] || value; }
    if (descriptor.type === 'file') { return value ? '📎 Archivo' : '—'; }
    return value;
  };

  // Renders a table <td> value. File columns become clickable <img> thumbnails
  // served by the dedicated image endpoint instead of rendering raw base64.
  // 'image-path' columns render as <img> when a path or URL is stored.
  const formatCell = (descriptor, value, record) => {
    if (descriptor.type === 'file') {
      if (!value) { return '—'; }
      const def = state.meta[state.currentTable];
      const pk = extractPk(def, record);
      const pkParams = Object.entries(pk)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      const url = `${settings.apiBase}/${state.currentTable}/image/${descriptor.column}?${pkParams}`;
      return `<img class="img-thumb" src="${url}" alt="${descriptor.label || descriptor.column}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'img-thumb-err',textContent:'📷'}))">`;
    }
    if (descriptor.type === 'image-path') {
      if (!value) { return '—'; }
      const url = /^https?:\/\//.test(value) ? value : `/${value.replace(/^\//, '')}`;
      return `<img class="img-thumb" src="${url}" alt="${descriptor.label || descriptor.column}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'img-thumb-err',textContent:'📷'}))">`;
    }
    return formatValue(descriptor, value);
  };

  // Opens a full-screen lightbox to enlarge an image src.
  const openLightbox = (src) => {
    if (!src) { return; }
    const overlay = document.createElement('div');
    overlay.className = 'img-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Vista ampliada de imagen');
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Vista ampliada';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'img-lightbox__close';
    closeBtn.setAttribute('aria-label', 'Cerrar imagen');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    const onKey = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
    };
    closeBtn.addEventListener('click', () => { overlay.remove(); document.removeEventListener('keydown', onKey); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', onKey); } });
    document.addEventListener('keydown', onKey);
    overlay.append(img, closeBtn);
    document.body.appendChild(overlay);
    closeBtn.focus();
  };

  const extractPk = (def, record) => {
    const pk = {};
    def.primaryKey.forEach((field) => {
      pk[field.column] = record[field.column];
    });
    return pk;
  };

  const renderForm = () => {
    const def = state.meta[state.currentTable];
    if (!def || !refs.formFields) { return; }
    refs.recordForm.dataset.mode = 'create';
    refs.recordForm.dataset.pk = '';
    refs.formMode.textContent = 'Modo: crear';
    const columns = buildColumns(def);
    refs.formFields.innerHTML = '';
    columns.forEach((column) => {
      refs.formFields.appendChild(buildField(column));
    });
    populateForeignSelects();
    toggleDeleteButton(false);
  };

  const buildField = (column) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'field';
    wrapper.dataset.column = column.column;
    wrapper.dataset.type = column.type || 'string';

    const title = document.createElement('span');
    title.className = 'field-label';
    title.textContent = column.label || column.column;
    wrapper.appendChild(title);

    if (column.type === 'file') {
      wrapper.appendChild(buildFileField(column));
      return wrapper;
    }

    const input = createStandardInput(column);
    wrapper.appendChild(input);
    return wrapper;
  };

  const createStandardInput = (column) => {
    if (column.foreignKey) {
      const select = document.createElement('select');
      select.name = column.column;
      select.appendChild(new Option('-- seleccionar --', ''));
      updateSelectOptions(select, column);
      if (column.required) { select.required = true; }
      return select;
    }
    if (column.type === 'boolean') {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = column.column;
      return checkbox;
    }
    if (column.type === 'text') {
      const textarea = document.createElement('textarea');
      textarea.name = column.column;
      if (column.required) { textarea.required = true; }
      return textarea;
    }
    const input = document.createElement('input');
    input.name = column.column;
    if (column.type === 'number') { input.type = 'number'; }
    else if (column.type === 'date') { input.type = 'date'; }
    else { input.type = 'text'; }
    if (column.step) { input.step = column.step; }
    if (column.required) { input.required = true; }
    if (column.auto) {
      input.placeholder = 'auto';
      input.disabled = true;
    }
    return input;
  };

  const buildFileField = (column) => {
    const container = document.createElement('div');
    container.className = 'file-field';

    // Preview image shown when a record with an image is loaded for editing
    // or immediately when a new file is selected.
    const preview = document.createElement('img');
    preview.className = 'img-preview';
    preview.dataset.filePreview = column.column;
    preview.alt = column.label || column.column;
    preview.style.display = 'none';
    preview.addEventListener('click', () => openLightbox(preview.src));

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = column.accept || 'image/*';
    fileInput.dataset.fileUpload = column.column;

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = column.column;
    hidden.dataset.fileValue = 'true';

    const helper = document.createElement('small');
    helper.className = 'file-helper';
    helper.dataset.fileInfo = column.column;
    helper.textContent = 'Sin archivo';

    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      await handleFileSelection(file, hidden, helper, preview);
    });

    container.append(preview, fileInput, hidden, helper);
    return container;
  };

  const handleFileSelection = (file, hiddenInput, helper, preview) => new Promise((resolve) => {
    if (!file) {
      hiddenInput.value = '';
      helper.textContent = 'Sin archivo';
      helper.dataset.hasFile = 'false';
      if (preview) { preview.src = ''; preview.style.display = 'none'; }
      return resolve();
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',').pop();
      hiddenInput.value = base64 || '';
      helper.textContent = `${file.name} · ${formatBytes(file.size)}`;
      helper.dataset.hasFile = 'true';
      if (preview) { preview.src = result; preview.style.display = ''; }
      resolve();
    };
    reader.onerror = () => {
      hiddenInput.value = '';
      helper.textContent = 'Error al leer archivo';
      helper.dataset.hasFile = 'false';
      if (preview) { preview.src = ''; preview.style.display = 'none'; }
      resolve();
    };
    reader.readAsDataURL(file);
  });

  const formatBytes = (bytes) => {
    if (!bytes) { return '0 KB'; }
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const value = bytes / (1024 ** i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const updateSelectOptions = (select, column) => {
    const cache = state.optionsCache[state.currentTable];
    const options = cache ? cache[column.column] : null;
    if (!options) { return; }
    options.forEach((item) => {
      select.appendChild(new Option(item.label, item.value));
    });
  };

  const populateForeignSelects = () => {
    const def = state.meta[state.currentTable];
    const cache = state.optionsCache[state.currentTable];
    if (!def || !cache) { return; }
    const columns = buildColumns(def).filter((col) => col.foreignKey);
    Array.from(refs.formFields.querySelectorAll('select[name]')).forEach((select) => {
      const descriptor = columns.find((col) => col.column === select.name);
      if (!descriptor) { return; }
      const currentValue = select.value;
      select.innerHTML = '';
      select.appendChild(new Option('-- seleccionar --', ''));
      (cache[descriptor.column] || []).forEach((item) => {
        select.appendChild(new Option(item.label, item.value));
      });
      select.value = currentValue;
    });
  };

  const fillForm = (record) => {
    const def = state.meta[state.currentTable];
    refs.recordForm.dataset.mode = 'edit';
    refs.recordForm.dataset.pk = JSON.stringify(extractPk(def, record));
    refs.formMode.textContent = 'Modo: edición';
    Array.from(refs.formFields.querySelectorAll('[name]')).forEach((field) => {
      const descriptor = findDescriptor(def, field.name);
      if (!descriptor) { return; }
      const value = record[field.name];
      if (descriptor.type === 'file') {
        field.value = value || '';
        const helper = refs.formFields.querySelector(`[data-file-info="${descriptor.column}"]`);
        const previewImg = refs.formFields.querySelector(`[data-file-preview="${descriptor.column}"]`);
        if (helper) {
          if (value) {
            helper.textContent = 'Archivo almacenado · usa "Cambiar" para reemplazar';
            helper.dataset.hasFile = 'true';
          } else {
            helper.textContent = 'Sin archivo';
            helper.dataset.hasFile = 'false';
          }
        }
        if (previewImg) {
          if (value) {
            const pk = extractPk(def, record);
            const pkParams = Object.entries(pk)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
            previewImg.src = `${settings.apiBase}/${state.currentTable}/image/${descriptor.column}?${pkParams}`;
            previewImg.style.display = '';
          } else {
            previewImg.src = '';
            previewImg.style.display = 'none';
          }
        }
        return;
      }
      if (descriptor.type === 'boolean') {
        field.checked = Boolean(value);
      } else {
        field.value = value ?? '';
      }
      if ((descriptor.isPrimary || descriptor.auto) && field.type !== 'hidden') {
        field.disabled = true;
      } else if (field.type !== 'hidden') {
        field.disabled = false;
      }
    });
    toggleDeleteButton(true);
  };

  const findDescriptor = (def, columnName) => buildColumns(def).find((col) => col.column === columnName);

  const clearForm = () => {
    refs.recordForm.dataset.mode = 'create';
    refs.recordForm.dataset.pk = '';
    refs.formMode.textContent = 'Modo: crear';
    refs.recordForm.reset();
    refs.formFields.querySelectorAll('[data-file-info]').forEach((helper) => {
      helper.textContent = 'Sin archivo';
      helper.dataset.hasFile = 'false';
    });
    refs.formFields.querySelectorAll('[data-file-preview]').forEach((img) => {
      img.src = '';
      img.style.display = 'none';
    });
    Array.from(refs.formFields.querySelectorAll('[name]')).forEach((field) => {
      if (field.type !== 'hidden') {
        field.disabled = field.placeholder === 'auto';
      }
      if (field.type === 'checkbox') {
        field.checked = false;
      } else {
        field.value = '';
      }
    });
    toggleDeleteButton(false);
    if (refs.tableBody) {
      Array.from(refs.tableBody.children).forEach((tr) => tr.classList.remove('active'));
    }
  };

  const toggleDeleteButton = (enable) => {
    if (!refs.deleteBtn) { return; }
    refs.deleteBtn.disabled = !enable;
    refs.deleteBtn.style.opacity = enable ? 1 : 0.4;
  };

  /* ── Record modal (overlay for add / edit) ──────────────────────────────── */
  let recordModal = null;
  let modalLastFocus = null;

  const trapFocusInModal = (e, container) => {
    const focusable = [...container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    if (!focusable.length) { return; }
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const openRecordModal = (mode = 'create') => {
    if (!recordModal) { return; }
    const titleEl = recordModal.querySelector('.crud-modal-title');
    if (titleEl) { titleEl.textContent = mode === 'edit' ? 'Editar registro' : 'Nuevo registro'; }
    recordModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      const first = recordModal.querySelector(
        'input:not([disabled]):not([placeholder="auto"]), select:not([disabled]), textarea:not([disabled])'
      );
      first?.focus();
    }, 80);
  };

  const closeRecordModal = () => {
    if (!recordModal) { return; }
    recordModal.setAttribute('aria-hidden', 'true');
    clearForm();
    modalLastFocus?.focus?.();
  };

  const initRecordModal = () => {
    const formSection = refs.recordForm?.closest('section');
    if (!formSection) { return; }

    const overlay = document.createElement('div');
    overlay.className = 'crud-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'crud-modal-title');
    overlay.setAttribute('aria-hidden', 'true');

    const box = document.createElement('div');
    box.className = 'crud-modal-box';

    const mHead = document.createElement('header');
    mHead.className = 'crud-modal-header';

    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.style.cssText = 'margin:0;font-size:.72rem;color:var(--muted)';
    eyebrow.textContent = 'Formulario';
    const titleEl = document.createElement('h2');
    titleEl.className = 'crud-modal-title';
    titleEl.id = 'crud-modal-title';
    titleEl.style.margin = '0';
    titleEl.textContent = 'Nuevo registro';
    titleWrap.appendChild(eyebrow);
    titleWrap.appendChild(titleEl);

    const headerActions = document.createElement('div');
    headerActions.style.cssText = 'display:flex;align-items:center;gap:.6rem';
    if (refs.formMode) {
      refs.formMode.style.cssText = 'font-size:.8rem;color:var(--accent)';
      headerActions.appendChild(refs.formMode);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'crud-modal-close';
    closeBtn.setAttribute('aria-label', 'Cerrar formulario');
    closeBtn.type = 'button';
    closeBtn.textContent = '\u2715';
    headerActions.appendChild(closeBtn);

    mHead.appendChild(titleWrap);
    mHead.appendChild(headerActions);

    const mBody = document.createElement('div');
    mBody.className = 'crud-modal-body';
    mBody.appendChild(refs.recordForm);

    box.appendChild(mHead);
    box.appendChild(mBody);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Remove now-empty form section; collapse layout to single column
    formSection.remove();
    const layout = document.querySelector('main.crud-layout');
    if (layout) { layout.style.gridTemplateColumns = '1fr'; }

    // Inject "+ Nuevo" button into the table panel's action bar
    const tableActions = document.querySelector('main.crud-layout .panel .actions');
    if (tableActions) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-accent';
      addBtn.id = 'addRecordBtn';
      addBtn.textContent = '+ Nuevo';
      tableActions.prepend(addBtn);
      addBtn.addEventListener('click', () => {
        modalLastFocus = addBtn;
        clearForm();
        openRecordModal('create');
      });
    }

    closeBtn.addEventListener('click', closeRecordModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { closeRecordModal(); } });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeRecordModal(); return; }
      if (e.key === 'Tab') { trapFocusInModal(e, box); }
    });

    recordModal = overlay;
  };

  initRecordModal();

  const gatherPayload = () => {
    const payload = {};
    Array.from(refs.formFields.querySelectorAll('[name]')).forEach((field) => {
      if (field.disabled && field.placeholder === 'auto' && refs.recordForm.dataset.mode !== 'edit') {
        return;
      }
      if (field.type === 'checkbox') {
        payload[field.name] = field.checked ? 1 : 0;
      } else if (field.value !== '') {
        payload[field.name] = field.value;
      }
    });
    if (refs.recordForm.dataset.pk) {
      Object.assign(payload, JSON.parse(refs.recordForm.dataset.pk));
    }
    return payload;
  };

  refs.recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.currentTable) { return; }
    const payload = gatherPayload();
    const mode = refs.recordForm.dataset.mode || 'create';
    const submitBtn = refs.recordForm.querySelector('[type=submit]');
    const originalText = submitBtn?.textContent;
    try {
      if (submitBtn) { submitBtn.dataset.loading = '1'; submitBtn.textContent = mode === 'edit' ? 'Actualizando…' : 'Guardando…'; }
      setStatus(mode === 'edit' ? 'Actualizando…' : 'Creando…', 'loading');
      if (mode === 'edit') {
        await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'PUT', body: payload });
      } else {
        await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'POST', body: payload });
      }
      await loadTable();
      closeRecordModal();
      const msg = mode === 'edit' ? 'Registro actualizado correctamente.' : 'Registro creado correctamente.';
      setStatus(msg, 'success');
      showToast(msg, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
      showToast(error.message, 'error');
    } finally {
      if (submitBtn) { delete submitBtn.dataset.loading; submitBtn.textContent = originalText; }
    }
  });

  if (refs.deleteBtn) {
    refs.deleteBtn.addEventListener('click', () => {
      if (!refs.recordForm.dataset.pk) { return; }
      showConfirm('Esta acción no se puede deshacer. ¿Deseas eliminar este registro?', async () => {
        const deleteBtn = refs.deleteBtn;
        const originalText = deleteBtn.textContent;
        try {
          const payload = JSON.parse(refs.recordForm.dataset.pk);
          deleteBtn.dataset.loading = '1';
          deleteBtn.textContent = 'Eliminando…';
          setStatus('Eliminando…', 'loading');
          await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'DELETE', body: payload });
          await loadTable();
          closeRecordModal();
          setStatus('Registro eliminado.', 'success');
          showToast('Registro eliminado correctamente.', 'success');
        } catch (error) {
          setStatus(error.message, 'error');
          showToast(error.message, 'error');
        } finally {
          delete deleteBtn.dataset.loading;
          deleteBtn.textContent = originalText;
        }
      });
    });
  }

  refs.newBtn?.addEventListener('click', () => {
    clearForm();
    const titleEl = recordModal?.querySelector('.crud-modal-title');
    if (titleEl) { titleEl.textContent = 'Nuevo registro'; }
  });
  refs.clearSelectionBtn?.addEventListener('click', closeRecordModal);

  refs.reloadBtn?.addEventListener('click', () => {
    state.page = Number(refs.page.value) || 1;
    state.pageSize = Number(refs.pageSize.value) || settings.pageSize;
    state.search = refs.search.value.trim();
    loadTable();
  });

  if (refs.tableSelect && settings.allowTableChange) {
    refs.tableSelect.addEventListener('change', async (event) => {
      state.currentTable = event.target.value;
      state.page = 1;
      clearForm();
      renderForm();
      await loadTable();
    });
  }

  refs.search?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      state.search = event.target.value.trim();
      loadTable();
    }
  });

  loadMeta();
}
