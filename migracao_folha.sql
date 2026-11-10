-- =====================================================================
-- SysCana - CORRECOES DA FOLHA DE PAGAMENTO
-- Rode DEPOIS de schema.sql e migracao_estoque.sql. Idempotente.
-- Este arquivo e 100% ASCII de proposito: assim nao pode ser corrompido
-- ao copiar/colar (o problema do "a" nos acentos).
--
--  1. Corrige acentos corrompidos ja gravados no banco (dados, funcoes, regras)
--  2. Funcionario: CPF valido e unico, salario > 0, cargo em lista, "Inativar"
--  3. INSS e IRRF automaticos (tabelas com vigencia, valores de 2026)
--  4. Holerite: bruto vem do cadastro, descontos automaticos, sem duplicar,
--     sem mes futuro
--  5. Contas a pagar da folha identificadas (tela "Salarios" so da folha)
-- =====================================================================

-- ---------- 1. REPARO DE ACENTOS CORROMPIDOS ----------
-- Desfaz "A", "a" etc. (UTF-8 lido como Windows-1252). Seguro: so altera o
-- texto quando o resultado e UTF-8 valido; texto correto nunca e tocado.
create or replace function public._fix_mojibake(p text) returns text
language plpgsql immutable as $f$
declare
  b bytea := ''::bytea;
  ch text; cp int; r text; i int;
begin
  if p is null or p !~ ('[' || chr(194) || chr(195) || chr(226) || ']') then
    return p;
  end if;
  for i in 1 .. length(p) loop
    ch := substr(p, i, 1);
    cp := ascii(ch);
    if cp < 256 then
      b := b || decode(lpad(to_hex(cp), 2, '0'), 'hex');
    else
      begin
        b := b || convert_to(ch, 'WIN1252');
      exception when others then
        return p;
      end;
    end if;
  end loop;
  begin
    r := convert_from(b, 'UTF8');
  exception when others then
    return p;
  end;
  return r;
end
$f$;

create or replace function public.corrigir_acentos() returns text
language plpgsql set search_path = public as $f$
declare
  r record; v_n bigint; v_dados bigint := 0; v_fn int := 0; v_ck int := 0; v_df int := 0;
  v_new text;
  v_pat text := '[' || chr(194) || chr(195) || chr(226) || ']';
  cks jsonb := '[]'::jsonb;
begin
  -- (a) regras CHECK com texto corrompido: remove e guarda a versao corrigida
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ v_pat
  loop
    v_new := public._fix_mojibake(r.def);
    if v_new <> r.def then
      cks := cks || jsonb_build_array(jsonb_build_object('tbl', r.tbl, 'name', r.conname, 'def', v_new));
      execute format('alter table %s drop constraint %I', r.tbl, r.conname);
      v_ck := v_ck + 1;
    end if;
  end loop;

  -- (b) valores padrao (DEFAULT) com texto corrompido
  for r in
    select a.attrelid::regclass::text as tbl, a.attname, pg_get_expr(d.adbin, d.adrelid) as expr
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class cl on cl.oid = a.attrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relkind = 'r' and pg_get_expr(d.adbin, d.adrelid) ~ v_pat
  loop
    v_new := public._fix_mojibake(r.expr);
    if v_new <> r.expr then
      execute format('alter table %s alter column %I set default %s', r.tbl, r.attname, v_new);
      v_df := v_df + 1;
    end if;
  end loop;

  -- (c) dados gravados nas tabelas
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'character')
  loop
    begin
      execute format('alter table public.%I disable trigger user', r.table_name);
      execute format('update public.%I set %I = public._fix_mojibake(%I) where %I ~ %L and public._fix_mojibake(%I) <> %I',
                     r.table_name, r.column_name, r.column_name, r.column_name, v_pat, r.column_name, r.column_name);
      get diagnostics v_n = row_count;
      v_dados := v_dados + v_n;
      execute format('alter table public.%I enable trigger user', r.table_name);
    exception when others then
      begin execute format('alter table public.%I enable trigger user', r.table_name); exception when others then null; end;
      raise notice 'Aviso: nao foi possivel corrigir %.% (%)', r.table_name, r.column_name, sqlerrm;
    end;
  end loop;

  -- (d) corpo das funcoes (mensagens de erro, descricoes geradas)
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname not in ('_fix_mojibake', 'corrigir_acentos') and p.prosrc ~ v_pat
  loop
    v_new := public._fix_mojibake(r.def);
    if v_new <> r.def then
      begin
        execute v_new;
        v_fn := v_fn + 1;
      exception when others then
        raise notice 'Aviso: nao foi possivel corrigir a funcao % (%)', r.proname, sqlerrm;
      end;
    end if;
  end loop;

  -- (e) devolve as regras CHECK ja corrigidas
  for r in select * from jsonb_to_recordset(cks) as t(tbl text, name text, def text) loop
    begin
      execute format('alter table %s add constraint %I %s', r.tbl, r.name, r.def);
    exception when others then
      raise notice 'Aviso: nao foi possivel recriar a regra % (%)', r.name, sqlerrm;
    end;
  end loop;

  return format('registros corrigidos: %s | funcoes: %s | regras: %s | padroes: %s', v_dados, v_fn, v_ck, v_df);
