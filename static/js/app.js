/* ── State ─────────────────────────────────────────────────────────────────── */
let currentDate = getTodayDate();
let taskModalEl, learningModalEl, passwordModalEl;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function getTodayDate() {
  const el = document.getElementById("current-date");
  return el ? el.value : new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderNote(str) {
  return escHtml(str)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function fmtNote(type) {
  const ta = document.getElementById("task-note");
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const sel   = ta.value.slice(start, end);
  const marker = type === "bold" ? "**" : "*";
  const wrapped = marker + (sel || "text") + marker;
  ta.setRangeText(wrapped, start, end, "select");
  if (!sel) {
    // place cursor inside the markers
    ta.setSelectionRange(start + marker.length, start + marker.length + 4);
  }
  ta.focus();
}

/* ── Toast ──────────────────────────────────────────────────────────────────── */

function toast(msg, type = "success") {
  const icons = { success: "✓", error: "✕", info: "i" };
  const el = document.createElement("div");
  el.className = `toast-item ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById("toast-container").appendChild(el);
  const duration = type === "error" ? 5000 : 2800;
  setTimeout(() => {
    el.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ── Custom confirm dialog ──────────────────────────────────────────────────── */

function confirmDialog(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-title">Delete this item?</div>
        <div class="confirm-msg">${msg}</div>
        <div class="confirm-actions">
          <button class="btn-ghost" id="cfn-cancel">Cancel</button>
          <button class="btn-danger-custom" id="cfn-ok">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));
    const cancelBtn = overlay.querySelector("#cfn-cancel");
    const okBtn = overlay.querySelector("#cfn-ok");
    const onKey = e => {
      if (e.key === "Escape") { cleanup(); resolve(false); }
    };
    const cleanup = () => { document.removeEventListener("keydown", onKey); overlay.remove(); };
    document.addEventListener("keydown", onKey);
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
    okBtn.onclick = () => { cleanup(); resolve(true); };
    setTimeout(() => cancelBtn.focus(), 50);
  });
}

/* ── Loading skeletons ──────────────────────────────────────────────────────── */

function showSkeletons(containerId, count = 2) {
  document.getElementById(containerId).innerHTML =
    Array(count).fill('<div class="skeleton"></div>').join("");
}

/* ── Load day ───────────────────────────────────────────────────────────────── */

async function loadDay(dateStr) {
  currentDate = dateStr;
  const today = getTodayDate();

  // Update all date/badge/stat elements (works for both desktop and mobile)
  document.querySelectorAll(".date-display-text, #date-display").forEach(el => el.textContent = formatDisplayDate(dateStr));
  document.querySelectorAll(".today-badge-el, #today-badge").forEach(el => el.style.display = dateStr === today ? "inline" : "none");
  document.getElementById("date-picker").value = dateStr;

  // Weekend tint on date display
  const dForNav = new Date(dateStr + "T00:00:00");
  const isWeekendDay = dForNav.getDay() === 0 || dForNav.getDay() === 6;
  document.querySelectorAll(".date-display-wrap").forEach(w => w.classList.toggle("weekend-day", isWeekendDay));

  // Jump-to-today pill (desktop only — shows when not on today)
  const jumpPill = document.getElementById("today-jump-pill");
  if (jumpPill) jumpPill.style.display = (dateStr !== today) ? "inline-block" : "none";

  showSkeletons("tasks-list");
  showSkeletons("learnings-list");

  const [tasksRes, learningsRes] = await Promise.all([
    fetch(`/api/tasks?date=${dateStr}`),
    fetch(`/api/learnings?date=${dateStr}`),
  ]);
  const tasks = await tasksRes.json();
  const learnings = await learningsRes.json();

  document.querySelectorAll(".stat-tasks-val, #stat-tasks").forEach(el => el.textContent = tasks.length);
  document.querySelectorAll(".stat-learnings-val, #stat-learnings").forEach(el => el.textContent = learnings.length);

  renderTasks(tasks);
  renderLearnings(learnings);

  // Refresh picker dots if open and on same month
  const popup = document.getElementById("date-picker-popup");
  if (popup && popup.style.display !== "none") dpRenderMonth();
}

/* ── Renderers ──────────────────────────────────────────────────────────────── */

function renderTasks(tasks) {
  const container = document.getElementById("tasks-list");
  if (!tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-text">No tasks logged yet.<br>Add your first task above.</div>
      </div>`;
    return;
  }
  container.innerHTML = tasks.map(t => {
    const status = t.status || "done";
    const isInProgress = status === "in_progress";
    const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const clockIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const editIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    const arrowIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
    const gripIcon  = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`;
    const hasExtra = t.note || t.carried_from;
    const chevronIcon = `<svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    return `
    <div class="item-card status-${isInProgress ? "inprogress" : "done"}" data-task-id="${t._id}">
      <div class="card-top">
        <div class="card-title-wrap">
          <div class="drag-handle" title="Drag to reorder">${gripIcon}</div>
          <button class="status-toggle-btn" title="Toggle status"
                  onclick="toggleTaskStatus('${t._id}', '${status}')">
            ${isInProgress ? clockIcon : checkIcon}
          </button>
          <div class="card-title card-title-clamped">${escHtml(t.title)}</div>
        </div>
        <div class="card-actions">
          ${hasExtra ? `<button class="icon-btn expand-btn" title="Expand" onclick="toggleCardExpand(this)">${chevronIcon}</button>` : ""}
          ${isInProgress ? `<button class="icon-btn carry-btn" title="Carry forward to tomorrow" onclick="carryForwardTask('${t._id}')">${arrowIcon}</button>` : ""}
          <button class="icon-btn" title="Edit" onclick='openTaskModal(${JSON.stringify(JSON.stringify(t))})'>${editIcon}</button>
          <button class="icon-btn delete" title="Delete" data-id="${t._id}" data-title="${escHtml(t.title)}" onclick="deleteTask(this.dataset.id, this.dataset.title)">${trashIcon}</button>
        </div>
      </div>
      <div class="card-expandable">
        ${t.note ? `<div class="card-note">${renderNote(t.note)}</div>` : ""}
        ${t.carried_from ? `<div class="card-carried-badge">Carried forward</div>` : ""}
      </div>
    </div>`;
  }).join("");
  container.querySelectorAll(".item-card").forEach((card, i) => {
    card.classList.add("card-enter");
    card.style.animationDelay = `${i * 50}ms`;
  });
  initSortable();
}

/* ── Expand / collapse cards ────────────────────────────────────────────────── */

function toggleCardExpand(btn) {
  const card = btn.closest(".item-card");
  const expanded = card.classList.toggle("card-expanded");
  btn.classList.toggle("chevron-up", expanded);
}

/* ── Drag to reorder ────────────────────────────────────────────────────────── */

let sortableInstance = null;

function initSortable() {
  const container = document.getElementById("tasks-list");
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
  if (container.querySelectorAll(".item-card[data-task-id]").length < 2) return;
  sortableInstance = Sortable.create(container, {
    handle: ".drag-handle",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: saveTaskOrder,
  });
}

async function saveTaskOrder() {
  const ids = [...document.querySelectorAll("#tasks-list .item-card[data-task-id]")]
    .map(c => c.dataset.taskId);
  if (!ids.length) return;
  const res = await fetch("/api/tasks/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: ids }),
  });
  if (!res.ok) { toast("Failed to save order", "error"); await loadDay(currentDate); }
}

