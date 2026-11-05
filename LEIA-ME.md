# SysCana ERP — como colocar para funcionar

## 1. Banco (Supabase) — SQL Editor, nesta ordem
1. `schema.sql` (só na primeira instalação)
2. `migracao_estoque.sql`
3. `migracao_faturamento_fiscal.sql` (necessário para Emitir NF e Alíquotas)
4. `migracao_contrato_cana.sql` (fluxo Comercial → PCP → Financeiro; rode depois da 3. Substitui a antiga `migracao_ordem_venda_pcp.sql` e desfaz o que ela criou)

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

## Fluxo do contrato de cana (tudo no banco; a cana NÃO passa pelo estoque)
1. **Comercial** cadastra o contrato: nome, CPF/CNPJ, preço do ATR (R$/kg), data de entrega e toneladas (`registrar_contrato_cana`). O banco cria o cliente (se o CPF/CNPJ for novo) e a **ordem de produção** no PCP (trigger `contrato_gera_op`). Status: *Em Produção*.
2. **PCP** abre *Ordens de contrato* e clica **Dar baixa** (`baixar_contrato_cana`), informando toneladas entregues e ATR apurado (kg/t). Valor = **t × ATR × preço do ATR**. Gera a **conta a receber** (vencimento padrão: 5º dia útil do mês seguinte). Status: *Aguardando Recebimento*.
3. **Financeiro** recebe em *Baixa a receber* (`baixar_receber`) → contrato *Recebido*.
O Comercial pode **cancelar** enquanto estiver *Em Produção* (cancela a OP junto).

Atenção: emitir pelo Faturamento uma NF "Venda de Cana" cria outra conta a receber; ainda não há vínculo automático NF ↔ contrato.
