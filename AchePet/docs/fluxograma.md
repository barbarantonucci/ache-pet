# AchePet — Fluxogramas

> Para visualizar: abra este arquivo no VS Code (extensão "Markdown Preview Mermaid Support"),
> no GitHub, ou cole cada bloco em https://mermaid.live

## 1. Navegação geral do site

```mermaid
flowchart TD
    INI([tela-inicial.html<br/>Home]) --> BUSCA{Busca por cidade}
    BUSCA -- PERDI --> MP[mural-procurados.html]
    BUSCA -- ENCONTREI --> ME[mural-encontrados.html]
    INI --> MP
    INI --> ME
    INI --> QS[quem-somos.html]
    INI --> LOGIN[login.html]
    INI --> F1[form1.html<br/>Cadastrar animal]

    MP -- clique no card --> DP[procurado.html?id=]
    ME -- clique no card --> DE[encontrado.html?id=]
    MP <-- FILTROS / BUSCAR --> MP
    ME <-- FILTROS / BUSCAR --> ME

    DP --> LOG1{Logado?}
    DE --> LOG1
    LOG1 -- não --> LOGIN
    LOG1 -- sim --> CONT[Janela de contato<br/>nome, e-mail, telefone, mensagem]
    CONT --> DB1[(contatos)]
    DB1 --> CONTA[meus-animais.html<br/>Minha conta]

    LOGIN -- Criar conta --> CAD[cadastro.html]
    LOGIN -- Esqueci minha senha --> ES1[esqueceu-senha.html]
    CAD --> REG[registro.html<br/>Registro concluído] --> LOGIN
    LOGIN -- sucesso --> INI

    LOGIN -. logado .-> CONTA
    CONTA --> F1
    CONTA -- Sair --> INI
```

## 2. Cadastro do animal (form1 → form4)

```mermaid
flowchart TD
    A([Clica em CADASTRAR ANIMAL]) --> B{Logado?}
    B -- não --> L[login.html?next=form1.html] --> B
    B -- sim --> F1[form1: Situação<br/>Procurado ou Encontrado]
    F1 -- nada escolhido --> E1[/Aviso: escolha a situação/] --> F1
    F1 --> F2[form2: Dados do animal<br/>espécie, sexo, raça, porte, cor,<br/>cidade, UF, data]
    F2 -- obrigatório vazio --> E2[/Aviso do campo/] --> F2
    F2 --> F3[form3: Fotos<br/>1 a 5, redimensionadas no navegador]
    F3 -- sem foto --> E3[/Aviso: envie 1 foto/] --> F3
    F3 --> F4[form4: Revisão]
    F4 --> POST[[POST /api/animais]]
    POST --> V{Servidor valida<br/>dados + fotos}
    V -- inválido --> E4[/Mensagem de erro/] --> F4
    V -- ok --> S1[Salva fotos em uploads/animais]
    S1 --> S2[(animais + fotos)]
    S2 --> FIM([Página do animal<br/>procurado.html ou encontrado.html])
```

## 3. Recuperação de senha

```mermaid
flowchart TD
    A([Esqueci minha senha]) --> P1[esqueceu-senha.html<br/>digita o e-mail]
    P1 --> R1[[POST /api/auth/esqueci-senha]]
    R1 --> Q{E-mail existe?}
    Q -- sim --> C[Gera código de 6 dígitos<br/>validade 15 min]
    C --> M[Envia e-mail<br/>ou grava em db/emails.log no modo dev]
    Q -- não --> G[Mesma resposta genérica]
    M --> P2
    G --> P2[esqueceu-senha2.html<br/>digita o código]
    P2 --> R2[[POST /api/auth/verificar-codigo]]
    R2 --> V{Código certo?<br/>máx. 5 tentativas}
    V -- não --> P2
    V -- sim --> T[Recebe token de redefinição]
    T --> P3[esqueceu-senha3.html<br/>nova senha + confirmação]
    P3 --> R3[[POST /api/auth/redefinir-senha]]
    R3 --> OK[senhatrocada.html] --> LOGIN([login.html])
    P2 -. REENVIAR CÓDIGO .-> R1
```

## 4. Arquitetura

```mermaid
flowchart LR
    subgraph Navegador
        H[Páginas HTML + style.css]
        J[script.js<br/>fetch + sessão JWT]
    end
    subgraph Servidor["Servidor Node (server.js)"]
        ST[Arquivos estáticos<br/>public/ e uploads/]
        RA[routes/auth.js]
        RN[routes/animais.js]
        LIB[lib: segurança, http, e-mail, config]
    end
    DB[(SQLite<br/>db/achepet.db)]
    FS[(uploads/animais<br/>fotos enviadas)]
    MA[[E-mail<br/>Resend ou log em dev]]

    H --> J
    J -- /api/* JSON --> RA
    J -- /api/* JSON --> RN
    H -- GET --> ST
    RA --> DB
    RN --> DB
    RN --> FS
    RA --> MA
    RN --> MA
    ST --> FS
    RA --- LIB
    RN --- LIB
```

## 5. Banco de dados (modelo)

```mermaid
erDiagram
    USUARIOS ||--o{ ANIMAIS : publica
    ANIMAIS  ||--|{ FOTOS : possui
    ANIMAIS  ||--o{ CONTATOS : recebe
    USUARIOS ||--o{ CONTATOS : envia
    USUARIOS ||--o{ RECUPERACAO_SENHA : solicita

    USUARIOS {
        int id PK
        text nome
        text email UK
        text cpf UK
        text cidade
        text senha_hash
        text criado_em
    }
    ANIMAIS {
        int id PK
        int usuario_id FK
        text status "perdido | encontrado"
        text nome
        text especie
        text idade
        text sexo
        text raca
        text porte
        text cor
        text caracteristicas
        text cidade
        text cidade_norm
        text uf
        text data_ocorrencia
        int resolvido
    }
    FOTOS {
        int id PK
        int animal_id FK
        text caminho
        int ordem
    }
    CONTATOS {
        int id PK
        int animal_id FK
        int remetente_id FK
        text nome
        text email
        text telefone
        text mensagem
        int lido
    }
    RECUPERACAO_SENHA {
        int id PK
        int usuario_id FK
        text codigo_hash
        text token_hash
        int tentativas
        int usado
        text expira_em
    }
```
