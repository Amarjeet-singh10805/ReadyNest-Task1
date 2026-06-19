/* ==========================================================================
   Responses dashboard logic
   ========================================================================== */

requireAuth();

const params = new URLSearchParams(window.location.search);
const formId = params.get("id");

if (!formId) {
  window.location.href = "/dashboard.html";
}

const userChip = document.getElementById("user-chip");
const logoutBtn = document.getElementById("logout-btn");
const formTitleEl = document.getElementById("form-title");
const statCardsEl = document.getElementById("stat-cards");
const responsesContentEl = document.getElementById("responses-content");
const searchInput = document.getElementById("search-input");
const dateFromInput = document.getElementById("date-from-input");
const dateToInput = document.getElementById("date-to-input");

let currentFields = [];
let currentResponses = [];
let currentFormData = null;
let pendingDeleteResponseId = null;

// ---------------- User chip ----------------
const user = Storage.getUser();
if (user) {
  userChip.innerHTML = `<div class="user-avatar">${initials(user.name)}</div> ${escapeHtml(user.name)}`;
}
logoutBtn.addEventListener("click", logout);

// ---------------- Tabs ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById("tab-responses").classList.toggle("hidden", tab !== "responses");
    document.getElementById("tab-analytics").classList.toggle("hidden", tab !== "analytics");
    if (tab === "analytics") loadAnalytics();
  });
});

// ---------------- Load form info ----------------

async function loadFormInfo() {
  try {
    const data = await Api.getForm(formId);
    currentFormData = data.form;
    formTitleEl.textContent = data.form.title;
  } catch (err) {
    showToast(err.message, "error");
    if (err.status === 404) {
      setTimeout(() => window.location.href = "/dashboard.html", 1200);
    }
  }
}

// ---------------- Stat cards ----------------

function renderStatCards(views, responseCount) {
  const completionRate = views > 0 ? Math.round((responseCount / views) * 100) : 0;
  statCardsEl.innerHTML = `
    <div class="card stat-card">
      <div class="stat-card-label">Total Views</div>
      <div class="stat-card-value">${views}</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card-label">Total Submissions</div>
      <div class="stat-card-value">${responseCount}</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card-label">Completion Rate</div>
      <div class="stat-card-value">${completionRate}%</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card-label">Fields</div>
      <div class="stat-card-value">${currentFields.length}</div>
    </div>
  `;
}

// ---------------- Responses table ----------------

