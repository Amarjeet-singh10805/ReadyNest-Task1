/* ==========================================================================
   Dashboard page logic
   ========================================================================== */

requireAuth();

const formsContainer = document.getElementById("forms-container");
const searchInput = document.getElementById("search-input");
const userChip = document.getElementById("user-chip");
const logoutBtn = document.getElementById("logout-btn");

let allFormsCache = [];
let pendingDeleteFormId = null;

// ---------------- User chip ----------------
const user = Storage.getUser();
if (user) {
  userChip.innerHTML = `<div class="user-avatar">${initials(user.name)}</div> ${escapeHtml(user.name)}`;
}
logoutBtn.addEventListener("click", logout);

// ---------------- Render ----------------

function renderForms(forms) {
  if (forms.length === 0) {
    formsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <h3>No forms yet</h3>
        <p>Create your first form to start collecting responses.</p>
        <a href="/builder.html" class="btn btn-primary" style="margin-top:12px;">+ Create New Form</a>
      </div>
    `;
    return;
  }

  formsContainer.innerHTML = `<div class="forms-grid">${forms.map(formCardHtml).join("")}</div>`;

  forms.forEach((form) => {
    document.getElementById(`menu-btn-${form.id}`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu(form.id);
    });
    document.getElementById(`share-btn-${form.id}`)?.addEventListener("click", () => openShareModal(form));
    document.getElementById(`edit-link-${form.id}`)?.addEventListener("click", () => {
      window.location.href = `/builder.html?id=${form.id}`;
    });
    document.getElementById(`responses-link-${form.id}`)?.addEventListener("click", () => {
      window.location.href = `/responses.html?id=${form.id}`;
    });
    document.getElementById(`duplicate-btn-${form.id}`)?.addEventListener("click", () => duplicateForm(form.id));
    document.getElementById(`delete-btn-${form.id}`)?.addEventListener("click", () => openDeleteModal(form.id));
  });

  document.addEventListener("click", closeAllMenus);
}

function formCardHtml(form) {
  return `
    <div class="card form-card">
      <div class="form-card-top">
        <div class="flex items-center gap-2">
          <div class="form-card-color-dot" style="background:${escapeHtml(form.theme_color || '#6366f1')}"></div>
          <div>
            <h3>${escapeHtml(form.title)}</h3>
          </div>
        </div>
        <div class="dropdown-menu-wrapper">
          <button class="btn btn-ghost btn-icon" id="menu-btn-${form.id}">⋮</button>
          <div class="dropdown-menu hidden" id="dropdown-${form.id}">
            <button id="edit-link-${form.id}">✏️ Edit form</button>
            <button id="responses-link-${form.id}">📊 View responses</button>
            <button id="duplicate-btn-${form.id}">📑 Duplicate</button>
            <button id="delete-btn-${form.id}" class="danger-item">🗑️ Delete</button>
          </div>
        </div>
      </div>

      <p class="form-card-desc">${escapeHtml(form.description || "No description")}</p>

      <div class="form-card-stats">
        <div class="form-card-stat">
          <strong>${form.view_count ?? 0}</strong>
          Views
        </div>
        <div class="form-card-stat">
          <strong>${form.response_count ?? 0}</strong>
          Responses
        </div>
        <div class="form-card-stat">
          <span class="badge ${form.is_published ? "badge-success" : "badge-muted"}">
            ${form.is_published ? "Published" : "Draft"}
          </span>
        </div>
      </div>

      <div class="form-card-actions">
        <button class="btn btn-secondary btn-sm flex-1" id="edit-link-${form.id}-btn" onclick="window.location.href='/builder.html?id=${form.id}'">Edit</button>
        <button class="btn btn-secondary btn-sm flex-1" onclick="window.location.href='/responses.html?id=${form.id}'">Responses</button>
        <button class="btn btn-primary btn-sm" id="share-btn-${form.id}">Share</button>
      </div>
    </div>
  `;
}

function toggleMenu(formId) {
  const menu = document.getElementById(`dropdown-${formId}`);
  const isOpen = !menu.classList.contains("hidden");
  closeAllMenus();
  if (!isOpen) menu.classList.remove("hidden");
}

function closeAllMenus() {
  document.querySelectorAll(".dropdown-menu").forEach((m) => m.classList.add("hidden"));
}

// ---------------- Share modal ----------------

const shareModal = document.getElementById("share-modal");
const shareLinkInput = document.getElementById("share-link-input");

function openShareModal(form) {
  const shareUrl = `${window.location.origin}/form.html?token=${form.share_token}`;
  shareLinkInput.value = shareUrl;
  shareModal.classList.remove("hidden");
}

document.getElementById("close-share-modal").addEventListener("click", () => {
  shareModal.classList.add("hidden");
});

document.getElementById("copy-link-btn").addEventListener("click", async () => {
  await copyToClipboard(shareLinkInput.value);
  showToast("Link copied to clipboard!", "success");
});

// ---------------- Delete modal ----------------

const deleteModal = document.getElementById("delete-modal");

function openDeleteModal(formId) {
  pendingDeleteFormId = formId;
  deleteModal.classList.remove("hidden");
}

document.getElementById("cancel-delete-btn").addEventListener("click", () => {
  deleteModal.classList.add("hidden");
  pendingDeleteFormId = null;
});

document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
  if (!pendingDeleteFormId) return;
  const btn = document.getElementById("confirm-delete-btn");
  btn.disabled = true;
  btn.textContent = "Deleting...";
  try {
    await Api.deleteForm(pendingDeleteFormId);
    showToast("Form deleted", "success");
    deleteModal.classList.add("hidden");
    loadForms();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Delete Form";
    pendingDeleteFormId = null;
  }
});

// ---------------- Duplicate ----------------

async function duplicateForm(formId) {
  try {
    await Api.duplicateForm(formId);
    showToast("Form duplicated", "success");
    loadForms();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------- Load + search ----------------

async function loadForms(search = "") {
  try {
    const data = await Api.listForms(search);
    allFormsCache = data.forms;
    renderForms(data.forms);
  } catch (err) {
    if (err.status === 401) {
      logout();
      return;
    }
    formsContainer.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

searchInput.addEventListener("input", debounce((e) => {
  loadForms(e.target.value.trim());
}, 350));

loadForms();
