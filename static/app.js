const state = {
  mode: "ct",
  recognition: null,
  isRecognizing: false,
  activeTargetId: null,
  baseText: "",
  finalText: "",
  pendingStart: null,
  savedReports: [],
  currentReportId: "",
  currentUser: null,
  aiSettings: null,
  fieldHistory: {},
};

const themeKey = "radiologiaTheme";
const reportColumnWidthKey = "radiologiaReportColumnWidth";

const regionLabels = {
  cranio: "Crânio",
  pescoco: "Pescoço",
  torax: "Tórax",
  abdomen: "Abdome",
  abdome_pelve: "Abdome e pelve",
  coluna: "Coluna",
  pelve: "Pelve",
  osteo: "Ósteoarticular",
  vascular: "Vascular",
};

const templates = {
  ct: {
    cranio: {
      findings:
        "Parênquima encefálico sem sinais de hemorragia aguda ou efeito de massa.\n" +
        "Ventrículos e cisternas de configuração preservada.\n" +
        "Ossos da calota sem fraturas evidentes.",
      impression: "Sem alterações agudas identificáveis no estudo.",
    },
    torax: {
      findings:
        "Pulmões com transparência preservada, sem consolidações focais.\n" +
        "Sem derrame pleural. Mediastino sem linfonodomegalias significativas.\n" +
        "Arcabouço ósseo sem fraturas evidentes.",
      impression: "Sem achados tomográficos agudos no tórax.",
    },
    abdomen: {
      findings:
        "Fígado de contornos regulares e densidade homogênea.\n" +
        "Vesícula biliar sem cálculos. Pâncreas, baço e adrenais sem alterações.\n" +
        "Rins sem hidronefrose. Sem líquido livre significativo.",
      impression: "Sem alterações tomográficas significativas no abdome.",
    },
    coluna: {
      findings:
        "Alinhamento vertebral preservado, sem fraturas.\n" +
        "Discos intervertebrais sem redução significativa de altura.\n" +
        "Canal vertebral sem estenose relevante.",
      impression: "Sem alterações agudas na coluna avaliadas.",
    },
    pelve: {
      findings:
        "Bexiga com paredes finas, sem espessamentos.\n" +
        "Próstata/útero sem alterações volumétricas evidentes.\n" +
        "Sem líquido livre na pelve.",
      impression: "Sem achados tomográficos agudos na pelve.",
    },
    osteo: {
      findings:
        "Estruturas ósseas sem fraturas agudas.\n" +
        "Articulações sem desalinhamento.\n" +
        "Partes moles sem coleções ou massas evidentes.",
      impression: "Sem alterações agudas no segmento avaliado.",
    },
    default: {
      findings: "Sem alterações significativas.",
      impression: "Exame sem achados relevantes.",
    },
  },
  mri: {
    cranio: {
      findings:
        "Sinais de intensidade do parênquima encefálico preservados.\n" +
        "Sem restrição à difusão ou focos de sangramento.\n" +
        "Ventrículos e cisternas preservados.",
      impression: "Sem alterações significativas na ressonância do crânio.",
    },
    torax: {
      findings:
        "Sem massas evidentes no mediastino.\n" +
        "Sem derrame pleural volumoso.\n" +
        "Estruturas cardíacas avaliadas sem alterações evidentes.",
      impression: "Sem achados relevantes na RM de tórax.",
    },
    abdomen: {
      findings:
        "Fígado com sinal homogêneo, sem lesões focais evidentes.\n" +
        "Vias biliares sem dilatação. Pâncreas, baço e rins com sinal preservado.\n" +
        "Sem líquido livre significativo.",
      impression: "Sem alterações significativas na RM de abdome.",
    },
    coluna: {
      findings:
        "Alinhamento vertebral preservado.\n" +
        "Discos sem herniações significativas.\n" +
        "Medula com sinal preservado.",
      impression: "Sem alterações relevantes na RM da coluna.",
    },
    pelve: {
      findings:
        "Útero/próstata com sinal preservado.\n" +
        "Bexiga sem espessamento parietal.\n" +
        "Sem líquido livre na pelve.",
      impression: "Sem achados relevantes na RM de pelve.",
    },
    osteo: {
      findings:
        "Tendões e ligamentos sem rupturas evidentes.\n" +
        "Sem edema ósseo significativo.\n" +
        "Cartilagens preservadas.",
      impression: "Sem alterações relevantes no segmento avaliado.",
    },
    default: {
      findings: "Sem alterações significativas.",
      impression: "Exame sem achados relevantes.",
    },
  },
};

const modeButtons = document.querySelectorAll(".mode-btn");
const regionSelect = document.getElementById("regionSelect");
const contrastSelect = document.getElementById("contrastSelect");
const specificTemplateSelect = document.getElementById("specificTemplateSelect");
const applyTemplateBtn = document.getElementById("applyTemplate");
const addTemplateBtn = document.getElementById("addTemplate");
const importTemplateBtn = document.getElementById("importTemplate");
const templateFileInput = document.getElementById("templateFileInput");
const templateStatusEl = document.getElementById("templateStatus");
const aiProviderEl = document.getElementById("aiProvider");
const aiModelEl = document.getElementById("aiModel");
const aiApiKeyEl = document.getElementById("aiApiKey");
const aiRequestEl = document.getElementById("aiRequest");
const saveApiKeyBtn = document.getElementById("saveApiKey");
const globalKeyStatusEl = document.getElementById("globalKeyStatus");
const aiBaseUrlEl = document.getElementById("aiBaseUrl");
const generateAiBtn = document.getElementById("generateAi");
const aiStatusEl = document.getElementById("aiStatus");
const refreshModelsBtn = document.getElementById("refreshModels");
const generateReportBtn = document.getElementById("generateReport");
const clearFormBtn = document.getElementById("clearForm");
const copyReportBtn = document.getElementById("copyReport");
const downloadReportBtn = document.getElementById("downloadReport");
const downloadPdfBtn = document.getElementById("downloadPdf");
const saveFinalReportBtn = document.getElementById("saveFinalReport");
const saveDraftBtn = document.getElementById("saveDraft");
const loadDraftBtn = document.getElementById("loadDraft");
const stopDictationBtn = document.getElementById("stopDictation");
const reportOutputEl = document.getElementById("reportOutput");
const savedReportsListEl = document.getElementById("savedReportsList");
const savedReportsStatusEl = document.getElementById("savedReportsStatus");
const refreshSavedReportsBtn = document.getElementById("refreshSavedReports");
const micStatusEl = document.getElementById("micStatus");
const speechSupportEl = document.getElementById("speechSupport");
const speechHintEl = document.getElementById("speechHint");
const dictationTargetEl = document.getElementById("dictationTarget");
const micButtons = document.querySelectorAll(".mic-btn");
const themeToggleBtn = document.getElementById("themeToggle");
const templateModalEl = document.getElementById("templateModal");
const templateModeSelectEl = document.getElementById("templateModeSelect");
const templateRegionSelectEl = document.getElementById("templateRegionSelect");
const templateTitleInputEl = document.getElementById("templateTitleInput");
const templateContentInputEl = document.getElementById("templateContentInput");
const templateSourceLabelEl = document.getElementById("templateSourceLabel");
const closeTemplateModalBtn = document.getElementById("closeTemplateModal");
const cancelTemplateModalBtn = document.getElementById("cancelTemplateModal");
const saveTemplateModalBtn = document.getElementById("saveTemplateModal");
const loginScreenEl = document.getElementById("loginScreen");
const appShellEl = document.getElementById("appShell");
const loginFormEl = document.getElementById("loginForm");
const loginUsernameEl = document.getElementById("loginUsername");
const loginPasswordEl = document.getElementById("loginPassword");
const loginStatusEl = document.getElementById("loginStatus");
const logoutBtn = document.getElementById("logoutBtn");
const sessionDisplayNameEl = document.getElementById("sessionDisplayName");
const sessionDisplayMetaEl = document.getElementById("sessionDisplayMeta");
const manageUsersBtn = document.getElementById("manageUsersBtn");
const saveAiSettingsBtn = document.getElementById("saveAiSettings");
const aiLockHintEl = document.getElementById("aiLockHint");
const aiPinnedNoticeEl = document.getElementById("aiPinnedNotice");
const aiAdminControlsEl = document.getElementById("aiAdminControls");
const signatureSectionEl = document.getElementById("signatureSection");
const clearFieldButtons = document.querySelectorAll(".clear-field-btn");
const undoFieldButtons = document.querySelectorAll(".undo-field-btn");
const examTitleEl = document.getElementById("examTitle");
const reportColumnWidthControlEl = document.getElementById("reportColumnWidthControl");
const reportColumnWidthValueEl = document.getElementById("reportColumnWidthValue");

const draftKey = "radiologiaLaudoDraft";
const customTemplatesKey = "radiologiaCustomTemplates";
const customTemplateListKey = "radiologiaCustomTemplateList";
let modelFetchInFlight = false;
let pendingTemplateFilename = "";

let customTemplateList = [];

function normalizeTemplatePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const source =
    payload.templates && typeof payload.templates === "object" ? payload.templates : payload;
  const normalized = {};
  ["ct", "mri"].forEach((mode) => {
    if (source[mode] && typeof source[mode] === "object") {
      normalized[mode] = source[mode];
    }
  });
  return Object.keys(normalized).length ? normalized : null;
}

function sanitizeMode(value) {
  return value === "mri" ? "mri" : value === "ct" ? "ct" : "";
}

function sanitizeRegion(value) {
  return value && regionLabels[value] ? value : "";
}

function normalizeTemplateTextValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).join("\n").trim();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function buildTemplateId(mode, region, title) {
  const slug = stripDiacritics((title || "").toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const unique = slug || Date.now().toString(36);
  return `custom:${mode}:${region}:${unique}`;
}

function normalizeTemplateEntry(entry, fallback = {}) {
  if (!entry || typeof entry !== "object") return null;
  const mode = sanitizeMode(entry.mode || fallback.mode);
  const region = sanitizeRegion(entry.region || fallback.region);
  if (!mode || !region) return null;

  const rawTitle = normalizeTemplateTextValue(entry.title || fallback.title);
  const title = rawTitle || `${mode === "ct" ? "TC" : "RM"} ${regionLabels[region] || region}`;
  const normalized = {
    id:
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id.trim()
        : buildTemplateId(mode, region, title),
    mode,
    region,
    title,
    technique: normalizeTemplateTextValue(entry.technique),
    findings: normalizeTemplateTextValue(entry.findings),
    impression: normalizeTemplateTextValue(entry.impression),
    sourceText: normalizeTemplateTextValue(entry.sourceText),
  };
  if (!(normalized.technique || normalized.findings || normalized.impression || normalized.sourceText)) {
    return null;
  }
  return normalized;
}

function templateMatchKey(entry) {
  return `${entry.mode}|${entry.region}|${normalizeToken(entry.title)}`;
}

function dedupeTemplateList(list) {
  const map = new Map();
  (list || []).forEach((entry) => {
    const normalized = normalizeTemplateEntry(entry);
    if (!normalized) return;
    map.set(templateMatchKey(normalized), normalized);
  });
  return Array.from(map.values());
}

function legacyTemplateMapToList(legacyMap) {
  const list = [];
  const normalized = normalizeTemplatePayload(legacyMap) || {};
  ["ct", "mri"].forEach((mode) => {
    const modeTemplates = normalized[mode];
    if (!modeTemplates) return;
    Object.keys(modeTemplates).forEach((region) => {
      if (region === "default") return;
      const template = modeTemplates[region];
      const entry = normalizeTemplateEntry(
        {
          mode,
          region,
          title: template.title || `${mode === "ct" ? "TC" : "RM"} ${regionLabels[region] || region}`,
          technique: template.technique || "",
          findings: template.findings || "",
          impression: template.impression || "",
          sourceText: template.sourceText || "",
        },
        { mode, region }
      );
      if (entry) list.push(entry);
    });
  });
  return list;
}

function listToLegacyTemplateMap(list) {
  const legacy = {};
  (list || []).forEach((entry) => {
    const normalized = normalizeTemplateEntry(entry);
    if (!normalized) return;
    if (!legacy[normalized.mode]) legacy[normalized.mode] = {};
    legacy[normalized.mode][normalized.region] = {
      title: normalized.title,
      technique: normalized.technique,
      findings: normalized.findings,
      impression: normalized.impression,
      sourceText: normalized.sourceText,
    };
  });
  return legacy;
}

function getStoredCustomTemplateList() {
  if (!window.localStorage) return [];

  const rawNew = window.localStorage.getItem(customTemplateListKey);
  if (rawNew) {
    try {
      const parsed = JSON.parse(rawNew);
      const arrayData = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.templates)
          ? parsed.templates
          : [];
      const deduped = dedupeTemplateList(arrayData);
      if (deduped.length) return deduped;
    } catch (err) {
      // segue para fallback
    }
  }

  const rawLegacy = window.localStorage.getItem(customTemplatesKey);
  if (!rawLegacy) return [];
  try {
    const parsedLegacy = JSON.parse(rawLegacy);
    const migrated = dedupeTemplateList(legacyTemplateMapToList(parsedLegacy));
    if (migrated.length) {
      saveStoredCustomTemplateList(migrated);
    }
    return migrated;
  } catch (err) {
    return [];
  }
}

function saveStoredCustomTemplateList(templateList) {
  if (!window.localStorage) return;
  const deduped = dedupeTemplateList(templateList);
  window.localStorage.setItem(customTemplateListKey, JSON.stringify(deduped));
  window.localStorage.setItem(customTemplatesKey, JSON.stringify(listToLegacyTemplateMap(deduped)));
}

async function fetchTemplatesFromServer() {
  const response = await fetch("/templates", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao carregar templates do servidor.");
  }
  const list = Array.isArray(data.templates) ? data.templates : [];
  return dedupeTemplateList(list);
}

async function upsertTemplateOnServer(templateEntry) {
  const response = await fetch("/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(templateEntry),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao salvar template no servidor.");
  }
  const normalized = normalizeTemplateEntry(data.template || templateEntry);
  if (!normalized) {
    throw new Error("Resposta inválida ao salvar template.");
  }
  return { template: normalized, created: !!data.created };
}

async function upsertTemplatesOnServer(templateEntries) {
  const response = await fetch("/templates/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templates: templateEntries }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao salvar templates em lote no servidor.");
  }
  const saved = Array.isArray(data.templates) ? dedupeTemplateList(data.templates) : [];
  return {
    templates: saved,
    created: Number(data.created || 0),
    updated: Number(data.updated || 0),
    invalid: Number(data.invalid || 0),
  };
}

function getSpecificTemplatesForSelection(mode, region) {
  return customTemplateList
    .filter((entry) => entry.mode === mode && entry.region === region)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function refreshSpecificTemplateOptions(preferredValue = "") {
  if (!specificTemplateSelect || !regionSelect) return;
  const selectedMode = state.mode;
  const selectedRegion = regionSelect.value || "cranio";
  const options = getSpecificTemplatesForSelection(selectedMode, selectedRegion);
  const previous = preferredValue || specificTemplateSelect.value;

  specificTemplateSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Modelo padrão da região";
  specificTemplateSelect.appendChild(defaultOption);

  options.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.title;
    specificTemplateSelect.appendChild(option);
  });

  if (previous && options.some((entry) => entry.id === previous)) {
    specificTemplateSelect.value = previous;
  } else {
    specificTemplateSelect.value = "";
  }
}

function updateTemplateStatus(templateList, warningMessage = "") {
  if (!templateStatusEl) return;
  const count = (templateList || []).length;
  if (!count) {
    templateStatusEl.textContent = warningMessage
      ? `Nenhum template personalizado carregado. ${warningMessage}`
      : "Nenhum template personalizado carregado.";
    return;
  }
  const titles = templateList
    .map((entry) => entry.title)
    .filter(Boolean)
    .slice(0, 3);
  const suffix = count > 3 ? " ..." : "";
  const titlesText = titles.length ? ` | ${titles.join(" | ")}${suffix}` : "";
  const warningText = warningMessage ? ` | ${warningMessage}` : "";
  templateStatusEl.textContent = `${count} template(s) personalizado(s) carregado(s).${titlesText}${warningText}`;
}

async function loadCustomTemplates() {
  const cachedLocal = window.localStorage ? getStoredCustomTemplateList() : [];
  let warning = "";

  try {
    const fromServer = await fetchTemplatesFromServer();
    customTemplateList = dedupeTemplateList(fromServer);

    // Migra cache local antigo para o servidor uma única vez quando necessário.
    if (cachedLocal.length) {
      const serverKeys = new Set(customTemplateList.map((entry) => templateMatchKey(entry)));
      const missing = cachedLocal.filter((entry) => !serverKeys.has(templateMatchKey(entry)));
      if (missing.length) {
        await upsertTemplatesOnServer(missing);
        customTemplateList = await fetchTemplatesFromServer();
      }
    }
  } catch (err) {
    customTemplateList = cachedLocal;
    warning = "Falha de sincronização com servidor; usando cache local deste navegador.";
  }

  saveStoredCustomTemplateList(customTemplateList);
  updateTemplateStatus(customTemplateList, warning);
  refreshSpecificTemplateOptions();
}

function isAdminUser() {
  return !!(state.currentUser && state.currentUser.role === "admin");
}

function isRadiologistUser() {
  return !!(state.currentUser && state.currentUser.role === "radiologist");
}

function getCurrentRadiologistSignature() {
  if (!isRadiologistUser()) {
    return {
      radiologistName: valueOf("radiologistName"),
      radiologistCrm: valueOf("radiologistCrm"),
      radiologistRole: valueOf("radiologistRole"),
      electronicSignature: checkedOf("electronicSignature"),
    };
  }

  return {
    radiologistName: state.currentUser.fullName || "",
    radiologistCrm: state.currentUser.crm || "",
    radiologistRole: state.currentUser.signatureRole || state.currentUser.subspecialty || "Radiologista",
    electronicSignature: true,
  };
}

function updateAiLockHint() {
  if (!aiLockHintEl) return;
  const settings = state.aiSettings || {};
  const providerLabel =
    settings.provider === "gemini"
      ? "Gemini"
      : settings.provider === "openai"
        ? "OpenAI compatível"
        : "LM Studio";
  const modelLabel = settings.model ? `Modelo: ${settings.model}` : "Modelo padrão ainda não definido";
  if (isAdminUser()) {
    aiLockHintEl.textContent = `Esta configuração é o padrão global para todos os radiologistas. ${providerLabel}. ${modelLabel}.`;
    if (aiPinnedNoticeEl) {
      aiPinnedNoticeEl.textContent =
        "A IA confirmada aqui permanece ativa para todos os usuários, mesmo após logout do administrador, até nova alteração.";
    }
    return;
  }
  aiLockHintEl.textContent = "Usando a IA padrão definida pelo administrador.";
}

function applyAiSettings(settings) {
  const normalized = settings || {};
  const provider = normalized.provider || "lmstudio";
  const model = normalized.model || "";
  const baseUrl = normalized.baseUrl || defaultBaseUrlForProvider(provider);
  state.aiSettings = { ...normalized, provider, model, baseUrl };

  if (aiProviderEl) aiProviderEl.value = provider;
  if (aiBaseUrlEl) {
    aiBaseUrlEl.value = baseUrl;
    aiBaseUrlEl.dataset.provider = provider;
  }
  if (aiModelEl) {
    setModelOptions(defaultModelsForProvider(provider), model);
    if (model) ensureModelOption(model);
    aiModelEl.dataset.provider = provider;
  }
  updateAiLockHint();
}

function updateRoleVisibility() {
  document.body.dataset.role = state.currentUser ? state.currentUser.role : "";
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isAdminUser());
  });
  if (signatureSectionEl) {
    signatureSectionEl.classList.toggle("hidden", !isAdminUser());
  }
  if (aiAdminControlsEl) {
    aiAdminControlsEl.classList.toggle("hidden", !isAdminUser());
  }
}

function showLoginScreen(message = "") {
  state.currentUser = null;
  if (loginScreenEl) loginScreenEl.classList.remove("hidden");
  if (appShellEl) appShellEl.classList.add("hidden");
  if (loginStatusEl) {
    loginStatusEl.textContent = message || "Informe seu login e senha.";
  }
}

