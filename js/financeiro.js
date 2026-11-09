(() => {
  const { sb, money, num, dbr, esc, flash, title, table, chip, canWrite, list, setor, actionButtons, openFormModal, bindCrud } = window.SysCanaCore;
  const view = document.getElementById("view");

  async function fluxoCaixa() {
    const [pagar, receber] = await Promise.all([list("contas_pagar"), list("contas_receber")]);
    const hoje = new Date().toISOString().slice(0, 10);
    const soma = (rows, st) => rows.filter((c) => c.status === st).reduce((s, c) => s + Number(c.valor), 0);
    const saidas = soma(pagar, "Pago");
    const entradas = soma(receber, "Recebido");
    const aPagar = soma(pagar, "Aberto");
    const aRec = soma(receber, "Aberto");
    const abertos = (rows) => rows.filter((c) => c.status === "Aberto").sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento)));
    const atrasoPagar = abertos(pagar).filter((c) => c.vencimento < hoje);
    const atrasoRec = abertos(receber).filter((c) => c.vencimento < hoje);

    const linhas = (rows) =>
      rows
        .slice(0, 6)
        .map(
          (c) => `<tr><td>${esc(c.descricao)}</td><td>${dbr(c.vencimento)}${c.vencimento < hoje ? ' <span class="chip bad">Atrasado</span>' : ""}</td><td style="text-align:right">${money(c.valor)}</td></tr>`
        )
        .join("") || `<tr><td colspan="3" class="muted">Nada em aberto.</td></tr>`;

    const saldo = entradas - saidas;
    const projetado = aRec - aPagar;
    view.innerHTML =
      title("Fluxo de caixa") +
      `<div class="grid grid-3">
        <div class="card"><div class="muted">Recebido</div><div class="kpi">${money(entradas)}</div></div>
        <div class="card"><div class="muted">Pago</div><div class="kpi">${money(saidas)}</div></div>
        <div class="card"><div class="muted">Saldo realizado</div><div class="kpi" style="color:${saldo < 0 ? "var(--danger)" : "var(--ok)"}">${money(saldo)}</div></div>
        <div class="card"><div class="muted">A receber</div><div class="kpi">${money(aRec)}</div>${atrasoRec.length ? `<small style="color:var(--danger)">${atrasoRec.length} em atraso</small>` : ""}</div>
        <div class="card"><div class="muted">A pagar</div><div class="kpi">${money(aPagar)}</div>${atrasoPagar.length ? `<small style="color:var(--danger)">${atrasoPagar.length} em atraso</small>` : ""}</div>
        <div class="card"><div class="muted">Saldo projetado (a receber − a pagar)</div><div class="kpi" style="color:${projetado < 0 ? "var(--danger)" : "var(--ok)"}">${money(projetado)}</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><h3>Próximos a receber</h3><div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Vencimento</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas(abertos(receber))}</tbody></table></div></div>
        <div class="card"><h3>Próximos a pagar</h3><div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Vencimento</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas(abertos(pagar))}</tbody></table></div></div>
      </div>`;
  }

  async function aprovacoes() {
    const { data, error } = await sb
      .from("solicitacoes")
      .select("*, produtos(nome), fornecedores(nome_fantasia)")
      .eq("status", "AguardandoFinanceiro")
      .order("created_at");
    if (error) throw error;
    view.innerHTML =
      title("Aprovar compras") +
      `<p class="help">Orçamento escolhido por Compras. Aprovar devolve ao pipeline para emitir o pedido. Reprovar encerra.</p>` +
      table(
        ["Produto", "Fornecedor", "Qtd", "Valor", "Ação"],
        (data || [])
          .map(
            (s) =>
              `<tr><td>${esc(s.produtos?.nome)}<br><small>${esc(s.descricao)}</small></td><td>${esc(s.fornecedores?.nome_fantasia)}</td><td>${num(s.quantidade)}</td><td>${money(s.valor_estimado)}</td>
              <td><button class="btn small" data-ok="${s.id}">Aprovar</button> <button class="btn danger small" data-no="${s.id}">Reprovar</button></td></tr>`
          )
          .join("")
      );
    view.querySelectorAll("[data-ok],[data-no]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.ok || b.dataset.no;
        const { error: err } = await sb.rpc("decidir_financeiro", { p_solicitacao_id: id, p_aprovar: Boolean(b.dataset.ok) });
        if (err) alert(err.message);
        else aprovacoes();
      };
    });
  }

  async function contas(kind) {
    const isPagar = kind === "pagar";
    const tableName = isPagar ? "contas_pagar" : "contas_receber";
    const rows = await list(tableName);
    const write = canWrite(isPagar ? "/fin/pagar" : "/fin/receber");
    const form = write
      ? `<div class="card"><form id="f" class="grid grid-2">
        <div class="field"><label>Descrição</label><input name="descricao" required /></div>
        <div class="field"><label>Valor</label><input type="number" step="0.01" min="0.01" name="valor" required /></div>
        <div class="field"><label>Vencimento</label><input type="date" name="vencimento" required /></div>
        <div><button class="btn" type="submit">Lançar avulso</button></div>
      </form><div id="m"></div></div>`
      : `<p class="help">Somente consulta. Baixas e lançamentos avulsos são do Financeiro.</p>`;
    view.innerHTML =
      title(isPagar ? "Contas a pagar" : "Contas a receber") +
      `<p class="help">${isPagar ? "Nascem do recebimento de compra e da folha." : "Nascem do faturamento de venda."}</p>
      ${form}` +
      table(
        ["Descrição", "Valor", "Vencimento", "Status", "Ações"],
        rows
          .map((c) => {
            const acoes =
              write && c.status === "Aberto"
                ? actionButtons(c.id)
                : "<td class='muted'>—</td>";
            return `<tr><td>${esc(c.descricao)}</td><td>${money(c.valor)}</td><td>${dbr(c.vencimento)}</td><td>${chip(c.status)}</td>${acoes}</tr>`;
          })
          .join("")
      );
    const f = document.getElementById("f");
    if (f)
      f.onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        const { error } = await sb.from(tableName).insert({ descricao: fd.descricao, valor: Number(fd.valor), vencimento: fd.vencimento });
        document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Lançado.");
        if (!error) contas(kind);
      };
    if (write) {
      bindCrud(view, rows, {
        confirmMsg: "Excluir este título em aberto?",
        onEdit: (c) => {
          if (c.status !== "Aberto") return;
          openFormModal(
            "Editar título",
            `<div class="field"><label>Descrição</label><input name="descricao" required value="${esc(c.descricao || "")}" /></div>
             <div class="field"><label>Valor</label><input type="number" step="0.01" min="0.01" name="valor" required value="${esc(c.valor ?? 0)}" /></div>
             <div class="field"><label>Vencimento</label><input type="date" name="vencimento" required value="${esc(c.vencimento || "")}" /></div>`,
            async (fd, msgEl) => {
              const { error } = await sb
                .from(tableName)
                .update({ descricao: fd.descricao, valor: Number(fd.valor), vencimento: fd.vencimento })
                .eq("id", c.id)
                .eq("status", "Aberto");
              if (error) {
                msgEl.innerHTML = flash("err", error.message);
                return false;
              }
              contas(kind);
              return true;
            }
          );
        },
        onDelete: async (id) => {
          const { error } = await sb.from(tableName).delete().eq("id", id).eq("status", "Aberto");
          if (error) alert(error.message);
          else contas(kind);
        }
      });
    }
  }

  async function baixa(kind) {
    const isPagar = kind === "pagar";
    const tableName = isPagar ? "contas_pagar" : "contas_receber";
    const fn = isPagar ? "baixar_pagar" : "baixar_receber";
    const { data, error } = await sb.from(tableName).select("*").eq("status", "Aberto").order("vencimento");
    if (error) throw error;
    view.innerHTML =
      title(isPagar ? "Baixa a pagar" : "Baixa a receber") +
      table(
        ["Descrição", "Valor", "Vencimento", "Ação"],
        (data || [])
          .map(
            (c) =>
              `<tr><td>${esc(c.descricao)}</td><td>${money(c.valor)}</td><td>${dbr(c.vencimento)}</td>
               <td><button class="btn small" data-id="${c.id}">Dar baixa</button></td></tr>`
          )
          .join("")
      );
    view.querySelectorAll("[data-id]").forEach((b) => {
      b.onclick = async () => {
        const { error: err } = await sb.rpc(fn, { p_id: b.dataset.id });
        if (err) alert(err.message);
        else baixa(kind);
      };
    });
  }

  async function contabil() {
    const rows = await list("lancamentos");
    view.innerHTML =
      title("Lançamentos contábeis") +
      `<p class="help">Gerados automaticamente: compra, venda, pagamento, recebimento e folha.</p>` +
      table(
        ["Data", "Débito", "Crédito", "Valor", "Histórico"],
        rows.map((l) => `<tr><td>${dbr(l.data)}</td><td>${esc(l.conta_debito)}</td><td>${esc(l.conta_credito)}</td><td>${money(l.valor)}</td><td>${esc(l.historico)}</td></tr>`).join("")
      );
  }

  window.SysCanaCore.startRouter({
    "/fin/caixa": fluxoCaixa,
    "/fin/aprovacoes": aprovacoes,
    "/fin/pagar": () => contas("pagar"),
    "/fin/pagar-baixa": () => baixa("pagar"),
    "/fin/receber": () => contas("receber"),
    "/fin/receber-baixa": () => baixa("receber"),
    "/fin/contabil": contabil
  }, "/fin/caixa");
})();
