(() => {
  const { sb, money, num, esc, title, table, chip, list, flash, actionButtons, openFormModal, bindCrud } = window.SysCanaCore;
  const view = document.getElementById("view");

  async function notas() {
    const { data, error } = await sb
      .from("faturas")
      .select("*, clientes(nome), fornecedores(nome_fantasia), fatura_itens(*, canas(nome), produtos(nome))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    view.innerHTML =
      title("Notas fiscais") +
      `<p class="help">NF de compra: recebimento em Compras. NF de venda: Faturamento no pedido comercial.</p>` +
      table(
        ["Nº", "Tipo", "Parceiro", "Produto", "Qtd", "Total", "Status"],
        (data || [])
          .map((f) => {
            const item = (f.fatura_itens || [])[0];
            const prod = item?.canas?.nome || item?.produtos?.nome || "—";
            const parc = f.natureza_operacao === "Venda" ? f.clientes?.nome : f.fornecedores?.nome_fantasia;
            return `<tr><td>${esc(f.numero_fatura)}</td><td>${esc(f.natureza_operacao)}</td><td>${esc(parc)}</td><td>${esc(prod)}</td><td>${num(item?.quantidade)}</td><td>${money(f.valor_total)}</td><td>${chip(f.status_pagamento)}</td></tr>`;
          })
          .join("")
      );
  }

  async function aliquotas() {
    const rows = await list("impostos", "nome");
    view.innerHTML =
      title("Alíquotas") +
      `<div class="card"><form id="f" class="grid grid-2">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>Taxa (%)</label><input type="number" step="0.01" min="0" name="taxa" required /></div>
        <div><button class="btn" type="submit">Salvar</button></div>
      </form><div id="m"></div></div>` +
      table(
        ["Nome", "Taxa", "Ações"],
        rows.map((i) => `<tr><td>${esc(i.nome)}</td><td>${num(i.taxa)}%</td>${actionButtons(i.id)}</tr>`).join("")
      );
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.from("impostos").insert({ nome: fd.nome, taxa: Number(fd.taxa) });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Salvo.");
      if (!error) aliquotas();
    };
    bindCrud(view, rows, {
      confirmMsg: "Excluir esta alíquota?",
      onEdit: (i) => {
        openFormModal(
          "Editar alíquota",
          `<div class="field"><label>Nome</label><input name="nome" required value="${esc(i.nome || "")}" /></div>
           <div class="field"><label>Taxa (%)</label><input type="number" step="0.01" min="0" name="taxa" required value="${esc(i.taxa ?? 0)}" /></div>`,
          async (fd, msgEl) => {
            const { error } = await sb.from("impostos").update({ nome: fd.nome, taxa: Number(fd.taxa) }).eq("id", i.id);
            if (error) {
              msgEl.innerHTML = flash("err", error.message);
              return false;
            }
            aliquotas();
            return true;
          }
        );
      },
      onDelete: async (id) => {
        const { error } = await sb.from("impostos").delete().eq("id", id);
        if (error) alert(error.message);
        else aliquotas();
      }
    });
  }

  async function fatRelatorios() {
    const { data } = await sb.from("faturas").select("natureza_operacao,valor_total,status_pagamento");
    const rows = data || [];
    const venda = rows.filter((f) => f.natureza_operacao === "Venda").reduce((s, f) => s + Number(f.valor_total), 0);
    const compra = rows.filter((f) => f.natureza_operacao === "Compra").reduce((s, f) => s + Number(f.valor_total), 0);
    view.innerHTML =
      title("Relatórios de faturamento") +
      `<div class="grid grid-2">
        <div class="card"><div class="muted">Vendas</div><div class="kpi">${money(venda)}</div></div>
        <div class="card"><div class="muted">Compras</div><div class="kpi">${money(compra)}</div></div>
        <div class="card"><div class="muted">Notas</div><div class="kpi">${rows.length}</div></div>
        <div class="card"><div class="muted">Pendentes</div><div class="kpi">${rows.filter((f) => f.status_pagamento === "Pendente").length}</div></div>
      </div>`;
  }

  async function fatConfig() {
    const { data } = await sb.from("config_faturamento").select("*").eq("id", 1).maybeSingle();
    const c = data || {};
    view.innerHTML =
      title("Configurações de faturamento") +
      `<div class="card"><form id="f">
        <div class="field"><label>Razão social</label><input name="razao_social" value="${esc(c.razao_social || "")}" /></div>
        <div class="field"><label>CNPJ</label><input name="cnpj" value="${esc(c.cnpj || "")}" /></div>
        <div class="field"><label>IE</label><input name="inscricao_estadual" value="${esc(c.inscricao_estadual || "")}" /></div>
        <div class="field"><label>Endereço</label><input name="endereco" value="${esc(c.endereco || "")}" /></div>
        <div class="field"><label>Série NF-e</label><input name="serie_nfe" value="${esc(c.serie_nfe || "1")}" /></div>
        <button class="btn" type="submit">Salvar</button>
      </form><div id="m"></div></div>`;
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.from("config_faturamento").upsert({ id: 1, ...Object.fromEntries(new FormData(e.target)) });
      document.getElementById("m").innerHTML = error ? window.SysCanaCore.flash("err", error.message) : window.SysCanaCore.flash("ok", "Salvo.");
    };
  }

  window.SysCanaCore.startRouter({
    "/fat/notas": notas,
    "/fat/aliquotas": aliquotas,
    "/fat/relatorios": fatRelatorios,
    "/fat/config": fatConfig
  }, "/fat/notas");
})();
