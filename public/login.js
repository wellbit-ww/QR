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
const submitLabel = loginSubmit?.querySelector(".login-submit__label");

if (loginBrand && window.SovaBrand) {
  loginBrand.innerHTML = window.SovaBrand.renderBrandPair
    ? window.SovaBrand.renderBrandPair({
        linked: false,
        className: "brand-pair--login",
      })
    : window.SovaBrand.renderSiteLogo({
        linked: false,
        className: "site-logo--login",
      });
}

if (equipmentHint && loginHint) {
  loginHint.textContent = `Вход для оборудования «${equipmentHint}». Используйте логин и пароль с наклейки.`;
}

if (passwordInput && passwordToggle) {
  passwordToggle.addEventListener("click", () => {
    const showPassword = passwordInput.type === "password";
    passwordInput.type = showPassword ? "text" : "password";
    passwordToggle.setAttribute(
      "aria-label",
      showPassword ? "Скрыть пароль" : "Показать пароль"
    );
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

function setLoading(isLoading) {
  if (!loginSubmit) {
    return;
  }
  loginSubmit.disabled = isLoading;
  loginSubmit.classList.toggle("is-loading", isLoading);
  loginSubmit.setAttribute("aria-busy", isLoading ? "true" : "false");
  if (submitLabel) {
    submitLabel.textContent = isLoading ? "Вход…" : "Войти";
  }
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

  setLoading(true);

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

    // Default: equipment catalog. Keep equipment deep-link / next from server when provided.
    let target =
      typeof payload.redirectTo === "string" && payload.redirectTo.startsWith("/")
        ? payload.redirectTo
        : equipmentHint
          ? `/equipment/${equipmentHint}`
          : "/";

    // Avoid landing on chat as an intermediate screen after login.
    if (target.startsWith("/chat")) {
      const eq = new URL(target, window.location.origin).searchParams.get("equipment");
      target = eq ? `/equipment/${eq}` : "/";
    }

    window.location.replace(target);
  } catch {
    showError("Сервер недоступен. Проверьте подключение к сети.");
  } finally {
    setLoading(false);
  }
});
