// Lógica mínima para manejar entradas y salidas, persistencia en localStorage y gráficos con Chart.js
const STORAGE_KEY = 'cuentas:cartera:v1';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { entries: [], expenses: [], pendings: [] }; }
  catch (e) { return { entries: [], expenses: [], pendings: [] }; }
}

function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

// Helpers
function formatCurrency(n) {
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function query(selector, parent = document) { return parent.querySelector(selector); }

// Render lists
function renderLists() {
  const entriesList = query('#entriesList');
  const expensesList = query('#expensesList');
  const pendingList = query('#pendingList');
  entriesList.innerHTML = '';
  expensesList.innerHTML = '';
  pendingList.innerHTML = '';
  if (state.entries.length === 0) entriesList.innerHTML = '<div class="empty">No hay entradas registradas</div>';
  if (state.expenses.length === 0) expensesList.innerHTML = '<div class="empty">No hay salidas registradas</div>';
  if ((state.pendings || []).length === 0) pendingList.innerHTML = '<div class="empty">No hay cobros pendientes</div>';

  // aplicar filtro por mes si existe
  const monthFilter = query('#filterMonth') ? query('#filterMonth').value : '';
  const inMonth = (itemDate) => {
    if (!monthFilter) return true;
    const [y, m] = monthFilter.split('-');
    const d = new Date(itemDate);
    return d.getFullYear() === Number(y) && (d.getMonth() + 1) === Number(m);
  };

  state.entries.slice().reverse().forEach(item => {
    if (!inMonth(item.date || item.createdAt)) return;
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `
      <div class="header">
        <div class="info">
          <strong>${item.name}</strong>
          <div class="meta">${item.description || ''}</div>
          <div class="meta">${item.date}</div>
        </div>
        <div class="amount">${formatCurrency(item.amount)}</div>
      </div>
      <div class="actions">
        <button class="btn primary small" data-action="edit" data-id="${item.id}" data-type="entry">✏️ Editar</button>
        <button class="btn secondary small" data-id="${item.id}" data-type="entry">🗑️ Eliminar</button>
      </div>`;
    entriesList.appendChild(el);
  });

  state.expenses.slice().reverse().forEach(item => {
    if (!inMonth(item.date || item.createdAt)) return;
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `
      <div class="header">
        <div class="info">
          <strong>${item.name}</strong>
          <div class="meta">${item.description || ''}</div>
          <div class="meta">${item.date}</div>
        </div>
        <div class="amount">${formatCurrency(item.amount)}</div>
      </div>
      <div class="actions">
        <button class="btn primary small" data-action="edit" data-id="${item.id}" data-type="expense">✏️ Editar</button>
        <button class="btn secondary small" data-id="${item.id}" data-type="expense">🗑️ Eliminar</button>
      </div>`;
    expensesList.appendChild(el);
  });

  (state.pendings || []).slice().reverse().forEach(item => {
    if (!inMonth(item.date || item.createdAt)) return;
    const el = document.createElement('div'); el.className = 'item';
    const assoc = item.associatedTo ? `Asociado a: ${item.associatedToName || item.associatedTo}` : '';
    const status = item.paid ? `<span class="category-pill paid">✅ Pagado</span>` : `<span class="category-pill pending">⏳ Pendiente</span>`;
    el.innerHTML = `
      <div class="header">
        <div class="info">
          <strong>${item.name}</strong>
          <div style="margin:8px 0">${status}</div>
          <div class="meta">${item.description || ''}</div>
          ${assoc ? `<div class="meta">${assoc}</div>` : ''}
          <div class="meta">${item.date}</div>
        </div>
        <div class="amount">${formatCurrency(item.amount)}</div>
      </div>
      <div class="actions">
        <button class="btn primary small" data-action="edit" data-id="${item.id}" data-type="pending">✏️ Editar</button>
        ${!item.paid ? `<button class="btn small" data-action="markPaid" data-id="${item.id}" data-type="pending">💰 Marcar pagado</button>` : ''}
        <button class="btn secondary small" data-id="${item.id}" data-type="pending">🗑️ Eliminar</button>
      </div>`;
    pendingList.appendChild(el);
  });

  // attach handlers
  document.querySelectorAll('button[data-id]').forEach(btn => {
    const id = btn.getAttribute('data-id');
    const type = btn.getAttribute('data-type');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') {
      btn.onclick = () => openEdit(type, id);
    } else if (action === 'markPaid') {
      btn.onclick = () => markPendingAsPaid(id);
    } else {
      btn.onclick = () => {
        // usar confirmación
        showConfirm('Eliminar', '¿Deseas eliminar este elemento?', () => {
          if (type === 'entry') state.entries = state.entries.filter(i => i.id !== id);
          else if (type === 'expense') state.expenses = state.expenses.filter(i => i.id !== id);
          else if (type === 'pending') state.pendings = (state.pendings || []).filter(i => i.id !== id);
          saveState(state); renderAll();
        });
      }
    }
  });
}

