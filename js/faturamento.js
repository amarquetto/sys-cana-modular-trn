(() => {
  const { sb, money, num, dbr, esc, flash, title, table, chip, canWrite, list, options } = window.SysCanaCore;
  const view = document.getElementById("view");
  const $ = (id) => document.getElementById(id);

  const badgeOperacao = (tipo, cat) => {
    if (tipo === "Devolucao_Insumo") {
      const cores = { Herbicida: "#e74c3c", Fungicida: "#e67e22", "Fertilizante / Adubo": "#27ae60", Inseticida: "#8e44ad" };
      return `<span class="chip" style="background:${cores[cat] || "#7f8c8d"}; color:#fff;">${esc(cat || "Devolução")}</span>`;
    }
    if (tipo === "Venda_Cana") return `<span class="chip" style="background:#2e6b38; color:#fff;">Venda Cana (Consecana)</span>`;
    return `<span class="chip info">NFS-e Serviço</span>`;
  };

  // 1. LISTAGEM DE NOTAS
  async function notas() {
    const { data, error } = await sb
      .from("faturas")
      .select("*, clientes(nome), fornecedores(nome_fantasia)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const podeEmitir = canWrite("/fat/notas");
    const atalhos = podeEmitir ? `<a class="btn small gold" href="#/fat/emitir-especial">+ Emitir Nota Fiscal</a>` : "";

    view.innerHTML =
      title("Notas Fiscais Emitidas", atalhos) +
      table(
        ["Nº NF", "Operação", "Pesagem / Laboratório", "Emissão", "Venc. (5º DU)", "Parceiro", "Subtotal", "Líquido", "Ações"],
        (data || []).map((f) => {
          const parc = f.natureza_operacao === "Devolucao_Insumo" ? f.fornecedores?.nome_fantasia : f.clientes?.nome;
          const detalhePCT = f.toneladas_pesadas 
            ? `<small><strong>${num(f.toneladas_pesadas)} t</strong> | ${num(f.atr_qualidade)} ATR <br>Brix: ${num(f.brix)}% | Pol: ${num(f.pol)}%</small>` 
            : "—";
          return `<tr>
            <td><strong>${esc(f.numero_fatura)}</strong></td>
            <td>${badgeOperacao(f.natureza_operacao, f.categoria_insumo)}</td>
            <td>${detalhePCT}</td>
            <td>${dbr(f.data_emissao)}</td>
            <td>${dbr(f.data_vencimento)}</td>
            <td>${esc(parc || "—")}</td>
            <td>${money(f.valor_subtotal)}</td>
            <td><strong>${money(f.valor_total)}</strong></td>
            <td>
              <button class="btn ghost small" onclick="window.imprimirEspelhoNF('${f.id}')">🖨️ Espelho NF-e</button>
            </td>
          </tr>`;
        }).join("")
      );
  }

  // ESPELHO DE NOTA FISCAL (IMPRESSÃO)
  window.imprimirEspelhoNF = async (id) => {
    const { data: f } = await sb.from("faturas").select("*, clientes(*), fornecedores(*)").eq("id", id).single();
    if (!f) return alert("Nota não encontrada!");

    const win = window.open("", "_blank");
    if (!win) return alert("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.");
    win.document.write(`
      <html>
        <head>
          <title>Espelho NF - ${esc(f.numero_fatura)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 25px; color: #333; }
            .box { border: 1px solid #ccc; padding: 12px; margin-bottom: 12px; border-radius: 6px; }
            h2, h3 { margin-top: 0; color: #2e6b38; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 0.9rem; }
            th { background-color: #f4f4f4; }
          </style>
        </head>
        <body>
          <h2>SysCana ERP Agrobusiness - Espelho de NF-e (Produtor Rural)</h2>
          <div class="box">
            <strong>Número da NF:</strong> ${esc(f.numero_fatura)} | <strong>CFOP:</strong> ${esc(f.cfop || '5.101')}<br>
            <strong>Natureza de Operação:</strong> ${esc(f.natureza_operacao)} ${f.categoria_insumo ? `(${esc(f.categoria_insumo)})` : ''}<br>
            <strong>Emissão:</strong> ${dbr(f.data_emissao)} | <strong>Vencimento (5º DU):</strong> ${dbr(f.data_vencimento)}<br>
            <strong>Destinatário / Usina:</strong> ${esc(f.clientes?.nome || f.fornecedores?.nome_fantasia || "—")}
          </div>
          ${f.toneladas_pesadas ? `
          <div class="box">
            <h3>Parâmetros de Pesagem & Laboratório (PCT/Consecana)</h3>
            <strong>Carga Pesada:</strong> ${num(f.toneladas_pesadas)} Toneladas | <strong>ATR Homologado:</strong> ${num(f.atr_qualidade)} Kg/t<br>
            <strong>Brix:</strong> ${num(f.brix)}% | <strong>Pol:</strong> ${num(f.pol)}% | <strong>Pureza:</strong> ${num(f.pureza)}% | <strong>Fibra:</strong> ${num(f.fibra)}%<br>
            <strong>Impureza Vegetal:</strong> ${num(f.impureza_vegetal)}% ${f.impureza_vegetal > 3 ? '<strong style="color:red">(Acima da tolerância 3,0%)</strong>' : ''} | 
            <strong>Impureza Mineral:</strong> ${num(f.impureza_mineral)}% ${f.impureza_mineral > 0.5 ? '<strong style="color:red">(Acima da tolerância 0,5%)</strong>' : ''}
          </div>` : ''}
          <div class="box">
            <h3>Demonstrativo Financeiro & Retenções</h3>
            <table>
              <tr><th>Valor Subtotal Bruto</th><td>${money(f.valor_subtotal)}</td></tr>
              ${f.desconto_cct ? `<tr><th>(-) Desconto CCT Usina</th><td>- ${money(f.desconto_cct)}</td></tr>` : ''}
              ${f.desconto_impurezas ? `<tr><th>(-) Desconto Impurezas Excedentes</th><td>- ${money(f.desconto_impurezas)}</td></tr>` : ''}
              ${f.retencao_funrural ? `<tr><th>(-) Retenção Funrural</th><td>- ${money(f.retencao_funrural)}</td></tr>` : ''}
              ${f.retencao_senar ? `<tr><th>(-) Retenção SENAR</th><td>- ${money(f.retencao_senar)}</td></tr>` : ''}
              <tr><th><strong>(=) Valor Líquido A Receber</strong></th><td><strong>${money(f.valor_total)}</strong></td></tr>
            </table>
          </div>
          <div class="box" style="background:#f9f9f9;">
            <strong>Informações Adicionais de Interesse do Fisco:</strong><br>
            <small>${esc(f.inf_adicionais_fiscal) || 'ICMS Diferido nos termos do Art. 345 do RICMS/SP. PIS/COFINS com alíquota suspensa (CST 09 - Lei 10.925/2004).'}</small>
          </div>
          <button onclick="window.print()" style="padding:10px 20px; background:#2e6b38; color:#fff; border:none; border-radius:4px; cursor:pointer;">🖨️ Imprimir Espelho Fiscal</button>
        </body>
      </html>
    `);
  };

  // 2. FORMULÁRIO DE EMISSÃO DE NOTA FISCAL
  async function faturarEspecial() {
    const [clientes, fornecedores] = await Promise.all([
      list("clientes", "nome"),
      list("fornecedores", "nome_fantasia")
    ]);

    view.innerHTML =
      title("Emitir Nota Fiscal", `<a class="btn ghost small" href="#/fat/notas">Voltar</a>`) +
      `<div style="display:grid; grid-template-columns: 2.2fr 1fr; gap:20px; align-items: start;">
        <div class="card" style="padding:24px;">
          <form id="form-faturamento">
            <div style="background:#f4f6f0; padding:15px; border-radius:8px; margin-bottom:15px; border-left:4px solid #2e6b38;">
              <h4 style="margin:0 0 12px 0; color:#2e6b38;">1. Tipo de Documento</h4>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div class="field" style="margin:0;">
                  <label>Tipo de Operação Fiscal</label>
                  <select name="tipo_operacao" id="tipo_operacao" required>
                    <option value="Venda_Cana">Venda</option>
                    <option value="Devolucao_Insumo">Devolução</option>
                    <option value="Prestacao_Servico">Serviço</option>
                  </select>
                </div>
                <div class="field" style="margin:0;">
                  <label>Número da NF-e / NFS-e</label>
                  <input type="text" name="numero_nf" id="numero_nf" required placeholder="Ex: NF-001045" />
                </div>
              </div>
            </div>

            <div style="background:#f4f6f0; padding:15px; border-radius:8px; margin-bottom:15px; border-left:4px solid #d4ac0d;">
              <h4 style="margin:0 0 12px 0; color:#7d6608;">2. Destinatário / Usina</h4>
              <div class="field" id="campo_cliente" style="margin:0;">
                <label>Usina / Cliente Destinatário</label>
                <select name="cliente_id" id="cliente_id">${options(clientes, "id", "nome")}</select>
              </div>
              <div class="field" id="campo_fornecedor" style="display:none; margin:0;">
                <label>Fornecedor (Destinatário da Devolução)</label>
                <select name="fornecedor_id" id="fornecedor_id">${options(fornecedores, "id", "nome_fantasia")}</select>
              </div>
            </div>

            <div id="painel_cana" style="background:#faf8f2; padding:15px; border-radius:8px; border:1px solid #e5dfc5;">
              <h4 style="margin:0 0 12px 0; color:#2e6b38;">3. Apuração de Balança, Análise PCT & Consecana</h4>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:12px;">
                <div class="field" style="margin:0;">
                  <label>Pesagem Balança (Tons)</label>
                  <input type="number" step="0.001" name="toneladas_pesadas" id="toneladas_pesadas" value="0.000" />
                </div>
                <div class="field" style="margin:0;">
                  <label>ATR Apurado (Kg/Ton)</label>
                  <input type="number" step="0.01" name="atr_qualidade" id="atr_qualidade" value="0.00" />
                </div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; margin-bottom:12px; background:#fff; padding:10px; border-radius:6px;">
                <div class="field" style="margin:0;"><label>Brix (%)</label><input type="number" step="0.01" name="brix" id="brix" value="0.00" /></div>
                <div class="field" style="margin:0;"><label>Pol (%)</label><input type="number" step="0.01" name="pol" id="pol" value="0.00" /></div>
                <div class="field" style="margin:0;"><label>Pureza (%)</label><input type="number" step="0.01" name="pureza" id="pureza" value="0.00" /></div>
                <div class="field" style="margin:0;"><label>Fibra (%)</label><input type="number" step="0.01" name="fibra" id="fibra" value="0.00" /></div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:12px;">
                <div class="field" style="margin:0;">
                  <label>Impureza Veg. (%) [Tol: 3%]</label>
                  <input type="number" step="0.1" name="impureza_vegetal" id="impureza_vegetal" value="0.0" />
                </div>
                <div class="field" style="margin:0;">
                  <label>Impureza Min. (%) [Tol: 0,5%]</label>
                  <input type="number" step="0.1" name="impureza_mineral" id="impureza_mineral" value="0.0" />
                </div>
                <div class="field" style="margin:0;">
                  <label>Desconto Impurezas (R$)</label>
                  <input type="number" step="0.01" name="desconto_impurezas" id="desconto_impurezas" value="0.00" />
                </div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:12px;">
                <div class="field" style="margin:0;">
                  <label>Tipo de Produtor Rural</label>
                  <select name="tipo_produtor" id="tipo_produtor">
                    <option value="PF">Pessoa Física (Funrural 1,2% + SENAR 0,2%)</option>
                    <option value="PJ">Pessoa Jurídica (Funrural 1,7% + SENAR 0,25%)</option>
                  </select>
                </div>
                <div class="field" style="margin:0;">
                  <label>Cota Condomínio Agrícola (%)</label>
                  <input type="number" step="0.01" name="cota_condominio" id="cota_condominio" value="100.00" />
                </div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div class="field" style="margin:0;">
                  <label>Valor Bruto Cana (R$)</label>
                  <input type="number" step="0.01" name="valor_bruto_cana" id="valor_bruto_cana" value="0.00" />
                </div>
                <div class="field" style="margin:0;">
                  <label>Abatimento / Frete CCT (R$)</label>
                  <input type="number" step="0.01" name="desconto_cct" id="desconto_cct" value="0.00" />
                </div>
              </div>
            </div>

            <div id="painel_devolucao" style="display:none; background:#fcf4f4; padding:15px; border-radius:8px; border:1px solid #f2d7d7;">
              <h4 style="margin:0 0 12px 0; color:#922b21;">3. Detalhes da Devolução de Insumos</h4>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:12px;">
                <div class="field" style="margin:0;">
                  <label>Categoria do Insumo</label>
                  <select name="categoria_insumo" id="categoria_insumo">
                    <option value="Herbicida">Herbicida</option>
                    <option value="Fungicida">Fungicida</option>
                    <option value="Fertilizante / Adubo">Fertilizante / Adubo</option>
                    <option value="Inseticida">Inseticida</option>
                    <option value="Mudas / Sementes">Mudas / Sementes</option>
                  </select>
                </div>
                <div class="field" style="margin:0;">
                  <label>Valor dos Insumos (R$)</label>
                  <input type="number" step="0.01" name="valor_devolucao" id="valor_devolucao" value="0.00" />
                </div>
              </div>
            </div>

            <div id="painel_servico" style="display:none; background:#f4f8fb; padding:15px; border-radius:8px; border:1px solid #d4e6f1;">
              <h4 style="margin:0 0 12px 0; color:#1b4f72;">3. Prestação de Serviços Agrícolas</h4>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                <div class="field" style="margin:0;"><label>Valor Total do Serviço (R$)</label><input type="number" step="0.01" name="valor_servico" id="valor_servico" value="0.00" /></div>
                <div class="field" style="margin:0;"><label>Alíquota ISSQN (%)</label><input type="number" step="0.01" name="aliquota_issqn" id="aliquota_issqn" value="2.00" /></div>
              </div>
            </div>

            <div id="alerta_impurezas" style="margin-top:10px;"></div>
            <div id="msg" style="margin-top:10px;"></div>
            
            <button type="submit" class="btn gold" style="margin-top:20px; width:100%; height:45px; font-size:1.05rem;">
              🚀 Emitir Nota Fiscal
            </button>
          </form>
        </div>

        <div class="card" style="position: sticky; top: 20px; background:#1b3822; color:#fff; border-radius:10px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.15);">
          <h3 style="color:#e8d48b; margin-top:0; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:10px;">
            📊 Demonstrativo Fiscal
          </h3>
          <div style="line-height:1.9; font-size:0.95rem;">
            <div style="display:flex; justify-content:space-between;"><span>Subtotal Bruto:</span><strong id="sim_bruto" style="color:#fff;">R$ 0,00</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>(-) Abatimento CCT:</span><span id="sim_cct" style="color:#f5b7b1;">R$ 0,00</span></div>
            <div style="display:flex; justify-content:space-between;"><span>(-) Impurezas Excedentes:</span><span id="sim_impureza" style="color:#f5b7b1;">R$ 0,00</span></div>
            <div style="display:flex; justify-content:space-between;"><span>(-) Retenção Funrural:</span><span id="sim_funrural" style="color:#f5b7b1;">R$ 0,00</span></div>
            <div style="display:flex; justify-content:space-between;"><span>(-) Retenção SENAR:</span><span id="sim_senar" style="color:#f5b7b1;">R$ 0,00</span></div>
            <div style="display:flex; justify-content:space-between;"><span>(-) ISSQN Retido:</span><span id="sim_issqn" style="color:#f5b7b1;">R$ 0,00</span></div>
            <hr style="border-color:rgba(255,255,255,0.2); margin:12px 0;">
            <div>
              <small style="color:#a9dfbf;">VALOR LÍQUIDO A RECEBER</small>
              <h2 id="sim_liquido" style="color:#e8d48b; margin:5px 0 0 0; font-size:1.8rem;">R$ 0,00</h2>
            </div>
          </div>
          <div style="margin-top:15px; background:rgba(255,255,255,0.08); padding:10px; border-radius:6px; font-size:0.8rem; color:#d5f5e3;">
            ⚖️ <strong>Regime:</strong> ICMS Diferido (Art. 345) / PIS COFINS Suspenso (Lei 10.925/04).
          </div>
        </div>
      </div>`;

    const selTipo = $("tipo_operacao");
    const recalcular = () => {
      const tipo = selTipo.value;
      let bruto = 0, cct = 0, descImp = 0, funrural = 0, senar = 0, issqn = 0;

      if (tipo === "Venda_Cana") {
        bruto = Number($("valor_bruto_cana").value || 0);
        cct = Number($("desconto_cct").value || 0);
        descImp = Number($("desconto_impurezas").value || 0);
        
        const impVeg = Number($("impureza_vegetal").value || 0);
        const impMin = Number($("impureza_mineral").value || 0);
        const alertaEl = $("alerta_impurezas");
        
        if (impVeg > 3.0 || impMin > 0.5) {
          alertaEl.innerHTML = flash("err", `⚠️ ALERTA DE IMPUREZAS: Veg. (${impVeg}%) ou Min. (${impMin}%) excederam o limite tolerado (3% / 0,5%). Aplicar desconto do laudo!`);
        } else {
          alertaEl.innerHTML = "";
        }

        const tp = $("tipo_produtor").value;
        const aliqF = tp === "PJ" ? 0.017 : 0.012;
        const aliqS = tp === "PJ" ? 0.0025 : 0.002;
        funrural = bruto * aliqF;
        senar = bruto * aliqS;
      } else if (tipo === "Prestacao_Servico") {
        bruto = Number($("valor_servico").value || 0);
        const aliq = Number($("aliquota_issqn").value || 0) / 100.0;
        issqn = bruto * aliq;
      } else if (tipo === "Devolucao_Insumo") {
        bruto = Number($("valor_devolucao").value || 0);
      }

      const liquido = bruto - cct - descImp - funrural - senar - issqn;

      $("sim_bruto").textContent = money(bruto);
      $("sim_cct").textContent = money(cct);
      $("sim_impureza").textContent = money(descImp);
      $("sim_funrural").textContent = money(funrural);
      $("sim_senar").textContent = money(senar);
      $("sim_issqn").textContent = money(issqn);
      $("sim_liquido").textContent = money(liquido);
    };

    ["valor_bruto_cana", "desconto_cct", "desconto_impurezas", "impureza_vegetal", "impureza_mineral", "valor_servico", "aliquota_issqn", "valor_devolucao"].forEach((id) => {
      const el = $(id);
      if (el) el.oninput = recalcular;
    });
    $("tipo_produtor").onchange = recalcular;

    selTipo.onchange = () => {
      const v = selTipo.value;
      $("painel_cana").style.display = v === "Venda_Cana" ? "block" : "none";
      $("painel_servico").style.display = v === "Prestacao_Servico" ? "block" : "none";
      $("painel_devolucao").style.display = v === "Devolucao_Insumo" ? "block" : "none";

      $("campo_cliente").style.display = v === "Devolucao_Insumo" ? "none" : "block";
      $("campo_fornecedor").style.display = v === "Devolucao_Insumo" ? "block" : "none";
      recalcular();
    };

    $("form-faturamento").onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const tipo = fd.tipo_operacao;

      let valorBruto = 0;
      let parceiroId = fd.cliente_id;

      if (tipo === "Venda_Cana") {
        valorBruto = Number(fd.valor_bruto_cana);
      } else if (tipo === "Prestacao_Servico") {
        valorBruto = Number(fd.valor_servico);
      } else if (tipo === "Devolucao_Insumo") {
        valorBruto = Number(fd.valor_devolucao);
        parceiroId = fd.fornecedor_id;
      }

      const { error } = await sb.rpc("emitir_fatura_especial", {
        p_tipo_operacao: tipo,
        p_numero_nf: fd.numero_nf,
        p_parceiro_id: parceiroId,
        p_valor_bruto: valorBruto,
        p_desconto_cct: Number(fd.desconto_cct || 0),
        p_aliquota_issqn: Number(fd.aliquota_issqn || 0),
        p_nf_referenciada: fd.nf_referenciada || null,
        p_modalidade: fd.modalidade_contrato || "CANA_BALANCA",
        p_tipo_produtor: fd.tipo_produtor || "PF",
        p_toneladas: Number(fd.toneladas_pesadas || 0),
        p_atr: Number(fd.atr_qualidade || 0),
        p_responsabilidade_cct: fd.responsabilidade_cct || "FORNECEDOR_TOTAL",
        p_categoria_insumo: fd.categoria_insumo || null,
        p_imp_vegetal: Number(fd.impureza_vegetal || 0),
        p_imp_mineral: Number(fd.impureza_mineral || 0),
        p_desconto_impurezas: Number(fd.desconto_impurezas || 0),
        p_brix: Number(fd.brix || 0),
        p_pol: Number(fd.pol || 0),
        p_pureza: Number(fd.pureza || 0),
        p_fibra: Number(fd.fibra || 0),
        p_cota_condominio: Number(fd.cota_condominio || 100)
      });

      const msgEl = $("msg");
      if (error) {
        msgEl.innerHTML = flash("err", error.message);
      } else {
        msgEl.innerHTML = flash("ok", "Nota Fiscal emitida e lançada nos Livros Fiscais!");
        setTimeout(() => { location.hash = "#/fat/notas"; }, 1500);
      }
    };
  }

  // 3. TELA DE ALÍQUOTAS E IMPOSTOS CONFIGURÁVEIS
  async function aliquotas() {
    const carregarAlis = async () => {
      const { data, error } = await sb.from("impostos").select("*").order("operacao", { ascending: true });
      if (error) throw error;
      return data || [];
    };

    const lista = await carregarAlis();

    const tabelaLinhas = (lista || []).map((item) => `
      <tr data-id="${item.id}">
        <td><span class="chip ${item.operacao === 'Venda' ? 'ok' : (item.operacao === 'Devolução' ? 'bad' : 'info')}">${esc(item.operacao)}</span></td>
        <td><strong>${esc(item.nome)}</strong></td>
        <td>
          <input type="number" step="0.01" class="input-taxa" value="${item.taxa}" style="width:100px; padding:4px 8px; font-weight:bold; text-align:right;" /> %
        </td>
        <td><input type="text" class="input-desc" value="${esc(item.descricao || '')}" style="width:100%; border:none; background:transparent;" /></td>
        <td>
          <button class="btn ghost small" style="color:red;" onclick="window.excluirImposto('${item.id}')">🗑️ Excluir</button>
        </td>
      </tr>
    `).join("");

    view.innerHTML =
      title("Alíquotas e Impostos Configurados", `<button class="btn gold small" onclick="window.salvarTodasAliquotas()">💾 Salvar Alterações</button>`) +
      `<div class="card" style="margin-bottom:20px; padding:15px; background:#f9f9f6;">
        <h4 style="margin-top:0; color:#2e6b38;">Adicionar Novo Imposto / Retenção</h4>
        <form id="form-novo-imposto" style="display:grid; grid-template-columns: 2fr 1fr 1.5fr 2fr 1fr; gap:10px; align-items:end;">
          <div class="field" style="margin:0;">
            <label>Nome do Tributo</label>
            <input type="text" name="nome" required placeholder="Ex: ISSQN Especial" />
          </div>
          <div class="field" style="margin:0;">
            <label>Taxa (%)</label>
            <input type="number" step="0.01" name="taxa" required placeholder="0.00" />
          </div>
          <div class="field" style="margin:0;">
            <label>Operação Relacionada</label>
            <select name="operacao" required>
              <option value="Venda">Venda de Cana</option>
              <option value="Devolução">Devolução de Insumo</option>
              <option value="Serviço">Prestação de Serviço</option>
            </select>
          </div>
          <div class="field" style="margin:0;">
            <label>Descrição / Enquadramento</label>
            <input type="text" name="descricao" placeholder="Ex: Regra estadual RICMS" />
          </div>
          <button type="submit" class="btn small gold" style="height:38px;">+ Adicionar</button>
        </form>
        <div id="msg-imp" style="margin-top:10px;"></div>
      </div>

      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Operação</th>
              <th>Nome do Tributo</th>
              <th style="width:140px;">Taxa (%)</th>
              <th>Enquadramento / Descrição Legal</th>
              <th style="width:100px;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${tabelaLinhas}
          </tbody>
        </table>
      </div>`;

    window.salvarTodasAliquotas = async () => {
      const linhas = document.querySelectorAll("tr[data-id]");
      let erros = 0;

      for (const tr of linhas) {
        const id = tr.getAttribute("data-id");
        const taxa = Number(tr.querySelector(".input-taxa").value || 0);
        const desc = tr.querySelector(".input-desc").value;

        const { error } = await sb.from("impostos").update({ taxa: taxa, descricao: desc }).eq("id", id);
        if (error) erros++;
      }

      if (erros > 0) {
        alert("Ocorreu um erro ao atualizar algumas alíquotas.");
      } else {
        alert("Todas as alíquotas e impostos foram atualizados com sucesso!");
        aliquotas();
      }
    };

    window.excluirImposto = async (id) => {
      if (!confirm("Tem certeza que deseja excluir esta regra tributária?")) return;
      const { error } = await sb.from("impostos").delete().eq("id", id);
      if (error) alert(error.message);
      else aliquotas();
    };

    const formNovo = $("form-novo-imposto");
    if (formNovo) {
      formNovo.onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        const { error } = await sb.from("impostos").insert([{
          nome: fd.nome,
          taxa: Number(fd.taxa),
          operacao: fd.operacao,
          descricao: fd.descricao
        }]);

        if (error) {
          $("msg-imp").innerHTML = flash("err", error.message);
        } else {
          aliquotas();
        }
      };
    }
  }

  // 4. RELATÓRIOS
  async function fatRelatorios() {
    const { data } = await sb.from("faturas").select("valor_total, natureza_operacao");
    const totalVendas = (data || []).filter(f => f.natureza_operacao && f.natureza_operacao.includes("Venda")).reduce((acc, f) => acc + Number(f.valor_total), 0);
    view.innerHTML = title("Relatórios de Faturamento") + `<div class="card"><h3>Total Faturado: ${money(totalVendas)}</h3></div>`;
  }

  // 5. CONFIGURAÇÕES
  async function fatConfig() {
    const heading = title("Configurações de Faturamento");
    view.innerHTML = heading + `<div class="card"><p>Carregando configurações...</p></div>`;

    const { data, error } = await sb
      .from("config_faturamento")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      view.innerHTML = heading + `<div class="card">${flash("err", error.message)}</div>`;
      return;
    }

    const cfg = data || {};
    const value = (key, fallback = "") => esc(cfg[key] == null ? fallback : cfg[key]);

    view.innerHTML = heading + `
      <div class="card" style="margin-bottom:16px; border-left:4px solid #d4ac0d;">
        <strong>Integração fiscal:</strong> ainda não conectada à SEFAZ.
        Esta tela salva parâmetros internos; o fluxo atual não transmite nem autoriza NF-e.
        Não informe certificado digital ou chave secreta aqui.
      </div>
      <form id="form-config-faturamento">
        <div class="card" style="margin-bottom:16px; padding:20px;">
          <h3 style="margin-top:0; color:#2e6b38;">1. Identificação do emitente</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
            <div class="field"><label>Nome / Razão social</label><input name="razao_social" maxlength="160" value="${value("razao_social")}" /></div>
            <div class="field"><label>CPF/CNPJ</label><input name="cnpj" maxlength="20" value="${value("cnpj")}" /></div>
            <div class="field"><label>Inscrição estadual</label><input name="inscricao_estadual" maxlength="30" value="${value("inscricao_estadual")}" /></div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
            <div class="field"><label>UF</label><input name="uf" maxlength="2" placeholder="SP" value="${value("uf")}" /></div>
            <div class="field"><label>Município</label><input name="municipio" maxlength="120" value="${value("municipio")}" /></div>
            <div class="field"><label>Código IBGE do município</label><input name="codigo_municipio_ibge" maxlength="7" inputmode="numeric" value="${value("codigo_municipio_ibge")}" /></div>
          </div>
          <div class="field"><label>Endereço</label><input name="endereco" maxlength="240" value="${value("endereco")}" /></div>
        </div>

        <div class="card" style="margin-bottom:16px; padding:20px;">
          <h3 style="margin-top:0; color:#2e6b38;">2. Documento e numeração</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
            <div class="field"><label>Modelo NF-e</label><input name="modelo_nfe" maxlength="2" value="${value("modelo_nfe", "55")}" /></div>
            <div class="field"><label>Série</label><input name="serie_nfe" maxlength="5" value="${value("serie_nfe", "1")}" /></div>
            <div class="field"><label>Próximo número (controle manual)</label><input type="number" name="proximo_numero_nfe" min="1" step="1" value="${value("proximo_numero_nfe", "1")}" /></div>
            <div class="field"><label>Ambiente de referência</label>
              <select name="ambiente_nfe">
                <option value="homologacao" ${cfg.ambiente_nfe !== "producao" ? "selected" : ""}>Homologação (testes)</option>
                <option value="producao" disabled>Produção (indisponível)</option>
              </select>
            </div>
          </div>
          <small>O número acima é apenas referência: a tela de emissão ainda pede a numeração manualmente. Produção só deve ser habilitada após integrar e validar a emissão fiscal.</small>
        </div>

        <div class="card" style="margin-bottom:16px; padding:20px;">
          <h3 style="margin-top:0; color:#2e6b38;">3. Padrões por operação</h3>
          <p class="muted">Revise CFOPs e enquadramentos com o contador. Estes campos ficam salvos como referência e ainda não são enviados automaticamente na emissão.</p>
          <p class="muted"><strong>Vencimento atual:</strong> 5º dia útil, calculado pela rotina de faturamento.</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px;">
            <div class="field"><label>Natureza — venda de cana</label><input name="natureza_venda_cana" maxlength="160" value="${value("natureza_venda_cana", "Venda de Cana-de-Açúcar")}" /></div>
            <div class="field"><label>CFOP — venda de cana</label><input name="cfop_venda_cana" maxlength="4" inputmode="numeric" placeholder="Preencher com o contador" value="${value("cfop_venda_cana")}" /></div>
            <div class="field"><label>Natureza — devolução de insumos</label><input name="natureza_devolucao_insumo" maxlength="160" value="${value("natureza_devolucao_insumo", "Devolução de Insumos")}" /></div>
            <div class="field"><label>CFOP — devolução de insumos</label><input name="cfop_devolucao_insumo" maxlength="4" inputmode="numeric" placeholder="Preencher com o contador" value="${value("cfop_devolucao_insumo")}" /></div>
            <div class="field"><label>Natureza — prestação de serviço</label><input name="natureza_servico" maxlength="160" value="${value("natureza_servico", "Prestação de Serviços Agrícolas")}" /></div>
            <div class="field"><label>Código municipal do serviço</label><input name="codigo_servico_municipal" maxlength="30" value="${value("codigo_servico_municipal")}" /></div>
          </div>
        </div>
        <div id="msg-config-faturamento" style="margin-bottom:12px;"></div>
        <button type="submit" class="btn gold" id="btn-salvar-config" style="min-width:200px;">Salvar configurações</button>
      </form>`;

    const form = $("form-config-faturamento");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        id: 1,
        razao_social: String(fd.get("razao_social") || "").trim(),
        cnpj: String(fd.get("cnpj") || "").trim(),
        inscricao_estadual: String(fd.get("inscricao_estadual") || "").trim(),
        endereco: String(fd.get("endereco") || "").trim(),
        uf: String(fd.get("uf") || "").trim().toUpperCase(),
        municipio: String(fd.get("municipio") || "").trim(),
        codigo_municipio_ibge: String(fd.get("codigo_municipio_ibge") || "").trim(),
        modelo_nfe: String(fd.get("modelo_nfe") || "55").trim(),
        serie_nfe: String(fd.get("serie_nfe") || "1").trim(),
        proximo_numero_nfe: Math.max(1, Number(fd.get("proximo_numero_nfe") || 1)),
        ambiente_nfe: "homologacao",
        natureza_venda_cana: String(fd.get("natureza_venda_cana") || "").trim(),
        cfop_venda_cana: String(fd.get("cfop_venda_cana") || "").trim(),
        natureza_devolucao_insumo: String(fd.get("natureza_devolucao_insumo") || "").trim(),
        cfop_devolucao_insumo: String(fd.get("cfop_devolucao_insumo") || "").trim(),
        natureza_servico: String(fd.get("natureza_servico") || "").trim(),
        codigo_servico_municipal: String(fd.get("codigo_servico_municipal") || "").trim()
      };
      const btn = $("btn-salvar-config");
      btn.disabled = true;
      const { error: saveError } = await sb
        .from("config_faturamento")
        .upsert(payload, { onConflict: "id" });
      btn.disabled = false;
      $("msg-config-faturamento").innerHTML = saveError
        ? flash("err", saveError.message)
        : flash("ok", "Configurações salvas.");
    };
  }

  // ROTEADOR DOS MÓDULOS
  window.SysCanaCore.startRouter({
    "/fat/notas": notas,
    "/fat/emitir-especial": faturarEspecial,
    "/fat/aliquotas": aliquotas,
    "/fat/relatorios": fatRelatorios,
    "/fat/config": fatConfig
  }, "/fat/notas");
})();

