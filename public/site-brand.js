/**
 * Брендинг SOVTEST / SOVA — логотипы для каталога, входа и чата.
 */
(function initSiteBrand(global) {
  const LOGO_SRC = "/sovtest-logo.png?v=4";
  const SOVA_LOGO_SRC = "/sova-logo.png?v=1";

  function renderSiteLogo(options = {}) {
    const compact = options.compact === true;
    const linked = options.linked !== false;
    const classExtra = options.className ? ` ${options.className}` : "";
    const cls = `site-logo${compact ? " site-logo--compact" : ""}${classExtra}`;
    const img = `<img class="site-logo__img" src="${LOGO_SRC}" alt="SOVTEST" width="240" height="72" decoding="async" />`;

    if (linked) {
      return `<a href="/" class="${cls}" aria-label="SOVTEST — на главную">${img}</a>`;
    }
    return `<div class="${cls}">${img}</div>`;
  }

  function renderSovaLogo(options = {}) {
    const classExtra = options.className ? ` ${options.className}` : "";
    const cls = `sova-logo${classExtra}`;
    return `<div class="${cls}" aria-label="SOVA"><img class="sova-logo__img" src="${SOVA_LOGO_SRC}" alt="SOVA" width="72" height="72" decoding="async" /></div>`;
  }

  function renderBrandPair(options = {}) {
    const classExtra = options.className ? ` ${options.className}` : "";
    const sovtest = renderSiteLogo({
      linked: options.linked === true,
      compact: options.compact === true,
      className: options.sovtestClassName || "site-logo--login",
    });
    const sova = renderSovaLogo({
      className: options.sovaClassName || "sova-logo--login",
    });
    return `<div class="brand-pair${classExtra}">${sovtest}${sova}</div>`;
  }

  global.SovaBrand = {
    LOGO_SRC,
    SOVA_LOGO_SRC,
    renderSiteLogo,
    renderSovaLogo,
    renderBrandPair,
  };
})(window);
