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

  const atr4 = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const nContrato = (c) => String(c.numero).padStart(4, "0");
  const dataBr = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

  function mascaraDoc(el) {
    el.addEventListener("input", () => {
      const d = el.value.replace(/\D/g, "").slice(0, 14);
      el.value =
        d.length <= 11
          ? d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
          : d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
    });
  }

  async function contratoNovo() {
    const hoje = new Date().toISOString().slice(0, 10);
    view.innerHTML =
      title("Novo contrato de cana") +
      `<div class="card"><p class="help" style="margin-top:0">Ao salvar, o contrato vira uma <b>ordem de produção no PCP</b>. A cana <b>não passa pelo estoque</b>: na entrega o PCP informa as toneladas e o ATR apurado, e o valor a receber é calculado como <b>toneladas × ATR (kg/t) × preço do ATR</b>.</p>
      <form id="f" class="grid grid-2">
        <div class="field"><label>Nome do cliente / produtor</label><input name="nome" required minlength="2" placeholder="Ex.: Usina São João" /></div>
        <div class="field"><label>CPF / CNPJ</label><input name="documento" id="doc" required inputmode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00" /></div>
        <div class="field"><label>Preço do ATR (R$ por kg)</label><input type="number" step="0.0001" min="0.0001" name="preco_atr" required placeholder="1,1250" /></div>
        <div class="field"><label>Data de entrega</label><input type="date" name="data_entrega" min="${hoje}" required /></div>
        <div class="field"><label>Quantidade de cana (t)</label><input type="number" step="0.001" min="0.001" name="quantidade" required /></div>
        <div><button class="btn" type="submit">Salvar contrato e enviar ao PCP</button></div>
      </form><div id="m"></div></div>`;
    mascaraDoc(document.getElementById("doc"));
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      const { error } = await sb.rpc("registrar_contrato_cana", {
        p_nome: fd.nome,
        p_documento: fd.documento,
        p_preco_atr: Number(fd.preco_atr),
        p_data_entrega: fd.data_entrega,
        p_quantidade: Number(fd.quantidade)
      });
      btn.disabled = false;
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Contrato salvo. Ordem de produção enviada ao PCP.");
      if (!error) location.hash = "#/com/pedidos";
    };
  }

  async function contratos() {
    const { data, error } = await sb.from("contratos_cana").select("*").order("numero", { ascending: false });
    if (error) throw error;
    const hoje = new Date().toISOString().slice(0, 10);
    const pode = canWrite("/com/pedidos");
    const entrega = (c) => dataBr(c.data_entrega) + (c.status === "Em Produção" && c.data_entrega < hoje ? ' <span class="chip bad">Atrasado</span>' : "");
    const acao = (c) =>
      c.status === "Em Produção" && pode
        ? `<button class="btn small ghost" data-cancel="${c.id}">Cancelar</button>`
        : c.status === "Em Produção"
        ? "Aguardando PCP"
        : c.status === "Aguardando Recebimento"
        ? "Aguardando Financeiro"
        : "—";
    const totalAberto = (data || []).filter((c) => c.status === "Em Produção").reduce((s, c) => s + Number(c.quantidade), 0);
    view.innerHTML =
      title("Contratos de cana") +
      `<div class="grid grid-3" style="margin-bottom:16px">
        <div class="card"><div class="muted">Em produção</div><div class="kpi">${(data || []).filter((c) => c.status === "Em Produção").length}</div></div>
        <div class="card"><div class="muted">Toneladas a entregar</div><div class="kpi">${num(totalAberto)} t</div></div>
        <div class="card"><div class="muted">A receber (entregue)</div><div class="kpi">${money((data || []).filter((c) => c.status === "Aguardando Recebimento").reduce((s, c) => s + Number(c.valor_total || 0), 0))}</div></div>
      </div>` +
      table(
        ["Nº", "Cliente", "CPF/CNPJ", "Entrega", "t contrat.", "Preço ATR", "Entregue (t · ATR)", "Valor", "Status", "Ação"],
        (data || [])
          .map(
            (c) => `<tr><td>${nContrato(c)}</td><td>${esc(c.nome)}</td><td>${esc(c.documento)}</td><td>${entrega(c)}</td><td>${num(c.quantidade)}</td><td>R$ ${atr4(c.preco_atr)}</td>
              <td>${c.toneladas_entregues != null ? num(c.toneladas_entregues) + " t · " + num(c.atr_apurado) : "—"}</td><td>${c.valor_total != null ? money(c.valor_total) : "—"}</td><td>${chip(c.status)}</td><td>${acao(c)}</td></tr>`
          )
          .join("")
      );
    view.querySelectorAll("[data-cancel]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Cancelar este contrato e a ordem de produção no PCP?")) return;
        const { error: err } = await sb.rpc("cancelar_contrato_cana", { p_contrato_id: b.dataset.cancel });
        if (err) alert(err.message);
        else contratos();
      };
    });
  }

  window.SysCanaCore.startRouter({
    "/com/clientes": clientes,
    "/com/novo": contratoNovo,
    "/com/pedidos": contratos
  }, "/com/pedidos");
})();