function renderResponsesTable(fields, responses) {
  if (responses.length === 0) {
    responsesContentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No responses yet</h3>
        <p>Share your form link to start collecting responses.</p>
      </div>
    `;
    return;
  }

  const visibleFields = fields.slice(0, 4); // keep table readable; full detail in modal

  responsesContentEl.innerHTML = `
    <div class="responses-table-wrapper">
      <table class="responses-table">
        <thead>
          <tr>
            <th>Submitted</th>
            ${visibleFields.map((f) => `<th>${escapeHtml(f.label)}</th>`).join("")}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${responses.map((r) => `
            <tr data-response-id="${r.id}" style="cursor:pointer;">
              <td>${timeAgo(r.submitted_at)}</td>
              ${visibleFields.map((f) => `<td title="${escapeHtml(r.answers[f.id] || '')}">${escapeHtml(r.answers[f.id] || '—')}</td>`).join("")}
              <td><button class="btn btn-ghost btn-sm view-detail-btn" data-response-id="${r.id}">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  responsesContentEl.querySelectorAll("tr[data-response-id]").forEach((row) => {
    row.addEventListener("click", () => openDetailModal(parseInt(row.dataset.responseId)));
  });
}

// ---------------- Load responses with filters ----------------

async function loadResponses() {
  const filters = {};
  if (searchInput.value.trim()) filters.search = searchInput.value.trim();
  if (dateFromInput.value) filters.date_from = dateFromInput.value;
  if (dateToInput.value) filters.date_to = dateToInput.value;

  try {
    const data = await Api.listResponses(formId, filters);
    currentFields = data.fields;
    currentResponses = data.responses;
    renderResponsesTable(data.fields, data.responses);

    // Update view/response counts from analytics-light source: use form data + total
    const totalResponses = data.total;
    const views = currentFormData?.view_count ?? 0;
    renderStatCards(views, totalResponses);
  } catch (err) {
    responsesContentEl.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

searchInput.addEventListener("input", debounce(loadResponses, 350));
dateFromInput.addEventListener("change", loadResponses);
dateToInput.addEventListener("change", loadResponses);

document.getElementById("clear-filters-btn").addEventListener("click", () => {
  searchInput.value = "";
  dateFromInput.value = "";
  dateToInput.value = "";
  loadResponses();
});

// ---------------- Detail modal ----------------

const detailModal = document.getElementById("detail-modal");
const detailContent = document.getElementById("detail-content");

function openDetailModal(responseId) {
  const response = currentResponses.find((r) => r.id === responseId);
  if (!response) return;

  pendingDeleteResponseId = responseId;

  detailContent.innerHTML = `
    <p style="color:var(--color-text-muted); font-size:13px; margin-bottom:14px;">
      Submitted ${formatDate(response.submitted_at)}
    </p>
    ${currentFields.map((f) => `
      <div class="field-group">
        <label class="field-label">${escapeHtml(f.label)}</label>
        <div style="padding:9px 12px; background:var(--color-bg); border-radius:8px; font-size:14px;">
          ${escapeHtml(response.answers[f.id] || "—")}
        </div>
      </div>
    `).join("")}
  `;

  detailModal.classList.remove("hidden");
}

document.getElementById("close-detail-modal").addEventListener("click", () => {
  detailModal.classList.add("hidden");
  pendingDeleteResponseId = null;
});

document.getElementById("delete-response-btn").addEventListener("click", async () => {
  if (!pendingDeleteResponseId) return;
  const btn = document.getElementById("delete-response-btn");
  btn.disabled = true;
  btn.textContent = "Deleting...";
  try {
    await Api.deleteResponse(formId, pendingDeleteResponseId);
    showToast("Response deleted", "success");
    detailModal.classList.add("hidden");
    loadResponses();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Delete Response";
    pendingDeleteResponseId = null;
  }
});

// ---------------- Share modal ----------------

const shareModal = document.getElementById("share-modal");
const shareLinkInput = document.getElementById("share-link-input");

document.getElementById("share-btn").addEventListener("click", () => {
  if (!currentFormData) return;
  shareLinkInput.value = `${window.location.origin}/form.html?token=${currentFormData.share_token}`;
  shareModal.classList.remove("hidden");
});
document.getElementById("close-share-modal").addEventListener("click", () => {
  shareModal.classList.add("hidden");
});
document.getElementById("copy-link-btn").addEventListener("click", async () => {
  await copyToClipboard(shareLinkInput.value);
  showToast("Link copied to clipboard!", "success");
});

// ---------------- Export ----------------

document.getElementById("export-csv-btn").addEventListener("click", () => exportData("csv"));
document.getElementById("export-xlsx-btn").addEventListener("click", () => exportData("xlsx"));

async function exportData(format) {
  try {
    showToast(`Preparing ${format.toUpperCase()} export...`, "info");
    const { blob, filename } = await Api.exportResponses(formId, format);
    downloadBlob(blob, filename);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------- Analytics tab ----------------

async function loadAnalytics() {
  const chartContainer = document.getElementById("chart-container");
  chartContainer.innerHTML = `<div class="page-loading"><div class="spinner spinner-dark"></div></div>`;

  try {
    const data = await Api.getAnalytics(formId);
    const series = data.analytics.responses_over_time;

    if (series.length === 0) {
      chartContainer.innerHTML = `<p style="color:var(--color-text-muted); text-align:center; padding:40px 0;">No submission data yet to chart.</p>`;
      return;
    }

    const maxCount = Math.max(...series.map((s) => s.count));
    chartContainer.innerHTML = `
      <div class="bar-chart">
        ${series.map((s) => `
          <div class="bar-chart-col" title="${s.count} on ${s.day}">
            <div class="bar-chart-bar" style="height:${Math.max((s.count / maxCount) * 100, 3)}%;"></div>
            <div class="bar-chart-label">${new Date(s.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    chartContainer.innerHTML = `<p style="color:var(--color-danger); text-align:center;">${escapeHtml(err.message)}</p>`;
  }
}

// ---------------- Init ----------------

async function init() {
  await loadFormInfo();
  await loadResponses();
}

init();