async function toggleTaskStatus(id, currentStatus) {
  const newStatus = currentStatus === "in_progress" ? "done" : "in_progress";
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: newStatus }),
  });
  if (res.ok) await loadDay(currentDate);
  else toast("Failed to update status", "error");
}

function renderLearnings(learnings) {
  const container = document.getElementById("learnings-list");
  if (!learnings.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💡</div>
        <div class="empty-text">No learnings captured yet.<br>Log something you learned today.</div>
      </div>`;
    return;
  }
  container.innerHTML = learnings.map(l => {
    const editIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const trashIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    const chevronIcon = `<svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    const hasExtra = (l.tags || []).length > 0;
    return `
    <div class="item-card learning-card">
      <div class="card-top">
        <div class="card-title card-title-clamped">${escHtml(l.content)}</div>
        <div class="card-actions">
          <button class="icon-btn expand-btn" title="Expand" onclick="toggleCardExpand(this)">${chevronIcon}</button>
          <button class="icon-btn" title="Edit" onclick='openLearningModal(${JSON.stringify(JSON.stringify(l))})'>${editIcon}</button>
          <button class="icon-btn delete" title="Delete" data-id="${l._id}" data-preview="${escHtml(l.content.slice(0, 40))}" onclick="deleteLearning(this.dataset.id, this.dataset.preview)">${trashIcon}</button>
        </div>
      </div>
      <div class="card-expandable">
        ${(l.tags || []).length ? `
          <div class="tags-row">
            ${l.tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join("")}
          </div>` : ""}
      </div>
    </div>
  `}).join("");
  container.querySelectorAll(".item-card").forEach((card, i) => {
    card.classList.add("card-enter");
    card.style.animationDelay = `${i * 50}ms`;
  });
}

/* ── Task modal ─────────────────────────────────────────────────────────────── */

function openTaskModal(taskJson = null) {
  const task = taskJson ? JSON.parse(taskJson) : null;
  document.getElementById("task-modal-title").textContent = task ? "Edit Task" : "New Task";
  document.getElementById("task-id").value = task ? task._id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-note").value = task ? (task.note || "") : "";
  const status = task ? (task.status || "done") : "done";
  document.getElementById("task-status").value = status;
  document.getElementById("status-done").classList.toggle("active", status === "done");
  document.getElementById("status-inprogress").classList.toggle("active", status === "in_progress");
  if (!taskModalEl) taskModalEl = new bootstrap.Modal(document.getElementById("task-modal"));
  taskModalEl.show();
  setTimeout(() => document.getElementById("task-title").focus(), 300);
}

