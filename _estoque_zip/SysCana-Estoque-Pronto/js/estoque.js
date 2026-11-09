(() => {
  const { sb, num, money, esc, flash, title, options, table, list, link, param, canWrite } = window.SysCanaCore;
  const view = document.getElementById("view");

  const CATEGORIAS = [
    ["Insumos", "Insumos Agrícolas"],
    ["Cana", "Cana-de-Açúcar"],
    ["Combustivel", "Combustível"],
    ["Pecas", "Peças / Manutenção"],
    ["Lubrificantes", "Lubrificantes"],
    ["Seguranca", "Segurança (EPI)"],
    ["Escritorio", "Escritório"],
    ["Embalagem", "Embalagem"],
    ["Outros", "Outros"]
  ];
  const catNome = (v) => (CATEGORIAS.find((c) => c[0] === v) || [v, v])[1];

  const UNIDADES = [
    ["kg", "kg — Quilograma (adubos, insumos sólidos)"],
    ["t", "t — Tonelada (cana colhida, calcário)"],
    ["L", "L — Litro (óleo diesel, defensivos, químicos)"],
    ["un", "un — Unidade (equipamentos, ferramentas)"],
    ["pc", "pc — Peça (manutenção industrial, oficina)"],
    ["sc", "sc — Saca 50kg (sementes, fertilizantes)"],
    ["cx", "cx — Caixa (materiais de almoxarifado)"],
    ["par", "par — Par (botas, luvas, EPIs)"],
    ["m", "m — Metro (tubulações, correias, mangueiras)"]
  ];

  function erroAmigavel(error) {
    const msg = error?.message || String(error);
    if (/vw_estoque_situacao|curva_abc|abrir_inventario|solicitar_reposicao|inventarios|schema cache|does not exist/i.test(msg)) {
      return "O banco de dados ainda não possui a migração do módulo Estoque. Execute o script 'migracao_estoque.sql' no SQL Editor do Supabase. (" + msg + ")";
    }
    return msg;
  }

  async function situacao() {
    const { data, error } = await sb.from("vw_estoque_situacao").select("*").order("nome");
    if (error) throw new Error(erroAmigavel(error));
    return data || [];
  }

  function chipSituacao(s) {
    if (s === "BAIXO") return '<span class="chip bad">Estoque Baixo</span>';
    if (s === "ACIMA_MAXIMO") return '<span class="chip wait">Acima do Máx.</span>';
    return '<span class="chip ok">Regular (OK)</span>';
  }

  // ---------- 1. Cadastro de Produto / Item de Estoque ----------
  async function estoqueCadastro() {
    const fors = await list("fornecedores", "nome_fantasia");
    view.innerHTML =
      title("Cadastro de Estoque") +
      `<div class="card">
        <p class="muted">O SKU (código identificador único) é gerado automaticamente pelo banco de dados conforme a categoria selecionada.</p>
        <form id="f">
          <div class="grid grid-2">
            <div class="field">
              <label>Nome do Item / Produto</label>
              <input name="nome" required placeholder="Ex.: Adubo NPK 20-05-20" />
            </div>
            <div class="field">
              <label>Unidade de Medida (Padrão SEFAZ)</label>
              <select name="unidade">
                ${UNIDADES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Fornecedor Padrão</label>
              <select name="fornecedor_id">
                <option value="">— Nenhum / Próprio —</option>
                ${options(fors, "id", "nome_fantasia")}
              </select>
            </div>
            <div class="field">
              <label>Estoque Inicial</label>
              <input type="number" step="0.001" min="0" name="quantidade_estoque" value="0" required />
            </div>
            <div class="field">
              <label>Estoque Mínimo (Ponto de Pedido / Segurança)</label>
              <input type="number" step="0.001" min="0" name="qtd_minima" value="0" />
            </div>
            <div class="field">
              <label>Estoque Máximo</label>
              <input type="number" step="0.001" min="0" name="qtd_maxima" value="0" />
            </div>
            <div class="field">
              <label>Categoria Sucroalcooleira</label>
              <select name="categoria">
                ${CATEGORIAS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}
              </select>
            </div>
          </div>
          <button class="btn" type="submit" style="margin-top:1rem">Cadastrar Item</button>
        </form>
        <div id="m" style="margin-top:1rem"></div>
      </div>`;

    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const min = Number(fd.qtd_minima || 0);
      const max = Number(fd.qtd_maxima || 0);
      const out = document.getElementById("m");

      if (max > 0 && min > max) {
        out.innerHTML = flash("err", "O estoque mínimo não pode ser maior que o estoque máximo.");
        return;
      }

      const { data, error } = await sb
        .from("produtos")
        .insert({
          nome: fd.nome.trim(),
          unidade: fd.unidade.trim() || "un",
          fornecedor_id: fd.fornecedor_id || null,
          quantidade_estoque: Number(fd.quantidade_estoque),
          qtd_minima: min,
          qtd_maxima: max,
          categoria: fd.categoria
        })
        .select("sku")
        .single();

      out.innerHTML = error
        ? flash("err", error.message)
        : flash("ok", "Produto cadastrado com sucesso! SKU gerado: <b>" + esc(data?.sku || "") + "</b>. Já disponível para movimentação e compras.");

      if (!error) e.target.reset();
    };
  }

  // ---------- 2. Saldos de Estoque e Posição Geral ----------
  async function estoqueQtd() {
    let rows;
    try {
      rows = await situacao();
    } catch (err) {
      view.innerHTML = title("Saldos de Estoque") + `<div class="card">${flash("err", err.message)}</div>`;
      return;
    }

    const totalValor = rows.reduce((s, r) => s + Number(r.valor_estoque || 0), 0);
    const totalItens = rows.length;
    const totalCriticos = rows.filter((r) => r.situacao === "BAIXO").length;

    view.innerHTML =
      title("Saldos de Estoque", `<span class="muted">Valor imobilizado: <b>${money(totalValor)}</b></span>`) +
      `<div class="grid grid-3" style="margin-bottom:1rem">
        <div class="card" style="padding:1rem;text-align:center">
          <small class="muted">Itens Cadastrados</small>
          <h3 style="margin:0.25rem 0 0 0">${num(totalItens)}</h3>
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <small class="muted">Itens em Nível Crítico</small>
          <h3 style="margin:0.25rem 0 0 0;color:${totalCriticos > 0 ? "var(--accent-red,#d9383a)" : "inherit"}">${num(totalCriticos)}</h3>
        </div>
        <div class="card" style="padding:1rem;text-align:center">
          <small class="muted">Valor Total em Estoque</small>
          <h3 style="margin:0.25rem 0 0 0;color:var(--cane-green,#2b6e4f)">${money(totalValor)}</h3>
        </div>
      </div>
      <div class="card">
        <div class="grid grid-2">
          <div class="field">
            <label>Filtrar por Nome ou SKU</label>
            <input id="q" placeholder="Ex.: INS-001 ou Adubo" />
          </div>
          <div class="field">
            <label>Situação do Estoque</label>
            <select id="s">
              <option value="">Todas as situações</option>
              <option value="BAIXO">Abaixo do Mínimo</option>
              <option value="ACIMA_MAXIMO">Acima do Máximo</option>
              <option value="OK">Regular (OK)</option>
            </select>
          </div>
        </div>
      </div>
      <div id="lista" style="margin-top:1rem"></div>`;

    const draw = () => {
      const q = document.getElementById("q").value.trim().toLowerCase();
      const s = document.getElementById("s").value;
      const filtrados = rows.filter((r) => {
        const matchSit = !s || r.situacao === s;
        const matchTxt = !q || (String(r.sku || "") + " " + String(r.nome || "")).toLowerCase().includes(q);
        return matchSit && matchTxt;
      });

      document.getElementById("lista").innerHTML = table(
        ["SKU", "Produto", "Categoria", "Saldo Atual", "Un.", "Mín.", "Máx.", "Custo Médio", "Valor Total", "Situação"],
        filtrados.map((p) => {
          return `<tr>
            <td><strong>${esc(p.sku || "—")}</strong></td>
            <td>${esc(p.nome)}</td>
            <td>${esc(catNome(p.categoria))}</td>
            <td><b>${num(p.saldo)}</b></td>
            <td>${esc(p.unidade)}</td>
            <td>${num(p.qtd_minima)}</td>
            <td>${Number(p.qtd_maxima) > 0 ? num(p.qtd_maxima) : "—"}</td>
            <td>${Number(p.custo_medio) > 0 ? money(p.custo_medio) : "—"}</td>
            <td>${Number(p.valor_estoque) > 0 ? money(p.valor_estoque) : "—"}</td>
            <td>${chipSituacao(p.situacao)}</td>
          </tr>`;
        })
      );
    };

    document.getElementById("q").oninput = draw;
    document.getElementById("s").onchange = draw;
    draw();
  }

  // ---------- 3. Entrada e Saída Avulsa (Ajuste Manual Rastreável) ----------
  async function estoqueMov(tipo) {
    const produtos = await list("produtos", "nome");
    const label = tipo === "entrada" ? "Entrada Avulsa" : "Saída Avulsa";
    view.innerHTML =
      title(label) +
      `<div class="card">
        <p class="muted">Utilize este formulário apenas para <b>ajustes manuais</b> (correção de contagem, perdas no campo, quebras, etc.). Movimentações de compras, vendas e produção do PCP são registradas automaticamente pelos respectivos módulos. O motivo é obrigatório e será auditado com o seu login.</p>
        <form id="f">
          <div class="grid grid-2">
            <div class="field">
              <label>Produto / Item</label>
              <select name="produto_id" id="prod" required>
                <option value="">Selecione um item...</option>
                ${produtos.map((p) => `<option value="${p.id}" data-qtd="${p.quantidade_estoque}" data-un="${esc(p.unidade)}">${esc(p.sku || "")} — ${esc(p.nome)} (Saldo: ${num(p.quantidade_estoque)} ${esc(p.unidade)})</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Saldo Disponível Atual</label>
              <input id="disp" readonly placeholder="Selecione um produto..." />
            </div>
            <div class="field">
              <label>Quantidade da Movimentação</label>
              <input type="number" step="0.001" min="0.001" name="quantidade" required placeholder="0.000" />
            </div>
            ${tipo === "entrada" ? `
            <div class="field">
              <label>Custo Unitário R$ (Opcional — recalcula o custo médio)</label>
              <input type="number" step="0.0001" min="0" name="custo" placeholder="0.00" />
            </div>` : ""}
            <div class="field" style="grid-column: 1 / -1">
              <label>Motivo / Observação da Operação (Mínimo 3 caracteres - Obrigatório)</label>
              <input name="observacao" required minlength="3" placeholder="Ex.: Quebra de lote durante transporte, ajuste de avaria, bonificação..." />
            </div>
          </div>
          <button class="btn" type="submit" style="margin-top:1rem">Confirmar ${label}</button>
        </form>
        <div id="m" style="margin-top:1rem"></div>
      </div>`;

    document.getElementById("prod").onchange = (e) => {
      const opt = e.target.selectedOptions[0];
      const disp = document.getElementById("disp");
      if (opt && opt.dataset.qtd !== undefined) {
        disp.value = `${num(opt.dataset.qtd)} ${opt.dataset.un || ""}`;
      } else {
        disp.value = "";
      }
    };

    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const out = document.getElementById("m");
      const qtd = Number(fd.quantidade);
      const prodOpt = document.getElementById("prod").selectedOptions[0];
      const dispVal = Number(prodOpt?.dataset?.qtd || 0);

      if (tipo === "saida" && qtd > dispVal) {
        out.innerHTML = flash("err", `Quantidade solicitada (${num(qtd)}) é maior que o saldo disponível em estoque (${num(dispVal)}).`);
        return;
      }

      const args = {
        p_produto_id: fd.produto_id,
        p_tipo: tipo,
        p_quantidade: qtd,
        p_origem: "manual",
        p_observacao: fd.observacao.trim()
      };
      if (tipo === "entrada" && fd.custo !== undefined && fd.custo !== "") {
        args.p_custo_unitario = Number(fd.custo);
      }

      const { data, error } = await sb.rpc("movimentar_estoque", args);
      if (error) {
        out.innerHTML = flash("err", error.message);
      } else {
        out.innerHTML = flash("ok", `Movimentação confirmada! Novo saldo: <b>${num(data.estoque_posterior)}</b>.`);
        setTimeout(() => estoqueMov(tipo), 1200);
      }
    };
  }

  // ---------- 4. Histórico Completo (Kardex Auditável) ----------
  const ORIGENS = [
    ["compra", "Entrada por Compra"],
    ["venda", "Saída por Venda"],
    ["producao", "Produção / PCP"],
    ["manual", "Ajuste Manual"],
    ["saldo_inicial", "Saldo Inicial"],
    ["ajuste_inventario", "Inventário Físico"]
  ];
  const origemNome = (v) => (ORIGENS.find((o) => o[0] === v) || [v, v])[1];

  async function estoqueMovimentos() {
    const produtos = await list("produtos", "nome");
    view.innerHTML =
      title("Histórico de Movimentações (Kardex)", `<button class="btn" id="csv" type="button">Exportar CSV</button>`) +
      `<div class="card">
        <div class="grid grid-2">
          <div class="field">
            <label>Filtrar por Produto</label>
            <select id="fp">
              <option value="">Todos os produtos</option>
              ${produtos.map((p) => `<option value="${p.id}">${esc(p.sku || "")} — ${esc(p.nome)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Tipo</label>
            <select id="ft">
              <option value="">Todos os tipos</option>
              <option value="entrada">Apenas Entradas</option>
              <option value="saida">Apenas Saídas</option>
            </select>
          </div>
          <div class="field">
            <label>Origem da Transação</label>
            <select id="fo">
              <option value="">Todas as origens</option>
              ${ORIGENS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Período (Data Inicial / Final)</label>
            <div style="display:flex;gap:0.5rem">
              <input type="date" id="fd1" style="flex:1" />
              <input type="date" id="fd2" style="flex:1" />
            </div>
          </div>
        </div>
      </div>
      <div id="lista" style="margin-top:1rem"></div>`;

    let dadosCarregados = [];

    async function carregar() {
      let q = sb
        .from("movimentacoes_estoque")
        .select("*, produtos(nome, sku, unidade)")
        .order("created_at", { ascending: false })
        .limit(300);

      const fp = document.getElementById("fp").value;
      const ft = document.getElementById("ft").value;
      const fo = document.getElementById("fo").value;
      const fd1 = document.getElementById("fd1").value;
      const fd2 = document.getElementById("fd2").value;

      if (fp) q = q.eq("produto_id", fp);
      if (ft) q = q.eq("tipo", ft);
      if (fo) q = q.eq("origem", fo);
      if (fd1) q = q.gte("created_at", fd1 + "T00:00:00");
      if (fd2) q = q.lte("created_at", fd2 + "T23:59:59");

      const { data, error } = await q;
      if (error) {
        document.getElementById("lista").innerHTML = `<div class="card">${flash("err", error.message)}</div>`;
        return;
      }
      dadosCarregados = data || [];

      document.getElementById("lista").innerHTML = table(
        ["Data / Hora", "SKU", "Produto", "Tipo", "Qtd", "Evolução do Saldo", "Origem", "Usuário", "Motivo / NF"],
        dadosCarregados.map((m) => {
          const isEntrada = m.tipo === "entrada";
          return `<tr>
            <td><small>${new Date(m.created_at).toLocaleString("pt-BR")}</small></td>
            <td><strong>${esc(m.produtos?.sku || "—")}</strong></td>
            <td>${esc(m.produtos?.nome)}</td>
            <td><span class="chip ${isEntrada ? "ok" : "wait"}">${isEntrada ? "+ Entrada" : "- Saída"}</span></td>
            <td><b>${num(m.quantidade)}</b> ${esc(m.produtos?.unidade || "")}</td>
            <td>${num(m.estoque_anterior)} &rarr; <b>${num(m.estoque_posterior)}</b></td>
            <td>${esc(origemNome(m.origem))}</td>
            <td><small>${esc(m.usuario || "sistema")}</small></td>
            <td><small class="muted">${esc(m.observacao || "—")}</small></td>
          </tr>`;
        })
      );
    }

    ["fp", "ft", "fo", "fd1", "fd2"].forEach((id) => (document.getElementById(id).onchange = carregar));

    document.getElementById("csv").onclick = () => {
      if (!dadosCarregados.length) {
        alert("Nenhum dado carregado para exportar.");
        return;
      }
      const cel = (s) => '"' + String(s ?? "").replaceAll('"', '""') + '"';
      const colunas = ["Data", "SKU", "Produto", "Tipo", "Quantidade", "Saldo Anterior", "Saldo Novo", "Origem", "Usuario", "Observacao"];
      const linhas = [colunas]
        .concat(
          dadosCarregados.map((m) => [
            new Date(m.created_at).toLocaleString("pt-BR"),
            m.produtos?.sku || "",
            m.produtos?.nome || "",
            m.tipo,
            m.quantidade,
            m.estoque_anterior,
            m.estoque_posterior,
            m.origem,
            m.usuario || "",
            m.observacao || ""
          ])
        )
        .map((l) => l.map(cel).join(";"))
        .join("\n");

      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["\ufeff" + linhas], { type: "text/csv;charset=utf-8" }));
      a.download = `kardex_estoque_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };

    await carregar();
  }

  // ---------- 5. Estoque Baixo e Reposição Automática ----------
  async function estoqueBaixo() {
    let rows;
    try {
      rows = (await situacao()).filter((p) => p.situacao === "BAIXO");
    } catch (err) {
      view.innerHTML = title("Estoque Baixo") + `<div class="card">${flash("err", err.message)}</div>`;
      return;
    }

    const podeAgir = canWrite("/estoque/baixo");
    view.innerHTML =
      title("Alerta de Estoque Baixo", `<a class="btn" href="${link("/compras/pedidos")}">Consultar Compras a Receber</a>`) +
      `<div id="m"></div>
      <div class="card" style="margin-bottom:1rem">
        <p class="muted">Lista de itens com saldo igual ou inferior ao estoque mínimo (estoque de segurança). A sugestão de compra calcula a quantidade necessária para atingir a meta ideal de estoque.</p>
      </div>` +
      table(
        ["SKU", "Produto", "Categoria", "Saldo Atual", "Estoque Mínimo", "Sugestão de Reposição", "Ação Integrada"],
        rows.length === 0
          ? `<tr><td colspan="7" style="text-align:center;padding:2rem" class="muted">Nenhum produto em nível crítico no momento. Todos os estoques estão adequados.</td></tr>`
          : rows.map((p) => {
              return `<tr>
                <td><strong>${esc(p.sku || "—")}</strong></td>
                <td>${esc(p.nome)}</td>
                <td>${esc(catNome(p.categoria))}</td>
                <td style="color:var(--accent-red,#d9383a)"><b>${num(p.saldo)}</b> ${esc(p.unidade)}</td>
                <td>${num(p.qtd_minima)} ${esc(p.unidade)}</td>
                <td><b>${num(p.sugestao_compra)}</b> ${esc(p.unidade)}</td>
                <td>${
                  podeAgir
                    ? `<button class="btn small" data-rep="${p.id}">Solicitar Reposição</button>`
                    : '<span class="muted">Apenas consulta</span>'
                }</td>
              </tr>`;
            }).join("")
      );

    view.querySelectorAll("[data-rep]").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        b.innerText = "Enviando...";
        const { error } = await sb.rpc("solicitar_reposicao", { p_produto_id: b.dataset.rep });
        const out = document.getElementById("m");
        if (error) {
          out.innerHTML = flash("err", error.message);
          b.disabled = false;
          b.innerText = "Solicitar Reposição";
        } else {
          out.innerHTML = flash("ok", "Solicitação de compra gerada com sucesso e enviada ao módulo de Compras!");
          setTimeout(estoqueBaixo, 1500);
        }
      };
    });
  }

  // ---------- 6. Curva ABC (Análise de Consumo e Valor) ----------
  async function estoqueAbc() {
    const dias = Number(param("dias") || 90);
    let rows = [];
    try {
      const { data, error } = await sb.rpc("curva_abc", { p_dias: dias });
      if (error) throw new Error(erroAmigavel(error));
      rows = data || [];
    } catch (err) {
      view.innerHTML = title("Curva ABC") + `<div class="card">${flash("err", err.message)}</div>`;
      return;
    }

    const totalValor = rows.reduce((s, r) => s + Number(r.valor_saida || 0), 0);
    const classesBadge = { A: "bad", B: "wait", C: "ok" };

    view.innerHTML =
      title(
        "Curva ABC (Gestão e Priorização de Estoque)",
        `<select id="dias" style="padding:0.35rem 0.6rem">
          ${[30, 90, 180, 365].map((d) => `<option value="${d}" ${d === dias ? "selected" : ""}>Consumo nos últimos ${d} dias</option>`).join("")}
        </select>`
      ) +
      `<div class="card" style="margin-bottom:1rem">
        <p class="muted">Classificação baseada no valor total consumido (saídas &times; custo unitário). Ajuda a focar os esforços de compra e contagem nos itens de maior relevância financeira:</p>
        <div style="display:flex;gap:1.5rem;font-size:0.9rem;margin-top:0.5rem">
          <span><span class="chip bad">Classe A</span> Até 80% do valor acumulado (Alta prioridade / Controle rígido)</span>
          <span><span class="chip wait">Classe B</span> Próximos 15% do valor (Média prioridade)</span>
          <span><span class="chip ok">Classe C</span> Restante 5% do valor (Baixa prioridade / Controle simplificado)</span>
        </div>
      </div>` +
      (totalValor === 0
        ? `<div class="card">${flash("err", "Ainda não há saídas com custo médio calculado no período selecionado. À medida que as compras e ajustes com custo forem registrados, os itens serão ranqueados automaticamente.")}</div>`
        : "") +
      table(
        ["Classe", "SKU", "Produto", "Categoria", "Qtd Saída", "Valor Consumido", "% do Total", "% Acumulado"],
        rows.map((r) => {
          return `<tr>
            <td><span class="chip ${classesBadge[r.classe] || ""}">${esc(r.classe)}</span></td>
            <td><strong>${esc(r.sku || "—")}</strong></td>
            <td>${esc(r.nome)}</td>
            <td>${esc(catNome(r.categoria))}</td>
            <td>${num(r.qtd_saida)} ${esc(r.unidade)}</td>
            <td><b>${money(r.valor_saida)}</b></td>
            <td>${num(r.pct)}%</td>
            <td>${num(r.pct_acumulado)}%</td>
          </tr>`;
        }).join("")
      );

    document.getElementById("dias").onchange = (e) => {
      location.hash = "#/estoque/abc?dias=" + e.target.value;
    };
  }

  // ---------- 7. Inventário Físico (Balanço Periódico) ----------
  async function estoqueInventario() {
    const id = param("id");
    if (id) return inventarioDetalhe(id);

    let data;
    try {
      const res = await sb.from("inventarios").select("*").order("criado_em", { ascending: false }).limit(20);
      if (res.error) throw new Error(erroAmigavel(res.error));
      data = res.data || [];
    } catch (err) {
      view.innerHTML = title("Inventário Físico") + `<div class="card">${flash("err", err.message)}</div>`;
      return;
    }

    const podeAgir = canWrite("/estoque/inventario");
    view.innerHTML =
      title("Inventário Físico de Estoque") +
      (podeAgir
        ? `<div class="card" style="margin-bottom:1rem">
          <form id="f">
            <div class="field">
              <label>Identificação / Descrição da Contagem</label>
              <input name="descricao" placeholder="Ex.: Inventário Mensal - Almoxarifado Central" />
            </div>
            <button class="btn" type="submit" style="margin-top:0.75rem">Abrir Novo Inventário</button>
          </form>
          <div id="m" style="margin-top:0.5rem"></div>
        </div>`
        : "") +
      `<div class="card" style="margin-bottom:1rem">
        <p class="muted">O processo de inventário compara a contagem física real dos itens com o saldo registrado no sistema. Ao fechar o inventário, as divergências geram movimentações automáticas e auditáveis no Kardex.</p>
      </div>` +
      table(
        ["Descrição", "Data de Abertura", "Responsável", "Status", "Ações"],
        data.length === 0
          ? `<tr><td colspan="5" style="text-align:center;padding:2rem" class="muted">Nenhum inventário registrado até o momento.</td></tr>`
          : data.map((i) => {
              const statusChip = i.status === "Fechado" ? "ok" : i.status === "Cancelado" ? "bad" : "wait";
              return `<tr>
                <td><strong>${esc(i.descricao)}</strong></td>
                <td>${new Date(i.criado_em).toLocaleString("pt-BR")}</td>
                <td>${esc(i.criado_por || "—")}</td>
                <td><span class="chip ${statusChip}">${esc(i.status)}</span></td>
                <td><a class="btn small" href="${link("/estoque/inventario")}?id=${i.id}">Abrir Contagem</a></td>
              </tr>`;
            }).join("")
      );

    const f = document.getElementById("f");
    if (f) {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        const { data: novoId, error: err } = await sb.rpc("abrir_inventario", { p_descricao: fd.descricao || null });
        if (err) {
          document.getElementById("m").innerHTML = flash("err", err.message);
        } else {
          location.hash = "#/estoque/inventario?id=" + novoId;
        }
      };
    }
  }

  async function inventarioDetalhe(id) {
    let inv, itens;
    try {
      const [resInv, resItens] = await Promise.all([
        sb.from("inventarios").select("*").eq("id", id).single(),
        sb.from("inventario_itens").select("*, produtos(sku, nome, unidade)").eq("inventario_id", id)
      ]);
      if (resInv.error || resItens.error) throw new Error(erroAmigavel(resInv.error || resItens.error));
      inv = resInv.data;
      itens = resItens.data || [];
    } catch (err) {
      view.innerHTML = title("Detalhes do Inventário") + `<div class="card">${flash("err", err.message)}</div>`;
      return;
    }

    const aberto = inv.status === "Aberto";
    const podeAgir = canWrite("/estoque/inventario") && aberto;
    const ordenados = itens.slice().sort((a, b) => String(a.produtos?.sku || "").localeCompare(String(b.produtos?.sku || "")));

    view.innerHTML =
      title(`Inventário: ${esc(inv.descricao)}`, `<a class="btn" href="${link("/estoque/inventario")}">Voltar para Lista</a>`) +
      `<div id="m"></div>
      <div class="card" style="margin-bottom:1rem">
        <p class="muted">Status atual: <b>${esc(inv.status)}</b>. Digite a quantidade contada fisicamente no campo abaixo. Os valores são salvos automaticamente ao sair do campo. Ao fechar, o sistema gerará os devidos ajustes de saldo.</p>
      </div>` +
      table(
        ["SKU", "Produto", "Saldo no Sistema", "Contagem Física", "Divergência Apurada"],
        ordenados.map((i) => {
          const dif = i.divergencia ?? (i.contagem === null || i.contagem === undefined ? null : Number(i.contagem) - Number(i.saldo_sistema));
          const campo = podeAgir
            ? `<input type="number" step="0.001" min="0" value="${i.contagem ?? ""}" data-p="${i.produto_id}" style="max-width:140px" placeholder="Digitar contagem" />`
            : i.contagem === null || i.contagem === undefined ? "—" : num(i.contagem);

          let difHtml = "—";
          if (dif !== null) {
            if (dif > 0) difHtml = `<span style="color:var(--cane-green,#2b6e4f);font-weight:bold">+${num(dif)}</span>`;
            else if (dif < 0) difHtml = `<span style="color:var(--accent-red,#d9383a);font-weight:bold">${num(dif)}</span>`;
            else difHtml = `<span class="muted">0 (Exato)</span>`;
          }

          return `<tr>
            <td><strong>${esc(i.produtos?.sku || "—")}</strong></td>
            <td>${esc(i.produtos?.nome)}</td>
            <td>${num(i.saldo_sistema)} ${esc(i.produtos?.unidade || "")}</td>
            <td>${campo}</td>
            <td>${difHtml}</td>
          </tr>`;
        }).join("")
      ) +
      (podeAgir
        ? `<div class="card" style="margin-top:1rem;display:flex;gap:1rem">
          <button class="btn" id="fechar" type="button">Fechar Inventário (Processar Ajustes)</button>
          <button class="btn danger" id="cancelar" type="button">Cancelar Inventário</button>
        </div>`
        : "");

    const msg = document.getElementById("m");

    view.querySelectorAll("input[data-p]").forEach((inp) => {
      inp.onchange = async () => {
        if (inp.value === "") return;
        const { error } = await sb.rpc("registrar_contagem", {
          p_inventario_id: id,
          p_produto_id: inp.dataset.p,
          p_contagem: Number(inp.value)
        });
        msg.innerHTML = error ? flash("err", error.message) : flash("ok", "Contagem registrada!");
        setTimeout(() => { msg.innerHTML = ""; }, 2000);
      };
    });

    const fechar = document.getElementById("fechar");
    if (fechar) {
      fechar.onclick = async () => {
        if (!confirm("Tem certeza que deseja fechar este inventário? Cada divergência detectada gerará automaticamente um ajuste no histórico de estoque.")) {
          return;
        }
        fechar.disabled = true;
        fechar.innerText = "Processando ajustes...";
        const { data: r, error } = await sb.rpc("fechar_inventario", { p_inventario_id: id });
        if (error) {
          msg.innerHTML = flash("err", error.message);
          fechar.disabled = false;
          fechar.innerText = "Fechar Inventário (Processar Ajustes)";
        } else {
          await inventarioDetalhe(id);
          document.getElementById("m").innerHTML = flash("ok", `Inventário finalizado com sucesso! ${r.itens_contados} itens contados e ${r.ajustes} ajuste(s) lançados no Kardex.`);
        }
      };
    }

    const cancelar = document.getElementById("cancelar");
    if (cancelar) {
      cancelar.onclick = async () => {
        if (!confirm("Deseja realmente cancelar este inventário? Nenhuma alteração de estoque será realizada.")) {
          return;
        }
        const { error } = await sb.rpc("cancelar_inventario", { p_inventario_id: id });
        if (error) {
          msg.innerHTML = flash("err", error.message);
        } else {
          location.hash = "#/estoque/inventario";
        }
      };
    }
  }

  // ---------- Configuração de Rotas do Módulo Estoque ----------
  window.SysCanaCore.startRouter(
    {
      "/estoque": estoqueQtd,
      "/estoque/cadastro": estoqueCadastro,
      "/estoque/entrada": () => estoqueMov("entrada"),
      "/estoque/saida": () => estoqueMov("saida"),
      "/estoque/movimentos": estoqueMovimentos,
      "/estoque/baixo": estoqueBaixo,
      "/estoque/abc": estoqueAbc,
      "/estoque/inventario": estoqueInventario
    },
    "/estoque"
  );
})();
