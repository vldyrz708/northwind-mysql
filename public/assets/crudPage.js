const defaultSettings = {
  apiBase: '/api',
  allowTableChange: true,
  defaultTable: null,
  pageSize: 25,
  visibleTables: null,
  heroTitle: null,
  heroSubtitle: null
};

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

  const setStatus = (message, isError = false) => {
    if (!refs.status) { return; }
    refs.status.textContent = message || '';
    refs.status.style.color = isError ? '#f87171' : 'var(--muted)';
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
      setStatus(error.message, true);
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
      setStatus('Cargando datos...');
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
      setStatus(`Encontrados ${state.total} registros.`);
    } catch (error) {
      setStatus(error.message, true);
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
    refs.tableHead.innerHTML = '<tr>' + columns.map((col) => `<th>${col.label || col.column}</th>`).join('') + '</tr>';
    refs.tableBody.innerHTML = '';
    state.records.forEach((record) => {
      const row = document.createElement('tr');
      row.dataset.pk = JSON.stringify(extractPk(def, record));
      row.innerHTML = columns.map((col) => `<td>${formatValue(col, record[col.column])}</td>`).join('');
      row.addEventListener('click', () => {
        Array.from(refs.tableBody.children).forEach((tr) => tr.classList.remove('active'));
        row.classList.add('active');
        fillForm(record);
      });
      refs.tableBody.appendChild(row);
    });
    const start = state.records.length ? ((state.page - 1) * state.pageSize) + 1 : 0;
    const end = start + state.records.length - 1;
    if (refs.gridStats) {
      refs.gridStats.textContent = state.records.length ? `${start} - ${end} de ${state.total}` : 'Sin datos';
    }
  };

  const formatValue = (descriptor, value) => {
    if (value === null || value === undefined || value === '') { return '—'; }
    if (descriptor.type === 'boolean') { return value ? 'Sí' : 'No'; }
    if (descriptor.type === 'date') { return value?.split('T')[0] || value; }
    if (descriptor.type === 'file') { return value ? '📎 Archivo' : '—'; }
    return value;
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
      await handleFileSelection(file, hidden, helper);
    });

    container.append(fileInput, hidden, helper);
    return container;
  };

  const handleFileSelection = (file, hiddenInput, helper) => new Promise((resolve) => {
    if (!file) {
      hiddenInput.value = '';
      helper.textContent = 'Sin archivo';
      helper.dataset.hasFile = 'false';
      return resolve();
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result.split(',').pop() : '';
      hiddenInput.value = base64 || '';
      helper.textContent = `${file.name} · ${formatBytes(file.size)}`;
      helper.dataset.hasFile = 'true';
      resolve();
    };
    reader.onerror = () => {
      hiddenInput.value = '';
      helper.textContent = 'Error al leer archivo';
      helper.dataset.hasFile = 'false';
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
        if (helper) {
          if (value) {
            helper.textContent = 'Archivo almacenado · usa "Cambiar" para reemplazar';
            helper.dataset.hasFile = 'true';
          } else {
            helper.textContent = 'Sin archivo';
            helper.dataset.hasFile = 'false';
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
    try {
      setStatus(mode === 'edit' ? 'Actualizando...' : 'Creando...');
      if (mode === 'edit') {
        await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'PUT', body: payload });
      } else {
        await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'POST', body: payload });
      }
      await loadTable();
      clearForm();
      setStatus('Cambios guardados');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  if (refs.deleteBtn) {
    refs.deleteBtn.addEventListener('click', async () => {
      if (!refs.recordForm.dataset.pk) { return; }
      if (!confirm('¿Eliminar registro seleccionado?')) { return; }
      try {
        const payload = JSON.parse(refs.recordForm.dataset.pk);
        setStatus('Eliminando...');
        await fetchJSON(`${settings.apiBase}/${state.currentTable}`, { method: 'DELETE', body: payload });
        await loadTable();
        clearForm();
        setStatus('Registro eliminado');
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  refs.newBtn?.addEventListener('click', clearForm);
  refs.clearSelectionBtn?.addEventListener('click', clearForm);

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