function showAppShell(sessionData) {
  state.currentUser = sessionData && sessionData.user ? sessionData.user : null;
  if (sessionDisplayNameEl) {
    sessionDisplayNameEl.textContent =
      (state.currentUser && (state.currentUser.fullName || state.currentUser.username)) || "Usuário";
  }
  if (sessionDisplayMetaEl) {
    if (state.currentUser) {
      const roleLabel = state.currentUser.role === "admin" ? "Administrador" : "Radiologista";
      const crmText = state.currentUser.crm ? ` | CRM ${state.currentUser.crm}` : "";
      const specialtyText =
        state.currentUser.role === "radiologist" && state.currentUser.signatureRole
          ? ` | ${state.currentUser.signatureRole}`
          : "";
      sessionDisplayMetaEl.textContent = `${roleLabel}${crmText}${specialtyText}`;
    } else {
      sessionDisplayMetaEl.textContent = "";
    }
  }
  updateRoleVisibility();
  applyAiSettings((sessionData && sessionData.aiSettings) || {});
  if (loginScreenEl) loginScreenEl.classList.add("hidden");
  if (appShellEl) appShellEl.classList.remove("hidden");
}

async function fetchSessionState() {
  const response = await fetch("/session", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao consultar a sessão.");
  }
  return data;
}

async function refreshSessionState() {
  const sessionData = await fetchSessionState();
  if (sessionData && sessionData.authenticated) {
    showAppShell(sessionData);
    return sessionData;
  }
  showLoginScreen();
  return sessionData;
}

async function fetchPinnedAiSettingsForAdmin() {
  if (!isAdminUser()) return null;
  const response = await fetch("/admin/ai-settings", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao carregar a IA padrão confirmada.");
  }
  if (data.settings) {
    applyAiSettings(data.settings);
  }
  if (data.status) {
    updateGlobalKeyStatusLabel(data.status, data.settings && data.settings.provider);
  }
  return data;
}

async function submitLogin(username, password) {
  const response = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao autenticar.");
  }
  showAppShell(data);
  return data;
}

async function performLogout() {
  const response = await fetch("/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Falha ao encerrar a sessão.");
  }
  showLoginScreen("Sessão encerrada.");
}

function openUserManagementWindow() {
  window.open("/admin/users/manage", "cadastro-radiologistas", "width=1180,height=860,resizable=yes,scrollbars=yes");
}

function setMode(mode) {
  state.mode = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  refreshSpecificTemplateOptions();
  syncExamTitleField(true);
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;

  if (!themeToggleBtn) return;
  themeToggleBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  const textEl = themeToggleBtn.querySelector(".toggle-text");
  if (textEl) {
    textEl.textContent = theme === "dark" ? "Escuro" : "Claro";
  }
}

function initTheme() {
  const saved = window.localStorage.getItem(themeKey);
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }

  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function clampReportColumnWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 54;
  return Math.min(70, Math.max(46, Math.round(parsed)));
}

function applyReportColumnWidth(value) {
  const clamped = clampReportColumnWidth(value);
  document.documentElement.style.setProperty("--report-column-width", `${clamped}%`);
  if (reportColumnWidthControlEl) {
    reportColumnWidthControlEl.value = String(clamped);
  }
  if (reportColumnWidthValueEl) {
    reportColumnWidthValueEl.textContent = `${clamped}%`;
  }
  return clamped;
}

function initReportColumnWidth() {
  const saved = window.localStorage.getItem(reportColumnWidthKey);
  applyReportColumnWidth(saved || (reportColumnWidthControlEl ? reportColumnWidthControlEl.value : 54));
}

function getContrastLabel(mode, contrastKey) {
  if (mode === "ct") {
    if (contrastKey === "com") return "Com contraste intravenoso";
    if (contrastKey === "misto") return "Sem e com contraste intravenoso";
    return "Sem contraste intravenoso";
  }

  if (contrastKey === "com") return "Com gadolínio";
  if (contrastKey === "misto") return "Sem e com gadolínio";
  return "Sem gadolínio";
}

function formatDisplayDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  return raw;
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(match[1]) ||
    parsed.getMonth() !== Number(match[2]) - 1 ||
    parsed.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return parsed;
}

function formatCalculatedAge(years, months) {
  if (years < 0 || months < 0) return "";
  if (years === 0) {
    return `${months}M`;
  }
  if (months === 0) {
    return `${years}A`;
  }
  return `${years}A ${months}M`;
}

function calculatePatientAgeValue(birthDateValue, studyDateValue) {
  const birthDate = parseIsoDate(birthDateValue);
  if (!birthDate) return "";

  const referenceDate = parseIsoDate(studyDateValue) || new Date();
  if (referenceDate < birthDate) return "";

  let years = referenceDate.getFullYear() - birthDate.getFullYear();
  let months = referenceDate.getMonth() - birthDate.getMonth();
  const days = referenceDate.getDate() - birthDate.getDate();

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";

  return formatCalculatedAge(years, months);
}

function resolvePatientAge() {
  const birthDateValue = valueOf("patientBirthDate");
  const studyDateValue = valueOf("studyDate");
  const derived = calculatePatientAgeValue(birthDateValue, studyDateValue);
  if (derived) return derived;
  return birthDateValue ? "" : valueOf("patientAge");
}

function syncPatientAgeField() {
  const ageEl = document.getElementById("patientAge");
  if (!ageEl) return "";
  const derivedAge = resolvePatientAge();
  ageEl.value = derivedAge;
  return derivedAge;
}

function buildExamTitle(mode, regionKey) {
  const titles = {
    ct: {
      cranio: "TOMOGRAFIA COMPUTADORIZADA DO CRÂNIO",
      pescoco: "TOMOGRAFIA COMPUTADORIZADA DO PESCOÇO",
      torax: "TOMOGRAFIA COMPUTADORIZADA DO TÓRAX",
      abdomen: "TOMOGRAFIA COMPUTADORIZADA DO ABDOME",
      abdome_pelve: "TOMOGRAFIA COMPUTADORIZADA DE ABDOME E PELVE",
      coluna: "TOMOGRAFIA COMPUTADORIZADA DA COLUNA",
      pelve: "TOMOGRAFIA COMPUTADORIZADA DA PELVE",
      osteo: "TOMOGRAFIA COMPUTADORIZADA DO SEGMENTO ÓSTEO-ARTICULAR",
      vascular: "TOMOGRAFIA COMPUTADORIZADA VASCULAR",
    },
    mri: {
      cranio: "RESSONÂNCIA MAGNÉTICA DO CRÂNIO",
      pescoco: "RESSONÂNCIA MAGNÉTICA DO PESCOÇO",
      torax: "RESSONÂNCIA MAGNÉTICA DO TÓRAX",
      abdomen: "RESSONÂNCIA MAGNÉTICA DO ABDOME",
      abdome_pelve: "RESSONÂNCIA MAGNÉTICA DE ABDOME E PELVE",
      coluna: "RESSONÂNCIA MAGNÉTICA DA COLUNA",
      pelve: "RESSONÂNCIA MAGNÉTICA DA PELVE",
      osteo: "RESSONÂNCIA MAGNÉTICA DO SEGMENTO ÓSTEO-ARTICULAR",
      vascular: "RESSONÂNCIA MAGNÉTICA VASCULAR",
    },
  };
  return (titles[mode] && titles[mode][regionKey]) || `${mode === "ct" ? "TOMOGRAFIA COMPUTADORIZADA" : "RESSONÂNCIA MAGNÉTICA"} ${regionLabels[regionKey] || ""}`.trim();
}

function normalizeExamTitleValue(value, mode, regionKey) {
  const autoTitle = buildExamTitle(mode, regionKey);
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return autoTitle;

  const normalizedValue = stripDiacritics(cleanValue).toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedRegion = stripDiacritics(regionLabels[regionKey] || regionKey).toLowerCase();
  const normalizedAutoTitle = stripDiacritics(autoTitle).toLowerCase();
  const genericCandidates = new Set([
    normalizedAutoTitle,
    `tc ${normalizedRegion}`,
    `rm ${normalizedRegion}`,
    `tomografia ${normalizedRegion}`,
    `tomografia computadorizada ${normalizedRegion}`,
    `ressonancia ${normalizedRegion}`,
    `ressonancia magnetica ${normalizedRegion}`,
  ]);

  if (genericCandidates.has(normalizedValue)) {
    return autoTitle;
  }

  return cleanValue.toLocaleUpperCase("pt-BR");
}

function ensureFieldHistoryEntry(fieldId) {
  if (!state.fieldHistory[fieldId]) {
    state.fieldHistory[fieldId] = {
      undoStack: [],
      lastValue: "",
    };
  }
  return state.fieldHistory[fieldId];
}

function setFieldHistoryBaseline(fieldId, value) {
  const history = ensureFieldHistoryEntry(fieldId);
  history.undoStack = [];
  history.lastValue = String(value || "");
}

function setFieldValueWithHistory(fieldId, nextValue) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const history = ensureFieldHistoryEntry(fieldId);
  const normalizedNext = String(nextValue || "");
  if (field.value !== normalizedNext) {
    history.undoStack.push(field.value);
    if (history.undoStack.length > 200) {
      history.undoStack.shift();
    }
    field.value = normalizedNext;
  }
  history.lastValue = field.value;
}

function undoFieldValue(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const history = ensureFieldHistoryEntry(fieldId);
  if (!history.undoStack.length) return;
  field.value = history.undoStack.pop();
  history.lastValue = field.value;
  ensureReport();
}

function trackUndoHistory(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  setFieldHistoryBaseline(fieldId, field.value);
  field.addEventListener("input", () => {
    const history = ensureFieldHistoryEntry(fieldId);
    if (field.value === history.lastValue) return;
    history.undoStack.push(history.lastValue);
    if (history.undoStack.length > 200) {
      history.undoStack.shift();
    }
    history.lastValue = field.value;
  });
}

function resetTrackedFieldHistories(fieldIds = []) {
  fieldIds.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    setFieldHistoryBaseline(fieldId, field.value);
  });
}

