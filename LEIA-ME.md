# SysCana ERP — como colocar para funcionar

## 1. Banco (Supabase) — SQL Editor, nesta ordem
1. `schema.sql` (só na primeira instalação)
2. `migracao_estoque.sql`
3. `migracao_faturamento_fiscal.sql` (necessário para Emitir NF e Alíquotas)

Todos são idempotentes (podem ser rodados de novo).

## 2. Configuração
Edite `js/config.js` com `supabaseUrl` e `supabaseAnonKey`.

## 3. Deploy
Push no GitHub → Vercel publica. `.vercelignore` impede publicar os `.sql` e READMEs.

## Estrutura
- `index.html` login · `home.html` painel · um HTML por módulo
- `js/roles.js` permissões por e-mail (precisa definir `window.SysCanaAuth`)
- `js/core.js` sessão, sidebar, roteador · `css/theme.css` visual

## Se a tela ficar em branco
Abra o console (F12). `core.js` mostra um aviso se faltar Supabase, `config.js` ou `roles.js`.
