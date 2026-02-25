const state = {
  mode: "ct",
  recognition: null,
  isRecognizing: false,
  activeTargetId: null,
  baseText: "",
  finalText: "",
  pendingStart: null,
};

const themeKey = "radiologiaTheme";

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
const saveDraftBtn = document.getElementById("saveDraft");
const loadDraftBtn = document.getElementById("loadDraft");
const stopDictationBtn = document.getElementById("stopDictation");
const reportOutputEl = document.getElementById("reportOutput");
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

const draftKey = "radiologiaLaudoDraft";
const customTemplatesKey = "radiologiaCustomTemplates";
const customTemplateListKey = "radiologiaCustomTemplateList";
const aiPrefsKey = "radiologiaAiPrefs";
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

function setMode(mode) {
  state.mode = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  refreshSpecificTemplateOptions();
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

  techniqueEl.value =
    template.technique || buildTechnique(state.mode, regionKey, contrastSelect.value);
  findingsEl.value = template.findings || "";
  impressionEl.value = template.impression || "";
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
  if (!aiProviderEl) return;
  const prefs = {
    provider: aiProviderEl.value,
    model: aiModelEl.value.trim(),
    baseUrl: aiBaseUrlEl.value.trim(),
  };
  window.localStorage.setItem(aiPrefsKey, JSON.stringify(prefs));
}

function loadAiPrefs() {
  if (!aiProviderEl) return;
  const raw = window.localStorage.getItem(aiPrefsKey);
  if (!raw) return;
  try {
    const prefs = JSON.parse(raw);
    if (prefs.provider) aiProviderEl.value = prefs.provider;
    if (prefs.model) ensureModelOption(prefs.model);
    if (prefs.baseUrl) aiBaseUrlEl.value = prefs.baseUrl;
  } catch (err) {
    return;
  }
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

function updateAiDefaults() {
  if (!aiProviderEl || !aiBaseUrlEl || !aiModelEl) return;
  const provider = aiProviderEl.value;
  const defaultUrl =
    provider === "lmstudio"
      ? "http://localhost:1234/v1"
      : provider === "gemini"
        ? "https://generativelanguage.googleapis.com/v1beta/openai"
        : "https://api.openai.com/v1";
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

async function fetchModels() {
  if (!refreshModelsBtn || !aiModelEl) return;
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
  if (aiProviderEl.value !== "lmstudio") return;
  if (aiModelEl.options.length === 0) {
    fetchModels();
  }
}

async function generateWithAi() {
  if (!generateAiBtn) return;
  const provider = aiProviderEl.value;
  const model = aiModelEl.value.trim();
  const baseUrl = aiBaseUrlEl.value.trim();
  const apiKey = aiApiKeyEl.value.trim();

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

    if (data.technique !== undefined) {
      document.getElementById("technique").value = data.technique;
    }
    const laudoFromApi = data.laudo !== undefined ? data.laudo : data.findings;
    if (laudoFromApi !== undefined) {
      document.getElementById("findings").value = formatFindingsText(laudoFromApi);
    }
    if (data.impression !== undefined) {
      document.getElementById("impression").value = data.impression;
    }

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
  const modeLabel = state.mode === "ct" ? "TOMOGRAFIA COMPUTADORIZADA" : "RESSONÂNCIA MAGNÉTICA";
  const regionLabel = regionLabels[regionSelect.value] || regionSelect.value;
  const contrastLabel = getContrastLabel(state.mode, contrastSelect.value);

  lines.push(modeLabel);
  lines.push("");

  const patientName = valueOf("patientName");
  const patientId = valueOf("patientId");
  const patientAge = valueOf("patientAge");
  const patientSex = valueOf("patientSex");
  const studyDate = valueOf("studyDate");
  const referrer = valueOf("referrer");

  if (patientName) lines.push("Paciente: " + patientName);
  if (patientId) lines.push("ID: " + patientId);

  if (patientAge || patientSex) {
    const parts = [];
    if (patientAge) parts.push("Idade: " + patientAge);
    if (patientSex) parts.push("Sexo: " + patientSex);
    lines.push(parts.join(" | "));
  }

  if (studyDate) lines.push("Data do exame: " + studyDate);
  if (referrer) lines.push("Solicitante: " + referrer);

  lines.push("Modalidade: " + (state.mode === "ct" ? "Tomografia" : "Ressonância"));
  lines.push("Região: " + regionLabel);
  lines.push("Contraste: " + contrastLabel);
  lines.push("");

  const indication = valueOf("indication");
  if (indication) {
    lines.push("INDICAÇÃO CLÍNICA:");
    lines.push(indication);
    lines.push("");
  }

  const extraInfo = valueOf("extraInfo");
  if (extraInfo) {
    lines.push("INFORMAÇÕES ADICIONAIS:");
    lines.push(extraInfo);
    lines.push("");
  }

  const technique = valueOf("technique");
  if (technique) {
    lines.push("TÉCNICA:");
    lines.push(technique);
    lines.push("");
  }

  const findings = valueOf("findings");
  if (findings) {
    const formattedFindings = formatFindingsText(findings);
    lines.push("LAUDO:");
    lines.push(formattedFindings);
    lines.push("");
  }

  const impression = valueOf("impression");
  if (impression) {
    lines.push("IMPRESSÃO:");
    lines.push(impression);
    lines.push("");
  }

  lines.push("----");
  lines.push("Assinatura: ________________________________________");

  return lines.join("\n");
}

function ensureReport() {
  const report = buildReport();
  reportOutputEl.textContent = report.trim() ? report : "Seu laudo aparecerá aqui.";
  return report;
}

function clearForm() {
  const inputs = document.querySelectorAll("input, textarea");
  inputs.forEach((input) => {
    input.value = "";
  });
  document.getElementById("patientSex").value = "";
  reportOutputEl.textContent = "Seu laudo aparecerá aqui.";
}

function saveDraft() {
  const data = {
    mode: state.mode,
    region: regionSelect.value,
    contrast: contrastSelect.value,
    fields: {
      patientName: valueOf("patientName"),
      patientId: valueOf("patientId"),
      patientAge: valueOf("patientAge"),
      patientSex: valueOf("patientSex"),
      studyDate: valueOf("studyDate"),
      referrer: valueOf("referrer"),
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
  setMode(data.mode || "ct");
  regionSelect.value = data.region || "cranio";
  contrastSelect.value = data.contrast || "sem";
  refreshSpecificTemplateOptions();

  const fields = data.fields || {};
  Object.keys(fields).forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.value = fields[key];
  });

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
  });
}

