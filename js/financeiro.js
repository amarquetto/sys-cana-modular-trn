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

  // Só as contas a pagar que nasceram da FOLHA (holerites). Compras e despesas ficam em "Contas a pagar".
  async function salarios() {
    const { data, error } = await sb.from("contas_pagar").select("*").eq("origem", "folha").order("vencimento", { ascending: false });
    if (error) {
      view.innerHTML = title("Salários (folha de pagamento)") + `<div class="card">${flash("err", "Não foi possível ler as contas da folha. Rode a migração migracao_folha.sql no Supabase. (" + esc(error.message) + ")")}</div>`;
      return;
    }
    const rows = data || [];
    const hoje = new Date().toISOString().slice(0, 10);
    const write = canWrite("/fin/salarios");
    const meses = [...new Set(rows.map((r) => String(r.vencimento).slice(0, 7)))].sort().reverse();
    const mesLabel = (m) => m.slice(5) + "/" + m.slice(0, 4);
    view.innerHTML =
      title("Salários (folha de pagamento)") +
      `<p class="help">Mostra <b>somente</b> as contas geradas pelos holerites da Folha. Compras e despesas ficam em <b>Contas a pagar</b>. ${write ? "Use <b>Dar baixa</b> quando o salário for pago." : "Somente consulta: a baixa é feita pelo Financeiro."}</p>
      <div class="grid grid-3" id="sal-kpis"></div>
      <div class="card" style="margin-top:16px"><form class="grid grid-2" onsubmit="return false">
        <div class="field"><label>Mês de vencimento</label><select id="sal-mes"><option value="">Todos</option>${meses.map((m) => `<option value="${m}">${mesLabel(m)}</option>`).join("")}</select></div>
        <div class="field"><label>Situação</label><select id="sal-st"><option value="">Todas</option><option value="Aberto">Em aberto</option><option value="Pago">Pagas</option></select></div>
      </form></div>
      <div id="sal-tabela"></div>`;
    const desenhar = () => {
      const mes = document.getElementById("sal-mes").value;
      const st = document.getElementById("sal-st").value;
      const f = rows.filter((r) => (!mes || String(r.vencimento).startsWith(mes)) && (!st || r.status === st));
      const soma = (arr) => arr.reduce((t, r) => t + Number(r.valor), 0);
      const abertas = f.filter((r) => r.status === "Aberto");
      const atrasadas = abertas.filter((r) => r.vencimento < hoje);
      document.getElementById("sal-kpis").innerHTML =
        `<div class="card"><div class="muted">A pagar (em aberto)</div><div class="kpi">${money(soma(abertas))}</div><small class="muted">${abertas.length} conta(s)</small></div>
         <div class="card"><div class="muted">Em atraso</div><div class="kpi" style="color:${atrasadas.length ? "var(--danger)" : "var(--ok)"}">${money(soma(atrasadas))}</div><small class="muted">${atrasadas.length} conta(s)</small></div>
         <div class="card"><div class="muted">Já pagas</div><div class="kpi">${money(soma(f.filter((r) => r.status === "Pago")))}</div><small class="muted">${f.filter((r) => r.status === "Pago").length} conta(s)</small></div>`;
      document.getElementById("sal-tabela").innerHTML = table(
        ["Descrição", "Valor", "Vencimento", "Situação", "Pago em", "Ação"],
        f
          .map(
            (c) => `<tr><td>${esc(c.descricao)}</td><td>${money(c.valor)}</td>
              <td>${dbr(c.vencimento)}${c.status === "Aberto" && c.vencimento < hoje ? ' <span class="chip bad">Atrasado</span>' : ""}</td>
              <td>${chip(c.status)}</td><td>${c.pago_em ? dbr(c.pago_em) : "—"}</td>
              <td>${write && c.status === "Aberto" ? `<button class="btn small" data-baixa="${c.id}">Dar baixa</button>` : "—"}</td></tr>`
          )
          .join("") || `<tr><td colspan="6" class="muted">Nenhuma conta da folha neste filtro.</td></tr>`
      );
      document.querySelectorAll("#sal-tabela [data-baixa]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Confirmar o pagamento deste salário?")) return;
          const { error: err } = await sb.rpc("baixar_pagar", { p_id: b.dataset.baixa });
          if (err) alert(err.message);
          else salarios();
        };
      });
    };
    document.getElementById("sal-mes").onchange = desenhar;
    document.getElementById("sal-st").onchange = desenhar;
    desenhar();
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
    "/fin/salarios": salarios,
    "/fin/pagar-baixa": () => baixa("pagar"),
    "/fin/receber": () => contas("receber"),
    "/fin/receber-baixa": () => baixa("receber"),
    "/fin/contabil": contabil
  }, "/fin/caixa");
})();