function syncExamTitleField(force = false) {
  if (!examTitleEl) return buildExamTitle(state.mode, regionSelect ? regionSelect.value : "cranio");
  const regionKey = regionSelect ? regionSelect.value : "cranio";
  const normalizedTitle = normalizeExamTitleValue(force ? "" : examTitleEl.value, state.mode, regionKey);
  if (force || examTitleEl.value.trim() !== normalizedTitle) {
    setFieldValueWithHistory("examTitle", normalizedTitle);
  }
  return examTitleEl.value.trim() || buildExamTitle(state.mode, regionKey);
}

function buildTechnique(mode, regionKey, contrastKey) {
  const regionLabel = (regionLabels[regionKey] || regionKey).toLowerCase();
  const contrastLabel = getContrastLabel(mode, contrastKey).toLowerCase();

  if (mode === "ct") {
    return (
      "Aquisição helicoidal multislice de " +
      regionLabel +
      ", com cortes finos e reconstrução multiplanar, " +
      contrastLabel +
      "."
    );
  }

  return (
    "Sequências multiplanares ponderadas em T1, T2, FLAIR e DWI de " +
    regionLabel +
    ", " +
    contrastLabel +
    "."
  );
}

function applyTemplate() {
  const examTitleEl = document.getElementById("examTitle");
  const techniqueEl = document.getElementById("technique");
  const findingsEl = document.getElementById("findings");
  const impressionEl = document.getElementById("impression");

  const hasContent =
    techniqueEl.value.trim() ||
    findingsEl.value.trim() ||
    impressionEl.value.trim();

  if (hasContent) {
    const shouldReplace = window.confirm("Substituir os textos atuais pelo modelo?");
    if (!shouldReplace) return;
  }

  const regionKey = regionSelect.value;
  const selectedTemplateId = specificTemplateSelect ? specificTemplateSelect.value : "";
  const selectedTemplate = selectedTemplateId
    ? customTemplateList.find((entry) => entry.id === selectedTemplateId) || null
    : null;
  const defaultTemplate = templates[state.mode][regionKey] || templates[state.mode].default || {};
  const template =
    selectedTemplate && selectedTemplate.mode === state.mode && selectedTemplate.region === regionKey
      ? selectedTemplate
      : defaultTemplate;

  setFieldValueWithHistory(
    "technique",
    template.technique || buildTechnique(state.mode, regionKey, contrastSelect.value)
  );
  setFieldValueWithHistory("findings", template.findings || "");
  setFieldValueWithHistory("impression", template.impression || "");
  if (examTitleEl) {
    setFieldValueWithHistory("examTitle", buildExamTitle(state.mode, regionKey));
  }
}

function normalizeTemplateTitle(filename) {
  if (!filename) return "";
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  return withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractTemplateSections(text) {
  const content = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!content) {
    return { technique: "", findings: "", impression: "" };
  }

  const sections = { technique: "", findings: "", impression: "" };
  let current = null;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (current) sections[current] += "\n";
      continue;
    }
    const upper = line.toUpperCase();
    if (upper.includes("TÉCNICA") || upper.includes("TECNICA") || upper.startsWith("TECHNIQUE")) {
      current = "technique";
      continue;
    }
    if (
      upper.includes("ACHADOS") ||
      upper.includes("FINDINGS") ||
      upper.includes("ANÁLISE") ||
      upper.includes("ANALISE") ||
      upper.includes("DESCRI") ||
      upper.startsWith("LAUDO")
    ) {
      current = "findings";
      continue;
    }
    if (
      upper.includes("IMPRESSÃO") ||
      upper.includes("IMPRESSAO") ||
      upper.includes("CONCLUS") ||
      upper.includes("IMPRESSION")
    ) {
      current = "impression";
      continue;
    }
    if (current) {
      sections[current] += `${line}\n`;
    }
  }

  Object.keys(sections).forEach((key) => {
    sections[key] = sections[key].trim();
  });

  if (sections.technique || sections.findings || sections.impression) {
    return sections;
  }
  return { technique: "", findings: content, impression: "" };
}

function buildTemplateTextFromForm() {
  const technique = valueOf("technique");
  const findings = valueOf("findings");
  const impression = valueOf("impression");
  const parts = [];

  if (technique) {
    parts.push("TÉCNICA:");
    parts.push(technique);
    parts.push("");
  }
  if (findings) {
    parts.push("ANÁLISE:");
    parts.push(formatFindingsText(findings));
    parts.push("");
  }
  if (impression) {
    parts.push("IMPRESSÃO:");
    parts.push(impression);
  }

  return parts.join("\n").trim();
}

function createTemplateFromCurrentReport() {
  const content = buildTemplateTextFromForm();
  if (!content) {
    window.alert("Preencha técnica, laudo ou impressão antes de criar um template.");
    return;
  }

  const region = regionSelect ? regionSelect.value : "cranio";
  const modeLabel = state.mode === "ct" ? "TC" : "RM";
  const regionLabel = regionLabels[region] || region;
  const currentExamTitle = valueOf("examTitle");

  openTemplateModal({
    filename: currentExamTitle || `${modeLabel} ${regionLabel} - template`,
    mode: state.mode,
    region,
    text: content,
  });
  if (templateSourceLabelEl) {
    templateSourceLabelEl.textContent = "Template criado a partir do laudo digitado. Revise os campos antes de salvar.";
  }
}

function isTemplateModalOpen() {
  return templateModalEl && !templateModalEl.classList.contains("hidden");
}

function openTemplateModal({ filename, mode, region, text }) {
  if (!templateModalEl) return;
  const chosenMode = mode === "mri" ? "mri" : "ct";
  const chosenRegion = region && regionLabels[region] ? region : "cranio";
  const title = normalizeTemplateTitle(filename) || "Novo template";
  const content = (text || "").trim();

  pendingTemplateFilename = filename || "";
  if (templateModeSelectEl) templateModeSelectEl.value = chosenMode;
  if (templateRegionSelectEl) templateRegionSelectEl.value = chosenRegion;
  if (templateTitleInputEl) templateTitleInputEl.value = title;
  if (templateContentInputEl) templateContentInputEl.value = content;
  if (templateSourceLabelEl) {
    templateSourceLabelEl.textContent = filename
      ? `Arquivo: ${filename}. Ajuste modalidade, área, título e texto antes de salvar.`
      : "Revise e ajuste os dados antes de salvar.";
  }

  templateModalEl.classList.remove("hidden");
  document.body.classList.add("modal-open");
  if (templateTitleInputEl) templateTitleInputEl.focus();
}

function closeTemplateModal() {
  if (!templateModalEl) return;
  templateModalEl.classList.add("hidden");
  document.body.classList.remove("modal-open");
  pendingTemplateFilename = "";
}

async function extractTemplateTextFromFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/extract-template-text", {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data && data.detail ? ` ${data.detail}` : "";
    throw new Error((data && data.error) || `Falha ao ler arquivo.${detail}`);
  }
  return data;
}

function upsertCustomTemplate(entry) {
  const normalized = normalizeTemplateEntry(entry);
  if (!normalized) return { added: false, updated: false, entry: null };

  const lookupKey = templateMatchKey(normalized);
  const existingIndex = customTemplateList.findIndex((item) => templateMatchKey(item) === lookupKey);
  if (existingIndex >= 0) {
    const current = customTemplateList[existingIndex];
    customTemplateList[existingIndex] = {
      ...current,
      ...normalized,
      id: normalized.id || current.id,
    };
    return { added: false, updated: true, entry: customTemplateList[existingIndex] };
  }

  customTemplateList.push(normalized);
  return { added: true, updated: false, entry: normalized };
}

async function saveTemplateFromModal() {
  if (!templateModeSelectEl || !templateRegionSelectEl || !templateContentInputEl) return;

  const mode = templateModeSelectEl.value === "mri" ? "mri" : "ct";
  const region = templateRegionSelectEl.value || "cranio";
  const titleRaw = templateTitleInputEl ? templateTitleInputEl.value.trim() : "";
  const title = titleRaw || `${mode === "ct" ? "TC" : "RM"} ${regionLabels[region] || region}`;
  const content = templateContentInputEl.value.trim();

  if (!content) {
    window.alert("Informe o texto do laudo para salvar o template.");
    return;
  }

  const sections = extractTemplateSections(content);
  const payload = {
    mode,
    region,
    title,
    sourceText: content,
    technique: sections.technique || "",
    findings: sections.findings || "",
    impression: sections.impression || "",
  };

  let serverSaved = null;
  try {
    serverSaved = await upsertTemplateOnServer(payload);
  } catch (err) {
    window.alert(err.message || "Não foi possível salvar o template no servidor.");
    return;
  }

  const upsertResult = upsertCustomTemplate(serverSaved.template);
  if (!upsertResult.entry) {
    window.alert("Não foi possível atualizar a lista local de templates.");
    return;
  }

  saveStoredCustomTemplateList(customTemplateList);
  updateTemplateStatus(customTemplateList);
  refreshSpecificTemplateOptions(upsertResult.entry.id);

  const verb = serverSaved.created ? "salvo" : "atualizado";
  const sourceName = pendingTemplateFilename;
  closeTemplateModal();
  const src = sourceName ? ` (${sourceName})` : "";
  window.alert(`Template ${verb} com sucesso${src}.`);
}

async function importTemplatesFromJsonContent(text) {
  const parsed = JSON.parse(text);
  const normalized = normalizeTemplatePayload(parsed);
  if (!normalized) {
    throw new Error(
      "Formato inválido. Exemplo:\n{\n  \"ct\": {\"cranio\": {\"findings\": \"...\", \"impression\": \"...\"}},\n  \"mri\": {\"abdomen\": {\"findings\": \"...\"}}\n}"
    );
  }

  const entries = [];
  ["ct", "mri"].forEach((mode) => {
    const modeTemplates = normalized[mode];
    if (!modeTemplates) return;
    Object.keys(modeTemplates).forEach((region) => {
      const template = modeTemplates[region];
      const entry = normalizeTemplateEntry({
        mode,
        region,
        title: template.title || `${mode === "ct" ? "TC" : "RM"} ${regionLabels[region] || region}`,
        technique: template.technique || "",
        findings: template.findings || "",
        impression: template.impression || "",
        sourceText: template.sourceText || "",
      });
      if (entry) entries.push(entry);
    });
  });
  if (!entries.length) {
    throw new Error("Nenhum template válido encontrado no JSON.");
  }

  const savedResult = await upsertTemplatesOnServer(entries);
  customTemplateList = await fetchTemplatesFromServer();
  saveStoredCustomTemplateList(customTemplateList);
  updateTemplateStatus(customTemplateList);
  refreshSpecificTemplateOptions();
  return { added: savedResult.created, updated: savedResult.updated, invalid: savedResult.invalid };
}

