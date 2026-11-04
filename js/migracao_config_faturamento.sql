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

insert into public.config_faturamento
  (id, razao_social, serie_nfe, modelo_nfe, proximo_numero_nfe, ambiente_nfe)
values (1, '', '1', '55', 1, 'homologacao')
on conflict (id) do nothing;

alter table public.config_faturamento enable row level security;
grant select, insert, update on public.config_faturamento to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'config_faturamento'
      and policyname = 'authenticated_all'
  ) then
    create policy authenticated_all on public.config_faturamento
      for all to authenticated using (true) with check (true);
  end if;
end;
$$;

notify pgrst, 'reload schema';