end
$f$;

do $$
declare v_res text;
begin
  begin
    v_res := public.corrigir_acentos();
    raise notice 'Reparo de acentos -> %', v_res;
  exception when others then
    raise notice 'Reparo de acentos ignorado (%). Rode depois: select public.corrigir_acentos();', sqlerrm;
  end;
end $$;

-- ---------- 2. CARGOS, CPF E REGRAS DO FUNCIONARIO ----------
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz default now()
);
create unique index if not exists cargos_nome_uk on public.cargos (lower(nome));

insert into public.cargos (nome)
select v.n from (values
  (U&'Gerente Agr\00EDcola'), (U&'Supervisor Agr\00EDcola'), (U&'Engenheiro Agr\00F4nomo'), (U&'Engenheira Agr\00F4noma'),
  (U&'T\00E9cnico Agr\00EDcola'), (U&'Fiscal de Turma'), (U&'Operador de Colhedora'), (U&'Operador de M\00E1quinas Agr\00EDcolas'),
  (U&'Tratorista'), (U&'Motorista de Caminh\00E3o (Transbordo)'), (U&'Auxiliar Agr\00EDcola'),
  (U&'Mec\00E2nico Industrial'), (U&'Mec\00E2nico de M\00E1quinas Agr\00EDcolas'), (U&'Soldador'), (U&'Eletricista'),
  (U&'Auxiliar de Laborat\00F3rio (PCTS)'), (U&'T\00E9cnico de Seguran\00E7a do Trabalho'),
  (U&'Almoxarife'), (U&'Auxiliar de Almoxarifado'), (U&'Comprador'),
  (U&'Analista Financeiro'), (U&'Analista Comercial'), (U&'Analista de PCP'),
  (U&'Analista de Folha de Pagamento'), (U&'Assistente Administrativo'), (U&'Assistente de RH'),
  (U&'Gerente Administrativo')
) as v(n)
on conflict do nothing;
-- mantem validos os cargos que ja existiam no cadastro
insert into public.cargos (nome)
select distinct btrim(cargo) from public.funcionarios where cargo is not null and btrim(cargo) <> ''
on conflict do nothing;

alter table public.cargos enable row level security;
drop policy if exists authenticated_all on public.cargos;
create policy authenticated_all on public.cargos for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.cargos to authenticated;

create or replace function public.cpf_normalizar(p text) returns text
language plpgsql immutable as $f$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return null; end if;
  s := 0;
  for i in 1 .. 9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return null; end if;
  s := 0;
  for i in 1 .. 10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 11, 1)::int then return null; end if;
  return substr(d,1,3) || '.' || substr(d,4,3) || '.' || substr(d,7,3) || '-' || substr(d,10,2);
