# Manual de Atualização — Módulo de Auditoria Jurídica / Compliance

Este manual cobre a atualização do servidor `evolution.ricardo.home.nom.br` para incluir o novo módulo de Auditoria, com base no seu `docker-compose.yml` (build local via `Dockerfile`, containers `evolution_api` + `evolution_postgres` + `evolution_redis`).

**Boa notícia sobre as migrations do banco**: o `Dockerfile` já roda `Docker/scripts/deploy_database.sh` toda vez que o container sobe, e esse script executa `npm run db:deploy` automaticamente. Ou seja, **você não precisa rodar as migrations manualmente** — só precisa reconstruir a imagem e reiniciar o container que as 6 tabelas novas (`AuditConfig`, `ContactRoleMapping`, `AuditRecipient`, `AuditReport`, + a coluna `riskMatrix`) são criadas sozinhas.

---

## 0. Antes de começar — backup

Nunca pule esta etapa antes de atualizar um servidor em produção.

```bash
# Backup do banco Postgres
docker exec evolution_postgres pg_dump -U postgres evolution_db > backup_evolution_$(date +%Y%m%d_%H%M%S).sql

# Backup do .env atual
cp .env .env.backup_$(date +%Y%m%d_%H%M%S)
```

Guarde esses dois arquivos fora do servidor (ex.: baixe para sua máquina) até confirmar que tudo funcionou.

---

## 1. Atualizar o código no servidor

Se o servidor tem um clone git do repositório (forma recomendada):

```bash
cd /caminho/do/evolution-api   # onde está o docker-compose.yml
git status                     # confirme que não há alterações locais não commitadas
git pull origin main
```

Se o servidor **não** usa git (código copiado manualmente), transfira os arquivos alterados via `scp`/`rsync` a partir da sua máquina, mantendo a mesma estrutura de pastas. Neste caso, avise-me que eu listo exatamente quais arquivos mudaram para você copiar só o necessário.

---

## 2. Editar o `.env` do servidor (sem mexer no que já funciona)

Abra o `.env` que fica ao lado do `docker-compose.yml` no servidor:

```bash
nano .env
```

**Adicione** o bloco abaixo — sugiro colar logo depois da linha `EVOAI_ENABLED=false` e antes de `# Cache - Environment variables`. **Não apague nem altere nenhuma linha existente.**

```env
# Audit / Compliance module - Environment variables
AUDIT_ENABLED=false
AUDIT_ENCRYPTION_KEY=
AUDIT_GEMINI_API_KEY_GLOBAL=
AUDIT_CLAUDE_API_KEY_GLOBAL=
```

Gere a chave de criptografia direto no servidor e cole no lugar do valor vazio de `AUDIT_ENCRYPTION_KEY`:

```bash
openssl rand -hex 32
```

Deixe `AUDIT_ENABLED=false` por enquanto — você só vai ligar (`true`) depois que o container novo estiver no ar e as chaves de IA (próxima seção) estiverem configuradas. Isso evita que o scheduler tente rodar auditorias antes de tudo estar pronto.

Como `CACHE_REDIS_ENABLED=true` e `CACHE_REDIS_URI=redis://evolution_redis:6379/0` já estão no seu `.env`, a fila do módulo (BullMQ) vai usar esse Redis automaticamente — nada a mais a configurar aí.

---

## 3. Obter a API key do Google Gemini