function setTaskStatus(s) {
  document.getElementById("task-status").value = s;
  document.getElementById("status-done").classList.toggle("active", s === "done");
  document.getElementById("status-inprogress").classList.toggle("active", s === "in_progress");
}

async function saveTask() {
  const id = document.getElementById("task-id").value;
  const title = document.getElementById("task-title").value.trim();
  if (!title) {
    const inp = document.getElementById("task-title");
    inp.classList.remove("input-error");
    void inp.offsetWidth;
    inp.classList.add("input-error");
    inp.focus();
    setTimeout(() => inp.classList.remove("input-error"), 600);
    return;
  }
  const body = { date: currentDate, title, note: document.getElementById("task-note").value.trim(), status: document.getElementById("task-status").value };
  const res = await fetch(id ? `/api/tasks/${id}` : "/api/tasks", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    taskModalEl.hide();
    toast(id ? "Task updated" : "Task added", "success");
    await loadDay(currentDate);
  } else {
    toast("Failed to save task", "error");
  }
}

async function deleteTask(id, title) {
  const ok = await confirmDialog(`"${title}" will be permanently removed.`);
  if (!ok) return;
  const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  if (res.ok) { toast("Task deleted", "info"); await loadDay(currentDate); }
  else toast("Failed to delete", "error");
}

/* ── Learning modal ─────────────────────────────────────────────────────────── */

function openLearningModal(learningJson = null) {
  const l = learningJson ? JSON.parse(learningJson) : null;
  document.getElementById("learning-modal-title").textContent = l ? "Edit Learning" : "New Learning";
  document.getElementById("learning-id").value = l ? l._id : "";
  document.getElementById("learning-content").value = l ? l.content : "";
  document.getElementById("learning-tags").value = l ? (l.tags || []).join(", ") : "";
  if (!learningModalEl) learningModalEl = new bootstrap.Modal(document.getElementById("learning-modal"));
  learningModalEl.show();
  setTimeout(() => document.getElementById("learning-content").focus(), 300);
}

async function saveLearning() {
  const id = document.getElementById("learning-id").value;
  const content = document.getElementById("learning-content").value.trim();
  if (!content) {
    const inp = document.getElementById("learning-content");
    inp.classList.remove("input-error");
    void inp.offsetWidth;
    inp.classList.add("input-error");
    inp.focus();
    setTimeout(() => inp.classList.remove("input-error"), 600);
    return;
  }
  const tags = document.getElementById("learning-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const body = { date: currentDate, content, tags };
  const res = await fetch(id ? `/api/learnings/${id}` : "/api/learnings", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    learningModalEl.hide();
    toast(id ? "Learning updated" : "Learning saved", "success");
    await loadDay(currentDate);
  } else {
    toast("Failed to save learning", "error");
  }
}

async function deleteLearning(id, preview) {
  const ok = await confirmDialog(`"${preview}…" will be permanently removed.`);
  if (!ok) return;
  const res = await fetch(`/api/learnings/${id}`, { method: "DELETE" });
  if (res.ok) { toast("Learning deleted", "info"); await loadDay(currentDate); }
  else toast("Failed to delete", "error");
}

async function quickAddTask() {
  const inp = document.getElementById("quick-add-input");
  if (!inp) return;
  const title = inp.value.trim();
  if (!title) {
    inp.classList.remove("input-error");
    void inp.offsetWidth;
    inp.classList.add("input-error");
    setTimeout(() => inp.classList.remove("input-error"), 600);
    inp.focus();
    return;
  }
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: currentDate, title, note: "", status: "in_progress" }),
  });
  if (res.ok) {
    inp.value = "";
    toast("Task added", "success");
    await loadDay(currentDate);
  } else {
    toast("Failed to add task", "error");
  }
}

function checkPasswordConfirm() {
  const newPw = document.getElementById("pw-new")?.value || "";
  const confirm = document.getElementById("pw-confirm")?.value || "";
  const confirmEl = document.getElementById("pw-confirm");
  if (!confirmEl) return;
  if (!confirm) {
    confirmEl.classList.remove("pw-match", "pw-mismatch");
  } else if (newPw === confirm) {
    confirmEl.classList.add("pw-match");
    confirmEl.classList.remove("pw-mismatch");
  } else {
    confirmEl.classList.add("pw-mismatch");
    confirmEl.classList.remove("pw-match");
  }
}

