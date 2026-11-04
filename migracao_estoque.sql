-- =====================================================================
-- SysCana — Módulo ESTOQUE — Migração de Integridade, Rastreabilidade e BI
-- Compatível com o schema original: NÃO quebra nenhum outro departamento.
-- Idempotente: pode ser executada várias vezes sem duplicar nem gerar erro.
-- =====================================================================

-- ---------- 1. Categorias da Cadeia Sucroalcooleira ----------
alter table public.produtos drop constraint if exists produtos_categoria_check;
alter table public.produtos add constraint produtos_categoria_check
  check (categoria in ('Cana','Insumos','Embalagem','Combustivel','Pecas','Lubrificantes','Seguranca','Escritorio','Outros'));

-- ---------- 2. SKU Automático por Categoria (Roteiro 10 / SCM) ----------
create table if not exists public.sku_contadores (
  prefixo text primary key,
  ultimo  int not null default 0
);
alter table public.sku_contadores enable row level security;
drop policy if exists sku_contadores_select on public.sku_contadores;
create policy sku_contadores_select on public.sku_contadores for select to authenticated, anon using (true);

alter table public.produtos add column if not exists sku text;

create or replace function public.sku_prefixo(p_categoria text) returns text
language sql immutable as $$
  select case p_categoria
    when 'Cana' then 'CANA'
    when 'Insumos' then 'INS'
    when 'Embalagem' then 'EMB'
    when 'Combustivel' then 'COMB'
    when 'Pecas' then 'PEC'
    when 'Lubrificantes' then 'LUB'
    when 'Seguranca' then 'EPI'
    when 'Escritorio' then 'ADM'
    else 'OUT' end
$$;

create or replace function public.trg_produtos_sku() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pref text;
  v_n int;
  v_cand text;
begin
  if new.sku is not null and btrim(new.sku) <> '' then
    new.sku := upper(btrim(new.sku));
    return new;
  end if;
  v_pref := sku_prefixo(new.categoria);
  loop
    insert into sku_contadores (prefixo, ultimo) values (v_pref, 1)
    on conflict (prefixo) do update set ultimo = sku_contadores.ultimo + 1
    returning ultimo into v_n;
    v_cand := v_pref || '-' || lpad(v_n::text, 3, '0');
    exit when not exists (select 1 from produtos where sku = v_cand);
  end loop;
  new.sku := v_cand;
  return new;
end;
$$;

drop trigger if exists trg_produtos_sku on public.produtos;
create trigger trg_produtos_sku before insert on public.produtos
  for each row execute function public.trg_produtos_sku();

-- Preenche SKU dos produtos que já existem no banco
do $$
declare
  r record;
  v_pref text;
  v_n int;
  v_cand text;
begin
  for r in select id, categoria from produtos where sku is null or btrim(sku) = '' order by created_at, id loop
    v_pref := sku_prefixo(r.categoria);
    loop
      insert into sku_contadores (prefixo, ultimo) values (v_pref, 1)
      on conflict (prefixo) do update set ultimo = sku_contadores.ultimo + 1
      returning ultimo into v_n;
      v_cand := v_pref || '-' || lpad(v_n::text, 3, '0');
      exit when not exists (select 1 from produtos where sku = v_cand);
    end loop;
    update produtos set sku = v_cand where id = r.id;
  end loop;
end $$;

alter table public.produtos alter column sku set not null;
create unique index if not exists produtos_sku_key on public.produtos (sku);

-- ---------- 3. Custo Médio Ponderado e Auditoria (Quem Movimentou) ----------
alter table public.produtos add column if not exists custo_medio numeric(14,4) not null default 0;
alter table public.produtos drop constraint if exists produtos_custo_nao_negativo;
alter table public.produtos add constraint produtos_custo_nao_negativo check (custo_medio >= 0);

alter table public.movimentacoes_estoque add column if not exists custo_unitario numeric(14,4);
alter table public.movimentacoes_estoque add column if not exists usuario text;

-- ---------- 4. Integridade do Saldo e Kardex ----------
alter table public.produtos drop constraint if exists produtos_saldo_nao_negativo;
alter table public.produtos add constraint produtos_saldo_nao_negativo
  check (quantidade_estoque >= 0) not valid;
do $$
begin
  alter table public.produtos validate constraint produtos_saldo_nao_negativo;
exception when check_violation then
  raise warning 'ATENÇÃO: existem produtos com saldo negativo no banco. Corrija-os e revalide.';
end $$;