end
$f$;

-- "Inativar": novo status e data
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.funcionarios'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.funcionarios drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.funcionarios add constraint funcionarios_status_check check (status in ('Ativo','Inativo','Demitido'));
alter table public.funcionarios add column if not exists inativado_em date;

create or replace function public.trg_funcionarios_validar() returns trigger
language plpgsql as $f$
declare v_cpf text; v_cargo text;
begin
  if tg_op = 'INSERT' or new.cpf is distinct from old.cpf then
    v_cpf := public.cpf_normalizar(new.cpf);
    if v_cpf is null then
      raise exception using message = U&'CPF inv\00E1lido. Informe um CPF v\00E1lido (11 d\00EDgitos).';
    end if;
    if exists (select 1 from public.funcionarios f
               where regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g') = regexp_replace(v_cpf, '\D', '', 'g')
                 and f.id is distinct from new.id) then
      raise exception using message = U&'J\00E1 existe um funcion\00E1rio cadastrado com este CPF.';
    end if;
    new.cpf := v_cpf;
  end if;
  if tg_op = 'INSERT' or new.salario is distinct from old.salario then
    if new.salario is null or new.salario <= 0 then
      raise exception using message = U&'Informe um sal\00E1rio maior que zero.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.cargo is distinct from old.cargo then
    select nome into v_cargo from public.cargos where lower(nome) = lower(btrim(coalesce(new.cargo, '')));
    if v_cargo is null then
      raise exception using message = U&'Selecione um cargo da lista (ou cadastre o cargo antes).';
    end if;
    new.cargo := v_cargo;
  end if;
  if new.status is distinct from 'Ativo' and (tg_op = 'INSERT' or old.status = 'Ativo') then
    new.inativado_em := coalesce(new.inativado_em, current_date);
  elsif new.status = 'Ativo' then
    new.inativado_em := null;
  end if;
  return new;
end
$f$;

drop trigger if exists funcionarios_validar on public.funcionarios;
create trigger funcionarios_validar before insert or update on public.funcionarios
  for each row execute function public.trg_funcionarios_validar();

-- nao apaga funcionario que tem historico (use Inativar)
create or replace function public.trg_funcionarios_nao_excluir() returns trigger
language plpgsql as $f$
begin
  if exists (select 1 from public.holerites where funcionario_id = old.id) then
    raise exception using message = U&'Este funcion\00E1rio possui holerites e n\00E3o pode ser exclu\00EDdo. Use "Inativar" para manter o hist\00F3rico.';
  end if;
  return old;
end
$f$;
drop trigger if exists funcionarios_nao_excluir on public.funcionarios;
create trigger funcionarios_nao_excluir before delete on public.funcionarios
  for each row execute function public.trg_funcionarios_nao_excluir();

do $$
begin
  if exists (select 1 from (select regexp_replace(cpf, '\D', '', 'g') d from public.funcionarios where cpf is not null) x group by d having count(*) > 1) then
    raise notice 'Ha CPFs repetidos no cadastro antigo: a trava de CPF unico vale para novos cadastros/edicoes.';
  else
    create unique index if not exists funcionarios_cpf_uk on public.funcionarios ((regexp_replace(cpf, '\D', '', 'g'))) where cpf is not null;
  end if;
end $$;

-- ---------- 3. TABELAS DE INSS E IRRF (com vigencia) ----------
create table if not exists public.folha_inss_faixas (
  vigencia date not null, limite numeric(14,2) not null, aliquota numeric(6,3) not null,
  primary key (vigencia, limite)
);
create table if not exists public.folha_irrf_faixas (
  vigencia date not null, limite numeric(14,2) not null, aliquota numeric(6,3) not null, deducao numeric(14,2) not null default 0,
  primary key (vigencia, limite)
);
create table if not exists public.folha_irrf_parametros (
  vigencia date primary key,
  desconto_simplificado numeric(14,2) not null default 0,
  isencao_ate numeric(14,2) not null default 0,
  reducao_ate numeric(14,2) not null default 0,
  reducao_max numeric(14,2) not null default 0,
  reducao_a numeric(14,6) not null default 0,
  reducao_b numeric(14,6) not null default 0
);

