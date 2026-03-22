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

/* ── Toast ──────────────────────────────────────────────────────────────────── */

function toast(msg, type = "success") {
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  const el = document.createElement("div");
  el.className = `toast-item ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => {
    el.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/* ── Custom confirm dialog ──────────────────────────────────────────────────── */

function confirmDialog(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="confirm-icon">🗑️</div>
        <div class="confirm-title">Delete this item?</div>
        <div class="confirm-msg">${msg}</div>
        <div class="confirm-actions">
          <button class="btn-ghost" id="cfn-cancel">Cancel</button>
          <button class="btn-danger-custom" id="cfn-ok">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#cfn-cancel").onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector("#cfn-ok").onclick = () => { overlay.remove(); resolve(true); };
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
  container.innerHTML = tasks.map(t => `
    <div class="item-card">
      <div class="card-top">
        <div class="card-title">${escHtml(t.title)}</div>
        <div class="card-actions">
          <button class="icon-btn" title="Edit" onclick='openTaskModal(${JSON.stringify(JSON.stringify(t))})'>✏️</button>
          <button class="icon-btn delete" title="Delete" onclick="deleteTask('${t._id}', '${escHtml(t.title)}')">🗑️</button>
        </div>
      </div>
      ${t.note ? `<div class="card-note">${escHtml(t.note)}</div>` : ""}
    </div>
  `).join("");
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
  container.innerHTML = learnings.map(l => `
    <div class="item-card learning-card">
      <div class="card-top">
        <div class="card-title" style="font-weight:400;">${escHtml(l.content)}</div>
        <div class="card-actions">
          <button class="icon-btn" title="Edit" onclick='openLearningModal(${JSON.stringify(JSON.stringify(l))})'>✏️</button>
          <button class="icon-btn delete" title="Delete" onclick="deleteLearning('${l._id}', '${escHtml(l.content.slice(0, 40))}')">🗑️</button>
        </div>
      </div>
      ${(l.tags || []).length ? `
        <div class="tags-row">
          ${l.tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join("")}
        </div>` : ""}
    </div>
  `).join("");
}

/* ── Task modal ─────────────────────────────────────────────────────────────── */

function openTaskModal(taskJson = null) {
  const task = taskJson ? JSON.parse(taskJson) : null;
  document.getElementById("task-modal-title").textContent = task ? "Edit Task" : "New Task";
  document.getElementById("task-id").value = task ? task._id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-note").value = task ? (task.note || "") : "";
  if (!taskModalEl) taskModalEl = new bootstrap.Modal(document.getElementById("task-modal"));
  taskModalEl.show();
  setTimeout(() => document.getElementById("task-title").focus(), 300);
}

async function saveTask() {
  const id = document.getElementById("task-id").value;
  const title = document.getElementById("task-title").value.trim();
  if (!title) { document.getElementById("task-title").focus(); return; }
  const body = { date: currentDate, title, note: document.getElementById("task-note").value.trim() };
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
  if (!content) { document.getElementById("learning-content").focus(); return; }
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

async function loadReview() {
  const from = document.getElementById("rv-from").value;
  const to   = document.getElementById("rv-to").value;
  if (!from || !to) { toast("Please select both dates", "error"); return; }
  if (from > to)    { toast("From date must be before To date", "error"); return; }

  document.getElementById("rv-body").innerHTML =
    '<div class="rv-placeholder"><div class="empty-icon">⏳</div><div class="empty-text">Loading…</div></div>';

  const res  = await fetch(`/api/review?from=${from}&to=${to}`);
  const data = await res.json();
  window._rvData = data;

  document.getElementById("rv-stat-tasks").textContent     = data.total_tasks;
  document.getElementById("rv-stat-learnings").textContent = data.total_learnings;
  document.getElementById("rv-stat-days").textContent      = data.total_days;

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

    const gridClass = !showTasks ? "learnings-only" : !showLearnings ? "tasks-only" : "";

    const tasksHtml = showTasks ? `
      <div>
        <div class="rv-section-label"><span class="section-dot dot-tasks"></span>Tasks (${d.tasks.length})</div>
        ${d.tasks.length ? d.tasks.map(t => `
          <div class="rv-card">
            <div class="rv-card-title">${escHtml(t.title)}</div>
            ${t.note ? `<div class="rv-card-note">${escHtml(t.note)}</div>` : ""}
          </div>`).join("") : '<div class="rv-empty-day">No tasks</div>'}
      </div>` : "";

    const learningsHtml = showLearnings ? `
      <div>
        <div class="rv-section-label"><span class="section-dot dot-learnings"></span>Learnings (${d.learnings.length})</div>
        ${d.learnings.length ? d.learnings.map(l => `
          <div class="rv-card">
            <div class="rv-card-content">${escHtml(l.content)}</div>
            ${(l.tags||[]).length ? `<div class="tags-row">${l.tags.map(t=>`<span class="tag">${escHtml(t)}</span>`).join("")}</div>` : ""}
          </div>`).join("") : '<div class="rv-empty-day">No learnings</div>'}
      </div>` : "";

    return `
      <div class="rv-day-block">
        <div class="rv-day-spine">
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
    // mobile buttons
    document.getElementById("mob-prev-day")?.addEventListener("click", () => loadDay(shiftDate(currentDate, -1)));
    document.getElementById("mob-next-day")?.addEventListener("click", () => loadDay(shiftDate(currentDate, 1)));
    document.getElementById("date-picker").addEventListener("change", e => {
      if (e.target.value) loadDay(e.target.value);
    });
    document.getElementById("task-title").addEventListener("keydown", e => {
      if (e.key === "Enter") saveTask();
    });
    loadDay(currentDate);
  }

  if (isReview) {
    initReview();
  }
});
