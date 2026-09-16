# Manual de Instalação — Evolution API (do zero) em servidor Linux

Este manual cobre a instalação completa, do zero, deste projeto (fork `Admsmartfit/evolutionmeu`, com o módulo de Auditoria já incluso) num servidor Linux limpo, usando Docker Compose — a mesma forma como o servidor de produção atual (`evolution.ricardo.home.nom.br`) roda hoje.

Se você já tem um servidor rodando e só precisa **atualizar** para uma versão nova do código, use [manual-atualizacao-modulo-auditoria.md](./manual-atualizacao-modulo-auditoria.md) em vez deste.

---

## 0. Visão geral do que vai ser instalado

- **Docker + Docker Compose** — tudo roda em containers, nada de Node.js instalado direto no host.
- Containers definidos em `docker-compose.yml`:
  - `evolution_api` — a API (build local via `Dockerfile`, não uma imagem pronta do Docker Hub).
  - `evolution_postgres` — banco Postgres.
  - `evolution_redis` — cache/fila.
  - `evolution_minio` — armazenamento de mídia (S3-compatível).
  - `evolution_whisper` — transcrição de áudio (opcional, roda sempre mas só é usado se você habilitar).
- **Cloudflare Tunnel** (`cloudflared`) — é assim que o servidor expõe a API na internet sem abrir portas no roteador/firewall. Não é obrigatório (dá pra expor de outras formas), mas é o padrão usado neste ambiente.

---

## 1. Pré-requisitos do servidor

- Linux (Ubuntu/Debian nos exemplos abaixo — ajuste os comandos de pacote se for outra distro).
- Acesso root ou sudo.
- Pelo menos 2GB de RAM livres e 5GB de disco (a imagem + Postgres + Redis + Minio crescem com o uso).
- Um domínio próprio, se for expor a API publicamente (pode ser um subdomínio, ex.: `algo.seudominio.com`).

---

## 2. Instalar Docker e Docker Compose

```bash
# Atualiza pacotes
sudo apt update && sudo apt upgrade -y

# Instala o Docker (script oficial)
curl -fsSL https://get.docker.com | sudo sh

# Adiciona seu usuário ao grupo docker (evita precisar de sudo em todo comando docker)
sudo usermod -aG docker $USER
newgrp docker

# Confirma que o Docker Compose plugin veio junto
docker compose version
```

Se `docker compose version` der erro, instale o plugin separadamente:

```bash
sudo apt install -y docker-compose-plugin
```

---

## 3. Clonar o repositório

```bash
sudo mkdir -p /opt/evolution-api
sudo chown $USER:$USER /opt/evolution-api
cd /opt/evolution-api

git clone https://github.com/Admsmartfit/evolutionmeu.git .
```

(Se o repositório for privado, configure antes uma chave SSH ou um token de acesso pessoal do GitHub para conseguir clonar.)

---

## 4. Configurar o `.env`

```bash
cp env.example .env
nano .env
```

No mínimo, ajuste estas variáveis antes de subir o serviço (o restante do arquivo já vem com valores padrão razoáveis):

```env
# Chave de autenticação global da API — troque por um valor aleatório forte, guarde em local seguro
AUTHENTICATION_API_KEY=GERE_UM_VALOR_ALEATORIO_AQUI

# Idioma
LANGUAGE=pt-BR

# Armazenamento de mídia via MinIO (o container evolution_minio já vem no docker-compose.yml)
S3_ENABLED=true
S3_ACCESS_KEY=ESCOLHA_UM_USUARIO
S3_SECRET_KEY=ESCOLHA_UMA_SENHA_FORTE
S3_BUCKET=evolution
S3_ENDPOINT=SEU_DOMINIO_OU_IP_AQUI   # ex.: s3.seudominio.com, se for proxiar o MinIO por HTTPS (veja seção 7)
S3_PORT=443
S3_USE_SSL=true
S3_REGION=us-east-1
```

Gere um valor aleatório forte para `AUTHENTICATION_API_KEY` com:

```bash
openssl rand -hex 32
```

**Não precisa mexer** em `DATABASE_CONNECTION_URI`, `CACHE_REDIS_URI` nem `SERVER_PORT` — o `docker-compose.yml` já sobrescreve essas três com os valores corretos para os containers internos (`evolution_postgres`, `evolution_redis`, porta `8085`), independente do que estiver no `.env`.

### 4.1 Habilitar o módulo de Auditoria (opcional, mas recomendado já configurar)

Adicione também este bloco, com `AUDIT_ENABLED=false` por enquanto — você liga só depois que tudo estiver no ar (evita o agendador tentar rodar antes da hora):

```env
# Audit / Compliance module
AUDIT_ENABLED=false
AUDIT_ENCRYPTION_KEY=
AUDIT_GEMINI_API_KEY_GLOBAL=
AUDIT_CLAUDE_API_KEY_GLOBAL=
```

Gere a chave de criptografia:

```bash
openssl rand -hex 32
```

Cole o resultado em `AUDIT_ENCRYPTION_KEY`. As chaves de IA (Gemini/Claude) e o passo de habilitar o módulo estão detalhados na seção 3 e 4 de [manual-atualizacao-modulo-auditoria.md](./manual-atualizacao-modulo-auditoria.md) — siga a partir de lá depois que a instalação abaixo estiver de pé.

