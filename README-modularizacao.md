# SysCana — separado em 7 módulos (+ home)

## O que mudou

O antigo `app.html` + `app.js` (SPA única, ~1200 linhas, roteador por hash com
todas as 34 telas) virou 8 páginas independentes, uma por módulo:

| Página              | Setor          | Rotas que atende                              |
|---------------------|----------------|------------------------------------------------|
| `home.html`         | Todos          | `/home` (painel)                               |
| `financeiro.html`   | Financeiro     | `/fin/*`                                       |
| `pcp.html`          | PCP            | `/pcp/*`                                       |
| `compras.html`      | Compras        | `/compras/*`                                   |
| `comercial.html`    | Comercial      | `/com/*`                                       |
| `folha.html`        | Folha          | `/folha/*`                                     |
| `estoque.html`      | Estoque        | `/estoque` e `/estoque/*`                      |
| `faturamento.html`  | Faturamento    | `/fat/*`                                       |
| `index.html`        | —              | Login (igual antes, só o redirect mudou)       |

Cada página carrega, na mesma ordem:

```
supabase-js (CDN) → js/config.js → js/roles.js → js/core.js → js/<modulo>.js
```

## Como a integração com o Supabase continua igual

- **Credenciais**: `js/config.js` continua sendo o único lugar com a URL e a
  anon key do Supabase — não duplicado em cada página.
- **Sessão**: o client do Supabase guarda a sessão no `localStorage` do
  navegador. Como todas as páginas são do mesmo domínio, navegar entre
  `financeiro.html`, `estoque.html` etc. mantém o usuário logado sem nada
  extra — é o mesmo comportamento de antes, só que agora são páginas HTML
  de verdade em vez de trocas de hash.
- **Permissões por setor**: `js/roles.js` (o `SysCanaAuth`) não mudou nada.
  Continua sendo a fonte única de verdade de quem pode ver/escrever o quê,
  e cada página checa isso antes de rodar qualquer rota.

## O que é `js/core.js`

É o "SDK interno" compartilhado por todos os módulos. Contém:

- O client do Supabase (`sb`);
- As funções utilitárias que antes viviam soltas no `app.js`: `money`, `num`,
  `dbr`, `esc`, `flash`, `title`, `options`, `table`, `chip`, `param`,
  `bindRpc`, `list`;
- `link(path)` — resolve qualquer rota (`/fin/caixa`, `/estoque/baixo`, ...)
  para a página certa, tipo `financeiro.html#/fin/caixa`. É isso que faz os
  antigos links de "Consultas" (ex.: Financeiro consultando Notas Fiscais)
  funcionarem entre páginas diferentes;
- `renderSidebar(role)` — monta o menu lateral igual em todas as páginas, a
  partir de uma única lista (`NAV`) — não precisa manter 8 sidebars
  duplicadas manualmente;
- `startRouter(routes, rotaPadrao)` — motor de rota que cada `<modulo>.js`
  chama passando só as rotas daquele módulo. Se o hash não pertencer ao
  módulo atual (ex.: alguém favoritou `financeiro.html#/estoque`), ele
  redireciona automaticamente pra página certa via `link()`.

## O que ficou em cada `js/<modulo>.js`

Só as funções de tela daquele setor, extraídas 1:1 do `app.js` original
(mesmas queries, mesmos RPCs, mesma lógica — nada de regra de negócio foi
alterado). Ex.: `js/estoque.js` tem `estoqueQtd`, `estoqueCadastro`,
`estoqueMov`, `estoqueMovimentos`, `estoqueBaixo`.

## Arquivos que não mudaram

- `js/config.js` / `js/config.example.js`
- `js/roles.js`
- `css/theme.css` (só ganhou classes `.icon-btn` / `.modal-*` que faltavam
  para o modal de editar fornecedor funcionar visualmente — isso já existia
  no `app.js` original mas sem CSS correspondente)
- `schema.sql` (incluído aqui só de referência, não precisa rodar de novo)

## Deploy no Vercel

Não muda nada no processo: é estático, então basta apontar o projeto Vercel
pra raiz desta pasta (mesmo `vercel.json` de antes). Como cada módulo agora
é seu próprio arquivo `.html`, o Vercel/qualquer CDN cacheia e serve cada um
independentemente — inclusive dá pra fazer deploy incremental de um módulo
sem re-testar os outros.

## Ponto de atenção: RLS no Supabase

O `roles.js` (quem pode ver/escrever o quê) roda **só no navegador**. Isso
esconde telas e botões corretamente, mas não impede alguém com a anon key
(que é pública, aparece no `config.js`) de chamar a tabela direto via
`fetch`/console do navegador. Se as tabelas do Supabase ainda não tiverem
**Row Level Security (RLS)** habilitado com policies equivalentes às regras
de `roles.js`, essa seria a próxima coisa a reforçar — principalmente em
tabelas sensíveis como `funcionarios`, `holerites`, `contas_pagar` e
`contas_receber`.
