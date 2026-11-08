// Roda com: node tests/check-motor-pixel.mjs
// Confere links locais, o checkout do Motor Pixel e o repasse de UTMs.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageDir = join(root, "motor-pixel");
const html = readFileSync(join(pageDir, "index.html"), "utf8");
const { buildCheckoutUrl } = createRequire(import.meta.url)(join(root, "assets", "checkout.js"));

let pass = 0;
const fail = [];
const t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`ok   ${name}`);
  } catch (e) {
    fail.push(name);
    console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`);
  }
};

// ---------- 1. links e arquivos locais ----------
const refs = [...html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)].map((m) => m[1]);
const local = refs.filter((r) => !/^(https?:|mailto:|#|data:)/.test(r));
const external = refs.filter((r) => /^https?:/.test(r));
const mail = refs.filter((r) => r.startsWith("mailto:"));
const anchors = refs.filter((r) => r.startsWith("#"));

for (const ref of [...new Set(local)]) {
  t(`arquivo local existe: ${ref}`, () => {
    const clean = ref.split("#")[0].split("?")[0];
    let p = resolve(pageDir, clean);
    if (clean.endsWith("/")) p = join(p, "index.html");
    assert.ok(existsSync(p), `não achei ${p}`);
    assert.ok(statSync(p).size > 0, "arquivo vazio");
  });
}
for (const a of anchors) {
  t(`âncora existe: ${a}`, () => assert.ok(html.includes(`id="${a.slice(1)}"`)));
}
t("não há links externos http(s) na página", () => assert.deepEqual(external, []));
t("e-mail de suporte correto", () => assert.deepEqual(mail, ["mailto:contato@atenda.tech"]));

// ---------- 2. checkout do Motor Pixel; o do ebook não entra nesta página ----------
const CHECKOUT = "https://pay.kiwify.com.br/xDfB7ss";
t("meta checkout-url é o checkout ao vivo do Motor Pixel", () => {
  const m = html.match(/<meta name="checkout-url" content="([^"]*)">/);
  assert.ok(m, "meta ausente");
  assert.equal(m[1], CHECKOUT);
});
t("a página não usa o checkout do ebook", () => {
  assert.ok(!/LcB04qZ/.test(html));
});
t("não mostra o aviso Checkout em breve", () => {
  assert.ok(!/Checkout em breve/.test(html));
  assert.ok(!/class="soon"/.test(html));
});
const buyButtons = [...html.matchAll(/<button[^>]*data-checkout="([^"]+)"[^>]*>/g)];
t("há 4 botões de compra (topo, oferta, final, barra)", () => {
  assert.deepEqual(buyButtons.map((m) => m[1]).sort(), ["barra", "oferta", "vsl-final", "vsl-topo"]);
});
for (const m of buyButtons) {
  t(`botão ${m[1]} está desativado e não é link`, () => {
    assert.match(m[0], /\sdisabled(\s|>)/);
    assert.match(m[0], /aria-disabled="true"/);
  });
}
t("nenhum <a> leva a checkout", () => {
  const anchorsHtml = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).join("\n");
  assert.ok(!/data-checkout|checkout/i.test(anchorsHtml));
});

// ---------- 3. conteúdo obrigatório ----------
t("preço R$ 97, garantia de 7 dias e 1 ano de atualizações", () => {
  assert.match(html, /R\$&nbsp;97/);
  assert.match(html, /7 dias/);
  assert.match(html, /1 ano/);
});
t("vídeo com controles de som, playsinline e poster", () => {
  assert.match(html, /<video[^>]*playsinline/);
  assert.match(html, /<video[^>]*poster="poster.jpg"/);
  assert.match(html, /id="sound"/);
});
t("vídeo pesa menos de 12 MB e tem faststart", () => {
  const f = join(pageDir, "vsl.mp4");
  assert.ok(statSync(f).size < 12 * 1024 * 1024);
  const head = readFileSync(f).subarray(0, 64 * 1024);
  const moov = head.indexOf("moov");
  const mdat = head.indexOf("mdat");
  assert.ok(moov > -1 && (mdat === -1 || moov < mdat), "moov deve vir antes de mdat");
});
t("não cita Remotion no texto de venda fora do aviso de licença", () => {
  const text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "");
  const hits = text.match(/Remotion/g) || [];
  assert.ok(hits.length <= 1, `Remotion aparece ${hits.length} vezes`);
});

// ---------- 4. UTMs ----------
const BASE = "https://checkout.exemplo.test/pay/abc";
t("a URL da meta repassa UTMs e marca o botão em utm_content", () => {
  const search = "?utm_source=instagram&utm_medium=bio&utm_campaign=motor&utm_term=pixel&src=a&sck=b&email=nao@deve";
  const u = new URL(buildCheckoutUrl(CHECKOUT, search, "vsl-topo"));
  assert.equal(u.origin + u.pathname, "https://pay.kiwify.com.br/xDfB7ss");
  assert.equal(u.searchParams.get("utm_source"), "instagram");
  assert.equal(u.searchParams.get("utm_medium"), "bio");
  assert.equal(u.searchParams.get("utm_campaign"), "motor");
  assert.equal(u.searchParams.get("utm_term"), "pixel");
  assert.equal(u.searchParams.get("src"), "a");
  assert.equal(u.searchParams.get("sck"), "b");
  assert.equal(u.searchParams.get("utm_content"), "vsl-topo");
  assert.equal(u.searchParams.get("email"), null);
});
t("sem URL base, o botão fica desativado (null)", () => {
  assert.equal(buildCheckoutUrl("", "?utm_source=ig", "vsl-topo"), null);
});
t("repassa utm_source, utm_medium, utm_campaign e utm_term", () => {
  const u = new URL(buildCheckoutUrl(BASE, "?utm_source=instagram&utm_medium=bio&utm_campaign=motor&utm_term=x", "vsl-topo"));
  assert.equal(u.searchParams.get("utm_source"), "instagram");
  assert.equal(u.searchParams.get("utm_medium"), "bio");
  assert.equal(u.searchParams.get("utm_campaign"), "motor");
  assert.equal(u.searchParams.get("utm_term"), "x");
});
t("repassa src, sck, s1, s2 e s3", () => {
  const u = new URL(buildCheckoutUrl(BASE, "?src=a&sck=b&s1=1&s2=2&s3=3", "oferta"));
  for (const [k, v] of Object.entries({ src: "a", sck: "b", s1: "1", s2: "2", s3: "3" })) assert.equal(u.searchParams.get(k), v);
});
t("utm_content do botão vence o da página", () => {
  const u = new URL(buildCheckoutUrl(BASE, "?utm_content=outro", "vsl-final"));
  assert.equal(u.searchParams.get("utm_content"), "vsl-final");
});
t("cada botão recebe o próprio utm_content", () => {
  const set = new Set(["vsl-topo", "oferta", "vsl-final", "barra"].map((c) => new URL(buildCheckoutUrl(BASE, "", c)).searchParams.get("utm_content")));
  assert.equal(set.size, 4);
});
t("parâmetros sem relação não vazam", () => {
  const u = new URL(buildCheckoutUrl(BASE, "?email=a@b.c&token=123&utm_source=ig", "vsl-topo"));
  assert.equal(u.searchParams.get("email"), null);
  assert.equal(u.searchParams.get("token"), null);
});
t("mantém parâmetros que já estavam na URL base", () => {
  const u = new URL(buildCheckoutUrl(BASE + "?offer=1", "?utm_source=ig", "vsl-topo"));
  assert.equal(u.searchParams.get("offer"), "1");
  assert.equal(u.searchParams.get("utm_source"), "ig");
});
t("valores com acento e espaço são codificados", () => {
  const u = buildCheckoutUrl(BASE, "?utm_campaign=ilha%20dos%20seguidores%20%C3%A7", "vsl-topo");
  assert.equal(new URL(u).searchParams.get("utm_campaign"), "ilha dos seguidores ç");
});

console.log(`\n${pass} passaram, ${fail.length} falharam`);
if (fail.length) {
  console.log(fail.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