async function carryForwardTask(id) {
  const targetDate = shiftDate(currentDate, 1);
  const res = await fetch(`/api/tasks/${id}/carry-forward`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_date: targetDate }),
  });
  if (res.ok) {
    const d = new Date(targetDate + "T00:00:00");
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    toast(`Carried to ${label} — press → to navigate`, "success");
    const nextBtn = document.getElementById("next-day") || document.getElementById("mob-next-day");
    if (nextBtn) {
      nextBtn.style.transition = "none";
      nextBtn.style.background = "rgba(108,99,255,0.15)";
      nextBtn.style.borderColor = "var(--accent-mid)";
      setTimeout(() => { nextBtn.style.transition = ""; nextBtn.style.background = ""; nextBtn.style.borderColor = ""; }, 900);
    }
  } else {
    const err = await res.json().catch(() => ({}));
    toast(err.error || "Failed to carry forward", "error");
  }
}

/* ── Export ─────────────────────────────────────────────────────────────────── */

let exportModalEl;

function openExportModal() {
  const today = getTodayDate();
  // default: current month start → today
  const monthStart = today.slice(0, 7) + "-01";
  document.getElementById("export-from").value = monthStart;
  document.getElementById("export-to").value = today;
  document.getElementById("export-error").style.display = "none";
  if (!exportModalEl) exportModalEl = new bootstrap.Modal(document.getElementById("export-modal"));
  exportModalEl.show();
}

