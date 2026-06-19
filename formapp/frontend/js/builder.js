/* ==========================================================================
   Form Builder — drag & drop logic
   ========================================================================== */

requireAuth();

const urlParams = new URLSearchParams(window.location.search);
const editFormId = urlParams.get("id");

const fieldsListEl = document.getElementById("fields-list");
const canvasDropzone = document.getElementById("canvas-dropzone");
const canvasEmptyState = document.getElementById("canvas-empty-state");
const titleInput = document.getElementById("form-title-input");
const descriptionInput = document.getElementById("form-description-input");
const saveBtn = document.getElementById("save-btn");
const saveStatus = document.getElementById("save-status");
const isPublishedToggle = document.getElementById("is-published-toggle");
const acceptsResponsesToggle = document.getElementById("accepts-responses-toggle");

let fields = [];          // in-memory list of field objects
let selectedColor = "#6366f1";
let nextLocalId = 1;
let draggedFieldLocalId = null;
let draggedFromPalette = null;

const FIELD_LABELS = {
  text: "Text", email: "Email", number: "Number", phone: "Phone",
  textarea: "Paragraph", date: "Date", checkbox: "Checkboxes",
  radio: "Multiple Choice", dropdown: "Dropdown", url: "URL",
};

const FIELD_DEFAULT_LABELS = {
  text: "Short answer question",
  email: "Email address",
  number: "Number question",
  phone: "Phone number",
  textarea: "Long answer question",
  date: "Select a date",
  checkbox: "Select all that apply",
  radio: "Choose one option",
  dropdown: "Choose from a list",
  url: "Website link",
};

function newField(fieldType) {
  const needsOptions = ["checkbox", "radio", "dropdown"].includes(fieldType);
  return {
    localId: nextLocalId++,
    field_type: fieldType,
    label: FIELD_DEFAULT_LABELS[fieldType] || "Untitled question",
    placeholder: "",
    is_required: false,
    options: needsOptions ? ["Option 1", "Option 2"] : [],
  };
}

// ==========================================================================
// Rendering
// ==========================================================================

function renderFields() {
  canvasEmptyState.classList.toggle("hidden", fields.length > 0);
  fieldsListEl.innerHTML = fields.map(fieldCardHtml).join("");

  fields.forEach((field) => {
    const card = document.getElementById(`field-${field.localId}`);
    if (!card) return;

    // Drag handle events
    card.addEventListener("dragstart", (e) => {
      draggedFieldLocalId = field.localId;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedFieldLocalId = null;
      clearDragTargetStyles();
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (draggedFieldLocalId === null || draggedFieldLocalId === field.localId) return;
      const rect = card.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      clearDragTargetStyles();
      if (e.clientY < midpoint) {
        card.classList.add("drag-target-above");
      } else {
        card.classList.add("drag-target-below");
      }
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedFieldLocalId === null) return;
      const targetAbove = card.classList.contains("drag-target-above");
      reorderField(draggedFieldLocalId, field.localId, targetAbove);
      clearDragTargetStyles();
    });

    // Label edit
    const labelInput = card.querySelector(".field-card-label-input");
    labelInput?.addEventListener("input", (e) => {
      field.label = e.target.value;
      markUnsaved();
    });

    // Required toggle
    const requiredCheckbox = card.querySelector(".field-required-checkbox");
    requiredCheckbox?.addEventListener("change", (e) => {
      field.is_required = e.target.checked;
      markUnsaved();
    });

    // Remove
    card.querySelector(".field-card-remove")?.addEventListener("click", () => {
      fields = fields.filter((f) => f.localId !== field.localId);
      renderFields();
      markUnsaved();
    });

    // Options editor (checkbox/radio/dropdown)
    if (["checkbox", "radio", "dropdown"].includes(field.field_type)) {
      card.querySelectorAll(".option-input").forEach((input, idx) => {
        input.addEventListener("input", (e) => {
          field.options[idx] = e.target.value;
          markUnsaved();
        });
      });
      card.querySelectorAll(".option-remove-btn").forEach((btn, idx) => {
        btn.addEventListener("click", () => {
          field.options.splice(idx, 1);
          renderFields();
          markUnsaved();
        });
      });
      card.querySelector(".add-option-btn")?.addEventListener("click", () => {
        field.options.push(`Option ${field.options.length + 1}`);
        renderFields();
        markUnsaved();
      });
    }
  });
}

