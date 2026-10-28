const equipmentRoot = document.getElementById("equipmentRoot");
const pathParts = window.location.pathname.split("/").filter(Boolean);
const equipmentFromPath =
  pathParts[0] === "equipment" && pathParts[1] ? pathParts[1] : null;

window.equipmentId = equipmentFromPath;

function redirectToLogin() {
  let next = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams(window.location.search);
  const equipmentFromQuery = params.get("equipment");
  if (window.location.pathname === "/chat" && equipmentFromQuery) {
    next = `/equipment/${equipmentFromQuery}`;
  }
  const loginParams = new URLSearchParams();
  loginParams.set("next", next);
  const equipment = window.equipmentId || equipmentFromQuery;
  if (equipment) {
    loginParams.set("equipment", equipment);
  }
  window.location.href = `/login?${loginParams.toString()}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include" });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Требуется вход.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить данные.");
  }

  return payload;
}

async function logoutPortal() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
  redirectToLogin();
}

function attachLogoutControl() {
  const footer = document.querySelector(".footer");
  if (!footer || footer.querySelector(".footer-logout")) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "footer-logout";
  button.textContent = "Выйти";
  button.addEventListener("click", logoutPortal);
  footer.appendChild(button);
}

function renderStateCard(title, message) {
  const logo =
    window.SovaBrand?.renderSiteLogo({ linked: true }) ||
    "";
  equipmentRoot.innerHTML = `
    <section class="card card--state">
      ${logo ? `<div class="card-brand">${logo}</div>` : ""}
      <h1>${escapeHtml(title)}</h1>
      <p class="equipment-summary equipment-summary--state">${escapeHtml(message)}</p>
      <div class="actions">
        <a class="action-button" href="/">Вернуться в каталог</a>
      </div>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

function safeEquipmentId(value) {
  return encodeURIComponent(String(value ?? ""));
}

function safeUrl(value, fallback = "#") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin && raw.startsWith("/")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch {
    // Fall through to fallback for malformed URLs.
  }
  return fallback;
}

function catalogEquipmentId(equipment) {
  return safeEquipmentId(equipment.publicId || equipment.id);
}

function getEquipmentCardActions(equipment, isDetail) {
  const actions = [];
  const equipmentId = catalogEquipmentId(equipment);

  if (!isDetail) {
    actions.push(
      `<a class="action-button" href="/equipment/${equipmentId}">Открыть карточку</a>`
    );
  }

  if (isDetail) {
    actions.push(
      `<button
        type="button"
        class="action-button support-open-button"
        data-equipment-id="${escapeHtmlAttr(equipment.id)}"
        data-equipment-name="${escapeHtmlAttr(equipment.name)}"
      >Техподдержка</button>`
    );
  }

  actions.push(
    `<a class="action-button" href="/chat?equipment=${equipmentId}">Задать вопрос</a>`
  );

  if (equipment.guideUrl) {
    actions.push(
      `<a class="action-button" href="${escapeHtmlAttr(safeUrl(equipment.guideUrl))}" target="_blank" rel="noopener noreferrer">Руководство</a>`
    );
  }

  if (equipment.manualUrl) {
    actions.push(
      `<a class="action-button" href="${escapeHtmlAttr(safeUrl(equipment.manualUrl))}" target="_blank" rel="noopener noreferrer">Инструкции / схемы</a>`
    );
  }

  return actions.join("");
}

function renderEquipmentImage(equipment) {
  const equipmentId = safeEquipmentId(equipment.id);
  if (!equipment.image) {
    return `
      <div class="equipment-image-placeholder" role="img" aria-label="${escapeHtmlAttr(equipment.imageAlt || equipment.name)}">
        <span class="equipment-image-placeholder__model">${escapeHtml(equipment.name)}</span>
        <span class="equipment-image-placeholder__note">Изображение будет добавлено позже</span>
      </div>
    `;
  }
  const imageSrc = safeUrl(equipment.image);
  const imageHtml = `<img class="equipment-image" src="${escapeHtmlAttr(imageSrc)}" alt="${escapeHtmlAttr(equipment.imageAlt)}" />`;

  if (equipmentId === "sdb702-nm") {
    return `<div class="equipment-image-frame equipment-image-frame--sdb702-nm">${imageHtml}</div>`;
  }

  if (equipmentId === "w-700") {
    return `<div class="equipment-image-frame equipment-image-frame--w-700">${imageHtml}</div>`;
  }

  if (equipmentId === "sdb1560m") {
    return `<div class="equipment-image-frame equipment-image-frame--sdb1560m">${imageHtml}</div>`;
  }

  return imageHtml;
}

