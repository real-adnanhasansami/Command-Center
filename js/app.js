/* app.js — Command Center application logic. Vanilla JS, no build step. */
(() => {
  'use strict';

  const state = Store.load();
  document.documentElement.setAttribute('data-theme', state.meta.theme || 'dark');

  const PRIORITY_LABEL = { mandatory: '🔴 Mandatory', important: '🟡 Important', optional: '🟢 Optional' };
  let dragSrc = null;
  let calViewDate = new Date();
  let selectedCalDate = null;
  let journalDate = todayKey();

  // ---------- persistence ----------
  let suppressAutoSave = false;
  function persist(silent) { Store.save(state, () => { if (!silent) toast('Saved'); }); }
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._h);
    toast._h = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ---------- helpers ----------
  function formatMinutes(total) {
    total = Math.round(total || 0);
    const h = Math.floor(total / 60), m = total % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function formatSeconds(total) {
    total = Math.max(0, Math.round(total || 0));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function getListArray(listKey) { return listKey === 'upcoming' ? state.upcoming : state.activities[listKey]; }
  function findTask(listKey, id) { return getListArray(listKey).find(t => t.id === id); }

  // ================= HISTORY =================
  const SECTION_LABELS = {
    daily: 'Activities · Daily', weekly: 'Activities · Weekly', monthly: 'Activities · Monthly',
    upcoming: 'Upcoming', weeklyPlan: 'Weekly Plan', monthlyPlan: 'Monthly Plan', todo: 'To-Do Board', levels: 'Levels'
  };
  function addHistory(sectionKey, text) {
    state.history = state.history || [];
    state.history.push({ id: uid(), sectionKey, sectionLabel: SECTION_LABELS[sectionKey] || sectionKey, text, completedAt: Date.now() });
    if (typeof renderHistory === 'function') renderHistory();
  }

  // ================= NAVIGATION =================
  function switchView(view) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  }
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchView(btn.dataset.view);
  });

  // ================= LIVE CLOCK =================
  setInterval(() => { document.getElementById('liveClock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 1000);
  document.getElementById('liveClock').textContent = new Date().toLocaleTimeString([], { hour12: false });

  // ================= THEME =================
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = state.meta.theme === 'dark' ? 'light' : 'dark';
    state.meta.theme = next;
    document.documentElement.setAttribute('data-theme', next);
    document.getElementById('themeToggle').textContent = next === 'dark' ? '🌙' : '☀️';
    persist(true);
  });
  document.getElementById('themeToggle').textContent = state.meta.theme === 'dark' ? '🌙' : '☀️';

  // ================= DRAG-REORDER NAV TABS =================
  function applyTabOrder() {
    if (!state.meta.tabOrder) return;
    const tabsEl = document.getElementById('tabs');
    state.meta.tabOrder.forEach(view => {
      const el = tabsEl.querySelector(`.tab[data-view="${view}"]`);
      if (el) tabsEl.appendChild(el);
    });
  }
  function saveTabOrder() {
    state.meta.tabOrder = [...document.querySelectorAll('#tabs .tab')].map(t => t.dataset.view);
    persist(true);
  }
  function wireTabDragging() {
    let tabDragSrc = null;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.setAttribute('draggable', 'true');
      tab.addEventListener('dragstart', () => { tabDragSrc = tab.dataset.view; tab.classList.add('dragging'); });
      tab.addEventListener('dragend', () => tab.classList.remove('dragging'));
      tab.addEventListener('dragover', (e) => e.preventDefault());
      tab.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!tabDragSrc || tabDragSrc === tab.dataset.view) return;
        const tabsEl = document.getElementById('tabs');
        const srcEl = tabsEl.querySelector(`.tab[data-view="${tabDragSrc}"]`);
        const rect = tab.getBoundingClientRect();
        const before = (e.clientX - rect.left) < rect.width / 2;
        tabsEl.insertBefore(srcEl, before ? tab : tab.nextSibling);
        saveTabOrder();
        tabDragSrc = null;
      });
    });
  }
  applyTabOrder();
  wireTabDragging();

  // ================= EXPORT / IMPORT / POWER RESET =================
  function exportBackup(filenameTag) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `command-center-${filenameTag || 'backup'}-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  document.getElementById('exportBtn').addEventListener('click', () => {
    exportBackup('backup');
    toast('Backup exported.');
  });
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!confirm('Import this backup and replace ALL current data on this device?')) { e.target.value = ''; return; }
        suppressAutoSave = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        toast('Imported — reloading…');
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        alert('That file is not a valid Command Center backup (invalid JSON).');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('powerResetBtn').addEventListener('click', () => {
    if (!confirm('⚠️ This erases EVERYTHING — all tasks, plans, notes, journal, habits, levels. This cannot be undone. Continue?')) return;
    if (!confirm('A safety backup will download automatically before wiping. Continue with the reset?')) return;
    exportBackup('autobackup-before-reset');
    suppressAutoSave = true;
    setTimeout(() => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
      location.reload();
    }, 400); // give the download a moment to actually start
  });

  // ================= NOTIFICATIONS + SOUND =================
  function ensureNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission();
  }
  function notify(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
      }
    } catch (e) { /* not fatal */ }
  }
  function playDing() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      [880, 1108, 1320].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        const t0 = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
        o.start(t0); o.stop(t0 + 0.32);
      });
      setTimeout(() => ctx.close(), 800);
    } catch (e) { /* audio not available */ }
  }

  // ================= QUICK ADD =================
  const qaOverlay = document.getElementById('quickAddOverlay');
  function openQuickAdd() {
    qaOverlay.classList.add('open');
    document.getElementById('qaText').value = '';
    setTimeout(() => document.getElementById('qaText').focus(), 30);
  }
  function closeQuickAdd() { qaOverlay.classList.remove('open'); }
  qaOverlay.addEventListener('click', (e) => { if (e.target === qaOverlay) closeQuickAdd(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.altKey && e.key.toLowerCase() === 'n')) { e.preventDefault(); openQuickAdd(); }
    else if (e.key === 'Escape') closeQuickAdd();
  });
  document.getElementById('quickAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('qaText').value.trim();
    if (!text) return;
    const listKey = document.getElementById('qaList').value;
    const priority = document.getElementById('qaPriority').value;
    getListArray(listKey).push({ id: uid(), text, priority, minutes: 0, done: false, actualSeconds: 0, createdAt: Date.now() });
    closeQuickAdd();
    persist(); renderAll();
  });

  // ================= TASK ROWS (Activities + Upcoming share this) =================
  function timerRemaining(t, listKey) {
    const at = state.activeTimer;
    const running = at && at.id === t.id && at.list === listKey;
    return running ? Math.max(0, at.durationSec - (Date.now() - at.startedAt) / 1000) : (t.actualSeconds || 0);
  }
  function taskRowHTML(t, listKey) {
    const at = state.activeTimer;
    const running = at && at.id === t.id && at.list === listKey;
    const remaining = timerRemaining(t, listKey);
    const urgent = running && remaining < 60;
    return `
    <li class="task-row ${t.done ? 'done' : ''}" draggable="true" data-id="${t.id}" data-list="${listKey}">
      <span class="priority-flag ${t.priority}" title="${PRIORITY_LABEL[t.priority]}"></span>
      <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''} />
      <input type="text" class="task-text" value="${esc(t.text)}" />
      <input type="number" class="task-minutes-input mono" min="0" value="${t.minutes || 0}" title="Countdown duration (minutes)" />
      <div class="timer-box">
        <span class="timer-display mono ${urgent ? 'urgent' : ''}" data-timer-for="${t.id}">${formatSeconds(remaining)}</span>
        <button class="timer-btn ${running ? 'running' : ''}" title="${running ? 'Stop' : 'Start'} countdown">${running ? '⏸' : '▶'}</button>
      </div>
      <div class="row-actions">
        <button class="row-btn danger del-btn" title="Delete">✕</button>
      </div>
    </li>`;
  }
  function renderGenericList(arr, ulId, summaryId, listKey) {
    const ul = document.getElementById(ulId);
    ul.innerHTML = arr.length ? arr.map(t => taskRowHTML(t, listKey)).join('') : `<li class="empty-state">Nothing here yet — add your first item above.</li>`;
    const totalMinutes = arr.reduce((s, t) => s + (t.minutes || 0), 0);
    const doneCount = arr.filter(t => t.done).length;
    const pct = arr.length ? Math.round((doneCount / arr.length) * 100) : 0;
    document.getElementById(summaryId).innerHTML = `<b>${pct}%</b> / ${formatMinutes(totalMinutes)} planned`;
    wireTaskRows(ul, listKey);
  }
  function wireTaskRows(ul, listKey) {
    ul.querySelectorAll('.task-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.task-check').addEventListener('change', (e) => {
        const t = findTask(listKey, id);
        t.done = e.target.checked;
        if (e.target.checked) addHistory(listKey, t.text);
        persist(); renderAll();
      });
      const textInput = row.querySelector('.task-text');
      textInput.addEventListener('blur', () => {
        const t = findTask(listKey, id);
        if (t && textInput.value.trim() && textInput.value.trim() !== t.text) { t.text = textInput.value.trim(); persist(true); }
      });
      textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') textInput.blur(); });
      textInput.addEventListener('mousedown', (e) => e.stopPropagation());

      const minInput = row.querySelector('.task-minutes-input');
      minInput.addEventListener('mousedown', (e) => e.stopPropagation());
      minInput.addEventListener('change', () => {
        const t = findTask(listKey, id);
        if (t) { t.minutes = Math.max(0, Number(minInput.value) || 0); persist(true); }
      });

      row.querySelector('.del-btn').addEventListener('click', () => {
        if (listKey === 'upcoming') state.upcoming = state.upcoming.filter(t => t.id !== id);
        else state.activities[listKey] = state.activities[listKey].filter(t => t.id !== id);
        if (state.activeTimer && state.activeTimer.id === id && state.activeTimer.list === listKey) state.activeTimer = null;
        persist(); renderAll();
      });
      row.querySelector('.timer-btn').addEventListener('click', () => toggleTimer(id, listKey));

      row.addEventListener('dragstart', () => { dragSrc = { id, list: listKey }; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('drag-over');
        if (!dragSrc || dragSrc.list !== listKey) return;
        const rect = row.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        moveWithinList(listKey, dragSrc.id, id, before);
        dragSrc = null;
      });
    });
  }
  function moveWithinList(listKey, srcId, targetId, before) {
    const arr = getListArray(listKey);
    const idx = arr.findIndex(t => t.id === srcId);
    if (idx === -1) return;
    const [item] = arr.splice(idx, 1);
    let insertAt = arr.length;
    if (targetId) {
      const ti = arr.findIndex(t => t.id === targetId);
      insertAt = before ? ti : ti + 1;
      if (ti === -1) insertAt = arr.length;
    }
    arr.splice(insertAt, 0, item);
    persist(); renderAll();
  }

  // ---------- countdown timer ----------
  function stopActiveTimer() {
    const at = state.activeTimer;
    if (!at) return;
    const t = findTask(at.list, at.id);
    if (t) t.actualSeconds += (Date.now() - at.startedAt) / 1000;
    state.activeTimer = null;
  }
  function toggleTimer(id, listKey) {
    const at = state.activeTimer;
    if (at && at.id === id && at.list === listKey) {
      stopActiveTimer();
    } else {
      const t = findTask(listKey, id);
      if (!t.minutes || t.minutes <= 0) { toast('Set a countdown duration (minutes) first'); return; }
      stopActiveTimer();
      ensureNotifPermission();
      state.activeTimer = { id, list: listKey, startedAt: Date.now(), durationSec: t.minutes * 60 };
    }
    persist(); renderAll();
  }
  setInterval(() => {
    const at = state.activeTimer;
    if (!at) return;
    const t = findTask(at.list, at.id);
    if (!t) { state.activeTimer = null; return; }
    const remaining = at.durationSec - (Date.now() - at.startedAt) / 1000;
    if (remaining <= 0) {
      t.actualSeconds += at.durationSec;
      state.activeTimer = null;
      playDing();
      notify('⏰ Countdown finished', `"${t.text}" is done.`);
      toast(`⏰ "${t.text}" countdown finished!`);
      persist(true); renderAll();
      return;
    }
    const el = document.querySelector(`.timer-display[data-timer-for="${at.id}"]`);
    if (el) { el.textContent = formatSeconds(remaining); el.classList.toggle('urgent', remaining < 60); }
    if (Date.now() % 15000 < 1000) persist(true);
    renderDashboardStats();
  }, 1000);

  // ================= ACTIVITIES =================
  function renderActivityList() {
    const sub = document.getElementById('activitySubList').value;
    renderGenericList(state.activities[sub], 'activityList', 'activityTimeSummary', sub);
  }
  document.getElementById('activitySubList').addEventListener('change', renderActivityList);
  document.getElementById('activityAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const sub = document.getElementById('activitySubList').value;
    const form = e.target;
    const text = form.querySelector('.new-task-text').value.trim();
    if (!text) return;
    const priority = form.querySelector('.new-task-priority').value;
    const minutes = Number(form.querySelector('.new-task-minutes').value) || 0;
    state.activities[sub].push({ id: uid(), text, priority, minutes, done: false, actualSeconds: 0, createdAt: Date.now() });
    form.reset();
    persist(); renderAll();
  });

  // ================= UPCOMING =================
  function renderUpcomingList() { renderGenericList(state.upcoming, 'upcomingList', 'upcomingTimeSummary', 'upcoming'); }
  document.getElementById('upcomingAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const text = form.querySelector('.new-task-text').value.trim();
    if (!text) return;
    const priority = form.querySelector('.new-task-priority').value;
    const minutes = Number(form.querySelector('.new-task-minutes').value) || 0;
    state.upcoming.push({ id: uid(), text, priority, minutes, done: false, actualSeconds: 0, createdAt: Date.now() });
    form.reset();
    persist(); renderAll();
  });

  // ================= TO-DO BOARD =================
  const STATUS_ID = { todo: 'todoTodo', inprogress: 'todoInprogress', done: 'todoDone' };
  const COUNT_ID = { todo: 'countTodo', inprogress: 'countInprogress', done: 'countDone' };
  function renderTodo() {
    ['todo', 'inprogress', 'done'].forEach(status => {
      const ul = document.getElementById(STATUS_ID[status]);
      const cards = state.todo[status];
      ul.innerHTML = cards.length ? cards.map(c => {
        const dl = deadlineInfo(c.deadline);
        return `
        <li class="kanban-card" draggable="true" data-id="${c.id}" data-status="${status}">
          <div class="kc-top">
            ${status !== 'done' ? `<button class="todo-check-btn" title="Mark complete">✓</button>` : `<span class="todo-check-btn" style="border-color:var(--optional);color:var(--optional);">✓</span>`}
            <span class="kc-text">${esc(c.text)}</span>
            <button class="row-btn danger del-kc" title="Delete">✕</button>
          </div>
          ${dl ? `<span class="deadline-badge ${dl.cls}">${dl.label}</span>` : ''}
        </li>`;
      }).join('') : '';
      document.getElementById(COUNT_ID[status]).textContent = cards.length;

      ul.querySelectorAll('.kanban-card').forEach(card => {
        const id = card.dataset.id;
        card.querySelector('.del-kc').addEventListener('click', () => {
          state.todo[status] = state.todo[status].filter(c => c.id !== id);
          persist(); renderTodo(); renderDashboardStats(); renderCalendar();
        });
        const checkBtn = card.querySelector('.todo-check-btn');
        if (status !== 'done' && checkBtn) {
          checkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = state.todo[status].findIndex(c => c.id === id);
            if (idx === -1) return;
            const [item] = state.todo[status].splice(idx, 1);
            state.todo.done.push(item);
            addHistory('todo', item.text);
            persist(); renderTodo(); renderDashboardStats(); renderCalendar();
          });
        }
        card.addEventListener('dragstart', () => { dragSrc = { id, list: status, kind: 'kanban' }; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', (e) => e.preventDefault());
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!dragSrc || dragSrc.kind !== 'kanban') return;
          const rect = card.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          moveKanban(dragSrc, status, id, before);
          dragSrc = null;
        });
      });
      ul.addEventListener('dragover', (e) => e.preventDefault());
      ul.addEventListener('drop', (e) => {
        if (e.target !== ul) return;
        if (!dragSrc || dragSrc.kind !== 'kanban') return;
        moveKanban(dragSrc, status, null, false);
        dragSrc = null;
      });
    });
  }
  function moveKanban(src, targetStatus, targetId, before) {
    const srcArr = state.todo[src.list];
    const idx = srcArr.findIndex(c => c.id === src.id);
    if (idx === -1) return;
    const [item] = srcArr.splice(idx, 1);
    if (targetStatus === 'done' && src.list !== 'done') addHistory('todo', item.text);
    const destArr = state.todo[targetStatus];
    let insertAt = destArr.length;
    if (targetId) {
      const ti = destArr.findIndex(c => c.id === targetId);
      insertAt = before ? ti : ti + 1;
      if (ti === -1) insertAt = destArr.length;
    }
    destArr.splice(insertAt, 0, item);
    persist(); renderTodo(); renderDashboardStats(); renderCalendar();
  }
  document.getElementById('todoAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const textInput = document.getElementById('todoText');
    const deadlineInput = document.getElementById('todoDeadline');
    const text = textInput.value.trim();
    if (!text) return;
    state.todo.todo.push({ id: uid(), text, deadline: deadlineInput.value || null, createdAt: Date.now() });
    textInput.value = ''; deadlineInput.value = '';
    persist(); renderTodo(); renderDashboardStats(); renderCalendar();
  });

  // ================= WEEKLY / MONTHLY PLAN =================
  function planRowHTML(p) {
    const dl = deadlineInfo(p.deadline);
    const when = [p.date, p.time].filter(Boolean).join('  ');
    return `<li class="plan-row ${p.done ? 'done' : ''}" data-id="${p.id}">
      <input type="checkbox" class="plan-check" ${p.done ? 'checked' : ''} />
      <span class="plan-text">${esc(p.text)}</span>
      <div class="plan-meta">
        ${when ? `<span class="plan-when mono">${esc(when)}</span>` : ''}
        ${dl ? `<span class="deadline-badge ${dl.cls}">${dl.label}</span>` : ''}
        <button class="row-btn danger del-plan" title="Delete">✕</button>
      </div>
    </li>`;
  }
  function renderPlanList(listName, ulId) {
    const arr = state[listName];
    const ul = document.getElementById(ulId);
    const sorted = [...arr].sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'));
    ul.innerHTML = sorted.length ? sorted.map(planRowHTML).join('') : `<li class="empty-state">Nothing planned yet.</li>`;
    ul.querySelectorAll('.plan-row').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.plan-check').addEventListener('change', (e) => {
        const p = state[listName].find(x => x.id === id);
        p.done = e.target.checked;
        if (e.target.checked) addHistory(listName, p.text);
        persist(); renderAll();
      });
      row.querySelector('.del-plan').addEventListener('click', () => {
        state[listName] = state[listName].filter(x => x.id !== id);
        persist(); renderAll();
      });
    });
  }
  function wirePlanForm(formId, listName) {
    document.getElementById(formId).addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const text = form.querySelector('.plan-text').value.trim();
      if (!text) return;
      const date = form.querySelector('.plan-date').value || null;
      const time = form.querySelector('.plan-time').value || null;
      const deadline = form.querySelector('.plan-deadline').value || null;
      state[listName].push({ id: uid(), text, date, time, deadline, done: false, createdAt: Date.now() });
      form.reset();
      persist(); renderAll();
    });
  }
  wirePlanForm('weeklyPlanForm', 'weeklyPlan');
  wirePlanForm('monthlyPlanForm', 'monthlyPlan');

  // ================= CALENDAR =================
  function collectCalIndex() {
    const index = {};
    const add = (dateStr, type) => { if (!dateStr) return; (index[dateStr] = index[dateStr] || []).push(type); };
    [...state.todo.todo, ...state.todo.inprogress, ...state.todo.done].forEach(c => add(c.deadline, 'todo'));
    state.weeklyPlan.forEach(p => { add(p.date, 'weekly'); if (p.deadline && p.deadline !== p.date) add(p.deadline, 'weekly'); });
    state.monthlyPlan.forEach(p => { add(p.date, 'monthly'); if (p.deadline && p.deadline !== p.date) add(p.deadline, 'monthly'); });
    state.gamify.levels.forEach(l => { if (l.mode === 'datetime' && l.deadlineAt) add(todayKey(new Date(l.deadlineAt)), 'level'); });
    return index;
  }
  function renderCalendar() {
    const y = calViewDate.getFullYear(), m = calViewDate.getMonth();
    document.getElementById('calLabel').textContent = calViewDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const index = collectCalIndex();
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
    const startOffset = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = todayKey();
    for (let i = 0; i < startOffset; i++) html += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const evts = index[dateStr] || [];
      const dots = evts.slice(0, 6).map(t => `<span class="dot dot-${t}"></span>`).join('');
      html += `<div class="cal-cell ${dateStr === todayStr ? 'today' : ''} ${dateStr === selectedCalDate ? 'selected' : ''}" data-date="${dateStr}">
        <span class="cal-daynum">${d}</span><div class="cal-dots">${dots}</div>
      </div>`;
    }
    document.getElementById('calGrid').innerHTML = html;
    document.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => { selectedCalDate = cell.dataset.date; renderCalendar(); showCalDay(selectedCalDate); });
    });
  }
  function showCalDay(dateStr) {
    const items = [];
    [...state.todo.todo, ...state.todo.inprogress, ...state.todo.done].forEach(c => { if (c.deadline === dateStr) items.push({ text: c.text, src: 'To-Do deadline' }); });
    state.weeklyPlan.forEach(p => {
      if (p.date === dateStr) items.push({ text: p.text, src: 'Weekly plan' });
      if (p.deadline === dateStr && p.deadline !== p.date) items.push({ text: p.text, src: 'Weekly deadline' });
    });
    state.monthlyPlan.forEach(p => {
      if (p.date === dateStr) items.push({ text: p.text, src: 'Monthly plan' });
      if (p.deadline === dateStr && p.deadline !== p.date) items.push({ text: p.text, src: 'Monthly deadline' });
    });
    state.gamify.levels.forEach(l => {
      if (l.mode === 'datetime' && l.deadlineAt && todayKey(new Date(l.deadlineAt)) === dateStr) items.push({ text: l.text, src: 'Level deadline' });
    });
    document.getElementById('calDayTitle').textContent = dateStr;
    document.getElementById('calDayList').innerHTML = items.length
      ? items.map(i => `<li class="plan-row"><span class="plan-text">${esc(i.text)}</span><span class="hint">${i.src}</span></li>`).join('')
      : `<li class="empty-state">Nothing on this day.</li>`;
    document.getElementById('calDayPanel').style.display = 'block';
  }
  document.getElementById('calPrev').addEventListener('click', () => { calViewDate.setMonth(calViewDate.getMonth() - 1); renderCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { calViewDate.setMonth(calViewDate.getMonth() + 1); renderCalendar(); });

  // ================= ROUTINE =================
  const routineEl = document.getElementById('routineText');
  let routineSaveHandle = null;
  routineEl.addEventListener('input', () => {
    state.routine.text = routineEl.value;
    clearTimeout(routineSaveHandle);
    routineSaveHandle = setTimeout(() => persist(true), 500);
  });

  // ================= STICKY NOTES =================
  function renderNotes() {
    const canvas = document.getElementById('notesCanvas');
    canvas.innerHTML = state.notes.map(n => `
      <div class="sticky-note color-${n.color}" data-id="${n.id}" style="left:${n.x}px; top:${n.y}px;">
        <div class="note-top"><button class="note-del" title="Delete">✕</button></div>
        <textarea placeholder="Jot something down…">${esc(n.text)}</textarea>
      </div>`).join('');
    canvas.querySelectorAll('.sticky-note').forEach(el => {
      const id = el.dataset.id;
      const note = state.notes.find(n => n.id === id);
      el.querySelector('.note-del').addEventListener('click', () => { state.notes = state.notes.filter(n => n.id !== id); persist(); renderNotes(); });
      const ta = el.querySelector('textarea');
      ta.addEventListener('mousedown', (e) => e.stopPropagation());
      ta.addEventListener('input', () => { note.text = ta.value; persist(true); });
      let dragging = false, offX = 0, offY = 0;
      el.addEventListener('pointerdown', (e) => {
        if (e.target === ta || e.target.closest('.note-del')) return;
        dragging = true; el.setPointerCapture(e.pointerId);
        offX = e.clientX - el.offsetLeft; offY = e.clientY - el.offsetTop;
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        let nx = Math.max(0, Math.min(e.clientX - offX, rect.width - el.offsetWidth));
        let ny = Math.max(0, Math.min(e.clientY - offY, rect.height - el.offsetHeight));
        el.style.left = nx + 'px'; el.style.top = ny + 'px'; note.x = nx; note.y = ny;
      });
      ['pointerup', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => { if (dragging) { dragging = false; persist(true); } }));
    });
  }
  document.getElementById('noteAddSwatches').addEventListener('click', (e) => {
    const btn = e.target.closest('.swatch');
    if (!btn) return;
    const canvas = document.getElementById('notesCanvas');
    state.notes.push({ id: uid(), color: btn.dataset.color, text: '', x: 20 + Math.random() * Math.max(40, canvas.clientWidth - 240), y: 20 + Math.random() * 120 });
    persist(); renderNotes();
  });

  // ================= HABITS =================
  function habitKeyFor(h) { return h.freq === 'monthly' ? monthKey() : h.freq === 'weekly' ? isoWeekKey() : todayKey(); }
  function stepBack(d, freq) {
    const nd = new Date(d);
    if (freq === 'monthly') nd.setMonth(nd.getMonth() - 1);
    else if (freq === 'weekly') nd.setDate(nd.getDate() - 7);
    else nd.setDate(nd.getDate() - 1);
    return nd;
  }
  function keyForFreq(d, freq) { return freq === 'monthly' ? monthKey(d) : freq === 'weekly' ? isoWeekKey(d) : todayKey(d); }
  function computeStreak(h) {
    let count = 0, d = new Date(), key = keyForFreq(d, h.freq);
    if (!h.history[key]) { d = stepBack(d, h.freq); key = keyForFreq(d, h.freq); }
    while (h.history[key]) { count++; d = stepBack(d, h.freq); key = keyForFreq(d, h.freq); }
    return count;
  }
  function habitRowHTML(h, compact) {
    const key = habitKeyFor(h);
    const checked = !!h.history[key];
    const streak = computeStreak(h);
    const unit = h.freq === 'monthly' ? 'mo' : h.freq === 'weekly' ? 'wk' : 'd';
    return `
    <li class="habit-row" data-id="${h.id}">
      <button class="habit-check ${checked ? 'checked' : ''}" title="Mark this ${h.freq === 'daily' ? 'day' : h.freq === 'weekly' ? 'week' : 'month'}">${checked ? '✓' : ''}</button>
      <span class="habit-name">${esc(h.name)}</span>
      <span class="habit-freq">${h.freq}</span>
      <span class="habit-streak">${streak > 0 ? `${streak}${unit} streak 🔥` : 'no streak yet'}</span>
      ${compact ? '' : '<button class="row-btn danger del-habit" title="Delete">✕</button>'}
    </li>`;
  }
  function renderHabits() {
    const list = document.getElementById('habitsList');
    list.innerHTML = state.habits.length ? state.habits.map(h => habitRowHTML(h, false)).join('') : `<li class="empty-state">No habits yet — add one to start a streak.</li>`;
    list.querySelectorAll('.habit-row').forEach(row => {
      const id = row.dataset.id;
      const h = state.habits.find(x => x.id === id);
      row.querySelector('.habit-check').addEventListener('click', () => {
        const key = habitKeyFor(h);
        if (h.history[key]) delete h.history[key]; else h.history[key] = true;
        persist(); renderHabits(); renderDashboardStats();
      });
      const delBtn = row.querySelector('.del-habit');
      if (delBtn) delBtn.addEventListener('click', () => { state.habits = state.habits.filter(x => x.id !== id); persist(); renderHabits(); renderDashboardStats(); });
    });
    const dash = document.getElementById('dashHabitList');
    dash.innerHTML = state.habits.length ? state.habits.slice(0, 6).map(h => habitRowHTML(h, true)).join('') : `<li class="empty-state">No habits yet.</li>`;
    dash.querySelectorAll('.habit-check').forEach((btn, i) => {
      const h = state.habits[i];
      btn.addEventListener('click', () => {
        const key = habitKeyFor(h);
        if (h.history[key]) delete h.history[key]; else h.history[key] = true;
        persist(); renderHabits(); renderDashboardStats();
      });
    });
  }
  document.getElementById('habitAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('habitName');
    const name = nameInput.value.trim();
    if (!name) return;
    const freq = document.getElementById('habitFreq').value;
    state.habits.push({ id: uid(), name, freq, history: {} });
    nameInput.value = '';
    persist(); renderHabits(); renderDashboardStats();
  });

  // ================= JOURNAL =================
  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || '';
  }
  function getEntry(date) { return state.journal.entries.find(e => e.date === date); }
  function renderJournal() {
    document.getElementById('journalDateLabel').textContent = journalDate;
    const jt = document.getElementById('journalText');
    const entry = getEntry(journalDate);
    if (document.activeElement !== jt) jt.innerHTML = entry ? entry.text : '';
    const list = document.getElementById('journalEntries');
    const sorted = [...state.journal.entries].sort((a, b) => b.date.localeCompare(a.date));
    list.innerHTML = sorted.length ? sorted.map(e => `
      <li class="entry-item" data-date="${e.date}">
        <div class="entry-info">
          <div class="entry-date">${e.date}</div>
          <div class="entry-preview">${esc(stripHtml(e.text).slice(0, 80) || '(empty)')}</div>
        </div>
        <button class="row-btn danger del-entry" title="Delete entry">✕</button>
      </li>`).join('') : `<li class="empty-state">No entries yet.</li>`;
    list.querySelectorAll('.entry-info').forEach(el => el.addEventListener('click', () => { journalDate = el.closest('.entry-item').dataset.date; renderJournal(); }));
    list.querySelectorAll('.del-entry').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const date = btn.closest('.entry-item').dataset.date;
      state.journal.entries = state.journal.entries.filter(en => en.date !== date);
      if (journalDate === date) journalDate = todayKey();
      persist(); renderJournal();
    }));
  }
  let journalSaveHandle = null;
  const journalEditor = document.getElementById('journalText');
  journalEditor.addEventListener('input', () => {
    clearTimeout(journalSaveHandle);
    journalSaveHandle = setTimeout(() => {
      let entry = getEntry(journalDate);
      if (!entry) { entry = { id: uid(), date: journalDate, text: '' }; state.journal.entries.push(entry); }
      entry.text = journalEditor.innerHTML;
      persist(true);
      renderJournal();
    }, 500);
  });
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection inside the editor
    btn.addEventListener('click', () => {
      document.execCommand(btn.dataset.cmd, false, null);
      journalEditor.dispatchEvent(new Event('input'));
    });
  });
  document.getElementById('editJournalTitleBtn').addEventListener('click', () => {
    const next = prompt('Rename this section:', state.meta.journalTitle || 'Journal');
    if (next && next.trim()) {
      state.meta.journalTitle = next.trim();
      document.getElementById('journalTitleText').textContent = next.trim();
      const tab = document.querySelector('.tab[data-view="journal"]');
      if (tab) tab.textContent = next.trim();
      persist(true);
    }
  });

  // ================= DASHBOARD =================
  function collectDeadlines() {
    const items = [];
    [...state.todo.todo, ...state.todo.inprogress, ...state.todo.done].forEach(c => { if (c.deadline) items.push({ text: c.text, date: c.deadline, src: 'To-Do' }); });
    state.weeklyPlan.forEach(p => { if (p.deadline) items.push({ text: p.text, date: p.deadline, src: 'Weekly' }); });
    state.monthlyPlan.forEach(p => { if (p.deadline) items.push({ text: p.text, date: p.deadline, src: 'Monthly' }); });
    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
  }
  function renderDashboardStats() {
    const daily = state.activities.daily;
    const doneCount = daily.filter(t => t.done).length;
    const pct = daily.length ? Math.round((doneCount / daily.length) * 100) : 0;
    document.getElementById('statCompletion').textContent = `${pct}%`;
    document.getElementById('statCompletionBar').style.width = `${pct}%`;

    const totalPlanned = daily.reduce((s, t) => s + (t.minutes || 0), 0);
    let totalActualSec = daily.reduce((s, t) => s + (t.actualSeconds || 0), 0);
    if (state.activeTimer && state.activeTimer.list === 'daily') {
      const t = findTask('daily', state.activeTimer.id);
      if (t) totalActualSec += Math.min(state.activeTimer.durationSec, (Date.now() - state.activeTimer.startedAt) / 1000);
    }
    const totalActualMin = totalActualSec / 60;
    document.getElementById('statTimePair').textContent = `${formatMinutes(totalPlanned)} / ${formatMinutes(totalActualMin)}`;
    const maxBar = Math.max(totalPlanned, totalActualMin, 1);
    document.getElementById('statPlannedBar').style.width = `${Math.min(100, (totalPlanned / maxBar) * 100)}%`;
    document.getElementById('statActualBar').style.width = `${Math.min(100, (totalActualMin / maxBar) * 100)}%`;

    document.getElementById('statHabits').textContent = state.habits.length;
    const streakLeader = state.habits.map(h => computeStreak(h)).sort((a, b) => b - a)[0];
    document.getElementById('statHabitsSub').textContent = state.habits.length ? `best streak: ${streakLeader || 0}` : 'no habits yet';

    document.getElementById('statTodo').textContent = state.todo.inprogress.length;
    document.getElementById('statTodoSub').textContent = `${state.todo.todo.length} to-do · ${state.todo.done.length} done`;

    const dashList = document.getElementById('dashDailyList');
    const sorted = [...daily];
    dashList.innerHTML = sorted.length ? sorted.slice(0, 8).map(t => `
      <li class="task-row ${t.done ? 'done' : ''}">
        <span class="priority-flag ${t.priority}"></span>
        <span class="task-text" style="border:none;">${esc(t.text)}</span>
        <span class="task-minutes">${t.minutes || 0}m</span>
      </li>`).join('') : `<li class="empty-state">No daily activities yet.</li>`;

    const deadlines = collectDeadlines().slice(0, 6);
    document.getElementById('dashDeadlines').innerHTML = deadlines.length ? deadlines.map(d => {
      const info = deadlineInfo(d.date);
      return `<li class="deadline-item"><span class="deadline-badge ${info.cls}">${info.label}</span><span class="di-text">${esc(d.text)}</span><span class="di-src">${d.src}</span></li>`;
    }).join('') : `<li class="empty-state">No deadlines set.</li>`;

    const wp = [...state.weeklyPlan].filter(p => !p.done).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 5);
    document.getElementById('dashWeeklyPlan').innerHTML = wp.length ? wp.map(p => `
      <li class="plan-row"><span class="plan-text">${esc(p.text)}</span><span class="plan-when mono">${esc([p.date, p.time].filter(Boolean).join(' '))}</span></li>`).join('') : `<li class="empty-state">Nothing planned yet.</li>`;
  }

  // ================= WRAP UP DAY =================
  document.getElementById('wrapUpBtn').addEventListener('click', () => {
    const dateStr = todayKey();
    const daily = state.activities.daily;
    const completed = daily.filter(t => t.done);
    const unfinished = daily.filter(t => !t.done);
    const totalPlanned = daily.reduce((s, t) => s + (t.minutes || 0), 0);
    const totalActual = daily.reduce((s, t) => s + (t.actualSeconds || 0), 0);
    const pct = daily.length ? Math.round((completed.length / daily.length) * 100) : 0;
    const entry = getEntry(dateStr);

    const completedRows = completed.length ? completed.map(t => `
        <div class="wu-row">
          <span class="wu-box wu-box-done">&#10003;</span>
          <span class="wu-text">${esc(t.text)}</span>
          <span class="wu-meta">planned ${esc((t.minutes || 0) + 'm')} &middot; actual ${esc(formatSeconds(t.actualSeconds || 0))}</span>
        </div>`).join('') : `<div class="wu-empty">Nothing completed today.</div>`;

    const unfinishedRows = unfinished.length ? unfinished.map(t => `
        <div class="wu-row">
          <span class="wu-box"></span>
          <span class="wu-text">${esc(t.text)}</span>
          <span class="wu-meta">planned ${esc((t.minutes || 0) + 'm')}</span>
        </div>`).join('') : `<div class="wu-empty">Nothing carried over.</div>`;

    const journalHtml = entry && entry.text ? esc(stripHtml(entry.text)).replace(/\n/g, '<br>') : '<span class="wu-empty">No journal entry for today.</span>';

    const notesHtml = state.notes.length
      ? `<div class="wu-notes">${state.notes.map(n => `<div class="wu-note">${esc(n.text || '(empty)')}</div>`).join('')}</div>`
      : `<div class="wu-empty">No sticky notes.</div>`;

    const reportHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Command Center — Wrap-Up ${esc(dateStr)}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', 'Noto Sans Bengali', Calibri, Arial, sans-serif; color: #1c2530; margin: 0; }
  .wu-header { background: linear-gradient(135deg,#1f2a44,#2f4270); color: #fff; padding: 20px 24px; border-radius: 10px; margin-bottom: 18px; }
  .wu-header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: .5px; }
  .wu-header .wu-sub { font-size: 12px; opacity: .85; }
  .wu-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
  .wu-stat { border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; background: #f7f9fc; }
  .wu-stat .wu-label { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #6b7385; margin-bottom: 4px; }
  .wu-stat .wu-value { font-size: 16px; font-weight: 700; color: #1f2a44; }
  .wu-bar-track { height: 6px; border-radius: 4px; background: #e4e8ef; margin-top: 6px; overflow: hidden; }
  .wu-bar-fill { height: 100%; background: #2f8f5b; }
  .wu-section { margin-bottom: 18px; break-inside: avoid; }
  .wu-section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #2f4270; border-bottom: 2px solid #2f4270; padding-bottom: 5px; margin: 0 0 8px; }
  .wu-row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-bottom: 1px solid #eef0f4; font-size: 12.5px; }
  .wu-box { flex: 0 0 auto; width: 14px; height: 14px; border: 1.5px solid #9aa3b2; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; }
  .wu-box-done { background: #2f8f5b; border-color: #2f8f5b; }
  .wu-text { flex: 1 1 auto; }
  .wu-meta { flex: 0 0 auto; color: #6b7385; font-size: 11px; white-space: nowrap; }
  .wu-empty { color: #9aa3b2; font-size: 12px; font-style: italic; padding: 4px; }
  .wu-journal { font-size: 12.5px; line-height: 1.6; background: #f7f9fc; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; white-space: pre-wrap; }
  .wu-notes { display: flex; flex-wrap: wrap; gap: 8px; }
  .wu-note { background: #fff6cf; border: 1px solid #eadf9d; border-radius: 6px; padding: 8px 10px; font-size: 11.5px; max-width: 220px; }
  .wu-footer { text-align: center; font-size: 10px; color: #9aa3b2; border-top: 1px solid #eef0f4; padding-top: 10px; margin-top: 24px; }
</style></head>
<body>
  <div class="wu-header">
    <h1>COMMAND CENTER &middot; DAILY WRAP-UP</h1>
    <div class="wu-sub">${esc(dateStr)}</div>
  </div>
  <div class="wu-stats">
    <div class="wu-stat"><div class="wu-label">Completion</div><div class="wu-value">${pct}% <span style="font-weight:400;font-size:11px;color:#6b7385;">(${completed.length}/${daily.length})</span></div>
      <div class="wu-bar-track"><div class="wu-bar-fill" style="width:${pct}%"></div></div></div>
    <div class="wu-stat"><div class="wu-label">Planned Time</div><div class="wu-value">${esc(formatMinutes(totalPlanned))}</div></div>
    <div class="wu-stat"><div class="wu-label">Actual Time</div><div class="wu-value">${esc(formatSeconds(totalActual))}</div></div>
    <div class="wu-stat"><div class="wu-label">Generated</div><div class="wu-value" style="font-size:12px;">${esc(new Date().toLocaleString())}</div></div>
  </div>
  <div class="wu-section"><h2>Completed</h2>${completedRows}</div>
  <div class="wu-section"><h2>Carried Over (Unfinished)</h2>${unfinishedRows}</div>
  <div class="wu-section"><h2>Journal</h2><div class="wu-journal">${journalHtml}</div></div>
  <div class="wu-section"><h2>Sticky Notes</h2>${notesHtml}</div>
  <div class="wu-footer">Generated by Command Center &middot; ${esc(new Date().toLocaleString())}</div>
</body></html>`;

    const printWin = window.open('', '_blank', 'width=900,height=1000');
    if (!printWin) {
      toast('Pop-up blocked — allow pop-ups to export the PDF.');
    } else {
      printWin.document.open();
      printWin.document.write(reportHtml);
      printWin.document.close();
      printWin.document.title = `command-center-wrapup-${dateStr}`;
      const triggerPrint = () => { printWin.focus(); printWin.print(); };
      if (printWin.document.readyState === 'complete') setTimeout(triggerPrint, 200);
      else printWin.addEventListener('load', () => setTimeout(triggerPrint, 200));
    }

    state.activities.daily = daily.filter(t => !t.done).map(t => ({ ...t, actualSeconds: 0 }));
    if (state.activeTimer && state.activeTimer.list === 'daily') state.activeTimer = null;
    state.meta.lastWrapUp = dateStr;
    persist(); renderAll();
    toast('Day wrapped up — choose "Save as PDF" in the print dialog.');
  });

  // ================= LEVELS (GAMIFY) =================
  function levelDeadlineMs(lvl, activatedAt) {
    if (lvl.mode === 'datetime' && lvl.deadlineAt) return lvl.deadlineAt - (activatedAt || Date.now());
    return (lvl.hours || 24) * 3600 * 1000;
  }
  function computeLevelStatus(index) {
    if (state.gamify.blockedUntil && Date.now() < state.gamify.blockedUntil) return 'blocked';
    const levels = state.gamify.levels;
    const firstIncomplete = levels.findIndex(l => !l.done);
    if (firstIncomplete === -1) return 'done';
    if (index < firstIncomplete) return 'done';
    if (index > firstIncomplete) return 'locked';
    const lvl = levels[index];
    if (!lvl.activatedAt) return 'active';
    const deadlineMs = levelDeadlineMs(lvl, lvl.activatedAt);
    const elapsed = Date.now() - lvl.activatedAt;
    if (elapsed < deadlineMs) return 'active';
    if (elapsed < deadlineMs * 1.5) return 'warning';
    return 'expired';
  }
  function ensureLevelActivation() {
    if (state.gamify.blockedUntil && Date.now() < state.gamify.blockedUntil) return;
    const levels = state.gamify.levels;
    const firstIncomplete = levels.findIndex(l => !l.done);
    if (firstIncomplete !== -1 && !levels[firstIncomplete].activatedAt) {
      levels[firstIncomplete].activatedAt = Date.now();
      persist(true);
    }
  }
  function checkLevelDeadlines() {
    if (state.gamify.blockedUntil) {
      if (Date.now() >= state.gamify.blockedUntil) {
        state.gamify.blockedUntil = null;
        const firstIncomplete = state.gamify.levels.findIndex(l => !l.done);
        if (firstIncomplete !== -1) state.gamify.levels[firstIncomplete].activatedAt = Date.now();
        persist(true);
        toast('🔓 24-hour block lifted — levels unlocked again.');
        renderGamify();
      }
      return;
    }
    ensureLevelActivation();
    const firstIncomplete = state.gamify.levels.findIndex(l => !l.done);
    if (firstIncomplete !== -1 && computeLevelStatus(firstIncomplete) === 'expired') {
      state.gamify.blockedUntil = Date.now() + 24 * 3600 * 1000;
      persist(true);
      notify('⛔ Level deadline missed', 'Grace period expired — all levels are locked for 24 hours.');
      toast('⛔ Deadline + grace period missed — Levels locked for 24 hours.');
      renderGamify();
    }
  }
  function renderGamify() {
    const levels = state.gamify.levels;
    const blocked = state.gamify.blockedUntil && Date.now() < state.gamify.blockedUntil;
    const banner = document.getElementById('gamifyBlockBanner');
    if (blocked) {
      banner.style.display = 'block';
      banner.textContent = `⛔ Locked for missing a deadline + grace period. Unlocks in ${formatSeconds((state.gamify.blockedUntil - Date.now()) / 1000)}.`;
    } else banner.style.display = 'none';

    const ol = document.getElementById('levelList');
    ol.innerHTML = levels.length ? levels.map((lvl, i) => {
      const status = blocked ? 'blocked' : computeLevelStatus(i);
      let timeLabel = '';
      const deadlineMs = levelDeadlineMs(lvl, lvl.activatedAt || Date.now());
      const elapsed = lvl.activatedAt ? Date.now() - lvl.activatedAt : 0;
      if (status === 'active') timeLabel = `⏳ ${formatSeconds((deadlineMs - elapsed) / 1000)} left`;
      else if (status === 'warning' || status === 'expired') timeLabel = `⚠ Grace: ${formatSeconds(Math.max(0, deadlineMs * 1.5 - elapsed) / 1000)} left`;
      else if (status === 'locked') timeLabel = '🔒 Locked';
      else if (status === 'done') timeLabel = '✓ Completed';
      else if (status === 'blocked') timeLabel = '⛔ Blocked';
      const dueNote = lvl.mode === 'datetime' && lvl.deadlineAt ? ` <span class="hint">(due ${new Date(lvl.deadlineAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })})</span>` : '';
      const checkable = (status === 'active' || status === 'warning') && !blocked;
      return `<li class="level-row ${status}" data-id="${lvl.id}">
        <span class="level-num">${i + 1}</span>
        <input type="checkbox" class="level-check" ${lvl.done ? 'checked' : ''} ${checkable ? '' : 'disabled'} />
        <span class="level-text">${esc(lvl.text)}${dueNote}</span>
        <span class="level-time mono">${timeLabel}</span>
        <button class="row-btn danger del-level" title="Delete">✕</button>
      </li>`;
    }).join('') : `<li class="empty-state">No levels yet — add your first one above.</li>`;

    ol.querySelectorAll('.level-row').forEach(row => {
      const id = row.dataset.id;
      const cb = row.querySelector('.level-check');
      if (!cb.disabled) {
        cb.addEventListener('change', () => {
          const lvl = state.gamify.levels.find(l => l.id === id);
          lvl.done = cb.checked;
          if (!lvl.done) lvl.activatedAt = null;
          else addHistory('levels', lvl.text);
          persist(); renderGamify(); renderDashboardStats();
        });
      }
      row.querySelector('.del-level').addEventListener('click', () => {
        state.gamify.levels = state.gamify.levels.filter(l => l.id !== id);
        persist(); renderGamify();
      });
    });
  }
  document.getElementById('levelAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const textInput = document.getElementById('levelText');
    const hoursInput = document.getElementById('levelHours');
    const dateInput = document.getElementById('levelDate');
    const timeInput = document.getElementById('levelTime');
    const text = textInput.value.trim();
    if (!text) return;
    const hoursVal = Number(hoursInput.value);
    let mode, hours = null, deadlineAt = null;
    if (hoursVal > 0) {
      mode = 'duration'; hours = hoursVal;
    } else if (dateInput.value && timeInput.value) {
      mode = 'datetime';
      deadlineAt = new Date(`${dateInput.value}T${timeInput.value}`).getTime();
    } else {
      toast('Set either a deadline in hours, or a specific date & time.');
      return;
    }
    state.gamify.levels.push({ id: uid(), text, mode, hours, deadlineAt, done: false, activatedAt: null, createdAt: Date.now() });
    textInput.value = ''; hoursInput.value = ''; dateInput.value = ''; timeInput.value = '';
    persist(); renderGamify();
  });
  function tickGamifyDisplay() {
    const levels = state.gamify.levels;
    const blocked = state.gamify.blockedUntil && Date.now() < state.gamify.blockedUntil;
    const banner = document.getElementById('gamifyBlockBanner');
    if (blocked) {
      banner.style.display = 'block';
      banner.textContent = `⛔ Locked for missing a deadline + grace period. Unlocks in ${formatSeconds((state.gamify.blockedUntil - Date.now()) / 1000)}.`;
    } else banner.style.display = 'none';
    document.querySelectorAll('#levelList .level-row').forEach(row => {
      const id = row.dataset.id;
      const i = levels.findIndex(l => l.id === id);
      if (i === -1) return;
      const status = blocked ? 'blocked' : computeLevelStatus(i);
      const lvl = levels[i];
      const deadlineMs = levelDeadlineMs(lvl, lvl.activatedAt || Date.now());
      const elapsed = lvl.activatedAt ? Date.now() - lvl.activatedAt : 0;
      let timeLabel = '';
      if (status === 'active') timeLabel = `⏳ ${formatSeconds((deadlineMs - elapsed) / 1000)} left`;
      else if (status === 'warning' || status === 'expired') timeLabel = `⚠ Grace: ${formatSeconds(Math.max(0, deadlineMs * 1.5 - elapsed) / 1000)} left`;
      else if (status === 'locked') timeLabel = '🔒 Locked';
      else if (status === 'done') timeLabel = '✓ Completed';
      else if (status === 'blocked') timeLabel = '⛔ Blocked';
      const timeEl = row.querySelector('.level-time');
      if (timeEl) timeEl.textContent = timeLabel;
    });
  }
  setInterval(() => {
    const before = state.gamify.blockedUntil;
    checkLevelDeadlines();
    // checkLevelDeadlines already re-renders fully on a real state transition (block start/lift);
    // otherwise just patch the countdown text so checkboxes/listeners stay intact.
    if (before === state.gamify.blockedUntil && document.getElementById('view-gamify').classList.contains('active')) tickGamifyDisplay();
  }, 1000);

  // ================= UPDATES / NOTICES =================
  const CHANGELOG = [
    { version: 'v5', date: '2026-08-05', items: [
      'Wrap Up Day now exports a well-organized, designed PDF (via print dialog → Save as PDF) instead of a .txt file',
    ] },
    { version: 'v4', date: '2026-08-04', items: [
      'Removed Pinning — drag-and-drop already handles reordering; Wrap Up Day now clears all completed daily items',
      'Levels can now use a specific deadline date & time instead of an hours countdown',
      'Wrap Up Day .txt export redesigned — aligned, boxed, professional layout',
      'Added History — every completed item across all sections, grouped and browsable',
      'Calendar now shows Level deadlines too',
      'Power Reset now auto-downloads a safety backup before wiping data',
      'Updates & Notices section title is fixed (no longer needs renaming)'
    ] },
    { version: 'v3', date: '2026-07-29', items: [
      'Added Levels — sequential task unlocking with deadlines, grace periods, and a 24h lockout for missed deadlines',
      'Added Updates & Notices board (personal notices + this changelog)',
      'Rich text Journal — Bold / Underline / Italic / bullet list, plus entry delete',
      'JSON export / import for moving your data between devices',
      'Drag-and-drop reordering of the top navigation tabs',
      'Redesigned checkboxes app-wide + one-click complete on To-Do cards',
      'Editable section titles for Journal and Updates & Notices',
      'Power Reset button for wiping all local data'
    ] },
    { version: 'v2', date: '2026-07-28', items: [
      'Restructured into Activities / To-Do / Weekly Plan / Monthly Plan / Calendar / Routine',
      'Deadline badges (overdue / urgent / soon / normal)',
      'Custom countdown timer per task with sound + browser notification',
      'Habits now support Daily / Weekly / Monthly frequency',
      'Fixed light mode contrast issues'
    ] },
    { version: 'v1', date: '2026-07-28', items: [
      'Initial release — Daily/Weekly/Monthly/Upcoming tasks, Kanban, Sticky Notes, Habits, Journal, Wrap Up Day export, offline PWA'
    ] }
  ];
  function renderNotices() {
    const list = document.getElementById('noticeList');
    const sorted = [...state.notices].sort((a, b) => b.createdAt - a.createdAt);
    list.innerHTML = sorted.length ? sorted.map(n => `
      <li class="notice-item" data-id="${n.id}">
        <div class="notice-item-top">
          <span class="notice-item-title">${esc(n.title)}</span>
          <div class="entry-actions">
            <span class="notice-item-date mono">${new Date(n.createdAt).toLocaleDateString()}</span>
            <button class="row-btn danger del-notice" title="Delete">✕</button>
          </div>
        </div>
        ${n.text ? `<div class="notice-item-body">${esc(n.text)}</div>` : ''}
      </li>`).join('') : `<li class="empty-state">No notices yet — add one above.</li>`;
    list.querySelectorAll('.del-notice').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.notice-item').dataset.id;
      state.notices = state.notices.filter(n => n.id !== id);
      persist(); renderNotices();
    }));

    const cl = document.getElementById('changelogList');
    cl.innerHTML = CHANGELOG.map(v => `
      <li class="changelog-entry">
        <div class="cl-head"><span class="cl-version">${esc(v.version)}</span><span class="cl-date mono">${esc(v.date)}</span></div>
        <ul>${v.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </li>`).join('');
  }
  document.getElementById('noticeAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const title = form.querySelector('.notice-title-input').value.trim();
    if (!title) return;
    const text = form.querySelector('.notice-text-input').value.trim();
    state.notices.push({ id: uid(), title, text, createdAt: Date.now() });
    form.reset();
    persist(); renderNotices();
  });

  // ================= HISTORY (render) =================
  const expandedHistorySections = new Set();
  function renderHistory() {
    const groups = {};
    (state.history || []).forEach(h => { (groups[h.sectionKey] = groups[h.sectionKey] || []).push(h); });
    const container = document.getElementById('historyGroups');
    const keys = Object.keys(groups);
    if (!keys.length) { container.innerHTML = `<p class="empty-state">No completed items yet.</p>`; return; }
    container.innerHTML = keys.map(key => {
      const items = groups[key].slice().sort((a, b) => b.completedAt - a.completedAt);
      const label = items[0].sectionLabel;
      const expanded = expandedHistorySections.has(key);
      return `<div class="history-group">
        <button class="history-group-head" data-key="${key}">
          <span>${esc(label)}</span><span class="count">${items.length}</span>
          <span class="chev">${expanded ? '▾' : '▸'}</span>
        </button>
        <ul class="history-item-list" style="display:${expanded ? 'flex' : 'none'};">
          ${items.map(it => `<li class="history-item"><span class="hi-text">${esc(it.text)}</span><span class="hi-date mono">${new Date(it.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span></li>`).join('')}
        </ul>
      </div>`;
    }).join('');
    container.querySelectorAll('.history-group-head').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (expandedHistorySections.has(key)) expandedHistorySections.delete(key); else expandedHistorySections.add(key);
        renderHistory();
      });
    });
  }

  // ================= RENDER ALL =================
  function renderAll() {
    renderActivityList();
    renderUpcomingList();
    renderTodo();
    renderPlanList('weeklyPlan', 'weeklyPlanList');
    renderPlanList('monthlyPlan', 'monthlyPlanList');
    renderCalendar();
    if (selectedCalDate) showCalDay(selectedCalDate);
    renderNotes();
    renderHabits();
    renderJournal();
    renderGamify();
    renderNotices();
    renderHistory();
    renderDashboardStats();
  }

  if (document.activeElement !== routineEl) routineEl.value = state.routine.text || '';
  document.getElementById('journalTitleText').textContent = state.meta.journalTitle || 'Journal';
  if (state.meta.journalTitle) { const t = document.querySelector('.tab[data-view="journal"]'); if (t) t.textContent = state.meta.journalTitle; }
  renderAll();

  // ================= SERVICE WORKER =================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  window.addEventListener('beforeunload', () => { if (!suppressAutoSave) Store.saveNow(state); });
})();
