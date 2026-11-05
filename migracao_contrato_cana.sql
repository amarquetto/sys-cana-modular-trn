-- =====================================================================
-- SysCana — CONTRATO DE CANA:  Comercial → PCP → Financeiro  (tudo no banco)
-- Rode DEPOIS de schema.sql, migracao_estoque.sql e migracao_faturamento_fiscal.sql.
-- Idempotente. SUBSTITUI a antiga migracao_ordem_venda_pcp.sql (desfaz o que ela criou).
--
-- A CANA NÃO PASSA PELO ESTOQUE (não há movimentação de estoque neste fluxo).
--
--  1. Comercial cadastra o CONTRATO: nome, CPF/CNPJ, preço do ATR (R$/kg),
--     data de entrega e quantidade (t). O banco cria sozinho a ORDEM DE
--     PRODUÇÃO no PCP (trigger).
--  2. PCP produz/entrega e "dá baixa": informa toneladas entregues e ATR
--     apurado (kg/t). O banco calcula   valor = t × ATR × preço do ATR
--     e gera a CONTA A RECEBER no Financeiro.
--  3. Financeiro recebe em "Baixa a receber" → contrato "Recebido".
-- =====================================================================

-- ---------- 0. Desfaz a versão anterior (pedido + estoque), se existir ----------
drop trigger if exists pedido_gera_op on public.pedidos;
drop function if exists public.trg_pedido_gera_op();
drop function if exists public.baixar_ordem_venda(uuid, date);
drop function if exists public.cancelar_pedido_venda(uuid);

-- ---------- 1. Tabela de contratos ----------
create table if not exists public.contratos_cana (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  cliente_id uuid references public.clientes(id) on delete set null,
  nome text not null,
  documento text not null,
  preco_atr numeric(12,4) not null check (preco_atr > 0),      -- R$ por kg de ATR
  data_entrega date not null,
  quantidade numeric(14,3) not null check (quantidade > 0),    -- toneladas contratadas
  status text not null default 'Em Produção'
    check (status in ('Em Produção','Aguardando Recebimento','Recebido','Cancelado')),
  toneladas_entregues numeric(14,3),
  atr_apurado numeric(8,2),                                    -- kg ATR por tonelada
  valor_total numeric(14,2),
  created_at timestamptz default now()
);
create unique index if not exists contratos_cana_numero_uk on public.contratos_cana(numero);

alter table public.producoes add column if not exists contrato_id uuid references public.contratos_cana(id) on delete set null;
create unique index if not exists producoes_contrato_unico on public.producoes(contrato_id) where contrato_id is not null;
alter table public.contas_receber add column if not exists contrato_id uuid references public.contratos_cana(id) on delete set null;

