(() => {
  const { sb, money, esc, flash, title, table, chip, dbr, canWrite, openFormModal } = window.SysCanaCore;
  const view = document.getElementById("view");

  // ------------------------------------------------------------------ utilidades
  const ymLocal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const hojeLocal = () => ymLocal() + "-" + String(new Date().getDate()).padStart(2, "0");
  const mesBr = (iso) => String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4);
  const num2 = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // CPF: mesma regra do banco (11 dígitos, dígitos verificadores, não aceita 111.111.111-11)
  function cpfValido(v) {
    const d = String(v || "").replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (const n of [9, 10]) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const dv = ((s * 10) % 11) % 10;
      if (dv !== Number(d[n])) return false;
    }
    return true;
  }
  function mascaraCpf(el) {
    el.addEventListener("input", () => {
      const d = el.value.replace(/\D/g, "").slice(0, 11);
      el.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    });
  }
  async function carregarCargos() {
    const { data, error } = await sb.from("cargos").select("nome").order("nome");
    if (error) throw new Error("Não foi possível carregar a lista de cargos. Rode a migração migracao_folha.sql. (" + error.message + ")");
    return (data || []).map((c) => c.nome);
  }
  const optCargos = (lista, atual) =>
    `<option value="">Selecione o cargo…</option>` +
    (atual && !lista.includes(atual) ? `<option value="${esc(atual)}" selected>${esc(atual)}</option>` : "") +
    lista.map((c) => `<option value="${esc(c)}" ${c === atual ? "selected" : ""}>${esc(c)}</option>`).join("");

  // "+ Novo cargo": cadastra o cargo na lista e já seleciona
  async function novoCargo(selectEl, msgEl) {
    const nome = (prompt("Nome do novo cargo:") || "").trim();
    if (!nome) return;
    const { error } = await sb.from("cargos").insert({ nome });
    if (error) {
      msgEl.innerHTML = flash("err", error.code === "23505" ? "Esse cargo já existe na lista." : error.message);
      return;
    }
    const o = document.createElement("option");
    o.value = nome;
    o.textContent = nome;
    selectEl.appendChild(o);
    selectEl.value = nome;
  }

  // ------------------------------------------------------------------ funcionário (cadastro)
  async function folhaRegistro() {
    const cargos = await carregarCargos();
    view.innerHTML =
      title("Funcionário") +
      `<div class="card"><p class="help" style="margin-top:0">Todos os campos são obrigatórios, exceto a admissão. O <b>salário bruto</b> cadastrado aqui é o que o holerite usa automaticamente.</p>
      <form id="f" class="grid grid-2" novalidate>
        <div class="field"><label>Nome completo</label><input name="nome" required minlength="3" autocomplete="off" /></div>
        <div class="field"><label>CPF</label><input name="cpf" id="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off" /></div>
        <div class="field"><label>Cargo</label>
          <div style="display:flex;gap:8px"><select name="cargo" id="cargo" required style="flex:1">${optCargos(cargos)}</select>
          <button class="btn small ghost" type="button" id="novo-cargo" title="Cadastrar um cargo que não está na lista">+ Novo cargo</button></div></div>
        <div class="field"><label>Salário bruto mensal (R$)</label><input type="number" step="0.01" min="0.01" name="salario" required placeholder="0,00" /></div>
        <div class="field"><label>Admissão</label><input type="date" name="admissao" max="${hojeLocal()}" /></div>
        <div><button class="btn" type="submit">Cadastrar funcionário</button></div>
      </form><div id="m"></div></div>`;
    mascaraCpf(document.getElementById("cpf"));
    const msg = document.getElementById("m");
    document.getElementById("novo-cargo").onclick = () => novoCargo(document.getElementById("cargo"), msg);
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (String(fd.nome || "").trim().length < 3) return (msg.innerHTML = flash("err", "Informe o nome completo."));
      if (!cpfValido(fd.cpf)) return (msg.innerHTML = flash("err", "CPF inválido. Confira os 11 dígitos."));
      if (!fd.cargo) return (msg.innerHTML = flash("err", "Selecione um cargo da lista."));
      if (!(Number(fd.salario) > 0)) return (msg.innerHTML = flash("err", "Informe um salário maior que zero."));
      const { error } = await sb.from("funcionarios").insert({
        nome: fd.nome.trim(),
        cpf: fd.cpf,
        cargo: fd.cargo,
        salario: Number(fd.salario),
        admissao: fd.admissao || null
      });
      if (error) {
        msg.innerHTML = flash("err", error.code === "23505" ? "Já existe um funcionário com este CPF." : error.message);
        return;
      }
      location.hash = "#/folha/lista";
    };
  }

  // ------------------------------------------------------------------ funcionários (lista, editar, inativar)
  async function folhaLista() {
    const { data, error } = await sb.from("funcionarios").select("*").order("nome");
    if (error) throw error;
    const rows = data || [];
    const pode = canWrite("/folha/lista");
    view.innerHTML =
      title("Funcionários") +
      `<div class="card"><form class="grid grid-2" onsubmit="return false"><div class="field"><label>Mostrar</label>
        <select id="fl-st"><option value="Ativo">Somente ativos</option><option value="Inativo">Inativos</option><option value="Demitido">Demitidos</option><option value="">Todos</option></select></div>
        <div class="field"><label>Buscar por nome ou CPF</label><input id="fl-q" placeholder="Digite para filtrar" /></div></form></div>
      <div id="fl-tabela"></div>`;
    const desenhar = () => {
      const st = document.getElementById("fl-st").value;
      const q = document.getElementById("fl-q").value.trim().toLowerCase();
      const qDig = q.replace(/\D/g, "");
      const f = rows.filter(
        (r) => (!st || r.status === st) && (!q || String(r.nome).toLowerCase().includes(q) || (qDig && String(r.cpf || "").replace(/\D/g, "").includes(qDig)))
      );
      document.getElementById("fl-tabela").innerHTML = table(
        ["Nome", "CPF", "Cargo", "Salário bruto", "Admissão", "Situação", "Ações"],
        f
          .map(
            (r) => `<tr${r.status !== "Ativo" ? ' style="opacity:.7"' : ""}><td>${esc(r.nome)}</td><td>${esc(r.cpf || "—")}</td><td>${esc(r.cargo || "—")}</td><td>${money(r.salario)}</td>
              <td>${r.admissao ? dbr(r.admissao) : "—"}</td><td>${chip(r.status)}</td>
              <td class="actions">${
                pode
                  ? `<button class="btn small ghost" data-edit="${r.id}">Editar</button>` +
                    (r.status === "Ativo"
                      ? `<button class="btn small ghost" data-inativar="${r.id}">Inativar</button>`
                      : `<button class="btn small" data-reativar="${r.id}">Reativar</button>`)
                  : "—"
              }</td></tr>`
          )
          .join("") || `<tr><td colspan="7" class="muted">Nenhum funcionário neste filtro.</td></tr>`
      );
      document.querySelectorAll("#fl-tabela [data-inativar]").forEach((b) => {
        b.onclick = async () => {
          const r = rows.find((x) => x.id === b.dataset.inativar);
          if (!confirm(`Inativar ${r.nome}?\n\nEle deixa de aparecer para gerar holerites, mas todo o histórico (holerites e pagamentos) é mantido. Você pode reativar depois.`)) return;
          const { error: err } = await sb.from("funcionarios").update({ status: "Inativo" }).eq("id", r.id);
          if (err) alert(err.message);
          else folhaLista();
        };
      });
      document.querySelectorAll("#fl-tabela [data-reativar]").forEach((b) => {
        b.onclick = async () => {
          const { error: err } = await sb.from("funcionarios").update({ status: "Ativo" }).eq("id", b.dataset.reativar);
          if (err) alert(err.message);
          else folhaLista();
        };
      });
      document.querySelectorAll("#fl-tabela [data-edit]").forEach((b) => {
        b.onclick = () => editar(rows.find((x) => x.id === b.dataset.edit));
      });
    };
    document.getElementById("fl-st").onchange = desenhar;
    document.getElementById("fl-q").oninput = desenhar;
    desenhar();
  }

  async function editar(f) {
    const cargos = await carregarCargos();
    const modal = openFormModal(
      "Editar funcionário",
      `<div class="field"><label>Nome completo</label><input name="nome" required minlength="3" value="${esc(f.nome || "")}" /></div>
       <div class="field"><label>CPF</label><input name="cpf" id="ed-cpf" required inputmode="numeric" maxlength="14" value="${esc(f.cpf || "")}" /></div>
       <div class="field"><label>Cargo</label><select name="cargo" required>${optCargos(cargos, f.cargo)}</select></div>
       <div class="field"><label>Salário bruto mensal (R$)</label><input type="number" step="0.01" min="0.01" name="salario" required value="${esc(f.salario ?? "")}" /></div>
       <div class="field"><label>Admissão</label><input type="date" name="admissao" max="${hojeLocal()}" value="${esc(f.admissao || "")}" /></div>
       <div class="field"><label>Situação</label><select name="status"><option ${f.status === "Ativo" ? "selected" : ""}>Ativo</option><option ${f.status === "Inativo" ? "selected" : ""}>Inativo</option><option ${f.status === "Demitido" ? "selected" : ""}>Demitido</option></select></div>`,
      async (fd, msgEl) => {
        if (fd.cpf !== f.cpf && !cpfValido(fd.cpf)) {
          msgEl.innerHTML = flash("err", "CPF inválido. Confira os 11 dígitos.");
          return false;
        }
        if (!(Number(fd.salario) > 0)) {
          msgEl.innerHTML = flash("err", "Informe um salário maior que zero.");
          return false;
        }
        const { error } = await sb
          .from("funcionarios")
          .update({ nome: fd.nome.trim(), cpf: fd.cpf, cargo: fd.cargo, salario: Number(fd.salario), admissao: fd.admissao || null, status: fd.status })
          .eq("id", f.id);
        if (error) {
          msgEl.innerHTML = flash("err", error.code === "23505" ? "Já existe um funcionário com este CPF." : error.message);
          return false;
        }
        folhaLista();
        return true;
      }
    );
    mascaraCpf(modal.querySelector("#ed-cpf"));
  }

  // ------------------------------------------------------------------ holerite
  let msgHolerite = null;

  async function holerite() {
    const [fRes, hRes] = await Promise.all([
      sb.from("funcionarios").select("id,nome,cargo,status").eq("status", "Ativo").order("nome"),
      sb
        .from("holerites")
        .select("*, funcionarios(nome, cpf, cargo, admissao), contas_pagar(status, vencimento, pago_em)")
        .order("competencia", { ascending: false })
        .order("created_at", { ascending: false })
    ]);
    if (fRes.error) throw fRes.error;
    if (hRes.error) throw new Error("Não foi possível ler os holerites. Rode a migração migracao_folha.sql. (" + hRes.error.message + ")");
    const funcs = fRes.data || [];
    const hol = hRes.data || [];
    const pode = canWrite("/folha/holerite");
    const meses = [...new Set(hol.map((h) => String(h.competencia).slice(0, 7)))].sort().reverse();
    const aviso = msgHolerite;
    msgHolerite = null;

    view.innerHTML =
      title("Holerite") +
      (aviso ? aviso : "") +
      (pode
        ? `<div class="card"><p class="help" style="margin-top:0">Escolha o funcionário e o mês. O <b>salário bruto vem do cadastro</b> e <b>INSS e IRRF são calculados automaticamente</b> pelas tabelas vigentes. Os campos abaixo são só de leitura.</p>
      <form id="f" class="grid grid-2" novalidate>
        <div class="field"><label>Funcionário</label><select name="funcionario_id" id="h-func" required><option value="">Selecione o funcionário…</option>${funcs.map((f) => `<option value="${f.id}">${esc(f.nome)}${f.cargo ? " — " + esc(f.cargo) : ""}</option>`).join("")}</select></div>
        <div class="field"><label>Competência (mês/ano)</label><input type="month" name="competencia" id="h-comp" required max="${ymLocal()}" value="${ymLocal()}" /></div>
        <div class="field"><label>Salário bruto (do cadastro)</label><input id="h-bruto" class="locked" readonly tabindex="-1" placeholder="—" /></div>
        <div class="field"><label>INSS</label><input id="h-inss" class="locked" readonly tabindex="-1" placeholder="—" /></div>
        <div class="field"><label>IRRF</label><input id="h-irrf" class="locked" readonly tabindex="-1" placeholder="—" /></div>
        <div class="field"><label>Total de descontos</label><input id="h-desc" class="locked" readonly tabindex="-1" placeholder="—" /></div>
        <div class="field"><label>Líquido a receber (bruto − descontos)</label><input id="h-liq" class="locked destaque" readonly tabindex="-1" placeholder="—" /></div>
        <div style="align-self:end"><button class="btn" type="submit" id="h-ok" disabled>Gerar e enviar ao Financeiro</button></div>
      </form><div id="m"></div></div>`
        : `<p class="help">Somente consulta.</p>`) +
      `<div class="card" style="margin-top:16px"><form class="grid grid-2" onsubmit="return false">
          <div class="field"><label>Competência</label><select id="l-mes"><option value="">Todas</option>${meses.map((m) => `<option value="${m}">${mesBr(m)}</option>`).join("")}</select></div>
          <div style="align-self:end"><button class="btn gold" type="button" id="pdf-mes" disabled>Baixar PDF do mês (todos)</button></div>
        </form></div>
      <div id="l-tabela"></div>`;

    // --- prévia automática
    if (pode) {
      const $ = (id) => document.getElementById(id);
      const limpar = () => ["h-bruto", "h-inss", "h-irrf", "h-desc", "h-liq"].forEach((id) => ($(id).value = ""));
      let seq = 0;
      const simular = async () => {
        const fid = $("h-func").value;
        const comp = $("h-comp").value;
        const msg = $("m");
        $("h-ok").disabled = true;
        msg.innerHTML = "";
        if (!fid || !comp) return limpar();
        const mine = ++seq;
        const { data, error } = await sb.rpc("folha_simular", { p_funcionario_id: fid, p_competencia: comp + "-01" });
        if (mine !== seq) return; // resposta antiga
        if (error) {
          limpar();
          msg.innerHTML = flash("err", error.message);
          return;
        }
        $("h-bruto").value = money(data.bruto);
        $("h-inss").value = money(data.inss);
        $("h-irrf").value = money(data.irrf);
        $("h-desc").value = money(data.descontos);
        $("h-liq").value = money(data.liquido);
        if (data.aviso) msg.innerHTML = flash("err", data.aviso);
        else $("h-ok").disabled = false;
      };
      $("h-func").onchange = simular;
      $("h-comp").onchange = simular;
      $("h-comp").oninput = simular;
      $("f").onsubmit = async (e) => {
        e.preventDefault();
        const fid = $("h-func").value;
        const comp = $("h-comp").value;
        if (!fid || !comp) return ($("m").innerHTML = flash("err", "Selecione o funcionário e a competência."));
        if (comp > ymLocal()) return ($("m").innerHTML = flash("err", "Não é permitido gerar holerite de mês futuro."));
        $("h-ok").disabled = true;
        const { error } = await sb.rpc("gerar_holerite", { p_funcionario_id: fid, p_competencia: comp + "-01" });
        if (error) {
          $("m").innerHTML = flash("err", error.message);
          $("h-ok").disabled = false;
          return;
        }
        msgHolerite = flash("ok", "Holerite gerado. A conta a pagar foi enviada ao Financeiro (Salários).");
        holerite();
      };
    }

    // --- lista + PDF
    const desenhar = () => {
      const mes = document.getElementById("l-mes").value;
      const f = hol.filter((h) => !mes || String(h.competencia).startsWith(mes));
      document.getElementById("pdf-mes").disabled = !mes || !f.length;
      document.getElementById("l-tabela").innerHTML = table(
        ["Competência", "Funcionário", "Bruto", "INSS", "IRRF", "Descontos", "Líquido", "Pagamento", "PDF"],
        f
          .map((h) => {
            const cp = Array.isArray(h.contas_pagar) ? h.contas_pagar[0] : h.contas_pagar;
            return `<tr><td>${mesBr(h.competencia)}</td><td>${esc(h.funcionarios?.nome)}</td><td>${money(h.bruto)}</td><td>${money(h.inss)}</td><td>${money(h.irrf)}</td>
              <td>${money(h.descontos)}</td><td><b>${money(h.liquido)}</b></td><td>${cp ? chip(cp.status) : "—"}</td>
              <td><button class="btn small ghost" data-pdf="${h.id}">PDF</button></td></tr>`;
          })
          .join("") || `<tr><td colspan="9" class="muted">Nenhum holerite neste filtro.</td></tr>`
      );
      document.querySelectorAll("#l-tabela [data-pdf]").forEach((b) => {
        b.onclick = () => baixarPdf([hol.find((x) => x.id === b.dataset.pdf)]);
      });
    };
    document.getElementById("l-mes").onchange = desenhar;
    document.getElementById("pdf-mes").onclick = () => {
      const mes = document.getElementById("l-mes").value;
      baixarPdf(
        hol.filter((h) => String(h.competencia).startsWith(mes)).sort((a, b) => String(a.funcionarios?.nome).localeCompare(String(b.funcionarios?.nome))),
        mes
      );
    };
    desenhar();
  }

  // ------------------------------------------------------------------ PDF do holerite (jsPDF)
  async function baixarPdf(lista, mes) {
    if (!window.jspdf || !window.jspdf.jsPDF) return alert("A biblioteca de PDF não carregou. Recarregue a página (Ctrl+F5) e tente de novo.");
    const { data: emp } = await sb.from("config_faturamento").select("*").eq("id", 1).maybeSingle();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    lista.forEach((h, i) => {
      if (i > 0) doc.addPage();
      desenharHolerite(doc, h, emp || {});
    });
    const nome =
      lista.length === 1
        ? `Holerite_${String(lista[0].competencia).slice(5, 7)}-${String(lista[0].competencia).slice(0, 4)}_${String(lista[0].funcionarios?.nome || "funcionario").normalize("NFD").replace(/[^\w]+/g, "_")}.pdf`
        : `Holerites_${mes ? mesBr(mes + "-01").replace("/", "-") : "todos"}.pdf`;
    doc.save(nome);
  }

  function desenharHolerite(doc, h, emp) {
    const W = 210,
      M = 15;
    const f = h.funcionarios || {};
    const cp = Array.isArray(h.contas_pagar) ? h.contas_pagar[0] : h.contas_pagar;
    const bruto = Number(h.bruto),
      inss = Number(h.inss || 0),
      irrf = Number(h.irrf || 0),
      desc = Number(h.descontos || 0),
      liq = Number(h.liquido);
    const temDetalhe = inss + irrf > 0;
    const txt = (t, x, y, o = {}) => doc.text(String(t ?? ""), x, y, o);

    // faixa do topo
    doc.setFillColor(17, 48, 31);
    doc.rect(0, 0, W, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    txt(emp.razao_social || "SysCana Agroindústria", M, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const linha2 = [emp.cnpj ? "CNPJ " + emp.cnpj : "", emp.municipio ? emp.municipio + (emp.uf ? "/" + emp.uf : "") : ""].filter(Boolean).join("  |  ");
    if (linha2) txt(linha2, M, 17);
    if (emp.endereco) txt(emp.endereco, M, 21.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    txt("COMPETÊNCIA", W - M, 11, { align: "right" });
    doc.setFontSize(16);
    txt(mesBr(h.competencia), W - M, 20, { align: "right" });

    // título
    doc.setTextColor(17, 48, 31);
    doc.setFontSize(14);
    txt("RECIBO DE PAGAMENTO DE SALÁRIO", W / 2, 38, { align: "center" });

    // dados do funcionário
    doc.setDrawColor(200, 196, 178);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, 44, W - 2 * M, 30, 2, 2);
    doc.setTextColor(90, 100, 92);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    const rot = (t, x, y) => txt(t.toUpperCase(), x, y);
    rot("Funcionário", M + 4, 50);
    rot("CPF", M + 4, 60);
    rot("Cargo", 112, 50);
    rot("Admissão", 112, 60);
    doc.setTextColor(20, 30, 22);
    doc.setFontSize(10.5);
    txt(f.nome || "—", M + 4, 55);
    txt(f.cpf || "—", M + 4, 65);
    txt(f.cargo || "—", 112, 55);
    txt(f.admissao ? dbr(f.admissao) : "—", 112, 65);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    const sit = cp ? (cp.status === "Pago" ? "Pago em " + (cp.pago_em ? dbr(cp.pago_em) : "—") : "Pagamento previsto para " + dbr(cp.vencimento)) : "";
    if (sit) {
      doc.setTextColor(90, 100, 92);
      txt(sit, 112, 71);
    }

    // tabela de proventos e descontos
    let y = 84;
    doc.setFillColor(227, 240, 230);
    doc.rect(M, y - 5.5, W - 2 * M, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(17, 48, 31);
    txt("CÓD.", M + 2, y);
    txt("DESCRIÇÃO", M + 18, y);
    txt("REFERÊNCIA", 100, y);
    txt("PROVENTOS (R$)", 160, y, { align: "right" });
    txt("DESCONTOS (R$)", W - M - 2, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 30, 22);
    const linhas = [["001", "Salário base", "30 dias", num2(bruto), ""]];
    if (temDetalhe) {
      linhas.push(["901", "INSS (contribuição progressiva)", num2(bruto ? (inss / bruto) * 100 : 0) + "% (efetiva)", "", num2(inss)]);
      linhas.push(["902", "IRRF (imposto de renda na fonte)", irrf > 0 ? num2(bruto ? (irrf / bruto) * 100 : 0) + "% (efetiva)" : "Isento", "", num2(irrf)]);
    } else if (desc > 0) {
      linhas.push(["900", "Descontos", "", "", num2(desc)]);
    }
    linhas.forEach((l, i) => {
      y += 9;
      if (i % 2 === 1) {
        doc.setFillColor(248, 247, 241);
        doc.rect(M, y - 6, W - 2 * M, 8.5, "F");
      }
      txt(l[0], M + 2, y);
      txt(l[1], M + 18, y);
      doc.setTextColor(90, 100, 92);
      txt(l[2], 100, y);
      doc.setTextColor(20, 30, 22);
      txt(l[3], 160, y, { align: "right" });
      txt(l[4], W - M - 2, y, { align: "right" });
    });
    y += 7;
    doc.setDrawColor(200, 196, 178);
    doc.line(M, y, W - M, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    txt("Total de proventos", M + 18, y);
    txt(num2(bruto), 160, y, { align: "right" });
    y += 7;
    txt("Total de descontos", M + 18, y);
    txt(num2(desc), W - M - 2, y, { align: "right" });

    // líquido
    y += 10;
    doc.setFillColor(17, 48, 31);
    doc.roundedRect(M, y, W - 2 * M, 16, 2, 2, "F");
    doc.setTextColor(241, 227, 166);
    doc.setFontSize(10);
    txt("LÍQUIDO A RECEBER", M + 5, y + 10);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    txt("R$ " + num2(liq), W - M - 5, y + 10.5, { align: "right" });

    // observação
    y += 26;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 92);
    doc
      .splitTextToSize(
        "INSS e IRRF calculados automaticamente conforme as tabelas vigentes na competência (INSS progressivo; IRRF com desconto simplificado e redução da Lei 15.270/2025, quando aplicável). Valores estimados para fins de gestão: confirme com a contabilidade.",
        W - 2 * M
      )
      .forEach((l, i) => txt(l, M, y + i * 4));

    // assinatura
    y = 226;
    doc.setTextColor(20, 30, 22);
    doc.setFontSize(9);
    txt("Declaro ter recebido a importância líquida acima discriminada.", M, y);
    doc.setDrawColor(120, 128, 122);
    doc.line(M, y + 22, 100, y + 22);
    doc.line(120, y + 22, W - M, y + 22);
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 92);
    txt("Assinatura do funcionário", M, y + 27);
    txt("Data", 120, y + 27);

    // rodapé
    doc.setFontSize(7.5);
    const agora = new Date();
    txt(
      "Documento gerado pelo SysCana em " + agora.toLocaleDateString("pt-BR") + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      W / 2,
      288,
      { align: "center" }
    );
  }

  window.SysCanaCore.startRouter(
    {
      "/folha/registro": folhaRegistro,
      "/folha/lista": folhaLista,
      "/folha/holerite": holerite
    },
    "/folha/holerite"
  );
})();
