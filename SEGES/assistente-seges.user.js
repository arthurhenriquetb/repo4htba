// ==UserScript==
// @name         SEGES • Assistente — Faltas, Planos e Notas
// @namespace    https://github.com/arthurhenriquetb/repo4htba
// @version      2.2.0
// @description  Assistente modular para validação de faltas e preenchimento de planos semanais; preparado para módulo de notas.
// @author       Prof. Arthur
// @match        https://seges.sedu.es.gov.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==


// SEGES • Assistente
// Instale apenas este arquivo no Violentmonkey. Desative as versões separadas.
// Todos os módulos compartilham o mesmo userscript, mas somente o correspondente
// à tela aberta é iniciado. Nunca valida faltas e preenche planos ao mesmo tempo.
(function () {
  'use strict';
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (/^\/absences(?:\/|$)/.test(path)) {
    iniciarModuloFaltas();
  } else if (/^\/weekly_plans(?:\/|$)/.test(path)) {
    iniciarModuloPlanos();
  } else if (/^\/(?:grades|scores|marks)(?:\/|$)/.test(path)) {
    // Espaço reservado: módulo de notas será implementado depois
    // de identificarmos os campos reais dessa tela no SEGES.
  }

  function iniciarModuloFaltas() {
    (function () {
        'use strict';
    
        const TIMEOUT = 15000;
        const POLL = 200;
    
        let executando = false;
        let pararSolicitado = false;
        let contextoAtual = {turma:'',mes:'',periodo:'',disciplina:''};
        let progressoAtual = {concluidos:0,total:0};
        let relatorio = {validados:0,semPlano:[],revisao:[],mesesIgnorados:[]};
        let linhasLog = [];
    
        function registrarLog(mensagem){
      const hora=new Date().toLocaleTimeString('pt-BR');
      linhasLog.push(`[${hora}] ${String(mensagem)}`);
      const janela=document.getElementById('conteudoLogSeges');
      if(janela){
        janela.textContent=linhasLog.slice(-1000).join('\n');
        janela.scrollTop=janela.scrollHeight;
      }
      console.log('SEGES v6.2:',mensagem);
    }
    
        function atualizarTurmaAtual(nome){
      const elemento=document.getElementById('turmaAtualSeges');
      if(elemento) elemento.textContent=`Turma: ${nome}`;
    }
    
        function atualizarProgresso(fracaoConcluida,total){
      const proporcao=total>0?Math.min(1,Math.max(0,fracaoConcluida/total)):0;
      const percentual=Math.round(proporcao*100);
      const barra=document.getElementById('barraProgressoSeges');
      const rotulo=document.getElementById('rotuloProgressoSeges');
      if(barra)barra.style.width=`${percentual}%`;
      if(rotulo)rotulo.textContent=`${percentual}% • ${Math.floor(progressoAtual.concluidos)} de ${progressoAtual.total} combinações turma/mês`;
    }
    
        function identificarDia(textoDia){
      const partes=[contextoAtual.turma,contextoAtual.periodo||contextoAtual.mes,contextoAtual.disciplina,`dia ${textoDia}`];
      return partes.filter(Boolean).join(' • ');
    }
    
        function detectarSemPlanoSemanal(modal){
      const texto=(modal.innerText||modal.textContent||'')
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/\s+/g,' ').trim().toLowerCase();
      // Só afirmar ausência se o próprio SEGES a expressar; não deduzir apenas pela falta do botão "Sim".
      return [
        /\bsem\s+(?:um\s+|o\s+)?(?:plano|planejamento)\s+semanal\b/,
        /\bnao\s+(?:ha|existe|possui|consta|tem|foi\s+encontrad[oa]|foi\s+cadastrad[oa])\b.{0,65}\b(?:plano|planejamento)\s+semanal\b/,
        /\b(?:plano|planejamento)\s+semanal\b.{0,80}\b(?:nao\s+(?:foi\s+)?(?:encontrad[oa]|cadastrad[oa]|localizad[oa])|inexistente|ausente)\b/
      ].some(regra=>regra.test(texto));
    }
    
        function criarResumoFinal(){
      const total=relatorio.semPlano.length;
      const registro=total
        ? `DIAS SEM PLANO SEMANAL IDENTIFICADO (${total}):\n${relatorio.semPlano.slice(0,12).map(x=>'- '+x).join('\n')}${total>12?`\n... e mais ${total-12}; consulte o log.`:''}`
        : 'Nenhum dia sem plano semanal foi identificado nas datas pendentes examinadas.';
      const revisar=relatorio.revisao.length
        ? `\n\nAtenção: ${relatorio.revisao.length} dia(s) sem confirmação; consulte o log para revisar manualmente.`
        : '';
      const meses=relatorio.mesesIgnorados.length
        ? `\nMeses não disponíveis no SEGES: ${relatorio.mesesIgnorados.length}.`
        : '';
      return `Validação concluída.\n\nConfirmações realizadas: ${relatorio.validados}.\n\n${registro}${revisar}${meses}\n\nO log contém os detalhes da execução.`;
    }
    
        function instalarAcessoriosDoPainel(painel,cabecalho,botoes,status){
      // Painel arrastável pelo cabeçalho, com limite dentro da janela.
      cabecalho.style.cursor='grab';
      cabecalho.style.userSelect='none';
      cabecalho.style.touchAction='none';
      let arraste=null;
      cabecalho.addEventListener('pointerdown',e=>{
        if(e.button!==0||e.target.closest('button'))return;
        const r=painel.getBoundingClientRect();
        arraste={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};
        painel.style.right='auto';
        painel.style.left=`${r.left}px`;
        painel.style.top=`${r.top}px`;
        cabecalho.style.cursor='grabbing';
        e.preventDefault();
      });
      const mover=e=>{
        if(!arraste||arraste.id!==e.pointerId)return;
        const maxX=Math.max(0,window.innerWidth-painel.offsetWidth);
        const maxY=Math.max(0,window.innerHeight-42);
        painel.style.left=`${Math.max(0,Math.min(maxX,e.clientX-arraste.dx))}px`;
        painel.style.top=`${Math.max(0,Math.min(maxY,e.clientY-arraste.dy))}px`;
      };
      const soltar=e=>{
        if(arraste&&arraste.id===e.pointerId){arraste=null;cabecalho.style.cursor='grab';}
      };
      window.addEventListener('pointermove',mover);
      window.addEventListener('pointerup',soltar);
      window.addEventListener('pointercancel',soltar);
    
      const info=document.createElement('div');
      info.style.cssText='margin:7px 0 10px;font-size:12px;';
      const turma=document.createElement('div');
      turma.id='turmaAtualSeges';
      turma.textContent='Turma: aguardando início';
      turma.style.cssText='font-weight:bold;color:#1976d2;margin-bottom:5px;overflow-wrap:anywhere;';
      const rotulo=document.createElement('div');
      rotulo.id='rotuloProgressoSeges';
      rotulo.textContent='0% • aguardando início';
      rotulo.style.cssText='color:#555;margin-bottom:4px;';
      const trilho=document.createElement('div');
      trilho.style.cssText='height:9px;border-radius:12px;background:#e4eaf0;overflow:hidden;';
      const barra=document.createElement('div');
      barra.id='barraProgressoSeges';
      barra.style.cssText='height:100%;width:0%;border-radius:12px;background:#1976d2;transition:width .25s;';
      trilho.appendChild(barra);
      info.append(turma,rotulo,trilho);
      painel.insertBefore(info,status);
    
      const logBotao=document.createElement('button');
      logBotao.type='button';
      logBotao.textContent='☷ Mostrar log';
      logBotao.style.cssText='grid-column:1 / -1;padding:7px;border:1px solid #b7cde5;border-radius:5px;background:#eff5fb;color:#155ca2;font-weight:bold;cursor:pointer;';
      botoes.appendChild(logBotao);
      const caixaLog=document.createElement('div');
      caixaLog.style.cssText='display:none;margin-top:9px;border:1px solid #ddd;border-radius:6px;padding:7px;background:#fafafa;';
      const pre=document.createElement('pre');
      pre.id='conteudoLogSeges';
      pre.style.cssText='max-height:210px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.4 Consolas,monospace;margin:0;';
      const baixar=document.createElement('button');
      baixar.type='button';
      baixar.textContent='Baixar log (.txt)';
      baixar.style.cssText='margin-top:6px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;background:white;cursor:pointer;font-size:11px;';
      baixar.onclick=()=>{
        const blob=new Blob([linhasLog.join('\n')],{type:'text/plain;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=url;link.download='seges-log-validacao.txt';
        document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      };
      caixaLog.append(pre,baixar);
      painel.appendChild(caixaLog);
      logBotao.onclick=()=>{
        const aberto=caixaLog.style.display!=='none';
        caixaLog.style.display=aberto?'none':'block';
        logBotao.textContent=aberto?'☷ Mostrar log':'☷ Ocultar log';
        if(!aberto)pre.textContent=linhasLog.slice(-1000).join('\n');
      };
    }
    
    
        function wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    
        // =========================================================
        // UTILITÁRIOS
        // =========================================================
    
        function visivel(elemento) {
            if (!elemento) return false;
    
            const estilo = getComputedStyle(elemento);
    
            return (
                estilo.display !== 'none' &&
                estilo.visibility !== 'hidden' &&
                elemento.getClientRects().length > 0
            );
        }
    
        async function esperar(fn, timeout = TIMEOUT) {
    
            const inicio = Date.now();
    
            while (Date.now() - inicio < timeout) {
    
                const resultado = fn();
    
                if (resultado) {
                    return resultado;
                }
    
                await wait(POLL);
            }
    
            throw new Error('Tempo limite excedido.');
        }
    
        async function esperarElemento(
            seletor,
            timeout = TIMEOUT
        ) {
    
            return esperar(() => {
    
                const elementos = [
                    ...document.querySelectorAll(seletor)
                ];
    
                return elementos.find(visivel) || null;
    
            }, timeout);
        }
    
        function eventosMouse(elemento) {
    
            [
                'mouseover',
                'mousemove',
                'mousedown',
                'mouseup',
                'click'
            ].forEach(tipo => {
    
                elemento.dispatchEvent(
                    new MouseEvent(tipo, {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })
                );
    
            });
        }
    
        function obterControlesSelect() {
    
            return [
                ...document.querySelectorAll('.Select-control')
            ];
        }
    
        // =========================================================
        // PAINEL PRINCIPAL
        // =========================================================
    
        function criarPainel() {
    
            const antigo =
                document.getElementById('painelSeges61');
    
            if (antigo) antigo.remove();
    
            const painel =
                document.createElement('div');
    
            painel.id = 'painelSeges61';
    
            painel.style.cssText = `
                position: fixed;
                top: 90px;
                right: 12px;
    
                width: 300px;
                max-height: calc(100vh - 105px);
                overflow-y: auto;
                box-sizing: border-box;
    
                z-index: 999999;
    
                background: #ffffff;
    
                border: 2px solid #1976d2;
                border-radius: 9px;
    
                padding: 12px;
    
                box-shadow:
                    0 4px 20px rgba(0,0,0,.25);
    
                font-family: Arial, sans-serif;
    
                font-size: 13px;
            `;
    
            // -----------------------------------------------------
            // CABEÇALHO
            // -----------------------------------------------------
    
            const cabecalho =
                document.createElement('div');
    
            cabecalho.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
    
                margin-bottom: 9px;
            `;
    
            const titulo =
                document.createElement('strong');
    
            titulo.textContent =
                'SEGES • Validação';
    
            titulo.style.fontSize = '16px';
    
            cabecalho.appendChild(titulo);
    
            const fecharPainel =
                document.createElement('button');
    
            fecharPainel.textContent = '×';
    
            fecharPainel.title = 'Fechar painel';
    
            fecharPainel.style.cssText = `
                border: none;
                background: transparent;
    
                font-size: 20px;
                font-weight: bold;
    
                color: #777;
    
                cursor: pointer;
    
                line-height: 20px;
            `;
    
            fecharPainel.onclick = () => {
    
                pararSolicitado = true;
    
                painel.remove();
            };
    
            cabecalho.appendChild(fecharPainel);
    
            painel.appendChild(cabecalho);
    
            // -----------------------------------------------------
            // TURMAS
            // -----------------------------------------------------
    
            const tituloTurmas =
                criarTitulo('Turmas');
    
            painel.appendChild(tituloTurmas);
    
            const turmaTodas =
                criarCheckbox(
                    'turmaTodas',
                    'Todas as turmas',
                    false
                );
    
            painel.appendChild(turmaTodas.container);
    
            const listaTurmas =
                document.createElement('div');
    
            listaTurmas.id =
                'listaTurmasSeges61';
    
            listaTurmas.style.cssText = `
                display: grid;
    
                grid-template-columns:
                    repeat(2, minmax(0, 1fr));
    
                gap: 3px 8px;
    
                margin-top: 4px;
                margin-bottom: 9px;
    
                max-height: 105px;
    
                overflow-y: auto;
    
                padding: 4px;
    
                border: 1px solid #ddd;
                border-radius: 5px;
            `;
    
            const turmas =
                Array.isArray(window.classrooms)
                    ? window.classrooms
                    : [];
    
            turmas.forEach((turma, indice) => {
    
                const item =
                    criarCheckbox(
                        `turma_${indice}`,
                        turma.name,
                        false
                    );
    
                item.checkbox.dataset.turma =
                    turma.name;
    
                listaTurmas.appendChild(item.container);
            });
    
            painel.appendChild(listaTurmas);
    
            turmaTodas.checkbox.addEventListener(
                'change',
                () => {
    
                    listaTurmas
                        .querySelectorAll(
                            'input[type="checkbox"]'
                        )
                        .forEach(cb => {
    
                            cb.disabled =
                                turmaTodas.checkbox.checked;
    
                            if (
                                turmaTodas.checkbox.checked
                            ) {
                                cb.checked = false;
                            }
                        });
                }
            );
    
            // -----------------------------------------------------
            // MESES
            // -----------------------------------------------------
    
            painel.appendChild(
                criarTitulo('Meses')
            );
    
            const mesTodos =
                criarCheckbox(
                    'mesTodos',
                    'Todos os meses',
                    false
                );
    
            painel.appendChild(mesTodos.container);
    
            const listaMeses =
                document.createElement('div');
    
            listaMeses.id =
                'listaMesesSeges61';
    
            listaMeses.style.cssText = `
                display: grid;
    
                grid-template-columns:
                    repeat(4, minmax(0, 1fr));
    
                gap: 4px;
    
                margin-top: 4px;
                margin-bottom: 10px;
    
                padding: 5px;
    
                border: 1px solid #ddd;
                border-radius: 5px;
            `;
    
            const nomesMeses = [
                'Janeiro',
                'Fevereiro',
                'Março',
                'Abril',
                'Maio',
                'Junho',
                'Julho',
                'Agosto',
                'Setembro',
                'Outubro',
                'Novembro',
                'Dezembro'
            ];
    
            nomesMeses.forEach((nome, indice) => {
    
                const item =
                    criarCheckbox(
                        `mes_${indice + 1}`,
                        nome.substring(0, 3),
                        false
                    );
    
                item.checkbox.dataset.mes =
                    nome;
    
                listaMeses.appendChild(item.container);
            });
    
            painel.appendChild(listaMeses);
    
            mesTodos.checkbox.addEventListener(
                'change',
                () => {
    
                    listaMeses
                        .querySelectorAll(
                            'input[type="checkbox"]'
                        )
                        .forEach(cb => {
    
                            cb.disabled =
                                mesTodos.checkbox.checked;
    
                            if (
                                mesTodos.checkbox.checked
                            ) {
                                cb.checked = false;
                            }
                        });
                }
            );
    
            // -----------------------------------------------------
            // STATUS
            // -----------------------------------------------------
    
            const status =
                document.createElement('div');
    
            status.id =
                'statusSeges61';
    
            status.textContent =
                'Pronto para iniciar.';
    
            status.style.cssText = `
                margin: 7px 0;
    
                padding: 7px;
    
                background: #f3f3f3;
    
                border-radius: 5px;
    
                color: #444;
    
                min-height: 18px;
            `;
    
            painel.appendChild(status);
    
            // -----------------------------------------------------
            // BOTÕES
            // -----------------------------------------------------
    
            const botoes =
                document.createElement('div');
    
            botoes.style.cssText = `
                display: grid;
    
                grid-template-columns:
                    1fr 1fr;
    
                gap: 6px;
            `;
    
            const iniciar =
                document.createElement('button');
    
            iniciar.textContent =
                '▶ Iniciar';
    
            iniciar.style.cssText = `
                padding: 8px;
    
                border: none;
                border-radius: 5px;
    
                background: #1976d2;
                color: white;
    
                font-weight: bold;
    
                cursor: pointer;
            `;
    
            iniciar.onclick = async () => {
    
                if (executando) return;
    
                const selecao =
                    obterSelecao();
    
                if (!selecao.turmas.length) {
    
                    alert(
                        'Selecione pelo menos uma turma.'
                    );
    
                    return;
                }
    
                if (!selecao.meses.length) {
    
                    alert(
                        'Selecione pelo menos um mês.'
                    );
    
                    return;
                }
    
                executando = true;
                pararSolicitado = false;
                contextoAtual = {turma:'',mes:'',periodo:'',disciplina:''};
                progressoAtual = {concluidos:0,total:selecao.turmas.length*selecao.meses.length};
                relatorio = {validados:0,semPlano:[],revisao:[],mesesIgnorados:[]};
                linhasLog = [];
                atualizarTurmaAtual('preparando...');
                atualizarProgresso(0,progressoAtual.total);
                registrarLog(`Iniciando: ${selecao.turmas.length} turmas × ${selecao.meses.length} meses.`);
    
                iniciar.disabled = true;
    
                iniciar.textContent =
                    'Processando...';
    
                try {
    
                    await executarProcesso(
                        selecao.turmas,
                        selecao.meses
                    );
    
                    if (!pararSolicitado) {
    
                        atualizarProgresso(progressoAtual.total,progressoAtual.total);
                        const resumo = criarResumoFinal();
                        atualizarStatus('✓ Concluído. Sem plano semanal: ' + relatorio.semPlano.length);
                        registrarLog(resumo);
                        alert(resumo);
                    }
    
                } catch (erro) {
    
                    console.error(
                        'SEGES v6.2:',
                        erro
                    );
    
                    atualizarStatus(
                        '❌ ' + erro.message
                    );
    
                    alert(
                        'Ocorreu um erro:\n\n' +
                        erro.message
                    );
    
                } finally {
    
                    executando = false;
    
                    iniciar.disabled = false;
    
                    iniciar.textContent =
                        '▶ Iniciar';
                }
            };
    
            const parar =
                document.createElement('button');
    
            parar.textContent =
                '■ Parar';
    
            parar.style.cssText = `
                padding: 8px;
    
                border: none;
                border-radius: 5px;
    
                background: #d32f2f;
                color: white;
    
                font-weight: bold;
    
                cursor: pointer;
            `;
    
            parar.onclick = () => {
    
                pararSolicitado = true;
    
                atualizarStatus(
                    'Parando após a operação atual...'
                );
            };
    
            botoes.appendChild(iniciar);
            botoes.appendChild(parar);
    
            painel.appendChild(botoes);
            instalarAcessoriosDoPainel(painel, cabecalho, botoes, status);
    
            document.body.appendChild(painel);
        }
    
        function criarTitulo(texto) {
    
            const titulo =
                document.createElement('div');
    
            titulo.textContent = texto;
    
            titulo.style.cssText = `
                font-weight: bold;
    
                color: #1976d2;
    
                margin-top: 4px;
                margin-bottom: 3px;
            `;
    
            return titulo;
        }
    
        function criarCheckbox(
            id,
            texto,
            marcado
        ) {
    
            const container =
                document.createElement('label');
    
            container.style.cssText = `
                display: flex;
                align-items: center;
    
                gap: 4px;
    
                cursor: pointer;
    
                min-width: 0;
            `;
    
            const checkbox =
                document.createElement('input');
    
            checkbox.type = 'checkbox';
    
            checkbox.id = id;
    
            checkbox.checked = marcado;
    
            container.appendChild(checkbox);
    
            const span =
                document.createElement('span');
    
            span.textContent = texto;
    
            span.style.cssText = `
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
    
            container.appendChild(span);
    
            return {
                container,
                checkbox
            };
        }
    
        // =========================================================
        // OBTÉM SELEÇÃO
        // =========================================================
    
        function obterSelecao() {
    
            // -----------------------------------------------------
            // TURMAS
            // -----------------------------------------------------
    
            const todasTurmas =
                document.getElementById(
                    'turmaTodas'
                )?.checked;
    
            let turmas = [];
    
            if (todasTurmas) {
    
                turmas =
                    (window.classrooms || [])
                        .map(t => t.name);
    
            } else {
    
                turmas =
                    [
                        ...document.querySelectorAll(
                            '#listaTurmasSeges61 input:checked'
                        )
                    ]
                    .map(cb => cb.dataset.turma)
                    .filter(Boolean);
            }
    
            // -----------------------------------------------------
            // MESES
            // -----------------------------------------------------
    
            const todosMeses =
                document.getElementById(
                    'mesTodos'
                )?.checked;
    
            let meses = [];
    
            if (todosMeses) {
    
                meses = [
                    'Janeiro',
                    'Fevereiro',
                    'Março',
                    'Abril',
                    'Maio',
                    'Junho',
                    'Julho',
                    'Agosto',
                    'Setembro',
                    'Outubro',
                    'Novembro',
                    'Dezembro'
                ];
    
            } else {
    
                meses =
                    [
                        ...document.querySelectorAll(
                            '#listaMesesSeges61 input:checked'
                        )
                    ]
                    .map(cb => cb.dataset.mes)
                    .filter(Boolean);
            }
    
            return {
                turmas,
                meses
            };
        }
    
        // =========================================================
        // STATUS
        // =========================================================
    
        function atualizarStatus(texto) {
    
            const status =
                document.getElementById(
                    'statusSeges61'
                );
    
            if (status) {
                status.textContent = texto;
            }
    
            registrarLog(texto);
        }
    
        // =========================================================
        // SELECIONAR TURMA
        // =========================================================
    
        async function selecionarTurma(nome) {
            contextoAtual.turma = nome;
            contextoAtual.mes = '';
            contextoAtual.periodo = '';
            contextoAtual.disciplina = '';
            atualizarTurmaAtual(nome);
    
            atualizarStatus(
                `Turma: ${nome}`
            );
    
            const controles =
                obterControlesSelect();
    
            if (!controles[0]) {
    
                throw new Error(
                    'Campo de turma não encontrado.'
                );
            }
    
            const controle =
                controles[0];
    
            controle.focus();
    
            controle.dispatchEvent(
                new MouseEvent(
                    'mousedown',
                    {
                        bubbles: true
                    }
                )
            );
    
            await wait(300);
    
            const opcoes =
                await esperar(() => {
    
                    const lista =
                        [
                            ...document.querySelectorAll(
                                'div.Select-option'
                            )
                        ]
                        .filter(visivel);
    
                    return lista.length
                        ? lista
                        : null;
    
                });
    
            const opcao =
                opcoes.find(
                    op =>
                        op.textContent.trim() === nome
                );
    
            if (!opcao) {
    
                throw new Error(
                    `Turma "${nome}" não encontrada.`
                );
            }
    
            eventosMouse(opcao);
    
            await wait(1200);
        }
    
        // =========================================================
        // ABRIR UM DROPDOWN E LER TODAS AS OPÇÕES
        // =========================================================
        //
        // O dropdown é tratado como uma LISTA.
        // Não assumimos que Janeiro é a primeira opção,
        // Fevereiro é a segunda etc.
        //
        // Isso é importante porque o SEGES pode não possuir
        // registros/aulas em determinados meses.
        // =========================================================
    
        async function abrirDropdownEObterOpcoes(controle) {
    
            controle.focus();
    
            controle.dispatchEvent(
                new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
    
            await wait(350);
    
            const opcoes = await esperar(() => {
    
                const lista = [
                    ...document.querySelectorAll(
                        'div.Select-option'
                    )
                ].filter(visivel);
    
                return lista.length ? lista : null;
            });
    
            return [...opcoes];
        }
    
        function fecharDropdown(controle) {
    
            controle.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27,
                    which: 27,
                    bubbles: true
                })
            );
        }
    
        // =========================================================
        // SELECIONAR MÊS
        // =========================================================
        //
        // O mês NÃO é selecionado pela posição da opção.
        //
        // O script:
        //
        // 1. Abre o dropdown.
        // 2. Lê TODAS as opções existentes.
        // 3. Examina cada opção.
        // 4. Procura uma opção cujo texto contenha
        //    o número do mês no formato usado pelo SEGES.
        // 5. Se não encontrar, considera que aquele mês
        //    não possui aula/registro e simplesmente pula.
        //
        // Portanto, se Janeiro não existir no dropdown,
        // o script não dá erro e segue para Fevereiro.
        // =========================================================
    
        async function selecionarMes(nomeMes) {
            contextoAtual.mes = nomeMes;
            contextoAtual.periodo = '';
            contextoAtual.disciplina = '';
    
            atualizarStatus(`Mês: ${nomeMes}`);
    
            const controles = obterControlesSelect();
    
            if (!controles[1]) {
                throw new Error('Campo de mês não encontrado.');
            }
    
            const controle = controles[1];
    
            const numerosMeses = {
                janeiro: 1,
                fevereiro: 2,
                marco: 3,
                abril: 4,
                maio: 5,
                junho: 6,
                julho: 7,
                agosto: 8,
                setembro: 9,
                outubro: 10,
                novembro: 11,
                dezembro: 12
            };
    
            const nomeNormalizado = nomeMes
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
    
            const numeroMes = numerosMeses[nomeNormalizado];
    
            if (!numeroMes) {
                throw new Error(`Mês inválido: ${nomeMes}`);
            }
    
            // -----------------------------------------------------
            // LÊ TODAS AS OPÇÕES DO DROPDOWN
            // -----------------------------------------------------
    
            const opcoes =
                await abrirDropdownEObterOpcoes(controle);
    
            console.log(
                'SEGES - TODAS as opções de mês encontradas:',
                opcoes.map(op => op.textContent.trim())
            );
    
            // -----------------------------------------------------
            // VARRE A LISTA INTEIRA
            // -----------------------------------------------------
            //
            // Não importa em qual posição o mês está.
            // Não importa se algum mês anterior não existe.
            // Procuramos pelo número real escrito na opção.
            // -----------------------------------------------------
    
            let opcaoEncontrada = null;
    
            for (const opcao of opcoes) {
    
                const textoOriginal =
                    opcao.textContent.trim();
    
                const texto =
                    textoOriginal.replace(/\s+/g, '');
    
                console.log(
                    `SEGES - examinando opção de mês: "${textoOriginal}"`
                );
    
                const match =
                    texto.match(/^(\d{1,2})\/\d{4}$/);
    
                if (!match) {
                    continue;
                }
    
                const numeroEncontrado =
                    Number(match[1]);
    
                if (numeroEncontrado === numeroMes) {
    
                    opcaoEncontrada = opcao;
    
                    break;
                }
            }
    
            // -----------------------------------------------------
            // MÊS NÃO EXISTE NO DROPDOWN
            // -----------------------------------------------------
    
            if (!opcaoEncontrada) {
    
                console.log(
                    `SEGES: nenhuma opção correspondente a ${nomeMes} foi encontrada.`
                );
    
                atualizarStatus(
                    `↷ ${nomeMes} sem registro no dropdown. Pulando...`
                );
    
                fecharDropdown(controle);
    
                await wait(300);
    
                return false;
            }
    
            // -----------------------------------------------------
            // MÊS ENCONTRADO
            // -----------------------------------------------------
    
            console.log(
                `SEGES: ${nomeMes} encontrado na lista → "${opcaoEncontrada.textContent.trim()}"`
            );
    
            contextoAtual.periodo = opcaoEncontrada.textContent.trim();
            eventosMouse(opcaoEncontrada);
    
            await esperarCarregamento();
    
            return true;
        }
    
        // =========================================================
        // =========================================================
        // ESPERAR CARREGAMENTO DO SEGES
        // =========================================================
    
        async function esperarCarregamento() {
    
            await wait(400);
    
            const inicio =
                Date.now();
    
            while (
                Date.now() - inicio <
                TIMEOUT
            ) {
    
                const spinner =
                    document.querySelector(
                        '#absences .fa-spinner'
                    );
    
                if (!spinner || !visivel(spinner)) {
                    break;
                }
    
                await wait(POLL);
            }
    
            await wait(700);
        }
    
        // =========================================================
        // OBTER TODAS AS DISCIPLINAS DO DROPDOWN
        // =========================================================
        //
        // O dropdown de disciplinas também é tratado como uma
        // LISTA DE OPÇÕES.
        //
        // Nunca usamos "opcoes[0]" para escolher a disciplina.
        // Primeiro lemos a lista inteira e guardamos o nome
        // de cada opção.
        // =========================================================
    
        async function obterDisciplinas() {
    
            atualizarStatus(
                'Lendo todas as disciplinas...'
            );
    
            const controles =
                obterControlesSelect();
    
            if (!controles[2]) {
    
                throw new Error(
                    'Campo de disciplina não encontrado.'
                );
            }
    
            const controle =
                controles[2];
    
            const opcoes =
                await abrirDropdownEObterOpcoes(controle);
    
            console.log(
                'SEGES - TODAS as opções de disciplina encontradas:',
                opcoes.map(op => op.textContent.trim())
            );
    
            const disciplinas = [];
    
            // -----------------------------------------------------
            // VARRE A LISTA INTEIRA
            // -----------------------------------------------------
    
            for (const opcao of opcoes) {
    
                const nome =
                    opcao.textContent.trim();
    
                console.log(
                    `SEGES - examinando disciplina: "${nome}"`
                );
    
                if (!nome) {
                    continue;
                }
    
                if (!disciplinas.includes(nome)) {
                    disciplinas.push(nome);
                }
            }
    
            // Fecha o dropdown sem selecionar uma opção.
    
            fecharDropdown(controle);
    
            await wait(300);
    
            if (!disciplinas.length) {
    
                throw new Error(
                    'Nenhuma disciplina encontrada no dropdown.'
                );
            }
    
            console.log(
                `SEGES: ${disciplinas.length} disciplinas encontradas:`,
                disciplinas
            );
    
            return disciplinas;
        }
    
        // =========================================================
        // SELECIONAR UMA DISCIPLINA PELO NOME
        // =========================================================
        //
        // Aqui também não usamos posição.
        //
        // O dropdown é aberto novamente, a lista inteira é
        // percorrida e a opção correspondente ao nome recebido
        // é localizada.
        // =========================================================
    
        async function selecionarDisciplina(nomeDisciplina) {
            contextoAtual.disciplina = nomeDisciplina;
    
            atualizarStatus(
                `Disciplina: ${nomeDisciplina}`
            );
    
            const controles =
                obterControlesSelect();
    
            if (!controles[2]) {
    
                throw new Error(
                    'Campo de disciplina não encontrado.'
                );
            }
    
            const controle =
                controles[2];
    
            const opcoes =
                await abrirDropdownEObterOpcoes(controle);
    
            console.log(
                `SEGES - procurando "${nomeDisciplina}" em ${opcoes.length} opções.`
            );
    
            let opcaoEncontrada = null;
    
            // -----------------------------------------------------
            // VARRE TODAS AS OPÇÕES
            // -----------------------------------------------------
    
            for (const opcao of opcoes) {
    
                const nomeOpcao =
                    opcao.textContent.trim();
    
                console.log(
                    `SEGES - examinando disciplina: "${nomeOpcao}"`
                );
    
                if (nomeOpcao === nomeDisciplina) {
    
                    opcaoEncontrada = opcao;
    
                    break;
                }
            }
    
            if (!opcaoEncontrada) {
    
                fecharDropdown(controle);
    
                await wait(300);
    
                throw new Error(
                    `Disciplina "${nomeDisciplina}" não encontrada no dropdown.`
                );
            }
    
            console.log(
                `SEGES: disciplina encontrada → "${nomeDisciplina}"`
            );
    
            eventosMouse(opcaoEncontrada);
    
            await esperarCarregamento();
    
            await esperar(
                () =>
                    document.querySelector(
                        '#absences table'
                    )
            );
    
            await wait(300);
        }
    
        // =========================================================
        // SELECIONAR E VALIDAR TODAS AS DISCIPLINAS
        // =========================================================
        //
        // Para cada mês:
        //
        // 1. Lê o dropdown completo.
        // 2. Cria uma lista das disciplinas existentes.
        // 3. Seleciona a primeira da lista pelo NOME.
        // 4. Valida as datas.
        // 5. Seleciona a próxima da lista pelo NOME.
        // 6. Continua até o final da lista.
        //
        // Assim, a quantidade e a ordem das disciplinas podem
        // mudar sem quebrar o processo.
        // =========================================================
    
        async function selecionarTodasDisciplinas() {
    
            const disciplinas =
                await obterDisciplinas();
    
            const totalDisciplinas =
                disciplinas.length;
    
            console.log(
                `SEGES: iniciando varredura de ${totalDisciplinas} disciplinas.`
            );
    
            for (
                let i = 0;
                i < disciplinas.length;
                i++
            ) {
    
                if (pararSolicitado) {
                    return;
                }
    
                const disciplina =
                    disciplinas[i];
    
                atualizarStatus(
                    `Disciplina ${i + 1}/${totalDisciplinas}: ${disciplina}`
                );
    
                await selecionarDisciplina(
                    disciplina
                );
    
                if (pararSolicitado) {
                    return;
                }
    
                await validarDatas();
                atualizarProgresso(progressoAtual.concluidos + (i + 1)/totalDisciplinas,progressoAtual.total);
    
                await wait(700);
            }
    
            console.log(
                `SEGES: todas as ${totalDisciplinas} disciplinas foram processadas.`
            );
        }
    
        // =========================================================
        // ENCONTRAR MODAL VISÍVEL
        // =========================================================
    
        function obterModalVisivel() {
    
            const modais =
                [
                    ...document.querySelectorAll(
                        '.modal'
                    )
                ];
    
            return (
                modais.find(visivel) ||
                null
            );
        }
    
        // =========================================================
        // ABRIR MODAL
        // =========================================================
    
        async function abrirModal(data) {
    
            data.click();
    
            return esperar(
                () =>
                    obterModalVisivel()
            );
        }
    
        // =========================================================
        // VALIDAR UMA DATA
        // =========================================================
    
    async function validarData(data, indice, total) {
    
        const texto = data.textContent.trim();
    
        atualizarStatus(
            `Data ${indice}/${total}: ${texto}`
        );
    
        console.log(
            `SEGES: abrindo dia ${texto}`
        );
    
        // =====================================================
        // 1. ABRE O DIA
        // =====================================================
    
        data.click();
    
        const modal = await esperar(() => {
            return obterModalVisivel();
        });
    
        await wait(500);
        const semPlanoSemanal = detectarSemPlanoSemanal(modal);
    
        // =====================================================
        // 2. PROCURA O BOTÃO "SIM"
        // =====================================================
    
        let botaoSim = null;
    
        const botoes = [
            ...modal.querySelectorAll('button')
        ].filter(visivel);
    
        botaoSim = botoes.find(botao => {
    
            return (
                botao.textContent
                    .trim()
                    .toLowerCase() === 'sim'
            );
    
        });
    
        // Fallback: botão verde contendo "Sim"
        if (!botaoSim) {
    
            botaoSim = botoes.find(botao => {
    
                const textoBotao =
                    botao.textContent
                        .trim()
                        .toLowerCase();
    
                return (
                    textoBotao.includes('sim') &&
                    botao.classList.contains('btn-success')
                );
    
            });
        }
    
        // =====================================================
        // 3. SE EXISTE "SIM"
        // =====================================================
    
        if (botaoSim && !semPlanoSemanal) {
    
            console.log(
                `SEGES: SIM encontrado → dia ${texto}`
            );
    
            botaoSim.click();
    
            /*
             * MUITO IMPORTANTE:
             *
             * O SEGES fecha o modal depois do "Sim".
             *
             * Portanto NÃO procuramos "Fechar" depois
             * de clicar em Sim.
             */
    
            await esperar(() => {
                return !obterModalVisivel();
            });
    
            await wait(700);
    
            relatorio.validados += 1;
            registrarLog('VALIDADO: ' + identificarDia(texto));
            console.log(
                `SEGES: dia ${texto} validado pelo SIM.`
            );
    
            return;
        }
    
        // =====================================================
        // 4. NÃO EXISTE "SIM"
        //
        // Nesse caso precisamos clicar em FECHAR.
        // =====================================================
    
        console.log(
            `SEGES: SIM não apareceu → procurando FECHAR no dia ${texto}`
        );
    
        // Primeiro tenta o botão Fechar do footer
        let botaoFechar =
            [
                ...modal.querySelectorAll(
                    '.modal-footer button[data-dismiss="modal"]'
                )
            ].find(visivel);
    
        // Segundo: qualquer botão com data-dismiss
        if (!botaoFechar) {
    
            botaoFechar =
                [
                    ...modal.querySelectorAll(
                        'button[data-dismiss="modal"]'
                    )
                ].find(visivel);
        }
    
        // Terceiro: procura pelo texto "Fechar"
        if (!botaoFechar) {
    
            botaoFechar =
                [
                    ...modal.querySelectorAll('button')
                ].find(botao => {
    
                    if (!visivel(botao)) {
                        return false;
                    }
    
                    return botao.textContent
                        .trim()
                        .toLowerCase()
                        .includes('fechar');
    
                });
        }
    
        // Quarto: botão X
        if (!botaoFechar) {
    
            botaoFechar =
                [
                    ...modal.querySelectorAll(
                        'button.close'
                    )
                ].find(visivel);
        }
    
        // =====================================================
        // 5. CLICA FECHAR
        // =====================================================
    
        if (botaoFechar) {
    
            console.log(
                `SEGES: FECHAR → dia ${texto}`
            );
    
            botaoFechar.click();
    
        } else {
    
            console.error(
                'Modal encontrado, mas nenhum botão de fechamento foi localizado:',
                modal
            );
    
            throw new Error(
                `Não encontrei o botão Fechar no dia ${texto}.`
            );
        }
    
        // =====================================================
        // 6. ESPERA O MODAL SUMIR
        // =====================================================
    
        const inicio = Date.now();
    
        while (
            Date.now() - inicio < TIMEOUT
        ) {
    
            if (!obterModalVisivel()) {
                break;
            }
    
            await wait(POLL);
        }
    
        await wait(500);
    
        const ocorrencia = identificarDia(texto);
        if (semPlanoSemanal) {
            relatorio.semPlano.push(ocorrencia);
            registrarLog('SEM PLANO SEMANAL: ' + ocorrencia);
            atualizarStatus('⚠ Dia sem plano semanal: ' + texto);
        } else {
            relatorio.revisao.push(ocorrencia);
            registrarLog('REVISAR: dia sem confirmação no modal: ' + ocorrencia);
            atualizarStatus('↷ Sem confirmação; verificar: ' + texto);
        }
    }
    
        // =========================================================
        // VALIDAR TODAS AS DATAS DA DISCIPLINA
        // =========================================================
    
        async function validarDatas() {
    
            const tabela =
                await esperar(
                    () =>
                        document.querySelector(
                            '#absences table'
                        )
                );
    
            // Só datas que aparecem como pendentes/warning.
            let datas =
                [
                    ...tabela.querySelectorAll(
                        'thead a.cell-warning'
                    )
                ].filter(visivel);
    
            // -----------------------------------------------------
            // Se não houver cell-warning, não força datas
            // aleatórias.
            // -----------------------------------------------------
    
            if (!datas.length) {
    
                atualizarStatus(
                    'Nenhuma data pendente encontrada.'
                );
    
                return;
            }
    
            // Copia os elementos para evitar problemas
            // caso a classe seja alterada depois da validação.
            datas = [...datas];
    
            console.log(
                'SEGES: datas:',
                datas.map(
                    d => d.textContent.trim()
                )
            );
    
            for (
                let i = 0;
                i < datas.length;
                i++
            ) {
    
                if (pararSolicitado) {
                    return;
                }
    
                await validarData(
                    datas[i],
                    i + 1,
                    datas.length
                );
            }
        }
    
        // =========================================================
        // PROCESSO COMPLETO
        // =========================================================
    
        async function executarProcesso(
            turmas,
            meses
        ) {
    
            const total =
                turmas.length * meses.length;
    
            let atual = 0;
    
            for (
                let t = 0;
                t < turmas.length;
                t++
            ) {
    
                if (pararSolicitado) return;
    
                const turma =
                    turmas[t];
    
                await selecionarTurma(
                    turma
                );
    
                for (
                    let m = 0;
                    m < meses.length;
                    m++
                ) {
    
                    if (pararSolicitado) return;
    
                    const mes =
                        meses[m];
    
                    atual++;
    
                    atualizarStatus(
                        `${atual}/${total} • ${turma} • ${mes}`
                    );
    
               const mesSelecionado = await selecionarMes(mes);
    
    if (pararSolicitado) return;
    
    // Se o mês não existe no SEGES,
    // pula para o próximo mês.
    if (!mesSelecionado) {
        relatorio.mesesIgnorados.push(turma + ' • ' + mes);
        registrarLog('MÊS INDISPONÍVEL: ' + turma + ' • ' + mes);
        progressoAtual.concluidos += 1;
        atualizarProgresso(progressoAtual.concluidos,progressoAtual.total);
        await wait(500);
        continue;
    }
    
    await selecionarTodasDisciplinas();
    
                    if (pararSolicitado) return;
    
                    // Cada disciplina já teve suas datas verificadas; não repetir a última.
                    progressoAtual.concluidos += 1;
                    atualizarProgresso(progressoAtual.concluidos,progressoAtual.total);
                    await wait(700);
                }
            }
        }
    
        // =========================================================
        // INICIAR
        // =========================================================
    
        async function iniciarModuloFaltas() {
          try {
            await wait(300);
            criarPainel();
          } catch (erro) {
            console.error('SEGES • Faltas:', erro);
            alert('Erro ao iniciar módulo de faltas:\n\n' + erro.message);
          }
        }
        if (document.readyState === 'complete') {
          iniciarModuloFaltas();
        } else {
          window.addEventListener('load', iniciarModuloFaltas, {once: true});
        }
    
    })();
  }

  function iniciarModuloPlanos() {
    (function () {
      'use strict';
    
      const STORAGE_KEY = 'vm_plano_semanal_automacao_v1';
      const REPORT_WINDOW_KEY = 'vm_plano_semanal_report_open';
      const PANEL_POSITION_KEY = 'vm_plano_semanal_panel_position';
      const PANEL_LOG_VISIBLE_KEY = 'vm_plano_semanal_panel_log_visible';
    
      const CONFIG = {
        manualDropdownMode: false,
        practiceRegex: /PR[ÁA]TICAS?\s+EXPERIMENTA(?:L|IS)(?:\s+DE\s+CI[ÊE]NCIAS)?/i,
        scienceRegex: /(CI[ÊE]NCIAS|BIOLOGIA)/i,
        electiveRegex: /ELETIVAS?/i,
        scientificThinkingRegex: /PENSAMENTO\s+CIENT[ÍI]FICO/i,
        projectLifeRegex: /PROJETO\s+DE\s+VIDA/i,
        guidedStudyRegex: /ESTUDO\s+ORIENTADO/i,
        protagonismClubRegex: /(PROTAGONISMO|CLUBE)/i,
        practiceText:
          'Aula ministrada com o conteúdo: aplicação de atividades com a metodologia de resolução de problemas e confecção de projetos elaborados em conformidade com o conteúdo ministrado semanalmente, para que os alunos tenham a oportunidade de realizar alguma tarefa ou observar algum experimento que mostre o conteúdo de forma prática e lúdica associado ao cotidiano dos estudantes.',
        electiveText:
          'Eletiva multisseriada ministrada com conteúdo interdisciplinar, visando fortalecer as disciplinas da base curricular (BNCC) por meio de uma abordagem integradora lúdica e em consonância com o Guia de Aprendizagem, avaliações diagnósticas e varal dos sonhos.',
        scientificThinkingText:
          'Planejamento e execução de materiais didáticos interativos, associados ao material estruturado de pensamento científico, acompanhado da exposição de documentários de divulgação científica.',
        projectLifeText:
          'Aula ministrada para a disciplina de Projeto de Vida, Com o conteúdo Multisseriado e interdisciplinar para fortalecer as disciplinas da base curricular (BNCC) por meio de uma abordagem integradora lúdica e em consonância com o Guia de Aprendizagem, avaliações diagnósticas e varal dos sonhos do projeto de vida dos estudantes.',
        guidedStudyText:
          'Aplicação de atividades enviadas previamente pelos demais professores de outras disciplinas, em consonância com as diretrizes e temáticas dispostas na BNCC e orientações curriculares da SEDU, através da metodologia de resolução de exercícios e estímulo ao protagonismo dos estudantes para resolução das atividades.',
        protagonismClubText:
          'Aula ministrada para a disciplina de Clube de Protagonismo com conteúdos desenvolvidos de acordo com o Material Estruturado, em consonância com o currículo e varal dos sonhos dos estudantes.',
        scanDelayMs: 110,
        applyDelayMs: 220,
        saveDelayMs: 520,
        navigationDelayMs: 170,
        selectPopulateTimeoutMs: 3800,
        selectRetryCount: 3,
        afterAbilityDelayMs: 720,
        afterKnowledgeDelayMs: 180,
        afterMethodologyDelayMs: 180,
        panelId: 'vm-plano-semanal-panel',
        modalId: 'vm-plano-semanal-modal',
        debugMode: false,
        maxWeeksPerRun: null,
        panelLogCount: 12
      };
    
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const qs = (sel, root = document) => root.querySelector(sel);
      const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    
      function normalizeText(text) {
        return String(text || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      }
    
      function decodeHtmlEntities(text) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = String(text || '');
        return textarea.value;
      }
    
      function getManualDisciplineProfile(discipline) {
        const rawDiscipline = String(discipline || '').trim();
        if (!rawDiscipline) return null;
    
        if (CONFIG.electiveRegex.test(rawDiscipline)) {
          return {
            kind: 'elective',
            reportKind: 'Eletiva',
            manualText: CONFIG.electiveText
          };
        }
    
        if (CONFIG.scientificThinkingRegex.test(rawDiscipline)) {
          return {
            kind: 'scientific_thinking',
            reportKind: 'Pensamento Científico',
            manualText: CONFIG.scientificThinkingText
          };
        }
    
        if (CONFIG.projectLifeRegex.test(rawDiscipline)) {
          return {
            kind: 'project_life',
            reportKind: 'Projeto de Vida',
            manualText: CONFIG.projectLifeText
          };
        }
    
        if (CONFIG.guidedStudyRegex.test(rawDiscipline)) {
          return {
            kind: 'guided_study',
            reportKind: 'Estudo Orientado',
            manualText: CONFIG.guidedStudyText
          };
        }
    
        if (CONFIG.protagonismClubRegex.test(rawDiscipline)) {
          return {
            kind: 'protagonism_club',
            reportKind: 'Clube/Protagonismo',
            manualText: CONFIG.protagonismClubText
          };
        }
    
        return null;
      }
    
      function loadState() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (error) {
          console.error('[VM Plano Semanal] Falha ao carregar estado:', error);
          return null;
        }
      }
    
      function saveState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    
      function clearState() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(REPORT_WINDOW_KEY);
      }
    
      function appendLog(state, message, extra = null) {
        if (!state.logs) state.logs = [];
        state.logs.push({
          at: new Date().toISOString(),
          message,
          extra
        });
        if (state.logs.length > 500) state.logs = state.logs.slice(-500);
        try {
          if (typeof renderPanel === 'function') setTimeout(() => { try { renderPanel(); } catch (_) {} }, 0);
        } catch (_) {}
      }
    
      function getUrl(url) {
        try {
          return new URL(url, location.origin);
        } catch {
          return null;
        }
      }
    
      function getCurrentWeekFromForm() {
        const hidden = qs('#weekly_plan_week');
        if (hidden && hidden.value) return Number(hidden.value);
    
        const url = getUrl(location.href);
        const week = url?.searchParams.get('week');
        if(week)return Number(week);
        const saved=loadState();
        const matching=(saved?.weeks||[]).filter(item=>{
          const known=getUrl(item.url);
          return known && known.pathname===location.pathname;
        });
        return matching.length===1?Number(matching[0].week):null;
      }
    
      function getCurrentClassroomId() {
        const hidden = qs('#classroom_id');
        if (hidden && hidden.value) return String(hidden.value);
        const url = getUrl(location.href);
        return url?.searchParams.get('classroom_id') || null;
      }
    
      function isClassroomsPage() {
        return !qs('#weekly_plan') && !!qsa('a[href*="/weekly_plans?classroom_id="]').length;
      }
    
      function isWeeksPage() {
        if (qs('#weekly_plan')) return false;
        if (location.pathname === '/weekly_plans' &&
            getUrl(location.href)?.searchParams.has('classroom_id')) return true;
        return !!qsa('a[href*="/weekly_plans/new"], a[href*="/weekly_plans/"][href*="/edit"]').length;
      }
    
      function isWeekFormPage() {
        return !!qs('#weekly_plan') && !!qs('input[type="submit"][value="Salvar"], input[name="commit"][value="Salvar"]');
      }

      function isPlannerLandingPage() {
        return location.pathname.startsWith('/weekly_plans') && !qs('#weekly_plan');
      }
    
      function uniqueBy(items, keyFn) {
        const seen = new Set();
        return items.filter((item) => {
          const key = keyFn(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    
      function parseJsonArrayMaybe(value) {
        if (!value) return [];
        const raw = decodeHtmlEntities(value).trim();
        if (!raw) return [];
    
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
        } catch {
          const withoutBrackets = raw.replace(/^\[/, '').replace(/\]$/, '');
          return withoutBrackets
            .split(',')
            .map((item) => item.replace(/^"|"$/g, '').replace(/^&quot;|&quot;$/g, '').trim())
            .filter(Boolean);
        }
      }
    
      function findPreferredMethod(available, preferredNames) {
        if (!available.length) return null;
        const normalizedMap = available.map((item) => ({ raw: item, key: normalizeText(item) }));
        for (const preferred of preferredNames) {
          const key = normalizeText(preferred);
          const exact = normalizedMap.find((entry) => entry.key === key);
          if (exact) return exact.raw;
          const partial = normalizedMap.find((entry) => entry.key.includes(key) || key.includes(entry.key));
          if (partial) return partial.raw;
        }
        return null;
      }
    
      function parseAbilityOptionsFromRow(row) {
        const addButton = qs('.add_fields[data-association-insertion-template]', row);
        if (!addButton) return [];
    
        const template = decodeHtmlEntities(addButton.getAttribute('data-association-insertion-template') || '');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = template;
    
        const abilitySelect = qs('.structured-weekly-plan-id-select', wrapper);
        if (!abilitySelect) return [];
    
        return uniqueBy(
          Array.from(abilitySelect.options)
            .filter((option) => option.value)
            .map((option) => ({
              value: String(option.value),
              label: String(option.textContent || '').trim(),
              knowledges: parseJsonArrayMaybe(option.getAttribute('data-knowledges')),
              methodologies: parseJsonArrayMaybe(option.getAttribute('data-methodologies')),
              descriptors: parseJsonArrayMaybe(option.getAttribute('data-descriptors'))
            }))
            .filter((item) => item.value && item.label),
          (item) => `${item.value}::${item.label}`
        );
      }
    
      async function extractAbilitiesFromPage(state) {
        const firstScienceRow = qsa('#weekly_plan tr.by-curriculum-discipline').find((tr) => {
          const discipline = (tr.querySelectorAll('td')[1]?.textContent || '').trim();
          return CONFIG.scienceRegex.test(discipline) && !getManualDisciplineProfile(discipline);
        });
        if (!firstScienceRow) return [];
    
        try {
          const block = await ensureStructuredBlock(firstScienceRow);
          initializeSelectsInRoot(block);
          const abilitySelect = qs('.structured-weekly-plan-id-select', block);
          if (!abilitySelect) return [];
    
          await waitFor(() => Array.from(abilitySelect.options || []).filter((opt) => opt.value).length > 0, 5000, 120);
    
          const abilities = uniqueBy(
            Array.from(abilitySelect.options)
              .filter((option) => option && option.value)
              .map((option) => ({
                value: String(option.value),
                label: String(option.textContent || '').trim(),
                knowledges: parseJsonArrayMaybe(option.getAttribute('data-knowledges') || option.dataset.knowledges),
                methodologies: parseJsonArrayMaybe(option.getAttribute('data-methodologies') || option.dataset.methodologies),
                descriptors: parseJsonArrayMaybe(option.getAttribute('data-descriptors') || option.dataset.descriptors)
              }))
              .filter((item) => item.value && item.label),
            (item) => `${item.value}::${item.label}`
          );
    
          return abilities;
        } catch (error) {
          appendLog(state, 'Falha ao extrair habilidades a partir da página.', { message: String(error?.message || error) });
          return [];
        }
      }
    
      function parseWeeksTable(root = document) {
        const rows = qsa('table.table.table-striped tbody tr.middle', root);
        return rows
          .map((tr) => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 4) return null;
            const link = qs('a.btn.btn-sm.btn-primary', tr);
            if (!link) return null;
            const href = link.getAttribute('href') || '';
            const url = safeSegesUrl(href);
            const week = Number((cells[0].textContent || '').trim());
            if (!url || Number.isNaN(week)) return null;
            return {
              week,
              period: (cells[1].textContent || '').trim(),
              statusLabel: (cells[2].textContent || '').trim(),
              url: url.href
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.week - b.week);
      }
    
    function getExistingFieldsInRow(tr) {
      const blocks = getVisibleStructuredBlocks(tr);
      const values = [];
      let knowledgeCount = 0;
      let methodologyCount = 0;
      let evaluation = '';
      for(const block of blocks) {
        const select = qs('.structured-weekly-plan-id-select',block);
        const value = String(select?.value||'').trim();
        if(value) values.push(value);
        knowledgeCount += getSelectedValues(qs('.structured-weekly-plan-knowledges-select',block)).length;
        methodologyCount += getSelectedValues(qs('.structured-weekly-plan-methodologies-select',block)).length;
        const evalSelect=qs('.structured-weekly-plan-evaluation-select',block);
        if(String(evalSelect?.value||'')==='true') evaluation='true';
        else if(String(evalSelect?.value||'')==='false'&&!evaluation) evaluation='false';
      }
      return {existingAbilityValue:values[0]||'',existingKnowledgeCount:knowledgeCount,existingMethodologyCount:methodologyCount,existingEvaluation:evaluation};
    }
    
      function parseStage(abilityLabel) {
  const raw=String(abilityLabel||'').toUpperCase().replace(/\s/g,'');
  const grade=raw.match(/EF(0[1-9])CI/);
  if(grade)return {stage:'fundamental',grade:Number(grade[1])};
  if(/EM13(?:CNT|LGG|CHS|MAT)/.test(raw))return {stage:'medio',grade:null};
  return {stage:'unknown',grade:null};
}

      function identifyClassStage(className) {
  const name=String(className||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let match=name.match(/(?:^|[\s_-])([6-9])\s*(?:[º°ª]|o)\s*\d?/i)||
    name.match(/(?:^|[\s_-])([6-9])\s*(?:ano|serie)\b/i);
  if(match)return {stage:'fundamental',grade:Number(match[1])};
  match=name.match(/(?:^|[\s_-])([1-3])\s*(?:[ªº°a]|o)?\s*(?:serie|ano)\b/i);
  if(match)return {stage:'medio',grade:Number(match[1])};
  return null;
}

      function extractAbilityOptionsForRow(row) {
  const template=parseAbilityOptionsFromRow(row);
  const blocks=getVisibleStructuredBlocks(row);
  const live=blocks.flatMap(block=>{
    const select=qs('.structured-weekly-plan-id-select',block);
    return Array.from(select?.options||[]).filter(opt=>opt.value).map(opt=>({
      value:String(opt.value),label:String(opt.textContent||'').trim(),
      knowledges:parseJsonArrayMaybe(opt.getAttribute('data-knowledges')||opt.dataset.knowledges),
      methodologies:parseJsonArrayMaybe(opt.getAttribute('data-methodologies')||opt.dataset.methodologies),
      descriptors:parseJsonArrayMaybe(opt.getAttribute('data-descriptors')||opt.dataset.descriptors)
    }));
  });
  const selected=new Map();
  for(const ability of [...template,...live]) {
    if(!ability.value||!ability.label)continue;
    const older=selected.get(ability.value);
    if(!older || (!older.knowledges?.length && ability.knowledges.length)) selected.set(ability.value,ability);
  }
  return Array.from(selected.values());
}

      function filterCompatibleAbilities(choices,className,forcedStage=null) {
  const detected=forcedStage||identifyClassStage(className);
  const all=(choices||[]).map(item=>({...item,detectedStage:parseStage(item.label)}));
  const known=all.filter(item=>item.detectedStage.stage!=='unknown');
  const stages=new Set(known.map(x=>x.detectedStage.stage+(x.detectedStage.grade||'')));
  let expected=detected;
  if(!expected&&stages.size===1&&known.length===all.length) {
    expected=known[0].detectedStage; // inferir somente se todos os códigos tiverem a mesma etapa
  }
  if(!expected)return {choices:all,automaticAllowed:false,stageName:'Etapa não identificada; seleção manual obrigatória'};
  const accepted=all.filter(item=>{
    const stage=item.detectedStage;
    if(stage.stage!==expected.stage)return false;
    if(expected.stage==='fundamental'&&expected.grade!==stage.grade)return false;
    return true;
  });
  return {
    choices:accepted,automaticAllowed:accepted.length>0,
    stageName:expected.stage==='medio'?'Ensino Médio':'Fundamental '+expected.grade+'º ano'
  };
}

      function parseCurrentWeekSummary() {
        const week = getCurrentWeekFromForm();
        const rows = qsa('#weekly_plan tr.by-curriculum-discipline').map((tr, index) => {
          const tds = tr.querySelectorAll('td');
          const lessonNumber = Number((tds[0]?.textContent || '').trim()) || index + 1;
          const discipline = (tds[1]?.textContent || '').trim();
          const dateInput = qs('input[name*="[date]"]', tr);
          const date = dateInput?.value || '';
          const manualTextarea = qs('textarea', tr);
          const manualProfile = getManualDisciplineProfile(discipline);
          const kind = CONFIG.practiceRegex.test(discipline)
            ? 'practice'
            : manualProfile?.kind
              ? manualProfile.kind
              : CONFIG.scienceRegex.test(discipline)
                ? 'science'
                : 'other';
    
          return {
            rowIndex: index,
            lessonNumber,
            discipline,
            date,
            kind,
            manualProfile,
            hasManual: !!manualTextarea,
            existingManualText: String(manualTextarea?.value || '').trim(),
            abilityChoices: kind==='science' ? extractAbilityOptionsForRow(tr) : [],
            ...getExistingFieldsInRow(tr)
          };
        });
    
        const firstScienceRow = qsa('#weekly_plan tr.by-curriculum-discipline').find((tr) => {
          const discipline = (tr.querySelectorAll('td')[1]?.textContent || '').trim();
          return CONFIG.scienceRegex.test(discipline) && !getManualDisciplineProfile(discipline);
        });
    
        const abilities = firstScienceRow ? parseAbilityOptionsFromRow(firstScienceRow) : [];
    
        return {
          week,
          classroomId: getCurrentClassroomId(),
          rows,
          scienceRows: rows.filter((row) => row.kind === 'science').length,
          practiceRows: rows.filter((row) => row.kind === 'practice').length,
          manualRows: rows.filter((row) => !!row.manualProfile).length,
          abilities
        };
      }
    
            function proposeFromRecentFive(previous, options) {
  const history=(previous||[]).slice(-5).filter(Boolean).map(String);
  const valid=options||[];
  if(!valid.length)return null;
  if(!history.length)return valid[0];
  const last=history[history.length-1];
  const index=valid.findIndex(item=>String(item.value)===last);
  if(index<0)return null; // Nunca recomeçar ao perder a habilidade anterior
  const repetitions=history.filter(value=>value===last).length;
  if(repetitions<3)return valid[index];
  return valid[Math.min(index+1,valid.length-1)]; // A última é permanente
}

      function buildExecutionPlan(state) {
  const summaries=state.weeks.map(item=>state.summaries[String(item.week)]).filter(Boolean);
  const selected=new Set((state.selectedWeeks||[]).map(Number));
  const plans={};
  const reports=[];
  const history=[];
  const skipped=[];
  let preserved=0;
  for(const summary of summaries) {
    const rows=summary.rows||[];
    const selectedWeek=selected.has(Number(summary.week));
    const existingScience=rows.filter(row=>row.kind==='science'&&row.existingAbilityValue);
    const latestExisting=existingScience.length ?
      String(existingScience[existingScience.length-1].existingAbilityValue) : '';
    if(!selectedWeek) {
      if(latestExisting)history.push(latestExisting);
      continue;
    }
    const instructions=[];
    plans[String(summary.week)]={week:summary.week,instructions};
    const firstEligible=rows.find(row=>row.kind==='science'&&!row.existingAbilityValue&&!row.existingManualText);
    const filtered=firstEligible ? filterCompatibleAbilities(firstEligible.abilityChoices,state.classroomName,state.classStage) : null;
    const recommended=latestExisting
      ? (filtered?.choices||[]).find(item=>String(item.value)===latestExisting)||null
      : filtered?.automaticAllowed ? proposeFromRecentFive(history,filtered.choices) : null;
    let weekProposedValue=String(latestExisting||recommended?.value||'');
    for(const row of rows) {
      if(row.kind==='practice'||row.manualProfile){
        if(row.existingManualText){preserved++;continue;}
        const profile=row.manualProfile||getManualDisciplineProfile(row.discipline);
        const manualText=row.kind==='practice'?CONFIG.practiceText:(profile?.manualText||'');
        if(!manualText)continue;
        instructions.push({kind:row.kind,rowIndex:row.rowIndex,date:row.date,discipline:row.discipline,manualText});
        reports.push({week:summary.week,rowIndex:row.rowIndex,date:row.date,discipline:row.discipline,
          kind:'Texto predefinido',ability:'',knowledge:'',methodologies:'',evaluation:'Não',manualText});
        continue;
      }
      if(row.kind!=='science')continue;
      if(row.existingManualText){preserved++;continue;}
      const compatible=filterCompatibleAbilities(row.abilityChoices,state.classroomName,state.classStage);
      const existingValue=String(row.existingAbilityValue||'');
      let candidate=compatible.choices.find(item=>String(item.value)===existingValue)||
        (compatible.automaticAllowed ? compatible.choices.find(item=>String(item.value)===weekProposedValue) : null);
      if(!existingValue&&!candidate&&compatible.automaticAllowed){
        candidate=proposeFromRecentFive(history,compatible.choices);
      }
      const abilityValue=existingValue||String(candidate?.value||'');
      const chosen=compatible.choices.find(item=>String(item.value)===abilityValue);
      if(!chosen && existingValue) {
        // Não modificar um preenchimento existente que não corresponda à etapa.
        skipped.push({week:summary.week,rowIndex:row.rowIndex,reason:'Habilidade existente fora das opções compatíveis.'});
        preserved++;
        continue;
      }
      if(!compatible.choices.length) {
        skipped.push({week:summary.week,rowIndex:row.rowIndex,reason:'Sem habilidades compatíveis com a etapa da aula.'});
        continue;
      }
      const instruction={
        kind:'science',rowIndex:row.rowIndex,weekForReport:summary.week,
        recentFive:history.slice(-5).map(value=>
          compatible.choices.find(ability=>String(ability.value)===String(value))?.label||String(value)),
        date:row.date,discipline:row.discipline,
        existingAbilityValue:existingValue,
        abilityValue:chosen?.value||'',abilityLabel:chosen?.label||'',
        availableAbilities:compatible.choices,
        stageName:compatible.stageName,
        automaticAllowed:compatible.automaticAllowed,
        knowledge:chosen?.knowledges?.[0]||'',
        methodologies:chosen?.methodologies?.length?[chosen.methodologies[0]]:[],
        evaluation:false,previouslySelected:!!existingValue,
        alreadyComplete:!!(existingValue&&row.existingKnowledgeCount &&
          (row.existingMethodologyCount||row.existingEvaluation==='true'))
      };
      instructions.push(instruction);
      reports.push({week:summary.week,rowIndex:row.rowIndex,date:row.date,discipline:row.discipline,
        kind:'Ciências/Biologia',ability:instruction.abilityLabel,
        knowledge:instruction.knowledge,methodologies:instruction.methodologies.join(' | '),
        evaluation:'Não',manualText:''});
    }
    if(weekProposedValue)history.push(weekProposedValue);
  }
  state.executionPlan=plans;
  state.reportRows=reports;
  state.applyWeeks=state.weeks.filter(week=>plans[String(week.week)]?.instructions.length);
  state.computed={weeksToFill:state.applyWeeks.length,selectedWeeks:selected.size,
    skipped,alreadyFilled:preserved,lastFiveHistory:history.slice(-5)};
  appendLog(state,'Sugestões preparadas a partir dos cinco planos anteriores; revisão obrigatória.',state.computed);
  return state;
}

      function initializeSelect2IfNeeded(select) {
        if (!select || !window.jQuery || !window.jQuery.fn || !window.jQuery.fn.select2) return;
        const $select = window.jQuery(select);
        if ($select.data('select2')) return;
    
        try {
          $select.select2({
            width: '100%'
          });
        } catch (error) {
          console.warn('[VM Plano Semanal] Falha ao inicializar select2:', error);
        }
      }
    
      function initializeSelectsInRoot(root) {
        qsa('select.select2-select', root).forEach((select) => initializeSelect2IfNeeded(select));
      }
    
      function isVisibleElement(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      }
    
      function getSelect2ModeFromContainer(container) {
        if (!container) return null;
        if (container.querySelector('.select2-selection') || container.classList.contains('select2-container--default')) return 'v4';
        if (container.querySelector('.select2-choice') || container.querySelector('.select2-choices') || container.classList.contains('select2-container-multi') || container.classList.contains('select2-container')) return 'v3';
        return null;
      }
    
      function getSelect2Dropdown() {
        const candidates = [
          ...Array.from(document.querySelectorAll('.select2-container--open')),
          ...Array.from(document.querySelectorAll('.select2-drop')),
          ...Array.from(document.querySelectorAll('.select2-dropdown'))
        ];
        return candidates.find((el) => isVisibleElement(el)) || null;
      }
    
      async function openSelect2Dropdown(select) {
        if (!select || !window.jQuery) return null;
        const $select = window.jQuery(select);
        const container = getSelect2Container(select);
        const mode = getSelect2ModeFromContainer(container);
    
        try {
          if (typeof $select.select2 === 'function' && $select.data('select2')) {
            $select.select2('open');
          }
        } catch (error) {
          // segue para o clique manual
        }
    
        let dropdown = await waitFor(() => getSelect2Dropdown(), 1200, 60);
        if (dropdown) return { dropdown, mode };
    
        const clickTargets = [
          container?.querySelector('.select2-selection'),
          container?.querySelector('.select2-choice'),
          container?.querySelector('.select2-choices'),
          container?.querySelector('.select2-search-choice + .select2-search-field input'),
          container
        ].filter(Boolean);
    
        for (const target of clickTargets) {
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          target.click();
          await sleep(160);
          dropdown = getSelect2Dropdown();
          if (dropdown) return { dropdown, mode: mode || getSelect2ModeFromContainer(container) };
        }
    
        return null;
      }
    
      async function setSelectValueViaPluginApi(select, desiredValues, multiple = false) {
        if (!select || !window.jQuery) return false;
        const resolvedValues = getResolvedOptionValues(select, desiredValues);
        if (!resolvedValues.length) return false;
    
        const $select = window.jQuery(select);
        if (!(typeof $select.select2 === 'function' && $select.data('select2'))) return false;
    
        try {
          $select.select2('val', multiple ? resolvedValues : resolvedValues[0]);
          $select.trigger('change');
          $select.trigger('change.select2');
        } catch (error) {
          return false;
        }
    
        await sleep(180);
        const selectedValues = getSelectedValues(select);
        return multiple
          ? resolvedValues.every((value) => selectedValues.includes(value))
          : selectedValues[0] === resolvedValues[0] || String(select.value) === resolvedValues[0];
      }
    
      function findBestMatchingOption(select, rawValue) {
        if (!select || !rawValue) return null;
        const targetKey = normalizeText(rawValue);
        const options = Array.from(select.options).filter((option) => String(option.value || '').trim());
    
        let match = options.find((option) => normalizeText(option.value) === targetKey || normalizeText(option.textContent || '') === targetKey);
        if (match) return match;
    
        match = options.find((option) => {
          const valueKey = normalizeText(option.value);
          const textKey = normalizeText(option.textContent || '');
          return valueKey.includes(targetKey) || targetKey.includes(valueKey) || textKey.includes(targetKey) || targetKey.includes(textKey);
        });
        return match || null;
      }
    
      function getResolvedOptionValues(select, desiredValues) {
        return (desiredValues || [])
          .filter(Boolean)
          .map((raw) => findBestMatchingOption(select, raw))
          .filter(Boolean)
          .map((option) => String(option.value));
      }
    
      function getSelectedValues(select) {
        return Array.from(select?.selectedOptions || []).map((option) => String(option.value)).filter(Boolean);
      }
    
      function rebuildSelectOptions(select, values) {
        if (!select) return;
        const unique = Array.from(new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean)));
        const currentValues = getSelectedValues(select);
        while (select.options.length) {
          select.remove(0);
        }
        unique.forEach((value) => {
          const option = new Option(value, value, false, currentValues.includes(value));
          select.add(option);
        });
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) {
          const $select = window.jQuery(select);
          try {
            $select.trigger('change');
            $select.trigger('change.select2');
          } catch (error) {
            console.warn('[VM Plano Semanal] Falha ao reconstruir opções do select:', error);
          }
        }
      }
    
      function setStructuredAbilityOptionData(option, ability) {
        if (!option || !ability) return;
        const knowledges = ability.knowledges || [];
        const methodologies = ability.methodologies || [];
        const descriptors = ability.descriptors || [];
        option.setAttribute('data-knowledges', JSON.stringify(knowledges));
        option.setAttribute('data-methodologies', JSON.stringify(methodologies));
        option.setAttribute('data-descriptors', JSON.stringify(descriptors));
        if (window.jQuery) {
          try {
            const $option = window.jQuery(option);
            $option.data('knowledges', knowledges);
            $option.data('methodologies', methodologies);
            $option.data('descriptors', descriptors);
          } catch (error) {
            console.warn('[VM Plano Semanal] Falha ao gravar .data() da habilidade:', error);
          }
        }
      }
    
      function getFallbackDesiredValues(select, preferredValues) {
        const preferred = (preferredValues || []).filter(Boolean);
        if (preferred.length) return preferred;
        const options = Array.from(select?.options || []).filter((option) => String(option.value || '').trim());
        if (!options.length) return [];
        if (options.length === 1) return [String(options[0].value)];
        return [];
      }
    
      function getDependentValuesFromAbilityOption(option, fallbackAbility = null) {
        const read = (attr, fallback) => {
          const raw = option?.getAttribute(attr);
          const parsed = parseJsonArrayMaybe(raw);
          return parsed.length ? parsed : (fallback || []);
        };
    
        return {
          descriptors: read('data-descriptors', fallbackAbility?.descriptors || []),
          knowledges: read('data-knowledges', fallbackAbility?.knowledges || []),
          methodologies: read('data-methodologies', fallbackAbility?.methodologies || [])
        };
      }
    
      function syncSelectValueNow(select, desiredValues, multiple = false) {
        if (!select) return false;
        const resolvedValues = getResolvedOptionValues(select, desiredValues);
        if (!resolvedValues.length) return false;
    
        if (multiple) {
          Array.from(select.options).forEach((option) => {
            option.selected = resolvedValues.includes(String(option.value));
          });
        } else {
          select.value = resolvedValues[0];
          Array.from(select.options).forEach((option) => {
            option.selected = String(option.value) === resolvedValues[0];
          });
        }
    
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
    
        if (window.jQuery) {
          try {
            const $select = window.jQuery(select);
            $select.val(multiple ? resolvedValues : resolvedValues[0]);
            $select.trigger('change');
            $select.trigger('change.select2');
          } catch (error) {
            console.warn('[VM Plano Semanal] Falha ao sincronizar valor do select:', error);
          }
        }
    
        const selectedValues = getSelectedValues(select);
        return multiple
          ? resolvedValues.every((value) => selectedValues.includes(value))
          : selectedValues[0] === resolvedValues[0] || String(select.value) === resolvedValues[0];
      }
    
      async function syncSelectValueStable(select, desiredValues, multiple = false) {
        if (!select) return false;
        const desired = getFallbackDesiredValues(select, desiredValues);
        if (!desired.length) return true;
    
        const resolvedValues = getResolvedOptionValues(select, desired);
        if (!resolvedValues.length) return false;
    
        if (multiple) {
          Array.from(select.options).forEach((option) => {
            option.selected = resolvedValues.includes(String(option.value));
          });
        } else {
          Array.from(select.options).forEach((option) => {
            option.selected = String(option.value) === resolvedValues[0];
          });
          select.value = resolvedValues[0];
        }
    
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
    
        if (window.jQuery) {
          try {
            const $select = window.jQuery(select);
            $select.val(multiple ? resolvedValues : resolvedValues[0]);
            $select.trigger('input');
            $select.trigger('change');
            $select.trigger('change.select2');
          } catch (error) {
            console.warn('[VM Plano Semanal] Falha ao sincronizar select de forma estável:', error);
          }
        }
    
        await sleep(350);
        const selectedValues = getSelectedValues(select);
        return multiple
          ? resolvedValues.every((value) => selectedValues.includes(value))
          : selectedValues[0] === resolvedValues[0] || String(select.value) === resolvedValues[0];
      }
    
      function forcePopulateDependentSelects(block, ability = null) {
        if (!block) return { descriptorsSelect: null, knowledgesSelect: null, methodologiesSelect: null };
    
        const abilitySelect = qs('.structured-weekly-plan-id-select', block);
        const selectedOption = abilitySelect?.selectedOptions?.[0] || null;
        const dependentValues = getDependentValuesFromAbilityOption(selectedOption, ability);
    
        const descriptorsSelect = qs('.structured-weekly-plan-descriptors-select', block);
        const knowledgesSelect = qs('.structured-weekly-plan-knowledges-select', block);
        const methodologiesSelect = qs('.structured-weekly-plan-methodologies-select', block);
    
        if (descriptorsSelect && !hasAnyConcreteOption(descriptorsSelect) && dependentValues.descriptors.length) {
          rebuildSelectOptions(descriptorsSelect, dependentValues.descriptors);
        }
        if (knowledgesSelect && !hasAnyConcreteOption(knowledgesSelect) && dependentValues.knowledges.length) {
          rebuildSelectOptions(knowledgesSelect, dependentValues.knowledges);
        }
        if (methodologiesSelect) {
          methodologiesSelect.disabled = false;
          if (!hasAnyConcreteOption(methodologiesSelect) && dependentValues.methodologies.length) {
            rebuildSelectOptions(methodologiesSelect, dependentValues.methodologies);
          }
        }
    
        initializeSelectsInRoot(block);
        return { descriptorsSelect, knowledgesSelect, methodologiesSelect };
      }
    
      function getSelect2Container(select) {
        if (!select || !select.id) return select?.nextElementSibling?.classList?.contains('select2') ? select.nextElementSibling : null;
        const byId = document.querySelector(`span.select2[aria-labelledby="select2-${CSS.escape(select.id)}-container"]`);
        if (byId) return byId;
        const next = select.nextElementSibling;
        if (next && next.classList && next.classList.contains('select2')) return next;
        return null;
      }
    
    
      async function selectValuesViaSelect2(select, desiredValues, multiple = false) {
        if (!select) return false;
        const desired = (desiredValues || []).filter(Boolean);
        if (!desired.length) return false;
    
        const resolvedValues = getResolvedOptionValues(select, desired);
        const desiredNorm = desired.map((item) => normalizeText(item));
        const container = getSelect2Container(select);
    
        const clearCurrent = () => {
          if (window.jQuery) {
            try {
              const $select = window.jQuery(select);
              if (typeof $select.select2 === 'function' && $select.data('select2')) {
                $select.val(multiple ? [] : null).trigger('change');
              }
            } catch (error) {
              console.warn('[VM Plano Semanal] Falha ao limpar select2:', error);
            }
          }
          Array.from(select.options).forEach((option) => { option.selected = false; });
          select.dispatchEvent(new Event('change', { bubbles: true }));
        };
    
        clearCurrent();
        await sleep(180);
    
        for (let i = 0; i < desired.length; i += 1) {
          const opened = await openSelect2Dropdown(select);
          if (!opened?.dropdown) return false;
          const dropdown = opened.dropdown;
          const mode = opened.mode || getSelect2ModeFromContainer(container) || 'v4';
    
          const optionEl = await waitFor(() => {
            const selector = mode === 'v4'
              ? '.select2-container--open .select2-results__option, .select2-results__option'
              : '.select2-drop .select2-results li, .select2-dropdown .select2-results li, .select2-results li, .select2-results__option';
            const options = Array.from(document.querySelectorAll(selector))
              .filter((el) => isVisibleElement(el))
              .filter((el) => !el.classList.contains('select2-results__message'))
              .filter((el) => !el.classList.contains('select2-disabled'))
              .filter((el) => el.getAttribute('aria-disabled') !== 'true');
    
            const exact = options.find((el) => {
              const key = normalizeText(el.textContent || '');
              return key === desiredNorm[i] || key.includes(desiredNorm[i]) || desiredNorm[i].includes(key);
            });
            if (exact) return exact;
            if (options.length === 1) return options[0];
            return null;
          }, 3200, 100);
    
          if (!optionEl) {
            document.body.click();
            return false;
          }
    
          const clickTarget = optionEl.querySelector('.select2-result-label') || optionEl;
          clickTarget.scrollIntoView({ block: 'nearest' });
          clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          await sleep(40);
          clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await sleep(420);
    
          if (!multiple) break;
        }
    
        await sleep(260);
        const selectedValues = getSelectedValues(select);
        if (multiple) {
          if (resolvedValues.length && resolvedValues.every((value) => selectedValues.includes(value))) return true;
        } else {
          if (resolvedValues[0] && (selectedValues[0] === resolvedValues[0] || String(select.value) === resolvedValues[0])) return true;
        }
    
        return syncSelectValueNow(select, desired, multiple);
      }
    
      async function clickSelect2OptionByText(select, desiredValues, multiple = false) {
        if (!select) return false;
        const desired = (desiredValues || []).filter(Boolean);
        if (!desired.length) return false;
    
        const resolvedValues = getResolvedOptionValues(select, desired);
    
        for (const wanted of desired) {
          const opened = await openSelect2Dropdown(select);
          if (!opened?.dropdown) return false;
          const dropdown = opened.dropdown;
    
          const optionEl = await waitFor(() => {
            const options = Array.from(document.querySelectorAll('.select2-results li, .select2-results__option'))
              .filter((el) => isVisibleElement(el))
              .filter((el) => !el.classList.contains('select2-results__message'))
              .filter((el) => !el.classList.contains('select2-disabled'))
              .filter((el) => el.getAttribute('aria-disabled') !== 'true');
    
            const wantedKey = normalizeText(wanted);
            const exact = options.find((el) => {
              const key = normalizeText(el.textContent || '');
              return key === wantedKey || key.includes(wantedKey) || wantedKey.includes(key);
            });
            if (exact) return exact;
            if (options.length === 1) return options[0];
            return null;
          }, 3200, 100);
    
          if (!optionEl) {
            document.body.click();
            return false;
          }
    
          optionEl.scrollIntoView({ block: 'nearest' });
          const clickTarget = optionEl.querySelector('.select2-result-label') || optionEl;
          clickTarget.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          await sleep(40);
          clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await sleep(420);
    
          if (!multiple) break;
        }
    
        await sleep(260);
        const selectedValues = getSelectedValues(select);
        if (multiple) {
          if (resolvedValues.length && resolvedValues.every((value) => selectedValues.includes(value))) return true;
        } else {
          if (resolvedValues[0] && (selectedValues[0] === resolvedValues[0] || String(select.value) === resolvedValues[0])) return true;
        }
    
        return syncSelectValueNow(select, desired, multiple);
      }
      async function populateSelectRobust(select, desiredValues, multiple = false) {
        if (!select) return false;
        const desired = getFallbackDesiredValues(select, desiredValues);
        if (!desired.length) return true;
    
        initializeSelect2IfNeeded(select);
    
        for (let attempt = 0; attempt < CONFIG.selectRetryCount; attempt += 1) {
          const resolvedValues = getResolvedOptionValues(select, desired);
          if (!resolvedValues.length) {
            await sleep(320);
            continue;
          }
    
          const directOk = await syncSelectValueStable(select, desired, multiple);
          if (directOk) return true;
    
          const pluginOk = await setSelectValueViaPluginApi(select, desired, multiple);
          if (pluginOk) return true;
    
          if (attempt >= Math.max(1, CONFIG.selectRetryCount - 2)) {
            const clickedOk = await clickSelect2OptionByText(select, desired, multiple);
            if (clickedOk) return true;
    
            const select2Ok = await selectValuesViaSelect2(select, desired, multiple);
            if (select2Ok) return true;
          }
    
          await sleep(320);
        }
    
        return false;
      }
    
      function hasAnyConcreteOption(select) {
        return Array.from(select?.options || []).some((option) => String(option.value || '').trim());
      }
    
      function hasExpectedOptions(select, expectedValues) {
        if (!select) return false;
        const expected = (expectedValues || []).filter(Boolean);
        if (!expected.length) return hasAnyConcreteOption(select) || !select.multiple;
        const resolved = getResolvedOptionValues(select, expected);
        return resolved.length >= expected.length;
      }
    
      async function waitForSelectOptions(select, expectedValues, timeoutMs = CONFIG.selectPopulateTimeoutMs) {
        if (!select) return null;
        initializeSelect2IfNeeded(select);
    
        return waitFor(() => {
          if (!select || select.disabled) return null;
          if (!hasAnyConcreteOption(select)) return null;
          if (!(expectedValues || []).filter(Boolean).length) return select;
          return hasExpectedOptions(select, expectedValues) ? select : null;
        }, timeoutMs, 140);
      }
    
      async function waitForStableConcreteOptions(select, expectedValues = [], timeoutMs = 5000, stableMs = 600) {
        if (!select) return null;
        const started = Date.now();
        let lastSignature = '';
        let stableSince = 0;
        while (Date.now() - started < timeoutMs) {
          const options = Array.from(select.options || []).filter((option) => String(option.value || '').trim());
          const signature = options.map((option) => `${option.value}::${option.textContent || ''}`).join('||');
          const hasExpected = !(expectedValues || []).filter(Boolean).length || hasExpectedOptions(select, expectedValues);
          if (options.length && hasExpected) {
            if (signature !== lastSignature) {
              lastSignature = signature;
              stableSince = Date.now();
            } else if (stableSince && (Date.now() - stableSince) >= stableMs) {
              return select;
            }
          } else {
            lastSignature = '';
            stableSince = 0;
          }
          await sleep(120);
        }
        return null;
      }
    
    
      function getSelectDebugSnapshot(select) {
        if (!select) return { exists: false };
        const options = Array.from(select.options || []).map((option) => ({
          value: String(option.value || ''),
          text: String(option.textContent || '').trim(),
          selected: !!option.selected
        }));
        return {
          exists: true,
          id: select.id || null,
          name: select.name || null,
          disabled: !!select.disabled,
          multiple: !!select.multiple,
          optionCount: options.length,
          options: options.slice(0, 30),
          selectedValues: getSelectedValues(select),
          rawValue: select.value
        };
      }
    
      function logSelectSnapshot(state, label, select, desiredValues = [], context = {}) {
        appendLog(state, label, {
          ...context,
          desiredValues,
          snapshot: getSelectDebugSnapshot(select)
        });
      }
    
      async function directSelectAndVerify(state, label, select, desiredValues, multiple = false, context = {}) {
        const desired = getFallbackDesiredValues(select, desiredValues);
        logSelectSnapshot(state, `${label} - antes da seleção`, select, desired, context);
    
        if (!desired.length) {
          appendLog(state, `${label} - nenhum valor desejado; seguindo sem seleção.`, context);
          return true;
        }
    
        const directOk = await syncSelectValueStable(select, desired, multiple);
        logSelectSnapshot(state, `${label} - após syncSelectValueStable (${directOk ? 'ok' : 'falhou'})`, select, desired, context);
        if (directOk) return true;
    
        const pluginOk = await setSelectValueViaPluginApi(select, desired, multiple);
        logSelectSnapshot(state, `${label} - após setSelectValueViaPluginApi (${pluginOk ? 'ok' : 'falhou'})`, select, desired, context);
        if (pluginOk) return true;
    
        const nowOk = syncSelectValueNow(select, desired, multiple);
        logSelectSnapshot(state, `${label} - após syncSelectValueNow (${nowOk ? 'ok' : 'falhou'})`, select, desired, context);
        if (nowOk) return true;
    
        appendLog(state, `${label} - seleção direta falhou; tentando clique visual como último recurso.`, context);
        const clickedOk = await clickSelect2OptionByText(select, desired, multiple) || await selectValuesViaSelect2(select, desired, multiple);
        logSelectSnapshot(state, `${label} - após clique visual (${clickedOk ? 'ok' : 'falhou'})`, select, desired, context);
        return clickedOk;
      }
    
      async function ensureSelectHasExpectedOptions(state, select, expectedValues, fallbackValues, label, context = {}) {
        if (!select) return null;
    
        let readySelect = await waitForSelectOptions(select, expectedValues, CONFIG.selectPopulateTimeoutMs);
        if (readySelect) return readySelect;
    
        if ((fallbackValues || []).length) {
          appendLog(state, `Fallback: reconstruindo opções de ${label}.`, {
            ...context,
            fallbackCount: fallbackValues.length
          });
          rebuildSelectOptions(select, fallbackValues);
          await sleep(180);
          readySelect = await waitForSelectOptions(select, expectedValues, 2200);
          if (readySelect) return readySelect;
        }
    
        return select;
      }
    
      function setTextareaValue(textarea, value) {
        if (!textarea) return;
        textarea.value = value;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    
      function getVisibleStructuredBlocks(row) {
        return qsa('.nested-fields', row).filter((el) => {
          if (el.style.display === 'none') return false;
          if (el.hidden) return false;
          const destroyInput = qs('input[name$="[_destroy]"]', el);
          return !destroyInput || destroyInput.value !== 'true';
        });
      }
    
      async function waitFor(predicate, timeoutMs = 5000, intervalMs = 100) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
          const result = predicate();
          if (result) return result;
          await sleep(intervalMs);
        }
        return null;
      }
    
      async function ensureStructuredBlock(row) {
        let blocks = getVisibleStructuredBlocks(row);
        if (blocks.length) {
          initializeSelectsInRoot(blocks[blocks.length - 1]);
          return blocks[blocks.length - 1];
        }
    
        const addButton = qs('.add_fields', row);
        if (!addButton) {
          throw new Error('Botão "Adicionar currículo estruturado" não encontrado.');
        }
    
        addButton.click();
        blocks = await waitFor(() => getVisibleStructuredBlocks(row), 5000, 100);
        if (!blocks || !blocks.length) {
          throw new Error('Não foi possível criar o bloco de currículo estruturado.');
        }
    
        const block = blocks[blocks.length - 1];
        await sleep(180);
        initializeSelectsInRoot(block);
        return block;
      }
    
      function getAbilityFromState(state, abilityValue) {
        return (state.abilities || []).find((ability) => String(ability.value) === String(abilityValue)) || null;
      }
    
      async function selectExactPresent(select,value,label) {
  if(!select)throw Error(label+': campo ausente.');
  const wanted=String(value);
  const option=Array.from(select.options||[]).find(opt=>String(opt.value)===wanted);
  if(!option)throw Error(label+': opção '+wanted+' não existe neste formulário.');
  if(select.multiple){
    Array.from(select.options).forEach(opt=>{opt.selected=String(opt.value)===wanted;});
  }else{
    select.value=wanted;
  }
  select.dispatchEvent(new Event('input',{bubbles:true}));
  select.dispatchEvent(new Event('change',{bubbles:true}));
  if(window.jQuery){
    window.jQuery(select).trigger('change');
    window.jQuery(select).trigger('change.select2');
  }
  if(!getSelectedValues(select).includes(wanted)&&String(select.value)!==wanted)
    throw Error(label+': o SEGES rejeitou a seleção.');
}

      async function chooseExactDependent(select,value,label) {
  if(!value)return;
  if(!select)throw Error(label+': campo não encontrado.');
  const key=normalizeText(value);
  const found=await waitFor(()=>Array.from(select.options||[]).find(opt=>
    String(opt.value)===String(value)||normalizeText(opt.textContent)===key),5500,120);
  if(!found)throw Error(label+': opção prevista não foi disponibilizada pelo SEGES.');
  select.disabled=false;
  selectExactPresent(select,found.value,label);
  await sleep(120);
  if(!getSelectedValues(select).includes(String(found.value)))
    throw Error(label+': valor não permaneceu selecionado.');
}

      async function applyInstructionToRow(state,rowElement,instruction) {
  if(instruction.kind!=='science'){
    const textarea=qs('textarea',rowElement);
    if(!textarea)throw Error('Campo de texto não encontrado na aula '+(instruction.rowIndex+1));
    if(instruction.manualText&&!String(textarea.value||'').trim())
      setTextareaValue(textarea,instruction.manualText);
    return;
  }
  if(!state.approvedAt)throw Error('Não houve aprovação das habilidades.');
  if(!instruction.abilityValue)throw Error('Aula sem habilidade selecionada na revisão.');
  const available=(instruction.availableAbilities||[]).find(
    value=>String(value.value)===String(instruction.abilityValue)
  );
  if(!available)throw Error('A habilidade aprovada não pertence à lista autorizada da aula.');

  // Reabrir apenas as opções existentes na aula real; nunca injetar uma nova opção.
  const liveChoices=extractAbilityOptionsForRow(rowElement);
  if(!liveChoices.some(item=>String(item.value)===String(instruction.abilityValue)))
    throw Error('A habilidade '+instruction.abilityValue+' não está disponível nesta aula. Verifique a etapa escolar.');

  const existing=getVisibleStructuredBlocks(rowElement);
  const target=String(instruction.abilityValue);
  const before=String(instruction.existingAbilityValue||'');
  let block=existing.find(part=>String(qs('.structured-weekly-plan-id-select',part)?.value||'')===target);
  if(!block&&instruction.replaceExisting&&before)
    block=existing.find(part=>String(qs('.structured-weekly-plan-id-select',part)?.value||'')===before);
  if(!block)
    block=existing.find(part=>!String(qs('.structured-weekly-plan-id-select',part)?.value||'').trim());
  if(!block){
    const button=qs('.add_fields',rowElement);
    if(!button)throw Error('Não foi encontrado controle oficial para adicionar currículo nesta aula.');
    const oldCount=existing.length;
    button.click();
    block=await waitFor(()=>getVisibleStructuredBlocks(rowElement).length>oldCount?
      getVisibleStructuredBlocks(rowElement).at(-1):null,5000,100);
    if(!block)throw Error('O SEGES não criou o bloco curricular da aula.');
  }
  initializeSelectsInRoot(block);
  const abilitySelect=qs('.structured-weekly-plan-id-select',block);
  if(!abilitySelect)throw Error('Seletor da habilidade não localizado na aula.');
  const current=String(abilitySelect.value||'').trim();
  if(current&&current!==target&&!instruction.replaceExisting)
    throw Error('Uma habilidade já registrada seria substituída sem autorização.');
  if(instruction.replaceExisting && current!==before)
    throw Error('A habilidade existente mudou após a conferência. Recomece a revisão.');

  const option=await waitFor(()=>Array.from(abilitySelect.options||[])
    .find(item=>String(item.value)===target),5000,120);
  if(!option)throw Error('A habilidade aprovada não está na lista atual do SEGES: '+target);
  if(current!==target){
    selectExactPresent(abilitySelect,target,'Habilidade');
    await sleep(CONFIG.afterAbilityDelayMs);
  }

  let knowledgeSelect=qs('.structured-weekly-plan-knowledges-select',block);
  let methodSelect=qs('.structured-weekly-plan-methodologies-select',block);
  const evalSelect=qs('.structured-weekly-plan-evaluation-select',block);
  const replacing=!!instruction.replaceExisting;
  if(replacing){
    for(const field of [knowledgeSelect,methodSelect]){
      if(!field)continue;
      Array.from(field.options||[]).forEach(opt=>{opt.selected=false;});
      if(!field.multiple)field.value='';
      field.dispatchEvent(new Event('change',{bubbles:true}));
      if(window.jQuery)window.jQuery(field).trigger('change');
    }
  }

  knowledgeSelect=await waitFor(()=>qs('.structured-weekly-plan-knowledges-select',block),2500,100)||knowledgeSelect;
  methodSelect=await waitFor(()=>qs('.structured-weekly-plan-methodologies-select',block),2500,100)||methodSelect;
  if(!getSelectedValues(knowledgeSelect).length && instruction.knowledge)
    await chooseExactDependent(knowledgeSelect,instruction.knowledge,'Objeto de conhecimento');
  if(!getSelectedValues(methodSelect).length && instruction.methodologies?.length)
    await chooseExactDependent(methodSelect,instruction.methodologies[0],'Metodologia');

  if(evalSelect && (!current||replacing)){
    const wanted=instruction.evaluation?'true':'false';
    if(Array.from(evalSelect.options||[]).some(opt=>String(opt.value)===wanted))
      selectExactPresent(evalSelect,wanted,'Avaliação');
  }
}

      function getWeekPlanForCurrentPage(state) {
        const currentWeek = getCurrentWeekFromForm();
        if (currentWeek == null) return null;
        return state.executionPlan?.[String(currentWeek)] || null;
      }
    
      async function finishBatchClass(state){
 const batch=state.batch;
 if(!batch){
  state.status='done';state.finishedAt=new Date().toISOString();
  saveState(state);renderPanel();if(state.reportRows?.length)openReportModal(state);return;
 }
 const job=batch.jobs[batch.index];
 if(!job)throw Error('Não foi possível identificar a turma atual do lote.');
 batch.results.push({
  classroomId:job.id,classroomName:job.name,
  weeksScanned:state.weeks.length,selectedWeeks:state.selectedWeeks.length,
  weeksCompleted:state.applyWeeks?.length||0,filledRows:state.reportRows?.length||0,
  logs:(state.logs||[]).map(entry=>({...entry})),
  rows:(state.reportRows||[]).map((row)=>({...row,classroomName:job.name,classroomId:job.id}))
 });
 if(batch.index+1<batch.jobs.length){
  batch.index++;
  const next=createBatchClassState(batch);
  appendLog(next,'Iniciando próxima turma.',{current:batch.index+1,total:batch.jobs.length,name:next.classroomName});
  saveState(next);renderPanel();location.href=next.weeks[0].url;return;
 }
 state.status='done';state.finishedAt=new Date().toISOString();
 state.reportRows=batch.results.flatMap((entry)=>entry.rows);
 state.logs=batch.results.flatMap((entry)=>entry.logs||[]).slice(-499);
 state.computed={...state.computed,totalClasses:batch.jobs.length,
  scannedWeeks:batch.results.reduce((n,r)=>n+r.weeksScanned,0),
  totalFilledWeeks:batch.results.reduce((n,r)=>n+r.weeksCompleted,0),
  totalFilledRows:batch.results.reduce((n,r)=>n+r.filledRows,0)};
 appendLog(state,'Processamento das turmas finalizado.',{
  turmas:state.computed.totalClasses,semanasComLacunas:state.computed.totalFilledWeeks,linhasPropostas:state.computed.totalFilledRows
 });
 saveState(state);renderPanel();
 if(state.reportRows.length){
  localStorage.removeItem(REPORT_WINDOW_KEY);openReportModal(state);
 }else{
  alert('Leitura concluída: nenhuma lacuna foi identificada nas semanas selecionadas.');
 }
}

      function pausePlan(state,reason,details={}) {
  state.status='paused';
  state.lastError=String(reason||'Falha desconhecida');
  state.pausedAt=new Date().toISOString();
  state.waitingReturn=false;
  appendLog(state,'PROCESSAMENTO INTERROMPIDO: '+state.lastError,details);
  saveState(state);
  renderPanel();
}

      function isSegesFormError() {
  const messages=qsa('.alert-danger, .alert.alert-error, .invalid-feedback, .has-error .help-block, #error_explanation, .field_with_errors')
    .filter(el=>isVisibleElement(el))
    .map(el=>String(el.innerText||el.textContent||'').trim()).filter(Boolean);
  return messages.join(' | ').slice(0,900);
}

      async function handleScanPage(state) {
        const currentWeek = getCurrentWeekFromForm();
        const currentClassroom=getCurrentClassroomId();
        if(currentClassroom && String(currentClassroom)!==String(state.classroomId))
          throw Error('Turma diferente da esperada; execução interrompida.');
        const expectedWeek = state.weeks[state.scanIndex]?.week;
        if (currentWeek !== expectedWeek) {
          pausePlan(state,'Semana diferente da prevista no mapeamento.',{currentWeek,expectedWeek});
          return;
        }
    
        const summary = parseCurrentWeekSummary();
        state.summaries[String(summary.week)] = summary;
        // Opções curriculares extraídas individualmente por aula; não reutilizar
        // lista de outras turmas nem de outros anos escolares.
    
        appendLog(state, 'Semana mapeada.', {
          week: summary.week,
          scienceRows: summary.scienceRows,
          practiceRows: summary.practiceRows,
          manualRows: summary.manualRows || 0
        });
        saveState(state);
    
        await sleep(CONFIG.scanDelayMs);
    
        state.scanIndex += 1;
        if (state.scanIndex < state.weeks.length) {
          saveState(state);
          location.href = state.weeks[state.scanIndex].url;
          return;
        }
    
        buildExecutionPlan(state);
        state.applyIndex=0;
        state.waitingReturn=false;
        if(!state.applyWeeks.length){
          appendLog(state,'Nenhuma lacuna encontrada nas semanas selecionadas.');
          await finishBatchClass(state);
          return;
        }
        state.status='review';
        saveState(state);
        renderPanel();
        openAbilityReviewModal(state);
      }
    
      async function openAbilityReviewModal(state) {
  if(state?.version!==4||state.status!=='review')return;
  const existing=qs('#'+CONFIG.modalId);
  if(existing?.dataset.review==='true')return;
  existing?.remove();
  const modal=document.createElement('div');
  modal.id=CONFIG.modalId;
  modal.dataset.review='true';
  const weeks=state.applyWeeks||[];
  const sections=weeks.map(week=>{
    const items=state.executionPlan[String(week.week)]?.instructions||[];
    return `<section style="border:1px solid #dce4ec;border-radius:9px;margin:10px 0;padding:9px">
      <strong>Semana ${week.week} · ${escapeHtml(week.period||'')}</strong>
      ${items.map(item=>{
        if(item.kind!=='science')return `<div style="font-size:12px;padding:6px">Aula ${item.rowIndex+1} · ${escapeHtml(item.discipline)}: texto padrão se vazio</div>`;
        const current=item.alreadyComplete?'__keep':item.abilityValue;
        return `<div style="border-bottom:1px solid #eee;padding:8px 0">
          <label style="font-size:12px;display:block;margin-bottom:5px">
            <strong>${escapeHtml(item.discipline)} · Aula ${item.rowIndex+1}</strong>
            ${escapeHtml(item.date||'')} ${item.existingAbilityValue?'· Já preenchida':'· Em branco'}
          </label>
          <select data-ability-week="${week.week}" data-ability-row="${item.rowIndex}"
            style="width:100%;padding:7px;border:1px solid #bfcddd;border-radius:6px">
            <option value="" ${!current?'selected':''}>Não preencher esta aula</option>
            ${item.existingAbilityValue?`<option value="__keep" ${current==='__keep'?'selected':''}>Manter o registro existente como está</option>`:''}
            ${(item.availableAbilities||[]).map(a=>`<option value="${escapeHtml(a.value)}" ${String(current)===String(a.value)?'selected':''}>${escapeHtml(a.label)}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:#637a8c;margin-top:5px">${escapeHtml(item.stageName||'Etapa não reconhecida')}
            ${item.automaticAllowed?'· Sugestão automática':'· Escolha manual obrigatória'}
          </div>
          <div style="font-size:11px;color:#52697a;margin-top:4px">
            Cinco planos anteriores: ${escapeHtml(item.recentFive?.join(' → ')||'nenhum encontrado')}
          </div>
        </div>`;
      }).join('')}
    </section>`;
  }).join('');
  modal.innerHTML=`<div class="vm-modal-box" style="max-width:950px">
    <h3>Conferir habilidades antes do preenchimento</h3>
    <p style="font-size:13px">Turma: <b>${escapeHtml(state.classroomName||state.classroomId)}</b>.
      Escolha a habilidade de cada aula de cada semana. Nenhum plano foi enviado nesta etapa.</p>
    <p style="font-size:12px;color:#935c21">Se uma habilidade de uma aula já preenchida for alterada,
      será solicitada uma confirmação específica antes de substituir o registro.</p>
    <div style="max-height:55vh;overflow:auto">${sections}</div>
    <div class="vm-modal-actions" style="flex-wrap:wrap">
      <button type="button" class="vm-primary" data-review="approve">Aprovar e preencher</button>
      <button type="button" class="vm-secondary" data-review="later">Revisar depois</button>
      <button type="button" class="vm-danger" data-review="cancel">Cancelar lote</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.onclick=async(event)=>{
    const action=event.target.closest('[data-review]')?.dataset.review;
    if(action==='later'){modal.remove();return;}
    if(action==='cancel'){
      if(confirm('Cancelar a execução antes de preencher?')){
        pausePlan(state,'Cancelado pelo usuário antes do preenchimento.');
        modal.remove();
      }
      return;
    }
    if(action!=='approve')return;
    const changes=[];
    const skipped=[];
    const reportRows=[];
    const toApply=[];
    for(const week of weeks){
      const plan=state.executionPlan[String(week.week)];
      const updated=[];
      for(const item of plan.instructions){
        if(item.kind!=='science'){updated.push(item);continue;}
        const select=Array.from(modal.querySelectorAll('[data-ability-week]')).find(el=>
          Number(el.dataset.abilityWeek)===Number(week.week)&&Number(el.dataset.abilityRow)===Number(item.rowIndex)
        );
        if(!select){alert('O seletor da aula não foi encontrado.');return;}
        const value=String(select.value||'');
        if(!value||value==='__keep'){skipped.push({week:week.week,row:item.rowIndex});continue;}
        const ability=(item.availableAbilities||[]).find(a=>String(a.value)===value);
        if(!ability){alert('Habilidade não permitida nessa aula: semana '+week.week);return;}
        item.replaceExisting=!!(item.existingAbilityValue&&String(item.existingAbilityValue)!==value);
        if(item.replaceExisting)changes.push('Semana '+week.week+', aula '+(item.rowIndex+1));
        item.abilityValue=value;item.abilityLabel=ability.label;
        item.knowledge=ability.knowledges?.[0]||'';
        item.methodologies=ability.methodologies?.length?[ability.methodologies[0]]:[];
        item.evaluation=false;
        updated.push(item);
        reportRows.push({week:week.week,rowIndex:item.rowIndex,date:item.date,
          discipline:item.discipline,kind:item.replaceExisting?'Substituição':'Ciências/Biologia',
          ability:ability.label,knowledge:item.knowledge,
          methodologies:item.methodologies.join(' | '),evaluation:'Não',manualText:''});
      }
      plan.instructions=updated;
      if(updated.length)toApply.push(week);
    }
    if(changes.length&&!confirm('Substituir habilidades já registradas em '+changes.length+
      ' aula(s)?\n'+changes.slice(0,10).join('\n')+'\n\nEsta alteração requer sua autorização.'))return;
    state.applyWeeks=toApply;
    state.reportRows=(state.reportRows||[]).filter(r=>r.kind==='Texto predefinido').concat(reportRows);
    state.computed={...state.computed,weeksToFill:toApply.length,
      approvedRows:toApply.reduce((n,w)=>n+state.executionPlan[String(w.week)].instructions.length,0),
      skippedRows:skipped.length,replacements:changes.length};
    appendLog(state,'Seleção conferida e aprovada.',state.computed);
    state.approvedAt=new Date().toISOString();
    state.status='applying';state.applyIndex=0;state.waitingReturn=false;
    saveState(state);modal.remove();renderPanel();
    if(!toApply.length){await finishBatchClass(state);return;}
    location.href=toApply[0].url;
  };
}

      async function handleApplyPage(state) {
        if(!state.approvedAt){
          pausePlan(state,'Preenchimento bloqueado: as habilidades ainda não foram autorizadas.');
          return;
        }
        const currentWeek = getCurrentWeekFromForm();
        const currentClassroom=getCurrentClassroomId();
        if(currentClassroom && String(currentClassroom)!==String(state.classroomId))
          throw Error('Turma diferente da esperada; execução interrompida.');
        const expectedWeek = (state.applyWeeks || state.weeks)[state.applyIndex]?.week;
        if (currentWeek !== expectedWeek) {
          pausePlan(state,'Semana diferente da aprovada. Preenchimento interrompido.',{currentWeek,expectedWeek});
          return;
        }
    
        const plan = getWeekPlanForCurrentPage(state);
        if (!plan) {
          appendLog(state, 'Nenhum plano calculado para a semana atual.');
          state.waitingReturn = true;
          state.lastAppliedWeek = currentWeek;
          saveState(state);
          history.back();
          return;
        }
    
        const formError=isSegesFormError();
        if(formError){pausePlan(state,'Mensagem de erro no formulário: '+formError);return;}
        const rows = qsa('#weekly_plan tr.by-curriculum-discipline');
        appendLog(state, 'Aplicando semana.', { week: currentWeek, instructions: plan.instructions.length });
        saveState(state);
    
        for (const instruction of plan.instructions) {
          const rowElement = rows[instruction.rowIndex];
          if (!rowElement) {
            pausePlan(state,'Aula não encontrada: semana '+currentWeek+', linha '+(instruction.rowIndex+1));
            return;
          }
          const actual=String(rowElement.querySelectorAll('td')[1]?.textContent||'').trim();
          if(normalizeText(actual)!==normalizeText(instruction.discipline)){
            pausePlan(state,'A disciplina da aula mudou. É necessário revisar as escolhas.',{
              expected:instruction.discipline,actual
            });
            return;
          }
    
          try {
            await applyInstructionToRow(state, rowElement, instruction);
            await sleep(CONFIG.applyDelayMs);
          } catch (error) {
            appendLog(state, `Falha ao aplicar instrução na semana ${currentWeek}.`, {
              instruction,
              error: error.message
            });
            saveState(state);
            throw error;
          }
        }
    
        state.waitingReturn = true;
        state.lastAppliedWeek = currentWeek;
        state.status='saving';
        appendLog(state,'Enviando formulário UMA VEZ; aguardando retorno.',{week:currentWeek});
        saveState(state);
    
        await sleep(CONFIG.saveDelayMs);
        const beforeSaveError=isSegesFormError();
        if(beforeSaveError){pausePlan(state,'Validação do SEGES: '+beforeSaveError);return;}
        const saveButton = qs('input[type="submit"][value="Salvar"], input[name="commit"][value="Salvar"]');
        if (!saveButton) {
          throw new Error('Botão Salvar não encontrado.');
        }
        saveButton.click();
        // Se houver erro de validação, um modal ou falha de AJAX, parar aqui.
        await sleep(7500);
        const pending=loadState();
        if(pending?.status==='saving' && Number(pending.lastAppliedWeek)===Number(currentWeek))
          pausePlan(pending,'O salvamento não foi confirmado. '+
            (isSegesFormError()||'Consulte a mensagem exibida pelo SEGES.'));
      }
    
      async function continueFromWeeksPage(state) {
        if (state.status === 'done' || state.status==='paused') return;
        if (!state.waitingReturn) return;
    
        const pageError=isSegesFormError();
        if(pageError){pausePlan(state,'O SEGES devolveu um erro depois do envio: '+pageError);return;}
        const returnedClass=getCurrentClassroomId();
        if(returnedClass&&String(returnedClass)!==String(state.classroomId)){
          pausePlan(state,'O SEGES retornou em outra turma. Salvamento não confirmado.');
          return;
        }
        const lastWeek = Number(state.lastAppliedWeek);
        const applying=state.applyWeeks||state.weeks;
        const sent=applying[state.applyIndex];
        const freshWeeks=parseWeeksTable();
        const currentRow=freshWeeks.find(row=>Number(row.week)===lastWeek);
        if(!currentRow){
          pausePlan(state,'O plano enviado não aparece na lista atual. Confira o salvamento.');
          return;
        }
        if(sent && /\/new(?:\?|$)/.test(sent.url) && /\/new(?:\?|$)/.test(currentRow.url)){
          pausePlan(state,'O plano ainda aparece como novo. O salvamento não foi confirmado.');
          return;
        }
        const currentIndex = applying.findIndex((item) => item.week === lastWeek);
        const nextIndex = currentIndex + 1;
    
        if(currentIndex<0||currentIndex!==state.applyIndex){
          pausePlan(state,'Retorno de semana incompatível. Operação interrompida.',{lastWeek,currentIndex});
          return;
        }
        state.waitingReturn=false;
        state.applyIndex=nextIndex;
        state.status='applying';
        saveState(state);
    
        if (nextIndex >= applying.length) {
          appendLog(state,'Fim das semanas com lacunas desta turma.');
          await finishBatchClass(state);
          return;
        }
    
        location.href = applying[nextIndex].url;
      }
    
      async function resumeAutomation(state) {
        if (!state || state.status === 'done') return;
    
        if (isWeekFormPage()) {
          renderPanel();
          return;
        }
    
        if (!isPlannerLandingPage()) {
          alert('Abra a lista de turmas ou semanas para continuar.');
          return;
        }
    
        if (state.status === 'scanning') {
          const nextWeek = state.weeks[state.scanIndex];
          if (!nextWeek) {
            buildExecutionPlan(state);
            state.status = 'applying';
            state.applyIndex = 0;
            state.waitingReturn = false;
            saveState(state);
            if (state.applyWeeks?.length) location.href = state.applyWeeks[0].url;
            else await finishBatchClass(state);
            return;
          }
          saveState(state);
          location.href = nextWeek.url;
          return;
        }
    
        if (state.status === 'saving'){
          pausePlan(state,'Não houve confirmação de salvamento; revise manualmente.');
          return;
        }
        if (state.status === 'applying') {
          if (state.waitingReturn) {
            await continueFromWeeksPage(state);
            return;
          }
    
          const nextWeek = (state.applyWeeks || state.weeks)[state.applyIndex];
          if (!nextWeek) {
            await finishBatchClass(state);
            return;
          }
    
          saveState(state);
          location.href = nextWeek.url;
        }
      }
    
    
    function createBatchClassState(batch){
 const job=batch.jobs[batch.index];
 if(!job?.weeks?.length)throw Error('Turma sem semanas.');
 return {version:4,status:'scanning',startedAt:new Date().toISOString(),finishedAt:null,
  classroomId:job.id,classroomName:job.name,classStage:job.classStage||null,weeks:job.weeks,selectedWeeks:job.selectedWeeks,
  scanIndex:0,applyIndex:0,waitingReturn:false,lastAppliedWeek:null,
  summaries:{},abilities:[],executionPlan:{},reportRows:[],computed:{},logs:[],batch};
}

    async function openWeekSelectionModal(){
 if(!isPlannerLandingPage())return alert('Abra Planos Semanais, na lista de turmas ou semanas.');
 qs('#'+CONFIG.modalId)?.remove();
 const modal=document.createElement('div');modal.id=CONFIG.modalId;
 modal.innerHTML=`<div class="vm-modal-box" style="max-width:900px">
   <h3>Preencher planos — escolher turmas e semanas</h3>
   <p>Selecione as turmas e depois marque as semanas de cada uma. As demais semanas também serão lidas para equilibrar as habilidades.</p>
   <div data-classes>Consultando turmas...</div>
   <div class="vm-modal-actions" style="margin-top:10px">
     <button type="button" data-pick="load" class="vm-primary">Mostrar semanas</button>
     <button type="button" data-pick="all-classes" class="vm-secondary">Todas as turmas</button>
     <button type="button" data-pick="close" class="vm-secondary">Fechar</button>
   </div>
   <div data-week-groups></div>
   <p data-message style="font-size:12px;color:#526577"></p>
   <button type="button" data-pick="start" class="vm-primary" disabled>Iniciar preenchimento selecionado</button>
 </div>`;
 document.body.appendChild(modal);
 const box=qs('[data-classes]',modal),groupsBox=qs('[data-week-groups]',modal),
  message=qs('[data-message]',modal),go=qs('[data-pick="start"]',modal);
 let classes=[],groups=[],busy=false;
 try{
  const doc=isClassroomsPage()?document:await readSegesHtml('/weekly_plans');
  classes=listClassrooms(doc);
  const current=getCurrentClassroomId();
  if(!classes.length&&isWeeksPage()&&current)classes=[{id:current,name:getClassroomDisplay(null),url:location.href}];
  if(!classes.length)throw Error('Turmas não encontradas. Abra o menu Planos Semanais.');
  box.innerHTML='<b>Turmas</b><div style="max-height:140px;overflow:auto">'+classes.map(c=>
   `<label style="display:block;padding:4px"><input type="checkbox" data-class="${escapeHtml(c.id)}" ${c.id===current?'checked':''}> ${escapeHtml(c.name)}</label>`).join('')+'</div>';
  if(classes.length===1)qs('[data-class]',box).checked=true;
  message.textContent=classes.length+' turmas disponíveis.';
 }catch(error){box.textContent='Erro: '+error.message;}
 modal.onclick=async(ev)=>{
  if(ev.target===modal&&!busy){modal.remove();return;}
  const action=ev.target.closest('[data-pick]')?.dataset.pick;
  const option=ev.target.closest('[data-week-action]')?.dataset.weekAction;
  if(action==='close'){if(!busy)modal.remove();return;}
  if(action==='all-classes'){box.querySelectorAll('[data-class]').forEach(c=>{c.checked=true;});return;}
  if(busy)return;
  if(option){
   const section=ev.target.closest('[data-class-weeks]'),g=groups.find(x=>x.classroom.id===section?.dataset.classWeeks);
   section?.querySelectorAll('[data-week]').forEach(c=>{
     const w=g?.weeks.find(x=>x.week===Number(c.dataset.week));
     c.checked=option==='all'||(option==='new'&&/\/new(?:\?|$)/.test(w?.url||''));
   });return;
  }
  if(action==='load'){
   const ids=new Set(Array.from(box.querySelectorAll('[data-class]:checked')).map(c=>c.dataset.class));
   if(!ids.size)return alert('Selecione ao menos uma turma.');
   busy=true;groups=[];go.disabled=true;groupsBox.textContent='Lendo semanas...';
   const failures=[];
   try{
    for(const classroom of classes.filter(x=>ids.has(x.id))){
     try{
      const doc=classroom.url===location.href&&isWeeksPage()?document:await readSegesHtml(classroom.url);
      const weeks=parseWeeksTable(doc);
      if(weeks.length)groups.push({classroom,weeks});else failures.push(classroom.name+': sem semanas reconhecidas');
     }catch(e){failures.push(classroom.name+': '+e.message);}
    }
    groupsBox.innerHTML=groups.map(g=>`<section data-class-weeks="${escapeHtml(g.classroom.id)}" style="margin:10px 0;border:1px solid #ddd;border-radius:8px;padding:8px">
      <b>${escapeHtml(g.classroom.name)} — ${g.weeks.length} semanas</b>
      <label style="display:block;margin:7px 0;font-size:12px">Etapa/ano desta turma:
        <select data-class-stage="${escapeHtml(g.classroom.id)}" style="padding:6px;border:1px solid #ccd5e0;border-radius:6px">
          <option value="">Detectar automaticamente (se possível)</option>
          ${Array.from({length:9},(_,i)=>`<option value="fundamental:${i+1}">${i+1}º ano do Fundamental</option>`).join('')}
          <option value="medio:1">1ª série do Ensino Médio</option>
          <option value="medio:2">2ª série do Ensino Médio</option>
          <option value="medio:3">3ª série do Ensino Médio</option>
        </select>
      </label>
      <div><button type="button" data-week-action="all">Todas</button>
      <button type="button" data-week-action="new">Sem plano</button>
      <button type="button" data-week-action="none">Nenhuma</button></div>
      <div style="max-height:170px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))">
      ${g.weeks.map(w=>`<label style="font-size:12px;padding:3px">
       <input type="checkbox" data-week="${w.week}" checked> Semana ${w.week} · ${escapeHtml(w.period||'')}</label>`).join('')}</div></section>`).join('');
    message.textContent=groups.length+' turmas carregadas. '+failures.join(' | ');
    go.disabled=!groups.length;
   }finally{busy=false;}return;
  }
  if(action==='start'){
   const jobs=groups.map(g=>{
    const section=Array.from(groupsBox.querySelectorAll('[data-class-weeks]')).find(x=>x.dataset.classWeeks===g.classroom.id);
    const selectedWeeks=Array.from(section?.querySelectorAll('[data-week]:checked')||[]).map(x=>Number(x.dataset.week));
    const choice=section?.querySelector('[data-class-stage]')?.value||'';
    const [stage,rawGrade]=choice.split(':');
    const classStage=stage&&rawGrade?{stage,grade:Number(rawGrade)}:null;
    return {...g.classroom,weeks:g.weeks,selectedWeeks,classStage};
   }).filter(j=>j.selectedWeeks.length);
   if(!jobs.length)return alert('Marque ao menos uma semana.');
   const old=loadState();
   if(old&&old.status!=='done'&&!confirm('Interromper a execução anterior para iniciar uma nova?'))return;
   const batch={jobs,index:0,results:[]};
   const state=createBatchClassState(batch);
   appendLog(state,'Turmas, etapas e semanas selecionadas.',{jobs:jobs.map(j=>({
     name:j.name,weeks:j.selectedWeeks,stage:j.classStage||'detecção automática'
   }))});
   saveState(state);modal.remove();renderPanel();location.href=state.weeks[0].url;
  }
 };
}

    function buildStateFromCurrentWeeksPage() {
        const parsedWeeks = parseWeeksTable();
        const weeks = CONFIG.maxWeeksPerRun ? parsedWeeks.slice(0, CONFIG.maxWeeksPerRun) : parsedWeeks;
        const classroomId = getCurrentClassroomId() || getUrl(weeks[0]?.url || '')?.searchParams.get('classroom_id') || null;
    
        return {
          version: 3,
          status: 'scanning',
          startedAt: new Date().toISOString(),
          finishedAt: null,
          classroomId,
          weeks,
          scanIndex: 0,
          applyIndex: 0,
          waitingReturn: false,
          lastAppliedWeek: null,
          summaries: {},
          abilities: [],
          executionPlan: {},
          reportRows: [],
          computed: {},
          logs: []
        };
      }
    
      function escapeHtml(text) {
        return String(text || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
    
      function getSummaryText(state) {
        if (!state) return 'Nenhuma automação em andamento.';
        if (state.version !== 4 && state.status !== 'done') {
          return 'Execução anterior incompatível: use Parar e limpar para iniciar novamente.';
        }
    
        if (state.status === 'scanning') {
          return `Mapeando semanas ${state.scanIndex}/${state.weeks.length}`;
        }
        if (state.status === 'applying') {
          return `Aplicando preenchimento ${state.applyIndex}/${(state.applyWeeks || state.weeks).length}`;
        }
        if (state.status === 'review') return 'Aguardando sua conferência das habilidades antes do preenchimento.';
        if (state.status === 'saving') return 'Salvamento enviado; aguardando retorno do SEGES.';
        if (state.status === 'paused') return 'Interrompido: '+(state.lastError||'verifique o log');
        if (state.status === 'done') {
          return state.batch ? 'Concluído: '+state.batch.jobs.length+' turma(s); '+(state.computed?.totalFilledWeeks||0)+' semana(s) com lacunas.' :
            `Concluído. Semanas com lacunas processadas: ${state.computed?.weeksToFill ?? state.weeks.length}`;
        }
        return `Estado: ${state.status}`;
      }
    
    
      // A fase de mapeamento ocupa 0-50%; a fase de preenchimento, 50-100%.
      function getProgressInfo(state) {
        const total = state?.weeks?.length || 0;
        if (!total) return { percent: 0, label: 'Nenhuma execução iniciada', week: '—' };
        if (state.status === 'done') {
          return { percent: 100, label: 'Processo concluído', week: 'Todas as semanas previstas' };
        }
        if(state.status==='review'){
          const totalClasses=state.batch?.jobs?.length||1, index=state.batch?.index||0;
          return {percent:Math.round(100*(index+0.5)/totalClasses),
            label:'Aguardando aprovação · turma '+(index+1)+'/'+totalClasses,
            week:'Revisar habilidades antes de preencher'};
        }
        if(state.status==='paused')
          return {percent:0,label:'Interrompido: confira o erro',week:'Nenhum envio automático'};

        const scanning = state.status === 'scanning';
        const stageWeeks = scanning ? state.weeks : (state.applyWeeks || state.weeks);
        const stageTotal = Math.max(1,stageWeeks.length);
        const index = Math.min(stageTotal, Math.max(0, scanning ? (state.scanIndex || 0) : (state.applyIndex || 0)));
        const classProgress=(scanning?0:0.5)+0.5*index/stageTotal;
        const batchTotal=state.batch?.jobs?.length||1, batchIndex=state.batch?.index||0;
        const percent=Math.round(100*(batchIndex+classProgress)/batchTotal);
        const current = stageWeeks[Math.min(index, stageWeeks.length - 1)];
        return {
          percent,
          label: 'Turma '+(batchIndex+1)+'/'+batchTotal+' · '+
            (scanning?'Mapeamento':'Preenchimento')+': '+index+'/'+stageTotal+' semanas',
          week: current ? ('Semana ' + current.week + (current.period ? ' · ' + current.period : '')) : '—'
        };
      }
    
      function getClassroomDisplay(state) {
        const id = state?.classroomId || getCurrentClassroomId();
        if (state?.classroomName) return state.classroomName + (id ? ' (ID '+id+')' : '');
        if (!id) return 'Não identificada';
        const classrooms = Array.isArray(window.classrooms) ? window.classrooms : [];
        const found = classrooms.find((item) =>
          String(item?.id ?? item?.classroom_id ?? item?.value ?? '') === String(id)
        );
        if (found?.name) return String(found.name) + ' (ID ' + id + ')';
        const select = qs('select#classroom_id, select[name="classroom_id"]');
        const option = Array.from(select?.options || []).find((item) => String(item.value) === String(id));
        const name = String(option?.textContent || '').trim();
        return name ? name + ' (ID ' + id + ')' : 'ID ' + id;
      }
    
      function formatFullLog(state) {
        return [
          'SEGES — Plano Semanal — Log de execução',
          'Turma: ' + getClassroomDisplay(state),
          'Status: ' + (state?.status || 'não iniciado'),
          'Exportado: ' + new Date().toLocaleString('pt-BR'),
          '',
          ...(state?.logs || []).map((entry) => {
            const at = entry.at ? new Date(entry.at).toLocaleString('pt-BR') : '';
            return '[' + at + '] ' + entry.message +
              (entry.extra ? '\n' + JSON.stringify(entry.extra, null, 2) : '');
          })
        ].join('\n');
      }
    
      function attachPanelDrag(panel) {
        if (panel.dataset.vmDraggable === '1') return;
        panel.dataset.vmDraggable = '1';
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || 'null'); }
        catch (_) { /* ignora posição inválida */ }
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
          panel.style.left = Math.max(0, Math.min(saved.x, window.innerWidth - panel.offsetWidth)) + 'px';
          panel.style.top = Math.max(0, Math.min(saved.y, window.innerHeight - Math.min(panel.offsetHeight, 60))) + 'px';
        }
    
        let dragging = null;
        panel.addEventListener('pointerdown', (event) => {
          if (!event.target.closest('.vm-head')) return;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const rect = panel.getBoundingClientRect();
          dragging = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
          };
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
          panel.style.left = rect.left + 'px';
          panel.style.top = rect.top + 'px';
          event.preventDefault();
        });
        window.addEventListener('pointermove', (event) => {
          if (!dragging || event.pointerId !== dragging.pointerId) return;
          const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
          const maxY = Math.max(0, window.innerHeight - Math.min(panel.offsetHeight, 60));
          panel.style.left = Math.max(0, Math.min(maxX, event.clientX - dragging.offsetX)) + 'px';
          panel.style.top = Math.max(0, Math.min(maxY, event.clientY - dragging.offsetY)) + 'px';
        });
        const finish = (event) => {
          if (!dragging || event.pointerId !== dragging.pointerId) return;
          dragging = null;
          localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify({
            x: parseFloat(panel.style.left) || 0,
            y: parseFloat(panel.style.top) || 0
          }));
        };
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
      }
    
      function ensurePanelStyles() {
        if (qs('#vm-plano-semanal-style')) return;
        const style = document.createElement('style');
        style.id = 'vm-plano-semanal-style';
        style.textContent = `
          #${CONFIG.panelId} {
            position: fixed;
            right: 16px;
            bottom: 16px;
            width: 360px;
            max-width: calc(100vw - 20px);
            max-height: 85vh;
            overflow-y: auto;
            box-sizing: border-box;
            z-index: 999999;
            background: #ffffff;
            border: 1px solid #d9e2ec;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,.15);
            font-family: Arial, sans-serif;
            color: #243b53;
          }
          #${CONFIG.panelId} .vm-head {
            background: #0b5e96;
            color: white;
            padding: 12px 14px;
            border-radius: 12px 12px 0 0;
            font-weight: bold;
            font-size: 14px;
            cursor: grab;
            user-select: none;
            touch-action: none;
          }
          #${CONFIG.panelId} .vm-progress-track {
            height: 10px;
            background: #dbe7f0;
            border-radius: 12px;
            overflow: hidden;
            margin-top: 6px;
          }
          #${CONFIG.panelId} .vm-progress-fill {
            height: 100%;
            background: #137db3;
            border-radius: 12px;
            transition: width .25s ease;
          }
          #${CONFIG.panelId} .vm-body {
            padding: 12px 14px;
            font-size: 13px;
          }
          #${CONFIG.panelId} .vm-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
          }
          #${CONFIG.panelId} button {
            border: 0;
            border-radius: 8px;
            padding: 8px 10px;
            cursor: pointer;
            font-size: 12px;
          }
          #${CONFIG.panelId} .vm-primary { background: #0b5e96; color: white; }
          #${CONFIG.panelId} .vm-secondary { background: #e6eef5; color: #102a43; }
          #${CONFIG.panelId} .vm-danger { background: #d64545; color: white; }
          #${CONFIG.panelId} .vm-muted {
            margin-top: 8px;
            color: #627d98;
            max-height: 120px;
            overflow: auto;
            background: #f7fafc;
            border-radius: 8px;
            padding: 8px;
          }
          #${CONFIG.modalId} {
            position: fixed;
            inset: 0;
            z-index: 9999999;
            background: rgba(16, 42, 67, .55);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          #${CONFIG.modalId} .vm-modal-box {
            width: min(1200px, 94vw);
            max-height: 88vh;
            overflow: auto;
            background: white;
            border-radius: 14px;
            padding: 16px;
            box-shadow: 0 20px 50px rgba(0,0,0,.25);
            font-family: Arial, sans-serif;
          }
          #${CONFIG.modalId} table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          #${CONFIG.modalId} th, #${CONFIG.modalId} td {
            border: 1px solid #d9e2ec;
            padding: 6px;
            vertical-align: top;
          }
          #${CONFIG.modalId} th {
            position: sticky;
            top: 0;
            background: #f0f4f8;
          }
          #${CONFIG.modalId} .vm-modal-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
          }
          #${CONFIG.modalId} .vm-modal-actions button {
            border: 0;
            padding: 8px 12px;
            border-radius: 7px;
            cursor: pointer;
          }
          #${CONFIG.modalId} .vm-primary { background: #0b5e96; color: #fff; }
          #${CONFIG.modalId} .vm-secondary { background: #e6eef5; color: #102a43; }
          #${CONFIG.modalId} .vm-danger { background: #d64545; color: #fff; }
        `;
        document.head.appendChild(style);
      }
    
      function safeSegesUrl(href) {
        const url=getUrl(href);
        return url && url.protocol==='https:' && url.origin===location.origin && url.pathname.startsWith('/weekly_plans') ? url : null;
      }
    
      function listClassrooms(doc) {
        const seen=new Set();
        return qsa('a[href*="weekly_plans?classroom_id="]',doc).map((link)=>{
          const url=safeSegesUrl(link.getAttribute('href'));
          const id=url?.searchParams.get('classroom_id');
          if(!id || url.pathname!=='/weekly_plans'||seen.has(id))return null;
          seen.add(id);
          const tr=link.closest('tr');
          const name=String(tr?.querySelector('td')?.textContent||link.textContent||'').trim();
          return {id,name:name&&name.length<140?name:'Turma '+id,url:url.href};
        }).filter(Boolean);
      }
    
      function listExistingWeeks(doc,cls) {
        return qsa('table.table.table-striped tbody tr.middle',doc).map((tr)=>{
          const cells=tr.querySelectorAll('td');
          const link=qs('a.btn.btn-sm.btn-primary',tr);
          const url=safeSegesUrl(link?.getAttribute('href')||'');
          const week=Number((cells[0]?.textContent||'').trim());
          if(!url||!Number.isFinite(week)||!cells.length)return null;
          const match=url.pathname.match(/^\/weekly_plans\/(\d+)(?:\/edit)?\/?$/);
          if(!match)return null;
          return {classId:cls.id,className:cls.name,classUrl:cls.url,week,
            period:String(cells[1]?.textContent||'').trim(),status:String(cells[2]?.textContent||'').trim(),
            detailUrl:url.href,recordId:match[1],rowHtml:tr.outerHTML};
        }).filter(Boolean);
      }
    
      async function readSegesHtml(href) {
        const url=safeSegesUrl(href);
        if(!url)throw Error('Acesso negado: endereço externo ou inválido.');
        const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store'});
        const redirected=safeSegesUrl(response.url);
        if(!response.ok||!redirected || redirected.pathname!==url.pathname ||
          (url.searchParams.has('classroom_id') &&
            redirected.searchParams.get('classroom_id')!==url.searchParams.get('classroom_id'))) {
          throw Error('Página indisponível, redirecionamento inesperado ou sessão encerrada (HTTP '+response.status+').');
        }
        const html=await response.text();
        return new DOMParser().parseFromString(html,'text/html');
      }
    
      function identifyDeleteControl(doc) {
        for(const form of qsa('form',doc)){
          const override=String(qs('input[name="_method"]',form)?.value||'').toLowerCase();
          const method=String(form.getAttribute('method')||'GET').toUpperCase();
          if(override!=='delete'&&method!=='DELETE')continue;
          const url=safeSegesUrl(form.getAttribute('action')||'');
          if(!url||!/^\/weekly_plans\/\d+\/?$/.test(url.pathname))continue;
          const fields=qsa('input[name]',form).filter((i)=>!i.disabled&&(!['checkbox','radio'].includes(i.type)||i.checked))
            .map((i)=>[i.name,i.value]);
          return {type:'form',url:url.href,method:method==='DELETE'?'DELETE':'POST',fields,
            csrf:qs('meta[name="csrf-token"]',doc)?.getAttribute('content')||''};
        }
        for(const link of qsa('a[data-method],a[data-turbo-method],button[data-method]',doc)){
          const method=String(link.getAttribute('data-method')||link.getAttribute('data-turbo-method')||'').toLowerCase();
          if(method!=='delete')continue;
          const url=safeSegesUrl(link.getAttribute('href')||link.getAttribute('formaction')||'');
          if(!url||!/^\/weekly_plans\/\d+\/?$/.test(url.pathname))continue;
          return {type:'link',url:url.href,method:'DELETE',fields:[],
            csrf:qs('meta[name="csrf-token"]',doc)?.getAttribute('content')||''};
        }
        return null;
      }
    
      async function findActualDeleteControl(week) {
        const rowDoc=new DOMParser().parseFromString('<table><tbody>'+week.rowHtml+'</tbody></table>','text/html');
        const listed=identifyDeleteControl(rowDoc);
        if(listed)return listed;
        const detail=await readSegesHtml(week.detailUrl);
        return identifyDeleteControl(detail);
      }
    
      async function performActualDeletion(control) {
        const url=safeSegesUrl(control.url);
        if(!url||!/^\/weekly_plans\/\d+\/?$/.test(url.pathname))throw Error('Endereço de exclusão recusado.');
        const csrf=control.csrf||qs('meta[name="csrf-token"]')?.getAttribute('content')||'';
        if(!csrf&&!control.fields.some((f)=>f[0]==='authenticity_token'))throw Error('Token de segurança não encontrado.');
        const headers={'Accept':'text/html, application/json','X-Requested-With':'XMLHttpRequest'};
        if(csrf)headers['X-CSRF-Token']=csrf;
        const options={method:control.method,credentials:'same-origin',redirect:'follow',headers};
        if(control.type==='form'&&control.method==='POST'){
          const body=new URLSearchParams();
          control.fields.forEach(([key,value])=>body.append(key,value));
          options.body=body;
          headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';
        }
        const result=await fetch(url.href,options);
        if(!result.ok||!safeSegesUrl(result.url))throw Error('Falha na resposta do servidor (HTTP '+result.status+').');
      }
    
      async function confirmDeletionFromList(week) {
        const doc=await readSegesHtml(week.classUrl);
        const remaining=listExistingWeeks(doc,{id:week.classId,name:week.className,url:week.classUrl});
        // Nunca concluir sucesso usando uma página que não seja a lista de semanas.
        if(!qsa('table.table.table-striped tbody tr.middle a.btn.btn-sm.btn-primary',doc).length)return false;
        return !remaining.some((item)=>item.recordId===week.recordId && item.week===week.week);
      }
    
      async function openBulkDeleteModal() {
        const state=loadState();
        if(state&&state.status!=='done')return alert('Conclua ou interrompa o preenchimento antes de apagar planos.');
        qs('#'+CONFIG.modalId)?.remove();
        const modal=document.createElement('div');
        modal.id=CONFIG.modalId;
        modal.innerHTML=`
        <div class="vm-modal-box" style="max-width:900px">
          <h3>Excluir planos semanais</h3>
          <p style="color:#a32b2b;font-size:13px"><b>A exclusão não pode ser desfeita.</b> Selecione turmas e semanas. A automação só executa comandos de exclusão encontrados no próprio SEGES.</p>
          <div id="vm-excluir-turmas">Carregando turmas...</div>
          <div class="vm-modal-actions" style="margin-top:10px">
            <button type="button" data-excluir="consultar" class="vm-primary">Consultar semanas selecionadas</button>
            <button type="button" data-excluir="todas" class="vm-secondary">Todas as turmas</button>
            <button type="button" data-excluir="fechar" class="vm-secondary">Fechar</button>
          </div>
          <div id="vm-excluir-semanas" style="max-height:35vh;overflow:auto"></div>
          <div class="vm-modal-actions" style="margin-top:10px">
            <button type="button" data-excluir="apagar" class="vm-danger" disabled>Excluir planos marcados</button>
            <button type="button" data-excluir="log" class="vm-secondary">Exportar histórico TXT</button>
          </div>
          <pre id="vm-excluir-log" style="max-height:160px;overflow:auto;white-space:pre-wrap;background:#f7fafc;border:1px solid #ddd;padding:8px;font-size:11px"></pre>
        </div>`;
        document.body.appendChild(modal);
        const box=qs('#vm-excluir-turmas',modal);
        const weekBox=qs('#vm-excluir-semanas',modal);
        const logBox=qs('#vm-excluir-log',modal);
        const records=[];
        const log=(message)=>{
          records.push('['+new Date().toLocaleTimeString('pt-BR')+'] '+message);
          logBox.textContent=records.join('\n');
          logBox.scrollTop=logBox.scrollHeight;
        };
        let weeks=[];
        let processing=false;
        try{
          const overview=isClassroomsPage()?document:await readSegesHtml('/weekly_plans');
          let classes=listClassrooms(overview);
          const current=getCurrentClassroomId();
          if(!classes.length&&isWeeksPage()&&current){
            classes=[{id:current,name:'Turma '+current,url:location.href}];
          }
          if(!classes.length)throw Error('Turmas não identificadas. Abra o menu de Planos Semanais.');
          box.innerHTML='<b>Turmas disponíveis</b><div style="max-height:130px;overflow:auto;border:1px solid #ddd;padding:8px">'+
            classes.map((cls)=>'<label style="display:block;padding:3px"><input type="checkbox" data-class-id="'+escapeHtml(cls.id)+'" '+(cls.id===current?'checked':'')+'> '+escapeHtml(cls.name)+'</label>').join('')+'</div>';
          log('Foram encontradas '+classes.length+' turmas.');
          modal.onclick=async(event)=>{
            if(event.target===modal && !processing){modal.remove();return;}
            const action=event.target.closest('[data-excluir]')?.dataset.excluir;
            if(!action)return;
            if(action==='fechar'){if(!processing)modal.remove();return;}
            if(action==='log'){
              downloadTextFile('seges-exclusoes-'+new Date().toISOString().slice(0,10)+'.txt',records.join('\n'),'text/plain;charset=utf-8');return;
            }
            if(action==='todas'){
              box.querySelectorAll('[data-class-id]').forEach((c)=>{c.checked=true;});return;
            }
            if(processing)return;
            if(action==='consultar'){
              const chosenIds=new Set(Array.from(box.querySelectorAll('[data-class-id]:checked')).map((c)=>c.dataset.classId));
              if(!chosenIds.size)return alert('Marque pelo menos uma turma.');
              processing=true;weeks=[];weekBox.textContent='Lendo os planos das turmas...';
              try{
                for(const cls of classes.filter((item)=>chosenIds.has(item.id))){
                  try{
                    const doc=await readSegesHtml(cls.url);
                    const found=listExistingWeeks(doc,cls);
                    weeks.push(...found);
                    log(cls.name+': '+found.length+' registros existentes encontrados.');
                  }catch(error){log(cls.name+': falha de leitura — '+error.message);}
                }
                weekBox.innerHTML=weeks.length
                  ?'<p><b>'+weeks.length+' planos encontrados.</b> <button type="button" data-excluir="marcar">Marcar todos</button> <button type="button" data-excluir="limpar">Desmarcar</button></p>'+
                    weeks.map((w,index)=>'<label style="display:flex;align-items:center;gap:9px;padding:6px;border-bottom:1px solid #ddd"><input type="checkbox" data-week-index="'+index+'"><b>'+escapeHtml(w.className)+'</b> · Semana '+w.week+' · '+escapeHtml(w.period)+' · '+escapeHtml(w.status)+'</label>').join('')
                  :'<p>Não foram encontrados planos existentes para exclusão.</p>';
                qs('[data-excluir="apagar"]',modal).disabled=!weeks.length;
              }finally{processing=false;}
              return;
            }
            if(action==='marcar'||action==='limpar'){
              weekBox.querySelectorAll('[data-week-index]').forEach((item)=>{item.checked=action==='marcar';});return;
            }
            if(action==='apagar'){
              const selected=Array.from(weekBox.querySelectorAll('[data-week-index]:checked'))
                .map((c)=>weeks[Number(c.dataset.weekIndex)]).filter(Boolean);
              if(!selected.length)return alert('Marque os planos para excluir.');
              const phrase='EXCLUIR '+selected.length;
              const input=prompt('Você selecionou '+selected.length+' planos de '+new Set(selected.map((w)=>w.classId)).size+
                ' turma(s). Não existe desfazer.\n\nDigite exatamente '+phrase+' para confirmar:');
              if(input!==phrase){log('A operação foi cancelada na confirmação.');return;}
              processing=true;
              qs('[data-excluir="apagar"]',modal).disabled=true;
              let confirmed=0,failed=0,uncertain=0;
              try{
                for(const week of selected){
                  try{
                    const control=await findActualDeleteControl(week);
                    if(!control){failed++;log('NÃO EXCLUÍDO '+week.className+' / semana '+week.week+': o SEGES não apresentou comando de exclusão.');continue;}
                    const id=safeSegesUrl(control.url)?.pathname.match(/^\/weekly_plans\/(\d+)\/?$/)?.[1];
                    if(id!==week.recordId){failed++;log('NÃO EXCLUÍDO '+week.className+' / semana '+week.week+': identificador divergente.');continue;}
                    await performActualDeletion(control);
                    const verified=await confirmDeletionFromList(week);
                    if(verified){confirmed++;log('EXCLUSÃO CONFIRMADA '+week.className+' / semana '+week.week);}
                    else{uncertain++;log('REVISAR '+week.className+' / semana '+week.week+': o SEGES respondeu, mas a lista ainda não confirmou a exclusão.');}
                  }catch(error){failed++;log('FALHA '+week.className+' / semana '+week.week+': '+error.message);}
                }
                log('Resultado: '+confirmed+' exclusões confirmadas; '+failed+' falhas; '+uncertain+' indeterminadas.');
                alert('Exclusão em lote finalizada.\nConfirmadas: '+confirmed+'\nFalhas: '+failed+'\nNão confirmadas: '+uncertain+'\nConsulte o histórico.');
              }finally{processing=false;qs('[data-excluir="apagar"]',modal).disabled=false;}
            }
          };
        }catch(error){
          box.textContent='Não foi possível abrir o gerenciador: '+error.message;
          log('ERRO '+error.message);
          modal.onclick=(event)=>{if(event.target===modal || event.target.closest('[data-excluir="fechar"]'))modal.remove();};
        }
      }
    
      function renderPanel() {
        ensurePanelStyles();
    
        let panel = qs(`#${CONFIG.panelId}`);
        if (!panel) {
          panel = document.createElement('div');
          panel.id = CONFIG.panelId;
          document.body.appendChild(panel);
        }
        attachPanelDrag(panel);
    
        const state = loadState();
        const logs = (state?.logs || []).slice(-CONFIG.panelLogCount).reverse();
        const logVisible = localStorage.getItem(PANEL_LOG_VISIBLE_KEY) === '1';
        const progress = getProgressInfo(state);
        const canStart = isPlannerLandingPage() && (!state || ['done','paused','review'].includes(state.status) || state.version!==4);
        const canResume = isPlannerLandingPage() && !!state && state.version === 4 && ['scanning','applying'].includes(state.status);
        const canShowReport = !!state?.reportRows?.length;
    
        panel.innerHTML = `
          <div class="vm-head">SEGES • Assistente — Planos</div>
          <div class="vm-body">
            <div><strong>Turma:</strong> ${escapeHtml(getClassroomDisplay(state))}</div>
            <div style="margin-top:6px;"><strong>Status:</strong> ${escapeHtml(getSummaryText(state))}</div>
            ${state?.status==='done' ? '<div style="margin-top:5px;font-size:12px;color:#536471">Última execução concluída. Inicie uma nova seleção quando desejar.</div>' : ''}
            <div style="margin-top:6px;"><strong>Atual:</strong> ${escapeHtml(progress.week)}</div>
            <div style="margin-top:9px;display:flex;justify-content:space-between;gap:8px;"><span>${escapeHtml(progress.label)}</span><strong>${progress.percent}%</strong></div>
            <div class="vm-progress-track" role="progressbar" aria-label="Progresso da automação" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}">
              <div class="vm-progress-fill" style="width:${progress.percent}%"></div>
            </div>
            <div class="vm-actions">
              ${canStart ? '<button class="vm-primary" data-vm-action="start">Preencher planos</button>' : ''}
              ${isPlannerLandingPage() ? '<button class="vm-secondary" data-vm-action="delete-manager">Gerenciar exclusões</button>' : ''}
              ${state?.status==='review' ? '<button class="vm-primary" data-vm-action="review">Revisar habilidades</button>' : ''}
              ${canResume ? '<button class="vm-primary" data-vm-action="resume">Continuar de onde parou</button>' : ''}
              ${canShowReport ? '<button class="vm-secondary" data-vm-action="report">Ver relatório</button>' : ''}
              ${state ? '<button class="vm-secondary" data-vm-action="toggle-log">' + (logVisible ? 'Ocultar log' : 'Mostrar log') + '</button>' : ''}
              ${state?.logs?.length ? '<button class="vm-secondary" data-vm-action="download-log">Baixar log TXT</button>' : ''}
              ${state ? '<button class="vm-danger" data-vm-action="stop">Parar e limpar</button>' : ''}
            </div>
            <div class="vm-muted" style="display:${logVisible ? 'block' : 'none'};">
              ${logs.length ? logs.map((log) => `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #d9e2ec;"><strong>${escapeHtml(new Date(log.at).toLocaleString('pt-BR'))}</strong><br>${escapeHtml(log.message)}${log.extra ? `<pre style="white-space:pre-wrap;max-height:180px;overflow:auto;background:#f7fafc;border:1px solid #d9e2ec;border-radius:6px;padding:6px;margin-top:6px;font-size:11px;">${escapeHtml(JSON.stringify(log.extra, null, 2))}</pre>` : ''}</div>`).join('') : 'Sem logs ainda.'}
            </div>
          </div>
        `;
    
        panel.onclick = async (event) => {
          const button = event.target.closest('button[data-vm-action]');
          if (!button) return;
          const action = button.getAttribute('data-vm-action');
    
          if (action === 'delete-manager') {
            await openBulkDeleteModal();
            return;
          }
          if (action === 'start') {
            await openWeekSelectionModal();
            return;
          }
    
          if (action === 'resume') {
            const currentState = loadState();
            if (currentState) await resumeAutomation(currentState);
            return;
          }
    
          if (action === 'review') {
            const currentState=loadState();
            if(currentState?.status==='review') openAbilityReviewModal(currentState);
            return;
          }
          if (action === 'report') {
            const currentState = loadState();
            if (currentState) openReportModal(currentState);
            return;
          }
    
          if (action === 'toggle-log') {
            localStorage.setItem(PANEL_LOG_VISIBLE_KEY, logVisible ? '0' : '1');
            renderPanel();
            return;
          }
    
          if (action === 'download-log') {
            const currentState = loadState();
            downloadTextFile(
              'plano-semanal-log-' + new Date().toISOString().slice(0, 10) + '.txt',
              formatFullLog(currentState),
              'text/plain;charset=utf-8'
            );
            return;
          }
    
          if (action === 'stop') {
            const confirmClear = confirm('Deseja parar a automação e limpar o estado salvo?');
            if (!confirmClear) return;
            clearState();
            renderPanel();
            alert('Estado da automação removido.');
          }
        };
      }
    
      function openReportModal(state) {
        if (!state?.reportRows?.length) {
          alert('Ainda não há relatório disponível.');
          return;
        }
    
        const oldModal = qs(`#${CONFIG.modalId}`);
        if (oldModal) oldModal.remove();
    
        const modal = document.createElement('div');
        modal.id = CONFIG.modalId;
    
        const rowsHtml = state.reportRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.classroomName || state.classroomName || state.classroomId || "")}</td>
            <td>${escapeHtml(row.week)}</td>
            <td>${escapeHtml(row.date)}</td>
            <td>${escapeHtml(row.discipline)}</td>
            <td>${escapeHtml(row.kind)}</td>
            <td>${escapeHtml(row.ability)}</td>
            <td>${escapeHtml(row.knowledge)}</td>
            <td>${escapeHtml(row.methodologies)}</td>
            <td>${escapeHtml(row.evaluation)}</td>
            <td>${escapeHtml(row.manualText)}</td>
          </tr>
        `).join('');
    
        modal.innerHTML = `
          <div class="vm-modal-box">
            <div class="vm-modal-actions">
              <button class="vm-primary" data-vm-modal-action="download-json">Baixar JSON</button>
              <button class="vm-secondary" data-vm-modal-action="download-csv">Baixar CSV</button>
              <button class="vm-danger" data-vm-modal-action="close">Fechar</button>
            </div>
            <h3 style="margin: 0 0 7px 0;">Relatório do preenchimento planejado</h3>
            <p style="margin:0 0 12px;font:12px Arial,sans-serif;color:#536471;">Confira os registros no SEGES: o relatório descreve as instruções geradas, não certifica que o servidor salvou todos os dados.</p>
            <table>
              <thead>
                <tr>
                  <th>Turma</th>
                  <th>Semana</th>
                  <th>Data</th>
                  <th>Disciplina</th>
                  <th>Tipo</th>
                  <th>Habilidade</th>
                  <th>Objeto de conhecimento</th>
                  <th>Metodologias</th>
                  <th>Avaliação</th>
                  <th>Conteúdo manual</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `;
    
        modal.addEventListener('click', (event) => {
          if (event.target === modal) modal.remove();
        });
    
        modal.querySelector('[data-vm-modal-action="close"]').addEventListener('click', () => modal.remove());
        modal.querySelector('[data-vm-modal-action="download-json"]').addEventListener('click', () => {
          downloadTextFile(
            `plano-semanal-relatorio-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(state.reportRows, null, 2),
            'application/json'
          );
        });
        modal.querySelector('[data-vm-modal-action="download-csv"]').addEventListener('click', () => {
          const header = ['Turma', 'Semana', 'Data', 'Disciplina', 'Tipo', 'Habilidade', 'Objeto', 'Metodologias', 'Avaliação', 'Conteúdo manual'];
          const lines = [header.join(';')].concat(
            state.reportRows.map((row) => [
              row.classroomName || state.classroomName || state.classroomId || "",
              row.week,
              row.date,
              row.discipline,
              row.kind,
              row.ability,
              row.knowledge,
              row.methodologies,
              row.evaluation,
              row.manualText
            ].map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(';'))
          );
          downloadTextFile(
            `plano-semanal-relatorio-${new Date().toISOString().slice(0, 10)}.csv`,
            lines.join('\n'),
            'text/csv;charset=utf-8'
          );
        });
    
        document.body.appendChild(modal);
      }
    
      function downloadTextFile(filename, content, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    
      async function bootstrapAutomation() {
        renderPanel();
    
        const state = loadState();
        if (!state) return;
        // A estrutura do plano mudou: não retomar uma execução da versão anterior.
        if (state.version !== 4 && state.status !== 'done') {
          renderPanel();
          return;
        }
    
        if (localStorage.getItem(REPORT_WINDOW_KEY) === '1' && isWeeksPage() && state.status === 'done') {
          localStorage.removeItem(REPORT_WINDOW_KEY);
          openReportModal(state);
        }
    
        try {
          if (state.status === 'scanning' && isWeekFormPage()) {
            await handleScanPage(state);
            return;
          }
    
          if(state.status==='saving'){
            if(isWeekFormPage()){
              pausePlan(state,'O SEGES retornou ao formulário. '+(isSegesFormError()||'Salvamento não confirmado.'),{
                week:state.lastAppliedWeek
              });
              return;
            }
            if(isWeeksPage()){
              await continueFromWeeksPage(state);
              return;
            }
            pausePlan(state,'Retorno do SEGES não reconhecido. Confira o último plano.');
            return;
          }
          if(state.status==='review'){
            openAbilityReviewModal(state);
            return;
          }
          if(state.status==='applying'&&isWeekFormPage()){
            await handleApplyPage(state);
            return;
          }
        } catch (error) {
          pausePlan(state,'Erro de execução: '+error.message,{stack:String(error.stack||'').slice(0,1000)});
          alert('Operação interrompida sem novas tentativas: '+error.message);
        }
      }
    
      bootstrapAutomation();
    })();
  }
})();
