window.SysCanaAuth = {
  setores: {
    admin: { nome: "Administração", rotas: "*", write: "*" },
    financeiro: {
      nome: "Financeiro",
      rotas: ["/home", "/fin/*", "/compras/solicitacoes", "/fat/notas", "/fat/relatorios"],
      write: ["/fin/*"]
    },
    compras: {
      nome: "Compras",
      rotas: ["/home", "/compras/*", "/estoque", "/estoque/baixo", "/estoque/movimentos", "/fat/notas"],
      write: ["/compras/*"]
    },
    pcp: {
      nome: "PCP",
      rotas: ["/home", "/pcp/*", "/estoque", "/estoque/baixo", "/compras/solicitacoes"],
      write: ["/pcp/*"]
    },
    comercial: {
      nome: "Comercial",
      rotas: ["/home", "/com/clientes", "/com/novo", "/com/pedidos", "/fat/notas", "/fin/receber"],
      write: ["/com/clientes", "/com/novo", "/com/pedidos"]
    },
    folha: {
      nome: "Folha de pagamento",
      rotas: ["/home", "/folha/*", "/fin/salarios"],
      write: ["/folha/*"]
    },
    estoque: {
      nome: "Estoque",
      rotas: ["/home", "/estoque/*", "/compras/pedidos", "/pcp/lista"],
      write: ["/estoque/*"]
    },
    faturamento: {
      nome: "Faturamento",
      rotas: ["/home", "/fat/*", "/com/pedidos", "/com/clientes", "/compras/pedidos"],
      write: ["/fat/*"]
    }
  },
  roleFromEmail(email) {
    const local = String(email || "").split("@")[0].toLowerCase();
    if (local === "folhapgt") return "folha";
    if (this.setores[local]) return local;
    return "admin";
  },
  matches(list, path) {
    if (list === "*") return true;
    return (list || []).some((r) => {
      if (r.endsWith("/*")) {
        const base = r.slice(0, -2);
        return path === base || path.startsWith(base + "/");
      }
      return path === r;
    });
  },
  info(email) {
    const role = this.roleFromEmail(email);
    return { role, nome: this.setores[role].nome, email };
  },
  can(email, path) {
    return this.matches(this.setores[this.roleFromEmail(email)].rotas, path);
  },
  canWrite(email, path) {
    return this.matches(this.setores[this.roleFromEmail(email)].write, path);
  }
};
