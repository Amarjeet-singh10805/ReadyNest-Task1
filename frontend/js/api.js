/* ==========================================================================
   API client + shared utilities
   Used by every page in the app.
   ========================================================================== */

const API_BASE = "/api";

const Storage = {
  getToken() { return localStorage.getItem("fb_token"); },
  setToken(token) { localStorage.setItem("fb_token", token); },
  clearToken() { localStorage.removeItem("fb_token"); },
  getUser() {
    const raw = localStorage.getItem("fb_user");
    return raw ? JSON.parse(raw) : null;
  },
  setUser(user) { localStorage.setItem("fb_user", JSON.stringify(user)); },
  clearUser() { localStorage.removeItem("fb_user"); },
  clearAll() { this.clearToken(); this.clearUser(); },
};

/**
 * Core request helper. Automatically attaches the auth token and
 * parses JSON. Throws an Error with `.message` and `.status` on failure.
 */
async function apiRequest(path, { method = "GET", body = null, isBlob = false, query = null } = {}) {
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }

  const headers = {};
  const token = Storage.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body && !isBlob) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (isBlob) {
    if (!res.ok) {
      let message = "Export failed";
      try {
        const data = await res.json();
        message = data.message || message;
      } catch (_) {}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res; // caller handles blob()
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    data = { success: false, message: "Unexpected server response" };
  }

  if (!res.ok || data.success === false) {
    const err = new Error(data.message || "Something went wrong");
    err.status = res.status;
    throw err;
  }

  return data;
}

const Api = {
  // ---------------- Auth ----------------
  register(name, email, password) {
    return apiRequest("/auth/register", { method: "POST", body: { name, email, password } });
  },
  login(email, password) {
    return apiRequest("/auth/login", { method: "POST", body: { email, password } });
  },
  getProfile() {
    return apiRequest("/auth/me");
  },

  // ---------------- Forms ----------------
  createForm(payload) {
    return apiRequest("/forms", { method: "POST", body: payload });
  },
  listForms(search = "") {
    return apiRequest("/forms", { query: search ? { search } : null });
  },
  getForm(formId) {
    return apiRequest(`/forms/${formId}`);
  },
  updateForm(formId, payload) {
    return apiRequest(`/forms/${formId}`, { method: "PUT", body: payload });
  },
  deleteForm(formId) {
    return apiRequest(`/forms/${formId}`, { method: "DELETE" });
  },
  duplicateForm(formId) {
    return apiRequest(`/forms/${formId}/duplicate`, { method: "POST" });
  },

  // ---------------- Public ----------------
  getPublicForm(shareToken) {
    return apiRequest(`/public/forms/${shareToken}`);
  },
  submitResponse(shareToken, answers) {
    return apiRequest(`/public/forms/${shareToken}/submit`, { method: "POST", body: { answers } });
  },

  // ---------------- Responses & Analytics ----------------
  listResponses(formId, filters = {}) {
    return apiRequest(`/forms/${formId}/responses`, { query: filters });
  },
  deleteResponse(formId, responseId) {
    return apiRequest(`/forms/${formId}/responses/${responseId}`, { method: "DELETE" });
  },
  getAnalytics(formId) {
    return apiRequest(`/forms/${formId}/analytics`);
  },
  async exportResponses(formId, format) {
    const res = await apiRequest(`/forms/${formId}/export`, { query: { format }, isBlob: true });
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `responses.${format}`;
    return { blob, filename };
  },
};

// ==========================================================================
// Toast notifications
// ==========================================================================

function ensureToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = "info") {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// ==========================================================================
// Misc helpers
// ==========================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(isoString) {
  if (!isoString) return "";
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function requireAuth() {
  if (!Storage.getToken()) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}

function redirectIfAuthed() {
  if (Storage.getToken()) {
    window.location.href = "/dashboard.html";
  }
}

function logout() {
  Storage.clearAll();
  window.location.href = "/index.html";
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return true;
  }
}
