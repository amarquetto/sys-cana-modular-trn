-- =====================================================================
-- SysCana — DADOS DE DEMONSTRAÇÃO  (safra de cana: vendas, produção, compras, folha)
-- Rode DEPOIS de: schema.sql, migracao_estoque.sql, migracao_faturamento_fiscal.sql
-- e migracao_contrato_cana.sql. Rode UMA vez (se rodar de novo, ele avisa e não duplica).
--
-- Tudo é gerado pelas funções reais do sistema (estoque, contas, lançamentos e NFs
-- ficam coerentes) e depois as datas são recuadas, relativas a HOJE, para parecer
-- uma safra em andamento. CPFs/CNPJs são FICTÍCIOS (dígito verificador válido).
-- Use em banco de teste/demonstração: ele cria clientes, fornecedores, funcionários etc.
--
-- Conteúdo:  8 fornecedores · 6 clientes · 14 funcionários (3 meses de folha) ·
--   16 compras em todos os estágios · 8 produções de talhão · 13 contratos de cana
--   (recebidos, a receber, em produção, atrasado, cancelado) · 6 NFs de cana ligadas
--   aos contratos · 3 NFs de serviço · 2 devoluções de insumo · despesas da safra.
-- =====================================================================
do $seed$
declare
  d date := current_date;
  x record; c record; k record; e record; t record;
  v_sol uuid; v_cot uuid; v_ped uuid; v_fat uuid; v_cp uuid; v_prod uuid; v_ct uuid; v_op uuid; v_cr uuid; v_hol uuid; v_cli uuid; v_forn uuid; v_imp uuid;
  v_num int; v_comp date; v_venc date; v_pago date; v_dt date; i int; n int;
  j_func jsonb := $j$[{"nome": "Carlos Eduardo Menezes", "cargo": "Gerente Agrícola", "cpf": "158.813.998-03", "salario": 11800, "adm": "2019-03-04", "desc": 3026.2, "dem": false}, {"nome": "Fernanda Ribeiro Lopes", "cargo": "Engenheira Agrônoma", "cpf": "698.797.309-17", "salario": 9200, "adm": "2021-02-15", "desc": 2311.2, "dem": false}, {"nome": "Marcos Antônio Pereira", "cargo": "Técnico Agrícola", "cpf": "114.170.753-50", "salario": 4300, "adm": "2020-08-10", "desc": 411.6, "dem": false}, {"nome": "José Roberto Almeida", "cargo": "Operador de Colhedora", "cpf": "645.568.151-77", "salario": 3900, "adm": "2018-05-21", "desc": 361.41, "dem": false}, {"nome": "Anderson Luiz Batista", "cargo": "Operador de Colhedora", "cpf": "884.472.940-72", "salario": 3900, "adm": "2022-04-11", "desc": 361.41, "dem": false}, {"nome": "Paulo Sérgio Ferreira", "cargo": "Motorista de Caminhão (Transbordo)", "cpf": "557.616.987-57", "salario": 3400, "adm": "2019-09-02", "desc": 301.41, "dem": false}, {"nome": "Valdir Aparecido Souza", "cargo": "Tratorista", "cpf": "168.976.846-00", "salario": 3100, "adm": "2021-06-07", "desc": 265.41, "dem": false}, {"nome": "Rogério Nascimento", "cargo": "Mecânico Industrial", "cpf": "978.809.320-54", "salario": 3800, "adm": "2020-01-13", "desc": 349.41, "dem": false}, {"nome": "Juliana Martins Costa", "cargo": "Analista Financeiro", "cpf": "819.672.731-38", "salario": 5600, "adm": "2022-09-19", "desc": 828.62, "dem": false}, {"nome": "Patrícia Gomes Duarte", "cargo": "Assistente Administrativo", "cpf": "778.486.488-42", "salario": 2900, "adm": "2023-03-06", "desc": 241.41, "dem": false}, {"nome": "Thiago Henrique Rocha", "cargo": "Comprador", "cpf": "766.344.002-10", "salario": 4700, "adm": "2021-11-22", "desc": 467.6, "dem": false}, {"nome": "Luciana Prado Siqueira", "cargo": "Analista Comercial", "cpf": "978.753.477-18", "salario": 5200, "adm": "2022-01-10", "desc": 624.88, "dem": false}, {"nome": "Renato Cardoso Lima", "cargo": "Auxiliar de Laboratório (PCTS)", "cpf": "876.804.571-90", "salario": 2700, "adm": "2023-07-03", "desc": 220.23, "dem": false}, {"nome": "Edson Barbosa Santos", "cargo": "Auxiliar Agrícola", "cpf": "784.726.714-45", "salario": 2200, "adm": "2020-04-20", "desc": 175.23, "dem": true}]$j$::jsonb;
