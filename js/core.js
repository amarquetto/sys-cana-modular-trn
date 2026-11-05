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
  // Mostra uma mensagem clara em vez de deixar a tela em branco.
  function fatal(titulo, detalhe) {
    const box = document.createElement("div");
    box.className = "fatal";
    box.innerHTML = `<h2>${titulo}</h2><p>${detalhe}</p>
      <p><a class="btn small" href="index.html">Voltar ao login</a></p>`;
    document.body.innerHTML = "";
    document.body.appendChild(box);
  }

  const cfg = window.SYSCANA || {};
  let supabaseUrl = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1$/i, "").replace(/\/auth\/v1$/i, "");

  if (!window.supabase || !window.supabase.createClient) {
    fatal("Não foi possível carregar o Supabase",
      "A biblioteca <code>supabase-js</code> não carregou (internet bloqueada ou CDN fora do ar). Recarregue a página.");
    return;
  }
  if (!window.SysCanaAuth) {
    fatal("Arquivo de permissões ausente",
      "O <code>js/roles.js</code> não carregou ou está incorreto (precisa definir <code>window.SysCanaAuth</code>).");
    return;
  }
  if (!supabaseUrl || !cfg.supabaseAnonKey) {
    fatal("Supabase não configurado",
      "Preencha <code>supabaseUrl</code> e <code>supabaseAnonKey</code> em <code>js/config.js</code>.");
    return;
  }
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
        ["/pcp/ordens", "Ordens de contrato"],
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
        ["/com/novo", "Novo contrato de cana"],
        ["/com/pedidos", "Contratos"]
      ],
      consultas: [
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
        ["/com/pedidos", "Contratos de cana"],
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
  function flashHtml(kind, html) {
    return `<div class="flash ${kind}">${html}</div>`;
  }
  const ICON_EDIT =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
  const ICON_DEL =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
  function crudIcons(id) {
    return `<button class="icon-btn" type="button" title="Editar" data-edit="${id}">${ICON_EDIT}</button>
      <button class="icon-btn" type="button" title="Excluir" data-del="${id}">${ICON_DEL}</button>`;
  }
  function actionButtons(id) {
    return `<td class="actions">${crudIcons(id)}</td>`;
  }
  function openFormModal(heading, fieldsHtml, onSubmit) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${esc(heading)}</h3>
        <form id="edit-form" class="grid grid-2">${fieldsHtml}
          <div id="edit-m" style="grid-column:1/-1"></div>
          <div class="modal-actions" style="grid-column:1/-1">
            <button type="button" class="btn btn-secondary" id="edit-cancel">Cancelar</button>
            <button type="submit" class="btn">Salvar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#edit-cancel").onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
    overlay.querySelector("#edit-form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const msgEl = overlay.querySelector("#edit-m");
      const ok = await onSubmit(fd, msgEl);
      if (ok) overlay.remove();
    };
    return overlay;
  }
  function bindCrud(root, rows, { onEdit, onDelete, confirmMsg }) {
    root.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => onEdit(rows.find((r) => String(r.id) === String(btn.dataset.edit)));
    });
    root.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm(confirmMsg || "Excluir este registro?")) return;
        await onDelete(btn.dataset.del);
      };
    });
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
      CANCELADO: "bad",
      Cancelado: "bad",
      "Em Produção": "wait",
      "Aguardando Recebimento": "info",
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
    // created_at: mais recentes primeiro; demais campos (nome etc.): ordem alfabética.
    const { data, error } = await sb.from(tableName).select("*").order(order, { ascending: order !== "created_at" });
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
      return `<details class="nav-group" data-allow="${g.allow}" ${show ? "" : "hidden"}>
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

  // Marca o item ativo e abre o grupo certo (o do setor, ou o da tela atual).
  function syncSidebar(role, raw) {
    const here = link(raw);
    document.querySelectorAll(".nav-link,.sub").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === here);
    });
    // Admin: abre só o primeiro grupo que contém a tela atual (vários grupos repetem links de consulta).
    let abriu = false;
    document.querySelectorAll(".nav-group").forEach((d) => {
      if (d.hidden) return;
      const hasActive = !!d.querySelector(".sub.active");
      if (role !== "admin" && d.dataset.allow === role) d.open = true;
      else if (hasActive && !abriu) { d.open = true; abriu = true; }
    });
  }

  let SESSION = null;
  let sidebarReady = false;
  async function requireSession() {
    if (SESSION) return SESSION;
    const { data, error } = await sb.auth.getSession();
    if (error || !data || !data.session) {
      location.href = "index.html";
      return null;
    }
    SESSION = data.session;
    SESSION_EMAIL = SESSION.user.email || "";
    const inf = setor();
    if (!sidebarReady) {
      renderSidebar(inf.role);
      sidebarReady = true;
    }
    const userEl = document.getElementById("userLabel");
    if (userEl) userEl.textContent = inf.email;
    const badge = document.getElementById("setorBadge");
    if (badge) badge.textContent = inf.nome;
    const setorLabelEl = document.getElementById("setorLabel");
    if (setorLabelEl) setorLabelEl.textContent = inf.nome;
    return SESSION;
  }

  // Menu lateral no celular
  function bindMenuToggle() {
    const btn = document.getElementById("menuBtn");
    if (btn) btn.onclick = () => document.body.classList.toggle("nav-open");
    document.addEventListener("click", (e) => {
      if (!document.body.classList.contains("nav-open")) return;
      if (e.target.closest(".sub, .nav-link") || (!e.target.closest(".sidebar") && !e.target.closest("#menuBtn"))) {
        document.body.classList.remove("nav-open");
      }
    });
  }

  /**
   * Motor de rota genérico. Cada página (financeiro.js, pcp.js, ...) chama
   * SysCanaCore.startRouter(routes) passando SÓ as rotas daquele módulo.
   * Links de "Consultas" para outro módulo funcionam porque link() já monta
   * a página certa — o navegador faz um load normal.
   */
  function startRouter(routes, defaultRoute = "/home") {
    const view = document.getElementById("view");
    async function render() {
      let session;
      try {
        session = await requireSession();
      } catch (err) {
        view.innerHTML = title("Erro") + `<div class="card">${flash("err", err.message || String(err))}</div>`;
        return;
      }
      if (!session) return;
      document.body.classList.remove("nav-open");
      const raw = (location.hash.replace("#", "") || defaultRoute).split("?")[0];
      syncSidebar(setor().role, raw);
      if (!window.SysCanaAuth.can(SESSION_EMAIL, raw)) {
        view.innerHTML =
          title("Acesso restrito") +
          `<div class="card">${flash("err", "O setor " + setor().nome + " não acessa esta tela.")}
           <a class="btn small" href="${link("/home")}">Ir para a página inicial</a></div>`;
        return;
      }
      const fn = routes[raw];
      if (!fn) {
        // Rota não pertence a este módulo: manda para a página certa
        // (compara sem ".html", pois o Vercel usa cleanUrls: /estoque).
        const stripHtml = (x) => x.replace(/\.html$/i, "");
        const paginaAtual = stripHtml(location.pathname.split("/").pop() || "index");
        const paginaDestino = stripHtml(link(raw).split("#")[0]);
        if (paginaDestino !== paginaAtual) location.href = link(raw);
        else location.hash = "#" + defaultRoute; // rota inexistente neste módulo
        return;
      }
      view.innerHTML = `<div class="card loading">Carregando…</div>`;
      try {
        await fn();
        window.scrollTo(0, 0);
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
    bindMenuToggle();
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
    flashHtml,
    crudIcons,
    actionButtons,
    openFormModal,
    bindCrud,
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
