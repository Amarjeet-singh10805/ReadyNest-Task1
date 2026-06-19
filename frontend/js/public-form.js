/* ==========================================================================
   Public form-filling page logic
   ========================================================================== */

const root = document.getElementById("root");
const params = new URLSearchParams(window.location.search);
const shareToken = params.get("token");

let currentForm = null;

function renderError(message) {
  root.innerHTML = `
    <div class="public-form-body-card" style="border-radius: var(--radius-lg);">
      <div class="closed-banner">
        <div style="font-size:40px; margin-bottom:10px;">🚫</div>
        <h3>${escapeHtml(message)}</h3>
      </div>
    </div>
  `;
}

function fieldInputHtml(field) {
  const fid = `field_${field.id}`;
  const requiredAttr = field.is_required ? "required" : "";
  const requiredStar = field.is_required ? '<span class="required-star">*</span>' : "";

  let inputHtml = "";
  switch (field.field_type) {
    case "text":
    case "phone":
    case "url":
      inputHtml = `<input type="${field.field_type === 'url' ? 'url' : 'text'}" class="input" id="${fid}" name="${fid}" placeholder="${escapeHtml(field.placeholder || '')}" ${requiredAttr} />`;
      break;
    case "email":
      inputHtml = `<input type="email" class="input" id="${fid}" name="${fid}" placeholder="${escapeHtml(field.placeholder || 'you@example.com')}" ${requiredAttr} />`;
      break;
    case "number":
      inputHtml = `<input type="number" class="input" id="${fid}" name="${fid}" placeholder="${escapeHtml(field.placeholder || '')}" ${requiredAttr} />`;
      break;
    case "date":
      inputHtml = `<input type="date" class="input" id="${fid}" name="${fid}" ${requiredAttr} />`;
      break;
    case "textarea":
      inputHtml = `<textarea class="textarea" id="${fid}" name="${fid}" placeholder="${escapeHtml(field.placeholder || '')}" ${requiredAttr}></textarea>`;
      break;
    case "checkbox":
      inputHtml = (field.options || []).map((opt, idx) => `
        <label class="checkbox-row">
          <input type="checkbox" name="${fid}" value="${escapeHtml(opt)}" data-checkbox-group="${fid}" />
          ${escapeHtml(opt)}
        </label>
      `).join("");
      break;
    case "radio":
      inputHtml = (field.options || []).map((opt, idx) => `
        <label class="radio-row">
          <input type="radio" name="${fid}" value="${escapeHtml(opt)}" ${requiredAttr} />
          ${escapeHtml(opt)}
        </label>
      `).join("");
      break;
    case "dropdown":
      inputHtml = `
        <select class="select" id="${fid}" name="${fid}" ${requiredAttr}>
          <option value="">Choose an option...</option>
          ${(field.options || []).map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join("")}
        </select>
      `;
      break;
    default:
      inputHtml = `<input type="text" class="input" id="${fid}" name="${fid}" ${requiredAttr} />`;
  }

  return `
    <div class="public-field" data-field-id="${field.id}" data-field-type="${field.field_type}" data-required="${field.is_required}">
      <label class="public-field-label" for="${fid}">${escapeHtml(field.label)}${requiredStar}</label>
      ${inputHtml}
      <div class="field-error hidden" id="error_${fid}"></div>
    </div>
  `;
}

function renderForm(form) {
  currentForm = form;
  document.documentElement.style.setProperty("--color-primary", form.theme_color || "#6366f1");

  if (!form.accepts_responses) {
    root.innerHTML = `
      <div class="public-form-header" style="border-radius: var(--radius-lg);">
        <h1>${escapeHtml(form.title)}</h1>
      </div>
      <div class="public-form-body-card">
        <div class="closed-banner">
          <div style="font-size:40px; margin-bottom:10px;">🔒</div>
          <h3>This form is no longer accepting responses</h3>
          <p>Please check back later or contact the form owner.</p>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="public-form-header">
      <h1>${escapeHtml(form.title)}</h1>
      ${form.description ? `<p>${escapeHtml(form.description)}</p>` : ""}
    </div>
    <form class="public-form-body-card" id="public-form">
      ${form.fields.map(fieldInputHtml).join("")}
      <button type="submit" class="btn btn-primary btn-lg btn-block" id="submit-btn">Submit</button>
    </form>
    <p class="public-form-footer">Powered by FormBuilder</p>
  `;

  document.getElementById("public-form").addEventListener("submit", handleSubmit);
}

function collectAnswers() {
  const answers = {};
  const errors = [];

  currentForm.fields.forEach((field) => {
    const fid = `field_${field.id}`;
    let value;

    if (field.field_type === "checkbox") {
      const checked = Array.from(document.querySelectorAll(`input[data-checkbox-group="${fid}"]:checked`));
      value = checked.map((c) => c.value);
    } else if (field.field_type === "radio") {
      const checked = document.querySelector(`input[name="${fid}"]:checked`);
      value = checked ? checked.value : "";
    } else {
      const el = document.getElementById(fid);
      value = el ? el.value.trim() : "";
    }

    const isEmpty = Array.isArray(value) ? value.length === 0 : !value;
    if (field.is_required && isEmpty) {
      errors.push({ fieldId: field.id, fid, message: "This field is required" });
    }

    answers[field.id] = value;
  });

  return { answers, errors };
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => {
    el.classList.add("hidden");
    el.textContent = "";
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const { answers, errors } = collectAnswers();

  if (errors.length > 0) {
    errors.forEach((err) => {
      const errorEl = document.getElementById(`error_${err.fid}`);
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.classList.remove("hidden");
      }
    });
    document.getElementById(`error_${errors[0].fid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    await Api.submitResponse(shareToken, answers);
    showSuccessScreen();
  } catch (err) {
    showToast(err.message, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
}

function showSuccessScreen() {
  root.innerHTML = `
    <div class="public-form-body-card" style="border-radius: var(--radius-lg);">
      <div class="success-screen">
        <div class="success-icon">✓</div>
        <h2>Response submitted!</h2>
        <p>Thank you for filling out "${escapeHtml(currentForm.title)}".</p>
      </div>
    </div>
    <p class="public-form-footer">Powered by FormBuilder</p>
  `;
}

async function loadForm() {
  if (!shareToken) {
    renderError("No form was specified");
    return;
  }
  try {
    const data = await Api.getPublicForm(shareToken);
    renderForm(data.form);
  } catch (err) {
    renderError(err.message || "This form could not be found");
  }
}

loadForm();