---

## 5. Subir os containers

```bash
cd /opt/evolution-api
docker compose build
docker compose up -d
```

A primeira `build` demora alguns minutos (instala dependências e compila o TypeScript dentro da imagem). Acompanhe os logs da subida — é aqui que as migrations do banco rodam **automaticamente** (o `Dockerfile` executa `Docker/scripts/deploy_database.sh` antes de iniciar a API, então você nunca precisa rodar `npm run db:deploy` manualmente):

```bash
docker compose logs -f evolution-api
```

Espere ver algo como:

```
Deploying migrations for postgresql
Migration succeeded
Prisma generate succeeded
...
[Nest] LOG [NestApplication] Nest application successfully started
```

Se aparecer `Migration failed`, pare e revise o log completo antes de continuar.

Confirme que todos os containers estão de pé:

```bash
docker compose ps
```

Deve listar `evolution_api`, `evolution_postgres`, `evolution_redis`, `evolution_minio` e `evolution_whisper` como `running`/`healthy`.

---

## 6. Testar localmente (antes de expor na internet)

```bash
curl http://localhost:8085/ -H "apikey: SUA_AUTHENTICATION_API_KEY"
```

Deve responder com um JSON de status da API (versão, uptime, etc.). Se der `connection refused`, confira `docker compose logs evolution-api` para ver o erro de inicialização.

---

## 7. Expor publicamente

### Opção A — Cloudflare Tunnel (recomendado, sem abrir portas no firewall)

1. No [dashboard do Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks → Tunnels → Create a tunnel**, escolha **Cloudflared**, dê um nome e siga o passo de instalar o `cloudflared` no servidor (o próprio dashboard gera o comando de instalação + o token do túnel para o seu servidor específico).
2. Depois de instalado e conectado (o dashboard mostra o túnel como "Healthy"), vá em **Public Hostname → Add a public hostname**:
   - Subdomínio: o que preferir (ex.: `evolution`)
   - Domínio: o seu domínio cadastrado na Cloudflare
   - URL do serviço: `http://localhost:8085`
3. Salve. A API já deve responder em `https://SEU_SUBDOMINIO.SEUDOMINIO.com`.

Repita o passo 2 para outros serviços que você queira expor (ex.: o MinIO console/API), sempre apontando para `localhost:PORTA` — nunca é preciso abrir portas no roteador/firewall com essa abordagem.

### Opção B — Reverse proxy tradicional (Nginx/Caddy) + certificado próprio

Se preferir não usar Cloudflare Tunnel, configure um Nginx/Caddy no host apontando para `localhost:8085` com certificado TLS (Let's Encrypt), e abra as portas 80/443 no firewall. Isso foge do escopo deste manual — me avise se quiser esse roteiro também.

---

## 8. Criar a primeira instância do WhatsApp

Com a API já respondendo (local ou pelo domínio público):

```bash
curl -X POST https://SEU_DOMINIO/instance/create \
  -H "apikey: SUA_AUTHENTICATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "minha-instancia", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```

A resposta traz um QR Code (base64) — escaneie no WhatsApp do celular (Aparelhos conectados → Conectar aparelho) para ativar a instância.

---

## 9. Segurança básica antes de deixar em produção

- **Nunca** exponha as portas de `evolution_postgres` (5432), `evolution_redis` (6379) ou do MinIO console (9001) diretamente na internet — no `docker-compose.yml` atual, Postgres e Redis já não publicam porta para o host (só rede interna Docker); mantenha assim.
- Troque `AUTHENTICATION_API_KEY` por um valor gerado aleatoriamente (nunca deixe o valor de exemplo do `.env.example`).
- Guarde o `.env` fora do controle de versão (já está no `.gitignore`) e faça backup dele em local seguro — ele tem as credenciais do MinIO, a chave global da API e (se configurado) as chaves de IA.
- Configure backups periódicos do Postgres:
  ```bash
  docker exec evolution_postgres pg_dump -U postgres evolution_db > backup_evolution_$(date +%Y%m%d_%H%M%S).sql
  ```
  Automatize isso com um cron no host, salvando os `.sql` fora do próprio servidor.

---

## 10. Checklist resumido

- [ ] Docker + Docker Compose instalados
- [ ] Repositório clonado em `/opt/evolution-api`
- [ ] `.env` criado a partir de `env.example`, com `AUTHENTICATION_API_KEY` e credenciais do MinIO trocadas
- [ ] (Opcional) bloco `AUDIT_*` adicionado com `AUDIT_ENABLED=false` e `AUDIT_ENCRYPTION_KEY` gerada
- [ ] `docker compose build && docker compose up -d`
- [ ] Logs confirmam `Migration succeeded` e a API subiu
- [ ] `docker compose ps` mostra todos os containers rodando
- [ ] Teste local (`curl localhost:8085`) respondeu
- [ ] Túnel Cloudflare (ou outro reverse proxy) configurado e domínio respondendo
- [ ] Primeira instância do WhatsApp criada e QR Code escaneado
- [ ] Backup do Postgres agendado
- [ ] (Opcional) Módulo de Auditoria configurado seguindo [manual-atualizacao-modulo-auditoria.md](./manual-atualizacao-modulo-auditoria.md) a partir da seção 3