-- INSS empregado: 2025 e 2026 (Portaria Interministerial MPS/MF 13/2026)
insert into public.folha_inss_faixas (vigencia, limite, aliquota) values
  ('2025-01-01', 1518.00, 7.5), ('2025-01-01', 2793.88, 9), ('2025-01-01', 4190.83, 12), ('2025-01-01', 8157.41, 14),
  ('2026-01-01', 1621.00, 7.5), ('2026-01-01', 2902.84, 9), ('2026-01-01', 4354.27, 12), ('2026-01-01', 8475.55, 14)
on conflict do nothing;

-- IRRF mensal: tabela progressiva (a mesma em 2025-05 e 2026)
insert into public.folha_irrf_faixas (vigencia, limite, aliquota, deducao)
select v.vig::date, f.l, f.a, f.d
from (values ('2025-05-01'), ('2026-01-01')) as v(vig)
cross join (values (2428.80, 0::numeric, 0::numeric), (2826.65, 7.5, 182.16), (3751.05, 15, 394.16),
                   (4664.68, 22.5, 675.49), (999999999.99, 27.5, 908.73)) as f(l, a, d)
on conflict do nothing;

-- 2025-05: desconto simplificado de 564,80 | 2026: 607,20 + redutor da Lei 15.270/2025
insert into public.folha_irrf_parametros (vigencia, desconto_simplificado, isencao_ate, reducao_ate, reducao_max, reducao_a, reducao_b) values
  ('2025-05-01', 564.80, 0, 0, 0, 0, 0),
  ('2026-01-01', 607.20, 5000.00, 7350.00, 312.89, 978.62, 0.133145)
on conflict do nothing;

