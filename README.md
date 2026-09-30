# 道 afazeres · やること

Painel pessoal de projetos e tarefas do **ramosxzz**. Minimalista, com alma japonesa.
Front em React, back num Cloudflare Worker e banco no Cloudflare D1, tudo no mesmo deploy.

```
墨 Sumi · 和紙 Washi · 藍 Ai · 抹茶 Matcha
```

---

## ✨ O que tem

| | Recurso | Detalhes |
|---|---|---|
| 道場 | **Dōjō (início)** | Saudação por horário (おはよう / こんにちは / こんばんは), provérbio japonês do dia, tarefas de hoje e atrasadas, projetos em foco, mapa de calor de 1 ano, distribuição por status e feed de atividade |
| 巻物 | **Projetos** | Kanban com arrastar e soltar entre **Ideias → Em andamento → Pausado → Suporte → Finalizado** (+ Arquivado), visão em cards e em tabela ordenável, filtros por tipo, prioridade e stack |
| 🏯 | **Detalhe do projeto** | Banner com ícone em kanji/emoji e cor própria, links (repo, produção, docs/Figma), stack, prazos, anel de progresso, tarefas por tipo (feature / bug / suporte / manutenção / estudo), **notas em Markdown com autosave** e histórico |
| 任務 | **Tarefas** | Agenda (atrasadas, hoje, amanhã, 7 dias, depois, sem prazo) ou agrupadas por projeto, com **adição rápida por sintaxe** (veja abaixo) |
| 集中 | **Foco (Pomodoro)** | Timer com pincelada de tinta, ciclos 🌸, pausa curta e longa, som de sino de vento (風鈴) sintetizado, notificação do navegador, tempo no título da aba, mini-timer na sidebar, gráfico de minutos por dia e por projeto. Continua rodando se você recarregar a página |
| 日記 | **Diário de dev** | Uma página por dia com humor, template "fiz / aprendi / travou / amanhã" e faixa de humor dos últimos 30 dias |
| 狐 | **Kitsune (mascote)** | Uma raposa em traço fino que **ganha uma cauda a cada patente**, de 1 até a lendária kyūbi (九尾) de 9 caudas. Ganha a marca vermelha na testa em Samurai e fogos-fátuos (kitsunebi) nas últimas patentes. Reage ao seu dia (feliz, concentrada no pomodoro, preocupada com atrasos, dormindo de madrugada). O nome dela (padrão: Kon) muda nas configurações |
| 実績 | **Conquistas** | XP, níveis e patentes (見習い Aprendiz → 侍 Samurai → 将軍 Shōgun → 伝説 Lenda), a evolução da kitsune, sequência de dias 🔥 e 19 conquistas em forma de selo hanko |
| 完 | **Celebrações** | Carimbo hanko 完了 com taiko ao finalizar projeto, e level-up com a kitsune (avisando quando ela ganha cauda nova) |
| 探 | **Paleta de comandos** | `Ctrl K` busca projetos e tarefas, navega, troca tema, controla o pomodoro |
| 設定 | **Configurações** | 4 temas (escuro e claro, com uma única cor de destaque), pétalas de sakura discretas (desligadas por padrão), sons, nome da kitsune, backup e restauração em JSON |

Também funciona no celular (barra inferior e modais em bottom sheet) e dá pra instalar como app (manifest PWA).

### Adição rápida

```
Corrigir login #loja !alta @amanha ~bug
```

| Token | Efeito |
|---|---|
| `#nome` | vincula ao projeto (basta o começo do nome) |
| `!baixa` `!media` `!alta` `!urgente` ou `!1`…`!4` | prioridade |
| `@hoje` `@amanha` `@seg`…`@dom` `@+3` `@15/10` `@2026-10-15` | prazo |
| `~bug` `~suporte` `~estudo` `~chore` (ou começar com `bug:`) | tipo |

### Atalhos

`Ctrl K` ou `/` paleta · `N` nova tarefa · `P` novo projeto · `F` iniciar/pausar foco · `G` + `D/P/T/F/J/C` navegar · `?` ajuda · `Ctrl Enter` salvar formulário

