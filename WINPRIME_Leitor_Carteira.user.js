// ==UserScript==
// @name         WINPRIME - Leitor de Sentimento (Investing + DXY TradingView)
// @namespace    winprime
// @version      2.6
// @description  Le a SUA carteira de sentimento no Investing + o DXY no TradingView a cada 30s (mesmo em segundo plano). Altista > +0,30%, Baixista < -0,30%, Neutro entre -0,30% e +0,30% (inclusive). VIX e DXY invertidos. Publica no painel dos alunos.
// @match        https://br.investing.com/portfolio/*
// @match        https://www.investing.com/portfolio/*
// @match        https://br.tradingview.com/symbols/TVC-DXY/*
// @match        https://www.tradingview.com/symbols/TVC-DXY/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.github.com
// @downloadURL  https://raw.githubusercontent.com/aprendermercadofinanceiro-alt/winprime-macro/main/WINPRIME_Leitor_Carteira.user.js
// @updateURL    https://raw.githubusercontent.com/aprendermercadofinanceiro-alt/winprime-macro/main/WINPRIME_Leitor_Carteira.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Timer que NAO e desacelerado quando a aba fica em segundo plano (roda num Web Worker).
  function timerBackground(fn, ms) {
    try {
      const w = new Worker(URL.createObjectURL(new Blob(["setInterval(function(){postMessage(0);}," + ms + ");"], { type: "text/javascript" })));
      w.onmessage = fn;
      return w;
    } catch (e) { return setInterval(fn, ms); }
  }

  const NO_TRADINGVIEW = /tradingview\.com/i.test(location.hostname);

  // ==================================================================
  //  MODO TRADINGVIEW  -> le o DXY e envia para o leitor da carteira
  // ==================================================================
  if (NO_TRADINGVIEW) {
    function lerDXY() {
      const pt = document.querySelector(".js-symbol-change-pt");
      if (!pt) return null;
      let v = parseFloat(pt.textContent.replace("%", "").replace(/\s/g, "").replace("−", "-").replace(".", "").replace(",", "."));
      if (isNaN(v)) return null;
      const dir = document.querySelector(".js-symbol-change-direction");
      const cls = dir ? dir.className : "";
      if (/down/i.test(cls)) v = -Math.abs(v);
      else if (/up/i.test(cls)) v = Math.abs(v);
      return v;
    }
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483000;background:#0f130c;color:#f2f2ec;font:12px Arial;padding:10px 12px;border-radius:10px;border:1px solid #2a3222;box-shadow:0 6px 24px rgba(0,0,0,.4)";
    box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · DXY</b><br><small>lendo…</small>";
    document.body.appendChild(box);
    function ciclo() {
      const v = lerDXY();
      if (v === null) { box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · DXY</b><br><small>lendo…</small>"; return; }
      GM_setValue("winprime_dxy", JSON.stringify({ v: v, ts: Date.now() }));
      box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · DXY</b><br>" +
        "<span style='font-size:17px;font-weight:800'>" + (v >= 0 ? "+" : "") + v.toFixed(2) + "%</span><br>" +
        "<small style='color:#9fb08f'>enviado ao placar · " + new Date().toLocaleTimeString("pt-BR") + "</small>";
    }
    setTimeout(ciclo, 2500);
    timerBackground(ciclo, 15000);
    return;
  }

  // ==================================================================
  //  MODO INVESTING  -> leitor da carteira (inclui o DXY do TradingView)
  // ==================================================================
  const OWNER = "aprendermercadofinanceiro-alt";
  const REPO  = "winprime-macro";
  const PATH  = "estado.json";
  const INTERVALO_MS = 30000;
  const DXY_VALIDADE_MS = 60 * 60 * 1000; // aceita DXY lido na ultima 1h (nunca some enquanto a aba do TradingView estiver aberta)

  const LIMIAR = 0.30, CORTE_POS = 3, CORTE_NEG = -3;
  const INVERTIDO = /VIX|DXY|USDX|Índice Dólar|Dollar Index/i;

  let TOKEN = GM_getValue("winprime_token", "");
  let timer = null;

  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
      GM_setValue("winprime_token", ""); TOKEN = ""; pedirToken();
    }
  });

  function lerDXYArmazenado() {
    try {
      const raw = GM_getValue("winprime_dxy", "");
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (typeof d.v !== "number") return null;
      if (Date.now() - d.ts > DXY_VALIDADE_MS) return { v: d.v, velho: true };
      return { v: d.v, velho: false };
    } catch (e) { return null; }
  }

  function lerCarteira() {
    const tables = Array.from(document.querySelectorAll("table"));
    let best = null, bestn = 0;
    tables.forEach(tb => { const n = tb.querySelectorAll("tbody tr").length; if (/%/.test(tb.innerText) && n > bestn) { best = tb; bestn = n; } });
    let ativos = [];
    if (best) {
      const hr = best.querySelector("thead tr") || best.querySelector("tr");
      const heads = Array.from(hr.querySelectorAll("th,td")).map(c => c.innerText.trim());
      const varIdx = heads.findIndex(h => /^Var%$/i.test(h));
      const nomeIdx = heads.findIndex(h => /^Nome$/i.test(h));
      if (varIdx >= 0) {
        Array.from(best.querySelectorAll("tbody tr")).forEach(tr => {
          const tds = tr.querySelectorAll("td");
          if (!tds[varIdx]) return;
          const cell = tds[varIdx].innerText.trim().replace(/[−–]/g, "-");
          const m = cell.match(/(-?\d+,\d+)%/);
          if (!m) return;
          const v = parseFloat(m[1].replace(",", "."));
          const nome = (nomeIdx >= 0 && tds[nomeIdx]) ? tds[nomeIdx].innerText.trim() : tr.innerText.split(" ").slice(0, 3).join(" ");
          ativos.push({ nome: nome, v: v, linha: tr.innerText.replace(/\s+/g, " ") });
        });
      }
    }
    if (!ativos.length) {
      const linhas = Array.from(document.querySelectorAll("tr")).map(tr => tr.innerText.replace(/\s+/g, " ").trim()).filter(t => t && /%/.test(t) && !/Nome/i.test(t));
      ativos = linhas.map(t => { const m = t.replace(/[−–]/g, "-").match(/(-?\d+,\d+)%/g); if (!m) return null; return { nome: t.split(" ").slice(0, 3).join(" "), v: parseFloat(m[m.length - 1].replace(",", ".")), linha: t }; }).filter(Boolean);
    }
    const dxy = lerDXYArmazenado();
    if (dxy) ativos.push({ nome: "DXY (dolar)", v: dxy.v, linha: "DXY Dollar Index" });
    ativos._dxy = dxy;
    return ativos;
  }

  function computar(ativos) {
    let soma = 0; const alt = [], neu = [], bai = [];
    ativos.forEach(a => {
      let voto = a.v > LIMIAR ? 1 : (a.v < -LIMIAR ? -1 : 0);
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
      obs: "Leitura ao vivo da carteira do Investing + DXY do TradingView (WINPRIME)."
    };
  }

  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }

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
    return { ok: p.ok, status: p.status };
  }

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483000;background:#0f130c;color:#f2f2ec;font:13px Arial;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);min-width:230px;border:1px solid #2a3222";
  box.innerHTML = "<b style='color:#b7e08c'>WINPRIME</b><br><small>iniciando…</small>";
  document.body.appendChild(box);

  function pintar(p, res, dxy) {
    const cor = p.estado === 2 ? "#69c47a" : p.estado === 0 ? "#e57373" : "#cfcb92";
    const rot = p.estado === 2 ? "POSITIVO" : p.estado === 0 ? "NEGATIVO" : "NEUTRO";
    let status;
    if (res.ok) status = "publicado ✓";
    else if (res.status === 401 || res.status === 403) status = "token invalido ✗ (Ctrl+Shift+K)";
    else status = "erro ao publicar (" + res.status + ")";
    let dxyLinha;
    if (!dxy) dxyLinha = "<span style='color:#e0a03a'>DXY: abra a aba do TradingView</span>";
    else if (dxy.velho) dxyLinha = "<span style='color:#e0a03a'>DXY (reabra o TradingView): " + (dxy.v >= 0 ? "+" : "") + dxy.v.toFixed(2) + "%</span>";
    else dxyLinha = "<span style='color:#9fb08f'>DXY incluido: " + (dxy.v >= 0 ? "+" : "") + dxy.v.toFixed(2) + "%</span>";
    box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · Placar</b><br>" +
      "<span style='font-size:22px;font-weight:800;color:" + cor + "'>" + rot + "</span><br>" +
      "<span style='color:#69c47a'>" + p.altistas + " alt</span> · " +
      "<span style='color:#cfcb92'>" + p.neutros + " neu</span> · " +
      "<span style='color:#e57373'>" + p.baixistas + " bai</span> (" + p.total + ")<br>" +
      dxyLinha + "<br>" +
      "<small style='color:#9fb08f'>" + new Date().toLocaleTimeString("pt-BR") + " · " + status + "</small>";
  }

  async function ciclo() {
    const ativos = lerCarteira();
    if (!ativos.length) { box.innerHTML = "<b style='color:#b7e08c'>WINPRIME</b><br><small>aguardando a carteira carregar…</small>"; return; }
    const p = computar(ativos);
    let res = { ok: false, status: 0 };
    try { res = await publicar(p); } catch (e) {}
    pintar(p, res, ativos._dxy);
  }

  function iniciar() {
    if (timer) return;
    ciclo();
    timer = timerBackground(ciclo, INTERVALO_MS);
  }

  function pedirToken() {
    if (document.getElementById("winprime-token-ask")) return;
    const w = document.createElement("div");
    w.id = "winprime-token-ask";
    w.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;font-family:Arial";
    w.innerHTML =
      "<div style='background:#0f130c;color:#f2f2ec;padding:26px;border-radius:14px;max-width:440px;width:90%;border:1px solid #2a3222;box-shadow:0 12px 48px rgba(0,0,0,.6)'>" +
        "<div style='color:#b7e08c;font-weight:800;font-size:19px;margin-bottom:8px'>WINPRIME · Leitor de Sentimento</div>" +
        "<div style='font-size:13px;color:#cfd6c6;margin-bottom:14px;line-height:1.5'>Cole abaixo o seu <b>token do GitHub</b> (github_pat_...). Fica salvo <b>somente no seu navegador</b>.</div>" +
        "<input id='winprime-token-input' type='password' placeholder='github_pat_...' style='width:100%;padding:11px;border-radius:8px;border:1px solid #3a4531;background:#151a10;color:#fff;font-size:13px;box-sizing:border-box'>" +
        "<button id='winprime-token-save' style='margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;background:#8FD35A;color:#0f130c;font-weight:800;font-size:14px;cursor:pointer'>Salvar e ativar</button>" +
        "<div id='winprime-token-msg' style='font-size:12px;color:#e57373;margin-top:8px;min-height:16px'></div>" +
      "</div>";
    document.body.appendChild(w);
    const inp = w.querySelector("#winprime-token-input");
    const msg = w.querySelector("#winprime-token-msg");
    setTimeout(() => inp.focus(), 50);
    function salvar() {
      const t = (inp.value || "").trim();
      if (!t || t.length < 20) { msg.textContent = "Cole um token válido (github_pat_...)."; return; }
      GM_setValue("winprime_token", t); TOKEN = t; w.remove(); iniciar();
    }
    w.querySelector("#winprime-token-save").onclick = salvar;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });
  }

  setTimeout(function () {
    if (TOKEN && TOKEN.length >= 20) iniciar();
    else pedirToken();
  }, 2500);
})();
