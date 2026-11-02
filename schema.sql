-- SysCana ERP integrado — rode este arquivo inteiro no SQL Editor (pode rodar de novo)
-- Depois, rode migracao_estoque.sql (SKU, custo médio, curva ABC, inventário).

create extension if not exists "pgcrypto";

-- ========== TABELAS ==========
create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome_fantasia text not null,
  razao_social text,
  cnpj text,
  telefone text,
  email text,
  cidade text,
  created_at timestamptz default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  inscricao_estadual text,
  telefone text,
  rua text,
  numero text,
  bairro text,
  cidade text,
  estado text,
  cep text,
  created_at timestamptz default now()
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data_cadastro date default current_date,
  unidade text default 't',
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  quantidade_estoque numeric(14,3) not null default 0,
  qtd_minima numeric(14,3) default 0,
  qtd_maxima numeric(14,3) default 0,
  categoria text not null default 'Insumos',
  created_at timestamptz default now()
);

create table if not exists public.movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','saida')),
  quantidade numeric(14,3) not null check (quantidade > 0),
  estoque_anterior numeric(14,3) not null,
  estoque_posterior numeric(14,3) not null,
  origem text default 'manual',
  observacao text,
  created_at timestamptz default now()
);

create table if not exists public.variedades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text
);

create table if not exists public.talhoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  area_ha numeric(10,2),
  localizacao text
);

create table if not exists public.insumos_pcp (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  quantidade numeric(14,3) default 0,
  unidade text default 'kg'
);

create table if not exists public.canas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  producao_estimada numeric(14,3) default 0,
  variedade_id uuid references public.variedades(id) on delete set null,
  produto_id uuid references public.produtos(id) on delete set null
);

create table if not exists public.producoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  toneladas numeric(14,3) default 0,
  atr numeric(8,2) default 0,
  quantidade numeric(14,3) default 0,
  talhao_id uuid references public.talhoes(id) on delete set null,
  variedade_id uuid references public.variedades(id) on delete set null,
  cana_id uuid references public.canas(id) on delete set null,
  insumo_id uuid references public.insumos_pcp(id) on delete set null,
  quantidade_insumo numeric(14,3) default 0,
  status text default 'EM PROGRESSO',
  data_inicio date,
  data_fim date,
  created_at timestamptz default now()
);

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  produto_id uuid references public.produtos(id) on delete set null,
  quantidade numeric(14,3) default 1,
  valor_estimado numeric(14,2) default 0,
  status text default 'Aberta',
  created_at timestamptz default now()
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cana_id uuid references public.canas(id) on delete set null,
  quantidade numeric(14,3) not null,
  unidade text default 't',
  forma_pgto text default 'Boleto',
  status text default 'Aberto',
  created_at timestamptz default now()
);

create table if not exists public.impostos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  taxa numeric(8,2) not null default 0
);

create table if not exists public.faturas (
  id uuid primary key default gen_random_uuid(),
  numero_fatura text not null unique,
  data_emissao date not null,
  data_vencimento date not null,
  valor_subtotal numeric(14,2) not null,
  valor_impostos numeric(14,2) not null default 0,
  valor_frete numeric(14,2) not null default 0,
  valor_total numeric(14,2) not null,
  natureza_operacao text not null check (natureza_operacao in ('Venda','Compra')),
  status_pagamento text not null default 'Pendente' check (status_pagamento in ('Pendente','Pago')),
  condicoes_pagamento text,
  cliente_id uuid references public.clientes(id),
  imposto_id uuid references public.impostos(id),
  created_at timestamptz default now()
);

create table if not exists public.fatura_itens (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references public.faturas(id) on delete cascade,
  cana_id uuid references public.canas(id) on delete set null,
  produto_id uuid references public.produtos(id) on delete set null,
  quantidade numeric(14,3) not null check (quantidade > 0)
);