function doExport() {
  const from = document.getElementById("export-from").value;
  const to   = document.getElementById("export-to").value;
  const errEl = document.getElementById("export-error");

  if (!from || !to) {
    errEl.textContent = "Please select both dates.";
    errEl.style.display = "block"; return;
  }
  if (from > to) {
    errEl.textContent = "\"From\" date must be before or equal to \"To\" date.";
    errEl.style.display = "block"; return;
  }
  errEl.style.display = "none";

  // Trigger download via hidden link
  const url = `/api/export?from=${from}&to=${to}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();

  exportModalEl.hide();
  toast(`Exporting ${from} → ${to}`, "info");
}

/* ── Import ─────────────────────────────────────────────────────────────────── */

let importModalEl;

function openImportModal() {
  document.getElementById("import-file").value = "";
  document.getElementById("import-error").style.display = "none";
  document.getElementById("import-summary").style.display = "none";
  const importBtn  = document.getElementById("import-btn");
  const cancelBtn  = document.getElementById("import-cancel-btn");
  importBtn.style.display = "";
  importBtn.textContent   = "Import";
  importBtn.disabled      = false;
  if (cancelBtn) cancelBtn.textContent = "Cancel";
  if (!importModalEl) importModalEl = new bootstrap.Modal(document.getElementById("import-modal"));
  importModalEl.show();
}

async function doImport() {
  const fileInput = document.getElementById("import-file");
  const errEl     = document.getElementById("import-error");
  const summaryEl = document.getElementById("import-summary");
  const importBtn = document.getElementById("import-btn");
  const cancelBtn = document.getElementById("import-cancel-btn");

  errEl.style.display     = "none";
  summaryEl.style.display = "none";

  if (!fileInput.files.length) {
    errEl.textContent = "Please select an Excel file.";
    errEl.style.display = "block"; return;
  }
  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    errEl.textContent = "Only .xlsx files are supported.";
    errEl.style.display = "block"; return;
  }
  if (file.size > 2 * 1024 * 1024) {
    errEl.textContent = "File too large. Maximum size is 2 MB.";
    errEl.style.display = "block"; return;
  }

  importBtn.textContent = "Importing…";
  importBtn.disabled    = true;

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res  = await fetch("/api/import", { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent   = data.error || "Import failed.";
      errEl.style.display = "block";
      return;
    }

    const { tasks_imported: ti, tasks_skipped: ts, tasks_invalid: tw,
            learnings_imported: li, learnings_skipped: ls, learnings_invalid: lw } = data;

    const lines = [];
    if (ti + ts + tw > 0)
      lines.push(`Tasks: ${ti} imported, ${ts} skipped (duplicate), ${tw} invalid`);
    if (li + ls + lw > 0)
      lines.push(`Learnings: ${li} imported, ${ls} skipped (duplicate), ${lw} invalid`);
    if (!lines.length) lines.push("No data found in the uploaded file.");

    summaryEl.innerHTML = lines.map(l =>
      `<div class="import-summary-row">${l}</div>`
    ).join("");
    summaryEl.style.display = "block";

    importBtn.style.display = "none";
    if (cancelBtn) cancelBtn.textContent = "Close";

    toast(`Import complete — ${ti} tasks, ${li} learnings added`, "success");
    if (document.getElementById("prev-day")) await loadDay(currentDate);

  } catch (_) {
    errEl.textContent   = "Network error. Please try again.";
    errEl.style.display = "block";
  } finally {
    importBtn.textContent = "Import";
    importBtn.disabled    = false;
  }
}

/* ── Password change ────────────────────────────────────────────────────────── */

function openPasswordModal() {
  document.getElementById("pw-current").value = "";
  document.getElementById("pw-new").value = "";
  document.getElementById("pw-confirm").value = "";
  document.getElementById("pw-error").style.display = "none";
  if (!passwordModalEl) passwordModalEl = new bootstrap.Modal(document.getElementById("password-modal"));
  passwordModalEl.show();
  setTimeout(() => document.getElementById("pw-current").focus(), 300);
}

async function savePassword() {
  const current = document.getElementById("pw-current").value;
  const newPw = document.getElementById("pw-new").value;
  const confirm = document.getElementById("pw-confirm").value;
  const errEl = document.getElementById("pw-error");

  if (!current || !newPw || !confirm) {
    errEl.textContent = "All fields are required.";
    errEl.style.display = "block"; return;
  }
  if (newPw !== confirm) {
    errEl.textContent = "New passwords do not match.";
    errEl.style.display = "block"; return;
  }
  if (newPw.length < 6) {
    errEl.textContent = "New password must be at least 6 characters.";
    errEl.style.display = "block"; return;
  }

  const res = await fetch("/api/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: current, new_password: newPw }),
  });
  const data = await res.json();
  if (res.ok) {
    passwordModalEl.hide();
    toast("Password updated successfully", "success");
  } else {
    errEl.textContent = data.error || "Failed to update password.";
    errEl.style.display = "block";
  }
}

function togglePw(inputId) {
  const el = document.getElementById(inputId);
  el.type = el.type === "password" ? "text" : "password";
}

/* ── Review page ────────────────────────────────────────────────────────────── */

let rvFilter = "both";

function setFilter(f) {
  rvFilter = f;
  document.querySelectorAll(".rv-toggle").forEach(b => b.classList.remove("active"));
  document.getElementById("tog-" + f).classList.add("active");
  if (window._rvData) renderReview(window._rvData);
}

function initReview() {
  if (!document.getElementById("rv-from")) return;
  const today = getTodayDate();
  const monthStart = today.slice(0, 7) + "-01";
  document.getElementById("rv-from").value = monthStart;
  document.getElementById("rv-to").value = today;
}

async function loadReview(page = 1) {
  const from = document.getElementById("rv-from").value;
  const to   = document.getElementById("rv-to").value;
  if (!from || !to) { toast("Please select both dates", "error"); return; }
  if (from > to)    { toast("From date must be before To date", "error"); return; }

  page = Math.max(1, page);
  window._rvPage = page;

  document.getElementById("rv-body").innerHTML =
    '<div style="padding:24px 28px">' +
    '<div class="skeleton" style="height:90px;margin-bottom:16px"></div>' +
    '<div class="skeleton" style="height:90px;margin-bottom:16px"></div>' +
    '<div class="skeleton" style="height:90px"></div></div>';

  const q = document.getElementById("rv-search")?.value.trim() || "";
  const qParam = q ? `&q=${encodeURIComponent(q)}` : "";

  const res  = await fetch(`/api/review?from=${from}&to=${to}${qParam}&page=${page}`);
  const data = await res.json();
  window._rvData = data;
  window._rvPage = data.page;

  document.getElementById("rv-stat-tasks").textContent     = data.total_tasks;
  document.getElementById("rv-stat-learnings").textContent = data.total_learnings;
  document.getElementById("rv-stat-days").textContent      = data.total_days;

  const pagEl = document.getElementById("rv-pagination");
  if (data.total_pages > 1) {
    pagEl.style.display = "flex";
    document.getElementById("rv-page-info").textContent = `Page ${data.page} of ${data.total_pages}`;
    document.getElementById("rv-prev-page").disabled = data.page <= 1;
    document.getElementById("rv-next-page").disabled = data.page >= data.total_pages;
  } else {
    pagEl.style.display = "none";
  }

  renderReview(data);
}

function renderReview(data) {
  const container = document.getElementById("rv-body");

  const days = data.days.filter(d => {
    if (rvFilter === "tasks")     return d.tasks.length > 0;
    if (rvFilter === "learnings") return d.learnings.length > 0;
    return true;
  });

  if (!days.length) {
    container.innerHTML = `
      <div class="rv-no-results">
        <div class="empty-icon">📭</div>
        <div class="empty-text">No entries found for this range.</div>
      </div>`;
    return;
  }

  const showTasks     = rvFilter !== "learnings";
  const showLearnings = rvFilter !== "tasks";

  container.innerHTML = `<div class="rv-timeline">${days.map((d, i) => {
    const dt = new Date(d.date + "T00:00:00");
    const weekday = dt.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
    const dayNum  = dt.toLocaleDateString("en-GB", { day: "2-digit" });
    const month   = dt.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const isLast  = i === days.length - 1;
    const dow     = dt.getDay(); // 0=Sun, 6=Sat
    const isWeekendDay = dow === 0 || dow === 6;

    const gridClass = !showTasks ? "learnings-only" : !showLearnings ? "tasks-only" : "";

    const tasksHtml = showTasks ? `
      <div>
        <div class="rv-section-label"><span class="section-dot dot-tasks"></span>Tasks (${d.tasks.length})</div>
        ${d.tasks.length ? d.tasks.map(t => `
          <div class="rv-card rv-card-task">
            <div class="rv-card-title">
              ${(t.status || "done") === "in_progress"
                ? '<span class="status-badge badge-inprogress">In Progress</span>'
                : '<span class="status-badge badge-done">Done</span>'}
              ${escHtml(t.title)}
            </div>
            ${t.note ? `<div class="rv-card-note">${renderNote(t.note)}</div>` : ""}
          </div>`).join("") : '<div class="rv-empty-day">No tasks</div>'}
      </div>` : "";

    const learningsHtml = showLearnings ? `
      <div>
        <div class="rv-section-label"><span class="section-dot dot-learnings"></span>Learnings (${d.learnings.length})</div>
        ${d.learnings.length ? d.learnings.map(l => `
          <div class="rv-card rv-card-learning">
            <div class="rv-card-content">${escHtml(l.content)}</div>
            ${(l.tags||[]).length ? `<div class="tags-row">${l.tags.map(t=>`<span class="tag">${escHtml(t)}</span>`).join("")}</div>` : ""}
          </div>`).join("") : '<div class="rv-empty-day">No learnings</div>'}
      </div>` : "";

    return `
      <div class="rv-day-block">
        <div class="rv-day-spine${isWeekendDay ? " rv-weekend" : ""}">
          <div class="rv-day-label">
            <div class="rv-day-weekday">${weekday}</div>
            <div class="rv-day-date">${dayNum}</div>
            <div class="rv-day-month">${month}</div>
          </div>
          <div class="rv-day-dot"></div>
          ${isLast ? "" : '<div class="rv-day-line"></div>'}
        </div>
        <div class="rv-day-content ${gridClass}">
          ${tasksHtml}
          ${learningsHtml}
        </div>
      </div>`;
  }).join("")}</div>`;
}

function exportFromReview() {
  const from = document.getElementById("rv-from")?.value;
  const to   = document.getElementById("rv-to")?.value;
  if (!from || !to) { toast("Select a date range first", "error"); return; }
  const a = document.createElement("a");
  a.href = `/api/export?from=${from}&to=${to}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(`Exporting ${from} → ${to}`, "info");
}