applyTemplateBtn.addEventListener("click", applyTemplate);

if (addTemplateBtn && templateFileInput) {
  addTemplateBtn.addEventListener("click", () => {
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

generateReportBtn.addEventListener("click", ensureReport);

clearFormBtn.addEventListener("click", () => {
  if (window.confirm("Limpar todos os campos?")) {
    clearForm();
  }
});

copyReportBtn.addEventListener("click", async () => {
  const report = ensureReport();
  try {
    await navigator.clipboard.writeText(report);
    window.alert("Laudo copiado para a área de transferência.");
  } catch (err) {
    window.alert("Não foi possível copiar. Selecione e copie manualmente.");
  }
});

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

saveDraftBtn.addEventListener("click", saveDraft);
loadDraftBtn.addEventListener("click", loadDraft);
stopDictationBtn.addEventListener("click", stopDictation);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem(themeKey, next);
  });
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

initTheme();
loadCustomTemplates().catch(() => {
  customTemplateList = window.localStorage ? getStoredCustomTemplateList() : [];
  updateTemplateStatus(customTemplateList, "Falha ao sincronizar templates com servidor.");
  refreshSpecificTemplateOptions();
});
loadAiPrefs();
updateAiDefaults();
fetchGlobalApiKeyStatus();
if (refreshModelsBtn) {
  refreshModelsBtn.addEventListener("click", fetchModels);
}
autoFetchModelsIfNeeded();
setupSpeech();
setMode("ct");

if (aiProviderEl) {
  aiProviderEl.addEventListener("change", () => {
    updateAiDefaults();
    saveAiPrefs();
    autoFetchModelsIfNeeded();
    fetchGlobalApiKeyStatus();
  });
}

if (aiModelEl) {
  aiModelEl.addEventListener("change", saveAiPrefs);
}

if (aiBaseUrlEl) {
  aiBaseUrlEl.addEventListener("change", saveAiPrefs);
}

if (saveApiKeyBtn) {
  saveApiKeyBtn.addEventListener("click", saveGlobalApiKey);
}
