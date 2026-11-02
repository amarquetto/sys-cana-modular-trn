(() => {
  const { sb, money, num, esc, flash, title, options, table, chip, canWrite, list, param, bindRpc, link, actionButtons, openFormModal, bindCrud } = window.SysCanaCore;
  const view = document.getElementById("view");

  async function clientes() {
    const rows = await list("clientes", "nome");
    const form = canWrite("/com/clientes")
      ? `<div class="card"><form id="f" class="grid grid-2">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>CNPJ/CPF</label><input name="documento" /></div>
        <div class="field"><label>Telefone</label><input name="telefone" /></div>
        <div class="field"><label>Cidade</label><input name="cidade" /></div>
        <div class="field"><label>UF</label><input name="estado" maxlength="2" /></div>
        <div><button class="btn" type="submit">Cadastrar</button></div>
      </form><div id="m"></div></div>`
      : `<p class="help">Consulta para emissão de NF. Quem cadastra é o Comercial.</p>`;
    const pode = canWrite("/com/clientes");
    view.innerHTML =
      title("Clientes") +
      form +
      table(
        ["Nome", "Documento", "Cidade", "Ações"],
        rows
          .map(
            (c) =>
              `<tr><td>${esc(c.nome)}</td><td>${esc(c.documento)}</td><td>${esc(c.cidade)}</td>${
                pode ? actionButtons(c.id) : "<td>—</td>"
              }</tr>`
          )
          .join("")
      );
    const f = document.getElementById("f");
    if (f)
      f.onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await sb.from("clientes").insert(Object.fromEntries(new FormData(e.target)));
        document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Cliente salvo.");
        if (!error) clientes();
      };
    if (pode) {
      bindCrud(view, rows, {
        confirmMsg: "Excluir este cliente?",
        onEdit: (c) => {
          openFormModal(
            "Editar cliente",
            `<div class="field"><label>Nome</label><input name="nome" required value="${esc(c.nome || "")}" /></div>
             <div class="field"><label>CNPJ/CPF</label><input name="documento" value="${esc(c.documento || "")}" /></div>
             <div class="field"><label>Telefone</label><input name="telefone" value="${esc(c.telefone || "")}" /></div>
             <div class="field"><label>Cidade</label><input name="cidade" value="${esc(c.cidade || "")}" /></div>
             <div class="field"><label>UF</label><input name="estado" maxlength="2" value="${esc(c.estado || "")}" /></div>`,
            async (fd, msgEl) => {
              const { error } = await sb.from("clientes").update(fd).eq("id", c.id);
              if (error) {
                msgEl.innerHTML = flash("err", error.message);
                return false;
              }
              clientes();
              return true;
            }
          );
        },
        onDelete: async (id) => {
          const { error } = await sb.from("clientes").delete().eq("id", id);
          if (error) alert(error.message);
          else clientes();
        }
      });
    }
  }

  async function pedidoNovo() {
    const [cli, canas] = await Promise.all([list("clientes", "nome"), list("canas", "nome")]);
    view.innerHTML =
      title("Pedido de venda") +
      `<div class="card"><p class="muted">Comercial abre o pedido. O Faturamento emite a NF, baixa estoque e gera duplicata a receber.</p>
      <form id="f">
        <div class="field"><label>Cliente</label><select name="cliente_id" required>${options(cli, "id", "nome")}</select></div>
        <div class="field"><label>Cana</label><select name="cana_id" required>${options(canas, "id", "nome")}</select></div>
        <div class="field"><label>Quantidade (t)</label><input type="number" step="0.001" min="0.001" name="quantidade" required /></div>
        <div class="field"><label>Preço por t</label><input type="number" step="0.01" min="0.01" name="valor_unitario" required /></div>
        <div class="field"><label>Pagamento</label><select name="forma_pgto"><option>Boleto</option><option>PIX</option><option>Transferência</option></select></div>
        <button class="btn" type="submit">Registrar pedido</button>
      </form><div id="m"></div></div>`;
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const q = Number(fd.quantidade);
      const vu = Number(fd.valor_unitario);
      const { error } = await sb.from("pedidos").insert({
        cliente_id: fd.cliente_id,
        cana_id: fd.cana_id,
        quantidade: q,
        unidade: "t",
        forma_pgto: fd.forma_pgto,
        valor_unitario: vu,
        valor_total: +(vu * q).toFixed(2),
        status: "Aberto"
      });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Pedido no Comercial.");
      if (!error) location.hash = "#/com/pedidos";
    };
  }

  async function pedidosVenda() {
    const { data, error } = await sb.from("pedidos").select("*, clientes(nome), canas(nome)").order("created_at", { ascending: false });
    if (error) throw error;
    view.innerHTML =
      title("Pedidos de venda") +
      table(
        ["Cliente", "Cana", "t", "Total", "Status", "Ação"],
        (data || [])
          .map(
            (p) =>
              `<tr><td>${esc(p.clientes?.nome)}</td><td>${esc(p.canas?.nome)}</td><td>${num(p.quantidade)}</td><td>${money(p.valor_total)}</td><td>${chip(p.status)}</td>
              <td>${p.status === "Aberto" && canWrite("/com/faturar") ? `<a class="btn small gold" href="#/com/faturar?id=${p.id}">Faturar</a>` : p.status === "Aberto" ? "Aguardando Faturamento" : "NF emitida"}</td></tr>`
          )
          .join("")
      );
  }

  async function faturarPedido() {
    const id = param("id");
    const imps = await list("impostos", "nome");
    view.innerHTML =
      title("Faturar pedido de venda") +
      `<div class="card"><p class="muted">Emite NF, baixa cana do estoque e abre conta a receber.</p>
      <form id="f">
        <div class="field"><label>Número da NF</label><input name="numero" required placeholder="NF-V-001" /></div>
        <div class="field"><label>Alíquota</label><select name="imposto_id">${options(imps, "id", "nome")}</select></div>
        <div class="field"><label>Vencimento</label><input type="date" name="vencimento" required /></div>
        <div class="field"><label>Frete</label><input type="number" step="0.01" min="0" name="frete" value="0" /></div>
        <button class="btn" type="submit">Emitir NF</button>
      </form><div id="m"></div></div>`;
    bindRpc("f", "m", "faturar_venda", (fd) => ({
      p_pedido_id: id,
      p_numero: fd.numero,
      p_imposto_id: fd.imposto_id || null,
      p_vencimento: fd.vencimento,
      p_frete: Number(fd.frete || 0)
    }), () => (location.href = link("/fat/notas")));
  }

  window.SysCanaCore.startRouter({
    "/com/clientes": clientes,
    "/com/novo": pedidoNovo,
    "/com/pedidos": pedidosVenda,
    "/com/faturar": faturarPedido
  }, "/com/pedidos");
})();