-- Guarda de saldo: impede que o saldo seja alterado diretamente por scripts do front
-- mas permite que o administrador (postgres/service_role) faça manutenções no Table Editor
create or replace function public.trg_produtos_saldo_guard() returns trigger
language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.quantidade_estoque is distinct from old.quantidade_estoque
     and coalesce(current_setting('syscana.mov', true), '') <> '1' then
    raise exception 'O saldo de estoque só pode ser alterado por movimentação oficial (entrada/saída/ajuste).'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_produtos_saldo_guard on public.produtos;
create trigger trg_produtos_saldo_guard before update of quantidade_estoque on public.produtos
  for each row execute function public.trg_produtos_saldo_guard();

-- Kardex imutável: movimentações não podem ser apagadas ou editadas pelo front
create or replace function public.trg_kardex_imutavel() returns trigger
language plpgsql as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'O histórico de estoque (kardex) é imutável. Para corrigir, registre uma nova movimentação.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_kardex_imutavel on public.movimentacoes_estoque;
create trigger trg_kardex_imutavel before update or delete on public.movimentacoes_estoque
  for each row execute function public.trg_kardex_imutavel();

-- Impedir deleção acidental de produtos que já possuem histórico contábil
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.movimentacoes_estoque'::regclass and contype = 'f'
    and confrelid = 'public.produtos'::regclass;
  if c is not null then
    execute format('alter table public.movimentacoes_estoque drop constraint %I', c);
  end if;
  alter table public.movimentacoes_estoque
    add constraint movimentacoes_estoque_produto_id_fkey
    foreign key (produto_id) references public.produtos(id) on delete restrict;
end $$;

-- Origens de movimentação suportadas
alter table public.movimentacoes_estoque drop constraint if exists movimentacoes_origem_check;
alter table public.movimentacoes_estoque add constraint movimentacoes_origem_check
  check (origem in ('manual','compra','venda','producao','saldo_inicial','ajuste_inventario')) not valid;
do $$
begin
  alter table public.movimentacoes_estoque validate constraint movimentacoes_origem_check;
exception when check_violation then
  raise warning 'ATENÇÃO: há movimentações antigas com origens fora da lista padrão.';
end $$;