/* ── Stats page ──────────────────────────────────────────────────────────────── */

let statsYear, statsMonth;

function initStats() {
  if (!document.getElementById("stats-calendar")) return;
  const today = getTodayDate();
  statsYear  = parseInt(today.slice(0, 4));
  statsMonth = parseInt(today.slice(5, 7));
  updateStatsMonthLabel();
  loadStats();

  document.getElementById("st-prev-month").addEventListener("click", () => {
    statsMonth--;
    if (statsMonth < 1) { statsMonth = 12; statsYear--; }
    updateStatsMonthLabel();
    loadStats();
  });
  document.getElementById("st-next-month").addEventListener("click", () => {
    statsMonth++;
    if (statsMonth > 12) { statsMonth = 1; statsYear++; }
    updateStatsMonthLabel();
    loadStats();
  });
}

function updateStatsMonthLabel() {
  const d = new Date(statsYear, statsMonth - 1, 1);
  document.getElementById("st-month-label").textContent =
    d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function loadStats() {
  const res  = await fetch(`/api/stats?year=${statsYear}&month=${statsMonth}`);
  const data = await res.json();

  document.getElementById("st-streak").textContent    = data.streak;
  document.getElementById("st-tasks").textContent     = data.month_tasks;
  document.getElementById("st-learnings").textContent = data.month_learnings;

  document.getElementById("sc-streak").textContent    = data.streak;
  document.getElementById("sc-best").textContent      = data.longest_streak;
  document.getElementById("sc-tasks").textContent     = data.month_tasks;
  document.getElementById("sc-learnings").textContent = data.month_learnings;

  // Streak card enhancements
  const streakCard = document.getElementById("streak-card");
  if (streakCard) {
    streakCard.classList.toggle("streak-active", data.streak > 0);

    let subLabel = streakCard.querySelector(".stats-card-sublabel");
    if (!subLabel) {
      subLabel = document.createElement("div");
      subLabel.className = "stats-card-sublabel";
      streakCard.appendChild(subLabel);
    }
    subLabel.textContent = data.streak === 1 ? "day in a row" : "days in a row";

    const todayStr = getTodayDate();
    const loggedToday = (data.days_logged || []).includes(todayStr);
    let warnEl = streakCard.querySelector(".streak-warning");
    if (data.streak > 0 && !loggedToday) {
      if (!warnEl) {
        warnEl = document.createElement("div");
        warnEl.className = "streak-warning";
        streakCard.appendChild(warnEl);
      }
      warnEl.textContent = "Log today to keep it!";
    } else if (warnEl) {
      warnEl.remove();
    }
  }

  // Streak hero enhancements
  const heroEl = document.getElementById("stats-hero");
  if (heroEl) {
    heroEl.classList.toggle("streak-active", data.streak > 0);
    const todayStr = getTodayDate();
    const loggedToday = (data.days_logged || []).includes(todayStr);
    let warnEl = heroEl.querySelector(".stats-hero-warn");
    if (data.streak > 0 && !loggedToday) {
      if (!warnEl) {
        warnEl = document.createElement("div");
        warnEl.className = "stats-hero-warn";
        heroEl.querySelector(".stats-hero-left")?.appendChild(warnEl);
      }
      warnEl.textContent = "Log today to keep it!";
    } else if (warnEl) {
      warnEl.remove();
    }
  }

  // Empty state for zero data
  const statsBody = document.querySelector(".stats-body");
  const isZero = data.streak === 0 && data.month_tasks === 0 && data.month_learnings === 0;
  let emptyState = statsBody?.querySelector(".stats-empty-state");
  if (isZero) {
    if (!emptyState && statsBody) {
      emptyState = document.createElement("div");
      emptyState.className = "stats-empty-state";
      emptyState.innerHTML = `<div class="empty-text">No work logged yet for this period.<br>Start logging to build your streak!</div>`;
      statsBody.appendChild(emptyState);
    }
  } else if (emptyState) {
    emptyState.remove();
  }

  renderCalendar(data);
}

function renderCalendar(data) {
  const loggedSet  = new Set(data.days_logged);
  const holidaySet = new Set(data.holidays);
  const year  = data.year;
  const month = data.month;

  const daysInMonth = new Date(year, month, 0).getDate();
  // Mon-based offset: 0=Mon..6=Sun
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let html = '<div class="cal-grid">';

  weekdays.forEach(d => { html += `<div class="cal-header-cell">${d}</div>`; });
  for (let i = 0; i < firstDow; i++) { html += '<div class="cal-cell cal-empty"></div>'; }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr  = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow      = (new Date(year, month - 1, day).getDay() + 6) % 7;
    const todayStr = getTodayDate();
    const isWeekend  = dow >= 5;
    const isLogged   = loggedSet.has(dateStr);
    const isHoliday  = holidaySet.has(dateStr);
    const isToday    = dateStr === todayStr;
    const isFuture   = dateStr > todayStr;

    const classes = ["cal-cell",
      isWeekend ? "cal-weekend"  : "",
      isLogged  ? "cal-logged"   : "",
      isHoliday ? "cal-holiday"  : "",
      isToday   ? "cal-today"    : "",
      isFuture  ? "cal-future"   : "",
    ].filter(Boolean).join(" ");

    const d = new Date(year, month - 1, day);
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const clickAttr = isFuture ? "" : `onclick="toggleHoliday('${dateStr}')"`;

    html += `<div class="${classes}" ${clickAttr} data-date-label="${label}">
      <span class="cal-day-num">${day}</span>
      ${isLogged   ? '<span class="cal-dot cal-dot-logged"></span>'  : ""}
      ${isHoliday  ? '<span class="cal-dot cal-dot-holiday"></span>' : ""}
    </div>`;
  }

  html += "</div>";
  document.getElementById("stats-calendar").innerHTML = html;
}