function renderCatalogCard(equipment) {
  const equipmentId = safeEquipmentId(equipment.id);
  return `
    <section class="card card--catalog-item card--equipment-${equipmentId}">
      <h2 class="equipment-card-title">${escapeHtml(equipment.name)} — ${escapeHtml(equipment.type)}</h2>
      ${renderEquipmentImage(equipment)}
      <p class="equipment-summary">${escapeHtml(equipment.summary)}</p>
      <div class="actions">
        <a class="action-button" href="/equipment/${equipmentId}">Открыть карточку</a>
      </div>
    </section>
  `;
}

const SERIALS_COLLAPSE_THRESHOLD = 5;

function renderAccountSerialsListItems(items) {
  return items
    .map(
      (serial, index) =>
        `<li><span class="account-serials__index">${index + 1}.</span> ${escapeHtml(serial)}</li>`
    )
    .join("");
}

function renderAccountSerialsBlock(serials) {
  const items = (Array.isArray(serials) ? serials : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!items.length) {
    return "";
  }

  const listHtml = renderAccountSerialsListItems(items);

  if (items.length <= SERIALS_COLLAPSE_THRESHOLD) {
    return `
      <section class="account-serials" aria-label="Серийные номера">
        <h2 class="account-serials__title">Серийные номера</h2>
        <ul class="account-serials__list">${listHtml}</ul>
      </section>
    `;
  }

  return `
    <section class="account-serials account-serials--collapsible" aria-label="Серийные номера">
      <button
        type="button"
        class="account-serials__toggle"
        aria-expanded="false"
        aria-controls="accountSerialsPanel"
      >
        <span class="account-serials__toggle-label">Серийные номера</span>
        <span class="account-serials__toggle-meta">${items.length} шт.</span>
      </button>
      <div class="account-serials__panel" id="accountSerialsPanel">
        <div class="account-serials__scroll">
          <ul class="account-serials__list">${listHtml}</ul>
        </div>
      </div>
    </section>
  `;
}

function renderSpecsContent(equipment) {
  const intro = Array.isArray(equipment.specIntro) ? equipment.specIntro : [];
  const tableRows = Array.isArray(equipment.specTable) ? equipment.specTable : [];
  const legacySpecs = Array.isArray(equipment.specs) ? equipment.specs : [];

  if (tableRows.length) {
    const introHtml = intro
      .map((paragraph) => `<p class="equipment-specs__intro">${escapeHtml(paragraph)}</p>`)
      .join("");
    const tableHtml = `
      <table class="equipment-specs-table">
        <tbody>
          ${tableRows
            .map(
              (row) => `
            <tr>
              <th scope="row">${escapeHtml(row.label)}</th>
              <td>${escapeHtml(row.value)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
    return `${introHtml}${tableHtml}`;
  }

  return legacySpecs.map((spec) => `<p>${escapeHtml(spec)}</p>`).join("");
}

function renderDetailCard(equipment, accountSerialsHtml = "") {
  const logo =
    window.SovaBrand?.renderSiteLogo({ compact: true, linked: true }) || "";
  return `
    <section class="card card--detail card--equipment-${safeEquipmentId(equipment.id)}">
      <a class="card-back-link" href="/" aria-label="Вернуться к каталогу">
        <span class="card-back-link__label card-back-link__label--full">Вернуться к каталогу</span>
        <span class="card-back-link__label card-back-link__label--short">
          <span class="card-back-link__icon" aria-hidden="true">←</span>
          <span class="card-back-link__text">Каталог</span>
        </span>
      </a>
      ${logo ? `<div class="card-brand card-brand--compact">${logo}</div>` : ""}
      <h1>${escapeHtml(equipment.name)} — ${escapeHtml(equipment.type)}</h1>
      ${renderEquipmentImage(equipment)}

      <div class="actions">
        <button
          class="action-button specs-button"
          type="button"
          aria-expanded="false"
          aria-controls="specsPanel"
        >
          Характеристики
        </button>
        ${getEquipmentCardActions(equipment, true)}
      </div>

      ${accountSerialsHtml}

      <section class="accordion" aria-live="polite">
        <div class="accordion-panel" id="specsPanel">
          ${renderSpecsContent(equipment)}
        </div>
      </section>
    </section>
  `;
}

function attachAccountSerialsAccordion() {
  const toggle = document.querySelector(".account-serials__toggle");
  const panel = document.getElementById("accountSerialsPanel");
  if (!toggle || !panel) {
    return;
  }

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function attachSpecsAccordion() {
  const specsButton = document.querySelector(".specs-button");
  const specsPanel = document.getElementById("specsPanel");

  if (!specsButton || !specsPanel) {
    return;
  }

  specsButton.addEventListener("click", () => {
    const isOpen = specsPanel.classList.toggle("is-open");
    specsButton.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      specsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function initEquipmentCarousel() {
  const track = document.getElementById("equipmentCarouselTrack");
  const dotsRoot = document.querySelector(".equipment-carousel__dots");
  if (!track || !dotsRoot) {
    return;
  }

  const cards = [...track.querySelectorAll(".card--catalog-item")];
  if (cards.length < 2) {
    return;
  }

  dotsRoot.innerHTML = cards
    .map(
      (_, index) =>
        `<button type="button" class="equipment-carousel__dot${index === 0 ? " is-active" : ""}" aria-label="Карточка ${index + 1} из ${cards.length}"></button>`
    )
    .join("");

  const dots = [...dotsRoot.querySelectorAll(".equipment-carousel__dot")];
  const setActiveDot = (activeIndex) => {
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
    });
  };

  const cardOffset = (card) => card.offsetLeft - cards[0].offsetLeft;

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      track.scrollTo({
        left: cardOffset(cards[index]),
        behavior: "smooth",
      });
    });
  });

  let scrollFrame = 0;
  track.addEventListener(
    "scroll",
    () => {
      if (scrollFrame) {
        return;
      }
      scrollFrame = globalThis.requestAnimationFrame(() => {
        scrollFrame = 0;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        cards.forEach((card, index) => {
          const distance = Math.abs(cardOffset(card) - track.scrollLeft);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });
        setActiveDot(nearestIndex);
      });
    },
    { passive: true }
  );

  track.scrollLeft = 0;
  setActiveDot(0);
}