function clearDragTargetStyles() {
  document.querySelectorAll(".field-card").forEach((c) => {
    c.classList.remove("drag-target-above", "drag-target-below");
  });
}

function fieldCardHtml(field) {
  return `
    <div class="field-card" id="field-${field.localId}" draggable="true">
      <div class="field-card-header">
        <span class="field-drag-handle">⠿⠿</span>
        <span class="field-card-type-badge">${escapeHtml(FIELD_LABELS[field.field_type] || field.field_type)}</span>
        <div class="field-card-spacer"></div>
        <button class="field-card-remove" title="Remove field">✕</button>
      </div>
      <input type="text" class="field-card-label-input" value="${escapeHtml(field.label)}" placeholder="Question label" />
      ${fieldPreviewHtml(field)}
      ${optionsEditorHtml(field)}
      <div class="field-card-footer">
        <label class="required-toggle">
          <input type="checkbox" class="field-required-checkbox" ${field.is_required ? "checked" : ""} />
          Required
        </label>
      </div>
    </div>
  `;
}

function fieldPreviewHtml(field) {
  switch (field.field_type) {
    case "text":
    case "email":
    case "number":
    case "phone":
    case "url":
    case "date":
      return `<input type="text" class="input field-preview" placeholder="${field.field_type === 'date' ? 'mm/dd/yyyy' : 'Respondent answer goes here'}" disabled />`;
    case "textarea":
      return `<textarea class="textarea field-preview" placeholder="Respondent answer goes here" disabled rows="2"></textarea>`;
    case "checkbox":
    case "radio":
    case "dropdown":
      return ""; // options editor shows the preview for these
    default:
      return "";
  }
}

function optionsEditorHtml(field) {
  if (!["checkbox", "radio", "dropdown"].includes(field.field_type)) return "";
  const icon = field.field_type === "checkbox" ? "☐" : field.field_type === "radio" ? "○" : "▾";
  return `
    <div class="options-editor">
      ${field.options.map((opt, idx) => `
        <div class="option-row">
          <span style="opacity:0.5;">${icon}</span>
          <input type="text" class="option-input" value="${escapeHtml(opt)}" data-idx="${idx}" />
          <button class="option-remove-btn" type="button" title="Remove option">✕</button>
        </div>
      `).join("")}
      <button class="add-option-btn" type="button">+ Add option</button>
    </div>
  `;
}

// ==========================================================================
// Reordering logic
// ==========================================================================

function reorderField(draggedLocalId, targetLocalId, insertAbove) {
  const draggedIdx = fields.findIndex((f) => f.localId === draggedLocalId);
  if (draggedIdx === -1) return;
  const [draggedField] = fields.splice(draggedIdx, 1);

  let targetIdx = fields.findIndex((f) => f.localId === targetLocalId);
  if (targetIdx === -1) targetIdx = fields.length;
  const insertIdx = insertAbove ? targetIdx : targetIdx + 1;

  fields.splice(insertIdx, 0, draggedField);
  renderFields();
  markUnsaved();
}

// ==========================================================================
// Palette: drag-from-palette and click-to-add
// ==========================================================================

document.querySelectorAll(".palette-item").forEach((item) => {
  const fieldType = item.dataset.fieldType;

  item.addEventListener("dragstart", (e) => {
    draggedFromPalette = fieldType;
    e.dataTransfer.effectAllowed = "copy";
  });
  item.addEventListener("dragend", () => {
    draggedFromPalette = null;
  });

  // Click to add to the end (mobile-friendly / accessible alternative)
  item.addEventListener("click", () => {
    fields.push(newField(fieldType));
    renderFields();
    markUnsaved();
    fieldsListEl.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

canvasDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (draggedFromPalette) {
    canvasDropzone.classList.add("drag-over");
  }
});
canvasDropzone.addEventListener("dragleave", (e) => {
  if (e.target === canvasDropzone) canvasDropzone.classList.remove("drag-over");
});
canvasDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  canvasDropzone.classList.remove("drag-over");
  if (draggedFromPalette) {
    fields.push(newField(draggedFromPalette));
    renderFields();
    markUnsaved();
    draggedFromPalette = null;
  }
});