async function handleTemplateFileImport(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!extension) {
    throw new Error("Arquivo sem extensão identificável.");
  }

  if (extension === "json") {
    const text = await file.text();
    const result = await importTemplatesFromJsonContent(text);
    const invalidInfo = result.invalid ? `, ${result.invalid} inválido(s)` : "";
    window.alert(
      `Templates importados com sucesso: ${result.added} novo(s), ${result.updated} atualizado(s)${invalidInfo}.`
    );
    return;
  }

  if (!["txt", "doc", "docx", "pdf"].includes(extension)) {
    throw new Error("Formato não suportado. Use .txt, .doc, .docx, .pdf ou .json.");
  }

  const extracted = await extractTemplateTextFromFile(file);
  openTemplateModal({
    filename: extracted.filename || file.name,
    mode: state.mode,
    region: regionSelect.value,
    text: extracted.text || "",
  });
}

function setAiStatus(text, statusClass) {
  if (!aiStatusEl) return;
  aiStatusEl.textContent = text;
  aiStatusEl.classList.remove("idle", "live", "warn");
  if (statusClass) aiStatusEl.classList.add(statusClass);
}

function isExternalProvider(provider) {
  return provider === "openai" || provider === "gemini";
}

function updateGlobalKeyStatusLabel(status, provider) {
  if (!globalKeyStatusEl) return;
  const selectedProvider = provider || (aiProviderEl ? aiProviderEl.value : "");
  if (!isExternalProvider(selectedProvider)) {
    globalKeyStatusEl.textContent = "Status da chave global: não aplicável para LM Studio local.";
    return;
  }

  const configured =
    selectedProvider === "openai"
      ? !!(status && status.openaiConfigured)
      : !!(status && status.geminiConfigured);
  globalKeyStatusEl.textContent = configured
    ? "Status da chave global: configurada no servidor."
    : "Status da chave global: não configurada para este provedor.";
}

async function fetchGlobalApiKeyStatus() {
  if (!globalKeyStatusEl) return null;
  if (!isAdminUser()) {
    globalKeyStatusEl.textContent = "";
    return null;
  }
  try {
    const response = await fetch("/api-keys/status", { method: "GET" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data && data.error) || "Falha ao consultar status da chave global.");
    }
    updateGlobalKeyStatusLabel(data);
    return data;
  } catch (err) {
    globalKeyStatusEl.textContent = "Status da chave global: indisponível (erro de comunicação).";
    return null;
  }
}

async function saveGlobalApiKey() {
  if (!aiProviderEl || !aiApiKeyEl) return;
  const provider = aiProviderEl.value;
  if (!isExternalProvider(provider)) {
    window.alert("Chave global é necessária apenas para provedores externos (OpenAI/Gemini).");
    return;
  }

  const apiKey = aiApiKeyEl.value.trim();
  if (!apiKey) {
    window.alert("Cole a API key antes de salvar globalmente.");
    return;
  }

  if (saveApiKeyBtn) {
    saveApiKeyBtn.disabled = true;
    saveApiKeyBtn.textContent = "Salvando...";
  }

  try {
    const response = await fetch("/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data && data.error) || "Falha ao salvar API key global.");
    }
    aiApiKeyEl.value = "";
    updateGlobalKeyStatusLabel(data.status || null, provider);
    window.alert("API key salva globalmente no servidor.");
  } catch (err) {
    window.alert(err.message || "Erro ao salvar API key global.");
  } finally {
    if (saveApiKeyBtn) {
      saveApiKeyBtn.disabled = false;
      saveApiKeyBtn.textContent = "Salvar global";
    }
  }
}

function saveAiPrefs() {
  return;
}

function loadAiPrefs() {
  return;
}

function setModelOptions(models, selected) {
  if (!aiModelEl) return;
  const previous = selected || aiModelEl.value;
  aiModelEl.innerHTML = "";
  models.forEach((modelId) => {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    aiModelEl.appendChild(option);
  });
  if (previous && models.includes(previous)) {
    aiModelEl.value = previous;
  } else if (models.length) {
    aiModelEl.value = models[0];
  }
}

function ensureModelOption(value) {
  if (!aiModelEl || !value) return;
  const exists = Array.from(aiModelEl.options).some((opt) => opt.value === value);
  if (!exists) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    aiModelEl.appendChild(option);
  }
  aiModelEl.value = value;
}

function defaultModelsForProvider(provider) {
  if (provider === "lmstudio") {
    return [];
  }
  if (provider === "gemini") {
    return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];
  }
  return ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"];
}

function defaultBaseUrlForProvider(provider) {
  if (provider === "lmstudio") return "http://localhost:1234/v1";
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta/openai";
  return "https://api.openai.com/v1";
}

function updateAiDefaults() {
  if (!aiProviderEl || !aiBaseUrlEl || !aiModelEl) return;
  const provider = aiProviderEl.value;
  const defaultUrl = defaultBaseUrlForProvider(provider);
  if (aiBaseUrlEl.dataset.provider !== provider) {
    aiBaseUrlEl.value = defaultUrl;
    aiBaseUrlEl.dataset.provider = provider;
  } else if (!aiBaseUrlEl.value.trim()) {
    aiBaseUrlEl.value = defaultUrl;
  }
  if (aiModelEl.dataset.provider !== provider) {
    setModelOptions(defaultModelsForProvider(provider));
    aiModelEl.dataset.provider = provider;
  } else if (!aiModelEl.options.length) {
    setModelOptions(defaultModelsForProvider(provider));
  }
  if (!aiModelEl.value.trim() && provider !== "lmstudio") {
    const fallback = provider === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini";
    ensureModelOption(fallback);
  }
}

async function saveDefaultAiSettings() {
  if (!isAdminUser()) return;
  if (!aiProviderEl || !aiModelEl || !aiBaseUrlEl) return;

  const provider = aiProviderEl.value;
  const model = aiModelEl.value.trim();
  const baseUrl = aiBaseUrlEl.value.trim() || defaultBaseUrlForProvider(provider);

  if (!model) {
    window.alert("Informe o modelo padrão que será usado pelos radiologistas.");
    return;
  }

  if (saveAiSettingsBtn) {
    saveAiSettingsBtn.disabled = true;
    saveAiSettingsBtn.textContent = "Salvando...";
  }

  try {
    const response = await fetch("/admin/ai-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, baseUrl }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data && data.error) || "Falha ao salvar configuração padrão de IA.");
    }
    applyAiSettings(data.settings || { provider, model, baseUrl });
    updateGlobalKeyStatusLabel(data.status || null, provider);
    window.alert("Configuração padrão da IA salva para todos os radiologistas.");
  } catch (err) {
    window.alert(err.message || "Não foi possível salvar a configuração padrão da IA.");
  } finally {
    if (saveAiSettingsBtn) {
      saveAiSettingsBtn.disabled = false;
      saveAiSettingsBtn.textContent = "Confirmar IA padrão";
    }
  }
}

async function fetchModels() {
  if (!refreshModelsBtn || !aiModelEl) return;
  if (!isAdminUser()) return;
  if (modelFetchInFlight) return;
  const provider = aiProviderEl.value;
  const baseUrl = aiBaseUrlEl.value.trim();
  const apiKey = aiApiKeyEl.value.trim();

  modelFetchInFlight = true;
  refreshModelsBtn.disabled = true;
  const originalText = refreshModelsBtn.textContent;
  refreshModelsBtn.textContent = "Buscando...";
  setAiStatus("Carregando modelos...", "live");

  try {
    const response = await fetch("/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        baseUrl,
        apiKey,
        loadedOnly: provider === "lmstudio",
      }),
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(
        `Resposta inesperada do servidor (status ${response.status}). Conteúdo: ${text.slice(0, 120)}`
      );
    }

    if (!response.ok) {
      const detail = data.detail ? ` Detalhe: ${JSON.stringify(data.detail)}` : "";
      throw new Error((data.error || "Falha ao buscar modelos.") + detail);
    }

    const models = Array.isArray(data.models) ? data.models : [];
    if (!models.length) {
      if (data.warning) {
        setAiStatus(data.warning, "warn");
      } else {
        setAiStatus("Modelos não encontrados", "warn");
      }
      return;
    }
    setModelOptions(models);
    if (data.warning) {
      setAiStatus(data.warning, "warn");
    } else {
      setAiStatus(`${models.length} modelos carregados`, "live");
    }
    saveAiPrefs();
  } catch (err) {
    setAiStatus("Erro ao listar modelos", "warn");
    window.alert(err.message || "Erro ao buscar modelos.");
  } finally {
    refreshModelsBtn.disabled = false;
    refreshModelsBtn.textContent = originalText;
    modelFetchInFlight = false;
  }
}

function autoFetchModelsIfNeeded() {
  if (!aiProviderEl || !aiModelEl) return;
  if (!isAdminUser()) return;
  if (aiProviderEl.value !== "lmstudio") return;
  if (aiModelEl.options.length === 0) {
    fetchModels();
  }
}

