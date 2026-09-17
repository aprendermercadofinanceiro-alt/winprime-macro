// ==UserScript==
// @name         WINPRIME - Leitor de Sentimento (Investing + Universo TradingView)
// @namespace    winprime
// @version      3.0
// @description  Le a SUA carteira no Investing (so ativos abertos) + o universo macro do TradingView (indices globais, brasileiros, DIs de juros e gringos) a cada 30s. Regra estrita +/-0,30%; VIX, DXY e DIs invertidos; conta so o que esta com mercado ABERTO (status do proprio TradingView); veredito por proporcao (descorrelacionado quando ~metade/metade). Publica no painel dos alunos. Partida blindada: nunca trava.
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
      try {
        const v = lerDXY();
        if (v === null) { box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · DXY</b><br><small>lendo…</small>"; return; }
        GM_setValue("winprime_dxy", JSON.stringify({ v: v, ts: Date.now() }));
        box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · DXY</b><br>" +
          "<span style='font-size:17px;font-weight:800'>" + (v >= 0 ? "+" : "") + v.toFixed(2) + "%</span><br>" +
          "<small style='color:#9fb08f'>enviado ao placar · " + new Date().toLocaleTimeString("pt-BR") + "</small>";
      } catch (e) {}
    }
    setInterval(ciclo, 20000);   // timer primeiro (nunca depende do 1o ciclo)
    setTimeout(ciclo, 2500);
    return;
  }

  // ==================================================================
  //  MODO INVESTING  -> leitor da carteira + universo TradingView
  // ==================================================================
  const OWNER = "aprendermercadofinanceiro-alt";
  const REPO  = "winprime-macro";
  const PATH  = "estado.json";
  const INTERVALO_MS = 30000;              // publica a cada 30s
  const DXY_VALIDADE_MS = 15 * 60 * 1000;  // aceita DXY lido nos ultimos 15 min

  const LIMIAR = 0.30;                      // regra estrita: >=+0,30 alta ; <=-0,30 baixa ; entre = neutro
  const INVERTIDO = /VIX|DXY|USDX|Índice Dólar|Dollar Index/i;

  // ---- UNIVERSO TRADINGVIEW (somado a carteira do Investing) --------
  // inv:true = leitura invertida (queda = ponto altista). dd = regex p/ nao duplicar se ja estiver na carteira.
  const TV = [
    // Principais (podem ja estar na carteira -> dedupe)
    { n: "Nasdaq",        s: "CME_MINI:NQ1!",       inv: false, dd: /nasdaq|ndx/i },
    { n: "S&P 500",       s: "CME_MINI:ES1!",       inv: false, dd: /s&?p\s*500|spx/i },
    { n: "Dow Jones",     s: "CBOT_MINI:YM1!",      inv: false, dd: /dow|dji/i },
    { n: "VIX",           s: "TVC:VIX",             inv: true,  dd: /vix/i },
    // Globais complementares
    { n: "DAX",           s: "EUREX:FDAX1!",        inv: false, dd: /\bdax\b/i },
    { n: "Euro Stoxx 50", s: "EUREX:FESX1!",        inv: false, dd: /stoxx|sx5e|euro\s*stoxx/i },
    { n: "ASX 200",       s: "ASX:XJO",             inv: false, dd: /asx|xjo/i },
    { n: "IBEX 35",       s: "BME:IBC",             inv: false, dd: /ibex/i },
    { n: "China H (HSCEI)", s: "HSI:HSCEI",         inv: false, dd: /hscei|china\s*h|h-?shares/i },
    { n: "Hang Seng",     s: "HKEX:HSI1!",          inv: false, dd: /hang\s*seng/i },
    { n: "FTSE 100",      s: "TVC:UKX",             inv: false, dd: /ftse|ukx/i },
    { n: "Nikkei 225",    s: "OSE:NK2251!",         inv: false, dd: /nikkei|nk225/i },
    { n: "TOPIX",         s: "TSE:TOPIX",           inv: false, dd: /topix/i },
    { n: "KOSPI 200",     s: "KRX:KOSPI200",        inv: false, dd: /kospi/i },
    // Brasileiros
    { n: "WEGE3",         s: "BMFBOVESPA:WEGE3",    inv: false, dd: /wege3/i },
    { n: "ITUB4",         s: "BMFBOVESPA:ITUB4",    inv: false, dd: /itub4|itaú|itau/i },
    { n: "BBDC4",         s: "BMFBOVESPA:BBDC4",    inv: false, dd: /bbdc4|bradesco/i },
    { n: "IBOV",          s: "BMFBOVESPA:IBOV",     inv: false, dd: /\bibov\b|bovespa\b/i },
    { n: "BOVA11",        s: "BMFBOVESPA:BOVA11",   inv: false, dd: /bova11/i },
    { n: "BBAS3",         s: "BMFBOVESPA:BBAS3",    inv: false, dd: /bbas3|banco do brasil/i },
    { n: "PETR3",         s: "BMFBOVESPA:PETR3",    inv: false, dd: /petr3/i },
    { n: "PETR4",         s: "BMFBOVESPA:PETR4",    inv: false, dd: /petr4/i },
    { n: "ABEV3",         s: "BMFBOVESPA:ABEV3",    inv: false, dd: /abev3|ambev/i },
    { n: "CXSE3",         s: "BMFBOVESPA:CXSE3",    inv: false, dd: /cxse3/i },
    { n: "VALE3",         s: "BMFBOVESPA:VALE3",    inv: false, dd: /vale3/i },
    { n: "IFNC",          s: "BMFBOVESPA:IFNC",     inv: false, dd: /ifnc/i },
    // DIs (juros) - INVERTIDOS
    { n: "DI Jan/27",     s: "BMFBOVESPA:DI1F2027", inv: true,  dd: /di1f2027/i },
    { n: "DI Jan/29",     s: "BMFBOVESPA:DI1F2029", inv: true,  dd: /di1f2029/i },
    { n: "DI Jan/31",     s: "BMFBOVESPA:DI1F2031", inv: true,  dd: /di1f2031/i },
    { n: "DI Jan/33",     s: "BMFBOVESPA:DI1F2033", inv: true,  dd: /di1f2033/i },
    // Gringos na B3
    { n: "Morgan Stanley", s: "NYSE:MS",            inv: false, dd: /morgan/i },
    { n: "JP Morgan",     s: "NYSE:JPM",            inv: false, dd: /jp\s*morgan|jpm\b/i },
    { n: "UBS",           s: "NYSE:UBS",            inv: false, dd: /\bubs\b/i },
    { n: "EWZ",           s: "AMEX:EWZ",            inv: false, dd: /\bewz\b/i }
  ];
  const _tv = {};   // cache por simbolo: { v, session, ts }

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

  // ---- Busca o universo TradingView (change + status de mercado) ----
  let _dxyTV = null;
  async function fetchOne(t) {
    try {
      const r = await fetch("https://scanner.tradingview.com/symbol?symbol=" + encodeURIComponent(t.s) + "&fields=change,current_session&no_404=true&t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.change === "number") {
        _tv[t.s] = { v: Math.round(j.change * 100) / 100, session: j.current_session || null, ts: Date.now() };
      }
    } catch (e) {}
  }
  async function fetchDXY() {
    try {
      const r = await fetch("https://scanner.tradingview.com/symbol?symbol=TVC:DXY&fields=change&no_404=true&t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.change === "number") { _dxyTV = { v: Math.round(j.change * 100) / 100, ts: Date.now() }; }
    } catch (e) {}
  }
  async function fetchTV() {
    // concorrencia limitada (blocos de 6) para nao levar rate-limit
    for (let i = 0; i < TV.length; i += 6) {
      await Promise.all(TV.slice(i, i + 6).map(fetchOne));
    }
    await fetchDXY();
  }

  // Le a carteira: SO ativos abertos (relogio verde). Le exatamente a coluna "Var%".
  function lerCarteira() {
    const tables = Array.from(document.querySelectorAll("table"));
    let best = null, bestn = 0;
    tables.forEach(tb => { const n = tb.querySelectorAll("tbody tr").length; if (/%/.test(tb.innerText) && n > bestn) { best = tb; bestn = n; } });
    let ativos = [], fechados = 0;
    if (best) {
      const hr = best.querySelector("thead tr") || best.querySelector("tr");
      const heads = Array.from(hr.querySelectorAll("th,td")).map(c => c.innerText.trim());
      const varIdx = heads.findIndex(h => /^Var%$/i.test(h));
      const nomeIdx = heads.findIndex(h => /^Nome$/i.test(h));
      if (varIdx >= 0) {
        Array.from(best.querySelectorAll("tbody tr")).forEach(tr => {
          const tds = tr.querySelectorAll("td");
          if (!tds[varIdx]) return;
          const clock = tr.querySelector('[class*="ClockIcon"]');
          if (clock && /red/i.test(clock.className)) { fechados++; return; }
          const cell = tds[varIdx].innerText.trim().replace(/[−–]/g, "-");
          const m = cell.match(/(-?\d+,\d+)%/);
          if (!m) return;
          const v = parseFloat(m[1].replace(",", "."));
          const nome = (nomeIdx >= 0 && tds[nomeIdx]) ? tds[nomeIdx].innerText.trim() : tr.innerText.split(" ").slice(0, 3).join(" ");
          ativos.push({ nome: nome, v: v, linha: tr.innerText.replace(/\s+/g, " "), fonte: "INV" });
        });
      }
    }
    // DXY do TradingView (so se recente) - mantem a linha do painel
    let dxy = null;
    if (_dxyTV && (Date.now() - _dxyTV.ts) < DXY_VALIDADE_MS) dxy = { v: _dxyTV.v, velho: false };
    else dxy = lerDXYArmazenado();
    if (dxy && !dxy.velho) ativos.push({ nome: "DXY (dolar)", v: dxy.v, linha: "DXY Dollar Index", fonte: "INV" });

    // ---- somar o universo TradingView: dedupe + so mercado ABERTO ----
    const carteiraTxt = ativos.map(a => a.linha).join(" || ");
    let tvAdd = 0, tvFechados = 0, tvDup = 0;
    TV.forEach(t => {
      const c = _tv[t.s];
      if (!c || typeof c.v !== "number") return;          // sem leitura valida -> ignora este ciclo
      if (t.dd.test(carteiraTxt)) { tvDup++; return; }      // ja esta na carteira -> nao duplica
      if (c.session !== "market") { tvFechados++; return; } // mercado fechado -> nao conta (igual relogio vermelho)
      ativos.push({ nome: t.n, v: c.v, linha: t.n + " " + t.s, inv: t.inv, fonte: "TV" });
      tvAdd++;
    });

    ativos._dxy = dxy;
    ativos._fechados = fechados + tvFechados;
    ativos._tvAdd = tvAdd;
    ativos._tvFechados = tvFechados;
    ativos._tvDup = tvDup;
    return ativos;
  }

  function computar(ativos) {
    let soma = 0; const alt = [], neu = [], bai = [];
    ativos.forEach(a => {
      // REGRA ESTRITA (simetrica): >=+0,30 alta ; <=-0,30 baixa ; entre = neutro
      let voto = a.v >= LIMIAR ? 1 : (a.v <= -LIMIAR ? -1 : 0);
      const inverter = (a.inv === true) || INVERTIDO.test(a.linha);
      if (inverter) voto = -voto;   // VIX, DXY e DIs: queda = alta
      soma += voto;
      if (voto > 0) alt.push(a.nome);
      else if (voto < 0) bai.push(a.nome);
      else neu.push(a.nome);
    });
    // VEREDITO POR PROPORCAO: maioria clara (>=60% dos direcionais e diferenca>=2) vence;
    // senao ~metade/metade -> DESCORRELACIONADO (estado 1)
    const dir = alt.length + bai.length;
    let estado;
    if (dir === 0) { estado = 1; }
    else {
      const share = Math.max(alt.length, bai.length) / dir;
      if (share >= 0.60 && Math.abs(alt.length - bai.length) >= 2) estado = (alt.length > bai.length ? 2 : 0);
      else estado = 1;
    }
    return {
      estado, aberto: true, soma,
      altistas: alt.length, neutros: neu.length, baixistas: bai.length,
      total: ativos.length, fechados: ativos._fechados || 0,
      tv_somados: ativos._tvAdd || 0, tv_fechados: ativos._tvFechados || 0, tv_duplicados: ativos._tvDup || 0,
      lista_altistas: alt, lista_neutros: neu, lista_baixistas: bai,
      atualizado: new Date().toISOString(),
      obs: "So ativos ABERTOS (Investing relogio verde + TradingView status market). Regra +/-0,30% simetrica; VIX/DXY/DIs invertidos; 1 voto por ativo. Veredito por proporcao (descorrelacionado quando ~metade/metade). Carteira Investing + universo TradingView (WINPRIME). TV somados: " + (ativos._tvAdd || 0) + " | TV fechados fora: " + (ativos._tvFechados || 0) + " | TV ja na carteira: " + (ativos._tvDup || 0) + "."
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
      message: "placar " + (payload.estado === 2 ? "POSITIVO" : payload.estado === 0 ? "NEGATIVO" : "DESCORRELACIONADO"),
      content: b64(JSON.stringify(payload, null, 2))
    };
    if (sha) body.sha = sha;
    const p = await gm("PUT", api, h, JSON.stringify(body));
    return { ok: p.ok, status: p.status };
  }

  const box = document.createElement("div");
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483000;background:#0f130c;color:#f2f2ec;font:13px Arial;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);min-width:250px;border:1px solid #2a3222";
  box.innerHTML = "<b style='color:#b7e08c'>WINPRIME</b><br><small>iniciando…</small>";
  document.body.appendChild(box);

  function pintar(p, res, dxy) {
    const cor = p.estado === 2 ? "#69c47a" : p.estado === 0 ? "#e57373" : "#cfcb92";
    const rot = p.estado === 2 ? "ALTISTA" : p.estado === 0 ? "BAIXISTA" : "DESCORRELACIONADO";
    let status;
    if (res.ok) status = "publicado ✓";
    else if (res.status === 401 || res.status === 403) status = "token invalido ✗ (Ctrl+Shift+K)";
    else status = "erro ao publicar (" + res.status + ")";
    let dxyLinha;
    if (!dxy) dxyLinha = "<span style='color:#e0a03a'>DXY: abra a aba do TradingView</span>";
    else if (dxy.velho) dxyLinha = "<span style='color:#e0a03a'>DXY desatualizado (reabra o TradingView)</span>";
    else dxyLinha = "<span style='color:#9fb08f'>DXY: " + (dxy.v >= 0 ? "+" : "") + dxy.v.toFixed(2) + "%</span>";
    box.innerHTML = "<b style='color:#b7e08c'>WINPRIME · Placar</b><br>" +
      "<span style='font-size:20px;font-weight:800;color:" + cor + "'>" + rot + "</span><br>" +
      "<span style='color:#69c47a'>" + p.altistas + " alt</span> · " +
      "<span style='color:#cfcb92'>" + p.neutros + " neu</span> · " +
      "<span style='color:#e57373'>" + p.baixistas + " bai</span> (" + p.total + " abertos)<br>" +
      "<small style='color:#9fb08f'>TV somados: " + p.tv_somados + " · fechados fora: " + p.tv_fechados + " · dup: " + p.tv_duplicados + "</small><br>" +
      dxyLinha + "<br>" +
      "<small style='color:#9fb08f'>" + new Date().toLocaleTimeString("pt-BR") + " · " + status + "</small>";
  }

  async function ciclo() {
    try {
      try { box.setAttribute("data-wp-ciclo", String((+box.getAttribute("data-wp-ciclo") || 0) + 1)); } catch (_) {}
      await fetchTV();
      const ativos = lerCarteira();
      if (!ativos.length) { box.innerHTML = "<b style='color:#b7e08c'>WINPRIME</b><br><small>aguardando a carteira carregar…</small>"; return; }
      const p = computar(ativos);
      let res = { ok: false, status: 0 };
      try { res = await publicar(p); } catch (e) {}
      pintar(p, res, ativos._dxy);
    } catch (e) {
      try { box.innerHTML = "<b style='color:#b7e08c'>WINPRIME</b><br><small>reprocessando… (" + (e && e.message ? e.message : "erro") + ")</small>"; } catch (_) {}
    }
  }

  function iniciar() {
    if (timer) return;
    timer = setInterval(ciclo, INTERVALO_MS);  // TIMER PRIMEIRO: garante retry mesmo se o 1o ciclo falhar
    ciclo();
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
    try { box.setAttribute("data-wp-token", (TOKEN && TOKEN.length >= 20) ? ("ok:" + TOKEN.length) : ("vazio:" + ((TOKEN && TOKEN.length) || 0))); } catch (_) {}
    if (TOKEN && TOKEN.length >= 20) { try { box.setAttribute("data-wp", "iniciar"); } catch (_) {} iniciar(); }
    else { try { box.setAttribute("data-wp", "pedirToken"); } catch (_) {} pedirToken(); }
  }, 2500);
})();
