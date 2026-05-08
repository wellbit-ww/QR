const equipmentRoot = document.getElementById("equipmentRoot");
const pathParts = window.location.pathname.split("/").filter(Boolean);
const equipmentFromPath =
  pathParts[0] === "equipment" && pathParts[1] ? pathParts[1] : null;

window.equipmentId = equipmentFromPath;

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Не удалось загрузить данные.");
  }

  return payload;
}

function renderStateCard(title, message) {
  equipmentRoot.innerHTML = `
    <section class="card card--state">
      <p class="eyebrow">Производственное оборудование</p>
      <h1>${title}</h1>
      <p class="equipment-summary equipment-summary--state">${message}</p>
      <div class="actions">
        <a class="action-button" href="/">Вернуться в каталог</a>
      </div>
    </section>
  `;
}

function getEquipmentCardActions(equipment, isDetail) {
  const actions = [];

  if (!isDetail) {
    actions.push(
      `<a class="action-button" href="/equipment/${equipment.id}">Открыть карточку</a>`
    );
  }

  actions.push(
    `<a class="action-button" href="/chat?equipment=${equipment.id}">Задать вопрос</a>`
  );

  if (equipment.guideUrl) {
    actions.push(
      `<a class="action-button" href="${equipment.guideUrl}" target="_blank" rel="noopener noreferrer">Руководство</a>`
    );
  }

  if (equipment.manualUrl) {
    actions.push(
      `<a class="action-button" href="${equipment.manualUrl}" target="_blank" rel="noopener noreferrer">Инструкции / схемы</a>`
    );
  }

  return actions.join("");
}

function renderCatalogCard(equipment) {
  return `
    <section class="card card--catalog-item">
      <p class="eyebrow">Производственное оборудование</p>
      <h2 class="equipment-card-title">${equipment.name} — ${equipment.type}</h2>
      <img class="equipment-image" src="${equipment.image}" alt="${equipment.imageAlt}" />
      <p class="equipment-summary">${equipment.summary}</p>
      <div class="actions">
        <a class="action-button" href="/equipment/${equipment.id}">Открыть карточку</a>
      </div>
    </section>
  `;
}

function renderDetailCard(equipment) {
  return `
    <section class="card card--detail">
      <a class="card-back-link" href="/">Вернуться к каталогу</a>
      <p class="eyebrow">Производственное оборудование</p>
      <h1>${equipment.name} — ${equipment.type}</h1>
      <img class="equipment-image" src="${equipment.image}" alt="${equipment.imageAlt}" />

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

      <section class="accordion" aria-live="polite">
        <div class="accordion-panel" id="specsPanel">
          ${equipment.specs.map((spec) => `<p>${spec}</p>`).join("")}
        </div>
      </section>
    </section>
  `;
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

async function renderCatalogPage() {
  document.title = "Каталог оборудования";
  document.body.classList.remove("page-mode-detail");

  try {
    const data = await fetchJson("/api/equipment");
    const items = Array.isArray(data.items) ? data.items : [];

    equipmentRoot.innerHTML = `
      <section class="catalog-header">
        <p class="eyebrow">Производственное оборудование</p>
        <h1>Каталог оборудования</h1>
        <p class="catalog-subtitle">
          Выберите нужный станок, чтобы открыть его карточку и уже внутри перейти в чат или к дополнительным материалам.
        </p>
      </section>
      <div class="equipment-grid">
        ${items.map(renderCatalogCard).join("")}
      </div>
    `;
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
  document.body.classList.add("page-mode-detail");

  try {
    const equipment = await fetchJson(`/api/equipment/${equipmentId}`);
    document.title = `${equipment.name} — ${equipment.type}`;
    equipmentRoot.innerHTML = renderDetailCard(equipment);
    attachSpecsAccordion();
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
  equipmentRoot.innerHTML = `
    <section class="card card--state">
      <p class="eyebrow">Производственное оборудование</p>
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

renderPage();
