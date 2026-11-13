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
const PIXEL_ID = "1447176216770002";
const isMetaPixelImage = (ref) => {
  let u;
  try {
    u = new URL(ref);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === "www.facebook.com" &&
    u.pathname === "/tr" &&
    u.searchParams.get("id") === PIXEL_ID &&
    u.searchParams.get("ev") === "PageView" &&
    u.searchParams.get("noscript") === "1"
  );
};
const metaPixelImages = external.filter(isMetaPixelImage);
const otherExternal = external.filter((r) => !isMetaPixelImage(r));
t("não há links externos http(s) na página, salvo a imagem do pixel da Meta", () => {
  assert.deepEqual(otherExternal, []);
  assert.deepEqual(metaPixelImages, [
    `https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`,
  ]);
});
t("e-mail de suporte correto", () => assert.deepEqual(mail, ["mailto:contato@atenda.tech"]));

// ---------- 2. checkout do Motor Pixel; o do ebook não entra nesta página ----------
const CHECKOUT = "https://pay.kiwify.com.br/xDfB7ss";
t("meta checkout-url é o checkout ao vivo do Motor Pixel", () => {
  const m = html.match(/<meta name="checkout-url" content="([^"]*)">/);
  assert.ok(m, "meta ausente");
  assert.equal(m[1], CHECKOUT + "?coupon=BLACK47"); // janela Black Friday até 27/11; voltar a CHECKOUT em 28/11
});
t("a página não usa o checkout do ebook", () => {
  assert.ok(!/LcB04qZ/.test(html));
});
t("com checkout configurado, a página não diz em breve", () => {
  assert.ok(!/em breve/i.test(html));
  assert.ok(!/class="soon"/.test(html));
  assert.match(html, /data-checkout="barra"[^>]*>Comprar agora</);
});
const buyButtons = [...html.matchAll(/<button[^>]*data-checkout="([^"]+)"[^>]*>/g)];
t("há 5 botões de compra (topo antes do vídeo, vsl-topo no desktop, oferta, final, barra)", () => {
  assert.deepEqual(buyButtons.map((m) => m[1]).sort(), ["barra", "oferta", "topo", "vsl-final", "vsl-topo"]);
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
// ---------- 2b. correções da página (13/11): topo, barra, cupom, requisitos ----------
const visible = html
  .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, "")
  .replace(/<pre class="prova-texto" id="prova-texto">[\s\S]*?<\/pre>/, "");
t("bloco de preço e botão vêm antes do vídeo, com utm_content bf-topo", () => {
  const iTopo = html.indexOf('data-checkout="topo"');
  assert.ok(iTopo > -1 && iTopo < html.indexOf('id="vsl-video"'), "botão topo deve vir antes do vídeo");
  assert.match(html, /data-checkout="topo"[^>]*data-utm="bf-topo"/);
  assert.match(html, /R\$&nbsp;47 à vista/);
  assert.match(html, /getAttribute\("data-utm"\) \|\| "bf-preco"/);
});
t("barra fixa já nasce visível (class on), sem esperar rolagem", () => {
  assert.match(html, /<div class="bar on" id="bar" aria-hidden="false"/);
  assert.ok(!/pastTop/.test(html), "a lógica de esperar o primeiro botão saiu");
  assert.match(html, /getElementById\("topo"\)/); // a barra some enquanto o bloco do topo está na tela
  assert.match(html, /\.observe\(topo\)/);
  assert.match(html, /R\$&nbsp;47 à vista<small>de R\$&nbsp;97 · até 27\/11<\/small>/);
});
t("sem a linha de dúvida do cupom", () => {
  assert.ok(!/Se o desconto não aparecer/.test(html));
  assert.ok(!/Tem um cupom de desconto/.test(html));
  assert.ok(!/bf-hint/.test(html));
});
t("requisitos: 3 itens, sem computador, Windows ou Mac, e FAQ de sistema removido", () => {
  const need = html.match(/<ul class="need">([\s\S]*?)<\/ul>/)[1];
  assert.equal((need.match(/<li>/g) || []).length, 3);
  assert.ok(!/computador|windows|\bmac\b|celular|smartphone|notebook|laptop/i.test(visible), "menção a dispositivo/sistema na página");
  assert.ok(!/Funciona no Windows ou no Mac/.test(html));
});
t("copy: sem a palavra 'garantido'", () => {
  assert.ok(!/\bgarantido\b/i.test(visible));
});
t("Meta Pixel inicia e dispara PageView", () => {
  assert.match(html, /fbq\(\s*['"]init['"]\s*,\s*['"]1447176216770002['"]\s*\)/);
  assert.match(html, /fbq\(\s*['"]track['"]\s*,\s*['"]PageView['"]\s*\)/);
});
t("clique no CTA dispara o evento custom ClickCheckout (não o InitiateCheckout) e segue para o checkout", () => {
  assert.match(html, /fbq\(\s*['"]trackCustom['"]\s*,\s*['"]ClickCheckout['"]\s*,\s*\{\s*value:\s*47\s*,\s*currency:\s*['"]BRL['"]\s*\}\s*\)/); // BF até 27/11; reverter value p/ 97 em 28/11
  assert.ok(!/fbq\(\s*['"]track['"]\s*,\s*['"]InitiateCheckout['"]/.test(html), "o IC padrão deve vir só do checkout da Kiwify");
  assert.match(html, /location\.href\s*=\s*target/);
});
t("ebook, termos e privacidade continuam sem este pixel", () => {
  for (const rel of ["index.html", "termos/index.html", "privacidade/index.html"]) {
    const other = readFileSync(join(root, rel), "utf8");
    assert.ok(!other.includes(PIXEL_ID), rel);
    assert.ok(!/fbq\s*\(/.test(other), rel);
  }
});


// ---------- 2c. bloco de prova (romanos), abaixo do VSL ----------
const provaSection = html.match(/<section class="prova" id="prova">[\s\S]*?<\/section>/);
t("bloco de prova vem logo abaixo do vídeo principal", () => {
  assert.ok(provaSection, "seção #prova ausente");
  const afterHero = html.indexOf("</section>", html.indexOf('id="vsl-video"'));
  const rest = html.slice(afterHero + "</section>".length).trimStart();
  assert.ok(rest.startsWith('<section class="prova" id="prova">'), "o bloco de prova deve ser a primeira seção depois do hero/VSL");
});
t("título e legenda da prova são os aprovados pela Estrategista", () => {
  const block = provaSection[0];
  assert.match(block, /<h2>Um pedido em português, um vídeo de 23 segundos<\/h2>/);
  assert.match(block, /<p class="prova-cap">Feito com o Motor Pixel v1\.1 e o Claude Code, numa rodada só, sem edição depois do render\.<\/p>/);
  assert.ok(!/PLACEHOLDER ESTRATEGISTA/.test(html));
});
t("no celular o vídeo da prova vem antes do pedido; no desktop o pedido fica à esquerda", () => {
  const block = provaSection[0];
  const iVideo = block.indexOf('class="prova-video"');
  const iPedido = block.indexOf('class="prova-pedido"');
  assert.ok(iVideo > -1 && iPedido > -1 && iVideo < iPedido, "no HTML (fluxo móvel) o vídeo deve vir antes do pedido");
  assert.match(html, /\.prova-pedido\{[^}]*grid-column:1/);
  assert.match(html, /\.prova-video\{[^}]*grid-column:2/);
  assert.match(html, /\.prova-texto\{[^}]*max-height:260px/);
  assert.match(html, /@media \(min-width:760px\)\{[^]*\.prova-texto\{[^}]*max-height:none/);
});
t("vídeo de prova tem poster, playsinline, controls, preload e sem autoplay", () => {
  const block = provaSection[0];
  assert.match(block, /<video[^>]*src="prova-romanos.mp4"/);
  assert.match(block, /<video[^>]*poster="prova-romanos.jpg"/);
  assert.match(block, /<video[^>]*playsinline/);
  assert.match(block, /<video[^>]*\scontrols(\s|>)/);
  assert.match(block, /preload="(?:none|metadata)"/);
  assert.ok(!/\sautoplay(\s|>)/i.test(block), "não deve haver autoplay no vídeo de prova");
});
t("vídeo de prova pesa no máximo 4 MB e tem faststart", () => {
  const f = join(pageDir, "prova-romanos.mp4");
  assert.ok(statSync(f).size <= 4 * 1024 * 1024, `arquivo tem ${statSync(f).size} bytes`);
  const head = readFileSync(f).subarray(0, 64 * 1024);
  const moov = head.indexOf("moov");
  const mdat = head.indexOf("mdat");
  assert.ok(moov > -1 && (mdat === -1 || moov < mdat), "moov deve vir antes de mdat");
});
t("pedido da prova está verbatim, inclusive “desta máquina”", () => {
  const pre = html.match(/<pre class="prova-texto" id="prova-texto">([\s\S]*?)<\/pre>/);
  assert.ok(pre, "pre#prova-texto ausente");
  const expected = `Li o MANUAL.md e o SKILL.md desta pasta (Motor Pixel v1.1). Quero que você siga o SKILL.md do começo ao fim e produza o vídeo.

Tema e título: Como os romanos construíam estradas.

Cena: uma paisagem do campo italiano na época romana. Agrimensores usam a groma para marcar uma linha reta. Em seguida, operários abrem uma vala e preenchem em camadas (pedra grossa, cascalho, blocos no topo). No final, a via pavimentada corre reta até o horizonte, com o centro mais alto. Personagens visíveis: agrimensores com a groma, operários com ferramentas, a estrada em construção. Artes 100% originais, estilo pixel. Não copie personagens, mapas, paletas ou roteiros de nenhum outro perfil ou projeto. Não importe código, sprites ou áudio de outras pastas desta máquina.

Duração: entre 20 e 30 segundos. Formato vertical 1080×1920, 30 fps, com legendas em português do Brasil.

Narração (use exatamente este texto, em português do Brasil):

"Os romanos não improvisavam uma estrada. Primeiro, os agrimensores traçavam uma linha reta com a groma. Depois vinha a vala, preenchida em camadas: pedra grossa na base, cascalho no meio, e no topo um piso de blocos, mais alto no centro, para a chuva escorrer. Dois mil anos depois, muitas dessas vias ainda estão lá."

Voz: use o cliente edge-tts, sem nenhuma API paga. Prefira uma voz em português brasileiro (por exemplo pt-BR-AntonioNeural ou pt-BR-FranciscaNeural). Se precisar listar as vozes, pode listar. Siga o caminho do SKILL.md com Communicate(..., boundary="WordBoundary") + SubMaker. Não invente flags de CLI. Só depois meça a duração com ffprobe e defina durationInFrames.

Siga a sequência do SKILL.md: entradas.json, sprites originais com ciclo de caminhada, Composition Episode (sem apagar PlaceholderTest), ep.json, legendas palavra a palavra, mix com loudness medida, render de Episode em build/episode.mp4, depois ffprobe, ebur128 e folha de contato. Trabalhe só nesta pasta do kit. Quando terminar, diga o caminho do MP4, a duração medida, a voz usada e o que passou ou ficou NÃO TESTADO.`;
  assert.equal(pre[1], expected);
  assert.match(pre[1], /desta máquina/);
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
