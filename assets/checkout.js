/* Monta a URL do checkout repassando a origem da visita.
   - Mantém utm_*, src, sck, s1, s2 e s3 da página.
   - O utm_content do botão sempre vence o da URL da página.
   - Sem URL base, devolve null (o botão fica desativado). */
(function (root) {
  var KEEP = ["src", "sck", "s1", "s2", "s3"];

  function buildCheckoutUrl(base, search, content) {
    if (!base) return null;
    var url = new URL(base);
    var here = new URLSearchParams(search || "");
    here.forEach(function (value, key) {
      var k = key.toLowerCase();
      if (!value || k === "utm_content") return;
      if (k.indexOf("utm_") === 0 || KEEP.indexOf(k) > -1) url.searchParams.set(k, value);
    });
    if (content) url.searchParams.set("utm_content", content);
    return url.toString();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { buildCheckoutUrl: buildCheckoutUrl };
  else root.MotorPixelCheckout = { buildCheckoutUrl: buildCheckoutUrl };
})(typeof window !== "undefined" ? window : this);
