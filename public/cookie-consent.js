(function initCookieConsent() {
  const STORAGE_KEY = "sovtest_cookie_consent_v1";
  const PRIVACY_URL = "https://sovtest-ate.ru/info/privacy-policy";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "accepted") {
      return;
    }
  } catch (_) {
    return;
  }

  function accept() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "accepted");
    } catch (_) {
      /* ignore */
    }
    const banner = document.getElementById("cookieConsent");
    if (banner) {
      banner.classList.add("cookie-consent--hide");
      window.setTimeout(() => banner.remove(), 320);
    }
    document.body.classList.remove("cookie-consent-open");
  }

  function render() {
    const banner = document.createElement("aside");
    banner.id = "cookieConsent";
    banner.className = "cookie-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Уведомление об использовании cookie");

    banner.innerHTML = `
      <div class="cookie-consent__inner">
        <div class="cookie-consent__content">
          <p class="cookie-consent__title">Мы используем куки для улучшения работы этого сайта</p>
          <p class="cookie-consent__text">
            Продолжая просмотр сайта, вы соглашаетесь с
            <a class="cookie-consent__link" href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer">политикой обработки персональных данных и cookie-файлов</a>
          </p>
        </div>
        <button type="button" class="cookie-consent__button">Принять и закрыть</button>
      </div>
    `;

    banner.querySelector(".cookie-consent__button")?.addEventListener("click", accept);
    document.body.appendChild(banner);
    document.body.classList.add("cookie-consent-open");

    window.requestAnimationFrame(() => {
      banner.classList.add("cookie-consent--visible");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();
