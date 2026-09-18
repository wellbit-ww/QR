/**
 * Форма запроса в техподдержку: отдельная страница на телефонах, модалка на десктопе.
 */
(function initSupportModal(global) {
  let supportModalEquipment = null;
  let portalProfileCache = undefined;
  let supportModalScrollTop = 0;
  let serialAutocompleteAbort = null;

  function isMobileSupportViewport() {
    return global.matchMedia("(max-width: 640px)").matches;
  }

  function buildSupportPageUrl(equipment) {
    const params = new URLSearchParams();
    if (equipment?.id) {
      params.set("equipment", equipment.id);
    }
    return `/support?${params.toString()}`;
  }

  function openSupport(equipment) {
    if (isMobileSupportViewport()) {
      global.location.href = buildSupportPageUrl(equipment);
      return;
    }
    openSupportModal(equipment);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function teardownSerialAutocomplete() {
    if (serialAutocompleteAbort) {
      serialAutocompleteAbort.abort();
      serialAutocompleteAbort = null;
    }
  }

  function filterSerialSuggestions(serials, query, limit = 8) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return serials.slice(0, limit);
    }
    return serials
      .filter((serial) => serial.toLowerCase().includes(normalizedQuery))
      .slice(0, limit);
  }

  function setupSerialAutocomplete(serialField, serialInput, serials, hintEl) {
    const suggestionsList = serialField.querySelector("[data-support-serial-suggestions]");
    if (!suggestionsList) {
      return;
    }

    teardownSerialAutocomplete();
    serialAutocompleteAbort = new AbortController();
    const { signal } = serialAutocompleteAbort;

    const hideSuggestions = () => {
      suggestionsList.hidden = true;
      suggestionsList.innerHTML = "";
    };

    const renderSuggestions = () => {
      const matches = filterSerialSuggestions(serials, serialInput.value);
      if (!matches.length) {
        hideSuggestions();
        return;
      }

      suggestionsList.innerHTML = matches
        .map(
          (serial) =>
            `<li class="support-serial-suggestions__item" role="option">${escapeHtml(serial)}</li>`
        )
        .join("");
      suggestionsList.hidden = false;
    };

    const selectSuggestion = (value) => {
      serialInput.value = value;
      hideSuggestions();
    };

    suggestionsList.addEventListener(
      "mousedown",
      (event) => {
        const item = event.target.closest(".support-serial-suggestions__item");
        if (!item) {
          return;
        }
        event.preventDefault();
        selectSuggestion(item.textContent.trim());
      },
      { signal }
    );

    serialInput.addEventListener("input", renderSuggestions, { signal });
    serialInput.addEventListener("focus", renderSuggestions, { signal });
    serialInput.addEventListener(
      "blur",
      () => {
        window.setTimeout(hideSuggestions, 160);
      },
      { signal }
    );
    serialInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          hideSuggestions();
        }
      },
      { signal }
    );

    serialInput.setAttribute("autocomplete", "off");
    serialInput.placeholder = "Начните вводить номер";
    if (hintEl) {
      hintEl.textContent =
        serials.length > 10
          ? `В аккаунте ${serials.length} серийных номеров — начните вводить, чтобы увидеть подсказки`
          : "Начните вводить или выберите номер из подсказок";
      hintEl.hidden = false;
    }
  }

  function redirectToLogin() {
    const params = new URLSearchParams(global.location.search);
    const equipmentFromQuery = params.get("equipment");
    let next = `${global.location.pathname}${global.location.search}`;
    if (global.location.pathname === "/chat" && equipmentFromQuery) {
      next = `/equipment/${equipmentFromQuery}`;
    }
    const loginParams = new URLSearchParams();
    loginParams.set("next", next);
    const equipment = global.equipmentId || equipmentFromQuery;
    if (equipment) {
      loginParams.set("equipment", equipment);
    }
    global.location.href = `/login?${loginParams.toString()}`;
  }

  async function ensurePortalProfile() {
    if (portalProfileCache !== undefined) {
      return portalProfileCache;
    }
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.status === 401) {
        portalProfileCache = null;
        return null;
      }
      portalProfileCache = await response.json().catch(() => null);
    } catch {
      portalProfileCache = null;
    }
    return portalProfileCache;
  }

  function applyOrganizationFromAccount(form, profile) {
    const orgInput = form.organization;
    const hintEl = form.querySelector("[data-support-org-hint]");
    const label = profile?.label ? String(profile.label).trim() : "";

    if (label) {
      orgInput.value = label;
      orgInput.readOnly = true;
      orgInput.classList.add("support-field__input--readonly");
      if (hintEl) {
        hintEl.textContent = "Подставлено из вашей учётной записи";
        hintEl.hidden = false;
      }
    } else {
      orgInput.readOnly = false;
      orgInput.classList.remove("support-field__input--readonly");
      if (hintEl) {
        hintEl.hidden = true;
      }
    }
  }

  function applySerialFromAccount(form, profile, equipment) {
    const serialField = form.querySelector("[data-support-serial-field]");
    const serialInput = form.serialNumber;
    const hintEl = form.querySelector("[data-support-serial-hint]");
    if (!serialField || !serialInput) {
      return;
    }

    teardownSerialAutocomplete();
    serialField.querySelectorAll("select[name=serialNumber]").forEach((node) => node.remove());
    serialInput.hidden = false;
    serialInput.readOnly = false;
    serialInput.classList.remove("support-field__input--readonly");
    serialInput.value = "";
    serialInput.placeholder = "Номер";

    const equipmentId = equipment?.id || global.equipmentId || "";
    const serials = (profile?.equipmentSerials?.[equipmentId] || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!serials.length) {
      if (hintEl) {
        hintEl.hidden = true;
      }
      return;
    }

    if (serials.length === 1) {
      serialInput.value = serials[0];
      serialInput.readOnly = true;
      serialInput.classList.add("support-field__input--readonly");
      if (hintEl) {
        hintEl.textContent = "Подставлено из вашей учётной записи";
        hintEl.hidden = false;
      }
      return;
    }

    setupSerialAutocomplete(serialField, serialInput, serials, hintEl);
  }

  async function prepareSupportForm(form, equipment, profile) {
    form.reset();
    form.equipmentModel.value = equipment?.name || "";
    form.equipmentModel.readOnly = true;
    form.equipmentModel.classList.add("support-field__input--readonly");
    form.querySelector("[name=consent]").checked = false;
    applyOrganizationFromAccount(form, profile);
    applySerialFromAccount(form, profile, equipment);
  }

  async function handleSupportSubmit(event, context) {
    event.preventDefault();
    const { form, equipment, errorEl, successEl, onSuccess } = context;
    const submitBtn = form.querySelector(".support-submit");

    errorEl.hidden = true;
    successEl.hidden = true;

    const formData = new FormData(form);
    formData.set("equipmentId", equipment?.id || global.equipmentId || "");
    formData.set("consent", form.consent.checked ? "true" : "false");

    submitBtn.disabled = true;

    try {
      const response = await fetch("/api/support-request", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Не удалось отправить запрос.");
      }

      successEl.textContent =
        data.message || "Запрос отправлен. Мы свяжемся с вами по указанной почте.";
      successEl.hidden = false;
      const profile = await ensurePortalProfile();
      await prepareSupportForm(form, equipment, profile);
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (error) {
      errorEl.textContent =
        error instanceof Error ? error.message : "Не удалось отправить запрос.";
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  }

  function getSupportFormMarkup() {
    return `
        <label class="support-field">
          <span class="support-field__label">Название организации</span>
          <input class="support-field__input" name="organization" type="text" placeholder="Название" required />
          <span class="support-field__hint" data-support-org-hint hidden></span>
        </label>
        <label class="support-field">
          <span class="support-field__label">Контактное лицо</span>
          <input class="support-field__input" name="contactName" type="text" placeholder="ФИО" required />
        </label>
        <label class="support-field">
          <span class="support-field__label">Должность</span>
          <input class="support-field__input" name="position" type="text" placeholder="Должность" />
        </label>
        <label class="support-field">
          <span class="support-field__label">Телефон</span>
          <input class="support-field__input" name="phone" type="tel" placeholder="+7 (___) ___-__-__" required />
        </label>
        <label class="support-field">
          <span class="support-field__label">Электронная почта</span>
          <input class="support-field__input" name="email" type="email" placeholder="Электронная почта" required />
        </label>
        <label class="support-field">
          <span class="support-field__label">Модель оборудования</span>
          <input class="support-field__input" name="equipmentModel" type="text" placeholder="Название модели" required />
        </label>
        <label class="support-field" data-support-serial-field>
          <span class="support-field__label">Серийный номер</span>
          <div class="support-serial-autocomplete">
            <input
              class="support-field__input"
              name="serialNumber"
              type="text"
              placeholder="Номер"
              autocomplete="off"
            />
            <ul
              class="support-serial-suggestions"
              data-support-serial-suggestions
              role="listbox"
              hidden
            ></ul>
          </div>
          <span class="support-field__hint" data-support-serial-hint hidden></span>
        </label>
        <label class="support-field support-field--full">
          <span class="support-field__label">Ваш вопрос</span>
          <textarea class="support-field__input support-field__textarea" name="message" rows="5" placeholder="Опишите вашу проблему" required></textarea>
        </label>
        <label class="support-field support-field--full">
          <span class="support-field__label">Вложения (PDF, DOC, фото)</span>
          <input
            class="support-field__file"
            name="attachments"
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
          />
          <span class="support-field__hint">PDF, DOC, JPG, PNG, WEBP, HEIC — до 5 файлов, каждый не более 10 МБ</span>
        </label>
        <label class="support-consent">
          <input class="support-consent__checkbox" name="consent" type="checkbox" required />
          <span class="support-consent__text">
            Я соглашаюсь на обработку моих персональных данных в соотв. с ФЗ от 27.07.2006 №152-ФЗ на условиях и для целей, определенных
            <a href="https://sovtest-ate.ru/info/privacy-policy" target="_blank" rel="noopener noreferrer">политикой конфиденциальности</a>
          </span>
        </label>
        <p class="support-form__error" id="supportFormError" hidden></p>
        <p class="support-form__success" id="supportFormSuccess" hidden></p>
        <button type="submit" class="support-submit">
          <span class="support-submit__text">Отправить</span>
          <span class="support-submit__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3.4 11.2 19.6 4.5c.9-.4 1.8.5 1.4 1.4l-6.7 16.2c-.4.9-1.7.8-1.9-.1l-1.5-6-6-1.5c-.9-.2-1-.5-.1-1.3Z"/></svg>
          </span>
        </button>`;
  }

  function getSupportModalElement() {
    let modal = document.getElementById("supportModal");
    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.id = "supportModal";
    modal.className = "support-modal";
    modal.hidden = true;
    modal.innerHTML = `
    <div class="support-modal__backdrop" data-support-close></div>
    <div
      class="support-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supportModalTitle"
    >
      <button type="button" class="support-modal__close" data-support-close aria-label="Закрыть">×</button>
      <h2 class="support-modal__title" id="supportModalTitle">Запрос в поддержку</h2>
      <form class="support-form" id="supportForm" enctype="multipart/form-data" novalidate>
        ${getSupportFormMarkup()}
      </form>
    </div>
  `;
    document.body.append(modal);

    modal.querySelectorAll("[data-support-close]").forEach((el) => {
      el.addEventListener("click", closeSupportModal);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeSupportModal();
      }
    });

    const form = modal.querySelector("#supportForm");
    form.addEventListener("submit", (event) => {
      handleSupportSubmit(event, {
        form,
        equipment: supportModalEquipment,
        errorEl: modal.querySelector("#supportFormError"),
        successEl: modal.querySelector("#supportFormSuccess"),
        onSuccess: () => {
          window.setTimeout(closeSupportModal, 2800);
        },
      });
    });

    return modal;
  }

  function lockSupportModalPageScroll() {
    supportModalScrollTop = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add("support-modal-open");
    document.documentElement.classList.add("support-modal-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${supportModalScrollTop}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  function unlockSupportModalPageScroll() {
    document.body.classList.remove("support-modal-open");
    document.documentElement.classList.remove("support-modal-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, supportModalScrollTop);
  }

  async function openSupportModal(equipment) {
    supportModalEquipment = equipment;
    const modal = getSupportModalElement();
    const form = modal.querySelector("#supportForm");
    const errorEl = modal.querySelector("#supportFormError");
    const successEl = modal.querySelector("#supportFormSuccess");

    errorEl.hidden = true;
    successEl.hidden = true;

    const profile = await ensurePortalProfile();
    await prepareSupportForm(form, equipment, profile);

    modal.hidden = false;
    lockSupportModalPageScroll();

    if (form.organization.readOnly) {
      form.contactName.focus();
    } else {
      form.organization.focus();
    }
  }

  function closeSupportModal() {
    const modal = document.getElementById("supportModal");
    if (!modal) {
      return;
    }
    teardownSerialAutocomplete();
    modal.hidden = true;
    unlockSupportModalPageScroll();
    supportModalEquipment = null;
  }

  async function initSupportPage({ form, equipment, errorEl, successEl, onSuccess }) {
    supportModalEquipment = equipment;
    errorEl.hidden = true;
    successEl.hidden = true;

    const profile = await ensurePortalProfile();
    await prepareSupportForm(form, equipment, profile);

    form.addEventListener("submit", (event) => {
      handleSupportSubmit(event, {
        form,
        equipment,
        errorEl,
        successEl,
        onSuccess,
      });
    });
  }

  function attachToButtons(equipment) {
    document.querySelectorAll(".support-open-button").forEach((button) => {
      button.addEventListener("click", () => openSupport(equipment));
    });
  }

  global.SovaSupportModal = {
    open: openSupport,
    close: closeSupportModal,
    attachToButtons,
    ensurePortalProfile,
    initPage: initSupportPage,
    buildPageUrl: buildSupportPageUrl,
    isMobile: isMobileSupportViewport,
  };
})(window);