begin
  if to_regclass('public.contratos_cana') is null or not exists (select 1 from pg_proc where proname = 'emitir_fatura_especial')
     or not exists (select 1 from information_schema.columns where table_name='contratos_cana' and column_name='fatura_id') then
    raise exception 'Rode antes: schema.sql, migracao_estoque.sql, migracao_faturamento_fiscal.sql e migracao_contrato_cana.sql (versões mais recentes).';
  end if;
  if exists (select 1 from clientes where nome = 'Usina Vale Verde Açúcar e Álcool S/A') then
    raise notice 'Dados de demonstração já carregados — nada a fazer.';
    return;
  end if;

  ---------------------------------------------------------------- 1. EMPRESA, IMPOSTOS
  update config_faturamento set razao_social='SysCana Agroindústria Ltda', cnpj='61.584.645/0001-03', inscricao_estadual='060454146590',
    endereco='Estrada Municipal JAU-070, km 8 — Zona Rural, Jaú/SP', uf='SP', municipio='Jaú', codigo_municipio_ibge='3525300',
    serie_nfe='1', modelo_nfe='55', proximo_numero_nfe=1007, ambiente_nfe='homologacao',
    cfop_venda_cana='5.101', cfop_devolucao_insumo='5.556' where id=1;

  insert into impostos (nome, taxa, operacao, descricao)
  select v.n, v.t, v.o, v.d from (values
    ('ISSQN 2%', 2::numeric, 'Serviço', 'Serviços agrícolas — alíquota municipal'),
    ('ISSQN 3%', 3::numeric, 'Serviço', 'Colheita terceirizada — alíquota municipal'),
    ('ICMS diferido (cana)', 0::numeric, 'Venda', 'Diferimento — Art. 345 do RICMS/SP'),
    ('ICMS devolução 12%', 12::numeric, 'Devolução', 'Devolução de insumos ao fornecedor')
  ) as v(n,t,o,d) where not exists (select 1 from impostos ix where ix.nome = v.n);
  update impostos set descricao = 'Operação interna' where nome = 'ICMS 12%' and descricao is null;
  update impostos set descricao = 'Operação interna (alíquota majorada)' where nome = 'ICMS 18%' and descricao is null;
  update impostos set descricao = 'Contribuições federais' where nome = 'PIS/COFINS 9,25%' and descricao is null;

  ---------------------------------------------------------------- 2. CADASTROS
  insert into variedades (nome, descricao)
  select v.n, v.d from (values ('CTC9','Alta produtividade, ciclo médio'),('RB966928','Porte ereto, boa colheita mecanizada'),('CTC15','Tolerante à seca, ciclo precoce')) as v(n,d)
  where not exists (select 1 from variedades vr where vr.nome = v.n);

  insert into talhoes (nome, area_ha, localizacao) select 'Talhão 01 — Santa Rita', 42.5, 'Fazenda Santa Rita — Jaú/SP' where not exists (select 1 from talhoes where nome='Talhão 01 — Santa Rita');
  insert into talhoes (nome, area_ha, localizacao) select 'Talhão 02 — Santa Rita', 38.0, 'Fazenda Santa Rita — Jaú/SP' where not exists (select 1 from talhoes where nome='Talhão 02 — Santa Rita');
  insert into talhoes (nome, area_ha, localizacao) select 'Talhão 03 — São Pedro', 55.2, 'Fazenda São Pedro — Bariri/SP' where not exists (select 1 from talhoes where nome='Talhão 03 — São Pedro');
  insert into talhoes (nome, area_ha, localizacao) select 'Talhão 04 — São Pedro', 61.8, 'Fazenda São Pedro — Bariri/SP' where not exists (select 1 from talhoes where nome='Talhão 04 — São Pedro');
  insert into talhoes (nome, area_ha, localizacao) select 'Talhão 05 — Boa Esperança', 27.3, 'Sítio Boa Esperança — Dois Córregos/SP' where not exists (select 1 from talhoes where nome='Talhão 05 — Boa Esperança');
  insert into talhoes (nome, area_ha, localizacao) select 'Talhão 06 — Três Marias', 47.9, 'Fazenda Três Marias — Mineiros do Tietê/SP' where not exists (select 1 from talhoes where nome='Talhão 06 — Três Marias');
  update fornecedores set razao_social='AgroInsumos Brasil Comércio Ltda', cnpj='87.718.841/0001-17', telefone='(14) 3627-4790', email='vendas@agroinsumosbrasil.example', cidade='Ribeirão Preto' where nome_fantasia='AgroInsumos Brasil';
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) select 'AgroInsumos Brasil','AgroInsumos Brasil Comércio Ltda','87.718.841/0001-17','(14) 3627-4790','vendas@agroinsumosbrasil.example','Ribeirão Preto' where not exists (select 1 from fornecedores where nome_fantasia='AgroInsumos Brasil');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('Fertilizantes Campo Forte','Fertilizantes Campo Forte Ltda','01.756.820/0001-70','(14) 3645-3568','comercial@campoforte.example','Sertãozinho');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('AgroQuímica Paulista','AgroQuímica Paulista Ltda','58.983.194/0001-72','(14) 3671-4513','pedidos@agroquimicapaulista.example','Paulínia');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('Posto Rota do Açúcar','Rota do Açúcar Combustíveis Ltda','94.948.214/0001-38','(14) 3612-8144','gerencia@rotadoacucar.example','Jaú');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('Petro Tietê Combustíveis','Petro Tietê Distribuidora de Combustíveis Ltda','21.052.185/0001-58','(14) 3635-2047','vendas@petrotiete.example','Bauru');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('Calcário Dois Córregos','Calcário Dois Córregos Mineração Ltda','45.244.106/0001-79','(14) 3699-5211','contato@calcarioDC.example','Dois Córregos');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('Mecânica & Peças Tietê','Mecânica e Peças Tietê Ltda','60.013.041/0001-44','(14) 3612-6739','oficina@mpteite.example','Jaú');
  insert into fornecedores (nome_fantasia, razao_social, cnpj, telefone, email, cidade) values ('Distribuidora Nutri Safra','Nutri Safra Distribuidora Agrícola Ltda','57.990.659/0001-50','(14) 3627-8580','atendimento@nutrisafra.example','Araraquara');
  insert into clientes (nome, documento, inscricao_estadual, telefone, rua, numero, bairro, cidade, estado, cep) values ('Usina Vale Verde Açúcar e Álcool S/A','75.136.270/0001-23','107981933190','(14) 3696-9953','Rodovia SP-304, km 12','s/n','Zona Rural','Barra Bonita','SP','17340-000');
  update clientes set documento='45.205.997/0001-54', inscricao_estadual='283792984162', telefone='(14) 3617-6013', rua='Estrada Municipal PIR-040', numero='1200', bairro='Zona Rural', cidade='Piracicaba', estado='SP', cep='13400-000' where nome='Destilaria São João';
  insert into clientes (nome, documento, inscricao_estadual, telefone, rua, numero, bairro, cidade, estado, cep) select 'Destilaria São João','45.205.997/0001-54','283792984162','(14) 3617-6013','Estrada Municipal PIR-040','1200','Zona Rural','Piracicaba','SP','13400-000' where not exists (select 1 from clientes where nome='Destilaria São João');
  insert into clientes (nome, documento, inscricao_estadual, telefone, rua, numero, bairro, cidade, estado, cep) values ('Usina Bom Retiro Bioenergia Ltda','86.628.360/0001-58','161055008754','(14) 3657-6341','Rodovia SP-255, km 88','s/n','Zona Rural','Bariri','SP','17250-000');
  insert into clientes (nome, documento, inscricao_estadual, telefone, rua, numero, bairro, cidade, estado, cep) values ('Cooperativa Canavieira do Médio Tietê','17.799.229/0001-30','836957931860','(14) 3625-3840','Av. Zezinho Magalhães','455','Distrito Industrial','Jaú','SP','17201-000');
  insert into clientes (nome, documento, inscricao_estadual, telefone, rua, numero, bairro, cidade, estado, cep) values ('Agroindustrial Santa Clara Ltda','08.073.702/0001-07','838222646861','(14) 3649-5995','Estrada Vicinal Bocaina–Brotas','km 6','Zona Rural','Bocaina','SP','17240-000');
  insert into clientes (nome, documento, inscricao_estadual, telefone, rua, numero, bairro, cidade, estado, cep) values ('Fazenda Três Marias — Antônio C. Villela','252.477.647-65',NULL,'(14) 3622-6337','Estrada da Boa Vista','km 3','Zona Rural','Mineiros do Tietê','SP','17320-000');

  -- Produtos de estoque (insumos, combustível, peças) e limites mín./máx.
  update produtos set qtd_minima=1500, qtd_maxima=12000 where nome='Adubo NPK 20-05-20';
  update produtos set qtd_minima=150,  qtd_maxima=1500  where nome='Herbicida glifosato';
  update produtos set qtd_minima=2000, qtd_maxima=20000 where nome='Diesel S10';
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Ureia 46%','kg','Insumos',0,800,6000 where not exists (select 1 from produtos where nome='Ureia 46%');
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Calcário dolomítico','t','Insumos',0,10,80 where not exists (select 1 from produtos where nome='Calcário dolomítico');
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Maturador Etefon','L','Insumos',0,200,800 where not exists (select 1 from produtos where nome='Maturador Etefon');
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Inseticida Fipronil','L','Insumos',0,40,300 where not exists (select 1 from produtos where nome='Inseticida Fipronil');
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Óleo lubrificante 15W40','L','Lubrificantes',0,60,400 where not exists (select 1 from produtos where nome='Óleo lubrificante 15W40');
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Faca de corte de base — colhedora','un','Pecas',0,10,60 where not exists (select 1 from produtos where nome='Faca de corte de base — colhedora');
  insert into produtos (nome, unidade, categoria, quantidade_estoque, qtd_minima, qtd_maxima) select 'Luva nitrílica de segurança','par','Seguranca',0,40,200 where not exists (select 1 from produtos where nome='Luva nitrílica de segurança');
  insert into insumos_pcp (nome, unidade, produto_id, quantidade) select p.nome, p.unidade, p.id, 0 from produtos p where p.nome='Adubo NPK 20-05-20' and not exists (select 1 from insumos_pcp where nome='Adubo NPK 20-05-20');
  insert into insumos_pcp (nome, unidade, produto_id, quantidade) select p.nome, p.unidade, p.id, 0 from produtos p where p.nome='Herbicida glifosato' and not exists (select 1 from insumos_pcp where nome='Herbicida glifosato');
  insert into insumos_pcp (nome, unidade, produto_id, quantidade) select p.nome, p.unidade, p.id, 0 from produtos p where p.nome='Ureia 46%' and not exists (select 1 from insumos_pcp where nome='Ureia 46%');
  insert into insumos_pcp (nome, unidade, produto_id, quantidade) select p.nome, p.unidade, p.id, 0 from produtos p where p.nome='Calcário dolomítico' and not exists (select 1 from insumos_pcp where nome='Calcário dolomítico');
  insert into insumos_pcp (nome, unidade, produto_id, quantidade) select p.nome, p.unidade, p.id, 0 from produtos p where p.nome='Maturador Etefon' and not exists (select 1 from insumos_pcp where nome='Maturador Etefon');
  insert into insumos_pcp (nome, unidade, produto_id, quantidade) select p.nome, p.unidade, p.id, 0 from produtos p where p.nome='Inseticida Fipronil' and not exists (select 1 from insumos_pcp where nome='Inseticida Fipronil');
  insert into canas (nome, producao_estimada, variedade_id)
  select v.n, v.e, (select id from variedades where nome = v.n) from (values ('CTC4',3200::numeric),('RB867515',3000),('RB92579',4200),('CTC9',4800),('RB966928',3900)) as v(n,e)
  where not exists (select 1 from canas cn where cn.nome = v.n);

  -- Saldo inicial de itens de almoxarifado
  perform movimentar_estoque((select id from produtos where nome='Óleo lubrificante 15W40'),'entrada',208,'saldo_inicial','Saldo inicial de implantação',24.90);
  perform movimentar_estoque((select id from produtos where nome='Faca de corte de base — colhedora'),'entrada',24,'saldo_inicial','Saldo inicial de implantação',385.00);
  perform movimentar_estoque((select id from produtos where nome='Luva nitrílica de segurança'),'entrada',60,'saldo_inicial','Saldo inicial de implantação',9.80);
  update movimentacoes_estoque set created_at = (d - 160) where origem='saldo_inicial';


  ---------------------------------------------------------------- 3. FUNCIONÁRIOS E FOLHA (3 meses)
  insert into funcionarios (nome, cargo, cpf, salario, admissao, status)
  select j->>'nome', j->>'cargo', j->>'cpf', (j->>'salario')::numeric, (j->>'adm')::date, 'Ativo'
  from jsonb_array_elements(j_func) j;

  for n in reverse 3..1 loop
    v_comp := (date_trunc('month', d) - make_interval(months => n))::date;
    v_venc := (v_comp + interval '1 month' - interval '1 day')::date;
    i := 0;
    for e in
      select f.id, f.nome, f.salario, (j->>'desc')::numeric as descontos, (j->>'dem')::boolean as dem
      from funcionarios f join jsonb_array_elements(j_func) j on j->>'cpf' = f.cpf order by f.nome
    loop
      if e.dem and n = 1 then continue; end if;      -- desligado no último mês
      i := i + 1;
      v_hol := gerar_holerite(e.id, v_comp, e.salario, e.descontos);
      update holerites set created_at = (v_venc + 1) where id = v_hol;
      update lancamentos set data = v_venc where data = current_date and origem = 'folha';
      select id into v_cp from contas_pagar
       where status = 'Aberto' and fatura_id is null and created_at = now() and vencimento = v_venc and valor = (select liquido from holerites where id = v_hol)
       order by id limit 1;
      if v_cp is null then
        raise exception 'gerar_holerite não criou a conta a pagar da folha. Rode o schema.sql mais recente (função gerar_holerite).';
      end if;
      update contas_pagar set created_at = v_venc where id = v_cp;
      -- meses fechados: tudo pago. Último mês: os 8 primeiros pagos, o resto fica em aberto (atrasado)
      if n >= 2 or i <= 8 then
        perform baixar_pagar(v_cp);
        update contas_pagar set pago_em = v_venc where id = v_cp;
        update lancamentos set data = v_venc where data = current_date and origem = 'pagar';
      end if;
    end loop;
  end loop;
  update funcionarios set status = 'Demitido' where cpf = (select j->>'cpf' from jsonb_array_elements(j_func) j where (j->>'dem')::boolean);


  ---------------------------------------------------------------- 4. COMPRAS (todos os estágios)
  for x in select * from jsonb_to_recordset($j$[{"k": "C1", "prod": "Adubo NPK 20-05-20", "qtd": 6000, "descr": "Adubação de plantio — talhões 01 e 02 (safra 26/27)", "origem": "PCP", "sol": 150, "cot": [["Fertilizantes Campo Forte", 3.42, 7, "Entrega em big bag"], ["AgroInsumos Brasil", 3.58, 5, null], ["Distribuidora Nutri Safra", 3.49, 10, null]], "esc": 0, "estado": "paga", "nf": "004410", "imp": null, "frete": 380, "rec": 138, "venc": -108, "pago": 110}, {"k": "C2", "prod": "Herbicida glifosato", "qtd": 800, "descr": "Controle de daninhas pré-plantio", "origem": "PCP", "sol": 130, "cot": [["AgroQuímica Paulista", 24.1, 5, null], ["AgroInsumos Brasil", 25.4, 4, null], ["Distribuidora Nutri Safra", 24.8, 8, null]], "esc": 0, "estado": "paga", "nf": "007821", "imp": "ICMS 12%", "frete": 210, "rec": 119, "venc": -89, "pago": 92}, {"k": "C3", "prod": "Ureia 46%", "qtd": 4000, "descr": "Adubação de cobertura — cana-planta", "origem": "PCP", "sol": 120, "cot": [["Fertilizantes Campo Forte", 2.86, 6, null], ["AgroInsumos Brasil", 3.05, 4, null]], "esc": 0, "estado": "paga", "nf": "004455", "imp": null, "frete": 290, "rec": 108, "venc": -78, "pago": 80}, {"k": "C4", "prod": "Diesel S10", "qtd": 9000, "descr": "Abastecimento da frota — início de safra", "origem": "Manual", "sol": 100, "cot": [["Posto Rota do Açúcar", 6.05, 2, "Pagamento 30 dias"], ["Petro Tietê Combustíveis", 6.12, 3, null]], "esc": 0, "estado": "paga", "nf": "052133", "imp": null, "frete": 0, "rec": 94, "venc": -64, "pago": 66}, {"k": "C5", "prod": "Calcário dolomítico", "qtd": 40, "descr": "Correção de solo — talhão 04", "origem": "PCP", "sol": 95, "cot": [["Calcário Dois Córregos", 142.0, 9, null], ["Distribuidora Nutri Safra", 151.5, 6, null]], "esc": 0, "estado": "paga", "nf": "001907", "imp": null, "frete": 640, "rec": 82, "venc": -52, "pago": 55}, {"k": "C6", "prod": "Maturador Etefon", "qtd": 300, "descr": "Maturação antes da colheita — talhão 05", "origem": "PCP", "sol": 70, "cot": [["AgroQuímica Paulista", 61.8, 7, null], ["AgroInsumos Brasil", 64.9, 5, null]], "esc": 0, "estado": "paga", "nf": "007990", "imp": "ICMS 12%", "frete": 120, "rec": 60, "venc": -30, "pago": 33}, {"k": "C7", "prod": "Adubo NPK 20-05-20", "qtd": 4000, "descr": "Adubação — talhão 06 (cana-planta)", "origem": "PCP", "sol": 40, "cot": [["Fertilizantes Campo Forte", 3.61, 6, null], ["AgroInsumos Brasil", 3.7, 4, null]], "esc": 0, "estado": "recebida", "nf": "004702", "imp": null, "frete": 260, "rec": 38, "venc": -8, "pago": null}, {"k": "C8", "prod": "Diesel S10", "qtd": 8000, "descr": "Abastecimento da frota — pico de colheita", "origem": "Estoque", "sol": 20, "cot": [["Posto Rota do Açúcar", 6.18, 2, null], ["Petro Tietê Combustíveis", 6.24, 3, null]], "esc": 0, "estado": "recebida", "nf": "052840", "imp": null, "frete": 0, "rec": 18, "venc": 12, "pago": null}, {"k": "C9", "prod": "Inseticida Fipronil", "qtd": 150, "descr": "Controle de cupim — soqueira talhão 01", "origem": "PCP", "sol": 15, "cot": [["AgroQuímica Paulista", 178.0, 5, null], ["AgroInsumos Brasil", 186.5, 3, null]], "esc": 0, "estado": "recebida", "nf": "008155", "imp": "ICMS 12%", "frete": 90, "rec": 8, "venc": 22, "pago": null}, {"k": "C10", "prod": "Herbicida glifosato", "qtd": 600, "descr": "Controle de daninhas — soqueira", "origem": "PCP", "sol": 9, "cot": [["AgroQuímica Paulista", 24.9, 5, null], ["Distribuidora Nutri Safra", 25.7, 6, null]], "esc": 0, "estado": "pedido", "ped": 3}, {"k": "C11", "prod": "Ureia 46%", "qtd": 3000, "descr": "Adubação de cobertura — soqueira", "origem": "PCP", "sol": 6, "cot": [["Fertilizantes Campo Forte", 2.92, 6, null], ["AgroInsumos Brasil", 3.1, 4, null]], "esc": 0, "estado": "aprovada"}, {"k": "C12", "prod": "Maturador Etefon", "qtd": 250, "descr": "Reposição de Estoque — abaixo do mínimo", "origem": "Estoque", "sol": 4, "cot": [["AgroQuímica Paulista", 63.2, 7, null], ["AgroInsumos Brasil", 65.0, 5, null]], "esc": 0, "estado": "financeiro"}, {"k": "C13", "prod": "Calcário dolomítico", "qtd": 60, "descr": "Correção de solo — talhões 05 e 06", "origem": "PCP", "sol": 25, "cot": [["Calcário Dois Córregos", 149.0, 9, "Acima do orçamento da safra"], ["Distribuidora Nutri Safra", 158.0, 6, null]], "esc": 0, "estado": "reprovada"}, {"k": "C14", "prod": "Adubo NPK 20-05-20", "qtd": 5000, "descr": "Adubação de soqueira — safra 27/28", "origem": "PCP", "sol": 3, "cot": [["Fertilizantes Campo Forte", 3.66, 6, null], ["Distribuidora Nutri Safra", 3.71, 8, null]], "esc": 0, "estado": "cotacao"}, {"k": "C15", "prod": "Diesel S10", "qtd": 6000, "descr": "Reposição de Estoque — Diesel S10 abaixo do mínimo", "origem": "Estoque", "sol": 2, "cot": [], "esc": 0, "estado": "aberta"}, {"k": "C16", "prod": "Herbicida glifosato", "qtd": 300, "descr": "Herbicida para tratos culturais — OP talhão 03", "origem": "PCP", "sol": 1, "cot": [], "esc": 0, "estado": "aberta", "liga_op": "OP Tratos — Talhão 03 (RB92579)"}]$j$::jsonb)
    as t(k text, prod text, qtd numeric, descr text, origem text, sol int, cot jsonb, esc int, estado text, nf text, imp text, frete numeric, rec int, venc int, pago int, ped int)
  loop
    v_prod := (select id from produtos where nome = x.prod);
    v_sol := solicitar_compra(v_prod, x.qtd, x.descr, x.origem, null);
    update solicitacoes set created_at = (d - x.sol) where id = v_sol;
    v_cot := null;
    if x.cot is not null then
      for i in 0 .. coalesce(jsonb_array_length(x.cot),0) - 1 loop
        v_forn := (select id from fornecedores where nome_fantasia = x.cot->i->>0);
        n := (select count(*) from cotacoes where solicitacao_id = v_sol);
        perform registrar_cotacao(v_sol, v_forn, (x.cot->i->>1)::numeric, (x.cot->i->>2)::int, x.cot->i->>3);
        update cotacoes set created_at = (d - x.sol + 1) where solicitacao_id = v_sol;
        if i = x.esc then select id into v_cot from cotacoes where solicitacao_id = v_sol and fornecedor_id = v_forn; end if;
      end loop;
    end if;
    if x.estado in ('financeiro','aprovada','reprovada','pedido','recebida','paga') then
      perform enviar_financeiro(v_cot);
    end if;
    if x.estado in ('aprovada','pedido','recebida','paga') then perform decidir_financeiro(v_sol, true); end if;
    if x.estado = 'reprovada' then perform decidir_financeiro(v_sol, false); end if;
    if x.estado in ('pedido','recebida','paga') then
      v_ped := emitir_pedido_compra(v_sol);
      update pedidos_compra set created_at = (d - coalesce(x.ped, x.rec + 4)) where id = v_ped;
    end if;
    if x.estado in ('recebida','paga') then
      v_imp := (select id from impostos where nome = x.imp);
      v_fat := receber_compra(v_ped, x.nf, v_imp, d + x.venc, coalesce(x.frete,0));
      update faturas set data_emissao = (d - x.rec), created_at = (d - x.rec) where id = v_fat;
      update movimentacoes_estoque set created_at = (d - x.rec) where origem = 'compra' and observacao = 'NF ' || x.nf;
      update lancamentos set data = (d - x.rec) where data = current_date and origem = 'compra';
      select id into v_cp from contas_pagar where fatura_id = v_fat;
      update contas_pagar set created_at = (d - x.rec) where id = v_cp;
      if x.estado = 'paga' then
        perform baixar_pagar(v_cp);
        update contas_pagar set pago_em = (d - x.pago) where id = v_cp;
        update lancamentos set data = (d - x.pago) where data = current_date and origem = 'pagar';
      end if;
    end if;
  end loop;

  -- Custo médio = preço médio pago nas compras recebidas (antes de consumir estoque)
  update produtos p set custo_medio = round(s.v / s.q, 4)
  from (select produto_id, sum(valor) v, sum(quantidade) q from pedidos_compra where status = 'Recebido' group by 1) s
  where p.id = s.produto_id;
  update movimentacoes_estoque m set custo_unitario = p.custo_medio from produtos p
  where p.id = m.produto_id and m.origem = 'compra' and m.custo_unitario is null;


  ---------------------------------------------------------------- 5. PRODUÇÃO DE CANA (talhões)
  for x in select * from jsonb_to_recordset($j$[{"nome": "OP Plantio — Talhão 01 (CTC4)", "t": 3480.5, "atr": 134.2, "tal": "Talhão 01 — Santa Rita", "var": "CTC4", "ins": "Adubo NPK 20-05-20", "qi": 2100, "ini": -125, "fim": -100, "st": "CONCLUIDO"}, {"nome": "OP Colheita — Talhão 02 (RB867515)", "t": 2950.0, "atr": 138.9, "tal": "Talhão 02 — Santa Rita", "var": "RB867515", "ins": "Herbicida glifosato", "qi": 240, "ini": -112, "fim": -90, "st": "CONCLUIDO"}, {"nome": "OP Colheita — Talhão 03 (RB92579)", "t": 4620.8, "atr": 131.7, "tal": "Talhão 03 — São Pedro", "var": "RB92579", "ins": "Ureia 46%", "qi": 1800, "ini": -100, "fim": -72, "st": "CONCLUIDO"}, {"nome": "OP Colheita — Talhão 04 (CTC9)", "t": 4980.0, "atr": 136.4, "tal": "Talhão 04 — São Pedro", "var": "CTC9", "ins": "Calcário dolomítico", "qi": 22, "ini": -78, "fim": -50, "st": "CONCLUIDO"}, {"nome": "OP Colheita — Talhão 05 (CTC4)", "t": 2150.3, "atr": 133.0, "tal": "Talhão 05 — Boa Esperança", "var": "CTC4", "ins": "Maturador Etefon", "qi": 120, "ini": -55, "fim": -30, "st": "CONCLUIDO"}, {"nome": "OP Colheita — Talhão 06 (RB966928)", "t": 3900.0, "atr": 0, "tal": "Talhão 06 — Três Marias", "var": "RB966928", "ins": "Adubo NPK 20-05-20", "qi": 1500, "ini": -12, "fim": null, "st": "EM PROGRESSO"}, {"nome": "OP Soqueira — Talhão 01 (CTC4)", "t": 3200.0, "atr": 0, "tal": "Talhão 01 — Santa Rita", "var": "CTC4", "ins": "Inseticida Fipronil", "qi": 60, "ini": -5, "fim": null, "st": "EM PROGRESSO"}, {"nome": "OP Tratos — Talhão 03 (RB92579)", "t": 4000.0, "atr": 0, "tal": "Talhão 03 — São Pedro", "var": "RB92579", "ins": "Herbicida glifosato", "qi": 180, "ini": -2, "fim": null, "st": "EM PROGRESSO"}]$j$::jsonb)
    as t(nome text, t numeric, atr numeric, tal text, var text, ins text, qi numeric, ini int, fim int, st text)
  loop
    insert into producoes (nome, toneladas, atr, quantidade, talhao_id, variedade_id, cana_id, insumo_id, quantidade_insumo, status, data_inicio, data_fim, created_at, estoque_baixado)
    values (x.nome, x.t, x.atr, x.t,
            (select id from talhoes where nome = x.tal),
            (select id from variedades where nome = x.var),
            (select id from canas where nome = x.var),
            (select id from insumos_pcp where nome = x.ins),
            x.qi, x.st, d + x.ini, case when x.fim is null then null else d + x.fim end, d + x.ini, (x.st = 'CONCLUIDO'))
    returning id into v_op;
    if x.st = 'CONCLUIDO' then
      perform movimentar_estoque((select produto_id from insumos_pcp where nome = x.ins), 'saida', x.qi, 'producao', 'OP ' || x.nome);
      update movimentacoes_estoque set created_at = (d + x.ini) where origem = 'producao' and observacao = 'OP ' || x.nome;
    end if;
  end loop;

  -- Consumo de diesel da frota (colhedoras, tratores, caminhões)
  for x in select * from jsonb_to_recordset($j$[{"dias": -90, "l": 1800}, {"dias": -75, "l": 2100}, {"dias": -60, "l": 1600}, {"dias": -48, "l": 1900}, {"dias": -35, "l": 1500}, {"dias": -12, "l": 2200}, {"dias": -6, "l": 2400}, {"dias": -3, "l": 1750}]$j$::jsonb) as t(dias int, l numeric)
  loop
    perform movimentar_estoque((select id from produtos where nome = 'Diesel S10'), 'saida', x.l, 'manual', 'Abastecimento da frota — ' || to_char(d + x.dias, 'DD/MM'));
    update movimentacoes_estoque set created_at = (d + x.dias) where origem = 'manual' and observacao = 'Abastecimento da frota — ' || to_char(d + x.dias, 'DD/MM');
  end loop;
  -- solicitação de compra do PCP ligada à OP em andamento
  update solicitacoes set producao_id = (select id from producoes where nome = 'OP Tratos — Talhão 03 (RB92579)') where descricao like 'Herbicida para tratos culturais%';


  ---------------------------------------------------------------- 6. CONTRATOS DE CANA (Comercial → PCP → Financeiro)
  for k in select * from jsonb_to_recordset($j$[{"cli": "Usina Vale Verde Açúcar e Álcool S/A", "qtd": 1200, "p": 1.148, "cr": 150, "ent": -120, "st": "recebido", "t": 1186.4, "atr": 135.2, "nf": "001001", "cct": 14.5, "imp": 0, "lab": [20.4, 17.9, 87.8, 12.6, 2.1, 0.3], "tp": "PJ"}, {"cli": "Destilaria São João", "qtd": 800, "p": 1.125, "cr": 135, "ent": -100, "st": "recebido", "t": 812.6, "atr": 138.9, "nf": "001002", "cct": 0, "imp": 0, "lab": [21.1, 18.6, 88.4, 12.1, 1.8, 0.2], "tp": "PJ"}, {"cli": "Usina Bom Retiro Bioenergia Ltda", "qtd": 1500, "p": 1.162, "cr": 120, "ent": -85, "st": "recebido", "t": 1498.2, "atr": 133.4, "nf": "001003", "cct": 14.5, "imp": 2140.0, "lab": [19.8, 17.2, 86.9, 13.0, 3.4, 0.6], "tp": "PJ"}, {"cli": "Cooperativa Canavieira do Médio Tietê", "qtd": 600, "p": 1.131, "cr": 100, "ent": -68, "st": "recebido", "t": 591.75, "atr": 136.1, "nf": "001004", "cct": 0, "imp": 0, "lab": [20.7, 18.1, 87.5, 12.4, 2.0, 0.3], "tp": "PJ"}, {"cli": "Agroindustrial Santa Clara Ltda", "qtd": 450, "p": 1.118, "cr": 80, "ent": -50, "st": "recebido", "t": 457.3, "atr": 131.6, "nf": "001005", "cct": 14.5, "imp": 380.0, "lab": [19.5, 16.9, 86.2, 13.2, 2.6, 0.4], "tp": "PJ"}, {"cli": "Usina Vale Verde Açúcar e Álcool S/A", "qtd": 1000, "p": 1.189, "cr": 62, "ent": -20, "st": "aguardando", "t": 987.4, "atr": 134.8, "venc": 10, "nf": "001006", "cct": 0, "imp": 0, "lab": [20.2, 17.7, 87.6, 12.5, 2.2, 0.3], "tp": "PJ"}, {"cli": "Destilaria São João", "qtd": 700, "p": 1.176, "cr": 75, "ent": -45, "st": "aguardando", "t": 702.1, "atr": 137.2, "venc": -4, "nf": null}, {"cli": "Cooperativa Canavieira do Médio Tietê", "qtd": 520, "p": 1.201, "cr": 30, "ent": -6, "st": "aguardando", "t": 515.8, "atr": 133.9, "venc": 24, "nf": null}, {"cli": "Usina Bom Retiro Bioenergia Ltda", "qtd": 900, "p": 1.21, "cr": 14, "ent": 9, "st": "producao"}, {"cli": "Usina Vale Verde Açúcar e Álcool S/A", "qtd": 1300, "p": 1.224, "cr": 9, "ent": 21, "st": "producao"}, {"cli": "Agroindustrial Santa Clara Ltda", "qtd": 380, "p": 1.195, "cr": 4, "ent": 40, "st": "producao"}, {"cli": "Destilaria São João", "qtd": 640, "p": 1.198, "cr": 25, "ent": -3, "st": "producao"}, {"cli": "Fazenda Três Marias — Antônio C. Villela", "qtd": 300, "p": 1.15, "cr": 40, "ent": -10, "st": "cancelado"}]$j$::jsonb)
    as t(cli text, qtd numeric, p numeric, cr int, ent int, st text, t numeric, atr numeric, venc int, nf text, cct numeric, imp numeric, lab jsonb, tp text)
  loop
    select id, nome, documento into c from clientes where nome = k.cli;
    v_ct := registrar_contrato_cana(c.nome, c.documento, k.p, d + 30, k.qtd);
    select numero into v_num from contratos_cana where id = v_ct;
    select id into v_op from producoes where contrato_id = v_ct;
    update contratos_cana set created_at = (d - k.cr), data_entrega = (d + k.ent) where id = v_ct;
    update producoes set created_at = (d - k.cr), data_inicio = (d - k.cr) where id = v_op;

    if k.st in ('recebido','aguardando') then
      v_dt := d + k.ent;
      v_venc := case when k.venc is null then quinto_dia_util(v_dt) else d + k.venc end;
      perform baixar_contrato_cana(v_op, k.t, k.atr, v_venc);
      update producoes set data_fim = v_dt where id = v_op;
      select id into v_cr from contas_receber where contrato_id = v_ct;
      update contas_receber set created_at = v_dt where id = v_cr;
      update lancamentos set data = v_dt where data = current_date and origem = 'venda';
      if k.st = 'recebido' then
        perform baixar_receber(v_cr);
        update contas_receber set recebido_em = v_venc where id = v_cr;
        update lancamentos set data = v_venc where data = current_date and origem = 'receber';
      end if;
    elsif k.st = 'cancelado' then
      perform cancelar_contrato_cana(v_ct);
    end if;

    -- NF de venda de cana ligada ao contrato (não duplica a conta a receber)
    if k.nf is not null then
      select valor_total into t from contratos_cana where id = v_ct;
      select emitir_fatura_especial(
        p_tipo_operacao => 'Venda_Cana', p_numero_nf => k.nf, p_parceiro_id => (select cliente_id::text from contratos_cana where id = v_ct),
        p_valor_bruto => t.valor_total, p_desconto_cct => round(k.t * coalesce(k.cct,0), 2), p_aliquota_issqn => 0,
        p_modalidade => 'CANA_BALANCA', p_tipo_produtor => coalesce(k.tp,'PJ'), p_toneladas => k.t, p_atr => k.atr,
        p_responsabilidade_cct => case when coalesce(k.cct,0) > 0 then 'FORNECEDOR_TOTAL' else 'USINA_TOTAL' end,
        p_imp_vegetal => (k.lab->>4)::numeric, p_imp_mineral => (k.lab->>5)::numeric, p_desconto_impurezas => coalesce(k.imp,0),
        p_brix => (k.lab->>0)::numeric, p_pol => (k.lab->>1)::numeric, p_pureza => (k.lab->>2)::numeric, p_fibra => (k.lab->>3)::numeric,
        p_cota_condominio => 100, p_contrato_id => v_ct::text)
      into v_fat;
      update faturas set data_emissao = (d + k.ent + 2), created_at = (d + k.ent + 2) where numero_fatura = k.nf;
    end if;
  end loop;


  ---------------------------------------------------------------- 7. NFs DE SERVIÇO E DEVOLUÇÕES
  for k in select * from jsonb_to_recordset($j$[{"nf": "000201", "cli": "Fazenda Três Marias — Antônio C. Villela", "v": 18500.0, "aliq": 2, "ago": 75, "pago": true, "descr": "Plantio mecanizado"}, {"nf": "000202", "cli": "Cooperativa Canavieira do Médio Tietê", "v": 12300.0, "aliq": 2, "ago": 40, "pago": false, "venc": -12, "descr": "Transporte de cana (transbordo)"}, {"nf": "000203", "cli": "Agroindustrial Santa Clara Ltda", "v": 41800.0, "aliq": 3, "ago": 12, "pago": false, "venc": 18, "descr": "Colheita mecanizada terceirizada"}]$j$::jsonb) as t(nf text, cli text, v numeric, aliq numeric, ago int, pago boolean, venc int, descr text)
  loop
    v_fat := emitir_fatura_especial(p_tipo_operacao => 'Prestacao_Servico', p_numero_nf => k.nf,
              p_parceiro_id => (select id::text from clientes where nome = k.cli), p_valor_bruto => k.v, p_aliquota_issqn => k.aliq);
    update faturas set data_emissao = (d - k.ago), created_at = (d - k.ago),
           inf_adicionais_fiscal = k.descr || ' — ISSQN ' || k.aliq || '%' where id = v_fat;
    select id into v_cr from contas_receber where fatura_id = v_fat;
    v_venc := case when k.pago then d - k.ago + 30 else d + k.venc end;
    update contas_receber set created_at = (d - k.ago), vencimento = v_venc where id = v_cr;
    update faturas set data_vencimento = v_venc where id = v_fat;
    update lancamentos set data = (d - k.ago) where data = current_date and origem = 'venda';
    if k.pago then
      perform baixar_receber(v_cr);
      update contas_receber set recebido_em = v_venc where id = v_cr;
      update lancamentos set data = v_venc where data = current_date and origem = 'receber';
    end if;
  end loop;

  for k in select * from jsonb_to_recordset($j$[{"nf": "000301", "forn": "AgroQuímica Paulista", "v": 1880.0, "cat": "Herbicida", "ago": 55}, {"nf": "000302", "forn": "Fertilizantes Campo Forte", "v": 3120.0, "cat": "Fertilizante", "ago": 22}]$j$::jsonb) as t(nf text, forn text, v numeric, cat text, ago int)
  loop
    v_fat := emitir_fatura_especial(p_tipo_operacao => 'Devolucao_Insumo', p_numero_nf => k.nf,
              p_parceiro_id => (select id::text from fornecedores where nome_fantasia = k.forn), p_valor_bruto => k.v, p_categoria_insumo => k.cat);
    update faturas set data_emissao = (d - k.ago), data_vencimento = (d - k.ago), created_at = (d - k.ago),
           inf_adicionais_fiscal = 'Devolução parcial de insumo (' || k.cat || ') — produto fora de especificação' where id = v_fat;
    update lancamentos set data = (d - k.ago) where data = current_date and origem = 'devolucao';
  end loop;

  ---------------------------------------------------------------- 8. DESPESAS DA SAFRA (contas a pagar avulsas)
  for k in select * from jsonb_to_recordset($j$[{"descr": "Arrendamento Fazenda Santa Rita — safra 26/27", "v": 38400.0, "forn": "Mecânica & Peças Tietê", "cria": -70, "venc": -60, "pago": -60}, {"descr": "Manutenção colhedora CASE A8000 — Mecânica & Peças Tietê", "v": 7950.0, "forn": "Mecânica & Peças Tietê", "cria": -45, "venc": -35, "pago": -35}, {"descr": "Energia elétrica — oficina e escritório", "v": 2340.0, "forn": null, "cria": -8, "venc": 6, "pago": null}, {"descr": "Frete de cana — transbordo terceirizado", "v": 9800.0, "forn": null, "cria": -20, "venc": -3, "pago": null}, {"descr": "Seguro agrícola — apólice safra 26/27", "v": 12600.0, "forn": null, "cria": -5, "venc": 25, "pago": null}]$j$::jsonb) as t(descr text, v numeric, forn text, cria int, venc int, pago int)
  loop
    insert into contas_pagar (descricao, valor, vencimento, status, fornecedor_id, created_at)
    values (k.descr, k.v, d + k.venc, 'Aberto', (select id from fornecedores where nome_fantasia = k.forn), d + k.cria)
    returning id into v_cp;
    perform lancar_contabil('Despesas operacionais', 'Fornecedores', k.v, 'Provisão ' || k.descr, 'pagar');
    update lancamentos set data = (d + k.cria) where data = current_date and origem = 'pagar';
    if k.pago is not null then
      perform baixar_pagar(v_cp);
      update contas_pagar set pago_em = (d + k.pago) where id = v_cp;
      update lancamentos set data = (d + k.pago) where data = current_date and origem = 'pagar';
    end if;
  end loop;

  raise notice 'Dados de demonstração carregados com sucesso.';
end
$seed$;
