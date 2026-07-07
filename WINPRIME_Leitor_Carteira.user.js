// ==UserScript==
// @name         WINPRIME - Leitor de Sentimento (Investing -> Painel)
// @namespace    winprime
// @version      2.1
// @description  Le a SUA carteira de sentimento no Investing a cada 60s, calcula o placar (regra +/-0,30%, VIX e DXY invertidos) e publica no painel dos alunos.
// @match        https://br.investing.com/portfolio/*
// @match        https://www.investing.com/portfolio/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.github.com
// ==/UserScript==

(function () {
  "use strict";

  // ================== CONFIGURACAO ==================
  const OWNER = "aprendermercadofinanceiro-alt";
  const REPO  = "winprime-macro";
  const PATH  = "estado.json";
  const INTERVALO_MS = 60000; // 60 segundos
  // O token e pedido UMA vez numa janelinha e fica salvo so no seu navegador.
  let TOKEN = GM_getValue("winprime_token", "");
  if (!TOKEN) {
    TOKEN = (window.prompt("WINPRIME · Leitor de Sentimento\n\nCole aqui o seu token do GitHub (github_pat_...).\nEle fica salvo somente no seu navegador e nunca sai daqui.") || "").trim();
    if (TOKEN) GM_setValue("winprime_token", TOKEN);
  }
  // Para trocar o token depois: no Investing, tecle Ctrl+Shift+K.
  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
      const t = (window.prompt("WINPRIME · Novo token do GitHub:") || "").trim();
      if (t) { GM_setValue("winprime_token", t); TOKEN = t; location.reload(); }
    }
  });
  // =================================================

  const LIMIAR = 0.30, CORTE_POS = 3, CORTE_NEG = -3;
  const INVERTIDO = /VIX|DXY|USDX|Índice Dólar|Dollar Index/i;

  function lerCarteira() {
    const linhas = Array.from(document.querySelectorAll("tr"))
      .map(tr => tr.innerText.replace(/\s+/g, " ").trim())
      .filter(t => t && /%/.test(t) && !/Nome/i.test(t));
    return linhas.map(t => {
      const m = t.match(/(-?\d+,\d+)%/g);
      if (!m) return null;
      const v = parseFloat(m[m.length - 1].replace(",", "."));
      const nome = t.split(" ").slice(0, 3).join(" ");
      return { nome, v, linha: t };
    }).filter(Boolean);
  }

  function computar(ativos) {
    let soma = 0; const alt = [], neu = [], bai = [];
    ativos.forEach(a => {
      let voto = a.v >= LIMIAR ? 1 : (a.v <= -LIMIAR ? -1 : 0);
      if (INVERTIDO.test(a.linha)) voto = -voto;
      soma += voto;
      if (voto > 0) alt.push(a.nome);
      else if (voto < 0) bai.push(a.nome);
      else neu.push(a.nome);
    });
    const estado = soma >= CORTE_POS ? 2 : (soma <= CORTE_NEG ? 0 : 1);
    return {
      estado, aberto: true, soma,
      altistas: alt.length, neutros: neu.length, baixistas: bai.length,
      total: ativos.length,
      lista_altistas: alt, lista_neutros: neu, lista_baixistas: bai,
      atualizado: new Date().toISOString(),
      obs: "Leitura ao vivo da carteira do Investing (WINPRIME)."
    };
  }

  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }

  // GM_xmlhttpRequest ignora o CSP da pagina do Investing (fetch normal seria bloqueado)
  function gm(method, url, headers, body) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method, url, headers, data: body || null,
        onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: r.responseText }),
        onerror: () => resolve({ ok: false, status: 0, text: "" }),
        ontimeout: () => resolve({ ok: false, status: 0, text: "" })
      });
    });
  }

  async function publicar(payload) {
    const api = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" + PATH;
    const h = { "Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json" };
    let sha = null;
    const g = await gm("GET", api + "?t=" + Date.now(), h);
    if (g.ok) { try { sha = JSON.parse(g.text).sha; } catch (e) {} }
    const body = {
      message: "placar " + (payload.estado === 2 ? "POSITIVO" : payload.estado === 0 ? "NEGATIVO" : "NEUTRO"),
      content: b64(JSON.stringify(payload, null, 2))
    };
    if (sha) body.sha = sha;
    const p = await gm("PUT", api, h, JSON.stringify(body));
    return p.ok;
  }

  // ---- Overlay para voce ver na tela ----
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:99999;background:#0f130c;color:#f2f2ec;font:13px Arial;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);min-width:210px;border:1px solid #2a3222";
  document.body.appendChild(box);
  function pintar(p, okPub) {
    const cor = p.estado === 2 ? "#69c47a" : p.estado === 0 ? "#e57373" : "#cfcb92";
    const rot = p.estado === 2 ? "POSITIVO" : p.estado === 0 ? "NEGATIVO" : "NEUTRO";
    box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · Placar</b><br>" +
      "<span style='font-size:22px;font-weight:800;color:" + cor + "'>" + rot + "</span><br>" +
      "<span style='color:#69c47a'>" + p.altistas + " alt</span> · " +
      "<span style='color:#cfcb92'>" + p.neutros + " neu</span> · " +
      "<span style='color:#e57373'>" + p.baixistas + " bai</span> (" + p.total + ")<br>" +
      "<small style='color:#9fb08f'>" + new Date().toLocaleTimeString("pt-BR") +
      " · " + (okPub ? "publicado ✓" : "erro ao publicar") + "</small>";
  }

  async function ciclo() {
    const ativos = lerCarteira();
    if (!ativos.length) { box.innerHTML = "<b style='color:#b7e08c'>WINPRIME</b><br><small>aguardando a carteira carregar…</small>"; return; }
    const p = computar(ativos);
    let ok = false;
    try { ok = await publicar(p); } catch (e) {}
    pintar(p, ok);
  }

  setTimeout(ciclo, 3000);
  setInterval(ciclo, INTERVALO_MS);
})();
