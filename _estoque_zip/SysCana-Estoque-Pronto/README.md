# Guia de Atualização do Módulo Estoque (SysCana)

### Principais Garantias de Compatibilidade:
* **Zero impacto nos outros módulos:** Funções de Compras (`receber_compra`), PCP (`concluir_producao`) e Comercial (`faturar_venda`) continuam chamando `movimentar_estoque` normalmente sem precisar alterar nenhuma linha de código.
* **Idempotente:** O script SQL pode ser executado mais de uma vez com segurança (`IF NOT EXISTS` / `CREATE OR REPLACE`).
* **Não bloqueia manutenções:** As travas de integridade protegem as chamadas da aplicação web, mas mantêm o Table Editor e o SQL Editor liberados para você fazer manutenções administrativas sem impedimentos.

---

## Passo 1: Executar o Script no Supabase (2 minutos)
1. Acesse o painel do seu projeto no **Supabase** (`https://supabase.com/dashboard`).
2. No menu lateral esquerdo, clique no ícone **SQL Editor**.
3. Clique em **+ New query**.
4. Abra o arquivo `migracao_estoque.sql`, copie todo o seu conteúdo e cole no editor do Supabase.
5. Clique no botão **Run** (Executar).
6. Você verá a mensagem de sucesso (*Success. No rows returned*). As views, triggers de SKU e tabelas de inventário já estarão ativas.

---

## Passo 2: Atualizar os Arquivos no Repositório / Frontend
Substitua apenas os 3 arquivos JavaScript na pasta `js/`:

1. `js/estoque.js` &rarr; Substituir pela nova versão (telas de Saldos com KPI em R$, Curva ABC, Inventário e Kardex com busca/CSV).
2. `js/core.js` &rarr; Adiciona os links "Curva ABC" e "Inventário" no menu do Estoque.
3. `js/home.js` &rarr; Ajuste de 1 linha para não acusar "estoque baixo" em itens com mínimo 0.

> **Nota sobre o HTML:** O arquivo `estoque.html` **não precisa ser alterado**. O SysCana renderiza dinamicamente as telas dentro da casca existente via JavaScript.

---

## Passo 3: Checklist Rápido de Teste
Para conferir o funcionamento:
1. Faça login como `admin@erp.com` ou `estoque@erp.com`.
2. Acesse **Estoque › Saldos**: veja a barra de pesquisa, o valor financeiro imobilizado e os chips de situação.
3. Acesse **Estoque › Curva ABC**: veja a classificação gerencial de materiais (A, B e C) por valor consumido.
4. Acesse **Estoque › Inventário**: abra um novo inventário de teste, insira uma contagem e clique em fechar para ver os ajustes automáticos gerados no Kardex.
5. Acesse **Estoque › Histórico**: filtre por tipo/data e clique em **Exportar CSV** para ver o relatório de auditoria contábil.