-- Cadastro com estoque inicial registra automaticamente no kardex
create or replace function public.trg_produtos_saldo_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.quantidade_estoque > 0 then
    insert into movimentacoes_estoque
      (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, origem, observacao, usuario)
    values
      (new.id, 'entrada', new.quantidade_estoque, 0, new.quantidade_estoque, 'saldo_inicial',
       'Saldo inicial do cadastro', nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_produtos_saldo_inicial on public.produtos;
create trigger trg_produtos_saldo_inicial after insert on public.produtos
  for each row execute function public.trg_produtos_saldo_inicial();

-- Ajuste de legado: gera saldo inicial no kardex para produtos existentes sem movimentação
do $$
declare r record; v_soma numeric(14,3);
begin
  for r in select id, quantidade_estoque from produtos loop
    select coalesce(sum(case when tipo = 'entrada' then quantidade else -quantidade end), 0)
      into v_soma from movimentacoes_estoque where produto_id = r.id;
    if v_soma <> r.quantidade_estoque then
      insert into movimentacoes_estoque
        (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, origem, observacao)
      values
        (r.id,
         case when r.quantidade_estoque > v_soma then 'entrada' else 'saida' end,
         abs(r.quantidade_estoque - v_soma), v_soma, r.quantidade_estoque,
         'saldo_inicial', 'Ajuste de migração: saldo existente sem histórico no kardex');
    end if;
  end loop;
end $$;

-- Leitura do kardex liberada para autenticados e anon
drop policy if exists authenticated_all on public.movimentacoes_estoque;
drop policy if exists kardex_leitura on public.movimentacoes_estoque;
create policy kardex_leitura on public.movimentacoes_estoque for select to authenticated, anon using (true);

-- ---------- 5. Função movimentar_estoque Aprimorada ----------
-- Compatível com a assinatura anterior (5 argumentos) e com o novo parâmetro de custo
drop function if exists public.movimentar_estoque(uuid, text, numeric, text, text);

create or replace function public.movimentar_estoque(
  p_produto_id uuid, p_tipo text, p_quantidade numeric,
  p_origem text default 'manual', p_observacao text default null,
  p_custo_unitario numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_atual numeric(14,3);
  v_novo numeric(14,3);
  v_custo numeric(14,4);
  v_custo_novo numeric(14,4);
  v_custo_mov numeric(14,4);
  v_user text;
begin
  if p_produto_id is null then
    raise exception 'Produto de estoque não informado. Cadastre o item em Estoque antes.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;
  if p_tipo not in ('entrada','saida') then
    raise exception 'Tipo inválido (deve ser entrada ou saida)';
  end if;
  if p_origem is null or p_origem not in ('manual','compra','venda','producao','saldo_inicial','ajuste_inventario') then
    raise exception 'Origem inválida: %', p_origem;
  end if;
  if p_origem = 'manual' and length(btrim(coalesce(p_observacao, ''))) < 3 then
    raise exception 'Ajuste manual exige observação (motivo com pelo menos 3 caracteres).';
  end if;
  if p_custo_unitario is not null and p_custo_unitario < 0 then
    raise exception 'Custo unitário inválido';
  end if;

  select quantidade_estoque, custo_medio into v_atual, v_custo
  from produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado no estoque';
  end if;

  if p_tipo = 'saida' then
    if v_atual < p_quantidade then
      raise exception 'Estoque insuficiente. Disponível: %', v_atual;
    end if;
    v_novo := v_atual - p_quantidade;
    v_custo_novo := v_custo;
    v_custo_mov := v_custo;
  else
    v_novo := v_atual + p_quantidade;
    if p_custo_unitario is not null and p_custo_unitario > 0 then
      v_custo_novo := round(((v_atual * v_custo) + (p_quantidade * p_custo_unitario)) / v_novo, 4);
      v_custo_mov := p_custo_unitario;
    else
      v_custo_novo := v_custo;
      v_custo_mov := v_custo;
    end if;
  end if;

  v_user := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';

  perform set_config('syscana.mov', '1', true);
  update produtos set quantidade_estoque = v_novo, custo_medio = v_custo_novo where id = p_produto_id;
  perform set_config('syscana.mov', '0', true);

  insert into movimentacoes_estoque (
    produto_id, tipo, quantidade, estoque_anterior, estoque_posterior,
    origem, observacao, custo_unitario, usuario
  ) values (
    p_produto_id, p_tipo, p_quantidade, v_atual, v_novo,
    p_origem, p_observacao, v_custo_mov, v_user
  );

  return jsonb_build_object('ok', true, 'estoque_anterior', v_atual,
                            'estoque_posterior', v_novo, 'custo_medio', v_custo_novo);
end;
$$;

-- ---------- 6. Views de Saldos e Conferência de Kardex ----------
create or replace view public.vw_estoque_situacao with (security_invoker = true) as
select
  p.id, p.sku, p.nome, p.categoria, p.unidade,
  p.quantidade_estoque as saldo, p.qtd_minima, p.qtd_maxima, p.custo_medio,
  round(p.quantidade_estoque * p.custo_medio, 2) as valor_estoque,
  case
    when p.qtd_minima > 0 and p.quantidade_estoque <= p.qtd_minima then 'BAIXO'
    when p.qtd_maxima > 0 and p.quantidade_estoque > p.qtd_maxima then 'ACIMA_MAXIMO'
    else 'OK'
  end as situacao,
  case
    when p.qtd_minima > 0 and p.quantidade_estoque <= p.qtd_minima
      then greatest(
        (case when p.qtd_maxima > p.qtd_minima then p.qtd_maxima else p.qtd_minima * 2 end) - p.quantidade_estoque, 0)
    else 0
  end as sugestao_compra
from public.produtos p;

create or replace view public.vw_kardex_conferencia with (security_invoker = true) as
select p.id, p.sku, p.nome, p.quantidade_estoque as saldo,
  coalesce(sum(case when m.tipo = 'entrada' then m.quantidade else -m.quantidade end), 0) as soma_movimentos,
  p.quantidade_estoque - coalesce(sum(case when m.tipo = 'entrada' then m.quantidade else -m.quantidade end), 0) as diferenca
from public.produtos p
left join public.movimentacoes_estoque m on m.produto_id = p.id
group by p.id;

-- ---------- 7. Curva ABC (BI no Estoque / Decisão Gerencial) ----------
create or replace function public.curva_abc(p_dias int default 90)
returns table (
  produto_id uuid, sku text, nome text, categoria text, unidade text,
  qtd_saida numeric, valor_saida numeric, pct numeric, pct_acumulado numeric, classe text
)
language sql stable set search_path = public as $$
  with base as (
    select p.id, p.sku, p.nome, p.categoria, p.unidade,
      coalesce(sum(m.quantidade), 0) as qtd,
      coalesce(sum(m.quantidade * coalesce(m.custo_unitario, 0)), 0) as valor
    from produtos p
    left join movimentacoes_estoque m
      on m.produto_id = p.id and m.tipo = 'saida'
     and m.created_at >= now() - make_interval(days => greatest(p_dias, 1))
    group by p.id
  ),
  tot as (select coalesce(sum(valor), 0) as t from base),
  rk as (
    select b.*, t.t,
      coalesce(sum(b.valor) over (order by b.valor desc, b.nome
        rows between unbounded preceding and 1 preceding), 0) as antes
    from base b cross join tot t
  )
  select id, sku, nome, categoria, unidade, qtd, valor,
    case when t > 0 then round(valor / t * 100, 2) else 0 end,
    case when t > 0 then round((antes + valor) / t * 100, 2) else 0 end,
    case when t = 0 then 'C'
         when antes / t * 100 < 80 then 'A'
         when antes / t * 100 < 95 then 'B'
         else 'C' end
  from rk
  order by valor desc, nome;
$$;

-- ---------- 8. Inventário Físico x Contábil (Balanço / Qualidade) ----------
create table if not exists public.inventarios (
  id uuid primary key default gen_random_uuid(),
  descricao text,
  status text not null default 'Aberto' check (status in ('Aberto','Fechado','Cancelado')),
  criado_por text,
  criado_em timestamptz not null default now(),
  fechado_em timestamptz
);

create table if not exists public.inventario_itens (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.inventarios(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  saldo_sistema numeric(14,3) not null,
  contagem numeric(14,3) check (contagem >= 0),
  divergencia numeric(14,3),
  unique (inventario_id, produto_id)
);

alter table public.inventarios enable row level security;
alter table public.inventario_itens enable row level security;
drop policy if exists inv_leitura on public.inventarios;
drop policy if exists invi_leitura on public.inventario_itens;
create policy inv_leitura on public.inventarios for select to authenticated, anon using (true);
create policy invi_leitura on public.inventario_itens for select to authenticated, anon using (true);

create or replace function public.abrir_inventario(p_descricao text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into inventarios (descricao, criado_por)
  values (coalesce(nullif(btrim(p_descricao), ''), 'Inventário ' || to_char(now(), 'DD/MM/YYYY HH24:MI')),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  returning id into v_id;
  insert into inventario_itens (inventario_id, produto_id, saldo_sistema)
  select v_id, id, quantidade_estoque from produtos;
  return v_id;
end;
$$;

create or replace function public.registrar_contagem(p_inventario_id uuid, p_produto_id uuid, p_contagem numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_contagem is null or p_contagem < 0 then raise exception 'Contagem inválida'; end if;
  select status into v_status from inventarios where id = p_inventario_id for share;
  if v_status is null then raise exception 'Inventário não encontrado'; end if;
  if v_status <> 'Aberto' then raise exception 'Inventário % não aceita novas contagens', lower(v_status); end if;
  update inventario_itens set contagem = p_contagem
  where inventario_id = p_inventario_id and produto_id = p_produto_id;
  if not found then raise exception 'Produto não faz parte deste inventário'; end if;
end;
$$;

create or replace function public.fechar_inventario(p_inventario_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv record; it record; v_atual numeric(14,3); v_dif numeric(14,3);
  v_ajustes int := 0; v_contados int := 0;
begin
  select * into inv from inventarios where id = p_inventario_id for update;
  if inv.id is null then raise exception 'Inventário não encontrado'; end if;
  if inv.status <> 'Aberto' then raise exception 'Inventário já está %', lower(inv.status); end if;

  for it in select * from inventario_itens where inventario_id = inv.id and contagem is not null order by produto_id loop
    v_contados := v_contados + 1;
    select quantidade_estoque into v_atual from produtos where id = it.produto_id;
    v_dif := it.contagem - v_atual;
    if v_dif <> 0 then
      perform movimentar_estoque(it.produto_id, case when v_dif > 0 then 'entrada' else 'saida' end,
        abs(v_dif), 'ajuste_inventario', 'Inventário: ' || inv.descricao);
      v_ajustes := v_ajustes + 1;
    end if;
    update inventario_itens set divergencia = v_dif where id = it.id;
  end loop;

  update inventarios set status = 'Fechado', fechado_em = now() where id = inv.id;
  return jsonb_build_object('ok', true, 'itens_contados', v_contados, 'ajustes', v_ajustes);
end;
$$;

create or replace function public.cancelar_inventario(p_inventario_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update inventarios set status = 'Cancelado', fechado_em = now()
  where id = p_inventario_id and status = 'Aberto';
  if not found then raise exception 'Só é possível cancelar inventário que esteja aberto'; end if;
end;
$$;

-- ---------- 8b. Compra alimenta o custo médio (sem mudar o JS de Compras) ----------
create or replace function public.receber_compra(
  p_pedido_compra_id uuid, p_numero text, p_imposto_id uuid, p_vencimento date, p_frete numeric default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pc record;
  v_taxa numeric(8,2) := 0;
  v_imposto numeric(14,2);
  v_total numeric(14,2);
  v_fatura uuid;
  v_numero text;
  v_custo numeric(14,4);
begin
  select * into pc from pedidos_compra where id = p_pedido_compra_id for update;
  if pc.id is null then raise exception 'Pedido de compra não encontrado'; end if;
  if pc.status <> 'Aberto' then raise exception 'Pedido já recebido'; end if;
  if exists (select 1 from faturas where numero_fatura = p_numero) then
    raise exception 'Número de NF já usado';
  end if;
  if p_imposto_id is not null then
    select taxa into v_taxa from impostos where id = p_imposto_id;
  end if;
  v_imposto := round(pc.valor * (coalesce(v_taxa,0) / 100.0), 2);
  v_total := round(pc.valor + v_imposto + coalesce(p_frete,0), 2);
  v_numero := p_numero;
  if pc.quantidade > 0 then
    v_custo := round(pc.valor / pc.quantidade, 4);
  end if;

  insert into faturas (
    numero_fatura, data_emissao, data_vencimento, valor_subtotal, valor_impostos, valor_frete, valor_total,
    natureza_operacao, status_pagamento, condicoes_pagamento, fornecedor_id, imposto_id, pedido_compra_id
  ) values (
    v_numero, current_date, coalesce(p_vencimento, current_date + 30), pc.valor, v_imposto, coalesce(p_frete,0), v_total,
    'Compra', 'Pendente', 'Fornecedor', pc.fornecedor_id, p_imposto_id, pc.id
  ) returning id into v_fatura;

  insert into fatura_itens (fatura_id, produto_id, quantidade)
  values (v_fatura, pc.produto_id, pc.quantidade);

  if pc.produto_id is not null then
    perform movimentar_estoque(pc.produto_id, 'entrada', pc.quantidade, 'compra', 'NF ' || v_numero, v_custo);
  end if;

  insert into contas_pagar (descricao, valor, vencimento, fornecedor_id, fatura_id)
  values ('NF compra ' || v_numero, v_total, coalesce(p_vencimento, current_date + 30), pc.fornecedor_id, v_fatura);

  perform lancar_contabil('Estoque', 'Fornecedores', v_total, 'Recebimento NF ' || v_numero, 'compra');

  update pedidos_compra set status = 'Recebido', fatura_id = v_fatura where id = pc.id;
  update solicitacoes set status = 'Atendida' where id = pc.solicitacao_id;
  update faturas set pedido_compra_id = pc.id where id = v_fatura;
  return v_fatura;
end;
$$;

-- ---------- 9. Integração Estoque -> Compras (Solicitação de Reposição) ----------
create or replace function public.solicitar_reposicao(p_produto_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select * into v from vw_estoque_situacao where id = p_produto_id;
  if v.id is null then raise exception 'Produto não encontrado'; end if;
  if v.situacao <> 'BAIXO' then raise exception 'Produto não está abaixo do mínimo'; end if;
  if exists (select 1 from solicitacoes where produto_id = p_produto_id
             and status in ('Aberta','EmCotacao','AguardandoFinanceiro','Aprovada','PedidoEmitido')) then
    raise exception 'Já existe solicitação de compra em andamento para este produto';
  end if;
  return solicitar_compra(p_produto_id, v.sugestao_compra,
    'Reposição de Estoque — ' || v.sku || ' abaixo do mínimo', 'Estoque', null);
end;
$$;

-- ---------- 10. Concessão de Execução das Funções do Estoque ----------
grant execute on function public.movimentar_estoque(uuid, text, numeric, text, text, numeric) to authenticated, anon;
grant execute on function public.curva_abc(int) to authenticated, anon;
grant execute on function public.abrir_inventario(text) to authenticated, anon;
grant execute on function public.registrar_contagem(uuid, uuid, numeric) to authenticated, anon;
grant execute on function public.fechar_inventario(uuid) to authenticated, anon;
grant execute on function public.cancelar_inventario(uuid) to authenticated, anon;
grant execute on function public.solicitar_reposicao(uuid) to authenticated, anon;
grant execute on function public.receber_compra(uuid, text, uuid, date, numeric) to authenticated;

notify pgrst, 'reload schema';