async function toggleHoliday(dateStr) {
  const res = await fetch("/api/holidays/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateStr }),
  });
  if (res.ok) {
    const data = await res.json();
    toast(data.action === "added"
      ? `${dateStr} marked as holiday`
      : `${dateStr} holiday removed`, "info");
    loadStats();
  } else {
    toast("Failed to toggle holiday", "error");
  }
}

/* ── Custom date picker ──────────────────────────────────────────────────────── */

let dpYear, dpMonth, dpLoggedSet = new Set();

async function openDatePicker(e) {
  e.stopPropagation();
  const popup = document.getElementById("date-picker-popup");

  if (popup.style.display !== "none") {
    popup.style.display = "none";
    return;
  }

  // Position below the clicked element (fixed positioning — viewport-relative)
  const rect = e.currentTarget.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 5) + "px";
  popup.style.left = rect.left + "px";
  popup.style.display = "block";

  // Init to current month if not set
  const [y, m] = currentDate.split("-").map(Number);
  if (!dpYear) { dpYear = y; dpMonth = m; }

  await dpRenderMonth();
}

async function dpFetchLogged(year, month) {
  const res  = await fetch(`/api/stats?year=${year}&month=${month}`);
  const data = await res.json();
  dpLoggedSet = new Set(data.days_logged || []);
}

