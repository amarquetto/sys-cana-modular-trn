# SysCana ERP — como colocar para funcionar

## 1. Banco (Supabase) — SQL Editor, nesta ordem
1. `schema.sql` (só na primeira instalação)
2. `migracao_estoque.sql`
3. `migracao_faturamento_fiscal.sql` (Emitir NF, Alíquotas, vínculo NF ↔ contrato)
4. `migracao_contrato_cana.sql` (fluxo Comercial → PCP → Financeiro; substitui a antiga `migracao_ordem_venda_pcp.sql`)
5. `dados_demo.sql` (OPCIONAL: carga de demonstração — veja abaixo)

Todas as migrações são idempotentes. Se você já tinha rodado versões anteriores, **rode a 3 e a 4 de novo** (trazem o vínculo NF ↔ contrato).

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

## Dados de demonstração (`dados_demo.sql`)
Rode **uma vez**, em banco de teste/demonstração (se rodar de novo, ele avisa e não duplica). Cria, usando as funções reais do sistema:
- 6 clientes (usinas, destilaria, cooperativa, produtor) e 8 fornecedores, com CPF/CNPJ **fictícios**
- **14 funcionários** (13 ativos + 1 desligado) e **3 meses de folha**: 2 meses pagos, o último parcialmente pago (5 holerites em aberto) e o mês atual livre para você gerar/pagar na tela
- 16 compras em todos os estágios (aberta, em cotação, aguardando Financeiro, aprovada, reprovada, pedido emitido, recebida a pagar/vencida, recebida e paga) com 30 cotações
- 8 produções de talhão (5 concluídas, 3 em andamento), consumo de insumos e diesel
- 13 contratos de cana: 5 recebidos, 3 aguardando recebimento (1 vencido), 4 em produção (1 atrasado), 1 cancelado
- 6 NFs de venda de cana ligadas aos contratos, 3 NFs de serviço, 2 devoluções de insumo, despesas da safra
- Estoque com 2 itens abaixo do mínimo (Diesel e Maturador), já com compra em andamento
Os valores de INSS/IRRF dos holerites são estimativas para demonstração.
Datas são relativas ao dia em que você rodar (sempre parece uma safra em andamento).

## Logo
Arquivos em `img/`: `logo-mark.svg` (ícone), `logo.svg` (horizontal, com nome), PNGs (`logo-512.png`, `logo-horizontal.png`, `apple-touch-icon.png`). O ícone é usado no login, no menu lateral e no favicon.
