# 📡 RadarInvest

Dashboard de oportunidades de investimento em ações e FIIs da B3, com análise fundamentalista automática e notícias de tecnologia e mineração.

## ✨ Funcionalidades

- **Ranking de Ações BR** — pontuação 0–100 baseada em P/L, P/VP, ROE, Dividend Yield e Endividamento
- **Ranking de FIIs** — pontuação baseada em P/VP, Dividend Yield, FFO Yield e Liquidez
- **Notícias** — feeds de tecnologia, mineração e mercados financeiros
- **Frase do dia** — inspiração diária para profissionais de TI
- Dados do [Fundamentus](https://www.fundamentus.com.br) atualizados a cada 2 horas
- Layout responsivo (desktop e mobile)

## 🚀 Deploy (GitHub + Cloudflare Pages)

### 1. Criar repositório no GitHub

```bash
cd invest-radar
git init
git add .
git commit -m "feat: initial commit - RadarInvest dashboard"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/invest-radar.git
git push -u origin main
```

### 2. Conectar ao Cloudflare Pages

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages**
2. Clique em **Create a project** → **Connect to Git**
3. Selecione o repositório `invest-radar`
4. Configure o build:
   - **Framework preset:** `None`
   - **Build command:** *(deixar vazio)*
   - **Build output directory:** `/` (raiz)
5. Clique em **Save and Deploy**

O deploy leva ~1 minuto. A cada `git push`, o Cloudflare re-deploya automaticamente.

### 3. Domínio personalizado (opcional, gratuito)

Em Pages → seu projeto → **Custom domains** → adicione seu domínio.

## 📁 Estrutura

```
invest-radar/
├── index.html              # Página principal (SPA)
├── assets/
│   ├── css/style.css       # Estilos
│   └── js/app.js           # Lógica do frontend
├── functions/
│   └── api/
│       ├── acoes.js        # Worker: scraping + scoring de ações
│       ├── fiis.js         # Worker: scraping + scoring de FIIs
│       └── news.js         # Worker: agregação de RSS feeds
├── _headers                # Headers HTTP de segurança
└── .gitignore
```

## 🧮 Critérios de Pontuação

### Ações (0–100 pts)
| Indicador | Peso | Critério ideal |
|-----------|------|----------------|
| P/L | 25 pts | Entre 6 e 12 |
| P/VP | 20 pts | Abaixo de 0,80 |
| ROE | 20 pts | Acima de 25% |
| Dividend Yield | 20 pts | Acima de 10% |
| Dívida/PL | 15 pts | Abaixo de 0,30 |

### FIIs (0–100 pts)
| Indicador | Peso | Critério ideal |
|-----------|------|----------------|
| P/VP | 35 pts | Abaixo de 0,80 |
| Dividend Yield | 35 pts | Acima de 14% |
| Liquidez Diária | 15 pts | Acima de R$ 2M |
| FFO Yield | 15 pts | ≥ Dividend Yield |

## ⚠️ Aviso Legal

Este projeto é educacional. As pontuações são calculadas automaticamente e **não constituem recomendação de investimento**. Sempre faça sua própria análise.

## 🛠️ Tecnologias

- HTML5 + CSS3 + JavaScript (Vanilla, sem frameworks)
- [Cloudflare Pages](https://pages.cloudflare.com) (hospedagem gratuita)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/) (Workers gratuitos)
- Dados: [Fundamentus](https://www.fundamentus.com.br)