async function dpRenderMonth() {
  document.getElementById("dp-month-label").textContent =
    new Date(dpYear, dpMonth - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  await dpFetchLogged(dpYear, dpMonth);

  const today    = getTodayDate();
  const daysInMo = new Date(dpYear, dpMonth, 0).getDate();
  const firstDow = (new Date(dpYear, dpMonth - 1, 1).getDay() + 6) % 7; // Mon=0

  let html = "";
  for (let i = 0; i < firstDow; i++) html += `<div class="dp-cell dp-empty"></div>`;

  for (let d = 1; d <= daysInMo; d++) {
    const dateStr = `${dpYear}-${String(dpMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow     = (new Date(dpYear, dpMonth - 1, d).getDay() + 6) % 7;
    const classes = ["dp-cell",
      dow >= 5                 ? "dp-weekend"    : "",
      dateStr === today        ? "dp-today"      : "",
      dateStr === currentDate  ? "dp-selected"   : "",
      dpLoggedSet.has(dateStr) ? "dp-logged-dot" : "",
    ].filter(Boolean).join(" ");
    html += `<div class="${classes}" onclick="dpSelectDate('${dateStr}')">${d}</div>`;
  }

  document.getElementById("dp-grid").innerHTML = html;
}

function dpSelectDate(dateStr) {
  document.getElementById("date-picker-popup").style.display = "none";
  loadDay(dateStr);
}

function dpClosePicker(e) {
  const popup = document.getElementById("date-picker-popup");
  if (popup && !popup.contains(e.target)) {
    popup.style.display = "none";
  }
}

/* ── Keyboard shortcuts ─────────────────────────────────────────────────────── */

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (!document.getElementById("prev-day")) return;
  if (e.key === "ArrowLeft") loadDay(shiftDate(currentDate, -1));
  if (e.key === "ArrowRight") loadDay(shiftDate(currentDate, 1));
  if (e.key === "t") loadDay(getTodayDate());
});

/* ── Sidebar (mobile) ───────────────────────────────────────────────────────── */

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

/* ── DOMContentLoaded ───────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  const isDaily  = !!document.getElementById("prev-day");
  const isReview = !!document.getElementById("rv-from");

  if (isDaily) {
    document.getElementById("prev-day").addEventListener("click", () => loadDay(shiftDate(currentDate, -1)));
    document.getElementById("next-day").addEventListener("click", () => loadDay(shiftDate(currentDate, 1)));
    document.getElementById("mob-prev-day")?.addEventListener("click", () => loadDay(shiftDate(currentDate, -1)));
    document.getElementById("mob-next-day")?.addEventListener("click", () => loadDay(shiftDate(currentDate, 1)));
    document.getElementById("date-picker").addEventListener("change", e => {
      if (e.target.value) loadDay(e.target.value);
    });
    document.getElementById("task-title").addEventListener("keydown", e => {
      if (e.key === "Enter") saveTask();
    });
    document.getElementById("quick-add-input")?.addEventListener("keydown", e => {
      if (e.key === "Enter") quickAddTask();
    });
    document.getElementById("today-jump-pill")?.addEventListener("click", () => loadDay(getTodayDate()));

    // Custom date picker month nav + close-on-outside-click
    document.getElementById("dp-prev-month")?.addEventListener("click", async e => {
      e.stopPropagation();
      dpMonth--;
      if (dpMonth < 1) { dpMonth = 12; dpYear--; }
      await dpRenderMonth();
    });
    document.getElementById("dp-next-month")?.addEventListener("click", async e => {
      e.stopPropagation();
      dpMonth++;
      if (dpMonth > 12) { dpMonth = 1; dpYear++; }
      await dpRenderMonth();
    });
    document.addEventListener("click", dpClosePicker);

    loadDay(currentDate);
  }

  if (isReview) {
    initReview();
    // Search clear button
    const rvSearch = document.getElementById("rv-search");
    const rvWrap = rvSearch?.closest(".rv-search-wrap");
    rvSearch?.addEventListener("input", () => {
      rvWrap?.classList.toggle("has-value", rvSearch.value.length > 0);
    });
    document.getElementById("rv-search-clear")?.addEventListener("click", () => {
      rvSearch.value = "";
      rvWrap?.classList.remove("has-value");
      rvSearch.focus();
    });
    rvSearch?.addEventListener("keydown", e => { if (e.key === "Enter") loadReview(1); });
    // Filter toggle
    document.getElementById("rv-filter-toggle")?.addEventListener("click", function() {
      const fields = document.getElementById("rv-filter-fields");
      const isCollapsed = fields.classList.toggle("collapsed");
      this.classList.toggle("active", !isCollapsed);
      const chevron = this.querySelector(".toggle-chevron");
      if (chevron) chevron.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(180deg)";
    });
  }

  if (!!document.getElementById("stats-calendar")) {
    initStats();
  }

  // Password confirm inline check (available on all pages via base.html modal)
  document.getElementById("pw-confirm")?.addEventListener("input", checkPasswordConfirm);
  document.getElementById("pw-new")?.addEventListener("input", checkPasswordConfirm);
});