1. Acesse **https://aistudio.google.com/** e faça login com uma conta Google.
2. No menu à esquerda (ou botão no topo), clique em **"Get API key"**.
3. Clique em **"Create API key"**.
4. Escolha um projeto do Google Cloud existente ou deixe o Studio criar um novo projeto pra você automaticamente.
5. A chave é gerada na hora (começa com `AIza...`). Clique em copiar.
6. **Importante — cobrança**: por padrão a chave entra no *free tier* (limite de requisições por minuto/dia). Para volume de produção, associe um projeto com faturamento ativado no [Google Cloud Console](https://console.cloud.google.com/billing) para evitar erros de limite excedido.
7. Guarde essa chave — você vai usá-la no cadastro do `AuditConfig` (seção 6) ou no `.env` como fallback global.

---

## 4. Obter a API key da Anthropic (Claude)

1. Acesse **https://console.anthropic.com/** e crie uma conta ou faça login.
2. No menu, vá em **Settings → API Keys** (ou acesse diretamente **https://console.anthropic.com/settings/keys**).
3. Clique em **"Create Key"**, dê um nome (ex.: `evolution-audit`) e confirme.
4. A chave é exibida **uma única vez** (começa com `sk-ant-...`) — copie e guarde imediatamente, pois o console não mostra ela de novo depois.
5. **Importante — cobrança**: a Anthropic exige um método de pagamento cadastrado e créditos na conta (**Settings → Billing**) antes da chave funcionar de verdade — sem isso as chamadas retornam erro de crédito insuficiente, mesmo com a chave válida.
6. Guarde essa chave — mesmo destino da chave do Gemini (seção 6 ou `.env`).

> Dica de segurança: essas duas chaves dão acesso a serviços pagos vinculados à sua conta. Trate-as como senha — não cole em chats, não commite no git.

---

## 4.1 Onde colocar as chaves — duas opções

**Opção A — Fallback global no `.env` (mais simples, comece por aqui)**

Cole as chaves nas variáveis que você já adicionou no passo 2:

```env
AUDIT_GEMINI_API_KEY_GLOBAL=AIza...sua_chave_aqui
AUDIT_CLAUDE_API_KEY_GLOBAL=sk-ant-...sua_chave_aqui
```

Qualquer `AuditConfig` que não tenha uma chave própria cadastrada vai usar automaticamente a chave global correspondente ao provedor escolhido (`GEMINI` ou `CLAUDE`).

**Opção B — Chave por configuração de auditoria (mais seguro/flexível)**

Não preencha as variáveis globais e, em vez disso, envie a chave no campo `apiKey` ao criar o `AuditConfig` pela API (seção 6). Ela é criptografada (AES-256-GCM, usando `AUDIT_ENCRYPTION_KEY`) antes de ser salva no banco e nunca é devolvida em nenhuma resposta da API.

Você pode misturar as duas: ter uma chave global de fallback e, ainda assim, dar a algumas auditorias específicas uma chave própria.

---

## 5. Reconstruir e subir o container atualizado

Com o `.env` salvo (ainda com `AUDIT_ENABLED=false`), reconstrua a imagem e suba os containers:

```bash
docker compose build evolution-api
docker compose up -d
```

(Se seu Docker for mais antigo, use `docker-compose` com hífen no lugar de `docker compose`.)

Acompanhe os logs da inicialização — é aqui que as migrations rodam automaticamente:

```bash
docker compose logs -f evolution-api
```

Você deve ver algo como:

```
Deploying migrations for postgresql
Migration succeeded
Prisma generate succeeded
```

Se aparecer `Migration failed`, **pare aqui** e me avise com o log completo antes de continuar — não force nada.

---

## 6. Habilitar o módulo e testar

1. Volte ao `.env` e mude `AUDIT_ENABLED=false` para `AUDIT_ENABLED=true`.
2. Suba de novo só para aplicar a variável (não precisa rebuildar, só recriar o container):
   ```bash
   docker compose up -d evolution-api
   ```
3. Confira nos logs se o worker e o agendador subiram:
   ```bash
   docker compose logs evolution-api | grep -i audit
   ```
   Esperado: `Audit execution worker started` e `Audit scheduler started with 0 active schedule(s)` (0 é normal — ainda não existe nenhuma auditoria cadastrada).

Teste rápido dos endpoints (troque `SUA_APIKEY` pela sua `AUTHENTICATION_API_KEY` do `.env`):

```bash
# Cadastrar um contato com papel (ex.: um gerente)
curl -X POST https://evolution.ricardo.home.nom.br/audit/contacts/create \
  -H "apikey: SUA_APIKEY" -H "Content-Type: application/json" \
  -d '{"phoneNumber":"5511999999999","name":"Fulano Gerente","role":"GERENTE"}'

# Cadastrar um destinatário do relatório (ex.: a diretoria)
curl -X POST https://evolution.ricardo.home.nom.br/audit/recipients/create \
  -H "apikey: SUA_APIKEY" -H "Content-Type: application/json" \
  -d '{"name":"Diretoria","phoneNumber":"5511988888888","triggerCondition":"ALWAYS"}'

# Cadastrar a auditoria em si (semanal, toda segunda às 2h, usando o Claude)
curl -X POST https://evolution.ricardo.home.nom.br/audit/config/create \
  -H "apikey: SUA_APIKEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Auditoria Semanal",
    "periodicity": "WEEKLY",
    "cronExpression": "0 2 * * 1",
    "selectedInstances": ["ALL"],
    "aiProvider": "CLAUDE",
    "aiModel": "claude-3-5-sonnet-latest"
  }'

# Rodar uma auditoria agora, sem esperar o cron (use o "id" retornado no passo anterior)
curl -X POST https://evolution.ricardo.home.nom.br/audit/config/<ID_DO_CONFIG>/run \
  -H "apikey: SUA_APIKEY"
```

Depois de rodar o "`/run`", acompanhe os logs (`docker compose logs -f evolution-api`) para ver a execução acontecendo, e confira se a mensagem + PDF chegaram no WhatsApp do número cadastrado como destinatário.

---

## 7. Se algo der errado — rollback rápido

```bash
# Volta pro .env anterior
cp .env.backup_AAAAMMDD_HHMMSS .env

# Volta pro código anterior (se usou git)
git log --oneline -5      # confirme o commit anterior
git checkout <commit_anterior>

# Reconstrói com o código/config antigos
docker compose build evolution-api
docker compose up -d
```

O backup do banco (`backup_evolution_*.sql`) só seria necessário restaurar se as migrations tivessem corrompido dados existentes — o que não deve acontecer aqui, já que as mudanças só **adicionam** tabelas/colunas novas, sem tocar nas existentes.

---

## Checklist resumido

- [ ] Backup do banco e do `.env`
- [ ] `git pull` (ou transferência manual do código)
- [ ] Adicionar bloco `AUDIT_*` no `.env`, com `AUDIT_ENABLED=false`
- [ ] Gerar e colar `AUDIT_ENCRYPTION_KEY`
- [ ] Criar API key no Google AI Studio (Gemini)
- [ ] Criar API key no Anthropic Console (Claude) + configurar billing
- [ ] Colar as chaves em `AUDIT_GEMINI_API_KEY_GLOBAL`/`AUDIT_CLAUDE_API_KEY_GLOBAL` (ou planejar cadastrar por `AuditConfig`)
- [ ] `docker compose build evolution-api && docker compose up -d`
- [ ] Conferir logs: migrations aplicadas com sucesso
- [ ] Mudar `AUDIT_ENABLED=true` e recriar o container
- [ ] Conferir logs: worker e scheduler iniciados
- [ ] Cadastrar contatos/destinatários/config de teste via `curl`
- [ ] Rodar `/run` manual e confirmar recebimento no WhatsApp
