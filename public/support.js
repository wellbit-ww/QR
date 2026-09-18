const params = new URLSearchParams(window.location.search);
window.equipmentId = params.get("equipment");

const supportBackLink = document.getElementById("supportBackLink");
const supportEquipmentBadge = document.getElementById("supportEquipmentBadge");
const supportForm = document.getElementById("supportForm");
const supportFormError = document.getElementById("supportFormError");
const supportFormSuccess = document.getElementById("supportFormSuccess");

function redirectToLogin() {
  const loginParams = new URLSearchParams();
  loginParams.set("next", `${window.location.pathname}${window.location.search}`);
  if (window.equipmentId) {
    loginParams.set("equipment", window.equipmentId);
  }
  window.location.href = `/login?${loginParams.toString()}`;
}

function showPageError(message) {
  if (!supportFormError) {
    return;
  }
  supportFormError.textContent = message;
  supportFormError.hidden = false;
  if (supportFormSuccess) {
    supportFormSuccess.hidden = true;
  }
}

async function loadEquipment() {
  if (!window.equipmentId) {
    showPageError("Не указано оборудование. Вернитесь на карточку и откройте форму снова.");
    supportEquipmentBadge.textContent = "Не выбрано";
    supportBackLink.href = "/";
    supportForm?.querySelector(".support-submit")?.setAttribute("disabled", "disabled");
    return null;
  }

  try {
    const response = await fetch(`/api/equipment/${encodeURIComponent(window.equipmentId)}`, {
      credentials: "include",
    });

    if (response.status === 401) {
      redirectToLogin();
      return null;
    }

    if (!response.ok) {
      throw new Error("Оборудование не найдено.");
    }

    const equipment = await response.json();
    if (equipment?.id) {
      window.equipmentId = equipment.id;
    }
    supportEquipmentBadge.textContent = equipment.name || equipment.id;
    supportBackLink.href = `/equipment/${encodeURIComponent(equipment.publicId || equipment.id)}`;
    return equipment;
  } catch (error) {
    showPageError(
      error instanceof Error ? error.message : "Не удалось загрузить данные оборудования."
    );
    supportEquipmentBadge.textContent = "Ошибка загрузки";
    supportBackLink.href = "/";
    return null;
  }
}

async function initSupportPage() {
  if (!window.SovaSupportModal?.initPage) {
    showPageError("Не удалось инициализировать форму.");
    return;
  }

  const equipment = await loadEquipment();
  if (!equipment) {
    return;
  }

  await window.SovaSupportModal.initPage({
    form: supportForm,
    equipment,
    errorEl: supportFormError,
    successEl: supportFormSuccess,
    onSuccess: () => {
      window.setTimeout(() => {
        window.location.href = `/equipment/${encodeURIComponent(equipment.id)}`;
      }, 2800);
    },
  });
}

initSupportPage();