async function generateWithAi() {
  if (!generateAiBtn) return;
  const provider = isAdminUser() ? aiProviderEl.value : (state.aiSettings && state.aiSettings.provider) || "lmstudio";
  const model = isAdminUser()
    ? aiModelEl.value.trim()
    : ((state.aiSettings && state.aiSettings.model) || "").trim();
  const baseUrl = isAdminUser()
    ? aiBaseUrlEl.value.trim()
    : ((state.aiSettings && state.aiSettings.baseUrl) || "").trim();
  const apiKey = isAdminUser() ? aiApiKeyEl.value.trim() : "";

  if (!model) {
    window.alert("Informe o modelo de IA.");
    return;
  }

  generateAiBtn.disabled = true;
  generateAiBtn.textContent = "Gerando...";
  setAiStatus("Gerando...", "live");

  const payload = {
    mode: state.mode,
    region: regionSelect.value,
    contrast: contrastSelect.value,
    requestPrompt: aiRequestEl ? aiRequestEl.value.trim() : "",
    dictation: {
      indication: valueOf("indication"),
      extraInfo: valueOf("extraInfo"),
      technique: valueOf("technique"),
      findings: valueOf("findings"),
      impression: valueOf("impression"),
    },
  };

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        model,
        baseUrl,
        apiKey,
        payload,
      }),
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(
        `Resposta inesperada do servidor (status ${response.status}). Conteúdo: ${text.slice(0, 200)}`
      );
    }

    if (!response.ok) {
      const detail = data.detail ? ` Detalhe: ${JSON.stringify(data.detail)}` : "";
      throw new Error((data.error || "Falha ao gerar laudo.") + detail);
    }

    const resolvedMode = sanitizeMode(data && data.resolvedMode ? data.resolvedMode : "");
    const resolvedRegion = sanitizeRegion(data && data.resolvedRegion ? data.resolvedRegion : "");

    if (resolvedMode && resolvedMode !== state.mode) {
      setMode(resolvedMode);
    }
    if (resolvedRegion && regionSelect && regionSelect.value !== resolvedRegion) {
      regionSelect.value = resolvedRegion;
      refreshSpecificTemplateOptions();
    }

    const normalizedSections = normalizeAiSectionsPayload(data);
    document.getElementById("technique").value = normalizedSections.technique || "";
    document.getElementById("findings").value = formatFindingsText(normalizedSections.findings || "");
    document.getElementById("impression").value = normalizedSections.impression || "";

    ensureReport();
    setAiStatus("Pronto", "live");
    saveAiPrefs();
  } catch (err) {
    setAiStatus("Erro", "warn");
    window.alert(err.message || "Erro ao gerar laudo.");
  } finally {
    generateAiBtn.disabled = false;
    generateAiBtn.textContent = "Gerar com IA";
  }
}

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function checkedOf(id) {
  const field = document.getElementById(id);
  return !!(field && "checked" in field && field.checked);
}

function tryParseJsonFromText(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [];
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());
  candidates.push(trimmed);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      // tenta bloco entre chaves
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (parsed && typeof parsed === "object") return parsed;
      } catch (err) {
        // ignora
      }
    }
  }
  return null;
}

function extractAiSectionsFromJsonLikeText(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const text = fence && fence[1] ? fence[1].trim() : trimmed;
  if (!text) return null;

  const keyRegex =
    /"?(technique|tecnica|técnica|findings|laudo|achados|impression|impressao|impressão)"?\s*:/gi;
  const matches = Array.from(text.matchAll(keyRegex));
  if (!matches.length) return null;

  const out = { technique: "", findings: "", impression: "" };
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const rawKey = (current[1] || "").toLowerCase();
    const valueStart = current.index + current[0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    let rawValue = text.slice(valueStart, valueEnd).trim();

    rawValue = rawValue.replace(/^[\s:]+/, "").replace(/,\s*$/, "").replace(/}\s*$/, "").trim();
    const quoted = rawValue.match(/^"([\s\S]*)"$/);
    let parsedValue = quoted ? quoted[1] : rawValue;
    parsedValue = parsedValue
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .trim();
    if (!parsedValue) continue;

    if (["technique", "tecnica", "técnica"].includes(rawKey)) out.technique = parsedValue;
    if (["findings", "laudo", "achados"].includes(rawKey)) out.findings = parsedValue;
    if (["impression", "impressao", "impressão"].includes(rawKey)) out.impression = parsedValue;
  }

  if (out.technique || out.findings || out.impression) return out;
  return null;
}

function extractAiField(parsed, aliases) {
  if (!parsed || typeof parsed !== "object") return "";
  const keys = Object.keys(parsed);
  for (const alias of aliases) {
    const found = keys.find((key) => key.toLowerCase() === alias);
    if (found !== undefined && parsed[found] !== undefined && parsed[found] !== null) {
      return String(parsed[found]).trim();
    }
  }
  return "";
}

function normalizeAiSectionsPayload(data) {
  const output = {
    technique: data && data.technique ? String(data.technique).trim() : "",
    findings:
      data && data.laudo !== undefined
        ? String(data.laudo || "").trim()
        : data && data.findings !== undefined
          ? String(data.findings || "").trim()
          : "",
    impression: data && data.impression ? String(data.impression).trim() : "",
  };

  const blobCandidates = [output.findings, output.impression, output.technique].filter(Boolean);
  for (const blob of blobCandidates) {
    const parsed = tryParseJsonFromText(blob);
    const parsedSections = parsed
      ? {
          technique: extractAiField(parsed, ["technique", "tecnica", "técnica"]),
          findings: extractAiField(parsed, ["findings", "laudo", "achados", "report", "descricao", "descrição"]),
          impression: extractAiField(parsed, ["impression", "impressao", "impressão", "conclusion", "conclusao", "conclusão"]),
        }
      : extractAiSectionsFromJsonLikeText(blob);
    if (!parsedSections) continue;
    const parsedTechnique = parsedSections.technique || "";
    const parsedFindings = parsedSections.findings || "";
    const parsedImpression = parsedSections.impression || "";
    if (!output.technique && parsedTechnique) output.technique = parsedTechnique;
    if (!output.findings && parsedFindings) output.findings = parsedFindings;
    if (!output.impression && parsedImpression) output.impression = parsedImpression;
  }

  return output;
}

function formatFindingsText(text) {
  if (!text) return "";
  const raw =
    typeof text === "string"
      ? text
      : Array.isArray(text)
        ? text.join(" ")
        : text && typeof text === "object"
          ? JSON.stringify(text)
          : String(text);
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/([.!?])\s+/g, "$1\n"))
    .join("\n");
  return lines.replace(/\n{2,}/g, "\n").trim();
}

function buildReport() {
  const lines = [];
  const examTitle = syncExamTitleField();
  const patientName = valueOf("patientName");
  const patientId = valueOf("patientId");
  const patientAge = syncPatientAgeField();
  const studyDate = formatDisplayDate(valueOf("studyDate"));
  const birthDate = formatDisplayDate(valueOf("patientBirthDate"));
  const referrer = valueOf("referrer");
  const indication = valueOf("indication");
  const extraInfo = valueOf("extraInfo");
  const technique = valueOf("technique");
  const findings = valueOf("findings");
  const impression = valueOf("impression");
  const signature = getCurrentRadiologistSignature();
  const radiologistName = signature.radiologistName;
  const radiologistCrm = signature.radiologistCrm;
  const radiologistRole = signature.radiologistRole;
  const electronicSignature = signature.electronicSignature;

  lines.push(examTitle);
  lines.push("");

  if (patientName) lines.push("Paciente: " + patientName);
  if (studyDate) lines.push("Data do Exame: " + studyDate);
  if (referrer) lines.push("Médico solicitante: " + referrer);
  if (patientId) lines.push("Same: " + patientId);
  if (patientAge) lines.push("Idade: " + patientAge);
  if (birthDate) lines.push("Data de Nascimento: " + birthDate);
  lines.push("");

  if (indication) {
    lines.push("INDICAÇÃO CLÍNICA:");
    lines.push(indication);
    lines.push("");
  }
  if (extraInfo) {
    lines.push("INFORMAÇÕES ADICIONAIS:");
    lines.push(extraInfo);
    lines.push("");
  }
  if (technique) {
    lines.push("Técnica:");
    lines.push(technique);
    lines.push("");
  }
  if (findings) {
    lines.push("Análise:");
    lines.push(formatFindingsText(findings));
    lines.push("");
  }
  if (impression) {
    lines.push("Impressão diagnóstica:");
    lines.push(impression);
    lines.push("");
  }
  if (radiologistName || radiologistCrm) {
    lines.push(electronicSignature ? "Assinatura eletrônica:" : "Radiologista responsável:");
    if (radiologistName) lines.push(`Dr(a).: ${radiologistName}`);
    if (radiologistRole) lines.push(radiologistRole);
    if (radiologistCrm) lines.push(`CRM ${radiologistCrm}`);
  }

  return lines.join("\n");
}

function ensureReport() {
  const report = buildReport();
  reportOutputEl.textContent = report.trim() ? report : "Seu laudo aparecerá aqui.";
  return report;
}

function collectReportPayload(existingId = "") {
  const signature = getCurrentRadiologistSignature();
  return {
    id: existingId || state.currentReportId || "",
    mode: state.mode,
    region: regionSelect.value,
    contrast: contrastSelect.value,
    status: "finalized",
    finalText: ensureReport(),
    fields: {
      examTitle: syncExamTitleField(),
      patientName: valueOf("patientName"),
      patientId: valueOf("patientId"),
      patientAge: syncPatientAgeField(),
      patientSex: valueOf("patientSex"),
      studyDate: valueOf("studyDate"),
      patientBirthDate: valueOf("patientBirthDate"),
      referrer: valueOf("referrer"),
      radiologistName: signature.radiologistName,
      radiologistCrm: signature.radiologistCrm,
      radiologistRole: signature.radiologistRole,
      electronicSignature: signature.electronicSignature,
      indication: valueOf("indication"),
      extraInfo: valueOf("extraInfo"),
      aiRequest: aiRequestEl ? aiRequestEl.value.trim() : "",
      technique: valueOf("technique"),
      findings: valueOf("findings"),
      impression: valueOf("impression"),
    },
  };
}

async function fetchSavedReports() {
  const response = await fetch("/reports?limit=20", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao carregar laudos salvos.");
  }
  return Array.isArray(data.reports) ? data.reports : [];
}

async function saveFinalReportOnServer(payload) {
  const response = await fetch("/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao salvar laudo finalizado.");
  }
  return data.report || null;
}

function updateSavedReportsStatus(message) {
  if (savedReportsStatusEl) {
    savedReportsStatusEl.textContent = message;
  }
}

function formatSavedReportMeta(report) {
  const parts = [];
  if (report && report.regionLabel) parts.push(report.regionLabel);
  if (report && report.contrastLabel) parts.push(report.contrastLabel);
  const studyDate =
    report && report.fields && typeof report.fields.studyDate === "string"
      ? formatDisplayDate(report.fields.studyDate.trim())
      : "";
  if (studyDate) parts.push(studyDate);
  return parts.join(" | ");
}