create table if not exists public.config_faturamento (
  id int primary key default 1 check (id = 1),
  razao_social text default 'SysCana Agroindústria',
  cnpj text,
  inscricao_estadual text,
  endereco text,
  serie_nfe text default '1'
);

create table if not exists public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric(14,2) not null,
  vencimento date not null,
  status text default 'Aberto' check (status in ('Aberto','Pago')),
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  pago_em date,
  created_at timestamptz default now()
);

create table if not exists public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric(14,2) not null,
  vencimento date not null,
  status text default 'Aberto' check (status in ('Aberto','Recebido')),
  cliente_id uuid references public.clientes(id) on delete set null,
  recebido_em date,
  fatura_id uuid references public.faturas(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,
  cpf text,
  salario numeric(14,2) default 0,
  admissao date,
  status text default 'Ativo' check (status in ('Ativo','Demitido')),
  created_at timestamptz default now()
);

create table if not exists public.holerites (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  competencia date not null,
  bruto numeric(14,2) not null,
  descontos numeric(14,2) default 0,
  liquido numeric(14,2) not null,
  created_at timestamptz default now()
);

-- ========== UPGRADE (projetos que já rodaram a versão antiga) ==========
alter table public.produtos drop constraint if exists produtos_categoria_check;
alter table public.produtos add constraint produtos_categoria_check
  check (categoria in ('Cana','Insumos','Embalagem','Combustivel','Pecas','Lubrificantes','Seguranca','Escritorio','Outros'));

alter table public.insumos_pcp add column if not exists produto_id uuid references public.produtos(id) on delete set null;
alter table public.producoes add column if not exists estoque_baixado boolean default false;
alter table public.solicitacoes add column if not exists origem text default 'Manual';
alter table public.solicitacoes add column if not exists producao_id uuid references public.producoes(id) on delete set null;
alter table public.solicitacoes add column if not exists observacao text;
alter table public.solicitacoes add column if not exists cotacao_id uuid;
alter table public.solicitacoes drop constraint if exists solicitacoes_status_check;
alter table public.solicitacoes drop constraint if exists solicitacoes_origem_check;
alter table public.solicitacoes add constraint solicitacoes_origem_check
  check (origem in ('PCP','Estoque','Manual'));
alter table public.solicitacoes add constraint solicitacoes_status_check
  check (status in (
    'Aberta','EmCotacao','AguardandoFinanceiro','Aprovada','Reprovada','PedidoEmitido','Atendida'
  ));

alter table public.pedidos add column if not exists fatura_id uuid references public.faturas(id) on delete set null;
alter table public.pedidos add column if not exists valor_unitario numeric(14,2) default 0;
alter table public.pedidos add column if not exists valor_total numeric(14,2) default 0;
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check
  check (status in ('Aberto','Faturado','Cancelado'));

alter table public.faturas alter column cliente_id drop not null;
alter table public.faturas add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null;
alter table public.faturas add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
alter table public.faturas add column if not exists pedido_compra_id uuid;

alter table public.contas_pagar add column if not exists fatura_id uuid references public.faturas(id) on delete set null;

create table if not exists public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id),
  valor_unitario numeric(14,2) not null check (valor_unitario >= 0),
  valor_total numeric(14,2) not null check (valor_total >= 0),
  prazo_dias int default 0,
  observacao text,
  escolhida boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  produto_id uuid references public.produtos(id),
  quantidade numeric(14,3) not null,
  valor numeric(14,2) not null,
  status text default 'Aberto' check (status in ('Aberto','Recebido')),
  fatura_id uuid references public.faturas(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  conta_debito text not null,
  conta_credito text not null,
  valor numeric(14,2) not null,
  historico text not null,
  origem text,
  created_at timestamptz default now()
);

alter table public.solicitacoes drop constraint if exists solicitacoes_cotacao_id_fkey;
alter table public.solicitacoes add constraint solicitacoes_cotacao_id_fkey
  foreign key (cotacao_id) references public.cotacoes(id) on delete set null;

