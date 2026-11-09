-- =====================================================================
-- SysCana — Migração do módulo FATURAMENTO (fiscal / agro)
-- Rode UMA vez no Supabase: SQL Editor > New query > colar > Run.
-- É idempotente: pode rodar de novo sem quebrar nada.
--
-- O que faz:
--   1. Cria/atualiza config_faturamento (tela Faturamento > Configurações)
--   2. Adiciona operacao/descricao em impostos (tela Alíquotas)
--   3. Amplia faturas (Venda_Cana, Prestacao_Servico, Devolucao_Insumo
--      + colunas de pesagem, laudo e retenções)
--   4. Cria a função quinto_dia_util() e a RPC emitir_fatura_especial()
--      usada pela tela "Emitir Nota Fiscal"
-- =====================================================================

-- ---------- 1. CONFIGURAÇÃO DO FATURAMENTO ----------
create table if not exists public.config_faturamento (
  id int primary key default 1 check (id = 1),
  razao_social text default '',
  cnpj text,
  inscricao_estadual text,
  endereco text,
  serie_nfe text default '1'
);

alter table public.config_faturamento
  add column if not exists uf text,
  add column if not exists municipio text,
  add column if not exists codigo_municipio_ibge text,
  add column if not exists modelo_nfe text not null default '55',
  add column if not exists proximo_numero_nfe bigint not null default 1,
  add column if not exists ambiente_nfe text not null default 'homologacao',
  add column if not exists natureza_venda_cana text default 'Venda de Cana-de-Açúcar',
  add column if not exists cfop_venda_cana text,
  add column if not exists natureza_devolucao_insumo text default 'Devolução de Insumos',
  add column if not exists cfop_devolucao_insumo text,
  add column if not exists natureza_servico text default 'Prestação de Serviços Agrícolas',
  add column if not exists codigo_servico_municipal text;

insert into public.config_faturamento (id, razao_social, serie_nfe, modelo_nfe, proximo_numero_nfe, ambiente_nfe)
values (1, '', '1', '55', 1, 'homologacao')
on conflict (id) do nothing;

-- ---------- 2. IMPOSTOS: operação e descrição ----------
alter table public.impostos
  add column if not exists operacao text not null default 'Venda',
  add column if not exists descricao text;