function populateFormFromSavedReport(report) {
  if (!report || !report.fields) return;

  state.currentReportId = report.id || "";
  setMode(report.mode || "ct");
  regionSelect.value = report.region || "cranio";
  contrastSelect.value = report.contrast || "sem";
  refreshSpecificTemplateOptions();

  const fields = report.fields || {};
  Object.keys(fields).forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    if (isRadiologistUser() && ["radiologistName", "radiologistCrm", "radiologistRole", "electronicSignature"].includes(key)) {
      return;
    }
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = !!fields[key];
      return;
    }
    el.value = fields[key] || "";
  });

  resetTrackedFieldHistories(["examTitle", "technique", "findings", "impression"]);
  syncExamTitleField(false);
  syncPatientAgeField();
  ensureReport();
}

function renderSavedReports() {
  if (!savedReportsListEl) return;
  savedReportsListEl.innerHTML = "";

  if (!state.savedReports.length) {
    updateSavedReportsStatus("Nenhum laudo finalizado salvo ainda.");
    return;
  }

  updateSavedReportsStatus(`${state.savedReports.length} laudo(s) finalizado(s) carregado(s) do banco.`);

  state.savedReports.forEach((report) => {
    const card = document.createElement("article");
    card.className = "saved-report-item";

    const title = document.createElement("h3");
    const patientName =
      report && report.fields && typeof report.fields.patientName === "string"
        ? report.fields.patientName.trim()
        : "";
    const examTitle =
      report && report.fields && typeof report.fields.examTitle === "string"
        ? report.fields.examTitle.trim()
        : "";
    title.textContent =
      patientName || examTitle || `${report.mode === "mri" ? "RM" : "TC"} ${report.regionLabel || ""}`.trim();

    const meta = document.createElement("p");
    meta.className = "saved-report-meta";
    meta.textContent = formatSavedReportMeta(report) || "Laudo salvo sem metadados adicionais.";

    const updated = document.createElement("p");
    updated.className = "saved-report-meta";
    updated.textContent = `Atualizado em: ${new Date(report.updatedAt).toLocaleString("pt-BR")}`;

    const actions = document.createElement("div");
    actions.className = "saved-report-actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "btn ghost btn-small";
    loadBtn.textContent = "Carregar";
    loadBtn.addEventListener("click", () => {
      populateFormFromSavedReport(report);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const pdfBtn = document.createElement("button");
    pdfBtn.type = "button";
    pdfBtn.className = "btn btn-small";
    pdfBtn.textContent = "PDF";
    pdfBtn.addEventListener("click", () => {
      downloadReportPdf(report).catch((err) => {
        window.alert(err.message || "Não foi possível exportar o PDF do laudo salvo.");
      });
    });

    actions.appendChild(loadBtn);
    actions.appendChild(pdfBtn);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(updated);
    card.appendChild(actions);
    savedReportsListEl.appendChild(card);
  });
}

async function loadSavedReports() {
  try {
    state.savedReports = await fetchSavedReports();
    renderSavedReports();
  } catch (err) {
    state.savedReports = [];
    renderSavedReports();
    updateSavedReportsStatus(err.message || "Falha ao carregar laudos salvos.");
  }
}

async function saveFinalReport() {
  const payload = collectReportPayload();
  if (!payload.finalText.trim()) {
    window.alert("Gere o laudo antes de salvar.");
    return;
  }

  if (saveFinalReportBtn) {
    saveFinalReportBtn.disabled = true;
    saveFinalReportBtn.textContent = "Salvando...";
  }

  try {
    const report = await saveFinalReportOnServer(payload);
    state.currentReportId = report && report.id ? report.id : state.currentReportId;
    window.alert("Laudo finalizado salvo no banco.");
    await loadSavedReports();
    if (report) {
      const sameIndex = state.savedReports.findIndex((item) => item.id === report.id);
      if (sameIndex >= 0) {
        state.savedReports[sameIndex] = report;
        renderSavedReports();
      }
    }
  } catch (err) {
    window.alert(err.message || "Não foi possível salvar o laudo.");
  } finally {
    if (saveFinalReportBtn) {
      saveFinalReportBtn.disabled = false;
      saveFinalReportBtn.textContent = "Salvar finalizado";
    }
  }
}

async function downloadReportPdf(payload = null) {
  const reportPayload = payload || collectReportPayload();
  const response = await fetch("/reports/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reportPayload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data && data.error) || "Falha ao gerar PDF.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch && filenameMatch[1] ? filenameMatch[1] : "laudo_radiologia.pdf";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function clearForm() {
  [
    "patientName",
    "patientId",
    "patientAge",
    "patientSex",
    "studyDate",
    "patientBirthDate",
    "referrer",
    "indication",
    "extraInfo",
    "examTitle",
    "technique",
    "findings",
    "impression",
    "aiRequest",
  ].forEach((fieldId) => {
    const element = document.getElementById(fieldId);
    if (!element) return;
    if (["examTitle", "technique", "findings", "impression", "aiRequest"].includes(fieldId)) {
      setFieldValueWithHistory(fieldId, "");
      return;
    }
    element.value = "";
  });
  if (isAdminUser()) {
    ["radiologistName", "radiologistCrm", "radiologistRole"].forEach((fieldId) => {
      const element = document.getElementById(fieldId);
      if (!element) return;
      element.value = "";
    });
  }
  const electronicSignatureEl = document.getElementById("electronicSignature");
  if (isAdminUser() && electronicSignatureEl instanceof HTMLInputElement) {
    electronicSignatureEl.checked = true;
  }
  syncExamTitleField(true);
  syncPatientAgeField();
  reportOutputEl.textContent = "Seu laudo aparecerá aqui.";
  state.currentReportId = "";
}

function saveDraft() {
  const signature = getCurrentRadiologistSignature();
  const data = {
    mode: state.mode,
    region: regionSelect.value,
    contrast: contrastSelect.value,
    fields: {
      examTitle: syncExamTitleField(),
      patientName: valueOf("patientName"),
      patientId: valueOf("patientId"),
      patientAge: syncPatientAgeField(),
      patientSex: valueOf("patientSex"),
      studyDate: valueOf("studyDate"),
      patientBirthDate: valueOf("patientBirthDate"),
      referrer: valueOf("referrer"),
      radiologistName: signature.radiologistName,
      radiologistCrm: signature.radiologistCrm,
      radiologistRole: signature.radiologistRole,
      electronicSignature: signature.electronicSignature,
      indication: valueOf("indication"),
      extraInfo: valueOf("extraInfo"),
      aiRequest: aiRequestEl ? aiRequestEl.value.trim() : "",
      technique: valueOf("technique"),
      findings: valueOf("findings"),
      impression: valueOf("impression"),
    },
  };

  window.localStorage.setItem(draftKey, JSON.stringify(data));
  window.alert("Rascunho salvo.");
}

function loadDraft() {
  const raw = window.localStorage.getItem(draftKey);
  if (!raw) {
    window.alert("Nenhum rascunho encontrado.");
    return;
  }

  const data = JSON.parse(raw);
  state.currentReportId = "";
  setMode(data.mode || "ct");
  regionSelect.value = data.region || "cranio";
  contrastSelect.value = data.contrast || "sem";
  refreshSpecificTemplateOptions();

  const fields = data.fields || {};
  Object.keys(fields).forEach((key) => {
    const el = document.getElementById(key);
    if (!el) return;
    if (isRadiologistUser() && ["radiologistName", "radiologistCrm", "radiologistRole", "electronicSignature"].includes(key)) {
      return;
    }
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = !!fields[key];
      return;
    }
    el.value = fields[key];
  });

  resetTrackedFieldHistories(["examTitle", "technique", "findings", "impression"]);
  syncExamTitleField(false);
  syncPatientAgeField();
  ensureReport();
}

function shouldCapitalizeNext(prefix) {
  const trimmed = prefix.replace(/\s+$/u, "");
  if (!trimmed) return true;
  const lastChar = trimmed[trimmed.length - 1];
  return /[.!?\n]/.test(lastChar);
}

function stripDiacritics(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normalizeToken(token) {
  return stripDiacritics(token.toLowerCase());
}

function capitalizeFirstLetter(word) {
  const chars = [...word];
  for (let i = 0; i < chars.length; i += 1) {
    if (/\p{L}/u.test(chars[i])) {
      chars[i] = chars[i].toLocaleUpperCase("pt-BR");
      return chars.join("");
    }
  }
  return word;
}

function appendWord(output, word, capitalizeNext) {
  const hasLetter = /\p{L}/u.test(word);
  const finalWord = capitalizeNext && hasLetter ? capitalizeFirstLetter(word) : word;
  const spacer = output && !/\s$/.test(output) ? " " : "";
  return {
    text: output + spacer + finalWord,
    capitalizeNext: hasLetter ? false : capitalizeNext,
  };
}

function removeLastWord(text) {
  let trimmed = text.replace(/[ \t]+$/g, "");
  trimmed = trimmed.replace(/\n+$/g, "");
  return trimmed.replace(/\s*\S+$/u, "");
}

function appendPunctuation(text, punctuation) {
  return text.replace(/[ \t]+$/g, "") + punctuation;
}

function applyVoiceCommands(baseText, dictationText) {
  let output = baseText;
  let capitalizeNext = shouldCapitalizeNext(output);
  const raw = dictationText.trim();
  if (!raw) return output;

  const tokens = raw.split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const normalized = normalizeToken(token);
    const nextToken = tokens[i + 1] ? normalizeToken(tokens[i + 1]) : "";

    if (normalized === "apagar") {
      output = removeLastWord(output);
      capitalizeNext = shouldCapitalizeNext(output);
      continue;
    }

    if (normalized === "ponto") {
      output = appendPunctuation(output, ".");
      capitalizeNext = true;
      continue;
    }

    if (normalized === "proxima" && nextToken === "linha") {
      output = output.replace(/[ \t]+$/g, "");
      output = output.endsWith("\n") ? output : output + "\n";
      capitalizeNext = true;
      i += 1;
      continue;
    }

    const appended = appendWord(output, token, capitalizeNext);
    output = appended.text;
    capitalizeNext = appended.capitalizeNext;
  }

  return output;
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speechSupportEl.textContent = "Não suportado";
    speechSupportEl.classList.add("warn");
    speechHintEl.textContent = "Use Chrome ou Edge para ditado por voz.";
    micButtons.forEach((btn) => (btn.disabled = true));
    return;
  }

  speechSupportEl.textContent = "Disponível";
  speechSupportEl.classList.add("live");

  state.recognition = new SpeechRecognition();
  state.recognition.lang = "pt-BR";
  state.recognition.interimResults = true;
  state.recognition.continuous = true;
  state.recognition.maxAlternatives = 1;

  state.recognition.onstart = () => {
    state.isRecognizing = true;
    micStatusEl.textContent = "Ouvindo";
    micStatusEl.classList.remove("idle", "warn");
    micStatusEl.classList.add("live");
  };

  state.recognition.onerror = (event) => {
    micStatusEl.textContent = "Erro: " + event.error;
    micStatusEl.classList.remove("live");
    micStatusEl.classList.add("warn");
  };

  state.recognition.onend = () => {
    state.isRecognizing = false;
    micStatusEl.textContent = "Inativo";
    micStatusEl.classList.remove("live", "warn");
    micStatusEl.classList.add("idle");
    state.finalText = "";

    if (state.pendingStart) {
      const next = state.pendingStart;
      state.pendingStart = null;
      startDictation(next.targetId, next.label);
    }
  };

  state.recognition.onresult = (event) => {
    if (!state.activeTargetId) return;
    const target = document.getElementById(state.activeTargetId);
    if (!target) return;

    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        state.finalText += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }

    const dictationText = state.finalText + interim;
    target.value = applyVoiceCommands(state.baseText, dictationText);
  };
}

function startDictation(targetId, label) {
  if (!state.recognition) return;
  if (state.isRecognizing) {
    state.pendingStart = { targetId, label };
    state.recognition.stop();
    return;
  }

  document.querySelectorAll("textarea").forEach((el) => {
    el.classList.remove("dictating");
  });

  const target = document.getElementById(targetId);
  if (!target) return;

  state.activeTargetId = targetId;
  state.baseText = target.value;
  state.finalText = "";
  target.classList.add("dictating");

  dictationTargetEl.textContent = label || "Campo ativo";
  dictationTargetEl.classList.remove("idle");
  dictationTargetEl.classList.add("live");

  state.recognition.start();
}

function stopDictation() {
  state.pendingStart = null;

  if (state.recognition && state.isRecognizing) {
    state.recognition.stop();
  }

  document.querySelectorAll("textarea").forEach((el) => {
    el.classList.remove("dictating");
  });

  micButtons.forEach((btn) => btn.classList.remove("active"));
  dictationTargetEl.textContent = "Nenhum campo ativo";
  dictationTargetEl.classList.add("idle");
  dictationTargetEl.classList.remove("live");
  state.activeTargetId = null;
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

if (regionSelect) {
  regionSelect.addEventListener("change", () => {
    refreshSpecificTemplateOptions();
    syncExamTitleField(true);
  });
}

const studyDateEl = document.getElementById("studyDate");
const patientBirthDateEl = document.getElementById("patientBirthDate");

function bindAgeRecalculation(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("input", () => {
    syncPatientAgeField();
  });
  inputEl.addEventListener("change", () => {
    syncPatientAgeField();
  });
}

async function initializeAuthenticatedData() {
  if (isAdminUser()) {
    try {
      await fetchPinnedAiSettingsForAdmin();
    } catch (err) {
      setAiStatus("Falha ao carregar IA padrão", "warn");
    }
  }

  try {
    await loadCustomTemplates();
  } catch (err) {
    customTemplateList = window.localStorage ? getStoredCustomTemplateList() : [];
    updateTemplateStatus(customTemplateList, "Falha ao sincronizar templates com servidor.");
    refreshSpecificTemplateOptions();
  }

  await loadSavedReports();
  if (isAdminUser()) {
    await fetchGlobalApiKeyStatus();
    autoFetchModelsIfNeeded();
  }
  syncPatientAgeField();
  ensureReport();
}

bindAgeRecalculation(studyDateEl);
bindAgeRecalculation(patientBirthDateEl);

if (applyTemplateBtn) {
  applyTemplateBtn.addEventListener("click", applyTemplate);
}

if (addTemplateBtn) {
  addTemplateBtn.addEventListener("click", () => {
    createTemplateFromCurrentReport();
  });
}

if (importTemplateBtn && templateFileInput) {
  importTemplateBtn.addEventListener("click", () => {
    templateFileInput.click();
  });

  templateFileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      await handleTemplateFileImport(file);
    } catch (err) {
      window.alert(err.message || "Não foi possível ler o arquivo de templates.");
    } finally {
      templateFileInput.value = "";
    }
  });
}

