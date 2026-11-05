/**
 * core.js
 * Núcleo compartilhado por TODOS os módulos (financeiro.html, pcp.html, compras.html,
 * comercial.html, folha.html, estoque.html, faturamento.html, home.html).
 *
 * Cada página carrega, nesta ordem:
 *   supabase-js (CDN) -> config.js -> roles.js -> core.js -> <modulo>.js
 *
 * core.js expõe tudo em window.SysCanaCore para os arquivos de módulo usarem.
 */
(() => {
  const cfg = window.SYSCANA || {};
  let supabaseUrl = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1$/i, "").replace(/\/auth\/v1$/i, "");
  const sb = window.supabase.createClient(supabaseUrl, cfg.supabaseAnonKey);

  // Mapa: prefixo da rota -> página (arquivo html) que a implementa.
  // Usado por link() para que QUALQUER link, dentro do mesmo módulo ou
  // apontando para outro módulo (as antigas "Consultas"), funcione igual.
  const PAGE_BY_PREFIX = {
    home: "home.html",
    fin: "financeiro.html",
    pcp: "pcp.html",
    compras: "compras.html",
    com: "comercial.html",
    folha: "folha.html",
    estoque: "estoque.html",
    fat: "faturamento.html"
  };

  function link(path) {
    const seg = path.replace(/^\//, "").split("/")[0];
    const page = PAGE_BY_PREFIX[seg] || "home.html";
    return page + "#" + path;
  }

  // Estrutura do menu (equivalente ao sidebar do antigo app.html),
  // só que agora cada link já resolve para a página correta via link().
  const NAV = [
    {
      allow: "financeiro",
      title: "Financeiro",
      links: [
        ["/fin/caixa", "Fluxo de caixa"],
        ["/fin/aprovacoes", "Aprovar compras"],
        ["/fin/pagar", "Contas a pagar"],
        ["/fin/pagar-baixa", "Baixa a pagar"],
        ["/fin/receber", "Contas a receber"],
        ["/fin/receber-baixa", "Baixa a receber"],
        ["/fin/contabil", "Lançamentos contábeis"]
      ],
      consultas: [
        ["/compras/solicitacoes", "Status das compras"],
        ["/fat/notas", "Notas fiscais"],
        ["/fat/relatorios", "Relatório de faturamento"]
      ]
    },
    {
      allow: "pcp",
      title: "PCP",
      links: [
        ["/pcp/requisicao", "Pedir insumo"],
        ["/pcp/cana", "Cana"],
        ["/pcp/insumos", "Insumos"],
        ["/pcp/talhoes", "Talhões"],
        ["/pcp/variedades", "Variedades"],
        ["/pcp/producao", "Ordem de produção"],
        ["/pcp/lista", "Produções"]
      ],
      consultas: [
        ["/estoque", "Saldos de estoque"],
        ["/estoque/baixo", "Estoque baixo"],
        ["/compras/solicitacoes", "Status da compra"]
      ]
    },
    {
      allow: "compras",
      title: "Compras",
      links: [
        ["/compras/fornecedores", "Fornecedores"],
        ["/compras/solicitacao", "Nova solicitação"],
        ["/compras/solicitacoes", "Pipeline"],
        ["/compras/pedidos", "Pedidos de compra"]
      ],
      consultas: [
        ["/estoque", "Saldos (precisa comprar?)"],
        ["/estoque/baixo", "Estoque baixo"],
        ["/estoque/movimentos", "Histórico de estoque"],
        ["/fat/notas", "NFs de entrada"]
      ]
    },
    {
      allow: "comercial",
      title: "Comercial",
      links: [
        ["/com/clientes", "Clientes"],
        ["/com/novo", "Pedido de venda"],
        ["/com/pedidos", "Pedidos de venda"]
      ],
      consultas: [
        ["/estoque", "Estoque de cana"],
        ["/fat/notas", "Notas faturadas"],
        ["/fin/receber", "Duplicatas a receber"]
      ]
    },
    {
      allow: "folha",
      title: "Folha",
      links: [
        ["/folha/registro", "Funcionário"],
        ["/folha/lista", "Lista"],
        ["/folha/holerite", "Holerite"]
      ],
      consultas: [["/fin/pagar", "Salários no financeiro"]]
    },
    {
      allow: "estoque",
      title: "Estoque",
      links: [
        ["/estoque/cadastro", "Cadastro"],
        ["/estoque", "Saldos"],
        ["/estoque/entrada", "Entrada avulsa"],
        ["/estoque/saida", "Saída avulsa"],
        ["/estoque/movimentos", "Histórico"],
        ["/estoque/baixo", "Estoque baixo"],
        ["/estoque/abc", "Curva ABC"],
        ["/estoque/inventario", "Inventário"]
      ],
      consultas: [
        ["/compras/pedidos", "Compras a receber"],
        ["/pcp/lista", "Produções (entrada de cana)"]
      ]
    },
    {
      allow: "faturamento",
      title: "Faturamento",
      links: [
        ["/fat/notas", "Notas fiscais"],
        ["/com/pedidos", "Faturar pedidos de venda"],
        ["/fat/aliquotas", "Alíquotas"],
        ["/fat/relatorios", "Relatórios"],
        ["/fat/config", "Configurações"]
      ],
      consultas: [
        ["/com/clientes", "Clientes"],
        ["/compras/pedidos", "Pedidos de compra / NF entrada"]
      ]
    }
  ];

  // ---------- Formatação ----------
  const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  const dbr = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
  const esc = (s) =>
    String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  function flash(kind, text) {
    return `<div class="flash ${kind}">${esc(text)}</div>`;
  }
  function title(t, extra = "") {
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <h2 class="page-title">${esc(t)}</h2>${extra}</div>`;
  }
  function options(rows, valueKey, labelKey, selected) {
    return (rows || [])
      .map((r) => `<option value="${r[valueKey]}" ${String(r[valueKey]) === String(selected || "") ? "selected" : ""}>${esc(r[labelKey])}</option>`)
      .join("");
  }
  function table(headers, rowsHtml) {
    return `<div class="card table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
      rowsHtml || `<tr><td colspan="${headers.length}" class="muted">Nenhum registro.</td></tr>`
    }</tbody></table></div>`;
  }
  function chip(status) {
    const map = {
      Aberta: "info",
      EmCotacao: "wait",
      AguardandoFinanceiro: "wait",
      Aprovada: "ok",
      PedidoEmitido: "info",
      Atendida: "ok",
      Reprovada: "bad",
      Aberto: "wait",
      Faturado: "ok",
      Recebido: "ok",
      Pago: "ok",
      Pendente: "wait",
      "EM PROGRESSO": "wait",
      CONCLUIDO: "ok",
      ENCERRADA: "bad",
      Ativo: "ok",
      Demitido: "bad"
    };
    return `<span class="chip ${map[status] || ""}">${esc(status)}</span>`;
  }
  function param(name) {
    const h = location.hash;
    const i = h.indexOf("?");
    if (i < 0) return "";
    return new URLSearchParams(h.slice(i + 1)).get(name) || "";
  }
  function bindRpc(formId, msgId, fn, argsFn, after) {
    document.getElementById(formId).onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { error } = await sb.rpc(fn, argsFn(fd));
      document.getElementById(msgId).innerHTML = error ? flash("err", error.message) : flash("ok", "Concluído.");
      if (!error && after) after();
    };
  }

  // ---------- Sessão / permissões ----------
  let SESSION_EMAIL = "";
  function setor() {
    return window.SysCanaAuth.info(SESSION_EMAIL);
  }
  function canWrite(path) {
    return window.SysCanaAuth.canWrite(SESSION_EMAIL, path);
  }
  async function list(tableName, order = "created_at") {
    const { data, error } = await sb.from(tableName).select("*").order(order, { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function renderSidebar(role) {
    const el = document.getElementById("sidebar");
    if (!el) return;
    const groups = NAV.map((g) => {
      const show = role === "admin" || g.allow === role;
      const subs = g.links.map(([href, label]) => `<a class="sub" href="${link(href)}">${esc(label)}</a>`).join("");
      const consultas = g.consultas
        ? `<div class="nav-mini">Consultas</div>` + g.consultas.map(([href, label]) => `<a class="sub" href="${link(href)}">${esc(label)}</a>`).join("")
        : "";
      return `<details class="nav-group" data-allow="${g.allow}" ${show ? "open" : "hidden"}>
        <summary>${esc(g.title)}</summary>${subs}${consultas}
      </details>`;
    }).join("");
    el.innerHTML = `
      <div class="brand">
        <div class="brand-mark">SC</div>
        <div><h1>SysCana</h1><small id="setorLabel">Setor</small></div>
      </div>
      <a class="nav-link" href="${link("/home")}">Página inicial</a>
      <hr style="border-color:rgba(232,212,139,.2)" />
      ${groups}`;
  }

  async function requireSession() {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      location.href = "index.html";
      return null;
    }
    SESSION_EMAIL = data.session.user.email || "";
    const role = setor().role;
    renderSidebar(role);
    const inf = setor();
    document.getElementById("userLabel").textContent = inf.email;
    document.getElementById("setorBadge").textContent = inf.nome;
    const setorLabelEl = document.getElementById("setorLabel");
    if (setorLabelEl) setorLabelEl.textContent = inf.nome;
    return data.session;
  }

  /**
   * Motor de rota genérico. Cada página (financeiro.js, pcp.js, ...) chama
   * SysCanaCore.startRouter(routes) passando SÓ as rotas daquele módulo.
   * O botão "Voltar" / links de "Consultas" para outro módulo funcionam
   * porque link() já monta a página certa — o navegador faz um load normal.
   */
  function startRouter(routes, defaultRoute = "/home") {
    const view = document.getElementById("view");
    async function render() {
      const session = await requireSession();
      if (!session) return;
      const raw = (location.hash.replace("#", "") || defaultRoute).split("?")[0];
      document.querySelectorAll(".nav-link,.sub").forEach((a) => {
        a.classList.toggle("active", a.getAttribute("href") === link(raw));
      });
      if (!window.SysCanaAuth.can(SESSION_EMAIL, raw)) {
        view.innerHTML =
          title("Acesso restrito") +
          `<div class="card">${flash("err", "O setor " + setor().nome + " não acessa esta tela.")}</div>`;
        return;
      }
      const fn = routes[raw];
      if (!fn) {
        // Rota não pertence a este módulo: manda para a página certa.
        location.href = link(raw);
        return;
      }
      view.innerHTML = `<div class="card">Carregando…</div>`;
      try {
        await fn();
      } catch (err) {
        view.innerHTML = title("Erro") + `<div class="card">${flash("err", err.message || String(err))}</div>`;
      }
    }
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn)
      logoutBtn.onclick = async () => {
        await sb.auth.signOut();
        location.href = "index.html";
      };
    window.addEventListener("hashchange", render);
    render();
  }

  window.SysCanaCore = {
    sb,
    view: null, // preenchido lazy abaixo (mantido por compat, use document.getElementById("view"))
    link,
    money,
    num,
    dbr,
    esc,
    flash,
    title,
    options,
    table,
    chip,
    param,
    bindRpc,
    list,
    setor,
    canWrite,
    requireSession,
    startRouter,
    get sbView() {
      return document.getElementById("view");
    }
  };
})();
