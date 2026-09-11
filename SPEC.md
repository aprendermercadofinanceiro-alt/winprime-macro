# SPEC — Placar Macro WINPRIME (v2)

Documento-mestre da metodologia do placar. Fonte única de verdade.
Última revisão: 2026-09-11.

## 1. Objetivo
Gerar um placar macro (POSITIVO / NEUTRO-descorrelacionado / NEGATIVO) que oriente a leitura do mini índice (WIN), a partir de ativos globais, juros BR, forex e a bolsa brasileira.

## 2. Bandas (sobre a Var% diária de cada ativo)
- POSITIVO:        Var% >= +0,30  -> +1
- Levemente alta:  +0,01 a +0,29  -> +0,5
- NEUTRO:          0,00           ->  0
- Levemente neg.:  -0,01 a -0,29  -> -0,5
- NEGATIVO:        Var% <= -0,30  -> -1

## 3. Inversão (caindo = risk-on = contribuição positiva)
Invertidos (ponto x -1): VIX, DXY, DI1F2027, DI1F2029, DI1F2031, DI1F2033, USDBRL, WDO1!
Normais (subindo = +): índices/ações, EURUSD, GBPUSD, AUDUSD, NZDUSD, USDJPY

## 4. Grupos e pesos
- x3 Primários: Nasdaq, S&P 500, Dow Jones, VIX*, DXY*
- x3 Juros: DI1F2027, DI1F2029, DI1F2031, DI1F2033 (invertidos)
- x2 Complementares: DAX, EuroStoxx 50, ASX 200, IBEX 35, China H-Shares, Hang Seng, FTSE 100, Nikkei 225, Topix
- x1 Forex: WDO1!*, USDBRL*, EURUSD, GBPUSD, NZDUSD, AUDUSD, USDJPY
- x1 Brasil (após 10:00 BRT): WEG3, ITUB4, BBDC4, BBAS3, IBOV, BOVA11, EWZ, PETR3, PETR4, ABEV3, CXSE3, VALE3, IFNC + gringos MS, JPM, UBS
- ALVO (fora da conta): WIN1!

(* = invertido)

## 5. Veredito
score = soma(ponto x peso dos participantes) / soma(peso dos participantes)  -> intervalo [-1, +1]
- score >= +0,33  -> POSITIVO (estado 2)
- score <= -0,33  -> NEGATIVO (estado 0)
- entre -0,33 e +0,33 -> NEUTRO (estado 1)
- Dentro do neutro, se dispersão alta (altistas e baixistas ambos >= ~30% dos participantes, ou global divergindo do Brasil) -> rótulo "descorrelacionado".

## 6. Fases horárias (America/Sao_Paulo)
- Janela de operação: seg-sex, 08:50 a 17:55.
- Antes das 10:00: conta global + juros + forex.
- A partir das 10:00: entram ações BR, IFNC e gringos (abertura da B3).
- 10:30: abre o mercado americano à vista (marcar volatilidade no mini índice).

## 7. Fontes de dados
- Global: Yahoo Finance (v8 chart).
- Brasil / juros / forex: watchlist do TradingView (conta do usuário).
- Gringos (MS, JPM, UBS): Yahoo.

## 8. Publicação
Grava estado.json mantendo os campos lidos pelo painel:
estado, aberto, altistas, neutros, baixistas, fechados, total, lista_altistas, lista_neutros, lista_baixistas, atualizado (ISO -03:00), obs.
Campos extras opcionais: soma, score, regime, dxy.

## 9. Fonte única (sem conflito)
O leitor v2 é o único gravador. Devem ser desligados:
- userscript WINPRIME (Tampermonkey);
- workflow GitHub Actions .github/workflows/placar.yml.

## 10. Premissas assumidas (revisar quando quiser)
- Forex com peso x1; USDJPY tratado como risk-on quando sobe.
- DIs com peso de primário (x3).
- Tickers Yahoo validados: ^IXIC/NQ=F, ES=F, YM=F, ^VIX, DX-Y.NYB, ^GDAXI, ^STOXX50E, ^AXJO, ^IBEX, ^HSCE, ^HSI, ^FTSE, ^N225, 1306.T (Topix), MS, JPM, UBS.
- Tickers TradingView (Brasil/juros/forex): BMFBOVESPA:* e TVC:* conforme a watchlist do usuário.