-- ---------- 2. Formatação de CPF/CNPJ ----------
create or replace function public.formatar_documento(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 then
    return substr(d,1,3) || '.' || substr(d,4,3) || '.' || substr(d,7,3) || '-' || substr(d,10,2);
  elsif length(d) = 14 then
    return substr(d,1,2) || '.' || substr(d,3,3) || '.' || substr(d,6,3) || '/' || substr(d,9,4) || '-' || substr(d,13,2);
  end if;
  return null;
end;
$$;

-- ---------- 3. Comercial cadastra o contrato ----------
create or replace function public.registrar_contrato_cana(
  p_nome text, p_documento text, p_preco_atr numeric, p_data_entrega date, p_quantidade numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_doc text := public.formatar_documento(p_documento);
  v_dig text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_cli uuid;
  v_id uuid;
begin
  if length(v_nome) < 2 then raise exception 'Informe o nome do cliente/produtor'; end if;
  if v_doc is null then raise exception 'CPF (11 dígitos) ou CNPJ (14 dígitos) inválido'; end if;
  if coalesce(p_preco_atr, 0) <= 0 then raise exception 'Informe o preço do ATR (R$/kg) maior que zero'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Informe a quantidade de cana (t) maior que zero'; end if;
  if p_data_entrega is null then raise exception 'Informe a data de entrega'; end if;
  if p_data_entrega < current_date then raise exception 'A data de entrega não pode ser no passado'; end if;

  -- Reaproveita o cliente pelo CPF/CNPJ (para o Faturamento emitir NF depois); senão cria.
  select id into v_cli from clientes
   where regexp_replace(coalesce(documento, ''), '\D', '', 'g') = v_dig limit 1;
  if v_cli is null then
    insert into clientes (nome, documento) values (v_nome, v_doc) returning id into v_cli;
  end if;

  insert into contratos_cana (cliente_id, nome, documento, preco_atr, data_entrega, quantidade)
  values (v_cli, v_nome, v_doc, round(p_preco_atr, 4), p_data_entrega, p_quantidade)
  returning id into v_id;   -- o trigger abaixo cria a ordem de produção
  return v_id;
end;
$$;

-- ---------- 4. Trigger: contrato novo → ordem de produção no PCP ----------
create or replace function public.trg_contrato_gera_op() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Em Produção' then
    insert into producoes (nome, toneladas, quantidade, status, data_inicio, contrato_id)
    values ('OP Contrato ' || lpad(new.numero::text, 4, '0') || ' — ' || new.nome,
            new.quantidade, new.quantidade, 'EM PROGRESSO', current_date, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists contrato_gera_op on public.contratos_cana;
create trigger contrato_gera_op after insert on public.contratos_cana
  for each row execute function public.trg_contrato_gera_op();

-- ---------- 5. PCP dá baixa: calcula o valor e envia ao Financeiro ----------
create or replace function public.baixar_contrato_cana(
  p_producao_id uuid, p_toneladas numeric, p_atr numeric, p_vencimento date default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr record; c record; v_valor numeric(14,2); v_venc date; v_cr uuid;
begin
  select * into pr from producoes where id = p_producao_id for update;
  if pr.id is null then raise exception 'Ordem de produção não encontrada'; end if;
  if pr.contrato_id is null then
    raise exception 'Esta produção não veio de um contrato. Use "Concluir (estoque)" em Produções.';
  end if;
  if pr.status = 'CONCLUIDO' then raise exception 'Esta ordem já foi baixada'; end if;
  if pr.status = 'CANCELADO' then raise exception 'Esta ordem foi cancelada'; end if;

  select * into c from contratos_cana where id = pr.contrato_id for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if c.status <> 'Em Produção' then raise exception 'Contrato não está em produção (status: %)', c.status; end if;

  if coalesce(p_toneladas, 0) <= 0 then raise exception 'Informe as toneladas entregues'; end if;
  if coalesce(p_atr, 0) <= 0 then raise exception 'Informe o ATR apurado (kg/t)'; end if;

  -- Valor da cana = toneladas × ATR (kg/t) × preço do ATR (R$/kg)
  v_valor := round(p_toneladas * p_atr * c.preco_atr, 2);
  if v_valor <= 0 then raise exception 'Valor calculado inválido'; end if;
  v_venc := coalesce(p_vencimento, public.quinto_dia_util(current_date));

  insert into contas_receber (descricao, valor, vencimento, cliente_id, contrato_id)
  values ('Contrato ' || lpad(c.numero::text, 4, '0') || ' — ' || c.nome, v_valor, v_venc, c.cliente_id, c.id)
  returning id into v_cr;

  perform lancar_contabil('Clientes', 'Receita de vendas', v_valor,
                          'Contrato de cana ' || lpad(c.numero::text, 4, '0'), 'venda');

  update producoes set status = 'CONCLUIDO', toneladas = p_toneladas, quantidade = p_toneladas,
                       atr = p_atr, data_fim = current_date
   where id = pr.id;
  update contratos_cana set status = 'Aguardando Recebimento', toneladas_entregues = p_toneladas,
                            atr_apurado = p_atr, valor_total = v_valor
   where id = c.id;

  return jsonb_build_object('ok', true, 'conta_receber_id', v_cr, 'valor', v_valor, 'vencimento', v_venc);
end;
$$;

-- ---------- 6. Comercial cancela (e a OP, se ainda aberta) ----------
create or replace function public.cancelar_contrato_cana(p_contrato_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from contratos_cana where id = p_contrato_id for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if c.status <> 'Em Produção' then
    raise exception 'Só é possível cancelar contratos que ainda estão em produção (status: %)', c.status;
  end if;
  update producoes set status = 'CANCELADO' where contrato_id = c.id and status <> 'CONCLUIDO';
  update contratos_cana set status = 'Cancelado' where id = c.id;
end;
$$;

-- ---------- 7. concluir_producao: não serve para OP de contrato ----------
create or replace function public.concluir_producao(p_producao_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr record; v_insumo uuid; v_saida uuid; v_qtd_in numeric(14,3); v_qtd_out numeric(14,3);
begin
  select * into pr from producoes where id = p_producao_id for update;
  if pr.id is null then raise exception 'Produção não encontrada'; end if;
  if pr.contrato_id is not null then
    raise exception 'Esta ordem veio de um contrato de cana. Use "Dar baixa" em Ordens de venda.';
  end if;
  if pr.status = 'CANCELADO' then raise exception 'Produção cancelada'; end if;
  if coalesce(pr.estoque_baixado, false) then
    raise exception 'Esta produção já movimentou estoque';
  end if;

  v_qtd_in := coalesce(pr.quantidade_insumo, 0);
  v_qtd_out := coalesce(nullif(pr.toneladas,0), pr.quantidade);

  if pr.insumo_id is not null then
    select produto_id into v_insumo from insumos_pcp where id = pr.insumo_id;
  end if;
  if v_qtd_in > 0 then
    if v_insumo is null then
      raise exception 'Insumo da produção não está ligado a um produto de estoque. Cadastre o insumo pelo PCP de novo.';
    end if;
    perform movimentar_estoque(v_insumo, 'saida', v_qtd_in, 'producao', 'OP ' || pr.nome);
  end if;

  if pr.cana_id is not null then
    select produto_id into v_saida from canas where id = pr.cana_id;
  end if;
  if v_qtd_out > 0 then
    if v_saida is null then
      raise exception 'Cana da produção não está ligada ao estoque. Cadastre a cana pelo PCP.';
    end if;
    perform movimentar_estoque(v_saida, 'entrada', v_qtd_out, 'producao', 'Colheita ' || pr.nome);
  end if;

  update producoes set status = 'CONCLUIDO', estoque_baixado = true, data_fim = coalesce(data_fim, current_date)
  where id = pr.id;

  return jsonb_build_object('ok', true, 'insumo_baixado', v_qtd_in, 'cana_entrada', v_qtd_out);
end;
$$;

-- ---------- 8. baixar_receber: contrato vira "Recebido" ----------
create or replace function public.baixar_receber(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from contas_receber where id = p_id for update;
  if c.id is null then raise exception 'Conta não encontrada'; end if;
  if c.status <> 'Aberto' then raise exception 'Conta já baixada'; end if;
  update contas_receber set status = 'Recebido', recebido_em = current_date where id = p_id;
  update faturas set status_pagamento = 'Pago' where id = c.fatura_id;
  if c.contrato_id is not null then
    update contratos_cana set status = 'Recebido' where id = c.contrato_id and status = 'Aguardando Recebimento';
  end if;
  perform lancar_contabil('Caixa', 'Clientes', c.valor, 'Recebimento ' || c.descricao, 'receber');
end;
$$;

-- ---------- 9. Permissões / RLS (mesmo padrão das demais tabelas) ----------
alter table public.contratos_cana enable row level security;
drop policy if exists authenticated_all on public.contratos_cana;
create policy authenticated_all on public.contratos_cana for all to authenticated using (true) with check (true);

grant execute on function public.formatar_documento(text) to authenticated;
grant execute on function public.registrar_contrato_cana(text, text, numeric, date, numeric) to authenticated;
grant execute on function public.baixar_contrato_cana(uuid, numeric, numeric, date) to authenticated;
grant execute on function public.cancelar_contrato_cana(uuid) to authenticated;
grant execute on function public.concluir_producao(uuid) to authenticated;
grant execute on function public.baixar_receber(uuid) to authenticated;

notify pgrst, 'reload schema';