alter table public.faturas drop constraint if exists faturas_pedido_compra_id_fkey;
alter table public.faturas add constraint faturas_pedido_compra_id_fkey
  foreign key (pedido_compra_id) references public.pedidos_compra(id) on delete set null;

-- ========== FUNÇÕES ==========
create or replace function public.lancar_contabil(
  p_debito text, p_credito text, p_valor numeric, p_historico text, p_origem text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_valor is null or p_valor <= 0 then return; end if;
  insert into lancamentos (conta_debito, conta_credito, valor, historico, origem)
  values (p_debito, p_credito, p_valor, p_historico, p_origem);
end;
$$;

create or replace function public.movimentar_estoque(
  p_produto_id uuid, p_tipo text, p_quantidade numeric,
  p_origem text default 'manual', p_observacao text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_atual numeric(14,3);
  v_novo numeric(14,3);
begin
  if p_produto_id is null then
    raise exception 'Produto de estoque não informado. Cadastre o item em Estoque antes.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;
  if p_tipo not in ('entrada','saida') then
    raise exception 'Tipo inválido';
  end if;

  select quantidade_estoque into v_atual from produtos where id = p_produto_id for update;
  if v_atual is null then
    raise exception 'Produto não encontrado no estoque';
  end if;

  if p_tipo = 'saida' then
    if v_atual < p_quantidade then
      raise exception 'Estoque insuficiente. Disponível: %', v_atual;
    end if;
    v_novo := v_atual - p_quantidade;
  else
    v_novo := v_atual + p_quantidade;
  end if;

  update produtos set quantidade_estoque = v_novo where id = p_produto_id;
  insert into movimentacoes_estoque (
    produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, origem, observacao
  ) values (
    p_produto_id, p_tipo, p_quantidade, v_atual, v_novo, p_origem, p_observacao
  );
  return jsonb_build_object('ok', true, 'estoque_anterior', v_atual, 'estoque_posterior', v_novo);
end;
$$;

create or replace function public.solicitar_compra(
  p_produto_id uuid, p_quantidade numeric, p_descricao text,
  p_origem text default 'Manual', p_producao_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_produto_id is null or not exists (select 1 from produtos where id = p_produto_id) then
    raise exception 'Cadastre o produto no estoque antes de solicitar a compra';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade inválida';
  end if;
  insert into solicitacoes (descricao, produto_id, quantidade, origem, producao_id, status)
  values (p_descricao, p_produto_id, p_quantidade, coalesce(p_origem,'Manual'), p_producao_id, 'Aberta')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.registrar_cotacao(
  p_solicitacao_id uuid, p_fornecedor_id uuid, p_valor_unitario numeric,
  p_prazo_dias int default 0, p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_qtd numeric(14,3);
  v_id uuid;
  v_status text;
begin
  select quantidade, status into v_qtd, v_status from solicitacoes where id = p_solicitacao_id for update;
  if v_qtd is null then raise exception 'Solicitação não encontrada'; end if;
  if v_status not in ('Aberta','EmCotacao') then
    raise exception 'Só é possível cotar solicitação Aberta ou Em cotação (status atual: %)', v_status;
  end if;
  insert into cotacoes (solicitacao_id, fornecedor_id, valor_unitario, valor_total, prazo_dias, observacao)
  values (p_solicitacao_id, p_fornecedor_id, p_valor_unitario, round(p_valor_unitario * v_qtd, 2), coalesce(p_prazo_dias,0), p_observacao)
  returning id into v_id;
  update solicitacoes set status = 'EmCotacao' where id = p_solicitacao_id;
  return v_id;
end;
$$;

create or replace function public.enviar_financeiro(p_cotacao_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sol uuid;
  v_forn uuid;
  v_total numeric(14,2);
  v_status text;
begin
  select solicitacao_id, fornecedor_id, valor_total into v_sol, v_forn, v_total
  from cotacoes where id = p_cotacao_id;
  if v_sol is null then raise exception 'Cotação não encontrada'; end if;
  select status into v_status from solicitacoes where id = v_sol for update;
  if v_status not in ('Aberta','EmCotacao') then
    raise exception 'Envie ao financeiro somente após cotar (status: %)', v_status;
  end if;
  update cotacoes set escolhida = (id = p_cotacao_id) where solicitacao_id = v_sol;
  update solicitacoes set
    status = 'AguardandoFinanceiro',
    cotacao_id = p_cotacao_id,
    fornecedor_id = v_forn,
    valor_estimado = v_total
  where id = v_sol;
end;
$$;

create or replace function public.decidir_financeiro(p_solicitacao_id uuid, p_aprovar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from solicitacoes where id = p_solicitacao_id for update;
  if v_status <> 'AguardandoFinanceiro' then
    raise exception 'Financeiro só decide solicitações aguardando aprovação';
  end if;
  if p_aprovar then
    update solicitacoes set status = 'Aprovada' where id = p_solicitacao_id;
  else
    update solicitacoes set status = 'Reprovada' where id = p_solicitacao_id;
  end if;
end;
$$;

create or replace function public.emitir_pedido_compra(p_solicitacao_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_id uuid;
begin
  select * into s from solicitacoes where id = p_solicitacao_id for update;
  if s.id is null then raise exception 'Solicitação não encontrada'; end if;
  if s.status <> 'Aprovada' then
    raise exception 'Compras só emite o pedido depois da aprovação financeira';
  end if;
  if s.fornecedor_id is null or s.produto_id is null then
    raise exception 'Solicitação sem fornecedor ou produto';
  end if;
  insert into pedidos_compra (solicitacao_id, fornecedor_id, produto_id, quantidade, valor, status)
  values (s.id, s.fornecedor_id, s.produto_id, s.quantidade, s.valor_estimado, 'Aberto')
  returning id into v_id;
  update solicitacoes set status = 'PedidoEmitido' where id = s.id;
  return v_id;
end;
$$;

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
    perform movimentar_estoque(pc.produto_id, 'entrada', pc.quantidade, 'compra', 'NF ' || v_numero);
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

create or replace function public.faturar_venda(
  p_pedido_id uuid, p_numero text, p_imposto_id uuid, p_vencimento date, p_frete numeric default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_cana record;
  v_taxa numeric(8,2) := 0;
  v_sub numeric(14,2);
  v_imposto numeric(14,2);
  v_total numeric(14,2);
  v_fatura uuid;
begin
  select * into p from pedidos where id = p_pedido_id for update;
  if p.id is null then raise exception 'Pedido de venda não encontrado'; end if;
  if p.status <> 'Aberto' then raise exception 'Pedido já faturado ou cancelado'; end if;
  if p.cliente_id is null then raise exception 'Pedido sem cliente'; end if;
  if exists (select 1 from faturas where numero_fatura = p_numero) then
    raise exception 'Número de NF já usado';
  end if;

  select * into v_cana from canas where id = p.cana_id;
  if v_cana.id is null then raise exception 'Cana do pedido inválida'; end if;
  if v_cana.produto_id is null then
    raise exception 'Essa cana não está ligada a um produto de estoque. Cadastre a cana novamente.';
  end if;

  v_sub := coalesce(nullif(p.valor_total,0), round(coalesce(p.valor_unitario,0) * p.quantidade, 2));
  if v_sub <= 0 then raise exception 'Informe o valor do pedido de venda antes de faturar'; end if;
  if p_imposto_id is not null then
    select taxa into v_taxa from impostos where id = p_imposto_id;
  end if;
  v_imposto := round(v_sub * (coalesce(v_taxa,0) / 100.0), 2);
  v_total := round(v_sub + v_imposto + coalesce(p_frete,0), 2);

  insert into faturas (
    numero_fatura, data_emissao, data_vencimento, valor_subtotal, valor_impostos, valor_frete, valor_total,
    natureza_operacao, status_pagamento, condicoes_pagamento, cliente_id, imposto_id, pedido_id
  ) values (
    p_numero, current_date, coalesce(p_vencimento, current_date + 30), v_sub, v_imposto, coalesce(p_frete,0), v_total,
    'Venda', 'Pendente', p.forma_pgto, p.cliente_id, p_imposto_id, p.id
  ) returning id into v_fatura;

  insert into fatura_itens (fatura_id, cana_id, produto_id, quantidade)
  values (v_fatura, p.cana_id, v_cana.produto_id, p.quantidade);

  perform movimentar_estoque(v_cana.produto_id, 'saida', p.quantidade, 'venda', 'NF ' || p_numero);

  insert into contas_receber (descricao, valor, vencimento, cliente_id, fatura_id)
  values ('NF ' || p_numero, v_total, coalesce(p_vencimento, current_date + 30), p.cliente_id, v_fatura);

  perform lancar_contabil('Clientes', 'Receita de vendas', v_total, 'Faturamento NF ' || p_numero, 'venda');

  update pedidos set status = 'Faturado', fatura_id = v_fatura, valor_total = v_sub where id = p.id;
  return v_fatura;
end;
$$;

create or replace function public.concluir_producao(p_producao_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr record;
  v_insumo uuid;
  v_saida uuid;
  v_qtd_in numeric(14,3);
  v_qtd_out numeric(14,3);
begin
  select * into pr from producoes where id = p_producao_id for update;
  if pr.id is null then raise exception 'Produção não encontrada'; end if;
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

create or replace function public.baixar_pagar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from contas_pagar where id = p_id for update;
  if c.id is null then raise exception 'Conta não encontrada'; end if;
  if c.status <> 'Aberto' then raise exception 'Conta já baixada'; end if;
  update contas_pagar set status = 'Pago', pago_em = current_date where id = p_id;
  update faturas set status_pagamento = 'Pago' where id = c.fatura_id;
  perform lancar_contabil('Fornecedores', 'Caixa', c.valor, 'Pagamento ' || c.descricao, 'pagar');
end;
$$;

create or replace function public.baixar_receber(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from contas_receber where id = p_id for update;
  if c.id is null then raise exception 'Conta não encontrada'; end if;
  if c.status <> 'Aberto' then raise exception 'Conta já baixada'; end if;
  update contas_receber set status = 'Recebido', recebido_em = current_date where id = p_id;
  update faturas set status_pagamento = 'Pago' where id = c.fatura_id;
  perform lancar_contabil('Caixa', 'Clientes', c.valor, 'Recebimento ' || c.descricao, 'receber');
end;
$$;

-- ========== RLS ==========
alter table public.fornecedores enable row level security;
alter table public.clientes enable row level security;
alter table public.produtos enable row level security;
alter table public.movimentacoes_estoque enable row level security;
alter table public.variedades enable row level security;
alter table public.talhoes enable row level security;
alter table public.insumos_pcp enable row level security;
alter table public.canas enable row level security;
alter table public.producoes enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.pedidos enable row level security;
alter table public.impostos enable row level security;
alter table public.faturas enable row level security;
alter table public.fatura_itens enable row level security;
alter table public.config_faturamento enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.contas_receber enable row level security;
alter table public.funcionarios enable row level security;
alter table public.holerites enable row level security;
alter table public.cotacoes enable row level security;
alter table public.pedidos_compra enable row level security;
alter table public.lancamentos enable row level security;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'fornecedores','clientes','produtos','movimentacoes_estoque','variedades','talhoes',
      'insumos_pcp','canas','producoes','solicitacoes','pedidos','impostos','faturas',
      'fatura_itens','config_faturamento','contas_pagar','contas_receber','funcionarios','holerites',
      'cotacoes','pedidos_compra','lancamentos'
    ])
  loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

grant execute on function public.lancar_contabil(text, text, numeric, text, text) to authenticated;
grant execute on function public.movimentar_estoque(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.solicitar_compra(uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.registrar_cotacao(uuid, uuid, numeric, int, text) to authenticated;
grant execute on function public.enviar_financeiro(uuid) to authenticated;
grant execute on function public.decidir_financeiro(uuid, boolean) to authenticated;
grant execute on function public.emitir_pedido_compra(uuid) to authenticated;
grant execute on function public.receber_compra(uuid, text, uuid, date, numeric) to authenticated;
grant execute on function public.faturar_venda(uuid, text, uuid, date, numeric) to authenticated;
grant execute on function public.concluir_producao(uuid) to authenticated;
create or replace function public.gerar_holerite(
  p_funcionario_id uuid, p_competencia date, p_bruto numeric, p_descontos numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_liq numeric(14,2);
  v_id uuid;
  v_nome text;
begin
  if p_bruto is null or p_bruto < 0 then raise exception 'Salário bruto inválido'; end if;
  v_liq := p_bruto - coalesce(p_descontos, 0);
  if v_liq < 0 then raise exception 'Descontos maiores que o bruto'; end if;
  select nome into v_nome from funcionarios where id = p_funcionario_id and status = 'Ativo';
  if v_nome is null then raise exception 'Funcionário ativo não encontrado'; end if;

  insert into holerites (funcionario_id, competencia, bruto, descontos, liquido)
  values (p_funcionario_id, p_competencia, p_bruto, coalesce(p_descontos,0), v_liq)
  returning id into v_id;

  insert into contas_pagar (descricao, valor, vencimento)
  values ('Folha ' || to_char(p_competencia, 'MM/YYYY') || ' — ' || v_nome, v_liq, (date_trunc('month', p_competencia) + interval '1 month' - interval '1 day')::date);

  perform lancar_contabil('Despesa com pessoal', 'Salários a pagar', v_liq, 'Holerite ' || v_nome, 'folha');
  return v_id;
end;
$$;

grant execute on function public.baixar_pagar(uuid) to authenticated;
grant execute on function public.baixar_receber(uuid) to authenticated;
grant execute on function public.gerar_holerite(uuid, date, numeric, numeric) to authenticated;

-- ========== SEED ==========
insert into public.config_faturamento (id, razao_social, cnpj, serie_nfe)
values (1, 'SysCana Agroindústria Ltda', '00.000.000/0001-00', '1')
on conflict (id) do nothing;

insert into public.impostos (nome, taxa)
select v.nome, v.taxa from (values
  ('ICMS 12%', 12::numeric),
  ('ICMS 18%', 18::numeric),
  ('PIS/COFINS 9,25%', 9.25::numeric)
) as v(nome, taxa)
where not exists (select 1 from public.impostos i where i.nome = v.nome);

insert into public.variedades (nome, descricao)
select v.nome, v.descricao from (values
  ('RB867515', 'Variedade tardia, alto ATR'),
  ('CTC4', 'Ciclo médio, boa brotação'),
  ('RB92579', 'Alta produtividade agrícola')
) as v(nome, descricao)
where not exists (select 1 from public.variedades x where x.nome = v.nome);

insert into public.fornecedores (nome_fantasia, cidade)
select 'AgroInsumos Brasil', 'Ribeirão Preto'
where not exists (select 1 from public.fornecedores where nome_fantasia = 'AgroInsumos Brasil');

insert into public.clientes (nome, cidade, estado)
select 'Destilaria São João', 'Piracicaba', 'SP'
where not exists (select 1 from public.clientes where nome = 'Destilaria São João');

insert into public.produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima)
select v.nome, v.un, v.cat, 0, v.min
from (values
  ('Adubo NPK 20-05-20', 'kg', 'Insumos', 200::numeric),
  ('Herbicida glifosato', 'L', 'Insumos', 50::numeric),
  ('Diesel S10', 'L', 'Combustivel', 100::numeric)
) as v(nome, un, cat, min)
where not exists (select 1 from public.produtos p where p.nome = v.nome);