alter table public.folha_inss_faixas enable row level security;
alter table public.folha_irrf_faixas enable row level security;
alter table public.folha_irrf_parametros enable row level security;
do $$
declare t text;
begin
  for t in select unnest(array['folha_inss_faixas','folha_irrf_faixas','folha_irrf_parametros']) loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format('create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.calcular_inss(p_bruto numeric, p_comp date default current_date) returns numeric
language plpgsql stable set search_path = public as $f$
declare v_vig date; v_total numeric;
begin
  if coalesce(p_bruto, 0) <= 0 then return 0; end if;
  v_vig := coalesce((select max(vigencia) from folha_inss_faixas where vigencia <= p_comp),
                    (select min(vigencia) from folha_inss_faixas));
  select coalesce(sum(greatest(least(p_bruto, f.limite) - f.ant, 0) * f.aliquota / 100.0), 0) into v_total
  from (select limite, aliquota, coalesce(lag(limite) over (order by limite), 0) as ant
        from folha_inss_faixas where vigencia = v_vig) f;
  return round(v_total, 2);
end
$f$;

create or replace function public.calcular_irrf(p_bruto numeric, p_inss numeric, p_comp date default current_date) returns numeric
language plpgsql stable set search_path = public as $f$
declare
  prm record; fx record; v_vig_p date; v_vig_f date; v_base numeric; v_imp numeric; v_red numeric;
begin
  if coalesce(p_bruto, 0) <= 0 then return 0; end if;
  v_vig_p := coalesce((select max(vigencia) from folha_irrf_parametros where vigencia <= p_comp),
                      (select min(vigencia) from folha_irrf_parametros));
  v_vig_f := coalesce((select max(vigencia) from folha_irrf_faixas where vigencia <= p_comp),
                      (select min(vigencia) from folha_irrf_faixas));
  select * into prm from folha_irrf_parametros where vigencia = v_vig_p;
  -- base = bruto menos o maior entre INSS e o desconto simplificado
  v_base := p_bruto - greatest(coalesce(p_inss, 0), coalesce(prm.desconto_simplificado, 0));
  if v_base <= 0 then return 0; end if;
  select aliquota, deducao into fx from folha_irrf_faixas
   where vigencia = v_vig_f and limite >= v_base order by limite limit 1;
  v_imp := greatest(round(v_base * coalesce(fx.aliquota, 0) / 100.0 - coalesce(fx.deducao, 0), 2), 0);
  if coalesce(prm.reducao_ate, 0) > 0 then
    if p_bruto <= prm.isencao_ate then v_red := least(prm.reducao_max, v_imp);
    elsif p_bruto <= prm.reducao_ate then v_red := greatest(prm.reducao_a - prm.reducao_b * p_bruto, 0);
    else v_red := 0;
    end if;
    v_imp := greatest(v_imp - round(v_red, 2), 0);
  end if;
  return round(v_imp, 2);
end
$f$;

-- ---------- 4. HOLERITE: automatico, sem duplicar, sem mes futuro ----------
alter table public.holerites add column if not exists inss numeric(14,2) not null default 0;
alter table public.holerites add column if not exists irrf numeric(14,2) not null default 0;
alter table public.contas_pagar add column if not exists origem text;
alter table public.contas_pagar add column if not exists holerite_id uuid references public.holerites(id) on delete set null;
create index if not exists contas_pagar_origem_idx on public.contas_pagar (origem);

do $$
begin
  if exists (select 1 from (select funcionario_id, (competencia - (extract(day from competencia)::int - 1)) m from public.holerites) x
             group by funcionario_id, m having count(*) > 1) then
    raise notice 'Ha holerites duplicados no historico antigo: a trava vale para novos holerites.';
  else
    create unique index if not exists holerites_func_mes_uk
      on public.holerites (funcionario_id, (competencia - (extract(day from competencia)::int - 1)));
  end if;
end $$;

-- Simulacao para a tela (sem gravar nada)
create or replace function public.folha_simular(p_funcionario_id uuid, p_competencia date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare
  f record; v_comp date; v_inss numeric; v_irrf numeric; v_ja boolean; v_aviso text := null;
begin
  select * into f from funcionarios where id = p_funcionario_id;
  if f.id is null then raise exception using message = U&'Funcion\00E1rio n\00E3o encontrado.'; end if;
  v_comp := coalesce(p_competencia, current_date);
  v_comp := v_comp - (extract(day from v_comp)::int - 1);
  v_inss := calcular_inss(f.salario, v_comp);
  v_irrf := calcular_irrf(f.salario, v_inss, v_comp);
  v_ja := exists (select 1 from holerites h where h.funcionario_id = f.id
                  and (h.competencia - (extract(day from h.competencia)::int - 1)) = v_comp);
  if f.status <> 'Ativo' then v_aviso := U&'Este funcion\00E1rio n\00E3o est\00E1 ativo.';
  elsif v_comp > (current_date - (extract(day from current_date)::int - 1)) then v_aviso := U&'N\00E3o \00E9 permitido gerar holerite de m\00EAs futuro.';
  elsif v_ja then v_aviso := U&'J\00E1 existe holerite deste funcion\00E1rio para a compet\00EAncia escolhida.';
  end if;
  return jsonb_build_object(
    'funcionario_id', f.id, 'nome', f.nome, 'cargo', f.cargo, 'status', f.status,
    'competencia', v_comp, 'bruto', f.salario, 'inss', v_inss, 'irrf', v_irrf,
    'descontos', v_inss + v_irrf, 'liquido', f.salario - v_inss - v_irrf,
    'ja_existe', v_ja, 'aviso', v_aviso);
end
$f$;

create or replace function public.gerar_holerite(p_funcionario_id uuid, p_competencia date) returns uuid
language plpgsql security definer set search_path = public as $f$
declare
  f record; v_comp date; v_inss numeric; v_irrf numeric; v_liq numeric; v_id uuid;
begin
  select * into f from funcionarios where id = p_funcionario_id;
  if f.id is null or f.status <> 'Ativo' then
    raise exception using message = U&'Funcion\00E1rio ativo n\00E3o encontrado.';
  end if;
  if p_competencia is null then raise exception using message = U&'Informe a compet\00EAncia (m\00EAs/ano).'; end if;
  v_comp := p_competencia - (extract(day from p_competencia)::int - 1);
  if v_comp > (current_date - (extract(day from current_date)::int - 1)) then
    raise exception using message = U&'N\00E3o \00E9 permitido gerar holerite de m\00EAs futuro.';
  end if;
  if coalesce(f.salario, 0) <= 0 then
    raise exception using message = U&'O funcion\00E1rio est\00E1 sem sal\00E1rio cadastrado. Corrija o cadastro.';
  end if;
  if exists (select 1 from holerites h where h.funcionario_id = f.id
             and (h.competencia - (extract(day from h.competencia)::int - 1)) = v_comp) then
    raise exception using message = format(U&'J\00E1 existe holerite de %s para %s.', f.nome, to_char(v_comp, 'MM/YYYY'));
  end if;

  v_inss := calcular_inss(f.salario, v_comp);
  v_irrf := calcular_irrf(f.salario, v_inss, v_comp);
  v_liq := f.salario - v_inss - v_irrf;

  insert into holerites (funcionario_id, competencia, bruto, inss, irrf, descontos, liquido)
  values (f.id, v_comp, f.salario, v_inss, v_irrf, v_inss + v_irrf, v_liq)
  returning id into v_id;

  insert into contas_pagar (descricao, valor, vencimento, origem, holerite_id)
  values ('Folha ' || to_char(v_comp, 'MM/YYYY') || ' ' || chr(8212) || ' ' || f.nome, v_liq,
          (v_comp + interval '1 month' - interval '1 day')::date, 'folha', v_id);

  perform lancar_contabil('Despesa com pessoal', U&'Sal\00E1rios a pagar', v_liq, 'Holerite ' || f.nome, 'folha');
  return v_id;
end
$f$;

-- Versao antiga (4 parametros): continua existindo, mas ignora bruto/descontos digitados
create or replace function public.gerar_holerite(p_funcionario_id uuid, p_competencia date, p_bruto numeric, p_descontos numeric) returns uuid
language plpgsql security definer set search_path = public as $f$
begin
  return public.gerar_holerite(p_funcionario_id, p_competencia);
end
$f$;

-- ---------- 5. CONTAS A PAGAR DA FOLHA ----------
update public.contas_pagar set origem = 'folha' where origem is null and descricao like 'Folha %';
update public.contas_pagar c set holerite_id = h.id
from public.holerites h join public.funcionarios f on f.id = h.funcionario_id
where c.origem = 'folha' and c.holerite_id is null
  and c.descricao = 'Folha ' || to_char(h.competencia, 'MM/YYYY') || ' ' || chr(8212) || ' ' || f.nome;
update public.contas_pagar set origem = 'compra' where origem is null and fatura_id is not null;

grant execute on function public.cpf_normalizar(text) to authenticated;
grant execute on function public.calcular_inss(numeric, date) to authenticated;
grant execute on function public.calcular_irrf(numeric, numeric, date) to authenticated;
grant execute on function public.folha_simular(uuid, date) to authenticated;
grant execute on function public.gerar_holerite(uuid, date) to authenticated;
grant execute on function public.gerar_holerite(uuid, date, numeric, numeric) to authenticated;
grant execute on function public.corrigir_acentos() to authenticated;

notify pgrst, 'reload schema';
