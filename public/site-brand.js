/**
 * Брендинг SOVTEST — логотип для каталога, входа и чата.
 */
(function initSiteBrand(global) {
  const LOGO_SRC = "/sovtest-logo.png?v=4";

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

  global.SovaBrand = {
    LOGO_SRC,
    renderSiteLogo,
  };
})(window);
