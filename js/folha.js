(() => {
  const { sb, money, esc, flash, title, options, table, chip, list, bindRpc, dbr, crudIcons, openFormModal, bindCrud } = window.SysCanaCore;
  const view = document.getElementById("view");

  async function folhaRegistro() {
    view.innerHTML =
      title("Funcionário") +
      `<div class="card"><form id="f" class="grid grid-2">
        <div class="field"><label>Nome</label><input name="nome" required /></div>
        <div class="field"><label>Cargo</label><input name="cargo" /></div>
        <div class="field"><label>CPF</label><input name="cpf" /></div>
        <div class="field"><label>Salário</label><input type="number" step="0.01" name="salario" value="0" /></div>
        <div class="field"><label>Admissão</label><input type="date" name="admissao" /></div>
        <button class="btn" type="submit">Cadastrar</button>
      </form><div id="m"></div></div>`;
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.from("funcionarios").insert({ ...fd, salario: Number(fd.salario || 0), admissao: fd.admissao || null });
      document.getElementById("m").innerHTML = error ? flash("err", error.message) : flash("ok", "Cadastrado.");
      if (!error) location.hash = "#/folha/lista";
    };
  }

  async function folhaLista() {
    const rows = await list("funcionarios", "nome");
    view.innerHTML =
      title("Funcionários") +
      table(
        ["Nome", "Cargo", "Salário", "Status", "Ações"],
        rows
          .map(
            (f) =>
              `<tr><td>${esc(f.nome)}</td><td>${esc(f.cargo)}</td><td>${money(f.salario)}</td><td>${chip(f.status)}</td>
               <td class="actions">
                 ${f.status === "Ativo" ? `<button class="btn danger small" data-id="${f.id}">Demitir</button>` : ""}
                 ${crudIcons(f.id)}
               </td></tr>`
          )
          .join("")
      );
    view.querySelectorAll("[data-id]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Demitir este funcionário?")) return;
        await sb.from("funcionarios").update({ status: "Demitido" }).eq("id", b.dataset.id);
        folhaLista();
      };
    });
    bindCrud(view, rows, {
      confirmMsg: "Excluir este funcionário e os holerites vinculados?",
      onEdit: (f) => {
        openFormModal(
          "Editar funcionário",
          `<div class="field"><label>Nome</label><input name="nome" required value="${esc(f.nome || "")}" /></div>
           <div class="field"><label>Cargo</label><input name="cargo" value="${esc(f.cargo || "")}" /></div>
           <div class="field"><label>CPF</label><input name="cpf" value="${esc(f.cpf || "")}" /></div>
           <div class="field"><label>Salário</label><input type="number" step="0.01" name="salario" value="${esc(f.salario ?? 0)}" /></div>
           <div class="field"><label>Admissão</label><input type="date" name="admissao" value="${esc(f.admissao || "")}" /></div>
           <div class="field"><label>Status</label><select name="status"><option ${f.status === "Ativo" ? "selected" : ""}>Ativo</option><option ${f.status === "Demitido" ? "selected" : ""}>Demitido</option></select></div>`,
          async (fd, msgEl) => {
            const { error } = await sb
              .from("funcionarios")
              .update({ ...fd, salario: Number(fd.salario || 0), admissao: fd.admissao || null })
              .eq("id", f.id);
            if (error) {
              msgEl.innerHTML = flash("err", error.message);
              return false;
            }
            folhaLista();
            return true;
          }
        );
      },
      onDelete: async (id) => {
        const { error } = await sb.from("funcionarios").delete().eq("id", id);
        if (error) alert(error.message);
        else folhaLista();
      }
    });
  }

  async function holerite() {
    const funcs = (await list("funcionarios", "nome")).filter((f) => f.status === "Ativo");
    const { data: hol } = await sb.from("holerites").select("*, funcionarios(nome)").order("created_at", { ascending: false });
    view.innerHTML =
      title("Holerite") +
      `<div class="card"><p class="muted">Gera o holerite, conta a pagar no Financeiro e lançamento contábil.</p>
      <form id="f" class="grid grid-2">
        <div class="field"><label>Funcionário</label><select name="funcionario_id">${options(funcs, "id", "nome")}</select></div>
        <div class="field"><label>Competência</label><input type="date" name="competencia" required /></div>
        <div class="field"><label>Bruto</label><input type="number" step="0.01" name="bruto" id="bruto" required /></div>
        <div class="field"><label>Descontos</label><input type="number" step="0.01" name="descontos" id="desc" value="0" /></div>
        <div class="field"><label>Líquido</label><input id="liq" readonly /></div>
        <div><button class="btn" type="submit">Gerar e enviar ao Financeiro</button></div>
      </form><div id="m"></div></div>` +
      table(
        ["Funcionário", "Competência", "Bruto", "Descontos", "Líquido"],
        (hol || []).map((h) => `<tr><td>${esc(h.funcionarios?.nome)}</td><td>${dbr(h.competencia)}</td><td>${money(h.bruto)}</td><td>${money(h.descontos)}</td><td>${money(h.liquido)}</td></tr>`).join("")
      );
    const recalc = () => {
      document.getElementById("liq").value = (Number(document.getElementById("bruto").value || 0) - Number(document.getElementById("desc").value || 0)).toFixed(2);
    };
    document.getElementById("bruto").oninput = recalc;
    document.getElementById("desc").oninput = recalc;
    bindRpc("f", "m", "gerar_holerite", (fd) => ({
      p_funcionario_id: fd.funcionario_id,
      p_competencia: fd.competencia,
      p_bruto: Number(fd.bruto),
      p_descontos: Number(fd.descontos || 0)
    }), holerite);
  }

  window.SysCanaCore.startRouter({
    "/folha/registro": folhaRegistro,
    "/folha/lista": folhaLista,
    "/folha/holerite": holerite
  }, "/folha/holerite");
})();