-- ---------- 3. FATURAS: novos tipos e colunas ----------
-- Remove qualquer CHECK antigo que limitava natureza_operacao a ('Venda','Compra')
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.faturas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%natureza_operacao%'
  loop
    execute format('alter table public.faturas drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.faturas
  add constraint faturas_natureza_operacao_check
  check (natureza_operacao in ('Venda','Compra','Venda_Cana','Prestacao_Servico','Devolucao_Insumo'));

alter table public.faturas
  add column if not exists cfop text,
  add column if not exists categoria_insumo text,
  add column if not exists toneladas_pesadas numeric(14,3),
  add column if not exists atr_qualidade numeric(10,2),
  add column if not exists brix numeric(8,2),
  add column if not exists pol numeric(8,2),
  add column if not exists pureza numeric(8,2),
  add column if not exists fibra numeric(8,2),
  add column if not exists impureza_vegetal numeric(8,2),
  add column if not exists impureza_mineral numeric(8,2),
  add column if not exists desconto_cct numeric(14,2) not null default 0,
  add column if not exists desconto_impurezas numeric(14,2) not null default 0,
  add column if not exists retencao_funrural numeric(14,2) not null default 0,
  add column if not exists retencao_senar numeric(14,2) not null default 0,
  add column if not exists retencao_issqn numeric(14,2) not null default 0,
  add column if not exists nf_referenciada text,
  add column if not exists modalidade_contrato text,
  add column if not exists tipo_produtor text,
  add column if not exists responsabilidade_cct text,
  add column if not exists cota_condominio numeric(8,2),
  add column if not exists inf_adicionais_fiscal text;

-- ---------- 4. FUNÇÕES ----------
-- 5º dia útil do mês seguinte à data de referência (seg-sex; não considera feriados).
create or replace function public.quinto_dia_util(p_ref date default current_date)
returns date
language plpgsql immutable as $$
declare
  d date := (date_trunc('month', p_ref) + interval '1 month')::date;
  n int := 0;
begin
  loop
    if extract(isodow from d) < 6 then n := n + 1; end if;
    exit when n = 5;
    d := d + 1;
  end loop;
  return d;
end;
$$;

-- Remove versões antigas/diferentes da função (evita ambiguidade de assinatura)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'emitir_fatura_especial'
  loop
    execute 'drop function ' || f.sig;
  end loop;
end $$;

create or replace function public.emitir_fatura_especial(
  p_tipo_operacao text default null,
  p_numero_nf text default null,
  p_parceiro_id text default null,
  p_valor_bruto numeric default 0,
  p_desconto_cct numeric default 0,
  p_aliquota_issqn numeric default 0,
  p_nf_referenciada text default null,
  p_modalidade text default null,
  p_tipo_produtor text default 'PF',
  p_toneladas numeric default 0,
  p_atr numeric default 0,
  p_responsabilidade_cct text default null,
  p_categoria_insumo text default null,
  p_imp_vegetal numeric default 0,
  p_imp_mineral numeric default 0,
  p_desconto_impurezas numeric default 0,
  p_brix numeric default 0,
  p_pol numeric default 0,
  p_pureza numeric default 0,
  p_fibra numeric default 0,
  p_cota_condominio numeric default 100,
  p_contrato_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_parceiro uuid := nullif(btrim(coalesce(p_parceiro_id, '')), '')::uuid;
  v_numero text := nullif(btrim(coalesce(p_numero_nf, '')), '');
  v_bruto numeric(14,2) := round(coalesce(p_valor_bruto, 0), 2);
  v_cct numeric(14,2) := 0;
  v_imp numeric(14,2) := 0;
  v_funrural numeric(14,2) := 0;
  v_senar numeric(14,2) := 0;
  v_issqn numeric(14,2) := 0;
  v_liquido numeric(14,2);
  v_venc date := public.quinto_dia_util(current_date);
  v_cfop text;
  v_fatura uuid;
  v_info text;
  v_contrato_id uuid := nullif(btrim(coalesce(p_contrato_id, '')), '')::uuid;
  v_ct record;
begin
  if p_tipo_operacao is null or p_tipo_operacao not in ('Venda_Cana','Prestacao_Servico','Devolucao_Insumo') then
    raise exception 'Tipo de operação inválido';
  end if;
  if v_numero is null then raise exception 'Informe o número da NF'; end if;
  if exists (select 1 from faturas where numero_fatura = v_numero) then
    raise exception 'Número de NF já usado';
  end if;
  if v_parceiro is null then
    raise exception 'Selecione o destinatário (cliente/usina ou fornecedor)';
  end if;
  if v_bruto <= 0 then raise exception 'Informe o valor bruto da nota'; end if;

  if p_tipo_operacao = 'Venda_Cana' then
    if not exists (select 1 from clientes where id = v_parceiro) then
      raise exception 'Cliente/Usina não encontrado';
    end if;
    -- NF ligada a um contrato de cana já entregue (reaproveita a conta a receber dele)
    if v_contrato_id is not null then
      select * into v_ct from contratos_cana where id = v_contrato_id for update;
      if v_ct.id is null then raise exception 'Contrato de cana não encontrado'; end if;
      if v_ct.status not in ('Aguardando Recebimento','Recebido') then
        raise exception 'O contrato ainda não foi entregue pelo PCP (status: %)', v_ct.status;
      end if;
      if v_ct.fatura_id is not null then raise exception 'Este contrato já tem NF emitida'; end if;
      if v_ct.cliente_id is distinct from v_parceiro then
        raise exception 'O contrato pertence a outro cliente';
      end if;
    end if;
    v_cct := round(coalesce(p_desconto_cct, 0), 2);
    v_imp := round(coalesce(p_desconto_impurezas, 0), 2);
    if coalesce(p_tipo_produtor, 'PF') = 'PJ' then
      v_funrural := round(v_bruto * 0.017, 2);
      v_senar    := round(v_bruto * 0.0025, 2);
    else
      v_funrural := round(v_bruto * 0.012, 2);
      v_senar    := round(v_bruto * 0.002, 2);
    end if;
    select cfop_venda_cana into v_cfop from config_faturamento where id = 1;
  elsif p_tipo_operacao = 'Prestacao_Servico' then
    if not exists (select 1 from clientes where id = v_parceiro) then
      raise exception 'Cliente não encontrado';
    end if;
    v_issqn := round(v_bruto * coalesce(p_aliquota_issqn, 0) / 100.0, 2);
  else
    if not exists (select 1 from fornecedores where id = v_parceiro) then
      raise exception 'Fornecedor não encontrado';
    end if;
    select cfop_devolucao_insumo into v_cfop from config_faturamento where id = 1;
  end if;

  v_liquido := v_bruto - v_cct - v_imp - v_funrural - v_senar - v_issqn;
  if v_liquido < 0 then raise exception 'Descontos e retenções maiores que o valor bruto'; end if;

  v_info := case p_tipo_operacao
    when 'Venda_Cana' then 'ICMS Diferido nos termos do Art. 345 do RICMS/SP. PIS/COFINS com alíquota suspensa (CST 09 - Lei 10.925/2004).'
    else null
  end;

  insert into faturas (
    numero_fatura, data_emissao, data_vencimento,
    valor_subtotal, valor_impostos, valor_frete, valor_total,
    natureza_operacao, status_pagamento, condicoes_pagamento,
    cliente_id, fornecedor_id, cfop, categoria_insumo,
    toneladas_pesadas, atr_qualidade, brix, pol, pureza, fibra,
    impureza_vegetal, impureza_mineral,
    desconto_cct, desconto_impurezas, retencao_funrural, retencao_senar, retencao_issqn,
    nf_referenciada, modalidade_contrato, tipo_produtor, responsabilidade_cct, cota_condominio,
    inf_adicionais_fiscal
  ) values (
    v_numero, current_date, v_venc,
    v_bruto, v_funrural + v_senar + v_issqn, 0, v_liquido,
    p_tipo_operacao, 'Pendente', 'Vencimento no 5º dia útil',
    case when p_tipo_operacao = 'Devolucao_Insumo' then null else v_parceiro end,
    case when p_tipo_operacao = 'Devolucao_Insumo' then v_parceiro else null end,
    v_cfop,
    case when p_tipo_operacao = 'Devolucao_Insumo' then nullif(p_categoria_insumo, '') else null end,
    case when p_tipo_operacao = 'Venda_Cana' then nullif(coalesce(p_toneladas,0), 0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then nullif(coalesce(p_atr,0), 0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then nullif(coalesce(p_brix,0), 0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then nullif(coalesce(p_pol,0), 0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then nullif(coalesce(p_pureza,0), 0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then nullif(coalesce(p_fibra,0), 0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then coalesce(p_imp_vegetal,0) else null end,
    case when p_tipo_operacao = 'Venda_Cana' then coalesce(p_imp_mineral,0) else null end,
    v_cct, v_imp, v_funrural, v_senar, v_issqn,
    nullif(btrim(coalesce(p_nf_referenciada,'')), ''),
    case when p_tipo_operacao = 'Venda_Cana' then p_modalidade else null end,
    case when p_tipo_operacao = 'Venda_Cana' then coalesce(p_tipo_produtor,'PF') else null end,
    case when p_tipo_operacao = 'Venda_Cana' then p_responsabilidade_cct else null end,
    case when p_tipo_operacao = 'Venda_Cana' then coalesce(p_cota_condominio,100) else null end,
    v_info
  ) returning id into v_fatura;

  if p_tipo_operacao = 'Venda_Cana' and coalesce(p_toneladas, 0) > 0 then
    insert into fatura_itens (fatura_id, quantidade) values (v_fatura, p_toneladas);
  end if;

  -- Financeiro e contabilidade
  if p_tipo_operacao = 'Devolucao_Insumo' then
    perform lancar_contabil('Fornecedores', 'Devolução de compras (insumos)', v_liquido,
                            'Devolução NF ' || v_numero, 'devolucao');
  elsif v_contrato_id is not null then
    -- Contrato: a conta a receber e o lançamento já nasceram na baixa do PCP. Só vincula a NF.
    update contas_receber
       set fatura_id = v_fatura,
           valor = case when status = 'Aberto' then v_liquido else valor end,
           descricao = 'NF ' || v_numero || ' — ' || descricao
     where contrato_id = v_contrato_id;
    update faturas
       set data_vencimento = coalesce((select vencimento from contas_receber where contrato_id = v_contrato_id limit 1), data_vencimento),
           status_pagamento = case when exists (select 1 from contas_receber where contrato_id = v_contrato_id and status = 'Recebido')
                                   then 'Pago' else 'Pendente' end
     where id = v_fatura;
    update contratos_cana set fatura_id = v_fatura where id = v_contrato_id;
  else
    insert into contas_receber (descricao, valor, vencimento, cliente_id, fatura_id)
    values ('NF ' || v_numero, v_liquido, v_venc, v_parceiro, v_fatura);
    perform lancar_contabil('Clientes',
      case when p_tipo_operacao = 'Venda_Cana' then 'Receita de vendas' else 'Receita de serviços' end,
      v_liquido, 'Faturamento NF ' || v_numero, 'venda');
  end if;

  return v_fatura;
end;
$$;

grant execute on function public.quinto_dia_util(date) to authenticated;
grant execute on function public.emitir_fatura_especial(
  text, text, text, numeric, numeric, numeric, text, text, text, numeric, numeric,
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated;

-- ---------- 5. RLS / permissões (mesmo padrão das demais tabelas) ----------
alter table public.config_faturamento enable row level security;
alter table public.impostos enable row level security;
alter table public.faturas enable row level security;
grant select, insert, update on public.config_faturamento to authenticated;

do $$
declare t text;
begin
  for t in select unnest(array['config_faturamento','impostos','faturas','fatura_itens'])
  loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format('create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Recarrega o cache de schema da API (PostgREST)
notify pgrst, 'reload schema';