// ==========================================================================
// Theme color
// ==========================================================================

document.querySelectorAll(".color-swatch").forEach((swatch) => {
  swatch.addEventListener("click", () => {
    document.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("active"));
    swatch.classList.add("active");
    selectedColor = swatch.dataset.color;
    markUnsaved();
  });
});

// ==========================================================================
// Save status indicator
// ==========================================================================

let hasUnsavedChanges = false;
function markUnsaved() {
  hasUnsavedChanges = true;
  saveStatus.textContent = "Unsaved changes";
}

[titleInput, descriptionInput, isPublishedToggle, acceptsResponsesToggle].forEach((el) => {
  el.addEventListener("input", markUnsaved);
  el.addEventListener("change", markUnsaved);
});

// ==========================================================================
// Save form
// ==========================================================================

function buildPayload() {
  const title = titleInput.value.trim() || "Untitled Form";
  return {
    title,
    description: descriptionInput.value.trim(),
    theme_color: selectedColor,
    is_published: isPublishedToggle.checked,
    accepts_responses: acceptsResponsesToggle.checked,
    fields: fields.map((f, idx) => ({
      field_type: f.field_type,
      label: f.label.trim() || "Untitled question",
      placeholder: f.placeholder || "",
      is_required: f.is_required,
      field_order: idx,
      options: ["checkbox", "radio", "dropdown"].includes(f.field_type)
        ? f.options.filter((o) => o.trim() !== "")
        : [],
    })),
  };
}

async function saveForm() {
  if (fields.length === 0) {
    showToast("Add at least one field before saving", "error");
    return;
  }

  const payload = buildPayload();
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    if (editFormId) {
      await Api.updateForm(editFormId, payload);
      showToast("Form saved", "success");
    } else {
      const data = await Api.createForm(payload);
      showToast("Form created!", "success");
      window.history.replaceState(null, "", `/builder.html?id=${data.form_id}`);
    }
    hasUnsavedChanges = false;
    saveStatus.textContent = "All changes saved";
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Form";
  }
}

saveBtn.addEventListener("click", saveForm);

document.getElementById("preview-btn").addEventListener("click", () => {
  if (editFormId) {
    window.open(`/builder.html?id=${editFormId}`, "_blank");
    showToast("Save the form, then use Share from the dashboard to preview the live link", "info");
  } else {
    showToast("Save your form first to generate a preview link", "info");
  }
});

window.addEventListener("beforeunload", (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ==========================================================================
// Load existing form (edit mode)
// ==========================================================================

async function loadExistingForm() {
  try {
    const data = await Api.getForm(editFormId);
    const form = data.form;
    titleInput.value = form.title;
    descriptionInput.value = form.description || "";
    selectedColor = form.theme_color || "#6366f1";
    isPublishedToggle.checked = form.is_published;
    acceptsResponsesToggle.checked = form.accepts_responses;

    document.querySelectorAll(".color-swatch").forEach((s) => {
      s.classList.toggle("active", s.dataset.color === selectedColor);
    });

    fields = form.fields.map((f) => ({
      localId: nextLocalId++,
      field_type: f.field_type,
      label: f.label,
      placeholder: f.placeholder || "",
      is_required: f.is_required,
      options: f.options || [],
    }));

    renderFields();
    saveStatus.textContent = "All changes saved";
  } catch (err) {
    showToast(err.message, "error");
    if (err.status === 404) {
      setTimeout(() => window.location.href = "/dashboard.html", 1500);
    }
  }
}

if (editFormId) {
  loadExistingForm();
} else {
  renderFields();
}