### XP

Tarefa concluída 5/10/20/35 XP (por prioridade) · projeto finalizado 150 XP · 1 XP por minuto de foco · 15 XP por página de diário.
O XP é calculado a partir do estado atual, então desmarcar uma tarefa tira o XP dela.

---

## 🧱 Stack

- **Front:** React 19, TypeScript, Vite, Zustand, wouter, dnd-kit, lucide, marked + DOMPurify. CSS próprio com design tokens por tema, sem framework de UI. Fontes Inter + Noto Sans JP
- **Back:** Cloudflare Worker com [Hono](https://hono.dev)
- **Banco:** Cloudflare D1 (SQLite). **As migrações rodam sozinhas** na primeira requisição (`worker/db.ts`), sem precisar de comando de migração
- **Auth:** senha única (segredo `APP_PASSWORD`) → cookie HttpOnly assinado com HMAC, válido por 30 dias. Trocar a senha derruba todas as sessões

```
src/        front-end (pages/, components/, lib/, styles/)
worker/     API /api/* (index.ts, auth.ts, db.ts)
shared/     tipos usados pelos dois lados
```

---

## 💻 Rodando localmente

```bash
npm install
cp .dev.vars.example .dev.vars   # senha local: "dev"
npm run dev                      # http://localhost:5173
```

O `npm run dev` sobe o Vite **e** o Worker juntos (via `@cloudflare/vite-plugin`), com um D1 local em `.wrangler/`.

---

## ☁️ Deploy no Cloudflare (com deploy automático pelo Git)

> Use **Workers**, não Pages. O Cloudflare recomenda Workers com static assets para apps novos, e é assim que o projeto está configurado (`wrangler.jsonc`).

**1. Banco D1** ✅ já criado

O banco `afazeres-db` (região ENAM) já existe na conta e o `database_id` já está no `wrangler.jsonc`. Se um dia precisar recriar: `npx wrangler d1 create afazeres-db` e troque o ID.

**2. Conecte o repositório**

**Workers & Pages → Create → Import a repository** → escolha `ramosxzz/afazeres`.

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

**3. Defina a senha**

Em **Workers & Pages → afazeres → Settings → Variables and Secrets**, adicione um **Secret** chamado `APP_PASSWORD`. Ou pelo terminal:

```bash
npx wrangler secret put APP_PASSWORD
```

Pronto: a cada push na branch principal o Cloudflare builda e publica. Na primeira requisição o Worker cria as tabelas sozinho.

**Deploy manual** (opcional): `npm run deploy`.

### 🔒 Mais segurança (recomendado)

A senha já protege a API, mas como é um app pessoal vale colocar o **Cloudflare Access** na frente (Zero Trust → Access → Applications → Self-hosted, liberando só o seu e-mail). É grátis até 50 usuários e adiciona login com código por e-mail ou Google/GitHub antes mesmo de a página carregar.

### Evoluindo o banco

Para mudar o schema, adicione um item novo **no fim** da lista `MIGRATIONS` em `worker/db.ts` (nunca edite um que já foi publicado). Ele é aplicado automaticamente no próximo deploy.

---

## 🗺️ Ideias para as próximas versões

- **Integração com GitHub:** mostrar último commit, PRs abertos e status do CI de cada projeto (Worker + token em secret)
- **Monitor de uptime** para projetos em suporte: Cron Trigger do Worker pingando o `live_url` e alertando se cair
- **Resumo semanal por e-mail ou Telegram** (Cron Trigger): o que foi entregue, horas de foco, bugs fechados
- **Time tracking por projeto** para faturar freelas, com valor/hora e relatório em PDF
- **Anexos e prints** por projeto usando R2
- **Subtarefas / checklist** dentro de cada tarefa
- **Tarefas recorrentes** (ex.: "renovar certificado" todo mês, "backup" toda sexta)
- **Modo zen**: tela cheia só com o timer e a tarefa atual, com trilha lo-fi
- **Calendário** com prazos de projetos e tarefas, e exportação `.ics`