if (saveTemplateModalBtn) {
  saveTemplateModalBtn.addEventListener("click", saveTemplateFromModal);
}

if (closeTemplateModalBtn) {
  closeTemplateModalBtn.addEventListener("click", closeTemplateModal);
}

if (cancelTemplateModalBtn) {
  cancelTemplateModalBtn.addEventListener("click", closeTemplateModal);
}

if (templateModalEl) {
  templateModalEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.hasAttribute("data-close-template-modal")) {
      closeTemplateModal();
    }
  });
}

if (generateAiBtn) {
  generateAiBtn.addEventListener("click", generateWithAi);
}

if (saveAiSettingsBtn) {
  saveAiSettingsBtn.addEventListener("click", saveDefaultAiSettings);
}

if (generateReportBtn) {
  generateReportBtn.addEventListener("click", ensureReport);
}

if (clearFormBtn) {
  clearFormBtn.addEventListener("click", () => {
    if (window.confirm("Limpar todos os campos do formulário?")) {
      clearForm();
    }
  });
}

clearFieldButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.clearTarget;
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;
    setFieldValueWithHistory(targetId, "");
    ensureReport();
  });
});

undoFieldButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.undoTarget;
    if (!targetId) return;
    undoFieldValue(targetId);
  });
});

if (copyReportBtn) {
  copyReportBtn.addEventListener("click", async () => {
    const report = ensureReport();
    try {
      await navigator.clipboard.writeText(report);
      window.alert("Laudo copiado para a área de transferência.");
    } catch (err) {
      window.alert("Não foi possível copiar. Selecione e copie manualmente.");
    }
  });
}

if (downloadReportBtn) {
  downloadReportBtn.addEventListener("click", () => {
    const report = ensureReport();
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "laudo_radiologia.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", async () => {
    try {
      await downloadReportPdf();
    } catch (err) {
      window.alert(err.message || "Não foi possível gerar o PDF.");
    }
  });
}

if (saveFinalReportBtn) {
  saveFinalReportBtn.addEventListener("click", saveFinalReport);
}

if (saveDraftBtn) {
  saveDraftBtn.addEventListener("click", saveDraft);
}

if (loadDraftBtn) {
  loadDraftBtn.addEventListener("click", loadDraft);
}

if (stopDictationBtn) {
  stopDictationBtn.addEventListener("click", stopDictation);
}

if (refreshSavedReportsBtn) {
  refreshSavedReportsBtn.addEventListener("click", loadSavedReports);
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem(themeKey, next);
  });
}

if (reportColumnWidthControlEl) {
  const persistColumnWidth = () => {
    const applied = applyReportColumnWidth(reportColumnWidthControlEl.value);
    window.localStorage.setItem(reportColumnWidthKey, String(applied));
  };
  reportColumnWidthControlEl.addEventListener("input", persistColumnWidth);
  reportColumnWidthControlEl.addEventListener("change", persistColumnWidth);
}

if (loginFormEl) {
  loginFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = loginUsernameEl ? loginUsernameEl.value.trim() : "";
    const password = loginPasswordEl ? loginPasswordEl.value : "";
    if (!username || !password) {
      if (loginStatusEl) loginStatusEl.textContent = "Informe login e senha.";
      return;
    }
    if (loginStatusEl) loginStatusEl.textContent = "Entrando...";
    try {
      await submitLogin(username, password);
      if (loginPasswordEl) loginPasswordEl.value = "";
      await initializeAuthenticatedData();
    } catch (err) {
      if (loginStatusEl) loginStatusEl.textContent = err.message || "Falha ao autenticar.";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await performLogout();
    } catch (err) {
      window.alert(err.message || "Não foi possível encerrar a sessão.");
    }
  });
}

if (manageUsersBtn) {
  manageUsersBtn.addEventListener("click", openUserManagementWindow);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isTemplateModalOpen()) {
    closeTemplateModal();
  }
});

micButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.target;
    const label = btn.dataset.label;

    if (state.activeTargetId === targetId && state.isRecognizing) {
      stopDictation();
      return;
    }

    micButtons.forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    startDictation(targetId, label);
  });
});

if (refreshModelsBtn) {
  refreshModelsBtn.addEventListener("click", fetchModels);
}

if (aiProviderEl) {
  aiProviderEl.addEventListener("change", () => {
    updateAiDefaults();
    autoFetchModelsIfNeeded();
    fetchGlobalApiKeyStatus();
  });
}

if (aiModelEl) {
  aiModelEl.addEventListener("change", updateAiLockHint);
}

if (aiBaseUrlEl) {
  aiBaseUrlEl.addEventListener("change", updateAiLockHint);
}

if (saveApiKeyBtn) {
  saveApiKeyBtn.addEventListener("click", saveGlobalApiKey);
}

async function initApp() {
  initTheme();
  initReportColumnWidth();
  ["examTitle", "technique", "findings", "impression"].forEach(trackUndoHistory);
  setupSpeech();
  setMode("ct");
  loadAiPrefs();
  updateAiDefaults();
  syncPatientAgeField();
  resetTrackedFieldHistories(["examTitle", "technique", "findings", "impression"]);

  try {
    const sessionData = await refreshSessionState();
    if (sessionData && sessionData.authenticated) {
      await initializeAuthenticatedData();
    }
  } catch (err) {
    showLoginScreen("Não foi possível verificar a sessão atual.");
  }
}

initApp();
