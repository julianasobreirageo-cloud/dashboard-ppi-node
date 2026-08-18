(() => {
  "use strict";

  const originalFetch = window.fetch.bind(window);

  function normalizarStatus(valor) {
    const s = String(valor || "").trim().toLowerCase();

    // IMPORTANTE:
    // status vazio continua vazio. Não transformar automaticamente em "Não iniciado".
    // "Não iniciado" só deve ser usado quando a ficha/orientação específica indicar isso.
    if (!s) return "";

    if (s.includes("suspens")) return "Suspenso";
    if (s.includes("conclu")) return "Concluído";
    if (s.includes("acompanh")) return "Em andamento";
    if (s.includes("andamento")) return "Em andamento";
    if (s.includes("não iniciado") || s.includes("nao iniciado")) return "Não iniciado";

    return "";
  }

  function tentarUfDoTexto(item) {
    if (item.uf && String(item.uf).trim()) return item.uf;

    const candidatos = [item.municipio, item.projeto, item.situacao].filter(Boolean);
    for (const texto of candidatos) {
      let m = String(texto).match(/\(([A-Z]{2})\)\s*$/);
      if (m) return m[1];

      m = String(texto).match(/(?:\/|\-|\s)(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
      if (m) return m[1];
    }
    return "";
  }

  function normalizarProjeto(p) {
    const x = { ...p };
    x.status = normalizarStatus(x.status);

    if (String(x.etapa || "").trim().toLowerCase() === "a confirmar no ppi") {
      x.etapa = "";
    }

    if (!x.uf) x.uf = tentarUfDoTexto(x);
    return x;
  }

  window.fetch = async function(input, init) {
    const response = await originalFetch(input, init);

    try {
      const url = typeof input === "string" ? input : input?.url || "";
      if (/\/data\.json(?:\?|$)/i.test(url)) {
        const raw = await response.clone().json();

        if (Array.isArray(raw)) {
          const corrigido = raw.map(normalizarProjeto);
          return new Response(JSON.stringify(corrigido), {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        }
      }
    } catch (e) {
      console.warn("Ajustes PPI: não foi possível normalizar data.json", e);
    }

    return response;
  };

  function texto(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function encontrarPainelPorTitulo(titulo) {
    const heads = [...document.querySelectorAll(".panel-head h2")];
    const h = heads.find(el => texto(el).toLowerCase() === titulo.toLowerCase());
    return h ? h.closest(".panel") : null;
  }

  function removerBarraNaoInformado(painel, somenteSeZero = false) {
    if (!painel) return;

    painel.querySelectorAll(".bar").forEach(bar => {
      bar.style.display = "";
      bar.removeAttribute("aria-hidden");
      const label = texto(bar.querySelector(".bar-head span")).toLowerCase();
      const valor = texto(bar.querySelector(".bar-head b")).toLowerCase();

      const naoInformado =
        label === "não informado" ||
        label === "não informada" ||
        label === "nao informado" ||
        label === "nao informada";

      if (!naoInformado) return;

      if (!somenteSeZero) {
        bar.style.display = "none";
        bar.setAttribute("aria-hidden", "true");
        return;
      }

      const numero = valor
        .replace(/[^\d,.-]/g, "")
        .replace(/\./g, "")
        .replace(",", ".");

      const n = Number(numero || "0");
      if (!Number.isFinite(n) || n === 0) {
        bar.style.display = "none";
        bar.setAttribute("aria-hidden", "true");
      }
    });
  }

  function aplicarAjustesVisuais() {
    // Ocultar o bloco "Cobertura territorial" ao lado do mapa.
    // Não remove o elemento do DOM: apenas o esconde para não conflitar com o React.
    const cobertura = document.querySelector(".map-content .coverage");
    if (cobertura) {
      cobertura.style.display = "none";
      cobertura.setAttribute("aria-hidden", "true");

      const mapaConteudo = cobertura.closest(".map-content");
      if (mapaConteudo) {
        mapaConteudo.style.gridTemplateColumns = "1fr";
        mapaConteudo.style.justifyItems = "center";
      }
    }

    // Status geral: não exibir categoria "Não informado".
    removerBarraNaoInformado(
      encontrarPainelPorTitulo("Projetos por status geral"),
      false
    );

    // Estados: não exibir categoria "Não informado".
    removerBarraNaoInformado(
      encontrarPainelPorTitulo("Estados com mais projetos"),
      false
    );

    // Financeiro: retirar "Não informado" somente quando o valor é zero.
    const modalidade =
      encontrarPainelPorTitulo("CAPEX por modalidade contratual") ||
      encontrarPainelPorTitulo("OPEX por modalidade contratual");
    removerBarraNaoInformado(modalidade, true);

    const regiao =
      encontrarPainelPorTitulo("CAPEX por macrorregião") ||
      encontrarPainelPorTitulo("OPEX por macrorregião");
    removerBarraNaoInformado(regiao, true);

    // Menu de status: apenas os quatro status oficiais.
    document.querySelectorAll("select").forEach(sel => {
      const primeiro = sel.options?.[0]?.textContent || "";
      if (!/todos os status/i.test(primeiro)) return;

      [...sel.options].forEach(opt => {
        opt.hidden = false;
        opt.disabled = false;
        const v = (opt.textContent || "").trim();
        if (v && !["Todos os status", "Não iniciado", "Em andamento", "Concluído", "Suspenso"].includes(v)) {
          opt.hidden = true;
          opt.disabled = true;
        }
      });
    });

    // "A confirmar no PPI" não deve aparecer como fase.
    document.querySelectorAll("select").forEach(sel => {
      const primeiro = sel.options?.[0]?.textContent || "";
      if (!/todas as fases/i.test(primeiro)) return;

      [...sel.options].forEach(opt => {
        opt.hidden = false;
        opt.disabled = false;
        if (/a confirmar no ppi/i.test(opt.textContent || "")) {
          opt.hidden = true;
          opt.disabled = true;
        }
      });
    });
  }

  const obs = new MutationObserver(aplicarAjustesVisuais);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("DOMContentLoaded", aplicarAjustesVisuais);
  window.addEventListener("load", aplicarAjustesVisuais);

  console.info("Ajustes finais PPI carregados.");
})();
