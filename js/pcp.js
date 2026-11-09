(() => {
  const { sb, money, num, esc, flash, title, options, table, chip, canWrite, list, bindRpc, actionButtons, openFormModal, bindCrud } = window.SysCanaCore;
  const view = document.getElementById("view");

  async function pcpRequisicao() {
    const [prods, ops] = await Promise.all([list("produtos", "nome"), list("producoes", "nome")]);
    view.innerHTML =
      title("PCP — pedir insumo para Compras") +
      `<div class="card"><p class="muted">A peça/insumo entra no pipeline de Compras. Não compra direto.</p>
      <form id="f">
        <div class="field"><label>Produto de estoque</label><select name="produto_id" required>${options(prods, "id", "nome")}</select></div>
        <div class="field"><label>Quantidade</label><input type="number" step="0.001" min="0.001" name="quantidade" required /></div>
        <div class="field"><label>Ordem de produção (opcional)</label><select name="producao_id"><option value="">—</option>${options(ops, "id", "nome")}</select></div>
        <div class="field"><label>Motivo</label><input name="descricao" required placeholder="Ex.: Adubo para talhão 12" /></div>
        <button class="btn" type="submit">Enviar a Compras</button>
      </form><div id="m"></div></div>`;
    bindRpc("f", "m", "solicitar_compra", (fd) => ({
      p_produto_id: fd.produto_id,
      p_quantidade: Number(fd.quantidade),
      p_descricao: "[PCP] " + fd.descricao,
      p_origem: "PCP",
      p_producao_id: fd.producao_id || null
    }), () => (location.href = window.SysCanaCore.link("/compras/solicitacoes")));
  }

  async function pcpCana() {
    const [vars, rows] = await Promise.all([list("variedades", "nome"), list("canas", "nome")]);
    const varNome = (id) => vars.find((v) => v.id === id)?.nome || "—";
    view.innerHTML =
      title("Cadastrar cana") +
      `<div class="card"><p class="muted">Cria também o produto no Estoque (categoria Cana) para venda e colheita.</p>
      <form id="f">
        <div class="field"><label>Nome</label><input name="nome" required placeholder="Cana CTC4 — lote safra" /></div>
        <div class="field"><label>Produção estimada (t)</label><input type="number" step="0.001" min="0" name="producao_estimada" value="0" /></div>
        <div class="field"><label>Variedade</label><select name="variedade_id" required>${options(vars, "id", "nome")}</select></div>
        <button class="btn" type="submit">Salvar</button>
      </form><div id="m"></div></div>` +
      table(
        ["Nome", "Estimativa (t)", "Variedade", "Ações"],
        rows
          .map(
            (c) =>
              `<tr><td>${esc(c.nome)}</td><td>${num(c.producao_estimada)}</td><td>${esc(varNome(c.variedade_id))}</td>${actionButtons(c.id)}</tr>`
          )
          .join("")
      );
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { data: prod, error: e1 } = await sb.from("produtos").insert({ nome: fd.nome, unidade: "t", categoria: "Cana", quantidade_estoque: 0 }).select("id").single();
      if (e1) {
        document.getElementById("m").innerHTML = flash("err", e1.message);
        return;
      }
      const { error } = await sb.from("canas").insert({
        nome: fd.nome,
        producao_estimada: Number(fd.producao_estimada),
        variedade_id: fd.variedade_id,
        produto_id: prod.id
      });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Cana ligada ao estoque.");
      if (!error) pcpCana();
    };
    bindCrud(view, rows, {
      confirmMsg: "Excluir esta cana? O produto de estoque ligado permanece.",
      onEdit: (c) => {
        openFormModal(
          "Editar cana",
          `<div class="field"><label>Nome</label><input name="nome" required value="${esc(c.nome || "")}" /></div>
           <div class="field"><label>Produção estimada (t)</label><input type="number" step="0.001" min="0" name="producao_estimada" value="${esc(c.producao_estimada ?? 0)}" /></div>
           <div class="field"><label>Variedade</label><select name="variedade_id" required>${options(vars, "id", "nome", c.variedade_id)}</select></div>`,
          async (fd, msgEl) => {
            const { error } = await sb
              .from("canas")
              .update({ nome: fd.nome, producao_estimada: Number(fd.producao_estimada), variedade_id: fd.variedade_id })
              .eq("id", c.id);
            if (!error && c.produto_id) await sb.from("produtos").update({ nome: fd.nome }).eq("id", c.produto_id);
            if (error) {
              msgEl.innerHTML = flash("err", error.message);
              return false;
            }
            pcpCana();
            return true;
          }
        );
      },
      onDelete: async (id) => {
        const { error } = await sb.from("canas").delete().eq("id", id);
        if (error) alert(error.message);
        else pcpCana();
      }
    });
  }

  async function pcpInsumos() {
    const rows = await list("insumos_pcp", "nome");
    view.innerHTML =
      title("Insumos de PCP") +
      `<div class="card"><p class="muted">Também cadastra no Estoque, para compra e baixa na produção.</p>
      <form id="f" class="grid grid-2">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>Unidade</label><input name="unidade" value="kg" /></div>
        <div><button class="btn" type="submit">Adicionar</button></div>
      </form><div id="m"></div></div>` +
      table(
        ["Nome", "Un.", "Ações"],
        rows.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.unidade)}</td>${actionButtons(i.id)}</tr>`).join("")
      );
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { data: prod, error: e1 } = await sb
        .from("produtos")
        .insert({ nome: fd.nome, unidade: fd.unidade, categoria: "Insumos", quantidade_estoque: 0 })
        .select("id")
        .single();
      if (e1) {
        document.getElementById("m").innerHTML = flash("err", e1.message);
        return;
      }
      const { error } = await sb.from("insumos_pcp").insert({ nome: fd.nome, unidade: fd.unidade, produto_id: prod.id, quantidade: 0 });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Insumo + estoque.");
      if (!error) pcpInsumos();
    };
    bindCrud(view, rows, {
      confirmMsg: "Excluir este insumo? O produto de estoque ligado permanece.",
      onEdit: (i) => {
        openFormModal(
          "Editar insumo",
          `<div class="field"><label>Nome</label><input name="nome" required value="${esc(i.nome || "")}" /></div>
           <div class="field"><label>Unidade</label><input name="unidade" value="${esc(i.unidade || "kg")}" /></div>`,
          async (fd, msgEl) => {
            const { error } = await sb.from("insumos_pcp").update({ nome: fd.nome, unidade: fd.unidade }).eq("id", i.id);
            if (!error && i.produto_id) await sb.from("produtos").update({ nome: fd.nome, unidade: fd.unidade }).eq("id", i.produto_id);
            if (error) {
              msgEl.innerHTML = flash("err", error.message);
              return false;
            }
            pcpInsumos();
            return true;
          }
        );
      },
      onDelete: async (id) => {
        const { error } = await sb.from("insumos_pcp").delete().eq("id", id);
        if (error) alert(error.message);
        else pcpInsumos();
      }
    });
  }

  async function pcpTalhoes() {
    const rows = await list("talhoes", "nome");
    view.innerHTML =
      title("Talhões") +
      `<div class="card"><form id="f" class="grid grid-2">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>Área (ha)</label><input type="number" step="0.01" name="area_ha" /></div>
        <div class="field"><label>Local</label><input name="localizacao" /></div>
        <div><button class="btn" type="submit">Salvar</button></div>
      </form><div id="m"></div></div>` +
      table(
        ["Nome", "ha", "Local", "Ações"],
        rows.map((t) => `<tr><td>${esc(t.nome)}</td><td>${num(t.area_ha)}</td><td>${esc(t.localizacao)}</td>${actionButtons(t.id)}</tr>`).join("")
      );
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.from("talhoes").insert({ nome: fd.nome, area_ha: fd.area_ha ? Number(fd.area_ha) : null, localizacao: fd.localizacao });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Salvo.");
      if (!error) pcpTalhoes();
    };
    bindCrud(view, rows, {
      confirmMsg: "Excluir este talhão?",
      onEdit: (t) => {
        openFormModal(
          "Editar talhão",
          `<div class="field"><label>Nome</label><input name="nome" required value="${esc(t.nome || "")}" /></div>
           <div class="field"><label>Área (ha)</label><input type="number" step="0.01" name="area_ha" value="${esc(t.area_ha ?? "")}" /></div>
           <div class="field"><label>Local</label><input name="localizacao" value="${esc(t.localizacao || "")}" /></div>`,
          async (fd, msgEl) => {
            const { error } = await sb
              .from("talhoes")
              .update({ nome: fd.nome, area_ha: fd.area_ha ? Number(fd.area_ha) : null, localizacao: fd.localizacao })
              .eq("id", t.id);
            if (error) {
              msgEl.innerHTML = flash("err", error.message);
              return false;
            }
            pcpTalhoes();
            return true;
          }
        );
      },
      onDelete: async (id) => {
        const { error } = await sb.from("talhoes").delete().eq("id", id);
        if (error) alert(error.message);
        else pcpTalhoes();
      }
    });
  }

  async function pcpVariedades() {
    const rows = await list("variedades", "nome");
    view.innerHTML =
      title("Variedades") +
      `<div class="card"><form id="f">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>Descrição</label><input name="descricao" /></div>
        <button class="btn" type="submit">Salvar</button>
      </form><div id="m"></div></div>` +
      table(
        ["Nome", "Descrição", "Ações"],
        rows.map((v) => `<tr><td>${esc(v.nome)}</td><td>${esc(v.descricao)}</td>${actionButtons(v.id)}</tr>`).join("")
      );
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.from("variedades").insert(Object.fromEntries(new FormData(e.target)));
      if (!error) pcpVariedades();
      else document.getElementById("m").innerHTML = flash("err", error.message);
    };
    bindCrud(view, rows, {
      confirmMsg: "Excluir esta variedade?",
      onEdit: (v) => {
        openFormModal(
          "Editar variedade",
          `<div class="field"><label>Nome</label><input name="nome" required value="${esc(v.nome || "")}" /></div>
           <div class="field"><label>Descrição</label><input name="descricao" value="${esc(v.descricao || "")}" /></div>`,
          async (fd, msgEl) => {
            const { error } = await sb.from("variedades").update(fd).eq("id", v.id);
            if (error) {
              msgEl.innerHTML = flash("err", error.message);
              return false;
            }
            pcpVariedades();
            return true;
          }
        );
      },
      onDelete: async (id) => {
        const { error } = await sb.from("variedades").delete().eq("id", id);
        if (error) alert(error.message);
        else pcpVariedades();
      }
    });
  }

  async function pcpProducao() {
    const [talhoes, vars, canas, ins] = await Promise.all([
      list("talhoes", "nome"),
      list("variedades", "nome"),
      list("canas", "nome"),
      list("insumos_pcp", "nome")
    ]);
    view.innerHTML =
      title("Ordem de produção") +
      `<div class="card"><p class="muted">Ao concluir, o sistema baixa o insumo e entra a cana no estoque.</p>
      <form id="f" class="grid grid-2">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>Toneladas previstas</label><input type="number" step="0.001" name="toneladas" value="0" /></div>
        <div class="field"><label>ATR</label><input type="number" step="0.01" name="atr" value="0" /></div>
        <div class="field"><label>Talhão</label><select name="talhao_id">${options(talhoes, "id", "nome")}</select></div>
        <div class="field"><label>Variedade</label><select name="variedade_id">${options(vars, "id", "nome")}</select></div>
        <div class="field"><label>Cana (produto acabado)</label><select name="cana_id">${options(canas, "id", "nome")}</select></div>
        <div class="field"><label>Insumo</label><select name="insumo_id"><option value="">—</option>${options(ins, "id", "nome")}</select></div>
        <div class="field"><label>Qtd insumo</label><input type="number" step="0.001" name="quantidade_insumo" value="0" /></div>
        <div class="field"><label>Início</label><input type="date" name="data_inicio" /></div>
        <div><button class="btn" type="submit">Abrir OP</button></div>
      </form><div id="m"></div></div>`;
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.from("producoes").insert({
        nome: fd.nome,
        toneladas: Number(fd.toneladas),
        atr: Number(fd.atr),
        quantidade: Number(fd.toneladas),
        talhao_id: fd.talhao_id || null,
        variedade_id: fd.variedade_id || null,
        cana_id: fd.cana_id || null,
        insumo_id: fd.insumo_id || null,
        quantidade_insumo: Number(fd.quantidade_insumo || 0),
        data_inicio: fd.data_inicio || null,
        status: "EM PROGRESSO"
      });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "OP aberta.");
      if (!error) location.hash = "#/pcp/lista";
    };
  }

  async function pcpOrdens() {
    const { data, error } = await sb
      .from("producoes")
      .select("*, contratos_cana(*)")
      .not("contrato_id", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const pode = canWrite("/pcp/ordens");
    const hoje = new Date().toISOString().slice(0, 10);
    const dataBr = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
    const atr4 = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const abertas = (data || []).filter((o) => o.status === "EM PROGRESSO");
    const linha = (o) => {
      const c = o.contratos_cana || {};
      const atrasada = o.status === "EM PROGRESSO" && c.data_entrega < hoje;
      const acao =
        o.status === "EM PROGRESSO" && pode
          ? `<button class="btn small gold" data-baixa="${o.id}">Dar baixa</button>`
          : o.status === "CONCLUIDO"
          ? "✔ No Financeiro"
          : "—";
      const feita = o.status === "CONCLUIDO";
      return `<tr><td>${esc(String(o.nome).split(" — ")[0])}</td><td>${esc(c.nome)}</td>
        <td>${dataBr(c.data_entrega)}${atrasada ? ' <span class="chip bad">Atrasada</span>' : ""}</td>
        <td>${num(feita ? o.toneladas : c.quantidade)} t${feita ? `<br><small>ATR ${num(o.atr)} kg/t</small>` : ""}</td>
        <td>R$ ${atr4(c.preco_atr)}</td><td>${feita ? money(c.valor_total) : "—"}</td><td>${chip(o.status)}</td><td>${acao}</td></tr>`;
    };
    view.innerHTML =
      title("Ordens de contrato") +
      `<p class="help">Cada contrato do Comercial cai aqui como ordem de produção. A cana <b>não passa pelo estoque</b>. Ao <b>dar baixa</b>, informe as toneladas entregues e o ATR apurado: o sistema calcula <b>t × ATR × preço do ATR</b> e envia a conta a receber ao Financeiro.</p>` +
      `<div class="grid grid-3" style="margin-bottom:16px"><div class="card"><div class="muted">Aguardando entrega</div><div class="kpi">${abertas.length}</div></div>
        <div class="card"><div class="muted">Toneladas a produzir</div><div class="kpi">${num(abertas.reduce((t, o) => t + Number(o.toneladas), 0))} t</div></div></div>` +
      table(["OP", "Cliente", "Entrega", "Toneladas", "Preço ATR", "Valor", "Status", "Ação"], (data || []).map(linha).join(""));
    view.querySelectorAll("[data-baixa]").forEach((b) => {
      const o = data.find((x) => x.id === b.dataset.baixa);
      const c = o.contratos_cana || {};
      b.onclick = () => {
        const modal = openFormModal(
          "Dar baixa na ordem",
          `<p class="muted">${esc(o.nome)}<br>Preço do ATR: <b>R$ ${atr4(c.preco_atr)}</b>/kg · Contratado: <b>${num(c.quantidade)} t</b></p>
           <div class="field"><label>Toneladas entregues</label><input type="number" step="0.001" min="0.001" name="toneladas" id="bx-t" required value="${Number(c.quantidade)}" /></div>
           <div class="field"><label>ATR apurado (kg/t)</label><input type="number" step="0.01" min="0.01" name="atr" id="bx-atr" required placeholder="Ex.: 132,50" /></div>
           <div class="field"><label>Vencimento (opcional)</label><input type="date" name="vencimento" /><small class="muted">Em branco = 5º dia útil do mês seguinte.</small></div>
           <div class="box" id="bx-prev">Valor a receber: <b>—</b></div>`,
          async (fd, msgEl) => {
            const { error: err } = await sb.rpc("baixar_contrato_cana", {
              p_producao_id: o.id,
              p_toneladas: Number(fd.toneladas),
              p_atr: Number(fd.atr),
              p_vencimento: fd.vencimento || null
            });
            if (err) {
              msgEl.innerHTML = flash("err", err.message);
              return false;
            }
            pcpOrdens();
            return true;
          }
        );
        modal.querySelector("button[type=submit]").textContent = "Dar baixa e enviar ao Financeiro";
        const calc = () => {
          const v = Number(document.getElementById("bx-t").value) * Number(document.getElementById("bx-atr").value) * Number(c.preco_atr);
          document.getElementById("bx-prev").innerHTML = `Valor a receber: <b>${v > 0 ? money(v) : "—"}</b>`;
        };
        ["bx-t", "bx-atr"].forEach((id) => document.getElementById(id).addEventListener("input", calc));
      };
    });
  }

  async function pcpLista() {
    const { data, error } = await sb.from("producoes").select("*, talhoes(nome), canas(nome), insumos_pcp(nome)").order("created_at", { ascending: false });
    if (error) throw error;
    view.innerHTML =
      title("Produções") +
      table(
        ["OP", "Talhão", "Cana", "Insumo", "t", "Status", "Ação"],
        (data || [])
          .map(
            (p) =>
              `<tr><td>${esc(p.nome)}</td><td>${esc(p.talhoes?.nome)}</td><td>${esc(p.canas?.nome)}</td><td>${esc(p.insumos_pcp?.nome)}</td><td>${num(p.toneladas)}</td><td>${chip(p.status)}</td>
              <td>${p.contrato_id ? `<a href="#/pcp/ordens">Ordem de contrato</a>` : p.status !== "CONCLUIDO" && p.status !== "CANCELADO" && canWrite("/pcp/lista") ? `<button class="btn small" data-ok="${p.id}">Concluir (estoque)</button>` : "—"}</td></tr>`
          )
          .join("")
      );
    view.querySelectorAll("[data-ok]").forEach((b) => {
      b.onclick = async () => {
        const { error: err } = await sb.rpc("concluir_producao", { p_producao_id: b.dataset.ok });
        if (err) alert(err.message);
        else pcpLista();
      };
    });
  }

  window.SysCanaCore.startRouter({
    "/pcp/ordens": pcpOrdens,
    "/pcp/requisicao": pcpRequisicao,
    "/pcp/cana": pcpCana,
    "/pcp/insumos": pcpInsumos,
    "/pcp/talhoes": pcpTalhoes,
    "/pcp/variedades": pcpVariedades,
    "/pcp/producao": pcpProducao,
    "/pcp/lista": pcpLista
  }, "/pcp/ordens");
})();
