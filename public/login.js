const params = new URLSearchParams(window.location.search);
const equipmentHint = params.get("equipment");
const nextPath = params.get("next");

const loginHint = document.getElementById("loginHint");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginSubmit = document.getElementById("loginSubmit");
const loginBrand = document.getElementById("loginBrand");
const passwordInput = document.getElementById("passwordInput");
const passwordToggle = document.getElementById("passwordToggle");

if (loginBrand && window.SovaBrand) {
  loginBrand.innerHTML = window.SovaBrand.renderSiteLogo({ linked: false });
}

if (equipmentHint && loginHint) {
  loginHint.textContent = `Вход для оборудования «${equipmentHint}». Используйте логин и пароль с наклейки.`;
}

if (passwordInput && passwordToggle) {
  passwordToggle.addEventListener("click", () => {
    const showPassword = passwordInput.type === "password";
    passwordInput.type = showPassword ? "text" : "password";
    passwordToggle.textContent = showPassword ? "Скрыть" : "Показать";
    passwordToggle.setAttribute("aria-label", showPassword ? "Скрыть пароль" : "Показать пароль");
    passwordToggle.setAttribute("aria-pressed", showPassword ? "true" : "false");
  });
}

function showError(message) {
  if (!loginError) {
    return;
  }
  loginError.textContent = message;
  loginError.hidden = !message;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");

  const login = document.getElementById("loginInput")?.value?.trim();
  const password = passwordInput?.value || "";

  if (!login || !password) {
    showError("Введите логин и пароль.");
    return;
  }

  loginSubmit.disabled = true;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        login,
        password,
        equipment: equipmentHint || undefined,
        next: nextPath || undefined,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      showError(payload.error || "Не удалось войти. Проверьте логин и пароль.");
      return;
    }

    let target =
      typeof payload.redirectTo === "string" && payload.redirectTo.startsWith("/")
        ? payload.redirectTo
        : equipmentHint
          ? `/equipment/${equipmentHint}`
          : "/";

    if (target.startsWith("/chat")) {
      const eq = new URL(target, window.location.origin).searchParams.get("equipment");
      target = eq ? `/equipment/${eq}` : "/";
    }

    window.location.replace(target);
  } catch {
    showError("Сервер недоступен. Проверьте подключение к сети.");
  } finally {
    loginSubmit.disabled = false;
  }
});
