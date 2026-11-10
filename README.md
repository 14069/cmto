# CMTO VI · Sistema de Gestão Disciplinar

Plataforma web institucional de acompanhamento disciplinar do **Colégio Militar do Estado do Tocantins — Professora Antonina Milhomem**.

Sistema completo com gestão de turmas, alunos, ocorrências, elogios, TACs, relatórios em PDF, auditoria, hierarquia de permissões e workflow de aprovação.

---

## 🏛️ Arquitetura

- **Backend**: Node.js + Express + Prisma + SQLite
- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Autenticação**: JWT
- **PDFs**: PDFKit
- **E-mail**: Nodemailer (opcional)

---

## ✨ Funcionalidades

### Gestão de Conceito Disciplinar
- Conceito numérico (0-10) iniciando em 8.0
- Cálculo automático com regras configuráveis
- Histórico completo de mudanças
- Faixas pré-definidas para TMDs (Leve, Médio, Grave, Gravíssimo)
- Elogios (Coletivo, Individual, Menção Honrosa)

### Hierarquia de Permissões (5 níveis)
| Cargo | Permissões |
|---|---|
| **Admin** | Acesso total ao sistema |
| **Coord. Disciplinar** | Aprovação de TMDs, gestão de ocorrências |
| **Coord. Pedagógico** | Elogios, TACs, acompanhamento |
| **Monitor** | Anotações e TMDs (aguarda aprovação para Graves+) |
| **Professor** | Apenas anotações |

### Recursos Avançados
- ✅ Auditoria completa (log imutável de todas as ações)
- ✅ Workflow de aprovação para TMDs Graves/Gravíssimos
- ✅ Geração automática de TMD após 4 anotações
- ✅ Direito ao contraditório (defesa do aluno)
- ✅ Notificações em tempo real
- ✅ Calendário disciplinar
- ✅ TACs (Termos de Ajuste de Conduta) com prazos
- ✅ Relatórios PDF (individual e por turma)
- ✅ Categorização de ocorrências
- ✅ Configurações ajustáveis (limiares, ciclo letivo)

---

## 🚀 Instalação

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### 1. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

O servidor sobe em `http://localhost:3333`

### 2. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O frontend abre em `http://localhost:5173`

---

## 🔐 Credenciais de Teste

Após rodar o seed (`npm run db:seed`):

| Cargo | E-mail | Senha |
|---|---|---|
| Administrador | `admin@cmto.edu.br` | `admin123` |
| Coord. Disciplinar | `disciplina@cmto.edu.br` | `admin123` |
| Coord. Pedagógico | `pedagogico@cmto.edu.br` | `admin123` |
| Monitor (9º Ano A) | `monitor@cmto.edu.br` | `admin123` |

---

## 📁 Estrutura

```
cmto-vi/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Schema do banco
│   └── src/
│       ├── server.js              # Express principal
│       ├── routes/                # Rotas da API
│       ├── services/              # Lógica de negócio
│       ├── middleware/            # Auth, audit, errors
│       └── seed/                  # Dados iniciais
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Roteador
│   │   ├── pages/                 # Páginas do sistema
│   │   ├── components/
│   │   │   ├── layout/            # Sidebar, Topbar
│   │   │   ├── ui/                # Modal, Score, etc.
│   │   │   └── forms/             # Modais de criação
│   │   ├── context/               # AuthContext
│   │   └── lib/                   # API, constantes
│   └── tailwind.config.js
└── README.md
```

---

## 🎨 Estética

Design **institucional refinado** com paleta verde militar (forest) + dourado (gold) + creme (bone), tipografia Cormorant Garamond (display) + Inter (corpo), evocando seriedade e tradição militar.

---

## 📝 Regras de Negócio

### Faixas de Impacto

**TMDs (penalizações):**
- Leve: -0.20 a -0.40 (padrão: -0.30)
- Médio: -0.40 a -0.60 (padrão: -0.50)
- Grave: -0.60 a -1.00 (padrão: -0.80)
- Gravíssimo: -1.00 a -2.00 (padrão: -1.50)

**Elogios (bonificações):**
- Coletivo: +0.20 a +0.39 (aplicado a todos da turma)
- Individual: +0.40 a +0.59
- Menção Honrosa: +0.60 a +1.00

**Limiares de alerta:**
- Atenção: conceito < 6.5 (alerta amarelo)
- Crítico: conceito < 5.0 (alerta vermelho)

**Conversão automática:**
- 4 anotações acumuladas → TMD Leve automático

---

## 🔧 Scripts

### Backend
```bash
npm run dev          # Inicia servidor com hot-reload
npm start            # Inicia em produção
npm run db:generate  # Regenera client Prisma
npm run db:push      # Sincroniza schema com banco
npm run db:migrate   # Cria nova migration
npm run db:studio    # Abre Prisma Studio (UI do banco)
npm run db:seed      # Popula dados iniciais
npm run db:reset     # ⚠️ Apaga e recria o banco
```

### Frontend
```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build de produção
npm run preview  # Preview da build
```

---

## 🛡️ Segurança

- Senhas com hash bcrypt (10 rounds)
- JWT com expiração configurável (8h padrão)
- Rate limiting em endpoints (login mais restrito)
- Helmet para headers de segurança
- CORS configurável
- Auditoria completa de ações
- Validação rigorosa com Zod

---

## 📊 API

**Base URL**: `http://localhost:3333/api`

Principais endpoints:
- `POST /auth/login` — Autenticação
- `GET/POST /students` — Alunos
- `GET/POST /occurrences` — Ocorrências
- `GET/POST /praises` — Elogios
- `GET/POST /tacs` — TACs
- `GET /dashboard/overview` — Métricas
- `GET /reports/student/:id` — PDF individual
- `GET /reports/class/:id` — PDF de turma
- `GET /audit` — Auditoria (admin)

Health check: `GET /api/health`

---

## 📜 Licença

Sistema desenvolvido especificamente para o Colégio Militar do Estado do Tocantins — Professora Antonina Milhomem.

**Localização**: Araguatins, Tocantins, Brasil.

## Atualização — lançamento coletivo
- Elogios e ocorrências agora permitem selecionar vários alunos.
- A seleção é feita por turma e permanece na lista ao trocar de turma; somente o botão de remover exclui um aluno da seleção.
- As categorias de Anotação e TMD são limitadas a: Natureza Grave, Natureza Gravíssima/Eliminatória, Natureza Leve e Natureza Média.
- Suspensão não possui categoria e aceita somente de 1 a 5 dias.
- Monitores/Professores continuam limitados às turmas às quais possuem acesso.
