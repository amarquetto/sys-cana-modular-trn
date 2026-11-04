(() => {
  const { sb, money, num, esc, flash, title, options, table, chip, canWrite, list, param, bindRpc, setor, link } = window.SysCanaCore;
  const view = document.getElementById("view");

  function openEditModal(f) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>Editar fornecedor</h3>
        <form id="edit-form" class="grid grid-2">
          <div class="field"><label>Nome fantasia</label><input name="nome_fantasia" value="${esc(f.nome_fantasia || "")}" required /></div>
          <div class="field"><label>CNPJ</label><input name="cnpj" value="${esc(f.cnpj || "")}" /></div>
          <div class="field"><label>Telefone</label><input name="telefone" value="${esc(f.telefone || "")}" /></div>
          <div class="field"><label>Cidade</label><input name="cidade" value="${esc(f.cidade || "")}" /></div>
          <div id="edit-m"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="edit-cancel">Cancelar</button>
            <button type="submit" class="btn">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#edit-cancel").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.querySelector("#edit-form").onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.from("fornecedores").update(data).eq("id", f.id);
      const msgEl = overlay.querySelector("#edit-m");
      if (error) {
        msgEl.innerHTML = flash("err", error.message);
      } else {
        overlay.remove();
        fornecedores();
      }
    };
  }

  async function fornecedores() {
    const rows = await list("fornecedores", "nome_fantasia");
    view.innerHTML =
      title("Fornecedores") +
      `<div class="card"><form id="f" class="grid grid-2">
        <div class="field"><label>Nome fantasia</label><input name="nome_fantasia" required /></div>
        <div class="field"><label>CNPJ</label><input name="cnpj" /></div>
        <div class="field"><label>Telefone</label><input name="telefone" /></div>
        <div class="field"><label>Cidade</label><input name="cidade" /></div>
        <div><button class="btn" type="submit">Cadastrar</button></div>
      </form><div id="m"></div></div>` +
      table(
        ["Fantasia", "CNPJ", "Cidade", "Ações"],
        rows
          .map(
            (f) => `<tr>
              <td>${esc(f.nome_fantasia)}</td>
              <td>${esc(f.cnpj)}</td>
              <td>${esc(f.cidade)}</td>
              <td class="actions">
                <button class="icon-btn" title="Editar" data-edit="${f.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                </button>
                <button class="icon-btn" title="Excluir" data-del="${f.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                  </svg>
                </button>
              </td>
            </tr>`
          )
          .join("")
      );

    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.from("fornecedores").insert(Object.fromEntries(new FormData(e.target)));
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Salvo.");
      if (!error) fornecedores();
    };

    view.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openEditModal(rows.find((r) => r.id == btn.dataset.edit));
    });

    view.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Excluir este fornecedor?")) return;
        const { error } = await sb.from("fornecedores").delete().eq("id", btn.dataset.del);
        if (error) alert(error.message);
        else fornecedores();
      };
    });
  }

  async function solicitacaoNova() {
    const prods = await list("produtos", "nome");
    view.innerHTML =
      title("Nova solicitação de compra") +
      `<div class="card"><p class="muted">Passo 1 do pipeline. Depois Compras lança orçamentos e envia ao Financeiro.</p>
      <form id="f">
        <div class="field"><label>Produto (precisa existir no estoque)</label><select name="produto_id" required>${options(prods, "id", "nome")}</select></div>
        <div class="field"><label>Quantidade</label><input type="number" step="0.001" min="0.001" name="quantidade" required /></div>
        <div class="field"><label>Descrição</label><input name="descricao" required placeholder="Ex.: Reposição de herbicida" /></div>
        <button class="btn" type="submit">Abrir solicitação</button>
      </form><div id="m"></div></div>`;
    bindRpc("f", "m", "solicitar_compra", (fd) => ({
      p_produto_id: fd.produto_id,
      p_quantidade: Number(fd.quantidade),
      p_descricao: fd.descricao,
      p_origem: "Manual",
      p_producao_id: null
    }), () => (location.hash = "#/compras/solicitacoes"));
  }

  async function pipelineCompras() {
    const { data, error } = await sb
      .from("solicitacoes")
      .select("*, fornecedores(nome_fantasia), produtos(nome)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    view.innerHTML =
      title("Pipeline de compras") +
      `<p class="help">Aberta → cotação → Financeiro → aprovada → pedido → receber (NF + estoque + contas a pagar).</p>` +
      table(
        ["Origem", "Produto", "Qtd", "Valor", "Status", "Próximo passo"],
        (data || [])
          .map((s) => {
            let acao = chip(s.status);
            const w = canWrite("/compras/solicitacoes");
            if (w && (s.status === "Aberta" || s.status === "EmCotacao"))
              acao = `<a class="btn small" href="#/compras/cotacao?id=${s.id}">Cotações</a>`;
            else if (w && s.status === "AguardandoFinanceiro") acao = "Aguardando o Financeiro";
            else if (setor().role === "financeiro" && s.status === "AguardandoFinanceiro")
              acao = `<a class="btn small" href="${link("/fin/aprovacoes")}">Aprovar</a>`;
            else if (w && s.status === "Aprovada")
              acao = `<button class="btn small" data-emit="${s.id}">Emitir pedido de compra</button>`;
            else if (w && s.status === "PedidoEmitido")
              acao = `<a class="btn small gold" href="#/compras/pedidos">Receber / NF</a>`;
            else acao = "Acompanhar: " + chip(s.status);
            return `<tr><td>${esc(s.origem)}</td><td>${esc(s.produtos?.nome)}<br><small>${esc(s.descricao)}</small></td><td>${num(s.quantidade)}</td><td>${money(s.valor_estimado)}</td><td>${chip(s.status)}</td><td>${acao}</td></tr>`;
          })
          .join("")
      );
    view.querySelectorAll("[data-emit]").forEach((b) => {
      b.onclick = async () => {
        const { error: err } = await sb.rpc("emitir_pedido_compra", { p_solicitacao_id: b.dataset.emit });
        if (err) alert(err.message);
        else pipelineCompras();
      };
    });
  }

  async function telaCotacao() {
    const id = param("id");
    if (!id) {
      location.hash = "#/compras/solicitacoes";
      return;
    }
    const [{ data: sol }, { data: cots }, fors] = await Promise.all([
      sb.from("solicitacoes").select("*, produtos(nome)").eq("id", id).single(),
      sb.from("cotacoes").select("*, fornecedores(nome_fantasia)").eq("solicitacao_id", id),
      list("fornecedores", "nome_fantasia")
    ]);
    view.innerHTML =
      title("Orçamentos / cotações", `<a class="btn ghost" href="#/compras/solicitacoes">Voltar</a>`) +
      `<div class="card"><p><b>${esc(sol.produtos?.nome)}</b> · ${num(sol.quantidade)} · ${chip(sol.status)}</p>
      <form id="f" class="grid grid-2">
        <div class="field"><label>Fornecedor</label><select name="fornecedor_id" required>${options(fors, "id", "nome_fantasia")}</select></div>
        <div class="field"><label>Preço unitário</label><input type="number" step="0.01" min="0" name="valor_unitario" required /></div>
        <div class="field"><label>Prazo (dias)</label><input type="number" min="0" name="prazo_dias" value="14" /></div>
        <div class="field"><label>Obs.</label><input name="observacao" /></div>
        <div><button class="btn" type="submit">Lançar cotação</button></div>
      </form><div id="m"></div></div>` +
      table(
        ["Fornecedor", "Unitário", "Total", "Prazo", "Ação"],
        (cots || [])
          .map(
            (c) =>
              `<tr><td>${esc(c.fornecedores?.nome_fantasia)} ${c.escolhida ? chip("Aprovada") : ""}</td><td>${money(c.valor_unitario)}</td><td>${money(c.valor_total)}</td><td>${c.prazo_dias} d</td>
              <td>${sol.status === "Aberta" || sol.status === "EmCotacao" ? `<button class="btn small" data-env="${c.id}">Escolher e enviar ao Financeiro</button>` : "—"}</td></tr>`
          )
          .join("")
      );
    bindRpc("f", "m", "registrar_cotacao", (fd) => ({
      p_solicitacao_id: id,
      p_fornecedor_id: fd.fornecedor_id,
      p_valor_unitario: Number(fd.valor_unitario),
      p_prazo_dias: Number(fd.prazo_dias || 0),
      p_observacao: fd.observacao || null
    }), telaCotacao);
    view.querySelectorAll("[data-env]").forEach((b) => {
      b.onclick = async () => {
        const { error } = await sb.rpc("enviar_financeiro", { p_cotacao_id: b.dataset.env });
        if (error) alert(error.message);
        else location.hash = "#/compras/solicitacoes";
      };
    });
  }

  async function pedidosCompra() {
    const { data, error } = await sb
      .from("pedidos_compra")
      .select("*, fornecedores(nome_fantasia), produtos(nome), solicitacoes(descricao,status)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    view.innerHTML =
      title("Pedidos de compra") +
      table(
        ["Produto", "Fornecedor", "Qtd", "Valor", "Status", "Ação"],
        (data || [])
          .map(
            (p) =>
              `<tr><td>${esc(p.produtos?.nome)}</td><td>${esc(p.fornecedores?.nome_fantasia)}</td><td>${num(p.quantidade)}</td><td>${money(p.valor)}</td><td>${chip(p.status)}</td>
              <td>${p.status === "Aberto" && canWrite("/compras/receber") ? `<a class="btn small gold" href="#/compras/receber?id=${p.id}">Receber e gerar NF</a>` : p.status === "Aberto" ? "Aguardando recebimento" : "NF gerada"}</td></tr>`
          )
          .join("")
      );
  }

  async function telaReceber() {
    const id = param("id");
    const imps = await list("impostos", "nome");
    view.innerHTML =
      title("Receber compra + NF de entrada") +
      `<div class="card"><p class="muted">Gera NF de compra, entra no estoque (se o produto existir) e abre conta a pagar no Financeiro.</p>
      <form id="f">
        <div class="field"><label>Número da NF</label><input name="numero" required placeholder="NF-C-001" /></div>
        <div class="field"><label>Alíquota</label><select name="imposto_id">${options(imps, "id", "nome")}</select></div>
        <div class="field"><label>Vencimento</label><input type="date" name="vencimento" required /></div>
        <div class="field"><label>Frete</label><input type="number" step="0.01" min="0" name="frete" value="0" /></div>
        <button class="btn" type="submit">Confirmar recebimento</button>
      </form><div id="m"></div></div>`;
    bindRpc("f", "m", "receber_compra", (fd) => ({
      p_pedido_compra_id: id,
      p_numero: fd.numero,
      p_imposto_id: fd.imposto_id || null,
      p_vencimento: fd.vencimento,
      p_frete: Number(fd.frete || 0)
    }), () => (location.href = link("/fat/notas")));
  }

  window.SysCanaCore.startRouter({
    "/compras/fornecedores": fornecedores,
    "/compras/solicitacao": solicitacaoNova,
    "/compras/solicitacoes": pipelineCompras,
    "/compras/cotacao": telaCotacao,
    "/compras/receber": telaReceber,
    "/compras/pedidos": pedidosCompra
  }, "/compras/solicitacoes");
})();
