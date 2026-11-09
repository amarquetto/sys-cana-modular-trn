(() => {
  const { sb, money, title, list, setor, link } = window.SysCanaCore;
  const view = document.getElementById("view");

  function mod(name, href, desc) {
    return `<a class="card module" href="${link(href)}"><h3>${name}</h3><p class="muted">${desc}</p></a>`;
  }

  async function home() {
    const [produtos, sols, fats, rec, pag, ops] = await Promise.all([
      list("produtos", "nome"),
      sb.from("solicitacoes").select("status"),
      sb.from("faturas").select("valor_total,natureza_operacao"),
      sb.from("contas_receber").select("valor,status"),
      sb.from("contas_pagar").select("valor,status"),
      sb.from("producoes").select("status").not("contrato_id", "is", null)
    ]);
    const opsAbertas = (ops.data || []).filter((o) => o.status === "EM PROGRESSO").length;
    const baixo = produtos.filter((p) => Number(p.qtd_minima || 0) > 0 && Number(p.quantidade_estoque) <= Number(p.qtd_minima || 0)).length;
    const vendas = (fats.data || []).filter((f) => String(f.natureza_operacao || "").includes("Venda")).reduce((s, f) => s + Number(f.valor_total), 0);
    const aRec = (rec.data || []).filter((r) => r.status === "Aberto").reduce((s, r) => s + Number(r.valor), 0);
    const aPag = (pag.data || []).filter((r) => r.status === "Aberto").reduce((s, r) => s + Number(r.valor), 0);
    const waitFin = (sols.data || []).filter((s) => s.status === "AguardandoFinanceiro").length;
    const role = setor().role;
    const dicas = {
      admin: "Acesso total aos 7 módulos. Os e-mails de setor vêem só a área deles e as consultas do fluxo.",
      financeiro: "Aprove compras e baixe títulos. Consulte o andamento das solicitações e as notas.",
      compras: "Cote, emita pedido e receba. Consulte o estoque para saber se precisa comprar.",
      pcp: "Contrato do Comercial vira ordem aqui: produza, informe toneladas e ATR e dê baixa para enviar ao Financeiro.",
      comercial: "Cadastre o contrato de cana (cliente, preço do ATR, entrega e toneladas): ele vira ordem no PCP automaticamente. A cana não passa pelo estoque.",
      folha: "Holerite gera conta a pagar. Consulte se o Financeiro já baixou o salário.",
      estoque: "Saldos e ajustes. Veja compras a chegar e produções que movimentam o estoque.",
      faturamento: "Emita as NFs (cana, serviços, devoluções). Consulte os contratos entregues. A NF de compra nasce no recebimento de Compras."
    };
    const cards = {
      admin: [
        mod("1. Financeiro", "/fin/caixa", waitFin ? waitFin + " para aprovar" : "Caixa e títulos"),
        mod("2. PCP", "/pcp/ordens", opsAbertas ? opsAbertas + " contrato(s) p/ produzir" : "Produção e insumos"),
        mod("3. Compras", "/compras/solicitacoes", "Pipeline"),
        mod("4. Comercial", "/com/pedidos", "Contratos de cana"),
        mod("5. Folha", "/folha/holerite", "Holerite"),
        mod("6. Estoque", "/estoque", baixo + " no mínimo"),
        mod("7. Faturamento", "/fat/notas", "Notas fiscais")
      ],
      financeiro: [
        mod("Aprovar compras", "/fin/aprovacoes", waitFin + " na fila"),
        mod("Fluxo de caixa", "/fin/caixa", "Realizado"),
        mod("A pagar", "/fin/pagar", money(aPag)),
        mod("A receber", "/fin/receber", money(aRec))
      ],
      pcp: [
        mod("Ordens de contrato", "/pcp/ordens", opsAbertas + " aguardando entrega"),
        mod("Pedir insumo", "/pcp/requisicao", "Vai para Compras"),
        mod("Produções", "/pcp/lista", "Concluir movimenta estoque"),
        mod("Estoque", "/estoque", baixo + " no mínimo"),
        mod("Status da compra", "/compras/solicitacoes", "Cotação e aprovação")
      ],
      compras: [
        mod("Pipeline", "/compras/solicitacoes", "Cotar e emitir"),
        mod("Estoque", "/estoque", "Precisa comprar?"),
        mod("Estoque baixo", "/estoque/baixo", baixo + " item(ns)"),
        mod("Receber / NF", "/compras/pedidos", "Entra no estoque")
      ],
      comercial: [
        mod("Novo contrato", "/com/novo", "Cliente, ATR, entrega e t"),
        mod("Contratos", "/com/pedidos", "Produção e recebimento"),
        mod("A receber", "/fin/receber", money(aRec))
      ],
      folha: [
        mod("Holerite", "/folha/holerite", "Gera conta a pagar"),
        mod("Funcionários", "/folha/lista", "Cadastro"),
        mod("Salários no financeiro", "/fin/pagar", money(aPag))
      ],
      estoque: [
        mod("Saldos", "/estoque", baixo + " no mínimo"),
        mod("Histórico", "/estoque/movimentos", "Entradas e saídas"),
        mod("Compras a chegar", "/compras/pedidos", "Pedidos de compra"),
        mod("Produções", "/pcp/lista", "Colheita")
      ],
      faturamento: [
        mod("Emitir NF de cana", "/fat/emitir-especial", "Venda de cana / serviços"),
        mod("Contratos", "/com/pedidos", "Entregas e valores"),
        mod("Notas", "/fat/notas", "Entrada e saída"),
        mod("Alíquotas", "/fat/aliquotas", "Impostos"),
        mod("Relatórios", "/fat/relatorios", money(vendas))
      ]
    };
    view.innerHTML =
      title("Painel — " + setor().nome) +
      `<p class="help">${dicas[role] || dicas.admin}</p>
      <div class="grid grid-6">${(cards[role] || cards.admin).join("")}</div>
      ${
        role === "admin"
          ? `<div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="muted">Vendas faturadas</div><div class="kpi">${money(vendas)}</div></div>
        <div class="card"><div class="muted">A receber</div><div class="kpi">${money(aRec)}</div></div>
        <div class="card"><div class="muted">A pagar</div><div class="kpi">${money(aPag)}</div></div>
        <div class="card"><div class="muted">Estoque baixo</div><div class="kpi">${baixo}</div></div>
      </div>`
          : ""
      }`;
  }

  window.SysCanaCore.startRouter({ "/home": home }, "/home");
})();