// Totals and charts
let barChart = null; let pieChart = null;
function calcTotals() {
  const totalEntries = state.entries.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpenses = state.expenses.reduce((s, i) => s + Number(i.amount), 0);
  return { totalEntries, totalExpenses };
}

function renderTotals() {
  const t = calcTotals();
  query('#totalEntries').textContent = formatCurrency(t.totalEntries);
  query('#totalExpenses').textContent = formatCurrency(t.totalExpenses);
  query('#netTotal').textContent = formatCurrency(t.totalEntries - t.totalExpenses);
}

function makeMonthlyComparison() {
  // agrupar por mes-año
  const months = {}; // '2025-09' -> {entries, expenses}
  const add = (arr, kind) => arr.forEach(i => {
    const d = new Date(i.date || i.createdAt);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[key] = months[key] || { entries: 0, expenses: 0 };
    months[key][kind] += Number(i.amount);
  });
  add(state.entries, 'entries'); add(state.expenses, 'expenses');
  const keys = Object.keys(months).sort();
  const labels = keys.map(k => { const [y, m] = k.split('-'); return `${m}/${y}`; });
  const entries = keys.map(k => months[k].entries);
  const expenses = keys.map(k => months[k].expenses);
  return { labels, entries, expenses };
}

function renderCharts() {
  // barras: comparison monthly
  const ctxBar = query('#barChart').getContext('2d');
  const data = makeMonthlyComparison();
  if (barChart) barChart.destroy();
  barChart = new Chart(ctxBar, {
    type: 'bar',
    data: { labels: data.labels, datasets: [{ label: 'Entradas', data: data.entries, backgroundColor: '#10b981' }, { label: 'Salidas', data: data.expenses, backgroundColor: '#ef4444' }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  // pastel: this month
  const ctxPie = query('#pieChart').getContext('2d');
  if (pieChart) pieChart.destroy();
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // incluir en el pastel: entradas, salidas y cobros pendientes del mes actual
  const monthFilter = query('#filterMonth') ? query('#filterMonth').value : '';
  const inMonth = (i) => {
    if (!monthFilter) { const d = new Date(i.date || i.createdAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
    const [y, m] = monthFilter.split('-'); const d = new Date(i.date || i.createdAt); return d.getFullYear() === Number(y) && (d.getMonth() + 1) === Number(m);
  };

  const monthEntries = state.entries.filter(i => inMonth(i)).reduce((s, i) => s + Number(i.amount), 0);
  const monthExpenses = state.expenses.filter(i => inMonth(i)).reduce((s, i) => s + Number(i.amount), 0);
  // pendings: solo pendientes no pagadas
  const monthPendings = (state.pendings || []).filter(i => !i.paid && inMonth(i)).reduce((s, i) => s + Number(i.amount), 0);
  pieChart = new Chart(ctxPie, {
    type: 'doughnut', data: { labels: ['Entradas', 'Salidas', 'Cobros pendientes'], datasets: [{ data: [monthEntries, monthExpenses, monthPendings], backgroundColor: ['#10b981', '#ef4444', '#f59e0b'] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderAll() { renderLists(); renderTotals(); renderCharts(); }

// Form handling
function openModal(type) {
  query('#modalBackdrop').classList.add('show');
  query('#itemForm').reset();
  query('#itemType').value = type;
  query('#itemId').value = '';
  // mostrar selector de asociacion solo para pendings
  if (type === 'pending') {
    query('#relatedRow').style.display = '';
    populateRelatedExpenses();
    query('#modalTitle').textContent = 'Nuevo Cobro Pendiente';
  } else {
    query('#relatedRow').style.display = 'none';
    query('#modalTitle').textContent = type === 'entry' ? 'Nueva Entrada' : 'Nueva Salida';
  }
}

function closeModal() { query('#modalBackdrop').classList.remove('show'); }

function onSubmitForm(e) {
  e.preventDefault();
  const name = query('#name').value.trim();
  const description = query('#description').value.trim();
  const amount = query('#amount').value.trim();
  const date = query('#date').value || new Date().toISOString().slice(0, 10);
  const type = query('#itemType').value;
  const id = query('#itemId').value;
  const related = query('#relatedExpense') ? query('#relatedExpense').value : '';
  if (!name || !amount) { alert('Los campos nombre y monto son obligatorios'); return; }
  if (Number(amount) <= 0) { alert('El monto debe ser mayor a 0'); return; }
  if (id) {
    // editar existente
    const lists = { entry: 'entries', expense: 'expenses', pending: 'pendings' };
    const listName = lists[type];
    const idx = (state[listName] || []).findIndex(i => i.id === id);
    if (idx >= 0) {
      state[listName][idx].name = name; state[listName][idx].description = description; state[listName][idx].amount = Number(amount); state[listName][idx].date = date;
      if (type === 'pending') {
        if (related) { state[listName][idx].associatedTo = related; const exp = state.expenses.find(e => e.id === related); if (exp) state[listName][idx].associatedToName = exp.name; }
        else { state[listName][idx].associatedTo = null; state[listName][idx].associatedToName = null; }
      }
    }
  } else {
    const item = { id: uid(), name, description, amount: Number(amount), date, createdAt: new Date().toISOString() };
    if (type === 'pending') {
      if (related) { item.associatedTo = related; const exp = state.expenses.find(e => e.id === related); if (exp) item.associatedToName = exp.name; }
      state.pendings = state.pendings || []; state.pendings.push(item);
    } else if (type === 'entry') state.entries.push(item);
    else state.expenses.push(item);
  }
  saveState(state); closeModal(); renderAll();
}

function populateRelatedExpenses() {
  const sel = query('#relatedExpense'); if (!sel) return;
  sel.innerHTML = '<option value="">-- Sin asociación --</option>';
  (state.expenses || []).forEach(e => { const opt = document.createElement('option'); opt.value = e.id; opt.textContent = `${e.name} - ${formatCurrency(e.amount)}`; sel.appendChild(opt); });
}

function openEdit(type, id) {
  // encontrar item
  const lists = { entry: 'entries', expense: 'expenses', pending: 'pendings' };
  const listName = lists[type];
  const item = (state[listName] || []).find(i => i.id === id);
  if (!item) return;
  openModal(type);
  query('#name').value = item.name;
  query('#description').value = item.description || '';
  query('#amount').value = item.amount;
  query('#date').value = item.date ? item.date : '';
  query('#itemId').value = item.id;
  if (type === 'pending') {
    populateRelatedExpenses();
    if (item.associatedTo) query('#relatedExpense').value = item.associatedTo;
  }
}

function attachUI() {
  query('#btnNewEntry').onclick = () => openModal('entry');
  query('#btnNewExpense').onclick = () => openModal('expense');
  query('#btnNewPending').onclick = () => openModal('pending');
  // toggle show/hide pending column
  // crear checkbox dinamicamente
  if (!query('#togglePending')) {
    const controls = document.querySelector('.controls');
    const span = document.createElement('label'); span.className = 'toggle-row'; span.innerHTML = `<input id="togglePending" type="checkbox" /> Mostrar Cobros Pendientes`;
    controls.appendChild(span);
    query('#togglePending').onchange = (e) => {
      const col = query('#colPending');
      const grid = document.querySelector('.lists-grid');
      if (col && grid) {
        col.style.display = e.target.checked ? '' : 'none';
        if (e.target.checked) {
          grid.classList.remove('hide-pending');
        } else {
          grid.classList.add('hide-pending');
        }
      }
      localStorage.setItem(STORAGE_KEY + ':showPending', e.target.checked ? '1' : '0');
    };
    // aplicar valor guardado
    const stored = localStorage.getItem(STORAGE_KEY + ':showPending');
    if (stored === '0') {
      if (query('#colPending')) query('#colPending').style.display = 'none';
      const grid = document.querySelector('.lists-grid');
      if (grid) grid.classList.add('hide-pending');
    } else {
      if (query('#colPending')) query('#colPending').style.display = '';
      query('#togglePending').checked = true;
    }
  }
  // filtro
  const filter = query('#filterMonth'); if (filter) filter.onchange = () => renderAll();
  const clear = query('#clearFilter'); if (clear) clear.onclick = () => { query('#filterMonth').value = ''; renderAll(); };
  query('#modalClose').onclick = closeModal;
  const cancel = query('#modalCancel'); if (cancel) cancel.onclick = closeModal;
  // cerrar si el usuario hace click fuera del modal
  const backdrop = query('#modalBackdrop'); if (backdrop) backdrop.onclick = (ev) => { if (ev.target === backdrop) closeModal(); };
  query('#itemForm').onsubmit = onSubmitForm;

  // confirm modal handlers
  const confirmBackdrop = query('#confirmBackdrop'); if (confirmBackdrop) {
    query('#confirmCancel').onclick = () => confirmBackdrop.classList.remove('show');
    query('#confirmOk').onclick = () => { if (confirmBackdrop._cb) confirmBackdrop._cb(); confirmBackdrop.classList.remove('show'); };
  }
}

function showConfirm(title, msg, cb) {
  const b = query('#confirmBackdrop'); if (!b) return; query('#confirmTitle').textContent = title; query('#confirmMessage').textContent = msg; b._cb = cb; b.classList.add('show');
}

function markPendingAsPaid(id) {
  const idx = (state.pendings || []).findIndex(p => p.id === id); if (idx < 0) return;
  const pending = state.pendings[idx];
  // marcar como pagado y, si está asociado a una salida, descontar del monto de esa salida
  pending.paid = true;
  if (pending.associatedTo) {
    const exp = state.expenses.find(e => e.id === pending.associatedTo);
    if (exp) {
      exp.amount = Number(exp.amount) - Number(pending.amount);
      // asegurarse que no quede negativo
      if (exp.amount < 0) exp.amount = 0;
    }
  }
  saveState(state); renderAll();
}

document.addEventListener('DOMContentLoaded', () => { attachUI(); renderAll(); });
