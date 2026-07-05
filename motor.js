/* WINPRIME - Motor do Placar Macro (versao GitHub Actions: roda uma vez e sai)
 * Le os ~25 ativos, aplica a regra +/-0,30% (VIX e DXY invertidos),
 * decide POSITIVO/NEUTRO/NEGATIVO e grava estado.json.
 * Roda so dentro de 08:50-17:55 (America/Sao_Paulo, seg-sex); fora disso
 * grava "fora do pregao". O agendamento fica no .github/workflows/placar.yml
 */
const fs = require("fs");
const ARQUIVO = "./estado.json";
const LIMIAR = 0.30, CORTE_POS = 3, CORTE_NEG = -3;
const INICIO_MIN = 8 * 60 + 50, FIM_MIN = 17 * 60 + 55;

const CARTEIRA = [
  { nome: "Ibovespa",        symbol: "^BVSP",     inverso: false },
  { nome: "Mini Ibov (WIN)", symbol: "^BVSP",     inverso: false },
  { nome: "EWZ (Brasil NY)", symbol: "EWZ",       inverso: false },
  { nome: "S&P 500 fut",     symbol: "ES=F",      inverso: false },
  { nome: "Nasdaq 100 fut",  symbol: "NQ=F",      inverso: false },
  { nome: "Dow fut",         symbol: "YM=F",      inverso: false },
  { nome: "FTSE 100",        symbol: "^FTSE",     inverso: false },
  { nome: "DAX",             symbol: "^GDAXI",    inverso: false },
  { nome: "Euro Stoxx 50",   symbol: "^STOXX50E", inverso: false },
  { nome: "IBEX 35",         symbol: "^IBEX",     inverso: false },
  { nome: "Hang Seng",       symbol: "^HSI",      inverso: false },
  { nome: "China H-Shares",  symbol: "^HSCE",     inverso: false },
  { nome: "Nikkei 225",      symbol: "^N225",     inverso: false },
  { nome: "TOPIX",           symbol: "^TOPX",     inverso: false },
  { nome: "KOSPI 200",       symbol: "^KS11",     inverso: false },
  { nome: "S&P/ASX 200",     symbol: "^AXJO",     inverso: false },
  { nome: "Brent",           symbol: "BZ=F",      inverso: false },
  { nome: "WTI",             symbol: "CL=F",      inverso: false },
  { nome: "Ouro",            symbol: "GC=F",      inverso: false },
  { nome: "Prata",           symbol: "SI=F",      inverso: false },
  { nome: "Morgan Stanley",  symbol: "MS",        inverso: false },
  { nome: "VIX",             symbol: "^VIX",      inverso: true  },
  { nome: "Mini VIX",        symbol: "^VIX",      inverso: true  },
  { nome: "DXY (dolar)",     symbol: "DX-Y.NYB",  inverso: true  },
];

async function buscarVariacao(symbol) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/"
            + encodeURIComponent(symbol) + "?range=1d&interval=1d";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const meta = (await r.json()).chart.result[0].meta;
  const preco = meta.regularMarketPrice, ant = meta.chartPreviousClose ?? meta.previousClose;
  if (!preco || !ant) throw new Error("sem preco");
  return ((preco - ant) / ant) * 100;
}
function voto(p, inv) { let v = p >= LIMIAR ? 1 : (p <= -LIMIAR ? -1 : 0); return inv ? -v : v; }
function agoraSP() { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour12: false })); }
function dentroDaJanela(d) { const dia = d.getDay(); if (dia === 0 || dia === 6) return false; const m = d.getHours() * 60 + d.getMinutes(); return m >= INICIO_MIN && m <= FIM_MIN; }
function gravar(o) { fs.writeFileSync(ARQUIVO, JSON.stringify(o, null, 2)); }

(async () => {
  const d = agoraSP();
  if (!dentroDaJanela(d)) {
    gravar({ estado: 1, aberto: false, altistas: 0, neutros: 0, baixistas: 0, total: 0,
             lista_altistas: [], lista_neutros: [], lista_baixistas: [],
             atualizado: d.toISOString(), obs: "Fora do horario de pregao (08:50-17:55)." });
    console.log("fora da janela."); return;
  }
  let soma = 0; const alt = [], neu = [], bai = [];
  await Promise.all(CARTEIRA.map(async (a) => {
    try { const v = voto(await buscarVariacao(a.symbol), a.inverso);
      soma += v; (v > 0 ? alt : v < 0 ? bai : neu).push(a.nome);
    } catch (e) { neu.push(a.nome + " (s/dado)"); }
  }));
  const estado = soma >= CORTE_POS ? 2 : (soma <= CORTE_NEG ? 0 : 1);
  gravar({ estado, aberto: true, soma, altistas: alt.length, neutros: neu.length, baixistas: bai.length,
           total: CARTEIRA.length, lista_altistas: alt, lista_neutros: neu, lista_baixistas: bai,
           atualizado: d.toISOString() });
  console.log((estado === 2 ? "POSITIVO" : estado === 0 ? "NEGATIVO" : "NEUTRO") + " soma=" + soma);
})();
