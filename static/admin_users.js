const sessionDataEl = document.getElementById("sessionData");
const userFormEl = document.getElementById("userForm");
const managedUserIdEl = document.getElementById("managedUserId");
const managedUserFullNameEl = document.getElementById("managedUserFullName");
const managedUserUsernameEl = document.getElementById("managedUserUsername");
const managedUserPasswordEl = document.getElementById("managedUserPassword");
const managedUserCrmEl = document.getElementById("managedUserCrm");
const managedUserSubspecialtyEl = document.getElementById("managedUserSubspecialty");
const userFormTitleEl = document.getElementById("userFormTitle");
const userFormStatusEl = document.getElementById("userFormStatus");
const managedUsersListEl = document.getElementById("managedUsersList");
const managedUsersStatusEl = document.getElementById("managedUsersStatus");
const refreshManagedUsersBtn = document.getElementById("refreshManagedUsers");
const resetManagedUserBtn = document.getElementById("resetManagedUser");
const saveManagedUserBtn = document.getElementById("saveManagedUser");

let managedUsers = [];

function parseSessionData() {
  if (!sessionDataEl) return null;
  try {
    return JSON.parse(sessionDataEl.textContent || "null");
  } catch (err) {
    return null;
  }
}

function resetUserForm() {
  managedUserIdEl.value = "";
  managedUserFullNameEl.value = "";
  managedUserUsernameEl.value = "";
  managedUserPasswordEl.value = "";
  managedUserCrmEl.value = "";
  managedUserSubspecialtyEl.value = "";
  userFormTitleEl.textContent = "Novo radiologista";
  userFormStatusEl.textContent = "Preencha os dados para cadastrar um novo radiologista.";
  saveManagedUserBtn.textContent = "Salvar usuário";
}

function fillUserForm(user) {
  managedUserIdEl.value = user.id || "";
  managedUserFullNameEl.value = user.fullName || "";
  managedUserUsernameEl.value = user.username || "";
  managedUserPasswordEl.value = "";
  managedUserCrmEl.value = user.crm || "";
  managedUserSubspecialtyEl.value = user.subspecialty || "";
  userFormTitleEl.textContent = "Editar radiologista";
  userFormStatusEl.textContent = "Altere os dados e salve. Deixe a senha em branco para manter a atual.";
  saveManagedUserBtn.textContent = "Salvar alterações";
  managedUserFullNameEl.focus();
}

async function fetchManagedUsers() {
  const response = await fetch("/admin/users", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao carregar os usuários.");
  }
  return Array.isArray(data.users) ? data.users : [];
}

async function saveManagedUser(payload, userId = "") {
  const response = await fetch(userId ? `/admin/users/${userId}` : "/admin/users", {
    method: userId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao salvar o usuário.");
  }
  return data.user || null;
}

async function deleteManagedUser(userId) {
  const response = await fetch(`/admin/users/${userId}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data && data.error) || "Falha ao remover o usuário.");
  }
}

function renderManagedUsers() {
  managedUsersListEl.innerHTML = "";

  if (!managedUsers.length) {
    managedUsersStatusEl.textContent = "Nenhum radiologista cadastrado.";
    return;
  }

  managedUsersStatusEl.textContent = `${managedUsers.length} radiologista(s) cadastrado(s).`;
  managedUsers.forEach((user) => {
    const card = document.createElement("article");
    card.className = "user-card";

    const title = document.createElement("h3");
    title.textContent = user.fullName || user.username || "Radiologista";

    const username = document.createElement("p");
    username.className = "user-meta";
    username.textContent = `Login: ${user.username || "-"}`;

    const crm = document.createElement("p");
    crm.className = "user-meta";
    crm.textContent = `CRM: ${user.crm || "-"}`;

    const specialty = document.createElement("p");
    specialty.className = "user-meta";
    specialty.textContent = `Assinatura: ${user.signatureRole || user.subspecialty || "Radiologista"}`;

    const actions = document.createElement("div");
    actions.className = "user-card-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn ghost btn-small";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => fillUserForm(user));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn danger btn-small";
    deleteBtn.textContent = "Remover";
    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(`Remover o usuário ${user.fullName || user.username}?`);
      if (!confirmed) return;
      try {
        await deleteManagedUser(user.id);
        if (managedUserIdEl.value === user.id) {
          resetUserForm();
        }
        await loadManagedUsers();
      } catch (err) {
        userFormStatusEl.textContent = err.message || "Não foi possível remover o usuário.";
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(title);
    card.appendChild(username);
    card.appendChild(crm);
    card.appendChild(specialty);
    card.appendChild(actions);
    managedUsersListEl.appendChild(card);
  });
}

async function loadManagedUsers() {
  managedUsersStatusEl.textContent = "Carregando usuários...";
  try {
    managedUsers = await fetchManagedUsers();
    renderManagedUsers();
  } catch (err) {
    managedUsers = [];
    renderManagedUsers();
    managedUsersStatusEl.textContent = err.message || "Falha ao carregar os usuários.";
  }
}

if (userFormEl) {
  userFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    const userId = managedUserIdEl.value.trim();
    const normalizedUsername = managedUserUsernameEl.value.trim().toLowerCase();
    managedUserUsernameEl.value = normalizedUsername;
    const payload = {
      fullName: managedUserFullNameEl.value.trim(),
      username: normalizedUsername,
      password: managedUserPasswordEl.value,
      crm: managedUserCrmEl.value.trim(),
      subspecialty: managedUserSubspecialtyEl.value.trim() || "Radiologista",
    };

    saveManagedUserBtn.disabled = true;
    saveManagedUserBtn.textContent = "Salvando...";
    userFormStatusEl.textContent = "Salvando usuário...";

    try {
      await saveManagedUser(payload, userId);
      resetUserForm();
      userFormStatusEl.textContent = `Usuário salvo com sucesso. Login liberado: ${normalizedUsername}.`;
      await loadManagedUsers();
    } catch (err) {
      userFormStatusEl.textContent = err.message || "Falha ao salvar o usuário.";
    } finally {
      saveManagedUserBtn.disabled = false;
      saveManagedUserBtn.textContent = managedUserIdEl.value ? "Salvar alterações" : "Salvar usuário";
    }
  });
}

if (resetManagedUserBtn) {
  resetManagedUserBtn.addEventListener("click", resetUserForm);
}

if (refreshManagedUsersBtn) {
  refreshManagedUsersBtn.addEventListener("click", loadManagedUsers);
}

const sessionData = parseSessionData();
if (!sessionData || !sessionData.authenticated || !sessionData.user || sessionData.user.role !== "admin") {
  document.body.innerHTML = "";
  window.location.href = "/";
} else {
  resetUserForm();
  loadManagedUsers();
}