async function renderCatalogPage() {
  document.title = "Каталог оборудования";
  document.body.classList.remove("page-mode-detail");
  document.body.classList.add("page-mode-catalog");

  try {
    const [data, profile] = await Promise.all([
      fetchJson("/api/equipment"),
      fetchJson("/api/auth/me").catch(() => null),
    ]);
    const items = Array.isArray(data.items) ? data.items : [];
    const organization = String(profile?.label || "").trim();
    const catalogTitle = organization
      ? `Каталог оборудования — ${organization}`
      : "Каталог оборудования";
    document.title = catalogTitle;
    const cardsHtml = items.map(renderCatalogCard).join("");
    const useCarousel = items.length >= 2;
    const catalogContent = useCarousel
      ? `
      <div class="equipment-carousel">
        <div class="equipment-grid equipment-grid--multi" id="equipmentCarouselTrack">
          ${cardsHtml}
        </div>
        <div class="equipment-carousel__dots" aria-label="Навигация по карточкам"></div>
      </div>`
      : `<div class="equipment-grid">${cardsHtml}</div>`;

    equipmentRoot.innerHTML = `
      <section class="catalog-header site-hero">
        ${window.SovaBrand?.renderSiteLogo({ linked: true }) || ""}
        <h1 class="site-hero__title">${escapeHtml(catalogTitle)}</h1>
      </section>
      ${catalogContent}
    `;

    if (useCarousel) {
      initEquipmentCarousel();
    }
  } catch (error) {
    renderStateCard(
      "Не удалось загрузить каталог",
      error instanceof Error
        ? error.message
        : "Произошла ошибка при загрузке оборудования."
    );
  }
}

async function renderDetailPage(equipmentId) {
  document.body.classList.remove("page-mode-catalog");
  document.body.classList.add("page-mode-detail");

  try {
    const equipment = await fetchJson(`/api/equipment/${equipmentId}`);
    document.title = `${equipment.name} — ${equipment.type}`;
    let accountSerialsHtml = "";
    try {
      const profile = await fetchJson("/api/auth/me");
      accountSerialsHtml = renderAccountSerialsBlock(
        profile?.equipmentSerials?.[equipment.id] || profile?.equipmentSerials?.[equipmentId]
      );
    } catch {
      /* profile optional */
    }
    equipmentRoot.innerHTML = renderDetailCard(equipment, accountSerialsHtml);
    attachSpecsAccordion();
    attachAccountSerialsAccordion();
    if (window.SovaSupportModal) {
      window.SovaSupportModal.attachToButtons(equipment);
      window.SovaSupportModal.ensurePortalProfile();
    }
  } catch (error) {
    document.title = "Оборудование не найдено";
    renderStateCard(
      "Оборудование не найдено",
      error instanceof Error
        ? error.message
        : "Не удалось открыть карточку оборудования."
    );
  }
}

async function renderPage() {
  const brandLogo = window.SovaBrand?.renderSiteLogo({ linked: true }) || "";
  equipmentRoot.innerHTML = `
    <section class="card card--state">
      ${brandLogo ? `<div class="card-brand">${brandLogo}</div>` : ""}
      <h1>Загрузка...</h1>
      <p class="equipment-summary equipment-summary--state">
        Подготавливаем данные по оборудованию.
      </p>
    </section>
  `;

  if (equipmentFromPath) {
    await renderDetailPage(equipmentFromPath);
    return;
  }

  await renderCatalogPage();
}

renderPage().then(attachLogoutControl);
